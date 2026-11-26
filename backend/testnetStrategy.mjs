const MINUTE = 60_000;

function ema(values, period) {
  const factor = 2 / (period + 1);
  return values.reduce((last, price) => last + factor * (price - last));
}

// Binance supplies each interval's closing time in column 6. Current candles never vote.
export function closedCandleSignal(rows, now) {
  if (!Array.isArray(rows)) return null;
  const candles = rows.filter((row) => Array.isArray(row) && Number(row[6]) < now)
    .map((row) => ({ start: Number(row[0]), end: Number(row[6]), close: Number(row[4]) }));
  if (candles.length < 26 || candles.some((candle, index) => !Number.isSafeInteger(candle.start) ||
      candle.start % MINUTE !== 0 || candle.end !== candle.start + MINUTE - 1 ||
      !Number.isFinite(candle.close) || candle.close <= 0 ||
      (index > 0 && candle.start - candles[index - 1].start !== MINUTE))) return null;
  const last = candles.at(-1);
  if (now - last.end >= MINUTE) return null;
  const values = candles.map((candle) => candle.close);
  const prior = values.slice(0, -1);
  const previous = ema(prior, 5) - ema(prior, 13);
  const current = ema(values, 5) - ema(values, 13);
  const side = previous <= 0 && current > 0 ? 'BUY' : previous >= 0 && current < 0 ? 'SELL' : null;
  return { side, closedAt: last.end };
}

/**
 * Multi-Pillar On-Chain, Real-Time L2 Orderbook & Live News Confluence Gate
 * Aligns Managed Testnet automation 1:1 with Fincept's 4-Agent Terminal philosophy:
 * - Blocks entries fighting extreme opposing L2 Orderbook OBI or wide spreads
 * - Blocks entries contradicting verified (>=90% credibility) Bloomberg/CoinDesk news + on-chain whale flow
 */
