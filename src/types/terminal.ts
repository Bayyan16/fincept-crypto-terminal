export type ExchangeId =
  | 'HYPERLIQUID'
  | 'BINANCE'
  | 'BYBIT'
  | 'OKX'
  | 'DEXSCREENER'
  | 'JUPITER';

export type MarketType = 'PERP' | 'SPOT' | 'DEX_POOL';

export type ExecutionEnvironment = 'PAPER_SANDBOX' | 'EXCHANGE_TESTNET' | 'REAL_MAINNET';

export type MarketSector =
  | 'TOP_10'
  | 'L1_L2'
  | 'AI_DEPIN'
  | 'DEFI_RWA'
  | 'MEME_ALPHA'
  | 'DEX_NATIVE';

export interface MarketPair {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  hlCoin: string;
  binanceSymbol: string;
  cmcRank?: number;
  marketCapUsd?: number;
  chainNetwork?: string;
  sector?: MarketSector;
  marketType: MarketType;
  primaryExchange: ExchangeId;
  supportedExchanges: ExchangeId[];
  price: number;
  change24h: number;
  high24h: number;
  low24h: number;
  volume24hUsd: number;
  openInterestUsd: number;
  fundingRate: number;
  spreadBps: number;
  depthPlusMinusHalfPctUsd: number;
  dexPoolTvlUsd: number;
  liquidityScore: number;
  obiScore: number;
  cvdDelta15mUsd: number;
  whaleNetFlow1hUsd: number;
  whaleBias: 'STRONG LONG' | 'ACCUMULATING' | 'NEUTRAL' | 'DISTRIBUTING' | 'STRONG SHORT';
}

export interface OrderbookLevel {
  price: number;
  size: number;
  totalUsd: number;
  cumulativeUsd: number;
  exchange: ExchangeId | 'GATEIO';
  isWhaleWall?: boolean;
}

export interface OrderbookState {
  bids: OrderbookLevel[];
  asks: OrderbookLevel[];
  spreadUsd: number;
  spreadBps: number;
  obiPercent: number;
  absorptionDetected: 'BULLISH_ABSORPTION' | 'BEARISH_ABSORPTION' | 'NONE';
  spoofingAlert: string | null;
}

export interface CandlePoint {
  time: number;
  label: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  cvd: number;
  whaleMarker?: {
    type: 'WHALE_LONG' | 'WHALE_SHORT' | 'BOT_ENTRY' | 'BOT_SCRATCH';
    text: string;
  };
}

export interface WhaleTransaction {
  id: string;
  timestamp: string;
  blockTimestamp?: string;
  walletLabel: string;
  walletAddress: string;
  counterpartyAddress?: string;
  sourceNode: string;
  targetNode: string;
  exchange: ExchangeId;
  chainId?: 'solana' | 'bsc' | 'hyperliquid' | 'robinhood' | 'ethereum' | string;
  chainName?: string;
  blockNumber?: number;
  blockHash?: string;
  nonce?: number;
  txIndex?: number;
  methodName?: string;
  tokenSymbol?: string;
  symbol: string;
  action:
    | 'OPEN LONG PERP'
    | 'OPEN SHORT PERP'
    | 'SPOT ACCUMULATION'
    | 'DEX POOL INFLOW'
    | 'CEX DEPOSIT (SELL RISK)'
    | 'BRIDGE TO HYPERLIQUID'
    | 'LIMIT WALL ABSORPTION';
  sizeUsd: number;
  sizeCoins?: number;
  price: number;
  leverage?: number;
  liquidationPrice?: number;
  direction: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  confidence: number;
  txHash: string;
  fullTxHash?: string;
  explorerTxUrl?: string;
  explorerWalletUrl?: string;
  gasFeeUsd?: number;
  gasPriceGwei?: number;
  gasLimit?: number;
  isLiveVerified?: boolean;
}

