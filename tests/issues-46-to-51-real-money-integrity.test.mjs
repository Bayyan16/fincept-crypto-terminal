import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cancelRealExchangeOrder,
  clearOrderbookCacheForTest,
  executeRealExchangeOrder,
  fetchRealOpenPositions,
  fetchRealOrderStatus,
  getRealAggregatedOrderbook,
} from '../backend/exchangeGateway.mjs';
import {
  ingestHyperliquidFullUniverse,
  queryDexUniverse,
} from '../backend/multiChainDexScanner.mjs';
import { computeSafeBreakevenParams } from '../backend/positionMath.mjs';
import {
  computeSafeAutonomousRealOrderSizeUsd,
  resolveExecutableRealVenue,
} from '../backend/realExecutionRouter.mjs';
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

test('Issue #46 POSITIVE: Aggregated L2 orderbook is strictly uncrossed, scales OKX SWAP by ctVal, excludes Spot basis over Perp, and computes symmetric OBI', async () => {
  clearOrderbookCacheForTest();
  clearInstrumentSpecCache();
  await withMockFetch(
    async (url) => {
      const u = String(url);
      if (u.includes('api.hyperliquid.xyz/info')) {
        return mockJsonResponse({
          levels: [
            [{ px: '58925', sz: '2.0' }, { px: '58924', sz: '1.5' }],
            [{ px: '58926', sz: '2.0' }, { px: '58927', sz: '1.5' }],
          ],
        });
      }
      if (u.includes('okx.com/api/v5/public/instruments')) {
        return mockJsonResponse({
          code: '0',
          data: [{ instId: 'BTC-USDT-SWAP', ctVal: '0.01', lotSz: '1', minSz: '1', tickSz: '0.1' }],
        });
      }
      if (u.includes('okx.com/api/v5/market/books')) {
        // 500 contracts * ctVal(0.01) = 5.0 BTC = ~$294,750 (NOT $29.47M!)
        return mockJsonResponse({
          code: '0',
          data: [
            {
              bids: [['58924.5', '500', '0', '5']],
              asks: [['58926.5', '500', '0', '5']],
            },
          ],
        });
      }
      if (u.includes('api.gateio.ws/api/v4/spot/order_book')) {
        // Higher Spot price must NOT cross Hyperliquid Perp book
        return mockJsonResponse({
          bids: [['58964', '0.5']],
          asks: [['58965', '0.5']],
        });
      }
      return mockJsonResponse({}, 404);
    },
    async () => {
      const ob = await getRealAggregatedOrderbook('BTC', 'BTCUSDT');
      assert.equal(ob.ok, true);
      assert.equal(ob.primaryVenue, 'HYPERLIQUID');
      assert.ok(ob.bids[0].price < ob.asks[0].price, 'Orderbook MUST NEVER be crossed');
      assert.equal(ob.bids.some((b) => b.exchange === 'GATEIO'), false, 'Spot Gate.io MUST NOT overlay Perp book');
      const okxBid = ob.bids.find((b) => b.exchange === 'OKX');
      assert.ok(okxBid, 'Scaled OKX SWAP bid should be present');
      assert.equal(okxBid.size, 5, 'OKX 500 contracts * 0.01 ctVal = 5 BTC');
      assert.ok(okxBid.totalUsd < 500_000, 'OKX totalUsd must NOT be inflated 100x');
      assert.equal(ob.obiPercent, 0, 'Balanced symmetric books must yield 0% OBI');
      assert.equal(ob.venueBooks.HYPERLIQUID.bestBid, 58925);
      assert.equal(ob.venueBooks.HYPERLIQUID.bestAsk, 58926);
    }
  );
});

test('Issue #46 NEGATIVE: OKX levels are strictly skipped when ctVal instrument spec is unavailable', async () => {
  clearOrderbookCacheForTest();
  clearInstrumentSpecCache();
  await withMockFetch(
    async (url) => {
      const u = String(url);
      if (u.includes('api.hyperliquid.xyz/info')) {
        return mockJsonResponse({
          levels: [
            [{ px: '58925', sz: '2.0' }],
            [{ px: '58926', sz: '2.0' }],
          ],
        });
      }
      if (u.includes('okx.com/api/v5/market/books')) {
        return mockJsonResponse({
          code: '0',
          data: [{ bids: [['58924', '9999', '0', '5']], asks: [['58927', '1', '0', '1']] }],
        });
      }
      return mockJsonResponse({}, 500);
    },
    async () => {
      const ob = await getRealAggregatedOrderbook('BTC', 'BTCUSDT');
      assert.equal(ob.ok, true);
      assert.equal(ob.bids.some((b) => b.exchange === 'OKX'), false, 'Unscaled OKX contracts must be excluded');
    }
  );
});

