/**
 * Real-Money Autonomous & Manual Execution Router + Unified Real-Wallet Equity Engine.
 *
 * Ensures:
 * 1. Autonomous Agent & manual orders route to actually connected, verified real wallets
 *    (Binance, Bybit, OKX, Hyperliquid) matching the active Testnet/Mainnet environment.
 * 2. Both Futures (BUY/LONG & SELL/SHORT with synced leverage) and Spot (BUY/LONG entry & SELL exit,
 *    never illegal Spot SHORT entries) are accurately detected and routed per wallet capabilities.
 * 3. Autonomous order sizing is bounded safely by verified real wallet equity & effective leverage.
 * 4. Portfolio equity never mixes Paper placeholder balances into Real-Money equity and never
 *    double-counts shared EVM addresses across `trust` and `hyperliquid_agent`.
 */

export const MIN_SINGLE_ORDER_USD = 10;

// Canonical exchange priority order: Hyperliquid & Binance first, followed by Bybit & OKX
export const EXCHANGE_PRIORITY_ORDER = ['HYPERLIQUID', 'BINANCE', 'BYBIT', 'OKX'];

const EXECUTABLE_REAL_EXCHANGES = new Set([...EXCHANGE_PRIORITY_ORDER, 'JUPITER', 'DEXSCREENER']);
const SOLANA_DEX_EXCHANGES = new Set(['JUPITER', 'DEXSCREENER']);
const HL_AGENT_PK_RE = /^(0x)?[a-fA-F0-9]{64}$/;

function hasNonEmptyCredential(val) {
  return typeof val === 'string' && val.trim().length > 0;
}

/**
 * Checks whether a Hyperliquid wallet row holds a valid 32-byte Agent Private Key
 * enabling unattended server-side EIP-712 signing (no interactive browser popup needed).
 */
export function hasHyperliquidAgentPrivateKey(wallet) {
  const pk = String(wallet?.credentials?.agentPrivateKey || '').trim();
  if (!pk) return false;
  if (pk.startsWith('fincept-rls-sess:')) return pk.length > 24;
  return HL_AGENT_PK_RE.test(pk) && !/^0x?0+$/i.test(pk);
}

/**
 * Checks whether a wallet row has real credentials / verification (not an unconfigured Paper placeholder).
 */
export function hasRealWalletCredentials(wallet) {
  if (!wallet) return false;
  const creds = wallet.credentials || {};
  if (wallet.id === 'binance_api' || wallet.id === 'bybit_api') {
    return hasNonEmptyCredential(creds.apiKey) && hasNonEmptyCredential(creds.apiSecret);
  }
  if (wallet.id === 'okx_api') {
    return (
      hasNonEmptyCredential(creds.apiKey) &&
      hasNonEmptyCredential(creds.apiSecret) &&
      hasNonEmptyCredential(creds.passphrase)
    );
  }
  if (wallet.id === 'trust' || wallet.id === 'hyperliquid_agent') {
    return /^0x[a-fA-F0-9]{40}$/.test(String(creds.walletAddress || '').trim());
  }
  if (wallet.id === 'phantom') {
    return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(String(creds.walletAddress || '').trim());
  }
  return false;
}

/**
 * Checks whether a wallet is armed and environment-matched for real-money execution.
 */
export function isWalletReadyForRealExecution(wallet, useTestnet = false) {
  if (!wallet || !wallet.connected || !wallet.autoSignEnabled) {
    return { ok: false, reason: 'DISCONNECTED_OR_AUTOSIGN_OFF' };
  }
  if (!hasRealWalletCredentials(wallet)) {
    return { ok: false, reason: 'PAPER_PLACEHOLDER_OR_MISSING_CREDS' };
  }
  if (wallet.verifiedReal && typeof wallet.credentials?.useTestnet === 'boolean') {
    if (wallet.credentials.useTestnet !== Boolean(useTestnet)) {
      return { ok: false, reason: 'ENV_MISMATCH' };
    }
  }
  return { ok: true, reason: 'READY' };
}

/**
 * Maps an ExchangeId to its best ready real-money wallet row.
 */
