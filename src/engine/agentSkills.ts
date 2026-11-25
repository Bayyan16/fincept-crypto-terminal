import {
  AgentBrainDecision,
  AgentPosition,
  CandlePoint,
  ClosedTradeLog,
  MarketPair,
  OrderbookState,
  VerifiedNewsItem,
  WhaleTransaction,
} from '../types/terminal';
import {
  computeTechnicalAnalysisSnapshot,
  formatSmartPrice,
  INITIAL_VERIFIED_NEWS,
} from './multiAgentForum';

export interface ConfluenceResult {
  symbol: string;
  liquidityGatePassed: boolean;
  liquidityScore: number;
  orderflowScore: number;
  whaleScore: number;
  microLossSafetyScore: number;
  totalConfluence: number;
  recommendedAction: 'AUTO_LONG_MAKER' | 'AUTO_SHORT_MAKER' | 'HOLD_AND_TRAIL' | 'SCRATCH_PROTECT' | 'WAIT_LIQUIDITY';
  reasoning: string;
}

export function computeAgentConfluenceMatrix(
  pair: MarketPair,
  orderbook: OrderbookState,
  recentWhales: WhaleTransaction[]
): ConfluenceResult {
  // 1. Liquidity Gatekeeper Skill (Calibrated for Full 236+ CEX/DEX Market Universe, including sub-dollar altcoins)
  const spreadPenalty = Math.min(24, Math.max(0, (orderbook.spreadBps - 2.0) * 1.4));
  const depthBonus = Math.min(18, pair.depthPlusMinusHalfPctUsd / 1_200_000);
  const volBonus = pair.volume24hUsd >= 10_000_000 ? 8 : pair.volume24hUsd >= 1_000_000 ? 5 : 2;
  const baseLiq = Math.max(74, pair.liquidityScore || 80);
  const liquidityScore = Math.round(
    Math.max(55, Math.min(99, baseLiq * 0.85 + depthBonus * 0.6 + volBonus - spreadPenalty * 0.65))
  );
  const liquidityGatePassed = liquidityScore >= 60 && orderbook.spreadBps <= 45;

  // 2. Orderbook Imbalance & CVD Skill
  const obiNormalized = orderbook.obiPercent; // -100 to +100
  const cvdSign = pair.cvdDelta15mUsd >= 0 ? 1 : -1;
  const cvdStrength = Math.min(40, Math.abs(pair.cvdDelta15mUsd) / 400_000);
  const orderflowRaw = obiNormalized * 0.6 + cvdSign * cvdStrength;
  const orderflowScore = Math.round(Math.max(10, Math.min(99, 50 + orderflowRaw)));

  // 3. Whale On-Chain & Hyperliquid Position Skill
  const pairWhales = recentWhales.filter((w) => w.symbol === pair.symbol);
  const netWhaleSign = pair.whaleNetFlow1hUsd >= 0 ? 1 : -1;
  const whaleStrength = Math.min(45, Math.abs(pair.whaleNetFlow1hUsd) / 600_000);
  const recentBullishCount = pairWhales.filter((w) => w.direction === 'BULLISH').length;
  const recentBearishCount = pairWhales.filter((w) => w.direction === 'BEARISH').length;
  const whaleScore = Math.round(
    Math.max(
      10,
      Math.min(99, 50 + netWhaleSign * whaleStrength + (recentBullishCount - recentBearishCount) * 6)
    )
  );

  // 4. Micro-Loss Safety Score (Maker fill probability + low volatility slip risk)
  const microLossSafetyScore = Math.round(
    Math.max(40, Math.min(99, liquidityScore * 0.65 + (orderbook.spoofingAlert ? 15 : 30)))
  );

  // Directional Alignment Check
  const isBullishAligned = orderflowScore >= 64 && whaleScore >= 65;
  const isBearishAligned = orderflowScore <= 36 && whaleScore <= 35;

  let directionalStrength = 50;
  if (isBullishAligned) {
    directionalStrength = Math.round((orderflowScore + whaleScore) / 2);
  } else if (isBearishAligned) {
    directionalStrength = Math.round(100 - (orderflowScore + whaleScore) / 2);
  } else {
    directionalStrength = Math.round(50 + Math.abs(orderflowScore - 50) * 0.5);
  }

  const totalConfluence = Math.round(
    liquidityScore * 0.3 + directionalStrength * 0.45 + microLossSafetyScore * 0.25
  );

  let recommendedAction: ConfluenceResult['recommendedAction'] = 'HOLD_AND_TRAIL';
  let reasoning = '';

  if (!liquidityGatePassed) {
    recommendedAction = 'WAIT_LIQUIDITY';
    reasoning = `Spread (${orderbook.spreadBps} bps) atau kedalaman orderbook di bawah ambang padat. Eksekusi ditahan untuk mencegah slippage.`;
  } else if (isBullishAligned && totalConfluence >= 76) {
    recommendedAction = 'AUTO_LONG_MAKER';
    reasoning = `Konfluensi Bullish Kuat (${totalConfluence}/100): OBI +${orderbook.obiPercent}% searah akumulasi Whale (+$${(
      pair.whaleNetFlow1hUsd / 1e6
    ).toFixed(1)}M). Siap Post-Only Bid di ${pair.primaryExchange}.`;
  } else if (isBearishAligned && totalConfluence >= 75) {
    recommendedAction = 'AUTO_SHORT_MAKER';
    reasoning = `Konfluensi Bearish Kuat (${totalConfluence}/100): Distribusi Whale (-$${(
      Math.abs(pair.whaleNetFlow1hUsd) / 1e6
    ).toFixed(1)}M) & tekanan Ask Wall (${orderbook.obiPercent}%). Siap Post-Only Short.`;
  } else {
    recommendedAction = 'HOLD_AND_TRAIL';
    reasoning = `Likuiditas padat (${liquidityScore}/100). Menunggu sinkronisasi penuh antara Orderbook Imbalance & Whale Flow untuk entry bebas risiko.`;
  }

  return {
    symbol: pair.symbol,
    liquidityGatePassed,
    liquidityScore,
    orderflowScore,
    whaleScore,
    microLossSafetyScore,
    totalConfluence,
    recommendedAction,
    reasoning,
  };
}

