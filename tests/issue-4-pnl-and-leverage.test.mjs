import test from 'node:test';
import assert from 'node:assert/strict';
import { computePositionPnl } from '../backend/positionMath.mjs';
import { executeRealExchangeOrder } from '../backend/exchangeGateway.mjs';

function mockJsonResponse(body, status = 200) {
  const txt = JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => txt,
    json: async () => body,
  };
}

function withMockFetch(mockImpl, fn) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = mockImpl;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.fetch = originalFetch;
    });
}

test('Issue #4 POSITIVE: Notional USD PnL is NEVER double-multiplied by leverage', () => {
  // Notional $600 at 6x leverage => Initial Margin $100, Entry $100, Qty 6 coins.
  // Price rises +1% to $101 => Actual PnL USD = +$6.00 (NOT +$36.00!), ROE = +6.00%.
  const res = computePositionPnl({
    side: 'LONG',
    entryPrice: 100,
    currentPrice: 101,
    sizeUsd: 600,
    leverage: 6,
  });
  assert.equal(res.initialMarginUsd, 100);
  assert.equal(res.pnlUsd, 6);
  assert.equal(res.roePct, 6);
  assert.equal(res.priceMovePct, 1);

  // SHORT mirror: price drops -2% to $98 on $1000 notional at 10x => Margin $100, PnL +$20, ROE +20%
  const shortRes = computePositionPnl({
    side: 'SHORT',
    entryPrice: 100,
    currentPrice: 98,
    sizeUsd: 1000,
    leverage: 10,
  });
  assert.equal(shortRes.pnlUsd, 20);
  assert.equal(shortRes.roePct, 20);
});

test('Issue #4 POSITIVE: ExecutedQty overrides notional/entry cleanly on partial fills', () => {
  const res = computePositionPnl({
    side: 'LONG',
    entryPrice: 50000,
    currentPrice: 51000,
    sizeUsd: 1000,
    leverage: 5,
    executedQty: 0.02, // $1000 notional -> +$1000 * 0.02 = +$20
  });
  assert.equal(res.pnlUsd, 20);
  assert.equal(res.roePct, 10);
});

test('Issue #4 POSITIVE: Binance Futures ENTRY_MAKER calls /fapi/v1/leverage before /fapi/v1/order', async () => {
  const calls = [];
  await withMockFetch(
    async (url) => {
      calls.push(String(url));
      if (String(url).includes('/fapi/v1/time')) return mockJsonResponse({ serverTime: Date.now() });
      if (String(url).includes('/fapi/v1/leverage')) return mockJsonResponse({ leverage: 6, symbol: 'BTCUSDT' });
      if (String(url).includes('/fapi/v1/order')) return mockJsonResponse({ orderId: 12345, status: 'NEW' });
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
        leverage: 6,
        marketType: 'PERP',
        useTestnet: true,
        credentials: { apiKey: 'testkey123456', apiSecret: 'testsecret123456' },
      });
      assert.equal(res.ok, true);
      const levIdx = calls.findIndex((u) => u.includes('/fapi/v1/leverage') && u.includes('leverage=6'));
      const ordIdx = calls.findIndex((u) => u.includes('/fapi/v1/order'));
      assert.ok(levIdx >= 0, 'Expected /fapi/v1/leverage call');
      assert.ok(ordIdx > levIdx, 'Expected leverage sync BEFORE order placement');
    }
  );
});

test('Issue #4 NEGATIVE: Entry aborts safely if exchange rejects setLeverage', async () => {
  let orderCalled = false;
  await withMockFetch(
    async (url) => {
      if (String(url).includes('/fapi/v1/time')) return mockJsonResponse({ serverTime: Date.now() });
      if (String(url).includes('/fapi/v1/leverage')) {
        return mockJsonResponse({ code: -4028, msg: 'Leverage 50 is not valid' }, 400);
      }
      if (String(url).includes('/fapi/v1/order')) {
        orderCalled = true;
        return mockJsonResponse({ orderId: 999 });
      }
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
        leverage: 50,
        marketType: 'PERP',
        useTestnet: true,
        credentials: { apiKey: 'testkey123456', apiSecret: 'testsecret123456' },
      });
      assert.equal(res.ok, false);
      assert.match(res.error, /Leverage Sync Failed/);
      assert.equal(orderCalled, false, 'Order MUST NOT be submitted when setLeverage fails');
    }
  );
});
