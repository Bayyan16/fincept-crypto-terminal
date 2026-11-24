export function computePositionPnl(params: {
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  sizeUsd: number;
  leverage?: number;
  executedQty?: number;
}): {
  priceMovePct: number;
  roePct: number;
  pnlUsd: number;
  initialMarginUsd: number;
  effectiveQty: number;
};