export function evaluateManagedEntryConfluence({ side, symbol, orderbook = null, snapshot = null }) {
  if (side !== 'BUY' && side !== 'SELL') {
    return { allowed: false, reason: 'Tidak ada arah sinyal entry.', summary: 'WAIT' };
  }

  const baseAsset = String(symbol || '').replace(/USDT$/i, '').replace(/^1000/, '').toUpperCase();
  const isLong = side === 'BUY';
  const notes = [];

  // Pillar 1: Real-Time L2 Orderbook Uncrossed & OBI Alignment
  if (orderbook && orderbook.ok) {
    const bestBid = Number(orderbook.bids?.[0]?.price || 0);
    const bestAsk = Number(orderbook.asks?.[0]?.price || 0);
    if (!(bestBid > 0 && bestAsk > bestBid)) {
      return {
        allowed: false,
        reason: 'L2 Orderbook tidak valid/terbalik (crossed) — entry ditahan.',
        summary: 'L2_INVALID',
      };
    }
    const spreadBps = Number(orderbook.spreadBps || 0);
    if (spreadBps > 25) {
      return {
        allowed: false,
        reason: `Spread L2 terlalu lebar (${spreadBps} bps > 25 bps) — entry ditahan.`,
        summary: `SPREAD_${spreadBps}BPS`,
      };
    }
    const obi = Number(orderbook.obiPercent || 0);
    notes.push(`L2 OBI ${obi >= 0 ? '+' : ''}${obi}% (${spreadBps}bps)`);
    if (isLong && obi <= -35) {
      return {
        allowed: false,
        reason: `Dinding Ask L2 berlawanan kuat (OBI ${obi}%) — BUY ${symbol} ditahan.`,
        summary: notes.join(' | '),
      };
    }
    if (!isLong && obi >= 35) {
      return {
        allowed: false,
        reason: `Dinding Bid L2 berlawanan kuat (OBI +${obi}%) — SELL ${symbol} ditahan.`,
        summary: notes.join(' | '),
      };
    }
  }

  // Pillar 2: Live Verified Macro/Crypto News Sentiment (>=90% Credibility)
  let newsNet = 0;
  if (snapshot && Array.isArray(snapshot.verifiedMacroNews) && snapshot.verifiedMacroNews.length > 0) {
    let bullW = 0;
    let bearW = 0;
    for (const item of snapshot.verifiedMacroNews) {
      if (!item || Number(item.credibilityScore || 0) < 90) continue;
      const assets = Array.isArray(item.affectedAssets)
        ? item.affectedAssets.map((a) => String(a).toUpperCase())
        : [];
      const isDirect = assets.includes(baseAsset);
      const isMacro = assets.includes('ALL') || assets.includes('BTC') || assets.includes('ETH');
      if (!isDirect && !isMacro) continue;
      const weight = (isDirect ? 2.5 : 0.7) * (Math.max(50, Number(item.impactScore || 80)) / 100);
      if (item.sentiment === 'BULLISH') bullW += weight;
      else if (item.sentiment === 'BEARISH') bearW += weight;
    }
    newsNet = bullW - bearW;
    const newsLabel = newsNet > 0.8 ? 'BULLISH' : newsNet < -0.8 ? 'BEARISH' : 'NEUTRAL';
    notes.push(`News: ${newsLabel}`);
  }

  // Pillar 3: On-Chain Whale Flow & HLP Vault Tape
  let whaleNetUsd = 0;
  if (snapshot && Array.isArray(snapshot.realOnChainTrades)) {
    for (const tx of snapshot.realOnChainTrades) {
      if (!tx || tx.isDirectionalWhaleTrade === false) continue;
      const txSym = String(tx.symbol || '').toUpperCase();
      const txToken = String(tx.tokenSymbol || '').toUpperCase();
      if (txToken === 'USDC' || txToken === 'USDT') continue;
      if (txToken === baseAsset || txSym.startsWith(`${baseAsset}-`) || txSym.startsWith(`${baseAsset} `)) {
        const usd = Number(tx.sizeUsd || 0);
        if (tx.direction === 'BULLISH') whaleNetUsd += usd;
        else if (tx.direction === 'BEARISH') whaleNetUsd -= usd;
      }
    }
    if (whaleNetUsd !== 0) {
      notes.push(`Whale: ${whaleNetUsd > 0 ? '+' : '-'}$${(Math.abs(whaleNetUsd) / 1e6).toFixed(2)}M`);
    }
  }

  // Veto only when BOTH live News AND On-Chain Whale Flow (or extreme direct News) strongly oppose the entry!
  if (isLong && (newsNet <= -3.5 || (newsNet <= -1.2 && whaleNetUsd < -100_000))) {
    return {
      allowed: false,
      reason: `Konfluensi Berita & On-Chain Whale BEARISH kuat melawan BUY ${symbol} (${notes.join(' | ')}).`,
      summary: notes.join(' | '),
    };
  }
  if (!isLong && (newsNet >= 3.5 || (newsNet >= 1.2 && whaleNetUsd > 100_000))) {
    return {
      allowed: false,
      reason: `Konfluensi Berita & On-Chain Whale BULLISH kuat melawan SELL ${symbol} (${notes.join(' | ')}).`,
      summary: notes.join(' | '),
    };
  }

  return {
    allowed: true,
    reason: null,
    summary: notes.length > 0 ? notes.join(' | ') : 'Closed-Candle EMA Confluence',
  };
}

export function protectionLevels(entryPrice, protection, isLong) {
  const sign = isLong ? 1 : -1;
  return {
    takeProfit: entryPrice * (1 + sign * protection.takeProfitPct / 100),
    stopLoss: entryPrice * (1 - sign * protection.stopLossPct / 100),
  };
}

export function protectionTrigger(price, levels, isLong) {
  if (isLong ? price <= levels.stopLoss : price >= levels.stopLoss) return 'STOP_LOSS';
  if (isLong ? price >= levels.takeProfit : price <= levels.takeProfit) return 'TAKE_PROFIT';
  return null;
}
