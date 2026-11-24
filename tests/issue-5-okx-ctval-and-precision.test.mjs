import test from 'node:test';
import assert from 'node:assert/strict';
import {
  alignPriceToTickSize,
  clearInstrumentSpecCache,
  convertCoinsToOkxContracts,
  normalizeExchangeSymbol,
  quantizeFloorToStep,
  resolveHyperliquidAssetKey,
} from '../backend/exchangeInstruments.mjs';
import { computeSafeOrderQuantity } from '../backend/rlsSecurityGuard.mjs';
import { executeRealExchangeOrder } from '../backend/exchangeGateway.mjs';

function mockJsonResponse(body, status = 200) {
  const txt = JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => txt, json: async () => body };
}

function withMockFetch(mockImpl, fn) {
  const orig = globalThis.fetch;
  globalThis.fetch = mockImpl;
  return Promise.resolve().then(fn).finally(() => {
    globalThis.fetch = orig;
  });
}

test('Issue #5 POSITIVE: computeSafeOrderQuantity uses Math.floor (never rounds UP notional)', () => {
  // $500 / $60000 = 0.0083333... -> floored at 4 decimals = 0.0083 ($498 <= $500)
  // $500 / $59000 = 0.0084745... -> Math.round gave 0.0085 ($501.50 > $500!), Math.floor gives 0.0084 ($495.60 <= $500!)
  const res = computeSafeOrderQuantity(500, 59000);
  assert.equal(res.ok, true);
  assert.equal(res.quantity, 0.0084);
  assert.ok(res.effectiveNotionalUsd <= 500, `Expected <= 500, got ${res.effectiveNotionalUsd}`);
});

test('Issue #5 POSITIVE: OKX SWAP converts base coins into contracts via ctVal (prevents 1000x oversize)', () => {
  // DOGE-USDT-SWAP has ctVal = 1000 DOGE per contract.
  // Buying 5000 DOGE MUST send sz = "5" contracts, NOT "5000" contracts ($500,000)!
  const conv = convertCoinsToOkxContracts({ coins: 5000, ctVal: 1000, lotSz: 1, minSz: 1 });
  assert.equal(conv.ok, true);
  assert.equal(conv.contracts, 5);
  assert.equal(conv.effectiveCoins, 5000);
});

test('Issue #5 NEGATIVE: OKX SWAP refuses order if ctVal metadata is unavailable', async () => {
  clearInstrumentSpecCache();
  let orderSent = false;
  await withMockFetch(
    async (url) => {
      if (String(url).includes('/public/instruments')) return mockJsonResponse({ code: '0', data: [] });
      if (String(url).includes('/trade/order')) {
        orderSent = true;
        return mockJsonResponse({ code: '0', data: [{ ordId: 'bad' }] });
      }
      return mockJsonResponse({});
    },
    async () => {
      const res = await executeRealExchangeOrder({
        exchange: 'OKX',
        symbol: 'DOGE-PERP',
        side: 'LONG',
        orderPurpose: 'ENTRY_MAKER',
        sizeUsd: 500,
        price: 0.1,
        refMarkPrice: 0.1,
        credentials: { apiKey: 'okxkey123456', apiSecret: 'okxsec123456', passphrase: 'pass' },
      });
      assert.equal(res.ok, false);
      assert.match(res.error, /OKX CONTRACT GUARD/);
      assert.equal(orderSent, false);
    }
  );
});

test('Issue #5 POSITIVE: OKX SWAP sends contract count sz (not coin count) in live POST /trade/order', async () => {
  clearInstrumentSpecCache();
  let capturedBody = null;
  await withMockFetch(
    async (url, opts) => {
      if (String(url).includes('/public/instruments')) {
        return mockJsonResponse({
          code: '0',
          data: [{ instId: 'DOGE-USDT-SWAP', ctVal: '1000', lotSz: '1', minSz: '1', tickSz: '0.0001' }],
        });
      }
      if (String(url).includes('/trade/order')) {
        capturedBody = JSON.parse(opts.body);
        return mockJsonResponse({ code: '0', data: [{ ordId: 'okx-999' }] });
      }
      return mockJsonResponse({ code: '0' });
    },
    async () => {
      const res = await executeRealExchangeOrder({
        exchange: 'OKX',
        symbol: 'DOGE-PERP',
        side: 'LONG',
        orderPurpose: 'ENTRY_MAKER',
        sizeUsd: 500,
        price: 0.1,
        refMarkPrice: 0.1,
        credentials: { apiKey: 'okxkey123456', apiSecret: 'okxsec123456', passphrase: 'pass' },
      });
      assert.equal(res.ok, true);
      assert.equal(capturedBody.instId, 'DOGE-USDT-SWAP');
      assert.equal(capturedBody.sz, '5'); // 5000 DOGE / 1000 ctVal = 5 contracts!
    }
  );
});