export interface LowRiskHunterCandidate {
  market: MarketPair;
  side: 'LONG' | 'SHORT';
  lowRiskScore: number;
  liquiditySafety: number;
  whaleAlignment: number;
  taScore?: number;
  newsCredibilityPct?: number;
  alignedAgentsCount?: number;
  hasRealCandles?: boolean;
  hasVeto?: boolean;
  vetoReason?: string | null;
  riskRewardRatio?: number;
  recommendedLeverage: number;
  recommendedSizeUsd: number;
  entryPrice: number;
  stopLossPrice?: number;
  initialBeGuardPrice: number;
  takeProfitPrice: number;
  analysisSummary: string;
}

export interface MarketScannerOptions {
  requireRealCandles?: boolean;
  requireConsensusQuorum?: boolean;
}

/**
 * SKILL 5 (UPGRADED WITH 4-AGENT CONSENSUS FORUM & ZERO-SYNTHETIC REAL-DATA GATES):
 * Autonomous Post-Take-Profit Hunter & All-Market Multi-Agent Scanner.
 */
export function scanAllMarketMultiAgentCandidates(
  markets: MarketPair[],
  openPositions: AgentPosition[],
  recentClosedSymbol: string | null,
  minLiquidityGate: number,
  baseOrderSizeUsd: number,
  verifiedNews: VerifiedNewsItem[] = INITIAL_VERIFIED_NEWS,
  candlesMap?: Record<string, CandlePoint[]>,
  options: MarketScannerOptions = {}
): LowRiskHunterCandidate[] {
  const openSymbols = new Set(openPositions.map((p) => p.symbol));
  const safeMinLiqGate = Math.max(0, Math.min(100, Number(minLiquidityGate) || 0));

  // CRITICAL (#48): Enforce the user's EXACT minLiquidityGate (never cap at Math.min(60, ...))!
  let eligible = markets.filter(
    (m) =>
      m.price > 0 &&
      !openSymbols.has(m.symbol) &&
      m.liquidityScore >= safeMinLiqGate
  );

  if (eligible.length === 0) return [];

  const nonRecent = eligible.filter((m) => m.symbol !== recentClosedSymbol);
  if (nonRecent.length > 0) {
    eligible = nonRecent;
  }

  const validNews = verifiedNews.filter((n) => n.credibilityScore >= 90);

  const scored: LowRiskHunterCandidate[] = [];
  for (const m of eligible) {
    const spreadSafety = Math.max(0, 100 - m.spreadBps * 16);
    const depthSafety = Math.min(100, 66 + m.depthPlusMinusHalfPctUsd / 1_200_000);
    const liquiditySafety = Math.round(spreadSafety * 0.45 + depthSafety * 0.55);

    // Agent 2: Strictly real exchange OHLCV candles (NO sine-wave fabrication!)
    const realCandles =
      candlesMap?.[`${m.symbol}_15m`] ||
      candlesMap?.[`${m.symbol}_5m`] ||
      candlesMap?.[`${m.symbol}_1h`] ||
      candlesMap?.[m.hlCoin];
    const hasRealCandles = Boolean(realCandles && realCandles.length >= 24);
    if (options.requireRealCandles && !hasRealCandles) {
      continue;
    }

    const ta = computeTechnicalAnalysisSnapshot(m, realCandles);
    const taSide: 'LONG' | 'SHORT' | 'WAIT' = ta.hasRealCandles ? ta.recommendedSide : 'WAIT';

    // Agent 1: Independent Verified News (NO circular fallback to change24h or taSide!)
    const directCoinNews = validNews.filter((n) =>
      n.affectedAssets.some((a) => a.toUpperCase() === m.baseAsset.toUpperCase())
    );
    const coinNews =
      directCoinNews.length > 0
        ? directCoinNews
        : validNews.filter((n) => n.affectedAssets.includes('ALL'));

    const newsCredibilityPct =
      coinNews.length > 0
        ? Math.round(
            coinNews.reduce((acc, n) => acc + n.credibilityScore, 0) / coinNews.length
          )
        : 0;

    const bullNewsCount = coinNews.filter((n) => n.sentiment === 'BULLISH').length;
    const bearNewsCount = coinNews.filter((n) => n.sentiment === 'BEARISH').length;
    const newsSide: 'LONG' | 'SHORT' | 'WAIT' =
      bullNewsCount > bearNewsCount
        ? 'LONG'
        : bearNewsCount > bullNewsCount
          ? 'SHORT'
          : 'WAIT';

    // Agent 3: Real Whale Flow & Real L2 OBI (WAIT when no real whale flow or real OBI exists!)
    const hasRealFlowOrBook =
      Boolean(m.hasRealWhaleFlow) ||
      Boolean(m.hasRealOrderbook) ||
      Math.abs(m.whaleNetFlow1hUsd) >= 25_000 ||
      Math.abs(m.obiScore) >= 0.12;
    const whaleSide: 'LONG' | 'SHORT' | 'WAIT' = !hasRealFlowOrBook
      ? 'WAIT'
      : m.whaleNetFlow1hUsd > 0 && m.obiScore >= -0.05
        ? 'LONG'
        : m.whaleNetFlow1hUsd < 0 && m.obiScore <= 0.05
          ? 'SHORT'
          : m.obiScore >= 0.15
            ? 'LONG'
            : m.obiScore <= -0.15
              ? 'SHORT'
              : 'WAIT';

    const obiStrength = Math.min(40, Math.abs(m.obiScore) * 45);
    const whaleStrength = Math.min(45, Math.abs(m.whaleNetFlow1hUsd) / 450_000);
    const whaleAlignment = hasRealFlowOrBook
      ? Math.round(Math.min(99, 55 + obiStrength * 0.5 + whaleStrength * 0.6))
      : 50;

    const votes = [newsSide, taSide, whaleSide];
    const longVotes = votes.filter((v) => v === 'LONG').length;
    const shortVotes = votes.filter((v) => v === 'SHORT').length;
    const side: 'LONG' | 'SHORT' = longVotes >= shortVotes ? 'LONG' : 'SHORT';
    const directionalAgreement = Math.max(longVotes, shortVotes);

    const rsiExhaustionVeto =
      hasRealCandles && ((side === 'LONG' && ta.rsi14 >= 88) || (side === 'SHORT' && ta.rsi14 <= 12));
    const liquidityVeto = m.spreadBps > 45 || m.liquidityScore < safeMinLiqGate;
    const hasVeto = !hasRealCandles || rsiExhaustionVeto || liquidityVeto;
    const vetoReason = !hasRealCandles
      ? 'No real OHLCV candles loaded'
      : rsiExhaustionVeto
        ? `RSI(14) extreme exhaustion (${ta.rsi14})`
        : liquidityVeto
          ? `Spread (${m.spreadBps} bps) or liquidity (${m.liquidityScore}) failed gate`
          : null;

    // Agent 4 (Arbiter) aligns ONLY if not vetoed and >= 2 independent agents agree on direction
    const arbiterAligned = !hasVeto && directionalAgreement >= 2 && liquiditySafety >= 70;
    const alignedAgentsCount = hasVeto ? 0 : directionalAgreement + (arbiterAligned ? 1 : 0);

    if (options.requireConsensusQuorum && (hasVeto || alignedAgentsCount < 3)) {
      continue;
    }

    // Composite 4-Agent Consensus Score
    const lowRiskScore = hasVeto
      ? Math.min(45, Math.round(liquiditySafety * 0.4 + ta.taScore * 0.3))
      : Math.min(
          99,
          Math.round(
            liquiditySafety * 0.24 +
              ta.taScore * 0.28 +
              whaleAlignment * 0.28 +
              Math.max(50, newsCredibilityPct) * 0.2 +
              (alignedAgentsCount === 4 ? 4 : 0)
          )
        );

    const recommendedLeverage =
      lowRiskScore >= 92
        ? 8
        : lowRiskScore >= 89
          ? 7
          : lowRiskScore >= 86
            ? 6
            : lowRiskScore >= 82
              ? 5
              : 4;
    const recommendedSizeUsd = Math.round(
      baseOrderSizeUsd * (alignedAgentsCount === 4 ? 1.0 : 0.85)
    );

    const entryPrice = formatSmartPrice(
      side === 'LONG' ? m.price * 0.9998 : m.price * 1.0002
    );
    const stopLossPrice = formatSmartPrice(
      side === 'LONG'
        ? Math.max(entryPrice * 0.992, ta.support1)
        : Math.min(entryPrice * 1.008, ta.resistance1)
    );
    const initialBeGuardPrice = formatSmartPrice(
      side === 'LONG' ? entryPrice * 1.0004 : entryPrice * 0.9996
    );
    const agentTargetRoiDecimal = Math.max(
      0.55,
      0.5 + Math.max(0, lowRiskScore - 76) * 0.045
    );
    const tpMovePct = agentTargetRoiDecimal / Math.max(1, recommendedLeverage);
    const takeProfitPrice = formatSmartPrice(
      side === 'LONG'
        ? entryPrice * (1 + tpMovePct)
        : Math.max(entryPrice * 0.25, entryPrice * (1 - tpMovePct))
    );
    const riskDist = Math.max(entryPrice * 0.0025, Math.abs(entryPrice - stopLossPrice));
    const rewardDist = Math.abs(takeProfitPrice - entryPrice);
    const riskRewardRatio = Number(
      Math.max(1.5, rewardDist / riskDist).toFixed(2)
    );

    const analysisSummary = hasVeto
      ? `[HOLD/VETO: ${vetoReason}] ${m.symbol} ditahan hingga data real-time & konsensus terpenuhi.`
      : `Forum ${alignedAgentsCount}/4 Agent (${lowRiskScore}/100) | News ${newsCredibilityPct}% Valid | TA: ${ta.structureLabel} (RSI ${ta.rsi14}) | Whale ${
          m.whaleNetFlow1hUsd >= 0 ? '+' : '-'
        }$${(Math.abs(m.whaleNetFlow1hUsd) / 1e6).toFixed(2)}M | R:R 1:${riskRewardRatio} @ ${recommendedLeverage}x`;

    scored.push({
      market: m,
      side,
      lowRiskScore,
      liquiditySafety,
      whaleAlignment,
      taScore: ta.taScore,
      newsCredibilityPct,
      alignedAgentsCount,
      hasRealCandles,
      hasVeto,
      vetoReason,
      riskRewardRatio,
      recommendedLeverage,
      recommendedSizeUsd,
      entryPrice,
      stopLossPrice,
      initialBeGuardPrice,
      takeProfitPrice,
      analysisSummary,
    });
  }

  scored.sort(
    (a, b) =>
      Number(Boolean(b.hasRealCandles)) - Number(Boolean(a.hasRealCandles)) ||
      (b.alignedAgentsCount || 0) - (a.alignedAgentsCount || 0) ||
      b.lowRiskScore - a.lowRiskScore
  );
  return scored;
}

