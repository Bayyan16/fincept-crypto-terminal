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
    if (vote === 'LONG') return '#34D399';
    if (vote === 'SHORT') return '#F87171';
    if (vote === 'VETO') return '#F87171';
    return '#F5B74F';
  };

  const activeAgent =
    consensus.votes.find((vote) => vote.agentId === selectedAgentId) || consensus.votes[0];
  const id = React.useId();
  const [flightPaused, setFlightPaused] = React.useState(false);
  const sceneRef = React.useRef<SVGSVGElement>(null);
  const [camera, setCamera] = React.useState({ yaw: 0, pitch: -0.47, zoom: 1 });
  const drag = React.useRef<{ id: number; x: number; y: number } | null>(null);

  const adjustZoom = (factor: number) => {
    setCamera((current) => ({ ...current, zoom: Math.max(0.65, Math.min(1.65, current.zoom * factor)) }));
  };

  const rotateCamera = (dx: number, dy: number) => {
    setCamera((current) => ({
      ...current,
      yaw: current.yaw + dx,
      pitch: Math.max(-1.45, Math.min(1.45, current.pitch + dy)),
    }));
  };

  const project = (x: number, y: number, z: number) => {
    const horizontal = x * Math.cos(camera.yaw) - z * Math.sin(camera.yaw);
    const depth = x * Math.sin(camera.yaw) + z * Math.cos(camera.yaw);
    const vertical = y * Math.cos(camera.pitch) - depth * Math.sin(camera.pitch);
    const distance = y * Math.sin(camera.pitch) + depth * Math.cos(camera.pitch);
    const scale = camera.zoom * 760 / (760 + distance);
    return { x: 310 + horizontal * scale, y: 167 + vertical * scale, depth: distance, scale };
  };

  React.useEffect(() => {
    if (flightPaused) sceneRef.current?.pauseAnimations();
    else sceneRef.current?.unpauseAnimations();
  }, [flightPaused]);
  const planets = [
    { id: 'BLOOMBERG_NEWS', label: 'Macro News', angle: 3.66, radius: 29, color: '#F8C675' },
    { id: 'TECHNICAL_ANALYST', label: 'Price Action', angle: 5.44, radius: 34, color: '#70DBFA' },
    { id: 'WHALE_WALLET', label: 'Whale Intel', angle: .61, radius: 37, color: '#E28DD1' },
    { id: 'EXECUTION_PRECISION', label: 'Risk & Execution', angle: 2.29, radius: 35, color: '#7DE2BA' },
  ] as const;
  const orbit = (radius: number, angle: number, tilt = 0) => {
    const z = Math.sin(angle) * radius;
    return project(Math.cos(angle) * radius, z * tilt, z);
  };
  const orbitPath = (radius: number, tilt = 0) =>
    Array.from({ length: 73 }, (_, index) => {
      const point = orbit(radius, index * Math.PI / 36, tilt);
      return `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
    }).join(' ') + ' Z';
  const flightPath = orbitPath(202);
  const projectedPlanets = planets.map((planet) => ({ ...planet, ...orbit(202, planet.angle) }))
    .sort((left, right) => right.depth - left.depth);
  const cloudPaths = [0, 1].map((band) =>
    Array.from({ length: 180 }, (_, index) => {
      const angle = index * 2.399963;
      const height = 1 - 2 * (index + .5) / 180;
      const radius = Math.sqrt(1 - height * height);
      const point = project((band ? 23 : -23) + Math.cos(angle) * radius * 47, height * 48, Math.sin(angle) * radius * 47);
      return `M${point.x.toFixed(2)} ${point.y.toFixed(2)}h.1`;
    }).join(' ')
  );

  return (
    <div
      data-testid="agent-war-room-3d-viz"
      className="agent-orbit-card min-w-0 bg-[#050811] border border-[#1B2A44] flex flex-col gap-3"
    >
      <div className="agent-orbit-stage">
        <div className="agent-orbit-header">
          <h3>Orbit Konsensus</h3>
          <div className="flex flex-wrap items-center gap-2">
            <span className="agent-orbit-stat">Kuorum {consensus.alignedAgentsCount}/4</span>
            <span className="agent-orbit-stat">Checklist {consensus.checklistPassedCount}/8</span>
            <button type="button" className="agent-flight-toggle" aria-label="Perkecil tata surya" onClick={() => adjustZoom(1 / 1.15)}>−</button>
            <button type="button" className="agent-flight-toggle" aria-label="Perbesar tata surya" onClick={() => adjustZoom(1.15)}>+</button>
            <button type="button" className="agent-flight-toggle" onClick={() => setCamera({ yaw: 0, pitch: -0.47, zoom: 1 })}>Reset kamera</button>
            <button
              type="button"
              className="agent-flight-toggle agent-flight-motion-toggle"
              onClick={() => setFlightPaused((paused) => !paused)}
            >
              {flightPaused ? 'Jalankan roket' : 'Jeda roket'}
            </button>
          </div>
        </div>

        <svg
          ref={sceneRef}
          viewBox="0 0 620 345"
          className="agent-orbit-scene agent-orbit-interactive"
          role="group"
          aria-label="Peta orbital empat agen konsensus. Seret latar atau gunakan tombol panah untuk memutar kamera."
          tabIndex={0}
          onPointerDown={(event) => {
            if (event.button !== 0 || (event.target instanceof Element && event.target.closest('[data-agent-planet]'))) return;
            drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerMove={(event) => {
            const previous = drag.current;
            if (!previous || previous.id !== event.pointerId) return;
            rotateCamera((event.clientX - previous.x) * .012, (event.clientY - previous.y) * .01);
            drag.current = { id: previous.id, x: event.clientX, y: event.clientY };
          }}
          onLostPointerCapture={() => { drag.current = null; }}
          onKeyDown={(event) => {
            const x = event.key === 'ArrowLeft' ? -.16 : event.key === 'ArrowRight' ? .16 : 0;
            const y = event.key === 'ArrowUp' ? -.12 : event.key === 'ArrowDown' ? .12 : 0;
            if (x || y) {
              event.preventDefault();
              rotateCamera(x, y);
            }
          }}
        >
          <defs>
            {planets.map((planet) => (
              <radialGradient key={planet.id} id={`${id}-${planet.id}`} fx="30%" fy="24%">
                <stop offset="0%" stopColor={planet.color} stopOpacity=".76" />
                <stop offset="56%" stopColor={planet.color} stopOpacity=".23" />
                <stop offset="100%" stopColor="#09151e" />
              </radialGradient>
            ))}
            <linearGradient id={`${id}-trail`}>
              <stop offset="0%" stopColor="#37CFF3" stopOpacity="0" />
              <stop offset="100%" stopColor="#A1FBFF" />
            </linearGradient>
          </defs>
          <g aria-hidden="true" pointerEvents="none">
            {[84, 126, 164, 202, 235].map((radius) => (
              <path key={radius} d={orbitPath(radius)} fill="none" stroke="#64B7CF" strokeOpacity=".3" />
            ))}
            <path d={orbitPath(238, .30)} stroke="#D487CA" strokeOpacity=".35" fill="none" />
            <path d={orbitPath(238, -.30)} stroke="#6ADDC3" strokeOpacity=".36" fill="none" />
            <path d={flightPath} stroke="#67DFF5" strokeOpacity=".65" strokeDasharray="3 7" fill="none" />
            {cloudPaths.map((path, band) => (
              <path key={band} d={path} stroke={band ? '#F28ACE' : '#67DFF5'} strokeWidth="1.55" strokeLinecap="round" opacity=".8" />
            ))}
            <text x="310" y="237" textAnchor="middle" className="agent-orbit-label">CORE KONSENSUS</text>
            <text x="310" y="251" textAnchor="middle" className="agent-orbit-score"
              fill={consensus.hasVeto ? '#F87171' : getVoteColor(consensus.recommendedSide)}>
              {consensus.hasVeto ? 'VETO' : consensus.recommendedSide}
            </text>
          </g>

          {projectedPlanets.map(({ id: agentId, label, x, y, scale, radius, color }) => {
            const vote = consensus.votes.find((item) => item.agentId === agentId);
            if (!vote) return null;
            const selected = selectedAgentId === agentId;
            return (
              <g
                key={agentId}
                transform={`translate(${x} ${y}) scale(${scale})`}
                data-agent-planet=""
                className="agent-orbit-planet"
                data-testid={`viz-pod-${agentId}`}
                role="button"
                aria-label={vote.agentName}
                aria-pressed={selected}
                tabIndex={0}
                onClick={() => onSelectAgent(agentId)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    onSelectAgent(agentId);
                  }
                }}
              >
                <circle className="agent-orbit-selection" r={radius + 9} stroke={color} fill="none" strokeDasharray="3 4" />
                <circle r={radius} fill={`url(#${id}-${agentId})`} stroke={color} strokeOpacity=".9" />
                <ellipse rx={radius * .43} ry={radius} fill="none" stroke={color} strokeOpacity=".54" transform="rotate(-22)" />
                <ellipse rx={radius} ry={radius * .30} fill="none" stroke={color} strokeOpacity=".56" transform="rotate(-22)" />
                <ellipse rx={radius * 1.36} ry={radius * .34} fill="none" stroke={color} strokeOpacity=".8" transform="rotate(-22)" />
                <text y={radius + 20} textAnchor="middle" className="agent-orbit-label">{label}</text>
                <text y={radius + 34} textAnchor="middle" className="agent-orbit-score" fill={getVoteColor(vote.vote)}>
                  {vote.vote} · {vote.credibilityOrAccuracyPct}%
                </text>
              </g>
            );
          })}

            <g className="agent-orbit-rocket" aria-hidden="true" pointerEvents="none">
              <animateMotion dur="15s" repeatCount="indefinite" rotate="auto" path={flightPath} />
              <path d="M-42 0 H-9" stroke={`url(#${id}-trail)`} strokeWidth="2.8" strokeLinecap="round" />
              <path d="M-9 -3 -13 -8 -4 -6 Q4 -8 13 0 Q4 8 -4 6 L-13 8 -9 3Z" fill="#D7FBFF" stroke="#62DAF1" />
              <circle cx="3" cy="0" r="2.1" fill="#1D6683" />
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

          <div className="flex flex-wrap items-center gap-1">
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

        <div className="agent-orbit-skills grid grid-cols-1 gap-2">
          {(activeAgent.subSkills || []).map((skill, idx) => (
            <div
              key={idx}
              className="min-w-0 p-2 bg-[#0A1120] border border-[#17243A]"
            >
              <div className="flex items-center justify-between text-[11px] font-extrabold gap-2">
                <span className="text-white">{skill.name}</span>
                <span className="text-[#00E676] font-mono shrink-0">{skill.score}%</span>
              </div>
              <div className="text-[10px] text-[#00E5FF] font-mono break-words mt-0.5">
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
