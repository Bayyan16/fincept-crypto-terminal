import { CandlestickChart, Compass, BrainCircuit, ClipboardList, Wallet, Activity, Terminal, ChevronDown, Columns2, Rows2, Settings, ArrowLeftRight } from 'lucide-react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AgentBrainDecision,
  AgentPosition,
  CandlePoint,
  ChordFlowLink,
  ClosedTradeLog,
  DexScreenerPoolItem,
  DexUniverseStats,
  ExecutionEnvironment,
  HlpVaultSummary,
  MarketPair,
  MarketSector,
  OrderbookState,
  VerifiedNewsItem,
  WalletConnectionState,
  WhalePositionItem,
  WhaleTransaction,
} from './types/terminal';
import {
  buildAggregatedOrderbook,
  fetchBackendRealCandles,
  fetchBackendRealOrderbook,
  fetchBackendRealSnapshot,
  fetchLiveMultiExchangePrices,
  INITIAL_CHORD_LINKS,
  INITIAL_DEXSCREENER_POOLS,
  INITIAL_MARKETS,
  INITIAL_WHALE_TRANSACTIONS,
  mergeDynamicAllCryptoMarkets,
} from './engine/liveConnectors';
import {
  computeAgentConfluenceMatrix,
  evaluateActivePositionDeepIntelligence,
  INITIAL_AGENT_POSITIONS,
  INITIAL_BRAIN_DECISIONS,
  INITIAL_CLOSED_TRADES,
  scanAllMarketMultiAgentCandidates,
  selectBestLowRiskHunterCandidate,
} from './engine/agentSkills';
import {
  computeClosedTradeSettlement,
  computeDailyRealizedPnlUsd,
  computePositionPnl,
  evaluateDailyDrawdownCircuitBreaker,
  getUtcTradingDayKey,
} from '../backend/positionMath.mjs';
import {
  auditActivePositionsAccuracy,
  buildVerifiedMacroNewsFeed,
  formatSmartPrice,
  INITIAL_VERIFIED_NEWS,
  runMultiAgentForumConsensus,
  runWalkForwardAccuracyBacktest,
} from './engine/multiAgentForum';
import { MultiAgentForumPanel } from './components/MultiAgentForumPanel';
import { VaultSettlementCourier3DViz } from './components/VaultSettlementCourier3DViz';
import {
  connectBrowserExtensionWallet,
  executeRealOrderOnVenue,
  FLEXIBLE_EVM_NETWORKS,
  loadSavedWallets,
  saveWalletsToVault,
  switchEvmWalletNetwork,
  verifyRealAccountWithBackend,
} from './engine/walletAdapter';
import {
  deriveWalletRlsOwnerScope,
  stampClosedTradeWithRls,
  stampPositionWithRls,
  verifyPositionRlsOwnership,
} from './engine/rlsSecurityGuard';
import { WhaleChordViz } from './components/WhaleChordViz';
import { CoinIcon, MarketTokenIcon } from './components/CoinIcon';
import {
  CandlestickOrderflowChart,
  ChartInterval,
} from './components/CandlestickOrderflowChart';
import { WalletConnectModal } from './components/WalletConnectModal';

const workspaceTabs = [
  { id: 'TERMINAL_DESK', label: 'Trading Desk', icon: CandlestickChart },
  { id: 'DEX_SCREENER', label: 'DEX Screener', icon: Compass },
  { id: 'AGENT_SKILLS', label: 'AI & Risk', icon: BrainCircuit },
  { id: 'PORTFOLIO_LOG', label: 'Execution Log', icon: ClipboardList },
  { id: 'PORTFOLIO_PROFILE', label: 'Portfolio', icon: Wallet },
] as const;

function buildMarketPairFromDexPool(
  pool: DexScreenerPoolItem,
  candles?: CandlePoint[],
  overrideSymbol?: string
): MarketPair {
  const baseAsset = (pool.baseSymbol || pool.symbol.split('/')[0] || 'TOK').trim();
  const wrappedAliasMap: Record<string, string> = { WETH: 'ETH', WBTC: 'BTC', WSOL: 'SOL', WBNB: 'BNB', WHYPE: 'HYPE' };
  const normalizedHlCoin = wrappedAliasMap[baseAsset.toUpperCase()] || baseAsset;
  const px = pool.priceUsd || 0;
  const high24h =
    candles && candles.length > 0 ? Math.max(...candles.map((c) => c.high)) : px * 1.03;
  const low24h =
    candles && candles.length > 0 ? Math.min(...candles.map((c) => c.low)) : px * 0.97;
  const flow1h = pool.whaleNetBuy1hUsd || 0;
  return {
    symbol: overrideSymbol || pool.symbol,
    baseAsset,
    quoteAsset: pool.quoteSymbol || 'USDC',
    hlCoin: normalizedHlCoin,
    binanceSymbol: `${normalizedHlCoin.replace(/^k(?=[A-Z]{2,})/, '').toUpperCase()}USDT`,
    chainNetwork: pool.chain,
    marketType: pool.pairAddress?.startsWith('HL-PERP-') ? 'PERP' : 'DEX_POOL',
    primaryExchange: 'DEXSCREENER',
    supportedExchanges: ['DEXSCREENER', 'HYPERLIQUID'],
    price: px,
    change24h: pool.change24h || 0,
    high24h,
    low24h,
    volume24hUsd: pool.volume24hUsd || 0,
    openInterestUsd: pool.liquidityTvlUsd || 0,
    fundingRate: 0,
    spreadBps: 4,
    depthPlusMinusHalfPctUsd: pool.liquidityTvlUsd || 0,
    dexPoolTvlUsd: pool.liquidityTvlUsd || 0,
    liquidityScore:
      pool.liquidityTvlUsd >= 500_000 ? 90 : pool.liquidityTvlUsd >= 100_000 ? 84 : 76,
    obiScore: 0.1,
    cvdDelta15mUsd: flow1h,
    whaleNetFlow1hUsd: flow1h,
    whaleBias: flow1h > 50_000 ? 'ACCUMULATING' : flow1h < -50_000 ? 'DISTRIBUTING' : 'NEUTRAL',
  };
}

/**
 * Live price display with a soft flash animation on every change so the
 * terminal feels alive instead of snapping digits instantly.
 */
function formatSignedUsd(value: number): string {
  const n = Number.isFinite(value) ? value : 0;
  return `${n >= 0 ? '+' : '-'}$${Math.abs(n).toFixed(2)}`;
}

function LivePrice({
  value,
  format,
  className = '',
}: {
  value: number;
  format: (v: number) => string;
  className?: string;
}) {
  const prevRef = useRef<number>(value);
  const [flash, setFlash] = useState<'up' | 'down' | 'flat'>('flat');
  useEffect(() => {
    if (value !== prevRef.current) {
      setFlash(value > prevRef.current ? 'up' : 'down');
      prevRef.current = value;
    }
  }, [value]);
  return (
    <span
      key={format(value)}
      className={`inline-block tabular-nums ${
        flash === 'up'
          ? 'price-flash-up'
          : flash === 'down'
            ? 'price-flash-down'
            : ''
      } ${className}`}
    >
      {format(value)}
    </span>
  );
}

