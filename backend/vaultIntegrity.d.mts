import type { WalletConnectionState } from '../src/types/terminal';

export function computeRlsHexDigestCore(input: string): string;
export function sealSessionSecretCore(plain?: string): string;
export function unsealSessionSecretCore(sealed?: string): string;
export function deriveWalletRlsOwnerScopeCore(wallet: WalletConnectionState): string;
export function computeWalletRowIntegrityTagCore(wallet: WalletConnectionState): string;
export function sealWalletVaultForStorageCore(
  wallets: WalletConnectionState[]
): WalletConnectionState[];
export function verifyAndUnsealLoadedWalletsCore(
  rawList: WalletConnectionState[],
  fallbackDefaults: WalletConnectionState[]
): WalletConnectionState[];
