import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHyperliquidCancelAction,
  buildHyperliquidLeverageAction,
  buildHyperliquidOrderAction,
  hashHyperliquidTypedData,
} from '../backend/hyperliquidProtocol.mjs';
import {
  deriveEvmAddressFromPrivateKey,
  recoverEvmAddressFromSignature,
  signHyperliquidActionWithPrivateKey,
} from '../backend/hyperliquidSigner.mjs';
import {
  EXCHANGE_PRIORITY_ORDER,
  hasHyperliquidAgentPrivateKey,
  resolveExecutableRealVenue,
} from '../backend/realExecutionRouter.mjs';
import {
  cancelRealExchangeOrder,
  executeRealExchangeOrder,
  fetchRealOpenPositions,
  fetchRealOrderStatus,
  getRealAggregatedOrderbook,
  verifyAndFetchAccountBalance,
} from '../backend/exchangeGateway.mjs';
import { clearInstrumentSpecCache } from '../backend/exchangeInstruments.mjs';
import { resetRlsRateLimitersForTest } from '../backend/rlsSecurityGuard.mjs';

const HARDHAT_PK_0 = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
const HARDHAT_ADDR_0 = '0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266';

function mockJsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('Priority #1 Hyperliquid: pure-JS secp256k1 derives exact EVM addresses and valid EIP-712 recoverable signatures', () => {
  // Known Ethereum test vectors
  assert.equal(
    deriveEvmAddressFromPrivateKey('0x0000000000000000000000000000000000000000000000000000000000000001'),
    '0x7e5f4552091a69125d5dfcb7b8c2659029395bdf'
  );
  assert.equal(deriveEvmAddressFromPrivateKey(HARDHAT_PK_0), HARDHAT_ADDR_0);

  const action = buildHyperliquidOrderAction({
    assetIndex: 0,
    side: 'LONG',
    orderPurpose: 'ENTRY_MAKER',
    price: 70000,
    sizeUsd: 1400,
    szDecimals: 5,
    makerOnly: true,
  });
  const nonce = 1730000000000;
  const signed = signHyperliquidActionWithPrivateKey({
    action,
    nonce,
    privateKey: HARDHAT_PK_0,
    useTestnet: false,
  });

  assert.equal(signed.signer, HARDHAT_ADDR_0);
  assert.ok(signed.signature.v === 27 || signed.signature.v === 28);
  assert.match(signed.signature.r, /^0x[0-9a-f]{64}$/);
  assert.match(signed.signature.s, /^0x[0-9a-f]{64}$/);
  assert.match(signed.rawSignature, /^0x[0-9a-f]{130}$/);

  // Mathematical ecrecover proof: recovered address must match exact signer
  const { digest } = hashHyperliquidTypedData(action, nonce, false, null);
  const recovered = recoverEvmAddressFromSignature(digest, signed.signature);
  assert.equal(recovered, HARDHAT_ADDR_0);

  // Leverage and Cancel action builders match canonical Hyperliquid wire schema
  const levAction = buildHyperliquidLeverageAction({ assetIndex: 3, leverage: 6, isCross: true });
  assert.deepEqual(Object.keys(levAction), ['type', 'asset', 'isCross', 'leverage']);
  assert.equal(levAction.type, 'updateLeverage');
  assert.equal(levAction.leverage, 6);

  const cancelAction = buildHyperliquidCancelAction({ assetIndex: 3, orderId: '987654321' });
  assert.deepEqual(cancelAction, { type: 'cancel', cancels: [{ a: 3, o: 987654321 }] });
});