test('Issue #47 POSITIVE: Hyperliquid DEX universe does not fabricate bullish buys1h > sells1h on crashing coin', () => {
  ingestHyperliquidFullUniverse(
    [
      { universe: [{ name: 'DUMP47', maxLeverage: 20 }] },
      [{ markPx: '10', prevDayPx: '12', dayNtlVlm: '24000000', openInterest: '100000' }],
    ],
    null
  );
  const q = queryDexUniverse({ chain: 'hyperliquid', q: 'DUMP47', limit: 10 });
  const item = q.items.find((x) => x.baseSymbol === 'DUMP47');
  assert.ok(item);
  assert.equal(item.buys1h, 0);
  assert.equal(item.sells1h, 0);
  assert.equal(item.whaleNetBuy1hUsd, 0);
  assert.equal(item.hasRealTxnSplit, false);
});

test('Issue #49 POSITIVE: Binance NEW resting Post-Only order reports filledQty=0 and orderState=RESTING (never fake full fill)', async () => {
  clearInstrumentSpecCache();
  resetRlsRateLimitersForTest();
  await withMockFetch(
    async (url) => {
      const u = String(url);
      if (u.includes('/fapi/v1/time')) return mockJsonResponse({ serverTime: Date.now() });
      if (u.includes('/fapi/v1/exchangeInfo')) {
        return mockJsonResponse({
          symbols: [
            {
              symbol: 'BTCUSDT',
              filters: [
                { filterType: 'LOT_SIZE', stepSize: '0.001', minQty: '0.001' },
                { filterType: 'PRICE_FILTER', tickSize: '0.1' },
              ],
            },
          ],
        });
      }
      if (u.includes('/fapi/v1/leverage')) return mockJsonResponse({ leverage: 5 });
      if (u.includes('/fapi/v1/order')) {
        return mockJsonResponse({ orderId: 900123, status: 'NEW', executedQty: '0.000', avgPrice: '0.00' });
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
        makerOnly: true,
        sizeUsd: 600,
        price: 60000,
        leverage: 5,
        refMarkPrice: 60000,
        useTestnet: true,
        credentials: { apiKey: 'testkey123456', apiSecret: 'testsec123456' },
      });
      assert.equal(res.ok, true);
      assert.equal(res.orderState, 'RESTING');
      assert.equal(res.filledQty, 0);
      assert.equal(res.executedQty, 0);
      assert.equal(res.requestedQty, 0.01);
    }
  );
});

test('Issue #49 & #50 POSITIVE: Order status polling, position reconciliation, cancel-order, and Bybit server time sync work cleanly', async () => {
  clearInstrumentSpecCache();
  resetRlsRateLimitersForTest();
  const called = [];
  await withMockFetch(
    async (url, opts) => {
      const u = String(url);
      called.push({ method: opts?.method || 'GET', url: u, body: opts?.body });
      if (u.includes('/v5/market/time')) return mockJsonResponse({ retCode: 0, time: Date.now() });
      if (u.includes('/v5/market/instruments-info')) {
        return mockJsonResponse({
          retCode: 0,
          result: { list: [{ lotSizeFilter: { qtyStep: '0.001', minOrderQty: '0.001' }, priceFilter: { tickSize: '0.1' } }] },
        });
      }
      if (u.includes('/v5/position/set-leverage')) return mockJsonResponse({ retCode: 0 });
      if (u.includes('/v5/order/create')) return mockJsonResponse({ retCode: 0, result: { orderId: 'byb-ord-99' } });
      if (u.includes('/v5/order/cancel')) return mockJsonResponse({ retCode: 0, result: { orderId: 'byb-ord-99' } });
      if (u.includes('/v5/order/realtime')) {
        return mockJsonResponse({
          retCode: 0,
          result: { list: [{ orderId: 'byb-ord-99', orderStatus: 'Filled', cumExecQty: '0.01', avgPrice: '60000' }] },
        });
      }
      if (u.includes('/v5/position/list')) {
        return mockJsonResponse({
          retCode: 0,
          result: { list: [{ symbol: 'BTCUSDT', side: 'Buy', size: '0.01', avgPrice: '60000', markPrice: '60500', leverage: '5', unrealisedPnl: '5.00' }] },
        });
      }
      return mockJsonResponse({ retCode: 0 });
    },
    async () => {
      const creds = { apiKey: 'bybkey123456', apiSecret: 'bybsec123456' };
      const entry = await executeRealExchangeOrder({
        exchange: 'BYBIT',
        symbol: 'BTC-PERP',
        side: 'LONG',
        orderPurpose: 'ENTRY_MAKER',
        makerOnly: true,
        sizeUsd: 600,
        price: 60000,
        leverage: 5,
        refMarkPrice: 60000,
        useTestnet: true,
        credentials: creds,
      });
      assert.equal(entry.ok, true);
      assert.equal(entry.orderState, 'RESTING');
      assert.ok(called.some((c) => c.url.includes('/v5/market/time')), 'Bybit execution MUST sync server time');

      const st = await fetchRealOrderStatus({
        exchange: 'BYBIT',
        symbol: 'BTC-PERP',
        orderId: 'byb-ord-99',
        credentials: creds,
        useTestnet: true,
      });
      assert.equal(st.ok, true);
      assert.equal(st.orderState, 'FILLED');
      assert.equal(st.filledQty, 0.01);

      const posRes = await fetchRealOpenPositions({
        providerId: 'bybit_api',
        credentials: creds,
        useTestnet: true,
      });
      assert.equal(posRes.ok, true);
      assert.equal(posRes.positions.length, 1);
      assert.equal(posRes.positions[0].symbol, 'BTC-PERP');

      const cancelRes = await cancelRealExchangeOrder({
        exchange: 'BYBIT',
        symbol: 'BTC-PERP',
        orderId: 'byb-ord-99',
        credentials: creds,
        useTestnet: true,
      });
      assert.equal(cancelRes.ok, true);
    }
  );
});