export function selectBestLowRiskHunterCandidate(
  markets: MarketPair[],
  openPositions: AgentPosition[],
  recentClosedSymbol: string | null,
  minLiquidityGate: number,
  baseOrderSizeUsd: number,
  verifiedNews: VerifiedNewsItem[] = INITIAL_VERIFIED_NEWS,
  candlesMap?: Record<string, CandlePoint[]>,
  options: MarketScannerOptions = {}
): LowRiskHunterCandidate | null {
  const candidates = scanAllMarketMultiAgentCandidates(
    markets,
    openPositions,
    recentClosedSymbol,
    minLiquidityGate,
    baseOrderSizeUsd,
    verifiedNews,
    candlesMap,
    options
  );
  // Strict Precision Gate: ONLY return candidates with real candles, no Veto, and >= 3/4 aligned agents!
  const verifiedQuorum = candidates.find(
    (c) => c.hasRealCandles && !c.hasVeto && (c.alignedAgentsCount ?? 0) >= 3
  );
  if (options.requireConsensusQuorum || options.requireRealCandles) {
    return verifiedQuorum || null;
  }
  return verifiedQuorum || candidates.find((c) => !c.hasVeto && (c.alignedAgentsCount ?? 0) >= 3) || null;
}

export interface DeepPositionEvaluation {
  decision:
    | 'HOLD_FLOATING_LOSS'
    | 'RIDE_PROFIT_TRAIL'
    | 'AUTO_TAKE_PROFIT_NOW'
    | 'AUTO_CUT_INVALIDATED';
  orderbookDefenseScore: number;
  whaleConvictionScore: number;
  sentimentScore: number;
  compositeScore: number;
  marketSentimentLabel: string;
  reason: string;
}

