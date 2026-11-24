import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeDailyRealizedPnlUsd,
  evaluateDailyDrawdownCircuitBreaker,
} from '../backend/positionMath.mjs';
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

test('Issue #9 POSITIVE: Daily Drawdown Circuit Breaker trips when net loss <= -maxDailyDrawdownUsd', () => {
  const tripped = evaluateDailyDrawdownCircuitBreaker({
    realizedPnlUsd: -110,
    unrealizedPnlUsd: -45,
    maxDailyDrawdownUsd: 150,
  });
  assert.equal(tripped.triggered, true);
  assert.equal(tripped.netPnlUsd, -155);
});

test('Issue #9 NEGATIVE: Daily Drawdown Circuit Breaker stays armed (not tripped) when within limit', () => {
  const ok = evaluateDailyDrawdownCircuitBreaker({
    realizedPnlUsd: -40,
    unrealizedPnlUsd: -25,
    maxDailyDrawdownUsd: 150,
  });
  assert.equal(ok.triggered, false);
  assert.equal(ok.netPnlUsd, -65);
});

test('Issue #9 POSITIVE: Daily realized PnL includes runtime paper cl-* trades, excludes cl-1..4 fixtures, and enforces UTC day boundary', () => {
  const closedTrades = [
    // Seeded demo fixtures (must NEVER be counted)
    { id: 'cl-1', isRealMoney: false, closedDateKey: '2026-11-24', realizedPnlUsd: -5000 },
    { id: 'cl-2', isRealMoney: false, closedDateKey: '2026-11-24', realizedPnlUsd: 30000 },
    // Runtime paper trades from today (MUST be counted in paper mode!)
    { id: 'cl-1732440001000', isRealMoney: false, closedDateKey: '2026-11-24', realizedPnlUsd: -120 },
    { id: 'cl-1732440002000', isRealMoney: false, closedDateKey: '2026-11-24', realizedPnlUsd: -40 },
    // Yesterday's paper trade (MUST be excluded across midnight!)
    { id: 'cl-1732350001000', isRealMoney: false, closedDateKey: '2026-11-23', realizedPnlUsd: 500 },
    // Real-money trades (today vs yesterday)
    { id: 'cl-1732440003000', isRealMoney: true, closedDateKey: '2026-11-24', realizedPnlUsd: -180 },
    { id: 'cl-1732350004000', isRealMoney: true, closedDateKey: '2026-11-23', realizedPnlUsd: 400 },
  ];

  const paperToday = computeDailyRealizedPnlUsd({
    closedTrades,
    isRealEnv: false,
    tradingDayKey: '2026-11-24',
  });
  assert.equal(paperToday, -160);
  assert.equal(
    evaluateDailyDrawdownCircuitBreaker({
      realizedPnlUsd: paperToday,
      unrealizedPnlUsd: 0,
      maxDailyDrawdownUsd: 150,
    }).triggered,
    true
  );

  const realToday = computeDailyRealizedPnlUsd({
    closedTrades,
    isRealEnv: true,
    tradingDayKey: '2026-11-24',
  });
  assert.equal(realToday, -180);

  // Next day (2026-11-25) resets realized PnL cleanly to 0
  const realNextDay = computeDailyRealizedPnlUsd({
    closedTrades,
    isRealEnv: true,
    tradingDayKey: '2026-11-25',
  });
  assert.equal(realNextDay, 0);
});

test('Issue #9 POSITIVE: makerOnly=false sends MARKET entry instead of forced GTX Post-Only', async () => {
  clearInstrumentSpecCache();
  let capturedUrl = '';
  await withMockFetch(
    async (url) => {
      const u = String(url);
      if (u.includes('/fapi/v1/time')) return mockJsonResponse({ serverTime: Date.now() });
      if (u.includes('/fapi/v1/order')) {
        capturedUrl = u;
        return mockJsonResponse({ orderId: 9090, status: 'FILLED' });
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
        makerOnly: false,
        sizeUsd: 500,
        price: 60000,
        refMarkPrice: 60000,
        useTestnet: true,
        credentials: { apiKey: 'testkey123456', apiSecret: 'testsecret123456' },
      });
      assert.equal(res.ok, true);
      assert.match(capturedUrl, /type=MARKET/);
      assert.doesNotMatch(capturedUrl, /timeInForce=GTX/);
    }
  );
});
