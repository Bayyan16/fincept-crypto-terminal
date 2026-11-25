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
export function getUtcTradingDayKey(dateInput?: Date | number | string): string;
export function computeDailyRealizedPnlUsd(params: {
  closedTrades: Array<{
    id: string;
    isRealMoney?: boolean;
    isSeededDemo?: boolean;
    closedDateKey?: string;
    realizedPnlUsd: number;
  }>;
  isRealEnv: boolean;
  tradingDayKey?: string;
}): number;
export function evaluateDailyDrawdownCircuitBreaker(params: {
  realizedPnlUsd: number;
  unrealizedPnlUsd: number;
  maxDailyDrawdownUsd: number;
}): {
  triggered: boolean;
  netPnlUsd: number;
  limitUsd: number;
};
export function computeClosedTradeSettlement(params: {
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  exitPrice: number;
  sizeUsd: number;
  leverage?: number;
  executedQty?: number;
  isRealMoney?: boolean;
  exchangeOrderId?: string;
}): {
  exitPrice: number;
  realizedPnlPct: number;
  realizedPnlUsd: number;
  settlementTxHash: string | undefined;
  allowLocalBalanceMutation: boolean;
};
export function computeSafeBreakevenParams(params: {
  side: 'LONG' | 'SHORT';
  entryPrice: number;
  currentPrice: number;
  leverage?: number;
  configuredTriggerPct?: number;
  lockOffsetPct?: number;
  alreadyLocked?: boolean;
}): {
  shouldLock: boolean;
  canPlaceExchangeStop: boolean;
  beStopPrice: number;
  effectiveTriggerRoePct: number;
};
