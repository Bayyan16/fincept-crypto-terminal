import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeSafeAutonomousRealOrderSizeUsd,
  computeUnifiedPortfolioEquityUsd,
  isWalletReadyForRealExecution,
  resolveExecutableRealVenue,
} from '../backend/realExecutionRouter.mjs';
import { executeRealExchangeOrder } from '../backend/exchangeGateway.mjs';
import { clearInstrumentSpecCache } from '../backend/exchangeInstruments.mjs';
import { resetRlsRateLimitersForTest } from '../backend/rlsSecurityGuard.mjs';

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

const BTC_MARKET = {
  symbol: 'BTC-PERP',
  baseAsset: 'BTC',
  marketType: 'PERP',
  primaryExchange: 'HYPERLIQUID',
  supportedExchanges: ['HYPERLIQUID', 'BINANCE', 'BYBIT', 'OKX'],
  price: 75000,
};

const PAPER_PLACEHOLDER_WALLETS = [
  {
    id: 'trust',
    name: 'Trust Wallet',
    connected: true,
    verifiedReal: false,
    autoSignEnabled: true,
    balanceUsd: 38420,
    credentials: { walletAddress: '', useTestnet: false },
  },
  {
    id: 'binance_api',
    name: 'Binance API',
    connected: true,
    verifiedReal: false,
    autoSignEnabled: true,
    balanceUsd: 64200,
    credentials: { apiKey: '', apiSecret: '', useTestnet: false },
  },
];

test('Real-Money Automation NEGATIVE: Paper placeholder wallets with empty credentials are never ready for real execution', () => {
  for (const w of PAPER_PLACEHOLDER_WALLETS) {
    const check = isWalletReadyForRealExecution(w, false);
    assert.equal(check.ok, false);
    assert.equal(check.reason, 'PAPER_PLACEHOLDER_OR_MISSING_CREDS');
  }
  const route = resolveExecutableRealVenue({
    market: BTC_MARKET,
    side: 'LONG',
    wallets: PAPER_PLACEHOLDER_WALLETS,
    useTestnet: false,
  });
  assert.equal(route.ok, false);
});

test('Real-Money Automation POSITIVE: Connected OKX/Binance wallet executes BOTH BUY (LONG) & SELL (SHORT) on Futures even when primaryExchange is HYPERLIQUID', () => {
  const wallets = [
    ...PAPER_PLACEHOLDER_WALLETS,
    {
      id: 'okx_api',
      name: 'OKX V5',
      connected: true,
      verifiedReal: true,
      autoSignEnabled: true,
      balanceUsd: 1200,
      credentials: { apiKey: 'okxkey123456', apiSecret: 'okxsec123456', passphrase: 'okxpass', useTestnet: false },
    },
  ];

  const longRoute = resolveExecutableRealVenue({
    market: BTC_MARKET,
    side: 'LONG',
    wallets,
    useTestnet: false,
  });
  assert.equal(longRoute.ok, true);
  assert.equal(longRoute.exchange, 'OKX');
  assert.equal(longRoute.marketType, 'PERP');
  assert.equal(longRoute.venueMode, 'FUTURES');

  const shortRoute = resolveExecutableRealVenue({
    market: BTC_MARKET,
    side: 'SHORT',
    wallets,
    useTestnet: false,
  });
  assert.equal(shortRoute.ok, true);
  assert.equal(shortRoute.exchange, 'OKX');
  assert.equal(shortRoute.marketType, 'PERP');

  // Explicit SPOT (e.g. 1x SPOT selected): LONG succeeds on OKX Spot, SHORT is blocked!
  const spotLong = resolveExecutableRealVenue({
    market: BTC_MARKET,
    side: 'LONG',
    wallets,
    useTestnet: false,
    preferredMarketType: 'SPOT',
  });
  assert.equal(spotLong.ok, true);
  assert.equal(spotLong.exchange, 'OKX');
  assert.equal(spotLong.marketType, 'SPOT');

  const spotShort = resolveExecutableRealVenue({
    market: BTC_MARKET,
    side: 'SHORT',
    wallets,
    useTestnet: false,
    preferredMarketType: 'SPOT',
  });
  assert.equal(spotShort.ok, false);
  assert.match(spotShort.error, /Spot tidak mendukung pembukaan posisi SHORT/i);
});

test('Real-Money Automation POSITIVE/NEGATIVE: Spot-only funded Binance account auto-routes BUY (LONG) to SPOT and blocks illegal Spot SHORT', () => {
  const wallets = [
    {
      id: 'binance_api',
      name: 'Binance Spot Only',
      connected: true,
      verifiedReal: true,
      autoSignEnabled: true,
      balanceUsd: 250,
      futuresEnabled: false,
      spotEnabled: true,
      futuresBalanceUsd: 0,
      spotBalanceUsd: 250,
      credentials: { apiKey: 'binkey123456', apiSecret: 'binsec123456', useTestnet: false },
    },
  ];

  const longRes = resolveExecutableRealVenue({
    market: BTC_MARKET,
    side: 'LONG',
    wallets,
    useTestnet: false,
  });
  assert.equal(longRes.ok, true);
  assert.equal(longRes.exchange, 'BINANCE');
  assert.equal(longRes.marketType, 'SPOT');
  assert.equal(longRes.availableUsd, 250);

  const shortRes = resolveExecutableRealVenue({
    market: BTC_MARKET,
    side: 'SHORT',
    wallets,
    useTestnet: false,
  });
  assert.equal(shortRes.ok, false);
  assert.match(shortRes.error, /Spot/i);
});