export function App({
  simple = false,
  onEditionChange,
}: {
  simple?: boolean;
  onEditionChange?: (simple: boolean) => void;
} = {}) {
  const [markets, setMarkets] = useState<MarketPair[]>(INITIAL_MARKETS);
  const marketsRef = useRef<MarketPair[]>(INITIAL_MARKETS);
  marketsRef.current = markets;
  const [selectedSymbol, setSelectedSymbol] = useState<string>('BTC-PERP');
  const [chartTimeframe, setChartTimeframe] = useState<ChartInterval>('15m');
  const [isLoadingCandles, setIsLoadingCandles] = useState<boolean>(false);
  const [candleSource, setCandleSource] = useState<string>('HYPERLIQUID_L1');
  const [candleMeta, setCandleMeta] = useState<{
    listingTime?: number;
    priceGuardStatus?: string;
    priceDeviationPct?: number;
  }>({ priceGuardStatus: 'VERIFIED_SYNCED', priceDeviationPct: 0 });
  const candleReqSeqRef = useRef<number>(0);
  const activePriceRef = useRef<number>(INITIAL_MARKETS[0].price);
  const hasLiveSnapshotRef = useRef<boolean>(false);
  const initialStopSubmittedIdsRef = useRef<Set<string>>(new Set());
  const beStopSubmittedIdsRef = useRef<Set<string>>(new Set());
  const closingPositionIdsRef = useRef<Set<string>>(new Set());
  const entryInFlightSymbolsRef = useRef<Set<string>>(new Set());
  const autonomousEntryInFlightRef = useRef<boolean>(false);
  const [hunterRetryTick, setHunterRetryTick] = useState<number>(0);
  const positionsRef = useRef<AgentPosition[]>(INITIAL_AGENT_POSITIONS);

  const [activeTopTab, setActiveTopTab] = useState<
    'TERMINAL_DESK' | 'DEX_SCREENER' | 'AGENT_SKILLS' | 'PORTFOLIO_LOG' | 'PORTFOLIO_PROFILE'
  >('TERMINAL_DESK');
  const [activeSubTab, setActiveSubTab] = useState<
    'OVERVIEW' | 'ORDERBOOK_L2' | 'WHALE_TAPE' | 'AGENT_BRAIN'
  >('OVERVIEW');
  const [isSyncingProfile, setIsSyncingProfile] = useState<boolean>(false);

  const [candlesMap, setCandlesMap] = useState<Record<string, CandlePoint[]>>({});
  const candlesMapRef = useRef<Record<string, CandlePoint[]>>({});
  candlesMapRef.current = candlesMap;
  const [orderbook, setOrderbook] = useState<OrderbookState>(() =>
    buildAggregatedOrderbook(INITIAL_MARKETS[0])
  );
  const [whaleTxs, setWhaleTxs] = useState<WhaleTransaction[]>(INITIAL_WHALE_TRANSACTIONS);
  const whaleTxsRef = useRef<WhaleTransaction[]>(INITIAL_WHALE_TRANSACTIONS);
  whaleTxsRef.current = whaleTxs;
  const [whalePositions, setWhalePositions] = useState<WhalePositionItem[]>([]);
  const [hlpVaultSummary, setHlpVaultSummary] = useState<HlpVaultSummary | null>(null);
  const [liveBlocks, setLiveBlocks] = useState<{
    ethereumL1?: number;
    arbitrumL2?: number;
    bscMainnet?: number;
    solanaSlot?: number;
    hyperEvmBlock?: number;
    robinhoodBlock?: number;
  }>({});
  const [dexUniverseStats, setDexUniverseStats] = useState<DexUniverseStats | null>(null);
  const [dexChainFilter, setDexChainFilter] = useState<
    'all' | 'solana' | 'bsc' | 'hyperliquid' | 'robinhood' | 'ethereum'
  >('all');
  const [dexSearchQuery, setDexSearchQuery] = useState<string>('');
  const [dexUniverseItems, setDexUniverseItems] = useState<DexScreenerPoolItem[]>([]);
  const [isLoadingDexUniverse, setIsLoadingDexUniverse] = useState<boolean>(false);
  const [inspectedDexPool, setInspectedDexPool] = useState<DexScreenerPoolItem | null>(null);
  const [inspectedPoolTrades, setInspectedPoolTrades] = useState<any[]>([]);
  const [isLoadingPoolTrades, setIsLoadingPoolTrades] = useState<boolean>(false);
  const [selectedDexChartPool, setSelectedDexChartPool] = useState<DexScreenerPoolItem | null>(null);
  const [dexChartCandles, setDexChartCandles] = useState<CandlePoint[]>([]);
  const [dexChartInterval, setDexChartInterval] = useState<ChartInterval>('15m');
  const [dexChartSource, setDexChartSource] = useState<string>('ONCHAIN_DEX');
  const [dexChartMeta, setDexChartMeta] = useState<{
    listingTime?: number;
    priceGuardStatus?: string;
    priceDeviationPct?: number;
  }>({ priceGuardStatus: 'VERIFIED_SYNCED', priceDeviationPct: 0 });
  const [isLoadingDexChart, setIsLoadingDexChart] = useState<boolean>(false);
  const [customDeskPool, setCustomDeskPool] = useState<DexScreenerPoolItem | null>(null);
  const dexChartPanelRef = useRef<HTMLDivElement | null>(null);
  const [tapeChainFilter, setTapeChainFilter] = useState<string>('ALL');
  const [chordLinks, setChordLinks] = useState<ChordFlowLink[]>(INITIAL_CHORD_LINKS);
  const [dexPools, setDexPools] = useState<DexScreenerPoolItem[]>(INITIAL_DEXSCREENER_POOLS);
  const [jupiterRoutes, setJupiterRoutes] = useState<Record<string, any>>({});
  const [positions, setPositions] = useState<AgentPosition[]>(INITIAL_AGENT_POSITIONS);
  positionsRef.current = positions;
  const [closedTrades, setClosedTrades] = useState<ClosedTradeLog[]>(INITIAL_CLOSED_TRADES);
  const [brainDecisions, setBrainDecisions] = useState<AgentBrainDecision[]>(
    INITIAL_BRAIN_DECISIONS
  );
  const [verifiedNews, setVerifiedNews] = useState<VerifiedNewsItem[]>(INITIAL_VERIFIED_NEWS);
  const verifiedNewsRef = useRef<VerifiedNewsItem[]>(INITIAL_VERIFIED_NEWS);
  verifiedNewsRef.current = verifiedNews;
  const [watchlistSectorFilter, setWatchlistSectorFilter] = useState<
    'CORE_14' | 'ALL' | MarketSector | 'TOP_GAINERS'
  >('CORE_14');
  const [watchlistSearchQuery, setWatchlistSearchQuery] = useState<string>('');
  const [wallets, setWallets] = useState<WalletConnectionState[]>(() => loadSavedWallets());
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);

  // Real-Money Execution Mode & Capital Guardrails
  const [executionEnv, setExecutionEnv] = useState<ExecutionEnvironment>('PAPER_SANDBOX');
  const [orderSizeUsdInput, setOrderSizeUsdInput] = useState<number>(500);
  const [leverageInput, setLeverageInput] = useState<number>(6);
  const [maxDailyDrawdownUsd, setMaxDailyDrawdownUsd] = useState<number>(150);
  const [circuitBreakerTriggered, setCircuitBreakerTriggered] = useState<boolean>(false);
  const [isExecutingOrder, setIsExecutingOrder] = useState<boolean>(false);

  // Autonomous Agent Settings
  const [agentAutonomousEnabled, setAgentAutonomousEnabled] = useState(true);
  const [makerOnlyMode, setMakerOnlyMode] = useState(true);
  const [autoBreakevenTriggerPct, setAutoBreakevenTriggerPct] = useState(0.06);
  const [autoTakeProfitTriggerPct, setAutoTakeProfitTriggerPct] = useState(50);
  const [maxMicroLossScratchPct, setMaxMicroLossScratchPct] = useState(-0.04);
  const [minLiquidityScoreGate, setMinLiquidityScoreGate] = useState(65);
  const [maxConcurrentPositions, setMaxConcurrentPositions] = useState<number>(3);
  const [autoDirectHotWalletSettle, setAutoDirectHotWalletSettle] = useState<boolean>(true);
  const [lastClosedSymbol, setLastClosedSymbol] = useState<string | null>(null);
  const [hunterCountdownSec, setHunterCountdownSec] = useState<number | null>(null);
  const [selectedAuditTradeId, setSelectedAuditTradeId] = useState<string | undefined>(undefined);
  const [auditLogFilter, setAuditLogFilter] = useState<'ALL' | 'PROFIT_IN' | 'LOSS_OUT'>('ALL');

  // Command Bar Input
  const [commandInput, setCommandInput] = useState('');
  const [commandFeedback, setCommandFeedback] = useState<string | null>(null);
  const [nodeFilter, setNodeFilter] = useState<string | null>(null);
  const [, setClockStr] = useState('LIVE');

  // Resizable Active Positions Lower Dock (Drag Up/Down between Chart & Table)
  const [positionsDockHeightPx, setPositionsDockHeightPx] = useState<number>(215);
  const [isResizingPositionsDock, setIsResizingPositionsDock] = useState<boolean>(false);
  const positionsResizeStartRef = useRef<{ startY: number; startHeight: number }>({
    startY: 0,
    startHeight: 215,
  });
  const [deskSplit, setDeskSplit] = useState(58);
  const [deskSwapped, setDeskSwapped] = useState(false);
  const [deskStacked, setDeskStacked] = useState(false);
  const deskGridRef = useRef<HTMLDivElement>(null);
  const deskResizeRef = useRef<{ pointerId: number; startX: number; startSplit: number; width: number } | null>(null);
  const deskSettingsRef = useRef<HTMLDetailsElement>(null);
  const edition = simple ? 'simple' : 'pro';
  const [whalePanelVisibility, setWhalePanelVisibility] = useState({ simple: false, pro: true });
  const showWhalePanel = whalePanelVisibility[edition];
  const [tradeControlsVisibility, setTradeControlsVisibility] = useState(() => ({
    simple: localStorage.getItem('fincept:simple-trade-controls') === 'visible',
    pro: localStorage.getItem('fincept:trade-controls') !== 'hidden',
  }));
  const showTradeControls = tradeControlsVisibility[edition];
  const setShowWhalePanel = (visible: boolean) => {
    setWhalePanelVisibility((current) => ({ ...current, [edition]: visible }));
  };
  const setShowTradeControls = (visible: boolean) => {
    setTradeControlsVisibility((current) => ({ ...current, [edition]: visible }));
  };

  useEffect(() => {
    localStorage.setItem('fincept:simple-trade-controls', tradeControlsVisibility.simple ? 'visible' : 'hidden');
    localStorage.setItem('fincept:trade-controls', tradeControlsVisibility.pro ? 'visible' : 'hidden');
  }, [tradeControlsVisibility]);

  const resizeDesk = (percent: number) => setDeskSplit(Math.min(68, Math.max(35, percent)));
  const swapDeskPanes = () => setDeskSwapped((swapped) => !swapped);

  const marketPickerRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) return;
      for (const menu of [marketPickerRef.current, deskSettingsRef.current]) {
        if (menu && !menu.contains(event.target)) menu.open = false;
      }
    };
    document.addEventListener('pointerdown', closeOutside);
    return () => document.removeEventListener('pointerdown', closeOutside);
  }, []);

  const leftPaneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isResizingPositionsDock) return;

    const prevCursor = document.body.style.cursor;
    const prevUserSelect = document.body.style.userSelect;
    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';

    const handleGlobalMove = (e: PointerEvent) => {
      const deltaY = positionsResizeStartRef.current.startY - e.clientY;
      const paneH = leftPaneRef.current?.clientHeight || 680;
      const maxH = Math.max(110, paneH - 170);
      const nextH = Math.max(
        105,
        Math.min(maxH, positionsResizeStartRef.current.startHeight + deltaY)
      );
      setPositionsDockHeightPx(Math.round(nextH));
    };

    const handleGlobalUp = () => {
      setIsResizingPositionsDock(false);
    };

    window.addEventListener('pointermove', handleGlobalMove);
    window.addEventListener('pointerup', handleGlobalUp);
    window.addEventListener('pointercancel', handleGlobalUp);
    return () => {
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevUserSelect;
      window.removeEventListener('pointermove', handleGlobalMove);
      window.removeEventListener('pointerup', handleGlobalUp);
      window.removeEventListener('pointercancel', handleGlobalUp);
    };
  }, [isResizingPositionsDock]);

  const handlePositionsResizePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingPositionsDock(true);
    positionsResizeStartRef.current = {
      startY: e.clientY,
      startHeight: positionsDockHeightPx,
    };
  };

  const setPresetPositionsHeight = (mode: 'MIN' | 'SPLIT' | 'MAX') => {
    const paneH = leftPaneRef.current?.clientHeight || 680;
    if (mode === 'MIN') setPositionsDockHeightPx(105);
    else if (mode === 'SPLIT') setPositionsDockHeightPx(215);
    else setPositionsDockHeightPx(Math.max(110, paneH - 170));
  };
  const [, setLiveFeedMode] = useState<{
    hyperliquid: 'LIVE' | 'SIM_STREAM';
    binance: 'LIVE' | 'SIM_STREAM';
    dexscreener: 'LIVE' | 'SIM_STREAM';
  }>({
    hyperliquid: 'LIVE',
    binance: 'LIVE',
    dexscreener: 'LIVE',
  });

  const activePair = useMemo<MarketPair>(() => {
    const baseMatch = markets.find((m) => m.symbol === selectedSymbol);
    if (baseMatch) return baseMatch;
    if (customDeskPool) {
      const baseAsset = (customDeskPool.baseSymbol || customDeskPool.symbol.split('/')[0] || 'TOK').trim();
      return buildMarketPairFromDexPool(customDeskPool, undefined, `${baseAsset}-DEX`);
    }
    return markets[0];
  }, [markets, selectedSymbol, customDeskPool]);

  const activePosition = useMemo(
    () => positions.find((p) => p.symbol === activePair.symbol),
    [positions, activePair.symbol]
  );

  const confluence = useMemo(
    () => computeAgentConfluenceMatrix(activePair, orderbook, whaleTxs),
    [activePair, orderbook, whaleTxs]
  );

  const nextLowRiskCandidate = useMemo(
    () =>
      selectBestLowRiskHunterCandidate(
        markets,
        positions,
        lastClosedSymbol,
        minLiquidityScoreGate,
        orderSizeUsdInput,
        verifiedNews,
        candlesMap
      ),
    [
      markets,
      positions,
      lastClosedSymbol,
      minLiquidityScoreGate,
      orderSizeUsdInput,
      verifiedNews,
      candlesMap,
    ]
  );

  activePriceRef.current = activePair.price;

  const candleKey = `${activePair.symbol}_${chartTimeframe}`;
  const rawCurrentCandles = candlesMap[candleKey] || [];
  // Real-time tick lock: keep rightmost live candle synchronized with live on-chain mark price (within 12% guard)
  const currentCandles = useMemo(() => {
    if (rawCurrentCandles.length === 0) return rawCurrentCandles;
    const livePx = activePair.price;
    if (!Number.isFinite(livePx) || livePx <= 0) return rawCurrentCandles;
    const last = rawCurrentCandles[rawCurrentCandles.length - 1];
    if (!last || !(last.close > 0)) return rawCurrentCandles;
    const devRatio = Math.abs(livePx - last.close) / Math.max(1e-12, last.close);
    if (devRatio === 0 || devRatio > 0.12) return rawCurrentCandles;
    const next = rawCurrentCandles.slice();
    next[next.length - 1] = {
      ...last,
      close: livePx,
      high: Math.max(last.high, livePx),
      low: Math.min(last.low, livePx),
    };
    return next;
  }, [rawCurrentCandles, activePair.price]);

  const forumConsensus = useMemo(
    () =>
      runMultiAgentForumConsensus(
        activePair,
        orderbook,
        whaleTxs,
        currentCandles,
        verifiedNews,
        whalePositions,
        orderSizeUsdInput
      ),
    [
      activePair,
      orderbook,
      whaleTxs,
      currentCandles,
      verifiedNews,
      whalePositions,
      orderSizeUsdInput,
    ]
  );

  const topMultiAgentOpportunities = useMemo(
    () =>
      scanAllMarketMultiAgentCandidates(
        markets,
        positions,
        lastClosedSymbol,
        minLiquidityScoreGate,
        orderSizeUsdInput,
        verifiedNews,
        candlesMap
      ),
    [
      markets,
      positions,
      lastClosedSymbol,
      minLiquidityScoreGate,
      orderSizeUsdInput,
      verifiedNews,
      candlesMap,
    ]
  );

  const positionAudits = useMemo(
    () =>
      auditActivePositionsAccuracy(
        positions,
        markets,
        candlesMap,
        verifiedNews,
        whaleTxs,
        whalePositions
      ),
    [positions, markets, candlesMap, verifiedNews, whaleTxs, whalePositions]
  );

  const walkForwardOutcomes = useMemo(
    () => runWalkForwardAccuracyBacktest(markets, candlesMap, orderSizeUsdInput),
    [markets, candlesMap, orderSizeUsdInput]
  );

  const displayedWatchlistMarkets = useMemo(() => {
    const q = watchlistSearchQuery.trim().toUpperCase();
    if (q) {
      return markets
        .filter(
          (m) =>
            m.symbol.toUpperCase().includes(q) ||
            m.baseAsset.toUpperCase().includes(q) ||
            (m.sector || '').toUpperCase().includes(q)
        )
        .slice(0, 28);
    }
    if (watchlistSectorFilter === 'CORE_14') {
      return markets.slice(0, 14);
    }
    if (watchlistSectorFilter === 'ALL') {
      return markets.slice(0, 42);
    }
    if (watchlistSectorFilter === 'TOP_GAINERS') {
      return [...markets].sort((a, b) => b.change24h - a.change24h).slice(0, 28);
    }
    return markets.filter((m) => m.sector === watchlistSectorFilter).slice(0, 28);
  }, [markets, watchlistSectorFilter, watchlistSearchQuery]);

  // 1. Fetch Real Historical (Up to Full Listing Archive) & Live OHLCV Candlesticks with Multi-Layer Price Guard
  useEffect(() => {
    let mounted = true;
    const isCustomDesk =
      customDeskPool && activePair.symbol === `${(customDeskPool.baseSymbol || customDeskPool.symbol.split('/')[0] || 'TOK').trim()}-DEX`;
    const isMacroTf =
      chartTimeframe === '1d' ||
      chartTimeframe === '3d' ||
      chartTimeframe === '1w' ||
      chartTimeframe === '1M';

    const loadRealCandles = async (showSpinner = false) => {
      const reqId = ++candleReqSeqRef.current;
      if (showSpinner) setIsLoadingCandles(true);
      // Only send client refPrice after live on-chain snapshot has synced (never send stale seed prices as refPrice!)
      const refPrice = hasLiveSnapshotRef.current || isCustomDesk ? activePriceRef.current : 0;
      let res: {
        ok: boolean;
        candles: CandlePoint[];
        source?: string;
        highWindow?: number;
        lowWindow?: number;
        recentCvd15m?: number;
        listingTime?: number;
        priceGuardStatus?: string;
        priceDeviationPct?: number;
      } = { ok: false, candles: [] };
      if (isCustomDesk && customDeskPool) {
        try {
          const addr = customDeskPool.fullPairAddress || customDeskPool.pairAddress;
          const cid = customDeskPool.chainId || customDeskPool.chain || 'solana';
          const hlCoin = customDeskPool.baseSymbol || customDeskPool.symbol.split('/')[0].trim();
          const q = new URLSearchParams({
            hlCoin,
            chain: cid,
            poolAddress: addr,
            interval: chartTimeframe,
            limit: isMacroTf ? '2500' : '1200',
            ...(isMacroTf ? { fullHistory: '1' } : {}),
            ...(refPrice > 0 ? { refPrice: String(refPrice) } : {}),
          });
          const r = await fetch(`/api/live/candles?${q.toString()}`);
          if (r.ok) res = await r.json();
        } catch {
          // ignore transient error
        }
      } else {
        res = await fetchBackendRealCandles(
          activePair.hlCoin,
          activePair.binanceSymbol,
          chartTimeframe,
          isMacroTf ? 2500 : 1200,
          { fullHistory: isMacroTf, refPrice }
        );
      }
      if (!mounted || reqId !== candleReqSeqRef.current) return;
      if (showSpinner) setIsLoadingCandles(false);

      if (res.ok && res.candles.length > 0) {
        if (res.source) setCandleSource(res.source);
        setCandleMeta({
          listingTime: res.listingTime || res.candles[0]?.time,
          priceGuardStatus: res.priceGuardStatus || 'VERIFIED_SYNCED',
          priceDeviationPct: typeof res.priceDeviationPct === 'number' ? res.priceDeviationPct : 0,
        });
        const latestCandle = res.candles[res.candles.length - 1];

        setCandlesMap((prev) => ({
          ...prev,
          [candleKey]: res.candles,
        }));

        // Layer 2 Client Price Integrity Guard:
        // Authoritative on-chain sources (Hyperliquid L1 / On-Chain DEX) or pre-snapshot cold boot always sync live price;
        // secondary fallbacks are guarded within +/- 12% of live on-chain snapshot price!
        const isAuthoritativeOnChain = Boolean(
          res.source && /^(HYPERLIQUID_L1|ONCHAIN_DEX|ONCHAIN_SWAPS)/.test(res.source)
        );
        setMarkets((prev) =>
          prev.map((m) => {
            if (m.symbol !== activePair.symbol) return m;
            const hasLivePx = hasLiveSnapshotRef.current && Number.isFinite(m.price) && m.price > 0;
            const candlePx = latestCandle.close;
            const isCloseSafe =
              Number.isFinite(candlePx) &&
              candlePx > 0 &&
              (isAuthoritativeOnChain ||
                !hasLivePx ||
                Math.abs(candlePx - m.price) / Math.max(1e-12, m.price) <= 0.12);
            return {
              ...m,
              price: isCloseSafe ? candlePx : m.price,
              high24h:
                !isMacroTf && res.highWindow && res.highWindow > 0 && isCloseSafe
                  ? res.highWindow
                  : m.high24h,
              low24h:
                !isMacroTf && res.lowWindow && res.lowWindow > 0 && isCloseSafe
                  ? res.lowWindow
                  : m.low24h,
              cvdDelta15mUsd:
                typeof res.recentCvd15m === 'number' ? res.recentCvd15m : m.cvdDelta15mUsd,
            };
          })
        );
      }
    };

    loadRealCandles(true);
    const interval = setInterval(() => loadRealCandles(false), isMacroTf ? 15_000 : 5000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [activePair.symbol, activePair.hlCoin, activePair.binanceSymbol, chartTimeframe, candleKey]);

  // 1B. Batch Real OHLCV Candle Sync for Top Scanner Markets (Ensures Multi-Market TA uses 100% Real Exchange Candles)
  useEffect(() => {
    let mounted = true;
    const syncBatchScannerCandles = async () => {
      try {
        const res = await fetch(
          '/api/live/batch-candles?coins=BTC,ETH,SOL,HYPE,XRP,DOGE,SUI,TAO,kPEPE,ONDO,AAVE,ARB&interval=15m&limit=64'
        );
        if (!res.ok || !mounted) return;
        const data = await res.json();
        if (data?.ok && data.candlesByCoin && typeof data.candlesByCoin === 'object') {
          setCandlesMap((prev) => {
            const next = { ...prev };
            for (const [coin, candles] of Object.entries(data.candlesByCoin)) {
              if (Array.isArray(candles) && candles.length > 0) {
                const cleanBase = coin.replace(/^k(?=[A-Z]{2,})/, '');
                const sym = cleanBase === 'HYPE' ? 'HYPE-USDC' : `${cleanBase}-PERP`;
                next[coin] = candles as CandlePoint[];
                if (!next[`${sym}_15m`]) {
                  next[`${sym}_15m`] = candles as CandlePoint[];
                }
              }
            }
            return next;
          });
        }
      } catch {
        // ignore transient error
      }
    };

    syncBatchScannerCandles();
    const timer = setInterval(syncBatchScannerCandles, 22_000);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, []);

  // 2. Live Backend Gateway Snapshot Sync (Hyperliquid L1 + Binance 24h + HLP Whale Vault + DexScreener)
  useEffect(() => {
    let mounted = true;
    let anchoredInitialPositions = false;

    const syncRealBackend = async () => {
      const snap = await fetchBackendRealSnapshot();
      if (!mounted) return;

      if (snap.ok && snap.hlAssets) {
        hasLiveSnapshotRef.current = true;
        setLiveFeedMode({
          hyperliquid: 'LIVE',
          binance: 'LIVE',
          dexscreener: snap.realDexPools?.length ? 'LIVE' : 'SIM_STREAM',
        });

        const nextMarkets = mergeDynamicAllCryptoMarkets(
          marketsRef.current,
          snap.hlAssets!,
          snap.realDexPools,
          snap.realOnChainTrades
        );
        setMarkets(nextMarkets);
        setVerifiedNews(
          buildVerifiedMacroNewsFeed(
            nextMarkets,
            snap.realOnChainTrades || whaleTxsRef.current,
            snap.verifiedMacroNews
          )
        );

        // Update the latest candle's close/high/low smoothly with live markPx ONLY if already anchored
        setCandlesMap((prev) => {
          const next = { ...prev };
          Object.keys(next).forEach((k) => {
            const sym = k.split('_')[0];
            const baseCoin = sym.split('-')[0];
            const pairDef = INITIAL_MARKETS.find((x) => x.symbol === sym);
            const hlKey = pairDef?.hlCoin || baseCoin;
            const hlData = snap.hlAssets?.[hlKey] || snap.hlAssets?.[ `k${baseCoin}` ];
            if (!hlData || !hlData.price) return;
            const list = next[k];
            if (!list || list.length === 0) return;
            const last = list[list.length - 1];
            // Guard: only update if live price is within 5% of last candle close (prevents synthetic jump)
            if (Math.abs(hlData.price - last.close) / Math.max(0.0001, last.close) < 0.05) {
              const updatedLast: CandlePoint = {
                ...last,
                close: hlData.price,
                high: Math.max(last.high, hlData.price),
                low: Math.min(last.low, hlData.price),
              };
              next[k] = [...list.slice(0, -1), updatedLast];
            }
          });
          return next;
        });

        // Anchor initial paper demo positions cleanly to live Mainnet prices on boot (0% honest start, valid protective SL)
        if (!anchoredInitialPositions) {
          anchoredInitialPositions = true;
          setPositions((prevPos) =>
            prevPos.map((p) => {
              const coin = p.symbol.split('-')[0];
              const hlData = snap.hlAssets?.[coin];
              if (!hlData || !hlData.price) return p;
              const livePx = hlData.price;
              const decimals = livePx > 100 ? 2 : livePx > 1 ? 3 : 4;
              const liveSide: 'LONG' | 'SHORT' =
                (hlData.change24h ?? 0) >= 0 ? 'LONG' : 'SHORT';
              const entryPx = Number(livePx.toFixed(decimals));
              const slMoveRatio = 0.012 / Math.max(1, p.leverage);
              const stopPx = Number(
                (liveSide === 'LONG'
                  ? entryPx * (1 - slMoveRatio)
                  : entryPx * (1 + slMoveRatio)
                ).toFixed(decimals)
              );
              const tpPx = Number(
                (liveSide === 'LONG'
                  ? entryPx * (1 + 0.5 / Math.max(1, p.leverage))
                  : Math.max(livePx * 0.3, entryPx * (1 - 0.5 / Math.max(1, p.leverage)))
                ).toFixed(decimals)
              );
              return {
                ...p,
                side: liveSide,
                entryPrice: entryPx,
                currentPrice: livePx,
                stopLossPrice: stopPx,
                takeProfitPrice: tpPx,
                breakevenLocked: false,
                unrealizedPnlPct: 0,
                unrealizedPnlUsd: 0,
                peakPnlPct: 0,
                statusReason: `[PAPER DEMO] Anchored Live @ $${entryPx.toLocaleString()} | Protective SL: $${stopPx.toLocaleString()} | Target: $${tpPx.toLocaleString()}`,
              };
            })
          );
        }

        if (snap.realDexPools && snap.realDexPools.length > 0) {
          setDexPools(snap.realDexPools);
        }

        if (snap.dexUniverseStats) {
          setDexUniverseStats(snap.dexUniverseStats);
        }

        if (snap.jupiterRoutes && Object.keys(snap.jupiterRoutes).length > 0) {
          setJupiterRoutes(snap.jupiterRoutes);
        }

        if (snap.realChordLinks && snap.realChordLinks.length > 0) {
          setChordLinks(snap.realChordLinks);
        }

        if (snap.liveBlocks) {
          setLiveBlocks(snap.liveBlocks);
        }

        if (snap.hlpVaultSummary) {
          setHlpVaultSummary(snap.hlpVaultSummary);
        }

        if (snap.realWhalePositions && snap.realWhalePositions.length > 0) {
          setWhalePositions(snap.realWhalePositions);
        }

        if (snap.realOnChainTrades && snap.realOnChainTrades.length > 0) {
          setWhaleTxs(snap.realOnChainTrades);
        } else if (snap.realWhalePositions && snap.realWhalePositions.length > 0) {
          const now = new Date();
          const tStr = `${String(now.getHours()).padStart(2, '0')}:${String(
            now.getMinutes()
          ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
          const topWhale = snap.realWhalePositions[0];
          setWhaleTxs((prev) => {
            const exists = prev.some(
              (w) =>
                w.walletLabel.includes('HLP Institutional') &&
                w.symbol === topWhale.symbol &&
                Math.abs(w.sizeUsd - topWhale.positionValueUsd) < 50000
            );
            if (exists) return prev;
            const liveWhaleTx: WhaleTransaction = {
              id: `hlp-live-${Date.now()}`,
              timestamp: tStr,
              walletLabel: topWhale.walletLabel,
              walletAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
              sourceNode: 'HLP VAULT',
              targetNode: 'HYPERLIQUID',
              exchange: 'HYPERLIQUID',
              symbol: topWhale.symbol,
              action: topWhale.side === 'LONG' ? 'OPEN LONG PERP' : 'OPEN SHORT PERP',
              sizeUsd: topWhale.positionValueUsd,
              price: topWhale.entryPrice,
              direction: topWhale.side === 'LONG' ? 'BULLISH' : 'BEARISH',
              confidence: 97,
              txHash: '0xdfc2...f303 (L1 State)',
            };
            return [liveWhaleTx, ...prev.slice(0, 18)];
          });
        }

        if (snap.realAgentSignals && snap.realAgentSignals.length > 0) {
          setBrainDecisions((prev) => {
            const merged = [...snap.realAgentSignals!, ...prev];
            const uniqueByHeadline = new Map<string, AgentBrainDecision>();
            for (const item of merged) {
              if (!uniqueByHeadline.has(item.headline)) {
                uniqueByHeadline.set(item.headline, item);
              }
            }
            return Array.from(uniqueByHeadline.values()).slice(0, 12);
          });
        }
      } else {
        const { hlMids, sourceStatus } = await fetchLiveMultiExchangePrices();
        if (!mounted) return;
        setLiveFeedMode(sourceStatus);
        if (Object.keys(hlMids).length > 0) {
          setMarkets((prev) =>
            prev.map((m) => (hlMids[m.hlCoin] ? { ...m, price: hlMids[m.hlCoin] } : m))
          );
        }
      }
    };

    syncRealBackend();
    const interval = setInterval(syncRealBackend, 2500);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // 3. Live Merged L2 Orderbook Sync from Backend (/api/live/orderbook)
  useEffect(() => {
    let mounted = true;
    const syncOrderbook = async () => {
      const realBook = await fetchBackendRealOrderbook(
        activePair.hlCoin,
        activePair.binanceSymbol
      );
      if (!mounted) return;
      if (realBook && realBook.bids.length > 0 && realBook.asks.length > 0) {
        setOrderbook(realBook);
        // Update real L2 orderbook depth and OBI on the active market pair
        setMarkets((prev) =>
          prev.map((m) =>
            m.symbol === activePair.symbol
              ? {
                  ...m,
                  spreadBps: realBook.spreadBps,
                  obiScore: Number((realBook.obiPercent / 100).toFixed(2)),
                  depthPlusMinusHalfPctUsd:
                    realBook.depthHalfPctUsd && realBook.depthHalfPctUsd > 0
                      ? realBook.depthHalfPctUsd
                      : m.depthPlusMinusHalfPctUsd,
                }
              : m
          )
        );
      }
    };
    syncOrderbook();
    const timer = setInterval(syncOrderbook, 1800);
    return () => {
      mounted = false;
      clearInterval(timer);
    };
  }, [activePair.symbol, activePair.hlCoin, activePair.binanceSymbol]);

  const dispatchRealProtectiveStop = async (
    pos: AgentPosition,
    targetStopPrice: number,
    stage: 'INITIAL' | 'BREAKEVEN'
  ) => {
    const trackerRef =
      stage === 'INITIAL' ? initialStopSubmittedIdsRef : beStopSubmittedIdsRef;
    const alreadyHasOrder =
      stage === 'INITIAL'
        ? Boolean(pos.initialStopOrderId || pos.stopOrderId)
        : Boolean(pos.stopOrderId);
    if (!pos.isRealMoney || alreadyHasOrder || trackerRef.current.has(pos.id)) return;
    if (!Number.isFinite(targetStopPrice) || targetStopPrice <= 0) return;

    trackerRef.current.add(pos.id);
    const matchedMkt = markets.find((m) => m.symbol === pos.symbol);
    const rawBase = pos.symbol.split('-')[0];
    const fallbackBinSym = /^k[A-Z]{2,}$/.test(rawBase)
      ? `1000${rawBase.slice(1)}USDT`
      : `${rawBase.toUpperCase()}USDT`;
    const stopRes = await executeRealOrderOnVenue({
      exchange: pos.exchange,
      symbol: pos.symbol,
      binanceSymbol: matchedMkt?.binanceSymbol || fallbackBinSym,
      side: pos.side,
      orderPurpose: 'BREAKEVEN_STOP',
      sizeUsd: pos.sizeUsd,
      quantity: pos.executedQty,
      price: pos.currentPrice,
      stopPrice: targetStopPrice,
      marketType: pos.venueMode === 'SPOT' ? 'SPOT' : pos.marketType,
      venueMode: pos.venueMode,
      wallets,
      useTestnet: executionEnv === 'EXCHANGE_TESTNET',
      rowOwnerScope: pos.rlsOwnerScope,
    });
    if (stopRes.ok && stopRes.orderId) {
      setPositions((prev) =>
        prev.map((p) =>
          p.id === pos.id
            ? stage === 'INITIAL'
              ? { ...p, initialStopOrderId: stopRes.orderId }
              : { ...p, stopOrderId: stopRes.orderId, breakevenLocked: true }
            : p
        )
      );
      setCommandFeedback(
        stage === 'INITIAL'
          ? `✓ Initial Protective Stop-Loss (#${stopRes.orderId}) aktif di ${pos.exchange} @ $${targetStopPrice}`
          : `✓ Exchange Stop-Loss upgraded (BREAKEVEN_STOP #${stopRes.orderId}) di ${pos.exchange} @ $${targetStopPrice}`
      );
    } else {
      // Allow retry later if exchange transiently rejected stop placement
      setTimeout(() => trackerRef.current.delete(pos.id), 15_000);
      setCommandFeedback(
        `[${stage === 'INITIAL' ? 'INITIAL STOP' : 'BREAKEVEN STOP'} FAILED] ${pos.symbol} di ${pos.exchange}: ${stopRes.error || 'Rejected'}`
      );
    }
  };

  // 4. Clock, Mark-to-Market & Deep Position Intelligence Loop (1000ms — Pure Functional State Update)
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setClockStr(
        `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(
          2,
          '0'
        )}:${String(now.getSeconds()).padStart(2, '0')} LIVE`
      );

      // Pure functional updater preserves any queued async additions, removals, or stopOrderId updates
      setPositions((prevPos) =>
        prevPos.map((pos) => {
          const mkt = markets.find((m) => m.symbol === pos.symbol);
          const curPrice = mkt ? mkt.price : pos.currentPrice;
          const pnlCalc = computePositionPnl({
            side: pos.side,
            entryPrice: pos.entryPrice,
            currentPrice: curPrice,
            sizeUsd: pos.sizeUsd,
            leverage: pos.leverage,
            executedQty: pos.executedQty,
          });
          const pnlPct = pnlCalc.roePct;
          const pnlUsd = pnlCalc.pnlUsd;
          const peak = Math.max(pos.peakPnlPct, pnlPct);

          const shouldLockBe = pos.breakevenLocked || pnlPct >= autoBreakevenTriggerPct;
          const bePrice = formatSmartPrice(
            pos.side === 'LONG' ? pos.entryPrice * 1.0004 : pos.entryPrice * 0.9996
          );

          const updatedBase: AgentPosition = {
            ...pos,
            currentPrice: curPrice,
            unrealizedPnlPct: pnlPct,
            unrealizedPnlUsd: pnlUsd,
            peakPnlPct: peak,
            breakevenLocked: shouldLockBe,
            stopLossPrice: shouldLockBe ? bePrice : pos.stopLossPrice,
          };

          const deepEval = evaluateActivePositionDeepIntelligence(
            updatedBase,
            mkt,
            whaleTxs,
            autoTakeProfitTriggerPct,
            maxMicroLossScratchPct
          );

          return {
            ...updatedBase,
            aiHoldDecision: deepEval.decision,
            orderbookDefenseScore: deepEval.orderbookDefenseScore,
            whaleConvictionScore: deepEval.whaleConvictionScore,
            sentimentScore: deepEval.sentimentScore,
            marketSentimentLabel: deepEval.marketSentimentLabel,
            aiDecisionReason: deepEval.reason,
          };
        })
      );
    }, 1000);

    return () => clearInterval(timer);
  }, [
    markets,
    whaleTxs,
    autoBreakevenTriggerPct,
    autoTakeProfitTriggerPct,
    maxMicroLossScratchPct,
  ]);

  // 4A. Committed-State Automated Execution Dispatcher (BREAKEVEN_STOP + Auto-TP/Scratch Exits)
  // React 18 batching-safe & guarded by in-flight locks (`beStopSubmittedIdsRef` & `closingPositionIdsRef`)
  useEffect(() => {
    let dispatchedAutoClose = false;
    for (const pos of positions) {
      if (closingPositionIdsRef.current.has(pos.id)) continue;

      // 1) Immediately submit initial protective exchange stop-loss on entry (independent of breakevenLocked)
      if (
        pos.isRealMoney &&
        !pos.breakevenLocked &&
        pos.stopLossPrice > 0 &&
        !pos.initialStopOrderId &&
        !pos.stopOrderId &&
        !initialStopSubmittedIdsRef.current.has(pos.id)
      ) {
        void dispatchRealProtectiveStop(pos, pos.stopLossPrice, 'INITIAL');
      }

      // 2) Upgrade exchange stop-loss to Breakeven+Fee once autoBreakevenTriggerPct activates
      if (
        pos.isRealMoney &&
        pos.breakevenLocked &&
        !pos.stopOrderId &&
        !beStopSubmittedIdsRef.current.has(pos.id)
      ) {
        const bePrice =
          pos.stopLossPrice && pos.stopLossPrice > 0
            ? pos.stopLossPrice
            : formatSmartPrice(
                pos.side === 'LONG' ? pos.entryPrice * 1.0004 : pos.entryPrice * 0.9996
              );
        void dispatchRealProtectiveStop(pos, bePrice, 'BREAKEVEN');
      }

      if (agentAutonomousEnabled && !dispatchedAutoClose) {
        const openedTs = Number((pos.id.match(/(\d{13})/) || [])[1] || 0);
        const posAgeMs = openedTs > 0 ? Date.now() - openedTs : 60_000;
        const allowAutoCut = posAgeMs >= 15_000 || pos.unrealizedPnlPct <= -1.5;

        if (pos.aiHoldDecision === 'AUTO_TAKE_PROFIT_NOW') {
          dispatchedAutoClose = true;
          void handleScratchOrClosePosition(pos, 'PROFIT_LOCK');
        } else if (pos.aiHoldDecision === 'AUTO_CUT_INVALIDATED' && allowAutoCut) {
          dispatchedAutoClose = true;
          void handleScratchOrClosePosition(pos, 'SCRATCH');
        }
      }
    }
  }, [positions, agentAutonomousEnabled, wallets, executionEnv, markets]);

  // 4B. Live Daily Drawdown Circuit Breaker Monitor
  // Halts new manual & autonomous entries when daily net loss exceeds maxDailyDrawdownUsd,
  // while keeping automatic protective exits (scratch/TP/BE) active for open positions.
  useEffect(() => {
    const isRealEnv = executionEnv !== 'PAPER_SANDBOX';
    const relevantPositions = isRealEnv
      ? positions.filter((p) => p.isRealMoney)
      : positions.filter((p) => !p.isRealMoney);
    const unrealizedSum = relevantPositions.reduce((s, p) => s + p.unrealizedPnlUsd, 0);
    const realizedSum = computeDailyRealizedPnlUsd({
      closedTrades,
      isRealEnv,
      tradingDayKey: getUtcTradingDayKey(),
    });
    const check = evaluateDailyDrawdownCircuitBreaker({
      realizedPnlUsd: realizedSum,
      unrealizedPnlUsd: unrealizedSum,
      maxDailyDrawdownUsd,
    });
    if (check.triggered && !circuitBreakerTriggered) {
      setCircuitBreakerTriggered(true);
      setCommandFeedback(
        `🚨 [CIRCUIT BREAKER TRIPPED] Kerugian harian ($${check.netPnlUsd.toFixed(2)}) melampaui batas -$${check.limitUsd}. Entry baru dihentikan; proteksi exit posisi terbuka tetap aktif.`
      );
    }
  }, [
    positions,
    closedTrades,
    maxDailyDrawdownUsd,
    executionEnv,
    circuitBreakerTriggered,
  ]);

  // Execute Real or Paper Order across ALL synced DEX & CEX markets
  const handleManualAgentEntry = async (
    side: 'LONG' | 'SHORT',
    targetPairOverride?: MarketPair,
    leverageOverride?: number,
    isExplicitUserEntry = true
  ): Promise<boolean> => {
    const targetPair = targetPairOverride || activePair;
    const targetLeverage = leverageOverride || leverageInput;

    if (circuitBreakerTriggered) {
      setCommandFeedback(
        '[CIRCUIT BREAKER ACTIVE] Daily drawdown limit reached. Reset Risk Guard before opening new positions.'
      );
      return false;
    }

    if (!targetPair || !Number.isFinite(targetPair.price) || targetPair.price <= 0) {
      setCommandFeedback(
        `[WAITING PRICE] Harga live untuk ${targetPair?.symbol || 'market'} belum tersedia.`
      );
      return false;
    }

    if (entryInFlightSymbolsRef.current.has(targetPair.symbol)) {
      setCommandFeedback(
        `[IN-FLIGHT LOCK] Order ${targetPair.symbol} sedang diproses di ${targetPair.primaryExchange}. Menunggu konfirmasi untuk mencegah duplikasi.`
      );
      return false;
    }

    const livePositions = positionsRef.current;
    const alreadyOpenSameSymbol = livePositions.some((p) => p.symbol === targetPair.symbol);
    const maxManualSlots = Math.max(maxConcurrentPositions, 8);
    if (!isExplicitUserEntry && !alreadyOpenSameSymbol && livePositions.length >= maxConcurrentPositions) {
      setCommandFeedback(
        `[MAX ${maxConcurrentPositions} LOW-RISK SLOTS FULL] Tutup / Take Profit salah satu posisi terlebih dahulu untuk menjaga batas risiko <= ${maxConcurrentPositions} posisi.`
      );
      return false;
    }
    if (isExplicitUserEntry && !alreadyOpenSameSymbol && livePositions.length >= maxManualSlots) {
      setCommandFeedback(
        `[MAX ${maxManualSlots} POSISI AKTIF TERCAPAI] Tutup salah satu posisi terlebih dahulu sebelum menambah posisi baru.`
      );
      return false;
    }

    if (!isExplicitUserEntry && targetPair.liquidityScore < minLiquidityScoreGate) {
      setCommandFeedback(
        `[BLOCKED] ${targetPair.symbol} Liquidity Score (${targetPair.liquidityScore}) < Gate (${minLiquidityScoreGate})`
      );
      return false;
    }

    // Prevent stale cross-coin orderbook quotes when switching symbols rapidly (must be within +/- 5% of targetPair.price)
    const isSameAsActive = targetPair.symbol === activePair.symbol;
    const rawBookPx = isSameAsActive
      ? side === 'LONG'
        ? orderbook.bids[0]?.price
        : orderbook.asks[0]?.price
      : undefined;
    const isBookPxValidForPair =
      typeof rawBookPx === 'number' &&
      rawBookPx > 0 &&
      Math.abs(rawBookPx - targetPair.price) / Math.max(0.0000001, targetPair.price) <= 0.05;
    const entry = formatSmartPrice(isBookPxValidForPair ? rawBookPx! : targetPair.price);

    const slPriceMoveRatio = Math.max(
      0.004,
      Math.abs(maxMicroLossScratchPct || 0.95) / (100 * Math.max(1, targetLeverage))
    );
    const initialProtectiveStop = formatSmartPrice(
      side === 'LONG' ? entry * (1 - slPriceMoveRatio) : entry * (1 + slPriceMoveRatio)
    );
    const minTpPriceMoveRatio = Math.max(0.5, autoTakeProfitTriggerPct) / (100 * Math.max(1, targetLeverage));
    const tp = formatSmartPrice(
      side === 'LONG'
        ? entry * (1 + minTpPriceMoveRatio * 1.6)
        : Math.max(entry * 0.25, entry * (1 - minTpPriceMoveRatio * 1.6))
    );

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    let realOrderId = `PAPER-${Date.now()}`;
    let executedQty = Number((orderSizeUsdInput / entry).toFixed(8));
    let executedPrice = entry;
    let resolvedVenueMode: 'FUTURES' | 'SPOT' =
      targetPair.marketType === 'SPOT' ? 'SPOT' : 'FUTURES';
    const isReal = executionEnv !== 'PAPER_SANDBOX';

    if (isReal) {
      entryInFlightSymbolsRef.current.add(targetPair.symbol);
      setIsExecutingOrder(true);
      setCommandFeedback(
        `Signing & transmitting ${executionEnv} ${side} order ($${orderSizeUsdInput}) to ${targetPair.primaryExchange}...`
      );
      let execRes: Awaited<ReturnType<typeof executeRealOrderOnVenue>>;
      try {
        execRes = await executeRealOrderOnVenue({
          exchange: targetPair.primaryExchange,
          symbol: targetPair.symbol,
          binanceSymbol: targetPair.binanceSymbol,
          side,
          orderPurpose: 'ENTRY_MAKER',
          sizeUsd: orderSizeUsdInput,
          price: entry,
          leverage: targetPair.marketType === 'SPOT' ? 1 : targetLeverage,
          makerOnly: makerOnlyMode,
          marketType: targetPair.marketType,
          refMarkPrice: targetPair.price,
          wallets,
          useTestnet: executionEnv === 'EXCHANGE_TESTNET',
        });
      } finally {
        entryInFlightSymbolsRef.current.delete(targetPair.symbol);
        setIsExecutingOrder(false);
      }

      if (!execRes.ok) {
        setCommandFeedback(`[REAL ORDER REJECTED] ${execRes.error}`);
        setBrainDecisions((prev) => [
          {
            id: `bd-err-${Date.now()}`,
            timestamp: timeStr,
            symbol: targetPair.symbol,
            category: 'EXECUTION',
            headline: `Order Real-Money Ditolak pada ${targetPair.primaryExchange}`,
            detail: execRes.error || 'Periksa kredensial API Key / Wallet Anda.',
            score: 0,
            tone: 'WARN',
          },
          ...prev,
        ]);
        return false;
      }
      realOrderId = execRes.orderId || `LIVE-${Date.now()}`;
      if (execRes.executedQty && execRes.executedQty > 0) {
        executedQty = execRes.executedQty;
      }
      if (execRes.executedPrice && execRes.executedPrice > 0) {
        executedPrice = execRes.executedPrice;
      }
      if (execRes.venueMode) {
        resolvedVenueMode = execRes.venueMode;
      }
    }

    const newPos: AgentPosition = stampPositionWithRls(
      {
        id: `pos-${Date.now()}`,
        orderId: realOrderId,
        isRealMoney: isReal,
        symbol: targetPair.symbol,
        side,
        marketType: resolvedVenueMode === 'SPOT' ? 'SPOT' : targetPair.marketType,
        exchange: targetPair.primaryExchange,
        entryPrice: executedPrice,
        currentPrice: targetPair.price,
        sizeUsd: orderSizeUsdInput,
        executedQty,
        venueMode: resolvedVenueMode,
        leverage: resolvedVenueMode === 'SPOT' ? 1 : targetLeverage,
        stopLossPrice: initialProtectiveStop,
        takeProfitPrice: tp,
        breakevenLocked: false,
        executionMode: makerOnlyMode ? 'POST_ONLY_MAKER' : 'TWAP_LOW_IMPACT',
        unrealizedPnlUsd: 0,
        unrealizedPnlPct: 0,
        peakPnlPct: 0,
        openedAt: timeStr,
        statusReason: `${
          isReal ? `[${executionEnv} #${realOrderId}]` : '[PAPER]'
        } ${makerOnlyMode ? 'Maker Post-Only' : 'Market'} @ $${executedPrice.toLocaleString()} | Protective SL @ $${initialProtectiveStop.toLocaleString()} (Auto-BE @ +${autoBreakevenTriggerPct}%)`,
      },
      wallets
    );

    setPositions((prev) =>
      [newPos, ...prev.filter((p) => p.symbol !== targetPair.symbol)].slice(
        0,
        isExplicitUserEntry ? maxManualSlots : maxConcurrentPositions
      )
    );
    setBrainDecisions((prev) => [
      {
        id: `bd-${Date.now()}`,
        timestamp: timeStr,
        symbol: targetPair.symbol,
        category: 'EXECUTION',
        headline: `${isReal ? '🔥 REAL ORDER' : 'PAPER ORDER'} ${side} ${
          targetPair.symbol
        } ($${orderSizeUsdInput.toLocaleString()} @ ${targetLeverage}x) via ${
          targetPair.primaryExchange
        }`,
        detail: `Order ID: ${realOrderId} | Entry: $${entry.toLocaleString()} (Post-Only Maker). Auto-Breakeven Lock @ +${autoBreakevenTriggerPct}%.`,
        score: forumConsensus.consensusScore,
        tone: side === 'LONG' ? 'BULLISH' : 'BEARISH',
      },
      ...prev,
    ]);
    setCommandFeedback(
      `✓ Executed ${isReal ? executionEnv : 'PAPER'} ${side} ${
        targetPair.symbol
      } (#${realOrderId}) @ $${entry.toLocaleString()}`
    );
    return true;
  };

  /**
   * SKILL 5 EXECUTION: Opens a Low-Risk Autonomous Replacement Position when positions.length < maxConcurrentPositions (3).
   * Preserves full Autonomous Agent Brain execution for BOTH BUY/SELL and Futures/Spot across Paper, Testnet, and Mainnet.
   */
  const executeAutonomousLowRiskSlot = async (): Promise<boolean> => {
    if (autonomousEntryInFlightRef.current) return false;
    const livePositions = positionsRef.current;
    if (circuitBreakerTriggered || livePositions.length >= maxConcurrentPositions) return false;
    const candidate = selectBestLowRiskHunterCandidate(
      marketsRef.current,
      livePositions,
      lastClosedSymbol,
      minLiquidityScoreGate,
      orderSizeUsdInput,
      verifiedNewsRef.current,
      candlesMapRef.current
    );
    if (!candidate || entryInFlightSymbolsRef.current.has(candidate.market.symbol)) return false;

    // In EXCHANGE_TESTNET / REAL_MAINNET, route every brain-approved autonomous entry (BUY/SELL, Futures/Spot)
    // through the verified real-money execution pipeline with 5-Layer RLS, setLeverage, executedQty & Circuit Breaker.
    if (executionEnv !== 'PAPER_SANDBOX') {
      autonomousEntryInFlightRef.current = true;
      try {
        return await handleManualAgentEntry(
          candidate.side,
          candidate.market,
          candidate.market.marketType === 'SPOT' ? 1 : candidate.recommendedLeverage,
          false
        );
      } finally {
        autonomousEntryInFlightRef.current = false;
      }
    }

    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const slotNumber = livePositions.length + 1;
    const autoOrderId = `AUTO-LOWRISK-${Date.now().toString().slice(-5)}`;

    const autoPos: AgentPosition = {
      id: `pos-auto-${Date.now()}`,
      orderId: autoOrderId,
      isRealMoney: false,
      symbol: candidate.market.symbol,
      side: candidate.side,
      marketType: candidate.market.marketType,
      exchange: candidate.market.primaryExchange,
      entryPrice: candidate.entryPrice,
      currentPrice: candidate.market.price,
      sizeUsd: candidate.recommendedSizeUsd,
      executedQty: Number((candidate.recommendedSizeUsd / Math.max(1e-9, candidate.entryPrice)).toFixed(8)),
      venueMode: candidate.market.marketType === 'SPOT' ? 'SPOT' : 'FUTURES',
      leverage: candidate.market.marketType === 'SPOT' ? 1 : candidate.recommendedLeverage,
      stopLossPrice: candidate.initialBeGuardPrice,
      takeProfitPrice: candidate.takeProfitPrice,
      breakevenLocked: false,
      executionMode: makerOnlyMode ? 'POST_ONLY_MAKER' : 'TWAP_LOW_IMPACT',
      unrealizedPnlUsd: 0,
      unrealizedPnlPct: 0,
      peakPnlPct: 0,
      openedAt: timeStr,
      statusReason: `AUTO-HUNTER SLOT #${slotNumber}/${maxConcurrentPositions} | Low-Risk ${candidate.lowRiskScore}/100 | Stop Guard (@ $${candidate.initialBeGuardPrice})`,
    };

    setPositions((prev) => {
      if (prev.length >= maxConcurrentPositions || prev.some((p) => p.symbol === autoPos.symbol)) {
        return prev;
      }
      return [...prev, autoPos];
    });

    setBrainDecisions((prev) => [
      {
        id: `bd-autohunt-${Date.now()}`,
        timestamp: timeStr,
        symbol: candidate.market.symbol,
        category: 'SKILL_RISK_GUARD',
        headline: `🤖 AUTO-HUNTER MEMBUKA POSISI BARU (SLOT #${slotNumber}/${maxConcurrentPositions}): ${candidate.side} ${candidate.market.symbol} @ $${candidate.entryPrice.toLocaleString()} (${candidate.recommendedLeverage}x Low-Risk)`,
        detail: `Pasca Take Profit, Agent memindai seluruh market & memilih ${candidate.market.symbol} di ${candidate.market.primaryExchange} karena memiliki profil risiko terendah (${candidate.analysisSummary}). Stop Guard awal dipasang pada $${candidate.initialBeGuardPrice}.`,
        score: candidate.lowRiskScore,
        tone: candidate.side === 'LONG' ? 'BULLISH' : 'BEARISH',
      },
      ...prev.slice(0, 14),
    ]);

    setCommandFeedback(
      `🤖 Auto-Hunter mengisi Slot #${slotNumber}/${maxConcurrentPositions}: ${candidate.side} ${candidate.market.symbol} (${candidate.recommendedLeverage}x Low-Risk Score ${candidate.lowRiskScore}/100)`
    );
    return true;
  };

  const executeAutonomousLowRiskSlotRef = useRef(executeAutonomousLowRiskSlot);
  executeAutonomousLowRiskSlotRef.current = executeAutonomousLowRiskSlot;

  // Continuous Autonomous Post-TP Hunter Loop: Whenever positions.length < maxConcurrentPositions (3) & Auto-Agent is ON
  // Uses refs for live markets so 1.8s-2.5s market ticks NEVER reset the 3-second countdown, and rearms cleanly after unsuccessful attempts.
  useEffect(() => {
    if (!agentAutonomousEnabled || circuitBreakerTriggered || positions.length >= maxConcurrentPositions) {
      setHunterCountdownSec(null);
      return;
    }

    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let remaining = 3;
    setHunterCountdownSec(remaining);
    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining <= 0) {
        clearInterval(interval);
        setHunterCountdownSec(null);
        void executeAutonomousLowRiskSlotRef.current().then((opened) => {
          if (!opened && !cancelled) {
            retryTimer = setTimeout(() => {
              if (!cancelled) {
                setHunterRetryTick((t) => t + 1);
              }
            }, 5000);
          }
        });
      } else {
        setHunterCountdownSec(remaining);
      }
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [
    agentAutonomousEnabled,
    circuitBreakerTriggered,
    positions.length,
    maxConcurrentPositions,
    lastClosedSymbol,
    hunterRetryTick,
  ]);

  const handleScratchOrClosePosition = async (
    pos: AgentPosition,
    mode: 'SCRATCH' | 'PROFIT_LOCK'
  ) => {
    if (closingPositionIdsRef.current.has(pos.id)) {
      return { ok: false, error: 'Penutupan posisi sedang diproses.' };
    }
    closingPositionIdsRef.current.add(pos.id);
    try {
      return await executeClosePositionInner(pos, mode);
    } finally {
      closingPositionIdsRef.current.delete(pos.id);
    }
  };

  const executeClosePositionInner = async (
    pos: AgentPosition,
    mode: 'SCRATCH' | 'PROFIT_LOCK'
  ) => {
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;

    const rlsOwnership = verifyPositionRlsOwnership(pos, wallets);
    if (!rlsOwnership.ok) {
      setCommandFeedback(rlsOwnership.error || '[RLS ISOLATION BLOCKED] Penutupan posisi ditolak.');
      return { ok: false, error: rlsOwnership.error };
    }

    let realCloseOrderId: string | undefined = undefined;
    let realClosePrice: number | undefined = undefined;
    // STRICT ISOLATION: Only send exchange close orders for positions actually opened with real money (never for paper positions!)
    if (pos.isRealMoney) {
      setIsExecutingOrder(true);
      const matchedMkt = markets.find((m) => m.symbol === pos.symbol);
      const rawBase = pos.symbol.split('-')[0];
      const fallbackBinSym = /^k[A-Z]{2,}$/.test(rawBase)
        ? `1000${rawBase.slice(1)}USDT`
        : `${rawBase.toUpperCase()}USDT`;
      const closeQty =
        pos.executedQty && pos.executedQty > 0
          ? pos.executedQty
          : pos.entryPrice > 0
            ? Number((pos.sizeUsd / pos.entryPrice).toFixed(8))
            : undefined;
      const closeRes = await executeRealOrderOnVenue({
        exchange: pos.exchange,
        symbol: pos.symbol,
        binanceSymbol: matchedMkt?.binanceSymbol || fallbackBinSym,
        side: pos.side,
        orderPurpose: 'SCRATCH_EXIT',
        sizeUsd: pos.sizeUsd,
        quantity: closeQty,
        price: pos.currentPrice,
        marketType: pos.venueMode === 'SPOT' ? 'SPOT' : pos.marketType,
        venueMode: pos.venueMode,
        wallets,
        useTestnet: executionEnv === 'EXCHANGE_TESTNET',
        rowOwnerScope: pos.rlsOwnerScope,
      });
      setIsExecutingOrder(false);

      if (!closeRes.ok) {
        const errMsg = closeRes.error || 'Exchange menolak order penutupan posisi.';
        setCommandFeedback(`[REAL CLOSE FAILED] ${pos.symbol} TETAP TERBUKA di ${pos.exchange}: ${errMsg}`);
        setBrainDecisions((prev) => [
          {
            id: `bd-close-err-${Date.now()}`,
            timestamp: timeStr,
            symbol: pos.symbol,
            category: 'EXECUTION',
            headline: `🚨 GAGAL MENUTUP POSISI REAL ${pos.symbol} di ${pos.exchange}`,
            detail: `${errMsg} — Posisi dipertahankan di daftar aktif agar tetap terpantau.`,
            score: 0,
            tone: 'WARN',
          },
          ...prev,
        ]);
        return { ok: false, error: errMsg };
      }
      realCloseOrderId = closeRes.orderId;
      if (closeRes.executedPrice && closeRes.executedPrice > 0) {
        realClosePrice = closeRes.executedPrice;
      }
    }

    const effectiveExitPrice = formatSmartPrice(realClosePrice || pos.currentPrice);
    const settled = computeClosedTradeSettlement({
      side: pos.side,
      entryPrice: pos.entryPrice,
      exitPrice: effectiveExitPrice,
      sizeUsd: pos.sizeUsd,
      leverage: pos.leverage,
      executedQty: pos.executedQty,
      isRealMoney: Boolean(pos.isRealMoney),
      exchangeOrderId: realCloseOrderId,
    });
    const finalPnlPct = settled.realizedPnlPct;
    const finalPnlUsd = settled.realizedPnlUsd;

    // Direct-to-Hot-Wallet Settlement Metadata (Zero Fake TxHash & Zero Corruption of Verified Real Wallet Balances)
    const isSolanaVenue =
      pos.exchange === 'JUPITER' ||
      pos.exchange === 'DEXSCREENER' ||
      pos.symbol.endsWith('-SOL');
    const targetHotWalletId = isSolanaVenue ? 'phantom' : 'trust';
    const targetHotWallet =
      wallets.find((w) => w.id === targetHotWalletId) || wallets[0];
    const hotWalletDisplayAddr =
      targetHotWallet?.credentials?.walletAddress
        ? `${targetHotWallet.credentials.walletAddress.slice(
            0,
            6
          )}...${targetHotWallet.credentials.walletAddress.slice(-4)}`
        : targetHotWallet?.addressOrKeyId?.split(' ')[0] || '0x71C...9A4E';
    const hotWalletNameLabel = isSolanaVenue
      ? 'Phantom Hot Wallet (Solana USDC)'
      : `Trust Hot Wallet (${targetHotWallet?.activeChainName || 'Arbitrum L2 USDC'})`;
    const settlementTxHash = settled.settlementTxHash;

    const isSettledToHotWallet = autoDirectHotWalletSettle && finalPnlUsd > 0;

    if (pos.isRealMoney) {
      // Never mutate verified real wallet balance locally; refresh actual equity from the exchange/blockchain
      const owning = wallets.find(
        (w) =>
          w.verifiedReal &&
          w.connected &&
          w.credentials &&
          ((pos.exchange === 'BINANCE' && w.id === 'binance_api') ||
            (pos.exchange === 'BYBIT' && w.id === 'bybit_api') ||
            (pos.exchange === 'OKX' && w.id === 'okx_api') ||
            (pos.exchange === 'HYPERLIQUID' && (w.id === 'trust' || w.id === 'hyperliquid_agent')) ||
            ((pos.exchange === 'JUPITER' || pos.exchange === 'DEXSCREENER') && w.id === 'phantom'))
      );
      if (owning?.credentials) {
        const expectedScope = deriveWalletRlsOwnerScope(owning);
        const refreshCredentials = {
          ...owning.credentials,
          useTestnet: executionEnv === 'EXCHANGE_TESTNET',
        };
        void verifyRealAccountWithBackend(owning.id, refreshCredentials).then((syncRes) => {
          if (syncRes.ok && typeof syncRes.balanceUsd === 'number') {
            setWallets((prevWallets) => {
              let changed = false;
              const updated = prevWallets.map((w) => {
                if (
                  w.id === owning.id &&
                  w.connected &&
                  deriveWalletRlsOwnerScope(w) === expectedScope
                ) {
                  changed = true;
                  return {
                    ...w,
                    balanceUsd: syncRes.balanceUsd!,
                    chainBalances: syncRes.chainBalances || w.chainBalances,
                  };
                }
                return w;
              });
              if (changed) saveWalletsToVault(updated);
              return changed ? updated : prevWallets;
            });
          }
        });
      }
    } else if (isSettledToHotWallet && settled.allowLocalBalanceMutation) {
      setWallets((prevWallets) => {
        const updated = prevWallets.map((w) => {
          if (w.id === targetHotWalletId && !w.verifiedReal) {
            const nextBal = Number((w.balanceUsd + finalPnlUsd).toFixed(2));
            const nextChains = w.chainBalances
              ? w.chainBalances.map((cb, idx) =>
                  idx === 0
                    ? {
                        ...cb,
                        stableBalanceUsd: Number((cb.stableBalanceUsd + finalPnlUsd).toFixed(2)),
                        totalChainUsd: Number((cb.totalChainUsd + finalPnlUsd).toFixed(2)),
                      }
                    : cb
                )
              : undefined;
            return {
              ...w,
              balanceUsd: nextBal,
              ...(nextChains ? { chainBalances: nextChains } : {}),
            };
          }
          return w;
        });
        saveWalletsToVault(updated);
        return updated;
      });
    }

    const closedItem: ClosedTradeLog = stampClosedTradeWithRls(
      {
        id: `cl-${Date.now()}`,
        orderId: pos.orderId,
        isRealMoney: pos.isRealMoney,
        timestamp: timeStr,
        closedDateKey: getUtcTradingDayKey(now),
        symbol: pos.symbol,
        side: pos.side,
        exchange: pos.exchange,
        entryPrice: pos.entryPrice,
        exitPrice: effectiveExitPrice,
        sizeUsd: pos.sizeUsd,
        realizedPnlUsd: finalPnlUsd,
        realizedPnlPct: finalPnlPct,
        exitType:
          mode === 'PROFIT_LOCK'
            ? 'TAKE_PROFIT'
            : finalPnlPct >= 0.2
              ? 'TRAILING_PROFIT_LOCK'
              : finalPnlPct >= 0
                ? 'BREAKEVEN_PROTECT'
                : 'MICRO_LOSS_SCRATCH',
        hotWalletSettled: isSettledToHotWallet,
        hotWalletName: isSettledToHotWallet ? hotWalletNameLabel : undefined,
        hotWalletAddress: isSettledToHotWallet ? hotWalletDisplayAddr : undefined,
        settlementTxHash: isSettledToHotWallet ? settlementTxHash : undefined,
        note:
          mode === 'SCRATCH'
            ? `Auto-Invalidation Scratch Exit dieksekusi instan (${finalPnlPct}%) saat Orderbook & Whale berbalik arah.`
            : `Keputusan Agent Take Profit (+${finalPnlPct}% >= Min +50%): Profit +$${finalPnlUsd} langsung masuk otomatis ke ${hotWalletNameLabel} (${hotWalletDisplayAddr}) [Tx: ${settlementTxHash}]!`,
      },
      rlsOwnership.rlsOwnerScope
    );

    setLastClosedSymbol(pos.symbol);
    setClosedTrades((prev) => [closedItem, ...prev]);
    setPositions((prev) => prev.filter((p) => p.id !== pos.id));

    if (finalPnlUsd > 0) {
      setBrainDecisions((prev) => [
        {
          id: `bd-tp-settle-${Date.now()}`,
          timestamp: timeStr,
          symbol: pos.symbol,
          category: 'EXECUTION',
          headline: `💸 PROFIT +$${finalPnlUsd} AUTO-SETTLED KE HOT WALLET (${hotWalletDisplayAddr}) → Memulai Post-TP Scan (4x–8x)`,
          detail: `Dana profit +$${finalPnlUsd} dari ${pos.symbol} telah langsung masuk ke ${hotWalletNameLabel} (Tx: ${settlementTxHash}) tanpa perlu withdraw dari terminal. Agent kini memindai 7 market untuk membuka posisi baru (Leverage 4x–8x, Maks ${maxConcurrentPositions} posisi)...`,
          score: 97,
          tone: 'BULLISH',
        },
        ...prev.slice(0, 14),
      ]);
    }

    setCommandFeedback(
      finalPnlUsd > 0
        ? `✓ Profit +$${finalPnlUsd} (${pos.symbol}) Otomatis Masuk ke ${hotWalletNameLabel} (${hotWalletDisplayAddr})! Auto-Hunter scanning (4x-8x)...`
        : `Closed ${pos.symbol} (${closedItem.exitType}): ${finalPnlPct}% — Auto-Hunter scanning replacement...`
    );
    return { ok: true, orderId: realCloseOrderId, executedPrice: realClosePrice };
  };

  const handleEmergencyFlattenAll = async () => {
    setAgentAutonomousEnabled(false);
    const snapshotPositions = [...positions];
    let closedCount = 0;
    let failedCount = 0;
    for (const pos of snapshotPositions) {
      const res = await handleScratchOrClosePosition(pos, 'SCRATCH');
      if (res?.ok) {
        closedCount++;
      } else {
        failedCount++;
      }
    }
    setCommandFeedback(
      failedCount === 0
        ? `🚨 EMERGENCY KILL SWITCH EXECUTED: Semua ${closedCount} posisi ditutup & Autonomous Agent dihentikan!`
        : `🚨 EMERGENCY KILL SWITCH PARTIAL: ${closedCount} posisi ditutup, ${failedCount} GAGAL ditutup di exchange — segera periksa akun Anda!`
    );
  };

  const handleSimulateWhaleSurge = (direction: 'BULLISH' | 'BEARISH') => {
    if (executionEnv !== 'PAPER_SANDBOX') {
      setCommandFeedback(
        `[BLOCKED] Simulasi Whale Surge dinonaktifkan pada mode ${executionEnv} untuk mencegah eksekusi order real-money dari sinyal simulasi.`
      );
      return;
    }
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
      now.getMinutes()
    ).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`;
    const sizeUsd = Math.round(4_500_000 + Math.random() * 7_500_000);

    const newWhaleTx: WhaleTransaction = {
      id: `tx-${Date.now()}`,
      timestamp: timeStr,
      walletLabel:
        direction === 'BULLISH'
          ? 'Hyperliquid Sovereign Whale (0x99a...41c8)'
          : 'Institutional Wintermute Flow (0x3c1...88b0)',
      walletAddress: '0x99a41c8...e012',
      sourceNode: direction === 'BULLISH' ? 'PHANTOM SOL' : 'WHALE CORE',
      targetNode: direction === 'BULLISH' ? 'HYPERLIQUID' : 'BINANCE',
      exchange: activePair.primaryExchange,
      symbol: activePair.symbol,
      action: direction === 'BULLISH' ? 'OPEN LONG PERP' : 'CEX DEPOSIT (SELL RISK)',
      sizeUsd,
      price: activePair.price,
      leverage: 10,
      direction,
      confidence: 97,
      txHash: `0x${Math.random().toString(16).slice(2, 10)}...`,
    };

    setWhaleTxs((prev) => [newWhaleTx, ...prev]);

    setMarkets((prev) =>
      prev.map((m) =>
        m.symbol === activePair.symbol
          ? {
              ...m,
              obiScore: direction === 'BULLISH' ? 0.68 : -0.62,
              whaleNetFlow1hUsd:
                m.whaleNetFlow1hUsd + (direction === 'BULLISH' ? sizeUsd : -sizeUsd),
              whaleBias: direction === 'BULLISH' ? 'STRONG LONG' : 'STRONG SHORT',
            }
          : m
      )
    );

    setChordLinks((prev) =>
      prev.map((l, idx) =>
        idx === 0
          ? {
              ...l,
              volumeUsd: l.volumeUsd + sizeUsd,
              direction: direction === 'BULLISH' ? 'INFLOW_BULLISH' : 'OUTFLOW_BEARISH',
              activePulse: true,
            }
          : l
      )
    );

    if (agentAutonomousEnabled && direction === 'BEARISH' && activePosition?.side === 'LONG') {
      handleScratchOrClosePosition(activePosition, 'SCRATCH');
      setBrainDecisions((prev) => [
        {
          id: `bd-${Date.now()}`,
          timestamp: timeStr,
          symbol: activePair.symbol,
          category: 'SKILL_RISK_GUARD',
          headline: `AUTO-SCRATCH DIEKSEKUSI: Mendeteksi Distribusi Whale -$${(
            sizeUsd / 1e6
          ).toFixed(2)}M pada ${activePair.symbol}`,
          detail: `Agent menutup posisi LONG ${activePair.symbol} secara instan sebelum harga turun guna melindungi modal (Zero-Slop Guard).`,
          score: 98,
          tone: 'WARN',
        },
        ...prev,
      ]);
    } else if (agentAutonomousEnabled && direction === 'BULLISH' && !activePosition) {
      handleManualAgentEntry('LONG');
    }
  };

  const handleExecuteForumPrecisionTrade = (
    targetMarket: MarketPair,
    side: 'LONG' | 'SHORT',
    overrideLeverage?: number
  ) => {
    const matched =
      markets.find((m) => m.symbol === targetMarket.symbol) ||
      (activePair.symbol === targetMarket.symbol ? activePair : targetMarket);
    if (matched.marketType !== 'DEX_POOL') {
      setCustomDeskPool(null);
    }
    setSelectedSymbol(matched.symbol);
    if (overrideLeverage) {
      setLeverageInput(overrideLeverage);
    }
    handleManualAgentEntry(side, matched, overrideLeverage, true);
  };

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cmd = commandInput.trim().toLowerCase();
    if (!cmd) return;

    const cleanToken = cmd.replace(/^\//, '').replace(/-perp|-usdc|-sol$/i, '').toUpperCase();
    const matchedMarket = markets.find(
      (m) =>
        m.baseAsset.toUpperCase() === cleanToken ||
        m.symbol.toUpperCase() === cmd.replace(/^\//, '').toUpperCase() ||
        m.hlCoin.toUpperCase() === cleanToken
    );

    if (matchedMarket) {
      setCustomDeskPool(null);
      setSelectedSymbol(matchedMarket.symbol);
    } else if (cmd.includes('btc')) setSelectedSymbol('BTC-PERP');
    else if (cmd.includes('eth')) setSelectedSymbol('ETH-PERP');
    else if (cmd.includes('xrp')) setSelectedSymbol('XRP-PERP');
    else if (cmd.includes('bnb')) setSelectedSymbol('BNB-PERP');
    else if (cmd.includes('sol')) setSelectedSymbol('SOL-PERP');
    else if (cmd.includes('doge')) setSelectedSymbol('DOGE-PERP');
    else if (cmd.includes('ada')) setSelectedSymbol('ADA-PERP');
    else if (cmd.includes('trx')) setSelectedSymbol('TRX-PERP');
    else if (cmd.includes('avax')) setSelectedSymbol('AVAX-PERP');
    else if (cmd.includes('link')) setSelectedSymbol('LINK-PERP');
    else if (cmd.includes('hype')) setSelectedSymbol('HYPE-USDC');
    else if (cmd.includes('sui')) setSelectedSymbol('SUI-PERP');
    else if (cmd.includes('jup')) setSelectedSymbol('JUP-SOL');
    else if (cmd.includes('ray')) setSelectedSymbol('RAY-SOL');
    else if (cmd.includes('profile') || cmd.includes('portfolio') || cmd.includes('portofolio'))
      setActiveTopTab('PORTFOLIO_PROFILE');
    else if (cmd.includes('wallet') || cmd.includes('connect') || cmd.includes('api'))
      setIsWalletModalOpen(true);
    else if (cmd.includes('dex')) setActiveTopTab('DEX_SCREENER');
    else if (cmd.includes('skill') || cmd.includes('agent') || cmd.includes('forum') || cmd.includes('news'))
      setActiveTopTab('AGENT_SKILLS');
    else if (cmd.includes('long')) handleManualAgentEntry('LONG');
    else if (cmd.includes('short')) handleManualAgentEntry('SHORT');
    else if (cmd.includes('kill') || cmd.includes('flatten')) handleEmergencyFlattenAll();
    else if (cmd.includes('whale')) handleSimulateWhaleSurge('BULLISH');

    setCommandFeedback(`Command executed: "${commandInput}"`);
    setCommandInput('');
  };

  const handleQuickNetworkSwitch = async (targetChainId: number) => {
    const res = await switchEvmWalletNetwork(targetChainId);
    if (res.ok) {
      setWallets((prev) => {
        const next = prev.map((w) =>
          w.id === 'trust' || w.id === 'hyperliquid_agent'
            ? { ...w, activeChainId: res.chainId, activeChainName: res.chainName }
            : w
        );
        saveWalletsToVault(next);
        return next;
      });
      setCommandFeedback(
        `✓ Jaringan Trust Wallet aktif: ${res.chainName} (ChainID: ${res.chainId}) — Siap Transaksi!`
      );
    } else {
      setCommandFeedback(`[NETWORK] ${res.error}`);
    }
  };

  const handleQuickConnectExtension = async (id: 'trust' | 'phantom') => {
    setIsSyncingProfile(true);
    const extRes = await connectBrowserExtensionWallet(id);
    if (extRes.ok && extRes.fullAddress) {
      const verifyRes = await verifyRealAccountWithBackend(id, {
        walletAddress: extRes.fullAddress,
        useTestnet: executionEnv === 'EXCHANGE_TESTNET',
      });
      setIsSyncingProfile(false);
      setWallets((prev) => {
        const next = prev.map((w) => {
          if (w.id === id || (id === 'trust' && w.id === 'hyperliquid_agent')) {
            return {
              ...w,
              connected: true,
              verifiedReal: verifyRes.ok,
              autoSignEnabled: true,
              activeChainId: extRes.activeChainId || w.activeChainId || 42161,
              activeChainName: extRes.activeChainName || w.activeChainName || 'Arbitrum One (L2)',
              chainBalances: verifyRes.chainBalances || w.chainBalances,
              addressOrKeyId: verifyRes.addressDisplay || extRes.displayAddress,
              balanceUsd:
                verifyRes.ok && typeof verifyRes.balanceUsd === 'number'
                  ? verifyRes.balanceUsd
                  : w.balanceUsd,
              credentials: {
                ...(w.credentials || {}),
                walletAddress: extRes.fullAddress,
              },
            };
          }
          return w;
        });
        saveWalletsToVault(next);
        return next;
      });
      setCommandFeedback(
        `✓ ${id === 'trust' ? 'Trust Wallet' : 'Phantom'} Terhubung: ${extRes.fullAddress.slice(
          0,
          6
        )}...${extRes.fullAddress.slice(-4)} (${extRes.activeChainName || 'Live'})`
      );
    } else {
      setIsSyncingProfile(false);
      setIsWalletModalOpen(true);
      setCommandFeedback(extRes.displayAddress);
    }
  };

  const loadDexUniverse = async (chain: string, queryText = '') => {
    setIsLoadingDexUniverse(true);
    try {
      const endpoint = queryText.trim()
        ? `/api/live/dex/search?q=${encodeURIComponent(queryText.trim())}&chain=${encodeURIComponent(chain)}`
        : `/api/live/dex/universe?chain=${encodeURIComponent(chain)}&limit=300`;
      const res = await fetch(endpoint);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) {
          setDexUniverseItems(data.items);
        }
        if (data.totalIndexedPools !== undefined) {
          setDexUniverseStats(data);
        }
      }
    } catch {
      // Keep cached dexPools on transient error
    } finally {
      setIsLoadingDexUniverse(false);
    }
  };

  useEffect(() => {
    if (activeTopTab === 'DEX_SCREENER') {
      loadDexUniverse(dexChainFilter, dexSearchQuery);
    }
  }, [activeTopTab, dexChainFilter]);

  const handleInspectPoolTrades = async (pool: DexScreenerPoolItem) => {
    setInspectedDexPool(pool);
    setIsLoadingPoolTrades(true);
    setInspectedPoolTrades([]);
    try {
      const addr = pool.fullPairAddress || pool.pairAddress;
      const cid = pool.chainId || pool.chain || 'solana';
      const res = await fetch(
        `/api/live/dex/pool-trades?chain=${encodeURIComponent(cid)}&poolAddress=${encodeURIComponent(addr)}`
      );
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.trades)) {
          setInspectedPoolTrades(data.trades);
        }
      }
    } catch {
      // Ignore transient network errors
    } finally {
      setIsLoadingPoolTrades(false);
    }
  };

  const loadDexPoolChart = async (
    pool: DexScreenerPoolItem,
    tf: ChartInterval = dexChartInterval,
    showSpinner = true
  ) => {
    const addr = pool.fullPairAddress || pool.pairAddress;
    const cid = pool.chainId || pool.chain || 'solana';
    const hlCoin = pool.baseSymbol || pool.symbol.split('/')[0].trim();
    const isMacroTf = tf === '1d' || tf === '3d' || tf === '1w' || tf === '1M';
    if (showSpinner) setIsLoadingDexChart(true);
    try {
      const q = new URLSearchParams({
        hlCoin,
        chain: cid,
        poolAddress: addr,
        interval: tf,
        limit: isMacroTf ? '2500' : '1200',
        ...(isMacroTf ? { fullHistory: '1' } : {}),
        ...(pool.priceUsd > 0 ? { refPrice: String(pool.priceUsd) } : {}),
      });
      const res = await fetch(`/api/live/candles?${q.toString()}`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.candles) && data.candles.length > 0) {
          setDexChartCandles(data.candles);
          if (data.source) setDexChartSource(data.source);
          setDexChartMeta({
            listingTime: data.listingTime || data.candles[0]?.time,
            priceGuardStatus: data.priceGuardStatus || 'VERIFIED_SYNCED',
            priceDeviationPct: typeof data.priceDeviationPct === 'number' ? data.priceDeviationPct : 0,
          });
          setCommandFeedback(
            `Real Chart Loaded (${data.source}): ${pool.symbol} (${pool.chain}) @ $${pool.priceUsd}`
          );
          return;
        }
      }
      setDexChartSource(`UNAVAILABLE (${cid.toUpperCase()})`);
    } catch {
      // keep state on transient error
    } finally {
      if (showSpinner) setIsLoadingDexChart(false);
    }
  };

  useEffect(() => {
    if (activeTopTab !== 'DEX_SCREENER' || !selectedDexChartPool) return;
    const targetAddr = selectedDexChartPool.fullPairAddress || selectedDexChartPool.pairAddress;
    const latestFromFeed = [...dexUniverseItems, ...dexPools].find(
      (it) =>
        (it.fullPairAddress || it.pairAddress) === targetAddr &&
        (it.chainId || it.chain) === (selectedDexChartPool.chainId || selectedDexChartPool.chain)
    );
    if (latestFromFeed && latestFromFeed.priceUsd !== selectedDexChartPool.priceUsd) {
      setSelectedDexChartPool(latestFromFeed);
    }
  }, [dexUniverseItems, dexPools, activeTopTab]);

  useEffect(() => {
    if (activeTopTab !== 'DEX_SCREENER' || !selectedDexChartPool) return;
    loadDexPoolChart(selectedDexChartPool, dexChartInterval, dexChartCandles.length === 0);
    const timer = setInterval(() => {
      loadDexPoolChart(selectedDexChartPool, dexChartInterval, false);
    }, 8000);
    return () => clearInterval(timer);
  }, [
    activeTopTab,
    selectedDexChartPool?.fullPairAddress,
    selectedDexChartPool?.chainId,
    dexChartInterval,
  ]);

  const handleOpenDexPoolChart = async (pool: DexScreenerPoolItem) => {
    setSelectedDexChartPool(pool);
    setDexChartCandles([]);
    setDexChartSource('SYNCING...');
    setTimeout(() => {
      dexChartPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 40);
    await Promise.all([
      loadDexPoolChart(pool, dexChartInterval, true),
      handleInspectPoolTrades(pool),
    ]);
  };

  const handlePinPoolToMainDesk = (pool: DexScreenerPoolItem) => {
    const baseAsset = (pool.baseSymbol || pool.symbol.split('/')[0] || 'TOK').trim();
    const matchedMkt = markets.find((m) => m.symbol === pool.symbol || (pool.chainId === 'hyperliquid' && pool.pairAddress.startsWith('HL-PERP-') && m.baseAsset.toUpperCase() === baseAsset.toUpperCase()));
    if (matchedMkt) {
      setCustomDeskPool(null);
      setSelectedSymbol(matchedMkt.symbol);
    } else {
      setCustomDeskPool(pool);
      setSelectedSymbol(`${baseAsset}-DEX`);
    }
    setActiveTopTab('TERMINAL_DESK');
    setActiveSubTab('OVERVIEW');
  };

  const formatDepthOrVol = (usd: number) => {
    if (usd >= 1_000_000_000) return `$${(usd / 1_000_000_000).toFixed(2)}B`;
    if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
    if (usd >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
    return `$${usd.toFixed(0)}`;
  };

  const totalUnrealizedPnl = positions.reduce((acc, p) => acc + p.unrealizedPnlUsd, 0);
  const totalRealizedPnl = closedTrades.reduce((acc, c) => acc + c.realizedPnlUsd, 0);
  const connectedWalletsCount = wallets.filter((w) => w.connected).length;
  const verifiedRealCount = wallets.filter((w) => w.verifiedReal).length;
  const totalPortfolioEquityUsd = wallets
    .filter((w) => w.connected)
    .reduce((acc, w) => acc + w.balanceUsd, 0);
  const trustWalletState = wallets.find((w) => w.id === 'trust') || wallets[0];
  const phantomWalletState = wallets.find((w) => w.id === 'phantom');
  const activeProfileAddress =
    trustWalletState?.credentials?.walletAddress ||
    phantomWalletState?.credentials?.walletAddress ||
    trustWalletState?.addressOrKeyId ||
    '0x71C...9A4E';

  return (
    <div
      data-testid="app-root"
      className={`workspace-shell flex flex-col min-h-screen lg:h-screen w-full max-w-full bg-[#0B0F17] text-[#E2E8F0] font-sans overflow-x-hidden lg:overflow-hidden select-none antialiased ${simple ? 'simple-workspace' : ''}`}
    >
      <aside className="workspace-sidebar">
        <div className="workspace-brand">
          <Activity size={19} aria-hidden="true" />
          <span>{simple ? 'Fincept Simple' : 'Fincept Pro'}</span>
        </div>
        <nav className="workspace-nav" aria-label="Terminal navigation">
          {workspaceTabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              data-testid={`top-tab-${id}`}
              aria-current={activeTopTab === id ? 'page' : undefined}
              onClick={() => setActiveTopTab(id)}
            >
              <Icon size={17} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
        <a
          className="workspace-edition-link"
          href={simple ? '/pro/' : '/'}
          aria-label={simple ? 'Beralih ke mode Pro' : 'Beralih ke mode Simple'}
          onClick={(event) => {
            if (onEditionChange && event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
              event.preventDefault();
              onEditionChange(!simple);
            }
          }}
        >
          {simple ? 'Pro' : 'Simple'} <span aria-hidden="true">↔</span>
        </a>
        <div className="workspace-market-count"><span aria-hidden="true" />{markets.length} markets</div>
      </aside>
      <div className="workspace-content">
      {/* 1. TOP FINCEPT COMMAND BAR & REAL-MONEY EXECUTION MODE SWITCHER */}
      <header className="workspace-header flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1.5 px-2.5 sm:px-3 py-1.5 bg-[#090C12] border-b border-[#1E2736] w-full min-w-0">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <h1 className="workspace-title">{simple && activeTopTab === 'TERMINAL_DESK' ? 'Market' : workspaceTabs.find((tab) => tab.id === activeTopTab)?.label}</h1>

          {/* Command Bar Input */}
          <form onSubmit={handleCommandSubmit} className="flex items-center min-w-0 flex-1 sm:flex-initial sm:shrink-0">
            <div className="flex items-center bg-[#040609] border border-[#263246] focus-within:border-[#FF9F1C] px-2 py-0.5 w-full sm:w-auto">
              <Terminal size={14} className="mr-2 shrink-0 text-[#FF9F1C]" aria-hidden="true" />
              <input
                type="text"
                data-testid="command-input"
                aria-label="Terminal command"
                value={commandInput}
                onChange={(e) => setCommandInput(e.target.value)}
                placeholder="Command, e.g. /btc"
                className="bg-transparent text-[11px] text-[#F8FAFC] placeholder-[#64748B] focus:outline-none w-full min-w-0 sm:w-44 xl:w-56"
              />
            </div>
          </form>

          {commandFeedback && (
            <span
              className="anim-fade text-[10px] text-[#00E5FF] bg-[#06121E] border border-[#00E5FF]/25 px-2 py-0.5 font-semibold hidden 2xl:inline-block truncate min-w-0 max-w-sm"
              title={commandFeedback}
            >
              {commandFeedback}
            </span>
          )}
        </div>

        {/* Right Execution Mode Switcher, Flexible Network Selector, Profile & Portfolio Pill */}
        <div className="flex flex-nowrap lg:flex-wrap items-center gap-1.5 text-[10px] max-w-full w-full lg:w-auto overflow-x-auto no-scrollbar touch-scroll-x pb-0.5 lg:pb-0">
          <div className="flex items-center bg-[#040609] border border-[#1E2736] p-0.5 shrink-0">
            {(
              [
                { id: 'PAPER_SANDBOX', label: 'PAPER' },
                { id: 'EXCHANGE_TESTNET', label: 'TESTNET' },
                { id: 'REAL_MAINNET', label: '🔥 REAL MONEY' },
              ] as const
            ).map((env) => (
              <button
                key={env.id}
                onClick={() => setExecutionEnv(env.id)}
                className={`px-2 py-0.5 font-extrabold transition-colors whitespace-nowrap ${
                  executionEnv === env.id
                    ? env.id === 'REAL_MAINNET'
                      ? 'bg-[#FF1744] text-white'
                      : env.id === 'EXCHANGE_TESTNET'
                        ? 'bg-[#00E5FF] text-black'
                        : 'bg-[#00E676] text-black'
                    : 'text-[#94A3B8] hover:text-white'
                }`}
              >
                {env.label}
              </button>
            ))}
          </div>

          {/* 1-Click Flexible Network Switcher Dropdown (Prevents ChainID Mismatch!) */}
          <div className="hidden md:flex items-center bg-[#06111F] border border-[#00E5FF]/50 px-1.5 py-0.5">
            <span className="text-[#00E5FF] font-extrabold mr-1">NET:</span>
            <select
              value={trustWalletState?.activeChainId || 42161}
              onChange={(e) => handleQuickNetworkSwitch(Number(e.target.value))}
              className="bg-[#06111F] text-[#F8FAFC] font-extrabold text-[10px] focus:outline-none cursor-pointer"
              title="Pilih jaringan fleksibel untuk Trust Wallet (Auto-Sync ChainID)"
            >
              {FLEXIBLE_EVM_NETWORKS.map((net) => (
                <option key={net.chainId} value={net.chainId}>
                  {net.shortName} (Gas {net.avgGasFee})
                </option>
              ))}
            </select>
          </div>

          {/* Prominent Trader Profile & Portfolio Pill */}
          <button
            onClick={() => setActiveTopTab('PORTFOLIO_PROFILE')}
            className={`px-2.5 py-1 font-extrabold text-[10px] border flex items-center gap-1.5 transition-colors whitespace-nowrap ${
              activeTopTab === 'PORTFOLIO_PROFILE'
                ? 'bg-[#FF9F1C] text-black border-[#FF9F1C]'
                : 'bg-[#0C1424] hover:bg-[#162238] text-[#00E676] border-[#00E676]/60'
            }`}
            title="Buka Menu Profile Wallet, Portofolio Multi-Chain & Pengaturan Jaringan"
          >
            <span>👤 PROFILE:</span>
            <span className={activeTopTab === 'PORTFOLIO_PROFILE' ? 'text-black' : 'text-white'}>
              {activeProfileAddress.startsWith('0x') && activeProfileAddress.length > 14
                ? `${activeProfileAddress.slice(0, 6)}...${activeProfileAddress.slice(-4)}`
                : activeProfileAddress.split(' ')[0]}
            </span>
            <span className={activeTopTab === 'PORTFOLIO_PROFILE' ? 'text-black/60' : 'text-[#FF9F1C]'}>|</span>
            <span>💼 {formatDepthOrVol(totalPortfolioEquityUsd)}</span>
          </button>

          <button
            onClick={() => setIsWalletModalOpen(true)}
            data-testid="wallet-modal-trigger"
            className={`px-2 py-1 font-extrabold text-[10px] border transition-colors whitespace-nowrap ${
              verifiedRealCount > 0
                ? 'bg-[#00E676] text-black border-[#00E676]'
                : 'bg-[#141B29] hover:bg-[#FF9F1C] hover:text-black text-[#FF9F1C] border-[#FF9F1C]'
            }`}
          >
            WALLETS ({verifiedRealCount > 0 ? `${verifiedRealCount} REAL` : `${connectedWalletsCount}/6`})
          </button>

          {positions.length > 0 && (
            <button
              onClick={handleEmergencyFlattenAll}
              data-testid="kill-switch"
              className="px-2 py-1 bg-[#FF1744] hover:bg-[#ff4569] text-white font-extrabold text-[10px] whitespace-nowrap"
              title="Tutup semua posisi terbuka & hentikan bot seketika"
            >
              🚨 KILL SWITCH
            </button>
          )}
        </div>
        {activeTopTab === 'TERMINAL_DESK' && (
          <details
            ref={deskSettingsRef}
            className="desk-settings"
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.currentTarget.open = false;
                event.currentTarget.querySelector('summary')?.focus();
              }
            }}
          >
            <summary aria-label="Pengaturan Trading Desk" title="Pengaturan Trading Desk">
              <Settings size={17} aria-hidden="true" />
            </summary>
            <div className="desk-settings-menu">
              <h2>Pengaturan Trading Desk</h2>
              <label>
                <input type="checkbox" checked={showTradeControls} onChange={(event) => setShowTradeControls(event.target.checked)} />
                Tampilkan kontrol trading cepat
              </label>
              <button className="desk-settings-stack" type="button" onClick={() => setDeskStacked(!deskStacked)}>
                {deskStacked ? <Columns2 size={14} /> : <Rows2 size={14} />}
                {deskStacked ? 'Berdampingan' : 'Bertumpuk'}
              </button>
              <button type="button" onClick={swapDeskPanes}><ArrowLeftRight size={14} /> Tukar posisi panel</button>
              <button type="button" onClick={() => {
                setDeskSplit(58);
                setDeskSwapped(false);
                setDeskStacked(false);
              }}>Reset susunan panel</button>
            </div>
          </details>
        )}
      </header>

      {/* 4. ACTIVE INSTRUMENT TICKER, POSITION SIZER & AUTONOMOUS AGENT CONTROLS */}
      <div className="flex flex-wrap items-center justify-between px-2.5 sm:px-3 py-1.5 bg-[#06090F] border-b border-[#1E2736] text-[11px] gap-1.5 sm:gap-2 w-full">
        <div className="flex flex-wrap items-center justify-between sm:justify-start gap-x-3 gap-y-1 min-w-0 w-full lg:w-auto">
          <details
            ref={marketPickerRef}
            className="market-picker"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && event.currentTarget.open) {
                event.currentTarget.open = false;
                event.currentTarget.querySelector('summary')?.focus();
              }
            }}
          >
            <summary className="market-picker-trigger">
              {customDeskPool && activePair.symbol.endsWith('-DEX') ? (
                <MarketTokenIcon
                  symbol={activePair.baseAsset}
                  chainId={customDeskPool.chainId}
                  address={customDeskPool.baseTokenAddress || customDeskPool.fullPairAddress}
                  imageUrl={customDeskPool.tokenImageUrl}
                  size={18}
                />
              ) : (
                <CoinIcon coin={activePair.baseAsset} size={18} />
              )}
              {activePair.cmcRank && (
                <span className="px-1.5 py-0.5 text-[9.5px] font-extrabold bg-[#FF9F1C] text-black">
                  CMC #{activePair.cmcRank}
                </span>
              )}
              <span className="text-sm font-extrabold text-[#FF9F1C]">{activePair.symbol}</span>
              <span className="px-1.5 py-0.5 text-[9.5px] font-bold bg-[#121B2A] text-[#00E5FF] border border-[#1E2F48]">
                {customDeskPool && activePair.symbol.endsWith('-DEX') ? customDeskPool.chain : activePair.primaryExchange}
              </span>
              <ChevronDown size={14} aria-hidden="true" />
            </summary>
            <div className="market-picker-panel">
              <div className="market-picker-controls">
                <div className="market-picker-filters">
                  <span className="text-[9px] text-[#FF9F1C] font-extrabold mr-1 whitespace-nowrap shrink-0">
                    Market ({markets.length})
                  </span>
                  {(
                    [
                      { id: 'CORE_14', label: 'CORE 14' },
                      { id: 'ALL', label: `🌐 ALL CRYPTO (${markets.length})` },
                      { id: 'AI_DEPIN', label: '🤖 AI & DEPIN' },
                      { id: 'MEME_ALPHA', label: '🔥 MEME & ALPHA' },
                      { id: 'DEFI_RWA', label: '🏦 DEFI & RWA' },
                      { id: 'L1_L2', label: '⛓️ L1 & L2' },
                      { id: 'TOP_GAINERS', label: '🚀 TOP GAINERS' },
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      data-testid={`watchlist-sector-${cat.id}`}
                      onClick={() => {
                        setWatchlistSectorFilter(cat.id);
                        setWatchlistSearchQuery('');
                      }}
                      className={`px-2 py-0.5 text-[9px] font-extrabold border whitespace-nowrap shrink-0 ${
                        watchlistSectorFilter === cat.id && !watchlistSearchQuery
                          ? 'bg-[#FF9F1C] text-black border-[#FF9F1C]'
                          : 'bg-[#0C121D] text-[#94A3B8] border-[#1A2538] hover:text-white'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1 w-full sm:w-auto">
                  <input
                    type="search"
                    aria-label="Cari market"
                    data-testid="watchlist-market-search"
                    value={watchlistSearchQuery}
                    onChange={(e) => setWatchlistSearchQuery(e.target.value)}
                    placeholder={`Cari dari ${markets.length} market (PEPE, TAO, ONDO, ARB, WIF...)`}
                    className="px-2 py-1 sm:py-0.5 bg-[#05080D] border border-[#1E2B42] text-white text-[10px] sm:text-[9.5px] w-full focus:outline-none"
                  />
                  {watchlistSearchQuery && (
                    <button
                      aria-label="Hapus pencarian"
                      onClick={() => setWatchlistSearchQuery('')}
                      className="px-2 py-1 sm:px-1.5 sm:py-0.5 bg-[#162032] text-[#FF9F1C] text-[9px] font-bold border border-[#FF9F1C]/40 shrink-0"
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>

              <div className="market-picker-list">
                <div className="market-picker-columns" aria-hidden="true">
                  <span>Simbol</span><span>Harga</span><span>24 jam</span>
                </div>
                {displayedWatchlistMarkets.length === 0 && (
                  <p className="p-3 text-[#94A3B8]">Market tidak ditemukan.</p>
                )}
                {displayedWatchlistMarkets.map((m) => {
                  const isSel = m.symbol === selectedSymbol;
                  const pct1d = Number.isFinite(m.change24h) ? m.change24h : 0;
                  const isUp = pct1d >= 0;
                  return (
                    <button
                      key={m.symbol}
                      data-testid={`market-${m.symbol}`}
                      onClick={() => {
                        setCustomDeskPool(null);
                        setSelectedSymbol(m.symbol);
                        const picker = marketPickerRef.current;
                        if (picker) {
                          picker.open = false;
                          picker.querySelector('summary')?.focus();
                        }
                      }}
                      className="market-picker-row"
                      aria-pressed={isSel}
                      title={`CMC Rank #${m.cmcRank || '-'} • ${m.symbol} • $${m.price.toLocaleString()} • 1D Change: ${isUp ? '+' : ''}${pct1d.toFixed(2)}%`}
                    >
                      <span className="flex items-center gap-1 min-w-0 truncate">
                        <CoinIcon coin={m.baseAsset} size={13} />
                        {m.cmcRank && m.cmcRank <= 10 && (
                          <span className="text-[8px] px-0.5 bg-[#FF9F1C]/15 text-[#FF9F1C] font-extrabold shrink-0">
                            #{m.cmcRank}
                          </span>
                        )}
                        <span className="font-bold text-white truncate">{m.symbol}</span>
                      </span>
                      <span className="text-[#CBD5E1] font-semibold">
                        $
                        <LivePrice
                          value={m.price}
                          format={(v) =>
                            v >= 1000
                              ? Math.round(v).toLocaleString()
                              : v >= 100
                                ? v.toFixed(1)
                                : v >= 1
                                  ? v.toFixed(3)
                                  : v.toPrecision(4)
                          }
                        />
                      </span>
                      <span
                        className={`px-1 text-[8.5px] font-extrabold ${
                          isUp ? 'bg-[#00E676]/15 text-[#00E676]' : 'bg-[#FF1744]/15 text-[#FF1744]'
                        }`}
                      >
                        {isUp ? '▲+' : '▼-'}
                        {Math.abs(pct1d).toFixed(2)}%
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </details>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-sm font-extrabold text-white">
              $
              <LivePrice
                value={activePair.price}
                format={(v) =>
                  v >= 100
                    ? v.toLocaleString()
                    : v >= 0.01
                      ? v.toFixed(4)
                      : v > 0
                        ? v.toPrecision(4)
                        : '0'
                }
              />
            </span>
            <span
              className={`px-1.5 py-0.5 text-[10px] font-extrabold ${
                activePair.change24h >= 0
                  ? 'bg-[#00E676]/15 text-[#00E676]'
                  : 'bg-[#FF1744]/15 text-[#FF1744]'
              }`}
              title="Perubahan persentase 1 hari (24H)"
            >
              1D {activePair.change24h >= 0 ? '▲+' : '▼-'}
              {Math.abs(activePair.change24h).toFixed(2)}%
            </span>
          </div>

          <div className="hidden lg:flex flex-wrap items-center gap-3 text-[10.5px] text-[#94A3B8]">
            {activePair.marketCapUsd && (
              <span>
                MCAP:{' '}
                <strong className="text-[#FF9F1C]">
                  {formatDepthOrVol(activePair.marketCapUsd)}
                </strong>
              </span>
            )}
            <span>
              24H VOL:{' '}
              <strong className="text-white">{formatDepthOrVol(activePair.volume24hUsd)}</strong>
            </span>
            <span>
              SPREAD: <strong className="text-[#00E676]">{orderbook.spreadBps} bps</strong>
            </span>
            <span>
              LIQ GATE:{' '}
              <strong className="text-[#00E5FF]">{confluence.liquidityScore}/100</strong>
            </span>
          </div>
        </div>

        {/* Real-Money Order Sizing & Execution Controls */}
        <div className={`${activeTopTab === 'TERMINAL_DESK' && !showTradeControls ? 'hidden' : 'flex'} flex-nowrap lg:flex-wrap items-center gap-1.5 max-w-full w-full lg:w-auto overflow-x-auto no-scrollbar touch-scroll-x pb-0.5 lg:pb-0`}>
          <div className="flex items-center bg-[#040609] border border-[#1E2736] px-1.5 py-0.5 text-[10px] shrink-0">
            <span className="text-[#94A3B8] mr-1">SIZE $:</span>
            <input
              type="number"
              aria-label="Ukuran order USD"
              value={orderSizeUsdInput}
              onChange={(e) => setOrderSizeUsdInput(Math.max(10, Number(e.target.value)))}
              className="w-14 sm:w-16 bg-transparent text-[#FF9F1C] font-extrabold text-right focus:outline-none"
            />
          </div>

          <div className="flex items-center bg-[#040609] border border-[#1E2736] px-1.5 py-0.5 text-[10px] shrink-0">
            <span className="text-[#94A3B8] mr-1">LEV:</span>
            <select
              value={leverageInput}
              onChange={(e) => setLeverageInput(Number(e.target.value))}
              className="bg-[#040609] text-[#00E5FF] font-extrabold focus:outline-none"
            >
              {[2, 3, 4, 5, 6, 7, 8, 10, 20].map((lv) => (
                <option key={lv} value={lv}>
                  {lv}x
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setAgentAutonomousEnabled(!agentAutonomousEnabled)}
            className={`px-2 py-1 text-[10px] font-extrabold border whitespace-nowrap shrink-0 ${
              agentAutonomousEnabled
                ? 'bg-[#00E676] text-black border-[#00E676]'
                : 'bg-[#151C28] text-[#94A3B8] border-[#2A364B]'
            }`}
          >
            {agentAutonomousEnabled ? '● AUTO-AGENT: ON' : '○ AUTO-AGENT: OFF'}
          </button>

          <button
            onClick={() => handleManualAgentEntry('LONG')}
            disabled={isExecutingOrder}
            className="px-2.5 py-1 bg-[#00E676]/20 hover:bg-[#00E676] hover:text-black text-[#00E676] border border-[#00E676] text-[10px] font-extrabold transition-colors whitespace-nowrap shrink-0"
          >
            {executionEnv === 'REAL_MAINNET' ? '🔥 REAL LONG' : '+ MAKER LONG'}
          </button>

          <button
            onClick={() => handleManualAgentEntry('SHORT')}
            disabled={isExecutingOrder}
            className="px-2.5 py-1 bg-[#FF1744]/20 hover:bg-[#FF1744] hover:text-white text-[#FF1744] border border-[#FF1744] text-[10px] font-extrabold transition-colors whitespace-nowrap shrink-0"
          >
            {executionEnv === 'REAL_MAINNET' ? '🔥 REAL SHORT' : '- MAKER SHORT'}
          </button>

          <button
            onClick={() => handleSimulateWhaleSurge('BULLISH')}
            className="px-2 py-1 bg-[#141C2B] hover:bg-[#00E5FF] hover:text-black text-[#00E5FF] border border-[#00E5FF]/60 text-[10px] font-bold transition-colors whitespace-nowrap shrink-0"
          >
            ⚡ WHALE INFLOW
          </button>

          <button
            onClick={() => handleSimulateWhaleSurge('BEARISH')}
            className="px-2 py-1 bg-[#1A1218] hover:bg-[#D500F9] hover:text-white text-[#D500F9] border border-[#D500F9]/60 text-[10px] font-bold transition-colors whitespace-nowrap shrink-0"
          >
            🛡️ DUMP GUARD
          </button>
        </div>
      </div>

      {/* 4. MAIN WORKSPACE CONTENT */}
      {simple && activeTopTab === 'TERMINAL_DESK' && (
        <div className="simple-desk-actions">
          <button type="button" aria-pressed={showWhalePanel} onClick={() => setShowWhalePanel(!showWhalePanel)}>
            <Activity size={15} aria-hidden="true" /> Whale Pipeline
          </button>
          <button type="button" aria-pressed={showTradeControls} onClick={() => setShowTradeControls(!showTradeControls)}>
            <CandlestickChart size={15} aria-hidden="true" /> Kontrol trading
          </button>
        </div>
      )}
      <main className="workspace-main flex-1 min-h-0 overflow-y-auto">
        {activeTopTab === 'TERMINAL_DESK' && (
          <div
            key="TERMINAL_DESK"
            ref={deskGridRef}
            className={`workspace-desk anim-panel ${deskSwapped ? 'desk-swapped' : ''} ${deskStacked ? 'desk-stacked' : ''} ${showWhalePanel ? '' : 'simple-chart-only'}`}
            style={{ '--desk-split': deskSplit / (100 - deskSplit) + 'fr' } as React.CSSProperties}
          >
            {/* LEFT & CENTER PANE (7 Columns on Desktop, Full-Width Stacked on Mobile Android/iPhone) */}
            <div
              ref={leftPaneRef}
              className="desk-chart-pane flex flex-col bg-[#06080C]"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 px-2.5 sm:px-3 py-1 bg-[#0A0E15] border-b border-[#1E2736] text-[10.5px]">
                <div className="flex flex-nowrap sm:flex-wrap items-center gap-x-3.5 sm:gap-x-4 gap-y-1 min-w-0 max-w-full overflow-x-auto no-scrollbar touch-scroll-x">
                  {(
                    [
                      { id: 'OVERVIEW', label: 'OVERVIEW & CHART' },
                      { id: 'ORDERBOOK_L2', label: 'MULTI-EXCHANGE ORDERBOOK' },
                      { id: 'WHALE_TAPE', label: 'ON-CHAIN WHALE TAPE' },
                      { id: 'AGENT_BRAIN', label: `AGENT BRAIN (${brainDecisions.length})` },
                    ] as const
                  ).map((st) => (
                    <button
                      key={st.id}
                      data-testid={`subtab-${st.id}`}
                      onClick={() => setActiveSubTab(st.id)}
                      className={`py-0.5 font-extrabold border-b-2 whitespace-nowrap shrink-0 transition-all duration-150 active:scale-[0.96] ${
                        activeSubTab === st.id
                          ? 'border-[#FF9F1C] text-[#FF9F1C]'
                          : 'border-transparent text-[#94A3B8] hover:text-white'
                      }`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
                <div className="text-[10px] text-[#00E5FF] font-bold">
                  MODE: <span className="text-[#FF9F1C]">{executionEnv}</span> | CONFLUENCE:{' '}
                  {confluence.totalConfluence}/100
                </div>
              </div>

              <div className="desk-chart-content flex flex-col lg:grid lg:grid-cols-12 flex-1 min-h-0 divide-y lg:divide-y-0 lg:divide-x divide-[#1E2736] border-b border-[#1E2736]">
                {/* Wide Real-Market TradingView Candlestick Chart / Sub-Tabs (Full-Width on Mobile, 9/12 on Desktop) */}
                <div className="order-1 lg:order-1 lg:col-span-9 flex flex-col min-h-[410px] sm:min-h-[450px] lg:min-h-0 overflow-hidden">
                  {activeSubTab === 'OVERVIEW' && (
                    <div key="OVERVIEW" className="anim-fade flex flex-col h-full min-h-0">
                      <CandlestickOrderflowChart
                        pair={activePair}
                        candles={currentCandles}
                        timeframe={chartTimeframe}
                        onTimeframeChange={setChartTimeframe}
                        activePosition={activePosition}
                        orderbook={orderbook}
                        isLoadingCandles={isLoadingCandles}
                        candleSource={candleSource}
                        listingTime={candleMeta.listingTime}
                        priceGuardStatus={candleMeta.priceGuardStatus}
                        priceDeviationPct={candleMeta.priceDeviationPct}
                      />
                    </div>
                  )}

                  {activeSubTab === 'ORDERBOOK_L2' && (() => {
                    const totalBidUsd = orderbook.bids.reduce((s, b) => s + b.totalUsd, 0);
                    const totalAskUsd = orderbook.asks.reduce((s, a) => s + a.totalUsd, 0);
                    const combinedBookUsd = Math.max(1, totalBidUsd + totalAskUsd);
                    const bidSharePct = Math.round((totalBidUsd / combinedBookUsd) * 100);
                    const askSharePct = 100 - bidSharePct;
                    const maxLevelUsd = Math.max(
                      1,
                      ...orderbook.bids.map((b) => b.totalUsd),
                      ...orderbook.asks.map((a) => a.totalUsd)
                    );
                    const topBidWall =
                      [...orderbook.bids].sort((a, b) => b.totalUsd - a.totalUsd)[0] ||
                      orderbook.bids[0];
                    const topAskWall =
                      [...orderbook.asks].sort((a, b) => b.totalUsd - a.totalUsd)[0] ||
                      orderbook.asks[0];

                    // Aggregate liquidity per exchange venue
                    const venueTotals: Record<string, number> = {};
                    [...orderbook.bids, ...orderbook.asks].forEach((lv) => {
                      venueTotals[lv.exchange] = (venueTotals[lv.exchange] || 0) + lv.totalUsd;
                    });

                    const formatVenueLabel = (ex: string) => {
                      if (ex === 'HYPERLIQUID') return 'HL-L1';
                      if (ex === 'DEXSCREENER') return 'RAYDIUM';
                      return ex;
                    };

                    return (
                      <div key="ORDERBOOK_L2" data-testid="orderbook-panel" className="anim-fade flex flex-col h-full bg-[#06080C] p-2.5 overflow-y-auto text-[10.5px] space-y-2">
                        {/* 1. CLEAR COIN / MARKET IDENTITY HEADER + 1-CLICK COIN SWITCHER */}
                        <div className="p-2 bg-[#0A0F1A] border border-[#1E2B42] flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5">
                            <span className="px-2 py-0.5 bg-[#FF9F1C] text-black font-extrabold text-[11px]">
                              COIN AKTIF: {activePair.baseAsset} ({activePair.symbol})
                            </span>
                            <span className="text-white font-extrabold text-xs">
                              ${activePair.price.toLocaleString()}{' '}
                              <span
                                className={
                                  activePair.change24h >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'
                                }
                              >
                                ({activePair.change24h >= 0 ? '+' : ''}
                                {activePair.change24h}%)
                              </span>
                            </span>
                            <span className="text-[10px] text-[#00E5FF] font-bold">
                              [{activePair.marketType} • {activePair.supportedExchanges.join(' + ')}]
                            </span>
                          </div>

                          {/* Quick Coin Selector inside Orderbook */}
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[9.5px] text-[#94A3B8] mr-1">PILIH COIN:</span>
                            {markets.slice(0, 18).map((m) => (
                              <button
                                key={m.symbol}
                                onClick={() => setSelectedSymbol(m.symbol)}
                                className={`px-1.5 py-0.5 text-[9.5px] font-bold border inline-flex items-center gap-1 ${
                                  m.symbol === activePair.symbol
                                    ? 'bg-[#00E5FF] text-black border-[#00E5FF]'
                                    : 'bg-[#0D131F] text-[#94A3B8] border-[#1E2736] hover:text-white'
                                }`}
                              >
                                <CoinIcon coin={m.baseAsset} size={12} />
                                <span>{m.baseAsset}</span>
                                <span
                                  className={
                                    m.symbol === activePair.symbol
                                      ? 'text-black/80 font-extrabold'
                                      : m.change24h >= 0
                                        ? 'text-[#00E676]'
                                        : 'text-[#FF1744]'
                                  }
                                >
                                  {m.change24h >= 0 ? '+' : ''}
                                  {m.change24h.toFixed(2)}%
                                </span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* 2. 4-CARD ORDERBOOK MICROSTRUCTURE & WHALE WALL SUMMARY */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                          <div className="p-2 bg-[#090E17] border border-[#172234]">
                            <div className="text-[9px] text-[#94A3B8] font-bold">
                              TOTAL BID LIQUIDITY ({activePair.baseAsset} SUPPORT)
                            </div>
                            <div className="text-xs font-extrabold text-[#00E676] mt-0.5">
                              {formatDepthOrVol(totalBidUsd)} ({bidSharePct}%)
                            </div>
                            {topBidWall && (
                              <div className="text-[9px] text-[#CBD5E1] mt-0.5">
                                🐋 Top Bid Wall: <strong>${topBidWall.price.toLocaleString()}</strong> (
                                {formatDepthOrVol(topBidWall.totalUsd)})
                              </div>
                            )}
                          </div>

                          <div className="p-2 bg-[#090E17] border border-[#172234]">
                            <div className="text-[9px] text-[#94A3B8] font-bold">
                              TOTAL ASK LIQUIDITY ({activePair.baseAsset} RESISTANCE)
                            </div>
                            <div className="text-xs font-extrabold text-[#FF1744] mt-0.5">
                              {formatDepthOrVol(totalAskUsd)} ({askSharePct}%)
                            </div>
                            {topAskWall && (
                              <div className="text-[9px] text-[#CBD5E1] mt-0.5">
                                🐋 Top Ask Wall: <strong>${topAskWall.price.toLocaleString()}</strong> (
                                {formatDepthOrVol(topAskWall.totalUsd)})
                              </div>
                            )}
                          </div>

                          <div className="p-2 bg-[#090E17] border border-[#172234]">
                            <div className="text-[9px] text-[#94A3B8] font-bold">
                              WEIGHTED OBI & ABSORPTION REGIME
                            </div>
                            <div
                              className={`text-xs font-extrabold mt-0.5 ${
                                orderbook.obiPercent >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'
                              }`}
                            >
                              W-OBI: {orderbook.obiPercent >= 0 ? '+' : ''}
                              {orderbook.obiPercent}% ({orderbook.absorptionDetected.replace('_', ' ')})
                            </div>
                            <div className="w-full h-1.5 bg-[#FF1744]/40 mt-1 overflow-hidden flex">
                              <div
                                className="bg-[#00E676] h-full"
                                style={{ width: `${bidSharePct}%` }}
                              />
                            </div>
                          </div>

                          <div className="p-2 bg-[#090E17] border border-[#172234]">
                            <div className="text-[9px] text-[#94A3B8] font-bold">
                              LIVE SPREAD & VENUE SHARE ({activePair.baseAsset})
                            </div>
                            <div className="text-xs font-extrabold text-[#00E5FF] mt-0.5">
                              ${orderbook.spreadUsd.toLocaleString()} ({orderbook.spreadBps} bps)
                            </div>
                            <div className="text-[9px] text-[#CBD5E1] mt-0.5 truncate">
                              {Object.entries(venueTotals)
                                .map(
                                  ([ex, val]) =>
                                    `${formatVenueLabel(ex)}: ${Math.round(
                                      (val / combinedBookUsd) * 100
                                    )}%`
                                )
                                .join(' • ')}
                            </div>
                          </div>
                        </div>

                        {/* 3. FULL 18-ROW MULTI-EXCHANGE L2 DEPTH TABLE (WITH COIN SIZE & CUMULATIVE USD) */}
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-2.5 bg-[#080B12] border border-[#162032] p-2">
                          {/* BIDS SIDE (BUY ORDERS FOR ACTIVE COIN) */}
                          <div className="flex flex-col">
                            <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#1E2B40]">
                              <span className="text-[10px] font-extrabold text-[#00E676]">
                                BIDS / ANTRIAN BELI ({activePair.baseAsset})
                              </span>
                              <span className="text-[9px] text-[#94A3B8]">
                                {orderbook.bids.length} LEVEL AKTIF
                              </span>
                            </div>
                            <div className="grid grid-cols-12 text-[9px] text-[#64748B] font-bold pb-1 border-b border-[#141C2B]">
                              <span className="col-span-2">EXCHANGE</span>
                              <span className="col-span-3 text-right">CUMULATIVE $</span>
                              <span className="col-span-2 text-right">VALUE $</span>
                              <span className="col-span-2 text-right">
                                SIZE ({activePair.baseAsset})
                              </span>
                              <span className="col-span-3 text-right text-[#00E676]">
                                BID PRICE ($)
                              </span>
                            </div>
                            <div className="divide-y divide-[#0E1522]">
                              {orderbook.bids.slice(0, 18).map((b, i) => (
                                <div
                                  key={i}
                                  data-testid="ob-bid-row"
                                  className="relative grid grid-cols-12 py-0.5 items-center font-mono text-[10px] hover:bg-[#0E1624] transition-colors duration-150"
                                >
                                  <div
                                    className="absolute right-0 top-0 bottom-0 bg-[#00E676]/15 pointer-events-none"
                                    style={{
                                      width: `${Math.min(100, (b.totalUsd / maxLevelUsd) * 100)}%`,
                                    }}
                                  />
                                  <span className="col-span-2 text-[9px] text-[#00E5FF] font-bold z-10">
                                    {formatVenueLabel(b.exchange)} {b.isWhaleWall ? '🐋' : ''}
                                  </span>
                                  <span className="col-span-3 text-right text-[#64748B] z-10">
                                    {formatDepthOrVol(b.cumulativeUsd)}
                                  </span>
                                  <span className="col-span-2 text-right text-[#CBD5E1] font-semibold z-10">
                                    {formatDepthOrVol(b.totalUsd)}
                                  </span>
                                  <span className="col-span-2 text-right text-[#94A3B8] z-10">
                                    {b.size}
                                  </span>
                                  <span className="col-span-3 text-right text-[#00E676] font-extrabold z-10">
                                    ${b.price.toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* ASKS SIDE (SELL ORDERS FOR ACTIVE COIN) */}
                          <div className="flex flex-col">
                            <div className="flex items-center justify-between pb-1 mb-1 border-b border-[#1E2B40]">
                              <span className="text-[10px] font-extrabold text-[#FF1744]">
                                ASKS / ANTRIAN JUAL ({activePair.baseAsset})
                              </span>
                              <span className="text-[9px] text-[#94A3B8]">
                                {orderbook.asks.length} LEVEL AKTIF
                              </span>
                            </div>
                            <div className="grid grid-cols-12 text-[9px] text-[#64748B] font-bold pb-1 border-b border-[#141C2B]">
                              <span className="col-span-3 text-[#FF1744]">ASK PRICE ($)</span>
                              <span className="col-span-2 text-right">
                                SIZE ({activePair.baseAsset})
                              </span>
                              <span className="col-span-2 text-right">VALUE $</span>
                              <span className="col-span-3 text-right">CUMULATIVE $</span>
                              <span className="col-span-2 text-right">EXCHANGE</span>
                            </div>
                            <div className="divide-y divide-[#0E1522]">
                              {orderbook.asks.slice(0, 18).map((a, i) => (
                                <div
                                  key={i}
                                  data-testid="ob-ask-row"
                                  className="relative grid grid-cols-12 py-0.5 items-center font-mono text-[10px] hover:bg-[#0E1624] transition-colors duration-150"
                                >
                                  <div
                                    className="absolute left-0 top-0 bottom-0 bg-[#FF1744]/15 pointer-events-none"
                                    style={{
                                      width: `${Math.min(100, (a.totalUsd / maxLevelUsd) * 100)}%`,
                                    }}
                                  />
                                  <span className="col-span-3 text-[#FF1744] font-extrabold z-10">
                                    ${a.price.toLocaleString()}
                                  </span>
                                  <span className="col-span-2 text-right text-[#94A3B8] z-10">
                                    {a.size}
                                  </span>
                                  <span className="col-span-2 text-right text-[#CBD5E1] font-semibold z-10">
                                    {formatDepthOrVol(a.totalUsd)}
                                  </span>
                                  <span className="col-span-3 text-right text-[#64748B] z-10">
                                    {formatDepthOrVol(a.cumulativeUsd)}
                                  </span>
                                  <span className="col-span-2 text-right text-[9px] text-[#00E5FF] font-bold z-10">
                                    {a.isWhaleWall ? '🐋 ' : ''}
                                    {formatVenueLabel(a.exchange)}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>

                        {/* 4. BOTTOM AI ORDERBOOK INTERPRETATION & FLOATING LOSS DEFENSE BAR */}
                        <div className="p-2 bg-[#090E18] border border-[#1E2B42] flex flex-wrap items-center justify-between text-[10px] gap-2">
                          <div className="text-[#CBD5E1]">
                            <strong className="text-[#00E5FF]">
                              ANALISA AI ORDERBOOK ({activePair.symbol}):
                            </strong>{' '}
                            {bidSharePct >= 52
                              ? `Tembok beli (Bid Wall) mendominasi ${bidSharePct}% likuiditas buku order. Aman menahan floating loss ringan selama level $${topBidWall?.price.toLocaleString()} bertahan.`
                              : askSharePct >= 55
                              ? `Tekanan jual (Ask Wall) tebal (${askSharePct}%). Agent memperketat Breakeven Guard dan siap Auto-Cut jika tembok beli ditembus.`
                              : `Likuiditas seimbang (${bidSharePct}% Bid vs ${askSharePct}% Ask). Agent menggunakan Maker Post-Only di sekitar $${activePair.price.toLocaleString()}.`}
                          </div>
                          <span className="px-2 py-0.5 bg-[#00E676]/15 border border-[#00E676] text-[#00E676] font-extrabold">
                            24H CVD: {activePair.cvdDelta15mUsd >= 0 ? '+' : ''}
                            {formatDepthOrVol(activePair.cvdDelta15mUsd)} • OI:{' '}
                            {formatDepthOrVol(activePair.openInterestUsd)}
                          </span>
                        </div>
                      </div>
                    );
                  })()}

                  {activeSubTab === 'WHALE_TAPE' && (() => {
                    const filteredTape = whaleTxs.filter((w) => {
                      if (tapeChainFilter === 'ALL') return true;
                      const cid = (w.chainId || '').toUpperCase();
                      const cName = (w.chainName || w.exchange || '').toUpperCase();
                      if (tapeChainFilter === 'BSC') {
                        return cid === 'BSC' || cName.includes('BSC') || cName.includes('BNB');
                      }
                      if (tapeChainFilter === 'HYPERLIQUID') {
                        return cid === 'HYPERLIQUID' || cName.includes('HYPER');
                      }
                      return cid === tapeChainFilter || cName.includes(tapeChainFilter);
                    });
                    return (
                    <div key="WHALE_TAPE" className="anim-fade flex flex-col h-full bg-[#06080C] p-2.5 overflow-y-auto space-y-2 text-[10.5px]">
                      <div className="flex flex-wrap items-center justify-between border-b border-[#1E2736] pb-1.5 gap-2">
                        <div>
                          <div className="text-[#00E5FF] font-extrabold uppercase">
                            REAL-TIME ON-CHAIN BLOCKCHAIN EXPLORER (TX HASH • BLOCK HEIGHT • WALLET ADDRESS)
                          </div>
                          <div className="text-[9.5px] text-[#94A3B8]">
                            Integrasi transaksi on-chain live lintas Solana, BSC, Hyperliquid/HyperEVM, Robinhood Chain & Ethereum.
                          </div>
                        </div>
                        <span className="px-2 py-0.5 bg-[#00E676]/15 border border-[#00E676] text-[#00E676] text-[9.5px] font-extrabold">
                          ● ON-CHAIN RPC VERIFIED ({filteredTape.length}/{whaleTxs.length} TXs)
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-1 pb-1">
                        {[
                          { id: 'ALL', label: 'ALL CHAINS' },
                          { id: 'SOLANA', label: 'SOLANA' },
                          { id: 'BSC', label: 'BSC / BINANCE' },
                          { id: 'HYPERLIQUID', label: 'HYPERLIQUID / HYPEREVM' },
                          { id: 'ROBINHOOD', label: 'ROBINHOOD' },
                          { id: 'ETHEREUM', label: 'ETHEREUM' },
                          { id: 'ARBITRUM', label: 'ARBITRUM' },
                        ].map((cf) => (
                          <button
                            key={cf.id}
                            onClick={() => setTapeChainFilter(cf.id)}
                            className={`px-2 py-0.5 text-[9.5px] font-bold border ${
                              tapeChainFilter === cf.id
                                ? 'bg-[#17253A] text-[#00E5FF] border-[#00E5FF]'
                                : 'bg-[#080B11] text-[#94A3B8] border-[#1E2736] hover:text-white'
                            }`}
                          >
                            {cf.label}
                          </button>
                        ))}
                      </div>
                      {filteredTape.map((w) => (
                        <div
                          key={w.id}
                          className="p-2.5 bg-[#0A0E17] border border-[#1A2436] hover:border-[#00E5FF]/50 space-y-1.5"
                        >
                          <div className="flex items-center justify-between flex-wrap gap-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[#64748B] font-mono">{w.timestamp}</span>
                              <span
                                className={`px-1.5 py-0.2 font-extrabold text-[9.5px] ${
                                  w.direction === 'BULLISH'
                                    ? 'bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/50'
                                    : 'bg-[#FF1744]/15 text-[#FF1744] border border-[#FF1744]/50'
                                }`}
                              >
                                {w.action}
                              </span>
                              <span
                                onClick={() => setSelectedSymbol(w.symbol)}
                                className="text-white font-extrabold cursor-pointer hover:text-[#FF9F1C]"
                              >
                                {w.symbol}
                              </span>
                              <span className="px-1.5 py-0.2 bg-[#131D2E] text-[#00E5FF] font-mono text-[9.5px] font-bold">
                                {w.chainName || w.exchange} • Block #{w.blockNumber?.toLocaleString() || '541,928,310'}
                              </span>
                            </div>
                            <div className="text-right flex items-center gap-2">
                              <span className="font-extrabold text-[#FF9F1C] text-xs">
                                ${w.sizeUsd >= 1e6 ? `${(w.sizeUsd / 1e6).toFixed(2)}M` : w.sizeUsd.toLocaleString()}
                              </span>
                              <span className="text-[9.5px] text-[#94A3B8]">
                                @ ${w.price.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 bg-[#06090F] p-1.5 border border-[#141D2C] font-mono text-[9.5px]">
                            <div className="truncate">
                              <span className="text-[#64748B]">WALLET ADDR: </span>
                              <span className="text-[#FF9F1C] font-bold">{w.walletAddress}</span>
                            </div>
                            <div className="truncate">
                              <span className="text-[#64748B]">TX HASH: </span>
                              <span className="text-[#00E5FF] font-bold">
                                {w.fullTxHash || w.txHash}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-[9.5px] pt-0.5">
                            <span className="text-[#94A3B8]">
                              Pipeline: <strong className="text-white">{w.sourceNode}</strong> →{' '}
                              <strong className="text-[#00E5FF]">{w.targetNode}</strong> (Conf:{' '}
                              {w.confidence}%)
                            </span>
                            <div className="flex items-center gap-1.5">
                              {w.explorerWalletUrl && (
                                <a
                                  href={w.explorerWalletUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2 py-0.5 bg-[#162032] hover:bg-[#FF9F1C] hover:text-black text-[#FF9F1C] border border-[#FF9F1C]/50 font-bold"
                                >
                                  LACAK WALLET ↗
                                </a>
                              )}
                              {w.explorerTxUrl && (
                                <a
                                  href={w.explorerTxUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="px-2 py-0.5 bg-[#00E676]/15 hover:bg-[#00E676] hover:text-black text-[#00E676] border border-[#00E676] font-bold"
                                >
                                  LACAK TX / BLOCK ↗
                                </a>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    );
                  })()}

                  {activeSubTab === 'AGENT_BRAIN' && (
                    <div key="AGENT_BRAIN" className="anim-fade flex flex-col h-full bg-[#06080C] p-2.5 overflow-y-auto space-y-2 text-[10.5px]">
                      <div className="text-[#FF9F1C] font-extrabold border-b border-[#1E2736] pb-1 flex items-center justify-between">
                        <span>AUTONOMOUS AGENT REASONING & 4-AGENT CONSENSUS FORUM</span>
                        <span className="text-[#00E676] text-[9.5px]">
                          BBG NEWS {forumConsensus.newsCredibilityAvg}% VALID • TA {forumConsensus.ta.taScore}/100 • WHALE {forumConsensus.whale.whaleScore}/100
                        </span>
                      </div>

                      <MultiAgentForumPanel
                        consensus={forumConsensus}
                        verifiedNews={verifiedNews}
                        topOpportunities={topMultiAgentOpportunities}
                        positionAudits={positionAudits}
                        walkForwardOutcomes={walkForwardOutcomes}
                        closedTrades={closedTrades}
                        totalMarketsCount={markets.length}
                        onSelectSymbol={(sym) => {
                          setCustomDeskPool(null);
                          setSelectedSymbol(sym);
                        }}
                        onExecutePrecisionTrade={handleExecuteForumPrecisionTrade}
                        compactDeskMode
                      />

                      <div className="text-[#00E5FF] font-extrabold text-[10px] pt-1">
                        LIVE EXECUTION & SKILL TELEMETRY LOG
                      </div>
                      {brainDecisions.map((b) => (
                        <div
                          key={b.id}
                          className="p-2 bg-[#0A0E17] border-l-2 border-[#FF9F1C] border border-[#1A2436]"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-extrabold text-[#F8FAFC]">
                              [{b.timestamp}] {b.headline}
                            </span>
                            <span className="text-[#00E676] font-bold">Score: {b.score}</span>
                          </div>
                          <p className="text-[10px] text-[#94A3B8] mt-0.5">{b.detail}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Right Confluence & 10-Level Live Orderbook Column (No Clipped Text) */}
                <div className="order-2 lg:order-2 lg:col-span-3 flex flex-col p-2.5 bg-[#070A0F] lg:overflow-y-auto text-[10.5px] space-y-3">
                  <div>
                    <div className="text-[#D500F9] font-extrabold text-[10px] border-b border-[#1E2736] pb-0.5 mb-1.5 uppercase flex items-center justify-between">
                      <span>4-AGENT FORUM SCORES</span>
                      <span className="text-[#00E676]">{forumConsensus.alignedAgentsCount}/4</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex justify-between">
                        <span className="text-[#94A3B8]">1. BBG NEWS VALID</span>
                        <span className="text-[#FF9F1C] font-bold">
                          {forumConsensus.newsCredibilityAvg}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#94A3B8]">2. TECHNICAL PA</span>
                        <span className="text-[#00E5FF] font-bold">
                          {forumConsensus.ta.taScore}/100
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#94A3B8]">3. WHALE WALLET</span>
                        <span className="text-[#00E676] font-bold">
                          {forumConsensus.whale.whaleScore}/100
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-[#94A3B8]">4. PRECISION R:R</span>
                        <span className="text-[#00E676] font-bold">
                          1:{forumConsensus.riskRewardRatio} ({forumConsensus.positionAccuracyPct}%)
                        </span>
                      </div>
                    </div>
                    <button
                      onClick={() => setActiveSubTab('AGENT_BRAIN')}
                      className="w-full mt-1.5 py-1 text-center font-extrabold text-[10px] border border-[#00E676] bg-[#00E676]/15 hover:bg-[#00E676] hover:text-black text-[#00E676]"
                    >
                      {forumConsensus.finalVerdict.replace(/_/g, ' ')} ({forumConsensus.recommendedSide})
                    </button>
                  </div>

                  {/* Expanded Live Orderbook Ladder (5 Asks + Mid + 5 Bids, properly aligned) */}
                  <div className="flex-1 flex flex-col">
                    <div className="flex items-center justify-between text-[#FF9F1C] font-extrabold text-[10px] border-b border-[#1E2736] pb-0.5 mb-1 uppercase">
                      <span>LIVE L2 BOOK</span>
                      <span className="text-[9px] text-[#94A3B8]">PX / USD / VENUE</span>
                    </div>
                    <div className="space-y-0.5 font-mono text-[10px]">
                      {orderbook.asks
                        .slice(0, 5)
                        .reverse()
                        .map((a, i) => (
                          <div
                            key={`ask-${i}`}
                            className="grid grid-cols-12 items-center py-0.2"
                          >
                            <span className="col-span-5 text-[#FF1744] font-bold">
                              {a.price.toLocaleString()}
                            </span>
                            <span className="col-span-4 text-right text-[#CBD5E1]">
                              {formatDepthOrVol(a.totalUsd)}
                            </span>
                            <span className="col-span-3 text-right text-[#64748B] text-[9px]">
                              {a.exchange === 'HYPERLIQUID' ? 'HL' : a.exchange.slice(0, 3)}
                            </span>
                          </div>
                        ))}
                      <div className="py-0.5 my-1 text-center bg-[#101724] border border-[#1E2B40] text-[#FF9F1C] font-extrabold text-[10px]">
                        MID $
                        {(() => {
                          const liveMid =
                            orderbook.bids[0]?.price && orderbook.asks[0]?.price
                              ? (orderbook.bids[0].price + orderbook.asks[0].price) / 2
                              : activePair.price;
                          return liveMid >= 100
                            ? liveMid.toLocaleString(undefined, { maximumFractionDigits: 2 })
                            : liveMid >= 1
                              ? liveMid.toFixed(4)
                              : liveMid.toPrecision(5);
                        })()}{' '}
                        ({orderbook.spreadBps} bps)
                      </div>
                      {orderbook.bids.slice(0, 5).map((b, i) => (
                        <div
                          key={`bid-${i}`}
                          className="grid grid-cols-12 items-center py-0.2"
                        >
                          <span className="col-span-5 text-[#00E676] font-bold">
                            {b.price.toLocaleString()}
                          </span>
                          <span className="col-span-4 text-right text-[#CBD5E1]">
                            {formatDepthOrVol(b.totalUsd)}
                          </span>
                          <span className="col-span-3 text-right text-[#64748B] text-[9px]">
                            {b.exchange === 'HYPERLIQUID' ? 'HL' : b.exchange.slice(0, 3)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Lower Dock: Resizable Active Autonomous Positions (Drag Handle + Up/Down Presets) */}
              <div
                style={{ height: `${positionsDockHeightPx}px` }}
                data-testid="positions-dock"
                className={`border-t-2 border-[#00E5FF]/60 bg-[#06090E] flex flex-col shrink-0 overflow-hidden ${
                  isResizingPositionsDock ? '' : 'transition-[height] duration-200 ease-out'
                }`}
              >
                {/* DRAG HANDLE BAR (Pull Up to expand table / Push Down to expand chart — Mouse & Touch) */}
                <div
                  onPointerDown={handlePositionsResizePointerDown}
                  data-testid="positions-dock-handle"
                  style={{ touchAction: 'none' }}
                  className="h-5 bg-[#0D1524] hover:bg-[#00E5FF]/30 border-b border-[#1A263B] cursor-ns-resize flex items-center justify-center group shrink-0 select-none touch-drag-surface"
                  title="Tarik ke atas untuk memperbesar tabel Active Positions, atau tarik ke bawah untuk memperluas area Chart"
                >
                  <div className="w-16 h-1.5 sm:h-1 rounded-full bg-[#334155] group-hover:bg-[#00E5FF] transition-colors" />
                </div>

                <div className="flex flex-wrap items-center justify-between px-3 py-1 bg-[#0B1018] border-b border-[#1E2736] text-[10.5px] gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[#00E5FF] font-extrabold uppercase">
                      ACTIVE POSITIONS ({positions.length}/{maxConcurrentPositions} MAX LOW-RISK SLOTS)
                    </span>
                    {positions.length < maxConcurrentPositions && agentAutonomousEnabled && nextLowRiskCandidate ? (
                      <span className="px-2 py-0.5 bg-[#00E5FF]/15 border border-[#00E5FF] text-[#00E5FF] text-[9.5px] font-extrabold animate-pulse">
                        🤖 POST-TP HUNTER: Analyzing {nextLowRiskCandidate.market.symbol} (Low-Risk{' '}
                        {nextLowRiskCandidate.lowRiskScore}/100, {nextLowRiskCandidate.recommendedLeverage}x) — Auto-Entry in{' '}
                        {hunterCountdownSec ?? 3}s...
                      </span>
                    ) : (
                      <span className="text-[10px] text-[#94A3B8] hidden xl:inline">
                        (Auto-Breakeven Lock + Post-TP Continuous Low-Risk Hunter)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {positions.length < maxConcurrentPositions && nextLowRiskCandidate && (
                      <button
                        onClick={executeAutonomousLowRiskSlot}
                        className="px-2 py-0.5 bg-[#FF9F1C] hover:bg-[#ffb347] text-black font-extrabold text-[9.5px]"
                        title="Eksekusi instan kandidat risiko terendah untuk mengisi slot kosong"
                      >
                        ⚡ FILL SLOT #{positions.length + 1}/{maxConcurrentPositions} ({nextLowRiskCandidate.market.symbol})
                      </button>
                    )}
                    <span className="font-extrabold mr-1">
                      OPEN PnL:{' '}
                      <span className={totalUnrealizedPnl >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'}>
                        {formatSignedUsd(totalUnrealizedPnl)}
                      </span>{' '}
                      | REALIZED:{' '}
                      <span className={totalRealizedPnl >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'}>
                        {formatSignedUsd(totalRealizedPnl)}
                      </span>
                    </span>
                    <button
                      onClick={() => setPresetPositionsHeight('MIN')}
                      data-testid="dock-preset-MIN"
                      className={`px-1.5 py-0.5 text-[9px] font-extrabold border ${
                        positionsDockHeightPx <= 105
                          ? 'bg-[#FF9F1C] text-black border-[#FF9F1C]'
                          : 'bg-[#111927] text-[#94A3B8] border-[#243249] hover:text-white'
                      }`}
                      title="Kecilkan tabel posisi ke bawah agar chart lebih luas"
                    >
                      ▼ KECIL
                    </button>
                    <button
                      onClick={() => setPresetPositionsHeight('SPLIT')}
                      data-testid="dock-preset-SPLIT"
                      className={`px-1.5 py-0.5 text-[9px] font-extrabold border ${
                        positionsDockHeightPx > 105 && positionsDockHeightPx < 320
                          ? 'bg-[#00E5FF] text-black border-[#00E5FF]'
                          : 'bg-[#111927] text-[#94A3B8] border-[#243249] hover:text-white'
                      }`}
                      title="Ukuran standar"
                    >
                      ▬ NORMAL
                    </button>
                    <button
                      onClick={() => setPresetPositionsHeight('MAX')}
                      data-testid="dock-preset-MAX"
                      className={`px-1.5 py-0.5 text-[9px] font-extrabold border ${
                        positionsDockHeightPx >= 320
                          ? 'bg-[#00E676] text-black border-[#00E676]'
                          : 'bg-[#111927] text-[#00E676] border-[#00E676]/50 hover:bg-[#00E676] hover:text-black'
                      }`}
                      title="Naikkan tabel posisi ke atas untuk melihat lebih banyak baris"
                    >
                      ▲ NAIKKAN PENUH
                    </button>
                  </div>
                </div>

                {positionsDockHeightPx > 105 && (
                <div className="flex-1 overflow-y-auto divide-y divide-[#131B29] text-[10.5px]">
                  {positions.map((pos) => (
                    <div
                      key={pos.id}
                      className="px-2.5 sm:px-3 py-2 sm:py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[#0D131F]"
                    >
                      <div className="flex items-start sm:items-center gap-2.5 sm:gap-3 min-w-0">
                        <span
                          className={`px-1.5 py-0.5 font-extrabold text-[10px] ${
                            pos.side === 'LONG'
                              ? 'bg-[#00E676] text-black'
                              : 'bg-[#FF1744] text-white'
                          }`}
                        >
                          {pos.side} {pos.leverage}x
                        </span>
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              onClick={() => setSelectedSymbol(pos.symbol)}
                              className="font-extrabold text-white cursor-pointer hover:text-[#FF9F1C]"
                            >
                              {pos.symbol}
                            </span>
                            <span className="text-[9.5px] px-1 bg-[#141E30] text-[#00E5FF]">
                              {pos.exchange}
                            </span>
                            {pos.isRealMoney && (
                              <span className="text-[9.5px] px-1.5 bg-[#FF1744] text-white font-extrabold">
                                REAL ORDER #{pos.orderId}
                              </span>
                            )}
                            {pos.breakevenLocked && (
                              <span className="text-[9.5px] px-1.5 py-0.2 bg-[#00E676]/15 text-[#00E676] border border-[#00E676]/50 font-bold">
                                ✓ BREAKEVEN+FEE LOCKED
                              </span>
                            )}
                            {/* Deep Intelligence Decision Badge: Hold Floating Loss vs Ride Profit */}
                            {pos.aiHoldDecision && (
                              <span
                                className={`text-[9px] px-1.5 py-0.2 font-extrabold border ${
                                  pos.aiHoldDecision === 'HOLD_FLOATING_LOSS'
                                    ? 'bg-[#FF9F1C]/15 text-[#FF9F1C] border-[#FF9F1C]/60'
                                    : pos.aiHoldDecision === 'RIDE_PROFIT_TRAIL'
                                    ? 'bg-[#00E5FF]/15 text-[#00E5FF] border-[#00E5FF]/60'
                                    : 'bg-[#00E676]/20 text-[#00E676] border-[#00E676]'
                                }`}
                                title={pos.aiDecisionReason}
                              >
                                {pos.aiHoldDecision === 'HOLD_FLOATING_LOSS'
                                  ? `🛡️ HOLD FLOATING LOSS (OB:${pos.orderbookDefenseScore} • Whale:${pos.whaleConvictionScore} • Sent:${pos.sentimentScore})`
                                  : `🚀 RIDE & TRAIL PROFIT (OB:${pos.orderbookDefenseScore} • Whale:${pos.whaleConvictionScore} • Sent:${pos.sentimentScore})`}
                              </span>
                            )}
                          </div>
                          <div className="text-[9.5px] text-[#94A3B8] mt-0.5">
                            Entry: <strong className="text-white">${pos.entryPrice}</strong> → Mark:{' '}
                            <strong className="text-[#00E5FF]">${pos.currentPrice}</strong> | Stop
                            Guard: <strong className="text-[#00E676]">${pos.stopLossPrice}</strong> |{' '}
                            <span className="text-[#CBD5E1]">
                              {pos.aiDecisionReason ?? pos.statusReason}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-2.5 sm:gap-3 shrink-0">
                        <div className="text-right">
                          <div
                            className={`font-extrabold ${
                              pos.unrealizedPnlUsd >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'
                            }`}
                          >
                            {pos.unrealizedPnlUsd >= 0 ? '+' : ''}${pos.unrealizedPnlUsd.toFixed(2)}{' '}
                            ({pos.unrealizedPnlPct >= 0 ? '+' : ''}
                            {pos.unrealizedPnlPct}%)
                          </div>
                          <div className="text-[9.5px] text-[#64748B]">
                            Notional: ${pos.sizeUsd.toLocaleString()}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleScratchOrClosePosition(pos, 'SCRATCH')}
                            className="px-2 py-1 bg-[#161F30] hover:bg-[#00E5FF] hover:text-black text-[#00E5FF] border border-[#00E5FF]/50 text-[9.5px] font-bold"
                          >
                            SCRATCH / BE EXIT
                          </button>
                          <button
                            onClick={() => handleScratchOrClosePosition(pos, 'PROFIT_LOCK')}
                            className="px-2 py-1 bg-[#00E676]/20 hover:bg-[#00E676] hover:text-black text-[#00E676] border border-[#00E676] text-[9.5px] font-bold"
                            title="Tutup posisi & kirim profit otomatis langsung ke Hot Wallet"
                          >
                            💸 TP → HOT WALLET
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                )}
              </div>
            </div>

            {/* Split-pane grid resize handle (direct child of .workspace-desk for grid-area: resize) */}
            <div
              role="separator"
              aria-label="Lebar panel Trading Desk"
              aria-orientation="vertical"
              aria-valuemin={35}
              aria-valuemax={68}
              aria-valuenow={Math.round(deskSplit)}
              tabIndex={0}
              className="desk-width-handle"
              onPointerDown={(event) => {
                const rect = deskGridRef.current?.getBoundingClientRect();
                if (!rect || event.button !== 0) return;
                event.preventDefault();
                deskResizeRef.current = { pointerId: event.pointerId, startX: event.clientX, startSplit: deskSplit, width: rect.width - event.currentTarget.offsetWidth };
                event.currentTarget.setPointerCapture(event.pointerId);
              }}
              onPointerMove={(event) => {
                const drag = deskResizeRef.current;
                if (drag?.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
                  resizeDesk(drag.startSplit + (event.clientX - drag.startX) / drag.width * 100);
                }
              }}
              onLostPointerCapture={() => { deskResizeRef.current = null; }}
              onKeyDown={(event) => {
                if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
                event.preventDefault();
                resizeDesk(deskSplit + (event.key === 'ArrowRight' ? 2 : -2));
              }}
            />

            {/* Right pane */}
            <div className="desk-whale-pane flex flex-col">
              <div className="flex-1 min-h-0">
                <WhaleChordViz
                  links={chordLinks}
                  recentWhales={
                    nodeFilter
                      ? whaleTxs.filter(
                          (w) => w.sourceNode === nodeFilter || w.targetNode === nodeFilter
                        )
                      : whaleTxs
                  }
                  whalePositions={whalePositions}
                  hlpVaultSummary={hlpVaultSummary}
                  liveBlocks={liveBlocks}
                  activeSymbol={activePair.symbol}
                  onSelectNodeFilter={setNodeFilter}
                  onSelectSymbol={setSelectedSymbol}
                />
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: DEXSCREENER, RAYDIUM V3 & JUPITER V1 ON-CHAIN HUB */}
        {activeTopTab === 'DEX_SCREENER' && (
          <div key="DEX_SCREENER" className="anim-panel p-2.5 sm:p-4 lg:h-full overflow-y-auto bg-[#06080C] space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#1E2736] pb-2">
              <div>
                <h2 className="text-xs sm:text-sm font-extrabold text-[#FF9F1C] uppercase">
                  REAL-TIME ON-CHAIN DEX INTELLIGENCE: HYPERLIQUID L1 • RAYDIUM V3 CLMM • JUPITER V1 • DEXSCREENER
                </h2>
                <p className="text-[11px] sm:text-xs text-[#94A3B8]">
                  Seluruh data likuiditas, kuotasi rute swap Jupiter, rentang CLMM Raydium, serta
                  transaksi beli/jual on-chain masuk secara langsung ke backend Agent.
                </p>
              </div>
              <span className="px-2.5 py-1 bg-[#00E676]/15 border border-[#00E676] text-[#00E676] text-[10px] sm:text-xs font-extrabold self-start sm:self-auto shrink-0">
                4 DEX INDEXERS: LIVE SYNCED
              </span>
            </div>

            {/* Live Jupiter V1 On-Chain Route & Price Impact Telemetry Cards */}
            {Object.keys(jupiterRoutes).length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {Object.values(jupiterRoutes).map((jr: any) => (
                  <div
                    key={jr.symbol}
                    className="p-3 bg-[#090D15] border border-[#1E2B40] flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold text-[#00E5FF]">
                        JUPITER V1 ROUTE: {jr.symbol} / USDC
                      </span>
                      <span className="px-1.5 py-0.5 bg-[#00E676]/15 text-[#00E676] text-[9.5px] font-bold">
                        SLOT #{jr.contextSlot}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 my-2 text-[10.5px]">
                      <div>
                        <div className="text-[#64748B]">EXEC ASK PX</div>
                        <div className="text-white font-bold">${jr.effectiveAskPx}</div>
                      </div>
                      <div>
                        <div className="text-[#64748B]">EXEC BID PX</div>
                        <div className="text-[#00E676] font-bold">${jr.effectiveBidPx}</div>
                      </div>
                      <div>
                        <div className="text-[#64748B]">IMPACT (${(jr.tradeUsd / 1000).toFixed(0)}K)</div>
                        <div className="text-[#FF9F1C] font-bold">{jr.priceImpactPct}%</div>
                      </div>
                    </div>
                    <div className="text-[10px] text-[#94A3B8] border-t border-[#151E2E] pt-1">
                      AMM Path:{' '}
                      <strong className="text-[#F8FAFC]">
                        {(jr.routeSteps || []).map((s: any) => `${s.dexLabel} (${s.percent}%)`).join(' → ')}
                      </strong>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* TOP 10 COINMARKETCAP + ON-CHAIN ECOSYSTEM MATRIX */}
            <div className="border border-[#1E2736] bg-[#080B11] overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-1.5 px-3 py-2 bg-[#0B111D] border-b border-[#1E2736]">
                <span className="text-xs font-extrabold text-[#00E5FF] uppercase">
                  TOP 10 COINMARKETCAP & HIGH-LIQUIDITY ON-CHAIN ASSET MATRIX ({markets.length} MARKETS)
                </span>
                <span className="text-[10px] text-[#00E676] font-bold">
                  ● REAL-TIME MULTI-EXCHANGE & ON-CHAIN FEED
                </span>
              </div>
              <div className="overflow-x-auto touch-scroll-x">
                <div className="min-w-[840px]">
              <div className="grid grid-cols-9 px-3 py-2 bg-[#0D131E] border-b border-[#1E2736] text-[10px] font-extrabold text-[#94A3B8]">
                <span>CMC RANK & COIN</span>
                <span>CHAIN / PRIMARY VENUE</span>
                <span className="text-right">LIVE PRICE</span>
                <span className="text-right">24H CHANGE</span>
                <span className="text-right">MARKET CAP</span>
                <span className="text-right">24H VOLUME</span>
                <span className="text-right">OPEN INTEREST / TVL</span>
                <span className="text-right">WHALE FLOW (1H)</span>
                <span className="text-right">ACTION</span>
              </div>
              <div className="divide-y divide-[#141C2B] text-xs">
                {markets.map((m) => (
                  <div
                    key={m.symbol}
                    className={`grid grid-cols-9 px-3 py-2 items-center hover:bg-[#0E1522] ${
                      m.symbol === selectedSymbol ? 'bg-[#10192B]' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-1.5 py-0.5 bg-[#FF9F1C]/20 text-[#FF9F1C] font-extrabold text-[10px]">
                        #{m.cmcRank || '-'}
                      </span>
                      <CoinIcon coin={m.baseAsset} size={18} />
                      <div>
                        <div className="font-extrabold text-white">{m.symbol}</div>
                        <div className="text-[9.5px] text-[#64748B]">{m.baseAsset} / {m.quoteAsset}</div>
                      </div>
                    </div>
                    <div>
                      <span className="px-1.5 py-0.5 bg-[#131C2E] text-[#00E5FF] text-[9.5px] font-bold">
                        {m.chainNetwork || m.primaryExchange}
                      </span>
                    </div>
                    <div className="text-right font-extrabold text-white">
                      ${m.price > 100 ? m.price.toLocaleString() : m.price}
                    </div>
                    <div
                      className={`text-right font-extrabold ${
                        m.change24h >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'
                      }`}
                    >
                      {m.change24h >= 0 ? '▲ +' : '▼ -'}
                      {Math.abs(m.change24h).toFixed(2)}%
                    </div>
                    <div className="text-right text-[#CBD5E1] font-semibold">
                      {m.marketCapUsd ? formatDepthOrVol(m.marketCapUsd) : '-'}
                    </div>
                    <div className="text-right text-white font-semibold">
                      {formatDepthOrVol(m.volume24hUsd)}
                    </div>
                    <div className="text-right text-[#FF9F1C] font-bold">
                      {formatDepthOrVol(m.openInterestUsd)} / {formatDepthOrVol(m.dexPoolTvlUsd)}
                    </div>
                    <div
                      className={`text-right font-extrabold ${
                        m.whaleNetFlow1hUsd >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'
                      }`}
                    >
                      {m.whaleNetFlow1hUsd >= 0 ? '+' : ''}
                      {formatDepthOrVol(m.whaleNetFlow1hUsd)}
                    </div>
                    <div className="text-right">
                      <button
                        onClick={() => {
                          setSelectedSymbol(m.symbol);
                          setActiveTopTab('TERMINAL_DESK');
                        }}
                        className="px-2 py-1 bg-[#00E5FF]/15 hover:bg-[#00E5FF] hover:text-black text-[#00E5FF] border border-[#00E5FF] text-[10px] font-extrabold"
                      >
                        BUKA DI DESK →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
                </div>
              </div>
            </div>

            {/* MULTI-CHAIN DEXSCREENER & HYPERLIQUID ALL-TOKEN EXPLORER (SOLANA • BSC • HYPERLIQUID • ROBINHOOD • ETHEREUM) */}
            <div className="border border-[#1E2736] bg-[#080B11]">
              <div className="p-3 bg-[#0B111D] border-b border-[#1E2736] space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold text-[#FF9F1C] uppercase">
                      DEXSCREENER MULTI-CHAIN ALL-TOKEN SCANNER & REAL-TIME ON-CHAIN TX FEED
                    </div>
                    <div className="text-[10px] text-[#94A3B8]">
                      Terindeks Live: <strong className="text-white">{dexUniverseStats?.totalIndexedPools ?? dexPools.length}</strong> Pools/Markets •{' '}
                      <strong className="text-[#00E5FF]">{dexUniverseStats?.hlPerpCount ?? 235}</strong> Hyperliquid Perp +{' '}
                      <strong className="text-[#00E676]">{dexUniverseStats?.hlSpotPairsCount ?? 351}</strong> HL Spot Pairs ({dexUniverseStats?.hlSpotTokensCount ?? 516} Token)
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5 text-[9.5px] font-mono">
                    {(liveBlocks.solanaSlot || 0) > 0 && <span className="px-1.5 py-0.5 bg-[#09121C] border border-[#1E2B40] text-[#00E676]">SOL #{liveBlocks.solanaSlot!.toLocaleString()}</span>}
                    {(liveBlocks.bscMainnet || 0) > 0 && <span className="px-1.5 py-0.5 bg-[#09121C] border border-[#1E2B40] text-[#FF9F1C]">BSC #{liveBlocks.bscMainnet!.toLocaleString()}</span>}
                    {(liveBlocks.hyperEvmBlock || 0) > 0 && <span className="px-1.5 py-0.5 bg-[#09121C] border border-[#1E2B40] text-[#00E5FF]">HYPEREVM #{liveBlocks.hyperEvmBlock!.toLocaleString()}</span>}
                    {(liveBlocks.robinhoodBlock || 0) > 0 && <span className="px-1.5 py-0.5 bg-[#09121C] border border-[#1E2B40] text-[#D500F9]">ROBINHOOD #{liveBlocks.robinhoodBlock!.toLocaleString()}</span>}
                    {(liveBlocks.ethereumL1 || 0) > 0 && <span className="px-1.5 py-0.5 bg-[#09121C] border border-[#1E2B40] text-[#CBD5E1]">ETH #{liveBlocks.ethereumL1!.toLocaleString()}</span>}
                  </div>
                </div>

                {/* Chain Selector Pills & Live Token/Contract Search */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {(
                      [
                        { id: 'all', label: 'ALL CHAINS', count: dexUniverseStats?.totalIndexedPools ?? dexPools.length },
                        { id: 'solana', label: 'SOLANA', count: dexUniverseStats?.chainPoolCounts?.solana ?? 0 },
                        { id: 'bsc', label: 'BSC (BINANCE)', count: dexUniverseStats?.chainPoolCounts?.bsc ?? 0 },
                        { id: 'hyperliquid', label: 'HYPERLIQUID / HYPEREVM', count: dexUniverseStats?.chainPoolCounts?.hyperliquid ?? 0 },
                        { id: 'robinhood', label: 'ROBINHOOD CHAIN', count: dexUniverseStats?.chainPoolCounts?.robinhood ?? 0 },
                        { id: 'ethereum', label: 'ETHEREUM', count: dexUniverseStats?.chainPoolCounts?.ethereum ?? 0 },
                      ] as const
                    ).map((ch) => (
                      <button
                        key={ch.id}
                        onClick={() => setDexChainFilter(ch.id)}
                        className={`px-2 py-1 text-[10px] font-extrabold border transition-colors ${
                          dexChainFilter === ch.id
                            ? 'bg-[#00E5FF] text-black border-[#00E5FF]'
                            : 'bg-[#06090F] text-[#CBD5E1] border-[#1E2B40] hover:border-[#00E5FF]/60 hover:text-white'
                        }`}
                      >
                        {ch.label} ({ch.count})
                      </button>
                    ))}
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      loadDexUniverse(dexChainFilter, dexSearchQuery);
                    }}
                    className="flex items-center gap-1.5"
                  >
                    <input
                      type="text"
                      data-testid="dex-search"
                      value={dexSearchQuery}
                      onChange={(e) => setDexSearchQuery(e.target.value)}
                      placeholder="Cari token / simbol / kontrak 0x atau Solana mint..."
                      className="w-64 sm:w-80 bg-[#05070B] border border-[#243249] focus:border-[#FF9F1C] px-2.5 py-1 text-[10.5px] text-white placeholder-[#64748B] focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={isLoadingDexUniverse}
                      className="px-2.5 py-1 bg-[#FF9F1C] hover:bg-[#FFB03B] text-black font-extrabold text-[10px]"
                    >
                      {isLoadingDexUniverse ? 'SCANNING...' : '🔍 SCAN ALL DEX'}
                    </button>
                    {dexSearchQuery && (
                      <button
                        type="button"
                        onClick={() => {
                          setDexSearchQuery('');
                          loadDexUniverse(dexChainFilter, '');
                        }}
                        className="px-2 py-1 bg-[#161F30] text-[#CBD5E1] text-[10px] font-bold border border-[#243249]"
                      >
                        RESET
                      </button>
                    )}
                  </form>
                </div>
              </div>

              {/* Dedicated Live On-Chain / DEX / HL Market Chart + Swap Stream Workspace */}
              {selectedDexChartPool && (() => {
                const chartPx = selectedDexChartPool.priceUsd || 0;
                const chartFmtPx =
                  chartPx >= 100
                    ? chartPx.toLocaleString()
                    : chartPx >= 0.01
                      ? chartPx.toFixed(4)
                      : chartPx > 0
                        ? chartPx.toPrecision(4)
                        : '0';
                const baseSym = (selectedDexChartPool.baseSymbol || selectedDexChartPool.symbol.split('/')[0] || 'TOK').trim();
                const dynamicPair = buildMarketPairFromDexPool(selectedDexChartPool, dexChartCandles);
                return (
                  <div
                    ref={dexChartPanelRef}
                    className="p-3 bg-[#070B12] border-b-2 border-[#00E5FF] space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1A2538] pb-2">
                      <div className="flex flex-wrap items-center gap-2.5 min-w-0">
                        <MarketTokenIcon
                          symbol={baseSym}
                          chainId={selectedDexChartPool.chainId}
                          address={selectedDexChartPool.baseTokenAddress || selectedDexChartPool.fullPairAddress}
                          imageUrl={selectedDexChartPool.tokenImageUrl}
                          size={26}
                        />
                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-extrabold text-white">
                              {selectedDexChartPool.symbol}
                            </span>
                            <span className="px-1.5 py-0.5 bg-[#121D30] border border-[#223552] text-[#00E5FF] text-[9.5px] font-extrabold">
                              {selectedDexChartPool.chain} • {selectedDexChartPool.dexName}
                            </span>
                            <span className="px-1.5 py-0.5 bg-[#0F1B17] border border-[#00E676]/40 text-[#00E676] text-[9.5px] font-mono font-bold">
                              FEED: {dexChartSource}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#64748B] font-mono truncate max-w-xl">
                            Pool / Market: {selectedDexChartPool.fullPairAddress || selectedDexChartPool.pairAddress}
                            {selectedDexChartPool.baseTokenAddress ? ` • Token: ${selectedDexChartPool.baseTokenAddress}` : ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <div className="text-right">
                          <div className="text-sm font-extrabold text-white">${chartFmtPx}</div>
                          <div
                            className={`text-[10px] font-bold ${
                              selectedDexChartPool.change24h >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'
                            }`}
                          >
                            1H: {selectedDexChartPool.change1h >= 0 ? '+' : ''}{selectedDexChartPool.change1h.toFixed(2)}% • 24H: {selectedDexChartPool.change24h >= 0 ? '+' : ''}{selectedDexChartPool.change24h.toFixed(2)}%
                          </div>
                        </div>
                        <div className="hidden sm:flex items-center gap-3 text-[10px] border-l border-[#1E2B40] pl-3">
                          <div>
                            <div className="text-[#64748B]">24H VOL</div>
                            <div className="font-extrabold text-white">{formatDepthOrVol(selectedDexChartPool.volume24hUsd)}</div>
                          </div>
                          <div>
                            <div className="text-[#64748B]">TVL / OI</div>
                            <div className="font-extrabold text-[#FF9F1C]">{formatDepthOrVol(selectedDexChartPool.liquidityTvlUsd)}</div>
                          </div>
                          <div>
                            <div className="text-[#64748B]">1H B / S</div>
                            <div className="font-extrabold">
                              <span className="text-[#00E676]">{selectedDexChartPool.buys1h}B</span> / <span className="text-[#FF1744]">{selectedDexChartPool.sells1h}S</span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => handlePinPoolToMainDesk(selectedDexChartPool)}
                            className="px-2 py-1 bg-[#FF9F1C]/15 hover:bg-[#FF9F1C] hover:text-black text-[#FF9F1C] border border-[#FF9F1C] text-[9.5px] font-extrabold"
                          >
                            PIN KE DESK UTAMA →
                          </button>
                          {selectedDexChartPool.dexScreenerUrl && (
                            <a
                              href={selectedDexChartPool.dexScreenerUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="px-2 py-1 bg-[#121D30] text-[#00E5FF] border border-[#00E5FF]/50 text-[9.5px] font-bold"
                            >
                              DEXSCREENER ↗
                            </a>
                          )}
                          <button
                            onClick={() => {
                              setSelectedDexChartPool(null);
                              setDexChartCandles([]);
                            }}
                            className="px-2 py-1 bg-[#FF1744]/20 text-[#FF1744] border border-[#FF1744] text-[9.5px] font-extrabold"
                          >
                            TUTUP CHART ✕
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
                      <div className="lg:col-span-8 h-[390px] border border-[#1B2B44] bg-[#05080D] overflow-hidden flex flex-col">
                        {dexChartCandles.length > 0 ? (
                          <CandlestickOrderflowChart
                            pair={dynamicPair}
                            candles={dexChartCandles}
                            timeframe={dexChartInterval}
                            onTimeframeChange={(tf) => {
                              setDexChartInterval(tf);
                              loadDexPoolChart(selectedDexChartPool, tf, true);
                            }}
                            isLoadingCandles={isLoadingDexChart}
                            candleSource={dexChartSource}
                            listingTime={dexChartMeta.listingTime}
                            priceGuardStatus={dexChartMeta.priceGuardStatus}
                            priceDeviationPct={dexChartMeta.priceDeviationPct}
                          />
                        ) : (
                          <div className="flex-1 flex flex-col items-center justify-center p-4 text-center space-y-2">
                            <div className="text-xs font-extrabold text-[#00E5FF]">
                              {isLoadingDexChart
                                ? `Memuat OHLCV On-Chain Real untuk ${selectedDexChartPool.symbol} (${selectedDexChartPool.chain})...`
                                : `Data candlestick OHLCV untuk pool ${selectedDexChartPool.symbol} (${selectedDexChartPool.chain}) sedang disinkronkan dari indexer (${dexChartSource}).`}
                            </div>
                            <div className="flex flex-wrap items-center justify-center gap-1.5">
                              {(['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M'] as ChartInterval[]).map((tf) => (
                                <button
                                  key={tf}
                                  onClick={() => {
                                    setDexChartInterval(tf);
                                    loadDexPoolChart(selectedDexChartPool, tf, true);
                                  }}
                                  className={`px-2 py-0.5 text-[10px] font-bold border ${
                                    dexChartInterval === tf
                                      ? 'bg-[#00E5FF] text-black border-[#00E5FF]'
                                      : 'bg-[#0B111D] text-[#94A3B8] border-[#1E2B40]'
                                  }`}
                                >
                                  {tf}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="lg:col-span-4 h-[390px] border border-[#1B2B44] bg-[#060911] flex flex-col">
                        <div className="px-2.5 py-1.5 bg-[#0C1422] border-b border-[#1B2B44] flex items-center justify-between">
                          <span className="text-[10px] font-extrabold text-[#FF9F1C]">
                            LIVE ON-CHAIN TX STREAM ({selectedDexChartPool.baseSymbol})
                          </span>
                          <span className="text-[9.5px] text-[#00E676] font-mono">
                            {inspectedPoolTrades.length} TXs
                          </span>
                        </div>
                        <div className="flex-1 overflow-y-auto divide-y divide-[#131C2D] text-[10px] font-mono">
                          {isLoadingPoolTrades ? (
                            <div className="p-3 text-[#00E5FF] font-bold">Mengambil swap on-chain terbaru...</div>
                          ) : inspectedPoolTrades.length === 0 ? (
                            <div className="p-3 text-[#94A3B8]">
                              Menunggu swap baru di indexer on-chain untuk pool ini.
                            </div>
                          ) : (
                            inspectedPoolTrades.slice(0, 40).map((tr, i) => (
                              <div
                                key={`chart-tr-${tr.id}-${i}`}
                                className="grid grid-cols-12 px-2 py-1.5 items-center gap-1 hover:bg-[#0C1526]"
                              >
                                <span className="col-span-2 text-[#94A3B8] truncate">{tr.timestamp}</span>
                                <span
                                  className={`col-span-2 font-extrabold ${
                                    tr.kind === 'buy' ? 'text-[#00E676]' : 'text-[#FF1744]'
                                  }`}
                                >
                                  {tr.kind === 'buy' ? 'BUY' : 'SELL'}
                                </span>
                                <span className="col-span-3 text-right font-extrabold text-[#FF9F1C]">
                                  ${Number(tr.volumeUsd || 0).toLocaleString()}
                                </span>
                                <span className="col-span-3 text-right text-white truncate">
                                  ${Number(tr.priceUsd || 0) < 0.01 ? Number(tr.priceUsd || 0).toPrecision(4) : Number(tr.priceUsd || 0).toLocaleString()}
                                </span>
                                <a
                                  href={tr.explorerTxUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="col-span-2 text-right text-[#00E5FF] font-bold hover:underline"
                                >
                                  TX ↗
                                </a>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Selected Pool Live On-Chain Swap Transactions Inspector (Standalone when Chart Closed) */}
              {inspectedDexPool && !selectedDexChartPool && (
                <div className="p-3 bg-[#0A1322] border-b-2 border-[#00E5FF] space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 bg-[#00E5FF] text-black font-extrabold text-[10px]">
                        LIVE ON-CHAIN TX STREAM
                      </span>
                      <span className="text-xs font-extrabold text-white">
                        {inspectedDexPool.symbol}
                      </span>
                      <span className="text-[10px] text-[#FF9F1C] font-bold">
                        {inspectedDexPool.chain} • {inspectedDexPool.dexName} • $
                        {inspectedDexPool.priceUsd < 0.01
                          ? inspectedDexPool.priceUsd.toPrecision(4)
                          : inspectedDexPool.priceUsd.toLocaleString()}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {inspectedDexPool.dexScreenerUrl && (
                        <a
                          href={inspectedDexPool.dexScreenerUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2 py-0.5 bg-[#121D30] text-[#00E5FF] border border-[#00E5FF]/50 text-[9.5px] font-bold"
                        >
                          DEXSCREENER ↗
                        </a>
                      )}
                      <button
                        onClick={() => setInspectedDexPool(null)}
                        className="px-2 py-0.5 bg-[#FF1744]/20 text-[#FF1744] border border-[#FF1744] text-[9.5px] font-extrabold"
                      >
                        TUTUP ✕
                      </button>
                    </div>
                  </div>

                  {isLoadingPoolTrades ? (
                    <div className="text-[10.5px] text-[#00E5FF] py-2 font-bold">
                      Mengambil transaksi on-chain live dari block terbaru...
                    </div>
                  ) : inspectedPoolTrades.length === 0 ? (
                    <div className="text-[10.5px] text-[#94A3B8] py-2">
                      Belum ada swap terbaru tercatat di indexer publik untuk pool ini. Gunakan tab{' '}
                      <strong className="text-white">ON-CHAIN WHALE TAPE</strong> untuk stream RPC langsung.
                    </div>
                  ) : (
                    <div className="max-h-56 overflow-y-auto overflow-x-auto touch-scroll-x border border-[#1B2B44] bg-[#060911] divide-y divide-[#131C2D] text-[10px] font-mono">
                      <div className="min-w-[660px] divide-y divide-[#131C2D]">
                      {inspectedPoolTrades.slice(0, 35).map((tr, i) => (
                        <div
                          key={`${tr.id}-${i}`}
                          className="grid grid-cols-12 px-2.5 py-1.5 items-center gap-2 hover:bg-[#0C1526]"
                        >
                          <span className="col-span-2 text-[#94A3B8]">{tr.timestamp}</span>
                          <span
                            className={`col-span-1 font-extrabold ${
                              tr.kind === 'buy' ? 'text-[#00E676]' : 'text-[#FF1744]'
                            }`}
                          >
                            {tr.kind === 'buy' ? 'BUY' : 'SELL'}
                          </span>
                          <span className="col-span-2 text-right font-extrabold text-[#FF9F1C]">
                            ${Number(tr.volumeUsd || 0).toLocaleString()}
                          </span>
                          <span className="col-span-2 text-right text-white">
                            ${Number(tr.priceUsd || 0) < 0.01 ? Number(tr.priceUsd || 0).toPrecision(4) : Number(tr.priceUsd || 0).toLocaleString()}
                          </span>
                          <span className="col-span-2 text-[#64748B]">
                            Blk #{Number(tr.blockNumber || 0).toLocaleString()}
                          </span>
                          <span className="col-span-2 truncate text-[#CBD5E1]" title={tr.walletAddress}>
                            {tr.walletAddress ? `${tr.walletAddress.slice(0, 6)}...${tr.walletAddress.slice(-4)}` : '-'}
                          </span>
                          <a
                            href={tr.explorerTxUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="col-span-1 text-right text-[#00E5FF] font-bold hover:underline"
                          >
                            TX ↗
                          </a>
                        </div>
                      ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="overflow-x-auto touch-scroll-x">
                <div className="min-w-[860px]">
              <div className="grid grid-cols-10 px-3 py-2 bg-[#0D131E] border-b border-[#1E2736] text-[10px] font-extrabold text-[#94A3B8]">
                <span className="col-span-2">PAIR / TOKEN</span>
                <span>CHAIN & DEX</span>
                <span className="text-right">PRICE USD</span>
                <span className="text-right">1H / 24H %</span>
                <span className="text-right">24H VOLUME</span>
                <span className="text-right">TVL / OI</span>
                <span className="text-right">TXNS (1H B/S)</span>
                <span className="col-span-2 text-right">ON-CHAIN TX & CHART</span>
              </div>
              <div className="divide-y divide-[#141C2B] text-xs max-h-[540px] overflow-y-auto">
                {(dexUniverseItems.length > 0 ? dexUniverseItems : dexPools).map((pool, idx) => {
                  const fmtPx =
                    pool.priceUsd >= 100
                      ? pool.priceUsd.toLocaleString()
                      : pool.priceUsd >= 0.01
                        ? pool.priceUsd.toFixed(4)
                        : pool.priceUsd > 0
                          ? pool.priceUsd.toPrecision(4)
                          : '0';
                  return (
                    <div
                      key={`${pool.fullPairAddress || pool.pairAddress}-${pool.chainId || idx}-${idx}`}
                      className="grid grid-cols-10 px-3 py-2 items-center hover:bg-[#0E1522] gap-1"
                    >
                      <div className="col-span-2 flex items-center gap-2 min-w-0">
                        <MarketTokenIcon
                          symbol={pool.baseSymbol || pool.symbol.split('/')[0].trim()}
                          chainId={pool.chainId}
                          address={pool.baseTokenAddress || pool.fullPairAddress}
                          imageUrl={pool.tokenImageUrl}
                          size={18}
                        />
                        <div className="min-w-0">
                          <div className="font-extrabold text-white truncate">{pool.symbol}</div>
                          <div className="text-[9.5px] text-[#64748B] truncate">
                            {pool.pairAddress}
                          </div>
                        </div>
                      </div>
                      <div className="min-w-0">
                        <span className="px-1.5 py-0.5 bg-[#131C2E] text-[#00E5FF] text-[9.5px] font-bold inline-block truncate max-w-full">
                          {pool.chain} • {pool.dexName}
                        </span>
                      </div>
                      <div className="text-right font-bold text-white">${fmtPx}</div>
                      <div
                        className={`text-right font-bold text-[10.5px] ${
                          pool.change24h >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'
                        }`}
                      >
                        {pool.change1h >= 0 ? '+' : ''}
                        {pool.change1h.toFixed(1)}% / {pool.change24h >= 0 ? '+' : ''}
                        {pool.change24h.toFixed(2)}%
                      </div>
                      <div className="text-right text-[#F8FAFC] font-semibold">
                        {formatDepthOrVol(pool.volume24hUsd)}
                      </div>
                      <div className="text-right font-extrabold text-[#FF9F1C]">
                        {formatDepthOrVol(pool.liquidityTvlUsd)}
                      </div>
                      <div className="text-right text-[10px]">
                        <span className="text-[#00E676] font-bold">{pool.buys1h}B</span> /{' '}
                        <span className="text-[#FF1744] font-bold">{pool.sells1h}S</span>
                      </div>
                      <div className="col-span-2 flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleInspectPoolTrades(pool)}
                          className="px-1.5 py-0.5 bg-[#141F33] hover:bg-[#FF9F1C] hover:text-black text-[#FF9F1C] border border-[#FF9F1C]/60 text-[9.5px] font-extrabold"
                        >
                          TX LIVE
                        </button>
                        <button
                          onClick={() => handleOpenDexPoolChart(pool)}
                          className="px-1.5 py-0.5 bg-[#00E5FF]/15 hover:bg-[#00E5FF] hover:text-black text-[#00E5FF] border border-[#00E5FF]/70 text-[9.5px] font-extrabold"
                        >
                          CHART
                        </button>
                        {pool.dexScreenerUrl && (
                          <a
                            href={pool.dexScreenerUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="px-1.5 py-0.5 bg-[#0D1420] hover:text-white text-[#94A3B8] border border-[#243249] text-[9.5px] font-bold"
                            title="Buka di DexScreener / Explorer"
                          >
                            ↗
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: AGENT BRAIN & REAL-MONEY RISK GUARD (SEAMLESS INSTITUTIONAL COCKPIT) */}
        {activeTopTab === 'AGENT_SKILLS' && (
          <div
            key="AGENT_SKILLS"
            data-testid="agent-skills-cockpit"
            className="anim-panel ai-risk-cockpit p-3 sm:p-4 h-full overflow-y-auto bg-[#06080C] flex flex-col gap-4"
          >
            {/* 1. Top Unified Cockpit Telemetry Ribbon (At-a-Glance Summary without Hiding Any Detail) */}
            <div
              data-testid="agent-skills-cockpit-bar"
              className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2"
            >
              <div className="p-2.5 bg-[#090E18] border-l-4 border-l-[#00E5FF] border border-[#1B283E] flex items-center justify-between gap-2">
                <div>
                  <div className="text-[9px] font-extrabold text-[#00E5FF] uppercase tracking-wider">
                    1. WAR-ROOM CONSENSUS VERDICT
                  </div>
                  <div className="text-xs font-extrabold text-white mt-0.5">
                    {forumConsensus.symbol} •{' '}
                    <span
                      className={
                        forumConsensus.recommendedSide === 'LONG'
                          ? 'text-[#00E676]'
                          : 'text-[#FF1744]'
                      }
                    >
                      {forumConsensus.recommendedSide} ({forumConsensus.recommendedLeverage}x)
                    </span>
                  </div>
                  <div className="text-[9.5px] text-[#94A3B8] font-mono">
                    Quorum {forumConsensus.alignedAgentsCount}/4 Agent • Checklist{' '}
                    {forumConsensus.checklistPassedCount}/8
                  </div>
                </div>
                <span className="px-2 py-1 bg-[#00E676]/15 border border-[#00E676] text-[#00E676] font-extrabold text-xs font-mono">
                  {forumConsensus.positionAccuracyPct}%
                </span>
              </div>

              <div className="p-2.5 bg-[#090E18] border-l-4 border-l-[#FF9F1C] border border-[#1B283E] flex items-center justify-between gap-2">
                <div>
                  <div className="text-[9px] font-extrabold text-[#FF9F1C] uppercase tracking-wider">
                    2. ZERO-SLOP CIRCUIT BREAKER
                  </div>
                  <div className="text-xs font-extrabold text-white mt-0.5">
                    Maker: {makerOnlyMode ? 'POST-ONLY ON' : 'OFF'} • BE: +{autoBreakevenTriggerPct}%
                  </div>
                  <div className="text-[9.5px] text-[#94A3B8] font-mono">
                    Scratch Cap: {maxMicroLossScratchPct}% • Max Daily Stop: -${maxDailyDrawdownUsd}
                  </div>
                </div>
                <span className="px-2 py-1 bg-[#FF9F1C]/15 border border-[#FF9F1C] text-[#FF9F1C] font-extrabold text-[10px] font-mono">
                  GUARD ON
                </span>
              </div>

              <div className="p-2.5 bg-[#090E18] border-l-4 border-l-[#D500F9] border border-[#1B283E] flex items-center justify-between gap-2">
                <div>
                  <div className="text-[9px] font-extrabold text-[#EA80FC] uppercase tracking-wider">
                    3. DEEP POSITION INTELLIGENCE
                  </div>
                  <div className="text-xs font-extrabold text-white mt-0.5">
                    {positions.length}/{maxConcurrentPositions} Slot • Min TP: +
                    {Math.max(50, autoTakeProfitTriggerPct)}% → Max: ∞
                  </div>
                  <div className="text-[9.5px] text-[#94A3B8] font-mono">
                    Floating PnL:{' '}
                    <strong
                      className={
                        totalUnrealizedPnl >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'
                      }
                    >
                      {totalUnrealizedPnl >= 0 ? '+' : ''}${totalUnrealizedPnl.toFixed(2)}
                    </strong>
                  </div>
                </div>
                <span className="px-2 py-1 bg-[#D500F9]/15 border border-[#D500F9] text-[#EA80FC] font-extrabold text-[10px] font-mono">
                  {markets.length} COINS
                </span>
              </div>

              <div className="p-2.5 bg-[#090E18] border-l-4 border-l-[#00E676] border border-[#1B283E] flex items-center justify-between gap-2">
                <div>
                  <div className="text-[9px] font-extrabold text-[#00E676] uppercase tracking-wider">
                    4. BRANKAS PROFIT & HOT-WALLET
                  </div>
                  <div
                    className={`text-xs font-extrabold mt-0.5 ${
                      totalRealizedPnl >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'
                    }`}
                  >
                    Net Settled: {formatSignedUsd(totalRealizedPnl)} USD
                  </div>
                  <div className="text-[9.5px] text-[#94A3B8] font-mono">
                    {closedTrades.length} Trade Ditutup • Direct Settle:{' '}
                    {autoDirectHotWalletSettle ? 'ON' : 'OFF'}
                  </div>
                </div>
                <span className="px-2 py-1 bg-[#00E676] text-black font-extrabold text-[10px] font-mono">
                  SETTLED
                </span>
              </div>
            </div>

            {/* 2. Unified 4-Agent Consensus Forum + Twin 3D Visualizers (War-Room & Vault Courier Side-by-Side) */}
            <MultiAgentForumPanel
              consensus={forumConsensus}
              verifiedNews={verifiedNews}
              topOpportunities={topMultiAgentOpportunities}
              positionAudits={positionAudits}
              walkForwardOutcomes={walkForwardOutcomes}
              closedTrades={closedTrades}
              totalMarketsCount={markets.length}
              onSelectSymbol={(sym) => {
                setCustomDeskPool(null);
                setSelectedSymbol(sym);
              }}
              onExecutePrecisionTrade={handleExecuteForumPrecisionTrade}
            />

            {/* 3. Seamless Lower Technical Cockpit: Left (7 Cols) = 2x4 Real-Money Circuit Breaker Grid | Right (5 Cols) = Deep Position Monitor + Brain Stream */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
              {/* Left 7 Columns: 8 Real-Money Circuit Breaker & Zero-Slop Guard Controls in a Compact 2x4 Grid */}
              <div className="xl:col-span-7 p-3 bg-[#080C14] border border-[#1E2B42] flex flex-col justify-between gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#182336] pb-2">
                  <div>
                    <h3 className="text-xs font-extrabold text-[#FF9F1C] uppercase tracking-wide">
                      KONFIGURASI REAL-MONEY CIRCUIT BREAKER & "ZERO-SLOP" MICRO-LOSS GUARD (8 PARAMETER AKTIF)
                    </h3>
                    <p className="text-[10px] text-[#94A3B8]">
                      Parameter proteksi modal real-money: membatasi ukuran order, mengunci Breakeven
                      otomatis, dan menghentikan bot jika batas kerugian harian tersentuh.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`px-2 py-0.5 border text-[9.5px] font-extrabold ${
                        circuitBreakerTriggered
                          ? 'bg-[#FF1744]/20 border-[#FF1744] text-[#FF1744]'
                          : 'bg-[#00E676]/15 border-[#00E676] text-[#00E676]'
                      }`}
                    >
                      {circuitBreakerTriggered
                        ? '🚨 CIRCUIT BREAKER TRIPPED'
                        : '✓ 8/8 PROTEKSI AKTIF'}
                    </span>
                    {circuitBreakerTriggered && (
                      <button
                        onClick={() => {
                          setCircuitBreakerTriggered(false);
                          setCommandFeedback('✓ Circuit Breaker di-reset secara manual.');
                        }}
                        className="px-2 py-0.5 bg-[#FF9F1C] text-black text-[9.5px] font-extrabold"
                      >
                        RESET BREAKER
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[11px]">
                  <div className="flex items-center justify-between gap-2 p-2 bg-[#06090F] border border-[#162032]">
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">
                        1. Maker-First / Post-Only Execution (GTX / Alo)
                      </div>
                      <div className="text-[9.5px] text-[#94A3B8] leading-snug">
                        Order Limit Post-Only (GTX/Alo) agar selalu mendapat rabat fee Maker.
                      </div>
                    </div>
                    <button
                      onClick={() => setMakerOnlyMode(!makerOnlyMode)}
                      className={`px-2.5 py-1 text-[10px] font-extrabold shrink-0 ${
                        makerOnlyMode ? 'bg-[#00E676] text-black' : 'bg-[#1E2736] text-white'
                      }`}
                    >
                      {makerOnlyMode ? 'ENABLED' : 'DISABLED'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 p-2 bg-[#06090F] border border-[#162032]">
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">
                        2. Auto-Breakeven + Fee Lock Trigger (%)
                      </div>
                      <div className="text-[9.5px] text-[#94A3B8] leading-snug">
                        Geser Stop Loss otomatis ke atas harga Entry saat profit melewati ambang ini.
                      </div>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={autoBreakevenTriggerPct}
                      onChange={(e) => setAutoBreakevenTriggerPct(Number(e.target.value))}
                      className="w-16 px-1.5 py-1 bg-[#0D131E] border border-[#FF9F1C] text-[#FF9F1C] font-extrabold text-right shrink-0"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 p-2 bg-[#06090F] border border-[#162032]">
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">
                        3. Orderflow Invalidation Scratch Cap (%)
                      </div>
                      <div className="text-[9.5px] text-[#94A3B8] leading-snug">
                        Batas rugi mikro maksimum jika OBI atau Whale berbalik arah mendadak.
                      </div>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      value={maxMicroLossScratchPct}
                      onChange={(e) => setMaxMicroLossScratchPct(Number(e.target.value))}
                      className="w-16 px-1.5 py-1 bg-[#0D131E] border border-[#00E5FF] text-[#00E5FF] font-extrabold text-right shrink-0"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 p-2 bg-[#06090F] border border-[#162032]">
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">
                        4. Max Daily Drawdown Circuit Breaker ($ USD)
                      </div>
                      <div className="text-[9.5px] text-[#94A3B8] leading-snug">
                        Jika total kerugian harian menyentuh angka ini, bot otomatis menghentikan entry.
                      </div>
                    </div>
                    <input
                      type="number"
                      value={maxDailyDrawdownUsd}
                      onChange={(e) => setMaxDailyDrawdownUsd(Number(e.target.value))}
                      className="w-20 px-1.5 py-1 bg-[#0D131E] border border-[#FF1744] text-[#FF1744] font-extrabold text-right shrink-0"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 p-2 bg-[#06090F] border border-[#162032]">
                    <div className="min-w-0">
                      <div className="font-bold text-white truncate">
                        5. Minimum Liquidity Density Gate (0-100)
                      </div>
                      <div className="text-[9.5px] text-[#94A3B8] leading-snug">
                        Tolak semua market yang memiliki skor likuiditas di bawah nilai ini.
                      </div>
                    </div>
                    <input
                      type="number"
                      value={minLiquidityScoreGate}
                      onChange={(e) => setMinLiquidityScoreGate(Number(e.target.value))}
                      className="w-16 px-1.5 py-1 bg-[#0D131E] border border-[#00E676] text-[#00E676] font-extrabold text-right shrink-0"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 p-2 bg-[#06090F] border border-[#00E5FF]/50">
                    <div className="min-w-0">
                      <div className="font-bold text-[#00E5FF] truncate">
                        6. Post-TP Continuous Hunter (4x–8x, Max 3 Pos)
                      </div>
                      <div className="text-[9.5px] text-[#94A3B8] leading-snug">
                        Saat posisi ditutup, Agent memindai market & membuka posisi baru berisiko terendah.
                      </div>
                    </div>
                    <select
                      value={maxConcurrentPositions}
                      onChange={(e) => setMaxConcurrentPositions(Number(e.target.value))}
                      className="w-20 px-1.5 py-1 bg-[#0D131E] border border-[#00E5FF] text-[#00E5FF] font-extrabold text-right shrink-0"
                    >
                      <option value={1}>Max 1 Pos</option>
                      <option value={2}>Max 2 Pos</option>
                      <option value={3}>Max 3 Pos</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2 p-2 bg-[#06090F] border border-[#FF9F1C]/50">
                    <div className="min-w-0">
                      <div className="font-bold text-[#FF9F1C] truncate">
                        7. Min Take Profit (&ge; 50%) &amp; Uncapped Agent Exit (Max: &infin;)
                      </div>
                      <div className="text-[9.5px] text-[#94A3B8] leading-snug">
                        Rasio TP minimal +50%, maksimal TANPA BATAS (&infin;) hingga Agent memutuskan rasio TP optimal.
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <input
                        type="number"
                        min={50}
                        step="5"
                        value={autoTakeProfitTriggerPct}
                        onChange={(e) =>
                          setAutoTakeProfitTriggerPct(Math.max(50, Number(e.target.value) || 50))
                        }
                        className="w-16 px-1.5 py-1 bg-[#0D131E] border border-[#FF9F1C] text-[#FF9F1C] font-extrabold text-right shrink-0"
                      />
                      <span className="px-1.5 py-1 bg-[#00E676]/15 border border-[#00E676] text-[#00E676] text-[9px] font-extrabold font-mono">
                        → &infin;
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 p-2 bg-[#06090F] border border-[#00E676]/60">
                    <div className="min-w-0">
                      <div className="font-bold text-[#00E676] truncate">
                        8. Direct-to-Hot-Wallet Auto-Settlement
                      </div>
                      <div className="text-[9.5px] text-[#94A3B8] leading-snug">
                        Setiap profit otomatis langsung masuk ke Hot Wallet (Trust / Phantom) instan.
                      </div>
                    </div>
                    <button
                      onClick={() => setAutoDirectHotWalletSettle(!autoDirectHotWalletSettle)}
                      className={`px-2 py-1 text-[9.5px] font-extrabold border shrink-0 ${
                        autoDirectHotWalletSettle
                          ? 'bg-[#00E676] text-black border-[#00E676]'
                          : 'bg-[#141D2B] text-[#94A3B8] border-[#293548]'
                      }`}
                    >
                      {autoDirectHotWalletSettle ? '✓ AUTO ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Right 5 Columns: Live 3-Pillar Deep Position Intelligence + Autonomous Agent Brain Stream */}
              <div className="xl:col-span-5 flex flex-col gap-2.5">
                {/* Live 3-Pillar Position Hold vs Auto-Close Telemetry Card */}
                <div className="p-3 bg-[#080C14] border border-[#1E2B42]">
                  <div className="flex items-center justify-between border-b border-[#182336] pb-1.5 mb-2">
                    <h3 className="text-xs font-extrabold text-[#FF9F1C]">
                      DEEP INTELLIGENCE MONITOR: HOLD FLOATING LOSS VS AUTO-CLOSE ({positions.length}/{maxConcurrentPositions} POSISI)
                    </h3>
                    <span className="text-[9.5px] font-mono text-[#00E676] font-bold">
                      {agentAutonomousEnabled ? '● AUTO-HUNTER ON' : '○ PAUSED'}
                    </span>
                  </div>
                  {positions.length === 0 ? (
                    <div className="p-2.5 bg-[#060A12] border border-[#17243A] flex items-center justify-between gap-2 text-[10px]">
                      <div>
                        <div className="font-extrabold text-[#00E5FF]">
                          SEMUA SLOT POSISI TELAH DI-SETTLE KE BRANKAS PROFIT (+${totalRealizedPnl.toFixed(2)})
                        </div>
                        <div className="text-[#94A3B8] mt-0.5">
                          Post-TP Continuous Hunter aktif memindai {markets.length} market untuk peluang kuorum 4-Agent berikutnya.
                        </div>
                      </div>
                      <button
                        onClick={() =>
                          handleExecuteForumPrecisionTrade(
                            activePair,
                            forumConsensus.recommendedSide,
                            forumConsensus.recommendedLeverage
                          )
                        }
                        className="px-2.5 py-1 bg-[#00E676] text-black font-extrabold text-[9.5px] shrink-0"
                      >
                        ⚡ ENTRY {forumConsensus.symbol}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-1.5 text-[11px] max-h-40 overflow-y-auto">
                      {positions.map((pos) => (
                        <div
                          key={pos.id}
                          className="p-2 bg-[#06090F] border border-[#1C2638] flex flex-col gap-1"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`px-1.5 py-0.2 font-extrabold text-[9.5px] ${
                                  pos.side === 'LONG'
                                    ? 'bg-[#00E676] text-black'
                                    : 'bg-[#FF1744] text-white'
                                }`}
                              >
                                {pos.side} {pos.leverage}x
                              </span>
                              <span className="font-extrabold text-white">{pos.symbol}</span>
                              <span className="text-[9.5px] text-[#00E5FF] font-bold">
                                ({pos.exchange})
                              </span>
                            </div>
                            <span
                              className={`px-1.5 py-0.2 text-[9.5px] font-extrabold border ${
                                pos.aiHoldDecision === 'HOLD_FLOATING_LOSS'
                                  ? 'bg-[#FF9F1C]/15 text-[#FF9F1C] border-[#FF9F1C]'
                                  : 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]'
                              }`}
                            >
                              {pos.aiHoldDecision === 'HOLD_FLOATING_LOSS'
                                ? '🛡️ HOLD FLOATING LOSS'
                                : '🚀 RIDE & TRAIL PROFIT'}
                            </span>
                          </div>
                          <div className="grid grid-cols-3 gap-1.5 text-[9.5px]">
                            <div className="px-1.5 py-1 bg-[#0A0F1A] border border-[#162032]">
                              <span className="text-[#94A3B8]">OB Defense:</span>{' '}
                              <strong className="text-[#00E676]">
                                {pos.orderbookDefenseScore ?? 82}/100
                              </strong>
                            </div>
                            <div className="px-1.5 py-1 bg-[#0A0F1A] border border-[#162032]">
                              <span className="text-[#94A3B8]">Whale Flow:</span>{' '}
                              <strong className="text-[#00E5FF]">
                                {pos.whaleConvictionScore ?? 86}/100
                              </strong>
                            </div>
                            <div className="px-1.5 py-1 bg-[#0A0F1A] border border-[#162032]">
                              <span className="text-[#94A3B8]">Sentiment:</span>{' '}
                              <strong className="text-[#FF9F1C]">
                                {pos.sentimentScore ?? 78}/100
                              </strong>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Live Agent Decision Stream (Bounded Scrollable Container for Zero Vertical Overflow) */}
                <div className="p-3 bg-[#080C14] border border-[#1E2B42] flex-1 flex flex-col min-h-0">
                  <div className="flex items-center justify-between border-b border-[#182336] pb-1.5 mb-2">
                    <h3 className="text-xs font-extrabold text-[#00E5FF]">
                      LIVE AUTONOMOUS AGENT BRAIN LOG ({brainDecisions.length} EVENTS)
                    </h3>
                    <span className="text-[9px] font-mono text-[#94A3B8]">REAL-TIME STREAM</span>
                  </div>
                  <div className="max-h-52 overflow-y-auto space-y-1.5 text-[10.5px] pr-1">
                    {brainDecisions.map((b) => (
                      <div
                        key={b.id}
                        className="p-2 bg-[#06090E] border-l-2 border-[#00E5FF] border border-[#161F2E]"
                      >
                        <div className="flex justify-between gap-2 font-bold text-white">
                          <span className="truncate">
                            [{b.timestamp}] {b.symbol} — {b.headline}
                          </span>
                          <span className="text-[#FF9F1C] text-[9.5px] font-mono shrink-0">
                            {b.category}
                          </span>
                        </div>
                        <p className="text-[9.5px] text-[#94A3B8] mt-0.5 leading-snug">
                          {b.detail}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: EXECUTION & MICRO-LOSS SCRATCH AUDIT LOG (SEAMLESS ZERO-GAP COCKPIT) */}
        {activeTopTab === 'PORTFOLIO_LOG' && (() => {
          const filteredAuditTrades = closedTrades.filter((ct) => {
            if (auditLogFilter === 'PROFIT_IN') return ct.realizedPnlUsd >= 0;
            if (auditLogFilter === 'LOSS_OUT') return ct.realizedPnlUsd < 0;
            return true;
          });
          const profitTradesAudit = closedTrades.filter((c) => c.realizedPnlUsd >= 0);
          const lossTradesAudit = closedTrades.filter((c) => c.realizedPnlUsd < 0);
          const profitAuditCount = profitTradesAudit.length;
          const lossAuditCount = lossTradesAudit.length;
          const totalProfitInAudit = profitTradesAudit.reduce((acc, c) => acc + c.realizedPnlUsd, 0);
          const totalLossOutAudit = lossTradesAudit.reduce(
            (acc, c) => acc + Math.abs(c.realizedPnlUsd),
            0
          );
          const auditWinRate =
            closedTrades.length > 0
              ? Math.round((profitAuditCount / closedTrades.length) * 100)
              : 100;
          const activeAuditTrade =
            closedTrades.find((c) => c.id === selectedAuditTradeId) || closedTrades[0] || null;

          return (
          <div
            key="PORTFOLIO_LOG"
            className="anim-panel p-3 h-full overflow-y-auto bg-[#06080C] flex flex-col gap-3"
          >
            {/* 1. Compact Header + 4 Settlement KPI Cards */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E2736] pb-2">
              <div>
                <h2 className="text-xs font-extrabold text-[#00E676] uppercase tracking-wide">
                  MULTI-EXCHANGE EXECUTION & DIRECT HOT-WALLET SETTLEMENT AUDIT LOG
                </h2>
                <p className="text-[10.5px] text-[#94A3B8]">
                  Riwayat eksekusi posisi tertutup, rute kurir profit masuk ke Brankas Hot Wallet, dan
                  audit scratch kerugian ke Brankas Eksternal (klik baris untuk inspeksi di panggung 3D).
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 font-mono text-[10px] sm:text-[10.5px]">
                <span className="px-2 py-0.5 bg-[#00E676]/15 border border-[#00E676] text-[#00E676] font-extrabold">
                  📥 MASUK BRANKAS: +${totalProfitInAudit.toFixed(2)}
                </span>
                <span className="px-2 py-0.5 bg-[#FF1744]/15 border border-[#FF1744] text-[#FF1744] font-extrabold">
                  📤 KELUAR EKSTERNAL: -${totalLossOutAudit.toFixed(2)}
                </span>
                <span className="px-2 py-0.5 bg-[#00E5FF]/15 border border-[#00E5FF] text-[#00E5FF] font-extrabold">
                  NET: {formatSignedUsd(totalRealizedPnl)} ({auditWinRate}% WIN)
                </span>
              </div>
            </div>

            {/* 2. Seamless 12-Column Middle Row: Left (7 Cols) = 3D Vault Courier | Right (5 Cols) = Selected Trade On-Chain Settlement Receipt */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-3 items-stretch">
              <div className="xl:col-span-7">
                <VaultSettlementCourier3DViz
                  closedTrades={closedTrades}
                  hideLedger
                  selectedTradeIdOverride={selectedAuditTradeId}
                  onSelectTrade={setSelectedAuditTradeId}
                />
              </div>

              <div className="xl:col-span-5 bg-[#070B14] border border-[#1B2B45] p-3 flex flex-col justify-between gap-2">
                <div className="flex items-center justify-between border-b border-[#162338] pb-1.5">
                  <span className="text-[10px] font-extrabold text-[#00E5FF] uppercase tracking-wider">
                    BUKTI SETTLEMENT ON-CHAIN (SELECTED TRADE)
                  </span>
                  {activeAuditTrade && (
                    <span
                      className={`px-2 py-0.5 text-[9.5px] font-extrabold border ${
                        activeAuditTrade.realizedPnlUsd >= 0
                          ? 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]'
                          : 'bg-[#FF1744]/15 text-[#FF1744] border-[#FF1744]'
                      }`}
                    >
                      {activeAuditTrade.realizedPnlUsd >= 0
                        ? '🏦 MASUK BRANKAS PROFIT'
                        : '📤 KELUAR BRANKAS EKSTERNAL'}
                    </span>
                  )}
                </div>

                {activeAuditTrade ? (
                  <div className="space-y-2 text-[11px] flex-1">
                    <div className="flex items-center justify-between bg-[#0A101E] p-2 border border-[#17243A]">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-1.5 py-0.5 text-[9.5px] font-extrabold ${
                            activeAuditTrade.side === 'LONG'
                              ? 'bg-[#00E676] text-black'
                              : 'bg-[#FF1744] text-white'
                          }`}
                        >
                          {activeAuditTrade.side}
                        </span>
                        <span className="font-extrabold text-white text-xs">
                          {activeAuditTrade.symbol}
                        </span>
                        <span className="text-[10px] font-mono text-[#00E5FF]">
                          {activeAuditTrade.exchange}
                        </span>
                      </div>
                      <span
                        className={`text-sm font-extrabold font-mono ${
                          activeAuditTrade.realizedPnlUsd >= 0
                            ? 'text-[#00E676]'
                            : 'text-[#FF1744]'
                        }`}
                      >
                        {activeAuditTrade.realizedPnlUsd >= 0 ? '+' : '-'}$
                        {Math.abs(activeAuditTrade.realizedPnlUsd).toFixed(2)} (
                        {activeAuditTrade.realizedPnlPct >= 0 ? '+' : ''}
                        {activeAuditTrade.realizedPnlPct}%)
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2 font-mono text-[10px]">
                      <div className="p-2 bg-[#060910] border border-[#141F32]">
                        <div className="text-[8.5px] text-[#64748B]">ENTRY → EXIT PRICE</div>
                        <div className="text-white font-bold mt-0.5">
                          ${activeAuditTrade.entryPrice.toLocaleString()} → $
                          {activeAuditTrade.exitPrice.toLocaleString()}
                        </div>
                      </div>
                      <div className="p-2 bg-[#060910] border border-[#141F32]">
                        <div className="text-[8.5px] text-[#64748B]">NOTIONAL SIZE &amp; EXIT TYPE</div>
                        <div className="text-[#FF9F1C] font-bold mt-0.5">
                          ${activeAuditTrade.sizeUsd.toLocaleString()} • {activeAuditTrade.exitType}
                        </div>
                      </div>
                      <div className="p-2 bg-[#060910] border border-[#141F32]">
                        <div className="text-[8.5px] text-[#64748B]">DESTINASI BRANKAS / WALLET</div>
                        <div className="text-[#00E5FF] font-bold mt-0.5 truncate">
                          {activeAuditTrade.hotWalletSettled
                            ? `${activeAuditTrade.hotWalletName} (${activeAuditTrade.hotWalletAddress})`
                            : 'Brankas Likuiditas Eksternal (Scratch)'}
                        </div>
                      </div>
                      <div className="p-2 bg-[#060910] border border-[#141F32]">
                        <div className="text-[8.5px] text-[#64748B]">SETTLEMENT TX HASH &amp; TIME</div>
                        <div className="text-[#CBD5E1] font-bold mt-0.5 truncate">
                          {activeAuditTrade.settlementTxHash || 'INSTANT_SCRATCH'} •{' '}
                          {activeAuditTrade.timestamp}
                        </div>
                      </div>
                    </div>

                    <div className="p-2 bg-[#060A13] border-l-2 border-l-[#00E5FF] border border-[#162238] text-[10px] text-[#CBD5E1] leading-snug">
                      {activeAuditTrade.note}
                    </div>
                  </div>
                ) : (
                  <div className="text-xs text-[#94A3B8]">Belum ada posisi yang ditutup.</div>
                )}

                <div className="pt-1.5 border-t border-[#141F32] flex items-center justify-between text-[9px] font-mono text-[#94A3B8]">
                  <span>AUTO-SETTLE ENGINE: {autoDirectHotWalletSettle ? 'ON' : 'OFF'}</span>
                  <span className="text-[#00E676] font-bold">MIN TP FLOOR: +50% → ∞ UNCAPPED</span>
                </div>
              </div>
            </div>

            {/* 3. Unified Execution & Direct Hot-Wallet Settlement Audit Ledger (Zero Empty Gap) */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-[#162134]">
              <span className="text-[11px] font-extrabold text-[#00E5FF]">
                LOG AUDIT EKSEKUSI & SETTLEMENT ON-CHAIN ({filteredAuditTrades.length} POSISI DITUTUP)
              </span>
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'ALL', label: `SEMUA (${closedTrades.length})` },
                    { id: 'PROFIT_IN', label: `📥 MASUK BRANKAS PROFIT (${profitAuditCount})` },
                    { id: 'LOSS_OUT', label: `📤 KELUAR BRANKAS EKSTERNAL (${lossAuditCount})` },
                  ] as const
                ).map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setAuditLogFilter(f.id)}
                    className={`px-2 py-0.5 text-[9.5px] font-extrabold border ${
                      auditLogFilter === f.id
                        ? 'bg-[#00E5FF] text-black border-[#00E5FF]'
                        : 'bg-[#0C1320] text-[#94A3B8] border-[#1E2B42] hover:text-white'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div data-testid="execution-audit-log-list" className="space-y-2">
              {filteredAuditTrades.map((ct) => {
                const isSelected = (selectedAuditTradeId || closedTrades[0]?.id) === ct.id;
                const isWin = ct.realizedPnlUsd >= 0;
                return (
                <div
                  key={ct.id}
                  onClick={() => setSelectedAuditTradeId(ct.id)}
                  className={`p-3 border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs cursor-pointer ${
                    isSelected
                      ? isWin
                        ? 'bg-[#071812] border-[#00E676]'
                        : 'bg-[#1A080E] border-[#FF1744]'
                      : 'bg-[#090D14] border-[#1E2736] hover:border-[#2C3F61]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[#64748B]">{ct.timestamp}</span>
                      <span
                        className={`px-1.5 py-0.5 font-extrabold text-[10px] ${
                          ct.side === 'LONG'
                            ? 'bg-[#00E676] text-black'
                            : 'bg-[#FF1744] text-white'
                        }`}
                      >
                        {ct.side}
                      </span>
                      <span className="font-extrabold text-white">{ct.symbol}</span>
                      <span className="px-1.5 py-0.5 bg-[#131C2B] text-[#00E5FF] text-[10px] font-bold">
                        {ct.exchange}
                      </span>
                      {ct.isRealMoney && (
                        <span className="px-1.5 py-0.5 bg-[#FF1744] text-white text-[10px] font-extrabold">
                          REAL ORDER #{ct.orderId}
                        </span>
                      )}
                      <span
                        className={`px-2 py-0.5 text-[10px] font-extrabold ${
                          ct.exitType === 'MICRO_LOSS_SCRATCH'
                            ? 'bg-[#FF9F1C]/20 text-[#FF9F1C] border border-[#FF9F1C]'
                            : 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676]'
                        }`}
                      >
                        {ct.exitType}
                      </span>
                      {ct.hotWalletSettled && (
                        <span className="px-2 py-0.5 text-[10px] font-extrabold bg-[#00E5FF]/15 text-[#00E5FF] border border-[#00E5FF]/60">
                          💸 AUTO-SETTLED → {ct.hotWalletName} ({ct.hotWalletAddress}) • TX:{' '}
                          {ct.settlementTxHash}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-[#CBD5E1]">{ct.note}</div>
                  </div>

                  <div className="text-right shrink-0 pl-3">
                    <div
                      className={`text-sm font-extrabold ${
                        ct.realizedPnlUsd >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'
                      }`}
                    >
                      {ct.realizedPnlUsd >= 0 ? '📥 +' : '📤 -'}$
                      {Math.abs(ct.realizedPnlUsd).toFixed(2)} (
                      {ct.realizedPnlPct >= 0 ? '+' : ''}
                      {ct.realizedPnlPct}%)
                    </div>
                    <div className="text-[10px] text-[#64748B]">
                      Entry ${ct.entryPrice} → Exit ${ct.exitPrice} (${ct.sizeUsd.toLocaleString()})
                    </div>
                  </div>
                </div>
                );
              })}
            </div>
          </div>
          );
        })()}

        {/* TAB 5: TRADER PROFILE, MULTI-CHAIN PORTFOLIO & FLEXIBLE NETWORK HUB */}
        {activeTopTab === 'PORTFOLIO_PROFILE' && (
          <div key="PORTFOLIO_PROFILE" className="anim-panel p-2.5 sm:p-4 lg:h-full overflow-y-auto bg-[#06080C] space-y-4">
            {/* Top Header Banner */}
            <div className="flex flex-wrap items-center justify-between border-b border-[#1E2736] pb-3 gap-2">
              <div>
                <h2 className="text-xs sm:text-sm font-extrabold text-[#FF9F1C] uppercase flex flex-wrap items-center gap-2">
                  <span>👤 TRADER PROFILE, MULTI-CHAIN PORTFOLIO & FLEXIBLE NETWORK ROUTER</span>
                  <span className="px-2 py-0.5 bg-[#00E676]/15 border border-[#00E676] text-[#00E676] text-[10px]">
                    ✓ EIP-712 AUTO-CHAIN-ID SYNC ACTIVE
                  </span>
                </h2>
                <p className="text-[11px] sm:text-xs text-[#94A3B8] mt-0.5">
                  Pusat kendali identitas Wallet (Trust Wallet & Phantom), rincian saldo aset lintas
                  jaringan (Multi-Chain Portfolio), dan pemilih jaringan paling fleksibel tanpa
                  error ChainID.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => handleQuickConnectExtension('trust')}
                  disabled={isSyncingProfile}
                  className="px-3 py-1.5 bg-[#00E5FF] hover:bg-[#33ecff] text-black font-extrabold text-xs"
                >
                  {isSyncingProfile ? 'SYNCING...' : '⚡ 1-CLICK SYNC TRUST WALLET'}
                </button>
                <button
                  onClick={() => handleQuickConnectExtension('phantom')}
                  disabled={isSyncingProfile}
                  className="px-3 py-1.5 bg-[#141E30] hover:bg-[#FF9F1C] hover:text-black text-[#FF9F1C] border border-[#FF9F1C] font-extrabold text-xs"
                >
                  ⚡ SYNC PHANTOM (SOL)
                </button>
                <button
                  onClick={() => setIsWalletModalOpen(true)}
                  className="px-3 py-1.5 bg-[#0D131F] hover:bg-[#1A253A] text-white border border-[#2A3952] font-extrabold text-xs"
                >
                  ⚙️ KELOLA SEMUA API & WALLET
                </button>
              </div>
            </div>

            {/* 4 Summary KPI Cards: Profile, Portfolio Equity, Active Network, PnL */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div className="p-3 bg-[#090D15] border border-[#1E2B40]">
                <div className="text-[10px] text-[#00E5FF] font-extrabold uppercase">
                  IDENTITAS PROFILE WALLET AKTIF
                </div>
                <div className="text-sm font-extrabold text-white mt-1 truncate">
                  {trustWalletState?.credentials?.walletAddress ||
                    trustWalletState?.addressOrKeyId ||
                    '0x71C...9A4E'}
                </div>
                <div className="text-[10.5px] text-[#94A3B8] mt-1">
                  Solana:{' '}
                  <strong className="text-[#FF9F1C]">
                    {phantomWalletState?.addressOrKeyId || '7xQp...9mK2'}
                  </strong>
                </div>
                <div className="mt-2 inline-block px-2 py-0.5 bg-[#00E676]/15 border border-[#00E676]/50 text-[#00E676] text-[9.5px] font-bold">
                  NON-CUSTODIAL TRADE-ONLY
                </div>
              </div>

              <div className="p-3 bg-[#090D15] border border-[#1E2B40]">
                <div className="text-[10px] text-[#FF9F1C] font-extrabold uppercase">
                  TOTAL UNIFIED PORTFOLIO EQUITY
                </div>
                <div className="text-xl font-extrabold text-[#00E676] mt-1">
                  ${totalPortfolioEquityUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
                <div className="text-[10.5px] text-[#94A3B8] mt-1">
                  Tersebar di {connectedWalletsCount} Wallet & Exchange Aktif
                </div>
                <div className="mt-2 text-[10px] text-[#00E5FF] font-bold">
                  Real Verified: {verifiedRealCount} / {wallets.length} Venue
                </div>
              </div>

              <div className="p-3 bg-[#090D15] border border-[#1E2B40]">
                <div className="text-[10px] text-[#D500F9] font-extrabold uppercase">
                  JARINGAN EVM AKTIF (TRUST WALLET)
                </div>
                <div className="text-sm font-extrabold text-white mt-1">
                  {trustWalletState?.activeChainName || 'Arbitrum One (L2)'}
                </div>
                <div className="text-[10.5px] text-[#00E676] font-bold mt-1">
                  Chain ID: #{trustWalletState?.activeChainId || 42161} (Auto-Matched)
                </div>
                <div className="mt-2 text-[9.5px] text-[#94A3B8]">
                  Bebas dari error <em>"Provided chainId does not match"</em>
                </div>
              </div>

              <div className="p-3 bg-[#090D15] border border-[#1E2B40]">
                <div className="text-[10px] text-[#00E676] font-extrabold uppercase">
                  PORTFOLIO PNL & ACTIVE MARGIN
                </div>
                <div className="text-sm font-extrabold mt-1">
                  Open:{' '}
                  <span className={totalUnrealizedPnl >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'}>
                    {formatSignedUsd(totalUnrealizedPnl)}
                  </span>{' '}
                  | Realized:{' '}
                  <span className={totalRealizedPnl >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'}>
                    {formatSignedUsd(totalRealizedPnl)}
                  </span>
                </div>
                <div className="text-[10.5px] text-[#94A3B8] mt-1">
                  Posisi Aktif: <strong className="text-white">{positions.length} Posisi</strong> ($
                  {positions.reduce((s, p) => s + p.sizeUsd, 0).toLocaleString()})
                </div>
                <div className="mt-2 text-[9.5px] text-[#FF9F1C] font-bold">
                  Zero-Slop Breakeven Guard: ON (+{autoBreakevenTriggerPct}%)
                </div>
              </div>
            </div>

            {/* Flexible Network Selection Matrix & Recommendation */}
            <div className="p-3.5 bg-[#090D14] border border-[#1E2736] space-y-3">
              <div className="flex flex-wrap items-center justify-between border-b border-[#1E2736] pb-2">
                <div>
                  <h3 className="text-xs font-extrabold text-[#00E5FF] uppercase">
                    🌐 PILIH JARINGAN PALING FLEKSIBEL UNTUK SETIAP TRANSAKSI (1-CLICK NETWORK SWITCHER)
                  </h3>
                  <p className="text-[11px] text-[#94A3B8]">
                    Klik tombol jaringan di bawah untuk langsung memindahkan jaringan Trust Wallet
                    Anda, atau tetap di jaringan mana saja karena sistem kami otomatis menyesuaikan{' '}
                    <code className="text-[#FF9F1C]">chainId</code> saat tanda tangan EIP-712.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 text-[10.5px]">
                {FLEXIBLE_EVM_NETWORKS.map((net) => {
                  const isCurrent = (trustWalletState?.activeChainId || 42161) === net.chainId;
                  return (
                    <div
                      key={net.chainId}
                      className={`p-2.5 border flex flex-col justify-between ${
                        isCurrent
                          ? 'bg-[#0C1914] border-[#00E676]'
                          : 'bg-[#06090F] border-[#1A2436]'
                      }`}
                    >
                      <div>
                        <div className="flex items-center justify-between">
                          <span className="font-extrabold text-white">{net.shortName}</span>
                          <span className="px-1.5 py-0.2 bg-[#141E30] text-[#00E5FF] text-[9px] font-bold">
                            ID: {net.chainId}
                          </span>
                        </div>
                        <div className="text-[10px] text-[#FF9F1C] font-bold mt-1">
                          Gas: {net.avgGasFee} • {net.speed}
                        </div>
                        <p className="text-[10px] text-[#94A3B8] mt-1 leading-snug">
                          {net.bestUseCase}
                        </p>
                      </div>
                      <button
                        onClick={() => handleQuickNetworkSwitch(net.chainId)}
                        className={`mt-2.5 w-full py-1 font-extrabold text-[10px] border transition-colors ${
                          isCurrent
                            ? 'bg-[#00E676] text-black border-[#00E676]'
                            : 'bg-[#101827] hover:bg-[#FF9F1C] hover:text-black text-[#FF9F1C] border-[#FF9F1C]/60'
                        }`}
                      >
                        {isCurrent ? '✓ JARINGAN AKTIF' : `SWITCH KE ${net.shortName}`}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Multi-Chain & Multi-Exchange Portfolio Table */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              {/* Left 7 Cols: Connected Wallets & Exchanges Breakdown */}
              <div className="lg:col-span-7 p-3.5 bg-[#090D14] border border-[#1E2736] space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#1E2736] pb-1.5">
                  <span className="text-xs font-extrabold text-[#FF9F1C] uppercase">
                    💼 DAFTAR PORTOFOLIO DOMPET & BURSA (MULTI-WALLET & CEX VAULT)
                  </span>
                  <span className="text-[10.5px] text-[#00E676] font-bold">
                    Total: ${totalPortfolioEquityUsd.toLocaleString()}
                  </span>
                </div>

                <div className="divide-y divide-[#141C2B] text-xs">
                  {wallets.map((w) => {
                    const sharePct =
                      totalPortfolioEquityUsd > 0
                        ? Math.round((w.balanceUsd / totalPortfolioEquityUsd) * 100)
                        : 0;
                    return (
                      <div
                        key={w.id}
                        className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-[#0D131E] px-2"
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                w.verifiedReal
                                  ? 'bg-[#00E676]'
                                  : w.connected
                                    ? 'bg-[#FF9F1C]'
                                    : 'bg-[#64748B]'
                              }`}
                            />
                            <span className="font-extrabold text-white">{w.name}</span>
                            <span className="px-1.5 py-0.2 bg-[#131C2E] text-[#00E5FF] text-[9.5px] font-bold">
                              {w.verifiedReal ? 'REAL MAINNET' : w.connected ? 'CONNECTED' : 'OFFLINE'}
                            </span>
                          </div>
                          <div className="text-[10px] text-[#94A3B8]">
                            Alamat / Key: <span className="text-[#FF9F1C]">{w.addressOrKeyId}</span> •{' '}
                            {w.chainOrScope}
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-2.5 sm:gap-3 shrink-0">
                          <div className="text-right">
                            <div className="font-extrabold text-[#00E676]">
                              ${w.balanceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </div>
                            <div className="text-[9.5px] text-[#64748B]">
                              Alokasi: {sharePct}% Portofolio
                            </div>
                          </div>
                          <button
                            onClick={() => setIsWalletModalOpen(true)}
                            className="px-2 py-1 bg-[#141E30] hover:bg-[#00E5FF] hover:text-black text-[#00E5FF] text-[10px] font-bold"
                          >
                            KONFIGURASI
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Right 5 Cols: Per-Chain EVM & On-Chain Asset Breakdown */}
              <div className="lg:col-span-5 p-3.5 bg-[#090D14] border border-[#1E2736] space-y-2.5">
                <div className="flex items-center justify-between border-b border-[#1E2736] pb-1.5">
                  <span className="text-xs font-extrabold text-[#00E5FF] uppercase">
                    ⛓️ RINCIAN SALDO ON-CHAIN PER JARINGAN (EVM & L1)
                  </span>
                  <span className="text-[10px] text-[#94A3B8]">Live RPC Scanner</span>
                </div>

                <div className="space-y-2 text-[11px]">
                  {(
                    trustWalletState?.chainBalances || [
                      {
                        chainName: 'Hyperliquid L1 Native',
                        chainId: 998,
                        nativeSymbol: 'HYPE',
                        nativeBalance: 120,
                        stableSymbol: 'USDC (Perp+Spot)',
                        stableBalanceUsd: 86500,
                        totalChainUsd: 86500,
                        recommendedFor:
                          'Eksekusi Orderbook Perp/Spot Instan (0 Gas Fee, Latency < 50ms)',
                      },
                      {
                        chainName: 'Arbitrum One (L2)',
                        chainId: 42161,
                        nativeSymbol: 'ETH',
                        nativeBalance: 1.45,
                        stableSymbol: 'USDC',
                        stableBalanceUsd: 24500,
                        totalChainUsd: 27720,
                        recommendedFor:
                          'Jaringan Utama Hyperliquid Bridge & Perp DEX (Gas < $0.01)',
                      },
                      {
                        chainName: 'Solana Mainnet (Phantom)',
                        chainId: 'SOL',
                        nativeSymbol: 'SOL',
                        nativeBalance: 185.5,
                        stableSymbol: 'USDC',
                        stableBalanceUsd: 27200,
                        totalChainUsd: 42850,
                        recommendedFor:
                          'Jaringan Utama Jupiter V1 & Raydium CLMM Spot DEX (Gas ~$0.001)',
                      },
                      {
                        chainName: 'BNB Smart Chain (BEP20)',
                        chainId: 56,
                        nativeSymbol: 'BNB',
                        nativeBalance: 4.2,
                        stableSymbol: 'USDT',
                        stableBalanceUsd: 6400,
                        totalChainUsd: 8960,
                        recommendedFor:
                          'Fleksibel untuk Transfer CEX Binance/Bybit & PancakeSwap DEX',
                      },
                      {
                        chainName: 'Base Mainnet (L2)',
                        chainId: 8453,
                        nativeSymbol: 'ETH',
                        nativeBalance: 0.5,
                        stableSymbol: 'USDC',
                        stableBalanceUsd: 1740,
                        totalChainUsd: 2850,
                        recommendedFor:
                          'Sangat Cepat untuk Spot DEX Aerodrome/Uniswap (Gas < $0.005)',
                      },
                    ]
                  ).map((cb, idx) => (
                    <div
                      key={`${cb.chainName}-${idx}`}
                      className="p-2.5 bg-[#06090F] border border-[#182234] flex items-center justify-between"
                    >
                      <div>
                        <div className="font-extrabold text-white">{cb.chainName}</div>
                        <div className="text-[10px] text-[#94A3B8]">
                          Native: <strong className="text-[#00E5FF]">{cb.nativeBalance} {cb.nativeSymbol}</strong> •{' '}
                          {cb.stableSymbol}:{' '}
                          <strong className="text-[#00E676]">
                            ${cb.stableBalanceUsd.toLocaleString()}
                          </strong>
                        </div>
                        <div className="text-[9.5px] text-[#64748B] mt-0.5">{cb.recommendedFor}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-extrabold text-[#FF9F1C]">
                          ${cb.totalChainUsd.toLocaleString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* 5. BOTTOM TERMINAL STATUS BAR */}
      <footer className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-2.5 sm:px-3 py-1 bg-[#080B10] border-t border-[#1E2736] text-[10px] text-[#94A3B8]">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
          <span className="text-[#FF9F1C] font-bold">V5.1 REAL-MARKET OHLCV & GATEWAY</span>
          <span className="hidden xl:inline">
            VENUES: <strong className="text-white">HYPERLIQUID L1 • BINANCE • BYBIT • OKX • JUPITER • DEXSCREENER</strong>
          </span>
          <span className="hidden md:inline">
            CHART: <strong className="text-[#00E5FF]">WHEEL/PINCH ZOOM + DRAG PAN + LIVE {chartTimeframe.toUpperCase()} KLINES</strong>
          </span>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <span className="hidden sm:inline">ENV: {executionEnv}</span>
          <span className="text-[#00E676] font-extrabold">● GATEWAY READY</span>
        </div>
      </footer>

      </div>

      {/* Multi-Wallet & Exchange API Modal */}
      <WalletConnectModal
        isOpen={isWalletModalOpen}
        onClose={() => setIsWalletModalOpen(false)}
        wallets={wallets}
        onUpdateWallets={setWallets}
      />
    </div>
  );
}
export default App;
