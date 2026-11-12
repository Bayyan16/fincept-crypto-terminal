---
name: crypto-whale-trading-agent
description: Quantitative microstructure, L2/L3 orderbook analysis, on-chain whale tracking (Hyperliquid, DexScreener, Solana/EVM), and micro-loss prevention execution skill for multi-exchange crypto spot and perpetual futures trading.
---

# Autonomous Crypto Whale & Microstructure Trading Agent Skill

Use this skill whenever designing, tuning, or executing automated crypto Spot & Futures strategies across CEX (Binance, Bybit, OKX) and DEX (Hyperliquid, Jupiter, Raydium, Uniswap, 1inch) with real-time on-chain whale tracking.

## 1. Liquidity Gatekeeper Rules (Dense Liquidity Filter)

Never allow the execution engine to open positions in illiquid markets where slippage or spread manipulation causes micro-losses.
A market passes the **Dense Liquidity Gate (`liquidityScore >= 80`)** only when:
1. **Effective Spread**:
   $$\text{Spread (bps)} = \frac{P_{\text{ask},1} - P_{\text{bid},1}}{P_{\text{mid}}} \times 10000 \le 2.5\text{ bps}$$
2. **Order Book Depth Ratio (`±0.5%` Band)**:
   Sum of notional liquidity within `0.5%` of mid-price must be at least $50\times$ the bot's target order size.
3. **DEX Pool TVL & 24h Volume (DexScreener)**:
   - Minimum Pool Liquidity (TVL): `>= $1,500,000`
   - 24h Volume / TVL Turnover: `>= 0.8`

## 2. Real-Time Market Microstructure Signals

### A. Weighted Order Book Imbalance (W-OBI)
Give exponentially higher weight to levels closer to the mid-price ($k = 1 \dots 10$):
$$w_k = e^{-0.35 (k - 1)}$$
$$\text{OBI} = \frac{\sum_{k=1}^{10} w_k V_{\text{bid},k} - \sum_{k=1}^{10} w_k V_{\text{ask},k}}{\sum_{k=1}^{10} w_k V_{\text{bid},k} + \sum_{k=1}^{10} w_k V_{\text{ask},k}} \in [-1, +1]$$
- $\text{OBI} > +0.32$: Strong passive bid support (institutional limit buy wall).
- $\text{OBI} < -0.32$: Strong passive ask resistance (institutional limit sell wall).

### B. Cumulative Volume Delta (CVD) & Absorption Detection
- **CVD Divergence (Bullish Absorption)**: Price makes a flat/slightly lower tick while Taker Sell volume spikes, yet $P_{\text{bid},1}$ holds firm and reloads. Indicates a Whale absorbing panic sellers via iceberg limit orders.
- **Spoofing Filter**: Ignore any single L2 order level whose size increases by $>300\%$ and cancels within `<800ms` without trade execution.

## 3. On-Chain Whale & Hyperliquid Position Pipeline

Combine three real-time whale telemetry streams into a unified **Whale Flow Score (`-100` to `+100`)**:
1. **Hyperliquid L1 Whale & Vault Stream**:
   - Monitor top clearinghouse vaults and whale wallets (`>$2M` notional) opening/increasing leveraged `LONG` or `SHORT` positions and track their liquidation clusters.
2. **CEX <-> On-Chain Flow Pipeline**:
   - **Stablecoin (USDC/USDT) Inflow to Hyperliquid Bridge / CEX / DEX Aggregators**: Bullish buying power deployment (`+Weight`).
   - **Native Asset (BTC/ETH/SOL) Inflow from Cold Whale Wallet to CEX Deposit Address**: Bearish distribution intent (`-Weight`).
   - **Native Asset Outflow from CEX to Self-Custody (Phantom / Trust / Multisig)**: Bullish accumulation (`+Weight`).
3. **DexScreener Smart Money Swap Stream**:
   - Filter swaps `> $50,000` with low price impact routed via Jupiter / 1inch by wallets with historical win-rate `> 65%`.

## 4. Zero-Slop Micro-Loss Prevention Protocol

To prevent losses or cap any invalidated trade to a microscopic scratch (`0.00%` to `-0.04%`):
1. **Maker-First / Post-Only Entry**:
   - Place orders at `Best Bid` (for Long) or `Best Ask` (for Short) with `POST_ONLY=true` to earn maker rebates or near-zero fees.
2. **Orderflow Invalidation Scratch (Pre-Stop Exit)**:
   - Do **not** wait for price to hit a wide `-1%` stop loss. If within the first `3-30 seconds` of entry:
     - `OBI` flips below `-0.25` (for a Long), OR
     - A Whale Market Dump (`>$500k` net sell delta) hits the tape,
     immediately execute a **Scratch Exit** at `Breakeven` or `-1 tick` (`~ -0.02%` to `-0.05%`).
3. **Instant Fee-Adjusted Breakeven Ratchet**:
   - Once Unrealized PnL reaches `+0.06%` (covering round-trip maker/taker fees + 1 tick buffer), lock the hard stop at `Entry Price + 0.03%` so the trade can **never** turn into a loss.
4. **Dynamic Trailing Profit Lock**:
   - As Unrealized PnL exceeds `+0.20%`, trail the stop behind the highest 1-minute micro-swing low (or `65%` of peak MFE) while scaling out `50%` into liquidity spikes.

