import {
  ChainAssetBreakdown,
  ExchangeId,
  MarketType,
  WalletConnectionState,
  WalletCredentials,
} from '../types/terminal';
import {
  deriveWalletRlsOwnerScope,
  EVM_ADDR_RE,
  resolveOwningWalletForExchange,
  sealWalletVaultForStorage,
  SOL_ADDR_RE,
  unsealCredentialSecret,
  validateWalletConfigClientRls,
  verifyAndUnsealLoadedWallets,
} from './rlsSecurityGuard';
import {
  buildHyperliquidCancelAction,
  buildHyperliquidEip712TypedData,
  buildHyperliquidLeverageAction,
  buildHyperliquidOrderAction,
} from '../../backend/hyperliquidProtocol.mjs';
import {
  getWalletMarketCapabilities,
  isWalletReadyForRealExecution,
} from '../../backend/realExecutionRouter.mjs';

const BASE58_ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function encodeBase58(bytes: Uint8Array): string {
  if (!bytes.length) return '';
  const digits = [0];
  for (let i = 0; i < bytes.length; i++) {
    let carry = bytes[i];
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) {
      digits.push(carry % 58);
      carry = (carry / 58) | 0;
    }
  }
  let out = '';
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) out += '1';
  for (let i = digits.length - 1; i >= 0; i--) out += BASE58_ALPHABET[digits[i]];
  return out;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const bin = atob(base64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

declare global {
  interface Window {
    solana?: {
      isPhantom?: boolean;
      connect: () => Promise<{ publicKey: { toString: () => string } }>;
      signMessage?: (msg: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
      signAndSendTransaction?: (tx: any, opts?: any) => Promise<{ signature: string }>;
      signTransaction?: (tx: any) => Promise<{ serialize: () => Uint8Array }>;
      request?: (args: { method: string; params?: any }) => Promise<any>;
    };
    phantom?: {
      solana?: {
        isPhantom?: boolean;
        connect: () => Promise<{ publicKey: { toString: () => string } }>;
        signMessage?: (msg: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
        signAndSendTransaction?: (tx: any, opts?: any) => Promise<{ signature: string }>;
        signTransaction?: (tx: any) => Promise<{ serialize: () => Uint8Array }>;
        request?: (args: { method: string; params?: any }) => Promise<any>;
      };
    };
    trustwallet?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
    };
    ethereum?: {
      isTrust?: boolean;
      isMetaMask?: boolean;
      request: (args: { method: string; params?: any[] }) => Promise<any>;
    };
  }
}

export interface FlexibleNetworkSpec {
  chainId: number;
  chainHex: string;
  name: string;
  shortName: string;
  nativeCurrency: { name: string; symbol: string; decimals: number };
  rpcUrls: string[];
  blockExplorerUrls: string[];
  avgGasFee: string;
  speed: string;
  bestUseCase: string;
}

export const FLEXIBLE_EVM_NETWORKS: FlexibleNetworkSpec[] = [
  {
    chainId: 42161,
    chainHex: '0xa4b1',
    name: 'Arbitrum One (L2)',
    shortName: 'ARBITRUM L2 ⚡',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://arb1.arbitrum.io/rpc'],
    blockExplorerUrls: ['https://arbiscan.io'],
    avgGasFee: '< $0.008',
    speed: '0.25 dtk (Instan)',
    bestUseCase: 'TERBAIK untuk Hyperliquid Perp/Spot, Arbitrum DEX, & USDC Bridge',
  },
  {
    chainId: 56,
    chainHex: '0x38',
    name: 'BNB Smart Chain (BEP20)',
    shortName: 'BNB CHAIN (BSC)',
    nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
    rpcUrls: ['https://bsc-dataseed.binance.org'],
    blockExplorerUrls: ['https://bscscan.com'],
    avgGasFee: '~$0.01',
    speed: '1.5 dtk',
    bestUseCase: 'TERBAIK untuk Transfer CEX (Binance/Bybit/OKX) & USDT BEP20',
  },
  {
    chainId: 8453,
    chainHex: '0x2105',
    name: 'Base Mainnet (L2)',
    shortName: 'BASE L2 ⚡',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://mainnet.base.org'],
    blockExplorerUrls: ['https://basescan.org'],
    avgGasFee: '< $0.004',
    speed: '2.0 dtk',
    bestUseCase: 'TERBAIK untuk Spot DEX EVM (Aerodrome / Uniswap V3) & USDC Murah',
  },
  {
    chainId: 137,
    chainHex: '0x89',
    name: 'Polygon POS',
    shortName: 'POLYGON',
    nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
    rpcUrls: ['https://polygon-rpc.com'],
    blockExplorerUrls: ['https://polygonscan.com'],
    avgGasFee: '< $0.005',
    speed: '2.0 dtk',
    bestUseCase: 'Fleksibel untuk Micro-Transactions & Stablecoin Routing',
  },
  {
    chainId: 1,
    chainHex: '0x1',
    name: 'Ethereum Mainnet (ERC20)',
    shortName: 'ETHEREUM L1',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: ['https://eth.llamarpc.com'],
    blockExplorerUrls: ['https://etherscan.io'],
    avgGasFee: '$1.20 – $4.50',
    speed: '12 dtk',
    bestUseCase: 'Settlement Institusional Whale Besar (> $100K)',
  },
];

export function getChainNameById(chainId?: number): string {
  if (!chainId) return 'Auto-Flex Multi-Chain';
  const found = FLEXIBLE_EVM_NETWORKS.find((n) => n.chainId === chainId);
  if (found) return found.name;
  if (chainId === 421614) return 'Arbitrum Sepolia (Testnet)';
  return `EVM Chain #${chainId}`;
}

const STORAGE_KEY = 'fincept_real_wallet_vault_v1';

export const INITIAL_WALLET_CONNECTIONS: WalletConnectionState[] = [
  {
    id: 'hyperliquid_agent',
    name: 'Hyperliquid L1 Perp & Spot',
    type: 'PERP_AGENT_KEY',
    chainOrScope: 'Priority #1 • Hyperliquid L1 Native Clearinghouse + Autonomous Agent Key / EVM',
    connected: true,
    verifiedReal: false,
    addressOrKeyId: 'HL-AGENT-0x9F2...E81C (Paper)',
    balanceUsd: 86500.0,
    latencyMs: 4,
    autoSignEnabled: true,
    activeChainId: 42161,
    activeChainName: 'Hyperliquid L1 + Arbitrum',
    credentials: { walletAddress: '', agentPrivateKey: '', useTestnet: false },
  },
  {
    id: 'binance_api',
    name: 'Binance Futures & Spot',
    type: 'CEX_API',
    chainOrScope: 'Priority #2 • USDT-M Perpetual & Spot (HMAC-SHA256)',
    connected: true,
    verifiedReal: false,
    addressOrKeyId: 'API-KEY-BNC-PAPER (Ready for Real Key)',
    balanceUsd: 64200.0,
    latencyMs: 7,
    autoSignEnabled: true,
    credentials: { apiKey: '', apiSecret: '', useTestnet: false },
  },
  {
    id: 'bybit_api',
    name: 'Bybit V5 Unified Trading',
    type: 'CEX_API',
    chainOrScope: 'Priority #3 • Unified Margin USDT Perp & Spot (HMAC-SHA256)',
    connected: true,
    verifiedReal: false,
    addressOrKeyId: 'API-KEY-BYB-PAPER (Ready for Real Key)',
    balanceUsd: 31900.0,
    latencyMs: 9,
    autoSignEnabled: true,
    credentials: { apiKey: '', apiSecret: '', useTestnet: false },
  },
  {
    id: 'okx_api',
    name: 'OKX V5 Multi-Asset Engine',
    type: 'CEX_API',
    chainOrScope: 'Priority #4 • USDT-SWAP & Spot Orderbook (HMAC-SHA256)',
    connected: false,
    verifiedReal: false,
    addressOrKeyId: 'Not Connected',
    balanceUsd: 0,
    latencyMs: 0,
    autoSignEnabled: false,
    credentials: { apiKey: '', apiSecret: '', passphrase: '', useTestnet: false },
  },
  {
    id: 'trust',
    name: 'Trust Wallet / EVM Multi-Chain',
    type: 'DEX_WALLET',
    chainOrScope: 'Arbitrum • BNB Chain • Base • Ethereum • Hyperliquid EIP-712',
    connected: true,
    verifiedReal: false,
    addressOrKeyId: '0x71C...9A4E (Paper Session)',
    balanceUsd: 38420.0,
    latencyMs: 14,
    autoSignEnabled: true,
    activeChainId: 42161,
    activeChainName: 'Arbitrum One (L2)',
    credentials: { walletAddress: '', useTestnet: false, preferredChainId: 42161 },
  },
  {
    id: 'phantom',
    name: 'Phantom Wallet (Solana)',
    type: 'DEX_WALLET',
    chainOrScope: 'Solana Mainnet • Jupiter V1 / Raydium CLMM',
    connected: true,
    verifiedReal: false,
    addressOrKeyId: '7xQp...9mK2 (Paper Session)',
    balanceUsd: 42850.0,
    latencyMs: 11,
    autoSignEnabled: true,
    activeChainName: 'Solana Mainnet-Beta',
    credentials: { walletAddress: '', useTestnet: false },
  },
];

export function loadSavedWallets(): WalletConnectionState[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return verifyAndUnsealLoadedWallets(INITIAL_WALLET_CONNECTIONS, INITIAL_WALLET_CONNECTIONS);
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length === INITIAL_WALLET_CONNECTIONS.length) {
      return verifyAndUnsealLoadedWallets(parsed, INITIAL_WALLET_CONNECTIONS);
    }
  } catch {
    // Ignore storage errors
  }
  return verifyAndUnsealLoadedWallets(INITIAL_WALLET_CONNECTIONS, INITIAL_WALLET_CONNECTIONS);
}

