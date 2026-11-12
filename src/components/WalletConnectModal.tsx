import React, { useState } from 'react';
import { WalletConnectionState, WalletCredentials } from '../types/terminal';
import {
  connectBrowserExtensionWallet,
  FLEXIBLE_EVM_NETWORKS,
  saveWalletsToVault,
  switchEvmWalletNetwork,
  verifyRealAccountWithBackend,
} from '../engine/walletAdapter';

interface WalletConnectModalProps {
  isOpen: boolean;
  onClose: () => void;
  wallets: WalletConnectionState[];
  onUpdateWallets: React.Dispatch<React.SetStateAction<WalletConnectionState[]>>;
}

export const WalletConnectModal: React.FC<WalletConnectModalProps> = ({
  isOpen,
  onClose,
  wallets,
  onUpdateWallets,
}) => {
  const [expandedId, setExpandedId] = useState<WalletConnectionState['id'] | null>('hyperliquid_agent');
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<{
    tone: 'SUCCESS' | 'ERROR' | 'INFO';
    text: string;
  } | null>(null);

  if (!isOpen) return null;

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
      const nextCreds: WalletCredentials = {
        ...(w.credentials || {}),
        walletAddress: extRes.fullAddress,
      };
      const verifyRes = await verifyRealAccountWithBackend(w.id, nextCreds);
      setVerifyingId(null);

      onUpdateWallets((prev) => {
        const isEvm = w.id === 'trust' || w.id === 'hyperliquid_agent';
        const next = prev.map((item) => {
          if (item.id === w.id || (isEvm && (item.id === 'trust' || item.id === 'hyperliquid_agent'))) {
            return {
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
              credentials: {
                ...(item.credentials || {}),
                walletAddress: extRes.fullAddress,
              },
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

  const handleVerifyRealCredentials = async (w: WalletConnectionState) => {
    setVerifyingId(w.id);
    setStatusBanner(null);
    const creds = w.credentials || {};
    const res = await verifyRealAccountWithBackend(w.id, creds);
    setVerifyingId(null);

    if (!res.ok) {
      setStatusBanner({
        tone: 'ERROR',
        text: `[${w.name}] Verifikasi Gagal: ${res.error}`,
      });
      return;
    }

    onUpdateWallets((prev) => {
      const next = prev.map((item) =>
        item.id === w.id
          ? {
              ...item,
              connected: true,
              verifiedReal: true,
              autoSignEnabled: true,
              chainBalances: res.chainBalances || item.chainBalances,
              addressOrKeyId: res.addressDisplay || item.addressOrKeyId,
              balanceUsd: res.balanceUsd ?? item.balanceUsd,
            }
          : item
      );
      saveWalletsToVault(next);
      return next;
    });

    setStatusBanner({
      tone: 'SUCCESS',
      text: `[${w.name}] TERVERIFIKASI REAL! Saldo Multi-Chain Live: $${(
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
      <div className="w-full max-w-4xl bg-[#070A0F] border-2 border-[#FF9F1C] shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#0D131D] border-b border-[#1E2736]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 bg-[#FF9F1C] inline-block" />
            <h2 className="text-xs font-extrabold tracking-wider text-[#F8FAFC] uppercase">
              REAL-MONEY MULTI-WALLET (PHANTOM / TRUST / HL) & CEX API EXECUTION VAULT
            </h2>
          </div>
          <button
            onClick={onClose}
            className="px-2.5 py-0.5 text-xs font-bold text-[#94A3B8] hover:text-white border border-[#1E2736]"
          >
            ESC / CLOSE ✕
          </button>
        </div>

        {/* Security Notice */}
        <div className="px-4 py-2 bg-[#0A0E17] border-b border-[#1E2736] text-[11px] text-[#CBD5E1] flex items-center justify-between">
          <div>
            <span className="text-[#00E5FF] font-bold">PROTEKSI REAL-MONEY NON-CUSTODIAL:</span>{' '}
            Seluruh penandatanganan HMAC-SHA256 & EIP-712 diproses secara lokal di mesin Anda.
            Gunakan API Key / Agent Wallet dengan izin <strong>Trade-Only (Tanpa Withdraw)</strong>.
          </div>
          <span className="px-2 py-0.5 bg-[#00E676]/15 border border-[#00E676] text-[#00E676] text-[10px] font-extrabold whitespace-nowrap ml-2">
            LOCAL GATEWAY ACTIVE
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
                className={`p-3 border ${
                  w.verifiedReal
                    ? 'bg-[#081410] border-[#00E676]'
                    : w.connected
                      ? 'bg-[#0B1018] border-[#1E2F45]'
                      : 'bg-[#070A0E] border-[#161D2A]'
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
                            className="w-full px-2 py-1 bg-[#0B1018] border border-[#1E2B40] text-white focus:border-[#FF9F1C] focus:outline-none"
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
                                    className={`px-2 py-0.5 text-[9px] font-extrabold border transition-colors ${
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
                              className="w-full px-2 py-1 bg-[#0B1018] border border-[#1E2B40] text-white focus:border-[#FF9F1C] focus:outline-none"
                            />
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div>
                          <label className="block text-[9.5px] text-[#94A3B8] mb-0.5">
                            API KEY ({w.name.toUpperCase()})
                          </label>
                          <input
                            type="text"
                            value={creds.apiKey || ''}
                            onChange={(e) => updateCredentialField(w.id, 'apiKey', e.target.value)}
                            placeholder="Paste API Key Trade-Only..."
                            className="w-full px-2 py-1 bg-[#0B1018] border border-[#1E2B40] text-white focus:border-[#FF9F1C] focus:outline-none"
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
                            className="w-full px-2 py-1 bg-[#0B1018] border border-[#1E2B40] text-white focus:border-[#FF9F1C] focus:outline-none"
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
                              className="w-full px-2 py-1 bg-[#0B1018] border border-[#1E2B40] text-white focus:border-[#FF9F1C] focus:outline-none"
                            />
                          </div>
                        )}
                      </>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      {isWeb3 && (
                        <button
                          onClick={() => handleBrowserExtensionConnect(w)}
                          disabled={verifyingId === w.id}
                          className="flex-1 py-1 bg-[#142238] hover:bg-[#00E5FF] hover:text-black text-[#00E5FF] border border-[#00E5FF] font-extrabold text-[10px]"
                        >
                          {verifyingId === w.id
                            ? 'CONNECTING...'
                            : '1-CLICK BROWSER EXTENSION'}
                        </button>
                      )}
                      <button
                        onClick={() => handleVerifyRealCredentials(w)}
                        disabled={verifyingId === w.id}
                        className="flex-1 py-1 bg-[#00E676] hover:bg-[#26ff92] text-black font-extrabold text-[10px]"
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
                    className={`px-2 py-1 text-[10px] font-bold border ${
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
                      className="px-2.5 py-1 text-[10px] font-extrabold bg-[#131B2A] text-[#00E5FF] border border-[#1E2F48] hover:bg-[#1C283E]"
                    >
                      {isExpanded ? 'HIDE CONFIG' : 'SETUP REAL KEY / WALLET'}
                    </button>
                    {w.connected && (
                      <button
                        onClick={() => handleDisconnect(w)}
                        className="px-2 py-1 text-[10px] font-bold bg-[#1A1116] text-[#FF1744] border border-[#FF1744]/50 hover:bg-[#FF1744] hover:text-white"
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
            className="px-4 py-1 bg-[#FF9F1C] text-black font-extrabold text-xs"
          >
            SAVE & RETURN TO TERMINAL
          </button>
        </div>
      </div>
    </div>
  );
};
