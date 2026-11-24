/**
 * Canonical Position PnL & Margin Mathematics (Notional-based `sizeUsd`).
 *
 * Contract:
 * - `sizeUsd` is the position NOTIONAL value in USD (matching `quantity = sizeUsd / entryPrice`).
 * - `initialMarginUsd = sizeUsd / leverage`.
 * - `pnlUsd = qty * (currentPrice - entryPrice)` for LONG (inverted for SHORT), NEVER multiplied by leverage again!
 * - `roePct = priceMoveRatio * 100 * leverage` (= `(pnlUsd / initialMarginUsd) * 100`).
 */
export function computePositionPnl({
  side,
  entryPrice,
  currentPrice,
  sizeUsd,
  leverage = 1,
  executedQty,
}) {
  const entry = Number(entryPrice);
  const current = Number(currentPrice);
  const notional = Number(sizeUsd);
  const lev = Math.max(1, Number.isFinite(Number(leverage)) ? Number(leverage) : 1);

  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(current) || current <= 0 || !Number.isFinite(notional) || notional <= 0) {
    return {
      priceMovePct: 0,
      roePct: 0,
      pnlUsd: 0,
      initialMarginUsd: 0,
      effectiveQty: 0,
    };
  }

  const priceMoveRatio =
    side === 'LONG' ? (current - entry) / entry : (entry - current) / entry;
  const qty =
    Number.isFinite(Number(executedQty)) && Number(executedQty) > 0
      ? Number(executedQty)
      : notional / entry;

  const rawPnlUsd =
    side === 'LONG' ? (current - entry) * qty : (entry - current) * qty;
  const effectiveNotional = qty * entry;
  const initialMarginUsd = effectiveNotional / lev;
  const roePct = initialMarginUsd > 0 ? (rawPnlUsd / initialMarginUsd) * 100 : 0;

  return {
    priceMovePct: Number((priceMoveRatio * 100).toFixed(4)),
    roePct: Number(roePct.toFixed(2)),
    pnlUsd: Number(rawPnlUsd.toFixed(2)),
    initialMarginUsd: Number(initialMarginUsd.toFixed(2)),
    effectiveQty: qty,
  };
}

/**
 * Returns the UTC trading-day key (`YYYY-MM-DD`) for a given timestamp/Date.
 */
export function getUtcTradingDayKey(dateInput = new Date()) {
  const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(d.getTime())) {
    return new Date().toISOString().slice(0, 10);
  }
  return d.toISOString().slice(0, 10);
}

/**
 * Computes daily realized PnL for the current UTC trading day,
 * cleanly excluding seeded demo fixtures (`cl-1`..`cl-4`) while including
 * runtime paper/real closes matching the active environment and day boundary.
 */
export function computeDailyRealizedPnlUsd({
  closedTrades = [],
  isRealEnv = false,
  tradingDayKey = getUtcTradingDayKey(),
}) {
  if (!Array.isArray(closedTrades) || closedTrades.length === 0) return 0;
  let sum = 0;
  for (const c of closedTrades) {
    if (!c || typeof c !== 'object') continue;
    const id = String(c.id || '');
    if (c.isSeededDemo || /^cl-[1-4]$/.test(id)) continue;
    if (isRealEnv ? !c.isRealMoney : Boolean(c.isRealMoney)) continue;
    if (c.closedDateKey !== tradingDayKey) continue;
    const pnl = Number(c.realizedPnlUsd);
    if (Number.isFinite(pnl)) sum += pnl;
  }
  return Number(sum.toFixed(2));
}

/**
 * Evaluates whether the Daily Drawdown Circuit Breaker should trip based on
 * net realized + unrealized PnL against the user's positive USD limit.
 */
export function evaluateDailyDrawdownCircuitBreaker({
  realizedPnlUsd = 0,
  unrealizedPnlUsd = 0,
  maxDailyDrawdownUsd = 150,
}) {
  const limit = Math.abs(Number(maxDailyDrawdownUsd) || 0);
  if (limit <= 0) {
    return { triggered: false, netPnlUsd: 0, limitUsd: 0 };
  }
  const netPnlUsd = Number(((Number(realizedPnlUsd) || 0) + (Number(unrealizedPnlUsd) || 0)).toFixed(2));
  return {
    triggered: netPnlUsd <= -limit,
    netPnlUsd,
    limitUsd: limit,
  };
}