export function saveWalletsToVault(wallets: WalletConnectionState[]): void {
  try {
    const sealed = sealWalletVaultForStorage(wallets);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(sealed));
  } catch {
    // Ignore
  }
}

/**
 * Reads currently active EVM chainId from Trust Wallet / MetaMask without throwing.
 */
export async function detectActiveEvmChain(): Promise<{
  chainId: number;
  chainName: string;
}> {
  const evmProvider = window.trustwallet || window.ethereum;
  if (!evmProvider || typeof evmProvider.request !== 'function') {
    return { chainId: 42161, chainName: 'Arbitrum One (L2)' };
  }
  try {
    const rawChain = await evmProvider.request({ method: 'eth_chainId' });
    const parsed =
      typeof rawChain === 'string'
        ? rawChain.startsWith('0x')
          ? parseInt(rawChain, 16)
          : parseInt(rawChain, 10)
        : Number(rawChain);
    const validId = Number.isFinite(parsed) && parsed > 0 ? parsed : 42161;
    return {
      chainId: validId,
      chainName: getChainNameById(validId),
    };
  } catch {
    return { chainId: 42161, chainName: 'Arbitrum One (L2)' };
  }
}

/**
 * Switches Trust Wallet / EVM Extension to the chosen flexible network (Arbitrum, BSC, Base, Polygon, Ethereum).
 */
export async function switchEvmWalletNetwork(targetChainId: number): Promise<{
  ok: boolean;
  chainId: number;
  chainName: string;
  error?: string;
}> {
  const spec = FLEXIBLE_EVM_NETWORKS.find((n) => n.chainId === targetChainId);
  if (!spec) {
    return { ok: false, chainId: targetChainId, chainName: 'Unknown', error: 'Chain ID tidak dikenali.' };
  }

  const evmProvider = window.trustwallet || window.ethereum;
  if (!evmProvider || typeof evmProvider.request !== 'function') {
    return {
      ok: true,
      chainId: spec.chainId,
      chainName: spec.name,
    };
  }

  try {
    await evmProvider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: spec.chainHex }],
    });
    return { ok: true, chainId: spec.chainId, chainName: spec.name };
  } catch (switchErr: any) {
    // Error code 4902 means the chain has not been added to Trust Wallet / MetaMask yet
    if (switchErr?.code === 4902 || String(switchErr?.message || '').includes('Unrecognized chain')) {
      try {
        await evmProvider.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: spec.chainHex,
              chainName: spec.name,
              nativeCurrency: spec.nativeCurrency,
              rpcUrls: spec.rpcUrls,
              blockExplorerUrls: spec.blockExplorerUrls,
            },
          ],
        });
        return { ok: true, chainId: spec.chainId, chainName: spec.name };
      } catch (addErr: any) {
        return {
          ok: false,
          chainId: spec.chainId,
          chainName: spec.name,
          error: addErr?.message || 'Gagal menambahkan jaringan ke Trust Wallet.',
        };
      }
    }
    return {
      ok: false,
      chainId: spec.chainId,
      chainName: spec.name,
      error: switchErr?.message || 'Pergantian jaringan dibatalkan oleh pengguna.',
    };
  }
}

/**
 * Connects to native browser extension (Phantom or Trust/EVM) and extracts the real wallet address + active chain.
 */
