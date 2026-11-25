import { test, expect } from '@playwright/test';

/**
 * Post-Fix E2E Regression Suite for Issues #46-#51:
 * Verifies real-time/on-chain data integrity, independent 4-agent consensus,
 * stop-loss cancel/reconcile endpoints, real-money auto-disarm, and safe risk calibration.
 */
test.describe('Issues #46-#51 End-to-End Real-Money Integrity & Automation Controls', () => {
  test('#46 POSITIVE: Live /api/live/orderbook is strictly uncrossed, excludes Spot basis over Perp, and scales OKX contracts cleanly', async ({
    request,
  }) => {
    const res = await request.get('/api/live/orderbook?hlCoin=BTC&binanceSymbol=BTCUSDT');
    expect(res.status()).toBe(200);
    const ob = await res.json();
    expect(ob.ok).toBe(true);
    expect(ob.bids.length).toBeGreaterThan(0);
    expect(ob.asks.length).toBeGreaterThan(0);
    // Strict uncrossed invariant: bestBid < bestAsk!
    expect(ob.bids[0].price).toBeLessThan(ob.asks[0].price);
    expect(ob.primaryVenue).toBeTruthy();
    expect(ob.venueBooks).toBeTruthy();
    // Gate.io Spot must not overlay Hyperliquid Perp book
    expect(ob.bids.some((b: any) => b.exchange === 'GATEIO')).toBe(false);
    // OKX bids (if present) must be scaled by ctVal (never 100x inflated > $10M for normal top levels)
    const okxBids = ob.bids.filter((b: any) => b.exchange === 'OKX');
    for (const b of okxBids) {
      expect(b.totalUsd).toBeLessThan(10_000_000);
    }
  });

  test('#47 POSITIVE: Live snapshot has zero fake quote/TVL/undecoded trades & engines never fabricate OBI, whale flow, or sine-wave TA', async ({
    request,
    page,
  }) => {
    const snapRes = await request.get('/api/live/snapshot');
    expect(snapRes.status()).toBe(200);
    const snap = await snapRes.json();
    const trades = snap.realOnChainTrades || [];
    expect(trades.some((t: any) => String(t.id).startsWith('jup-live-'))).toBe(false);
    expect(trades.some((t: any) => String(t.id).startsWith('ray-live-'))).toBe(false);
    expect(trades.some((t: any) => String(t.id).startsWith('sol-rpc-'))).toBe(false);

    await page.goto('/pro/', { waitUntil: 'domcontentloaded' });
    const zeroSynth = await page.evaluate(async () => {
      const lc: any = await import('/src/engine/liveConnectors.ts');
      const maf: any = await import('/src/engine/multiAgentForum.ts');
      const merged = lc.mergeDynamicAllCryptoMarkets([], {
        FAKECOIN: { coin: 'FAKECOIN', price: 10, change24h: 7.0, volume24hUsd: 20_000_000, openInterestUsd: 8_000_000, fundingRate: 0.01 },
      });
      const m = merged[0];
      const ta = maf.computeTechnicalAnalysisSnapshot(m, undefined);
      return {
        obiScore: m.obiScore,
        whaleNetFlow1hUsd: m.whaleNetFlow1hUsd,
        cvdDelta15mUsd: m.cvdDelta15mUsd,
        hasRealOrderbook: m.hasRealOrderbook,
        hasRealCandles: ta.hasRealCandles,
        taRecommendedSide: ta.recommendedSide,
      };
    });
    expect(zeroSynth.obiScore).toBe(0);
    expect(zeroSynth.whaleNetFlow1hUsd).toBe(0);
    expect(zeroSynth.cvdDelta15mUsd).toBe(0);
    expect(zeroSynth.hasRealOrderbook).toBe(false);
    expect(zeroSynth.hasRealCandles).toBe(false);
    expect(zeroSynth.taRecommendedSide).toBe('WAIT');
  });

  test('#48 POSITIVE: Agents 1-3 genuinely vote WAIT on flat/neutral market & scanner strictly enforces minLiquidityGate + real candles', async ({
    page,
  }) => {
    await page.goto('/pro/', { waitUntil: 'domcontentloaded' });
    const verified = await page.evaluate(async () => {
      const maf: any = await import('/src/engine/multiAgentForum.ts');
      const skills: any = await import('/src/engine/agentSkills.ts');
      const flatPair = {
        symbol: 'FLAT-PERP',
        baseAsset: 'FLAT',
        quoteAsset: 'USDC',
        hlCoin: 'FLAT',
        binanceSymbol: 'FLATUSDT',
        marketType: 'PERP',
        primaryExchange: 'HYPERLIQUID',
        supportedExchanges: ['HYPERLIQUID'],
        price: 100,
        change24h: 0.01,
        high24h: 100.1,
        low24h: 99.9,
        volume24hUsd: 50_000_000,
        openInterestUsd: 10_000_000,
        fundingRate: 0,
        spreadBps: 0.5,
        depthPlusMinusHalfPctUsd: 5_000_000,
        dexPoolTvlUsd: 5_000_000,
        liquidityScore: 62,
        obiScore: 0,
        cvdDelta15mUsd: 0,
        whaleNetFlow1hUsd: 0,
        whaleBias: 'NEUTRAL',
        hasRealWhaleFlow: false,
        hasRealOrderbook: true,
      };
      const flatCandles = Array.from({ length: 40 }, (_, i) => ({
        time: Date.now() - (40 - i) * 900_000,
        label: `${i}`,
        open: 100,
        high: 100.05,
        low: 99.95,
        close: 100,
        volume: 100000,
        cvd: 0,
      }));
      const flatBook = {
        bids: [{ price: 99.99, size: 10, totalUsd: 1000, cumulativeUsd: 1000, exchange: 'HYPERLIQUID' }],
        asks: [{ price: 100.01, size: 10, totalUsd: 1000, cumulativeUsd: 1000, exchange: 'HYPERLIQUID' }],
        spreadUsd: 0.02,
        spreadBps: 2.0,
        obiPercent: 0,
        absorptionDetected: 'NONE',
        spoofingAlert: null,
        isLiveBook: true,
      };
      const consensus = maf.runMultiAgentForumConsensus(flatPair, flatBook, [], flatCandles, [], [], 500);
      const scannedGate85 = skills.scanAllMarketMultiAgentCandidates([flatPair], [], null, 85, 500, [], {
        'FLAT-PERP_15m': flatCandles,
      });
      const scannedNoCandles = skills.scanAllMarketMultiAgentCandidates(
        [{ ...flatPair, liquidityScore: 95 }],
        [],
        null,
        65,
        500,
        [],
        {},
        { requireRealCandles: true, requireConsensusQuorum: true }
      );
      return {
        votes: consensus.votes.map((v: any) => v.vote),
        finalVerdict: consensus.finalVerdict,
        scannedGate85Count: scannedGate85.length,
        scannedNoCandlesCount: scannedNoCandles.length,
      };
    });
    expect(verified.votes).toEqual(['WAIT', 'WAIT', 'WAIT', 'WAIT']);
    expect(verified.finalVerdict).toBe('WAIT_CONFIRMATION');
    expect(verified.scannedGate85Count).toBe(0);
    expect(verified.scannedNoCandlesCount).toBe(0);
  });

  test('#49 & #50 POSITIVE: Switching to REAL MONEY auto-disarms AUTO-AGENT, and /api/execute/cancel + /api/execute/order-status + /api/account/positions routes exist', async ({
    page,
    request,
  }) => {
    await page.goto('/pro/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('app-root')).toBeVisible();

    // Switch execution mode to REAL MONEY -> AUTO-AGENT MUST automatically disarm to OFF!
    await page.locator('button:has-text("REAL MONEY")').first().click();
    await expect(page.locator('button:has-text("AUTO-AGENT: OFF")').first()).toBeVisible();

    // Verify lifecycle API endpoints exist (return HTTP 200 structured validation JSON, not 404!)
    const cancelRes = await request.post('/api/execute/cancel', { data: {} });
    expect(cancelRes.status()).toBe(200);
    const cancelJson = await cancelRes.json();
    expect(cancelJson.ok).toBe(false);

    const statusRes = await request.post('/api/execute/order-status', { data: {} });
    expect(statusRes.status()).toBe(200);
    const statusJson = await statusRes.json();
    expect(statusJson.ok).toBe(false);

    const posRes = await request.post('/api/account/positions', { data: {} });
    expect(posRes.status()).toBe(200);
    const posJson = await posRes.json();
    expect(posJson.ok).toBe(false);
  });

  test('#51 POSITIVE: User TP setting (<50%) is honored and hair-trigger -0.05% tick does not trigger cut under -2.5% default scratch cap', async ({
    page,
  }) => {
    await page.goto('/pro/', { waitUntil: 'domcontentloaded' });
    const verified = await page.evaluate(async () => {
      const skills: any = await import('/src/engine/agentSkills.ts');
      const strongMkt = {
        symbol: 'BTC-PERP',
        obiScore: 0.35,
        cvdDelta15mUsd: 5_000_000,
        depthPlusMinusHalfPctUsd: 20_000_000,
        whaleNetFlow1hUsd: 8_000_000,
        change24h: 2.0,
        fundingRate: 0.005,
      };
      const holdTinyLoss = skills.evaluateActivePositionDeepIntelligence(
        {
          id: 'pos-1',
          symbol: 'BTC-PERP',
          side: 'LONG',
          entryPrice: 60000,
          currentPrice: 59996,
          sizeUsd: 500,
          leverage: 8,
          unrealizedPnlPct: -0.05,
          unrealizedPnlUsd: -0.03,
          peakPnlPct: 0,
        },
        strongMkt,
        [],
        50,
        -2.5
      );
      const weakMkt = { ...strongMkt, obiScore: -0.2, cvdDelta15mUsd: -2_000_000, whaleNetFlow1hUsd: -2_000_000, change24h: -1 };
      const honorUser15Tp = skills.evaluateActivePositionDeepIntelligence(
        {
          id: 'pos-2',
          symbol: 'BTC-PERP',
          side: 'LONG',
          entryPrice: 60000,
          currentPrice: 62625,
          sizeUsd: 500,
          leverage: 8,
          unrealizedPnlPct: 35,
          unrealizedPnlUsd: 21.88,
          peakPnlPct: 40,
        },
        weakMkt,
        [],
        15,
        -2.5
      );
      return {
        tinyLossDecision: holdTinyLoss.decision,
        user15TpDecisionAt35Pct: honorUser15Tp.decision,
      };
    });
    expect(verified.tinyLossDecision).toBe('HOLD_FLOATING_LOSS');
    expect(verified.user15TpDecisionAt35Pct).toBe('AUTO_TAKE_PROFIT_NOW');
  });

  test('MULTI-EXCHANGE PARITY: All 4 exchanges (#1 HYPERLIQUID, #2 BINANCE, #3 BYBIT, #4 OKX) are online, prioritized, and have zero config gaps', async ({
    request,
    page,
  }) => {
    const statusRes = await request.get('/api/exchanges/status?testnet=0');
    expect(statusRes.status()).toBe(200);
    const data = await statusRes.json();
    expect(data.ok).toBe(true);
    expect(data.priorityOrder).toEqual(['HYPERLIQUID', 'BINANCE', 'BYBIT', 'OKX']);
    expect(data.primaryExchanges).toEqual(['HYPERLIQUID', 'BINANCE']);
    expect(data.exchanges.length).toBe(4);
    expect(data.allReachable).toBe(true);

    for (const ex of data.exchanges) {
      expect(ex.reachable).toBe(true);
      expect(ex.capabilities.futures).toBe(true);
      expect(ex.capabilities.leverageSync).toBe(true);
      expect(ex.capabilities.postOnlyMaker).toBe(true);
      expect(ex.capabilities.protectiveStop).toBe(true);
      expect(ex.capabilities.cancelOrder).toBe(true);
      expect(ex.capabilities.orderStatus).toBe(true);
      expect(ex.capabilities.positionsReconcile).toBe(true);
      expect(ex.capabilities.serverTimeSync).toBe(true);
      expect(ex.capabilities.unattendedAutonomous).toBe(true);
    }

    // Open Wallets & API modal and verify priority strip, server ping buttons on Web3 & CEX, and unified equity
    await page.goto('/pro/', { waitUntil: 'domcontentloaded' });
    await page.locator('button:has-text("WALLETS")').first().click();
    await expect(page.getByTestId('wallet-modal-panel')).toBeVisible();
    await expect(page.getByTestId('exchange-parity-strip')).toBeVisible();
    await expect(page.getByTestId('exchange-health-HYPERLIQUID')).toBeVisible();
    await expect(page.getByTestId('exchange-health-BINANCE')).toBeVisible();
    await expect(page.getByTestId('exchange-health-BYBIT')).toBeVisible();
    await expect(page.getByTestId('exchange-health-OKX')).toBeVisible();
    // Hyperliquid is expanded by default and now has the same server-ping button as CEX cards
    await expect(page.getByTestId('wallet-ping-hyperliquid_agent')).toBeVisible();
    await expect(page.getByTestId('wallet-modal-unified-equity')).toBeVisible();
  });
});
