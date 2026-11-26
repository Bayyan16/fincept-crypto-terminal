import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { test } from 'node:test';
import { createTradingJournal } from '../backend/tradingJournal.mjs';
import { createManagedTestnetGateway } from '../backend/managedTestnetGateway.mjs';

const root = '/api/trading/testnet';
const env = {
  FINCEPT_ENABLE_BINANCE_TESTNET: '1',
  FINCEPT_TRADING_TOKEN: 'test-only-trading-token-0123456789',
  FINCEPT_BINANCE_SPOT_API_KEY: 'spot-key', FINCEPT_BINANCE_SPOT_API_SECRET: 'spot-secret',
  FINCEPT_BINANCE_FUTURES_API_KEY: 'perp-key', FINCEPT_BINANCE_FUTURES_API_SECRET: 'perp-secret',
};
const orderId = () => `ft-${randomUUID().replaceAll('-', '')}`;
const auth = `Bearer ${env.FINCEPT_TRADING_TOKEN}`;
const open = (product, side = 'BUY', budget = 50) => ({ id: orderId(), product, side, budget, symbol: 'BTCUSDT', action: 'OPEN' });
const filters = [
  { filterType: 'LOT_SIZE', minQty: '0.001', maxQty: '1000', stepSize: '0.001' },
  { filterType: 'PRICE_FILTER', minPrice: '1', maxPrice: '100000', tickSize: '0.01' },
  { filterType: 'MIN_NOTIONAL', minNotional: '5' },
];

function venueFixture() {
  const orders = new Map();
  const calls = [];
  let nextOrderId = 1;
  let nextFillId = 1;
  let failure;
  let tradesVisible = true;
  let positionAmount = 0;
  let price = 100;
  let candles = [];
  let quoteTime;
  const response = (data, status = 200) => Response.json(data, { status });
  return {
    calls,
    timeoutNextSubmit() { failure = 'timeout'; },
    delayFills() { tradesVisible = false; },
    showFills() { tradesVisible = true; },
    setPrice(value) { price = value; },
    setCandles(value) { candles = value; },
    setQuoteTime(value) { quoteTime = value; },
    setPosition(value) { positionAmount = value; },
    fill(id, quantity, status, realizedPnl = 0) {
      const order = orders.get(id);
      const previous = Number(order.executedQty);
      order.executedQty = String(previous + quantity);
      order.status = status;
      order.trades.push({ symbol: 'BTCUSDT', orderId: order.orderId, id: nextFillId++,
        qty: String(quantity), time: Date.now(), price: String(price), commission: '0.1',
        commissionAsset: 'USDT', realizedPnl: String(realizedPnl) });
      if (order.futures) positionAmount += order.side === 'BUY' ? quantity : -quantity;
    },
    async fetch(url, options) {
      const { hostname, pathname, searchParams: params } = new URL(url);
      const futures = hostname === 'demo-fapi.binance.com';
      assert.equal(hostname, futures ? 'demo-fapi.binance.com' : 'testnet.binance.vision');
      const path = pathname.replace(/^\/(?:api|fapi)\/v[13]/, '');
      const method = options.method;
      calls.push({ futures, path, method, params: Object.fromEntries(params) });
      if (['/order', '/leverage', '/myTrades', '/userTrades', '/positionSide/dual', '/positionRisk', '/account'].includes(path)) {
        const signature = params.get('signature');
        params.delete('signature');
        assert.equal(signature, createHmac('sha256', futures ? 'perp-secret' : 'spot-secret').update(params.toString()).digest('hex'));
        assert.equal(options.headers['X-MBX-APIKEY'], futures ? 'perp-key' : 'spot-key');
      }
      if (path === '/leverage' && method === 'POST') {
        return response({ symbol: params.get('symbol'), leverage: Number(params.get('leverage')) });
      }
      if (path === '/exchangeInfo') return response({ symbols: [{ symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT',
        status: 'TRADING', contractType: 'PERPETUAL', isSpotTradingAllowed: true, orderTypes: ['MARKET', 'LIMIT', 'LIMIT_MAKER'], filters }] });
      if (path === '/klines') return response(candles);
      if (path === '/ticker/bookTicker') return response({ symbol: 'BTCUSDT', bidPrice: String(price), askPrice: String(price + 0.01), time: quoteTime });
      if (path === '/positionSide/dual') return response({ dualSidePosition: false });
      if (path === '/positionRisk') return response([{ symbol: 'BTCUSDT', positionSide: 'BOTH', positionAmt: String(positionAmount) }]);
      if (path === '/account') return response({ canTrade: true, balances: [{ asset: 'USDT', free: '1000' }, { asset: 'BTC', free: '20' }] });
      if (path === '/order' && method === 'POST') {
        const id = params.get('newClientOrderId');
        assert.equal(orders.has(id), false, 'Order IDs must never be submitted twice');
        const order = { futures, symbol: params.get('symbol'), side: params.get('side'), orderId: nextOrderId++,
          clientOrderId: id, executedQty: '0', status: 'NEW', trades: [] };
        orders.set(id, order);
        if (failure) { failure = undefined; throw new Error('Connection dropped after exchange accepted order'); }
        return response(order);
      }
      const order = orders.get(params.get('origClientOrderId')) || [...orders.values()].find((item) => String(item.orderId) === params.get('orderId'));
      if (!order) return response({ code: -2013 }, 400);
      if (path === '/order' && method === 'DELETE') order.status = 'CANCELED';
      if (path === '/userTrades' || path === '/myTrades') return response(tradesVisible ? order.trades : []);
      return response(order);
    },
  };
}

