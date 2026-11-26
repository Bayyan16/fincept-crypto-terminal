import { createHmac } from 'node:crypto';
import { fetchJsonWithTimeout, getSyncedBinanceTimestamp } from './exchangeGateway.mjs';

const ALLOWED_SPOT_TESTNET_ORIGINS = new Set([
  'https://demo-api.binance.com',
  'https://testnet.binance.vision',
]);
const ALLOWED_FUTURES_TESTNET_ORIGINS = new Set([
  'https://demo-fapi.binance.com',
  'https://testnet.binancefuture.com',
]);

export class VenueError extends Error {
  constructor(status, code) {
    super('Binance Testnet tidak mengonfirmasi permintaan.');
    this.status = status;
    this.code = code;
  }
}

function resolveProductConfig(product, credentials = {}) {
  if (product === 'PERP') {
    const customOrigin = String(credentials.origin || '').trim().replace(/\/+$/, '');
    const origin = ALLOWED_FUTURES_TESTNET_ORIGINS.has(customOrigin)
      ? customOrigin
      : 'https://demo-fapi.binance.com';
    return { origin, prefix: '/fapi/v1', trades: '/userTrades', futures: true };
  }
  const customOrigin = String(credentials.origin || '').trim().replace(/\/+$/, '');
  const origin = ALLOWED_SPOT_TESTNET_ORIGINS.has(customOrigin)
    ? customOrigin
    : 'https://testnet.binance.vision';
  return { origin, prefix: '/api/v3', trades: '/myTrades', futures: false };
}