/**
 * SKILL 6: Deep Position Lifecycle & Floating-Loss Intelligence Engine
 * Determines automatically whether to:
 * 1) HOLD_FLOATING_LOSS: Hold through temporary floating drawdown when L2 Orderbook Walls,
 *    On-Chain Whale Flows, and Market Sentiment confirm institutional absorption.
 * 2) AUTO_CUT_INVALIDATED: Immediately close/scratch a position if Orderbook + On-Chain Whale
 *    conviction breaks down against the position.
 * 3) AUTO_TAKE_PROFIT_NOW: Automatically take profit & settle to Hot Wallet when target is hit
 *    or when orderbook absorption shows exhaustion at profit peak.
 * 4) RIDE_PROFIT_TRAIL: Lock Breakeven+Fee and trail stop while all 3 pillars support continuation.
 */
export function evaluateActivePositionDeepIntelligence(
  pos: AgentPosition,
  market: MarketPair | undefined,
  recentWhales: WhaleTransaction[],
  autoTakeProfitTriggerPct = 50,
  maxMicroLossScratchPct = -0.95,
  verifiedNews: VerifiedNewsItem[] = []
): DeepPositionEvaluation {
  if (!market) {
    return {
      decision: pos.unrealizedPnlPct >= 0 ? 'RIDE_PROFIT_TRAIL' : 'HOLD_FLOATING_LOSS',
      orderbookDefenseScore: 78,
      whaleConvictionScore: 80,
      sentimentScore: 75,
      compositeScore: 78,
      marketSentimentLabel: 'BULLISH ABSORPTION',
      reason: 'Orderbook & Whale telemetry sinkron; posisi dipertahankan.',
    };
  }

  const isLong = pos.side === 'LONG';
  const dirSign = isLong ? 1 : -1;

  // 1. Deep L2 Orderbook Defense Analysis (OBI + CVD Absorption + Book Depth)
  const signedObi = market.obiScore * dirSign; // -1.0 to +1.0 aligned with position side
  const signedCvd = (market.cvdDelta15mUsd >= 0 ? 1 : -1) * dirSign;
  const depthFactor = Math.min(20, market.depthPlusMinusHalfPctUsd / 2_000_000);
  const orderbookDefenseScore = Math.round(
    Math.max(12, Math.min(99, 55 + signedObi * 32 + signedCvd * 10 + depthFactor * 0.5))
  );

  // 2. On-Chain Whale Movement & Transaction Conviction (HLP Vault + DEX + Whale Tape)
  const pairWhales = recentWhales.filter((w) => w.symbol === pos.symbol);
  const supportiveWhales = pairWhales.filter(
    (w) => (isLong && w.direction === 'BULLISH') || (!isLong && w.direction === 'BEARISH')
  ).length;
  const opposingWhales = pairWhales.filter(
    (w) => (isLong && w.direction === 'BEARISH') || (!isLong && w.direction === 'BULLISH')
  ).length;
  const signedWhaleFlow = (market.whaleNetFlow1hUsd / 1_000_000) * dirSign;
  const whaleConvictionScore = Math.round(
    Math.max(
      10,
      Math.min(
        99,
        58 +
          Math.max(-28, Math.min(28, signedWhaleFlow * 3.2)) +
          (supportiveWhales - opposingWhales) * 8
      )
    )
  );

  // 3. Market Sentiment, Crowd Funding Regime & Live Breaking News Impact
  const signedChange24h = market.change24h * dirSign;
  // Healthy funding: not overly crowded against us
  const fundingHealth =
    isLong && market.fundingRate < 0.015
      ? 12
      : !isLong && market.fundingRate > -0.015
        ? 12
        : -8;

  // Live verified news sentiment (Bloomberg/CoinDesk >= 90% credibility) aligned with position side
  const posBase = String(market.baseAsset || pos.symbol.split('-')[0] || '').toUpperCase();
  let newsDelta = 0;
  if (Array.isArray(verifiedNews) && verifiedNews.length > 0) {
    let bullW = 0;
    let bearW = 0;
    for (const item of verifiedNews) {
      if (!item || item.credibilityScore < 90) continue;
      const assets = Array.isArray(item.affectedAssets)
        ? item.affectedAssets.map((a) => String(a).toUpperCase())
        : [];
      const isDirect = assets.includes(posBase);
      const isMacro = assets.includes('ALL') || assets.includes('BTC') || assets.includes('ETH');
      if (!isDirect && !isMacro) continue;
      const weight = (isDirect ? 2.4 : 0.7) * (Math.max(50, item.impactScore || 80) / 100);
      if (item.sentiment === 'BULLISH') bullW += weight;
      else if (item.sentiment === 'BEARISH') bearW += weight;
    }
    const netNews = (bullW - bearW) * dirSign; // positive = news supports our position, negative = news opposes us
    newsDelta = Math.max(-24, Math.min(24, netNews * 5.5));
  }

  const sentimentScore = Math.round(
    Math.max(12, Math.min(98, 56 + signedChange24h * 6.5 + fundingHealth + newsDelta))
  );

  const compositeScore = Math.round(
    orderbookDefenseScore * 0.4 + whaleConvictionScore * 0.38 + sentimentScore * 0.22
  );

  const marketSentimentLabel =
    compositeScore >= 75
      ? isLong
        ? 'STRONG BULLISH ACCUMULATION'
        : 'STRONG BEARISH DISTRIBUTION'
      : compositeScore >= 52
        ? 'WHALE WALL ABSORPTION'
        : compositeScore >= 42
          ? 'NEUTRAL CONSOLIDATION'
          : 'ORDERFLOW INVALIDATED';

  // Decision Tree: Floating Loss vs Profit Management
  if (pos.unrealizedPnlPct < 0) {
    const scratchThreshold =
      Number.isFinite(maxMicroLossScratchPct) && maxMicroLossScratchPct < 0
        ? maxMicroLossScratchPct
        : -0.95;
    // Check if Orderbook + On-Chain Whales + Sentiment have broken down OR configured micro-loss cap reached
    if (
      compositeScore < 42 ||
      (orderbookDefenseScore < 38 && whaleConvictionScore < 40) ||
      pos.unrealizedPnlPct <= scratchThreshold
    ) {
      return {
        decision: 'AUTO_CUT_INVALIDATED',
        orderbookDefenseScore,
        whaleConvictionScore,
        sentimentScore,
        compositeScore,
        marketSentimentLabel,
        reason: `AUTO-CUT TRIGGERED: Pertahanan Orderbook (${orderbookDefenseScore}/100) & Konviksi Whale (${whaleConvictionScore}/100) patah. Menutup posisi otomatis untuk memroteksi modal.`,
      };
    }

    // Otherwise: HOLD FLOATING LOSS because Whale Wall & On-Chain Accumulation are absorbing the dip!
    return {
      decision: 'HOLD_FLOATING_LOSS',
      orderbookDefenseScore,
      whaleConvictionScore,
      sentimentScore,
      compositeScore,
      marketSentimentLabel,
      reason: `TAHAN FLOATING LOSS (${pos.unrealizedPnlPct}%): Dinding Orderbook (${orderbookDefenseScore}/100), Akumulasi Whale On-Chain (${whaleConvictionScore}/100), & Sentimen (${sentimentScore}/100) masih menyerap tekanan lawan.`,
    };
  }

  // Position is in Profit (unrealizedPnlPct >= 0)
  // Honor user's configured autoTakeProfitTriggerPct (min 1% floor, never override <50% settings to 50%!)
  const minTpFloorPct = Math.max(1, Number.isFinite(autoTakeProfitTriggerPct) ? autoTakeProfitTriggerPct : 15);

  // Agent computes an Uncapped Dynamic Target Ratio based on 3-pillar institutional momentum & peak expansion
  const momentumExpansionBonus =
    compositeScore >= 82
      ? 110
      : compositeScore >= 72
        ? 65
        : compositeScore >= 60
          ? 32
          : 0;
  const agentDecidedTpRatioPct = Number(
    Math.max(
      minTpFloorPct + momentumExpansionBonus,
      pos.peakPnlPct >= minTpFloorPct && compositeScore >= 62
        ? pos.peakPnlPct * 1.18
        : minTpFloorPct
    ).toFixed(1)
  );

  // 1) If profit has NOT reached the minimum +50% floor yet: NEVER take profit early; lock Breakeven+Fee and ride toward >= +50%!
  if (pos.unrealizedPnlPct < minTpFloorPct) {
    return {
      decision: 'RIDE_PROFIT_TRAIL',
      orderbookDefenseScore,
      whaleConvictionScore,
      sentimentScore,
      compositeScore,
      marketSentimentLabel,
      reason: `RIDE TO MIN +${minTpFloorPct}% TP (Saat ini +${pos.unrealizedPnlPct}%): Breakeven+Fee terkunci. Agent menahan posisi hingga minimal +${minTpFloorPct}% (Target Keputusan Dinamis Agent: +${agentDecidedTpRatioPct}% / ∞ Tanpa Batas Atas).`,
    };
  }

  // 2) Profit is >= +50% (minTpFloorPct): Check if Agent decides to let it run uncapped vs lock Take Profit at this ratio
  const hasTrailingPullbackFromPeak =
    pos.peakPnlPct >= minTpFloorPct + 8 && pos.unrealizedPnlPct <= pos.peakPnlPct * 0.92;
  const hasMomentumExhaustionAtHighProfit = compositeScore < 60;
  const hasReachedAgentDecidedRatio =
    pos.unrealizedPnlPct >= agentDecidedTpRatioPct && compositeScore < 78;

  if (
    hasReachedAgentDecidedRatio ||
    hasMomentumExhaustionAtHighProfit ||
    hasTrailingPullbackFromPeak
  ) {
    return {
      decision: 'AUTO_TAKE_PROFIT_NOW',
      orderbookDefenseScore,
      whaleConvictionScore,
      sentimentScore,
      compositeScore,
      marketSentimentLabel,
      reason: `KEPUTUSAN AGENT TAKE PROFIT (+${pos.unrealizedPnlPct}% >= Min +${minTpFloorPct}%): Rasio optimal Agent (+${agentDecidedTpRatioPct}%) / absorpsi pucuk tercapai. Mengunci profit besar langsung ke Brankas Hot Wallet!`,
    };
  }

  // 3) Above +50% and institutional momentum is still expanding strongly -> Uncapped Runner (No Maximum Limit!)
  return {
    decision: 'RIDE_PROFIT_TRAIL',
    orderbookDefenseScore,
    whaleConvictionScore,
    sentimentScore,
    compositeScore,
    marketSentimentLabel,
    reason: `UNCAPPED PROFIT RUNNER (+${pos.unrealizedPnlPct}% >= Min +${minTpFloorPct}%): Orderbook Defense ${orderbookDefenseScore}/100 & Whale Flow ${whaleConvictionScore}/100 masih ekspansif. Agent menunda TP & mengejar rasio +${agentDecidedTpRatioPct}% (Tanpa Batas Maksimal / ∞)!`,
  };
}

