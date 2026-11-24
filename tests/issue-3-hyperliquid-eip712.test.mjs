import test from 'node:test';
import assert from 'node:assert/strict';
import {
  keccak256Hex,
  encodeMsgPack,
  computeHyperliquidActionHash,
  buildHyperliquidOrderAction,
  buildHyperliquidEip712TypedData,
  formatHlPerpPrice,
} from '../backend/hyperliquidProtocol.mjs';
import { ALLOWED_EVM_CHAIN_IDS } from '../backend/rlsSecurityGuard.mjs';

test('Issue #3 POSITIVE: Keccak-256 matches official Ethereum test vectors', () => {
  assert.equal(
    keccak256Hex(''),
    '0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470'
  );
  assert.equal(
    keccak256Hex('abc'),
    '0x4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45'
  );
});

test('Issue #3 POSITIVE: Dynamic assetIndex, side flip & reduceOnly on LONG entry vs SCRATCH_EXIT vs BREAKEVEN_STOP', () => {
  const entryLong = buildHyperliquidOrderAction({
    assetIndex: 1, // ETH, not hardcoded 0 (BTC)
    side: 'LONG',
    orderPurpose: 'ENTRY_MAKER',
    price: 2500,
    sizeUsd: 500,
    szDecimals: 4,
  });
  assert.equal(entryLong.orders[0].a, 1);
  assert.equal(entryLong.orders[0].b, true);
  assert.equal(entryLong.orders[0].r, false);
  assert.deepEqual(entryLong.orders[0].t, { limit: { tif: 'Alo' } });

  // Closing a LONG MUST be SELL (b: false) with reduceOnly: true!
  const exitLong = buildHyperliquidOrderAction({
    assetIndex: 1,
    side: 'LONG',
    orderPurpose: 'SCRATCH_EXIT',
    price: 2500,
    sizeUsd: 500,
    szDecimals: 4,
  });
  assert.equal(exitLong.orders[0].a, 1);
  assert.equal(exitLong.orders[0].b, false);
  assert.equal(exitLong.orders[0].r, true);
  assert.deepEqual(exitLong.orders[0].t, { limit: { tif: 'Ioc' } });

  // Closing a SHORT MUST be BUY (b: true) with reduceOnly: true!
  const exitShort = buildHyperliquidOrderAction({
    assetIndex: 5, // SOL
    side: 'SHORT',
    orderPurpose: 'SCRATCH_EXIT',
    price: 150,
    sizeUsd: 300,
    szDecimals: 2,
  });
  assert.equal(exitShort.orders[0].a, 5);
  assert.equal(exitShort.orders[0].b, true);
  assert.equal(exitShort.orders[0].r, true);

  // BREAKEVEN_STOP uses trigger SL with reduceOnly: true
  const stopLong = buildHyperliquidOrderAction({
    assetIndex: 5,
    side: 'LONG',
    orderPurpose: 'BREAKEVEN_STOP',
    price: 150,
    stopPrice: 149.5,
    sizeUsd: 300,
    szDecimals: 2,
  });
  assert.equal(stopLong.orders[0].b, false);
  assert.equal(stopLong.orders[0].r, true);
  assert.deepEqual(stopLong.orders[0].t, {
    trigger: { isMarket: true, triggerPx: '149.5', tpsl: 'sl' },
  });
});

test('Issue #3 POSITIVE: Hyperliquid EIP-712 uses official chainId 1337 and deterministic msgpack+keccak256 connectionId', () => {
  assert.equal(ALLOWED_EVM_CHAIN_IDS.has(1337), true);
  const action = buildHyperliquidOrderAction({
    assetIndex: 1,
    side: 'LONG',
    orderPurpose: 'ENTRY_MAKER',
    price: 2500,
    sizeUsd: 500,
    szDecimals: 4,
  });
  const td = buildHyperliquidEip712TypedData(action, 1700000000000, false);
  assert.equal(td.domain.chainId, 1337);
  assert.equal(td.message.source, 'a');
  assert.match(td.message.connectionId, /^0x[a-f0-9]{64}$/);
  assert.equal(td.message.connectionId, computeHyperliquidActionHash(action, 1700000000000));
  // Changing action or nonce changes connectionId
  assert.notEqual(
    computeHyperliquidActionHash(action, 1700000000000),
    computeHyperliquidActionHash(action, 1700000000001)
  );
  assert.ok(encodeMsgPack(action).length > 20);
});

test('Issue #3 POSITIVE: Hyperliquid perp price quantization enforces <=5 sig figs and <=6-szDecimals decimals', () => {
  // Exact regression from Codex review: 2501.2 * 0.995 = 2488.694 with szDecimals=4 (max 2 decimals, 5 sig figs)
  const exitLong = buildHyperliquidOrderAction({
    assetIndex: 1,
    side: 'LONG',
    orderPurpose: 'SCRATCH_EXIT',
    price: 2501.2,
    sizeUsd: 500,
    szDecimals: 4,
  });
  assert.equal(exitLong.orders[0].p, '2488.7');

  // Trigger stop price must also obey 5 sig figs and <= 6 - szDecimals decimals
  const stopLong = buildHyperliquidOrderAction({
    assetIndex: 1,
    side: 'LONG',
    orderPurpose: 'BREAKEVEN_STOP',
    price: 2501.2345,
    stopPrice: 2499.8765,
    sizeUsd: 500,
    szDecimals: 4,
  });
  assert.equal(stopLong.orders[0].p, '2501.2');
  assert.equal(stopLong.orders[0].t.trigger.triggerPx, '2499.9');

  // High szDecimals (5 -> max 1 decimal) and low price with szDecimals=0 (max 6 decimals)
  assert.equal(formatHlPerpPrice(1.23456, 5), '1.2');
  assert.equal(formatHlPerpPrice(0.000123456, 0), '0.000123');
  // Integers > 5 digits remain valid integers
  assert.equal(formatHlPerpPrice(123456, 5), '123456');
  assert.equal(formatHlPerpPrice(105001.4, 5), '105001');
});

test('Issue #3 NEGATIVE: Invalid negative asset index throws', () => {
  assert.throws(() =>
    buildHyperliquidOrderAction({
      assetIndex: -1,
      side: 'LONG',
      orderPurpose: 'ENTRY_MAKER',
      price: 2500,
      sizeUsd: 500,
    })
  );
});
