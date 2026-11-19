import React, { useEffect, useState } from 'react';
import { ClosedTradeLog } from '../types/terminal';

interface VaultSettlementCourier3DVizProps {
  closedTrades: ClosedTradeLog[];
  hideLedger?: boolean;
  selectedTradeIdOverride?: string;
  onSelectTrade?: (id: string) => void;
}

export const VaultSettlementCourier3DViz: React.FC<VaultSettlementCourier3DVizProps> = ({
  closedTrades,
  hideLedger = false,
  selectedTradeIdOverride,
  onSelectTrade,
}) => {
  const [internalSelectedTradeId, setInternalSelectedTradeId] = useState<string>(
    closedTrades[0]?.id || ''
  );
  const [filterMode, setFilterMode] = useState<'ALL' | 'PROFIT_IN' | 'LOSS_OUT'>('ALL');

  const selectedTradeId = selectedTradeIdOverride ?? internalSelectedTradeId;
  const handleSelectTrade = (id: string) => {
    setInternalSelectedTradeId(id);
    onSelectTrade?.(id);
  };

  // Whenever a new position closes in real time, automatically focus the newest closed trade
  useEffect(() => {
    if (closedTrades.length > 0 && closedTrades[0]?.id) {
      setInternalSelectedTradeId(closedTrades[0].id);
    }
  }, [closedTrades[0]?.id, closedTrades.length]);

  const profitTrades = closedTrades.filter((t) => t.realizedPnlUsd >= 0);
  const lossTrades = closedTrades.filter((t) => t.realizedPnlUsd < 0);

  const totalProfitInUsd = profitTrades.reduce((acc, t) => acc + t.realizedPnlUsd, 0);
  const totalLossOutUsd = lossTrades.reduce((acc, t) => acc + Math.abs(t.realizedPnlUsd), 0);
  const netVaultBalanceUsd = totalProfitInUsd - totalLossOutUsd;
  const winRatePct =
    closedTrades.length > 0 ? Math.round((profitTrades.length / closedTrades.length) * 100) : 100;

  const activeTrade =
    closedTrades.find((t) => t.id === selectedTradeId) || closedTrades[0] || null;
  const isProfitActive = activeTrade ? activeTrade.realizedPnlUsd >= 0 : true;

  const latestProfitTrade =
    (activeTrade && activeTrade.realizedPnlUsd >= 0 ? activeTrade : profitTrades[0]) || null;
  const latestLossTrade =
    (activeTrade && activeTrade.realizedPnlUsd < 0 ? activeTrade : lossTrades[0]) || null;

  const filteredTrades = closedTrades.filter((t) => {
    if (filterMode === 'PROFIT_IN') return t.realizedPnlUsd >= 0;
    if (filterMode === 'LOSS_OUT') return t.realizedPnlUsd < 0;
    return true;
  });

  return (
    <div
      data-testid="vault-settlement-courier-3d-viz"
      className={`bg-[#050811] border border-[#1B2B45] p-2.5 flex flex-col gap-2 ${
        hideLedger ? '' : 'h-full'
      }`}
    >
      {/* Header Banner: Real-Time Dual-Vault Profit Inflow & External Loss Outflow Summary */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 pb-1.5 border-b border-[#162338]">
        <div className="flex items-center gap-2">
          <span className="px-1.5 py-0.5 bg-[#00E676] text-black font-extrabold text-[9px]">
            3D VAULT COURIER
          </span>
          <span className="font-extrabold text-white text-[10px] tracking-wide">
            ALIRAN PROFIT (MASUK BRANKAS) vs KERUGIAN (KELUAR EKSTERNAL)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 font-mono text-[9px]">
          <span
            data-testid="vault-total-profit-in"
            className="px-1.5 py-0.5 bg-[#00E676]/15 border border-[#00E676] text-[#00E676] font-extrabold"
          >
            📥 MASUK BRANKAS: +${totalProfitInUsd.toFixed(2)} ({profitTrades.length})
          </span>
          <span
            data-testid="vault-total-loss-out"
            className="px-1.5 py-0.5 bg-[#FF1744]/15 border border-[#FF1744] text-[#FF1744] font-extrabold"
          >
            📤 KELUAR EKSTERNAL: -${totalLossOutUsd.toFixed(2)} ({lossTrades.length})
          </span>
          <span
            data-testid="vault-net-saved"
            className="px-1.5 py-0.5 bg-[#00E5FF]/15 border border-[#00E5FF] text-[#00E5FF] font-extrabold"
          >
            🏦 BERSIH: {netVaultBalanceUsd >= 0 ? '+' : '-'}$
            {Math.abs(netVaultBalanceUsd).toFixed(2)} ({winRatePct}% WIN)
          </span>
        </div>
      </div>

      {/* 2D / Semi-3D Isometric Dual-Vault & Courier Agent SVG Stage */}
      <div className="w-full bg-gradient-to-b from-[#111927] via-[#0E1522] to-[#0C121D] border border-[#223047] relative overflow-hidden rounded-lg">
        <svg
          viewBox="0 0 900 230"
          className="w-full h-[210px] sm:h-[235px] block select-none"
          role="img"
          aria-label="3D Isometric Profit Vault Inflow and External Loss Vault Outflow Courier Agent"
        >
          <defs>
            <radialGradient id="profitVaultGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#34D399" stopOpacity="0.38" />
              <stop offset="70%" stopColor="#34D399" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#050811" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="lossVaultGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#F87171" stopOpacity="0.34" />
              <stop offset="70%" stopColor="#F87171" stopOpacity="0.06" />
              <stop offset="100%" stopColor="#050811" stopOpacity="0" />
            </radialGradient>
            <radialGradient id="courierHubGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#56B6F7" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#050811" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* Isometric 3D Perspective Floor Grid */}
          <g opacity="0.55" pointerEvents="none">
            <polygon
              points="450,15 860,118 450,220 40,118"
              fill="none"
              stroke="#192A45"
              strokeWidth="1"
            />
            <polygon
              points="450,42 750,118 450,194 150,118"
              fill="none"
              stroke="#152338"
              strokeWidth="1"
              strokeDasharray="5 4"
            />
            <line x1="150" y1="118" x2="750" y2="118" stroke="#16263E" strokeWidth="1.5" />
            <line x1="450" y1="15" x2="450" y2="220" stroke="#132035" strokeWidth="1" />
          </g>

          {/* ==================== LEFT CONDUIT: PROFIT STREAM INTO INTERNAL VAULT (450 -> 165) ==================== */}
          <g pointerEvents="none">
            {/* Isometric 3D Conveyor Track (Center Hub -> Left Profit Vault) */}
            <polygon
              points="410,112 410,126 215,118 215,104"
              fill="#34D399"
              fillOpacity="0.12"
              stroke="#34D399"
              strokeWidth="1"
              strokeOpacity="0.45"
            />
            <line
              x1="410"
              y1="119"
              x2="215"
              y2="111"
              stroke="#34D399"
              strokeWidth="3"
              className="iso-beam-anim"
            />

            {/* Animated Courier Drone / Profit Capsule Carrying Profit to Left Vault */}
            {latestProfitTrade && (
              <g className="iso-courier-profit" opacity={isProfitActive ? 1 : 0.72}>
                {/* 3D Isometric Gold/Emerald Cargo Pod starting at x=395, y=102 */}
                <polygon
                  points="395,86 420,96 395,106 370,96"
                  fill="#34D399"
                  fillOpacity="0.85"
                  stroke="#B9F6CA"
                  strokeWidth="1.2"
                />
                <polygon
                  points="370,96 395,106 395,120 370,110"
                  fill="#00C853"
                  stroke="#34D399"
                  strokeWidth="1"
                />
                <polygon
                  points="395,106 420,96 420,110 395,120"
                  fill="#009624"
                  stroke="#34D399"
                  strokeWidth="1"
                />
                {/* Floating Profit Tag above Courier Capsule */}
                <rect
                  x="342"
                  y="63"
                  width="106"
                  height="19"
                  rx="2"
                  fill="#04120B"
                  stroke="#34D399"
                  strokeWidth="1.4"
                />
                <text
                  x="395"
                  y="76"
                  textAnchor="middle"
                  fill="#34D399"
                  fontSize="9"
                  fontWeight="900"
                >
                  📥 +${latestProfitTrade.realizedPnlUsd.toFixed(2)} ({latestProfitTrade.symbol.replace('-PERP', '')})
                </text>
              </g>
            )}
          </g>

          {/* ==================== RIGHT CONDUIT: LOSS / SCRATCH OUT TO EXTERNAL VAULT (450 -> 735) ==================== */}
          <g pointerEvents="none">
            {/* Isometric 3D Disposal Conduit (Center Hub -> Right External Vault) */}
            <polygon
              points="490,112 490,126 685,118 685,104"
              fill="#F87171"
              fillOpacity="0.12"
              stroke="#F87171"
              strokeWidth="1"
              strokeOpacity="0.45"
            />
            <line
              x1="490"
              y1="119"
              x2="685"
              y2="111"
              stroke="#F87171"
              strokeWidth="2.5"
              className="iso-beam-anim"
            />

            {/* Animated Courier Capsule Ejecting Loss/Scratch to External Vault */}
            {latestLossTrade && (
              <g className="iso-courier-loss" opacity={!isProfitActive ? 1 : 0.72}>
                {/* 3D Isometric Crimson/Amber Loss Extraction Pod starting at x=505, y=102 */}
                <polygon
                  points="505,86 530,96 505,106 480,96"
                  fill="#F87171"
                  fillOpacity="0.85"
                  stroke="#FF8A80"
                  strokeWidth="1.2"
                />
                <polygon
                  points="480,96 505,106 505,120 480,110"
                  fill="#D50000"
                  stroke="#F87171"
                  strokeWidth="1"
                />
                <polygon
                  points="505,106 530,96 530,110 505,120"
                  fill="#9B0000"
                  stroke="#F87171"
                  strokeWidth="1"
                />
                {/* Floating Loss Tag above Capsule */}
                <rect
                  x="452"
                  y="63"
                  width="106"
                  height="19"
                  rx="2"
                  fill="#1A060B"
                  stroke="#F87171"
                  strokeWidth="1.4"
                />
                <text
                  x="505"
                  y="76"
                  textAnchor="middle"
                  fill="#FF5252"
                  fontSize="9"
                  fontWeight="900"
                >
                  📤 -${Math.abs(latestLossTrade.realizedPnlUsd).toFixed(2)} ({latestLossTrade.symbol.replace('-PERP', '')})
                </text>
              </g>
            )}
          </g>

          {/* ==================== LEFT STATION: 3D INTERNAL PROFIT VAULT (MASUK KEUNTUNGAN) ==================== */}
          <g
            data-testid="internal-profit-vault-node"
            className="cursor-pointer"
            onClick={() => setFilterMode(filterMode === 'PROFIT_IN' ? 'ALL' : 'PROFIT_IN')}
          >
            <circle cx="155" cy="112" r="76" fill="url(#profitVaultGlow)" />
            {/* Isometric 3D Vault Pedestal */}
            <polygon
              points="155,102 225,130 155,158 85,130"
              fill="#071A12"
              stroke="#34D399"
              strokeWidth="1.8"
            />
            <polygon
              points="85,130 155,158 155,174 85,146"
              fill="#05130D"
              stroke="#34D399"
              strokeWidth="1.2"
            />
            <polygon
              points="155,158 225,130 225,146 155,174"
              fill="#030D09"
              stroke="#34D399"
              strokeWidth="1.2"
            />

            {/* 3D Isometric Armored Profit Safe / Brankas */}
            <g className="iso-float-1" pointerEvents="none">
              {/* Top Vault Roof */}
              <polygon
                points="155,40 202,60 155,80 108,60"
                fill="#0D2E20"
                stroke="#34D399"
                strokeWidth="1.6"
              />
              {/* Left Armored Vault Wall */}
              <polygon
                points="108,60 155,80 155,132 108,112"
                fill="#0A2419"
                stroke="#34D399"
                strokeWidth="1.5"
              />
              {/* Right Armored Vault Door Face */}
              <polygon
                points="155,80 202,60 202,112 155,132"
                fill="#071A12"
                stroke="#34D399"
                strokeWidth="1.5"
              />
              {/* Glowing Gold Bullion Stack & Vault Lock Wheel */}
              <circle
                cx="178"
                cy="95"
                r="12"
                fill="#04120B"
                stroke="#F5B74F"
                strokeWidth="1.6"
              />
              <circle
                cx="178"
                cy="95"
                r="8"
                fill="none"
                stroke="#34D399"
                strokeWidth="1.4"
                strokeDasharray="3 2"
                className="iso-orbit-spin"
              />
              {/* 3D Gold Bars inside left face */}
              <rect
                x="120"
                y="82"
                width="22"
                height="8"
                rx="1"
                fill="#F5B74F"
                stroke="#FFE082"
                strokeWidth="0.8"
              />
              <rect
                x="124"
                y="93"
                width="22"
                height="8"
                rx="1"
                fill="#34D399"
                stroke="#B9F6CA"
                strokeWidth="0.8"
              />

              <text
                x="155"
                y="27"
                textAnchor="middle"
                fill="#34D399"
                fontSize="10"
                fontWeight="900"
              >
                🏦 BRANKAS PENYIMPANAN PROFIT
              </text>
            </g>

            {/* Bottom Profit Vault Total Counter Plate */}
            <rect
              x="76"
              y="180"
              width="158"
              height="36"
              rx="3"
              fill="#04120C"
              stroke="#34D399"
              strokeWidth="1.5"
            />
            <text
              x="155"
              y="194"
              textAnchor="middle"
              fill="#A7F3D0"
              fontSize="8.5"
              fontWeight="800"
            >
              MASUK KEUNTUNGAN ({profitTrades.length} POSISI)
            </text>
            <text
              x="155"
              y="209"
              textAnchor="middle"
              fill="#34D399"
              fontSize="12"
              fontWeight="900"
            >
              +${totalProfitInUsd.toFixed(2)} USD
            </text>
          </g>

          {/* ==================== CENTER STATION: 3D TREASURY COURIER AGENT (450, 120) ==================== */}
          <g data-testid="treasury-courier-agent-node">
            <circle cx="450" cy="118" r="70" fill="url(#courierHubGlow)" />
            {/* Isometric 3D Settlement Nexus Platform */}
            <polygon
              points="450,104 516,130 450,156 384,130"
              fill="#0A1528"
              stroke="#56B6F7"
              strokeWidth="1.8"
            />
            <polygon
              points="384,130 450,156 450,170 384,144"
              fill="#07101F"
              stroke="#56B6F7"
              strokeWidth="1.2"
            />
            <polygon
              points="450,156 516,130 516,144 450,170"
              fill="#050B16"
              stroke="#56B6F7"
              strokeWidth="1.2"
            />

            {/* 3D Animated Cybernetic Courier Agent Avatar */}
            <g className="iso-float-2" pointerEvents="none">
              {/* Courier Robot Body (3D Isometric Chest Prism) */}
              <polygon
                points="450,58 476,70 450,82 424,70"
                fill="#56B6F7"
                fillOpacity="0.35"
                stroke="#56B6F7"
                strokeWidth="1.4"
              />
              <polygon
                points="424,70 450,82 450,114 424,102"
                fill="#0D2542"
                stroke="#56B6F7"
                strokeWidth="1.3"
              />
              <polygon
                points="450,82 476,70 476,102 450,114"
                fill="#08182E"
                stroke="#56B6F7"
                strokeWidth="1.3"
              />
              {/* Courier Agent Head / Visor */}
              <polygon
                points="450,36 466,44 450,52 434,44"
                fill="#F5B74F"
                stroke="#FFE082"
                strokeWidth="1.2"
              />
              <rect
                x="439"
                y="45"
                width="22"
                height="7"
                rx="2"
                fill="#56B6F7"
              />
              {/* Left & Right Mechanical Courier Arms pointing to Vaults */}
              <line x1="424" y1="84" x2="398" y2="94" stroke="#34D399" strokeWidth="2.5" />
              <circle cx="396" cy="95" r="4" fill="#34D399" />
              <line x1="476" y1="84" x2="502" y2="94" stroke="#F87171" strokeWidth="2.5" />
              <circle cx="504" cy="95" r="4" fill="#F87171" />

              <text
                x="450"
                y="24"
                textAnchor="middle"
                fill="#56B6F7"
                fontSize="9.5"
                fontWeight="900"
              >
                🤖 AGENT KURIR SETTLEMENT PNL
              </text>
            </g>

            {/* Active Closed Position Telemetry Plate on Center Hub */}
            {activeTrade && (
              <g pointerEvents="none">
                <rect
                  x="358"
                  y="176"
                  width="184"
                  height="40"
                  rx="3"
                  fill="#060B15"
                  stroke={isProfitActive ? '#00E676' : '#FF1744'}
                  strokeWidth="1.5"
                />
                <text
                  x="450"
                  y="190"
                  textAnchor="middle"
                  fill="#CBD5E1"
                  fontSize="8.5"
                  fontWeight="800"
                >
                  LAST/ACTIVE: {activeTrade.symbol} ({activeTrade.side}) • {activeTrade.timestamp}
                </text>
                <text
                  x="450"
                  y="206"
                  textAnchor="middle"
                  fill={isProfitActive ? '#00E676' : '#FF1744'}
                  fontSize="10.5"
                  fontWeight="900"
                >
                  {isProfitActive
                    ? `← MASUK BRANKAS +$${activeTrade.realizedPnlUsd.toFixed(2)} (+${activeTrade.realizedPnlPct}%)`
                    : `KELUAR EKSTERNAL -$${Math.abs(activeTrade.realizedPnlUsd).toFixed(2)} (${activeTrade.realizedPnlPct}%) →`}
                </text>
              </g>
            )}
          </g>

          {/* ==================== RIGHT STATION: 3D EXTERNAL LOSS VAULT (KELUAR KERUGIAN) ==================== */}
          <g
            data-testid="external-loss-vault-node"
            className="cursor-pointer"
            onClick={() => setFilterMode(filterMode === 'LOSS_OUT' ? 'ALL' : 'LOSS_OUT')}
          >
            <circle cx="745" cy="112" r="76" fill="url(#lossVaultGlow)" />
            {/* Isometric 3D External Vault Pedestal */}
            <polygon
              points="745,102 815,130 745,158 675,130"
              fill="#1F0810"
              stroke="#F87171"
              strokeWidth="1.8"
            />
            <polygon
              points="675,130 745,158 745,174 675,146"
              fill="#16050B"
              stroke="#F87171"
              strokeWidth="1.2"
            />
            <polygon
              points="745,158 815,130 815,146 745,174"
              fill="#100308"
              stroke="#F87171"
              strokeWidth="1.2"
            />

            {/* 3D Isometric External Counterparty Vault Box */}
            <g className="iso-float-1" pointerEvents="none">
              <polygon
                points="745,40 792,60 745,80 698,60"
                fill="#330B17"
                stroke="#F87171"
                strokeWidth="1.6"
              />
              <polygon
                points="698,60 745,80 745,132 698,112"
                fill="#260711"
                stroke="#F87171"
                strokeWidth="1.5"
              />
              <polygon
                points="745,80 792,60 792,112 745,132"
                fill="#1B050C"
                stroke="#F87171"
                strokeWidth="1.5"
              />
              {/* Outward Extraction Portal Ring */}
              <circle
                cx="722"
                cy="95"
                r="11"
                fill="#140308"
                stroke="#F5B74F"
                strokeWidth="1.4"
                strokeDasharray="4 2"
                className="iso-sonar-pulse"
              />
              <path
                d="M 760 88 L 778 88 L 778 104 L 760 104 Z"
                fill="#F87171"
                fillOpacity="0.35"
                stroke="#FF8A80"
                strokeWidth="1"
              />
              <text
                x="745"
                y="27"
                textAnchor="middle"
                fill="#FF5252"
                fontSize="10"
                fontWeight="900"
              >
                📤 BRANKAS EKSTERNAL (KERUGIAN)
              </text>
            </g>

            {/* Bottom External Loss Vault Total Counter Plate */}
            <rect
              x="666"
              y="180"
              width="158"
              height="36"
              rx="3"
              fill="#17050A"
              stroke="#F87171"
              strokeWidth="1.5"
            />
            <text
              x="745"
              y="194"
              textAnchor="middle"
              fill="#FECDD3"
              fontSize="8.5"
              fontWeight="800"
            >
              KELUAR KERUGIAN ({lossTrades.length} POSISI)
            </text>
            <text
              x="745"
              y="209"
              textAnchor="middle"
              fill="#F87171"
              fontSize="12"
              fontWeight="900"
            >
              -${totalLossOutUsd.toFixed(2)} USD
            </text>
          </g>
        </svg>
      </div>

      {/* Real-Time Per-Position Closed Trade Vault Ledger */}
      {!hideLedger && (
        <div
          data-testid="vault-realtime-trade-ledger"
          className="bg-[#070C16] border border-[#19263D] p-2 space-y-1.5"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1 border-b border-[#141F33]">
            <span className="text-[9.5px] font-extrabold text-[#00E5FF]">
              RINCIAN REAL-TIME SETIAP POSISI DITUTUP (KLIK POSISI UNTUK INSPEKSI KURIR BRANKAS)
            </span>
            <div className="flex items-center gap-1">
              {(
                [
                  { id: 'ALL', label: `SEMUA (${closedTrades.length})` },
                  { id: 'PROFIT_IN', label: `📥 MASUK BRANKAS (${profitTrades.length})` },
                  { id: 'LOSS_OUT', label: `📤 KELUAR EKSTERNAL (${lossTrades.length})` },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  data-testid={`vault-filter-${f.id}`}
                  onClick={() => setFilterMode(f.id)}
                  className={`px-2 py-0.5 text-[8.5px] font-extrabold border ${
                    filterMode === f.id
                      ? 'bg-[#00E5FF] text-black border-[#00E5FF]'
                      : 'bg-[#0B1220] text-[#94A3B8] border-[#1A273E] hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
            {filteredTrades.map((trade) => {
              const isWin = trade.realizedPnlUsd >= 0;
              const isSelected = activeTrade?.id === trade.id;
              return (
                <div
                  key={trade.id}
                  data-testid="vault-closed-trade-item"
                  onClick={() => handleSelectTrade(trade.id)}
                  className={`p-2 border cursor-pointer flex items-center justify-between gap-2 ${
                    isSelected
                      ? isWin
                        ? 'bg-[#071913] border-[#00E676]'
                        : 'bg-[#1C080E] border-[#FF1744]'
                      : 'bg-[#090F1C] border-[#182338] hover:border-[#2C3F61]'
                  }`}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[8.5px] font-mono text-[#64748B]">{trade.timestamp}</span>
                      <span
                        className={`px-1 py-0.2 text-[8.5px] font-extrabold ${
                          trade.side === 'LONG'
                            ? 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676]/50'
                            : 'bg-[#FF1744]/20 text-[#FF1744] border border-[#FF1744]/50'
                        }`}
                      >
                        {trade.side}
                      </span>
                      <span className="font-extrabold text-white text-[10px]">{trade.symbol}</span>
                      <span className="text-[8.5px] font-mono text-[#00E5FF]">{trade.exchange}</span>
                    </div>
                    <div className="text-[8.5px] text-[#94A3B8] font-mono truncate">
                      Entry ${trade.entryPrice.toLocaleString()} → Exit ${trade.exitPrice.toLocaleString()} •{' '}
                      {isWin
                        ? `Settled ke ${trade.hotWalletName || 'Brankas Profit Utama'}`
                        : 'Keluar ke Brankas Likuiditas Eksternal (Micro-Scratch)'}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`text-[10.5px] font-extrabold font-mono ${
                        isWin ? 'text-[#00E676]' : 'text-[#FF1744]'
                      }`}
                    >
                      {isWin ? '📥 +' : '📤 -'}${Math.abs(trade.realizedPnlUsd).toFixed(2)} (
                      {trade.realizedPnlPct >= 0 ? '+' : ''}
                      {trade.realizedPnlPct}%)
                    </div>
                    <div
                      className={`text-[8px] font-extrabold ${
                        isWin ? 'text-[#A7F3D0]' : 'text-[#FCA5A5]'
                      }`}
                    >
                      {isWin ? 'MASUK BRANKAS PROFIT' : 'KELUAR BRANKAS EKSTERNAL'}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