export function resolveReadyRealWalletForExchange(
  exchange,
  wallets = [],
  useTestnet = false,
  { requireAutonomousKey = false } = {}
) {
  if (!EXECUTABLE_REAL_EXCHANGES.has(exchange)) return null;
  if (exchange === 'HYPERLIQUID') {
    const trust = wallets.find((w) => w.id === 'trust');
    const hlAgent = wallets.find((w) => w.id === 'hyperliquid_agent');
    const hlAgentReady = Boolean(hlAgent && isWalletReadyForRealExecution(hlAgent, useTestnet).ok);
    const hlAgentHasKey = hlAgentReady && hasHyperliquidAgentPrivateKey(hlAgent);
    const trustReady = Boolean(trust && isWalletReadyForRealExecution(trust, useTestnet).ok);

    if (requireAutonomousKey) {
      return hlAgentHasKey ? hlAgent : null;
    }
    if (hlAgentHasKey && hlAgent.verifiedReal) return hlAgent;
    if (trustReady && trust.verifiedReal) return trust;
    if (hlAgentReady && hlAgent.verifiedReal) return hlAgent;
    if (hlAgentHasKey) return hlAgent;
    if (trustReady) return trust;
    if (hlAgentReady) return hlAgent;
    return null;
  }
  if (SOLANA_DEX_EXCHANGES.has(exchange)) {
    // Phantom Jupiter V1 Aggregator executes real on-chain swaps on Solana Mainnet-Beta via interactive browser signing
    if (useTestnet || requireAutonomousKey) return null;
    const phantom = wallets.find((w) => w.id === 'phantom');
    if (!phantom) return null;
    return isWalletReadyForRealExecution(phantom, false).ok ? phantom : null;
  }
  const map = {
    BINANCE: 'binance_api',
    BYBIT: 'bybit_api',
    OKX: 'okx_api',
  };
  const wallet = wallets.find((w) => w.id === map[exchange]);
  if (!wallet) return null;
  return isWalletReadyForRealExecution(wallet, useTestnet).ok ? wallet : null;
}

/**
 * Determines Futures & Spot trading capabilities and available USD equity for a wallet.
 */
export function getWalletMarketCapabilities(wallet) {
  if (!wallet) {
    return {
      supportsFutures: false,
      supportsSpot: false,
      availableFuturesUsd: 0,
      availableSpotUsd: 0,
    };
  }
  const totalBal = Number.isFinite(Number(wallet.balanceUsd)) ? Math.max(0, Number(wallet.balanceUsd)) : 0;

  if (wallet.id === 'binance_api') {
    const fChain = wallet.chainBalances?.find((c) => c.chainId === 'binance-futures');
    const sChain = wallet.chainBalances?.find((c) => c.chainId === 'binance-spot');
    const inferredFuturesEnabled =
      typeof wallet.futuresEnabled === 'boolean'
        ? wallet.futuresEnabled
        : fChain
          ? !String(fChain.recommendedFor || '').toLowerCase().includes('belum diaktifkan')
          : true;
    const inferredSpotEnabled =
      typeof wallet.spotEnabled === 'boolean'
        ? wallet.spotEnabled
        : sChain
          ? !String(sChain.recommendedFor || '').toLowerCase().includes('tidak ada akses')
          : true;
    const availableFuturesUsd =
      typeof wallet.futuresBalanceUsd === 'number'
        ? Math.max(0, wallet.futuresBalanceUsd)
        : fChain && Number.isFinite(Number(fChain.totalChainUsd))
          ? Math.max(0, Number(fChain.totalChainUsd))
          : inferredFuturesEnabled
            ? totalBal
            : 0;
    const availableSpotUsd =
      typeof wallet.spotBalanceUsd === 'number'
        ? Math.max(0, wallet.spotBalanceUsd)
        : sChain && Number.isFinite(Number(sChain.totalChainUsd))
          ? Math.max(0, Number(sChain.totalChainUsd))
          : inferredSpotEnabled
            ? totalBal
            : 0;

    return {
      supportsFutures: inferredFuturesEnabled,
      supportsSpot: inferredSpotEnabled,
      availableFuturesUsd,
      availableSpotUsd,
    };
  }

  if (wallet.id === 'bybit_api' || wallet.id === 'okx_api') {
    // Unified Trading Account / Multi-Asset Margin supports BOTH Futures (Linear/SWAP) & Spot
    return {
      supportsFutures: true,
      supportsSpot: true,
      availableFuturesUsd: totalBal,
      availableSpotUsd: totalBal,
    };
  }

  if (wallet.id === 'trust' || wallet.id === 'hyperliquid_agent') {
    // Hyperliquid L1 Perp balance is stored in the 'Hyperliquid L1 Native' chain entry when verified
    const hlChain = wallet.chainBalances?.find(
      (c) => c.chainId === 998 || String(c.chainName || '').toLowerCase().includes('hyperliquid')
    );
    const hlUsd =
      hlChain && Number.isFinite(Number(hlChain.totalChainUsd))
        ? Math.max(0, Number(hlChain.totalChainUsd))
        : totalBal;
    return {
      supportsFutures: true,
      supportsSpot: false,
      availableFuturesUsd: hlUsd,
      availableSpotUsd: 0,
    };
  }

  if (wallet.id === 'phantom') {
    const solChain = wallet.chainBalances?.find(
      (c) => c.chainId === 'solana' || String(c.chainName || '').toLowerCase().includes('solana')
    );
    const stableUsd =
      typeof wallet.spotBalanceUsd === 'number' && wallet.spotBalanceUsd > 0
        ? wallet.spotBalanceUsd
        : solChain && Number.isFinite(Number(solChain.stableBalanceUsd)) && Number(solChain.stableBalanceUsd) > 0
          ? Number(solChain.stableBalanceUsd)
          : totalBal;
    return {
      supportsFutures: false,
      supportsSpot: true,
      availableFuturesUsd: 0,
      availableSpotUsd: Math.max(0, stableUsd),
    };
  }

  return {
    supportsFutures: false,
    supportsSpot: false,
    availableFuturesUsd: 0,
    availableSpotUsd: 0,
  };
}

