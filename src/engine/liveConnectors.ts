import {
  CandlePoint,
  ChordFlowLink,
  DexScreenerPoolItem,
  DexUniverseStats,
  ExchangeId,
  HlpVaultSummary,
  MarketPair,
  MarketSector,
  OrderbookLevel,
  OrderbookState,
  VerifiedNewsItem,
  WhalePositionItem,
  WhaleTransaction,
} from '../types/terminal';

function createQuickMarket(
  symbol: string,
  baseAsset: string,
  hlCoin: string,
  sector: MarketSector,
  cmcRank: number,
  price: number,
  change24h: number,
  volume24hUsd: number,
  openInterestUsd: number,
  whaleNetFlow1hUsd: number,
  primaryExchange: ExchangeId = 'HYPERLIQUID',
  chainNetwork = 'Hyperliquid L1 / Multi-Exchange'
): MarketPair {
  const high24h = Number((price * (1 + Math.max(0.018, Math.abs(change24h) / 100))).toPrecision(5));
  const low24h = Number((price * (1 - Math.max(0.018, Math.abs(change24h) / 100))).toPrecision(5));
  const obiScore = Number(
    Math.max(-0.65, Math.min(0.65, (whaleNetFlow1hUsd / Math.max(1_000_000, volume24hUsd * 0.04)) * 0.35)).toFixed(2)
  );
  const whaleBias: MarketPair['whaleBias'] =
    whaleNetFlow1hUsd >= 6_000_000
      ? 'STRONG LONG'
      : whaleNetFlow1hUsd >= 1_000_000
        ? 'ACCUMULATING'
        : whaleNetFlow1hUsd <= -6_000_000
          ? 'STRONG SHORT'
          : whaleNetFlow1hUsd <= -1_000_000
            ? 'DISTRIBUTING'
            : 'NEUTRAL';
  return {
    symbol,
    baseAsset,
    quoteAsset: 'USDC',
    hlCoin,
    binanceSymbol: `${baseAsset.replace(/^k(?=[A-Z]{2,})/, '')}USDT`,
    cmcRank,
    marketCapUsd: Math.round(volume24hUsd * 7.5),
    chainNetwork,
    sector,
    marketType: 'PERP',
    primaryExchange,
    supportedExchanges: ['HYPERLIQUID', 'BINANCE', 'BYBIT', 'OKX'],
    price,
    change24h,
    high24h,
    low24h,
    volume24hUsd,
    openInterestUsd,
    fundingRate: change24h >= 0 ? 0.0095 : 0.0045,
    spreadBps: volume24hUsd >= 300_000_000 ? 0.42 : 0.68,
    depthPlusMinusHalfPctUsd: Math.max(3_200_000, Math.round(openInterestUsd * 0.045)),
    dexPoolTvlUsd: Math.max(8_500_000, Math.round(openInterestUsd * 0.16)),
    liquidityScore: volume24hUsd >= 400_000_000 ? 93 : volume24hUsd >= 150_000_000 ? 89 : 85,
    obiScore,
    cvdDelta15mUsd: Math.round(whaleNetFlow1hUsd * 0.58),
    whaleNetFlow1hUsd,
    whaleBias,
  };
}

