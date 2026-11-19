import React, { useState } from 'react';
import {
  ClosedTradeLog,
  MarketPair,
  MultiAgentForumConsensus,
  PositionAccuracyAuditItem,
  SpecialistAgentId,
  VerifiedNewsItem,
  WalkForwardTradeOutcome,
} from '../types/terminal';
import { INITIAL_CLOSED_TRADES, LowRiskHunterCandidate } from '../engine/agentSkills';
import { CoinIcon } from './CoinIcon';
import { AgentWarRoom3DViz } from './AgentWarRoom3DViz';
import { VaultSettlementCourier3DViz } from './VaultSettlementCourier3DViz';

interface MultiAgentForumPanelProps {
  consensus: MultiAgentForumConsensus;
  verifiedNews: VerifiedNewsItem[];
  topOpportunities: LowRiskHunterCandidate[];
  positionAudits?: PositionAccuracyAuditItem[];
  walkForwardOutcomes?: WalkForwardTradeOutcome[];
  closedTrades?: ClosedTradeLog[];
  totalMarketsCount: number;
  onSelectSymbol: (symbol: string) => void;
  onExecutePrecisionTrade: (market: MarketPair, side: 'LONG' | 'SHORT', leverage?: number) => void;
  compactDeskMode?: boolean;
}

