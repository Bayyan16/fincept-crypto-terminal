# Fincept Whale Quant Terminal

### Autonomous Multi-Exchange Crypto Spot & Perpetual Futures Trading Terminal with 4-Agent Consensus Intelligence

Fincept Whale Quant Terminal is an institutional-style, high-contrast dark trading terminal for cryptocurrency spot and perpetual futures markets. It combines real-time multi-exchange and on-chain market data aggregation, a 4-Agent Consensus Forum with 12 specialized sub-skills, isometric 3D visualizers for multi-agent coordination and profit/loss vault settlement, zero-slop risk controls, and automated direct-to-hot-wallet profit settlement for Trust Wallet and Phantom Wallet.

---

## Core Capabilities

### 1. Full Crypto Market Universe (236+ Live Markets)
Monitors real-time market microstructure, OHLCV candlesticks, L2 orderbooks, and whale flows beyond top market-cap assets across all major sectors:
- **Core Large-Cap Markets**: `BTC-PERP`, `ETH-PERP`, `XRP-PERP`, `BNB-PERP`, `SOL-PERP`, `DOGE-PERP`, `ADA-PERP`, `TRX-PERP`, `AVAX-PERP`, `LINK-PERP`, `HYPE-USDC`, `SUI-PERP`, `JUP-SOL`, and `RAY-SOL`.
- **Expanded Multi-Sector Coverage**: AI & DePIN (`TAO`, `RENDER`, `FET`, `WLD`, `VIRTUAL`, `IO`, `AR`), DeFi & RWA (`AAVE`, `UNI`, `ONDO`, `ENA`, `PENDLE`, `MKR`), L1/L2 Ecosystems (`ARB`, `OP`, `APT`, `NEAR`, `INJ`, `TIA`, `SEI`, `TON`, `DOT`), and Meme/Alpha assets (`PEPE`, `WIF`, `BONK`, `SHIB`, `FARTCOIN`), dynamically merged with 236+ live Hyperliquid L1 markets and authentic token icons.

### 2. Unified On-Chain & Multi-Exchange Backend Gateway (`backend/exchangeGateway.mjs` & `server.mjs`)
- **Hyperliquid L1 Mainnet (`api.hyperliquid.xyz/info`)**:
  - Live `metaAndAssetCtxs`, `candleSnapshot` (`1m`, `5m`, `15m`, `1h`, `4h`, `1d`), batch multi-market OHLCV candles (`/api/live/batch-candles`), `l2Book`, `recentTrades`, and institutional position tracking for the **HLP Vault (`0xdfc24b077bc1425ad1dea75bcb6f8158e10df303`)**.
- **Official Institutional News Wire**:
  - Aggregates official **Bloomberg Crypto RSS**, **CoinDesk Institutional RSS**, and crypto/macro-filtered **Bloomberg Markets RSS** through a semantic relevance gate so unrelated general-commodity or equity headlines are excluded.
- **Solana DEX Aggregators**:
  - **Raydium V3 CLMM (`api-v3.raydium.io`)** and **DexScreener (`api.dexscreener.com`)** for TVL, 24h volume, and on-chain pool price impact.
  - **Jupiter V1 Quote API (`lite-api.jup.ag/swap/v1/quote`)** for live swap route quoting.
- **Multi-Chain EVM Block & Transaction Telemetry (`eth_getBlockByNumber`)**:
  - Streams live block heights and transactions from public RPC endpoints across **Ethereum Mainnet**, **Arbitrum One**, and **BNB Smart Chain (BSC)** with transaction hashes, block numbers, wallet addresses, and explorer links.
- **Dual-Path Cloud Resilience (`src/engine/liveConnectors.ts`)**:
  - Supports both the local/cloud Backend Gateway and a direct browser-to-on-chain fallback for uninterrupted operation.

### 3. 4-Agent Consensus Forum & 12 Specialized Sub-Skills (`src/engine/multiAgentForum.ts` & `src/engine/agentSkills.ts`)
Every trade setup is evaluated collaboratively across four specialized agents before execution:
1. **Agent 1 — Bloomberg & Macro News Intelligence (90%–100% Credibility Gate)**:
   - *Skill 1A*: Crypto/Macro Semantic Relevance Gate.
   - *Skill 1B*: Cross-Chain News Truth Audit (90%–100% verified threshold).
   - *Skill 1C*: Catalyst Impact & Urgency Matrix across 21+ ticker profiles.