/**
 * Resolves the optimal executable real-money venue & marketType (PERP vs SPOT) for a market + side.
 * - Never routes to unconnected or env-mismatched wallets.
 * - Never routes to non-executable DEX venues (JUPITER/DEXSCREENER) in real money.
 * - Supports BOTH BUY (LONG) and SELL (SHORT) on Futures, and BUY (LONG) entry on Spot.
 * - Automatically detects Binance Spot-only keys (or Spot-funded accounts) and blocks illegal Spot SHORT entries.
 */
export function resolveExecutableRealVenue({
  market,
  side = 'LONG',
  wallets = [],
  useTestnet = false,
  preferredMarketType = null,
  preferredExchange = null,
  isAutonomous = false,
}) {
  if (!market) {
    return { ok: false, error: 'Market tidak valid.' };
  }

  const requestedMarketType =
    preferredMarketType === 'SPOT'
      ? 'SPOT'
      : preferredMarketType === 'PERP'
        ? 'PERP'
        : market.marketType === 'SPOT'
          ? 'SPOT'
          : 'PERP';

  const candidateExchanges = [];
  if (preferredExchange && EXECUTABLE_REAL_EXCHANGES.has(preferredExchange)) {
    candidateExchanges.push(preferredExchange);
  }
  if (market.primaryExchange && EXECUTABLE_REAL_EXCHANGES.has(market.primaryExchange)) {
    if (!candidateExchanges.includes(market.primaryExchange)) {
      candidateExchanges.push(market.primaryExchange);
    }
  }
  if (Array.isArray(market.supportedExchanges)) {
    for (const ex of market.supportedExchanges) {
      if (EXECUTABLE_REAL_EXCHANGES.has(ex) && !candidateExchanges.includes(ex)) {
        candidateExchanges.push(ex);
      }
    }
  }
  // Fallback in strict canonical priority order: Hyperliquid -> Binance -> Bybit -> OKX
  for (const fallbackEx of EXCHANGE_PRIORITY_ORDER) {
    if (
      !candidateExchanges.includes(fallbackEx) &&
      market.marketType !== 'DEX_POOL' &&
      !String(market.symbol || '').endsWith('-DEX') &&
      !String(market.symbol || '').endsWith('-SOL')
    ) {
      candidateExchanges.push(fallbackEx);
    }
  }

  let envMismatchError = null;
  let spotShortBlockedError = null;
  let interactivePopupBlockedError = null;

  for (const ex of candidateExchanges) {
    // (#51 + HL Autonomous Parity + Phantom Solana Swap):
    // - Hyperliquid without Agent Private Key requires interactive EVM extension popup.
    // - Phantom (JUPITER/DEXSCREENER) executes live on-chain Jupiter V1 swaps via interactive Phantom extension popup on Solana Mainnet-Beta.
    const wallet = resolveReadyRealWalletForExchange(ex, wallets, useTestnet, {
      requireAutonomousKey: Boolean(isAutonomous && (ex === 'HYPERLIQUID' || SOLANA_DEX_EXCHANGES.has(ex))),
    });
    if (!wallet) {
      if (SOLANA_DEX_EXCHANGES.has(ex)) {
        const phantomRaw = wallets.find((w) => w.id === 'phantom' && w.connected && hasRealWalletCredentials(w));
        if (phantomRaw) {
          if (useTestnet) {
            envMismatchError =
              'Phantom Jupiter V1 Swap beroperasi langsung di Solana Mainnet-Beta (tidak tersedia pada mode EXCHANGE_TESTNET). Gunakan mode REAL_MAINNET untuk swap Phantom live, atau hubungkan Binance / Hyperliquid Testnet.';
          } else if (isAutonomous) {
            interactivePopupBlockedError =
              'Phantom Solana memerlukan persetujuan transaksi on-chain di ekstensi browser (non-custodial) sehingga hanya dapat dieksekusi manual. Untuk Auto-Hunter unattended, gunakan Hyperliquid Agent Key / Binance / Bybit / OKX.';
          }
        }
        continue;
      }
      if (isAutonomous && ex === 'HYPERLIQUID') {
        const hlAnyReady = resolveReadyRealWalletForExchange('HYPERLIQUID', wallets, useTestnet, {
          requireAutonomousKey: false,
        });
        if (hlAnyReady) {
          interactivePopupBlockedError =
            'Hyperliquid tanpa Agent Private Key memerlukan konfirmasi popup ekstensi EVM sehingga tidak dapat dieksekusi otomatis tanpa pengawasan (isi Hyperliquid Agent Private Key di menu Wallets & API untuk Auto-Hunter unattended, atau hubungkan Binance / Bybit / OKX API).';
          continue;
        }
      }
      // Track if a wallet exists for this exchange but is mismatched on Testnet/Mainnet
      const map = { BINANCE: 'binance_api', BYBIT: 'bybit_api', OKX: 'okx_api' };
      const rawW =
        ex === 'HYPERLIQUID'
          ? wallets.find((w) => (w.id === 'hyperliquid_agent' || w.id === 'trust') && w.verifiedReal)
          : wallets.find((w) => w.id === map[ex]);
      if (rawW && isWalletReadyForRealExecution(rawW, useTestnet).reason === 'ENV_MISMATCH') {
        envMismatchError = `[RLS ENV MISMATCH] ${rawW.name} terverifikasi pada ${
          rawW.credentials?.useTestnet ? 'TESTNET' : 'MAINNET'
        }, sedangkan mode aktif adalah ${useTestnet ? 'TESTNET' : 'MAINNET'}.`;
      }
      continue;
    }

    const caps = getWalletMarketCapabilities(wallet);

    if (requestedMarketType === 'SPOT') {
      if (!caps.supportsSpot) continue;
      if (side === 'SHORT') {
        spotShortBlockedError = `${ex} Spot tidak mendukung pembukaan posisi SHORT (gunakan Futures/leverage >= 2x untuk SHORT, atau arah BUY/LONG pada Spot).`;
        continue;
      }
      return {
        ok: true,
        exchange: ex,
        wallet,
        marketType: 'SPOT',
        venueMode: 'SPOT',
        availableUsd: caps.availableSpotUsd,
      };
    }

    // Requested FUTURES (PERP):
    // 1) If Futures is supported AND (either not Binance or Futures has >= $10 margin OR Spot doesn't exclusively hold funds)
    const binanceOnlySpotFunded =
      wallet.id === 'binance_api' &&
      caps.supportsSpot &&
      caps.availableFuturesUsd < MIN_SINGLE_ORDER_USD &&
      caps.availableSpotUsd >= MIN_SINGLE_ORDER_USD;

    if (caps.supportsFutures && !binanceOnlySpotFunded) {
      return {
        ok: true,
        exchange: ex,
        wallet,
        marketType: 'PERP',
        venueMode: 'FUTURES',
        availableUsd: caps.availableFuturesUsd,
      };
    }

    // 2) Spot-only key (or Binance with funds exclusively in Spot): auto-route LONG (BUY) to SPOT cleanly!
    if (caps.supportsSpot) {
      if (side === 'LONG') {
        return {
          ok: true,
          exchange: ex,
          wallet,
          marketType: 'SPOT',
          venueMode: 'SPOT',
          availableUsd: caps.availableSpotUsd,
        };
      }
      spotShortBlockedError = `${wallet.name} hanya memiliki akses/saldo Spot sehingga tidak dapat membuka SHORT ${market.symbol} (hanya mendukung BUY/LONG Spot).`;
    }
  }

  return {
    ok: false,
    error:
      spotShortBlockedError ||
      envMismatchError ||
      interactivePopupBlockedError ||
      `Belum ada wallet real (${useTestnet ? 'TESTNET' : 'MAINNET'}) yang aktif & terverifikasi untuk mengeksekusi ${side} ${market.symbol}. Hubungkan Binance / Bybit / OKX / Hyperliquid di menu Wallets & API.`,
  };
}