test('Real-Money Automation NEGATIVE: Strict Testnet vs Mainnet environment mismatch blocks order routing', () => {
  const mainnetWallet = {
    id: 'binance_api',
    name: 'Binance Mainnet',
    connected: true,
    verifiedReal: true,
    autoSignEnabled: true,
    balanceUsd: 1000,
    credentials: { apiKey: 'binkey123456', apiSecret: 'binsec123456', useTestnet: false },
  };
  assert.equal(isWalletReadyForRealExecution(mainnetWallet, true).reason, 'ENV_MISMATCH');
  const route = resolveExecutableRealVenue({
    market: BTC_MARKET,
    side: 'LONG',
    wallets: [mainnetWallet],
    useTestnet: true,
  });
  assert.equal(route.ok, false);
  assert.match(route.error, /RLS ENV MISMATCH/);
});

test('Real-Money Sizing POSITIVE/NEGATIVE: Caps Spot at 90% cash (1x), Futures at 85% margin*lev, and blocks $0 balance', () => {
  const spotCap = computeSafeAutonomousRealOrderSizeUsd({
    requestedSizeUsd: 500,
    availableUsd: 100,
    verifiedReal: true,
    marketType: 'SPOT',
    leverage: 6, // ignored for SPOT (strictly 1x)
  });
  assert.equal(spotCap.ok, true);
  assert.equal(spotCap.sizeUsd, 90);

  const futCap = computeSafeAutonomousRealOrderSizeUsd({
    requestedSizeUsd: 500,
    availableUsd: 50,
    verifiedReal: true,
    marketType: 'PERP',
    leverage: 6, // 50 * 6 * 0.85 = $255
  });
  assert.equal(futCap.ok, true);
  assert.equal(futCap.sizeUsd, 255);

  const zeroBal = computeSafeAutonomousRealOrderSizeUsd({
    requestedSizeUsd: 100,
    availableUsd: 0,
    verifiedReal: true,
    marketType: 'PERP',
    leverage: 5,
  });
  assert.equal(zeroBal.ok, false);
});

test('Real-Wallet Sync POSITIVE: Unified equity excludes fake Paper balances in Real mode and never double-counts shared EVM address', () => {
  const sharedAddr = '0x1111111111111111111111111111111111111111';
  const wallets = [
    ...PAPER_PLACEHOLDER_WALLETS.slice(1), // fake Binance paper $64,200 (verifiedReal: false)
    {
      id: 'trust',
      name: 'Trust Wallet',
      connected: true,
      verifiedReal: true,
      autoSignEnabled: true,
      balanceUsd: 500,
      credentials: { walletAddress: sharedAddr, useTestnet: false },
    },
    {
      id: 'hyperliquid_agent',
      name: 'Hyperliquid L1',
      connected: true,
      verifiedReal: true,
      autoSignEnabled: true,
      balanceUsd: 500, // SAME EVM address mirrored on both rows!
      credentials: { walletAddress: sharedAddr, useTestnet: false },
    },
    {
      id: 'bybit_api',
      name: 'Bybit Mainnet',
      connected: true,
      verifiedReal: true,
      autoSignEnabled: true,
      balanceUsd: 325.5,
      credentials: { apiKey: 'bybkey123456', apiSecret: 'bybsec123456', useTestnet: false },
    },
    {
      id: 'okx_api',
      name: 'OKX Testnet',
      connected: true,
      verifiedReal: true,
      autoSignEnabled: true,
      balanceUsd: 9999, // Testnet wallet MUST NOT pollute Mainnet equity!
      credentials: { apiKey: 'okxkey123456', apiSecret: 'okxsec123456', passphrase: 'pass', useTestnet: true },
    },
  ];

  // REAL_MAINNET: $500 (deduplicated Trust+HL) + $325.50 (Bybit Mainnet) = $825.50 (NO $64,200 paper, NO 2x $500, NO $9,999 testnet!)
  const mainnetEq = computeUnifiedPortfolioEquityUsd({ wallets, executionEnv: 'REAL_MAINNET' });
  assert.equal(mainnetEq, 825.5);

  // EXCHANGE_TESTNET: ONLY $9,999 OKX Testnet!
  const testnetEq = computeUnifiedPortfolioEquityUsd({ wallets, executionEnv: 'EXCHANGE_TESTNET' });
  assert.equal(testnetEq, 9999);
});

