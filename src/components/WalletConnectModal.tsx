import React, { useEffect, useState } from 'react';
import { ExecutionEnvironment, WalletConnectionState, WalletCredentials } from '../types/terminal';
import {
  connectBrowserExtensionWallet,
  FLEXIBLE_EVM_NETWORKS,
  pingExchangeVenueConnection,
  saveWalletsToVault,
  switchEvmWalletNetwork,
  verifyRealAccountWithBackend,
} from '../engine/walletAdapter';
import {
  computeWalletRowIntegrityTag,
  deriveWalletRlsOwnerScope,
} from '../engine/rlsSecurityGuard';

interface WalletConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallets: WalletConnectionState[];
  onUpdateWallets: React.Dispatch<React.SetStateAction<WalletConnectionState[]>>;
  executionEnv?: ExecutionEnvironment;
}

/**
 * Modal open/close animation + shared interaction styles. Keyframes are wrapped
 * in `prefers-reduced-motion: no-preference` so reduced-motion users get an
 * instant show/hide instead of the fade/scale transitions.
 */
const WALLET_MODAL_CSS = `
  @media (prefers-reduced-motion: no-preference) {
    @keyframes wmOverlayIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes wmOverlayOut { from { opacity: 1; } to { opacity: 0; } }
    @keyframes wmPanelIn {
      from { opacity: 0; transform: translateY(14px) scale(0.96); }
      to { opacity: 1; transform: translateY(0) scale(1); }
    }
    @keyframes wmPanelOut {
      from { opacity: 1; transform: translateY(0) scale(1); }
      to { opacity: 0; transform: translateY(10px) scale(0.97); }
    }
    .wm-overlay-in { animation: wmOverlayIn 170ms ease-out both; }
    .wm-overlay-out { animation: wmOverlayOut 170ms ease-in both; }
    .wm-panel-in { animation: wmPanelIn 180ms cubic-bezier(0.22, 1, 0.36, 1) both; }
    .wm-panel-out { animation: wmPanelOut 170ms ease-in both; }
  }
  .wm-btn {
    transition-property: color, background-color, border-color, box-shadow, transform, opacity;
    transition-duration: 150ms;
    transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
  }
  .wm-btn:active { transform: scale(0.97); }
  .wm-btn:focus-visible { outline: 2px solid #00E5FF; outline-offset: 2px; }
  .wm-glow:hover { box-shadow: 0 0 14px rgba(0, 229, 255, 0.35); }
  .wm-glow-green:hover { box-shadow: 0 0 14px rgba(0, 230, 118, 0.35); }
  .wm-input:focus-visible { outline: 2px solid #00E5FF; outline-offset: 1px; }
`;