export interface WhalePositionItem {
  coin: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  sizeCoins: number;
  positionValueUsd: number;
  entryPrice: number;
  markPrice?: number;
  unrealizedPnlUsd: number;
  leverage?: number;
  leverageType?: string;
  liquidationPrice?: number;
  marginUsedUsd?: number;
  roePct?: number;
  cumFundingUsd?: number;
  walletAddress?: string;
  explorerUrl?: string;
  walletLabel: string;
}

export interface HlpVaultSummary {
  vaultAddress: string;
  accountValueUsd: number;
  totalMarginUsedUsd: number;
  withdrawableUsd: number;
  totalNotionalPosUsd: number;
}

export interface ChordFlowLink {
  id: string;
  source: string;
  target: string;
  volumeUsd: number;
  direction: 'INFLOW_BULLISH' | 'OUTFLOW_BEARISH' | 'ARB_ROTATION' | 'DEX_LIQUIDITY';
  asset: string;
  activePulse: boolean;
}

export interface AgentPosition {
  id: string;
  orderId?: string;
  isRealMoney?: boolean;
  symbol: string;
  side: 'LONG' | 'SHORT';
  marketType: MarketType;
  exchange: ExchangeId;
  entryPrice: number;
  currentPrice: number;
  sizeUsd: number;
  leverage: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  breakevenLocked: boolean;
  executionMode: 'POST_ONLY_MAKER' | 'TWAP_LOW_IMPACT';
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number;
  peakPnlPct: number;
  openedAt: string;
  statusReason: string;
  aiHoldDecision?:
    | 'HOLD_FLOATING_LOSS'
    | 'RIDE_PROFIT_TRAIL'
    | 'AUTO_TAKE_PROFIT_NOW'
    | 'AUTO_CUT_INVALIDATED';
  orderbookDefenseScore?: number;
  whaleConvictionScore?: number;
  sentimentScore?: number;
  marketSentimentLabel?: string;
  aiDecisionReason?: string;
}

export interface ClosedTradeLog {
  id: string;
  orderId?: string;
  isRealMoney?: boolean;
  timestamp: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  exchange: ExchangeId;
  entryPrice: number;
  exitPrice: number;
  sizeUsd: number;
  realizedPnlUsd: number;
  realizedPnlPct: number;
  exitType: 'TAKE_PROFIT' | 'TRAILING_PROFIT_LOCK' | 'BREAKEVEN_PROTECT' | 'MICRO_LOSS_SCRATCH';
  note: string;
  hotWalletSettled?: boolean;
  hotWalletName?: string;
  hotWalletAddress?: string;
  settlementTxHash?: string;
}

export interface AgentBrainDecision {
  id: string;
  timestamp: string;
  symbol: string;
  category:
    | 'SKILL_LIQUIDITY'
    | 'SKILL_WHALE'
    | 'SKILL_ORDERFLOW'
    | 'SKILL_RISK_GUARD'
    | 'SKILL_NEWS_INTEL'
    | 'SKILL_TECHNICAL_PA'
    | 'FORUM_CONSENSUS'
    | 'EXECUTION';
  headline: string;
  detail: string;
  score: number;
  tone: 'BULLISH' | 'BEARISH' | 'WARN' | 'INFO';
}

export interface ChainAssetBreakdown {
  chainName: string;
  chainId: number | string;
  nativeSymbol: string;
  nativeBalance: number;
  stableSymbol: string;
  stableBalanceUsd: number;
  totalChainUsd: number;
  recommendedFor: string;
}

export interface WalletCredentials {
  apiKey?: string;
  apiSecret?: string;
  passphrase?: string;
  walletAddress?: string;
  agentPrivateKey?: string;
  useTestnet?: boolean;
  preferredChainId?: number;
}

export interface WalletConnectionState {
  id: 'phantom' | 'trust' | 'hyperliquid_agent' | 'binance_api' | 'bybit_api' | 'okx_api';
  name: string;
  type: 'DEX_WALLET' | 'PERP_AGENT_KEY' | 'CEX_API';
  chainOrScope: string;
  connected: boolean;
  verifiedReal: boolean;
  addressOrKeyId: string;
  balanceUsd: number;
  latencyMs: number;
  autoSignEnabled: boolean;
  activeChainId?: number;
  activeChainName?: string;
  chainBalances?: ChainAssetBreakdown[];
  credentials?: WalletCredentials;
}

