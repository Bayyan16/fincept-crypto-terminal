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