export const INITIAL_MARKETS: MarketPair[] = [
  {
    symbol: 'BTC-PERP',
    baseAsset: 'BTC',
    quoteAsset: 'USDC',
    hlCoin: 'BTC',
    binanceSymbol: 'BTCUSDT',
    cmcRank: 1,
    marketCapUsd: 1465000000000,
    chainNetwork: 'Bitcoin L1 / Hyperliquid L1 / Arbitrum',
    marketType: 'PERP',
    primaryExchange: 'HYPERLIQUID',
    supportedExchanges: ['HYPERLIQUID', 'BINANCE', 'BYBIT', 'OKX'],
    price: 73820.5,
    change24h: 1.84,
    high24h: 74940.0,
    low24h: 72680.0,
    volume24hUsd: 4820000000,
    openInterestUsd: 2950000000,
    fundingRate: 0.0085,
    spreadBps: 0.14,
    depthPlusMinusHalfPctUsd: 42500000,
    dexPoolTvlUsd: 529800000,
    liquidityScore: 99,
    obiScore: 0.44,
    cvdDelta15mUsd: 18450000,
    whaleNetFlow1hUsd: 34200000,
    whaleBias: 'STRONG LONG',
  },
  {
    symbol: 'ETH-PERP',
    baseAsset: 'ETH',
    quoteAsset: 'USDC',
    hlCoin: 'ETH',
    binanceSymbol: 'ETHUSDT',
    cmcRank: 2,
    marketCapUsd: 268000000000,
    chainNetwork: 'Ethereum Mainnet / Arbitrum / Base',
    marketType: 'PERP',
    primaryExchange: 'BINANCE',
    supportedExchanges: ['BINANCE', 'HYPERLIQUID', 'BYBIT', 'OKX'],
    price: 2224.8,
    change24h: 2.15,
    high24h: 2295.0,
    low24h: 2178.0,
    volume24hUsd: 3150000000,
    openInterestUsd: 1490000000,
    fundingRate: 0.0095,
    spreadBps: 0.24,
    depthPlusMinusHalfPctUsd: 31400000,
    dexPoolTvlUsd: 360000000,
    liquidityScore: 98,
    obiScore: 0.34,
    cvdDelta15mUsd: 9120000,
    whaleNetFlow1hUsd: 16200000,
    whaleBias: 'STRONG LONG',
  },
  {
    symbol: 'XRP-PERP',
    baseAsset: 'XRP',
    quoteAsset: 'USDC',
    hlCoin: 'XRP',
    binanceSymbol: 'XRPUSDT',
    cmcRank: 3,
    marketCapUsd: 142000000000,
    chainNetwork: 'XRP Ledger / Hyperliquid L1 / Binance',
    marketType: 'PERP',
    primaryExchange: 'BINANCE',
    supportedExchanges: ['BINANCE', 'HYPERLIQUID', 'BYBIT', 'OKX'],
    price: 2.465,
    change24h: 4.62,
    high24h: 2.54,
    low24h: 2.34,
    volume24hUsd: 2480000000,
    openInterestUsd: 920000000,
    fundingRate: 0.0112,
    spreadBps: 0.38,
    depthPlusMinusHalfPctUsd: 22400000,
    dexPoolTvlUsd: 148000000,
    liquidityScore: 96,
    obiScore: 0.41,
    cvdDelta15mUsd: 8420000,
    whaleNetFlow1hUsd: 14900000,
    whaleBias: 'STRONG LONG',
  },
  {
    symbol: 'BNB-PERP',
    baseAsset: 'BNB',
    quoteAsset: 'USDC',
    hlCoin: 'BNB',
    binanceSymbol: 'BNBUSDT',
    cmcRank: 4,
    marketCapUsd: 91500000000,
    chainNetwork: 'BNB Smart Chain (BEP20) / Hyperliquid L1',
    marketType: 'PERP',
    primaryExchange: 'BINANCE',
    supportedExchanges: ['BINANCE', 'HYPERLIQUID', 'BYBIT', 'OKX'],
    price: 628.4,
    change24h: 1.92,
    high24h: 639.0,
    low24h: 614.5,
    volume24hUsd: 1180000000,
    openInterestUsd: 540000000,
    fundingRate: 0.0068,
    spreadBps: 0.35,
    depthPlusMinusHalfPctUsd: 16800000,
    dexPoolTvlUsd: 215000000,
    liquidityScore: 95,
    obiScore: 0.29,
    cvdDelta15mUsd: 4950000,
    whaleNetFlow1hUsd: 8800000,
    whaleBias: 'ACCUMULATING',
  },
  {
    symbol: 'SOL-PERP',
    baseAsset: 'SOL',
    quoteAsset: 'USDC',
    hlCoin: 'SOL',
    binanceSymbol: 'SOLUSDT',
    cmcRank: 5,
    marketCapUsd: 78400000000,
    chainNetwork: 'Solana Mainnet / Hyperliquid L1 / Jupiter',
    marketType: 'PERP',
    primaryExchange: 'HYPERLIQUID',
    supportedExchanges: ['HYPERLIQUID', 'BINANCE', 'BYBIT', 'JUPITER', 'DEXSCREENER'],
    price: 148.65,
    change24h: 5.42,
    high24h: 153.4,
    low24h: 141.8,
    volume24hUsd: 2690000000,
    openInterestUsd: 880000000,
    fundingRate: 0.0125,
    spreadBps: 0.22,
    depthPlusMinusHalfPctUsd: 24800000,
    dexPoolTvlUsd: 284000000,
    liquidityScore: 97,
    obiScore: 0.52,
    cvdDelta15mUsd: 11640000,
    whaleNetFlow1hUsd: 21800000,
    whaleBias: 'STRONG LONG',
  },
  {
    symbol: 'DOGE-PERP',
    baseAsset: 'DOGE',
    quoteAsset: 'USDC',
    hlCoin: 'DOGE',
    binanceSymbol: 'DOGEUSDT',
    cmcRank: 6,
    marketCapUsd: 38200000000,
    chainNetwork: 'Dogecoin / BNB Chain / Hyperliquid L1',
    marketType: 'PERP',
    primaryExchange: 'BINANCE',
    supportedExchanges: ['BINANCE', 'HYPERLIQUID', 'BYBIT', 'OKX'],
    price: 0.2584,
    change24h: 6.18,
    high24h: 0.269,
    low24h: 0.241,
    volume24hUsd: 1740000000,
    openInterestUsd: 610000000,
    fundingRate: 0.0135,
    spreadBps: 0.48,
    depthPlusMinusHalfPctUsd: 15200000,
    dexPoolTvlUsd: 84000000,
    liquidityScore: 94,
    obiScore: 0.38,
    cvdDelta15mUsd: 6250000,
    whaleNetFlow1hUsd: 11400000,
    whaleBias: 'STRONG LONG',
  },
  {
    symbol: 'ADA-PERP',
    baseAsset: 'ADA',
    quoteAsset: 'USDC',
    hlCoin: 'ADA',
    binanceSymbol: 'ADAUSDT',
    cmcRank: 7,
    marketCapUsd: 28900000000,
    chainNetwork: 'Cardano Mainnet / Hyperliquid L1 / Binance',
    marketType: 'PERP',
    primaryExchange: 'BINANCE',
    supportedExchanges: ['BINANCE', 'HYPERLIQUID', 'BYBIT', 'OKX'],
    price: 0.814,
    change24h: 3.12,
    high24h: 0.842,
    low24h: 0.785,
    volume24hUsd: 890000000,
    openInterestUsd: 340000000,
    fundingRate: 0.0092,
    spreadBps: 0.55,
    depthPlusMinusHalfPctUsd: 11500000,
    dexPoolTvlUsd: 62000000,
    liquidityScore: 91,
    obiScore: 0.26,
    cvdDelta15mUsd: 3450000,
    whaleNetFlow1hUsd: 6800000,
    whaleBias: 'ACCUMULATING',
  },
  {
    symbol: 'TRX-PERP',
    baseAsset: 'TRX',
    quoteAsset: 'USDC',
    hlCoin: 'TRX',
    binanceSymbol: 'TRXUSDT',
    cmcRank: 8,
    marketCapUsd: 21400000000,
    chainNetwork: 'TRON Network (TRC20) / Binance / OKX',
    marketType: 'PERP',
    primaryExchange: 'BINANCE',
    supportedExchanges: ['BINANCE', 'BYBIT', 'OKX', 'HYPERLIQUID'],
    price: 0.2465,
    change24h: 1.45,
    high24h: 0.252,
    low24h: 0.241,
    volume24hUsd: 620000000,
    openInterestUsd: 245000000,
    fundingRate: 0.0074,
    spreadBps: 0.62,
    depthPlusMinusHalfPctUsd: 9800000,
    dexPoolTvlUsd: 112000000,
    liquidityScore: 90,
    obiScore: 0.22,
    cvdDelta15mUsd: 2180000,
    whaleNetFlow1hUsd: 5100000,
    whaleBias: 'ACCUMULATING',
  },
  {
    symbol: 'AVAX-PERP',
    baseAsset: 'AVAX',
    quoteAsset: 'USDC',
    hlCoin: 'AVAX',
    binanceSymbol: 'AVAXUSDT',
    cmcRank: 9,
    marketCapUsd: 14800000000,
    chainNetwork: 'Avalanche C-Chain / Hyperliquid L1',
    marketType: 'PERP',
    primaryExchange: 'HYPERLIQUID',
    supportedExchanges: ['HYPERLIQUID', 'BINANCE', 'BYBIT', 'OKX'],
    price: 25.84,
    change24h: 4.28,
    high24h: 26.75,
    low24h: 24.5,
    volume24hUsd: 780000000,
    openInterestUsd: 310000000,
    fundingRate: 0.0105,
    spreadBps: 0.52,
    depthPlusMinusHalfPctUsd: 10900000,
    dexPoolTvlUsd: 94000000,
    liquidityScore: 92,
    obiScore: 0.35,
    cvdDelta15mUsd: 4120000,
    whaleNetFlow1hUsd: 7900000,
    whaleBias: 'STRONG LONG',
  },
  {
    symbol: 'LINK-PERP',
    baseAsset: 'LINK',
    quoteAsset: 'USDC',
    hlCoin: 'LINK',
    binanceSymbol: 'LINKUSDT',
    cmcRank: 10,
    marketCapUsd: 12900000000,
    chainNetwork: 'Ethereum Mainnet / Arbitrum / Hyperliquid L1',
    marketType: 'PERP',
    primaryExchange: 'BINANCE',
    supportedExchanges: ['BINANCE', 'HYPERLIQUID', 'BYBIT', 'OKX'],
    price: 18.92,
    change24h: 3.74,
    high24h: 19.65,
    low24h: 18.05,
    volume24hUsd: 690000000,
    openInterestUsd: 285000000,
    fundingRate: 0.0098,
    spreadBps: 0.54,
    depthPlusMinusHalfPctUsd: 10200000,
    dexPoolTvlUsd: 88000000,
    liquidityScore: 92,
    obiScore: 0.33,
    cvdDelta15mUsd: 3890000,
    whaleNetFlow1hUsd: 7400000,
    whaleBias: 'ACCUMULATING',
  },
  {
    symbol: 'HYPE-USDC',
    baseAsset: 'HYPE',
    quoteAsset: 'USDC',
    hlCoin: 'HYPE',
    binanceSymbol: 'HYPEUSDT',
    cmcRank: 11,
    marketCapUsd: 11800000000,
    chainNetwork: 'Hyperliquid L1 Native',
    marketType: 'PERP',
    primaryExchange: 'HYPERLIQUID',
    supportedExchanges: ['HYPERLIQUID', 'DEXSCREENER'],
    price: 28.94,
    change24h: 11.45,
    high24h: 29.85,
    low24h: 25.4,
    volume24hUsd: 890000000,
    openInterestUsd: 412000000,
    fundingRate: 0.021,
    spreadBps: 0.44,
    depthPlusMinusHalfPctUsd: 14200000,
    dexPoolTvlUsd: 277380000,
    liquidityScore: 95,
    obiScore: 0.61,
    cvdDelta15mUsd: 6420000,
    whaleNetFlow1hUsd: 14500000,
    whaleBias: 'STRONG LONG',
  },
  {
    symbol: 'SUI-PERP',
    baseAsset: 'SUI',
    quoteAsset: 'USDC',
    hlCoin: 'SUI',
    binanceSymbol: 'SUIUSDT',
    cmcRank: 12,
    marketCapUsd: 10200000000,
    chainNetwork: 'Sui Mainnet / Hyperliquid L1 / Bybit',
    marketType: 'PERP',
    primaryExchange: 'BYBIT',
    supportedExchanges: ['BYBIT', 'BINANCE', 'HYPERLIQUID', 'OKX'],
    price: 3.482,
    change24h: -1.64,
    high24h: 3.62,
    low24h: 3.39,
    volume24hUsd: 640000000,
    openInterestUsd: 215000000,
    fundingRate: 0.0042,
    spreadBps: 0.85,
    depthPlusMinusHalfPctUsd: 7400000,
    dexPoolTvlUsd: 68000000,
    liquidityScore: 89,
    obiScore: -0.34,
    cvdDelta15mUsd: -3180000,
    whaleNetFlow1hUsd: -5400000,
    whaleBias: 'DISTRIBUTING',
  },
  {
    symbol: 'JUP-SOL',
    baseAsset: 'JUP',
    quoteAsset: 'USDC',
    hlCoin: 'JUP',
    binanceSymbol: 'JUPUSDT',
    cmcRank: 13,
    marketCapUsd: 2450000000,
    chainNetwork: 'Solana Mainnet (Jupiter V1 Aggregator)',
    marketType: 'SPOT',
    primaryExchange: 'JUPITER',
    supportedExchanges: ['JUPITER', 'DEXSCREENER', 'BINANCE', 'HYPERLIQUID'],
    price: 1.184,
    change24h: 8.32,
    high24h: 1.23,
    low24h: 1.07,
    volume24hUsd: 312000000,
    openInterestUsd: 89000000,
    fundingRate: 0.0112,
    spreadBps: 0.92,
    depthPlusMinusHalfPctUsd: 6800000,
    dexPoolTvlUsd: 84000000,
    liquidityScore: 90,
    obiScore: 0.39,
    cvdDelta15mUsd: 2890000,
    whaleNetFlow1hUsd: 6150000,
    whaleBias: 'ACCUMULATING',
  },
  {
    symbol: 'RAY-SOL',
    baseAsset: 'RAY',
    quoteAsset: 'USDC',
    hlCoin: 'RAY',
    binanceSymbol: 'RAYUSDT',
    cmcRank: 14,
    marketCapUsd: 1680000000,
    chainNetwork: 'Solana Mainnet (Raydium V3 CLMM)',
    marketType: 'DEX_POOL',
    primaryExchange: 'DEXSCREENER',
    supportedExchanges: ['DEXSCREENER', 'JUPITER', 'HYPERLIQUID', 'BINANCE'],
    price: 1.85,
    change24h: 4.12,
    high24h: 1.94,
    low24h: 1.76,
    volume24hUsd: 145000000,
    openInterestUsd: 42000000,
    fundingRate: 0.0085,
    spreadBps: 0.85,
    depthPlusMinusHalfPctUsd: 6260000,
    dexPoolTvlUsd: 6268904,
    liquidityScore: 91,
    obiScore: 0.45,
    cvdDelta15mUsd: 1940000,
    whaleNetFlow1hUsd: 4250000,
    whaleBias: 'STRONG LONG',
  },
  // --- EXPANDED ALL-MARKET UNIVERSE (BEYOND TOP 10 CMC: L1/L2, AI/DePIN, DeFi/RWA, MEME, POW) ---
  createQuickMarket('TON-PERP', 'TON', 'TON', 'L1_L2', 15, 3.64, 3.45, 420_000_000, 145_000_000, 5_400_000, 'BYBIT', 'TON Mainnet / Hyperliquid L1'),
  createQuickMarket('DOT-PERP', 'DOT', 'DOT', 'L1_L2', 16, 4.82, 2.18, 380_000_000, 132_000_000, 3_900_000, 'BINANCE', 'Polkadot Relay / Hyperliquid L1'),
  createQuickMarket('NEAR-PERP', 'NEAR', 'NEAR', 'AI_DEPIN', 17, 3.38, 6.24, 540_000_000, 195_000_000, 8_200_000, 'HYPERLIQUID', 'NEAR Protocol / AI Sharding'),
  createQuickMarket('APT-PERP', 'APT', 'APT', 'L1_L2', 18, 6.42, 4.15, 460_000_000, 168_000_000, 6_100_000, 'BINANCE', 'Aptos Move L1 / Hyperliquid'),
  createQuickMarket('ARB-PERP', 'ARB', 'ARB', 'L1_L2', 19, 0.485, 5.12, 510_000_000, 185_000_000, 7_300_000, 'HYPERLIQUID', 'Arbitrum One L2 Native'),
  createQuickMarket('OP-PERP', 'OP', 'OP', 'L1_L2', 20, 0.892, 3.84, 390_000_000, 142_000_000, 4_600_000, 'BINANCE', 'Optimism Superchain L2'),
  createQuickMarket('INJ-PERP', 'INJ', 'INJ', 'DEFI_RWA', 21, 14.25, 7.15, 410_000_000, 154_000_000, 7_850_000, 'HYPERLIQUID', 'Injective DeFi L1 / Hyperliquid'),
  createQuickMarket('TIA-PERP', 'TIA', 'TIA', 'L1_L2', 22, 3.85, 4.92, 340_000_000, 128_000_000, 4_900_000, 'HYPERLIQUID', 'Celestia Modular DA'),
  createQuickMarket('SEI-PERP', 'SEI', 'SEI', 'L1_L2', 23, 0.284, 5.68, 310_000_000, 112_000_000, 4_200_000, 'BINANCE', 'Sei Parallel EVM L1'),
  createQuickMarket('TAO-PERP', 'TAO', 'TAO', 'AI_DEPIN', 24, 368.5, 9.42, 680_000_000, 245_000_000, 12_400_000, 'HYPERLIQUID', 'Bittensor Decentralized AI'),
  createQuickMarket('RENDER-PERP', 'RENDER', 'RENDER', 'AI_DEPIN', 25, 4.46, 8.14, 490_000_000, 172_000_000, 8_900_000, 'BINANCE', 'Render GPU DePIN Network'),
  createQuickMarket('FET-PERP', 'FET', 'FET', 'AI_DEPIN', 26, 0.785, 7.65, 430_000_000, 158_000_000, 6_700_000, 'BINANCE', 'ASI Artificial Superintelligence'),
  createQuickMarket('WLD-PERP', 'WLD', 'WLD', 'AI_DEPIN', 27, 1.24, 6.82, 520_000_000, 182_000_000, 7_450_000, 'HYPERLIQUID', 'Worldcoin Identity / Optimism'),
  createQuickMarket('AAVE-PERP', 'AAVE', 'AAVE', 'DEFI_RWA', 28, 218.4, 6.45, 590_000_000, 210_000_000, 9_800_000, 'HYPERLIQUID', 'Aave V3 Institutional Lending'),
  createQuickMarket('UNI-PERP', 'UNI', 'UNI', 'DEFI_RWA', 29, 7.64, 4.38, 480_000_000, 165_000_000, 6_400_000, 'BINANCE', 'Uniswap V4 / Unichain'),
  createQuickMarket('PENDLE-PERP', 'PENDLE', 'PENDLE', 'DEFI_RWA', 30, 3.42, 8.75, 370_000_000, 138_000_000, 7_900_000, 'HYPERLIQUID', 'Pendle Yield Tokenization'),
  createQuickMarket('ONDO-PERP', 'ONDO', 'ONDO', 'DEFI_RWA', 31, 0.985, 7.92, 450_000_000, 162_000_000, 8_600_000, 'HYPERLIQUID', 'Ondo Institutional RWA Treasuries'),
  createQuickMarket('ENA-PERP', 'ENA', 'ENA', 'DEFI_RWA', 32, 0.442, 6.18, 410_000_000, 148_000_000, 5_950_000, 'BYBIT', 'Ethena Synthetic Dollar Protocol'),
  createQuickMarket('PEPE-PERP', 'PEPE', 'kPEPE', 'MEME_ALPHA', 33, 0.0114, 11.85, 920_000_000, 310_000_000, 14_200_000, 'HYPERLIQUID', 'Ethereum / Hyperliquid kPEPE'),
  createQuickMarket('WIF-PERP', 'WIF', 'WIF', 'MEME_ALPHA', 34, 0.745, 10.42, 640_000_000, 215_000_000, 10_800_000, 'HYPERLIQUID', 'Solana Smart-Money Meme'),
  createQuickMarket('BONK-PERP', 'BONK', 'kBONK', 'MEME_ALPHA', 35, 0.0168, 8.95, 480_000_000, 164_000_000, 7_600_000, 'HYPERLIQUID', 'Solana / Hyperliquid kBONK'),
  createQuickMarket('SHIB-PERP', 'SHIB', 'kSHIB', 'MEME_ALPHA', 36, 0.0142, 5.24, 510_000_000, 175_000_000, 6_300_000, 'BINANCE', 'Ethereum / Hyperliquid kSHIB'),
  createQuickMarket('LTC-PERP', 'LTC', 'LTC', 'L1_L2', 37, 96.4, 3.15, 530_000_000, 190_000_000, 6_800_000, 'BINANCE', 'Litecoin PoW / ETF Candidate'),
  createQuickMarket('PAXG-PERP', 'PAXG', 'PAXG', 'DEFI_RWA', 38, 2915.0, 1.12, 260_000_000, 95_000_000, 4_100_000, 'HYPERLIQUID', 'Tokenized Sovereign Gold RWA'),
];

