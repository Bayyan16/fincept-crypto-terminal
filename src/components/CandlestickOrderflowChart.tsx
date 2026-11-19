import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AgentPosition, CandlePoint, MarketPair, OrderbookState } from '../types/terminal';
import {
  computeBollingerBandsSeries,
  computeEmaSeries,
  computeTechnicalAnalysisSnapshot,
} from '../engine/multiAgentForum';
import {
  IconAreaLine,
  IconBrush,
  IconCandles,
  IconChevronDown,
  IconCollapse,
  IconCrosshair,
  IconExpand,
  IconEye,
  IconEyeOff,
  IconFibRetracement,
  IconHLine,
  IconHollowCandles,
  IconLock,
  IconLongShortPos,
  IconMagnet,
  IconMeasureRuler,
  IconRay,
  IconStayDrawing,
  IconText,
  IconTrash,
  IconTrendline,
  IconUnlock,
  IconVLine,
  IconXabcdPattern,
  IconZoomIn,
} from './TradingViewIcons';

export type ChartInterval =
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
  | '1M';

export type ChartStyleMode = 'CANDLES' | 'HOLLOW' | 'AREA';
export type PriceScaleMode = 'LINEAR' | 'LOG' | 'PERCENT';
export type DrawingToolMode =
  | 'CROSSHAIR'
  | 'TRENDLINE'
  | 'RAY'
  | 'HLINE'
  | 'VLINE'
  | 'FIB'
  | 'XABCD'
  | 'LONG_POS'
  | 'SHORT_POS'
  | 'BRUSH'
  | 'TEXT'
  | 'MEASURE'
  | 'ZOOM_IN';

export type HistoryRangePreset = '1D' | '5D' | '1M' | '3M' | '6M' | 'YTD' | '1Y' | '5Y' | 'ALL';
export type LineDashStyle = 'SOLID' | 'DASHED' | 'DOTTED';

interface TimePricePoint {
  t: number;
  p: number;
}

interface ChartDrawing {
  id: string;
  type:
    | 'TRENDLINE'
    | 'RAY'
    | 'HLINE'
    | 'VLINE'
    | 'FIB'
    | 'XABCD'
    | 'LONG_POS'
    | 'SHORT_POS'
    | 'BRUSH'
    | 'TEXT'
    | 'MEASURE';
  points: TimePricePoint[];
  color: string;
  opacity: number;
  lineWidth: number;
  lineStyle: LineDashStyle;
  text?: string;
  fontSize?: number;
  locked?: boolean;
  // For LONG_POS / SHORT_POS risk-reward box
  tpPrice?: number;
  slPrice?: number;
  endTime?: number;
}

interface CandlestickOrderflowChartProps {
  pair: MarketPair;
  candles: CandlePoint[];
  timeframe: ChartInterval;
  onTimeframeChange: (tf: ChartInterval) => void;
  activePosition?: AgentPosition;
  orderbook?: OrderbookState;
  isLoadingCandles?: boolean;
  candleSource?: string;
  listingTime?: number;
  priceGuardStatus?: string;
  priceDeviationPct?: number;
}

