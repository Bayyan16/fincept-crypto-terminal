import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AgentPosition, CandlePoint, MarketPair, OrderbookState } from '../types/terminal';

export type ChartInterval = '1m' | '5m' | '15m' | '1h' | '4h' | '1d';

interface CandlestickOrderflowChartProps {
  pair: MarketPair;
  candles: CandlePoint[];
  timeframe: ChartInterval;
  onTimeframeChange: (tf: ChartInterval) => void;
  activePosition?: AgentPosition;
  orderbook?: OrderbookState;
  isLoadingCandles?: boolean;
  candleSource?: string;
}

export const CandlestickOrderflowChart: React.FC<CandlestickOrderflowChartProps> = ({
  pair,
  candles,
  timeframe,
  onTimeframeChange,
  activePosition,
  orderbook,
  isLoadingCandles = false,
  candleSource = 'HYPERLIQUID_L1',
}) => {
  const [showWhaleZones, setShowWhaleZones] = useState(true);
  const [showBotLevels, setShowBotLevels] = useState(true);
  const [showEma, setShowEma] = useState(true);

  // Horizontal Bar Zoom & Pan State
  // visibleCount: how many bars are visible horizontally (min 8 bars for deep zoom-in, max 140 bars)
  const [visibleCount, setVisibleCount] = useState<number>(55);
  // panOffset: how many bars back from the latest live bar (0 = pinned to latest bar)
  const [panOffset, setPanOffset] = useState<number>(0);

  // Vertical Price Pan & Vertical Price Scale Zoom State (Allows dragging up/down on chart & price mark!)
  // pricePanRatio: vertical shift as a multiple of the natural price span (-3.0 to +3.0)
  const [pricePanRatio, setPricePanRatio] = useState<number>(0);
  // priceScaleFactor: vertical price range multiplier (< 1 = zoomed in vertically, > 1 = compressed vertically)
  const [priceScaleFactor, setPriceScaleFactor] = useState<number>(1);

  // Crosshair & 2D Drag State
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [mouseY, setMouseY] = useState<number | null>(null);
  const [dragMode, setDragMode] = useState<'NONE' | 'CHART_2D_PAN' | 'PRICE_AXIS_SCALE'>('NONE');

  const dragStartRef = useRef<{
    clientX: number;
    clientY: number;
    startPanOffset: number;
    startPricePanRatio: number;
    startPriceScaleFactor: number;
  }>({
    clientX: 0,
    clientY: 0,
    startPanOffset: 0,
    startPricePanRatio: 0,
    startPriceScaleFactor: 1,
  });

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number }>({
    width: 720,
    height: 380,
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(360, Math.round(entry.contentRect.width));
        const h = Math.max(220, Math.round(entry.contentRect.height));
        setDims({ width: w, height: h });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Reset pan & vertical offset when symbol or timeframe changes
  useEffect(() => {
    setPanOffset(0);
    setPricePanRatio(0);
    setPriceScaleFactor(1);
  }, [pair.symbol, timeframe]);

  const totalCandles = candles.length;
  const maxBars = Math.max(16, totalCandles || 140);
  const clampedVisibleCount = Math.max(8, Math.min(maxBars, visibleCount));
  const maxPanOffset = Math.max(0, totalCandles - clampedVisibleCount);
  const clampedPanOffset = Math.max(0, Math.min(maxPanOffset, panOffset));

  const startIdx = Math.max(0, totalCandles - clampedVisibleCount - clampedPanOffset);
  const endIdx = Math.min(totalCandles, startIdx + clampedVisibleCount);
  const visibleCandles = useMemo(
    () => candles.slice(startIdx, endIdx),
    [candles, startIdx, endIdx]
  );

  // Compute EMA-20 across all candles and slice to visible window
  const visibleEma = useMemo(() => {
    if (!candles.length) return [];
    const k = 2 / (20 + 1);
    const emaAll: number[] = [];
    let prev = candles[0].close;
    for (let i = 0; i < candles.length; i++) {
      const val = i === 0 ? candles[i].close : candles[i].close * k + prev * (1 - k);
      emaAll.push(val);
      prev = val;
    }
    return emaAll.slice(startIdx, endIdx);
  }, [candles, startIdx, endIdx]);

  // Horizontal Bar Zoom Handler (Zooms centered around hovered candle if available)
  const handleBarZoom = useCallback(
    (deltaBars: number, anchorRatio = 0.85) => {
      setVisibleCount((prevCount) => {
        const curClamped = Math.max(8, Math.min(maxBars, prevCount));
        const nextCount = Math.max(8, Math.min(maxBars, Math.round(curClamped + deltaBars)));
        const countDiff = curClamped - nextCount;
        if (countDiff !== 0) {
          setPanOffset((prevPan) => {
            const newMaxPan = Math.max(0, totalCandles - nextCount);
            const adjustedPan = Math.round(prevPan + countDiff * (1 - anchorRatio));
            return Math.max(0, Math.min(newMaxPan, adjustedPan));
          });
        }
        return nextCount;
      });
    },
    [maxBars, totalCandles]
  );

  // Vertical Price Scale Zoom Handler
  const handleVerticalZoom = useCallback((factorDelta: number) => {
    setPriceScaleFactor((prev) => Math.max(0.25, Math.min(4.0, Number((prev * factorDelta).toFixed(3)))));
  }, []);

  // Native Non-Passive Wheel Listener on Chart Container so Browser Never Blocks Zoom In/Out!
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const relX = e.clientX - rect.left;
      const isOverRightPriceAxis = relX >= rect.width - 78;

      // If scrolling on the Right Price Axis OR holding Shift/Alt -> Zoom Vertical Price Scale
      if (isOverRightPriceAxis || e.shiftKey || e.altKey) {
        const factor = e.deltaY < 0 ? 0.88 : 1.14;
        handleVerticalZoom(factor);
        return;
      }

      // Otherwise -> Zoom Horizontal Bar Chart (Zoom In / Zoom Out) around cursor X position
      const plotWidthPx = Math.max(100, rect.width - 86);
      const anchorRatio = Math.max(0.1, Math.min(1.0, (relX - 10) / plotWidthPx));
      const step = Math.max(2, Math.round(clampedVisibleCount * 0.14));
      if (e.deltaY < 0) {
        // Scroll Up -> Zoom IN (Fewer, larger bars)
        handleBarZoom(-step, anchorRatio);
      } else if (e.deltaY > 0) {
        // Scroll Down -> Zoom OUT (More bars)
        handleBarZoom(step, anchorRatio);
      }
    };

    el.addEventListener('wheel', onNativeWheel, { passive: false });
    return () => el.removeEventListener('wheel', onNativeWheel);
  }, [clampedVisibleCount, handleBarZoom, handleVerticalZoom]);

  // 2D Drag-to-Pan (Left/Right + Up/Down) & Right Price Axis Vertical Scale Drag
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * dims.width;
    const isRightAxis = relX >= dims.width - 76;

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

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * dims.width;
    const relY = ((e.clientY - rect.top) / rect.height) * dims.height;

    const padLeft = 10;
    const padRight = 76;
    const padTop = 14;
    const padBottom = 46;
    const plotW = Math.max(100, dims.width - padLeft - padRight);
    const plotH = Math.max(100, dims.height - padTop - padBottom);

    if (dragMode === 'PRICE_AXIS_SCALE') {
      // Dragging Up/Down on the Right Price Axis stretches/compresses vertical price scale
      const dyPixels = e.clientY - dragStartRef.current.clientY;
      const scaleMultiplier = Math.exp(dyPixels * 0.006);
      const nextScale = Math.max(
        0.25,
        Math.min(4.0, dragStartRef.current.startPriceScaleFactor * scaleMultiplier)
      );
      setPriceScaleFactor(Number(nextScale.toFixed(3)));
      return;
    }

    if (dragMode === 'CHART_2D_PAN') {
      // 1) Horizontal Drag -> Pan Left/Right across bars
      const dxPixels = e.clientX - dragStartRef.current.clientX;
      const pixelsPerCandle = (rect.width * 0.86) / Math.max(1, clampedVisibleCount);
      const candlesDelta = Math.round(dxPixels / Math.max(1.5, pixelsPerCandle));
      setPanOffset(
        Math.max(0, Math.min(maxPanOffset, dragStartRef.current.startPanOffset + candlesDelta))
      );

      // 2) Vertical Drag -> Pan Up/Down on Price Mark!
      const dyPixels = e.clientY - dragStartRef.current.clientY;
      const ratioDelta = (dyPixels / Math.max(120, rect.height - 60)) * priceScaleFactor;
      const nextPricePan = Math.max(
        -3.5,
        Math.min(3.5, dragStartRef.current.startPricePanRatio + ratioDelta)
      );
      setPricePanRatio(Number(nextPricePan.toFixed(4)));
      return;
    }

    if (relX >= padLeft && relX <= padLeft + plotW && visibleCandles.length > 0) {
      const idx = Math.floor(((relX - padLeft) / plotW) * visibleCandles.length);
      setHoverIndex(Math.max(0, Math.min(visibleCandles.length - 1, idx)));
      setMouseY(Math.max(padTop, Math.min(padTop + plotH, relY)));
    } else {
      setHoverIndex(null);
      setMouseY(null);
    }
  };

  const handleMouseUpOrLeave = () => {
    setDragMode('NONE');
  };

  const handleResetView = () => {
    setVisibleCount(55);
    setPanOffset(0);
    setPricePanRatio(0);
    setPriceScaleFactor(1);
  };

  const formatPx = (val: number) => {
    if (val >= 1000) return val.toFixed(2);
    if (val >= 10) return val.toFixed(3);
    if (val >= 1) return val.toFixed(4);
    return val.toFixed(5);
  };

  const width = dims.width;
  const height = dims.height;
  const padLeft = 10;
  const padRight = 76;
  const padTop = 14;
  const padBottom = 46;

  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  // Dynamic 2D Price Scaling (Supports Vertical Dragging & Vertical Price Axis Zoom!)
  const candleHighs = visibleCandles.map((c) => c.high);
  const candleLows = visibleCandles.map((c) => c.low);
  const rawMin = candleLows.length ? Math.min(...candleLows) : pair.price * 0.99;
  const rawMax = candleHighs.length ? Math.max(...candleHighs) : pair.price * 1.01;
  const baseSpan = Math.max(pair.price * 0.0005, (rawMax - rawMin) * 1.16);
  const baseCenter = (rawMax + rawMin) / 2;

  // Apply user's vertical drag offset (pricePanRatio) and vertical zoom factor (priceScaleFactor)
  const effectiveSpan = baseSpan * priceScaleFactor;
  const effectiveCenter = baseCenter + pricePanRatio * baseSpan;

  const minPrice = effectiveCenter - effectiveSpan / 2;
  const maxPrice = effectiveCenter + effectiveSpan / 2;
  const priceRange = Math.max(0.00001, maxPrice - minPrice);

  const maxVol = Math.max(...visibleCandles.map((c) => c.volume), 1);

  const priceToY = (p: number) => padTop + plotH - ((p - minPrice) / priceRange) * plotH;
  const yToPrice = (y: number) => minPrice + ((padTop + plotH - y) / plotH) * priceRange;

  const stepX = plotW / Math.max(1, visibleCandles.length);
  const candleWidth = Math.max(2.5, Math.min(22, stepX * 0.74));

  const gridLevels = 6;
  const yTicks = Array.from({ length: gridLevels + 1 }, (_, i) => {
    const val = minPrice + (priceRange * i) / gridLevels;
    return { val, y: priceToY(val) };
  });

  const inspectedCandle =
    hoverIndex !== null && visibleCandles[hoverIndex]
      ? visibleCandles[hoverIndex]
      : visibleCandles[visibleCandles.length - 1];

  const inspectedChangePct = inspectedCandle
    ? ((inspectedCandle.close - inspectedCandle.open) / Math.max(0.0001, inspectedCandle.open)) *
      100
    : 0;

  const currentY = Math.max(padTop, Math.min(padTop + plotH, priceToY(pair.price)));
  const isManualYModified = Math.abs(pricePanRatio) > 0.01 || Math.abs(priceScaleFactor - 1) > 0.02;

  // Identify real whale bid/ask walls from live L2 orderbook
  const whaleBidWall = orderbook?.bids.find((b) => b.isWhaleWall) || orderbook?.bids[2];
  const whaleAskWall = orderbook?.asks.find((a) => a.isWhaleWall) || orderbook?.asks[2];

  // Build EMA polyline points clipped to plot area
  const emaPoints = visibleEma
    .map((val, idx) => {
      const x = padLeft + idx * stepX + stepX / 2;
      const y = Math.max(padTop, Math.min(padTop + plotH, priceToY(val)));
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="flex flex-col bg-[#06080C] border border-[#1E2736] h-full select-none">
      {/* 1. Top Toolbar: Timeframes + Bar Zoom Slider + 2D Pan Controls + Overlays */}
      <div className="flex flex-wrap items-center justify-between px-2 py-1 bg-[#090D14] border-b border-[#1E2736] gap-1.5">
        {/* Timeframe Selector */}
        <div className="flex items-center gap-0.5 text-[10px]">
          <span className="text-[#94A3B8] font-bold mr-1">TF</span>
          {(
            [
              { id: '1m', label: '1M' },
              { id: '5m', label: '5M' },
              { id: '15m', label: '15M' },
              { id: '1h', label: '1H' },
              { id: '4h', label: '4H' },
              { id: '1d', label: '1D' },
            ] as const
          ).map((tf) => (
            <button
              key={tf.id}
              onClick={() => onTimeframeChange(tf.id)}
              className={`px-1.5 py-0.5 font-extrabold transition-colors ${
                timeframe === tf.id
                  ? 'bg-[#FF9F1C] text-black'
                  : 'text-[#CBD5E1] hover:bg-[#151D2B]'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        {/* Interactive Bar Zoom Slider + 2D Pan (Left/Right/Up/Down) & Vertical Price Scale Controls */}
        <div className="flex items-center gap-1 text-[10px]">
          <button
            onClick={() => handleBarZoom(-10, 0.85)}
            className="px-1.5 py-0.5 bg-[#0E1420] hover:bg-[#FF9F1C] hover:text-black text-[#00E5FF] border border-[#243044] font-extrabold"
            title="Zoom In Bar Chart (Perbesar Bar Candle)"
          >
            🔍+
          </button>

          {/* Direct Bar Zoom Slider (8 bars to 140 bars) */}
          <div className="hidden xl:flex items-center gap-1 px-1.5 py-0.5 bg-[#05080E] border border-[#1E2B40]">
            <span className="text-[9px] text-[#94A3B8]">BARS:{clampedVisibleCount}</span>
            <input
              type="range"
              min={8}
              max={maxBars}
              value={clampedVisibleCount}
              onChange={(e) => setVisibleCount(Number(e.target.value))}
              className="w-16 accent-[#FF9F1C] cursor-pointer h-1"
              title="Geser untuk Zoom In / Zoom Out jumlah Bar Candle"
            />
          </div>

          <button
            onClick={() => handleBarZoom(10, 0.85)}
            className="px-1.5 py-0.5 bg-[#0E1420] hover:bg-[#FF9F1C] hover:text-black text-[#00E5FF] border border-[#243044] font-extrabold"
            title="Zoom Out Bar Chart (Tampilkan Lebih Banyak Bar)"
          >
            🔍-
          </button>

          {/* 4-Way Pan Buttons (Left, Right, Up, Down) */}
          <button
            onClick={() => setPanOffset((p) => Math.min(maxPanOffset, p + 10))}
            className="px-1.5 py-0.5 bg-[#0E1420] hover:bg-[#00E5FF] hover:text-black text-[#CBD5E1] border border-[#243044] font-bold"
            title="Geser ke Kiri (Riwayat Candle)"
          >
            ◄
          </button>
          <button
            onClick={() => setPanOffset((p) => Math.max(0, p - 10))}
            className="px-1.5 py-0.5 bg-[#0E1420] hover:bg-[#00E5FF] hover:text-black text-[#CBD5E1] border border-[#243044] font-bold"
            title="Geser ke Kanan (Candle Terbaru)"
          >
            ►
          </button>
          <button
            onClick={() => setPricePanRatio((r) => Number(Math.min(3.5, r + 0.18).toFixed(3)))}
            className="px-1.5 py-0.5 bg-[#0E1420] hover:bg-[#00E676] hover:text-black text-[#00E676] border border-[#243044] font-bold"
            title="Geser Mark Harga ke Atas (Drag Atas)"
          >
            ▲
          </button>
          <button
            onClick={() => setPricePanRatio((r) => Number(Math.max(-3.5, r - 0.18).toFixed(3)))}
            className="px-1.5 py-0.5 bg-[#0E1420] hover:bg-[#FF1744] hover:text-white text-[#FF1744] border border-[#243044] font-bold"
            title="Geser Mark Harga ke Bawah (Drag Bawah)"
          >
            ▼
          </button>
          <button
            onClick={() => handleVerticalZoom(0.82)}
            className="px-1.5 py-0.5 bg-[#0E1420] hover:bg-[#FF9F1C] hover:text-black text-[#FF9F1C] border border-[#243044] font-bold"
            title="Perbesar Skala Vertikal Harga (Y-Zoom In)"
          >
            ↕+
          </button>
          <button
            onClick={() => handleVerticalZoom(1.22)}
            className="px-1.5 py-0.5 bg-[#0E1420] hover:bg-[#FF9F1C] hover:text-black text-[#FF9F1C] border border-[#243044] font-bold"
            title="Perkecil Skala Vertikal Harga (Y-Zoom Out)"
          >
            ↕-
          </button>

          <button
            onClick={handleResetView}
            className={`px-1.5 py-0.5 font-extrabold border ${
              isManualYModified || clampedPanOffset > 0
                ? 'bg-[#FF9F1C] text-black border-[#FF9F1C]'
                : 'bg-[#0E1420] text-[#00E5FF] border-[#243044] hover:bg-[#00E676] hover:text-black'
            }`}
            title="Reset Zoom & Auto-Fit Skala Harga (Atau Double-Click Chart)"
          >
            AUTO-FIT
          </button>
        </div>

        {/* Overlays */}
        <div className="flex items-center gap-1 text-[9.5px]">
          <button
            onClick={() => setShowEma(!showEma)}
            className={`px-1.5 py-0.5 border ${
              showEma
                ? 'border-[#FF9F1C] text-[#FF9F1C] bg-[#FF9F1C]/10 font-bold'
                : 'border-[#1E2736] text-[#64748B]'
            }`}
          >
            EMA20
          </button>
          <button
            onClick={() => setShowWhaleZones(!showWhaleZones)}
            className={`px-1.5 py-0.5 border ${
              showWhaleZones
                ? 'border-[#00E5FF] text-[#00E5FF] bg-[#00E5FF]/10 font-bold'
                : 'border-[#1E2736] text-[#64748B]'
            }`}
          >
            WHALE WALLS
          </button>
          <button
            onClick={() => setShowBotLevels(!showBotLevels)}
            className={`px-1.5 py-0.5 border ${
              showBotLevels
                ? 'border-[#00E676] text-[#00E676] bg-[#00E676]/10 font-bold'
                : 'border-[#1E2736] text-[#64748B]'
            }`}
          >
            BOT SL/BE
          </button>
        </div>
      </div>

      {/* 2. Live OHLCV Telemetry Header */}
      <div className="flex flex-wrap items-center justify-between px-2.5 py-1 bg-[#070A10] border-b border-[#151D2A] text-[10px] font-mono">
        {inspectedCandle ? (
          <div className="flex items-center gap-2">
            <span className="text-[#FF9F1C] font-extrabold">
              {pair.symbol} · {timeframe.toUpperCase()} · {candleSource}
            </span>
            <span className="text-[#94A3B8]">
              O <strong className="text-white">{formatPx(inspectedCandle.open)}</strong>
            </span>
            <span className="text-[#94A3B8]">
              H <strong className="text-[#00E676]">{formatPx(inspectedCandle.high)}</strong>
            </span>
            <span className="text-[#94A3B8]">
              L <strong className="text-[#FF1744]">{formatPx(inspectedCandle.low)}</strong>
            </span>
            <span className="text-[#94A3B8]">
              C <strong className="text-white">{formatPx(inspectedCandle.close)}</strong>
            </span>
            <span
              className={`font-bold ${
                inspectedChangePct >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'
              }`}
            >
              ({inspectedChangePct >= 0 ? '+' : ''}
              {inspectedChangePct.toFixed(2)}%)
            </span>
            <span className="text-[#94A3B8] hidden sm:inline">
              VOL:{' '}
              <strong className="text-[#00E5FF]">
                ${(inspectedCandle.volume / 1_000_000).toFixed(2)}M
              </strong>
            </span>
          </div>
        ) : (
          <span className="text-[#94A3B8]">Loading Real Market OHLCV...</span>
        )}
        <div className="text-[9.5px] text-[#00E5FF]">
          Wheel: Zoom ({clampedVisibleCount} bars) | Drag Chart: Geser Kiri/Kanan/Atas/Bawah | Drag Sumbu Kanan: Skala Harga
        </div>
      </div>

      {/* 3. Main Interactive Chart SVG (Supports 2D Free Panning + Price Axis Dragging + Non-Passive Wheel Zoom) */}
      <div
        ref={containerRef}
        className="relative flex-1 bg-[#05070B] min-h-[245px] overflow-hidden"
        style={{ touchAction: 'none' }}
      >
        {isLoadingCandles && (
          <div className="absolute top-2 left-3 z-20 px-2 py-0.5 bg-[#0D1524] border border-[#00E5FF] text-[#00E5FF] text-[10px] font-bold">
            SYNCING LIVE {timeframe.toUpperCase()} CANDLES...
          </div>
        )}

        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className={`w-full h-full ${
            dragMode === 'PRICE_AXIS_SCALE'
              ? 'cursor-ns-resize'
              : dragMode === 'CHART_2D_PAN'
                ? 'cursor-grabbing'
                : 'cursor-grab'
          }`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUpOrLeave}
          onMouseLeave={() => {
            handleMouseUpOrLeave();
            setHoverIndex(null);
            setMouseY(null);
          }}
          onDoubleClick={handleResetView}
        >
          <defs>
            <clipPath id="fincept-plot-clip">
              <rect x={padLeft} y={padTop} width={plotW} height={plotH} />
            </clipPath>
          </defs>

          {/* Interactive Right Y-Axis Price Scale Zone (Drag Up/Down to Stretch/Compress Price Scale!) */}
          <rect
            x={width - padRight}
            y={padTop}
            width={padRight}
            height={plotH}
            fill="#080C14"
            className="cursor-ns-resize"
          />
          <line
            x1={width - padRight}
            y1={padTop}
            x2={width - padRight}
            y2={height - padBottom}
            stroke="#1E2736"
            strokeWidth="1"
          />
          {yTicks.map((t, idx) => (
            <g key={idx}>
              <line
                x1={padLeft}
                y1={t.y}
                x2={width - padRight}
                y2={t.y}
                stroke="#101622"
                strokeWidth="1"
              />
              <text
                x={width - padRight + 6}
                y={t.y + 3}
                className="fill-[#94A3B8] text-[9.5px] font-mono pointer-events-none"
              >
                {formatPx(t.val)}
              </text>
            </g>
          ))}

          {/* Clipped Plot Area for Candlesticks, EMA, Whale Walls, & Bot Levels */}
          <g clipPath="url(#fincept-plot-clip)">
            {/* Live Orderbook Whale Bid/Ask Wall Lines */}
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
                    stroke="#00E676"
                    strokeOpacity="0.45"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                  />
                  <text
                    x={padLeft + 6}
                    y={priceToY(whaleBidWall.price) - 3}
                    className="fill-[#00E676] text-[8px] font-bold opacity-80"
                  >
                    BID WALL ${(whaleBidWall.totalUsd / 1000).toFixed(0)}K @{' '}
                    {formatPx(whaleBidWall.price)}
                  </text>
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
                    stroke="#FF1744"
                    strokeOpacity="0.45"
                    strokeWidth="1"
                    strokeDasharray="2 3"
                  />
                  <text
                    x={padLeft + 6}
                    y={priceToY(whaleAskWall.price) - 3}
                    className="fill-[#FF1744] text-[8px] font-bold opacity-80"
                  >
                    ASK WALL ${(whaleAskWall.totalUsd / 1000).toFixed(0)}K @{' '}
                    {formatPx(whaleAskWall.price)}
                  </text>
                </g>
              )}

            {/* Active Bot Position Entry, Stop Guard & Take Profit Lines */}
            {showBotLevels &&
              activePosition &&
              activePosition.entryPrice >= minPrice &&
              activePosition.entryPrice <= maxPrice && (
                <line
                  x1={padLeft}
                  y1={priceToY(activePosition.entryPrice)}
                  x2={width - padRight}
                  y2={priceToY(activePosition.entryPrice)}
                  stroke="#00E5FF"
                  strokeWidth="1.2"
                  strokeDasharray="4 2"
                />
              )}

            {showBotLevels &&
              activePosition &&
              activePosition.stopLossPrice >= minPrice &&
              activePosition.stopLossPrice <= maxPrice && (
                <g>
                  <line
                    x1={padLeft}
                    y1={priceToY(activePosition.stopLossPrice)}
                    x2={width - padRight}
                    y2={priceToY(activePosition.stopLossPrice)}
                    stroke="#00E676"
                    strokeWidth="1.2"
                    strokeDasharray="2 2"
                  />
                  <rect
                    x={padLeft + 6}
                    y={priceToY(activePosition.stopLossPrice) - 12}
                    width={168}
                    height={11}
                    fill="#051F14"
                    fillOpacity="0.92"
                  />
                  <text
                    x={padLeft + 9}
                    y={priceToY(activePosition.stopLossPrice) - 4}
                    className="fill-[#00E676] text-[8px] font-bold"
                  >
                    BE+FEE GUARD @ ${formatPx(activePosition.stopLossPrice)}
                  </text>
                </g>
              )}

            {/* EMA-20 Line */}
            {showEma && emaPoints && (
              <polyline
                fill="none"
                stroke="#FF9F1C"
                strokeWidth="1.3"
                strokeOpacity="0.85"
                points={emaPoints}
              />
            )}

            {/* Candlesticks */}
            {visibleCandles.map((c, idx) => {
              const x = padLeft + idx * stepX + stepX / 2;
              const isBull = c.close >= c.open;
              const color = isBull ? '#00E676' : '#FF1744';

              const highY = priceToY(c.high);
              const lowY = priceToY(c.low);
              const openY = priceToY(c.open);
              const closeY = priceToY(c.close);

              const bodyTop = Math.min(openY, closeY);
              const bodyH = Math.max(1.5, Math.abs(closeY - openY));

              return (
                <g key={c.time}>
                  <line
                    x1={x}
                    y1={highY}
                    x2={x}
                    y2={lowY}
                    stroke={color}
                    strokeWidth="1.15"
                  />
                  <rect
                    x={x - candleWidth / 2}
                    y={bodyTop}
                    width={candleWidth}
                    height={bodyH}
                    fill={color}
                  />
                </g>
              );
            })}

            {/* Live Mid-Price Horizontal Line */}
            <line
              x1={padLeft}
              y1={currentY}
              x2={width - padRight}
              y2={currentY}
              stroke="#FF9F1C"
              strokeWidth="1.1"
              strokeDasharray="3 3"
            />
          </g>

          {/* Bottom Volume Histogram & X-Axis Time Labels */}
          {visibleCandles.map((c, idx) => {
            const x = padLeft + idx * stepX + stepX / 2;
            const isBull = c.close >= c.open;
            const color = isBull ? '#00E676' : '#FF1744';
            const volH = (c.volume / maxVol) * 28;
            const volY = height - 18 - volH;
            const labelStride = Math.max(3, Math.round(visibleCandles.length / 6));

            return (
              <g key={`vol-${c.time}`}>
                <rect
                  x={x - candleWidth / 2}
                  y={volY}
                  width={candleWidth}
                  height={volH}
                  fill={color}
                  fillOpacity="0.34"
                />
                {idx % labelStride === 0 && (
                  <text
                    x={x}
                    y={height - 4}
                    textAnchor="middle"
                    className="fill-[#64748B] text-[9px]"
                  >
                    {c.label}
                  </text>
                )}
              </g>
            );
          })}

          {/* Right Y-Axis Tag for Active Position Entry */}
          {showBotLevels &&
            activePosition &&
            activePosition.entryPrice >= minPrice &&
            activePosition.entryPrice <= maxPrice && (
              <g>
                <rect
                  x={width - padRight + 1}
                  y={priceToY(activePosition.entryPrice) - 7}
                  width={padRight - 2}
                  height={14}
                  fill="#052233"
                  stroke="#00E5FF"
                  strokeWidth="0.8"
                />
                <text
                  x={width - padRight + 4}
                  y={priceToY(activePosition.entryPrice) + 3}
                  className="fill-[#00E5FF] text-[8.5px] font-bold"
                >
                  E {formatPx(activePosition.entryPrice)}
                </text>
              </g>
            )}

          {/* Right Y-Axis Tag for Live Mark Price (Draggable Vertically!) */}
          <g className="cursor-ns-resize">
            <rect
              x={width - padRight + 1}
              y={currentY - 8}
              width={padRight - 2}
              height={16}
              fill="#FF9F1C"
            />
            <text
              x={width - padRight + 5}
              y={currentY + 3}
              className="fill-black text-[9.5px] font-extrabold"
            >
              {formatPx(pair.price)}
            </text>
          </g>

          {/* Interactive Crosshair (Vertical + Horizontal + Axis Badges) */}
          {hoverIndex !== null && visibleCandles[hoverIndex] && (
            <g className="pointer-events-none">
              <line
                x1={padLeft + hoverIndex * stepX + stepX / 2}
                y1={padTop}
                x2={padLeft + hoverIndex * stepX + stepX / 2}
                y2={height - 18}
                stroke="#94A3B8"
                strokeWidth="0.8"
                strokeDasharray="2 2"
              />
              {mouseY !== null && mouseY >= padTop && mouseY <= padTop + plotH && (
                <>
                  <line
                    x1={padLeft}
                    y1={mouseY}
                    x2={width - padRight}
                    y2={mouseY}
                    stroke="#94A3B8"
                    strokeWidth="0.8"
                    strokeDasharray="2 2"
                  />
                  <rect
                    x={width - padRight + 1}
                    y={mouseY - 7}
                    width={padRight - 2}
                    height={14}
                    fill="#1E293B"
                    stroke="#00E5FF"
                    strokeWidth="0.8"
                  />
                  <text
                    x={width - padRight + 5}
                    y={mouseY + 3}
                    className="fill-[#00E5FF] text-[9px] font-bold"
                  >
                    {formatPx(yToPrice(mouseY))}
                  </text>
                </>
              )}
            </g>
          )}
        </svg>
      </div>
    </div>
  );
};
