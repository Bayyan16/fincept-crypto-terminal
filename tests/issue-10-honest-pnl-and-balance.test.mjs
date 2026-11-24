import test from 'node:test';
import assert from 'node:assert/strict';
import { computeClosedTradeSettlement } from '../backend/positionMath.mjs';

test('Issue #10 NEGATIVE: -15% loss MUST NOT be clamped to -0.03%', () => {
  // Entry $100, Exit $97 at 5x leverage on $500 notional => -3% price move, -15% ROE, -$15.00 USD
  const settled = computeClosedTradeSettlement({
    side: 'LONG',
    entryPrice: 100,
    exitPrice: 97,
    sizeUsd: 500,
    leverage: 5,
    isRealMoney: true,
    exchangeOrderId: '991122',
  });
  assert.equal(settled.realizedPnlPct, -15);
  assert.equal(settled.realizedPnlUsd, -15);
  assert.equal(settled.allowLocalBalanceMutation, false);
  assert.equal(settled.settlementTxHash, 'EXCH-991122');
});

test('Issue #10 NEGATIVE: +12% profit MUST NOT be inflated to >= +50%', () => {
  // Entry $100, Exit $102 at 6x leverage on $600 notional => +2% move, +12% ROE, +$12.00 USD
  const settled = computeClosedTradeSettlement({
    side: 'LONG',
    entryPrice: 100,
    exitPrice: 102,
    sizeUsd: 600,
    leverage: 6,
    isRealMoney: true,
  });
  assert.equal(settled.realizedPnlPct, 12);
  assert.equal(settled.realizedPnlUsd, 12);
  assert.equal(settled.settlementTxHash, undefined);
  assert.equal(settled.allowLocalBalanceMutation, false);
});

test('Issue #10 POSITIVE: Paper settlement allows local paper balance update without fabricating fake 0x txHash', () => {
  const settled = computeClosedTradeSettlement({
    side: 'SHORT',
    entryPrice: 200,
    exitPrice: 190,
    sizeUsd: 1000,
    leverage: 4,
    isRealMoney: false,
  });
  assert.equal(settled.realizedPnlPct, 20);
  assert.equal(settled.realizedPnlUsd, 50);
  assert.equal(settled.settlementTxHash, undefined);
  assert.equal(settled.allowLocalBalanceMutation, true);
});