test('Issue #5 POSITIVE: kPEPE/kBONK/kSHIB symbol mapping & 1000x scaling across HL, Binance, OKX', () => {
  assert.equal(resolveHyperliquidAssetKey('kPEPE-PERP', { kPEPE: { price: 0.01 } }), 'kPEPE');
  const binFutures = normalizeExchangeSymbol({ exchange: 'BINANCE', symbol: 'kPEPE-PERP', marketType: 'PERP' });
  assert.equal(binFutures.exchangeSymbol, '1000PEPEUSDT');
  assert.equal(binFutures.priceScale, 1);

  const binSpot = normalizeExchangeSymbol({ exchange: 'BINANCE', symbol: 'kPEPE-PERP', marketType: 'SPOT' });
  assert.equal(binSpot.exchangeSymbol, 'PEPEUSDT');
  assert.equal(binSpot.priceScale, 0.001);
  assert.equal(binSpot.qtyScale, 1000);

  const okxSwap = normalizeExchangeSymbol({ exchange: 'OKX', symbol: 'kPEPE-PERP', marketType: 'PERP' });
  assert.equal(okxSwap.exchangeSymbol, 'PEPE-USDT-SWAP');
  assert.equal(okxSwap.priceScale, 0.001);
  assert.equal(okxSwap.qtyScale, 1000);

  assert.equal(quantizeFloorToStep(0.0129, 0.001), 0.012);
  assert.equal(alignPriceToTickSize(60123.47, 0.1), 60123.5);
});

test('Issue #5 POSITIVE: OKX kPEPE-PERP returns terminal-unit executedQty & executedPrice and preserves SPOT marketType on close', async () => {
  clearInstrumentSpecCache();
  const capturedOrders = [];
  await withMockFetch(
    async (url, opts) => {
      const u = String(url);
      if (u.includes('/public/instruments') && u.includes('instType=SWAP')) {
        return mockJsonResponse({
          code: '0',
          data: [{ instId: 'PEPE-USDT-SWAP', ctVal: '10000000', lotSz: '1', minSz: '1', tickSz: '0.0000001' }],
        });
      }
      if (u.includes('/public/instruments') && u.includes('instType=SPOT')) {
        return mockJsonResponse({
          code: '0',
          data: [{ instId: 'PEPE-USDT', lotSz: '1', minSz: '1', tickSz: '0.0000001' }],
        });
      }
      if (u.includes('/trade/order')) {
        capturedOrders.push(JSON.parse(opts.body));
        return mockJsonResponse({ code: '0', data: [{ ordId: `okx-${capturedOrders.length}` }] });
      }
      return mockJsonResponse({ code: '0' });
    },
    async () => {
      // 1) OKX SWAP entry for kPEPE-PERP: $600 at terminal price $0.01 -> 60,000 kPEPE (60,000,000 PEPE = 6 contracts)
      const swapEntry = await executeRealExchangeOrder({
        exchange: 'OKX',
        symbol: 'kPEPE-PERP',
        side: 'LONG',
        orderPurpose: 'ENTRY_MAKER',
        marketType: 'PERP',
        sizeUsd: 600,
        price: 0.01,
        refMarkPrice: 0.01,
        credentials: { apiKey: 'okxkey123456', apiSecret: 'okxsec123456', passphrase: 'pass' },
      });
      assert.equal(swapEntry.ok, true);
      assert.equal(capturedOrders[0].instId, 'PEPE-USDT-SWAP');
      assert.equal(capturedOrders[0].sz, '6');
      // Must be normalized back to terminal units (NOT 60,000,000 and NOT 0.00001)!
      assert.equal(swapEntry.executedQty, 60000);
      assert.equal(swapEntry.executedPrice, 0.01);

      // 2) OKX SPOT close preserves cash/SPOT instrument (PEPE-USDT) and scales terminal executedQty accurately
      const spotClose = await executeRealExchangeOrder({
        exchange: 'OKX',
        symbol: 'kPEPE-PERP',
        side: 'LONG',
        orderPurpose: 'SCRATCH_EXIT',
        marketType: 'SPOT',
        sizeUsd: 100,
        price: 0.01,
        refMarkPrice: 0.01,
        credentials: { apiKey: 'okxkey123456', apiSecret: 'okxsec123456', passphrase: 'pass' },
      });
      assert.equal(spotClose.ok, true);
      assert.equal(capturedOrders[1].instId, 'PEPE-USDT');
      assert.equal(capturedOrders[1].tdMode, 'cash');
      assert.equal(capturedOrders[1].side, 'sell');
      assert.equal(spotClose.executedQty, 10000);
      assert.equal(spotClose.executedPrice, 0.01);
    }
  );
});
