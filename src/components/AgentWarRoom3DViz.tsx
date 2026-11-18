import React from 'react';
import {
  MultiAgentForumConsensus,
  SpecialistAgentId,
  SpecialistAgentVote,
} from '../types/terminal';

interface AgentWarRoom3DVizProps {
  consensus: MultiAgentForumConsensus;
  selectedAgentId: SpecialistAgentId;
  onSelectAgent: (id: SpecialistAgentId) => void;
}

export const AgentWarRoom3DViz: React.FC<AgentWarRoom3DVizProps> = ({
  consensus,
  selectedAgentId,
  onSelectAgent,
}) => {
  const getVoteColor = (vote: SpecialistAgentVote['vote']) => {
    if (vote === 'LONG') return '#00E676';
    if (vote === 'SHORT') return '#FF1744';
    if (vote === 'VETO') return '#FF1744';
    return '#FF9F1C';
  };

  const agent1 = consensus.votes.find((v) => v.agentId === 'BLOOMBERG_NEWS') || consensus.votes[0];
  const agent2 = consensus.votes.find((v) => v.agentId === 'TECHNICAL_ANALYST') || consensus.votes[1];
  const agent3 = consensus.votes.find((v) => v.agentId === 'WHALE_WALLET') || consensus.votes[2];
  const agent4 =
    consensus.votes.find((v) => v.agentId === 'EXECUTION_PRECISION') || consensus.votes[3];

  const activeAgent =
    consensus.votes.find((v) => v.agentId === selectedAgentId) || consensus.votes[0];

  const coreColor = consensus.hasVeto
    ? '#FF1744'
    : consensus.recommendedSide === 'LONG'
      ? '#00E676'
      : '#FF1744';

  const renderIsoPedestal = (
    cx: number,
    cy: number,
    accent: string,
    isSelected: boolean
  ) => {
    const w = 66;
    const h = 23;
    const depth = 14;
    const topPoints = `${cx},${cy - h} ${cx + w},${cy} ${cx},${cy + h} ${cx - w},${cy}`;
    const leftPoints = `${cx - w},${cy} ${cx},${cy + h} ${cx},${cy + h + depth} ${cx - w},${cy + depth}`;
    const rightPoints = `${cx},${cy + h} ${cx + w},${cy} ${cx + w},${cy + depth} ${cx},${cy + h + depth}`;

    return (
      <g pointerEvents="none">
        {isSelected && (
          <ellipse
            cx={cx}
            cy={cy + 4}
            rx={w + 13}
            ry={h + 9}
            fill="none"
            stroke={accent}
            strokeWidth="1.8"
            strokeDasharray="6 4"
            className="iso-sonar-pulse"
          />
        )}
        <ellipse
          cx={cx}
          cy={cy + depth + 5}
          rx={w + 4}
          ry={h + 2}
          fill="#03060C"
          opacity="0.85"
        />
        <polygon
          points={leftPoints}
          fill="#0B1526"
          stroke={accent}
          strokeWidth={isSelected ? '1.5' : '0.9'}
          strokeOpacity="0.75"
        />
        <polygon
          points={rightPoints}
          fill="#060C17"
          stroke={accent}
          strokeWidth={isSelected ? '1.5' : '0.9'}
          strokeOpacity="0.55"
        />
        <polygon
          points={topPoints}
          fill="#0F1C30"
          stroke={accent}
          strokeWidth={isSelected ? '2' : '1.2'}
        />
        <polygon
          points={`${cx},${cy - h * 0.62} ${cx + w * 0.62},${cy} ${cx},${cy + h * 0.62} ${cx - w * 0.62},${cy}`}
          fill={accent}
          fillOpacity="0.14"
          stroke={accent}
          strokeWidth="0.9"
          strokeOpacity="0.8"
        />
      </g>
    );
  };

  return (
    <div
      data-testid="agent-war-room-3d-viz"
      className="bg-[#050811] border border-[#1B2A44] p-2.5 flex flex-col justify-between gap-2 h-full"
    >
      {/* Top Stage: 2D / Semi-3D Isometric Cybernetic Arena SVG */}
      <div className="w-full bg-gradient-to-b from-[#070D1A] via-[#050912] to-[#04070E] border border-[#162338] relative overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-1 px-2.5 py-1.5 border-b border-[#142034] bg-[#080E1C]/90 text-[9.5px]">
          <div className="flex items-center gap-2">
            <span className="px-1.5 py-0.5 bg-[#00E5FF] text-black font-extrabold text-[9px]">
              3D WAR-ROOM
            </span>
            <span className="font-extrabold text-white tracking-wide">
              4-AGENT NEURAL CONSENSUS ARENA
            </span>
          </div>
          <div className="flex items-center gap-2 font-mono text-[9px]">
            <span className="px-1.5 py-0.5 bg-[#FF9F1C]/15 border border-[#FF9F1C]/60 text-[#FF9F1C] font-bold">
              QUORUM: {consensus.alignedAgentsCount}/4 AGENT
            </span>
            <span className="px-1.5 py-0.5 bg-[#00E676]/15 border border-[#00E676]/60 text-[#00E676] font-bold">
              CHECKLIST: {consensus.checklistPassedCount}/8
            </span>
          </div>
        </div>

        <svg
          viewBox="0 0 920 265"
          className="w-full h-[210px] sm:h-[235px] block select-none"
          role="img"
          aria-label="Isometric 3D 4-Agent Consensus War-Room Illustration"
        >
          <defs>
            <radialGradient id="coreGlow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor={coreColor} stopOpacity="0.38" />
              <stop offset="65%" stopColor={coreColor} stopOpacity="0.08" />
              <stop offset="100%" stopColor="#050811" stopOpacity="0" />
            </radialGradient>
            <linearGradient id="isoGridLine" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#1E293B" stopOpacity="0.1" />
              <stop offset="50%" stopColor="#00E5FF" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#1E293B" stopOpacity="0.1" />
            </linearGradient>
          </defs>

          {/* Isometric 3D Cyber Floor Perspective Grid */}
          <g opacity="0.65" pointerEvents="none">
            <polygon
              points="460,16 875,132 460,248 45,132"
              fill="none"
              stroke="url(#isoGridLine)"
              strokeWidth="1"
            />
            <polygon
              points="460,44 775,132 460,220 145,132"
              fill="none"
              stroke="#16243A"
              strokeWidth="1"
              strokeDasharray="4 4"
            />
            <polygon
              points="460,74 670,132 460,190 250,132"
              fill="none"
              stroke="#1B2E4B"
              strokeWidth="1"
            />
            <line x1="160" y1="68" x2="760" y2="198" stroke="#132035" strokeWidth="1" />
            <line x1="760" y1="68" x2="160" y2="198" stroke="#132035" strokeWidth="1" />
            <line x1="460" y1="16" x2="460" y2="248" stroke="#132035" strokeWidth="1" />
            <line x1="45" y1="132" x2="875" y2="132" stroke="#132035" strokeWidth="1" />
          </g>

          {/* Animated Neural Consensus Laser Beams from 4 Pods -> Central Core (460, 132) */}
          {[
            { x: 160, y: 68, vote: agent1.vote },
            { x: 160, y: 198, vote: agent2.vote },
            { x: 760, y: 68, vote: agent3.vote },
            { x: 760, y: 198, vote: agent4.vote },
          ].map((beam, idx) => {
            const bColor = getVoteColor(beam.vote);
            return (
              <g key={idx} pointerEvents="none">
                <line
                  x1={beam.x}
                  y1={beam.y}
                  x2={460}
                  y2={132}
                  stroke={bColor}
                  strokeWidth="3.5"
                  strokeOpacity="0.18"
                />
                <line
                  x1={beam.x}
                  y1={beam.y}
                  x2={460}
                  y2={132}
                  stroke={bColor}
                  strokeWidth="2.2"
                  className="iso-beam-anim"
                />
              </g>
            );
          })}

          {/* ==================== POD 1: AGENT 1 BLOOMBERG & MACRO NEWS (TOP-LEFT: 160, 68) ==================== */}
          <g className="cursor-pointer" onClick={() => onSelectAgent('BLOOMBERG_NEWS')}>
            {renderIsoPedestal(160, 68, '#FF9F1C', selectedAgentId === 'BLOOMBERG_NEWS')}
            <g className="iso-float-1" pointerEvents="none">
              <polygon
                points="160,22 181,32 160,42 139,32"
                fill="#FF9F1C"
                fillOpacity="0.28"
                stroke="#FF9F1C"
                strokeWidth="1.3"
              />
              <polygon
                points="139,32 160,42 160,62 139,52"
                fill="#B45309"
                fillOpacity="0.45"
                stroke="#FF9F1C"
                strokeWidth="1.1"
              />
              <polygon
                points="160,42 181,32 181,52 160,62"
                fill="#78350F"
                fillOpacity="0.55"
                stroke="#FF9F1C"
                strokeWidth="1.1"
              />
              <ellipse
                cx="160"
                cy="42"
                rx="26"
                ry="10"
                fill="none"
                stroke="#FF9F1C"
                strokeWidth="1.1"
                strokeDasharray="4 3"
              />
              <circle cx="160" cy="40" r="4.5" fill="#FF9F1C" />
              <text
                x="160"
                y="14"
                textAnchor="middle"
                fill="#FF9F1C"
                fontSize="9.5"
                fontWeight="900"
              >
                AGENT 1 • BLOOMBERG NEWS
              </text>
            </g>
            <g pointerEvents="none">
              <rect
                x="98"
                y="88"
                width="124"
                height="17"
                rx="2"
                fill="#070D19"
                stroke={getVoteColor(agent1.vote)}
                strokeWidth="1.2"
              />
              <text
                x="160"
                y="100"
                textAnchor="middle"
                fill={getVoteColor(agent1.vote)}
                fontSize="9"
                fontWeight="800"
              >
                {agent1.vote} • {agent1.credibilityOrAccuracyPct}% VALID
              </text>
            </g>
            <rect
              data-testid="viz-pod-BLOOMBERG_NEWS"
              x="80"
              y="2"
              width="160"
              height="108"
              fill="transparent"
            />
          </g>

          {/* ==================== POD 2: AGENT 2 TECHNICAL & PRICE ACTION (BOTTOM-LEFT: 160, 198) ==================== */}
          <g className="cursor-pointer" onClick={() => onSelectAgent('TECHNICAL_ANALYST')}>
            {renderIsoPedestal(160, 198, '#00E5FF', selectedAgentId === 'TECHNICAL_ANALYST')}
            <g className="iso-float-2" pointerEvents="none">
              <line x1="142" y1="150" x2="142" y2="188" stroke="#FF1744" strokeWidth="1.5" />
              <rect
                x="137"
                y="160"
                width="10"
                height="18"
                fill="#FF1744"
                fillOpacity="0.75"
                stroke="#FF8A80"
                strokeWidth="0.9"
              />
              <line x1="160" y1="142" x2="160" y2="185" stroke="#00E5FF" strokeWidth="1.5" />
              <rect
                x="155"
                y="150"
                width="10"
                height="24"
                fill="#00E5FF"
                fillOpacity="0.8"
                stroke="#E0F7FA"
                strokeWidth="1"
              />
              <line x1="178" y1="146" x2="178" y2="186" stroke="#00E676" strokeWidth="1.5" />
              <rect
                x="173"
                y="153"
                width="10"
                height="22"
                fill="#00E676"
                fillOpacity="0.8"
                stroke="#B9F6CA"
                strokeWidth="0.9"
              />
              <path
                d="M 130 176 Q 147 148, 161 162 T 192 147"
                fill="none"
                stroke="#FF9F1C"
                strokeWidth="2"
              />
              <text
                x="160"
                y="135"
                textAnchor="middle"
                fill="#00E5FF"
                fontSize="9.5"
                fontWeight="900"
              >
                AGENT 2 • QUANT TA &amp; PA
              </text>
            </g>
            <g pointerEvents="none">
              <rect
                x="96"
                y="218"
                width="128"
                height="17"
                rx="2"
                fill="#070D19"
                stroke={getVoteColor(agent2.vote)}
                strokeWidth="1.2"
              />
              <text
                x="160"
                y="230"
                textAnchor="middle"
                fill={getVoteColor(agent2.vote)}
                fontSize="9"
                fontWeight="800"
              >
                {agent2.vote} • RSI {consensus.ta.rsi14} ({agent2.score}%)
              </text>
            </g>
            <rect
              data-testid="viz-pod-TECHNICAL_ANALYST"
              x="80"
              y="124"
              width="160"
              height="116"
              fill="transparent"
            />
          </g>

          {/* ==================== POD 3: AGENT 3 WHALE WALLET TRACKER (TOP-RIGHT: 760, 68) ==================== */}
          <g className="cursor-pointer" onClick={() => onSelectAgent('WHALE_WALLET')}>
            {renderIsoPedestal(760, 68, '#D500F9', selectedAgentId === 'WHALE_WALLET')}
            <g className="iso-float-2" pointerEvents="none">
              <ellipse
                cx="760"
                cy="47"
                rx="30"
                ry="11"
                fill="none"
                stroke="#D500F9"
                strokeWidth="1.2"
                className="iso-sonar-pulse"
              />
              <polygon
                points="760,21 781,31 760,41 739,31"
                fill="#D500F9"
                fillOpacity="0.35"
                stroke="#EA80FC"
                strokeWidth="1.3"
              />
              <polygon
                points="739,31 760,41 760,62 739,52"
                fill="#6A1B9A"
                fillOpacity="0.55"
                stroke="#D500F9"
                strokeWidth="1.1"
              />
              <polygon
                points="760,41 781,31 781,52 760,62"
                fill="#4A148C"
                fillOpacity="0.65"
                stroke="#D500F9"
                strokeWidth="1.1"
              />
              <circle cx="760" cy="41" r="4.5" fill="#00E5FF" />
              <text
                x="760"
                y="14"
                textAnchor="middle"
                fill="#EA80FC"
                fontSize="9.5"
                fontWeight="900"
              >
                AGENT 3 • WHALE TRACKER
              </text>
            </g>
            <g pointerEvents="none">
              <rect
                x="694"
                y="88"
                width="132"
                height="17"
                rx="2"
                fill="#070D19"
                stroke={getVoteColor(agent3.vote)}
                strokeWidth="1.2"
              />
              <text
                x="760"
                y="100"
                textAnchor="middle"
                fill={getVoteColor(agent3.vote)}
                fontSize="9"
                fontWeight="800"
              >
                {agent3.vote} • {consensus.whale.netFlow1hUsd >= 0 ? '+' : '-'}$
                {(Math.abs(consensus.whale.netFlow1hUsd) / 1e6).toFixed(1)}M 1H
              </text>
            </g>
            <rect
              data-testid="viz-pod-WHALE_WALLET"
              x="680"
              y="2"
              width="160"
              height="108"
              fill="transparent"
            />
          </g>

          {/* ==================== POD 4: AGENT 4 EXECUTION PRECISION ARBITER (BOTTOM-RIGHT: 760, 198) ==================== */}
          <g className="cursor-pointer" onClick={() => onSelectAgent('EXECUTION_PRECISION')}>
            {renderIsoPedestal(760, 198, '#00E676', selectedAgentId === 'EXECUTION_PRECISION')}
            <g className="iso-float-1" pointerEvents="none">
              <polygon
                points="760,141 781,152 781,174 760,185 739,174 739,152"
                fill="#00E676"
                fillOpacity="0.18"
                stroke="#00E676"
                strokeWidth="1.5"
              />
              <circle
                cx="760"
                cy="163"
                r="13"
                fill="none"
                stroke="#00E5FF"
                strokeWidth="1.2"
                strokeDasharray="5 3"
                className="iso-orbit-spin"
              />
              <line x1="743" y1="163" x2="777" y2="163" stroke="#00E676" strokeWidth="1.2" />
              <line x1="760" y1="146" x2="760" y2="180" stroke="#00E676" strokeWidth="1.2" />
              <circle cx="760" cy="163" r="3.5" fill="#00E676" />
              <text
                x="760"
                y="135"
                textAnchor="middle"
                fill="#00E676"
                fontSize="9.5"
                fontWeight="900"
              >
                AGENT 4 • PRECISION ARBITER
              </text>
            </g>
            <g pointerEvents="none">
              <rect
                x="694"
                y="218"
                width="132"
                height="17"
                rx="2"
                fill="#070D19"
                stroke={getVoteColor(agent4.vote)}
                strokeWidth="1.2"
              />
              <text
                x="760"
                y="230"
                textAnchor="middle"
                fill={getVoteColor(agent4.vote)}
                fontSize="9"
                fontWeight="800"
              >
                {agent4.vote} • R:R 1:{consensus.riskRewardRatio}
              </text>
            </g>
            <rect
              data-testid="viz-pod-EXECUTION_PRECISION"
              x="680"
              y="124"
              width="160"
              height="116"
              fill="transparent"
            />
          </g>

          {/* ==================== CENTRAL 3D HOLOGRAPHIC CONSENSUS CORE (460, 132) ==================== */}
          <g pointerEvents="none">
            <circle cx="460" cy="132" r="88" fill="url(#coreGlow)" />

            <polygon
              points="460,126 548,160 460,194 372,160"
              fill="#091324"
              stroke={coreColor}
              strokeWidth="1.8"
            />
            <polygon
              points="372,160 460,194 460,210 372,176"
              fill="#060D1A"
              stroke={coreColor}
              strokeWidth="1.2"
              strokeOpacity="0.75"
            />
            <polygon
              points="460,194 548,160 548,176 460,210"
              fill="#040912"
              stroke={coreColor}
              strokeWidth="1.2"
              strokeOpacity="0.55"
            />

            <ellipse
              cx="460"
              cy="154"
              rx="66"
              ry="24"
              fill="none"
              stroke={coreColor}
              strokeWidth="1.4"
              strokeDasharray="8 5"
              className="iso-sonar-pulse"
            />
            <ellipse
              cx="460"
              cy="121"
              rx="52"
              ry="18"
              fill="none"
              stroke="#00E5FF"
              strokeWidth="1.2"
              strokeDasharray="6 4"
            />

            <g className="iso-float-1">
              <polygon
                points="460,52 502,98 460,114"
                fill={coreColor}
                fillOpacity="0.32"
                stroke={coreColor}
                strokeWidth="1.5"
              />
              <polygon
                points="460,52 418,98 460,114"
                fill={coreColor}
                fillOpacity="0.48"
                stroke={coreColor}
                strokeWidth="1.5"
              />
              <polygon
                points="418,98 460,114 460,154"
                fill="#0D1F38"
                fillOpacity="0.85"
                stroke={coreColor}
                strokeWidth="1.4"
              />
              <polygon
                points="502,98 460,114 460,154"
                fill="#081324"
                fillOpacity="0.9"
                stroke={coreColor}
                strokeWidth="1.4"
              />

              <rect
                x="392"
                y="80"
                width="136"
                height="46"
                rx="3"
                fill="#050A14"
                fillOpacity="0.92"
                stroke={coreColor}
                strokeWidth="1.8"
              />
              <text
                x="460"
                y="95"
                textAnchor="middle"
                fill="#CBD5E1"
                fontSize="9.5"
                fontWeight="800"
              >
                {consensus.symbol} • VERDICT
              </text>
              <text
                x="460"
                y="112"
                textAnchor="middle"
                fill={coreColor}
                fontSize="13"
                fontWeight="900"
              >
                {consensus.hasVeto
                  ? 'VETO GUARD'
                  : `${consensus.recommendedSide} (${consensus.positionAccuracyPct}%)`}
              </text>
            </g>

            <rect
              x="382"
              y="168"
              width="156"
              height="18"
              rx="2"
              fill="#060B14"
              stroke="#1E2F4D"
              strokeWidth="1.1"
            />
            <text
              x="460"
              y="180"
              textAnchor="middle"
              fill="#00E5FF"
              fontSize="9"
              fontWeight="800"
            >
              ENTRY ${consensus.entryPrice.toLocaleString()} • SL ${consensus.stopLossPrice.toLocaleString()}
            </text>
          </g>
        </svg>
      </div>

      {/* Bottom Bar: Selected Agent Specialized Sub-Skill Matrix (3 Smart Sub-Skills per Agent) */}
      <div
        data-testid="agent-subskills-inspector"
        className="w-full bg-[#070C17] border border-[#1B2942] p-2 flex flex-col gap-1.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#162238] pb-1.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[9.5px] font-extrabold text-[#00E5FF] uppercase tracking-wider shrink-0">
              INSPEKSI SKILL KHUSUS:
            </span>
            <span className="text-[10px] font-extrabold text-[#FF9F1C] truncate">
              {activeAgent.agentName}
            </span>
            <span
              className={`px-1.5 py-0.5 text-[9px] font-extrabold shrink-0 ${
                activeAgent.vote === 'LONG'
                  ? 'bg-[#00E676]/20 text-[#00E676] border border-[#00E676]'
                  : activeAgent.vote === 'SHORT' || activeAgent.vote === 'VETO'
                    ? 'bg-[#FF1744]/20 text-[#FF1744] border border-[#FF1744]'
                    : 'bg-[#FF9F1C]/20 text-[#FF9F1C] border border-[#FF9F1C]'
              }`}
            >
              {activeAgent.vote} ({activeAgent.credibilityOrAccuracyPct}%)
            </span>
          </div>

          <div className="flex items-center gap-1">
            {consensus.votes.map((v, idx) => {
              const active = v.agentId === activeAgent.agentId;
              return (
                <button
                  key={v.agentId}
                  data-testid={`select-agent-skill-${v.agentId}`}
                  onClick={() => onSelectAgent(v.agentId)}
                  className={`py-0.5 px-2 text-[8.5px] font-extrabold border text-center ${
                    active
                      ? 'bg-[#00E5FF] text-black border-[#00E5FF]'
                      : 'bg-[#0C1424] text-[#94A3B8] border-[#1A273E] hover:text-white'
                  }`}
                >
                  AGENT {idx + 1}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-1.5">
          {(activeAgent.subSkills || []).map((skill, idx) => (
            <div
              key={idx}
              className="p-1.5 bg-[#0A1120] border border-[#17243A]"
            >
              <div className="flex items-center justify-between text-[9px] font-extrabold">
                <span className="text-white truncate">{skill.name}</span>
                <span className="text-[#00E676] font-mono shrink-0">{skill.score}%</span>
              </div>
              <div className="text-[8.5px] text-[#00E5FF] font-mono truncate mt-0.5">
                {skill.status}
              </div>
              <div className="w-full h-1 bg-[#131D31] mt-1 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-[#00E5FF] to-[#00E676]"
                  style={{ width: `${Math.min(100, Math.max(25, skill.score))}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
