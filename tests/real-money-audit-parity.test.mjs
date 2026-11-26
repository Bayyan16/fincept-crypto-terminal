import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeClosedTradeSettlement,
  computeDailyRealizedPnlUsd,
  resolveRecordExecutionEnv,
} from '../backend/positionMath.mjs';
import {
  computeBalanceTieredPositionPolicy,
  computeSafeAutonomousRealOrderSizeUsd,
  estimateVenueMinNotionalUsd,
  getWalletMarketCapabilities,
  resolveExecutableRealVenue,
} from '../backend/realExecutionRouter.mjs';
import {
  buildJupiterSwapTransaction,
  classifyMacroNewsSentiment,
  executeRealExchangeOrder,
  verifyAndFetchAccountBalance,
} from '../backend/exchangeGateway.mjs';
import { resetRlsRateLimitersForTest } from '../backend/rlsSecurityGuard.mjs';
import { deriveEvmAddressFromPrivateKey } from '../backend/hyperliquidSigner.mjs';

const VALID_SOL_WALLET = '9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin';
const VALID_SOL_TX_SIG =
  '5j7s6NiJS3JAkvgkoc18WVAsiSaci2pxB2A6ueCJP4tprA2TFg9wSyTLeYouxPBJEMzJinENTkpA52YStRW5Dia7';
const VALID_EVM_WALLET = '0x1111111111111111111111111111111111111111';
const TEST_AGENT_PK = '0x0000000000000000000000000000000000000000000000000000000000000001';

test('3-Way Isolation: resolveRecordExecutionEnv & computeDailyRealizedPnlUsd strictly separate Paper, Testnet, and Mainnet', () => {
  assert.equal(resolveRecordExecutionEnv({ executionEnv: 'PAPER_SANDBOX', isRealMoney: false }), 'PAPER_SANDBOX');
  assert.equal(resolveRecordExecutionEnv({ executionEnv: 'EXCHANGE_TESTNET', isRealMoney: true }), 'EXCHANGE_TESTNET');
  assert.equal(resolveRecordExecutionEnv({ executionEnv: 'REAL_MAINNET', isRealMoney: true }), 'REAL_MAINNET');
  // Legacy fallback
  assert.equal(resolveRecordExecutionEnv({ isRealMoney: false }), 'PAPER_SANDBOX');
  assert.equal(resolveRecordExecutionEnv({ isRealMoney: true }), 'REAL_MAINNET');

  const day = '2026-11-26';
  const trades = [
    { id: 'cl-paper-1', isRealMoney: false, executionEnv: 'PAPER_SANDBOX', closedDateKey: day, realizedPnlUsd: -500 },
    { id: 'cl-test-1', isRealMoney: true, executionEnv: 'EXCHANGE_TESTNET', closedDateKey: day, realizedPnlUsd: -240 },
    { id: 'cl-real-1', isRealMoney: true, executionEnv: 'REAL_MAINNET', closedDateKey: day, realizedPnlUsd: 120 },
  ];

  // Testnet loss (-240) MUST NOT contaminate Real Mainnet (+120) or Paper (-500)!
  assert.equal(computeDailyRealizedPnlUsd({ closedTrades: trades, executionEnv: 'PAPER_SANDBOX', tradingDayKey: day }), -500);
  assert.equal(computeDailyRealizedPnlUsd({ closedTrades: trades, executionEnv: 'EXCHANGE_TESTNET', tradingDayKey: day }), -240);
  assert.equal(computeDailyRealizedPnlUsd({ closedTrades: trades, executionEnv: 'REAL_MAINNET', tradingDayKey: day }), 120);
});