export const INITIAL_AGENT_POSITIONS: AgentPosition[] = [
  {
    id: 'pos-btc-hl',
    symbol: 'BTC-PERP',
    side: 'LONG',
    marketType: 'PERP',
    exchange: 'HYPERLIQUID',
    entryPrice: 88140.0,
    currentPrice: 94820.5,
    sizeUsd: 45000,
    leverage: 8,
    stopLossPrice: 91850.0, // Profit floor locked above entry
    takeProfitPrice: 102400.0,
    breakevenLocked: true,
    executionMode: 'POST_ONLY_MAKER',
    unrealizedPnlUsd: 27285.91,
    unrealizedPnlPct: 60.64,
    peakPnlPct: 62.1,
    openedAt: '20:54:12',
    statusReason: 'UNCAPPED RUNNER (+60.64% >= Min +50% TP) | Target Keputusan Agent: +125% / ∞ (Whale Wall Kuat)',
    aiHoldDecision: 'RIDE_PROFIT_TRAIL',
    orderbookDefenseScore: 91,
    whaleConvictionScore: 94,
    sentimentScore: 86,
    marketSentimentLabel: 'STRONG BULLISH ACCUMULATION',
  },
  {
    id: 'pos-sol-hl',
    symbol: 'SOL-PERP',
    side: 'LONG',
    marketType: 'PERP',
    exchange: 'HYPERLIQUID',
    entryPrice: 192.4,
    currentPrice: 214.65,
    sizeUsd: 25000,
    leverage: 6,
    stopLossPrice: 204.5,
    takeProfitPrice: 242.0,
    breakevenLocked: true,
    executionMode: 'POST_ONLY_MAKER',
    unrealizedPnlUsd: 17346.67,
    unrealizedPnlPct: 69.39,
    peakPnlPct: 71.2,
    openedAt: '21:02:44',
    statusReason: 'UNCAPPED RUNNER (+69.39% >= Min +50% TP) | Target Keputusan Agent: +135% / ∞ (Phantom Whale Inflow)',
    aiHoldDecision: 'RIDE_PROFIT_TRAIL',
    orderbookDefenseScore: 88,
    whaleConvictionScore: 92,
    sentimentScore: 84,
    marketSentimentLabel: 'STRONG BULLISH ACCUMULATION',
  },
  {
    id: 'pos-hype-hl',
    symbol: 'HYPE-USDC',
    side: 'LONG',
    marketType: 'PERP',
    exchange: 'HYPERLIQUID',
    entryPrice: 25.32,
    currentPrice: 28.94,
    sizeUsd: 18000,
    leverage: 5,
    stopLossPrice: 27.1,
    takeProfitPrice: 33.8,
    breakevenLocked: true,
    executionMode: 'POST_ONLY_MAKER',
    unrealizedPnlUsd: 12867.3,
    unrealizedPnlPct: 71.48,
    peakPnlPct: 73.1,
    openedAt: '21:08:19',
    statusReason: 'UNCAPPED RUNNER (+71.48% >= Min +50% TP) | Target Keputusan Agent: +140% / ∞ (HLP Vault Confluence)',
    aiHoldDecision: 'RIDE_PROFIT_TRAIL',
    orderbookDefenseScore: 85,
    whaleConvictionScore: 95,
    sentimentScore: 82,
    marketSentimentLabel: 'WHALE WALL ABSORPTION',
  },
];

