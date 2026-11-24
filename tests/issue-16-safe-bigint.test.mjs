import test from 'node:test';
import assert from 'node:assert/strict';
import { safeHexToBigInt } from '../backend/exchangeGateway.mjs';

test('Issue #16 NEGATIVE: Malformed or empty RPC hex strings ("0x", "", null, non-hex) never throw', () => {
  assert.equal(safeHexToBigInt('0x'), 0n);
  assert.equal(safeHexToBigInt('0X'), 0n);
  assert.equal(safeHexToBigInt(''), 0n);
  assert.equal(safeHexToBigInt(null), 0n);
  assert.equal(safeHexToBigInt(undefined), 0n);
  assert.equal(safeHexToBigInt('0xZZZZ', 42n), 42n);
  assert.equal(safeHexToBigInt('not-hex', 99n), 99n);
});

test('Issue #16 POSITIVE: Valid hex strings convert accurately to BigInt', () => {
  assert.equal(safeHexToBigInt('0x0'), 0n);
  assert.equal(safeHexToBigInt('0x5208'), 21000n);
  assert.equal(safeHexToBigInt('0xde0b6b3a7640000'), 1000000000000000000n);
  assert.equal(safeHexToBigInt('0x0000000000000000000000000000000000000000000000000000000005f5e100'), 100000000n);
});