test('Truthful Settlement: computeClosedTradeSettlement preserves real Solana Tx signature and never fabricates hashes', () => {
  const solSettle = computeClosedTradeSettlement({
    side: 'LONG',
    entryPrice: 1.1,
    exitPrice: 1.21,
    sizeUsd: 110,
    leverage: 1,
    executedQty: 100,
    isRealMoney: true,
    solanaTxSignature: VALID_SOL_TX_SIG,
  });
  assert.equal(solSettle.realizedPnlUsd, 11);
  assert.equal(solSettle.realizedPnlPct, 10);
  assert.equal(solSettle.settlementTxHash, VALID_SOL_TX_SIG);
  assert.equal(solSettle.allowLocalBalanceMutation, false);

  const paperSettle = computeClosedTradeSettlement({
    side: 'LONG',
    entryPrice: 100,
    exitPrice: 105,
    sizeUsd: 100,
    leverage: 1,
    isRealMoney: false,
  });
  assert.equal(paperSettle.settlementTxHash, undefined);
  assert.equal(paperSettle.allowLocalBalanceMutation, true);
});

test('Phantom Routing Parity: routes Solana Spot LONG to Phantom on Mainnet, blocks Spot SHORT, Testnet, and unattended autonomous popup', () => {
  const phantomWallet = {
    id: 'phantom',
    name: 'Phantom Wallet (Solana)',
    connected: true,
    verifiedReal: true,
    autoSignEnabled: true,
    balanceUsd: 520,
    spotBalanceUsd: 350,
    credentials: { walletAddress: VALID_SOL_WALLET, useTestnet: false },
    chainBalances: [{ chainId: 'solana', chainName: 'Solana Mainnet-Beta', stableBalanceUsd: 350, totalChainUsd: 520 }],
  };
  const jupMarket = {
    symbol: 'JUP-SOL',
    baseAsset: 'JUP',
    marketType: 'SPOT',
    primaryExchange: 'JUPITER',
    supportedExchanges: ['JUPITER', 'DEXSCREENER'],
    price: 1.15,
  };

  const caps = getWalletMarketCapabilities(phantomWallet);
  assert.equal(caps.supportsSpot, true);
  assert.equal(caps.supportsFutures, false);
  assert.equal(caps.availableSpotUsd, 350);

  const mainLong = resolveExecutableRealVenue({
    market: jupMarket,
    side: 'LONG',
    wallets: [phantomWallet],
    useTestnet: false,
    isAutonomous: false,
  });
  assert.equal(mainLong.ok, true);
  assert.equal(mainLong.exchange, 'JUPITER');
  assert.equal(mainLong.marketType, 'SPOT');
  assert.equal(mainLong.wallet.id, 'phantom');

  const mainShort = resolveExecutableRealVenue({
    market: jupMarket,
    side: 'SHORT',
    wallets: [phantomWallet],
    useTestnet: false,
    isAutonomous: false,
  });
  assert.equal(mainShort.ok, false);
  assert.match(mainShort.error, /Spot tidak mendukung/i);

  const testnetAttempt = resolveExecutableRealVenue({
    market: jupMarket,
    side: 'LONG',
    wallets: [phantomWallet],
    useTestnet: true,
    isAutonomous: false,
  });
  assert.equal(testnetAttempt.ok, false);
  assert.match(testnetAttempt.error, /Solana Mainnet-Beta/i);

  const autoAttempt = resolveExecutableRealVenue({
    market: jupMarket,
    side: 'LONG',
    wallets: [phantomWallet],
    useTestnet: false,
    isAutonomous: true,
  });
  assert.equal(autoAttempt.ok, false);
  assert.match(autoAttempt.error, /persetujuan transaksi on-chain/i);
});

