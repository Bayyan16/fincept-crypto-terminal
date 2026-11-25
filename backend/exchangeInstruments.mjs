/**
 * Exchange Instrument Precision, OKX Contract Multiplier (ctVal), and 1000x Meme Symbol Mapper.
 * Prevents:
 * - 1000x over-sizing on OKX SWAP where `sz` is contracts (not coins)
 * - Binance/Bybit/OKX `-1111` precision rejections by flooring to `stepSize`/`lotSz` and aligning to `tickSize`
 * - `kPEPE`/`kBONK`/`kSHIB`/`kFLOKI` case/scale mismatches across Hyperliquid, Binance, Bybit, and OKX
 */

const K_PREFIX_RE = /^k([A-Z]{2,})$/;

function countStepDecimals(step) {
  const s = String(step ?? '').trim();
  if (!s || s === '0') return 0;
  if (s.includes('e-') || s.includes('E-')) {
    const exp = Number(s.split(/[eE]-/)[1]);
    return Number.isFinite(exp) ? exp : 0;
  }
  const dot = s.indexOf('.');
  if (dot < 0) return 0;
  const trimmed = s.slice(dot + 1).replace(/0+$/, '');
  return trimmed.length;
}

/**
 * Floors `value` downward to an exact multiple of `stepSize` (never rounds UP).
 */
export function quantizeFloorToStep(value, stepSize) {
  const v = Number(value);
  const step = Number(stepSize);
  if (!Number.isFinite(v) || v <= 0) return 0;
  if (!Number.isFinite(step) || step <= 0) return v;
  const decimals = Math.min(8, countStepDecimals(stepSize));
  const scaledSteps = Math.floor((v + step * 1e-9) / step);
  if (scaledSteps <= 0) return 0;
  return Number((scaledSteps * step).toFixed(decimals));
}

/**
 * Aligns `price` to the nearest exchange `tickSize`.
 */
export function alignPriceToTickSize(price, tickSize) {
  const p = Number(price);
  const tick = Number(tickSize);
  if (!Number.isFinite(p) || p <= 0) return 0;
  if (!Number.isFinite(tick) || tick <= 0) return p;
  const decimals = Math.min(8, countStepDecimals(tickSize));
  const ticks = Math.round(p / tick);
  return Number((Math.max(1, ticks) * tick).toFixed(decimals));
}

/**
 * Resolves the exact Hyperliquid asset key (preserving lowercase 'k' for kPEPE, kBONK, kSHIB, kFLOKI).
 */
export function resolveHyperliquidAssetKey(symbol, hlAssets = {}) {
  const rawBase = String(symbol || '').split('-')[0].split('/')[0].trim();
  if (!rawBase) return '';
  if (hlAssets[rawBase]) return rawBase;
  const upper = rawBase.toUpperCase();
  if (hlAssets[upper]) return upper;
  const withoutK = rawBase.replace(/^[kK](?=[A-Za-z]{2,})/, '').toUpperCase();
  const kKey = `k${withoutK}`;
  if (hlAssets[kKey]) return kKey;
  if (upper.startsWith('1000')) {
    const kFrom1000 = `k${upper.slice(4)}`;
    if (hlAssets[kFrom1000]) return kFrom1000;
  }
  return K_PREFIX_RE.test(rawBase) ? rawBase : upper;
}

/**
 * Maps a terminal symbol (e.g. `BTC-PERP`, `kPEPE-PERP`, `ETH-USDT`) to exchange-native symbols
 * and tracks any 1000x price/quantity scale conversion between Hyperliquid `k*` and 1x venues.
 */