export interface DexScreenerPoolItem {
  pairAddress: string;
  fullPairAddress?: string;
  symbol: string;
  baseSymbol?: string;
  baseName?: string;
  quoteSymbol?: string;
  baseTokenAddress?: string;
  quoteTokenAddress?: string;
  chainId?: 'solana' | 'bsc' | 'hyperliquid' | 'robinhood' | 'ethereum' | string;
  chain: 'Solana' | 'Hyperliquid L1' | 'Arbitrum' | 'Ethereum' | 'Base' | string;
  dexName: string;
  priceUsd: number;
  change5m?: number;
  change1h: number;
  change24h: number;
  volume24hUsd: number;
  volume1hUsd?: number;
  liquidityTvlUsd: number;
  fdvUsd?: number;
  buys1h: number;
  sells1h: number;
  buys24h?: number;
  sells24h?: number;
  txns24h?: number;
  whaleNetBuy1hUsd: number;
  passedLiquidityGate: boolean;
  dexScreenerUrl?: string;
  explorerUrl?: string;
  tokenImageUrl?: string;
  sourceFeed?: string;
}

export interface DexUniverseStats {
  totalIndexedPools: number;
  hlPerpCount: number;
  hlSpotPairsCount: number;
  hlSpotTokensCount: number;
  chainPoolCounts: Record<string, number>;
  chainUniqueTokenCounts: Record<string, number>;
}

export interface VerifiedNewsItem {
  id: string;
  timestamp: string;
  source: string;
  category:
    | 'MACRO_FED'
    | 'ETF_INSTITUTIONAL'
    | 'REGULATORY_SEC'
    | 'ONCHAIN_WHALE'
    | 'PROTOCOL_CATALYST'
    | 'EXCHANGE_FLOW';
  headline: string;
  summary: string;
  affectedAssets: string[];
  sentiment: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  credibilityScore: number; // Strictly 90 - 100% verified
  impactScore: number; // 0 - 100 market sensitivity
  verificationProof: string;
  url?: string;
}

export interface TechnicalAnalysisSnapshot {
  symbol: string;
  price: number;
  priceActionStructure:
    | 'BULLISH_BOS_HH_HL'
    | 'BEARISH_BOS_LH_LL'
    | 'BULLISH_CHOCH_REVERSAL'
    | 'BEARISH_CHOCH_REVERSAL'
    | 'RANGE_ACCUMULATION';
  structureLabel: string;
  swingHigh: number;
  swingLow: number;
  support1: number;
  support2: number;
  resistance1: number;
  resistance2: number;
  distanceToSupportPct: number;
  distanceToResistancePct: number;
  ema20: number;
  ema50: number;
  ema200: number;
  emaAlignment:
    | 'BULLISH_STACK'
    | 'BEARISH_STACK'
    | 'GOLDEN_CROSS'
    | 'DEATH_CROSS'
    | 'MIXED_CONSOLIDATION';
  emaAlignmentLabel: string;
  rsi14: number;
  rsiState:
    | 'OVERSOLD_BOUNCE'
    | 'BULLISH_MOMENTUM'
    | 'NEUTRAL_BALANCE'
    | 'BEARISH_MOMENTUM'
    | 'OVERBOUGHT_EXHAUSTION';
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  macdState: 'BULLISH_CROSS' | 'BULLISH_EXPANSION' | 'BEARISH_CROSS' | 'BEARISH_EXPANSION';
  bbUpper: number;
  bbMiddle: number;
  bbLower: number;
  bbPercentB: number;
  bbWidthPct: number;
  bbState:
    | 'VOLATILITY_SQUEEZE'
    | 'UPPER_BAND_WALK'
    | 'LOWER_BAND_DEFENSE'
    | 'MEAN_REVERSION_ZONE';
  atr14: number;
  atrPct: number;
  taScore: number;
  recommendedSide: 'LONG' | 'SHORT' | 'WAIT';
  summary: string;
}