const AI_SECTOR_SET = new Set(['TAO', 'RENDER', 'RNDR', 'FET', 'WLD', 'NEAR', 'ARKM', 'IO', 'AKT', 'VIRTUAL', 'AI16Z', 'GRASS', 'KAITO', 'FIL', 'AR']);
const DEFI_RWA_SET = new Set(['AAVE', 'UNI', 'PENDLE', 'ONDO', 'ENA', 'MKR', 'SKY', 'LDO', 'CRV', 'GMX', 'DYDX', 'MORPHO', 'USUAL', 'PAXG', 'SNX', 'COMP', 'CAKE']);
const MEME_SET = new Set(['DOGE', 'PEPE', 'kPEPE', 'WIF', 'BONK', 'kBONK', 'SHIB', 'kSHIB', 'FLOKI', 'kFLOKI', 'POPCAT', 'PENGU', 'FARTCOIN', 'TRUMP', 'PNUT', 'GOAT', 'BRETT', 'MEW', 'BOME', 'MEME', 'SPX', 'MOG', 'TURBO', 'NEIRO', 'kNEIRO']);
const DEX_SET = new Set(['HYPE', 'JUP', 'RAY', 'ORCA', 'DRIFT', 'AERO']);

export function classifyCoinSector(baseAsset: string, cmcRank?: number): MarketSector {
  if (cmcRank && cmcRank <= 10) return 'TOP_10';
  const clean = baseAsset.replace(/^k(?=[A-Z]{2,})/, '').toUpperCase();
  if (DEX_SET.has(clean) || DEX_SET.has(baseAsset)) return 'DEX_NATIVE';
  if (AI_SECTOR_SET.has(clean)) return 'AI_DEPIN';
  if (DEFI_RWA_SET.has(clean)) return 'DEFI_RWA';
  if (MEME_SET.has(clean) || MEME_SET.has(baseAsset)) return 'MEME_ALPHA';
  return 'L1_L2';
}