export async function connectBrowserExtensionWallet(
  id: 'phantom' | 'trust' | 'hyperliquid_agent'
): Promise<{
  ok: boolean;
  fullAddress?: string;
  displayAddress: string;
  activeChainId?: number;
  activeChainName?: string;
  mode: 'BROWSER_EXTENSION' | 'MANUAL';
}> {
  if (id === 'phantom') {
    const provider = window.phantom?.solana || window.solana;
    if (provider && typeof provider.connect === 'function') {
      try {
        const resp = await provider.connect();
        const pubKey = String(resp.publicKey?.toString() || '').trim();
        if (!SOL_ADDR_RE.test(pubKey)) {
          return {
            ok: false,
            displayAddress: '[RLS GUARD] Public key dari ekstensi Phantom tidak valid.',
            mode: 'MANUAL',
          };
        }
        return {
          ok: true,
          fullAddress: pubKey,
          displayAddress: `${pubKey.slice(0, 4)}...${pubKey.slice(-4)} (Phantom Live)`,
          activeChainName: 'Solana Mainnet-Beta',
          mode: 'BROWSER_EXTENSION',
        };
      } catch (err: any) {
        return {
          ok: false,
          displayAddress: err?.message || 'Phantom connection rejected',
          mode: 'MANUAL',
        };
      }
    }
    return {
      ok: false,
      displayAddress: 'Phantom extension tidak terdeteksi — masukkan alamat Solana manual di bawah.',
      mode: 'MANUAL',
    };
  }

  // Trust Wallet / MetaMask / Rabby (EIP-1193)
  const evmProvider = window.trustwallet || window.ethereum;
  if (evmProvider && typeof evmProvider.request === 'function') {
    try {
      const accounts = await evmProvider.request({ method: 'eth_requestAccounts' });
      const { chainId, chainName } = await detectActiveEvmChain();
      if (Array.isArray(accounts) && accounts[0]) {
        const addr = String(accounts[0]).trim();
        if (!EVM_ADDR_RE.test(addr)) {
          return {
            ok: false,
            displayAddress: '[RLS GUARD] Alamat EVM dari ekstensi tidak valid.',
            mode: 'MANUAL',
          };
        }
        return {
          ok: true,
          fullAddress: addr,
          displayAddress: `${addr.slice(0, 6)}...${addr.slice(-4)} (${chainName})`,
          activeChainId: chainId,
          activeChainName: chainName,
          mode: 'BROWSER_EXTENSION',
        };
      }
    } catch (err: any) {
      return {
        ok: false,
        displayAddress: err?.message || 'EVM Wallet connection rejected',
        mode: 'MANUAL',
      };
    }
  }

  return {
    ok: false,
    displayAddress: 'Ekstensi Trust/EVM tidak terdeteksi — masukkan alamat 0x... manual di bawah.',
    mode: 'MANUAL',
  };
}

/**
 * Verifies real API keys or on-chain wallet addresses via the local backend gateway (/api/account/verify)
 * and returns the live USD balance + multi-chain portfolio breakdown from the exchange/blockchain.
 */
export async function pingExchangeVenueConnection(
  providerId: WalletConnectionState['id'],
  useTestnet = false
): Promise<{
  ok: boolean;
  latencyMs?: number;
  transport?: string;
  publicIp?: string;
  futuresReachable?: boolean;
  spotReachable?: boolean;
  message: string;
}> {
  try {
    const res = await fetch('/api/account/ping-venue', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ providerId, useTestnet }),
    });
    const data = await res.json();
    return {
      ok: Boolean(data?.ok),
      latencyMs: data?.latencyMs,
      transport: data?.transport,
      publicIp: data?.publicIp,
      futuresReachable: data?.futuresReachable,
      spotReachable: data?.spotReachable,
      message: data?.message || (data?.ok ? 'Server venue aktif.' : 'Gagal menghubungi server venue.'),
    };
  } catch (err: any) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : 'Gagal menghubungi gateway lokal.',
    };
  }
}

export async function verifyRealAccountWithBackend(
  providerId: WalletConnectionState['id'],
  credentials: WalletCredentials
): Promise<{
  ok: boolean;
  balanceUsd?: number;
  futuresEnabled?: boolean;
  spotEnabled?: boolean;
  futuresBalanceUsd?: number;
  futuresEquityUsd?: number;
  spotBalanceUsd?: number;
  spotEquityUsd?: number;
  addressDisplay?: string;
  openPositions?: any[];
  chainBalances?: ChainAssetBreakdown[];
  rlsOwnerId?: string;
  resolvedUseTestnet?: boolean;
  resolvedSpotHost?: string;
  agentAddress?: string;
  agentAuthorized?: boolean;
  agentAuthWarning?: string;
  publicIp?: string;
  error?: string;
}> {
  const unsealedCreds: WalletCredentials = {
    ...credentials,
    apiSecret: unsealCredentialSecret(credentials?.apiSecret),
    passphrase: unsealCredentialSecret(credentials?.passphrase),
    agentPrivateKey: unsealCredentialSecret(credentials?.agentPrivateKey),
  };

  const preCheck = validateWalletConfigClientRls(providerId, unsealedCreds);
  if (!preCheck.ok) {
    return { ok: false, error: preCheck.error };
  }

  try {
    const t0 = performance.now();
    const res = await fetch('/api/account/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId,
        ...unsealedCreds,
      }),
    });
    const data = await res.json();
    const latency = Math.round(performance.now() - t0);
    if (!data.ok) {
      return { ok: false, error: data.error || 'Verifikasi gagal.' };
    }
    return {
      ok: true,
      balanceUsd: data.balanceUsd ?? 0,
      futuresEnabled: typeof data.futuresEnabled === 'boolean' ? data.futuresEnabled : undefined,
      spotEnabled: typeof data.spotEnabled === 'boolean' ? data.spotEnabled : undefined,
      futuresBalanceUsd: typeof data.futuresBalanceUsd === 'number' ? data.futuresBalanceUsd : undefined,
      futuresEquityUsd: typeof data.futuresEquityUsd === 'number' ? data.futuresEquityUsd : undefined,
      spotBalanceUsd: typeof data.spotBalanceUsd === 'number' ? data.spotBalanceUsd : undefined,
      spotEquityUsd: typeof data.spotEquityUsd === 'number' ? data.spotEquityUsd : undefined,
      addressDisplay: data.addressDisplay,
      openPositions: data.openPositions || [],
      chainBalances: data.chainBalances || undefined,
      rlsOwnerId: data.rlsOwnerId,
      resolvedUseTestnet:
        typeof data.resolvedUseTestnet === 'boolean' ? data.resolvedUseTestnet : undefined,
      resolvedSpotHost: typeof data.resolvedSpotHost === 'string' ? data.resolvedSpotHost : undefined,
      agentAddress: typeof data.agentAddress === 'string' ? data.agentAddress : undefined,
      agentAuthorized: typeof data.agentAuthorized === 'boolean' ? data.agentAuthorized : undefined,
      agentAuthWarning: typeof data.agentAuthWarning === 'string' ? data.agentAuthWarning : undefined,
      publicIp: data.publicIp,
      ...(latency ? { latencyMs: latency } : {}),
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Gagal menghubungi local backend gateway.',
    };
  }
}