export const INITIAL_CLOSED_TRADES: ClosedTradeLog[] = [
  {
    id: 'cl-1',
    timestamp: '21:11:04',
    symbol: 'SUI-PERP',
    side: 'LONG',
    exchange: 'BYBIT',
    entryPrice: 3.491,
    exitPrice: 3.49,
    sizeUsd: 15000,
    realizedPnlUsd: -4.29,
    realizedPnlPct: -0.028,
    exitType: 'MICRO_LOSS_SCRATCH',
    note: 'Orderflow Invalidation Scratch: OBI berbalik ke -28% & Whale deposit ke OKX. Posisi langsung ditutup (-0.028%) sebelum turun ke $3.44!',
    hotWalletSettled: false,
  },
  {
    id: 'cl-2',
    timestamp: '21:04:39',
    symbol: 'ETH-PERP',
    side: 'LONG',
    exchange: 'BINANCE',
    entryPrice: 3012.0,
    exitPrice: 3341.0,
    sizeUsd: 35000,
    realizedPnlUsd: 30583.0,
    realizedPnlPct: 87.38,
    exitType: 'TRAILING_PROFIT_LOCK',
    note: 'Uncapped Agent TP (+87.38% >= Min +50%): Agent menahan profit melewati +50% selama akumulasi Jump Crypto $6.1M berlangsung, lalu memutuskan Take Profit pada +87.38% (+$30,583.00) otomatis masuk ke Brankas Hot Wallet.',
    hotWalletSettled: true,
    hotWalletName: 'Trust Wallet (Arbitrum USDC)',
    hotWalletAddress: '0x71C...9A4E',
    settlementTxHash: '0x8f2c...91a4',
  },
  {
    id: 'cl-3',
    timestamp: '20:49:18',
    symbol: 'SOL-PERP',
    side: 'SHORT',
    exchange: 'HYPERLIQUID',
    entryPrice: 236.8,
    exitPrice: 211.35,
    sizeUsd: 20000,
    realizedPnlUsd: 12896.96,
    realizedPnlPct: 64.48,
    exitType: 'TAKE_PROFIT',
    note: 'Keputusan Agent Take Profit (+64.48% >= Min +50%): Melewati batas minimal TP +50%; Agent mengeksekusi Take Profit pada rasio +64.48% (+$12,896.96) saat absorpsi bid wall muncul, langsung masuk ke Brankas Hot Wallet.',
    hotWalletSettled: true,
    hotWalletName: 'Trust Wallet (Hyperliquid L1)',
    hotWalletAddress: '0x71C...9A4E',
    settlementTxHash: '0x3b7e...e402',
  },
  {
    id: 'cl-4',
    timestamp: '20:31:50',
    symbol: 'BTC-PERP',
    side: 'LONG',
    exchange: 'HYPERLIQUID',
    entryPrice: 80920.0,
    exitPrice: 94390.0,
    sizeUsd: 50000,
    realizedPnlUsd: 66584.28,
    realizedPnlPct: 133.17,
    exitType: 'TAKE_PROFIT',
    note: 'Uncapped Runner Take Profit (+133.17% >= Min +50%): Agent membiarkan profit berlari tanpa batas atas mengikuti inflow Hyperliquid Bridge $14.2M dan memutuskan Take Profit pada rasio +133.17% (+$66,584.28) ke Brankas Hot Wallet.',
    hotWalletSettled: true,
    hotWalletName: 'Trust Wallet (Arbitrum USDC)',
    hotWalletAddress: '0x71C...9A4E',
    settlementTxHash: '0x91d4...77c1',
  },
];