function setup(context, { now = Date.now } = {}) {
  const fixture = venueFixture();
  const folder = mkdtempSync(join(tmpdir(), 'fincept-journal-'));
  const databasePath = join(folder, 'orders.sqlite');
  const start = (configuration = env) => createTradingJournal({ env: configuration, databasePath, fetchImpl: fixture.fetch, intervalMs: 30, now });
  let journal = start();
  context.after(async () => { await journal.close(); rmSync(folder, { recursive: true, force: true }); });
  return {
    fixture, start,
    async restart() { await journal.close(); journal = start(); },
    get: () => journal.route(root, 'GET', null, auth),
    unauthorized: () => journal.route(root, 'GET', null, undefined),
    post: (path, body) => journal.route(root + path, 'POST', async () => body, auth),
  };
}

async function until(get, check) {
  for (let i = 0; i < 50; i++) {
    const result = await get();
    if (check(result)) return result;
    await delay(20);
  }
  assert.fail('Journal did not reach the expected state');
}

test('Spot requires buy inventory, reconciles a partial fill after cancel, and sells only journal quantity', async (context) => {
  const { fixture, get, post } = setup(context);
  await assert.rejects(post('/orders', open('SPOT', 'SELL')), { status: 400 });
  const intent = open('SPOT');
  const { order } = await post('/orders', intent);
  assert.equal(order.status, 'NEW');
  assert.deepEqual((await get()).positions, []);
  fixture.delayFills();
  fixture.fill(intent.id, 0.2, 'PARTIALLY_FILLED');
  await until(get, (state) => state.orders[0].fillsPending && state.riskHalted);
  fixture.showFills();
  await until(get, (state) => state.positions[0]?.quantity === 0.2);
  await post('/cancel', { id: intent.id });
  fixture.setPrice(125);
  const close = { id: orderId(), product: 'SPOT', symbol: 'BTCUSDT', action: 'CLOSE' };
  await post('/orders', close);
  const submits = fixture.calls.filter((call) => call.path === '/order' && call.method === 'POST');
  assert.equal(submits[0].params.type, 'LIMIT_MAKER');
  assert.equal(submits[1].params.quantity, '0.200');
  assert.equal(submits[1].params.side, 'SELL');
  assert.equal(submits[1].params.reduceOnly, undefined);
  fixture.fill(close.id, 0.2, 'FILLED');
  const result = await until(get, (state) => state.positions.length === 0);
  assert.ok(Math.abs(result.realizedToday - 4.8) < 1e-9);
});