2. **Agent 2 — Quantitative Technical & Price Action Analyst**:
   - *Skill 2A*: Price Action Market Structure (`BOS` / `CHoCH`) and Key Support/Resistance (`S1/S2`, `R1/R2`).
   - *Skill 2B*: `EMA 20 / 50 / 200` Trend Stack and `Bollinger Bands (20, 2σ)` Volatility Regime.
   - *Skill 2C*: `RSI(14)` and `MACD(12, 26, 9)` Momentum Impulse & Exhaustion Filter.
3. **Agent 3 — Institutional Whale Wallet Tracker**:
   - *Skill 3A*: Institutional Wallet & HLP Vault Exposure Tracking (filtering out generic stablecoin bridge noise).
   - *Skill 3B*: Real-Time L2 Orderbook Wall & Orderbook Imbalance (`OBI`) Alignment.
   - *Skill 3C*: Smart-Money Cumulative Volume Delta (`CVD`) Absorption Detection.
4. **Agent 4 — Execution Precision & Risk Arbiter**:
   - *Skill 4A*: 4-Agent Quorum Verification & Extremes Veto Guard.
   - *Skill 4B*: ATR Structural Stop-Loss & Uncapped Asymmetric Take-Profit Engine.
   - *Skill 4C*: Zero-Slop Post-Only Maker Execution & Automatic Breakeven + Fee Lock.

### 4. Uncapped Take-Profit Policy (Minimum 50% ROI Floor) & Deep Position Intelligence
- **Minimum 50% ROI Floor, Unlimited Upside**: Positions are never closed early below the mandatory `+50%` take-profit floor. Once above `+50%`, there is no hard maximum cap; the agent dynamically rides momentum using 3-pillar telemetry (**Orderbook Defense**, **On-Chain Whale Conviction**, and **Market Sentiment**) until detecting orderflow exhaustion or a trailing pullback from peak profit.
- **8-Point Pre-Trade Precision Checklist & Walk-Forward Accuracy Auditor**: Validates every entry against 8 mandatory quantitative checks and continuously tests active positions and historical real OHLCV candles without lookahead bias.
- **Continuous Post-TP Opportunity Hunter**: Automatically scans the full market universe after a position settles and opens low-risk replacement positions (up to 3 concurrent slots) with direct-to-hot-wallet profit settlement.

### 5. Interactive Terminal Workspace & 3D Isometric Visualizers
- **3D Isometric Multi-Agent Neural War-Room (`src/components/AgentWarRoom3DViz.tsx`)**: Interactive isometric arena displaying all four specialist agents, animated neural consensus beams, live verdict core, and clickable per-agent sub-skill inspection.
- **3D Dual-Vault Settlement Courier (`src/components/VaultSettlementCourier3DViz.tsx`)**: Real-time visual courier routing realized profits into the Internal Profit Vault and micro-scratch losses out to the External Liquidity Vault, synchronized with the Execution & Settlement Audit Log.
- **2D Free-Pan & Wheel-Zoom Orderflow Chart (`src/components/CandlestickOrderflowChart.tsx`)**: Supports 2-axis free panning, mouse-wheel zoom (`8` to `140` bars), bar-count slider, and auto-fit controls.
- **Interactive Whale Pipeline Visualizer (`src/components/WhaleChordViz.tsx`)**: Draggable nodes, canvas panning, wheel zoom (`45%–300%`), Radial Chord and 3-Tier Pipeline layouts, and a resizable multi-tab On-Chain Drawer (On-Chain Stream, Whale & HLP Positions, and Live Blocks & AI Matrix).
- **18-Level Multi-Exchange Orderbook (`src/App.tsx`)**: Displays active coin telemetry, microstructure summary cards, and 18 bid/ask depth levels tagged by venue (`HL-L1`, `BINANCE`, `BYBIT`, `OKX`, `JUPITER`, `RAYDIUM`).

