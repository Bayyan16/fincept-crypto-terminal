import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyAndFetchAccountBalance } from '../backend/exchangeGateway.mjs';

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

test('Issue #17 NEGATIVE: Phantom/Solana verify returns ok:false (never fake $0 ok:true) when RPC fails', async () => {
  await withMockFetch(
    async () => {
      throw new Error('RPC network unreachable');
    },
    async () => {
      const res = await verifyAndFetchAccountBalance({
        providerId: 'phantom',
        walletAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      });
      assert.equal(res.ok, false);
      assert.match(res.error, /Solana RPC/);
    }
  );
});

test('Issue #17 NEGATIVE: Hyperliquid/Trust verify returns ok:false when all upstream RPCs fail', async () => {
  await withMockFetch(
    async () => {
      throw new Error('All RPCs down');
    },
    async () => {
      const res = await verifyAndFetchAccountBalance({
        providerId: 'trust',
        walletAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
      });
      assert.equal(res.ok, false);
      assert.match(res.error, /Hyperliquid L1/);
    }
  );
});

test('Issue #17 NEGATIVE: Binance useTestnet:true refuses to silently flip to real Mainnet when Mainnet key is pasted', async () => {
  await withMockFetch(
    async (url) => {
      const u = String(url);
      if (u.includes('/time')) return mockJsonResponse({ serverTime: Date.now() });
      if (
        u.includes('testnet.binance') ||
        u.includes('demo-api.binance.com') ||
        u.includes('demo-fapi.binance.com')
      ) {
        return mockJsonResponse({ code: -2015, msg: 'Invalid API-key' }, 401);
      }
      if (u.includes('fapi.binance.com/fapi/v2/balance')) {
        return mockJsonResponse([{ asset: 'USDT', balance: '5000.00', crossUnPnl: '0' }]);
      }
      if (u.includes('api.binance.com/api/v3/account')) {
        return mockJsonResponse({ balances: [] });
      }
      return mockJsonResponse({});
    },
    async () => {
      const res = await verifyAndFetchAccountBalance({
        providerId: 'binance_api',
        apiKey: 'mainnetkey12345',
        apiSecret: 'mainnetsec12345',
        useTestnet: true,
      });
      assert.equal(res.ok, false);
      assert.match(res.error, /SAFETY BLOCK/);
    }
  );
});

test('Issue #17 POSITIVE: Bybit and OKX verify return rlsPolicy & rlsOwnerId cleanly', async () => {
  await withMockFetch(
    async (url) => {
      const u = String(url);
      if (u.includes('/v5/market/time')) return mockJsonResponse({ time: Date.now() });
      if (u.includes('/v5/account/wallet-balance')) {
        return mockJsonResponse({ retCode: 0, result: { list: [{ totalEquity: '1234.56' }] } });
      }
      if (u.includes('/api/v5/account/balance')) {
        return mockJsonResponse({ code: '0', data: [{ totalEq: '987.65' }] });
      }
      return mockJsonResponse({});
    },
    async () => {
      const bybit = await verifyAndFetchAccountBalance({
        providerId: 'bybit_api',
        apiKey: 'bybitkey123456',
        apiSecret: 'bybitsec123456',
        useTestnet: true,
      });
      assert.equal(bybit.ok, true);
      assert.equal(bybit.rlsPolicy, 'ENFORCED');
      assert.ok(bybit.rlsOwnerId);
      assert.equal(bybit.balanceUsd, 1234.56);

      const okx = await verifyAndFetchAccountBalance({
        providerId: 'okx_api',
        apiKey: 'okxkey1234567',
        apiSecret: 'okxsec1234567',
        passphrase: 'pass',
        useTestnet: true,
      });
      assert.equal(okx.ok, true);
      assert.equal(okx.rlsPolicy, 'ENFORCED');
      assert.ok(okx.rlsOwnerId);
      assert.equal(okx.balanceUsd, 987.65);
    }
  );
});