test('Futures recovers a timed-out submission by ID after restart and sends a reduce-only close', async (context) => {
  const { fixture, restart, post, get, start } = setup(context);
  assert.throws(start, /sudah dipakai/);
  const intent = open('PERP', 'SELL');
  fixture.timeoutNextSubmit();
  assert.equal((await post('/orders', intent)).order.status, 'UNCONFIRMED');
  await restart();
  const [retry] = await Promise.all([post('/orders', intent), post('/orders', intent)]);
  assert.equal(retry.order.id, intent.id);
  await assert.rejects(post('/orders', { ...intent, budget: 45 }), { status: 409 });
  fixture.fill(intent.id, 0.499, 'FILLED');
  await until(get, (state) => state.positions[0]?.quantity === -0.499);
  const close = { id: orderId(), product: 'PERP', symbol: 'BTCUSDT', action: 'CLOSE' };
  fixture.setPosition(-0.1);
  await assert.rejects(post('/orders', close), { status: 409 });
  fixture.setPosition(-0.499);
  await post('/orders', close);
  const submits = fixture.calls.filter((call) => call.path === '/order' && call.method === 'POST');
  assert.equal(submits.length, 2);
  assert.equal(submits[0].params.timeInForce, 'GTX');
  assert.equal(submits[1].params.side, 'BUY');
  assert.equal(submits[1].params.quantity, '0.499');
  assert.equal(submits[1].params.reduceOnly, 'true');
  fixture.fill(close.id, 0.499, 'FILLED', -30);
  await until(get, (state) => state.riskHalted);
  await assert.rejects(post('/orders', open('SPOT')), { status: 423 });
});

test('Server token, order cap and persistent halt gate entries for both Testnet products', async (context) => {
  const { get, post, unauthorized, restart } = setup(context);
  await assert.rejects(unauthorized(), { status: 401 });
  await assert.rejects(post('/orders', open('PERP', 'BUY', 101)), { status: 409 });
  const { order } = await post('/orders', open('SPOT'));
  assert.equal(order.status, 'NEW');
  await post('/halt', {});
  await restart();
  const result = await until(get, (state) => state.orders[0].status === 'CANCELED');
  assert.equal(result.halted, true);
  await assert.rejects(post('/orders', open('SPOT')), { status: 423 });
  await assert.rejects(post('/orders', open('PERP')), { status: 423 });
  assert.equal((await post('/resume', {})).halted, false);
  assert.equal((await post('/orders', open('PERP'))).order.status, 'NEW');
});


