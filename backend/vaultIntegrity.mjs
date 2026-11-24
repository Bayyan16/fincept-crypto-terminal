/**
 * Client Wallet Vault Integrity & Session-Only Secret Sealing Helpers.
 * - Matches saved wallet rows strictly by `id` (never by array index)
 * - Detects tamper when `rlsIntegrityTag` mismatches OR is stripped from a connected/verified row
 * - Never writes raw or static-salt reversible API secrets / private keys into persistent localStorage
 */

const LEGACY_SEAL_PREFIX = 'rls_sealed_v1:';
const SESSION_SEAL_PREFIX = 'rls_session_v2:';
const LEGACY_RLS_SALT = 'fincept-rls-vault-guard-2026-v1';

// Per-session ephemeral 32-byte key (lives only in RAM; never persisted to localStorage)
const sessionKeyBytes = new Uint8Array(32);
if (typeof globalThis.crypto?.getRandomValues === 'function') {
  globalThis.crypto.getRandomValues(sessionKeyBytes);
} else {
  for (let i = 0; i < 32; i++) {
    sessionKeyBytes[i] = Math.floor(Math.random() * 256);
  }
}

export function computeRlsHexDigestCore(input) {
  let h1 = 0x811c9dc5;
  let h2 = 0xcbf29ce4;
  const payload = `${LEGACY_RLS_SALT}:${input}`;
  for (let i = 0; i < payload.length; i++) {
    const code = payload.charCodeAt(i);
    h1 ^= code;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= code ^ (i & 0xff);
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return `${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export function sealSessionSecretCore(plain) {
  if (!plain) return '';
  if (plain.startsWith(SESSION_SEAL_PREFIX)) return plain;
  const unwrapped = plain.startsWith(LEGACY_SEAL_PREFIX) ? unsealSessionSecretCore(plain) : plain;
  const bytes = new TextEncoder().encode(unwrapped);
  const out = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ sessionKeyBytes[i % sessionKeyBytes.length];
  }
  let hex = '';
  for (let i = 0; i < out.length; i++) {
    hex += out[i].toString(16).padStart(2, '0');
  }
  return `${SESSION_SEAL_PREFIX}${hex}`;
}

export function unsealSessionSecretCore(sealed) {
  if (!sealed) return '';
  if (sealed.startsWith(SESSION_SEAL_PREFIX)) {
    const hex = sealed.slice(SESSION_SEAL_PREFIX.length);
    if (hex.length % 2 !== 0) return '';
    const buf = new Uint8Array(hex.length / 2);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16) ^ sessionKeyBytes[i % sessionKeyBytes.length];
    }
    return new TextDecoder().decode(buf);
  }
  if (sealed.startsWith(LEGACY_SEAL_PREFIX)) {
    const hex = sealed.slice(LEGACY_SEAL_PREFIX.length);
    if (hex.length % 2 !== 0) return '';
    const keyBytes = new TextEncoder().encode(LEGACY_RLS_SALT);
    const buf = new Uint8Array(hex.length / 2);
    for (let i = 0; i < buf.length; i++) {
      buf[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16) ^ keyBytes[i % keyBytes.length];
    }
    return new TextDecoder().decode(buf);
  }
  return sealed;
}

export function deriveWalletRlsOwnerScopeCore(wallet) {
  const creds = wallet?.credentials || {};
  const identity =
    creds.walletAddress?.trim().toLowerCase() ||
    (creds.apiKey ? `${wallet.id}:${creds.apiKey.trim().slice(0, 8)}` : '') ||
    wallet.id;
  return `rls:${wallet.id}:${computeRlsHexDigestCore(identity)}`;
}

export function computeWalletRowIntegrityTagCore(wallet) {
  const creds = wallet?.credentials || {};
  const canonical = [
    wallet.id,
    wallet.type,
    Boolean(wallet.connected),
    Boolean(wallet.verifiedReal),
    Number(wallet.balanceUsd || 0).toFixed(2),
    (creds.walletAddress || '').trim().toLowerCase(),
    (creds.apiKey || '').trim(),
  ].join('|');
  return computeRlsHexDigestCore(canonical);
}

/**
 * Strips raw/reversibly-encoded private secrets before persisting wallet metadata to localStorage.
 * Secrets remain only in active session RAM.
 */
export function sealWalletVaultForStorageCore(wallets) {
  return wallets.map((w) => {
    const creds = w.credentials || {};
    const rlsOwnerScope = deriveWalletRlsOwnerScopeCore(w);
    const rlsIntegrityTag = computeWalletRowIntegrityTagCore(w);
    return {
      ...w,
      rlsOwnerScope,
      rlsIntegrityTag,
      rlsPolicyStatus: 'ENFORCED',
      credentials: {
        walletAddress: creds.walletAddress || '',
        apiKey: creds.apiKey || '',
        useTestnet: creds.useTestnet,
        preferredChainId: creds.preferredChainId,
        // Never persist API secret, passphrase, or private key to localStorage!
        apiSecret: '',
        passphrase: '',
        agentPrivateKey: '',
      },
    };
  });
}

/**
 * Loads saved wallet rows strictly by `row.id` (never by array index) and treats missing or
 * mismatched `rlsIntegrityTag` on verified/connected rows as tamper.
 */
export function verifyAndUnsealLoadedWalletsCore(rawList, fallbackDefaults) {
  const byId = new Map();
  if (Array.isArray(rawList)) {
    for (const row of rawList) {
      if (row && typeof row.id === 'string' && !byId.has(row.id)) {
        byId.set(row.id, row);
      }
    }
  }

  return fallbackDefaults.map((def) => {
    const row = byId.get(def.id);
    if (!row) {
      return {
        ...def,
        rlsOwnerScope: deriveWalletRlsOwnerScopeCore(def),
        rlsIntegrityTag: computeWalletRowIntegrityTagCore(def),
        rlsPolicyStatus: 'ENFORCED',
      };
    }

    const creds = row.credentials || {};
    const unsealed = {
      ...def,
      ...row,
      id: def.id,
      type: def.type,
      credentials: {
        ...creds,
        apiSecret: unsealSessionSecretCore(creds.apiSecret),
        passphrase: unsealSessionSecretCore(creds.passphrase),
        agentPrivateKey: unsealSessionSecretCore(creds.agentPrivateKey),
      },
    };

    const expectedTag = computeWalletRowIntegrityTagCore(unsealed);
    const missingTagOnPrivilegedRow =
      !row.rlsIntegrityTag &&
      (Boolean(row.verifiedReal) || Number(row.balanceUsd) !== Number(def.balanceUsd));
    const hasTamper =
      missingTagOnPrivilegedRow ||
      (Boolean(row.rlsIntegrityTag) && row.rlsIntegrityTag !== expectedTag);

    const safeBalance =
      Number.isFinite(Number(unsealed.balanceUsd)) && Number(unsealed.balanceUsd) >= 0
        ? Number(unsealed.balanceUsd)
        : def.balanceUsd;

    const isCexSecretDependent =
      def.id === 'binance_api' || def.id === 'bybit_api' || def.id === 'okx_api';
    const missingRequiredSecret =
      isCexSecretDependent &&
      (!String(unsealed.credentials.apiSecret || '').trim() ||
        (def.id === 'okx_api' && !String(unsealed.credentials.passphrase || '').trim()));
    const requiresReauth =
      !hasTamper &&
      missingRequiredSecret &&
      (Boolean(unsealed.connected) || Boolean(unsealed.verifiedReal) || Boolean(unsealed.autoSignEnabled));

    const sanitized = {
      ...unsealed,
      balanceUsd: hasTamper ? def.balanceUsd : safeBalance,
      connected: hasTamper || requiresReauth ? false : Boolean(unsealed.connected),
      verifiedReal: hasTamper || requiresReauth ? false : Boolean(unsealed.verifiedReal),
      autoSignEnabled: hasTamper || requiresReauth ? false : Boolean(unsealed.autoSignEnabled),
    };

    return {
      ...sanitized,
      rlsOwnerScope: deriveWalletRlsOwnerScopeCore(sanitized),
      rlsIntegrityTag: computeWalletRowIntegrityTagCore(sanitized),
      rlsPolicyStatus: hasTamper ? 'TAMPER_RESET' : 'ENFORCED',
    };
  });
}