test('Canonical exchange priority order puts Hyperliquid #1 and Binance #2 ahead of Bybit and OKX', () => {
  assert.deepEqual(EXCHANGE_PRIORITY_ORDER, ['HYPERLIQUID', 'BINANCE', 'BYBIT', 'OKX']);

  const allFourWallets = [
    {
      id: 'hyperliquid_agent',
      name: 'Hyperliquid L1 Perp & Spot',
      connected: true,
      verifiedReal: true,
      autoSignEnabled: true,
      balanceUsd: 5000,
      credentials: {
        walletAddress: HARDHAT_ADDR_0,
        agentPrivateKey: HARDHAT_PK_0,
        useTestnet: false,
      },
    },
    {
      id: 'binance_api',
      name: 'Binance Futures & Spot',
      connected: true,
      verifiedReal: true,
      autoSignEnabled: true,
      balanceUsd: 5000,
      futuresEnabled: true,
      spotEnabled: true,
      futuresBalanceUsd: 5000,
      spotBalanceUsd: 0,
      credentials: { apiKey: 'bin-key-123456', apiSecret: 'bin-sec-987654', useTestnet: false },
    },
    {
      id: 'bybit_api',
      name: 'Bybit V5 Unified',
      connected: true,
      verifiedReal: true,
      autoSignEnabled: true,
      balanceUsd: 5000,
      credentials: { apiKey: 'byb-key-123456', apiSecret: 'byb-sec-987654', useTestnet: false },
    },
    {
      id: 'okx_api',
      name: 'OKX V5',
      connected: true,
      verifiedReal: true,
      autoSignEnabled: true,
      balanceUsd: 5000,
      credentials: {
        apiKey: 'okx-key-123456',
        apiSecret: 'okx-sec-987654',
        passphrase: 'okx-pass-123',
        useTestnet: false,
      },
    },
  ];

  assert.equal(hasHyperliquidAgentPrivateKey(allFourWallets[0]), true);

  const genericMarket = { symbol: 'ETH-PERP', marketType: 'PERP', primaryExchange: 'JUPITER' };

  // 1) All 4 connected with HL agent key -> Priority #1 HYPERLIQUID selected even in autonomous mode!
  const pick1 = resolveExecutableRealVenue({
    market: genericMarket,
    side: 'LONG',
    wallets: allFourWallets,
    useTestnet: false,
    isAutonomous: true,
  });
  assert.equal(pick1.ok, true);
  assert.equal(pick1.exchange, 'HYPERLIQUID');
  assert.equal(pick1.wallet.id, 'hyperliquid_agent');

  // 2) Without HL agent key in autonomous mode -> Priority #2 BINANCE selected ahead of Bybit/OKX!
  const noHlKeyWallets = allFourWallets.map((w) =>
    w.id === 'hyperliquid_agent'
      ? { ...w, credentials: { walletAddress: HARDHAT_ADDR_0, agentPrivateKey: '', useTestnet: false } }
      : w
  );
  const pick2 = resolveExecutableRealVenue({
    market: genericMarket,
    side: 'LONG',
    wallets: noHlKeyWallets,
    useTestnet: false,
    isAutonomous: true,
  });
  assert.equal(pick2.ok, true);
  assert.equal(pick2.exchange, 'BINANCE');
});