test('HTTP gateway closes live routes and keeps the protected journal response uncached', async (context) => {
  const fixture = venueFixture();
  const journal = createTradingJournal({ env, databasePath: ':memory:', fetchImpl: fixture.fetch });
  const gateway = await createManagedTestnetGateway(journal);
  const server = createServer((req, res) => { void gateway.middleware(req, res, () => res.end()); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(async () => {
    await new Promise((resolve) => server.close(resolve));
    await gateway.close();
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(origin + '/api/execute/order', { method: 'POST' })).status, 410);
  assert.equal((await fetch(origin + '/api/trading/mainnet/orders', { method: 'POST' })).status, 403);
  const unauth = await fetch(origin + root);
  assert.equal(unauth.status, 401);
  assert.equal(unauth.headers.get('cache-control'), 'no-store');
  assert.equal(unauth.headers.get('access-control-allow-origin'), null);
  const read = await fetch(origin + root, { headers: { Authorization: auth } });
  assert.equal(read.status, 200);
  assert.deepEqual((await read.json()).configured, ['SPOT', 'PERP']);
  const intent = open('SPOT');
  const submit = await fetch(origin + root + '/orders', {
    method: 'POST', headers: { Authorization: auth, 'Content-Type': 'application/json' }, body: JSON.stringify(intent),
  });
  assert.equal(submit.status, 200);
  assert.equal((await submit.json()).order.status, 'NEW');
  assert.equal(fixture.calls.filter((call) => call.method === 'POST').length, 1);
});

const protection = { takeProfitPct: 2, stopLossPct: 1 };
const minute = 60_000;
const cycle = () => delay(80);
const submits = (fixture) => fixture.calls.filter(({ path, method }) => path === '/order' && method === 'POST');

function candlesAt(boundary, crossingPrice, currentPrice = crossingPrice) {
  return Array.from({ length: 32 }, (_, index) => {
    const at = boundary + (index - 31) * minute;
    return [at, '100', '120', '80', String(index === 31 ? currentPrice : index === 30 ? crossingPrice : 100), '1', at + minute - 1];
  });
}

function testClock() {
  const boundary = Math.ceil(Date.now() / minute) * minute;
  let time = boundary - 20_000;
  return { now: () => time, set: (value) => { time = value; }, boundary };
}

test('Spot ignores an open candle, buys once on a confirmed signal, and takes profit after canceling a partial entry', async (context) => {
  const clock = testClock();
  const { fixture, get, post, restart } = setup(context, clock);
  fixture.setCandles(candlesAt(clock.boundary, 103, 120));
  await post('/automation', { enabled: true, product: 'SPOT', symbol: 'BTCUSDT', budget: 50, protection });
  await cycle();
  assert.equal(submits(fixture).length, 0, 'The bullish candle is still open');

  clock.set(clock.boundary + 1000);
  const pending = await until(get, (state) => state.orders.some((order) => order.source === 'AUTOMATION'));
  const entry = pending.orders[0];
  assert.equal(entry.side, 'BUY');
  assert.equal(entry.signalAt, clock.boundary - 1);
  assert.equal(submits(fixture)[0].futures, false);
  fixture.fill(entry.id, 0.2, 'PARTIALLY_FILLED');
  const protectedState = await until(get, (state) => state.orders[0].status === 'CANCELED' && !!state.positions[0]?.protection);
  assert.equal(protectedState.positions[0].protection.takeProfit, 102);
  assert.equal(protectedState.positions[0].protection.stopLoss, 99);
  await restart();
  assert.equal((await get()).automation[0].enabled, true);

  fixture.setPrice(103);
  const triggered = await until(get, (state) => state.orders[0].trigger === 'TAKE_PROFIT');
  const exit = triggered.orders[0];
  assert.equal(exit.side, 'SELL');
  assert.equal(submits(fixture)[1].params.quantity, '0.200');
  assert.equal(submits(fixture)[1].params.reduceOnly, undefined);
  fixture.fill(exit.id, 0.2, 'FILLED');
  await until(get, (state) => state.positions.length === 0);
  await restart();
  clock.set(clock.boundary + 25_000);
  await cycle();
  assert.equal(submits(fixture).length, 2, 'The same candle cannot create another entry after restart');
});

test('Futures short stop survives a halt, stale quote, ambiguous response and restart without a duplicate', async (context) => {
  const clock = testClock();
  const { fixture, get, post, restart } = setup(context, clock);
  await post('/automation', { enabled: true, product: 'PERP', symbol: 'BTCUSDT', budget: 50, protection });
  fixture.setCandles(candlesAt(clock.boundary, 97));
  clock.set(clock.boundary + 1000);
  const pending = await until(get, (state) => state.orders.length > 0);
  const entry = pending.orders[0];
  assert.equal(entry.side, 'SELL');
  assert.equal(submits(fixture)[0].params.timeInForce, 'GTX');
  fixture.fill(entry.id, 0.499, 'FILLED');
  await until(get, (state) => state.positions[0]?.quantity === -0.499);

  await post('/halt', {});
  assert.equal((await get()).automation[0].enabled, false);
  assert.equal((await get()).positions[0].protection.stopLoss, 101);
  fixture.setPrice(102);
  fixture.setQuoteTime(clock.now() - 21_000);
  await until(get, (state) => !!state.positions[0]?.protectionStatus);
  assert.equal(submits(fixture).length, 1);

  clock.set(clock.now() + 16_000);
  fixture.setQuoteTime(clock.now());
  fixture.timeoutNextSubmit();
  const triggered = await until(get, (state) => state.orders[0].trigger === 'STOP_LOSS');
  const exit = triggered.orders[0];
  assert.equal(exit.side, 'BUY');
  assert.equal(exit.status, 'UNCONFIRMED');
  assert.equal(submits(fixture)[1].params.reduceOnly, 'true');
  assert.equal(submits(fixture)[1].params.quantity, '0.499');
  await restart();
  await until(get, (state) => state.orders[0].status === 'NEW');
  assert.equal(submits(fixture).length, 2);
  fixture.fill(exit.id, 0.499, 'FILLED');
  await until(get, (state) => state.positions.length === 0);
});

test('manual Spot entry can use stop-loss independently of auto-entry', async (context) => {
  const { fixture, get, post } = setup(context);
  await assert.rejects(post('/orders', { ...open('SPOT'), protection: { takeProfitPct: 0, stopLossPct: 1 } }), { status: 400 });
  const entry = await post('/orders', { ...open('SPOT'), protection });
  fixture.fill(entry.order.id, 0.5, 'FILLED');
  await until(get, (state) => state.positions.length === 1);
  fixture.setPrice(98);
  await until(get, (state) => state.orders[0].trigger === 'STOP_LOSS');
  assert.equal(submits(fixture)[1].params.side, 'SELL');
  assert.equal(submits(fixture)[1].params.quantity, '0.500');
});

test('Futures automation can buy, expires an unfilled entry, and waits for the next fresh crossover', async (context) => {
  const clock = testClock();
  const { fixture, get, post } = setup(context, clock);
  await post('/automation', { enabled: true, product: 'PERP', symbol: 'BTCUSDT', budget: 50, protection });
  fixture.setCandles(candlesAt(clock.boundary, 103));
  clock.set(clock.boundary + 1000);
  await until(get, (state) => state.orders[0]?.side === 'BUY');
  clock.set(clock.boundary + 61_001);
  await until(get, (state) => state.orders[0]?.status === 'CANCELED');
  await cycle();
  assert.equal(submits(fixture).length, 1);
  assert.deepEqual((await get()).positions, []);
});


test('Without managed mode, legacy execution is delegated and the managed journal is disabled', async (context) => {
  const gateway = await createManagedTestnetGateway(null);
  const server = createServer((req, res) => {
    void gateway.middleware(req, res, () => { res.statusCode = 204; res.end(); });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(origin + '/api/execute/order', { method: 'POST' })).status, 204);
  assert.equal((await fetch(origin + root)).status, 503);
});

test('Opsi A #1: Post-Only -5022/-2010 rejects cleanly (no UNCONFIRMED deadlock) and stale UNCONFIRMED -2013 releases symbol', async (context) => {
  const clock = testClock();
  const folder = mkdtempSync(join(tmpdir(), 'fincept-journal-reject-'));
  const databasePath = join(folder, 'orders.sqlite');
  let mode = 'REJECT_5022';

  const mockFetch = async (url, options) => {
    const { pathname, searchParams: params } = new URL(url);
    const path = pathname.replace(/^\/(?:api|fapi)\/v[13]/, '');
    if (path === '/exchangeInfo') {
      return Response.json({
        symbols: [{ symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING', contractType: 'PERPETUAL', isSpotTradingAllowed: true, orderTypes: ['MARKET', 'LIMIT', 'LIMIT_MAKER'], filters }],
      });
    }
    if (path === '/ticker/bookTicker') return Response.json({ symbol: 'BTCUSDT', bidPrice: '100', askPrice: '100.01' });
    if (path === '/positionSide/dual') return Response.json({ dualSidePosition: false });
    if (path === '/positionRisk') return Response.json([{ symbol: 'BTCUSDT', positionSide: 'BOTH', positionAmt: '0' }]);
    if (path === '/account') return Response.json({ canTrade: true, balances: [{ asset: 'USDT', free: '1000' }, { asset: 'BTC', free: '1' }] });
    if (path === '/leverage') return Response.json({ symbol: 'BTCUSDT', leverage: Number(params.get('leverage')) });
    if (path === '/order' && options.method === 'POST') {
      if (mode === 'REJECT_5022') return Response.json({ code: -5022, msg: 'Post Only order will be rejected' }, { status: 400 });
      if (mode === 'REJECT_2010') return Response.json({ code: -2010, msg: 'Order would immediately match and take' }, { status: 400 });
      if (mode === 'DROP_NEVER_ACCEPTED') throw new Error('TCP reset before venue accepted');
      return Response.json({ symbol: 'BTCUSDT', side: params.get('side'), orderId: 777, clientOrderId: params.get('newClientOrderId'), executedQty: '0', status: 'NEW' });
    }
    if (path === '/order' && options.method === 'GET') {
      return Response.json({ code: -2013, msg: 'Order does not exist' }, { status: 400 });
    }
    return Response.json({});
  };

  const journal = createTradingJournal({ env, databasePath, fetchImpl: mockFetch, intervalMs: 25, now: clock.now });
  context.after(async () => { await journal.close(); rmSync(folder, { recursive: true, force: true }); });
  const get = () => journal.route(root, 'GET', null, auth);
  const post = (p, b) => journal.route(root + p, 'POST', async () => b, auth);

  // 1) Futures -5022 -> immediately REJECTED (never UNCONFIRMED)
  const r5022 = await post('/orders', open('PERP', 'BUY'));
  assert.equal(r5022.order.status, 'REJECTED');
  assert.equal(r5022.order.venueCode, -5022);

  // 2) Spot -2010 -> immediately REJECTED
  mode = 'REJECT_2010';
  const r2010 = await post('/orders', open('SPOT', 'BUY'));
  assert.equal(r2010.order.status, 'REJECTED');
  assert.equal(r2010.order.venueCode, -2010);

  // 3) Dropped request never accepted by Binance -> UNCONFIRMED initially, then -2013 after 10s grace releases symbol!
  mode = 'DROP_NEVER_ACCEPTED';
  const dropped = await post('/orders', open('PERP', 'SELL'));
  assert.equal(dropped.order.status, 'UNCONFIRMED');
  clock.set(clock.now() + 12_000);
  await until(get, (st) => st.orders[0].status === 'REJECTED' && st.orders[0].venueCode === -2013);

  // Symbol is now unlocked and accepts new order cleanly!
  mode = 'ACCEPT';
  const recovered = await post('/orders', open('PERP', 'BUY'));
  assert.equal(recovered.order.status, 'NEW');
});

test('Opsi A #2 & #3: Futures syncs FINCEPT_FUTURES_LEVERAGE, Unified Demo key uses demo-api.binance.com, and Dual-Layer Exchange SL + Cancel-Before-Close works', async (context) => {
  const folder = mkdtempSync(join(tmpdir(), 'fincept-journal-exsl-'));
  const databasePath = join(folder, 'orders.sqlite');
  const seenHosts = new Set();
  const levCalls = [];
  const stopOrders = [];
  const canceledStops = [];
  let filledQty = 0;

  const mockFetch = async (url, options) => {
    const { hostname, pathname, searchParams: params } = new URL(url);
    seenHosts.add(hostname);
    const path = pathname.replace(/^\/(?:api|fapi)\/v[13]/, '');
    if (path === '/exchangeInfo') {
      return Response.json({
        symbols: [{
          symbol: 'BTCUSDT', baseAsset: 'BTC', quoteAsset: 'USDT', status: 'TRADING',
          contractType: 'PERPETUAL', isSpotTradingAllowed: true,
          orderTypes: ['MARKET', 'LIMIT', 'LIMIT_MAKER', 'STOP_MARKET', 'STOP_LOSS_LIMIT'],
          filters,
        }],
      });
    }
    if (path === '/ticker/bookTicker') return Response.json({ symbol: 'BTCUSDT', bidPrice: '100', askPrice: '100.01' });
    if (path === '/positionSide/dual') return Response.json({ dualSidePosition: false });
    if (path === '/positionRisk') return Response.json([{ symbol: 'BTCUSDT', positionSide: 'BOTH', positionAmt: String(filledQty) }]);
    if (path === '/account') return Response.json({ canTrade: true, balances: [{ asset: 'USDT', free: '1000' }, { asset: 'BTC', free: '1' }] });
    if (path === '/leverage' && options.method === 'POST') {
      levCalls.push({ symbol: params.get('symbol'), leverage: Number(params.get('leverage')) });
      return Response.json({ symbol: params.get('symbol'), leverage: Number(params.get('leverage')) });
    }
    if (path === '/order' && options.method === 'POST') {
      const type = params.get('type');
      const cid = params.get('newClientOrderId');
      if (type === 'STOP_MARKET') {
        stopOrders.push({ cid, stopPrice: params.get('stopPrice'), closePosition: params.get('closePosition') });
        return Response.json({ symbol: 'BTCUSDT', side: params.get('side'), orderId: 9001, clientOrderId: cid, executedQty: '0', status: 'NEW' });
      }
      if (type === 'MARKET') {
        const q = Number(params.get('quantity'));
        filledQty = 0;
        return Response.json({ symbol: 'BTCUSDT', side: params.get('side'), orderId: 9002, clientOrderId: cid, executedQty: String(q), status: 'FILLED' });
      }
      filledQty = Number(params.get('quantity'));
      return Response.json({ symbol: 'BTCUSDT', side: params.get('side'), orderId: 9000, clientOrderId: cid, executedQty: String(filledQty), status: 'FILLED' });
    }
    if (path === '/order' && options.method === 'DELETE') {
      canceledStops.push(params.get('origClientOrderId'));
      return Response.json({ symbol: 'BTCUSDT', orderId: 9001, origClientOrderId: params.get('origClientOrderId'), status: 'CANCELED' });
    }
    if (path === '/userTrades') {
      const oid = params.get('orderId');
      return Response.json([{ symbol: 'BTCUSDT', orderId: Number(oid), id: Number(oid) * 10, qty: '0.5', time: Date.now(), price: '100', commission: '0.05', commissionAsset: 'USDT', realizedPnl: '0' }]);
    }
    return Response.json({});
  };

  // Single unified Binance Demo API key for both Spot & Futures -> Spot automatically selects demo-api.binance.com!
  const unifiedEnv = {
    ...env,
    FINCEPT_BINANCE_SPOT_API_KEY: 'unified-demo-key',
    FINCEPT_BINANCE_SPOT_API_SECRET: 'unified-demo-secret',
    FINCEPT_BINANCE_FUTURES_API_KEY: 'unified-demo-key',
    FINCEPT_BINANCE_FUTURES_API_SECRET: 'unified-demo-secret',
    FINCEPT_FUTURES_LEVERAGE: '7',
  };
  const journal = createTradingJournal({ env: unifiedEnv, databasePath, fetchImpl: mockFetch, intervalMs: 25 });
  context.after(async () => { await journal.close(); rmSync(folder, { recursive: true, force: true }); });
  const get = () => journal.route(root, 'GET', null, auth);
  const post = (p, b) => journal.route(root + p, 'POST', async () => b, auth);

  const snap0 = await get();
  assert.equal(snap0.origins.SPOT, 'https://demo-api.binance.com');
  assert.equal(snap0.futuresLeverage, 7);

  // Open protected Futures LONG -> syncs 7x leverage -> fills -> worker arms exchange STOP_MARKET closePosition=true!
  const entry = await post('/orders', { ...open('PERP', 'BUY'), protection });
  assert.equal(entry.order.status, 'FILLED');
  assert.deepEqual(levCalls, [{ symbol: 'BTCUSDT', leverage: 7 }]);

  const armed = await until(get, (st) => Boolean(st.positions[0]?.exchangeStopId));
  assert.equal(stopOrders.length, 1);
  assert.equal(stopOrders[0].closePosition, 'true');
  assert.equal(stopOrders[0].stopPrice, '99.00');
  assert.ok(seenHosts.has('demo-fapi.binance.com'));

  // Close position -> Cancel-Before-Close cancels exchange stop BEFORE market CLOSE!
  await post('/orders', { id: orderId(), product: 'PERP', symbol: 'BTCUSDT', action: 'CLOSE' });
  assert.deepEqual(canceledStops, [armed.positions[0].exchangeStopId]);
});

test('Opsi A #4: On-Chain Whale + L2 Orderbook + Verified News confluence gate vetoes conflicting entries and allows aligned entries', async (context) => {
  const clock = testClock();
  const fixture = venueFixture();
  const folder = mkdtempSync(join(tmpdir(), 'fincept-journal-intel-'));
  const databasePath = join(folder, 'orders.sqlite');
  let intelScenario = 'BEARISH_NEWS_AND_ASK_WALL';

  const intelProvider = async () => {
    if (intelScenario === 'BEARISH_NEWS_AND_ASK_WALL') {
      return {
        orderbook: { ok: true, bids: [{ price: 100 }], asks: [{ price: 100.01 }], spreadBps: 1, obiPercent: -52 },
        snapshot: {
          verifiedMacroNews: [
            { credibilityScore: 99, impactScore: 95, sentiment: 'BEARISH', affectedAssets: ['BTC'] },
            { credibilityScore: 97, impactScore: 92, sentiment: 'BEARISH', affectedAssets: ['BTC', 'ETH'] },
          ],
          realOnChainTrades: [
            { symbol: 'BTC-PERP', tokenSymbol: 'BTC', direction: 'BEARISH', sizeUsd: 2_500_000, isDirectionalWhaleTrade: true },
          ],
        },
      };
    }
    return {
      orderbook: { ok: true, bids: [{ price: 100 }], asks: [{ price: 100.01 }], spreadBps: 1, obiPercent: 28 },
      snapshot: {
        verifiedMacroNews: [
          { credibilityScore: 98, impactScore: 92, sentiment: 'BULLISH', affectedAssets: ['BTC'] },
        ],
        realOnChainTrades: [
          { symbol: 'BTC-PERP', tokenSymbol: 'BTC', direction: 'BULLISH', sizeUsd: 3_000_000, isDirectionalWhaleTrade: true },
        ],
      },
    };
  };

  const journal = createTradingJournal({ env, databasePath, fetchImpl: fixture.fetch, intelProvider, intervalMs: 25, now: clock.now });
  context.after(async () => { await journal.close(); rmSync(folder, { recursive: true, force: true }); });
  const get = () => journal.route(root, 'GET', null, auth);
  const post = (p, b) => journal.route(root + p, 'POST', async () => b, auth);

  await post('/automation', { enabled: true, product: 'SPOT', symbol: 'BTCUSDT', budget: 50, protection });
  fixture.setCandles(candlesAt(clock.boundary, 103));
  clock.set(clock.boundary + 1000);

  // Blocked by opposing L2 Ask Wall (-52% OBI) + Bearish news/whale flow -> 0 orders submitted!
  const blocked = await until(get, (st) => Boolean(st.automation[0]?.error));
  assert.match(blocked.automation[0].error, /Dinding Ask L2|BEARISH/i);
  assert.equal(submits(fixture).length, 0);

  // Next candle with aligned bullish L2 OBI + bullish news + whale inflow -> entry executes cleanly!
  intelScenario = 'ALIGNED_BULLISH';
  const nextBoundary = clock.boundary + minute;
  fixture.setCandles(candlesAt(nextBoundary, 103));
  clock.set(nextBoundary + 1000);
  await until(get, (st) => st.orders.length === 1 && st.orders[0].side === 'BUY');
  assert.equal(submits(fixture).length, 1);
  assert.match((await get()).automation[0].lastIntelSummary || '', /L2 OBI \+28%/);
});