interface HlMetaAsset {
  index: number;
  name: string;
  szDecimals: number;
  maxLeverage: number;
}

const hlMetaCache = new Map<string, { ts: number; assets: HlMetaAsset[] }>();

async function resolveHyperliquidAssetMeta(
  symbol: string,
  useTestnet = false
): Promise<HlMetaAsset | null> {
  const cacheKey = useTestnet ? 'testnet' : 'mainnet';
  let assets = hlMetaCache.get(cacheKey)?.assets;
  const cachedTs = hlMetaCache.get(cacheKey)?.ts || 0;
  if (!assets || Date.now() - cachedTs > 300_000) {
    try {
      const res = await fetch(`/api/live/hl-meta?testnet=${useTestnet ? '1' : '0'}`);
      const json = await res.json();
      if (json?.ok && Array.isArray(json.assets)) {
        const loaded: HlMetaAsset[] = json.assets;
        assets = loaded;
        hlMetaCache.set(cacheKey, { ts: Date.now(), assets: loaded });
      }
    } catch {
      // fall through to existing cache if available
    }
  }
  if (!assets || assets.length === 0) return null;
  const rawBase = String(symbol || '').split('-')[0].split('/')[0].trim();
  const upperBase = rawBase.toUpperCase();
  const strippedK = rawBase.replace(/^k(?=[A-Z]{2,})/, '').toUpperCase();
  return (
    assets.find((a) => a.name === rawBase) ||
    assets.find((a) => a.name.toUpperCase() === upperBase) ||
    assets.find((a) => a.name === `k${strippedK}`) ||
    assets.find((a) => a.name.toUpperCase() === strippedK) ||
    null
  );
}

/**
 * Signs a spec-accurate Hyperliquid L1 EIP-712 Phantom Agent order action (chainId: 1337)
 * via connected EVM Wallet (Trust Wallet / Rabby / MetaMask) using dynamic asset index,
 * exact side/reduceOnly semantics for entries vs exits/stops, and keccak256(msgpack(action)).
 */
