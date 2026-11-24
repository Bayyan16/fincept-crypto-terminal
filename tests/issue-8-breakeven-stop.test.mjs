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

test('Issue #8 POSITIVE: Binance Futures BREAKEVEN_STOP sends STOP_MARKET closePosition=true WITHOUT quantity (prevents -1106)', async () => {
  clearInstrumentSpecCache();
  let capturedUrl = '';
  await withMockFetch(
    async (url) => {
      const u = String(url);
      if (u.includes('/fapi/v1/time')) return mockJsonResponse({ serverTime: Date.now() });
      if (u.includes('/fapi/v1/order')) {
        capturedUrl = u;
        return mockJsonResponse({ orderId: 88801, status: 'NEW' });
      }
      return mockJsonResponse({});
    },
    async () => {
      const res = await executeRealExchangeOrder({
        exchange: 'BINANCE',
        symbol: 'BTC-PERP',
        binanceSymbol: 'BTCUSDT',
        side: 'LONG',
        orderPurpose: 'BREAKEVEN_STOP',
        sizeUsd: 500,
        price: 61000,
        stopPrice: 60100,
        refMarkPrice: 61000,
        useTestnet: true,
        credentials: { apiKey: 'testkey123456', apiSecret: 'testsecret123456' },
      });
      assert.equal(res.ok, true);
      assert.match(capturedUrl, /type=STOP_MARKET/);
      assert.match(capturedUrl, /closePosition=true/);
      assert.match(capturedUrl, /stopPrice=60100/);
      assert.doesNotMatch(capturedUrl, /quantity=/, 'Binance STOP_MARKET with closePosition=true MUST omit quantity');
    }
  );
});

test('Issue #8 POSITIVE: Bybit BREAKEVEN_STOP sends conditional StopLoss with triggerPrice & triggerDirection (NOT immediate Market close)', async () => {
  clearInstrumentSpecCache();
  let capturedBody = null;
  await withMockFetch(
    async (url, opts) => {
      const u = String(url);
      if (u.includes('/v5/order/create')) {
        capturedBody = JSON.parse(opts.body);
        return mockJsonResponse({ retCode: 0, result: { orderId: 'bybit-sl-1' } });
      }
      return mockJsonResponse({ retCode: 0, result: { list: [] } });
    },
    async () => {
      const res = await executeRealExchangeOrder({
        exchange: 'BYBIT',
        symbol: 'ETH-PERP',
        binanceSymbol: 'ETHUSDT',
        side: 'LONG',
        orderPurpose: 'BREAKEVEN_STOP',
        sizeUsd: 500,
        price: 2600,
        stopPrice: 2510,
        refMarkPrice: 2600,
        useTestnet: true,
        credentials: { apiKey: 'bybitkey12345', apiSecret: 'bybitsec12345' },
      });
      assert.equal(res.ok, true);
      assert.equal(capturedBody.stopOrderType, 'StopLoss');
      assert.equal(capturedBody.triggerPrice, '2510');
      assert.equal(capturedBody.triggerDirection, 2); // LONG stop triggers when price falls
      assert.equal(capturedBody.reduceOnly, true);
    }
  );
});

test('Issue #8 POSITIVE: OKX BREAKEVEN_STOP calls /api/v5/trade/order-algo conditional SL (NOT immediate /trade/order market close)', async () => {
  clearInstrumentSpecCache();
  let capturedUrl = '';
  let capturedBody = null;
  await withMockFetch(
    async (url, opts) => {
      const u = String(url);
      if (u.includes('/public/instruments')) {
        return mockJsonResponse({
          code: '0',
          data: [{ instId: 'ETH-USDT-SWAP', ctVal: '0.1', lotSz: '1', minSz: '1', tickSz: '0.01' }],
        });
      }
      if (u.includes('/api/v5/trade/order-algo')) {
        capturedUrl = u;
        capturedBody = JSON.parse(opts.body);
        return mockJsonResponse({ code: '0', data: [{ algoId: 'okx-algo-77' }] });
      }
      return mockJsonResponse({ code: '0' });
    },
    async () => {
      const res = await executeRealExchangeOrder({
        exchange: 'OKX',
        symbol: 'ETH-PERP',
        side: 'LONG',
        orderPurpose: 'BREAKEVEN_STOP',
        sizeUsd: 500,
        price: 2600,
        stopPrice: 2510,
        refMarkPrice: 2600,
        useTestnet: true,
        credentials: { apiKey: 'okxkey123456', apiSecret: 'okxsec123456', passphrase: 'pass' },
      });
      assert.equal(res.ok, true);
      assert.equal(res.orderId, 'okx-algo-77');
      assert.match(capturedUrl, /\/api\/v5\/trade\/order-algo$/);
      assert.equal(capturedBody.ordType, 'conditional');
      assert.equal(capturedBody.slTriggerPx, '2510');
      assert.equal(capturedBody.reduceOnly, true);
    }
  );
});
