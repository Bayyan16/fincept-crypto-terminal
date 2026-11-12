# FINCEPT WHALE QUANT TERMINAL (v5.1)
### Autonomous Multi-Exchange Crypto Spot & Futures Trading Terminal & Real-Time On-Chain Whale Intelligence Agent

Terminal trading crypto **Spot & Perpetual Futures** otonom bergaya *Fincept / Bloomberg High-Contrast Dark* yang menggabungkan agregasi data **On-Chain & Multi-Exchange secara Real-Time**, visualisasi interaktif **Whale Pipeline & Blockchain Explorer**, serta **Autonomous AI/Quant Trading Agent (6 Smart Skills)** dengan proteksi risiko *Zero-Slop* dan pencairan profit otomatis langsung ke *Hot Wallet* (**Trust Wallet & Phantom Wallet**).

---

## 🌟 Fitur Utama (Built & Verified)

### 1. Cakupan 14 Market Real-Time (Top 10 CoinMarketCap + Leading DEX Assets)
Mendukung pemantauan mikrostruktur, *candlestick*, *orderbook*, dan *whale flow* secara langsung untuk:
- **Top 10 CoinMarketCap**: `BTC-PERP` (#1), `ETH-PERP` (#2), `XRP-PERP` (#3), `BNB-PERP` (#4), `SOL-PERP` (#5), `DOGE-PERP` (#6), `ADA-PERP` (#7), `TRX-PERP` (#8), `AVAX-PERP` (#9), `LINK-PERP` (#10).
- **High-Velocity DEX & L1**: `HYPE-USDC` (Hyperliquid L1), `SUI-PERP`, `JUP-SOL` (Jupiter), dan `RAY-SOL` (Raydium).

### 2. Unified On-Chain & Multi-Exchange Backend Gateway (`backend/exchangeGateway.mjs` & `server.mjs`)
- **Hyperliquid L1 Mainnet (`api.hyperliquid.xyz/info`)**:
  - Live `metaAndAssetCtxs`, `candleSnapshot` (1m, 5m, 15m, 1h, 4h, 1d), `l2Book`, `recentTrades`, serta pelacakan posisi institusional langsung pada **HLP Vault (`0xdfc24b077bc1425ad1dea75bcb6f8158e10df303`)**.
- **Solana DEX Aggregators**:
  - **Raydium V3 CLMM (`api-v3.raydium.io`)** & **DexScreener (`api.dexscreener.com`)** untuk TVL, volume 24 jam, dan *price impact* pool on-chain.
  - **Jupiter V1 Quote API (`lite-api.jup.ag/swap/v1/quote`)** untuk kutipan rute *swap* terbaik.
- **Live Multi-Chain EVM Block & Transaction Stream (`eth_getBlockByNumber`)**:
  - Membaca blok dan transaksi *real-time* langsung dari RPC publik **Ethereum Mainnet**, **Arbitrum One**, dan **BNB Smart Chain (BSC)** lengkap dengan **Tx Hash (`0x...`)**, **Block Number**, **Sender/Receiver Wallet**, dan **Gas/Value**.
- **Dual-Path Cloud Resilience (`src/engine/liveConnectors.ts`)**:
  - Mendukung koneksi ke Backend Gateway maupun *Direct Browser-to-OnChain Fallback* sehingga terminal siap di-deploy ke layanan cloud/hosting publik kapan saja.

### 3. Autonomous Agent Brain — 6 Smart Skills (`src/engine/agentSkills.ts`)
1. **Skill 1 — Liquidity Gatekeeper**: Menolak eksekusi pada market dengan likuiditas tipis atau *spread* lebar.
2. **Skill 2 — Weighted Orderbook Imbalance (W-OBI) & CVD Absorption**: Mendeteksi tembok *Bid/Ask* institusional pada 18 level kedalaman L2.
3. **Skill 3 — On-Chain Whale & HLP Vault Alignment**: Menyelaraskan arah order dengan aliran dana *Smart Money* on-chain.
4. **Skill 4 — Zero-Slop Micro-Loss Prevention**: Eksekusi *Post-Only Maker* + *Auto-Breakeven + Fee Lock (`+0.06%`)*.
5. **Skill 5 — Continuous Post-TP Opportunity Hunter (`4x–8x` Conservative Leverage)**:
   - Otomatis mencari dan membuka posisi berisiko rendah baru pasca *Take Profit* hingga **maksimal 3 posisi paralel** dengan *leverage* konservatif adaptif **`4x–8x`**.
6. **Skill 6 — 3-Pillar Deep Position Intelligence & Direct-to-Hot-Wallet Settlement**:
   - Menganalisis setiap posisi terbuka secara *real-time* berdasarkan **Orderbook Defense (`0–100`)**, **On-Chain Whale Conviction (`0–100`)**, dan **Market Sentiment (`0–100`)** untuk memutuskan apakah harus **menahan *floating loss* (`HOLD_FLOATING_LOSS`)**, **mengawal profit (`RIDE_PROFIT_TRAIL`)**, **Take Profit otomatis (`AUTO_TAKE_PROFIT_NOW`)**, atau **Cut Loss cepat (`AUTO_CUT_INVALIDATED`)**.
   - **Auto Hot-Wallet Profit Settlement**: Setiap profit dari posisi yang ditutup otomatis langsung ditransfer/disinkronkan ke saldo **Trust Wallet / Phantom Wallet** pengguna tanpa perlu *withdraw* manual.

### 4. Interactive High-Contrast Terminal UI
- **2D Free-Pan & Wheel-Zoom Orderflow Chart (`src/components/CandlestickOrderflowChart.tsx`)**:
  - Mendukung *drag* bebas 2 arah (geser kiri-kanan untuk waktu & geser atas-bawah untuk skala harga), *mouse wheel zoom* (`8` hingga `140` bar), *slider* jumlah bar, serta tombol `AUTO-FIT`.
- **Interactive Whale Pipeline Visualizer & Resizable On-Chain Blockchain Stream (`src/components/WhaleChordViz.tsx`)**:
  - **Drag-and-Drop Node**, **Canvas Pan**, **Wheel Zoom (`45%–300%`)**, serta mode tata letak **Radial Chord** & **3-Tier Pipeline**.
  - **Resizable Multi-Tab On-Chain Drawer**: Panel tabel di bagian bawah dapat ditarik naik/turun secara fleksibel (*drag handle bar* + tombol cepat `▼ KECIL`, `▬ NORMAL`, `▲ NAIKKAN PENUH`) dengan 3 sub-tab:
    1. `⛓️ ON-CHAIN STREAM`: Tabel lengkap *Time, Chain & Block, Tx Hash (`0x...`), Sender -> Receiver Wallet, Action, Coin, Value ($), Impact*, dan tombol `🔍 Lacak` (membuka panel *On-Chain Audit Detail* + tautan langsung ke *Etherscan, Arbiscan, BscScan, Solscan, Hyperliquid Explorer*).
    2. `🐋 WHALE & HLP POSITIONS`: Daftar posisi terbuka *whale* & *HLP Vault* beserta jarak likuidasi dan *Unrealized PnL*.
    3. `🧱 LIVE BLOCKS & AI MATRIX`: Kartu telemetri blok terbaru per *blockchain* dan matriks keputusan *Agent AI*.
- **18-Level Multi-Exchange Orderbook (`src/App.tsx`)**:
  - Menampilkan header koin aktif secara eksplisit, pemilih cepat 14 market, 4 kartu mikrostruktur, dan tabel 18-level *Bid vs Ask* lengkap dengan label bursa (`HL-L1`, `BINANCE`, `BYBIT`, `OKX`, `JUPITER`, `RAYDIUM`).

---

## 🚀 Cara Menjalankan (Local Development & Cloud Production)

### 1. Instalasi Dependensi
```bash
npm install
```

### 2. Menjalankan Mode Development (Vite + Embedded On-Chain Gateway)
```bash
npm run dev
```
Buka `http://localhost:5173/` di browser.

### 3. Build & Menjalankan Mode Production (Online / Cloud Server)
```bash
npm run build
npm start
```
Server produksi (`server.mjs`) akan melayani aplikasi *frontend* sekaligus seluruh *endpoint* API `/api/gateway/*` pada port `8080` (atau sesuai variabel lingkungan `PORT`).

---

## 📂 Struktur Direktori
- `src/App.tsx` — Antarmuka utama 5-Tab Fincept Whale Quant Terminal.
- `src/components/CandlestickOrderflowChart.tsx` — Grafik *Candlestick & Orderflow* interaktif (2D Pan + Wheel Zoom).
- `src/components/WhaleChordViz.tsx` — Visualisasi *Whale Pipeline* interaktif + *Resizable Multi-Tab On-Chain Blockchain Stream*.
- `src/engine/agentSkills.ts` — Mesin kecerdasan *6 Smart Skills*, *3-Pillar Deep Position Intelligence*, dan *Post-TP Continuous Hunter (`4x–8x`)*.
- `src/engine/liveConnectors.ts` — Konektor real-time 14 market (*Top 10 CMC + DEX*) dengan *Dual-Path Fallback*.
- `src/engine/walletAdapter.ts` — Konektor *Trust Wallet (EIP-6963)*, *Phantom Wallet (Solana)*, dan *Multi-Chain Network Switcher*.
- `backend/exchangeGateway.mjs` — Middleware *On-Chain RPC, Hyperliquid L1, Raydium, Jupiter, DexScreener & Multi-Exchange Execution Gateway*.
- `backend/terminal_agent_daemon.py` — Modul referensi daemon kuantitatif Python.
- `server.mjs` — Server HTTP produksi mandiri untuk deployment *cloud/online*.
- `docs/ARCHITECTURE_BLUEPRINT.md` — Dokumen rancangan arsitektur sistem dari awal pengembangan.
