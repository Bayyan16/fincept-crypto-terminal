import test from 'node:test';
import assert from 'node:assert/strict';
import {
  enforceRlsOrderExecutionGuard,
  MAX_ORDERS_PER_WINDOW,
  resetRlsRateLimitersForTest,
} from '../backend/rlsSecurityGuard.mjs';

test('Issue #12 NEGATIVE: Client bypassOracleGuard:true and spoofed refMarkPrice CANNOT bypass Layer 4 Oracle Guard', () => {
  resetRlsRateLimitersForTest();
  const res = enforceRlsOrderExecutionGuard(
    {
      exchange: 'BINANCE',
      symbol: 'ETH-PERP',
      side: 'LONG',
      orderPurpose: 'ENTRY_MAKER',
      sizeUsd: 250,
      price: 70000,
      refMarkPrice: 70000, // client attempts to spoof refMarkPrice
      bypassOracleGuard: true, // client attempts to disable Layer 4
      credentials: { apiKey: 'key_oracle_1234', apiSecret: 'sec_oracle_1234' },
    },
    2500 // authoritative server liveMarkPrice
  );
  assert.equal(res.ok, false);
  assert.equal(res.policy, 'RLS_ORACLE_PRICE_DEVIATION_GUARD');
});

test('Issue #12 NEGATIVE: Universal anti-replay blocks duplicate nonce on Binance CEX orders', () => {
  resetRlsRateLimitersForTest();
  const nonce = Date.now();
  const payload = {
    exchange: 'BINANCE',
    symbol: 'BTC-PERP',
    side: 'LONG',
    orderPurpose: 'ENTRY_MAKER',
    sizeUsd: 250,
    price: 60000,
    credentials: { apiKey: 'key_replay_1234', apiSecret: 'sec_replay_1234' },
    rlsContext: { nonce, autoSignEnabled: true },
  };
  const first = enforceRlsOrderExecutionGuard(payload, 60000);
  assert.equal(first.ok, true);

  const dup = enforceRlsOrderExecutionGuard(payload, 60000);
  assert.equal(dup.ok, false);
  assert.equal(dup.policy, 'RLS_ANTI_REPLAY_NONCE_GUARD');
});

test('Issue #12 NEGATIVE/POSITIVE: Layer 5 rate limiter allows up to MAX_ORDERS_PER_WINDOW and blocks burst overflow', () => {
  resetRlsRateLimitersForTest();
  const basePayload = {
    exchange: 'BINANCE',
    symbol: 'BTC-PERP',
    side: 'LONG',
    orderPurpose: 'ENTRY_MAKER',
    sizeUsd: 250,
    price: 60000,
    credentials: { apiKey: 'key_burst_12345', apiSecret: 'sec_burst_12345' },
  };
  for (let i = 0; i < MAX_ORDERS_PER_WINDOW; i++) {
    const r = enforceRlsOrderExecutionGuard(basePayload, 60000);
    assert.equal(r.ok, true, `Order #${i + 1} should pass`);
  }
  const overflow = enforceRlsOrderExecutionGuard(basePayload, 60000);
  assert.equal(overflow.ok, false);
  assert.equal(overflow.policy, 'RLS_EXECUTION_RATE_LIMITER');

  // Risk-reducing orders (SCRATCH_EXIT & BREAKEVEN_STOP) MUST still pass when entry budget is exhausted!
  const exitRes = enforceRlsOrderExecutionGuard(
    { ...basePayload, orderPurpose: 'SCRATCH_EXIT' },
    60000
  );
  assert.equal(exitRes.ok, true, 'SCRATCH_EXIT must not be blocked by exhausted ENTRY_MAKER burst budget');

  const stopRes = enforceRlsOrderExecutionGuard(
    { ...basePayload, orderPurpose: 'BREAKEVEN_STOP', stopPrice: 59900 },
    60000
  );
  assert.equal(stopRes.ok, true, 'BREAKEVEN_STOP must not be blocked by exhausted ENTRY_MAKER burst budget');
});

test('Issue #12 POSITIVE: Rate-limited request does NOT burn idempotencyKey (retry stays safe after window resets)', () => {
  resetRlsRateLimitersForTest();
  const basePayload = {
    exchange: 'BINANCE',
    symbol: 'BTC-PERP',
    side: 'LONG',
    orderPurpose: 'ENTRY_MAKER',
    sizeUsd: 250,
    price: 60000,
    credentials: { apiKey: 'key_retry_12345', apiSecret: 'sec_retry_12345' },
  };
  for (let i = 0; i < MAX_ORDERS_PER_WINDOW; i++) {
    assert.equal(enforceRlsOrderExecutionGuard(basePayload, 60000).ok, true);
  }
  const key = 'idem-order-retry-001';
  const rateLimited = enforceRlsOrderExecutionGuard(
    { ...basePayload, idempotencyKey: key },
    60000
  );
  assert.equal(rateLimited.ok, false);
  assert.equal(rateLimited.policy, 'RLS_EXECUTION_RATE_LIMITER');

  // A subsequent retry with the same idempotencyKey should still see RATE_LIMITER (not ANTI_REPLAY_NONCE_GUARD)
  const retryWhileLimited = enforceRlsOrderExecutionGuard(
    { ...basePayload, idempotencyKey: key },
    60000
  );
  assert.equal(retryWhileLimited.ok, false);
  assert.equal(retryWhileLimited.policy, 'RLS_EXECUTION_RATE_LIMITER');
});
