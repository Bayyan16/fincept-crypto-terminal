import type {
  ExchangeId,
  ExecutionEnvironment,
  MarketPair,
  MarketType,
  WalletConnectionState,
} from '../src/types/terminal';

export const EXCHANGE_PRIORITY_ORDER: readonly ExchangeId[];

export interface BalanceTieredPositionPolicy {
  tier: 'MICRO_UNDER_10' | 'STARTER_10_TO_49' | 'GROWTH_50_TO_99' | 'SCALE_100_PLUS';
  tierLabel: string;
  maxPositions: number;
  maxLeverage: number;
  perSlotMarginFraction: number;
  recommendedTpPct: number;
  recommendedSlPct: number;
  recommendedBePct: number;
  nextTierUsd: number | null;
}

export function computeBalanceTieredPositionPolicy(equityUsd: number): BalanceTieredPositionPolicy;

export function estimateVenueMinNotionalUsd(exchange: ExchangeId, symbol?: string): number;

export function hasHyperliquidAgentPrivateKey(wallet: WalletConnectionState | undefined): boolean;

export function hasRealWalletCredentials(wallet: WalletConnectionState | undefined): boolean;

export function isWalletReadyForRealExecution(
  wallet: WalletConnectionState | undefined,
  useTestnet?: boolean
): { ok: boolean; reason: string };

export function resolveReadyRealWalletForExchange(
  exchange: ExchangeId,
  wallets: WalletConnectionState[],
  useTestnet?: boolean,
  options?: { requireAutonomousKey?: boolean }
): WalletConnectionState | null;

export function getWalletMarketCapabilities(wallet: WalletConnectionState | undefined): {
  supportsFutures: boolean;
  supportsSpot: boolean;
  availableFuturesUsd: number;
  availableSpotUsd: number;
};

export function resolveExecutableRealVenue(params: {
  market: MarketPair;
  side?: 'LONG' | 'SHORT';
  wallets: WalletConnectionState[];
  useTestnet?: boolean;
  preferredMarketType?: 'PERP' | 'SPOT' | null;
  preferredExchange?: ExchangeId | null;
  isAutonomous?: boolean;
}):
  | {
      ok: true;
      exchange: ExchangeId;
      wallet: WalletConnectionState;
      marketType: 'PERP' | 'SPOT';
      venueMode: 'FUTURES' | 'SPOT';
      availableUsd: number;
    }
  | {
      ok: false;
      error: string;
    };

export function computeSafeAutonomousRealOrderSizeUsd(params: {
  requestedSizeUsd: number;
  availableUsd: number;
  committedMarginUsd?: number;
  verifiedReal?: boolean;
  marketType?: MarketType;
  leverage?: number;
  applyBalanceTierCap?: boolean;
}): { ok: boolean; sizeUsd: number; error?: string };

export function computeUnifiedPortfolioEquityUsd(params: {
  wallets: WalletConnectionState[];
  executionEnv: ExecutionEnvironment;
}): number;
