import test from 'node:test';
import assert from 'node:assert/strict';
import { enforceRlsOrderExecutionGuard } from '../backend/rlsSecurityGuard.mjs';
import { executeRealExchangeOrder } from '../backend/exchangeGateway.mjs';
import { clearInstrumentSpecCache } from '../backend/exchangeInstruments.mjs';

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

test('Issue #6 POSITIVE: SCRATCH_EXIT uses exact entry executedQty even after +50% price appreciation (no residual exposure)', async () => {
  clearInstrumentSpecCache();
  // Entered LONG BTC at $60,000 for $600 => executedQty = 0.01 BTC.
  // Price appreciates +50% to $90,000. Recalculating sizeUsd/currentPrice would only close 0.0066 BTC (leaving 0.0034 BTC open!).
  // Passing exact quantity: 0.01 MUST close the full 0.01 BTC.
  let capturedUrl = '';
  await withMockFetch(
    async (url) => {
      if (String(url).includes('/fapi/v1/exchangeInfo')) {
        return mockJsonResponse({
          symbols: [
            {
              symbol: 'BTCUSDT',
              filters: [
                { filterType: 'LOT_SIZE', stepSize: '0.001', minQty: '0.001' },
                { filterType: 'PRICE_FILTER', tickSize: '0.1' },
              ],
            },
          ],
        });
      }
      if (String(url).includes('/fapi/v1/time')) return mockJsonResponse({ serverTime: Date.now() });
      if (String(url).includes('/fapi/v1/order')) {
        capturedUrl = String(url);
        return mockJsonResponse({ orderId: 777, status: 'FILLED', executedQty: '0.01', avgPrice: '90000' });
      }
      return mockJsonResponse({});
    },
    async () => {
      const res = await executeRealExchangeOrder({
        exchange: 'BINANCE',
        symbol: 'BTC-PERP',
        binanceSymbol: 'BTCUSDT',
        side: 'LONG',
        orderPurpose: 'SCRATCH_EXIT',
        sizeUsd: 600,
        quantity: 0.01,
        price: 90000,
        refMarkPrice: 90000,
        useTestnet: true,
        credentials: { apiKey: 'testkey123456', apiSecret: 'testsecret123456' },
      });
      assert.equal(res.ok, true);
      assert.match(capturedUrl, /quantity=0\.01(&|$)/);
      assert.match(capturedUrl, /reduceOnly=true/);
    }
  );
});

test('Issue #6 POSITIVE: OKX kPEPE-PERP entry->close round-trip preserves terminal units (prevents 1000x PnL/close corruption)', async () => {
  clearInstrumentSpecCache();
  const capturedBodies = [];
  await withMockFetch(
    async (url, opts) => {
      const u = String(url);
      if (u.includes('/public/instruments')) {
        return mockJsonResponse({
          code: '0',
          data: [{ instId: 'PEPE-USDT-SWAP', ctVal: '10000000', lotSz: '1', minSz: '1', tickSz: '0.0000001' }],
        });
      }
      if (u.includes('/trade/order')) {
        capturedBodies.push(JSON.parse(opts.body));
        return mockJsonResponse({ code: '0', data: [{ ordId: `okx-rt-${capturedBodies.length}` }] });
      }
      return mockJsonResponse({ code: '0' });
    },
    async () => {
      const entryRes = await executeRealExchangeOrder({
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
      assert.equal(entryRes.ok, true);
      assert.equal(entryRes.executedQty, 60000);
      assert.equal(entryRes.executedPrice, 0.01);

      // Feed entryRes.executedQty directly into SCRATCH_EXIT just like App.tsx does
      const closeRes = await executeRealExchangeOrder({
        exchange: 'OKX',
        symbol: 'kPEPE-PERP',
        side: 'LONG',
        orderPurpose: 'SCRATCH_EXIT',
        marketType: 'PERP',
        sizeUsd: 600,
        quantity: entryRes.executedQty,
        price: 0.0102,
        refMarkPrice: 0.0102,
        credentials: { apiKey: 'okxkey123456', apiSecret: 'okxsec123456', passphrase: 'pass' },
      });
      assert.equal(closeRes.ok, true);
      assert.equal(capturedBodies[0].sz, '6');
      assert.equal(capturedBodies[1].sz, '6'); // Exact same 6 contracts on close, NOT 6000!
      assert.equal(capturedBodies[1].reduceOnly, true);
    }
  );
});

test('Issue #6 NEGATIVE: Excessively large explicit exit quantity is rejected by RLS lot guard', () => {
  const guard = enforceRlsOrderExecutionGuard({
    exchange: 'BINANCE',
    symbol: 'BTC-PERP',
    side: 'LONG',
    orderPurpose: 'SCRATCH_EXIT',
    sizeUsd: 600,
    quantity: 100, // 100 BTC * $90,000 = $9,000,000 >> MAX_SINGLE_ORDER_USD * 2
    price: 90000,
  });
  assert.equal(guard.ok, false);
  assert.equal(guard.policy, 'RLS_LOT_PRECISION_GUARD');
});