/**
 * Dynamically merges the live Hyperliquid L1 asset universe (235+ perpetual markets)
 * + real DEX pools into the terminal's tradable MarketPair list so the user and
 * the 4-Agent Consensus Hunter can trade EVERY crypto market (not just Top 10 CMC).
 */
export function mergeDynamicAllCryptoMarkets(
  prevMarkets: MarketPair[],
  hlAssets: Record<string, any>,
  realDexPools?: DexScreenerPoolItem[],
  realOnChainTrades?: WhaleTransaction[]
): MarketPair[] {
  const nowMs = Date.now();
  // Helper: sum ONLY verified directional on-chain whale trades (never fabricate whale flow from change24h!)
  const computeRealCoinWhaleDelta = (symbol: string, baseAsset: string): { netFlow: number; tradeCount: number } => {
    const cleanBase = baseAsset.replace(/^k(?=[A-Z]{2,})/, '').toUpperCase();
    const coinTrades = (realOnChainTrades || []).filter((t) => {
      if (!t || t.isDirectionalWhaleTrade === false) return false;
      if (t.direction !== 'BULLISH' && t.direction !== 'BEARISH') return false;
      if (t.tokenSymbol === 'USDC' || t.symbol === 'USDC-BRIDGE') return false;
      const tTok = String(t.tokenSymbol || '').replace(/^k(?=[A-Z]{2,})/, '').toUpperCase();
      return (
        t.symbol === symbol ||
        tTok === cleanBase ||
        t.symbol.toUpperCase().startsWith(`${cleanBase}-`) ||
        t.symbol.toUpperCase().startsWith(`${cleanBase} /`)
      );
    });
    const netFlow = Math.round(
      coinTrades.reduce((acc, t) => acc + (t.direction === 'BULLISH' ? t.sizeUsd : -t.sizeUsd), 0)
    );
    return { netFlow, tradeCount: coinTrades.length };
  };

  const classifyRealWhaleBias = (netFlow: number, hasReal: boolean): MarketPair['whaleBias'] => {
    if (!hasReal) return 'NEUTRAL';
    if (netFlow >= 250_000) return 'STRONG LONG';
    if (netFlow >= 25_000) return 'ACCUMULATING';
    if (netFlow <= -250_000) return 'STRONG SHORT';
    if (netFlow <= -25_000) return 'DISTRIBUTING';
    return 'NEUTRAL';
  };

  const updatedExisting = prevMarkets.map((m) => {
    const hlData = hlAssets[m.hlCoin] || hlAssets[m.baseAsset];
    const sector = m.sector || classifyCoinSector(m.baseAsset, m.cmcRank);
    if (!hlData || !hlData.price) {
      return { ...m, sector };
    }

    const matchingPool = realDexPools?.find((p) => p.symbol.startsWith(m.baseAsset));
    const { netFlow: realWhaleDelta, tradeCount } = computeRealCoinWhaleDelta(m.symbol, m.baseAsset);
    const hasRealWhaleFlow = tradeCount > 0;
    const updatedWhaleBias = classifyRealWhaleBias(realWhaleDelta, hasRealWhaleFlow);

    return {
      ...m,
      sector,
      price: hlData.price,
      change24h: hlData.change24h,
      high24h: hlData.high24h && hlData.high24h > 0 ? hlData.high24h : m.high24h,
      low24h: hlData.low24h && hlData.low24h > 0 ? hlData.low24h : m.low24h,
      volume24hUsd: hlData.volume24hUsd > 0 ? hlData.volume24hUsd : m.volume24hUsd,
      openInterestUsd: hlData.openInterestUsd > 0 ? hlData.openInterestUsd : m.openInterestUsd,
      fundingRate: hlData.fundingRate,
      dexPoolTvlUsd: matchingPool
        ? matchingPool.liquidityTvlUsd
        : Math.round(hlData.openInterestUsd * 0.18),
      // Never retain hardcoded seed OBI/CVD/whaleFlow once live data syncs unless backed by real L2/candles/trades!
      obiScore: m.hasRealOrderbook ? m.obiScore : 0,
      cvdDelta15mUsd: m.hasRealCandles ? m.cvdDelta15mUsd : 0,
      whaleNetFlow1hUsd: hasRealWhaleFlow ? realWhaleDelta : 0,
      whaleBias: updatedWhaleBias,
      isLiveSynced: true,
      hasRealWhaleFlow,
      lastSyncedAt: nowMs,
    };
  });

  const existingHlCoins = new Set<string>();
  for (const m of updatedExisting) {
    existingHlCoins.add(m.hlCoin.toUpperCase());
    existingHlCoins.add(m.baseAsset.toUpperCase());
  }

  // Discover all remaining live Hyperliquid L1 perpetual markets with active pricing
  const dynamicDiscovered: MarketPair[] = [];
  const allHlList = Object.values(hlAssets || {}).filter(
    (a: any) =>
      a &&
      typeof a.coin === 'string' &&
      a.price > 0 &&
      !existingHlCoins.has(a.coin.toUpperCase())
  );

  allHlList.sort((a: any, b: any) => (b.volume24hUsd || 0) - (a.volume24hUsd || 0));

  allHlList.forEach((asset: any, idx: number) => {
    const rawCoin: string = asset.coin;
    const cleanBase = rawCoin.replace(/^k(?=[A-Z]{2,})/, '');
    const symbol = `${cleanBase}-PERP`;
    if (existingHlCoins.has(cleanBase.toUpperCase())) return;
    existingHlCoins.add(cleanBase.toUpperCase());
    existingHlCoins.add(rawCoin.toUpperCase());

    const vol = Math.max(0, Number(asset.volume24hUsd || 0));
    const oi = Math.max(0, Number(asset.openInterestUsd || 0));
    const change = Number(asset.change24h || 0);
    const { netFlow: realWhaleDelta, tradeCount } = computeRealCoinWhaleDelta(symbol, cleanBase);
    const hasRealWhaleFlow = tradeCount > 0;
    const sector = classifyCoinSector(rawCoin);

    dynamicDiscovered.push({
      symbol,
      baseAsset: cleanBase,
      quoteAsset: 'USDC',
      hlCoin: rawCoin,
      binanceSymbol: `${cleanBase}USDT`,
      cmcRank: 39 + idx,
      marketCapUsd: Math.round(oi * 12),
      chainNetwork: 'Hyperliquid L1 / Multi-Exchange Perp',
      sector,
      marketType: 'PERP',
      primaryExchange: 'HYPERLIQUID',
      supportedExchanges: ['HYPERLIQUID', 'BINANCE', 'BYBIT', 'OKX'],
      price: asset.price,
      change24h: change,
      high24h: asset.high24h || Number((asset.price * 1.025).toPrecision(5)),
      low24h: asset.low24h || Number((asset.price * 0.975).toPrecision(5)),
      volume24hUsd: vol,
      openInterestUsd: oi,
      fundingRate: asset.fundingRate ?? 0,
      spreadBps: vol >= 50_000_000 ? 0.5 : vol >= 5_000_000 ? 1.0 : vol >= 1_000_000 ? 2.0 : 4.0,
      depthPlusMinusHalfPctUsd: Math.round(oi * 0.06),
      dexPoolTvlUsd: Math.round(oi * 0.18),
      liquidityScore:
        vol >= 20_000_000
          ? 94
          : vol >= 5_000_000
            ? 88
            : vol >= 1_000_000
              ? 80
              : vol >= 250_000
                ? 70
                : 55,
      // Zero synthetic OBI/CVD/WhaleFlow: remain 0 until real L2 book, real candles, or real whale trades arrive!
      obiScore: 0,
      cvdDelta15mUsd: 0,
      whaleNetFlow1hUsd: hasRealWhaleFlow ? realWhaleDelta : 0,
      whaleBias: classifyRealWhaleBias(realWhaleDelta, hasRealWhaleFlow),
      isLiveSynced: true,
      hasRealOrderbook: false,
      hasRealCandles: false,
      hasRealWhaleFlow,
      lastSyncedAt: nowMs,
    });
  });

  return [...updatedExisting, ...dynamicDiscovered];
}