export function makeBinanceTestnet(product, credentials, fetchImpl) {
  const { origin, prefix, trades, futures } = resolveProductConfig(product, credentials);
  const useCustomFetch = typeof fetchImpl === 'function';
  let retryAfter = 0;

  async function request(path, params = {}, method = 'GET', signed = false) {
    if (Date.now() < retryAfter) throw new VenueError(429);
    const query = new URLSearchParams(params);
    const headers = {};
    if (signed) {
      const ts = useCustomFetch
        ? Date.now()
        : await getSyncedBinanceTimestamp(origin, futures);
      query.set('recvWindow', useCustomFetch ? '5000' : '10000');
      query.set('timestamp', String(ts));
      query.set('signature', createHmac('sha256', credentials.secret).update(query.toString()).digest('hex'));
      headers['X-MBX-APIKEY'] = credentials.key;
    }

    const fullUrl = `${origin}${path}${query.toString() ? `?${query}` : ''}`;
    let status = 0;
    let ok = false;
    let data = null;
    let retryHint = null;

    if (useCustomFetch) {
      const response = await fetchImpl(fullUrl, {
        method,
        headers,
        redirect: 'error',
        signal: AbortSignal.timeout(4500),
      });
      status = response.status;
      ok = response.ok;
      retryHint = response.headers?.get?.('retry-after') ?? null;
      data = await response.json();
    } else {
      // Live runtime: automatic Direct TLS -> DoH TLS fallback for ISP-filtered regions (Indonesia/etc.)
      const res = await fetchJsonWithTimeout(fullUrl, { method, headers }, 4800, true);
      status = res.status;
      ok = res.ok;
      retryHint = res.retryAfter ?? null;
      data = res.data;
      if (status === 0) {
        throw new Error(res.error || 'Binance Testnet network timeout');
      }
    }

    if (status === 429 || status === 418) {
      const seconds = retryHint === null ? NaN : Number(retryHint);
      const until = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(retryHint ?? '');
      const minimumPause = status === 418 ? 120_000 : 10_000;
      retryAfter = Math.max(Date.now() + minimumPause, Number.isFinite(until) ? until : 0);
      throw new VenueError(status);
    }
    if (!ok || Number(data?.code) < 0) throw new VenueError(status, Number(data?.code));
    return data;
  }

  return {
    origin,
    async instrument(symbol) {
      const info = await request(`${prefix}/exchangeInfo`, futures ? {} : { symbol });
      const item = info.symbols?.find((candidate) => candidate.symbol === symbol);
      if (!item || item.status !== 'TRADING' || item.quoteAsset !== 'USDT' ||
          (futures ? item.contractType !== 'PERPETUAL' : item.isSpotTradingAllowed !== true)) {
        return null;
      }
      return item;
    },
    candles: (symbol) => request(`${prefix}/klines`, { symbol, interval: '1m', limit: 32 }),
    book: (symbol) => request(`${prefix}/ticker/bookTicker`, { symbol }),
    async setLeverage(symbol, leverage) {
      if (!futures) return { leverage: 1 };
      const clamped = Math.max(1, Math.min(20, Math.round(Number(leverage) || 5)));
      return request(`${prefix}/leverage`, { symbol, leverage: String(clamped) }, 'POST', true);
    },
    async accountState(symbol, base) {
      if (!futures) {
        const account = await request(`${prefix}/account`, {}, 'GET', true);
        if (account.canTrade !== true || !Array.isArray(account.balances)) throw new Error('Spot account unavailable');
        const free = (asset) => Number(account.balances.find((row) => row.asset === asset)?.free ?? 0);
        return { baseFree: free(base), quoteFree: free('USDT') };
      }
      const mode = await request(`${prefix}/positionSide/dual`, {}, 'GET', true);
      if (mode.dualSidePosition !== false) throw new Error('Futures requires one-way mode');
      const positions = await request('/fapi/v3/positionRisk', { symbol }, 'GET', true);
      if (!Array.isArray(positions)) throw new Error('Futures position unavailable');
      return { signedQuantity: Number(positions.find((row) => row.symbol === symbol && row.positionSide === 'BOTH')?.positionAmt ?? 0) };
    },
    place: (order) => request(`${prefix}/order`, {
      symbol: order.symbol,
      side: order.side,
      type: order.action === 'CLOSE' ? 'MARKET' : futures ? 'LIMIT' : 'LIMIT_MAKER',
      quantity: order.quantity,
      newClientOrderId: order.id,
      ...(order.action === 'OPEN' ? { price: order.price, ...(futures ? { timeInForce: 'GTX' } : {}) } : {}),
      ...(futures && order.action === 'CLOSE' ? { reduceOnly: 'true' } : {}),
    }, 'POST', true),
    placeStop: ({ symbol, side, stopPrice, limitPrice, quantity, clientOrderId }) => {
      if (futures) {
        return request(`${prefix}/order`, {
          symbol,
          side,
          type: 'STOP_MARKET',
          stopPrice: String(stopPrice),
          closePosition: 'true',
          workingType: 'MARK_PRICE',
          newClientOrderId: clientOrderId,
        }, 'POST', true);
      }
      return request(`${prefix}/order`, {
        symbol,
        side,
        type: 'STOP_LOSS_LIMIT',
        timeInForce: 'GTC',
        quantity: String(quantity),
        stopPrice: String(stopPrice),
        price: String(limitPrice),
        newClientOrderId: clientOrderId,
      }, 'POST', true);
    },
    async cancelStop({ symbol, clientOrderId }) {
      try {
        return await request(`${prefix}/order`, { symbol, origClientOrderId: clientOrderId }, 'DELETE', true);
      } catch (error) {
        // -2011 Unknown order -> already triggered/canceled (idempotent)
        if (error instanceof VenueError && error.code === -2011) {
          return { status: 'CANCELED', alreadyClosed: true };
        }
        throw error;
      }
    },
    order: (order) => request(`${prefix}/order`, { symbol: order.symbol, ...(order.venueId ? { orderId: order.venueId } : { origClientOrderId: order.id }) }, 'GET', true),
    cancel: (order) => request(`${prefix}/order`, { symbol: order.symbol, origClientOrderId: order.id }, 'DELETE', true),
    fills: (order, venueId) => request(`${prefix}${trades}`, { symbol: order.symbol, orderId: venueId, limit: 1000 }, 'GET', true),
  };
}