async function signHyperliquidEip712Order(orderSpec: {
  symbol: string;
  side: 'LONG' | 'SHORT';
  orderPurpose: 'ENTRY_MAKER' | 'SCRATCH_EXIT' | 'BREAKEVEN_STOP';
  price: number;
  stopPrice?: number;
  sizeUsd: number;
  quantity?: number;
  makerOnly?: boolean;
  useTestnet?: boolean;
  expectedAddress?: string;
}): Promise<{ ok: boolean; signedAction?: any; error?: string }> {
  const evmProvider = window.trustwallet || window.ethereum;
  if (!evmProvider) {
    return {
      ok: false,
      error: 'Ekstensi Trust Wallet / EVM diperlukan untuk menandatangani transaksi Hyperliquid L1.',
    };
  }

  try {
    const accounts = await evmProvider.request({ method: 'eth_requestAccounts' });
    const signer = String(accounts?.[0] || '').trim();
    if (!signer || !EVM_ADDR_RE.test(signer)) {
      return { ok: false, error: 'Tidak ada akun Trust Wallet / EVM yang aktif atau format alamat tidak valid.' };
    }

    const expected = String(orderSpec.expectedAddress || '').trim();
    if (EVM_ADDR_RE.test(expected) && expected.toLowerCase() !== signer.toLowerCase()) {
      return {
        ok: false,
        error: `[RLS SIGNER MISMATCH] Akun aktif di ekstensi (${signer.slice(0, 6)}...${signer.slice(-4)}) tidak cocok dengan alamat wallet terdaftar (${expected.slice(0, 6)}...${expected.slice(-4)}).`,
      };
    }

    const assetMeta = await resolveHyperliquidAssetMeta(orderSpec.symbol, Boolean(orderSpec.useTestnet));
    if (!assetMeta) {
      return {
        ok: false,
        error: `Instrumen Hyperliquid '${orderSpec.symbol}' tidak ditemukan pada metadata /info (asset index tidak dapat dipetakan dengan aman).`,
      };
    }

    const nonce = Date.now();
    const action = buildHyperliquidOrderAction({
      assetIndex: assetMeta.index,
      side: orderSpec.side,
      orderPurpose: orderSpec.orderPurpose,
      price: orderSpec.price,
      stopPrice: orderSpec.stopPrice,
      sizeUsd: orderSpec.sizeUsd,
      quantity: orderSpec.quantity,
      szDecimals: assetMeta.szDecimals,
      makerOnly: orderSpec.makerOnly !== false,
    });

    const typedData = buildHyperliquidEip712TypedData(action, nonce, Boolean(orderSpec.useTestnet));

    const rawSignature = await evmProvider.request({
      method: 'eth_signTypedData_v4',
      params: [signer, JSON.stringify(typedData)],
    });

    // Parse 65-byte hex signature into { r, s, v } as well as keeping rawSignature
    const cleanSig = String(rawSignature || '').replace(/^0x/, '');
    const r = cleanSig.length >= 64 ? `0x${cleanSig.slice(0, 64)}` : '0x0';
    const s = cleanSig.length >= 128 ? `0x${cleanSig.slice(64, 128)}` : '0x0';
    const vRaw = cleanSig.length >= 130 ? parseInt(cleanSig.slice(128, 130), 16) : 27;
    const v = vRaw < 27 ? vRaw + 27 : vRaw;

    return {
      ok: true,
      signedAction: {
        action,
        nonce,
        signature: { r, s, v },
        rawSignature: String(rawSignature),
        signedChainId: 1337,
        signer,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Tanda tangan EIP-712 dibatalkan oleh pengguna.',
    };
  }
}

/**
 * Signs any Hyperliquid L1 EIP-712 action (`updateLeverage` or `cancel`) via Trust Wallet / EVM extension
 * so browser-wallet users have 1:1 parity with server-side Agent Private Key execution!
 */
async function signHyperliquidEip712Action(params: {
  action: any;
  nonce?: number;
  useTestnet?: boolean;
  expectedAddress?: string;
}): Promise<{ ok: boolean; signedAction?: any; error?: string }> {
  const evmProvider = window.trustwallet || window.ethereum;
  if (!evmProvider) {
    return {
      ok: false,
      error: 'Ekstensi Trust Wallet / EVM diperlukan untuk menandatangani aksi Hyperliquid L1.',
    };
  }
  try {
    const accounts = await evmProvider.request({ method: 'eth_requestAccounts' });
    const signer = String(accounts?.[0] || '').trim();
    if (!signer || !EVM_ADDR_RE.test(signer)) {
      return { ok: false, error: 'Tidak ada akun Trust Wallet / EVM yang aktif.' };
    }
    const expected = String(params.expectedAddress || '').trim();
    if (EVM_ADDR_RE.test(expected) && expected.toLowerCase() !== signer.toLowerCase()) {
      return {
        ok: false,
        error: `[RLS SIGNER MISMATCH] Akun Trust Wallet aktif (${signer.slice(0, 6)}...${signer.slice(-4)}) tidak cocok dengan wallet terdaftar (${expected.slice(0, 6)}...${expected.slice(-4)}).`,
      };
    }
    const nonce = Number.isFinite(Number(params.nonce)) ? Number(params.nonce) : Date.now();
    const typedData = buildHyperliquidEip712TypedData(params.action, nonce, Boolean(params.useTestnet));
    const rawSignature = await evmProvider.request({
      method: 'eth_signTypedData_v4',
      params: [signer, JSON.stringify(typedData)],
    });
    const cleanSig = String(rawSignature || '').replace(/^0x/, '');
    const r = cleanSig.length >= 64 ? `0x${cleanSig.slice(0, 64)}` : '0x0';
    const s = cleanSig.length >= 128 ? `0x${cleanSig.slice(64, 128)}` : '0x0';
    const vRaw = cleanSig.length >= 130 ? parseInt(cleanSig.slice(128, 130), 16) : 27;
    const v = vRaw < 27 ? vRaw + 27 : vRaw;
    return {
      ok: true,
      signedAction: {
        action: params.action,
        nonce,
        signature: { r, s, v },
        rawSignature: String(rawSignature),
        signedChainId: 1337,
        signer,
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Tanda tangan EIP-712 dibatalkan oleh pengguna.',
    };
  }
}

/**
 * Builds an authentic Jupiter V1 VersionedTransaction on the backend and signs/broadcasts it
 * via Phantom Solana Wallet extension (non-custodial real on-chain execution).
 */
async function signAndBroadcastPhantomJupiterSwap(orderSpec: {
  symbol: string;
  baseTokenAddress?: string;
  side: 'LONG' | 'SHORT';
  orderPurpose: 'ENTRY_MAKER' | 'SCRATCH_EXIT' | 'BREAKEVEN_STOP';
  price: number;
  sizeUsd: number;
  quantity?: number;
  useTestnet?: boolean;
  expectedAddress?: string;
}): Promise<{
  ok: boolean;
  solanaTxSignature?: string;
  solanaSignedTxBase64?: string;
  solanaSigner?: string;
  expectedOutQty?: number;
  effectivePrice?: number;
  error?: string;
}> {
  if (orderSpec.useTestnet) {
    return {
      ok: false,
      error:
        'Jupiter V1 Aggregator hanya beroperasi di Solana Mainnet-Beta. Beralih ke mode REAL_MAINNET untuk swap Phantom live, atau gunakan Binance / Hyperliquid Testnet.',
    };
  }
  const provider = window.phantom?.solana || window.solana;
  if (!provider || typeof provider.connect !== 'function') {
    return {
      ok: false,
      error: 'Ekstensi Phantom Solana diperlukan untuk menandatangani & mengirim transaksi swap Jupiter V1 on-chain.',
    };
  }
  try {
    const resp = await provider.connect();
    const pubKey = String(resp.publicKey?.toString() || '').trim();
    if (!SOL_ADDR_RE.test(pubKey)) {
      return { ok: false, error: 'Public key Phantom tidak valid.' };
    }
    const expected = String(orderSpec.expectedAddress || '').trim();
    if (SOL_ADDR_RE.test(expected) && expected !== pubKey) {
      return {
        ok: false,
        error: `[RLS SIGNER MISMATCH] Akun Phantom aktif (${pubKey.slice(0, 4)}...${pubKey.slice(-4)}) berbeda dengan dompet Solana terdaftar (${expected.slice(0, 4)}...${expected.slice(-4)}).`,
      };
    }

    const buildRes = await fetch('/api/execute/solana-swap-tx', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol: orderSpec.symbol,
        baseTokenAddress: orderSpec.baseTokenAddress,
        side: orderSpec.side,
        orderPurpose: orderSpec.orderPurpose,
        sizeUsd: orderSpec.sizeUsd,
        quantity: orderSpec.quantity,
        userPublicKey: pubKey,
        useTestnet: Boolean(orderSpec.useTestnet),
      }),
    });
    const swapData = await buildRes.json();
    if (!swapData?.ok || !swapData?.swapTransaction) {
      return {
        ok: false,
        error: swapData?.error || 'Gagal menyusun transaksi swap Jupiter V1.',
      };
    }

    const txBytes = base64ToUint8Array(swapData.swapTransaction);
    const txBase58 = encodeBase58(txBytes);

    // 1. Official Phantom JSON-RPC signAndSendTransaction (accepts Base58 serialized VersionedTransaction natively)
    if (typeof provider.request === 'function') {
      const rpcRes = await provider.request({
        method: 'signAndSendTransaction',
        params: {
          message: txBase58,
          options: { skipPreflight: false, maxRetries: 3 },
        },
      });
      const sig = String(rpcRes?.signature || rpcRes || '').trim();
      if (sig) {
        return {
          ok: true,
          solanaTxSignature: sig,
          solanaSigner: pubKey,
          expectedOutQty: swapData.expectedOutQty,
          effectivePrice: swapData.effectivePrice,
        };
      }
    }

    // 2. Fallback: duck-typed VersionedTransaction object for provider.signAndSendTransaction / signTransaction
    const serializedWrapper = {
      serialize: () => txBytes,
      serializeMessage: () => txBytes,
    };
    if (typeof provider.signAndSendTransaction === 'function') {
      const sent = await provider.signAndSendTransaction(serializedWrapper, { skipPreflight: false });
      const sig = String(sent?.signature || '').trim();
      if (sig) {
        return {
          ok: true,
          solanaTxSignature: sig,
          solanaSigner: pubKey,
          expectedOutQty: swapData.expectedOutQty,
          effectivePrice: swapData.effectivePrice,
        };
      }
    }
    if (typeof provider.signTransaction === 'function') {
      const signed = await provider.signTransaction(serializedWrapper);
      const signedBytes = signed?.serialize?.();
      if (signedBytes && signedBytes.length > 0) {
        return {
          ok: true,
          solanaSignedTxBase64: uint8ArrayToBase64(signedBytes),
          solanaSigner: pubKey,
          expectedOutQty: swapData.expectedOutQty,
          effectivePrice: swapData.effectivePrice,
        };
      }
    }

    return {
      ok: false,
      error: 'Ekstensi Phantom pada sesi ini tidak mendukung signAndSendTransaction / signTransaction.',
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Transaksi swap Phantom Solana dibatalkan oleh pengguna.',
    };
  }
}