export const WalletConnectModal: React.FC<WalletConnectModalProps> = ({
  isOpen,
  onClose,
  wallets,
  onUpdateWallets,
  executionEnv = 'PAPER_SANDBOX',
}) => {
  const [expandedId, setExpandedId] = useState<WalletConnectionState['id'] | null>('hyperliquid_agent');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [publicIpv4, setPublicIpv4] = useState<string>('');
  const [copiedIp, setCopiedIp] = useState<boolean>(false);
  const [statusBanner, setStatusBanner] = useState<{
    tone: 'SUCCESS' | 'ERROR' | 'INFO';
    text: string;
  } | null>(null);
  // Two-phase visibility so the exit animation can play before unmounting.
  const [visibility, setVisibility] = useState<'closed' | 'open' | 'closing'>('closed');

  useEffect(() => {
    if (isOpen) {
      setVisibility('open');
      pingExchangeVenueConnection('binance_api', false)
        .then((r) => {
          if (r.publicIp) setPublicIpv4(r.publicIp);
        })
        .catch(() => {});
      return;
    }
    setVisibility((prev) => (prev === 'open' ? 'closing' : 'closed'));
  }, [isOpen]);

  useEffect(() => {
    if (visibility !== 'closing') return;
    const t = window.setTimeout(() => setVisibility('closed'), 190);
    return () => window.clearTimeout(t);
  }, [visibility]);

  // Wire Escape key so "ESC / CLOSE ✕" actually closes the modal cleanly (placed before conditional return per Rules of Hooks)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (visibility === 'closed') return null;

  const updateCredentialField = (
    id: WalletConnectionState['id'],
    field: keyof WalletCredentials,
    value: string | boolean
  ) => {
    onUpdateWallets((prev) => {
      const next = prev.map((w) =>
        w.id === id
          ? {
              ...w,
              credentials: {
                ...(w.credentials || {}),
                [field]: value,
              },
            }
          : w
      );
      saveWalletsToVault(next);
      return next;
    });
  };

  const handleBrowserExtensionConnect = async (w: WalletConnectionState) => {
    if (w.id !== 'phantom' && w.id !== 'trust' && w.id !== 'hyperliquid_agent') return;
    setVerifyingId(w.id);
    const extRes = await connectBrowserExtensionWallet(w.id);

    if (extRes.ok && extRes.fullAddress) {
      const effectiveTestnet = executionEnv === 'EXCHANGE_TESTNET';
      const nextCreds: WalletCredentials = {
        ...(w.credentials || {}),
        walletAddress: extRes.fullAddress,
        useTestnet: effectiveTestnet,
      };
      const verifyRes = await verifyRealAccountWithBackend(w.id, nextCreds);
      setVerifyingId(null);

      onUpdateWallets((prev) => {
        const isEvm = w.id === 'trust' || w.id === 'hyperliquid_agent';
        const next = prev.map((item) => {
          if (item.id === w.id || (isEvm && (item.id === 'trust' || item.id === 'hyperliquid_agent'))) {
            const updatedRow: WalletConnectionState = {
              ...item,
              connected: true,
              verifiedReal: verifyRes.ok,
              autoSignEnabled: true,
              activeChainId: extRes.activeChainId || item.activeChainId || 42161,
              activeChainName: extRes.activeChainName || item.activeChainName || 'Arbitrum One (L2)',
              chainBalances: verifyRes.chainBalances || item.chainBalances,
              addressOrKeyId: verifyRes.addressDisplay || extRes.displayAddress,
              balanceUsd:
                verifyRes.ok && typeof verifyRes.balanceUsd === 'number'
                  ? verifyRes.balanceUsd
                  : item.balanceUsd,
              rlsPolicyStatus: 'ENFORCED',
              credentials: {
                ...(item.credentials || {}),
                walletAddress: extRes.fullAddress,
                useTestnet: effectiveTestnet,
              },
            };
            return {
              ...updatedRow,
              rlsOwnerScope: deriveWalletRlsOwnerScope(updatedRow),
              rlsIntegrityTag: computeWalletRowIntegrityTag(updatedRow),
            };
          }
          return item;
        });
        saveWalletsToVault(next);
        return next;
      });

      setStatusBanner({
        tone: 'SUCCESS',
        text: `${w.name} terhubung via Browser Extension (${extRes.fullAddress.slice(
          0,
          6
        )}...${extRes.fullAddress.slice(-4)} pada ${
          extRes.activeChainName || 'Multi-Chain'
        }). Multi-Chain Balance: $${(verifyRes.balanceUsd ?? 0).toLocaleString()}`,
      });
    } else {
      setVerifyingId(null);
      setExpandedId(w.id);
      setStatusBanner({
        tone: 'INFO',
        text: extRes.displayAddress,
      });
    }
  };

  const handleSwitchChainInModal = async (targetChainId: number) => {
    const res = await switchEvmWalletNetwork(targetChainId);
    if (res.ok) {
      onUpdateWallets((prev) => {
        const next = prev.map((w) =>
          w.id === 'trust' || w.id === 'hyperliquid_agent'
            ? { ...w, activeChainId: res.chainId, activeChainName: res.chainName }
            : w
        );
        saveWalletsToVault(next);
        return next;
      });
      setStatusBanner({
        tone: 'SUCCESS',
        text: `Jaringan Trust Wallet / EVM aktif dialihkan ke: ${res.chainName} (Chain ID: ${res.chainId}). Auto-Sync EIP-712 siap!`,
      });
    } else {
      setStatusBanner({
        tone: 'ERROR',
        text: res.error || 'Gagal mengganti jaringan di Trust Wallet.',
      });
    }
  };

  const handlePingVenueServer = async (w: WalletConnectionState) => {
    setVerifyingId(w.id);
    setStatusBanner(null);
    const res = await pingExchangeVenueConnection(w.id, Boolean(w.credentials?.useTestnet));
    if (res.publicIp) setPublicIpv4(res.publicIp);
    setVerifyingId(null);
    setStatusBanner({
      tone: res.ok ? 'SUCCESS' : 'ERROR',
      text: `[${w.name}] ${res.message}`,
    });
  };

  const handleCopyPublicIp = async () => {
    if (!publicIpv4) return;
    try {
      await navigator.clipboard.writeText(publicIpv4);
      setCopiedIp(true);
      setTimeout(() => setCopiedIp(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleVerifyRealCredentials = async (w: WalletConnectionState) => {
    setVerifyingId(w.id);
    setStatusBanner(null);
    const creds = w.credentials || {};
    const res = await verifyRealAccountWithBackend(w.id, creds);
    if (res.publicIp) setPublicIpv4(res.publicIp);
    setVerifyingId(null);

    if (!res.ok) {
      setStatusBanner({
        tone: 'ERROR',
        text: `[${w.name}] Verifikasi Gagal: ${res.error}`,
      });
      return;
    }

    const effectiveTestnet =
      typeof res.resolvedUseTestnet === 'boolean'
        ? res.resolvedUseTestnet
        : Boolean(creds.useTestnet);

    onUpdateWallets((prev) => {
      const isEvmPair = w.id === 'trust' || w.id === 'hyperliquid_agent';
      const verifiedAddrLower = String(creds.walletAddress || '').trim().toLowerCase();
      const next = prev.map((item) => {
        const sharesEvmWallet =
          isEvmPair &&
          (item.id === 'trust' || item.id === 'hyperliquid_agent') &&
          verifiedAddrLower.length === 42 &&
          (item.id === w.id ||
            String(item.credentials?.walletAddress || '').trim().toLowerCase() === verifiedAddrLower ||
            !item.verifiedReal);
        if (item.id !== w.id && !sharesEvmWallet) return item;
        const updatedRow: WalletConnectionState = {
          ...item,
          connected: true,
          verifiedReal: true,
          autoSignEnabled: true,
          chainBalances: res.chainBalances || item.chainBalances,
          futuresEnabled:
            typeof res.futuresEnabled === 'boolean' ? res.futuresEnabled : item.futuresEnabled,
          spotEnabled: typeof res.spotEnabled === 'boolean' ? res.spotEnabled : item.spotEnabled,
          futuresBalanceUsd:
            typeof res.futuresBalanceUsd === 'number'
              ? res.futuresBalanceUsd
              : item.futuresBalanceUsd,
          spotBalanceUsd:
            typeof res.spotBalanceUsd === 'number' ? res.spotBalanceUsd : item.spotBalanceUsd,
          addressOrKeyId: res.addressDisplay || item.addressOrKeyId,
          balanceUsd: res.balanceUsd ?? item.balanceUsd,
          rlsPolicyStatus: 'ENFORCED',
          credentials: {
            ...(item.credentials || {}),
            ...(isEvmPair && creds.walletAddress ? { walletAddress: creds.walletAddress } : {}),
            useTestnet: effectiveTestnet,
          },
        };
        return {
          ...updatedRow,
          rlsOwnerScope: deriveWalletRlsOwnerScope(updatedRow),
          rlsIntegrityTag: computeWalletRowIntegrityTag(updatedRow),
        };
      });
      saveWalletsToVault(next);
      return next;
    });

    setStatusBanner({
      tone: 'SUCCESS',
      text: `[${w.name}] TERVERIFIKASI REAL (${effectiveTestnet ? 'Testnet' : 'Mainnet'})! Saldo Live: $${(
        res.balanceUsd ?? 0
      ).toLocaleString()} (${res.addressDisplay})`,
    });
  };

  const handleDisconnect = (w: WalletConnectionState) => {
    onUpdateWallets((prev) => {
      const next = prev.map((item) =>
        item.id === w.id
          ? {
              ...item,
              connected: false,
              verifiedReal: false,
              autoSignEnabled: false,
              addressOrKeyId: 'Disconnected',
            }
          : item
      );
      saveWalletsToVault(next);
      return next;
    });
    setStatusBanner({
      tone: 'INFO',
      text: `${w.name} telah diputus dari sesi eksekusi.`,
    });
  };

  const handleToggleAutoSign = (id: WalletConnectionState['id']) => {
    onUpdateWallets((prev) => {
      const next = prev.map((w) =>
        w.id === id ? { ...w, autoSignEnabled: !w.autoSignEnabled } : w
      );
      saveWalletsToVault(next);
      return next;
    });
  };

  return (
    <>
      <style>{WALLET_MODAL_CSS}</style>
      <div
        data-testid="wallet-modal-overlay"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
        className={`fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4 ${
          visibility === 'closing' ? 'wm-overlay-out' : 'wm-overlay-in'
        }`}
      >
        <div
          data-testid="wallet-modal-panel"
          className={`w-full max-w-4xl bg-[#070A0F] border-2 border-[#FF9F1C] shadow-2xl flex flex-col max-h-[90vh] ${
            visibility === 'closing' ? 'wm-panel-out' : 'wm-panel-in'
          }`}
        >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0D131D] border-b border-[#1E2736]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#FF9F1C] inline-block" />
            <h2 className="text-xs font-extrabold tracking-wider text-[#F8FAFC] uppercase">
              REAL-MONEY MULTI-WALLET (PHANTOM / TRUST / HL) & CEX API EXECUTION VAULT
            </h2>
          </div>
          <button
            data-testid="wallet-modal-close"
            onClick={onClose}
            className="wm-btn px-2.5 py-0.5 text-xs font-bold text-[#94A3B8] hover:text-white hover:bg-[#FF1744]/20 border border-[#1E2736] hover:border-[#FF1744]"
          >
            ESC / CLOSE ✕
          </button>
        </div>

        {/* Security Notice */}
        <div
          data-testid="wallet-rls-security-banner"
          className="px-4 py-2 bg-[#0A0E17] border-b border-[#1E2736] text-[11px] text-[#CBD5E1] flex items-center justify-between"
        >
          <div>
            <span className="text-[#00E5FF] font-bold">PROTEKSI RLS (ROW-LEVEL SECURITY) & REAL-MONEY 5-LAYER SHIELD:</span>{' '}
            Isolasi pemilik sesi per-wallet, segel brankas kriptografi lokal, anti-replay nonce 5 menit, proteksi harga mark oracle, & izin{' '}
            <strong>Trade-Only (Tanpa Withdraw)</strong>.
          </div>
          <span
            data-testid="wallet-rls-enforced-badge"
            className="px-2 py-0.5 bg-[#00E676]/15 border border-[#00E676] text-[#00E676] text-[10px] font-extrabold whitespace-nowrap ml-2"
          >
            RLS 5-LAYER ACTIVE
          </span>
        </div>

        {statusBanner && (
          <div
            className={`px-4 py-2 border-b text-[11px] font-bold ${
              statusBanner.tone === 'SUCCESS'
                ? 'bg-[#00E676]/15 border-[#00E676]/50 text-[#00E676]'
                : statusBanner.tone === 'ERROR'
                  ? 'bg-[#FF1744]/20 border-[#FF1744] text-[#FF1744]'
                  : 'bg-[#00E5FF]/15 border-[#00E5FF]/50 text-[#00E5FF]'
            }`}
          >
            {statusBanner.text}
          </div>
        )}

        {/* Wallets & CEX Cards */}
        <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3 overflow-y-auto flex-1">
          {wallets.map((w) => {
            const isExpanded = expandedId === w.id;
            const creds = w.credentials || {};
            const isWeb3 = w.id === 'phantom' || w.id === 'trust' || w.id === 'hyperliquid_agent';

            return (
              <div
                key={w.id}
                data-testid={`wallet-option-${w.id}`}
                className={`p-3 border transition-colors duration-150 ${
                  w.verifiedReal
                    ? 'bg-[#081410] border-[#00E676]'
                    : w.connected
                      ? 'bg-[#0B1018] border-[#1E2F45] hover:border-[#00E5FF]/50'
                      : 'bg-[#070A0E] border-[#161D2A] hover:border-[#00E5FF]/40'
                } flex flex-col justify-between gap-2.5`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          w.verifiedReal
                            ? 'bg-[#00E676] animate-ping'
                            : w.connected
                              ? 'bg-[#FF9F1C]'
                              : 'bg-[#64748B]'
                        }`}
                      />
                      <span className="text-xs font-extrabold text-white">{w.name}</span>
                      <span
                        className={`px-1.5 py-0.5 text-[9px] font-bold border ${
                          w.verifiedReal
                            ? 'bg-[#00E676] text-black border-[#00E676]'
                            : 'bg-[#141C2B] text-[#00E5FF] border-[#1E2B40]'
                        }`}
                      >
                        {w.verifiedReal ? '✓ REAL VERIFIED' : w.type}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#94A3B8] mt-0.5">{w.chainOrScope}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs font-extrabold text-[#00E676]">
                      ${w.balanceUsd.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-[9.5px] text-[#64748B]">
                      {w.verifiedReal ? 'Live Equity' : w.connected ? 'Paper Equity' : 'Offline'}
                    </div>
                  </div>
                </div>

                <div className="px-2 py-1 bg-[#05070B] border border-[#141C29] text-[10px] flex items-center justify-between">
                  <span className="text-[#64748B]">STATUS / KEY:</span>
                  <span className="text-[#FF9F1C] font-semibold truncate max-w-[230px]">
                    {w.addressOrKeyId}
                  </span>
                </div>

                <div
                  data-testid={`wallet-rls-scope-${w.id}`}
                  className="px-2 py-0.5 bg-[#070C14] border border-[#142235] text-[9.5px] flex items-center justify-between"
                >
                  <span className="text-[#00E5FF] font-bold">RLS ROW SCOPE:</span>
                  <span className="text-[#00E676] font-mono truncate max-w-[220px]">
                    {(w.rlsOwnerScope || deriveWalletRlsOwnerScope(w)).slice(0, 24)} • SEALED
                  </span>
                </div>

                {/* Expandable Real-Money Credential Form */}
                {isExpanded && (
                  <div className="p-2.5 bg-[#05070B] border border-[#26354D] space-y-2 text-[10.5px]">
                    <div className="flex items-center justify-between text-[#00E5FF] font-bold border-b border-[#162030] pb-1">
                      <span>KONFIGURASI KREDENSIAL REAL-MONEY</span>
                      <label className="flex items-center gap-1 text-[10px] text-[#FF9F1C] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={Boolean(creds.useTestnet)}
                          onChange={(e) =>
                            updateCredentialField(w.id, 'useTestnet', e.target.checked)
                          }
                          className="wm-input accent-[#FF9F1C]"
                        />
                        Gunakan Testnet
                      </label>
                    </div>

                    {isWeb3 ? (
                      <>
                        <div>
                          <label className="block text-[9.5px] text-[#94A3B8] mb-0.5">
                            {w.id === 'phantom'
                              ? 'ALAMAT PUBLIC SOLANA (PHANTOM)'
                              : 'ALAMAT WALLET UTAMA EVM / HYPERLIQUID (0x...)'}
                          </label>
                          <input
                            type="text"
                            value={creds.walletAddress || ''}
                            onChange={(e) =>
                              updateCredentialField(w.id, 'walletAddress', e.target.value)
                            }
                            placeholder={
                              w.id === 'phantom'
                                ? 'Contoh: 7xQpL92mN4vR8cK1wZ3yT9mK2...'
                                : 'Contoh: 0xdfc24b077bc1425ad1dea75bcb6f8158e10df303'
                            }
                            className="wm-input w-full px-2 py-1 bg-[#0B1018] border border-[#1E2B40] text-white focus:border-[#FF9F1C] focus:outline-none"
                          />
                        </div>
                        {(w.id === 'trust' || w.id === 'hyperliquid_agent') && (
                          <div>
                            <label className="block text-[9.5px] text-[#00E5FF] font-bold mb-1">
                              JARINGAN FLEKSIBEL AKTIF (AUTO-CHAIN-ID SYNC — ANTI REJECT):
                            </label>
                            <div className="flex flex-wrap gap-1">
                              {FLEXIBLE_EVM_NETWORKS.map((net) => {
                                const isActiveNet = (w.activeChainId || 42161) === net.chainId;
                                return (
                                  <button
                                    key={net.chainId}
                                    type="button"
                                    onClick={() => handleSwitchChainInModal(net.chainId)}
                                    className={`wm-btn px-2 py-0.5 text-[9px] font-extrabold border ${
                                      isActiveNet
                                        ? 'bg-[#FF9F1C] text-black border-[#FF9F1C]'
                                        : 'bg-[#0C121D] text-[#94A3B8] border-[#1E2B40] hover:text-white'
                                    }`}
                                  >
                                    {net.shortName}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                        {w.id === 'hyperliquid_agent' && (
                          <div>
                            <label className="block text-[9.5px] text-[#94A3B8] mb-0.5">
                              HYPERLIQUID AGENT PRIVATE KEY (OPSIONAL — TRADE ONLY)
                            </label>
                            <input
                              type="password"
                              value={creds.agentPrivateKey || ''}
                              onChange={(e) =>
                                updateCredentialField(w.id, 'agentPrivateKey', e.target.value)
                              }
                              placeholder="0x... (Kosongkan jika tanda tangan langsung via ekstensi)"
                              className="wm-input w-full px-2 py-1 bg-[#0B1018] border border-[#1E2B40] text-white focus:border-[#FF9F1C] focus:outline-none"
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {w.id === 'binance_api' && (
                          <div
                            data-testid="binance-ip-whitelist-helper"
                            className="p-2 bg-[#091320] border border-[#1E3A5F] text-[9.5px] text-[#CBD5E1] space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[#00E5FF] font-extrabold">
                                IP PUBLIK WHITELIST BINANCE ANDA:
                              </span>
                              <div className="flex items-center gap-1.5">
                                <code className="px-1.5 py-0.5 bg-[#05080F] border border-[#00E676]/50 text-[#00E676] font-extrabold">
                                  {publicIpv4 || 'Mendeteksi...'}
                                </code>
                                {publicIpv4 && (
                                  <button
                                    type="button"
                                    onClick={handleCopyPublicIp}
                                    className="wm-btn px-1.5 py-0.5 bg-[#FF9F1C] text-black font-extrabold text-[9px]"
                                  >
                                    {copiedIp ? '✓ COPIED' : 'COPY IP'}
                                  </button>
                                )}
                              </div>
                            </div>
                            <div className="text-[#94A3B8] leading-tight">
                              Agar <strong>Enable Spot & Margin</strong> dan <strong>Enable Futures</strong> bisa dicentang di Binance: klik <strong>Edit restrictions</strong> &rarr; pilih <strong>Restrict access to trusted IPs only</strong> &rarr; paste IP di atas &rarr; klik <strong>Confirm</strong> (buka tab Futures di Binance lebih dulu jika membuat API Key Futures baru).
                            </div>
                          </div>
                        )}
                        <div>
                          <label className="block text-[9.5px] text-[#94A3B8] mb-0.5">
                            API KEY ({w.name.toUpperCase()})
                          </label>
                          <input
                            type="text"
                            value={creds.apiKey || ''}
                            onChange={(e) => updateCredentialField(w.id, 'apiKey', e.target.value)}
                            placeholder="Paste API Key Trade-Only..."
                            className="wm-input w-full px-2 py-1 bg-[#0B1018] border border-[#1E2B40] text-white focus:border-[#FF9F1C] focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[9.5px] text-[#94A3B8] mb-0.5">
                            API SECRET (HMAC-SHA256)
                          </label>
                          <input
                            type="password"
                            value={creds.apiSecret || ''}
                            onChange={(e) =>
                              updateCredentialField(w.id, 'apiSecret', e.target.value)
                            }
                            placeholder="Paste API Secret..."
                            className="wm-input w-full px-2 py-1 bg-[#0B1018] border border-[#1E2B40] text-white focus:border-[#FF9F1C] focus:outline-none"
                          />
                        </div>
                        {w.id === 'okx_api' && (
                          <div>
                            <label className="block text-[9.5px] text-[#94A3B8] mb-0.5">
                              OKX API PASSPHRASE
                            </label>
                            <input
                              type="password"
                              value={creds.passphrase || ''}
                              onChange={(e) =>
                                updateCredentialField(w.id, 'passphrase', e.target.value)
                              }
                              placeholder="Paste OKX Passphrase..."
                              className="wm-input w-full px-2 py-1 bg-[#0B1018] border border-[#1E2B40] text-white focus:border-[#FF9F1C] focus:outline-none"
                            />
                          </div>
                        )}
                      </>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      {isWeb3 ? (
                        <button
                          onClick={() => handleBrowserExtensionConnect(w)}
                          disabled={verifyingId === w.id}
                          className="wm-btn wm-glow flex-1 py-1 bg-[#142238] hover:bg-[#00E5FF] hover:text-black text-[#00E5FF] border border-[#00E5FF] font-extrabold text-[10px] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {verifyingId === w.id
                            ? 'CONNECTING...'
                            : '1-CLICK BROWSER EXTENSION'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          data-testid={`wallet-ping-${w.id}`}
                          onClick={() => handlePingVenueServer(w)}
                          disabled={verifyingId === w.id}
                          className="wm-btn wm-glow flex-1 py-1 bg-[#142238] hover:bg-[#00E5FF] hover:text-black text-[#00E5FF] border border-[#00E5FF] font-extrabold text-[10px] disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                          {verifyingId === w.id
                            ? 'TESTING...'
                            : '⚡ TEST KONEKSI SERVER'}
                        </button>
                      )}
                      <button
                        onClick={() => handleVerifyRealCredentials(w)}
                        disabled={verifyingId === w.id}
                        className="wm-btn wm-glow-green flex-1 py-1 bg-[#00E676] hover:bg-[#26ff92] text-black font-extrabold text-[10px] disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {verifyingId === w.id
                          ? 'VERIFYING...'
                          : 'VERIFY & SYNC REAL BALANCE'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Bottom Card Actions */}
                <div className="flex items-center justify-between pt-1">
                  <button
                    onClick={() => handleToggleAutoSign(w.id)}
                    disabled={!w.connected}
                    className={`wm-btn px-2 py-1 text-[10px] font-bold border disabled:cursor-not-allowed ${
                      w.connected && w.autoSignEnabled
                        ? 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]'
                        : 'bg-[#0D121B] text-[#64748B] border-[#1E2736]'
                    }`}
                  >
                    {w.connected && w.autoSignEnabled ? '● AUTO-SIGN ON' : '○ AUTO-SIGN OFF'}
                  </button>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : w.id)}
                      className="wm-btn px-2.5 py-1 text-[10px] font-extrabold bg-[#131B2A] text-[#00E5FF] border border-[#1E2F48] hover:bg-[#1C283E]"
                    >
                      {isExpanded ? 'HIDE CONFIG' : 'SETUP REAL KEY / WALLET'}
                    </button>
                    {w.connected && (
                      <button
                        onClick={() => handleDisconnect(w)}
                        className="wm-btn px-2 py-1 text-[10px] font-bold bg-[#1A1116] text-[#FF1744] border border-[#FF1744]/50 hover:bg-[#FF1744] hover:text-white"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#0B0F17] border-t border-[#1E2736] flex items-center justify-between text-[11px]">
          <div className="flex items-center gap-4">
            <span className="text-[#94A3B8]">
              Total Unified Purchasing Power:{' '}
              <span className="text-[#00E676] font-extrabold">
                $
                {wallets
                  .filter((w) => w.connected)
                  .reduce((s, w) => s + w.balanceUsd, 0)
                  .toLocaleString(undefined, { maximumFractionDigits: 2 })}
              </span>
            </span>
            <span className="text-[#00E5FF] font-bold">
              Verified Real Accounts: {wallets.filter((w) => w.verifiedReal).length} / {wallets.length}
            </span>
          </div>
          <button
            onClick={onClose}
            className="wm-btn px-4 py-1 bg-[#FF9F1C] text-black font-extrabold text-xs hover:bg-[#FFB84D] hover:shadow-[0_0_14px_rgba(255,159,28,0.45)]"
          >
            SAVE & RETURN TO TERMINAL
          </button>
        </div>
        </div>
      </div>
    </>
  );
};