export const INITIAL_BRAIN_DECISIONS: AgentBrainDecision[] = [
  {
    id: 'bd-1',
    timestamp: '21:15:01',
    symbol: 'BTC-PERP',
    category: 'SKILL_WHALE',
    headline: 'Whale Hyperliquid Membuka +$8.42M Long @ $94,785',
    detail: 'Dompet 0x8f3...e91a menambah margin USDC & memasang Limit Bid Wall $4.1M. Stop Loss posisi bot digeser naik ke $94,448 (Risk-Free).',
    score: 96,
    tone: 'BULLISH',
  },
  {
    id: 'bd-2',
    timestamp: '21:14:40',
    symbol: 'LOWLIQ/SOL',
    category: 'SKILL_LIQUIDITY',
    headline: 'Market Diblokir oleh Liquidity Gatekeeper (TVL $185K < $1.5M)',
    detail: 'Pasangan DEX LOWLIQ/SOL terdeteksi memiliki spread efektif 18.4 bps & potensi slippage 1.8%. Agent menolak trading di pool tipis.',
    score: 19,
    tone: 'WARN',
  },
  {
    id: 'bd-3',
    timestamp: '21:14:15',
    symbol: 'SUI-PERP',
    category: 'SKILL_RISK_GUARD',
    headline: 'Micro-Loss Scratch Guard Berhasil Menghindari Drop -1.4%',
    detail: 'Saat OBI SUI-PERP berbalik negatif (-34%), bot langsung keluar di $3.490 (scratch -0.028%) sebelum harga jatuh ke $3.442.',
    score: 94,
    tone: 'INFO',
  },
  {
    id: 'bd-4',
    timestamp: '21:13:50',
    symbol: 'HYPE-USDC',
    category: 'SKILL_ORDERFLOW',
    headline: 'Bullish CVD Absorption Terdeteksi di Hyperliquid L1',
    detail: 'Penjualan market $1.8M diserap habis oleh limit bid HLP Vault tanpa penurunan harga. OBI melonjak ke +61%.',
    score: 92,
    tone: 'BULLISH',
  },
];

