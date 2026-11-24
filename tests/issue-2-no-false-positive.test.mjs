import test from 'node:test';
import assert from 'node:assert/strict';
import { executeRealExchangeOrder } from '../backend/exchangeGateway.mjs';

const VALID_EVM = '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303';
const VALID_SIG = '0x' + 'a1'.repeat(64) + '1b';
const VALID_SOL = '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU';

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

test('Issue #2 NEGATIVE: Hyperliquid rejection MUST return ok:false (no fake TW-SIG ok:true)', async () => {
  await withMockFetch(
    async () => mockJsonResponse({ status: 'err', response: 'Invalid signature recovery' }),
    async () => {
      const res = await executeRealExchangeOrder({
        exchange: 'HYPERLIQUID',
        symbol: 'ETH-PERP',
        side: 'LONG',
        orderPurpose: 'ENTRY_MAKER',
        sizeUsd: 250,
        price: 2500,
        refMarkPrice: 2500,
        credentials: { walletAddress: VALID_EVM },
        hlSignedAction: {
          action: { type: 'order', orders: [], grouping: 'na' },
          nonce: Date.now(),
          signature: { r: '0x' + 'a1'.repeat(32), s: '0x' + 'a1'.repeat(32), v: 27 },
          rawSignature: VALID_SIG,
          signedChainId: 42161,
          signer: VALID_EVM,
        },
      });
      assert.equal(res.ok, false);
      assert.match(res.error, /Hyperliquid L1 Error/);
      assert.equal(res.orderId, undefined);
    }
  );
});

test('Issue #2 NEGATIVE: Hyperliquid status:ok with inner statuses[0].error MUST return ok:false', async () => {
  await withMockFetch(
    async () =>
      mockJsonResponse({
        status: 'ok',
        response: {
          type: 'order',
          data: { statuses: [{ error: 'Insufficient margin to place order.' }] },
        },
      }),
    async () => {
      const res = await executeRealExchangeOrder({
        exchange: 'HYPERLIQUID',
        symbol: 'ETH-PERP',
        side: 'LONG',
        orderPurpose: 'ENTRY_MAKER',
        sizeUsd: 250,
        price: 2500,
        refMarkPrice: 2500,
        credentials: { walletAddress: VALID_EVM },
        hlSignedAction: {
          action: { type: 'order', orders: [], grouping: 'na' },
          nonce: Date.now() + 1,
          signature: { r: '0x' + 'a1'.repeat(32), s: '0x' + 'a1'.repeat(32), v: 27 },
          rawSignature: VALID_SIG,
          signedChainId: 42161,
          signer: VALID_EVM,
        },
      });
      assert.equal(res.ok, false);
      assert.match(res.error, /Insufficient margin/);
    }
  );
});

test('Issue #2 POSITIVE: Hyperliquid status:ok with resting oid returns ok:true with real oid', async () => {
  await withMockFetch(
    async () =>
      mockJsonResponse({
        status: 'ok',
        response: {
          type: 'order',
          data: { statuses: [{ resting: { oid: 987654321 } }] },
        },
      }),
    async () => {
      const res = await executeRealExchangeOrder({
        exchange: 'HYPERLIQUID',
        symbol: 'ETH-PERP',
        side: 'LONG',
        orderPurpose: 'ENTRY_MAKER',
        sizeUsd: 250,
        price: 2500,
        refMarkPrice: 2500,
        credentials: { walletAddress: VALID_EVM },
        hlSignedAction: {
          action: { type: 'order', orders: [], grouping: 'na' },
          nonce: Date.now() + 2,
          signature: { r: '0x' + 'a1'.repeat(32), s: '0x' + 'a1'.repeat(32), v: 27 },
          rawSignature: VALID_SIG,
          signedChainId: 42161,
          signer: VALID_EVM,
        },
      });
      assert.equal(res.ok, true);
      assert.equal(res.orderId, '987654321');
      assert.equal(res.status, 'RESTING');
    }
  );
});

test('Issue #2 NEGATIVE: Solana/Jupiter signMessage string MUST NOT fabricate CONFIRMED_SOLANA', async () => {
  const res = await executeRealExchangeOrder({
    exchange: 'JUPITER',
    symbol: 'SOL-PERP',
    side: 'LONG',
    orderPurpose: 'ENTRY_MAKER',
    sizeUsd: 250,
    price: 150,
    refMarkPrice: 150,
    credentials: { walletAddress: VALID_SOL },
    solanaSigner: VALID_SOL,
    solanaSignedTx: 'abcd1234'.repeat(8),
  });
  assert.equal(res.ok, false);
  assert.notEqual(res.status, 'CONFIRMED_SOLANA');
});