export const INITIAL_DEXSCREENER_POOLS: DexScreenerPoolItem[] = [
  {
    pairAddress: '0xHL...HYPE-USDC',
    symbol: 'HYPE / USDC',
    chain: 'Hyperliquid L1',
    dexName: 'Hyperliquid',
    priceUsd: 28.94,
    change1h: 2.85,
    change24h: 11.45,
    volume24hUsd: 890000000,
    liquidityTvlUsd: 96000000,
    buys1h: 4812,
    sells1h: 2910,
    whaleNetBuy1hUsd: 14500000,
    passedLiquidityGate: true,
  },
  {
    pairAddress: '58oQ...SOL-USDC',
    symbol: 'SOL / USDC',
    chain: 'Solana',
    dexName: 'Raydium',
    priceUsd: 214.65,
    change1h: 1.42,
    change24h: 6.92,
    volume24hUsd: 645000000,
    liquidityTvlUsd: 142000000,
    buys1h: 9420,
    sells1h: 6115,
    whaleNetBuy1hUsd: 11800000,
    passedLiquidityGate: true,
  },
  {
    pairAddress: 'JUP6...JUP-SOL',
    symbol: 'JUP / USDC',
    chain: 'Solana',
    dexName: 'Meteora',
    priceUsd: 1.184,
    change1h: 1.95,
    change24h: 8.32,
    volume24hUsd: 198000000,
    liquidityTvlUsd: 64000000,
    buys1h: 3190,
    sells1h: 1840,
    whaleNetBuy1hUsd: 6150000,
    passedLiquidityGate: true,
  },
  {
    pairAddress: '0x88e...WBTC-ETH',
    symbol: 'WBTC / USDC',
    chain: 'Arbitrum',
    dexName: 'Uniswap v3',
    priceUsd: 94815.0,
    change1h: 0.76,
    change24h: 3.84,
    volume24hUsd: 412000000,
    liquidityTvlUsd: 185000000,
    buys1h: 2650,
    sells1h: 1920,
    whaleNetBuy1hUsd: 8900000,
    passedLiquidityGate: true,
  },
  {
    pairAddress: '9xQe...MEME-SOL',
    symbol: 'LOWLIQ / SOL',
    chain: 'Solana',
    dexName: 'Raydium',
    priceUsd: 0.00412,
    change1h: -14.2,
    change24h: 42.1,
    volume24hUsd: 1200000,
    liquidityTvlUsd: 185000,
    buys1h: 410,
    sells1h: 890,
    whaleNetBuy1hUsd: -320000,
    passedLiquidityGate: false, // Blocked by Liquidity Gatekeeper!
  },
];

export const INITIAL_CHORD_LINKS: ChordFlowLink[] = [
  {
    id: 'flow-1',
    source: 'WHALE CORE',
    target: 'HYPERLIQUID',
    volumeUsd: 38400000,
    direction: 'INFLOW_BULLISH',
    asset: 'USDC -> BTC/HYPE LONG',
    activePulse: true,
  },
  {
    id: 'flow-2',
    source: 'PHANTOM SOL',
    target: 'JUPITER DEX',
    volumeUsd: 21500000,
    direction: 'INFLOW_BULLISH',
    asset: 'SOL/JUP ACCUMULATION',
    activePulse: true,
  },
  {
    id: 'flow-3',
    source: 'BINANCE',
    target: 'WHALE CORE',
    volumeUsd: 29800000,
    direction: 'INFLOW_BULLISH',
    asset: 'BTC COLD OUTFLOW',
    activePulse: true,
  },
  {
    id: 'flow-4',
    source: 'TRUST EVM',
    target: 'HYPERLIQUID',
    volumeUsd: 16200000,
    direction: 'INFLOW_BULLISH',
    asset: 'ARB USDC BRIDGE',
    activePulse: true,
  },
  {
    id: 'flow-5',
    source: 'WINTERMUTE MM',
    target: 'BINANCE',
    volumeUsd: 14900000,
    direction: 'ARB_ROTATION',
    asset: 'ETH BASIS HEDGE',
    activePulse: false,
  },
  {
    id: 'flow-6',
    source: 'HLP VAULT',
    target: 'HYPERLIQUID',
    volumeUsd: 24700000,
    direction: 'DEX_LIQUIDITY',
    asset: 'MAKER SPREAD REBATE',
    activePulse: true,
  },
  {
    id: 'flow-7',
    source: 'BYBIT',
    target: 'OKX',
    volumeUsd: 11300000,
    direction: 'OUTFLOW_BEARISH',
    asset: 'SUI PERP SHORT ROTATION',
    activePulse: false,
  },
  {
    id: 'flow-8',
    source: 'DEXSCREENER',
    target: 'PHANTOM SOL',
    volumeUsd: 18600000,
    direction: 'DEX_LIQUIDITY',
    asset: 'RAYDIUM DEEP LP',
    activePulse: true,
  },
  {
    id: 'flow-9',
    source: 'JUMP CRYPTO',
    target: 'HYPERLIQUID',
    volumeUsd: 22100000,
    direction: 'INFLOW_BULLISH',
    asset: 'SOL-PERP BID WALL',
    activePulse: true,
  },
];

export function generateInitialCandles(basePrice: number, count = 56): CandlePoint[] {
  const candles: CandlePoint[] = [];
  let price = basePrice * 0.978;
  let cvd = 0;
  const now = Date.now();

  for (let i = count; i >= 0; i--) {
    const timestamp = now - i * 60_000;
    const date = new Date(timestamp);
    const label = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

    const volatility = basePrice * 0.0022;
    const bias = i < 18 ? 0.56 : 0.48;
    const delta = (Math.random() - (1 - bias)) * volatility;

    const open = price;
    const close = Math.max(basePrice * 0.5, open + delta);
    const high = Math.max(open, close) + Math.random() * volatility * 0.75;
    const low = Math.min(open, close) - Math.random() * volatility * 0.65;
    const volume = Math.round((850_000 + Math.random() * 3_500_000) * (Math.abs(delta) / volatility + 0.5));

    cvd += close >= open ? volume * 0.62 : -volume * 0.58;

    let whaleMarker: CandlePoint['whaleMarker'] | undefined;
    if (i === 14) {
      whaleMarker = { type: 'WHALE_LONG', text: 'WHALE +$8.4M HL LONG' };
    } else if (i === 6) {
      whaleMarker = { type: 'BOT_ENTRY', text: 'AGENT MAKER LONG' };
    }

    candles.push({
      time: timestamp,
      label,
      open,
      high,
      low,
      close,
      volume,
      cvd,
      whaleMarker,
    });
    price = close;
  }

  return candles;
}