export function normalizeExchangeSymbol({
  exchange,
  symbol,
  binanceSymbol,
  marketType = 'PERP',
}) {
  const rawBase = String(symbol || '').split('-')[0].split('/')[0].trim();
  const isK1000 = K_PREFIX_RE.test(rawBase);
  const underlying = isK1000 ? rawBase.slice(1).toUpperCase() : rawBase.toUpperCase();
  const hlKey = isK1000 ? `k${underlying}` : underlying;

  if (exchange === 'OKX') {
    const instId =
      marketType === 'SPOT' ? `${underlying}-USDT` : `${underlying}-USDT-SWAP`;
    return {
      exchangeSymbol: instId,
      hlKey,
      underlying,
      // Hyperliquid kPEPE quotes 1000 PEPE; OKX PEPE-USDT-SWAP quotes 1 PEPE
      priceScale: isK1000 ? 0.001 : 1,
      qtyScale: isK1000 ? 1000 : 1,
    };
  }

  if (exchange === 'BINANCE' || exchange === 'BYBIT') {
    if (marketType === 'SPOT') {
      const spotSym = `${underlying}USDT`;
      return {
        exchangeSymbol: spotSym,
        hlKey,
        underlying,
        priceScale: isK1000 ? 0.001 : 1,
        qtyScale: isK1000 ? 1000 : 1,
      };
    }
    const cleanOverride = String(binanceSymbol || '').trim().toUpperCase();
    const validOverride =
      cleanOverride && !/^K[A-Z]{2,}USDT$/.test(cleanOverride) ? cleanOverride : '';
    const futuresSym =
      validOverride || (isK1000 ? `1000${underlying}USDT` : `${underlying}USDT`);
    const is1000Futures = futuresSym.startsWith('1000');
    return {
      exchangeSymbol: futuresSym,
      hlKey,
      underlying,
      priceScale: isK1000 && !is1000Futures ? 0.001 : 1,
      qtyScale: isK1000 && !is1000Futures ? 1000 : 1,
    };
  }

  return {
    exchangeSymbol: String(symbol || '').trim(),
    hlKey,
    underlying,
    priceScale: 1,
    qtyScale: 1,
  };
}

/**
 * Converts base coin quantity into OKX SWAP contract count using `ctVal`, floored to `lotSz`.
 * Refuses to execute if `ctVal` is missing/invalid (prevents 1000x over-sizing).
 */
export function convertCoinsToOkxContracts({ coins, ctVal, lotSz = 1, minSz = 1 }) {
  const c = Number(coins);
  const contractVal = Number(ctVal);
  const lot = Number(lotSz) > 0 ? Number(lotSz) : 1;
  const min = Number(minSz) > 0 ? Number(minSz) : lot;

  if (!Number.isFinite(contractVal) || contractVal <= 0) {
    return {
      ok: false,
      contracts: 0,
      effectiveCoins: 0,
      error:
        '[OKX CONTRACT GUARD] Spesifikasi kontrak (ctVal) OKX SWAP tidak tersedia — order diblokir untuk mencegah kesalahan skala 1000x.',
    };
  }
  if (!Number.isFinite(c) || c <= 0) {
    return { ok: false, contracts: 0, effectiveCoins: 0, error: 'Kuantitas order OKX tidak valid.' };
  }

  const rawContracts = c / contractVal;
  const contracts = quantizeFloorToStep(rawContracts, lot);
  if (contracts < min) {
    return {
      ok: false,
      contracts: 0,
      effectiveCoins: 0,
      error: `[OKX LOT GUARD] Ukuran order (${c} koin = ${rawContracts.toFixed(4)} kontrak, ctVal=${contractVal}) lebih kecil dari minimum ${min} kontrak OKX.`,
    };
  }

  return {
    ok: true,
    contracts,
    effectiveCoins: Number((contracts * contractVal).toFixed(8)),
  };
}

const instrumentSpecCache = new Map();
const SPEC_TTL_MS = 10 * 60 * 1000;
const MAX_SPEC_CACHE = 300;

function setBoundedSpec(key, spec) {
  if (instrumentSpecCache.size >= MAX_SPEC_CACHE) {
    const oldestKey = instrumentSpecCache.keys().next().value;
    if (oldestKey !== undefined) instrumentSpecCache.delete(oldestKey);
  }
  instrumentSpecCache.set(key, { ts: Date.now(), spec });
}