test('Priority #1 Hyperliquid full server-side unattended lifecycle: updateLeverage -> ENTRY_MAKER -> orderStatus -> cancel -> positions', async () => {
  resetRlsRateLimitersForTest();
  const originalFetch = globalThis.fetch;
  const exchangeBodies = [];

  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    const body = init.body ? JSON.parse(String(init.body)) : {};

    if (u.includes('hyperliquid') && u.endsWith('/info')) {
      if (body.type === 'meta') {
        return mockJsonResponse({
          universe: [
            { name: 'BTC', szDecimals: 5, maxLeverage: 40 },
            { name: 'ETH', szDecimals: 4, maxLeverage: 25 },
          ],
        });
      }
      if (body.type === 'orderStatus') {
        return mockJsonResponse({
          status: 'order',
          order: {
            status: 'filled',
            order: { origSz: '0.02', sz: '0', limitPx: '70000' },
          },
        });
      }
      if (body.type === 'clearinghouseState') {
        return mockJsonResponse({
          marginSummary: { accountValue: '5200.50' },
          withdrawable: '4100.00',
          assetPositions: [
            {
              position: {
                coin: 'BTC',
                szi: '0.02',
                entryPx: '70000',
                positionValue: '1410.0',
                leverage: { type: 'cross', value: 5 },
                unrealizedPnl: '10.0',
              },
            },
          ],
        });
      }
    }

    if (u.includes('hyperliquid') && u.endsWith('/exchange')) {
      exchangeBodies.push(body);
      if (body.action?.type === 'updateLeverage') {
        return mockJsonResponse({ status: 'ok', response: { type: 'default' } });
      }
      if (body.action?.type === 'order') {
        return mockJsonResponse({
          status: 'ok',
          response: {
            type: 'order',
            data: { statuses: [{ resting: { oid: 555777999 } }] },
          },
        });
      }
      if (body.action?.type === 'cancel') {
        return mockJsonResponse({
          status: 'ok',
          response: {
            type: 'cancel',
            data: { statuses: ['success'] },
          },
        });
      }
    }

    return mockJsonResponse({ ok: false }, 404);
  };

  try {
    // 1. Entry with automatic updateLeverage sync + EIP-712 signing via agentPrivateKey
    const execRes = await executeRealExchangeOrder({
      exchange: 'HYPERLIQUID',
      symbol: 'BTC-PERP',
      side: 'LONG',
      orderPurpose: 'ENTRY_MAKER',
      sizeUsd: 1400,
      price: 70000,
      leverage: 5,
      makerOnly: true,
      marketType: 'PERP',
      useTestnet: false,
      credentials: {
        walletAddress: HARDHAT_ADDR_0,
        agentPrivateKey: HARDHAT_PK_0,
      },
      rlsContext: { autoSignEnabled: true, nonce: Date.now() },
    });

    assert.equal(execRes.ok, true);
    assert.equal(execRes.orderId, '555777999');
    assert.equal(execRes.orderState, 'RESTING');
    assert.equal(execRes.signer, HARDHAT_ADDR_0);
    assert.equal(exchangeBodies.length, 2);
    assert.equal(exchangeBodies[0].action.type, 'updateLeverage');
    assert.equal(exchangeBodies[0].action.leverage, 5);
    assert.equal(exchangeBodies[1].action.type, 'order');

    // 2. Order status polling
    const stRes = await fetchRealOrderStatus({
      exchange: 'HYPERLIQUID',
      symbol: 'BTC-PERP',
      orderId: '555777999',
      credentials: { walletAddress: HARDHAT_ADDR_0 },
      useTestnet: false,
    });
    assert.equal(stRes.ok, true);
    assert.equal(stRes.orderState, 'FILLED');
    assert.equal(stRes.filledQty, 0.02);

    // 3. Cancel order via agentPrivateKey
    const cancelRes = await cancelRealExchangeOrder({
      exchange: 'HYPERLIQUID',
      symbol: 'BTC-PERP',
      orderId: '555777999',
      credentials: {
        walletAddress: HARDHAT_ADDR_0,
        agentPrivateKey: HARDHAT_PK_0,
      },
      useTestnet: false,
    });
    assert.equal(cancelRes.ok, true);
    assert.equal(exchangeBodies[2].action.type, 'cancel');
    assert.deepEqual(exchangeBodies[2].action.cancels, [{ a: 0, o: 555777999 }]);

    // 4. Open positions reconciliation
    const posRes = await fetchRealOpenPositions({
      providerId: 'hyperliquid_agent',
      credentials: { walletAddress: HARDHAT_ADDR_0 },
      useTestnet: false,
    });
    assert.equal(posRes.ok, true);
    assert.equal(posRes.positions.length, 1);
    assert.equal(posRes.positions[0].exchange, 'HYPERLIQUID');
    assert.equal(posRes.positions[0].symbol, 'BTC-PERP');
    assert.equal(posRes.positions[0].side, 'LONG');
    assert.equal(posRes.positions[0].leverage, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Priority #2 Binance: enforces minNotional pre-flight guard and handles Spot-only position reconciliation gracefully', async () => {
  resetRlsRateLimitersForTest();
  clearInstrumentSpecCache();
  const originalFetch = globalThis.fetch;
  let orderEndpointHit = false;

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/fapi/v1/exchangeInfo')) {
      return mockJsonResponse({
        symbols: [
          {
            symbol: 'BTCUSDT',
            filters: [
              { filterType: 'LOT_SIZE', stepSize: '0.001', minQty: '0.001' },
              { filterType: 'PRICE_FILTER', tickSize: '0.1' },
              { filterType: 'MIN_NOTIONAL', notional: '100' },
            ],
          },
        ],
      });
    }
    if (u.includes('/fapi/v1/time')) {
      return mockJsonResponse({ serverTime: Date.now() });
    }
    if (u.includes('/fapi/v1/order')) {
      orderEndpointHit = true;
      return mockJsonResponse({ orderId: 12345, status: 'NEW' });
    }
    if (u.includes('/fapi/v2/positionRisk')) {
      return mockJsonResponse({ code: -2015, msg: 'Invalid API-key, IP, or permissions for action' }, 400);
    }
    return mockJsonResponse({});
  };

  try {
    // $80 BTC order quantizes to 0.001 BTC ($70 notional): passes minQty (0.001) but fails $100 MIN_NOTIONAL!
    const res = await executeRealExchangeOrder({
      exchange: 'BINANCE',
      symbol: 'BTC-PERP',
      binanceSymbol: 'BTCUSDT',
      side: 'LONG',
      orderPurpose: 'ENTRY_MAKER',
      sizeUsd: 80,
      price: 70000,
      leverage: 5,
      marketType: 'PERP',
      useTestnet: false,
      credentials: { apiKey: 'bin-key-123456', apiSecret: 'bin-sec-987654' },
      rlsContext: { autoSignEnabled: true, nonce: Date.now() },
    });
    assert.equal(res.ok, false);
    assert.match(res.error || '', /NOTIONAL GUARD/i);
    assert.equal(orderEndpointHit, false);

    // Spot-only Binance key (-2015 on /fapi/v2/positionRisk) returns ok:true, positions:[] gracefully
    const posRes = await fetchRealOpenPositions({
      providerId: 'binance_api',
      credentials: { apiKey: 'bin-key-123456', apiSecret: 'bin-sec-987654' },
      useTestnet: false,
    });
    assert.equal(posRes.ok, true);
    assert.deepEqual(posRes.positions, []);
  } finally {
    globalThis.fetch = originalFetch;
    clearInstrumentSpecCache();
  }
});