/**
 * Executes a real order on the selected Exchange (Binance, Bybit, OKX, Hyperliquid, Jupiter, Raydium)
 * protected by multi-layer Row-Level Security (RLS) ownership & capital guards.
 */
export async function executeRealOrderOnVenue(params: {
  exchange: ExchangeId;
  symbol: string;
  binanceSymbol: string;
  side: 'LONG' | 'SHORT';
  orderPurpose: 'ENTRY_MAKER' | 'SCRATCH_EXIT' | 'BREAKEVEN_STOP';
  sizeUsd: number;
  quantity?: number;
  price: number;
  stopPrice?: number;
  leverage?: number;
  makerOnly?: boolean;
  marketType?: MarketType;
  venueMode?: 'FUTURES' | 'SPOT';
  baseTokenAddress?: string;
  wallets: WalletConnectionState[];
  useTestnet: boolean;
  rowOwnerScope?: string;
  refMarkPrice?: number;
}): Promise<{
  ok: boolean;
  orderId?: string;
  txSignature?: string;
  explorerTxUrl?: string;
  status?: string;
  orderState?: 'FILLED' | 'PARTIALLY_FILLED' | 'RESTING';
  venueMode?: 'FUTURES' | 'SPOT';
  requestedQty?: number;
  filledQty?: number;
  executedQty?: number;
  executedPrice?: number;
  rlsOwnerId?: string;
  error?: string;
}> {
  const hlAgentWallet = params.wallets.find((w) => w.id === 'hyperliquid_agent');
  const wallet = resolveOwningWalletForExchange(params.exchange, params.wallets);

  if (!wallet || !wallet.connected) {
    return {
      ok: false,
      error: `Koneksi ${params.exchange} belum aktif. Buka menu Wallets / Portfolio untuk menghubungkan.`,
    };
  }

  if (!wallet.autoSignEnabled) {
    return {
      ok: false,
      error: `[RLS GUARD] Izin Auto-Sign pada ${wallet.name} sedang OFF. Aktifkan terlebih dahulu di menu Wallets.`,
    };
  }

  const readiness = isWalletReadyForRealExecution(wallet, params.useTestnet);
  if (!readiness.ok) {
    if (readiness.reason === 'ENV_MISMATCH') {
      return {
        ok: false,
        error: `[RLS ENV MISMATCH] ${wallet.name} terverifikasi untuk ${
          wallet.credentials?.useTestnet ? 'TESTNET' : 'MAINNET'
        }, tetapi mode aktif adalah ${params.useTestnet ? 'TESTNET' : 'MAINNET'}. Samakan mode atau verifikasi ulang wallet.`,
      };
    }
    if (readiness.reason === 'PAPER_PLACEHOLDER_OR_MISSING_CREDS') {
      return {
        ok: false,
        error: `[RLS REAL WALLET REQUIRED] ${wallet.name} belum terhubung ke kredensial/alamat real-money (masih sesi Paper). Hubungkan & verifikasi akun di menu Wallets & API.`,
      };
    }
  }

  const sessionOwnerScope = deriveWalletRlsOwnerScope(wallet);
  if (params.rowOwnerScope && params.rowOwnerScope !== sessionOwnerScope) {
    return {
      ok: false,
      error: `[RLS ISOLATION BLOCKED] Posisi ini terikat pada scope wallet berbeda (${params.rowOwnerScope}). Eksekusi lintas-akun ditolak.`,
    };
  }

  const isSpotRequest = params.marketType === 'SPOT' || params.venueMode === 'SPOT';
  const walletCaps = getWalletMarketCapabilities(wallet);
  const relevantAvailUsd = isSpotRequest
    ? walletCaps.availableSpotUsd > 0
      ? walletCaps.availableSpotUsd
      : wallet.balanceUsd
    : walletCaps.availableFuturesUsd > 0
      ? walletCaps.availableFuturesUsd
      : wallet.balanceUsd;
  const maxAllowedNotionalUsd = isSpotRequest
    ? relevantAvailUsd * 1.005 // Spot is strictly 1x cash (never 25x!)
    : relevantAvailUsd * Math.min(25, Math.max(1, Number(params.leverage || 1)) * 1.05);

  if (
    params.orderPurpose === 'ENTRY_MAKER' &&
    wallet.verifiedReal &&
    relevantAvailUsd > 0 &&
    params.sizeUsd > maxAllowedNotionalUsd
  ) {
    return {
      ok: false,
      error: `[RLS CAPITAL GUARD] Ukuran order ${isSpotRequest ? 'SPOT 1x' : `FUTURES ${Math.max(1, Number(params.leverage || 1))}x`} ($${params.sizeUsd.toLocaleString()}) melampaui batas aman eksposur terhadap saldo terverifikasi ($${relevantAvailUsd.toLocaleString()}, maks $${maxAllowedNotionalUsd.toFixed(2)}).`,
    };
  }

  const unsealedCredentials: WalletCredentials = {
    ...(wallet.credentials || {}),
    apiSecret: unsealCredentialSecret(wallet.credentials?.apiSecret),
    passphrase: unsealCredentialSecret(wallet.credentials?.passphrase),
    agentPrivateKey:
      unsealCredentialSecret(wallet.credentials?.agentPrivateKey) ||
      (params.exchange === 'HYPERLIQUID'
        ? unsealCredentialSecret(hlAgentWallet?.credentials?.agentPrivateKey)
        : ''),
  };

  let hlSignedAction: any = undefined;
  let hlSignedLeverage: any = undefined;
  const unsealedHlAgentKey = unsealCredentialSecret(hlAgentWallet?.credentials?.agentPrivateKey);
  if (params.exchange === 'HYPERLIQUID') {
    const effectiveAgentKey = (unsealedCredentials.agentPrivateKey || unsealedHlAgentKey || '').trim();
    const hasValidAgentKey =
      /^(0x)?[a-fA-F0-9]{64}$/.test(effectiveAgentKey) && !/^0x?0+$/i.test(effectiveAgentKey);

    if (hasValidAgentKey) {
      // Unattended server-side EIP-712 Phantom Agent signing + automatic updateLeverage sync (no browser popup!)
      unsealedCredentials.agentPrivateKey = effectiveAgentKey;
    } else {
      // Trust Wallet / EVM Extension interactive EIP-712 leverage sync before ENTRY_MAKER
      if (params.orderPurpose === 'ENTRY_MAKER' && Number(params.leverage) >= 1) {
        const assetMeta = await resolveHyperliquidAssetMeta(params.symbol, Boolean(params.useTestnet));
        if (assetMeta) {
          const clampedLev = Math.max(1, Math.min(assetMeta.maxLeverage || 20, Math.round(Number(params.leverage))));
          const levAction = buildHyperliquidLeverageAction({
            assetIndex: assetMeta.index,
            leverage: clampedLev,
            isCross: true,
          });
          const levSignRes = await signHyperliquidEip712Action({
            action: levAction,
            nonce: Date.now(),
            useTestnet: params.useTestnet,
            expectedAddress: unsealedCredentials.walletAddress,
          });
          if (!levSignRes.ok) {
            return { ok: false, error: levSignRes.error };
          }
          hlSignedLeverage = levSignRes.signedAction;
        }
      }

      const signRes = await signHyperliquidEip712Order({
        symbol: params.symbol,
        side: params.side,
        orderPurpose: params.orderPurpose,
        price: params.price,
        stopPrice: params.stopPrice,
        sizeUsd: params.sizeUsd,
        quantity: params.quantity,
        makerOnly: params.makerOnly,
        useTestnet: params.useTestnet,
        expectedAddress: unsealedCredentials.walletAddress,
      });
      if (!signRes.ok) {
        return { ok: false, error: signRes.error };
      }
      hlSignedAction = signRes.signedAction;
    }
  }

  let solanaTxSignature: string | undefined = undefined;
  let solanaSignedTxBase64: string | undefined = undefined;
  let solanaSigner: string | undefined = undefined;
  let expectedOutQty: number | undefined = undefined;
  let effectivePrice: number | undefined = undefined;
  if (params.exchange === 'JUPITER' || params.exchange === 'DEXSCREENER') {
    if (params.orderPurpose === 'BREAKEVEN_STOP') {
      return {
        ok: false,
        error:
          'Solana AMM Spot (Jupiter V1 / Phantom) tidak memiliki native conditional stop-loss di DEX pool; proteksi exit dipantau secara aktif oleh Agent.',
      };
    }
    const solSign = await signAndBroadcastPhantomJupiterSwap({
      symbol: params.symbol,
      baseTokenAddress: params.baseTokenAddress,
      side: params.side,
      orderPurpose: params.orderPurpose,
      price: params.price,
      sizeUsd: params.sizeUsd,
      quantity: params.quantity,
      useTestnet: params.useTestnet,
      expectedAddress: unsealedCredentials.walletAddress,
    });
    if (!solSign.ok) {
      return { ok: false, error: solSign.error || 'Swap Phantom Solana ditolak.' };
    }
    solanaTxSignature = solSign.solanaTxSignature;
    solanaSignedTxBase64 = solSign.solanaSignedTxBase64;
    solanaSigner = solSign.solanaSigner;
    expectedOutQty = solSign.expectedOutQty;
    effectivePrice = solSign.effectivePrice;
  }

  try {
    const res = await fetch('/api/execute/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exchange: params.exchange,
        symbol: params.symbol,
        binanceSymbol: params.binanceSymbol,
        side: params.side,
        orderPurpose: params.orderPurpose,
        sizeUsd: params.sizeUsd,
        quantity: params.quantity,
        price: params.price,
        stopPrice: params.stopPrice,
        leverage: params.leverage,
        makerOnly: params.makerOnly,
        marketType: params.marketType,
        venueMode: params.venueMode,
        refMarkPrice: params.refMarkPrice,
        credentials: unsealedCredentials,
        useTestnet: params.useTestnet,
        hlSignedLeverage,
        hlSignedAction,
        solanaTxSignature,
        solanaSignedTxBase64,
        solanaSigner,
        expectedOutQty,
        effectivePrice,
        rlsContext: {
          sessionOwnerScope,
          rowOwnerScope: params.rowOwnerScope || sessionOwnerScope,
          autoSignEnabled: wallet.autoSignEnabled,
          walletId: wallet.id,
          nonce: Date.now(),
        },
      }),
    });
    return await res.json();
  } catch (err: any) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Gagal mengirim order ke exchange gateway.',
    };
  }
}

