import type {
  ExchangeId,
  ExecutionEnvironment,
  MarketPair,
  MarketType,
  WalletConnectionState,
} from '../src/types/terminal';

export function hasRealWalletCredentials(wallet: WalletConnectionState | undefined): boolean;

export function isWalletReadyForRealExecution(
  wallet: WalletConnectionState | undefined,
  useTestnet?: boolean
): { ok: boolean; reason: string };

export function resolveReadyRealWalletForExchange(
  exchange: ExchangeId,
  wallets: WalletConnectionState[],
  useTestnet?: boolean
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
  verifiedReal?: boolean;
  marketType?: MarketType;
  leverage?: number;
}): { ok: boolean; sizeUsd: number; error?: string };

export function computeUnifiedPortfolioEquityUsd(params: {
  wallets: WalletConnectionState[];
  executionEnv: ExecutionEnvironment;
}): number;