test('Phantom Jupiter V1 Builder + Solana RPC On-Chain Confirmation verifies real signature and rejects failed/unconfirmed txs', async () => {
  resetRlsRateLimitersForTest();
  const origFetch = globalThis.fetch;

  try {
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      if (u.includes('lite-api.jup.ag/swap/v1/quote')) {
        return new Response(
          JSON.stringify({
            inputMint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
            outputMint: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
            inAmount: '50000000',
            outAmount: '43478260',
            priceImpactPct: '0.0008',
            routePlan: [{ swapInfo: { label: 'Raydium CLMM' }, percent: 100 }],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (u.includes('lite-api.jup.ag/swap/v1/swap')) {
        return new Response(
          JSON.stringify({
            swapTransaction: Buffer.from('mock-versioned-tx-bytes').toString('base64'),
            lastValidBlockHeight: 350000000,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (u.includes('api.mainnet-beta.solana.com')) {
        const body = JSON.parse(String(init?.body || '{}'));
        if (body.method === 'getSignatureStatuses') {
          const sig = body.params?.[0]?.[0];
          if (sig === VALID_SOL_TX_SIG) {
            return new Response(
              JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: { value: [{ slot: 474162200, confirmationStatus: 'confirmed', err: null }] },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            );
          }
          return new Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: body.id,
              result: { value: [{ slot: 474162201, confirmationStatus: 'confirmed', err: 'InstructionError' }] },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
      throw new Error(`Unexpected URL: ${u}`);
    };

    const built = await buildJupiterSwapTransaction({
      symbol: 'JUP-SOL',
      side: 'LONG',
      orderPurpose: 'ENTRY_MAKER',
      sizeUsd: 50,
      userPublicKey: VALID_SOL_WALLET,
      useTestnet: false,
    });
    assert.equal(built.ok, true);
    assert.ok(built.swapTransaction.length > 10);
    assert.ok(built.expectedOutQty > 43);

    const testnetBlocked = await buildJupiterSwapTransaction({
      symbol: 'JUP-SOL',
      side: 'LONG',
      orderPurpose: 'ENTRY_MAKER',
      sizeUsd: 50,
      userPublicKey: VALID_SOL_WALLET,
      useTestnet: true,
    });
    assert.equal(testnetBlocked.ok, false);

    // Real confirmed Solana signature succeeds with Solscan explorer link
    const confirmed = await executeRealExchangeOrder({
      exchange: 'JUPITER',
      symbol: 'JUP-SOL',
      side: 'LONG',
      orderPurpose: 'ENTRY_MAKER',
      sizeUsd: 50,
      price: 1.15,
      marketType: 'SPOT',
      credentials: { walletAddress: VALID_SOL_WALLET },
      useTestnet: false,
      solanaTxSignature: VALID_SOL_TX_SIG,
      solanaSigner: VALID_SOL_WALLET,
      expectedOutQty: built.expectedOutQty,
      effectivePrice: built.effectivePrice,
    });
    assert.equal(confirmed.ok, true);
    assert.equal(confirmed.orderId, VALID_SOL_TX_SIG);
    assert.equal(confirmed.explorerTxUrl, `https://solscan.io/tx/${VALID_SOL_TX_SIG}`);
    assert.equal(confirmed.venueMode, 'SPOT');

    // Failed on-chain tx must be rejected
    const failedSig = '4j7s6NiJS3JAkvgkoc18WVAsiSaci2pxB2A6ueCJP4tprA2TFg9wSyTLeYouxPBJEMzJinENTkpA52YStRW5Dia8';
    const failed = await executeRealExchangeOrder({
      exchange: 'JUPITER',
      symbol: 'JUP-SOL',
      side: 'LONG',
      orderPurpose: 'ENTRY_MAKER',
      sizeUsd: 50,
      price: 1.15,
      marketType: 'SPOT',
      credentials: { walletAddress: VALID_SOL_WALLET },
      useTestnet: false,
      solanaTxSignature: failedSig,
      solanaSigner: VALID_SOL_WALLET,
    });
    assert.equal(failed.ok, false);
    assert.match(failed.error, /gagal on-chain/i);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('Trust Wallet & Hyperliquid Testnet Isolation: NEVER mixes Mainnet EVM balances into Testnet and verifies Agent Key extraAgents authorization', async () => {
  const origFetch = globalThis.fetch;
  const calledUrls = [];
  const derivedAgent = deriveEvmAddressFromPrivateKey(TEST_AGENT_PK);

  try {
    globalThis.fetch = async (url, init) => {
      const u = String(url);
      calledUrls.push(u);
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (u.includes('api.hyperliquid-testnet.xyz/info')) {
        if (body.type === 'clearinghouseState') {
          return new Response(
            JSON.stringify({ marginSummary: { accountValue: '250.50' }, withdrawable: '250.50', assetPositions: [] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (body.type === 'spotClearinghouseState') {
          return new Response(JSON.stringify({ balances: [] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (body.type === 'extraAgents') {
          return new Response(
            JSON.stringify([{ address: derivedAgent, name: 'fincept-bot', validUntil: Date.now() + 86_400_000 }]),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
      if (u.includes('sepolia-rollup.arbitrum.io')) {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x0' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      throw new Error(`Mainnet RPC must NOT be queried in Testnet mode! Got: ${u}`);
    };

    const res = await verifyAndFetchAccountBalance({
      providerId: 'hyperliquid_agent',
      walletAddress: VALID_EVM_WALLET,
      agentPrivateKey: TEST_AGENT_PK,
      useTestnet: true,
    });
    assert.equal(res.ok, true);
    assert.equal(res.balanceUsd, 250.5);
    assert.equal(res.agentAddress, derivedAgent);
    assert.equal(res.agentAuthorized, true);
    assert.equal(res.agentAuthWarning, undefined);
    assert.ok(calledUrls.every((u) => !u.includes('arb1.arbitrum.io') && !u.includes('bsc-dataseed') && !u.includes('mainnet.base.org')));
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('Phantom Balance Verification sums SOL + SPL USDC + SPL USDT cleanly', async () => {
  const origFetch = globalThis.fetch;
  try {
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(String(init?.body || '{}'));
      if (body.method === 'getBalance') {
        return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { value: 2_000_000_000 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      if (body.method === 'getTokenAccountsByOwner') {
        const mint = body.params?.[1]?.mint;
        const amount = mint === 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' ? 120.5 : 80.25;
        return new Response(
          JSON.stringify({
            jsonrpc: '2.0',
            id: body.id,
            result: {
              value: [{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: amount } } } } } }],
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw new Error(`Unexpected URL: ${url}`);
    };

    const res = await verifyAndFetchAccountBalance({
      providerId: 'phantom',
      walletAddress: VALID_SOL_WALLET,
      useTestnet: false,
    });
    assert.equal(res.ok, true);
    assert.equal(res.solBalance, 2);
    assert.equal(res.usdcBalanceUsd, 120.5);
    assert.equal(res.usdtBalanceUsd, 80.25);
    assert.equal(res.spotEnabled, true);
    assert.equal(res.futuresEnabled, false);
    assert.equal(res.spotBalanceUsd, 120.5);
  } finally {
    globalThis.fetch = origFetch;
  }
});

test('Balance-Tiered Position Policy (<$10 => 1 Pos, $50 => 2 Pos, $100+ => 3 Pos) & $8 Binance Futures Micro-Capital Routing', () => {
  // Exact balance tier verification
  const micro8 = computeBalanceTieredPositionPolicy(8);
  assert.equal(micro8.maxPositions, 1);
  assert.equal(micro8.tier, 'MICRO_UNDER_10');
  assert.equal(micro8.maxLeverage, 5);
  assert.equal(micro8.nextTierUsd, 50);

  const starter35 = computeBalanceTieredPositionPolicy(35);
  assert.equal(starter35.maxPositions, 1);
  assert.equal(starter35.tier, 'STARTER_10_TO_49');

  const growth50 = computeBalanceTieredPositionPolicy(50);
  assert.equal(growth50.maxPositions, 2);
  assert.equal(growth50.tier, 'GROWTH_50_TO_99');
  assert.equal(growth50.nextTierUsd, 100);

  const growth99 = computeBalanceTieredPositionPolicy(99.99);
  assert.equal(growth99.maxPositions, 2);

  const scale100 = computeBalanceTieredPositionPolicy(100);
  assert.equal(scale100.maxPositions, 3);
  assert.equal(scale100.tier, 'SCALE_100_PLUS');
  assert.equal(scale100.nextTierUsd, null);

  // $8 Binance Futures wallet MUST route to FUTURES (never misrouted to Spot even if Spot holds $20!)
  const binanceMicroWallet = {
    id: 'binance_api',
    name: 'Binance Futures & Spot',
    connected: true,
    verifiedReal: true,
    autoSignEnabled: true,
    balanceUsd: 28,
    futuresEnabled: true,
    spotEnabled: true,
    futuresBalanceUsd: 8,
    spotBalanceUsd: 20,
    credentials: { apiKey: 'microKey12345', apiSecret: 'microSec12345', useTestnet: false },
  };
  const solMarket = {
    symbol: 'SOL-PERP',
    baseAsset: 'SOL',
    marketType: 'PERP',
    primaryExchange: 'BINANCE',
    supportedExchanges: ['BINANCE', 'HYPERLIQUID'],
    price: 71,
  };
  const routed = resolveExecutableRealVenue({
    market: solMarket,
    side: 'SHORT',
    wallets: [binanceMicroWallet],
    useTestnet: false,
    isAutonomous: true,
  });
  assert.equal(routed.ok, true);
  assert.equal(routed.exchange, 'BINANCE');
  assert.equal(routed.venueMode, 'FUTURES');
  assert.equal(routed.availableUsd, 8);

  // Safe tiered sizing for $8 @ 5x = $8 * 0.70 * 5 = $28 notional (keeps 30% = $2.40 liquidation buffer)
  const microSize = computeSafeAutonomousRealOrderSizeUsd({
    requestedSizeUsd: 500,
    availableUsd: 8,
    verifiedReal: true,
    marketType: 'PERP',
    leverage: 5,
    applyBalanceTierCap: true,
  });
  assert.equal(microSize.ok, true);
  assert.equal(microSize.sizeUsd, 28);

  // MinNotional filter: $28 notional cleanly trades SOL/DOGE/XRP ($5.50) and skips BTC ($100)
  assert.ok(microSize.sizeUsd >= estimateVenueMinNotionalUsd('BINANCE', 'SOL-PERP'));
  assert.ok(microSize.sizeUsd < estimateVenueMinNotionalUsd('BINANCE', 'BTC-PERP'));
});

test('Macro News Sentiment Classifier accurately flags regulatory freezes/breaches/bleeding as BEARISH and risk-asset rallies as BULLISH', () => {
  assert.equal(
    classifyMacroNewsSentiment('Spain gives anti-laundering unit power to freeze crypto accounts without a judge'),
    'BEARISH'
  );
  assert.equal(
    classifyMacroNewsSentiment("Standard Chartered's Zodia Custody suffers data breach, exposing client information"),
    'BEARISH'
  );
  assert.equal(
    classifyMacroNewsSentiment('Bitcoin ETFs are bleeding cash and the Fed is unlikely to help'),
    'BEARISH'
  );
  assert.equal(
    classifyMacroNewsSentiment('Bitcoin Miners Hammered Again as Price Rout Squeezes Margins'),
    'BEARISH'
  );
  assert.equal(
    classifyMacroNewsSentiment('Bitcoin Tops $60,000 as Risk Assets Rise in Holiday Trading'),
    'BULLISH'
  );
  assert.equal(
    classifyMacroNewsSentiment('Global Stocks Climb as AI Trade Mounts a Comeback: Markets Wrap'),
    'BULLISH'
  );
  assert.equal(
    classifyMacroNewsSentiment("Spain's De Cos Set to Succeed Lagarde as ECB President"),
    'NEUTRAL'
  );
});