/**
 * Cancels an active exchange order or conditional Stop-Loss before replace/close (#50).
 */
export async function cancelRealOrderOnVenue(params: {
  exchange: ExchangeId;
  symbol: string;
  binanceSymbol?: string;
  orderId: string;
  isAlgoOrder?: boolean;
  marketType?: MarketType;
  venueMode?: 'FUTURES' | 'SPOT';
  wallets: WalletConnectionState[];
  useTestnet: boolean;
  rowOwnerScope?: string;
}): Promise<{ ok: boolean; alreadyClosed?: boolean; error?: string }> {
  const wallet = resolveOwningWalletForExchange(params.exchange, params.wallets);
  if (!wallet || !wallet.connected) {
    return { ok: false, error: `Wallet ${params.exchange} tidak aktif.` };
  }
  const sessionOwnerScope = deriveWalletRlsOwnerScope(wallet);
  if (params.rowOwnerScope && params.rowOwnerScope !== sessionOwnerScope) {
    return { ok: false, error: '[RLS ISOLATION BLOCKED] Pembatalan order lintas-wallet ditolak.' };
  }
  const hlAgentWallet = params.wallets.find((w) => w.id === 'hyperliquid_agent');
  const unsealedCredentials: WalletCredentials = {
    ...(wallet.credentials || {}),
    apiSecret: unsealCredentialSecret(wallet.credentials?.apiSecret),
    passphrase: unsealCredentialSecret(wallet.credentials?.passphrase),
    agentPrivateKey:
      unsealCredentialSecret(wallet.credentials?.agentPrivateKey) ||
      (params.exchange === 'HYPERLIQUID'
        ? unsealCredentialSecret(hlAgentWallet?.credentials?.agentPrivateKey)
        : ''),
  };
  let hlSignedCancel: any = undefined;
  if (params.exchange === 'HYPERLIQUID') {
    const effKey = String(unsealedCredentials.agentPrivateKey || '').trim();
    const hasValidAgentKey = /^(0x)?[a-fA-F0-9]{64}$/.test(effKey) && !/^0x?0+$/i.test(effKey);
    if (!hasValidAgentKey) {
      const assetMeta = await resolveHyperliquidAssetMeta(params.symbol, Boolean(params.useTestnet));
      if (!assetMeta) {
        return { ok: false, error: `Aset Hyperliquid '${params.symbol}' tidak ditemukan untuk pembatalan order.` };
      }
      try {
        const cancelAction = buildHyperliquidCancelAction({
          assetIndex: assetMeta.index,
          orderId: params.orderId,
        });
        const cancelSign = await signHyperliquidEip712Action({
          action: cancelAction,
          nonce: Date.now(),
          useTestnet: params.useTestnet,
          expectedAddress: unsealedCredentials.walletAddress,
        });
        if (!cancelSign.ok) {
          return { ok: false, error: cancelSign.error };
        }
        hlSignedCancel = cancelSign.signedAction;
      } catch (err: any) {
        return { ok: false, error: err instanceof Error ? err.message : 'Order ID Hyperliquid tidak valid.' };
      }
    }
  }
  try {
    const res = await fetch('/api/execute/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exchange: params.exchange,
        symbol: params.symbol,
        binanceSymbol: params.binanceSymbol,
        orderId: params.orderId,
        isAlgoOrder: Boolean(params.isAlgoOrder),
        marketType: params.marketType,
        venueMode: params.venueMode,
        credentials: unsealedCredentials,
        hlSignedCancel,
        useTestnet: params.useTestnet,
        rlsContext: {
          sessionOwnerScope,
          rowOwnerScope: params.rowOwnerScope || sessionOwnerScope,
        },
      }),
    });
    return await res.json();
  } catch (err: any) {
    return { ok: false, error: err instanceof Error ? err.message : 'Gagal membatalkan order.' };
  }
}