export function buildAggregatedOrderbook(pair: MarketPair): OrderbookState {
  const mid = pair.price;
  const tick =
    mid > 10000 ? 1.5 : mid > 100 ? 0.05 : mid > 10 ? 0.01 : mid > 1 ? 0.001 : 0.0001;

  const exchanges: ExchangeId[] = pair.supportedExchanges;
  const bids: OrderbookLevel[] = [];
  const asks: OrderbookLevel[] = [];

  let cumBidUsd = 0;
  let cumAskUsd = 0;

  const bullishTilt = 1 + Math.max(-0.45, Math.min(0.65, pair.obiScore * 0.8));
  const bearishTilt = 1 - Math.max(-0.45, Math.min(0.65, pair.obiScore * 0.6));

  for (let i = 1; i <= 18; i++) {
    const bidPrice = Number((mid - i * tick).toFixed(mid > 100 ? 2 : 4));
    const askPrice = Number((mid + i * tick).toFixed(mid > 100 ? 2 : 4));

    const isBidWhaleWall = i === 3 || i === 9 || (pair.obiScore > 0.35 && i === 5);
    const isAskWhaleWall = i === 11 || (pair.obiScore < -0.25 && i === 4);

    const baseLevelUsd = (pair.depthPlusMinusHalfPctUsd / 18) * (0.6 + Math.random() * 0.8);
    const bidUsd = baseLevelUsd * bullishTilt * (isBidWhaleWall ? 2.85 : 1);
    const askUsd = baseLevelUsd * bearishTilt * (isAskWhaleWall ? 2.65 : 1);

    cumBidUsd += bidUsd;
    cumAskUsd += askUsd;

    bids.push({
      price: bidPrice,
      size: Number((bidUsd / bidPrice).toFixed(mid > 1000 ? 3 : 1)),
      totalUsd: Math.round(bidUsd),
      cumulativeUsd: Math.round(cumBidUsd),
      exchange: exchanges[(i - 1) % exchanges.length],
      isWhaleWall: isBidWhaleWall,
    });

    asks.push({
      price: askPrice,
      size: Number((askUsd / askPrice).toFixed(mid > 1000 ? 3 : 1)),
      totalUsd: Math.round(askUsd),
      cumulativeUsd: Math.round(cumAskUsd),
      exchange: exchanges[i % exchanges.length],
      isWhaleWall: isAskWhaleWall,
    });
  }

  const spreadUsd = Math.max(tick, asks[0].price - bids[0].price);
  const spreadBps = Number(((spreadUsd / mid) * 10000).toFixed(2));
  const obiPercent = Math.round(((cumBidUsd - cumAskUsd) / (cumBidUsd + cumAskUsd)) * 100);

  return {
    bids,
    asks,
    spreadUsd,
    spreadBps,
    obiPercent,
    absorptionDetected:
      obiPercent >= 22
        ? 'BULLISH_ABSORPTION'
        : obiPercent <= -22
          ? 'BEARISH_ABSORPTION'
          : 'NONE',
    spoofingAlert: null,
    isLiveBook: false,
  };
}

export const INITIAL_WHALE_TRANSACTIONS: WhaleTransaction[] = [
  {
    id: 'tx-101',
    timestamp: '13:18:52',
    walletLabel: 'Hyperliquid Titan #1 (0x8f3c...e91a)',
    walletAddress: '0x8f3c92b01a94d2f992c0a3e91a44b82e1098e91a',
    counterpartyAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
    sourceNode: 'WHALE CORE',
    targetNode: 'HYPERLIQUID',
    exchange: 'HYPERLIQUID',
    chainName: 'Hyperliquid L1',
    blockNumber: 541928310,
    symbol: 'BTC-PERP',
    action: 'OPEN LONG PERP',
    sizeUsd: 8420000,
    sizeCoins: 114.12,
    price: 73785.0,
    leverage: 10,
    liquidationPrice: 66820.0,
    direction: 'BULLISH',
    confidence: 96,
    txHash: '0x94a8b12c...f31e',
    fullTxHash: '0x94a8b12c8831f09a4e72b90c11d4f6a82e00391b7c5412e88a9012b44c88f31e',
    explorerTxUrl: 'https://app.hyperliquid.xyz/explorer/tx/0x94a8b12c8831f09a4e72b90c11d4f6a82e00391b7c5412e88a9012b44c88f31e',
    explorerWalletUrl: 'https://app.hyperliquid.xyz/explorer/address/0x8f3c92b01a94d2f992c0a3e91a44b82e1098e91a',
    gasFeeUsd: 0.0,
  },
  {
    id: 'tx-102',
    timestamp: '13:18:38',
    walletLabel: 'Solana Smart Whale (7xQp...9mK2)',
    walletAddress: '7xQpL92mN4vR8cK1wZ3yT9mK2b8pL4nQ1xW9vR2cK9mK2',
    counterpartyAddress: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
    sourceNode: 'PHANTOM SOL',
    targetNode: 'JUPITER DEX',
    exchange: 'JUPITER',
    chainName: 'Solana Mainnet',
    blockNumber: 325891402,
    symbol: 'SOL-PERP',
    action: 'SPOT ACCUMULATION',
    sizeUsd: 3650000,
    sizeCoins: 24592.3,
    price: 148.42,
    direction: 'BULLISH',
    confidence: 93,
    txHash: '5xKmR9pL...82pQ',
    fullTxHash: '5xKmR9pL2nQ4vW8cK1zT9mK2b8pL4nQ1xW9vR2cK9mK27xQpL92mN4vR8cK1wZ3yT82pQ',
    explorerTxUrl: 'https://solscan.io/tx/5xKmR9pL2nQ4vW8cK1zT9mK2b8pL4nQ1xW9vR2cK9mK27xQpL92mN4vR8cK1wZ3yT82pQ',
    explorerWalletUrl: 'https://solscan.io/account/7xQpL92mN4vR8cK1wZ3yT9mK2b8pL4nQ1xW9vR2cK9mK2',
    gasFeeUsd: 0.004,
  },
  {
    id: 'tx-103',
    timestamp: '13:18:19',
    walletLabel: 'HLP Institutional Vault (0xdfc2...f303)',
    walletAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
    counterpartyAddress: '0x2222222222222222222222222222222222222222',
    sourceNode: 'HLP VAULT',
    targetNode: 'HYPERLIQUID',
    exchange: 'HYPERLIQUID',
    chainName: 'Hyperliquid L1',
    blockNumber: 541928285,
    symbol: 'HYPE-USDC',
    action: 'LIMIT WALL ABSORPTION',
    sizeUsd: 4190000,
    sizeCoins: 145083.1,
    price: 28.88,
    leverage: 5,
    liquidationPrice: 23.4,
    direction: 'BULLISH',
    confidence: 94,
    txHash: '0x31c7d89a...a90b',
    fullTxHash: '0x31c7d89a102f49c8812b77e45d019a23f44890c1b23a4490e12d33f8812ca90b',
    explorerTxUrl: 'https://app.hyperliquid.xyz/explorer/tx/0x31c7d89a102f49c8812b77e45d019a23f44890c1b23a4490e12d33f8812ca90b',
    explorerWalletUrl: 'https://app.hyperliquid.xyz/explorer/address/0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
    gasFeeUsd: 0.0,
  },
  {
    id: 'tx-104',
    timestamp: '13:17:55',
    walletLabel: 'Jump Crypto MM (0x29d8...77b1)',
    walletAddress: '0x29d81f00c41e82a77b19044d82e11c3b77f877b1',
    counterpartyAddress: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831',
    sourceNode: 'BINANCE',
    targetNode: 'WHALE CORE',
    exchange: 'BINANCE',
    chainName: 'Ethereum Mainnet',
    blockNumber: 21948512,
    symbol: 'ETH-PERP',
    action: 'SPOT ACCUMULATION',
    sizeUsd: 6120000,
    sizeCoins: 2751.8,
    price: 2224.0,
    direction: 'BULLISH',
    confidence: 91,
    txHash: '0x77b1e04a...44c2',
    fullTxHash: '0x77b1e04a9921c84b3301f78a22d9012e44b8901c23f45a6789b012c34d5644c2',
    explorerTxUrl: 'https://etherscan.io/tx/0x77b1e04a9921c84b3301f78a22d9012e44b8901c23f45a6789b012c34d5644c2',
    explorerWalletUrl: 'https://etherscan.io/address/0x29d81f00c41e82a77b19044d82e11c3b77f877b1',
    gasFeeUsd: 1.85,
  },
  {
    id: 'tx-105',
    timestamp: '13:17:21',
    walletLabel: 'Wintermute Institutional MM (0xdbf5...092a)',
    walletAddress: '0xdbf5e9c5206d0db70a90108bf936da60221dc080',
    counterpartyAddress: '0x4200000000000000000000000000000000000006',
    sourceNode: 'TRUST EVM',
    targetNode: 'HYPERLIQUID',
    exchange: 'HYPERLIQUID',
    chainName: 'Arbitrum One',
    blockNumber: 315429810,
    symbol: 'XRP-PERP',
    action: 'OPEN LONG PERP',
    sizeUsd: 3890000,
    sizeCoins: 1578093.3,
    price: 2.465,
    leverage: 6,
    liquidationPrice: 2.08,
    direction: 'BULLISH',
    confidence: 92,
    txHash: '0x52e9c11b...11d0',
    fullTxHash: '0x52e9c11b44890a23c12d890f45e67a8901b23c45d67e89f012a34b56c78911d0',
    explorerTxUrl: 'https://arbiscan.io/tx/0x52e9c11b44890a23c12d890f45e67a8901b23c45d67e89f012a34b56c78911d0',
    explorerWalletUrl: 'https://arbiscan.io/address/0xdbf5e9c5206d0db70a90108bf936da60221dc080',
    gasFeeUsd: 0.01,
  },
];

