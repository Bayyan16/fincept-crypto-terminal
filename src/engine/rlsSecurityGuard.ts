import {
  AgentPosition,
  ClosedTradeLog,
  ExchangeId,
  WalletConnectionState,
  WalletCredentials,
} from '../types/terminal';
import {
  computeRlsHexDigestCore,
  computeWalletRowIntegrityTagCore,
  deriveWalletRlsOwnerScopeCore,
  sealSessionSecretCore,
  sealWalletVaultForStorageCore,
  unsealSessionSecretCore,
  verifyAndUnsealLoadedWalletsCore,
} from '../../backend/vaultIntegrity.mjs';

/**
 * FINCEPT CLIENT-SIDE ROW-LEVEL SECURITY (RLS) & WALLET VAULT GUARD V1.0
 *
 * Provides:
 * 1. Cryptographic RLS Tenant/Owner Scope Isolation per Wallet & Venue
 * 2. Sealed At-Rest Vault Obfuscation + Tamper-Evident Row Integrity Hash for localStorage
 * 3. Pre-Flight Wallet Configuration & Address/Key Validator (EVM 0x, Solana Base58, CEX HMAC keys)
 * 4. Position & Trade-Log Row Ownership Verification (prevents cross-wallet mutation or unauthorized close)
 */

export const EVM_ADDR_RE = /^0x[a-fA-F0-9]{40}$/;
export const SOL_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const PRIVATE_KEY_RE = /^(0x)?[a-fA-F0-9]{64}$/;
export const SAFE_API_TOKEN_RE = /^[^\s&=?#\r\n\0]{8,256}$/;

const BURN_EVM_SET = new Set([
  '0x0000000000000000000000000000000000000000',
  '0x000000000000000000000000000000000000dead',
]);

const INVALID_SOL_SET = new Set([
  '11111111111111111111111111111111',
  'So11111111111111111111111111111111111111111',
]);

/**
 * Deterministic 64-bit FNV-1a dual-lane hex digest for synchronous client-side RLS row integrity.
 */
export function computeRlsHexDigest(input: string): string {
  return computeRlsHexDigestCore(input);
}

/**
 * Seals a sensitive credential string in active session memory with an ephemeral per-session key.
 * Secrets are never written to persistent localStorage.
 */
export function sealCredentialSecret(plain?: string): string {
  return sealSessionSecretCore(plain);
}

/**
 * Unseals a credential secret from session memory (or migrates legacy sealed values).
 */
export function unsealCredentialSecret(sealed?: string): string {
  return unsealSessionSecretCore(sealed);
}

/**
 * Computes the canonical Row-Level Security (RLS) owner scope for a wallet row.
 */
export function deriveWalletRlsOwnerScope(wallet: WalletConnectionState): string {
  return deriveWalletRlsOwnerScopeCore(wallet);
}

/**
 * Computes the tamper-evident RLS integrity tag over a wallet row's critical state.
 */
export function computeWalletRowIntegrityTag(wallet: WalletConnectionState): string {
  return computeWalletRowIntegrityTagCore(wallet);
}

/**
 * Seals all wallet metadata rows before writing to localStorage (binds RLS owner scope & integrity tag,
 * and strips raw secrets so API secrets/private keys are NEVER persisted to localStorage).
 */
export function sealWalletVaultForStorage(wallets: WalletConnectionState[]): WalletConnectionState[] {
  return sealWalletVaultForStorageCore(wallets);
}

/**
 * Unseals and verifies RLS integrity of wallet rows loaded from localStorage by matching `row.id`
 * (never by array index). Resets `verifiedReal`, `autoSignEnabled`, and `balanceUsd` if tampered or
 * if `rlsIntegrityTag` was deleted on a privileged row.
 */
export function verifyAndUnsealLoadedWallets(
  rawList: WalletConnectionState[],
  fallbackDefaults: WalletConnectionState[]
): WalletConnectionState[] {
  return verifyAndUnsealLoadedWalletsCore(rawList, fallbackDefaults);
}

/**
 * Client-side deep validation of a wallet's configuration before verification or execution.
 */
export function validateWalletConfigClientRls(
  providerId: WalletConnectionState['id'],
  creds: WalletCredentials = {}
): { ok: boolean; policy: string; error?: string } {
  if (providerId === 'trust' || providerId === 'hyperliquid_agent') {
    const addr = (creds.walletAddress || '').trim();
    if (!EVM_ADDR_RE.test(addr)) {
      return {
        ok: false,
        policy: 'RLS_EVM_WALLET_VALIDATION',
        error: 'Masukkan alamat wallet EVM / Trust Wallet yang valid (0x diikuti 40 karakter hex, total 42 karakter).',
      };
    }
    if (BURN_EVM_SET.has(addr.toLowerCase())) {
      return {
        ok: false,
        policy: 'RLS_BURN_ADDRESS_BLOCK',
        error: '[RLS GUARD] Alamat burn / zero address (0x000...000) diblokir demi keamanan dana.',
      };
    }
    if (providerId === 'hyperliquid_agent' && creds.agentPrivateKey?.trim()) {
      const pk = creds.agentPrivateKey.trim();
      if (!PRIVATE_KEY_RE.test(pk) || /^0x?0+$/i.test(pk)) {
        return {
          ok: false,
          policy: 'RLS_AGENT_KEY_VALIDATION',
          error: '[RLS GUARD] Hyperliquid Agent Private Key wajib 64 karakter hex (32-byte non-zero).',
        };
      }
    }
    return { ok: true, policy: 'RLS_EVM_WALLET_VERIFIED' };
  }

  if (providerId === 'phantom') {
    const sol = (creds.walletAddress || '').trim();
    if (!SOL_ADDR_RE.test(sol)) {
      return {
        ok: false,
        policy: 'RLS_SOLANA_WALLET_VALIDATION',
        error: 'Alamat Solana (Phantom) tidak valid (wajib Base58 32-44 karakter tanpa 0, O, I, l).',
      };
    }
    if (INVALID_SOL_SET.has(sol)) {
      return {
        ok: false,
        policy: 'RLS_SOLANA_SYSTEM_ADDR_BLOCK',
        error: '[RLS GUARD] Alamat System Program Solana tidak dapat digunakan sebagai dompet trading.',
      };
    }
    return { ok: true, policy: 'RLS_SOLANA_WALLET_VERIFIED' };
  }

  if (providerId === 'binance_api' || providerId === 'bybit_api' || providerId === 'okx_api') {
    const k = (creds.apiKey || '').trim();
    const s = unsealCredentialSecret(creds.apiSecret).trim();
    const p = unsealCredentialSecret(creds.passphrase).trim();
    const label =
      providerId === 'binance_api' ? 'Binance' : providerId === 'bybit_api' ? 'Bybit' : 'OKX';

    if (!k || !s || (providerId === 'okx_api' && !p)) {
      return {
        ok: false,
        policy: 'RLS_CEX_CREDENTIAL_PRESENCE',
        error:
          providerId === 'okx_api'
            ? 'Masukkan OKX API Key, Secret, dan Passphrase.'
            : `Masukkan ${label} API Key & Secret.`,
      };
    }
    if (!SAFE_API_TOKEN_RE.test(k) || !SAFE_API_TOKEN_RE.test(s)) {
      return {
        ok: false,
        policy: 'RLS_CEX_CREDENTIAL_FORMAT',
        error: `[RLS GUARD] Format ${label} API Key / Secret tidak valid (minimal 8 karakter, tanpa spasi atau karakter injeksi).`,
      };
    }
    if (k === s) {
      return {
        ok: false,
        policy: 'RLS_CEX_KEY_SECRET_DISTINCT',
        error: `[RLS GUARD] ${label} API Key dan Secret tidak boleh sama.`,
      };
    }
    return { ok: true, policy: 'RLS_CEX_CREDENTIAL_VERIFIED' };
  }

  return { ok: false, policy: 'RLS_UNKNOWN_PROVIDER', error: 'Provider wallet tidak dikenali.' };
}

/**
 * Maps an ExchangeId to its primary owning WalletConnectionState.
 */
export function resolveOwningWalletForExchange(
  exchange: ExchangeId,
  wallets: WalletConnectionState[]
): WalletConnectionState | undefined {
  const trustWallet = wallets.find((w) => w.id === 'trust');
  const hlAgentWallet = wallets.find((w) => w.id === 'hyperliquid_agent');
  const phantomWallet = wallets.find((w) => w.id === 'phantom');

  if (exchange === 'HYPERLIQUID') {
    if (trustWallet?.connected && trustWallet.verifiedReal) return trustWallet;
    if (hlAgentWallet?.connected && hlAgentWallet.verifiedReal) return hlAgentWallet;
    return trustWallet?.connected ? trustWallet : hlAgentWallet;
  }
  if (exchange === 'JUPITER') {
    return phantomWallet;
  }
  if (exchange === 'DEXSCREENER') {
    return phantomWallet?.connected ? phantomWallet : trustWallet;
  }
  const map: Record<string, WalletConnectionState['id']> = {
    BINANCE: 'binance_api',
    BYBIT: 'bybit_api',
    OKX: 'okx_api',
  };
  return wallets.find((w) => w.id === map[exchange]);
}

/**
 * Stamps an AgentPosition row with Row-Level Security ownership metadata and integrity hash.
 */
export function stampPositionWithRls(
  pos: AgentPosition,
  wallets: WalletConnectionState[]
): AgentPosition {
  const ownerWallet = resolveOwningWalletForExchange(pos.exchange, wallets);
  const rlsOwnerScope = ownerWallet ? deriveWalletRlsOwnerScope(ownerWallet) : `rls:${pos.exchange.toLowerCase()}:paper`;
  const rlsRowHash = computeRlsHexDigest(
    `${pos.id}|${pos.symbol}|${pos.side}|${pos.exchange}|${pos.sizeUsd}|${pos.entryPrice}|${rlsOwnerScope}`
  );
  return {
    ...pos,
    rlsOwnerScope,
    rlsRowHash,
  };
}

/**
 * Verifies Row-Level Security ownership and integrity of an AgentPosition before mutation/closing.
 */
export function verifyPositionRlsOwnership(
  pos: AgentPosition,
  wallets: WalletConnectionState[]
): { ok: boolean; rlsOwnerScope: string; error?: string } {
  const ownerWallet = resolveOwningWalletForExchange(pos.exchange, wallets);
  const currentScope = ownerWallet
    ? deriveWalletRlsOwnerScope(ownerWallet)
    : `rls:${pos.exchange.toLowerCase()}:paper`;

  if (pos.isRealMoney && pos.rlsOwnerScope && pos.rlsOwnerScope !== currentScope) {
    return {
      ok: false,
      rlsOwnerScope: currentScope,
      error: `[RLS ISOLATION BLOCKED] Posisi ${pos.symbol} dimiliki oleh scope wallet berbeda (${pos.rlsOwnerScope}). Penutupan lintas-akun ditolak.`,
    };
  }

  return { ok: true, rlsOwnerScope: pos.rlsOwnerScope || currentScope };
}

/**
 * Stamps a ClosedTradeLog row with RLS audit hash.
 */
export function stampClosedTradeWithRls(
  trade: ClosedTradeLog,
  rlsOwnerScope?: string
): ClosedTradeLog {
  const scope = rlsOwnerScope || `rls:${trade.exchange.toLowerCase()}:settled`;
  const rlsRowHash = computeRlsHexDigest(
    `${trade.id}|${trade.symbol}|${trade.side}|${trade.sizeUsd}|${trade.realizedPnlUsd}|${scope}`
  );
  return {
    ...trade,
    rlsOwnerScope: scope,
    rlsRowHash,
  };
}