/**
 * Queries real exchange fill status for a resting Post-Only limit order (#49).
 */
export async function fetchRealOrderStatusOnVenue(params: {
  exchange: ExchangeId;
  symbol: string;
  binanceSymbol?: string;
  orderId: string;
  marketType?: MarketType;
  venueMode?: 'FUTURES' | 'SPOT';
  wallets: WalletConnectionState[];
  useTestnet: boolean;
}): Promise<{
  ok: boolean;
  status?: string;
  orderState?: 'FILLED' | 'PARTIALLY_FILLED' | 'RESTING' | 'CANCELED';
  filledQty?: number;
  executedPrice?: number;
  error?: string;
}> {
  const wallet = resolveOwningWalletForExchange(params.exchange, params.wallets);
  if (!wallet || !wallet.connected) {
    return { ok: false, error: `Wallet ${params.exchange} tidak aktif.` };
  }
  const hlAgentWallet = params.wallets.find((w) => w.id === 'hyperliquid_agent');
  const unsealedCredentials: WalletCredentials = {
    ...(wallet.credentials || {}),
    apiSecret: unsealCredentialSecret(wallet.credentials?.apiSecret),
    passphrase: unsealCredentialSecret(wallet.credentials?.passphrase),
    agentPrivateKey:
      unsealCredentialSecret(wallet.credentials?.agentPrivateKey) ||
      (params.exchange === 'HYPERLIQUID'
        ? unsealCredentialSecret(hlAgentWallet?.credentials?.agentPrivateKey)
        : ''),
  };
  try {
    const res = await fetch('/api/execute/order-status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exchange: params.exchange,
        symbol: params.symbol,
        binanceSymbol: params.binanceSymbol,
        orderId: params.orderId,
        marketType: params.marketType,
        venueMode: params.venueMode,
        credentials: unsealedCredentials,
        useTestnet: params.useTestnet,
      }),
    });
    return await res.json();
  } catch (err: any) {
    return { ok: false, error: err instanceof Error ? err.message : 'Gagal cek status order.' };
  }
}

/**
 * Reconciles live open positions directly from a connected CEX exchange (#49).
 */
export async function fetchRealExchangePositions(
  wallet: WalletConnectionState,
  useTestnet: boolean
): Promise<{ ok: boolean; positions: any[]; error?: string }> {
  if (!wallet?.connected || !wallet.verifiedReal || !wallet.credentials) {
    return { ok: false, positions: [] };
  }
  const unsealedCredentials: WalletCredentials = {
    ...wallet.credentials,
    apiSecret: unsealCredentialSecret(wallet.credentials.apiSecret),
    passphrase: unsealCredentialSecret(wallet.credentials.passphrase),
    agentPrivateKey: unsealCredentialSecret(wallet.credentials.agentPrivateKey),
  };
  try {
    const res = await fetch('/api/account/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        providerId: wallet.id,
        credentials: unsealedCredentials,
        useTestnet,
      }),
    });
    const data = await res.json();
    return { ok: Boolean(data?.ok), positions: Array.isArray(data?.positions) ? data.positions : [], error: data?.error };
  } catch (err: any) {
    return { ok: false, positions: [], error: err instanceof Error ? err.message : 'Gagal sinkronisasi posisi.' };
  }
}

export interface ExchangeConfigHealthItem {
  priority: number;
  tier: 'PRIMARY' | 'SECONDARY';
  exchange: ExchangeId;
  providerId: WalletConnectionState['id'];
  label: string;
  reachable: boolean;
  futuresReachable?: boolean;
  spotReachable?: boolean;
  latencyMs: number;
  transport: string;
  useTestnet: boolean;
  error?: string;
  capabilities: {
    futures: boolean;
    spot: boolean;
    leverageSync: boolean;
    postOnlyMaker: boolean;
    protectiveStop: boolean;
    cancelOrder: boolean;
    orderStatus: boolean;
    positionsReconcile: boolean;
    serverTimeSync: boolean;
    unattendedAutonomous: boolean;
    autonomousSigningMode: string;
  };
}

/**
 * Queries live connectivity & capability parity across all 4 exchanges (#1 HYPERLIQUID, #2 BINANCE, #3 BYBIT, #4 OKX).
 */
export async function fetchAllExchangesConfigStatus(useTestnet = false): Promise<{
  ok: boolean;
  priorityOrder: ExchangeId[];
  primaryExchanges: ExchangeId[];
  allReachable: boolean;
  reachableCount: number;
  totalCount: number;
  exchanges: ExchangeConfigHealthItem[];
}> {
  try {
    const res = await fetch(`/api/exchanges/status?testnet=${useTestnet ? '1' : '0'}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return {
      ok: false,
      priorityOrder: ['HYPERLIQUID', 'BINANCE', 'BYBIT', 'OKX'],
      primaryExchanges: ['HYPERLIQUID', 'BINANCE'],
      allReachable: false,
      reachableCount: 0,
      totalCount: 4,
      exchanges: [],
    };
  }
}
