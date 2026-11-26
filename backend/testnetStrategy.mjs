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