test('Real-Money Gateway NEGATIVE/POSITIVE: Bybit Spot & OKX Spot reject SHORT entry and send valid Spot stop-loss trigger params', async () => {
  clearInstrumentSpecCache();
  resetRlsRateLimitersForTest();

  // 1) Bybit Spot SHORT entry MUST be rejected before sending any HTTP order
  let httpCalled = false;
  await withMockFetch(
    async () => {
      httpCalled = true;
      return mockJsonResponse({});
    },
    async () => {
      const bybitShort = await executeRealExchangeOrder({
        exchange: 'BYBIT',
        symbol: 'BTC-PERP',
        side: 'SHORT',
        orderPurpose: 'ENTRY_MAKER',
        marketType: 'SPOT',
        sizeUsd: 100,
        price: 75000,
        refMarkPrice: 75000,
        credentials: { apiKey: 'bybkey123456', apiSecret: 'bybsec123456' },
      });
      assert.equal(bybitShort.ok, false);
      assert.match(bybitShort.error, /Bybit Spot tidak mendukung pembukaan posisi SHORT/);

      const okxShort = await executeRealExchangeOrder({
        exchange: 'OKX',
        symbol: 'BTC-PERP',
        side: 'SHORT',
        orderPurpose: 'ENTRY_MAKER',
        marketType: 'SPOT',
        sizeUsd: 100,
        price: 75000,
        refMarkPrice: 75000,
        credentials: { apiKey: 'okxkey123456', apiSecret: 'okxsec123456', passphrase: 'pass' },
      });
      assert.equal(okxShort.ok, false);
      assert.match(okxShort.error, /OKX Spot tidak mendukung pembukaan posisi SHORT/);
      assert.equal(httpCalled, false);
    }
  );

  // 2) Bybit Spot & OKX Spot BREAKEVEN_STOP use Spot-valid trigger params (LastPrice/StopOrder & slTriggerPxType='last')
  const capturedBybitBodies = [];
  const capturedOkxBodies = [];
  await withMockFetch(
    async (url, opts) => {
      const u = String(url);
      if (u.includes('bybit.com/v5/market/instruments-info')) {
        return mockJsonResponse({
          retCode: 0,
          result: { list: [{ lotSizeFilter: { basePrecision: '0.0001', minOrderQty: '0.0001' }, priceFilter: { tickSize: '0.1' } }] },
        });
      }
      if (u.includes('bybit.com/v5/order/create')) {
        capturedBybitBodies.push(JSON.parse(opts.body));
        return mockJsonResponse({ retCode: 0, result: { orderId: 'byb-spot-sl-1' } });
      }
      if (u.includes('okx.com/api/v5/public/instruments')) {
        return mockJsonResponse({ code: '0', data: [{ instId: 'BTC-USDT', lotSz: '0.0001', minSz: '0.0001', tickSz: '0.1' }] });
      }
      if (u.includes('okx.com/api/v5/trade/order-algo')) {
        capturedOkxBodies.push(JSON.parse(opts.body));
        return mockJsonResponse({ code: '0', data: [{ algoId: 'okx-spot-sl-1' }] });
      }
      return mockJsonResponse({ code: '0', retCode: 0 });
    },
    async () => {
      const bybStop = await executeRealExchangeOrder({
        exchange: 'BYBIT',
        symbol: 'BTC-PERP',
        side: 'LONG',
        orderPurpose: 'BREAKEVEN_STOP',
        venueMode: 'SPOT',
        sizeUsd: 150,
        quantity: 0.002,
        price: 75000,
        stopPrice: 74500,
        refMarkPrice: 75000,
        credentials: { apiKey: 'bybkey123456', apiSecret: 'bybsec123456' },
      });
      assert.equal(bybStop.ok, true);
      assert.equal(bybStop.venueMode, 'SPOT');
      assert.equal(capturedBybitBodies[0].category, 'spot');
      assert.equal(capturedBybitBodies[0].triggerBy, 'LastPrice');
      assert.equal(capturedBybitBodies[0].orderFilter, 'StopOrder');
      assert.equal(capturedBybitBodies[0].reduceOnly, undefined);

      const okxStop = await executeRealExchangeOrder({
        exchange: 'OKX',
        symbol: 'BTC-PERP',
        side: 'LONG',
        orderPurpose: 'BREAKEVEN_STOP',
        venueMode: 'SPOT',
        sizeUsd: 150,
        quantity: 0.002,
        price: 75000,
        stopPrice: 74500,
        refMarkPrice: 75000,
        credentials: { apiKey: 'okxkey123456', apiSecret: 'okxsec123456', passphrase: 'pass' },
      });
      assert.equal(okxStop.ok, true);
      assert.equal(okxStop.venueMode, 'SPOT');
      assert.equal(capturedOkxBodies[0].instId, 'BTC-USDT');
      assert.equal(capturedOkxBodies[0].tdMode, 'cash');
      assert.equal(capturedOkxBodies[0].slTriggerPxType, 'last');
      assert.equal(capturedOkxBodies[0].reduceOnly, undefined);
    }
  );
});