export const MultiAgentForumPanel: React.FC<MultiAgentForumPanelProps> = ({
  consensus,
  verifiedNews,
  topOpportunities,
  positionAudits = [],
  walkForwardOutcomes = [],
  closedTrades = INITIAL_CLOSED_TRADES,
  totalMarketsCount,
  onSelectSymbol,
  onExecutePrecisionTrade,
  compactDeskMode = false,
}) => {
  const [activeForumView, setActiveForumView] = useState<
    | 'CONSENSUS_4_AGENTS'
    | 'BLOOMBERG_NEWS_90_100'
    | 'ALL_MARKET_SCANNER'
    | 'POSITION_ACCURACY_AUDIT'
  >('CONSENSUS_4_AGENTS');
  const [selectedAgentId, setSelectedAgentId] = useState<SpecialistAgentId>('BLOOMBERG_NEWS');
  const [oppSearch, setOppSearch] = useState<string>('');

  const filteredOpps = topOpportunities
    .filter((item) => {
      if (!oppSearch.trim()) return true;
      const q = oppSearch.trim().toUpperCase();
      return (
        item.market.symbol.toUpperCase().includes(q) ||
        item.market.baseAsset.toUpperCase().includes(q) ||
        (item.market.sector || '').toUpperCase().includes(q)
      );
    })
    .slice(0, compactDeskMode ? 10 : 18);

  const wfWinCount = walkForwardOutcomes.filter((w) => w.isAccurate).length;
  const wfWinRatePct =
    walkForwardOutcomes.length > 0
      ? Math.round((wfWinCount / walkForwardOutcomes.length) * 100)
      : 100;
  const wfTotalPnlUsd = walkForwardOutcomes.reduce((acc, w) => acc + w.realizedPnlUsd, 0);

  return (
    <div
      data-testid="multi-agent-forum"
      className="flex flex-col gap-2.5 bg-[#070B12] border border-[#1E2B42] p-2.5 text-[10.5px]"
    >
      {/* 1. Forum Header & Consensus Verdict Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#1E2736]">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 bg-[#FF9F1C] text-black font-extrabold text-[10px]">
            4-AGENT CONSENSUS FORUM
          </span>
          <span className="font-extrabold text-white text-xs">
            {consensus.symbol} — WAR-ROOM VERDICT
          </span>
          <span
            data-testid="forum-accuracy-badge"
            className="px-1.5 py-0.5 bg-[#00E676]/15 border border-[#00E676] text-[#00E676] font-extrabold text-[9.5px]"
          >
            AKURASI POSISI: {consensus.positionAccuracyPct}% ({consensus.alignedAgentsCount}/4 AGENT • {consensus.checklistPassedCount}/8 CHECKLIST)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            data-testid="forum-tab-consensus"
            onClick={() => setActiveForumView('CONSENSUS_4_AGENTS')}
            className={`px-2 py-0.5 font-extrabold text-[9.5px] border ${
              activeForumView === 'CONSENSUS_4_AGENTS'
                ? 'bg-[#00E5FF] text-black border-[#00E5FF]'
                : 'bg-[#0D1422] text-[#CBD5E1] border-[#1E2B40] hover:text-white'
            }`}
          >
            🧠 4 AGENT FORUM
          </button>
          <button
            data-testid="forum-tab-news"
            onClick={() => setActiveForumView('BLOOMBERG_NEWS_90_100')}
            className={`px-2 py-0.5 font-extrabold text-[9.5px] border ${
              activeForumView === 'BLOOMBERG_NEWS_90_100'
                ? 'bg-[#FF9F1C] text-black border-[#FF9F1C]'
                : 'bg-[#0D1422] text-[#CBD5E1] border-[#1E2B40] hover:text-white'
            }`}
          >
            📰 BLOOMBERG NEWS ({consensus.newsCredibilityAvg}% VALID)
          </button>
          <button
            data-testid="forum-tab-scanner"
            onClick={() => setActiveForumView('ALL_MARKET_SCANNER')}
            className={`px-2 py-0.5 font-extrabold text-[9.5px] border ${
              activeForumView === 'ALL_MARKET_SCANNER'
                ? 'bg-[#00E676] text-black border-[#00E676]'
                : 'bg-[#0D1422] text-[#CBD5E1] border-[#1E2B40] hover:text-white'
            }`}
          >
            🌐 ALL-MARKET SCANNER ({totalMarketsCount} COINS)
          </button>
          <button
            data-testid="forum-tab-accuracy-audit"
            onClick={() => setActiveForumView('POSITION_ACCURACY_AUDIT')}
            className={`px-2 py-0.5 font-extrabold text-[9.5px] border ${
              activeForumView === 'POSITION_ACCURACY_AUDIT'
                ? 'bg-[#D500F9] text-white border-[#D500F9]'
                : 'bg-[#0D1422] text-[#CBD5E1] border-[#1E2B40] hover:text-white'
            }`}
          >
            🎯 UJI AKURASI POSISI ({wfWinRatePct}% WIN)
          </button>
        </div>
      </div>

      {/* 2. Executive Synthesis & Precision Execution Strip */}
      <div className="p-2 bg-[#0A101B] border-l-4 border-l-[#00E5FF] border border-[#1B283E] flex flex-wrap items-center justify-between gap-2">
        <div className="flex-1 min-w-[240px]">
          <div className="text-[10px] text-[#00E5FF] font-extrabold">
            {consensus.executiveSummary}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-1 text-[9.5px] font-mono text-[#CBD5E1]">
            <span>
              ENTRY MAKER: <strong className="text-white">${consensus.entryPrice.toLocaleString()}</strong>
            </span>
            <span>
              SL STRUKTUR: <strong className="text-[#FF1744]">${consensus.stopLossPrice.toLocaleString()}</strong>
            </span>
            <span>
              BE+FEE LOCK: <strong className="text-[#00E676]">${consensus.breakevenLockPrice.toLocaleString()}</strong>
            </span>
            <span>
              MIN TP1 (+50%) / UNCAPPED TP2 (∞):{' '}
              <strong className="text-[#00E676]">
                ${consensus.takeProfit1.toLocaleString()} / ${consensus.takeProfit2.toLocaleString()}
              </strong>
            </span>
            <span>
              R:R: <strong className="text-[#FF9F1C]">1:{consensus.riskRewardRatio} (MAX TP ∞)</strong>
            </span>
          </div>
        </div>

        <button
          data-testid="forum-execute-consensus-btn"
          disabled={consensus.hasVeto}
          onClick={() =>
            onExecutePrecisionTrade(
              {
                symbol: consensus.symbol,
                baseAsset: consensus.baseAsset,
                quoteAsset: 'USDC',
                hlCoin: consensus.baseAsset,
                binanceSymbol: `${consensus.baseAsset}USDT`,
                marketType: 'PERP',
                primaryExchange: 'HYPERLIQUID',
                supportedExchanges: ['HYPERLIQUID', 'BINANCE'],
                price: consensus.entryPrice,
                change24h: 0,
                high24h: consensus.takeProfit2,
                low24h: consensus.stopLossPrice,
                volume24hUsd: 100_000_000,
                openInterestUsd: 50_000_000,
                fundingRate: 0.0085,
                spreadBps: 0.4,
                depthPlusMinusHalfPctUsd: 10_000_000,
                dexPoolTvlUsd: 20_000_000,
                liquidityScore: 92,
                obiScore: 0.35,
                cvdDelta15mUsd: 2_000_000,
                whaleNetFlow1hUsd: consensus.whale.netFlow1hUsd,
                whaleBias: 'STRONG LONG',
              },
              consensus.recommendedSide,
              consensus.recommendedLeverage
            )
          }
          className={`px-3 py-1.5 font-extrabold text-[10px] border shrink-0 ${
            consensus.hasVeto
              ? 'bg-[#1A1218] text-[#FF1744] border-[#FF1744]/50 cursor-not-allowed'
              : consensus.recommendedSide === 'LONG'
                ? 'bg-[#00E676] text-black border-[#00E676] hover:bg-[#26ff92]'
                : 'bg-[#FF1744] text-white border-[#FF1744] hover:bg-[#ff4569]'
          }`}
        >
          {consensus.hasVeto
            ? '🛡️ VETO RISIKO AKTIF'
            : `⚡ PASANG ${consensus.recommendedSide} PRESISI (${consensus.recommendedLeverage}x)`}
        </button>
      </div>

      {/* 3A. VIEW 1: TWIN 3D ISOMETRIC VISUALIZERS (WAR-ROOM + VAULT COURIER) + 4 SPECIALIZED AGENTS + 8-POINT PRECISION CHECKLIST */}
      {activeForumView === 'CONSENSUS_4_AGENTS' && (
        <div className="space-y-2">
          {/* Twin 2D / Semi-3D Isometric Visualizers: Left = 4-Agent War-Room, Right = Real-Time Dual-Vault Profit/Loss Courier */}
          <div
            className={
              compactDeskMode
                ? 'grid grid-cols-1 gap-2'
                : 'grid grid-cols-1 xl:grid-cols-2 gap-2.5 items-stretch'
            }
          >
            <AgentWarRoom3DViz
              consensus={consensus}
              selectedAgentId={selectedAgentId}
              onSelectAgent={setSelectedAgentId}
            />
            <VaultSettlementCourier3DViz closedTrades={closedTrades} />
          </div>

          <div
            className={
              compactDeskMode
                ? 'grid grid-cols-1 md:grid-cols-2 gap-2'
                : 'grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-2'
            }
          >
            {consensus.votes.map((agent) => {
              const isLong = agent.vote === 'LONG';
              const isShort = agent.vote === 'SHORT';
              const isVeto = agent.vote === 'VETO';
              const isSelected = selectedAgentId === agent.agentId;
              return (
                <div
                  key={agent.agentId}
                  data-testid={`forum-agent-card-${agent.agentId}`}
                  onClick={() => setSelectedAgentId(agent.agentId)}
                  className={`p-2.5 bg-[#06090F] border flex flex-col justify-between gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'border-[#00E5FF] shadow-[0_0_12px_rgba(0,229,255,0.12)]'
                      : 'border-[#1B263B] hover:border-[#2C3E5E]'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1 border-b border-[#151E2E] pb-1">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-extrabold text-[#FF9F1C] truncate">
                          {agent.agentName}
                        </span>
                        <span className="px-1 py-0.2 bg-[#111C2D] text-[#00E5FF] text-[8.5px] font-bold shrink-0">
                          {agent.badge}
                        </span>
                      </div>
                      <span
                        className={`px-1.5 py-0.5 text-[9.5px] font-extrabold shrink-0 ${
                          isVeto
                            ? 'bg-[#FF1744] text-white'
                            : isLong
                              ? 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676]'
                              : isShort
                                ? 'bg-[#FF1744]/20 text-[#FF1744] border border-[#FF1744]'
                                : 'bg-[#FF9F1C]/20 text-[#FF9F1C] border border-[#FF9F1C]'
                        }`}
                      >
                        {agent.vote} ({agent.credibilityOrAccuracyPct}%)
                      </span>
                    </div>

                    <div className="text-[10px] font-bold text-white mt-1 line-clamp-2">
                      {agent.headline}
                    </div>
                    <p className="text-[9.5px] text-[#94A3B8] mt-0.5 leading-snug">
                      {agent.rationale}
                    </p>

                    {/* 3 Specialized Sub-Skills Matrix */}
                    {agent.subSkills && agent.subSkills.length > 0 && (
                      <div className="mt-1.5 grid grid-cols-1 gap-1">
                        {agent.subSkills.map((sk, sIdx) => (
                          <div
                            key={sIdx}
                            className="px-1.5 py-0.5 bg-[#0A111E] border border-[#172338] flex items-center justify-between gap-2"
                          >
                            <span className="text-[8.5px] font-extrabold text-[#00E5FF] truncate">
                              {sk.name}
                            </span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[8px] text-[#CBD5E1] font-mono truncate max-w-[115px]">
                                {sk.status}
                              </span>
                              <span className="text-[8.5px] text-[#00E676] font-mono font-extrabold">
                                {sk.score}%
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-1 pt-1 border-t border-[#121A28]">
                    {agent.metricsPillars.map((pill, idx) => (
                      <span
                        key={idx}
                        className="px-1.5 py-0.5 bg-[#0B111C] border border-[#1A2538] text-[9px] font-mono text-[#CBD5E1]"
                      >
                        {pill}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 8-Point Pre-Trade Precision Checklist */}
          <div
            data-testid="forum-precision-checklist"
            className="p-2 bg-[#060910] border border-[#192438]"
          >
            <div className="flex items-center justify-between text-[9.5px] font-extrabold text-[#00E5FF] pb-1.5 border-b border-[#141D2E]">
              <span>
                8-POINT PRE-TRADE PRECISION CHECKLIST (SYARAT WAJIB AKURASI ENTRY {consensus.recommendedSide})
              </span>
              <span className="text-[#00E676]">
                {consensus.checklistPassedCount}/8 SYARAT TERVERIFIKASI
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-1.5 mt-1.5">
              {consensus.checklist.map((chk) => (
                <div
                  key={chk.id}
                  className={`p-1.5 border text-[9px] flex flex-col justify-between ${
                    chk.passed
                      ? 'bg-[#071410] border-[#00E676]/40 text-[#CBD5E1]'
                      : 'bg-[#180B10] border-[#FF1744]/50 text-[#FCA5A5]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 font-bold">
                    <span className="truncate text-white">{chk.label}</span>
                    <span
                      className={`px-1 text-[8.5px] font-extrabold shrink-0 ${
                        chk.passed ? 'text-[#00E676]' : 'text-[#FF1744]'
                      }`}
                    >
                      {chk.passed ? '✓ LULUS' : '✕ HOLD'}
                    </span>
                  </div>
                  <div className="font-mono text-[8.5px] text-[#94A3B8] mt-0.5 truncate">
                    {chk.valueText}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 3B. VIEW 2: BLOOMBERG & MACRO VERIFIED NEWS FEED (90-100% VALIDITY) */}
      {activeForumView === 'BLOOMBERG_NEWS_90_100' && (
        <div data-testid="forum-news-list" className="space-y-1.5 max-h-72 overflow-y-auto">
          <div className="flex items-center justify-between text-[9.5px] text-[#94A3B8] bg-[#0A101A] px-2 py-1 border border-[#182336]">
            <span>
              FILTER KEBENARAN BERITA AKTIF: <strong className="text-[#00E676]">HANYA 90%–100% VALID (BLOOMBERG OFFICIAL RSS + ON-CHAIN WIRE)</strong>
            </span>
            <span className="text-[#FF9F1C] font-bold">
              {verifiedNews.length} BERITA TERVERIFIKASI
            </span>
          </div>
          {verifiedNews.map((item) => (
            <div
              key={item.id}
              data-testid="verified-news-item"
              className="p-2 bg-[#06090F] border border-[#192436] hover:border-[#FF9F1C]/60 flex flex-col gap-1"
            >
              <div className="flex flex-wrap items-center justify-between gap-1">
                <div className="flex items-center gap-1.5">
                  <span className="px-1.5 py-0.2 bg-[#FF9F1C]/20 border border-[#FF9F1C] text-[#FF9F1C] font-extrabold text-[9px]">
                    {item.source}
                  </span>
                  <span className="px-1.5 py-0.2 bg-[#00E676]/15 border border-[#00E676]/60 text-[#00E676] font-extrabold text-[9px]">
                    ✓ VALID {item.credibilityScore}%
                  </span>
                  <span
                    className={`px-1.5 py-0.2 font-extrabold text-[9px] ${
                      item.sentiment === 'BULLISH'
                        ? 'bg-[#00E676] text-black'
                        : item.sentiment === 'BEARISH'
                          ? 'bg-[#FF1744] text-white'
                          : 'bg-[#1E293B] text-white'
                    }`}
                  >
                    {item.sentiment}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  {item.affectedAssets.slice(0, 6).map((asset) => (
                    <button
                      key={asset}
                      onClick={() => {
                        if (asset !== 'ALL') {
                          onSelectSymbol(asset === 'HYPE' ? 'HYPE-USDC' : `${asset}-PERP`);
                        }
                      }}
                      className="px-1.5 py-0.2 bg-[#111B2B] hover:bg-[#00E5FF] hover:text-black text-[#00E5FF] font-mono font-bold text-[9px]"
                    >
                      ${asset}
                    </button>
                  ))}
                </div>
              </div>
              <div className="font-extrabold text-white text-[10.5px]">{item.headline}</div>
              <div className="text-[9.5px] text-[#94A3B8]">{item.summary}</div>
              <div className="text-[8.5px] font-mono text-[#00E5FF]">
                {item.verificationProof} • Impact Score: {item.impactScore}/100
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 3C. VIEW 3: ALL-MARKET MULTI-AGENT OPPORTUNITY SCANNER (BEYOND TOP 10 CMC) */}
      {activeForumView === 'ALL_MARKET_SCANNER' && (
        <div data-testid="forum-all-market-scanner" className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-[#090E18] p-2 border border-[#1B263B]">
            <div className="text-[10px] text-[#00E676] font-extrabold">
              PEMINDAIAN 4-AGENT LINTAS SELURUH MARKET CRYPTO ({totalMarketsCount} MARKET AKTIF — L1/L2, AI, DEFI, RWA, MEME, DEX)
            </div>
            <input
              type="text"
              data-testid="forum-scanner-search"
              value={oppSearch}
              onChange={(e) => setOppSearch(e.target.value)}
              placeholder="Cari koin (cth: PEPE, TAO, ONDO, ARB, WIF, AAVE)..."
              className="px-2 py-0.5 bg-[#05080E] border border-[#24324B] text-white text-[10px] w-60"
            />
          </div>

          <div className="max-h-72 overflow-y-auto border border-[#1A2436]">
            <table className="w-full text-left border-collapse font-mono text-[9.5px]">
              <thead>
                <tr className="bg-[#0B111D] text-[#94A3B8] border-b border-[#1E2736]">
                  <th className="py-1.5 px-2">MARKET / SEKTOR</th>
                  <th className="py-1.5 px-2">SINYAL 4-AGENT</th>
                  <th className="py-1.5 px-2">HARGA & 24H</th>
                  <th className="py-1.5 px-2">TA & NEWS SCORE</th>
                  <th className="py-1.5 px-2">WHALE FLOW 1H</th>
                  <th className="py-1.5 px-2">R:R & LEV</th>
                  <th className="py-1.5 px-2 text-right">AKSI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#141D2B]">
                {filteredOpps.map((opp) => (
                  <tr
                    key={opp.market.symbol}
                    className="hover:bg-[#0E1624] cursor-pointer"
                    onClick={() => onSelectSymbol(opp.market.symbol)}
                  >
                    <td className="py-1.5 px-2">
                      <div className="flex items-center gap-1.5">
                        <CoinIcon coin={opp.market.baseAsset} size={14} />
                        <div>
                          <div className="font-extrabold text-white">{opp.market.symbol}</div>
                          <div className="text-[8.5px] text-[#00E5FF]">
                            {opp.market.sector || 'CRYPTO'} • {opp.market.primaryExchange}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-1.5 px-2">
                      <span
                        className={`px-1.5 py-0.5 font-extrabold text-[9px] ${
                          opp.side === 'LONG'
                            ? 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676]'
                            : 'bg-[#FF1744]/20 text-[#FF1744] border border-[#FF1744]'
                        }`}
                      >
                        {opp.side} ({opp.alignedAgentsCount || 4}/4 AGENT • {opp.lowRiskScore}%)
                      </span>
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="text-white font-bold">
                        ${opp.market.price.toLocaleString()}
                      </div>
                      <div
                        className={
                          opp.market.change24h >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'
                        }
                      >
                        {opp.market.change24h >= 0 ? '+' : ''}
                        {opp.market.change24h.toFixed(2)}%
                      </div>
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="text-[#FF9F1C] font-bold">
                        TA: {opp.taScore ?? 88}/100
                      </div>
                      <div className="text-[#00E676] text-[8.5px]">
                        News Valid: {opp.newsCredibilityPct ?? 96}%
                      </div>
                    </td>
                    <td className="py-1.5 px-2">
                      <span
                        className={`font-bold ${
                          opp.market.whaleNetFlow1hUsd >= 0
                            ? 'text-[#00E676]'
                            : 'text-[#FF1744]'
                        }`}
                      >
                        {opp.market.whaleNetFlow1hUsd >= 0 ? '+' : '-'}$
                        {(Math.abs(opp.market.whaleNetFlow1hUsd) / 1e6).toFixed(2)}M
                      </span>
                    </td>
                    <td className="py-1.5 px-2">
                      <div className="text-[#00E5FF] font-bold">
                        1:{opp.riskRewardRatio ?? 2.6} ({opp.recommendedLeverage}x)
                      </div>
                      <div className="text-[#94A3B8] text-[8.5px]">
                        BE @ ${opp.initialBeGuardPrice.toLocaleString()}
                      </div>
                    </td>
                    <td className="py-1.5 px-2 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectSymbol(opp.market.symbol);
                          onExecutePrecisionTrade(
                            opp.market,
                            opp.side,
                            opp.recommendedLeverage
                          );
                        }}
                        className="px-2 py-0.5 bg-[#FF9F1C] hover:bg-[#00E676] text-black font-extrabold text-[9px]"
                      >
                        ⚡ TRADE {opp.side}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3D. VIEW 4: REAL-TIME POSITION ACCURACY & WALK-FORWARD BACKTEST AUDITOR */}
      {activeForumView === 'POSITION_ACCURACY_AUDIT' && (
        <div data-testid="forum-accuracy-audit-panel" className="space-y-2.5">
          {/* 3D Dual-Vault Profit Inflow & External Loss Outflow Courier Agent Illustration */}
          <VaultSettlementCourier3DViz closedTrades={closedTrades} />

          {/* A. Active Open Positions Live Accuracy Verification */}
          <div className="p-2 bg-[#06090F] border border-[#1B263B]">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-[#151E2E]">
              <span className="font-extrabold text-[#FF9F1C] text-[10px]">
                A. AUDIT KETEPATAN SETIAP POSISI AKTIF ({positionAudits.length} POSISI DIUJI REAL-TIME)
              </span>
              <span className="px-1.5 py-0.2 bg-[#00E676]/15 border border-[#00E676] text-[#00E676] font-extrabold text-[9px]">
                {positionAudits.filter((a) => a.isAccurateVerdict).length}/{positionAudits.length} POSISI TEPAT / TERLINDUNGI
              </span>
            </div>

            <div className="divide-y divide-[#131C2B] mt-1">
              {positionAudits.map((audit) => (
                <div
                  key={audit.positionId}
                  data-testid={`position-audit-row-${audit.symbol}`}
                  className="py-1.5 flex flex-wrap items-center justify-between gap-2 text-[9.5px] font-mono"
                >
                  <div className="flex items-center gap-2">
                    <CoinIcon coin={audit.symbol.split('-')[0]} size={15} />
                    <span
                      className={`px-1.5 py-0.2 font-extrabold text-[9px] ${
                        audit.side === 'LONG'
                          ? 'bg-[#00E676] text-black'
                          : 'bg-[#FF1744] text-white'
                      }`}
                    >
                      {audit.side} {audit.leverage}x
                    </span>
                    <span className="font-extrabold text-white">{audit.symbol}</span>
                    <span className="text-[#94A3B8]">
                      Entry ${audit.entryPrice.toLocaleString()} → Mark $
                      {audit.currentPrice.toLocaleString()} (SL/BE $
                      {audit.stopLossPrice.toLocaleString()})
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-[#CBD5E1] text-[9px]">{audit.agentBreakdown}</span>
                    <span
                      className={`px-2 py-0.5 font-extrabold text-[9px] border ${
                        audit.isAccurateVerdict
                          ? 'bg-[#00E676]/15 text-[#00E676] border-[#00E676]'
                          : 'bg-[#FF1744]/20 text-[#FF1744] border-[#FF1744]'
                      }`}
                    >
                      {audit.verdictLabel}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* B. Walk-Forward Real Candle Backtest Outcomes (LONG & SHORT Verification) */}
          <div className="p-2 bg-[#06090F] border border-[#1B263B]">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-[#151E2E]">
              <span className="font-extrabold text-[#00E5FF] text-[10px]">
                B. UJI WALK-FORWARD PADA CANDLE OHLCV PASAR NYATA (LONG & SHORT — TANPA LOOKAHEAD BIAS)
              </span>
              <div className="flex items-center gap-2 text-[9px] font-extrabold">
                <span className="px-1.5 py-0.2 bg-[#00E676]/20 border border-[#00E676] text-[#00E676]">
                  WIN/PROTECTED RATE: {wfWinRatePct}% ({wfWinCount}/{walkForwardOutcomes.length})
                </span>
                <span
                  className={`px-1.5 py-0.2 border ${
                    wfTotalPnlUsd >= 0
                      ? 'bg-[#00E676] text-black border-[#00E676]'
                      : 'bg-[#FF1744] text-white border-[#FF1744]'
                  }`}
                >
                  NET PNL SIMULASI: {wfTotalPnlUsd >= 0 ? '+' : ''}${wfTotalPnlUsd.toFixed(2)}
                </span>
              </div>
            </div>

            <div className="max-h-56 overflow-y-auto mt-1">
              <table className="w-full text-left border-collapse font-mono text-[9px]">
                <thead>
                  <tr className="bg-[#0B111D] text-[#94A3B8] border-b border-[#1E2736]">
                    <th className="py-1 px-1.5">MARKET</th>
                    <th className="py-1 px-1.5">ARAH</th>
                    <th className="py-1 px-1.5">ENTRY → EXIT</th>
                    <th className="py-1 px-1.5">MFE / MAE</th>
                    <th className="py-1 px-1.5">PNL (5x)</th>
                    <th className="py-1 px-1.5">STATUS KETEPATAN ANALISA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#131C2B]">
                  {walkForwardOutcomes.map((wf) => (
                    <tr key={wf.id} className="hover:bg-[#0D1524]">
                      <td className="py-1 px-1.5 font-extrabold text-white">
                        <div className="flex items-center gap-1.5">
                          <CoinIcon coin={wf.symbol.split('-')[0]} size={13} />
                          <span>{wf.symbol}</span>
                        </div>
                      </td>
                      <td className="py-1 px-1.5">
                        <span
                          className={`px-1.5 py-0.2 font-extrabold ${
                            wf.side === 'LONG'
                              ? 'bg-[#00E676]/20 text-[#00E676]'
                              : 'bg-[#FF1744]/20 text-[#FF1744]'
                          }`}
                        >
                          {wf.side}
                        </span>
                      </td>
                      <td className="py-1 px-1.5 text-[#CBD5E1]">
                        ${wf.entryPrice.toLocaleString()} → ${wf.exitPrice.toLocaleString()}
                      </td>
                      <td className="py-1 px-1.5">
                        <span className="text-[#00E676]">+{wf.mfePct}%</span> /{' '}
                        <span className="text-[#FF1744]">{wf.maePct}%</span>
                      </td>
                      <td
                        className={`py-1 px-1.5 font-extrabold ${
                          wf.realizedPnlUsd >= 0 ? 'text-[#00E676]' : 'text-[#FF1744]'
                        }`}
                      >
                        {wf.realizedPnlUsd >= 0 ? '+' : ''}${wf.realizedPnlUsd.toFixed(2)} (
                        {wf.realizedPnlPct >= 0 ? '+' : ''}
                        {wf.realizedPnlPct}%)
                      </td>
                      <td className="py-1 px-1.5">
                        <span
                          className={`px-1.5 py-0.2 font-bold ${
                            wf.isAccurate
                              ? 'text-[#00E676]'
                              : 'text-[#FF1744]'
                          }`}
                        >
                          {wf.isAccurate ? '✓ TEPAT' : '✕ RUGI'} — {wf.reason}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
