import test from 'node:test';
import assert from 'node:assert/strict';
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

test('Issue #7 NEGATIVE: Futures -2019 (insufficient margin) MUST NOT fall back to Binance Spot', async () => {
  clearInstrumentSpecCache();
  let spotCalled = false;
  await withMockFetch(
    async (url) => {
      const u = String(url);
      if (u.includes('/api/v3/order')) {
        spotCalled = true;
        return mockJsonResponse({ orderId: 999, status: 'NEW' });
      }
      if (u.includes('/fapi/v1/time')) return mockJsonResponse({ serverTime: Date.now() });
      if (u.includes('/fapi/v1/order')) return mockJsonResponse({ code: -2019, msg: 'Margin is insufficient.' }, 400);
      return mockJsonResponse({});
    },
    async () => {
      const res = await executeRealExchangeOrder({
        exchange: 'BINANCE',
        symbol: 'BTC-PERP',
        binanceSymbol: 'BTCUSDT',
        side: 'LONG',
        orderPurpose: 'ENTRY_MAKER',
        sizeUsd: 500,
        price: 60000,
        refMarkPrice: 60000,
        useTestnet: true,
        credentials: { apiKey: 'testkey123456', apiSecret: 'testsecret123456' },
      });
      assert.equal(res.ok, false);
      assert.equal(spotCalled, false, 'Spot MUST NOT be called on -2019 Futures margin error');
    }
  );
});

test('Issue #7 NEGATIVE: Futures SHORT rejected with -2015 MUST NEVER convert into Spot SELL', async () => {
  clearInstrumentSpecCache();
  let spotCalled = false;
  await withMockFetch(
    async (url) => {
      const u = String(url);
      if (u.includes('/api/v3/order')) {
        spotCalled = true;
        return mockJsonResponse({ orderId: 999, status: 'NEW' });
      }
      if (u.includes('/fapi/v1/time')) return mockJsonResponse({ serverTime: Date.now() });
      if (u.includes('/fapi/v1/order')) return mockJsonResponse({ code: -2015, msg: 'Invalid API-key, IP, or permissions for action' }, 401);
      return mockJsonResponse({});
    },
    async () => {
      const res = await executeRealExchangeOrder({
        exchange: 'BINANCE',
        symbol: 'ETH-PERP',
        binanceSymbol: 'ETHUSDT',
        side: 'SHORT',
        orderPurpose: 'ENTRY_MAKER',
        sizeUsd: 500,
        price: 2500,
        refMarkPrice: 2500,
        useTestnet: true,
        credentials: { apiKey: 'testkey123456', apiSecret: 'testsecret123456' },
      });
      assert.equal(res.ok, false);
      assert.equal(spotCalled, false, 'Futures SHORT MUST NEVER fall back to Spot SELL');
    }
  );
});

test('Issue #7 POSITIVE: Spot-only API key (-2015) on LONG entry cleanly falls back to Spot BUY, and explicit SPOT SELL closes it', async () => {
  clearInstrumentSpecCache();
  const spotUrls = [];
  await withMockFetch(
    async (url) => {
      const u = String(url);
      if (u.includes('/fapi/v1/time') || u.includes('/api/v3/time')) return mockJsonResponse({ serverTime: Date.now() });
      if (u.includes('/fapi/v1/order')) return mockJsonResponse({ code: -2015, msg: 'Futures not enabled' }, 401);
      if (u.includes('/api/v3/order')) {
        spotUrls.push(u);
        return mockJsonResponse({ orderId: 55501, status: 'FILLED', executedQty: '0.2' });
      }
      return mockJsonResponse({});
    },
    async () => {
      // 1. Spot-only key LONG entry -> Spot BUY
      const entryRes = await executeRealExchangeOrder({
        exchange: 'BINANCE',
        symbol: 'ETH-PERP',
        binanceSymbol: 'ETHUSDT',
        side: 'LONG',
        orderPurpose: 'ENTRY_MAKER',
        sizeUsd: 500,
        price: 2500,
        refMarkPrice: 2500,
        useTestnet: true,
        credentials: { apiKey: 'testkey123456', apiSecret: 'testsecret123456' },
      });
      assert.equal(entryRes.ok, true);
      assert.equal(entryRes.venueMode, 'SPOT');
      assert.match(spotUrls[0], /side=BUY/);

      // 2. Explicit SPOT exit -> Spot SELL of exact executedQty
      const exitRes = await executeRealExchangeOrder({
        exchange: 'BINANCE',
        symbol: 'ETH-USDT',
        side: 'LONG',
        orderPurpose: 'SCRATCH_EXIT',
        marketType: 'SPOT',
        venueMode: 'SPOT',
        sizeUsd: 500,
        quantity: 0.2,
        price: 2600,
        refMarkPrice: 2600,
        useTestnet: true,
        credentials: { apiKey: 'testkey123456', apiSecret: 'testsecret123456' },
      });
      assert.equal(exitRes.ok, true);
      assert.equal(exitRes.venueMode, 'SPOT');
      assert.match(spotUrls[1], /side=SELL/);
      assert.match(spotUrls[1], /quantity=0\.2(&|$)/);
    }
  );
});