---

## Getting Started

### 1. Install Dependencies
```bash
npm install
```

### 2. Run in Development Mode (Vite + Embedded On-Chain Gateway)
```bash
npm run dev
```
Open `http://localhost:5173/` for Fincept Simple. The full Pro workspace is available at `/pro/`, and `/simple/` also opens Simple. Both editions share the same analysis engine and backend gateway. Switch editions using the Pro/Simple link in the navigation. The switch preserves the selected market, open positions, and trading inputs during the session, while each edition retains its own panel visibility settings.

Simple starts with the chart in focus. Use **Whale Pipeline** and **Kontrol trading** to reveal optional panels and order controls. These display preferences do not change execution mode. The default execution mode is Paper.

### 3. Build and Run in Production Mode
```bash
npm run build
npm start
```
The standalone production server (`server.mjs`) serves the compiled frontend bundle alongside all `/api/live/*` and `/api/gateway/*` endpoints on port `8080` (or the configured `PORT` environment variable).

### 4. Run End-to-End Tests (Playwright)
The Playwright E2E suite covers the Simple and Pro editions across desktop (`1600px`) and narrow tablet (`900px`) viewports, covering terminal navigation, multi-sector market explorer, token icons, 4-Agent Consensus Forum, 3D visualizers, accuracy auditor, execution audit cockpit, DEX Screener, orderbook depth, wallet modal, and UI motion/accessibility (`prefers-reduced-motion`).

```bash
npm run e2e                                # Run full suite (desktop + tablet)
npm run e2e -- --project=desktop-chrome    # Run desktop suite only
npm run e2e -- e2e/desk.spec.ts            # Run a single spec file
npm run e2e:report                         # Open the latest HTML test report
```

Note: Playwright uses the locally installed Chrome binary (`channel: 'chrome'`) and reuses an existing dev server on port `5174`. Set `E2E_BASE_URL` to test another local port.

---

## Project Structure

- `src/App.tsx` — Main 5-tab Fincept Whale Quant Terminal interface and execution state management.
- `src/components/MultiAgentForumPanel.tsx` — 4-Agent Consensus Forum, Verified News Wire, All-Market Scanner, and Position Accuracy Auditor.
- `src/components/AgentWarRoom3DViz.tsx` — Interactive 3D Isometric Multi-Agent War-Room and sub-skill inspector.
- `src/components/VaultSettlementCourier3DViz.tsx` — Interactive 3D Dual-Vault Profit Inflow & External Loss Outflow Courier visualizer.
- `src/components/CandlestickOrderflowChart.tsx` — Interactive candlestick and orderflow chart with 2D pan and wheel zoom.
- `src/components/WhaleChordViz.tsx` — Interactive Whale Pipeline visualizer and resizable on-chain blockchain stream drawer.
- `src/components/CoinIcon.tsx` — Multi-source authentic token icon resolver with automatic fallback.
- `src/engine/multiAgentForum.ts` — 4-Agent Consensus engine, technical indicators (`EMA`, `RSI`, `MACD`, `Bollinger`, `ATR`, `S/R`), 8-point checklist, and walk-forward accuracy auditor.
- `src/engine/agentSkills.ts` — Multi-market scanner, 3-pillar deep position intelligence, uncapped 50%+ take-profit engine, and post-TP continuous hunter.
- `src/engine/liveConnectors.ts` — Real-time multi-exchange and on-chain data connectors with dual-path fallback.
- `src/engine/walletAdapter.ts` — Trust Wallet (`EIP-6963`), Phantom Wallet (Solana), and multi-chain network switcher.
- `backend/exchangeGateway.mjs` — Middleware for Hyperliquid L1, Bloomberg/CoinDesk RSS wire, Raydium, Jupiter, DexScreener, multi-chain EVM RPCs, and order execution.
- `backend/terminal_agent_daemon.py` — Reference Python quantitative daemon module.
- `server.mjs` — Standalone production HTTP server for cloud deployment.
- `docs/ARCHITECTURE_BLUEPRINT.md` — System architecture specification and design reference.