export interface WhaleWalletIntelSnapshot {
  symbol: string;
  netFlow1hUsd: number;
  institutionalBias: 'STRONG_ACCUMULATION' | 'ACCUMULATING' | 'NEUTRAL' | 'DISTRIBUTING' | 'HEAVY_DUMP';
  activeEntities: string[];
  bullishTxCount: number;
  bearishTxCount: number;
  largestWhaleTxUsd: number;
  hlpVaultSide: 'LONG' | 'SHORT' | 'FLAT';
  hlpVaultNotionalUsd: number;
  orderbookObiPct: number;
  whaleScore: number;
  recommendedSide: 'LONG' | 'SHORT' | 'WAIT';
  summary: string;
}

export type SpecialistAgentId =
  | 'BLOOMBERG_NEWS'
  | 'TECHNICAL_ANALYST'
  | 'WHALE_WALLET'
  | 'EXECUTION_PRECISION';

export interface SpecialistAgentVote {
  agentId: SpecialistAgentId;
  agentName: string;
  badge: string;
  specialty: string;
  vote: 'LONG' | 'SHORT' | 'WAIT' | 'VETO';
  score: number; // 0 - 100
  credibilityOrAccuracyPct: number; // 90 - 100%
  headline: string;
  rationale: string;
  metricsPillars: string[];
  timestamp: string;
}

export interface PreTradeChecklistItem {
  id: string;
  label: string;
  passed: boolean;
  valueText: string;
  agentOwner: SpecialistAgentId;
}

export interface PositionAccuracyAuditItem {
  positionId: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  exchange: ExchangeId;
  leverage: number;
  sizeUsd: number;
  entryPrice: number;
  currentPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  breakevenLocked: boolean;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number;
  alignedAgentsCount: number;
  checklistPassedCount: number;
  isAccurateVerdict: boolean;
  verdictStatus:
    | 'TEPAT_PROFIT_AKTIF'
    | 'TEPAT_BREAKEVEN_LOCKED'
    | 'FLOATING_TERKENDALI_WHALE_SUPPORT'
    | 'SALAH_INVALIDATED_AUTO_SCRATCH';
  verdictLabel: string;
  agentBreakdown: string;
}

export interface WalkForwardTradeOutcome {
  id: string;
  symbol: string;
  side: 'LONG' | 'SHORT';
  entryBarLabel: string;
  exitBarLabel: string;
  entryPrice: number;
  exitPrice: number;
  stopLossPrice: number;
  takeProfitPrice: number;
  leverage: number;
  mfePct: number; // Max Favorable Excursion (leveraged %)
  maePct: number; // Max Adverse Excursion (leveraged %)
  realizedPnlPct: number;
  realizedPnlUsd: number;
  outcome: 'WIN_TAKE_PROFIT' | 'WIN_TRAIL_PROFIT' | 'PROTECTED_BREAKEVEN' | 'LOSS_STOP';
  isAccurate: boolean;
  reason: string;
}

export interface MultiAgentForumConsensus {
  symbol: string;
  baseAsset: string;
  timestamp: string;
  finalVerdict: 'STRONG_LONG' | 'STRONG_SHORT' | 'WAIT_CONFIRMATION' | 'VETO_RISK_BLOCK';
  recommendedSide: 'LONG' | 'SHORT';
  consensusScore: number; // 0 - 100
  positionAccuracyPct: number; // 0 - 100%
  alignedAgentsCount: number; // 0 - 4
  totalAgents: 4;
  hasVeto: boolean;
  vetoReason: string | null;
  entryPrice: number;
  stopLossPrice: number;
  breakevenLockPrice: number;
  takeProfit1: number;
  takeProfit2: number;
  riskRewardRatio: number;
  recommendedLeverage: number;
  recommendedSizeUsd: number;
  executiveSummary: string;
  votes: SpecialistAgentVote[];
  checklist: PreTradeChecklistItem[];
  checklistPassedCount: number;
  ta: TechnicalAnalysisSnapshot;
  whale: WhaleWalletIntelSnapshot;
  newsCredibilityAvg: number;
  matchedNews: VerifiedNewsItem[];
}