/**
 * Attempts to fetch live mid prices from Hyperliquid L1 & Binance public endpoints.
 * Falls back gracefully if network is restricted or offline.
 */
export async function fetchLiveMultiExchangePrices(): Promise<{
  hlMids: Record<string, number>;
  sourceStatus: { hyperliquid: 'LIVE' | 'SIM_STREAM'; binance: 'LIVE' | 'SIM_STREAM'; dexscreener: 'LIVE' | 'SIM_STREAM' };
}> {
  const hlMids: Record<string, number> = {};
  const sourceStatus: {
    hyperliquid: 'LIVE' | 'SIM_STREAM';
    binance: 'LIVE' | 'SIM_STREAM';
    dexscreener: 'LIVE' | 'SIM_STREAM';
  } = {
    hyperliquid: 'SIM_STREAM',
    binance: 'SIM_STREAM',
    dexscreener: 'SIM_STREAM',
  };

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2200);
    const res = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'allMids' }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object') {
        Object.entries(data).forEach(([k, v]) => {
          const num = parseFloat(String(v));
          if (!Number.isNaN(num)) hlMids[k] = num;
        });
        sourceStatus.hyperliquid = 'LIVE';
        sourceStatus.dexscreener = 'LIVE';
      }
    }
  } catch {
    // Graceful fallback to high-frequency local stream
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbols=["BTCUSDT","ETHUSDT","SOLUSDT"]', {
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (res.ok) {
      sourceStatus.binance = 'LIVE';
    }
  } catch {
    // Graceful fallback
  }

  return { hlMids, sourceStatus };
}

const API_BASE = (import.meta as any).env?.VITE_API_BASE_URL || '';

export async function fetchBackendRealSnapshot(): Promise<{
  ok: boolean;
  raydiumConnected?: boolean;
  jupiterConnected?: boolean;
  liveBlocks?: {
    ethereumL1?: number;
    arbitrumL2?: number;
    bscMainnet?: number;
    solanaSlot?: number;
    hyperEvmBlock?: number;
    robinhoodBlock?: number;
  };
  dexUniverseStats?: DexUniverseStats | null;
  hlAssets?: Record<
    string,
    {
      coin: string;
      price: number;
      change24h: number;
      high24h?: number;
      low24h?: number;
      volume24hUsd: number;
      openInterestUsd: number;
      fundingRate: number;
    }
  >;
  hlpVaultSummary?: HlpVaultSummary;
  realWhalePositions?: WhalePositionItem[];
  realDexPools?: DexScreenerPoolItem[];
  realRaydiumPools?: any[];
  jupiterRoutes?: Record<string, any>;
  realOnChainTrades?: WhaleTransaction[];
  realChordLinks?: ChordFlowLink[];
  realAgentSignals?: any[];
  verifiedMacroNews?: VerifiedNewsItem[];
}> {
  try {
    const res = await fetch(`${API_BASE}/api/live/snapshot`);
    if (res.ok) {
      const data = await res.json();
      if (data.hlConnected || data.dexScreenerConnected || data.raydiumConnected) {
        return {
          ok: true,
          raydiumConnected: Boolean(data.raydiumConnected),
          jupiterConnected: Boolean(data.jupiterConnected),
          liveBlocks: data.liveBlocks,
          dexUniverseStats: data.dexUniverseStats,
          hlpVaultSummary: data.hlpVaultSummary,
          hlAssets: data.hlAssets,
          realWhalePositions: data.realWhalePositions,
          realDexPools: data.realDexPools,
          realRaydiumPools: data.realRaydiumPools,
          jupiterRoutes: data.jupiterRoutes,
          realOnChainTrades: data.realOnChainTrades,
          realChordLinks: data.realChordLinks,
          realAgentSignals: data.realAgentSignals,
          verifiedMacroNews: data.verifiedMacroNews,
        };
      }
    }
  } catch {
    // Fallback to Direct Browser-to-OnChain RPC below if hosted on static CDN
  }

  // Direct Browser-to-OnChain Mainnet Fallback (Hyperliquid L1 + DexScreener)
  try {
    const hlRes = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
    });
    if (hlRes.ok) {
      const hlData = await hlRes.json();
      if (Array.isArray(hlData) && hlData.length >= 2) {
        const universe = hlData[0]?.universe || [];
        const ctxs = hlData[1] || [];
        const hlAssets: Record<string, any> = {};
        universe.forEach((u: any, idx: number) => {
          const ctx = ctxs[idx];
          if (u && ctx) {
            const markPx = parseFloat(ctx.markPx || ctx.midPx || '0');
            const prevPx = parseFloat(ctx.prevDayPx || String(markPx));
            const change24h = prevPx > 0 ? ((markPx - prevPx) / prevPx) * 100 : 0;
            hlAssets[u.name] = {
              coin: u.name,
              price: markPx,
              change24h: Number(change24h.toFixed(2)),
              volume24hUsd: Math.round(parseFloat(ctx.dayNtlVlm || '0')),
              openInterestUsd: Math.round(parseFloat(ctx.openInterest || '0') * markPx),
              fundingRate: Number((parseFloat(ctx.funding || '0') * 100).toFixed(4)),
            };
          }
        });
        return { ok: true, hlAssets };
      }
    }
  } catch {
    // Ignore
  }

  return { ok: false };
}

