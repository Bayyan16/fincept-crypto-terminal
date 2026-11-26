import { createHmac } from 'node:crypto';

const PRODUCTS = {
  SPOT: { origin: 'https://testnet.binance.vision', prefix: '/api/v3', trades: '/myTrades' },
  PERP: { origin: 'https://demo-fapi.binance.com', prefix: '/fapi/v1', trades: '/userTrades' },
};

export class VenueError extends Error {
  constructor(status, code) {
    super('Binance Testnet tidak mengonfirmasi permintaan.');
    this.status = status;
    this.code = code;
  }
}

export function makeBinanceTestnet(product, credentials, fetchImpl = globalThis.fetch) {
  const { origin, prefix, trades } = PRODUCTS[product];
  const futures = product === 'PERP';
  let retryAfter = 0;

  async function request(path, params = {}, method = 'GET', signed = false) {
    if (Date.now() < retryAfter) throw new VenueError(429);
    const query = new URLSearchParams(params);
    const headers = {};
    if (signed) {
      query.set('recvWindow', '5000');
      query.set('timestamp', String(Date.now()));
      query.set('signature', createHmac('sha256', credentials.secret).update(query.toString()).digest('hex'));
      headers['X-MBX-APIKEY'] = credentials.key;
    }
    const response = await fetchImpl(`${origin}${path}?${query}`, {
      method, headers, redirect: 'error', signal: AbortSignal.timeout(4500),
    });
    if (response.status === 429 || response.status === 418) {
      const hint = response.headers.get('retry-after');
      const seconds = hint === null ? NaN : Number(hint);
      const until = Number.isFinite(seconds) ? Date.now() + seconds * 1000 : Date.parse(hint ?? '');
      const minimumPause = response.status === 418 ? 120_000 : 10_000;
      retryAfter = Math.max(Date.now() + minimumPause, Number.isFinite(until) ? until : 0);
      throw new VenueError(response.status);
    }
    const data = await response.json();
    if (!response.ok || Number(data?.code) < 0) throw new VenueError(response.status, Number(data?.code));
    return data;
  }

  return {
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
    order: (order) => request(`${prefix}/order`, { symbol: order.symbol, ...(order.venueId ? { orderId: order.venueId } : { origClientOrderId: order.id }) }, 'GET', true),
    cancel: (order) => request(`${prefix}/order`, { symbol: order.symbol, origClientOrderId: order.id }, 'DELETE', true),
    fills: (order, venueId) => request(`${prefix}${trades}`, { symbol: order.symbol, orderId: venueId, limit: 1000 }, 'GET', true),
  };
}