const INTERVAL_MS: Record<ChartInterval, number> = {
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

const QUICK_TIMEFRAMES: Array<{ id: ChartInterval; label: string }> = [
  { id: '1m', label: '1m' },
  { id: '5m', label: '5m' },
  { id: '15m', label: '15m' },
  { id: '1h', label: '1h' },
  { id: '4h', label: '4h' },
  { id: '1d', label: '1D' },
  { id: '1w', label: '1W' },
  { id: '1M', label: '1M' },
];

const DROPDOWN_TIMEFRAME_GROUPS: Array<{
  title: string;
  items: Array<{ id: ChartInterval; label: string }>;
}> = [
  {
    title: 'MINUTES',
    items: [
      { id: '1m', label: '1 minute' },
      { id: '3m', label: '3 minutes' },
      { id: '5m', label: '5 minutes' },
      { id: '15m', label: '15 minutes' },
      { id: '30m', label: '30 minutes' },
    ],
  },
  {
    title: 'HOURS',
    items: [
      { id: '1h', label: '1 hour' },
      { id: '2h', label: '2 hours' },
      { id: '4h', label: '4 hours' },
      { id: '8h', label: '8 hours' },
      { id: '12h', label: '12 hours' },
    ],
  },
  {
    title: 'DAYS / WEEKS / MONTHS',
    items: [
      { id: '1d', label: '1 day' },
      { id: '3d', label: '3 days' },
      { id: '1w', label: '1 week' },
      { id: '1M', label: '1 month' },
    ],
  },
];

const RANGE_PRESETS: Array<{
  id: HistoryRangePreset;
  label: string;
  targetTf: ChartInterval;
  spanMs: number | 'ALL' | 'YTD';
}> = [
  { id: '1D', label: '1D', targetTf: '5m', spanMs: 24 * 60 * 60_000 },
  { id: '5D', label: '5D', targetTf: '15m', spanMs: 5 * 24 * 60 * 60_000 },
  { id: '1M', label: '1M', targetTf: '1h', spanMs: 30 * 24 * 60 * 60_000 },
  { id: '3M', label: '3M', targetTf: '4h', spanMs: 90 * 24 * 60 * 60_000 },
  { id: '6M', label: '6M', targetTf: '1d', spanMs: 180 * 24 * 60 * 60_000 },
  { id: 'YTD', label: 'YTD', targetTf: '1d', spanMs: 'YTD' },
  { id: '1Y', label: '1Y', targetTf: '1d', spanMs: 365 * 24 * 60 * 60_000 },
  { id: '5Y', label: '5Y', targetTf: '1w', spanMs: 5 * 365 * 24 * 60 * 60_000 },
  { id: 'ALL', label: 'ALL', targetTf: '1w', spanMs: 'ALL' },
];

const TV_PALETTE = [
  '#2962FF',
  '#56B6F7',
  '#26A69A',
  '#34D399',
  '#F5B74F',
  '#FF9800',
  '#EF5350',
  '#E91E63',
  '#AB47BC',
  '#7E57C2',
  '#FFFFFF',
  '#94A3B8',
];

const TV_FIB_BANDS: Array<{ level: number; color: string }> = [
  { level: 0, color: '#787B86' },
  { level: 0.236, color: '#F44336' },
  { level: 0.382, color: '#FF9800' },
  { level: 0.5, color: '#4CAF50' },
  { level: 0.618, color: '#009688' },
  { level: 0.786, color: '#2196F3' },
  { level: 1, color: '#787B86' },
  { level: 1.618, color: '#2962FF' },
  { level: 2.618, color: '#AB47BC' },
];

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatChartPrice(val: number): string {
  if (!Number.isFinite(val)) return '0';
  const abs = Math.abs(val);
  if (abs >= 10000) return val.toFixed(1);
  if (abs >= 1000) return val.toFixed(2);
  if (abs >= 10) return val.toFixed(3);
  if (abs >= 1) return val.toFixed(4);
  if (abs >= 0.01) return val.toFixed(5);
  if (abs >= 0.0001) return val.toFixed(6);
  if (abs > 0) return val.toPrecision(4);
  return '0';
}

function formatCompactVol(vol: number): string {
  if (!Number.isFinite(vol) || vol <= 0) return '0';
  if (vol >= 1e9) return `${(vol / 1e9).toFixed(2)}B`;
  if (vol >= 1e6) return `${(vol / 1e6).toFixed(2)}M`;
  if (vol >= 1e3) return `${(vol / 1e3).toFixed(1)}K`;
  return `${Math.round(vol)}`;
}

function formatAxisTime(tsMs: number, spanMs: number): { text: string; isYear: boolean } {
  const d = new Date(tsMs);
  if (spanMs > 540 * 86_400_000) {
    if (d.getUTCMonth() === 0 || d.getUTCMonth() === 11) {
      return { text: String(d.getUTCFullYear()), isYear: true };
    }
    if (d.getUTCMonth() === 6) return { text: 'Jul', isYear: false };
    return { text: `${MONTHS_SHORT[d.getUTCMonth()]} '${String(d.getUTCFullYear()).slice(-2)}`, isYear: false };
  }
  if (spanMs > 60 * 86_400_000) {
    if (d.getUTCMonth() === 0) return { text: String(d.getUTCFullYear()), isYear: true };
    return { text: `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCDate()}`, isYear: false };
  }
  if (spanMs > 2 * 86_400_000) {
    return { text: `${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`, isYear: false };
  }
  return {
    text: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    isYear: false,
  };
}

function formatCrosshairTime(tsMs: number, interval: ChartInterval): string {
  const d = new Date(tsMs);
  const y = d.getUTCFullYear();
  const m = MONTHS_SHORT[d.getUTCMonth()];
  const day = String(d.getUTCDate()).padStart(2, '0');
  if (interval === '1d' || interval === '3d' || interval === '1w' || interval === '1M') {
    return `${day} ${m} ${y}`;
  }
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${m} '${String(y).slice(-2)} ${hh}:${mm}`;
}

function formatDurationSpan(ms: number): string {
  const abs = Math.abs(ms);
  const days = Math.floor(abs / 86_400_000);
  const hrs = Math.floor((abs % 86_400_000) / 3_600_000);
  const mins = Math.floor((abs % 3_600_000) / 60_000);
  if (days >= 365) return `${(days / 365).toFixed(1)}y`;
  if (days > 0) return `${days}d ${hrs}h`;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  return `${Math.max(1, mins)}m`;
}

function formatCountdown(interval: ChartInterval, nowMs: number): string {
  const step = INTERVAL_MS[interval] || 900_000;
  const remSec = Math.max(0, Math.floor((step - (nowMs % step)) / 1000));
  if (remSec >= 86400) {
    const days = Math.floor(remSec / 86400);
    const hrs = Math.floor((remSec % 86400) / 3600);
    return `${days}d ${hrs}h`;
  }
  const h = Math.floor(remSec / 3600);
  const m = Math.floor((remSec % 3600) / 60);
  const s = remSec % 60;
  if (h > 0) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function getStrokeDasharray(style: LineDashStyle): string | undefined {
  if (style === 'DASHED') return '6 4';
  if (style === 'DOTTED') return '2 3';
  return undefined;
}

export const CandlestickOrderflowChart: React.FC<CandlestickOrderflowChartProps> = ({
  pair,
  candles: rawCandles,
  timeframe,
  onTimeframeChange,
  activePosition,
  orderbook,
  isLoadingCandles = false,
  candleSource = 'HYPERLIQUID_L1',
  listingTime,
  priceGuardStatus = 'VERIFIED_SYNCED',
  priceDeviationPct = 0,
}) => {
  // Overlay visibility toggles
  const [showWhaleZones, setShowWhaleZones] = useState(true);
  const [showBotLevels, setShowBotLevels] = useState(true);
  const [showEma, setShowEma] = useState(true);
  const [showBollinger, setShowBollinger] = useState(false);
  const [showStructureLevels, setShowStructureLevels] = useState(true);

  // TradingView Style, Scale, Range, Fullscreen & Timeframe Dropdown State
  const [chartStyle, setChartStyle] = useState<ChartStyleMode>('CANDLES');
  const [scaleMode, setScaleMode] = useState<PriceScaleMode>('LINEAR');
  const [activeRange, setActiveRange] = useState<HistoryRangePreset | null>(null);
  const [pendingRange, setPendingRange] = useState<HistoryRangePreset | null>(null);
  const [tfMenuOpen, setTfMenuOpen] = useState<boolean>(false);
  const [trendFlyoutOpen, setTrendFlyoutOpen] = useState<boolean>(false);
  const [posFlyoutOpen, setPosFlyoutOpen] = useState<boolean>(false);
  const [isExpandedFullscreen, setIsExpandedFullscreen] = useState<boolean>(false);
  const [showMobileTools, setShowMobileTools] = useState<boolean>(false);
  const [nowClockMs, setNowClockMs] = useState<number>(() => Date.now());

  // TradingView Interactive Drawing Studio State
  const [drawingTool, setDrawingTool] = useState<DrawingToolMode>('CROSSHAIR');
  const [activeTrendSubtool, setActiveTrendSubtool] = useState<'TRENDLINE' | 'RAY' | 'HLINE' | 'VLINE'>('TRENDLINE');
  const [activePosSubtool, setActivePosSubtool] = useState<'LONG_POS' | 'SHORT_POS'>('LONG_POS');
  const [drawingsBySymbol, setDrawingsBySymbol] = useState<Record<string, ChartDrawing[]>>({});
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [draftPoints, setDraftPoints] = useState<TimePricePoint[]>([]);
  const [activeBrushStroke, setActiveBrushStroke] = useState<TimePricePoint[] | null>(null);
  const [cursorTp, setCursorTp] = useState<TimePricePoint | null>(null);

  // Drawing Defaults & Utility Toggles (exact match to TradingView bottom 5 icons)
  const [defaultDrawColor, setDefaultDrawColor] = useState<string>('#2962FF');
  const [defaultLineWidth, setDefaultLineWidth] = useState<number>(2);
  const [defaultLineStyle, setDefaultLineStyle] = useState<LineDashStyle>('SOLID');
  const [defaultOpacity, setDefaultOpacity] = useState<number>(0.85);
  const [defaultFontSize, setDefaultFontSize] = useState<number>(13);
  const [magnetEnabled, setMagnetEnabled] = useState<boolean>(false);
  const [stayInDrawingMode, setStayInDrawingMode] = useState<boolean>(false);
  const [allDrawingsLocked, setAllDrawingsLocked] = useState<boolean>(false);
  const [hideAllDrawings, setHideAllDrawings] = useState<boolean>(false);
  const [colorPaletteOpen, setColorPaletteOpen] = useState<boolean>(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // Drag handle state for editing placed drawings (endpoints, TP/SL/Entry box, whole shape drag)
  const [draggingHandle, setDraggingHandle] = useState<{
    drawingId: string;
    handle: 'pt0' | 'pt1' | 'pt2' | 'pt3' | 'pt4' | 'tp' | 'sl' | 'entry' | 'move';
    originTp: TimePricePoint;
    origDrawing: ChartDrawing;
  } | null>(null);

  useEffect(() => {
    const id = window.setInterval(() => setNowClockMs(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Layer 3 Client Chart Sanitizer: deduplicate, sort ascending, guarantee valid positive OHLC
  const candles = useMemo<CandlePoint[]>(() => {
    if (!Array.isArray(rawCandles) || rawCandles.length === 0) return [];
    const seen = new Map<number, CandlePoint>();
    for (const c of rawCandles) {
      if (
        !c ||
        !Number.isFinite(c.time) ||
        !(c.open > 0) ||
        !(c.close > 0) ||
        !(c.high > 0) ||
        !(c.low > 0)
      ) {
        continue;
      }
      seen.set(c.time, {
        ...c,
        high: Math.max(c.high, c.open, c.close),
        low: Math.min(c.low, c.open, c.close),
        volume: Number.isFinite(c.volume) && c.volume >= 0 ? c.volume : 0,
      });
    }
    return [...seen.values()].sort((a, b) => a.time - b.time);
  }, [rawCandles]);

  // Horizontal Bar Zoom & Pan State (panOffset supports negative future whitespace margin like TradingView!)
  const [visibleCount, setVisibleCount] = useState<number>(110);
  const [panOffset, setPanOffset] = useState<number>(-6);

  // Vertical Price Pan & Vertical Price Scale Zoom State
  const [pricePanRatio, setPricePanRatio] = useState<number>(0);
  const [priceScaleFactor, setPriceScaleFactor] = useState<number>(1);

  // Crosshair & 2D Drag State
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mouseY, setMouseY] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<'NONE' | 'CHART_2D_PAN' | 'PRICE_AXIS_SCALE' | 'BRUSH_DRAW'>('NONE');

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    startPanOffset: number;
    startPricePanRatio: number;
    startPriceScaleFactor: number;
  }>({
    clientX: 0,
    clientY: 0,
    startPanOffset: -6,
    startPricePanRatio: 0,
    startPriceScaleFactor: 1,
  });

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number }>({
    width: 780,
    height: 430,
  });

  const latestRef = useRef<{
    processMouseMove: (clientX: number, clientY: number) => void;
    handleBarZoom: (deltaBars: number, anchorRatio?: number) => void;
    handleVerticalZoom: (factorDelta: number) => void;
    clampedVisibleCount: number;
  }>({
    processMouseMove: () => {},
    handleBarZoom: () => {},
    handleVerticalZoom: () => {},
    clampedVisibleCount: 110,
  });
  const pendingMoveRef = useRef<{ clientX: number; clientY: number } | null>(null);
  const moveRafRef = useRef<number | null>(null);
  const wheelRafRef = useRef<number | null>(null);
  const wheelAccumRef = useRef<{ hTicks: number; vFactor: number; anchorRatio: number }>({
    hTicks: 0,
    vFactor: 1,
    anchorRatio: 0.85,
  });
  const lastCrosshairRef = useRef<{ index: number; mouseY: number } | null>(null);
  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStartRef = useRef<{ dist: number; visibleCount: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(260, Math.round(entry.contentRect.width));
        const h = Math.max(210, Math.round(entry.contentRect.height));
        setDims({ width: w, height: h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [isExpandedFullscreen]);

  // Keyboard shortcuts: Escape cancels active draft/fullscreen; Delete/Backspace removes selected drawing
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (editingTextId) return;
      if (e.key === 'Escape') {
        if (draftPoints.length > 0) {
          setDraftPoints([]);
        } else if (drawingTool !== 'CROSSHAIR') {
          setDrawingTool('CROSSHAIR');
        } else if (selectedDrawingId) {
          setSelectedDrawingId(null);
          setColorPaletteOpen(false);
        } else if (isExpandedFullscreen) {
          setIsExpandedFullscreen(false);
        }
        setTfMenuOpen(false);
        setTrendFlyoutOpen(false);
        setPosFlyoutOpen(false);
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && selectedDrawingId) {
        const activeTag = document.activeElement?.tagName?.toLowerCase();
        if (activeTag === 'input' || activeTag === 'textarea') return;
        e.preventDefault();
        setDrawingsBySymbol((prev) => ({
          ...prev,
          [pair.symbol]: (prev[pair.symbol] || []).filter((d) => d.id !== selectedDrawingId),
        }));
        setSelectedDrawingId(null);
        setColorPaletteOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [draftPoints.length, drawingTool, selectedDrawingId, isExpandedFullscreen, pair.symbol, editingTextId]);

  // Reset pan & vertical offset when symbol or timeframe changes
  useEffect(() => {
    setPanOffset(-6);
    setPricePanRatio(0);
    setPriceScaleFactor(1);
    setDraftPoints([]);
    setActiveBrushStroke(null);
    setSelectedDrawingId(null);
    setEditingTextId(null);
    lastCrosshairRef.current = null;
  }, [pair.symbol, timeframe]);

  const totalBars = candles.length;
  const maxBars = Math.max(20, totalBars);
  const minBars = Math.min(8, maxBars);
  const clampedVisibleCount = Math.max(minBars, Math.min(maxBars, visibleCount));
  const minPanOffset = -Math.max(4, Math.round(clampedVisibleCount * 0.42));
  const maxPanOffset = Math.max(0, totalBars - Math.min(12, clampedVisibleCount));
  const clampedPanOffset = Math.max(minPanOffset, Math.min(maxPanOffset, panOffset));

  // Auto-apply pending TradingView history range preset (1D..ALL)
  useEffect(() => {
    if (!pendingRange || totalBars === 0) return;
    const preset = RANGE_PRESETS.find((r) => r.id === pendingRange);
    if (!preset) {
      setPendingRange(null);
      return;
    }
    if (preset.spanMs === 'ALL') {
      setVisibleCount(totalBars);
      setPanOffset(-Math.max(4, Math.round(totalBars * 0.04)));
      setPricePanRatio(0);
      setPriceScaleFactor(1);
      setPendingRange(null);
      return;
    }
    const latestTime = candles[candles.length - 1]?.time || Date.now();
    const cutoffMs =
      preset.spanMs === 'YTD'
        ? Date.UTC(new Date(latestTime).getUTCFullYear(), 0, 1)
        : latestTime - preset.spanMs;
    const firstIdx = candles.findIndex((c) => c.time >= cutoffMs);
    const barsInSpan = firstIdx >= 0 ? Math.max(12, totalBars - firstIdx) : totalBars;
    const targetVis = Math.min(totalBars, barsInSpan);
    setVisibleCount(targetVis);
    setPanOffset(-Math.max(4, Math.round(targetVis * 0.06)));
    setPricePanRatio(0);
    setPriceScaleFactor(1);
    setPendingRange(null);
  }, [pendingRange, totalBars, candles]);

  // Smooth default framing when changing timeframes directly
  const prevTfRef = useRef<ChartInterval>(timeframe);
  useEffect(() => {
    if (prevTfRef.current !== timeframe) {
      prevTfRef.current = timeframe;
      if ((timeframe === '1w' || timeframe === '1M') && totalBars > 20 && !pendingRange) {
        setVisibleCount(totalBars);
        setPanOffset(-Math.max(4, Math.round(totalBars * 0.04)));
      } else if (timeframe !== '1w' && timeframe !== '1M' && !pendingRange) {
        const defVis = Math.min(totalBars || 140, 140);
        setVisibleCount(defVis);
        setPanOffset(-Math.max(5, Math.round(defVis * 0.06)));
      }
    }
  }, [timeframe, totalBars, pendingRange]);

  const handleSelectRangePreset = (presetId: HistoryRangePreset) => {
    const preset = RANGE_PRESETS.find((r) => r.id === presetId);
    if (!preset) return;
    setActiveRange(presetId);
    setPendingRange(presetId);
    if (preset.targetTf !== timeframe) {
      onTimeframeChange(preset.targetTf);
    }
  };

  // Virtual window supports right-side future margin (negative clampedPanOffset!)
  const virtualEnd = totalBars - clampedPanOffset;
  const virtualStart = virtualEnd - clampedVisibleCount;
  const sliceStart = Math.max(0, Math.floor(virtualStart));
  const sliceEnd = Math.min(totalBars, Math.ceil(virtualEnd));
  const visibleCandles = useMemo(
    () => candles.slice(sliceStart, sliceEnd),
    [candles, sliceStart, sliceEnd]
  );

  // Full-series TA & Indicators
  const allCloses = useMemo(() => candles.map((c) => c.close), [candles]);
  const taSnapshot = useMemo(
    () => computeTechnicalAnalysisSnapshot(pair, candles),
    [pair, candles]
  );
  const fullEma20 = useMemo(() => computeEmaSeries(allCloses, 20), [allCloses]);
  const fullEma50 = useMemo(() => computeEmaSeries(allCloses, 50), [allCloses]);
  const fullEma200 = useMemo(() => computeEmaSeries(allCloses, 200), [allCloses]);
  const fullBollinger = useMemo(() => computeBollingerBandsSeries(allCloses, 20, 2), [allCloses]);

  const ema20Points = useMemo(() => fullEma20.slice(sliceStart, sliceEnd), [fullEma20, sliceStart, sliceEnd]);
  const ema50Points = useMemo(() => fullEma50.slice(sliceStart, sliceEnd), [fullEma50, sliceStart, sliceEnd]);
  const ema200Points = useMemo(() => fullEma200.slice(sliceStart, sliceEnd), [fullEma200, sliceStart, sliceEnd]);
  const bbUpperPoints = useMemo(
    () => fullBollinger.upper.slice(sliceStart, sliceEnd),
    [fullBollinger.upper, sliceStart, sliceEnd]
  );
  const bbLowerPoints = useMemo(
    () => fullBollinger.lower.slice(sliceStart, sliceEnd),
    [fullBollinger.lower, sliceStart, sliceEnd]
  );

  // Smooth horizontal bar zoom (supports zooming seamlessly from 8 bars up to 5,000 bars!)
  const handleBarZoom = useCallback(
    (deltaBars: number, anchorRatio = 0.85) => {
      setActiveRange(null);
      setVisibleCount((prev) => {
        const cur = Math.max(minBars, Math.min(maxBars, prev));
        const next = Math.max(minBars, Math.min(maxBars, cur + deltaBars));
        const diff = cur - next;
        if (diff !== 0) {
          setPanOffset((prevPan) => {
            const shift = Math.round(diff * (1 - anchorRatio));
            const nextMinPan = -Math.max(4, Math.round(next * 0.42));
            const nextMaxPan = Math.max(0, totalBars - Math.min(12, next));
            return Math.max(nextMinPan, Math.min(nextMaxPan, prevPan + shift));
          });
        }
        return next;
      });
    },
    [minBars, maxBars, totalBars]
  );

  const handleVerticalZoom = useCallback((factorDelta: number) => {
    setPriceScaleFactor((prev) => {
      const next = Math.max(0.18, Math.min(5.0, prev * factorDelta));
      return Number(next.toFixed(3));
    });
  }, []);

  // Native non-passive Wheel Zoom (cursor-anchored like TradingView)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const flushWheel = () => {
      wheelRafRef.current = null;
      const { hTicks, vFactor, anchorRatio } = wheelAccumRef.current;
      wheelAccumRef.current.hTicks = 0;
      wheelAccumRef.current.vFactor = 1;

      if (vFactor !== 1) latestRef.current.handleVerticalZoom(vFactor);
      if (hTicks !== 0) {
        const step = Math.max(3, Math.round(latestRef.current.clampedVisibleCount * 0.14));
        latestRef.current.handleBarZoom(hTicks * step, anchorRatio);
      }
    };

    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const isOverRightPriceAxis = relX >= rect.width - 78;

      if (e.shiftKey || isOverRightPriceAxis) {
        wheelAccumRef.current.vFactor *= e.deltaY < 0 ? 0.88 : 1.14;
      } else {
        const plotWidthPx = Math.max(100, rect.width - 86);
        const anchorRatio = Math.max(0.05, Math.min(1.0, (relX - 8) / plotWidthPx));
        wheelAccumRef.current.hTicks += e.deltaY < 0 ? -1 : 1;
        wheelAccumRef.current.anchorRatio = anchorRatio;
      }

      if (wheelRafRef.current === null) {
        wheelRafRef.current = requestAnimationFrame(flushWheel);
      }
    };

    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', onNativeWheel);
      if (wheelRafRef.current !== null) {
        cancelAnimationFrame(wheelRafRef.current);
        wheelRafRef.current = null;
      }
    };
  }, [isExpandedFullscreen]);

  // Plot geometry (upper Price Pane + lower dedicated Volume Histogram Pane)
  const width = dims.width;
  const height = dims.height;
  const padLeft = 8;
  const padRight = 78;
  const padTop = 10;
  const padBottom = 26;
  const plotW = Math.max(120, width - padLeft - padRight);
  const totalPlotH = Math.max(140, height - padTop - padBottom);
  const volPaneH = Math.max(38, Math.round(totalPlotH * 0.21));
  const pricePaneH = Math.max(96, totalPlotH - volPaneH - 4);
  const volTopY = padTop + pricePaneH + 4;

  // Dynamic Price Scaling (Linear with anti-negative clamp, Logarithmic `log`, Percentage `%`)
  const candleHighs = visibleCandles.map((c) => c.high);
  const candleLows = visibleCandles.map((c) => c.low);
  const rawMin = candleLows.length ? Math.min(...candleLows) : pair.price * 0.99;
  const rawMax = candleHighs.length ? Math.max(...candleHighs) : pair.price * 1.01;
  const firstVisClose = visibleCandles[0]?.close || pair.price || 1;

  const isLog = scaleMode === 'LOG';
  const toValSpace = (p: number) => (isLog ? Math.log(Math.max(1e-12, p)) : p);
  const fromValSpace = (v: number) => (isLog ? Math.exp(v) : v);

  const rawMinSpace = toValSpace(rawMin);
  const rawMaxSpace = toValSpace(rawMax);
  const minEpsSpace = isLog ? 0.015 : Math.max(1e-10, pair.price * 0.0005);
  const baseSpanSpace = Math.max(minEpsSpace, (rawMaxSpace - rawMinSpace) * 1.18);
  const baseCenterSpace = (rawMaxSpace + rawMinSpace) / 2;

  const effectiveSpanSpace = baseSpanSpace * priceScaleFactor;
  const effectiveCenterSpace = baseCenterSpace + pricePanRatio * baseSpanSpace;
  const rawMinBound = effectiveCenterSpace - effectiveSpanSpace / 2;
  const rawMaxBound = effectiveCenterSpace + effectiveSpanSpace / 2;
  const minSpace = !isLog && rawMin > 0 && pricePanRatio === 0 ? Math.max(0, rawMinBound) : rawMinBound;
  const maxSpace =
    !isLog && rawMin > 0 && pricePanRatio === 0 && rawMinBound < 0
      ? Math.max(rawMaxBound, rawMax * 1.08)
      : rawMaxBound;
  const spaceRange = Math.max(1e-12, maxSpace - minSpace);

  const minPrice = fromValSpace(minSpace);
  const maxPrice = fromValSpace(maxSpace);

  const priceToY = (p: number) =>
    padTop + pricePaneH - ((toValSpace(p) - minSpace) / spaceRange) * pricePaneH;
  const yToPrice = (y: number) => {
    const s = minSpace + ((padTop + pricePaneH - y) / pricePaneH) * spaceRange;
    return Math.max(1e-12, fromValSpace(s));
  };

  const maxVol = Math.max(...visibleCandles.map((c) => c.volume), 1);

  const stepX = plotW / Math.max(1, clampedVisibleCount);
  const candleWidth = Math.max(1.1, Math.min(14, stepX * 0.68));
  const globalIndexToX = (globalIdx: number) =>
    padLeft + (globalIdx - virtualStart + 0.5) * stepX;
  const localIndexToX = (localIdx: number) => globalIndexToX(sliceStart + localIdx);

  const stepMs = INTERVAL_MS[timeframe] || 900_000;

  // Convert SVG (x, y) -> (time, price) with optional OHLC Magnet snap!
  const screenToTimePrice = (relX: number, relY: number): TimePricePoint => {
    const floatGlobalIdx = virtualStart + (relX - padLeft) / Math.max(0.01, stepX) - 0.5;
    const clampedY = Math.max(padTop, Math.min(padTop + pricePaneH, relY));
    let p = yToPrice(clampedY);
    let t: number;

    if (candles.length === 0) {
      t = Date.now();
    } else if (floatGlobalIdx <= 0) {
      t = candles[0].time + Math.round(floatGlobalIdx) * stepMs;
    } else if (floatGlobalIdx >= candles.length - 1) {
      t = candles[candles.length - 1].time + Math.round(floatGlobalIdx - (candles.length - 1)) * stepMs;
    } else {
      const idx = Math.round(floatGlobalIdx);
      const bar = candles[Math.max(0, Math.min(candles.length - 1, idx))];
      t = bar.time;
      if (magnetEnabled) {
        const candidates = [bar.open, bar.high, bar.low, bar.close];
        let bestP = p;
        let bestDist = Infinity;
        for (const cp of candidates) {
          const d = Math.abs(priceToY(cp) - clampedY);
          if (d < bestDist) {
            bestDist = d;
            bestP = cp;
          }
        }
        if (bestDist <= 28) p = bestP;
      }
    }
    return { t, p };
  };

  // Convert arbitrary timestamp (including future margin!) -> SVG x coordinate
  const timeToX = (ts: number): number | null => {
    if (candles.length === 0) return null;
    const firstT = candles[0].time;
    const lastT = candles[candles.length - 1].time;
    if (ts < firstT) {
      const barsBefore = (firstT - ts) / Math.max(1, stepMs);
      return globalIndexToX(-barsBefore);
    }
    if (ts > lastT) {
      const barsAfter = (ts - lastT) / Math.max(1, stepMs);
      return globalIndexToX(candles.length - 1 + barsAfter);
    }
    // Binary search nearest candle index for O(log N) speed across 5,000 bars
    let lo = 0;
    let hi = candles.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (candles[mid].time < ts) lo = mid + 1;
      else hi = mid;
    }
    if (lo > 0 && Math.abs(candles[lo - 1].time - ts) < Math.abs(candles[lo].time - ts)) {
      lo -= 1;
    }
    return globalIndexToX(lo);
  };

  const symbolDrawings = drawingsBySymbol[pair.symbol] || [];
  const selectedDrawing = useMemo(
    () => symbolDrawings.find((d) => d.id === selectedDrawingId) || null,
    [symbolDrawings, selectedDrawingId]
  );

  const updateSelectedDrawing = (patch: Partial<ChartDrawing>) => {
    if (!selectedDrawingId) return;
    setDrawingsBySymbol((prev) => ({
      ...prev,
      [pair.symbol]: (prev[pair.symbol] || []).map((d) =>
        d.id === selectedDrawingId ? { ...d, ...patch } : d
      ),
    }));
  };

  const commitDrawing = (d: ChartDrawing) => {
    setDrawingsBySymbol((prev) => ({
      ...prev,
      [pair.symbol]: [...(prev[pair.symbol] || []), d],
    }));
    setSelectedDrawingId(d.id);
    setDraftPoints([]);
    if (!stayInDrawingMode) {
      setDrawingTool('CROSSHAIR');
    }
  };

  const handlePlaceDrawingPoint = (relX: number, relY: number) => {
    const pt = screenToTimePrice(relX, relY);

    if (drawingTool === 'HLINE' || drawingTool === 'VLINE') {
      commitDrawing({
        id: `drw-${Date.now()}`,
        type: drawingTool,
        points: [pt],
        color: defaultDrawColor,
        opacity: defaultOpacity,
        lineWidth: defaultLineWidth,
        lineStyle: defaultLineStyle,
      });
      return;
    }

    if (drawingTool === 'TEXT') {
      const id = `drw-${Date.now()}`;
      commitDrawing({
        id,
        type: 'TEXT',
        points: [pt],
        color: defaultDrawColor,
        opacity: 1,
        lineWidth: 1,
        lineStyle: 'SOLID',
        text: 'Note',
        fontSize: defaultFontSize,
      });
      setEditingTextId(id);
      return;
    }

    if (drawingTool === 'LONG_POS' || drawingTool === 'SHORT_POS') {
      const isLong = drawingTool === 'LONG_POS';
      const priceSpan = Math.max(pt.p * 0.02, (maxPrice - minPrice) * 0.14);
      const tpPrice = isLong ? pt.p + priceSpan : Math.max(pt.p * 0.1, pt.p - priceSpan);
      const slPrice = isLong ? Math.max(pt.p * 0.1, pt.p - priceSpan * 0.45) : pt.p + priceSpan * 0.45;
      const boxSpanBars = Math.max(10, Math.round(clampedVisibleCount * 0.18));
      commitDrawing({
        id: `drw-${Date.now()}`,
        type: drawingTool,
        points: [pt],
        tpPrice,
        slPrice,
        endTime: pt.t + boxSpanBars * stepMs,
        color: isLong ? '#26A69A' : '#EF5350',
        opacity: 0.25,
        lineWidth: 1.5,
        lineStyle: 'SOLID',
      });
      return;
    }

    if (drawingTool === 'XABCD') {
      const nextPts = [...draftPoints, pt];
      if (nextPts.length >= 5) {
        commitDrawing({
          id: `drw-${Date.now()}`,
          type: 'XABCD',
          points: nextPts.slice(0, 5),
          color: defaultDrawColor,
          opacity: 0.28,
          lineWidth: 1.5,
          lineStyle: 'SOLID',
        });
      } else {
        setDraftPoints(nextPts);
      }
      return;
    }

    if (
      drawingTool === 'TRENDLINE' ||
      drawingTool === 'RAY' ||
      drawingTool === 'FIB' ||
      drawingTool === 'MEASURE'
    ) {
      if (draftPoints.length === 0) {
        setDraftPoints([pt]);
      } else {
        commitDrawing({
          id: `drw-${Date.now()}`,
          type: drawingTool,
          points: [draftPoints[0], pt],
          color:
            drawingTool === 'MEASURE'
              ? pt.p >= draftPoints[0].p
                ? '#26A69A'
                : '#EF5350'
              : defaultDrawColor,
          opacity: drawingTool === 'FIB' ? 0.14 : defaultOpacity,
          lineWidth: defaultLineWidth,
          lineStyle: defaultLineStyle,
        });
      }
    }
  };

  // Unified Mouse + Touch Pointer Interaction (2D Pan, Right-Axis Scale, Drawing Placement, Brush Sketch, Handle Drag, 2-Finger Pinch)
  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    setTfMenuOpen(false);
    setTrendFlyoutOpen(false);
    setPosFlyoutOpen(false);

    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * dims.width;
    const relY = ((e.clientY - rect.top) / Math.max(1, rect.height)) * dims.height;
    const isRightAxis = relX >= dims.width - padRight;

    if (!isRightAxis && drawingTool === 'ZOOM_IN') {
      const anchor = Math.max(0.1, Math.min(0.95, (relX - padLeft) / plotW));
      handleBarZoom(-Math.max(10, Math.round(clampedVisibleCount * 0.35)), anchor);
      if (!stayInDrawingMode) setDrawingTool('CROSSHAIR');
      return;
    }

    if (!isRightAxis && drawingTool === 'BRUSH' && activePointersRef.current.size === 0) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      const pt = screenToTimePrice(relX, relY);
      setActiveBrushStroke([pt]);
      setDragMode('BRUSH_DRAW');
      return;
    }

    if (!isRightAxis && drawingTool !== 'CROSSHAIR' && activePointersRef.current.size === 0) {
      handlePlaceDrawingPoint(relX, relY);
      return;
    }

    // Deselect drawing when clicking empty canvas
    if (drawingTool === 'CROSSHAIR' && !isRightAxis) {
      setSelectedDrawingId(null);
      setColorPaletteOpen(false);
    }

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignore synthetic events
    }
    activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (activePointersRef.current.size === 2) {
      const pts = Array.from(activePointersRef.current.values());
      const dist = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      pinchStartRef.current = { dist: Math.max(10, dist), visibleCount: clampedVisibleCount };
      setDragMode('NONE');
      return;
    }

    pinchStartRef.current = null;
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      startPanOffset: clampedPanOffset,
      startPricePanRatio: pricePanRatio,
      startPriceScaleFactor: priceScaleFactor,
    };

    if (isRightAxis) {
      setDragMode('PRICE_AXIS_SCALE');
    } else {
      setDragMode('CHART_2D_PAN');
    }
  };

  const processMouseMove = useCallback(
    (clientX: number, clientY: number) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const relX = ((clientX - rect.left) / Math.max(1, rect.width)) * dims.width;
      const relY = ((clientY - rect.top) / Math.max(1, rect.height)) * dims.height;

      // 1. Live dragging a selected drawing's handle or body
      if (draggingHandle && !allDrawingsLocked) {
        const curTp = screenToTimePrice(relX, relY);
        const dt = curTp.t - draggingHandle.originTp.t;
        const dp = curTp.p - draggingHandle.originTp.p;
        const orig = draggingHandle.origDrawing;
        setDrawingsBySymbol((prev) => ({
          ...prev,
          [pair.symbol]: (prev[pair.symbol] || []).map((d) => {
            if (d.id !== draggingHandle.drawingId) return d;
            if (draggingHandle.handle === 'tp') {
              return { ...d, tpPrice: Math.max(1e-12, curTp.p), endTime: Math.max(d.points[0].t + stepMs * 2, curTp.t) };
            }
            if (draggingHandle.handle === 'sl') {
              return { ...d, slPrice: Math.max(1e-12, curTp.p), endTime: Math.max(d.points[0].t + stepMs * 2, curTp.t) };
            }
            if (draggingHandle.handle === 'entry') {
              return { ...d, points: [curTp] };
            }
            if (draggingHandle.handle === 'move') {
              return {
                ...d,
                points: orig.points.map((p) => ({ t: p.t + dt, p: Math.max(1e-12, p.p + dp) })),
                tpPrice: orig.tpPrice !== undefined ? Math.max(1e-12, orig.tpPrice + dp) : undefined,
                slPrice: orig.slPrice !== undefined ? Math.max(1e-12, orig.slPrice + dp) : undefined,
                endTime: orig.endTime !== undefined ? orig.endTime + dt : undefined,
              };
            }
            const ptIdx = Number(draggingHandle.handle.replace('pt', ''));
            if (Number.isInteger(ptIdx) && d.points[ptIdx]) {
              const nextPts = d.points.slice();
              nextPts[ptIdx] = curTp;
              return { ...d, points: nextPts };
            }
            return d;
          }),
        }));
        return;
      }

      // 2. Live freehand Brush sketching
      if (dragMode === 'BRUSH_DRAW') {
        const pt = screenToTimePrice(relX, relY);
        setActiveBrushStroke((prev) => (prev ? [...prev, pt] : [pt]));
        return;
      }

      // 3. Right Y-axis vertical scale stretch/compress
      if (dragMode === 'PRICE_AXIS_SCALE') {
        const dyPixels = clientY - dragStartRef.current.clientY;
        const scaleMultiplier = Math.exp(dyPixels * 0.006);
        const nextScale = Math.max(
          0.18,
          Math.min(5.0, dragStartRef.current.startPriceScaleFactor * scaleMultiplier)
        );
        setPriceScaleFactor(Number(nextScale.toFixed(3)));
        return;
      }

      // 4. 2D Chart Pan (horizontal across full history + future margin, vertical across price)
      if (dragMode === 'CHART_2D_PAN') {
        const dxPixels = clientX - dragStartRef.current.clientX;
        const pixelsPerCandle = (rect.width * 0.86) / Math.max(1, clampedVisibleCount);
        const candlesDelta = Math.round(dxPixels / Math.max(1.1, pixelsPerCandle));
        setPanOffset(
          Math.max(minPanOffset, Math.min(maxPanOffset, dragStartRef.current.startPanOffset + candlesDelta))
        );

        const dyPixels = clientY - dragStartRef.current.clientY;
        const ratioDelta = (dyPixels / Math.max(120, rect.height - 60)) * priceScaleFactor;
        const nextPricePan = Math.max(
          -3.5,
          Math.min(3.5, dragStartRef.current.startPricePanRatio + ratioDelta)
        );
        setPricePanRatio(Number(nextPricePan.toFixed(4)));
        return;
      }

      // 5. Crosshair & live rubber-band drawing preview
      if (relX >= padLeft && relX <= padLeft + plotW && visibleCandles.length > 0) {
        const floatGlobalIdx = virtualStart + (relX - padLeft) / Math.max(0.01, stepX) - 0.5;
        const localIdx = Math.round(floatGlobalIdx) - sliceStart;
        const clampedIdx = Math.max(0, Math.min(visibleCandles.length - 1, localIdx));
        const clampedY = Math.max(padTop, Math.min(padTop + pricePaneH, relY));
        setHoverIndex(clampedIdx);
        setMouseY(clampedY);
        lastCrosshairRef.current = { index: clampedIdx, mouseY: clampedY };
        if (draftPoints.length > 0) {
          setCursorTp(screenToTimePrice(relX, relY));
        }
      } else {
        setHoverIndex(null);
        setMouseY(null);
      }
    },
    [
      dims,
      dragMode,
      draggingHandle,
      allDrawingsLocked,
      clampedVisibleCount,
      minPanOffset,
      maxPanOffset,
      priceScaleFactor,
      visibleCandles.length,
      plotW,
      pricePaneH,
      virtualStart,
      sliceStart,
      stepX,
      draftPoints.length,
      pair.symbol,
      stepMs,
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (activePointersRef.current.has(e.pointerId)) {
        activePointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      if (activePointersRef.current.size === 2 && pinchStartRef.current) {
        const pts = Array.from(activePointersRef.current.values());
        const dist = Math.max(10, Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y));
        const ratio = pinchStartRef.current.dist / dist;
        const nextBars = Math.max(
          minBars,
          Math.min(maxBars, Math.round(pinchStartRef.current.visibleCount * ratio))
        );
        setVisibleCount(nextBars);
        return;
      }

      pendingMoveRef.current = { clientX: e.clientX, clientY: e.clientY };
      if (moveRafRef.current === null) {
        moveRafRef.current = requestAnimationFrame(() => {
          moveRafRef.current = null;
          const pending = pendingMoveRef.current;
          pendingMoveRef.current = null;
          if (pending) latestRef.current.processMouseMove(pending.clientX, pending.clientY);
        });
      }
    },
    [minBars, maxBars]
  );

  useLayoutEffect(() => {
    latestRef.current.processMouseMove = processMouseMove;
    latestRef.current.handleBarZoom = handleBarZoom;
    latestRef.current.handleVerticalZoom = handleVerticalZoom;
    latestRef.current.clampedVisibleCount = clampedVisibleCount;
  });

  useEffect(() => {
    return () => {
      if (moveRafRef.current !== null) cancelAnimationFrame(moveRafRef.current);
    };
  }, []);

  const flushPendingMove = () => {
    if (moveRafRef.current !== null) {
      cancelAnimationFrame(moveRafRef.current);
      moveRafRef.current = null;
    }
    const pending = pendingMoveRef.current;
    pendingMoveRef.current = null;
    if (pending) processMouseMove(pending.clientX, pending.clientY);
  };

  const handlePointerUpOrCancel = (e: React.PointerEvent<SVGSVGElement>) => {
    activePointersRef.current.delete(e.pointerId);
    if (activePointersRef.current.size < 2) pinchStartRef.current = null;
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // Ignore synthetic events
    }

    flushPendingMove();

    if (dragMode === 'BRUSH_DRAW' && activeBrushStroke && activeBrushStroke.length >= 2) {
      commitDrawing({
        id: `drw-${Date.now()}`,
        type: 'BRUSH',
        points: activeBrushStroke,
        color: defaultDrawColor,
        opacity: defaultOpacity,
        lineWidth: defaultLineWidth,
        lineStyle: defaultLineStyle,
      });
      setActiveBrushStroke(null);
    } else if (dragMode === 'BRUSH_DRAW') {
      setActiveBrushStroke(null);
    }

    setDraggingHandle(null);
    setDragMode('NONE');
    if (e.pointerType !== 'mouse') {
      setHoverIndex(null);
      setMouseY(null);
    }
  };

  const handlePointerLeave = (e: React.PointerEvent<SVGSVGElement>) => {
    if (activePointersRef.current.has(e.pointerId) && dragMode !== 'NONE') return;
    if (dragMode !== 'NONE') flushPendingMove();
    else {
      pendingMoveRef.current = null;
      if (moveRafRef.current !== null) {
        cancelAnimationFrame(moveRafRef.current);
        moveRafRef.current = null;
      }
    }
    setDragMode('NONE');
    setDraggingHandle(null);
    setHoverIndex(null);
    setMouseY(null);
  };

  const startHandleDrag = (
    e: React.PointerEvent,
    drawing: ChartDrawing,
    handle: 'pt0' | 'pt1' | 'pt2' | 'pt3' | 'pt4' | 'tp' | 'sl' | 'entry' | 'move'
  ) => {
    e.stopPropagation();
    setSelectedDrawingId(drawing.id);
    if (allDrawingsLocked || drawing.locked || !svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * dims.width;
    const relY = ((e.clientY - rect.top) / Math.max(1, rect.height)) * dims.height;
    setDraggingHandle({
      drawingId: drawing.id,
      handle,
      originTp: screenToTimePrice(relX, relY),
      origDrawing: { ...drawing, points: drawing.points.map((p) => ({ ...p })) },
    });
  };

  const handleResetView = () => {
    const targetVis =
      timeframe === '1w' || timeframe === '1M'
        ? totalBars || 110
        : Math.min(totalBars || 140, 140);
    setVisibleCount(targetVis);
    setPanOffset(-Math.max(4, Math.round(targetVis * 0.06)));
    setPricePanRatio(0);
    setPriceScaleFactor(1);
    setActiveRange(null);
  };

  // Price Y-axis grid ticks
  const yTickCount = 7;
  const yTicks = Array.from({ length: yTickCount }, (_, i) => {
    const spaceVal = minSpace + (spaceRange * i) / (yTickCount - 1);
    const val = fromValSpace(spaceVal);
    return { val, y: padTop + pricePaneH - (i / (yTickCount - 1)) * pricePaneH };
  });

  // Adaptive Time X-axis ticks (Multi-Year -> Month -> Day -> HH:MM)
  const visibleSpanMs =
    visibleCandles.length >= 2
      ? Math.max(60_000, visibleCandles[visibleCandles.length - 1].time - visibleCandles[0].time)
      : stepMs;
  const desiredXTicks = Math.max(4, Math.min(11, Math.floor(plotW / 74)));
  const xTickStep = Math.max(1, Math.floor(visibleCandles.length / desiredXTicks));
  const xTicks = useMemo(() => {
    const out: Array<{ idx: number; x: number; text: string; isYear: boolean }> = [];
    if (visibleCandles.length === 0) return out;

    if (visibleSpanMs > 540 * 86_400_000) {
      let lastYear = -1;
      let lastX = -999;
      for (let i = 0; i < visibleCandles.length; i++) {
        const yr = new Date(visibleCandles[i].time).getUTCFullYear();
        const x = padLeft + (sliceStart + i - virtualStart + 0.5) * stepX;
        if (yr !== lastYear) {
          lastYear = yr;
          if (x >= padLeft + 8 && x <= width - padRight - 8 && x - lastX >= 36) {
            out.push({ idx: i, x, text: String(yr), isYear: true });
            lastX = x;
          }
        }
      }
      if (out.length >= 3) return out;
    }

    for (let i = 0; i < visibleCandles.length; i += xTickStep) {
      const c = visibleCandles[i];
      const x = padLeft + (sliceStart + i - virtualStart + 0.5) * stepX;
      if (x < padLeft + 6 || x > width - padRight - 6) continue;
      const fmt = formatAxisTime(c.time, visibleSpanMs);
      out.push({ idx: i, x, text: fmt.text, isYear: fmt.isYear });
    }
    return out;
  }, [visibleCandles, visibleSpanMs, stepX, xTickStep, sliceStart, virtualStart, width]);

  const ema20Polyline = ema20Points.map((val, i) => `${localIndexToX(i)},${priceToY(val)}`).join(' ');
  const ema50Polyline = ema50Points.map((val, i) => `${localIndexToX(i)},${priceToY(val)}`).join(' ');
  const ema200Polyline = ema200Points.map((val, i) => `${localIndexToX(i)},${priceToY(val)}`).join(' ');
  const bbUpperPolyline = bbUpperPoints.map((val, i) => `${localIndexToX(i)},${priceToY(val)}`).join(' ');
  const bbLowerPolyline = bbLowerPoints.map((val, i) => `${localIndexToX(i)},${priceToY(val)}`).join(' ');
  const areaLinePolyline = visibleCandles.map((c, i) => `${localIndexToX(i)},${priceToY(c.close)}`).join(' ');
  const areaFillPoints =
    visibleCandles.length > 1
      ? `${localIndexToX(0)},${padTop + pricePaneH} ${areaLinePolyline} ${localIndexToX(visibleCandles.length - 1)},${padTop + pricePaneH}`
      : '';

  const latestCandle = candles[candles.length - 1] || visibleCandles[visibleCandles.length - 1];
  const inspectedCandle =
    hoverIndex !== null && visibleCandles[hoverIndex] ? visibleCandles[hoverIndex] : latestCandle;
  const inspectedChangePct = inspectedCandle
    ? ((inspectedCandle.close - inspectedCandle.open) / Math.max(1e-12, inspectedCandle.open)) * 100
    : 0;

  const isHovering = hoverIndex !== null && mouseY !== null;
  const activeCrosshair = isHovering ? { index: hoverIndex, mouseY } : lastCrosshairRef.current;
  const hoveredCandle =
    activeCrosshair !== null && visibleCandles[activeCrosshair.index]
      ? visibleCandles[activeCrosshair.index]
      : null;

  const whaleBidWall = orderbook?.bids.find((b) => b.isWhaleWall) || orderbook?.bids[0];
  const whaleAskWall = orderbook?.asks.find((a) => a.isWhaleWall) || orderbook?.asks[0];
  const bestBidPx = orderbook?.bids[0]?.price || pair.price * 0.9998;
  const bestAskPx = orderbook?.asks[0]?.price || pair.price * 1.0002;
  const isManualYModified = pricePanRatio !== 0 || priceScaleFactor !== 1;

  const effectiveListingTime = listingTime || candles[0]?.time || Date.now();
  const listingYear = new Date(effectiveListingTime).getUTCFullYear();
  const latestEma20 = ema20Points[ema20Points.length - 1];
  const latestEma50 = ema50Points[ema50Points.length - 1];
  const latestEma200 = ema200Points[ema200Points.length - 1];
  const utcClock = new Date(nowClockMs).toISOString().slice(11, 19);

  const formatRightAxisVal = (p: number) => {
    if (scaleMode === 'PERCENT') {
      const pct = ((p - firstVisClose) / Math.max(1e-12, firstVisClose)) * 100;
      return `${pct >= 0 ? '+' : ''}${pct.toFixed(pct >= 100 || pct <= -100 ? 0 : 1)}%`;
    }
    return formatChartPrice(p);
  };

  const isTrendGroupActive =
    drawingTool === 'TRENDLINE' ||
    drawingTool === 'RAY' ||
    drawingTool === 'HLINE' ||
    drawingTool === 'VLINE';
  const isPosGroupActive = drawingTool === 'LONG_POS' || drawingTool === 'SHORT_POS';
  const showFloatingStyleBar =
    Boolean(selectedDrawing) || drawingTool === 'BRUSH' || drawingTool === 'TEXT';

  const activeStyleColor = selectedDrawing ? selectedDrawing.color : defaultDrawColor;
  const activeStyleWidth = selectedDrawing ? selectedDrawing.lineWidth : defaultLineWidth;
  const activeStyleDash = selectedDrawing ? selectedDrawing.lineStyle : defaultLineStyle;
  const activeStyleOpacity = selectedDrawing ? selectedDrawing.opacity : defaultOpacity;

  const chartNode = (
    <div
      data-testid="candlestick-chart"
      className={
        isExpandedFullscreen
          ? 'fixed inset-0 sm:inset-3 z-[9999] flex flex-col bg-[#0F141E] border border-[#2B384F] shadow-2xl rounded-lg select-none overflow-hidden'
          : 'relative flex flex-col h-full bg-[#0F141E] select-none overflow-hidden'
      }
    >
      <style>{`
        @media (prefers-reduced-motion: no-preference) {
          @keyframes fincept-chart-enter {
            from { opacity: 0; transform: translateY(4px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .fincept-chart-enter { animation: fincept-chart-enter 160ms ease-out both; }
        }
        .fincept-crosshair { opacity: 0; transition: opacity 110ms ease-out; }
        .fincept-crosshair.fincept-crosshair-visible { opacity: 1; }
        @media (prefers-reduced-motion: reduce) { .fincept-crosshair { transition: none; } }
      `}</style>

      {/* 1. SLEEK TRADINGVIEW TOP HEADER BAR (Timeframe Dropdown + Chart Style + Indicators + Fullscreen) */}
      <div className="relative flex flex-nowrap sm:flex-wrap items-center justify-between px-2 py-1 bg-[#131823] border-b border-[#1E2736] gap-1 overflow-x-auto no-scrollbar touch-scroll-x shrink-0 z-20">
        {/* Left: Mobile Tools Toggle + Flexible Timeframe Favorites + TradingView Full Timeframe Dropdown (1m..1M) */}
        <div className="flex items-center gap-0.5 text-[10px] shrink-0">
          <button
            onClick={() => setShowMobileTools((v) => !v)}
            className="sm:hidden p-1 bg-[#192131] text-[#56B6F7] border border-[#263349] mr-0.5"
            title="Toggle Technical Drawing Tools"
          >
            <IconTrendline size={13} />
          </button>

          {QUICK_TIMEFRAMES.map((tf) => (
            <button
              key={tf.id}
              data-testid={`chart-timeframe-${tf.id}`}
              data-timeframe={tf.id}
              aria-pressed={timeframe === tf.id}
              onClick={() => {
                setActiveRange(null);
                onTimeframeChange(tf.id);
              }}
              className={`px-1.5 py-0.5 font-semibold transition-colors ${
                timeframe === tf.id
                  ? 'bg-[#2962FF]/25 text-[#56B6F7] border border-[#56B6F7]/50'
                  : 'text-[#CBD5E1] hover:bg-[#1B2333] hover:text-white border border-transparent'
              }`}
            >
              {tf.label}
            </button>
          ))}

          {/* Full TradingView Timeframe Dropdown (1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 8h, 12h, 1D, 3D, 1W, 1M) */}
          <button
            data-testid="chart-tf-dropdown-btn"
            onClick={() => setTfMenuOpen((v) => !v)}
            className={`px-1.5 py-0.5 flex items-center gap-0.5 font-semibold border transition-colors ${
              tfMenuOpen || !QUICK_TIMEFRAMES.some((q) => q.id === timeframe)
                ? 'bg-[#2962FF]/25 text-[#56B6F7] border-[#56B6F7]/50'
                : 'text-[#94A3B8] border-transparent hover:bg-[#1B2333] hover:text-white'
            }`}
            title="Semua Timeframe Fleksibel (1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 8h, 12h, 1D, 3D, 1W, 1M)"
          >
            {!QUICK_TIMEFRAMES.some((q) => q.id === timeframe) && (
              <span className="uppercase">{timeframe}</span>
            )}
            <IconChevronDown size={11} />
          </button>

          <span className="text-[#263247] mx-0.5">|</span>

          {/* Chart Style Switcher (Crisp TradingView SVG Icons) */}
          <button
            data-testid="chart-style-candles"
            onClick={() => setChartStyle('CANDLES')}
            title="Candles"
            className={`p-1 border transition-colors ${
              chartStyle === 'CANDLES'
                ? 'bg-[#1C273B] text-[#56B6F7] border-[#56B6F7]/50'
                : 'text-[#94A3B8] border-transparent hover:text-white hover:bg-[#1B2333]'
            }`}
          >
            <IconCandles size={14} />
          </button>
          <button
            data-testid="chart-style-hollow"
            onClick={() => setChartStyle('HOLLOW')}
            title="Hollow Candles"
            className={`p-1 border transition-colors ${
              chartStyle === 'HOLLOW'
                ? 'bg-[#1C273B] text-[#56B6F7] border-[#56B6F7]/50'
                : 'text-[#94A3B8] border-transparent hover:text-white hover:bg-[#1B2333]'
            }`}
          >
            <IconHollowCandles size={14} />
          </button>
          <button
            data-testid="chart-style-area"
            onClick={() => setChartStyle('AREA')}
            title="Line & Area"
            className={`p-1 border transition-colors ${
              chartStyle === 'AREA'
                ? 'bg-[#1C273B] text-[#56B6F7] border-[#56B6F7]/50'
                : 'text-[#94A3B8] border-transparent hover:text-white hover:bg-[#1B2333]'
            }`}
          >
            <IconAreaLine size={14} />
          </button>
        </div>

        {/* Center/Right: Sleek Compact Indicators + Zoom/Auto-Fit + Fullscreen Expand */}
        <div className="flex items-center gap-1 text-[9.5px] shrink-0">
          <button
            data-testid="chart-legend-ema20-btn"
            onClick={() => setShowEma(!showEma)}
            className={`px-1.5 py-0.5 border ${
              showEma
                ? 'border-[#F5B74F]/50 text-[#F5B74F] bg-[#F5B74F]/10 font-semibold'
                : 'border-transparent text-[#64748B] hover:text-[#CBD5E1]'
            }`}
          >
            EMA
          </button>
          <button
            data-testid="chart-legend-bb-btn"
            onClick={() => setShowBollinger(!showBollinger)}
            className={`px-1.5 py-0.5 border ${
              showBollinger
                ? 'border-[#A78BFA]/50 text-[#A78BFA] bg-[#A78BFA]/10 font-semibold'
                : 'border-transparent text-[#64748B] hover:text-[#CBD5E1]'
            }`}
          >
            BB
          </button>
          <button
            data-testid="chart-legend-pa-sr-btn"
            onClick={() => setShowStructureLevels(!showStructureLevels)}
            className={`px-1.5 py-0.5 border ${
              showStructureLevels
                ? 'border-[#34D399]/50 text-[#34D399] bg-[#34D399]/10 font-semibold'
                : 'border-transparent text-[#64748B] hover:text-[#CBD5E1]'
            }`}
          >
            S/R
          </button>
          <button
            data-testid="chart-legend-whale-walls-btn"
            onClick={() => setShowWhaleZones(!showWhaleZones)}
            className={`px-1.5 py-0.5 border ${
              showWhaleZones
                ? 'border-[#56B6F7]/50 text-[#56B6F7] bg-[#56B6F7]/10 font-semibold'
                : 'border-transparent text-[#64748B] hover:text-[#CBD5E1]'
            }`}
          >
            WHALE
          </button>
          <button
            data-testid="chart-legend-bot-levels-btn"
            onClick={() => setShowBotLevels(!showBotLevels)}
            className={`px-1.5 py-0.5 border ${
              showBotLevels
                ? 'border-[#34D399]/50 text-[#34D399] bg-[#34D399]/10 font-semibold'
                : 'border-transparent text-[#64748B] hover:text-[#CBD5E1]'
            }`}
          >
            SL/BE
          </button>

          <span className="text-[#263247] mx-0.5 hidden md:inline">|</span>

          {/* Compact unobtrusive Zoom / Pan / Reset controls */}
          <div className="hidden md:flex items-center gap-0.5">
            <button
              data-testid="chart-zoom-in-btn"
              onClick={() => handleBarZoom(-Math.max(8, Math.round(clampedVisibleCount * 0.25)), 0.85)}
              className="px-1 py-0.5 text-[#94A3B8] hover:text-white hover:bg-[#1B2333]"
              title="Zoom In"
            >
              +
            </button>
            <div className="hidden 2xl:flex items-center gap-1 px-1">
              <span className="text-[8.5px] text-[#64748B] font-mono" data-testid="chart-zoom-indicator">
                {clampedVisibleCount}/{totalBars}
              </span>
              <input
                type="range"
                min={minBars}
                max={maxBars}
                value={clampedVisibleCount}
                onChange={(e) => {
                  setActiveRange(null);
                  setVisibleCount(Number(e.target.value));
                }}
                data-testid="chart-bars-slider"
                className="w-12 accent-[#56B6F7] cursor-pointer h-1"
                title="Visible Bars"
              />
            </div>
            <button
              data-testid="chart-zoom-out-btn"
              onClick={() => handleBarZoom(Math.max(10, Math.round(clampedVisibleCount * 0.35)), 0.85)}
              className="px-1 py-0.5 text-[#94A3B8] hover:text-white hover:bg-[#1B2333]"
              title="Zoom Out"
            >
              −
            </button>
            <button
              data-testid="chart-pan-left-btn"
              onClick={() => setPanOffset((p) => Math.min(maxPanOffset, p + Math.max(8, Math.round(clampedVisibleCount * 0.2))))}
              className="px-1 py-0.5 text-[#94A3B8] hover:text-white hover:bg-[#1B2333]"
              title="Pan Left"
            >
              ◄
            </button>
            <button
              data-testid="chart-pan-right-btn"
              onClick={() => setPanOffset((p) => Math.max(minPanOffset, p - Math.max(8, Math.round(clampedVisibleCount * 0.2))))}
              className="px-1 py-0.5 text-[#94A3B8] hover:text-white hover:bg-[#1B2333]"
              title="Pan Right"
            >
              ►
            </button>
            <button
              data-testid="chart-price-pan-up-btn"
              onClick={() => setPricePanRatio((r) => Number(Math.min(3.5, r + 0.18).toFixed(3)))}
              className="px-1 py-0.5 text-[#94A3B8] hover:text-[#34D399] hover:bg-[#1B2333]"
              title="Shift Price Up"
            >
              ▲
            </button>
            <button
              data-testid="chart-price-pan-down-btn"
              onClick={() => setPricePanRatio((r) => Number(Math.max(-3.5, r - 0.18).toFixed(3)))}
              className="px-1 py-0.5 text-[#94A3B8] hover:text-[#F87171] hover:bg-[#1B2333]"
              title="Shift Price Down"
            >
              ▼
            </button>
            <button
              data-testid="chart-yzoom-in-btn"
              onClick={() => handleVerticalZoom(0.82)}
              className="px-1 py-0.5 text-[#94A3B8] hover:text-[#F5B74F] hover:bg-[#1B2333]"
              title="Stretch Y-Axis"
            >
              ↕+
            </button>
            <button
              data-testid="chart-yzoom-out-btn"
              onClick={() => handleVerticalZoom(1.22)}
              className="px-1 py-0.5 text-[#94A3B8] hover:text-[#F5B74F] hover:bg-[#1B2333]"
              title="Compress Y-Axis"
            >
              ↕-
            </button>
          </div>

          <button
            data-testid="chart-autofit-btn"
            onClick={handleResetView}
            className={`px-1.5 py-0.5 font-semibold border ${
              isManualYModified || clampedPanOffset > 0
                ? 'bg-[#F5B74F] text-[#171104] border-[#F5B74F]'
                : 'bg-[#101622] text-[#56B6F7] border-[#243044] hover:bg-[#1D283B]'
            }`}
            title="Auto-Fit Chart"
          >
            AUTO
          </button>

          <button
            data-testid="chart-fullscreen-btn"
            onClick={() => setIsExpandedFullscreen((v) => !v)}
            className="p-1 text-[#94A3B8] hover:text-white hover:bg-[#1B2333] border border-transparent hover:border-[#2A3852]"
            title={isExpandedFullscreen ? 'Exit Fullscreen (Esc)' : 'Expand TradingView Fullscreen'}
          >
            {isExpandedFullscreen ? <IconCollapse size={13} /> : <IconExpand size={13} />}
          </button>
        </div>
      </div>

      {/* TradingView Timeframe Popover Dropdown (MINUTES / HOURS / DAYS / WEEKS / MONTHS) */}
      {tfMenuOpen && (
        <div
          data-testid="chart-tf-dropdown-menu"
          className="absolute top-8 left-12 z-40 w-44 bg-[#181E2B] border border-[#2B374D] rounded-md shadow-2xl py-1.5 text-[10.5px] font-sans"
        >
          {DROPDOWN_TIMEFRAME_GROUPS.map((grp, gIdx) => (
            <div key={grp.title} className={gIdx > 0 ? 'border-t border-[#242F43] mt-1 pt-1' : ''}>
              <div className="px-3 py-0.5 text-[8.5px] font-semibold text-[#64748B] tracking-wider uppercase">
                {grp.title}
              </div>
              {grp.items.map((item) => (
                <button
                  key={item.id}
                  data-testid={`chart-tf-option-${item.id}`}
                  onClick={() => {
                    setActiveRange(null);
                    onTimeframeChange(item.id);
                    setTfMenuOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1 flex items-center justify-between transition-colors ${
                    timeframe === item.id
                      ? 'bg-[#2962FF]/25 text-[#56B6F7] font-semibold'
                      : 'text-[#CBD5E1] hover:bg-[#232C3F] hover:text-white'
                  }`}
                >
                  <span>{item.label}</span>
                  <span className="text-[9px] font-mono text-[#64748B]">{item.id}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      )}

      {/* 2. COMPACT TECHNICAL ANALYSIS & ON-CHAIN PRICE GUARD STRIP */}
      <div
        data-testid="chart-ta-strip"
        className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-0.5 px-2.5 py-0.5 bg-[#0D111A] border-b border-[#192232] text-[9.5px] font-mono shrink-0"
      >
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
          <span>
            <span className="text-[#64748B]">PA: </span>
            <strong
              className={
                taSnapshot.recommendedSide === 'LONG'
                  ? 'text-[#34D399]'
                  : taSnapshot.recommendedSide === 'SHORT'
                    ? 'text-[#F87171]'
                    : 'text-[#F5B74F]'
              }
            >
              {taSnapshot.structureLabel}
            </strong>
          </span>
          <span>
            <span className="text-[#64748B]">RSI: </span>
            <strong
              className={
                taSnapshot.rsi14 >= 70
                  ? 'text-[#F87171]'
                  : taSnapshot.rsi14 <= 32
                    ? 'text-[#34D399]'
                    : 'text-[#56B6F7]'
              }
            >
              {taSnapshot.rsi14}
            </strong>
          </span>
          <span data-testid="chart-history-meta" className="text-[#94A3B8]">
            HISTORY: <strong className="text-[#E2E8F0]">{listingYear}→LIVE</strong> ({totalBars} bars)
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span
            data-testid="chart-price-guard-badge"
            className="px-1.5 py-0.2 bg-[#0D1E18] border border-[#34D399]/40 text-[#34D399] font-semibold"
            title={`On-Chain Price Integrity Guard: ${priceGuardStatus} (Δ${priceDeviationPct.toFixed(2)}%)`}
          >
            ● ON-CHAIN SYNCED
          </span>
          <span className="px-1.5 py-0.2 bg-[#131D2E] border border-[#56B6F7]/40 text-[#56B6F7] font-semibold">
            TA {taSnapshot.taScore}/100
          </span>
        </div>
      </div>

      {/* 3. MAIN TRADINGVIEW WORKSPACE: Exact Left Vertical Technical Toolbar + Full-Bleed Canvas */}
      <div className="relative flex-1 flex min-h-[250px] lg:min-h-[150px] overflow-hidden bg-[#0F141E]">
        {/* Authentic TradingView Left Vertical Drawing Tools Rail (Matches user's reference icon bar 1:1!) */}
        <div
          data-testid="chart-left-toolbar"
          className={`${
            showMobileTools ? 'flex' : 'hidden sm:flex'
          } flex-col items-center gap-0.5 py-1.5 px-1 bg-[#131823] border-r border-[#1C2434] w-9 shrink-0 z-20 overflow-y-auto no-scrollbar`}
        >
          {/* 1. Crosshair */}
          <button
            data-testid="chart-tool-crosshair"
            onClick={() => {
              setDrawingTool('CROSSHAIR');
              setDraftPoints([]);
            }}
            title="Crosshair / Pan & Select"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              drawingTool === 'CROSSHAIR'
                ? 'bg-[#2962FF]/25 text-[#56B6F7]'
                : 'text-[#94A3B8] hover:bg-[#1E2636] hover:text-white'
            }`}
          >
            <IconCrosshair size={16} />
          </button>

          {/* 2. Trend Line Group (with flyout: Trend Line / Ray / Horizontal Line / Vertical Line) */}
          <div className="relative w-full flex justify-center">
            <button
              data-testid="chart-tool-trendline"
              onClick={() => {
                setDrawingTool(activeTrendSubtool);
                setDraftPoints([]);
                setPosFlyoutOpen(false);
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                setTrendFlyoutOpen((v) => !v);
              }}
              title="Trend Line Tools (Klik panah kecil untuk Ray / H-Line / V-Line)"
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                isTrendGroupActive
                  ? 'bg-[#2962FF]/25 text-[#56B6F7]'
                  : 'text-[#94A3B8] hover:bg-[#1E2636] hover:text-white'
              }`}
            >
              {activeTrendSubtool === 'RAY' ? (
                <IconRay size={16} />
              ) : activeTrendSubtool === 'HLINE' ? (
                <IconHLine size={16} />
              ) : activeTrendSubtool === 'VLINE' ? (
                <IconVLine size={16} />
              ) : (
                <IconTrendline size={16} />
              )}
            </button>
            <button
              data-testid="chart-tool-trendline-flyout"
              onClick={() => {
                setTrendFlyoutOpen((v) => !v);
                setPosFlyoutOpen(false);
              }}
              title="More Line Tools"
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[9px] text-[#64748B] hover:text-white px-0.5"
            >
              ›
            </button>
          </div>

          {/* 2b. Dedicated quick Horizontal Line button testid bridge inside flyout or visible trigger */}
          {/* 3. Fib Retracement */}
          <button
            data-testid="chart-tool-fib"
            onClick={() => {
              setDrawingTool('FIB');
              setDraftPoints([]);
            }}
            title="Fib Retracement (2 clicks)"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              drawingTool === 'FIB'
                ? 'bg-[#2962FF]/25 text-[#56B6F7]'
                : 'text-[#94A3B8] hover:bg-[#1E2636] hover:text-white'
            }`}
          >
            <IconFibRetracement size={16} />
          </button>

          {/* 4. XABCD Harmonic Pattern (5 clicks: X-A-B-C-D) */}
          <button
            data-testid="chart-tool-xabcd"
            onClick={() => {
              setDrawingTool('XABCD');
              setDraftPoints([]);
            }}
            title="XABCD Harmonic Pattern (5 clicks: X → A → B → C → D)"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              drawingTool === 'XABCD'
                ? 'bg-[#2962FF]/25 text-[#56B6F7]'
                : 'text-[#94A3B8] hover:bg-[#1E2636] hover:text-white'
            }`}
          >
            <IconXabcdPattern size={16} />
          </button>

          {/* 5. Long / Short Risk-Reward Position Tool */}
          <div className="relative w-full flex justify-center">
            <button
              data-testid="chart-tool-longpos"
              onClick={() => {
                setDrawingTool(activePosSubtool);
                setDraftPoints([]);
                setTrendFlyoutOpen(false);
              }}
              title="Long / Short Position Risk-Reward Box (Klik panah untuk switch Long/Short)"
              className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
                isPosGroupActive
                  ? 'bg-[#2962FF]/25 text-[#56B6F7]'
                  : 'text-[#94A3B8] hover:bg-[#1E2636] hover:text-white'
              }`}
            >
              <IconLongShortPos size={16} />
            </button>
            <button
              data-testid="chart-tool-pos-flyout"
              onClick={() => {
                setPosFlyoutOpen((v) => !v);
                setTrendFlyoutOpen(false);
              }}
              title="Switch Long / Short Position"
              className="absolute right-0 top-1/2 -translate-y-1/2 text-[9px] text-[#64748B] hover:text-white px-0.5"
            >
              ›
            </button>
          </div>

          {/* 6. Brush / Freehand Annotation */}
          <button
            data-testid="chart-tool-brush"
            onClick={() => {
              setDrawingTool('BRUSH');
              setDraftPoints([]);
            }}
            title="Brush Freehand Drawing (Drag untuk menggambar bebas)"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              drawingTool === 'BRUSH'
                ? 'bg-[#2962FF]/25 text-[#56B6F7]'
                : 'text-[#94A3B8] hover:bg-[#1E2636] hover:text-white'
            }`}
          >
            <IconBrush size={16} />
          </button>

          {/* 7. Text Note (T) */}
          <button
            data-testid="chart-tool-text"
            onClick={() => {
              setDrawingTool('TEXT');
              setDraftPoints([]);
            }}
            title="Text Annotation (Klik chart untuk menambah catatan teks)"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              drawingTool === 'TEXT'
                ? 'bg-[#2962FF]/25 text-[#56B6F7]'
                : 'text-[#94A3B8] hover:bg-[#1E2636] hover:text-white'
            }`}
          >
            <IconText size={16} />
          </button>

          {/* Quick Horizontal Price Line shortcut (also keeps chart-tool-hline testid directly accessible!) */}
          <button
            data-testid="chart-tool-hline"
            onClick={() => {
              setActiveTrendSubtool('HLINE');
              setDrawingTool('HLINE');
              setDraftPoints([]);
            }}
            title="Horizontal Price Line (1 click)"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              drawingTool === 'HLINE'
                ? 'bg-[#2962FF]/25 text-[#56B6F7]'
                : 'text-[#94A3B8] hover:bg-[#1E2636] hover:text-white'
            }`}
          >
            <IconHLine size={16} />
          </button>

          <div className="w-5 h-px bg-[#1E2736] my-0.5 shrink-0" />

          {/* 8. Measure Ruler */}
          <button
            data-testid="chart-tool-measure"
            onClick={() => {
              setDrawingTool('MEASURE');
              setDraftPoints([]);
            }}
            title="Measure Price & Bars (2 clicks)"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              drawingTool === 'MEASURE'
                ? 'bg-[#2962FF]/25 text-[#56B6F7]'
                : 'text-[#94A3B8] hover:bg-[#1E2636] hover:text-white'
            }`}
          >
            <IconMeasureRuler size={16} />
          </button>

          {/* 9. Zoom In */}
          <button
            data-testid="chart-tool-zoomin"
            onClick={() => {
              setDrawingTool('ZOOM_IN');
              setDraftPoints([]);
            }}
            title="Zoom In on Click"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              drawingTool === 'ZOOM_IN'
                ? 'bg-[#2962FF]/25 text-[#56B6F7]'
                : 'text-[#94A3B8] hover:bg-[#1E2636] hover:text-white'
            }`}
          >
            <IconZoomIn size={16} />
          </button>

          <div className="w-5 h-px bg-[#1E2736] my-0.5 shrink-0" />

          {/* 10. Magnet Snap Mode */}
          <button
            data-testid="chart-tool-magnet"
            onClick={() => setMagnetEnabled((v) => !v)}
            title="Magnet Mode (Snap ke OHLC Candle)"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              magnetEnabled
                ? 'bg-[#2962FF]/25 text-[#56B6F7]'
                : 'text-[#94A3B8] hover:bg-[#1E2636] hover:text-white'
            }`}
          >
            <IconMagnet size={16} />
          </button>

          {/* 11. Stay in Drawing Mode */}
          <button
            data-testid="chart-tool-stay"
            onClick={() => setStayInDrawingMode((v) => !v)}
            title="Stay in Drawing Mode"
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              stayInDrawingMode
                ? 'bg-[#2962FF]/25 text-[#56B6F7]'
                : 'text-[#94A3B8] hover:bg-[#1E2636] hover:text-white'
            }`}
          >
            <IconStayDrawing size={16} />
          </button>

          {/* 12. Lock All Drawings */}
          <button
            data-testid="chart-tool-lock"
            onClick={() => setAllDrawingsLocked((v) => !v)}
            title={allDrawingsLocked ? 'Unlock All Drawings' : 'Lock All Drawings'}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              allDrawingsLocked
                ? 'bg-[#F5B74F]/20 text-[#F5B74F]'
                : 'text-[#94A3B8] hover:bg-[#1E2636] hover:text-white'
            }`}
          >
            {allDrawingsLocked ? <IconLock size={15} /> : <IconUnlock size={15} />}
          </button>

          {/* 13. Hide / Show All Drawings */}
          <button
            data-testid="chart-tool-hide"
            onClick={() => setHideAllDrawings((v) => !v)}
            title={hideAllDrawings ? 'Show All Drawings' : 'Hide All Drawings'}
            className={`w-7 h-7 flex items-center justify-center rounded transition-colors ${
              hideAllDrawings
                ? 'bg-[#2962FF]/25 text-[#56B6F7]'
                : 'text-[#94A3B8] hover:bg-[#1E2636] hover:text-white'
            }`}
          >
            {hideAllDrawings ? <IconEyeOff size={15} /> : <IconEye size={15} />}
          </button>

          {/* 14. Remove All Drawings (Trash Can) */}
          <button
            data-testid="chart-tool-clear"
            onClick={() => {
              setDrawingsBySymbol((prev) => ({ ...prev, [pair.symbol]: [] }));
              setDraftPoints([]);
              setActiveBrushStroke(null);
              setSelectedDrawingId(null);
              setEditingTextId(null);
              setDrawingTool('CROSSHAIR');
            }}
            title={`Remove All Drawings (${symbolDrawings.length})`}
            className="w-7 h-7 flex items-center justify-center rounded text-[#94A3B8] hover:bg-[#1E2636] hover:text-[#EF5350] transition-colors"
          >
            <IconTrash size={15} />
          </button>
        </div>

        {/* Flyout Menu for Trend Line Group */}
        {trendFlyoutOpen && (
          <div className="absolute top-9 left-10 z-40 w-40 bg-[#181E2B] border border-[#2B374D] rounded-md shadow-2xl py-1 text-[10.5px]">
            {(
              [
                { id: 'TRENDLINE', label: 'Trend Line', icon: <IconTrendline size={14} /> },
                { id: 'RAY', label: 'Ray', icon: <IconRay size={14} /> },
                { id: 'HLINE', label: 'Horizontal Line', icon: <IconHLine size={14} /> },
                { id: 'VLINE', label: 'Vertical Line', icon: <IconVLine size={14} /> },
              ] as const
            ).map((it) => (
              <button
                key={it.id}
                onClick={() => {
                  setActiveTrendSubtool(it.id);
                  setDrawingTool(it.id);
                  setDraftPoints([]);
                  setTrendFlyoutOpen(false);
                }}
                className={`w-full px-2.5 py-1.5 flex items-center gap-2 text-left transition-colors ${
                  drawingTool === it.id
                    ? 'bg-[#2962FF]/25 text-[#56B6F7] font-semibold'
                    : 'text-[#CBD5E1] hover:bg-[#232C3F] hover:text-white'
                }`}
              >
                {it.icon}
                <span>{it.label}</span>
              </button>
            ))}
          </div>
        )}

        {/* Flyout Menu for Long / Short Position Group */}
        {posFlyoutOpen && (
          <div className="absolute top-32 left-10 z-40 w-40 bg-[#181E2B] border border-[#2B374D] rounded-md shadow-2xl py-1 text-[10.5px]">
            <button
              data-testid="chart-tool-longpos-opt"
              onClick={() => {
                setActivePosSubtool('LONG_POS');
                setDrawingTool('LONG_POS');
                setPosFlyoutOpen(false);
              }}
              className="w-full px-2.5 py-1.5 flex items-center gap-2 text-left text-[#26A69A] hover:bg-[#232C3F]"
            >
              <IconLongShortPos size={14} />
              <span>Long Position (R:R)</span>
            </button>
            <button
              data-testid="chart-tool-shortpos-opt"
              onClick={() => {
                setActivePosSubtool('SHORT_POS');
                setDrawingTool('SHORT_POS');
                setPosFlyoutOpen(false);
              }}
              className="w-full px-2.5 py-1.5 flex items-center gap-2 text-left text-[#EF5350] hover:bg-[#232C3F]"
            >
              <IconLongShortPos size={14} />
              <span>Short Position (R:R)</span>
            </button>
          </div>
        )}

        {/* Main Interactive SVG Canvas Container */}
        <div
          ref={containerRef}
          className="relative flex-1 bg-[#0F141E] overflow-hidden touch-drag-surface"
          style={{ touchAction: 'none' }}
        >
          {/* Floating TradingView Context Style Toolbar (Color, Opacity, Line Width, Line Style, Text Size, Delete) */}
          {showFloatingStyleBar && (
            <div
              data-testid="chart-drawing-toolbar"
              className="absolute top-1.5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 px-2 py-1 bg-[#181E2B]/95 border border-[#2D3B54] rounded-md shadow-xl text-[10px] font-mono"
            >
              {/* Color Swatch Button */}
              <div className="relative">
                <button
                  data-testid="chart-style-color-btn"
                  onClick={() => setColorPaletteOpen((v) => !v)}
                  className="w-5 h-5 rounded border border-[#475569] flex items-center justify-center"
                  style={{ backgroundColor: activeStyleColor }}
                  title="Drawing Color & Opacity"
                />
                {colorPaletteOpen && (
                  <div className="absolute top-7 left-0 z-40 p-2 bg-[#181E2B] border border-[#2D3B54] rounded-md shadow-2xl w-44 space-y-2">
                    <div className="grid grid-cols-6 gap-1">
                      {TV_PALETTE.map((col) => (
                        <button
                          key={col}
                          onClick={() => {
                            setDefaultDrawColor(col);
                            updateSelectedDrawing({ color: col });
                          }}
                          className={`w-5 h-5 rounded border ${
                            activeStyleColor === col ? 'border-white scale-110' : 'border-[#334155]'
                          }`}
                          style={{ backgroundColor: col }}
                        />
                      ))}
                    </div>
                    <div className="flex items-center gap-1.5 text-[9px] text-[#94A3B8]">
                      <span>Op</span>
                      <input
                        type="range"
                        min={15}
                        max={100}
                        value={Math.round(activeStyleOpacity * 100)}
                        onChange={(e) => {
                          const op = Number(e.target.value) / 100;
                          setDefaultOpacity(op);
                          updateSelectedDrawing({ opacity: op });
                        }}
                        className="flex-1 accent-[#56B6F7] h-1"
                      />
                      <span>{Math.round(activeStyleOpacity * 100)}%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Stroke Width Selector */}
              <select
                value={activeStyleWidth}
                onChange={(e) => {
                  const w = Number(e.target.value);
                  setDefaultLineWidth(w);
                  updateSelectedDrawing({ lineWidth: w });
                }}
                className="bg-[#0F141E] border border-[#2D3B54] text-[#E2E8F0] text-[9.5px] px-1 py-0.5"
                title="Line Thickness"
              >
                {[1, 2, 3, 4].map((w) => (
                  <option key={w} value={w}>
                    {w}px
                  </option>
                ))}
              </select>

              {/* Line Style Selector (Solid / Dashed / Dotted) */}
              <select
                value={activeStyleDash}
                onChange={(e) => {
                  const s = e.target.value as LineDashStyle;
                  setDefaultLineStyle(s);
                  updateSelectedDrawing({ lineStyle: s });
                }}
                className="bg-[#0F141E] border border-[#2D3B54] text-[#E2E8F0] text-[9.5px] px-1 py-0.5"
                title="Line Style"
              >
                <option value="SOLID">───</option>
                <option value="DASHED">- - -</option>
                <option value="DOTTED">····</option>
              </select>

              {/* Text Font Size & Inline Text Input when Text drawing is selected */}
              {selectedDrawing?.type === 'TEXT' && (
                <>
                  <select
                    value={selectedDrawing.fontSize || defaultFontSize}
                    onChange={(e) => {
                      const fs = Number(e.target.value);
                      setDefaultFontSize(fs);
                      updateSelectedDrawing({ fontSize: fs });
                    }}
                    className="bg-[#0F141E] border border-[#2D3B54] text-[#E2E8F0] text-[9.5px] px-1 py-0.5"
                    title="Font Size"
                  >
                    {[10, 12, 14, 16, 20, 24].map((fs) => (
                      <option key={fs} value={fs}>
                        {fs}px
                      </option>
                    ))}
                  </select>
                  <input
                    data-testid="chart-text-note-input"
                    type="text"
                    value={selectedDrawing.text || ''}
                    onChange={(e) => updateSelectedDrawing({ text: e.target.value })}
                    onFocus={() => setEditingTextId(selectedDrawing.id)}
                    onBlur={() => setEditingTextId(null)}
                    placeholder="Tulis catatan..."
                    className="w-24 bg-[#0F141E] border border-[#56B6F7]/60 text-white text-[10px] px-1.5 py-0.5"
                  />
                </>
              )}

              {selectedDrawing && (
                <>
                  <button
                    onClick={() => updateSelectedDrawing({ locked: !selectedDrawing.locked })}
                    className={`p-0.5 rounded ${
                      selectedDrawing.locked ? 'text-[#F5B74F]' : 'text-[#94A3B8] hover:text-white'
                    }`}
                    title={selectedDrawing.locked ? 'Unlock Drawing' : 'Lock Drawing'}
                  >
                    {selectedDrawing.locked ? <IconLock size={13} /> : <IconUnlock size={13} />}
                  </button>
                  <button
                    data-testid="chart-delete-selected-btn"
                    onClick={() => {
                      setDrawingsBySymbol((prev) => ({
                        ...prev,
                        [pair.symbol]: (prev[pair.symbol] || []).filter(
                          (d) => d.id !== selectedDrawing.id
                        ),
                      }));
                      setSelectedDrawingId(null);
                      setColorPaletteOpen(false);
                    }}
                    className="p-0.5 rounded text-[#94A3B8] hover:text-[#EF5350]"
                    title="Delete Selected Drawing (Del)"
                  >
                    <IconTrash size={13} />
                  </button>
                </>
              )}
            </div>
          )}

          {/* TradingView In-Canvas Floating Top-Left OHLCV + Bid/Ask + EMA Legend Overlay */}
          <div className="pointer-events-none absolute top-1.5 left-2 z-10 flex flex-col gap-0.5 max-w-[calc(100%-96px)]">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-mono bg-[#0F141E]/75 backdrop-blur-[2px] px-1.5 py-0.5 rounded">
              <span className="font-semibold text-[#E6EDF7]">
                {pair.symbol} · {timeframe.toUpperCase()}
              </span>
              <span className="text-[9px] text-[#56B6F7] hidden sm:inline">· {candleSource}</span>
              {inspectedCandle && (
                <>
                  <span className="text-[#94A3B8]">
                    O <strong className="text-[#E6EDF7]">{formatChartPrice(inspectedCandle.open)}</strong>
                  </span>
                  <span className="text-[#94A3B8]">
                    H <strong className="text-[#26A69A]">{formatChartPrice(inspectedCandle.high)}</strong>
                  </span>
                  <span className="text-[#94A3B8]">
                    L <strong className="text-[#EF5350]">{formatChartPrice(inspectedCandle.low)}</strong>
                  </span>
                  <span className="text-[#94A3B8]">
                    C <strong className="text-[#E6EDF7]">{formatChartPrice(inspectedCandle.close)}</strong>
                  </span>
                  <span
                    className={`font-semibold ${
                      inspectedChangePct >= 0 ? 'text-[#26A69A]' : 'text-[#EF5350]'
                    }`}
                  >
                    ({inspectedChangePct >= 0 ? '+' : ''}
                    {inspectedChangePct.toFixed(2)}%)
                  </span>
                </>
              )}
            </div>

            <div className="hidden sm:flex flex-wrap items-center gap-1.5 text-[9px] font-mono">
              <span className="px-1.5 py-0.2 bg-[#EF5350]/15 border border-[#EF5350]/45 text-[#EF5350] font-semibold">
                SELL {formatChartPrice(bestBidPx)}
              </span>
              <span className="px-1.5 py-0.2 bg-[#2962FF]/15 border border-[#56B6F7]/45 text-[#56B6F7] font-semibold">
                BUY {formatChartPrice(bestAskPx)}
              </span>
              {showEma && latestEma20 && (
                <span className="text-[#F5B74F] bg-[#0F141E]/75 px-1">
                  EMA20 {formatChartPrice(latestEma20)}
                </span>
              )}
              {showEma && latestEma50 && (
                <span className="text-[#56B6F7] bg-[#0F141E]/75 px-1">
                  EMA50 {formatChartPrice(latestEma50)}
                </span>
              )}
              {showEma && latestEma200 && (
                <span className="text-[#A78BFA] bg-[#0F141E]/75 px-1 hidden md:inline">
                  EMA200 {formatChartPrice(latestEma200)}
                </span>
              )}
              {inspectedCandle && (
                <span className="text-[#94A3B8] bg-[#0F141E]/75 px-1">
                  Vol <strong className="text-[#26A69A]">${formatCompactVol(inspectedCandle.volume)}</strong>
                </span>
              )}
            </div>

            {drawingTool !== 'CROSSHAIR' && (
              <div className="inline-flex items-center gap-1.5 self-start px-2 py-0.5 bg-[#2962FF]/20 border border-[#56B6F7]/60 text-[#56B6F7] text-[9px] font-mono">
                <span>
                  TOOL: <strong>{drawingTool}</strong>
                  {drawingTool === 'XABCD'
                    ? ` (${draftPoints.length}/5 titik: ${['X', 'A', 'B', 'C', 'D'][draftPoints.length]})`
                    : drawingTool === 'BRUSH'
                      ? ' — Drag untuk menggambar bebas'
                      : draftPoints.length > 0
                        ? ' — Klik titik akhir'
                        : ' — Klik pada chart'}
                </span>
              </div>
            )}
          </div>

          {isLoadingCandles && (
            <div className="absolute top-2 right-24 z-20 px-2 py-0.5 bg-[#121A2B]/95 border border-[#56B6F7]/60 text-[#56B6F7] text-[9.5px] font-mono font-semibold">
              SYNCING LIVE {timeframe.toUpperCase()}...
            </div>
          )}

          <svg
            ref={svgRef}
            key={`${pair.symbol}-${timeframe}`}
            viewBox={`0 0 ${width} ${height}`}
            data-testid="chart-svg"
            data-pan-offset={clampedPanOffset}
            data-price-pan={pricePanRatio}
            data-bars-count={totalBars}
            data-listing-year={listingYear}
            data-scale-mode={scaleMode}
            data-chart-style={chartStyle}
            style={{ touchAction: 'none' }}
            className={`w-full h-full fincept-chart-enter touch-drag-surface ${
              dragMode === 'PRICE_AXIS_SCALE'
                ? 'cursor-ns-resize'
                : dragMode === 'CHART_2D_PAN'
                  ? 'cursor-grabbing'
                  : 'cursor-crosshair'
            }`}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUpOrCancel}
            onPointerCancel={handlePointerUpOrCancel}
            onPointerLeave={handlePointerLeave}
            onDoubleClick={handleResetView}
          >
            <defs>
              <clipPath id="fincept-tv-price-clip">
                <rect x={padLeft} y={padTop} width={plotW} height={pricePaneH} />
              </clipPath>
              <clipPath id="fincept-tv-vol-clip">
                <rect x={padLeft} y={volTopY} width={plotW} height={volPaneH} />
              </clipPath>
              <linearGradient id="fincept-tv-area-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#26A69A" stopOpacity="0.32" />
                <stop offset="100%" stopColor="#26A69A" stopOpacity="0.01" />
              </linearGradient>
            </defs>

            {/* Subtle TradingView Gridlines */}
            {yTicks.map((t, idx) => (
              <line
                key={`hgrid-${idx}`}
                x1={padLeft}
                y1={t.y}
                x2={width - padRight}
                y2={t.y}
                stroke="#182030"
                strokeWidth="1"
              />
            ))}
            {xTicks.map((xt, idx) => (
              <line
                key={`vgrid-${idx}`}
                x1={xt.x}
                y1={padTop}
                x2={xt.x}
                y2={height - padBottom}
                stroke="#182030"
                strokeWidth="1"
              />
            ))}

            {/* Divider between Price Pane and Volume Pane */}
            <line
              x1={padLeft}
              y1={volTopY - 2}
              x2={width - padRight}
              y2={volTopY - 2}
              stroke="#1E2738"
              strokeWidth="1"
            />

            {/* Right Interactive Price Scale Strip */}
            <rect
              x={width - padRight}
              y={0}
              width={padRight}
              height={height - padBottom}
              fill="#111622"
              className="cursor-ns-resize"
            />
            <line
              x1={width - padRight}
              y1={0}
              x2={width - padRight}
              y2={height - padBottom}
              stroke="#1E2738"
              strokeWidth="1"
            />
            {yTicks.map((t, idx) => (
              <text
                key={`ylabel-${idx}`}
                x={width - padRight + 6}
                y={t.y + 3}
                className="fill-[#8A97AD] text-[9px] font-mono pointer-events-none"
              >
                {formatRightAxisVal(t.val)}
              </text>
            ))}
            <text
              x={width - padRight + 6}
              y={volTopY + 12}
              className="fill-[#64748B] text-[8.5px] font-mono pointer-events-none"
            >
              Vol {formatCompactVol(maxVol)}
            </text>

            {/* Bottom Date/Time Axis Strip */}
            <rect x={0} y={height - padBottom} width={width} height={padBottom} fill="#111622" />
            <line
              x1={0}
              y1={height - padBottom}
              x2={width}
              y2={height - padBottom}
              stroke="#1E2738"
              strokeWidth="1"
            />
            {xTicks.map((xt, idx) => (
              <text
                key={`xlabel-${idx}`}
                x={xt.x}
                y={height - 9}
                textAnchor="middle"
                className={`font-mono pointer-events-none ${
                  xt.isYear ? 'fill-[#CBD5E1] text-[9.5px] font-semibold' : 'fill-[#7C8BA1] text-[8.5px]'
                }`}
              >
                {xt.text}
              </text>
            ))}

            {/* DEDICATED LOWER VOLUME HISTOGRAM PANE */}
            <g clipPath="url(#fincept-tv-vol-clip)">
              {visibleCandles.map((c, i) => {
                const xCenter = localIndexToX(i);
                const isUp = c.close >= c.open;
                const vHeight = Math.max(1.5, (c.volume / maxVol) * (volPaneH - 4));
                return (
                  <rect
                    key={`vol-${c.time}-${i}`}
                    x={xCenter - candleWidth / 2}
                    y={volTopY + volPaneH - vHeight}
                    width={candleWidth}
                    height={vHeight}
                    fill={isUp ? '#26A69A' : '#EF5350'}
                    opacity="0.48"
                  />
                );
              })}
            </g>

            {/* MAIN PRICE PLOT AREA */}
            <g clipPath="url(#fincept-tv-price-clip)">
              {/* Orderbook Whale Walls */}
              {(() => {
                const wallsTooClose = Boolean(
                  whaleBidWall &&
                    whaleAskWall &&
                    Math.abs(priceToY(whaleAskWall.price) - priceToY(whaleBidWall.price)) < 16
                );
                return (
                  <>
                    {showWhaleZones &&
                      whaleBidWall &&
                      whaleBidWall.price >= minPrice &&
                      whaleBidWall.price <= maxPrice && (
                        <g>
                          <line
                            x1={padLeft}
                            y1={priceToY(whaleBidWall.price)}
                            x2={width - padRight}
                            y2={priceToY(whaleBidWall.price)}
                            stroke="#26A69A"
                            strokeWidth="1"
                            strokeDasharray="3 3"
                            opacity="0.5"
                          />
                          {!wallsTooClose && (
                            <text
                              x={padLeft + 6}
                              y={priceToY(whaleBidWall.price) - 3}
                              className="fill-[#26A69A] text-[8px] font-mono pointer-events-none"
                            >
                              BID WALL ${(whaleBidWall.totalUsd / 1000).toFixed(0)}K @{' '}
                              {formatChartPrice(whaleBidWall.price)}
                            </text>
                          )}
                        </g>
                      )}

                    {showWhaleZones &&
                      whaleAskWall &&
                      whaleAskWall.price >= minPrice &&
                      whaleAskWall.price <= maxPrice && (
                        <g>
                          <line
                            x1={padLeft}
                            y1={priceToY(whaleAskWall.price)}
                            x2={width - padRight}
                            y2={priceToY(whaleAskWall.price)}
                            stroke="#EF5350"
                            strokeWidth="1"
                            strokeDasharray="3 3"
                            opacity="0.5"
                          />
                          {!wallsTooClose && (
                            <text
                              x={padLeft + 6}
                              y={priceToY(whaleAskWall.price) + 10}
                              className="fill-[#EF5350] text-[8px] font-mono pointer-events-none"
                            >
                              ASK WALL ${(whaleAskWall.totalUsd / 1000).toFixed(0)}K @{' '}
                              {formatChartPrice(whaleAskWall.price)}
                            </text>
                          )}
                        </g>
                      )}
                  </>
                );
              })()}

              {/* Key Price Action S1 / R1 */}
              {showStructureLevels && (
                <g>
                  {taSnapshot.support1 >= minPrice && taSnapshot.support1 <= maxPrice && (
                    <g>
                      <line
                        x1={padLeft}
                        y1={priceToY(taSnapshot.support1)}
                        x2={width - padRight}
                        y2={priceToY(taSnapshot.support1)}
                        stroke="#34D399"
                        strokeWidth="1"
                        strokeDasharray="5 4"
                        opacity="0.55"
                      />
                      <text
                        x={width - padRight - 6}
                        y={priceToY(taSnapshot.support1) - 3}
                        textAnchor="end"
                        className="fill-[#34D399] text-[8px] font-mono pointer-events-none"
                      >
                        S1 {formatChartPrice(taSnapshot.support1)}
                      </text>
                    </g>
                  )}
                  {taSnapshot.resistance1 >= minPrice && taSnapshot.resistance1 <= maxPrice && (
                    <g>
                      <line
                        x1={padLeft}
                        y1={priceToY(taSnapshot.resistance1)}
                        x2={width - padRight}
                        y2={priceToY(taSnapshot.resistance1)}
                        stroke="#F87171"
                        strokeWidth="1"
                        strokeDasharray="5 4"
                        opacity="0.55"
                      />
                      <text
                        x={width - padRight - 6}
                        y={priceToY(taSnapshot.resistance1) + 9}
                        textAnchor="end"
                        className="fill-[#F87171] text-[8px] font-mono pointer-events-none"
                      >
                        R1 {formatChartPrice(taSnapshot.resistance1)}
                      </text>
                    </g>
                  )}
                </g>
              )}

              {/* Bollinger Bands */}
              {showBollinger && bbUpperPoints.length > 1 && (
                <g>
                  <polyline
                    fill="none"
                    stroke="#A78BFA"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    opacity="0.55"
                    points={bbUpperPolyline}
                  />
                  <polyline
                    fill="none"
                    stroke="#A78BFA"
                    strokeWidth="1"
                    strokeDasharray="3 3"
                    opacity="0.55"
                    points={bbLowerPolyline}
                  />
                </g>
              )}

              {/* Price Series (Candles / Hollow / Line-Area) */}
              {chartStyle === 'AREA' ? (
                visibleCandles.length > 1 && (
                  <g>
                    <polygon points={areaFillPoints} fill="url(#fincept-tv-area-grad)" />
                    <polyline
                      fill="none"
                      stroke="#26A69A"
                      strokeWidth="1.75"
                      points={areaLinePolyline}
                    />
                  </g>
                )
              ) : (
                visibleCandles.map((c, i) => {
                  const xCenter = localIndexToX(i);
                  const isUp = c.close >= c.open;
                  const color = isUp ? '#26A69A' : '#EF5350';
                  const yOpen = priceToY(c.open);
                  const yClose = priceToY(c.close);
                  const yHigh = priceToY(c.high);
                  const yLow = priceToY(c.low);
                  const bodyTop = Math.min(yOpen, yClose);
                  const bodyHeight = Math.max(1.2, Math.abs(yClose - yOpen));
                  const isHollowUp = chartStyle === 'HOLLOW' && isUp;

                  return (
                    <g key={`c-${c.time}-${i}`}>
                      <line
                        x1={xCenter}
                        y1={yHigh}
                        x2={xCenter}
                        y2={yLow}
                        stroke={color}
                        strokeWidth={candleWidth < 2 ? 0.9 : 1.15}
                      />
                      <rect
                        x={xCenter - candleWidth / 2}
                        y={bodyTop}
                        width={candleWidth}
                        height={bodyHeight}
                        fill={isHollowUp ? '#0F141E' : color}
                        stroke={color}
                        strokeWidth={isHollowUp ? 1.1 : 0.35}
                      />
                    </g>
                  );
                })
              )}

              {/* Smooth EMA 20 / 50 / 200 */}
              {showEma && ema20Points.length > 1 && (
                <g>
                  <polyline fill="none" stroke="#F5B74F" strokeWidth="1.2" opacity="0.88" points={ema20Polyline} />
                  <polyline fill="none" stroke="#56B6F7" strokeWidth="1.2" opacity="0.82" points={ema50Polyline} />
                  <polyline fill="none" stroke="#A78BFA" strokeWidth="1.25" opacity="0.72" points={ema200Polyline} />
                </g>
              )}

              {/* Active Bot Position Levels */}
              {showBotLevels && activePosition && (
                <g>
                  {activePosition.entryPrice >= minPrice && activePosition.entryPrice <= maxPrice && (
                    <g>
                      <line
                        x1={padLeft}
                        y1={priceToY(activePosition.entryPrice)}
                        x2={width - padRight}
                        y2={priceToY(activePosition.entryPrice)}
                        stroke="#56B6F7"
                        strokeWidth="1.2"
                        strokeDasharray="4 2"
                      />
                      <text
                        x={padLeft + 6}
                        y={priceToY(activePosition.entryPrice) - 3}
                        className="fill-[#56B6F7] text-[8.5px] font-mono font-semibold"
                      >
                        ENTRY {activePosition.side} @ {formatChartPrice(activePosition.entryPrice)}
                      </text>
                    </g>
                  )}
                  {activePosition.stopLossPrice >= minPrice && activePosition.stopLossPrice <= maxPrice && (
                    <line
                      x1={padLeft}
                      y1={priceToY(activePosition.stopLossPrice)}
                      x2={width - padRight}
                      y2={priceToY(activePosition.stopLossPrice)}
                      stroke="#34D399"
                      strokeWidth="1.2"
                    />
                  )}
                  {activePosition.takeProfitPrice >= minPrice && activePosition.takeProfitPrice <= maxPrice && (
                    <line
                      x1={padLeft}
                      y1={priceToY(activePosition.takeProfitPrice)}
                      x2={width - padRight}
                      y2={priceToY(activePosition.takeProfitPrice)}
                      stroke="#F5B74F"
                      strokeWidth="1.2"
                      strokeDasharray="3 3"
                    />
                  )}
                </g>
              )}

              {/* ALL INTERACTIVE TRADINGVIEW TECHNICAL DRAWINGS (Editable, Selectable, Draggable!) */}
              {!hideAllDrawings &&
                symbolDrawings.map((d) => {
                  const isSel = selectedDrawingId === d.id;
                  const dash = getStrokeDasharray(d.lineStyle);

                  if (d.type === 'HLINE' && d.points[0]) {
                    const y1 = priceToY(d.points[0].p);
                    return (
                      <g
                        key={d.id}
                        data-testid="chart-drawing-item"
                        className="cursor-pointer"
                        onPointerDown={(e) => startHandleDrag(e, d, 'move')}
                      >
                        <line x1={padLeft} y1={y1} x2={width - padRight} y2={y1} stroke="transparent" strokeWidth="10" />
                        <line
                          x1={padLeft}
                          y1={y1}
                          x2={width - padRight}
                          y2={y1}
                          stroke={d.color}
                          strokeWidth={d.lineWidth}
                          strokeDasharray={dash}
                          opacity={d.opacity}
                        />
                        <text
                          x={padLeft + 8}
                          y={y1 - 4}
                          className="text-[8.5px] font-mono font-semibold"
                          fill={d.color}
                        >
                          {formatChartPrice(d.points[0].p)}
                        </text>
                        {isSel && (
                          <circle
                            cx={padLeft + plotW / 2}
                            cy={y1}
                            r="4.5"
                            fill="#0F141E"
                            stroke="#56B6F7"
                            strokeWidth="2"
                          />
                        )}
                      </g>
                    );
                  }

                  if (d.type === 'VLINE' && d.points[0]) {
                    const x1 = timeToX(d.points[0].t);
                    if (x1 === null) return null;
                    return (
                      <g
                        key={d.id}
                        data-testid="chart-drawing-item"
                        className="cursor-pointer"
                        onPointerDown={(e) => startHandleDrag(e, d, 'move')}
                      >
                        <line x1={x1} y1={padTop} x2={x1} y2={padTop + pricePaneH} stroke="transparent" strokeWidth="10" />
                        <line
                          x1={x1}
                          y1={padTop}
                          x2={x1}
                          y2={padTop + pricePaneH}
                          stroke={d.color}
                          strokeWidth={d.lineWidth}
                          strokeDasharray={dash}
                          opacity={d.opacity}
                        />
                        {isSel && (
                          <circle
                            cx={x1}
                            cy={padTop + pricePaneH / 2}
                            r="4.5"
                            fill="#0F141E"
                            stroke="#56B6F7"
                            strokeWidth="2"
                          />
                        )}
                      </g>
                    );
                  }

                  if (d.type === 'TEXT' && d.points[0]) {
                    const x1 = timeToX(d.points[0].t);
                    if (x1 === null) return null;
                    const y1 = priceToY(d.points[0].p);
                    const fs = d.fontSize || 13;
                    return (
                      <g
                        key={d.id}
                        data-testid="chart-drawing-item"
                        className="cursor-move"
                        onPointerDown={(e) => startHandleDrag(e, d, 'move')}
                      >
                        {isSel && (
                          <rect
                            x={x1 - 4}
                            y={y1 - fs - 2}
                            width={Math.max(46, (d.text?.length || 4) * fs * 0.65 + 10)}
                            height={fs + 8}
                            rx="3"
                            fill="#181E2B"
                            fillOpacity="0.7"
                            stroke="#56B6F7"
                            strokeWidth="1"
                            strokeDasharray="3 2"
                          />
                        )}
                        <text
                          x={x1}
                          y={y1}
                          fill={d.color}
                          opacity={d.opacity}
                          fontSize={fs}
                          fontFamily="Inter, sans-serif"
                          fontWeight="600"
                        >
                          {d.text || 'Note'}
                        </text>
                      </g>
                    );
                  }

                  if (d.type === 'BRUSH' && d.points.length >= 2) {
                    const poly = d.points
                      .map((pt) => {
                        const x = timeToX(pt.t);
                        return x !== null ? `${x},${priceToY(pt.p)}` : null;
                      })
                      .filter(Boolean)
                      .join(' ');
                    if (!poly) return null;
                    return (
                      <g
                        key={d.id}
                        data-testid="chart-drawing-item"
                        className="cursor-pointer"
                        onPointerDown={(e) => startHandleDrag(e, d, 'move')}
                      >
                        <polyline fill="none" stroke="transparent" strokeWidth="10" points={poly} />
                        <polyline
                          fill="none"
                          stroke={d.color}
                          strokeWidth={d.lineWidth}
                          strokeDasharray={dash}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          opacity={d.opacity}
                          points={poly}
                        />
                      </g>
                    );
                  }

                  if ((d.type === 'LONG_POS' || d.type === 'SHORT_POS') && d.points[0] && d.tpPrice && d.slPrice) {
                    const x1 = timeToX(d.points[0].t);
                    const x2 = timeToX(d.endTime || d.points[0].t + stepMs * 18);
                    if (x1 === null || x2 === null) return null;
                    const entryPx = d.points[0].p;
                    const yEntry = priceToY(entryPx);
                    const yTp = priceToY(d.tpPrice);
                    const ySl = priceToY(d.slPrice);
                    const leftX = Math.min(x1, x2);
                    const boxW = Math.max(48, Math.abs(x2 - x1));
                    const rewardDiff = Math.abs(d.tpPrice - entryPx);
                    const riskDiff = Math.max(1e-12, Math.abs(entryPx - d.slPrice));
                    const rr = rewardDiff / riskDiff;
                    const tpPct = ((d.tpPrice - entryPx) / Math.max(1e-12, entryPx)) * 100;
                    const slPct = ((d.slPrice - entryPx) / Math.max(1e-12, entryPx)) * 100;

                    return (
                      <g key={d.id} data-testid="chart-drawing-item">
                        {/* Target Profit Zone (Green) */}
                        <rect
                          x={leftX}
                          y={Math.min(yEntry, yTp)}
                          width={boxW}
                          height={Math.max(4, Math.abs(yEntry - yTp))}
                          fill="#26A69A"
                          fillOpacity={Math.min(0.45, Math.max(0.12, d.opacity))}
                          stroke="#26A69A"
                          strokeWidth="1"
                          className="cursor-move"
                          onPointerDown={(e) => startHandleDrag(e, d, 'move')}
                        />
                        {/* Stop Loss Zone (Red) */}
                        <rect
                          x={leftX}
                          y={Math.min(yEntry, ySl)}
                          width={boxW}
                          height={Math.max(4, Math.abs(yEntry - ySl))}
                          fill="#EF5350"
                          fillOpacity={Math.min(0.45, Math.max(0.12, d.opacity))}
                          stroke="#EF5350"
                          strokeWidth="1"
                          className="cursor-move"
                          onPointerDown={(e) => startHandleDrag(e, d, 'move')}
                        />
                        {/* Center Entry & Risk/Reward Pill */}
                        <line
                          x1={leftX}
                          y1={yEntry}
                          x2={leftX + boxW}
                          y2={yEntry}
                          stroke="#CBD5E1"
                          strokeWidth="1.2"
                        />
                        <rect
                          x={leftX + 4}
                          y={yTp - (d.type === 'LONG_POS' ? 15 : -3)}
                          width={126}
                          height={13}
                          rx="2"
                          fill="#1B4D46"
                        />
                        <text
                          x={leftX + 8}
                          y={yTp - (d.type === 'LONG_POS' ? 5 : -12)}
                          className="fill-[#A7F3D0] text-[8px] font-mono font-semibold pointer-events-none"
                        >
                          Target: {formatChartPrice(d.tpPrice)} ({tpPct >= 0 ? '+' : ''}
                          {tpPct.toFixed(2)}%)
                        </text>
                        <rect
                          x={leftX + 4}
                          y={yEntry - 7}
                          width={108}
                          height={14}
                          rx="2"
                          fill="#182234"
                          stroke="#475569"
                          strokeWidth="0.7"
                        />
                        <text
                          x={leftX + 8}
                          y={yEntry + 3}
                          className="fill-[#F8FAFC] text-[8px] font-mono font-semibold pointer-events-none"
                        >
                          R/R Ratio: {rr.toFixed(2)}
                        </text>
                        <rect
                          x={leftX + 4}
                          y={ySl + (d.type === 'LONG_POS' ? 3 : -15)}
                          width={124}
                          height={13}
                          rx="2"
                          fill="#5B1F27"
                        />
                        <text
                          x={leftX + 8}
                          y={ySl + (d.type === 'LONG_POS' ? 12 : -5)}
                          className="fill-[#FECACA] text-[8px] font-mono font-semibold pointer-events-none"
                        >
                          Stop: {formatChartPrice(d.slPrice)} ({slPct >= 0 ? '+' : ''}
                          {slPct.toFixed(2)}%)
                        </text>

                        {/* Draggable TP / Entry / SL Handles */}
                        <circle
                          cx={leftX + boxW}
                          cy={yTp}
                          r={isSel ? 5 : 3.5}
                          fill="#0F141E"
                          stroke="#26A69A"
                          strokeWidth="2"
                          className="cursor-ns-resize"
                          onPointerDown={(e) => startHandleDrag(e, d, 'tp')}
                        />
                        <circle
                          cx={leftX}
                          cy={yEntry}
                          r={isSel ? 5 : 3.5}
                          fill="#0F141E"
                          stroke="#56B6F7"
                          strokeWidth="2"
                          className="cursor-move"
                          onPointerDown={(e) => startHandleDrag(e, d, 'entry')}
                        />
                        <circle
                          cx={leftX + boxW}
                          cy={ySl}
                          r={isSel ? 5 : 3.5}
                          fill="#0F141E"
                          stroke="#EF5350"
                          strokeWidth="2"
                          className="cursor-ns-resize"
                          onPointerDown={(e) => startHandleDrag(e, d, 'sl')}
                        />
                      </g>
                    );
                  }

                  if (d.type === 'XABCD' && d.points.length === 5) {
                    const coords = d.points.map((pt) => ({ x: timeToX(pt.t), y: priceToY(pt.p), p: pt.p }));
                    if (coords.some((c) => c.x === null)) return null;
                    const pts = coords as Array<{ x: number; y: number; p: number }>;
                    const labels = ['X', 'A', 'B', 'C', 'D'];
                    const xa = Math.max(1e-12, Math.abs(pts[1].p - pts[0].p));
                    const ab = Math.max(1e-12, Math.abs(pts[2].p - pts[1].p));
                    const bc = Math.max(1e-12, Math.abs(pts[3].p - pts[2].p));
                    const cd = Math.abs(pts[4].p - pts[3].p);
                    const ad = Math.abs(pts[4].p - pts[1].p);
                    const rAbXa = (ab / xa).toFixed(3);
                    const rBcAb = (bc / ab).toFixed(3);
                    const rCdBc = (cd / bc).toFixed(3);
                    const rAdXa = (ad / xa).toFixed(3);

                    return (
                      <g key={d.id} data-testid="chart-drawing-item">
                        <polygon
                          points={`${pts[0].x},${pts[0].y} ${pts[1].x},${pts[1].y} ${pts[2].x},${pts[2].y}`}
                          fill={d.color}
                          fillOpacity={Math.min(0.6, d.opacity)}
                          className="cursor-move"
                          onPointerDown={(e) => startHandleDrag(e, d, 'move')}
                        />
                        <polygon
                          points={`${pts[2].x},${pts[2].y} ${pts[3].x},${pts[3].y} ${pts[4].x},${pts[4].y}`}
                          fill={d.color}
                          fillOpacity={Math.min(0.6, d.opacity)}
                          className="cursor-move"
                          onPointerDown={(e) => startHandleDrag(e, d, 'move')}
                        />
                        <polyline
                          fill="none"
                          stroke={d.color}
                          strokeWidth={d.lineWidth}
                          points={pts.map((p) => `${p.x},${p.y}`).join(' ')}
                        />
                        <line x1={pts[0].x} y1={pts[0].y} x2={pts[2].x} y2={pts[2].y} stroke={d.color} strokeWidth="1" strokeDasharray="3 3" />
                        <line x1={pts[1].x} y1={pts[1].y} x2={pts[3].x} y2={pts[3].y} stroke={d.color} strokeWidth="1" strokeDasharray="3 3" />
                        <line x1={pts[2].x} y1={pts[2].y} x2={pts[4].x} y2={pts[4].y} stroke={d.color} strokeWidth="1" strokeDasharray="3 3" />
                        <line x1={pts[0].x} y1={pts[0].y} x2={pts[4].x} y2={pts[4].y} stroke={d.color} strokeWidth="1" strokeDasharray="3 3" />

                        {/* Ratio Badges (TradingView Harmonic Style) */}
                        {[
                          { x: (pts[0].x + pts[2].x) / 2, y: (pts[0].y + pts[2].y) / 2, txt: rAbXa },
                          { x: (pts[1].x + pts[3].x) / 2, y: (pts[1].y + pts[3].y) / 2, txt: rBcAb },
                          { x: (pts[2].x + pts[4].x) / 2, y: (pts[2].y + pts[4].y) / 2, txt: rCdBc },
                          { x: (pts[0].x + pts[4].x) / 2, y: (pts[0].y + pts[4].y) / 2, txt: rAdXa },
                        ].map((rb, rIdx) => (
                          <g key={rIdx} className="pointer-events-none">
                            <rect x={rb.x - 16} y={rb.y - 6} width={32} height={12} rx="2" fill={d.color} fillOpacity="0.88" />
                            <text x={rb.x} y={rb.y + 3} textAnchor="middle" className="fill-white text-[7.5px] font-mono font-bold">
                              {rb.txt}
                            </text>
                          </g>
                        ))}

                        {/* Vertex Labels & Draggable Handles */}
                        {pts.map((pt, idx) => (
                          <g key={idx}>
                            <circle
                              cx={pt.x}
                              cy={pt.y}
                              r={isSel ? 5 : 3.5}
                              fill="#0F141E"
                              stroke={d.color}
                              strokeWidth="1.8"
                              className="cursor-move"
                              onPointerDown={(e) =>
                                startHandleDrag(e, d, `pt${idx}` as 'pt0' | 'pt1' | 'pt2' | 'pt3' | 'pt4')
                              }
                            />
                            <text
                              x={pt.x}
                              y={pt.y - 8}
                              textAnchor="middle"
                              className="fill-[#E6EDF7] text-[9px] font-mono font-bold pointer-events-none"
                            >
                              {labels[idx]}
                            </text>
                          </g>
                        ))}
                      </g>
                    );
                  }

                  // 2-Point Drawings: TRENDLINE, RAY, FIB, MEASURE
                  if (d.points.length < 2) return null;
                  const x1 = timeToX(d.points[0].t);
                  const x2 = timeToX(d.points[1].t);
                  if (x1 === null || x2 === null) return null;
                  const y1 = priceToY(d.points[0].p);
                  const y2 = priceToY(d.points[1].p);

                  if (d.type === 'TRENDLINE' || d.type === 'RAY') {
                    let endX = x2;
                    let endY = y2;
                    if (d.type === 'RAY' && Math.abs(x2 - x1) > 0.5) {
                      const slope = (y2 - y1) / (x2 - x1);
                      endX = x2 >= x1 ? width - padRight : padLeft;
                      endY = y1 + slope * (endX - x1);
                    }
                    return (
                      <g key={d.id} data-testid="chart-drawing-item">
                        <line
                          x1={x1}
                          y1={y1}
                          x2={endX}
                          y2={endY}
                          stroke="transparent"
                          strokeWidth="10"
                          className="cursor-move"
                          onPointerDown={(e) => startHandleDrag(e, d, 'move')}
                        />
                        <line
                          x1={x1}
                          y1={y1}
                          x2={endX}
                          y2={endY}
                          stroke={d.color}
                          strokeWidth={d.lineWidth}
                          strokeDasharray={dash}
                          opacity={d.opacity}
                        />
                        <circle
                          cx={x1}
                          cy={y1}
                          r={isSel ? 5 : 3}
                          fill="#0F141E"
                          stroke={isSel ? '#56B6F7' : d.color}
                          strokeWidth="1.8"
                          className="cursor-move"
                          onPointerDown={(e) => startHandleDrag(e, d, 'pt0')}
                        />
                        <circle
                          cx={x2}
                          cy={y2}
                          r={isSel ? 5 : 3}
                          fill="#0F141E"
                          stroke={isSel ? '#56B6F7' : d.color}
                          strokeWidth="1.8"
                          className="cursor-move"
                          onPointerDown={(e) => startHandleDrag(e, d, 'pt1')}
                        />
                      </g>
                    );
                  }

                  if (d.type === 'FIB') {
                    const leftX = Math.min(x1, x2);
                    const rightX = Math.max(x1, x2, leftX + 60);
                    return (
                      <g key={d.id} data-testid="chart-drawing-item">
                        {/* Diagonal dashed anchor guide */}
                        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94A3B8" strokeWidth="1" strokeDasharray="3 3" opacity="0.6" />
                        {TV_FIB_BANDS.map((band, bIdx) => {
                          const px = d.points[1].p + (d.points[0].p - d.points[1].p) * band.level;
                          const ly = priceToY(px);
                          const nextBand = TV_FIB_BANDS[bIdx + 1];
                          const nextPx = nextBand
                            ? d.points[1].p + (d.points[0].p - d.points[1].p) * nextBand.level
                            : null;
                          const nextY = nextPx !== null ? priceToY(nextPx) : null;
                          return (
                            <g key={`${d.id}-fib-${band.level}`}>
                              {nextY !== null && (
                                <rect
                                  x={leftX}
                                  y={Math.min(ly, nextY)}
                                  width={rightX - leftX}
                                  height={Math.abs(nextY - ly)}
                                  fill={band.color}
                                  fillOpacity={Math.min(0.28, d.opacity)}
                                  className="cursor-move"
                                  onPointerDown={(e) => startHandleDrag(e, d, 'move')}
                                />
                              )}
                              <line
                                x1={leftX}
                                y1={ly}
                                x2={rightX}
                                y2={ly}
                                stroke={band.color}
                                strokeWidth="1.15"
                                opacity="0.88"
                              />
                              <text
                                x={leftX - 4}
                                y={ly + 3}
                                textAnchor="end"
                                fill={band.color}
                                className="text-[7.5px] font-mono font-semibold pointer-events-none"
                              >
                                {band.level} ({formatChartPrice(px)})
                              </text>
                            </g>
                          );
                        })}
                        <circle
                          cx={x1}
                          cy={y1}
                          r={isSel ? 5 : 3.5}
                          fill="#0F141E"
                          stroke="#56B6F7"
                          strokeWidth="1.8"
                          className="cursor-move"
                          onPointerDown={(e) => startHandleDrag(e, d, 'pt0')}
                        />
                        <circle
                          cx={x2}
                          cy={y2}
                          r={isSel ? 5 : 3.5}
                          fill="#0F141E"
                          stroke="#56B6F7"
                          strokeWidth="1.8"
                          className="cursor-move"
                          onPointerDown={(e) => startHandleDrag(e, d, 'pt1')}
                        />
                      </g>
                    );
                  }

                  // MEASURE Ruler Box (exact match to 00:50 in user's video)
                  const pctDiff =
                    ((d.points[1].p - d.points[0].p) / Math.max(1e-12, d.points[0].p)) * 100;
                  const barsCount = Math.max(1, Math.round(Math.abs(d.points[1].t - d.points[0].t) / stepMs));
                  const boxX = Math.min(x1, x2);
                  const boxY = Math.min(y1, y2);
                  const boxW = Math.max(4, Math.abs(x2 - x1));
                  const boxH = Math.max(4, Math.abs(y2 - y1));
                  const mColor = pctDiff >= 0 ? '#26A69A' : '#EF5350';
                  return (
                    <g key={d.id} data-testid="chart-drawing-item">
                      <rect
                        x={boxX}
                        y={boxY}
                        width={boxW}
                        height={boxH}
                        fill={mColor}
                        fillOpacity="0.16"
                        stroke={mColor}
                        strokeWidth="1"
                        className="cursor-move"
                        onPointerDown={(e) => startHandleDrag(e, d, 'move')}
                      />
                      <rect
                        x={boxX + boxW / 2 - 68}
                        y={boxY + boxH + 4}
                        width={136}
                        height={24}
                        rx="3"
                        fill={mColor}
                      />
                      <text
                        x={boxX + boxW / 2}
                        y={boxY + boxH + 14}
                        textAnchor="middle"
                        className="fill-white text-[8px] font-mono font-bold pointer-events-none"
                      >
                        {pctDiff >= 0 ? '+' : ''}
                        {formatChartPrice(d.points[1].p - d.points[0].p)} ({pctDiff >= 0 ? '+' : ''}
                        {pctDiff.toFixed(2)}%)
                      </text>
                      <text
                        x={boxX + boxW / 2}
                        y={boxY + boxH + 24}
                        textAnchor="middle"
                        className="fill-white/90 text-[7.5px] font-mono pointer-events-none"
                      >
                        {barsCount} bars, {formatDurationSpan(d.points[1].t - d.points[0].t)}
                      </text>
                    </g>
                  );
                })}

              {/* LIVE RUBBER-BAND PREVIEW WHILE DRAWING (Trendline, Ray, Fib, XABCD, Measure, Brush) */}
              {activeBrushStroke && activeBrushStroke.length >= 2 && (
                <polyline
                  fill="none"
                  stroke={defaultDrawColor}
                  strokeWidth={defaultLineWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={defaultOpacity}
                  points={activeBrushStroke
                    .map((pt) => {
                      const x = timeToX(pt.t);
                      return x !== null ? `${x},${priceToY(pt.p)}` : null;
                    })
                    .filter(Boolean)
                    .join(' ')}
                />
              )}

              {draftPoints.length > 0 && cursorTp && (() => {
                const previewPts = [...draftPoints, cursorTp];
                const coords = previewPts
                  .map((pt) => ({ x: timeToX(pt.t), y: priceToY(pt.p) }))
                  .filter((c): c is { x: number; y: number } => c.x !== null);
                if (coords.length < 2) return null;
                return (
                  <g className="pointer-events-none" opacity="0.8">
                    <polyline
                      fill="none"
                      stroke={defaultDrawColor}
                      strokeWidth={defaultLineWidth}
                      strokeDasharray="4 3"
                      points={coords.map((c) => `${c.x},${c.y}`).join(' ')}
                    />
                    {coords.map((c, idx) => (
                      <circle key={idx} cx={c.x} cy={c.y} r="3.5" fill="#56B6F7" stroke="#FFF" strokeWidth="1" />
                    ))}
                  </g>
                );
              })()}

              {/* Live Price Dotted Horizontal Reference */}
              {latestCandle && (
                <line
                  x1={padLeft}
                  y1={priceToY(latestCandle.close)}
                  x2={width - padRight}
                  y2={priceToY(latestCandle.close)}
                  stroke={latestCandle.close >= latestCandle.open ? '#26A69A' : '#EF5350'}
                  strokeWidth="1"
                  strokeDasharray="2 3"
                  opacity="0.85"
                />
              )}
            </g>

            {/* Right-Axis EMA Tag */}
            {showEma && latestEma50 && latestEma50 >= minPrice && latestEma50 <= maxPrice && (
              <g className="pointer-events-none">
                <rect
                  x={width - padRight + 1}
                  y={priceToY(latestEma50) - 7}
                  width={padRight - 3}
                  height={14}
                  rx="2"
                  fill="#2962FF"
                />
                <text
                  x={width - padRight + 5}
                  y={priceToY(latestEma50) + 3}
                  className="fill-white text-[8.5px] font-mono font-semibold"
                >
                  {formatRightAxisVal(latestEma50)}
                </text>
              </g>
            )}

            {/* Live Price Tag + Candle Countdown on Right Axis */}
            {latestCandle && (
              <g className="pointer-events-none">
                <rect
                  x={width - padRight + 1}
                  y={Math.max(2, Math.min(padTop + pricePaneH - 22, priceToY(latestCandle.close) - 10))}
                  width={padRight - 2}
                  height={24}
                  rx="2"
                  fill={latestCandle.close >= latestCandle.open ? '#26A69A' : '#EF5350'}
                />
                <text
                  x={width - padRight + 5}
                  y={Math.max(11, Math.min(padTop + pricePaneH - 12, priceToY(latestCandle.close)))}
                  className="fill-[#081018] text-[9px] font-mono font-bold"
                >
                  {formatRightAxisVal(latestCandle.close)}
                </text>
                <text
                  x={width - padRight + 5}
                  y={Math.max(21, Math.min(padTop + pricePaneH - 2, priceToY(latestCandle.close) + 10))}
                  className="fill-[#081018]/80 text-[7.5px] font-mono font-semibold"
                >
                  {formatCountdown(timeframe, nowClockMs)}
                </text>
              </g>
            )}

            {/* Interactive Crosshair with Price & Date Pills */}
            {activeCrosshair !== null && hoveredCandle && (
              <g
                className={`fincept-crosshair pointer-events-none ${
                  isHovering ? 'fincept-crosshair-visible' : ''
                }`}
              >
                <line
                  x1={localIndexToX(activeCrosshair.index)}
                  y1={padTop}
                  x2={localIndexToX(activeCrosshair.index)}
                  y2={height - padBottom}
                  stroke="#78879E"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <line
                  x1={padLeft}
                  y1={activeCrosshair.mouseY}
                  x2={width - padRight}
                  y2={activeCrosshair.mouseY}
                  stroke="#78879E"
                  strokeWidth="1"
                  strokeDasharray="3 3"
                />
                <rect
                  x={width - padRight + 1}
                  y={activeCrosshair.mouseY - 8}
                  width={padRight - 2}
                  height={16}
                  rx="2"
                  fill="#2A3447"
                />
                <text
                  x={width - padRight + 5}
                  y={activeCrosshair.mouseY + 3}
                  className="fill-[#F8FAFC] text-[9px] font-mono font-semibold"
                >
                  {formatRightAxisVal(yToPrice(activeCrosshair.mouseY))}
                </text>
                <rect
                  x={Math.max(padLeft, Math.min(width - padRight - 92, localIndexToX(activeCrosshair.index) - 46))}
                  y={height - padBottom + 3}
                  width={92}
                  height={18}
                  rx="2"
                  fill="#2A3447"
                />
                <text
                  x={Math.max(padLeft + 46, Math.min(width - padRight - 46, localIndexToX(activeCrosshair.index)))}
                  y={height - padBottom + 15}
                  textAnchor="middle"
                  className="fill-[#F8FAFC] text-[8.5px] font-mono font-semibold"
                >
                  {formatCrosshairTime(hoveredCandle.time, timeframe)}
                </text>
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* 4. TRADINGVIEW BOTTOM RANGE SELECTOR (1D..ALL) & SCALE MODE BAR (%, log, auto) */}
      <div className="flex flex-nowrap sm:flex-wrap items-center justify-between gap-2 px-2 py-1 bg-[#131823] border-t border-[#1E2736] text-[9.5px] font-mono overflow-x-auto no-scrollbar touch-scroll-x shrink-0">
        <div className="flex items-center gap-0.5 shrink-0">
          {RANGE_PRESETS.map((r) => (
            <button
              key={r.id}
              data-testid={`chart-range-${r.id}`}
              onClick={() => handleSelectRangePreset(r.id)}
              title={
                r.id === 'ALL'
                  ? `Full History dari awal listing (${listingYear}) sampai live sekarang`
                  : `Rentang historis ${r.label}`
              }
              className={`px-1.5 py-0.5 font-semibold transition-colors ${
                activeRange === r.id
                  ? 'bg-[#2962FF]/25 text-[#56B6F7] border border-[#56B6F7]/50'
                  : 'text-[#94A3B8] hover:text-white hover:bg-[#1B2333] border border-transparent'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[#64748B] hidden md:inline">{utcClock} UTC</span>
          <span className="text-[#263247] hidden md:inline">|</span>
          <button
            data-testid="chart-scale-pct"
            onClick={() => setScaleMode((m) => (m === 'PERCENT' ? 'LINEAR' : 'PERCENT'))}
            className={`px-1.5 py-0.5 font-semibold border ${
              scaleMode === 'PERCENT'
                ? 'bg-[#2962FF]/25 text-[#56B6F7] border-[#56B6F7]/60'
                : 'text-[#94A3B8] border-transparent hover:text-white hover:bg-[#1B2333]'
            }`}
            title="Percentage Price Scale (%)"
          >
            %
          </button>
          <button
            data-testid="chart-scale-log"
            onClick={() => setScaleMode((m) => (m === 'LOG' ? 'LINEAR' : 'LOG'))}
            className={`px-1.5 py-0.5 font-semibold border ${
              scaleMode === 'LOG'
                ? 'bg-[#2962FF]/25 text-[#56B6F7] border-[#56B6F7]/60'
                : 'text-[#94A3B8] border-transparent hover:text-white hover:bg-[#1B2333]'
            }`}
            title="Logarithmic Price Scale"
          >
            log
          </button>
          <button
            data-testid="chart-scale-auto"
            onClick={handleResetView}
            className={`px-1.5 py-0.5 font-semibold border ${
              !isManualYModified
                ? 'text-[#56B6F7] border-[#56B6F7]/40 bg-[#182234]'
                : 'text-[#94A3B8] border-transparent hover:text-white hover:bg-[#1B2333]'
            }`}
            title="Auto-Fit Price Scale"
          >
            auto
          </button>
        </div>
      </div>
    </div>
  );

  if (isExpandedFullscreen && typeof document !== 'undefined') {
    return (
      <>
        <div className="flex items-center justify-center h-full bg-[#0F141E] text-xs font-mono text-[#56B6F7]">
          TradingView Fullscreen Active (Press Esc to return)
        </div>
        {createPortal(
          <div className="fixed inset-0 z-[9998] bg-black/75 backdrop-blur-[2px]">
            {chartNode}
          </div>,
          document.body
        )}
      </>
    );
  }

  return chartNode;
};