export function clearInstrumentSpecCache() {
  instrumentSpecCache.clear();
}

/**
 * Fetches & caches exchange instrument precision specs (`stepSize`, `tickSize`, `minQty`, `ctVal`).
 */
export async function fetchExchangeInstrumentSpec({
  exchange,
  exchangeSymbol,
  useTestnet = false,
  marketType = 'PERP',
  spotBaseUrl = '',
  fetchJson,
}) {
  const key = `${exchange}:${marketType}:${useTestnet ? 'T' : 'M'}:${spotBaseUrl || ''}:${exchangeSymbol}`;
  const cached = instrumentSpecCache.get(key);
  if (cached && Date.now() - cached.ts < SPEC_TTL_MS) {
    return cached.spec;
  }

  try {
    if (exchange === 'BINANCE') {
      const isSpot = marketType === 'SPOT';
      const base = isSpot
        ? spotBaseUrl || (useTestnet ? 'https://testnet.binance.vision' : 'https://api.binance.com')
        : useTestnet
          ? 'https://testnet.binancefuture.com'
          : 'https://fapi.binance.com';
      const path = isSpot
        ? `/api/v3/exchangeInfo?symbol=${encodeURIComponent(exchangeSymbol)}`
        : `/fapi/v1/exchangeInfo`;
      const res = await fetchJson(`${base}${path}`, {}, 4500, true);
      const list = Array.isArray(res?.data?.symbols) ? res.data.symbols : [];
      const info = list.find((s) => String(s?.symbol).toUpperCase() === exchangeSymbol.toUpperCase());
      if (info && Array.isArray(info.filters)) {
        const lot = info.filters.find((f) => f.filterType === 'LOT_SIZE');
        const pf = info.filters.find((f) => f.filterType === 'PRICE_FILTER');
        const mn = info.filters.find(
          (f) => f.filterType === 'MIN_NOTIONAL' || f.filterType === 'NOTIONAL'
        );
        const spec = {
          stepSize: Number(lot?.stepSize || 0),
          minQty: Number(lot?.minQty || 0),
          tickSize: Number(pf?.tickSize || 0),
          minNotional: Number(mn?.notional || mn?.minNotional || 0),
        };
        setBoundedSpec(key, spec);
        return spec;
      }
    }

    if (exchange === 'BYBIT') {
      const base = useTestnet ? 'https://api-testnet.bybit.com' : 'https://api.bybit.com';
      const category = marketType === 'SPOT' ? 'spot' : 'linear';
      const res = await fetchJson(
        `${base}/v5/market/instruments-info?category=${category}&symbol=${encodeURIComponent(exchangeSymbol)}`,
        {},
        4500,
        true
      );
      const info = res?.data?.result?.list?.[0];
      if (info) {
        const spec = {
          stepSize: Number(info?.lotSizeFilter?.qtyStep || info?.lotSizeFilter?.basePrecision || 0),
          minQty: Number(info?.lotSizeFilter?.minOrderQty || 0),
          tickSize: Number(info?.priceFilter?.tickSize || 0),
          minNotional: Number(info?.lotSizeFilter?.minNotionalValue || 0),
        };
        setBoundedSpec(key, spec);
        return spec;
      }
    }

    if (exchange === 'OKX') {
      const instType = marketType === 'SPOT' ? 'SPOT' : 'SWAP';
      const res = await fetchJson(
        `https://www.okx.com/api/v5/public/instruments?instType=${instType}&instId=${encodeURIComponent(exchangeSymbol)}`,
        {},
        4500,
        true
      );
      const info = res?.data?.data?.[0];
      if (info) {
        const spec = {
          ctVal: Number(info?.ctVal || (instType === 'SPOT' ? 1 : 0)),
          lotSz: Number(info?.lotSz || 0),
          minSz: Number(info?.minSz || 0),
          tickSize: Number(info?.tickSz || 0),
        };
        setBoundedSpec(key, spec);
        return spec;
      }
    }
  } catch {
    // caller handles missing spec safely
  }

  return null;
}
