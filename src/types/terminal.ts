export type ExchangeId =
  | 'HYPERLIQUID'
  | 'BINANCE'
  | 'BYBIT'
  | 'OKX'
  | 'DEXSCREENER'
  | 'JUPITER';

export type MarketType = 'PERP' | 'SPOT' | 'DEX_POOL';

export type ExecutionEnvironment = 'PAPER_SANDBOX' | 'EXCHANGE_TESTNET' | 'REAL_MAINNET';

export interface MarketPair {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  hlCoin: string;
  binanceSymbol: string;
  cmcRank?: number;
  marketCapUsd?: number;
  chainNetwork?: string;
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
  category: 'SKILL_LIQUIDITY' | 'SKILL_WHALE' | 'SKILL_ORDERFLOW' | 'SKILL_RISK_GUARD' | 'EXECUTION';
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
  symbol: string;
  chain: 'Solana' | 'Hyperliquid L1' | 'Arbitrum' | 'Ethereum' | 'Base' | string;
  dexName: string;
  priceUsd: number;
  change1h: number;
  change24h: number;
  volume24hUsd: number;
  liquidityTvlUsd: number;
  buys1h: number;
  sells1h: number;
  whaleNetBuy1hUsd: number;
  passedLiquidityGate: boolean;
}