test('Priority #3 Bybit & #4 OKX: full verify parity (chainBalances + capabilities), Bybit Spot StopOrder cancel, and history status fallback', async () => {
  const originalFetch = globalThis.fetch;
  let capturedBybitCancelBody = null;
  let bybitHistoryQueried = false;

  globalThis.fetch = async (url, init = {}) => {
    const u = String(url);
    if (u.includes('bybit.com/v5/market/time')) {
      return mockJsonResponse({ retCode: 0, time: Date.now() });
    }
    if (u.includes('bybit.com/v5/account/wallet-balance')) {
      return mockJsonResponse({ retCode: 0, result: { list: [{ totalEquity: '3250.75' }] } });
    }
    if (u.includes('bybit.com/v5/order/cancel')) {
      capturedBybitCancelBody = JSON.parse(String(init.body || '{}'));
      return mockJsonResponse({ retCode: 0, result: { orderId: 'byb-sl-1' } });
    }
    if (u.includes('bybit.com/v5/order/realtime')) {
      return mockJsonResponse({ retCode: 0, result: { list: [] } });
    }
    if (u.includes('bybit.com/v5/order/history')) {
      bybitHistoryQueried = true;
      return mockJsonResponse({
        retCode: 0,
        result: {
          list: [{ orderStatus: 'Filled', cumExecQty: '0.5', avgPrice: '3100' }],
        },
      });
    }
    if (u.includes('okx.com/api/v5/account/balance')) {
      return mockJsonResponse({ code: '0', data: [{ totalEq: '4820.10' }] });
    }
    return mockJsonResponse({});
  };

  try {
    // Bybit verify parity
    const bybVerify = await verifyAndFetchAccountBalance({
      providerId: 'bybit_api',
      apiKey: 'byb-key-123456',
      apiSecret: 'byb-sec-987654',
      useTestnet: false,
    });
    assert.equal(bybVerify.ok, true);
    assert.equal(bybVerify.futuresEnabled, true);
    assert.equal(bybVerify.spotEnabled, true);
    assert.equal(bybVerify.balanceUsd, 3250.75);
    assert.ok(Array.isArray(bybVerify.chainBalances) && bybVerify.chainBalances.length === 1);

    // Bybit Spot conditional StopOrder cancel includes orderFilter: 'StopOrder'
    const bybCancel = await cancelRealExchangeOrder({
      exchange: 'BYBIT',
      symbol: 'ETH-USDT',
      orderId: 'byb-sl-1',
      isAlgoOrder: true,
      marketType: 'SPOT',
      venueMode: 'SPOT',
      credentials: { apiKey: 'byb-key-123456', apiSecret: 'byb-sec-987654' },
      useTestnet: false,
    });
    assert.equal(bybCancel.ok, true);
    assert.equal(capturedBybitCancelBody.category, 'spot');
    assert.equal(capturedBybitCancelBody.orderFilter, 'StopOrder');

    // Bybit order status falls back from /v5/order/realtime -> /v5/order/history
    const bybStatus = await fetchRealOrderStatus({
      exchange: 'BYBIT',
      symbol: 'ETH-PERP',
      orderId: 'byb-ord-99',
      credentials: { apiKey: 'byb-key-123456', apiSecret: 'byb-sec-987654' },
      useTestnet: false,
    });
    assert.equal(bybStatus.ok, true);
    assert.equal(bybitHistoryQueried, true);
    assert.equal(bybStatus.orderState, 'FILLED');
    assert.equal(bybStatus.filledQty, 0.5);

    // OKX verify parity
    const okxVerify = await verifyAndFetchAccountBalance({
      providerId: 'okx_api',
      apiKey: 'okx-key-123456',
      apiSecret: 'okx-sec-987654',
      passphrase: 'okx-pass-123',
      useTestnet: false,
    });
    assert.equal(okxVerify.ok, true);
    assert.equal(okxVerify.futuresEnabled, true);
    assert.equal(okxVerify.spotEnabled, true);
    assert.equal(okxVerify.balanceUsd, 4820.1);
    assert.ok(Array.isArray(okxVerify.chainBalances) && okxVerify.chainBalances.length === 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Testnet 1:1 Parity: getRealAggregatedOrderbook(coin, sym, true) routes exclusively to Testnet L2 endpoints without colliding with Mainnet cache', async () => {
  const originalFetch = globalThis.fetch;
  const hitUrls = [];

  globalThis.fetch = async (url) => {
    const u = String(url);
    hitUrls.push(u);
    if (u.includes('api.hyperliquid-testnet.xyz/info')) {
      return mockJsonResponse({
        levels: [
          [{ px: '58590.0', sz: '2.5' }],
          [{ px: '58592.0', sz: '2.4' }],
        ],
      });
    }
    if (u.includes('testnet.binancefuture.com/fapi/v1/depth')) {
      return mockJsonResponse({
        bids: [['58589.5', '1.8']],
        asks: [['58592.5', '1.9']],
      });
    }
    if (u.includes('api-testnet.bybit.com/v5/market/orderbook')) {
      return mockJsonResponse({
        retCode: 0,
        result: { b: [['58589.0', '1.5']], a: [['58593.0', '1.5']] },
      });
    }
    return mockJsonResponse({}, 404);
  };

  try {
    const testBook = await getRealAggregatedOrderbook('TESTBTC', 'TESTBTCUSDT', true);
    assert.equal(testBook.ok, true);
    assert.equal(testBook.useTestnet, true);
    assert.equal(testBook.primaryVenue, 'HYPERLIQUID');
    assert.equal(testBook.bids[0].price, 58590);
    assert.equal(testBook.asks[0].price, 58592);
    assert.ok(testBook.bids[0].price < testBook.asks[0].price);
    assert.ok(hitUrls.some((u) => u.includes('api.hyperliquid-testnet.xyz/info')));
    assert.ok(hitUrls.some((u) => u.includes('testnet.binancefuture.com/fapi/v1/depth')));
    assert.ok(hitUrls.some((u) => u.includes('api-testnet.bybit.com/v5/market/orderbook')));
    assert.ok(!hitUrls.some((u) => u.includes('api.hyperliquid.xyz/info')));
    assert.ok(!hitUrls.some((u) => u.includes('fapi.binance.com/fapi/v1/depth')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('Binance Accounting Parity: authoritative /fapi/v2/account free margin + Binance Demo Spot (demo-api.binance.com) native prices', async () => {
  const originalFetch = globalThis.fetch;
  let spotOrderUrl = '';

  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes('/fapi/v1/time') || u.includes('/api/v3/time')) {
      return mockJsonResponse({ serverTime: Date.now() });
    }
    if (u.includes('testnet.binancefuture.com/fapi/v2/account')) {
      // Authoritative Binance Futures account: totalMarginBalance=$10,000, availableBalance=$7,500 ($2,500 locked in open pos), plus 0.01 BTC fee/non-margin
      return mockJsonResponse({
        multiAssetsMargin: false,
        totalWalletBalance: '10000.00',
        totalMarginBalance: '10000.00',
        availableBalance: '7500.00',
        assets: [
          { asset: 'USDT', walletBalance: '5000.00', availableBalance: '2500.00', marginAvailable: true },
          { asset: 'USDC', walletBalance: '5000.00', availableBalance: '5000.00', marginAvailable: true },
          { asset: 'BTC', walletBalance: '0.01', availableBalance: '0.01', marginAvailable: false },
        ],
      });
    }
    if (u.includes('testnet.binancefuture.com/fapi/v2/balance')) {
      return mockJsonResponse([
        { asset: 'USDT', balance: '5000.00', availableBalance: '2500.00', crossUnPnl: '0', marginAvailable: true },
        { asset: 'USDC', balance: '5000.00', availableBalance: '5000.00', crossUnPnl: '0', marginAvailable: true },
        { asset: 'BTC', balance: '0.01', availableBalance: '0.01', crossUnPnl: '0', marginAvailable: false },
      ]);
    }
    if (u.includes('demo-api.binance.com/api/v3/account')) {
      // Binance Demo Spot: 5000 USDC (free 4000, locked 1000) + 5000 USDT (free 5000)
      return mockJsonResponse({
        balances: [
          { asset: 'USDC', free: '4000.00', locked: '1000.00' },
          { asset: 'USDT', free: '5000.00', locked: '0.00' },
        ],
      });
    }
    if (u.includes('testnet.binance.vision/api/v3/account')) {
      return mockJsonResponse({ code: -2015, msg: 'Invalid API-key' }, 401);
    }
    if (u.includes('demo-api.binance.com/api/v3/ticker/price')) {
      return mockJsonResponse([
        { symbol: 'USDCUSDT', price: '1.001436' },
        { symbol: 'BTCUSDT', price: '58316.00' },
      ]);
    }
    if (u.includes('demo-api.binance.com/api/v3/exchangeInfo')) {
      return mockJsonResponse({
        symbols: [
          {
            symbol: 'ETHUSDT',
            filters: [
              { filterType: 'LOT_SIZE', stepSize: '0.0001', minQty: '0.0001' },
              { filterType: 'PRICE_FILTER', tickSize: '0.01' },
              { filterType: 'NOTIONAL', minNotional: '5' },
            ],
          },
        ],
      });
    }
    if (u.includes('demo-api.binance.com/api/v3/order')) {
      spotOrderUrl = u;
      return mockJsonResponse({ orderId: 990011, status: 'NEW', executedQty: '0', cummulativeQuoteQty: '0' });
    }
    return mockJsonResponse({}, 404);
  };

  try {
    resetRlsRateLimitersForTest();
    clearInstrumentSpecCache();
    const ver = await verifyAndFetchAccountBalance({
      providerId: 'binance_api',
      apiKey: 'demo-key-123456',
      apiSecret: 'demo-sec-987654',
      useTestnet: true,
    });
    assert.equal(ver.ok, true);
    assert.equal(ver.futuresEnabled, true);
    assert.equal(ver.spotEnabled, true);
    assert.equal(ver.resolvedSpotHost, 'demo-api.binance.com');
    // Authoritative Futures equity = $10,000 (NOT inflated by non-margin 0.01 BTC), free margin = $7,500 (excludes $2,500 locked!)
    assert.equal(ver.futuresEquityUsd, 10000);
    assert.equal(ver.futuresBalanceUsd, 7500);
    // Binance-native Spot prices: 5000 * 1.001436 ($5007.18) + 5000 ($5000) = $10,007.18 total equity;
    // Spendable *USDT Spot Buy Power (`spotBalanceUsd`) is strictly free USDT ($5,000.00), NEVER counting USDC/BTC/locked!
    assert.equal(ver.spotEquityUsd, 10007.18);
    assert.equal(ver.spotBalanceUsd, 5000);
    assert.equal(ver.spotFreeTotalUsd, 9005.74);
    assert.equal(ver.balanceUsd, 20007.18);

    // Executing a Spot order on Binance Demo automatically routes to demo-api.binance.com!
    const spotExec = await executeRealExchangeOrder({
      exchange: 'BINANCE',
      symbol: 'ETH-USDT',
      side: 'LONG',
      orderPurpose: 'ENTRY_MAKER',
      sizeUsd: 100,
      price: 1650,
      leverage: 1,
      marketType: 'SPOT',
      venueMode: 'SPOT',
      useTestnet: true,
      credentials: {
        apiKey: 'demo-key-123456',
        apiSecret: 'demo-sec-987654',
        binanceSpotHost: ver.resolvedSpotHost,
      },
      rlsContext: { autoSignEnabled: true, nonce: Date.now() },
    });
    assert.equal(spotExec.ok, true);
    assert.ok(spotOrderUrl.includes('demo-api.binance.com/api/v3/order'));
  } finally {
    globalThis.fetch = originalFetch;
    clearInstrumentSpecCache();
  }
});