/**
 * Computes a safe autonomous real-money order notional USD bounded by the wallet's real available balance.
 * - Spot (1x): capped at 90% of available Spot USD (reserving fee/slippage headroom).
 * - Futures (Lx): capped at 85% of available Futures margin * effectiveLeverage.
 * Returns `{ ok: false }` if available real balance cannot satisfy the $10 minimum notional.
 */
export function computeSafeAutonomousRealOrderSizeUsd({
  requestedSizeUsd,
  availableUsd,
  committedMarginUsd = 0,
  verifiedReal = false,
  marketType = 'PERP',
  leverage = 1,
}) {
  const req = Math.max(MIN_SINGLE_ORDER_USD, Number(requestedSizeUsd) || MIN_SINGLE_ORDER_USD);
  const avail = Number(availableUsd);
  const committed = Math.max(0, Number(committedMarginUsd) || 0);
  const effLev = marketType === 'SPOT' ? 1 : Math.max(1, Math.min(20, Number(leverage) || 1));

  if (!verifiedReal || !Number.isFinite(avail) || avail <= 0) {
    // If balance is strictly 0 on a verified real wallet, block autonomous entry immediately
    if (verifiedReal && Number.isFinite(avail) && avail <= 0) {
      return {
        ok: false,
        sizeUsd: 0,
        error: `Saldo real ${marketType === 'SPOT' ? 'Spot' : 'Futures'} adalah $0.00 — isi saldo terlebih dahulu sebelum mengaktifkan eksekusi real-money.`,
      };
    }
    return { ok: true, sizeUsd: Number(req.toFixed(2)) };
  }

  // Subtract margin already committed to open real positions on the same wallet (#51)
  const freeUsd = Number(Math.max(0, avail - committed).toFixed(2));
  const safetyBuffer = marketType === 'SPOT' ? 0.9 : 0.85;
  const maxSafeNotional = Number((freeUsd * effLev * safetyBuffer).toFixed(2));
  if (maxSafeNotional < MIN_SINGLE_ORDER_USD) {
    return {
      ok: false,
      sizeUsd: 0,
      error: `Margin bebas tersisa ($${freeUsd.toFixed(2)} dari $${avail.toFixed(2)}, terpakai $${committed.toFixed(2)} @ ${effLev}x -> maks aman $${maxSafeNotional.toFixed(2)}) di bawah batas minimum order $${MIN_SINGLE_ORDER_USD}.`,
    };
  }

  return {
    ok: true,
    sizeUsd: Number(Math.min(req, maxSafeNotional).toFixed(2)),
  };
}