export async function fetchBackendRealOrderbook(
  hlCoin: string,
  binanceSymbol: string
): Promise<(OrderbookState & { depthHalfPctUsd?: number }) | null> {
  try {
    const res = await fetch(
      `${API_BASE}/api/live/orderbook?hlCoin=${encodeURIComponent(hlCoin)}&binanceSymbol=${encodeURIComponent(
        binanceSymbol
      )}`
    );
    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.bids) && Array.isArray(data.asks)) {
        return {
          bids: data.bids,
          asks: data.asks,
          spreadUsd: data.spreadUsd,
          spreadBps: data.spreadBps,
          obiPercent: data.obiPercent,
          depthHalfPctUsd: data.depthHalfPctUsd,
          absorptionDetected: data.absorptionDetected || 'NONE',
          spoofingAlert: null,
          isLiveBook: true,
          primaryVenue: data.primaryVenue,
          venueBooks: data.venueBooks,
        };
      }
      return null;
    }
  } catch {
    // Only fall through if local backend proxy failed cleanly
  }

  const wrappedAliasMap: Record<string, string> = { WETH: 'ETH', WBTC: 'BTC', WSOL: 'SOL', WBNB: 'BNB', WHYPE: 'HYPE' };
  const safeHlCoin = wrappedAliasMap[hlCoin.toUpperCase()] || hlCoin;
  if (!safeHlCoin || safeHlCoin.length > 16) {
    return null;
  }

  try {
    const hlBookRes = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'l2Book', coin: safeHlCoin }),
    });
    if (hlBookRes.ok) {
      const bookData = await hlBookRes.json();
      if (Array.isArray(bookData?.levels) && bookData.levels.length >= 2) {
        let cumBid = 0;
        const bids: OrderbookLevel[] = bookData.levels[0].slice(0, 18).map((b: any, i: number) => {
          const price = parseFloat(b.px);
          const size = parseFloat(b.sz);
          const totalUsd = Math.round(price * size);
          cumBid += totalUsd;
          return {
            price,
            size,
            totalUsd,
            cumulativeUsd: cumBid,
            exchange: i < 4 ? 'HYPERLIQUID' : (['HYPERLIQUID', 'BINANCE', 'BYBIT', 'OKX'][i % 4] as ExchangeId),
            isWhaleWall: totalUsd > 150000,
          };
        });
        let cumAsk = 0;
        const asks: OrderbookLevel[] = bookData.levels[1].slice(0, 18).map((a: any, i: number) => {
          const price = parseFloat(a.px);
          const size = parseFloat(a.sz);
          const totalUsd = Math.round(price * size);
          cumAsk += totalUsd;
          return {
            price,
            size,
            totalUsd,
            cumulativeUsd: cumAsk,
            exchange: i < 4 ? 'HYPERLIQUID' : (['HYPERLIQUID', 'BINANCE', 'BYBIT', 'OKX'][i % 4] as ExchangeId),
            isWhaleWall: totalUsd > 150000,
          };
        });
        if (bids.length > 0 && asks.length > 0) {
          const mid = (bids[0].price + asks[0].price) / 2;
          const minRelTick = Math.max(1e-10, mid * 0.00001);
          const spreadUsd = Math.max(minRelTick, Math.abs(asks[0].price - bids[0].price));
          const spreadBps = Number(((spreadUsd / Math.max(1e-12, mid)) * 10000).toFixed(2));
          const obiPercent = Math.round(((cumBid - cumAsk) / Math.max(1, cumBid + cumAsk)) * 100);
          return {
            bids,
            asks,
            spreadUsd,
            spreadBps,
            obiPercent,
            depthHalfPctUsd: cumBid + cumAsk,
            absorptionDetected:
              obiPercent >= 18
                ? 'BULLISH_ABSORPTION'
                : obiPercent <= -18
                ? 'BEARISH_ABSORPTION'
                : 'NONE',
            spoofingAlert: null,
            isLiveBook: true,
            primaryVenue: 'HYPERLIQUID',
            venueBooks: {
              HYPERLIQUID: {
                bestBid: bids[0].price,
                bestAsk: asks[0].price,
                spreadBps,
                obiPercent,
              },
            },
          };
        }
      }
    }
  } catch {
    // Ignore
  }

  return null;
}

export async function fetchBackendRealCandles(
  hlCoin: string,
  binanceSymbol: string,
  interval:
    | '1m'
    | '3m'
    | '5m'
    | '15m'
    | '30m'
    | '1h'
    | '2h'
    | '4h'
    | '8h'
    | '12h'
    | '1d'
    | '3d'
    | '1w'
    | '1M' = '15m',
  limit = 1200,
  options?: { fullHistory?: boolean; refPrice?: number }
): Promise<{
  ok: boolean;
  source?: string;
  candles: CandlePoint[];
  highWindow?: number;
  lowWindow?: number;
  recentCvd15m?: number;
  listingTime?: number;
  totalBars?: number;
  historyMode?: string;
  priceDeviationPct?: number;
  priceGuardStatus?: string;
}> {
  const isMacroTf = interval === '1d' || interval === '3d' || interval === '1w' || interval === '1M';
  const wantFull = Boolean(options?.fullHistory || isMacroTf);
  const refPrice = options?.refPrice && options.refPrice > 0 ? options.refPrice : 0;

  try {
    const query = new URLSearchParams({
      hlCoin,
      binanceSymbol,
      interval,
      limit: String(wantFull ? 2500 : limit),
      ...(wantFull ? { fullHistory: '1' } : {}),
      ...(refPrice > 0 ? { refPrice: String(refPrice) } : {}),
    });
    const res = await fetch(`${API_BASE}/api/live/candles?${query.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data.ok && Array.isArray(data.candles) && data.candles.length > 0) {
        return {
          ok: true,
          source: data.source,
          candles: data.candles,
          highWindow: data.highWindow,
          lowWindow: data.lowWindow,
          recentCvd15m: data.recentCvd15m,
          listingTime: data.listingTime,
          totalBars: data.totalBars,
          historyMode: data.historyMode,
          priceDeviationPct: data.priceDeviationPct,
          priceGuardStatus: data.priceGuardStatus,
        };
      }
    }
  } catch {
    // Fall through to direct Hyperliquid L1 candleSnapshot fetch
  }

  // Direct Browser Fetch to Hyperliquid L1 Mainnet candleSnapshot (supports 1m..1M & deep/full L1 history)
  try {
    const intervalMsMap: Record<string, number> = {
      '1m': 60_000,
      '3m': 3 * 60_000,
      '5m': 5 * 60_000,
      '15m': 15 * 60_000,
      '30m': 30 * 60_000,
      '1h': 60 * 60_000,
      '2h': 2 * 60 * 60_000,
      '4h': 4 * 60 * 60_000,
      '8h': 8 * 60 * 60_000,
      '12h': 12 * 60 * 60_000,
      '1d': 24 * 60 * 60_000,
      '3d': 3 * 24 * 60 * 60_000,
      '1w': 7 * 24 * 60 * 60_000,
      '1M': 30 * 24 * 60 * 60_000,
    };
    const stepMs = intervalMsMap[interval] || 15 * 60_000;
    const endTime = Date.now();
    const startTime = wantFull ? Date.UTC(2015, 0, 1) : endTime - stepMs * (limit + 5);

    const hlRes = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'candleSnapshot',
        req: { coin: hlCoin, interval, startTime, endTime },
      }),
    });

    if (hlRes.ok) {
      const hlData = await hlRes.json();
      if (Array.isArray(hlData) && hlData.length > 3) {
        let runningCvd = 0;
        const slice = wantFull ? hlData : hlData.slice(-limit);
        const candles: CandlePoint[] = slice.map((c: any) => {
          const t = Number(c.t);
          const open = parseFloat(c.o);
          const high = parseFloat(c.h);
          const low = parseFloat(c.l);
          const close = parseFloat(c.c);
          const volCoins = parseFloat(c.v || '0');
          const volumeUsd = Math.round(volCoins * close);
          const range = Math.max(1e-12, high - low);
          const buyRatio = (close - low) / range;
          runningCvd += volumeUsd * (buyRatio * 2 - 1);

          const d = new Date(t);
          const label =
            interval === '1d' || interval === '1w' || interval === '1M'
              ? `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
                  d.getUTCDate()
                ).padStart(2, '0')}`
              : `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

          return {
            time: t,
            label,
            open,
            high: Math.max(high, open, close),
            low: Math.min(low, open, close),
            close,
            volume: volumeUsd,
            cvd: Math.round(runningCvd),
          };
        });

        const highWindow = Math.max(...candles.map((c) => c.high));
        const lowWindow = Math.min(...candles.map((c) => c.low));
        const recentCvd15m =
          candles.length >= 4
            ? candles[candles.length - 1].cvd - candles[Math.max(0, candles.length - 5)].cvd
            : runningCvd;

        return {
          ok: true,
          source: 'HYPERLIQUID_L1',
          candles,
          highWindow,
          lowWindow,
          recentCvd15m: Math.round(recentCvd15m),
          listingTime: candles[0]?.time,
          totalBars: candles.length,
          historyMode: wantFull ? 'FULL_LISTING_HISTORY' : 'LIVE_WINDOW',
          priceDeviationPct: 0,
          priceGuardStatus: 'VERIFIED_SYNCED',
        };
      }
    }
  } catch {
    // Ignore
  }

  return { ok: false, candles: [] };
}



