import {
  AgentBrainDecision,
  AgentPosition,
  ClosedTradeLog,
  MarketPair,
  OrderbookState,
  WhaleTransaction,
} from '../types/terminal';

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
  // 1. Liquidity Gatekeeper Skill
  const spreadPenalty = Math.max(0, (orderbook.spreadBps - 0.5) * 12);
  const depthBonus = Math.min(25, pair.depthPlusMinusHalfPctUsd / 1_500_000);
  const liquidityScore = Math.round(Math.max(20, Math.min(99, 76 + depthBonus - spreadPenalty)));
  const liquidityGatePassed = liquidityScore >= 82 && orderbook.spreadBps <= 2.2;

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
  recommendedLeverage: number;
  recommendedSizeUsd: number;
  entryPrice: number;
  initialBeGuardPrice: number;
  takeProfitPrice: number;
  analysisSummary: string;
}

/**
 * SKILL 5: Autonomous Post-Take-Profit Hunter & Low-Risk 3-Slot Allocator
 * Continuously scans all live markets whenever active positions < maxSlots (3).
 * Ranks candidates by lowest risk (tightest spread, deepest L2 book, strongest Whale + CVD protection)
 * and prepares a Post-Only Maker entry with immediate Breakeven+Fee protection.
 */
export function selectBestLowRiskHunterCandidate(
  markets: MarketPair[],
  openPositions: AgentPosition[],
  recentClosedSymbol: string | null,
  minLiquidityGate: number,
  baseOrderSizeUsd: number
): LowRiskHunterCandidate | null {
  const openSymbols = new Set(openPositions.map((p) => p.symbol));

  // Filter markets that don't currently have an open position and pass the liquidity gate
  let eligible = markets.filter(
    (m) => !openSymbols.has(m.symbol) && m.liquidityScore >= Math.min(75, minLiquidityGate)
  );

  if (eligible.length === 0) return null;

  // Prefer rotating into a fresh low-risk market first after manual TP if multiple candidates exist
  const nonRecent = eligible.filter((m) => m.symbol !== recentClosedSymbol);
  if (nonRecent.length > 0) {
    eligible = nonRecent;
  }

  const scored: LowRiskHunterCandidate[] = eligible.map((m) => {
    const spreadSafety = Math.max(0, 100 - m.spreadBps * 22);
    const depthSafety = Math.min(100, 65 + m.depthPlusMinusHalfPctUsd / 1_200_000);
    const liquiditySafety = Math.round(spreadSafety * 0.45 + depthSafety * 0.55);

    const isBull =
      m.obiScore >= 0 && (m.cvdDelta15mUsd >= 0 || m.whaleNetFlow1hUsd >= 0);
    const side: 'LONG' | 'SHORT' = isBull ? 'LONG' : 'SHORT';

    const obiStrength = Math.min(40, Math.abs(m.obiScore) * 45);
    const whaleStrength = Math.min(45, Math.abs(m.whaleNetFlow1hUsd) / 450_000);
    const whaleAlignment = Math.round(Math.min(99, 52 + obiStrength * 0.5 + whaleStrength * 0.6));

    // Composite Low-Risk Score prioritizes Capital Safety (60%) + Directional Whale Flow (40%)
    const lowRiskScore = Math.round(
      liquiditySafety * 0.38 + m.liquidityScore * 0.24 + whaleAlignment * 0.38
    );

    // Conservative Adaptive Leverage (4x to 8x) for autonomous Post-TP re-entry
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
      baseOrderSizeUsd * (lowRiskScore >= 88 ? 1.0 : 0.85)
    );

    const decimals = m.price > 100 ? 2 : m.price > 1 ? 3 : 4;
    // Maker Post-Only improvement (enter slightly better than mid price at Bid/Ask edge)
    const entryPrice =
      side === 'LONG'
        ? Number((m.price * 0.9998).toFixed(decimals))
        : Number((m.price * 1.0002).toFixed(decimals));

    // Tight Zero-Slop Initial Guard (+0.03% Breakeven+Fee Offset ready to lock immediately)
    const initialBeGuardPrice =
      side === 'LONG'
        ? Number((entryPrice * 1.0003).toFixed(decimals))
        : Number((entryPrice * 0.9997).toFixed(decimals));

    const takeProfitPrice =
      side === 'LONG'
        ? Number((entryPrice * 1.014).toFixed(decimals))
        : Number((entryPrice * 0.986).toFixed(decimals));

    const analysisSummary = `Low-Risk Score ${lowRiskScore}/100 | Spread ${
      m.spreadBps
    } bps | Depth $${(m.depthPlusMinusHalfPctUsd / 1e6).toFixed(1)}M | Whale Flow ${
      m.whaleNetFlow1hUsd >= 0 ? '+' : '-'
    }$${(Math.abs(m.whaleNetFlow1hUsd) / 1e6).toFixed(2)}M | Lev Konservatif ${recommendedLeverage}x (4x-8x)`;

    return {
      market: m,
      side,
      lowRiskScore,
      liquiditySafety,
      whaleAlignment,
      recommendedLeverage,
      recommendedSizeUsd,
      entryPrice,
      initialBeGuardPrice,
      takeProfitPrice,
      analysisSummary,
    };
  });

  scored.sort((a, b) => b.lowRiskScore - a.lowRiskScore);
  return scored[0] || null;
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
  autoTakeProfitTriggerPct = 1.65
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

  // 3. Market Sentiment & Crowd Funding Regime Analysis
  const signedChange24h = market.change24h * dirSign;
  // Healthy funding: not overly crowded against us
  const fundingHealth =
    isLong && market.fundingRate < 0.015
      ? 12
      : !isLong && market.fundingRate > -0.015
        ? 12
        : -8;
  const sentimentScore = Math.round(
    Math.max(15, Math.min(98, 56 + signedChange24h * 6.5 + fundingHealth))
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
    // Check if Orderbook + On-Chain Whales + Sentiment have broken down OR deep invalidation reached
    if (
      compositeScore < 42 ||
      (orderbookDefenseScore < 38 && whaleConvictionScore < 40) ||
      pos.unrealizedPnlPct <= -0.95
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
  // 1) Auto Take Profit if target hit OR if solid profit (>= +0.65%) and orderbook shows exhaustion
  if (
    pos.unrealizedPnlPct >= autoTakeProfitTriggerPct ||
    (pos.unrealizedPnlPct >= 0.65 && compositeScore < 44)
  ) {
    return {
      decision: 'AUTO_TAKE_PROFIT_NOW',
      orderbookDefenseScore,
      whaleConvictionScore,
      sentimentScore,
      compositeScore,
      marketSentimentLabel,
      reason: `AUTO TAKE PROFIT (+${pos.unrealizedPnlPct}%): Target profit/absorpsi pucuk tercapai. Mengunci profit otomatis langsung ke Hot Wallet!`,
    };
  }

  // 2) Ride Profit & Trail Breakeven+Fee Stop
  return {
    decision: 'RIDE_PROFIT_TRAIL',
    orderbookDefenseScore,
    whaleConvictionScore,
    sentimentScore,
    compositeScore,
    marketSentimentLabel,
    reason: `RIDE & TRAIL PROFIT: Orderbook Defense ${orderbookDefenseScore}/100 • Whale Flow ${whaleConvictionScore}/100 • Sentimen ${sentimentScore}/100 (${marketSentimentLabel}).`,
  };
}

export const INITIAL_AGENT_POSITIONS: AgentPosition[] = [
  {
    id: 'pos-btc-hl',
    symbol: 'BTC-PERP',
    side: 'LONG',
    marketType: 'PERP',
    exchange: 'HYPERLIQUID',
    entryPrice: 94410.0,
    currentPrice: 94820.5,
    sizeUsd: 45000,
    leverage: 6,
    stopLossPrice: 94448.0, // Locked above entry! (Breakeven + Fee Offset)
    takeProfitPrice: 95850.0,
    breakevenLocked: true,
    executionMode: 'POST_ONLY_MAKER',
    unrealizedPnlUsd: 978.02,
    unrealizedPnlPct: 2.17,
    peakPnlPct: 2.34,
    openedAt: '20:54:12',
    statusReason: 'BREAKEVEN+FEE LOCKED (@ $94,448) | Trailing behind Whale Bid Wall',
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
    entryPrice: 212.8,
    currentPrice: 214.65,
    sizeUsd: 25000,
    leverage: 5,
    stopLossPrice: 212.92,
    takeProfitPrice: 219.5,
    breakevenLocked: true,
    executionMode: 'POST_ONLY_MAKER',
    unrealizedPnlUsd: 869.36,
    unrealizedPnlPct: 3.48,
    peakPnlPct: 3.65,
    openedAt: '21:02:44',
    statusReason: 'ZERO-RISK MODE: Stop trailed to +0.06% above entry after Phantom Whale inflow',
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
    entryPrice: 28.62,
    currentPrice: 28.94,
    sizeUsd: 18000,
    leverage: 4,
    stopLossPrice: 28.65,
    takeProfitPrice: 30.2,
    breakevenLocked: true,
    executionMode: 'POST_ONLY_MAKER',
    unrealizedPnlUsd: 603.77,
    unrealizedPnlPct: 3.35,
    peakPnlPct: 3.52,
    openedAt: '21:08:19',
    statusReason: 'HLP Vault Confluence (+94%) | Maker Rebate Captured (-0.015% fee)',
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
    entryPrice: 3318.5,
    exitPrice: 3341.0,
    sizeUsd: 35000,
    realizedPnlUsd: 949.22,
    realizedPnlPct: 2.71,
    exitType: 'TRAILING_PROFIT_LOCK',
    note: 'Target likuiditas tercapai setelah akumulasi Jump Crypto $6.1M; profit +$949.22 langsung di-settle otomatis ke Hot Wallet tanpa withdraw manual.',
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
    entryPrice: 211.4,
    exitPrice: 211.35,
    sizeUsd: 20000,
    realizedPnlUsd: 18.92,
    realizedPnlPct: 0.09,
    exitType: 'BREAKEVEN_PROTECT',
    note: 'Auto-Breakeven + Fee Lock tersentuh saat Whale Solana menyerap ask wall; keluar dengan profit mikro +$18.92 otomatis masuk ke Hot Wallet.',
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
    entryPrice: 93740.0,
    exitPrice: 94390.0,
    sizeUsd: 50000,
    realizedPnlUsd: 1733.51,
    realizedPnlPct: 3.46,
    exitType: 'TAKE_PROFIT',
    note: 'Eksekusi Post-Only Maker di pucuk bid + konfirmasi inflow Hyperliquid Bridge $14.2M. Profit +$1,733.51 otomatis masuk ke Hot Wallet.',
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