/**
 * Computes unified portfolio equity accurately:
 * - In Real-Money / Testnet modes (or whenever any real wallet is verified): sums ONLY connected `verifiedReal`
 *   wallets matching the active environment, NEVER mixing fake Paper placeholder balances ($263K).
 * - Deduplicates shared EVM address across `trust` and `hyperliquid_agent` so the same address is never counted 2x!
 */
export function computeUnifiedPortfolioEquityUsd({ wallets = [], executionEnv = 'PAPER_SANDBOX' }) {
  const isRealEnv = executionEnv !== 'PAPER_SANDBOX';
  const useTestnet = executionEnv === 'EXCHANGE_TESTNET';
  const verifiedConnected = wallets.filter((w) => w && w.connected && w.verifiedReal);

  const sourceList = isRealEnv
    ? verifiedConnected.filter(
        (w) =>
          typeof w.credentials?.useTestnet !== 'boolean' ||
          w.credentials.useTestnet === useTestnet
      )
    : verifiedConnected.length > 0
      ? verifiedConnected
      : wallets.filter((w) => w && w.connected);

  const seenEvmAddrs = new Set();
  let total = 0;

  for (const w of sourceList) {
    const bal = Number(w.balanceUsd);
    if (!Number.isFinite(bal) || bal <= 0) continue;

    if (w.id === 'trust' || w.id === 'hyperliquid_agent') {
      const addr = String(w.credentials?.walletAddress || '').trim().toLowerCase();
      if (/^0x[a-f0-9]{40}$/.test(addr)) {
        if (seenEvmAddrs.has(addr)) continue;
        seenEvmAddrs.add(addr);
      }
    }
    total += bal;
  }

  return Number(total.toFixed(2));
}