test('Issue #51 POSITIVE: Un-invertible Breakeven Stop math, committed-margin multi-slot sizing, and autonomous Hyperliquid popup guard', () => {
  // 1. Even if user passes tiny 0.06% trigger at 8x, BE MUST NOT lock at $60,004.50 (below beStopPrice $60,024)!
  const unsafe = computeSafeBreakevenParams({
    side: 'LONG',
    entryPrice: 60000,
    currentPrice: 60004.5,
    leverage: 8,
    configuredTriggerPct: 0.06,
    lockOffsetPct: 0.0004,
  });
  assert.equal(unsafe.shouldLock, false);
  assert.equal(unsafe.canPlaceExchangeStop, false);

  // Only locks once currentPrice is strictly above beStopPrice ($60,024) + safety cushion ($60,090 = +1.2% ROE @ 8x)
  const safe = computeSafeBreakevenParams({
    side: 'LONG',
    entryPrice: 60000,
    currentPrice: 60090,
    leverage: 8,
    configuredTriggerPct: 1.2,
    lockOffsetPct: 0.0004,
  });
  assert.equal(safe.shouldLock, true);
  assert.equal(safe.canPlaceExchangeStop, true);
  assert.ok(safe.beStopPrice < 60090);

  // 2. Multi-slot sizing subtracts committedMarginUsd ($85 used out of $100 -> only $15 free -> $63.75 max @ 5x!)
  const slot2 = computeSafeAutonomousRealOrderSizeUsd({
    requestedSizeUsd: 500,
    availableUsd: 100,
    committedMarginUsd: 85,
    verifiedReal: true,
    marketType: 'PERP',
    leverage: 5,
  });
  assert.equal(slot2.ok, true);
  assert.equal(slot2.sizeUsd, 63.75);

  const exhausted = computeSafeAutonomousRealOrderSizeUsd({
    requestedSizeUsd: 500,
    availableUsd: 100,
    committedMarginUsd: 99,
    verifiedReal: true,
    marketType: 'PERP',
    leverage: 5,
  });
  assert.equal(exhausted.ok, false);

  // 3. Autonomous routing blocks unattended Hyperliquid browser-popup wallet
  const hlOnlyWallet = [
    {
      id: 'trust',
      name: 'Trust Wallet',
      connected: true,
      verifiedReal: true,
      autoSignEnabled: true,
      balanceUsd: 1000,
      credentials: { walletAddress: '0x1111111111111111111111111111111111111111', useTestnet: false },
    },
  ];
  const autoRoute = resolveExecutableRealVenue({
    market: { symbol: 'BTC-PERP', baseAsset: 'BTC', marketType: 'PERP', primaryExchange: 'HYPERLIQUID', supportedExchanges: ['HYPERLIQUID'], price: 60000 },
    side: 'LONG',
    wallets: hlOnlyWallet,
    useTestnet: false,
    isAutonomous: true,
  });
  assert.equal(autoRoute.ok, false);
  assert.match(autoRoute.error, /popup/i);
});