test('Issue #7 POSITIVE: Binance Spot kPEPE-PERP entry->close round-trip normalizes executedQty/executedPrice to terminal units', async () => {
  clearInstrumentSpecCache();
  const spotUrls = [];
  await withMockFetch(
    async (url) => {
      const u = String(url);
      if (u.includes('/api/v3/exchangeInfo')) {
        return mockJsonResponse({
          symbols: [
            {
              symbol: 'PEPEUSDT',
              filters: [
                { filterType: 'LOT_SIZE', stepSize: '1', minQty: '1' },
                { filterType: 'PRICE_FILTER', tickSize: '0.0000001' },
              ],
            },
          ],
        });
      }
      if (u.includes('/api/v3/time')) return mockJsonResponse({ serverTime: Date.now() });
      if (u.includes('/api/v3/order')) {
        spotUrls.push(u);
        return mockJsonResponse({
          orderId: 88800 + spotUrls.length,
          status: 'FILLED',
          executedQty: '1000000',
          cummulativeQuoteQty: '10',
        });
      }
      return mockJsonResponse({});
    },
    async () => {
      const entryRes = await executeRealExchangeOrder({
        exchange: 'BINANCE',
        symbol: 'kPEPE-PERP',
        side: 'LONG',
        orderPurpose: 'ENTRY_MAKER',
        marketType: 'SPOT',
        venueMode: 'SPOT',
        sizeUsd: 10,
        price: 0.01,
        refMarkPrice: 0.01,
        useTestnet: true,
        credentials: { apiKey: 'testkey123456', apiSecret: 'testsecret123456' },
      });
      assert.equal(entryRes.ok, true);
      assert.match(spotUrls[0], /symbol=PEPEUSDT/);
      assert.match(spotUrls[0], /quantity=1000000(&|$)/);
      // Terminal units (1000 kPEPE @ $0.01, NOT 1,000,000 PEPE @ $0.00001)
      assert.equal(entryRes.executedQty, 1000);
      assert.equal(entryRes.executedPrice, 0.01);

      // Closing with entryRes.executedQty MUST send 1,000,000 PEPE (NOT 1,000,000,000 PEPE!)
      const closeRes = await executeRealExchangeOrder({
        exchange: 'BINANCE',
        symbol: 'kPEPE-PERP',
        side: 'LONG',
        orderPurpose: 'SCRATCH_EXIT',
        marketType: 'SPOT',
        venueMode: 'SPOT',
        sizeUsd: 10,
        quantity: entryRes.executedQty,
        price: 0.0101,
        refMarkPrice: 0.0101,
        useTestnet: true,
        credentials: { apiKey: 'testkey123456', apiSecret: 'testsecret123456' },
      });
      assert.equal(closeRes.ok, true);
      assert.match(spotUrls[1], /symbol=PEPEUSDT/);
      assert.match(spotUrls[1], /side=SELL/);
      assert.match(spotUrls[1], /quantity=1000000(&|$)/);
    }
  );
});
