import { DatabaseSync } from 'node:sqlite';
import { createHash, timingSafeEqual } from 'node:crypto';
import { closeSync, mkdirSync, openSync } from 'node:fs';
import { dirname } from 'node:path';
import { makeBinanceTestnet, VenueError } from './binanceTestnet.mjs';
import {
  closedCandleSignal,
  evaluateManagedEntryConfluence,
  protectionLevels,
  protectionTrigger,
} from './testnetStrategy.mjs';
import { getRealAggregatedOrderbook, getRealMarketSnapshot } from './exchangeGateway.mjs';

const WORKING = new Set(['SUBMITTING', 'UNCONFIRMED', 'NEW', 'PARTIALLY_FILLED', 'PENDING_CANCEL']);
const VENUE_STATUS = new Set(['NEW', 'PARTIALLY_FILLED', 'FILLED', 'CANCELED', 'PENDING_CANCEL', 'REJECTED', 'EXPIRED', 'EXPIRED_IN_MATCH']);
const EXPLICIT_REJECT_CODES = new Set([
  -1013, -1021, -1022, -1100, -1102, -1111, -1121,
  -2010, -2015, -2019, -2022, -4164, -5022,
]);
const EPSILON = 1e-9;
const ENTRY_LIFETIME_MS = 60_000;
const EXIT_RETRY_MS = 15_000;
const MAX_AUTO_CLOSE_ATTEMPTS = 3;
const MAX_STOP_LOSS_ATTEMPTS = 6;
const MAX_AUTOMATION_RULES = 4;
const AUTOMATION_POLL_MS = 10_000;
const instrumentKey = (item) => `${item.product}:${item.symbol}`;
const fail = (status, message) => Object.assign(new Error(message), { status });
const requireValue = (condition, status, message) => { if (!condition) throw fail(status, message); };
const hash = (value) => createHash('sha256').update(value).digest();
const number = (value) => value == null || value === '' ? NaN : Number(value);
const stableId = (...parts) => `ft-${hash(JSON.stringify(parts)).toString('hex').slice(0, 32)}`;
const validInstrument = (product, symbol) => ['SPOT', 'PERP'].includes(product) &&
  typeof symbol === 'string' && /^[A-Z0-9]{1,16}USDT$/.test(symbol);

function normalizeProtection(value) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === 2 && [value.takeProfitPct, value.stopLossPct].every((pct) =>
      typeof pct === 'number' && Number.isFinite(pct) && pct >= 0.1 && pct <= 25),
  400, 'Persentase take-profit dan stop-loss harus antara 0,1 dan 25.');
  return { takeProfitPct: value.takeProfitPct, stopLossPct: value.stopLossPct };
}

function readQuote(book, symbol, now) {
  const bid = number(book?.bidPrice);
  const ask = number(book?.askPrice);
  const venueTime = book?.time;
  requireValue(book?.symbol === symbol && Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask >= bid &&
    (venueTime === undefined || (Number.isSafeInteger(venueTime) && venueTime >= now - 20_000 && venueTime <= now + 5_000)),
  503, 'Quote Binance Testnet tidak valid atau sudah kedaluwarsa.');
  return { bid, ask };
}

function riskNumber(env, key, fallback, maximum) {
  const value = env[key] === undefined ? fallback : number(env[key]);
  if (!Number.isFinite(value) || value <= 0 || value > maximum) throw new Error(`Konfigurasi ${key} tidak valid.`);
  return value;
}

function floorStep(value, step) {
  const unit = number(step);
  if (!(unit > 0 && Number.isFinite(value))) return '0';
  const precision = String(step).split('.')[1]?.length ?? 0;
  return (Math.floor(value / unit + 1e-8) * unit).toFixed(precision);
}

function accounting(orders, today) {
  const positions = new Map();
  let realized = 0;
  let complete = true;
  const fills = orders.flatMap((order) => {
    if (order.fillsPending || (WORKING.has(order.status) && order.syncError)) complete = false;
    return order.fills.map((fill) => ({ ...fill, order }));
  }).sort((a, b) => a.time - b.time || a.sequence - b.sequence);
  for (const fill of fills) {
    const { order, quantity, price, commission, commissionAsset, time } = fill;
    const key = instrumentKey(order);
    const position = positions.get(key) || { product: order.product, symbol: order.symbol, quantity: 0, cost: 0 };
    if (order.action === 'OPEN') {
      if (position.entryOrderId !== order.id) {
        position.entryOrderId = order.id;
        position.entryFillQty = 0;
        position.entryQuote = 0;
      }
      position.entryFillQty += quantity;
      position.entryQuote += quantity * price;
      position.entryPrice = position.entryQuote / position.entryFillQty;
    }
    const spot = order.product === 'SPOT';
    const feeInBase = spot && commissionAsset === order.base ? commission : 0;
    let fee = 0;
    if (commission) {
      if (commissionAsset === 'USDT') fee = commission;
      else if (feeInBase && order.side === 'SELL') fee = feeInBase * price;
      else if (!feeInBase) complete = false;
    }
    let pnl = 0;
    if (!spot) {
      position.quantity += order.side === 'BUY' ? quantity : -quantity;
      pnl = fill.realizedPnl - fee;
    } else if (order.side === 'BUY') {
      position.quantity += quantity - feeInBase;
      position.cost += quantity * price + fee;
    } else {
      const averageCost = position.quantity > EPSILON ? position.cost / position.quantity : 0;
      if (quantity + feeInBase > position.quantity + EPSILON) complete = false;
      position.quantity -= quantity + feeInBase;
      position.cost = Math.max(0, position.cost - (quantity + feeInBase) * averageCost);
      pnl = quantity * (price - averageCost) - fee - feeInBase * (averageCost - price);
    }
    if (new Date(time).toISOString().slice(0, 10) === today) realized += pnl;
    if (Math.abs(position.quantity) <= EPSILON) positions.delete(key);
    else positions.set(key, position);
  }
  return { positions: [...positions.values()].filter((p) => Math.abs(p.quantity) > EPSILON), realized, complete };
}

export function createTradingJournal({ env = process.env, fetchImpl, intelProvider, now = Date.now, databasePath = env.FINCEPT_TRADING_DB || '.fincept/trading.sqlite', intervalMs = 3000 } = {}) {
  const enabled = env.FINCEPT_ENABLE_BINANCE_TESTNET === '1';
  const token = env.FINCEPT_TRADING_TOKEN;
  if (!enabled) return null;
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw new Error('FINCEPT_TRADING_TOKEN wajib diatur.');
  const tokenHash = hash(token);
  const maxOrder = riskNumber(env, 'FINCEPT_MAX_ORDER_USDT', 100, 1000);
  const dailyLimit = riskNumber(env, 'FINCEPT_MAX_DAILY_LOSS_USDT', 25, 1000);
  const maxSlots = riskNumber(env, 'FINCEPT_MAX_OPEN_SLOTS', 2, 10);
  if (!Number.isInteger(maxSlots)) throw new Error('FINCEPT_MAX_OPEN_SLOTS harus bilangan bulat.');
  const futuresLeverage = riskNumber(env, 'FINCEPT_FUTURES_LEVERAGE', 5, 20);
  if (!Number.isInteger(futuresLeverage)) throw new Error('FINCEPT_FUTURES_LEVERAGE harus bilangan bulat.');
  const allowlisted = new Set((env.FINCEPT_TESTNET_SYMBOLS || 'BTCUSDT').split(',').map((symbol) => symbol.trim()));
  if ([...allowlisted].some((symbol) => !/^[A-Z0-9]{1,16}USDT$/.test(symbol))) throw new Error('FINCEPT_TESTNET_SYMBOLS tidak valid.');
  const venues = {};
  const fingerprints = {};
  const spotKey = env.FINCEPT_BINANCE_SPOT_API_KEY;
  const futKey = env.FINCEPT_BINANCE_FUTURES_API_KEY;
  const unifiedDemoSingleKey = Boolean(spotKey && futKey && spotKey === futKey);
  for (const [product, suffix] of [['SPOT', 'SPOT'], ['PERP', 'FUTURES']]) {
    const key = env[`FINCEPT_BINANCE_${suffix}_API_KEY`];
    const secret = env[`FINCEPT_BINANCE_${suffix}_API_SECRET`];
    if (key && secret) {
      const origin =
        product === 'SPOT'
          ? env.FINCEPT_BINANCE_SPOT_ORIGIN || (unifiedDemoSingleKey ? 'https://demo-api.binance.com' : undefined)
          : env.FINCEPT_BINANCE_FUTURES_ORIGIN || undefined;
      venues[product] = makeBinanceTestnet(product, { key, secret, origin }, fetchImpl);
      fingerprints[product] = hash(key).toString('hex');
    }
  }
  if (databasePath !== ':memory:') {
    mkdirSync(dirname(databasePath), { recursive: true, mode: 0o700 });
    closeSync(openSync(databasePath, 'a', 0o600));
    closeSync(openSync(`${databasePath}.lock`, 'a', 0o600));
  }
  // One command worker per journal. SQLite releases the lock when the process exits.
  const lock = new DatabaseSync(databasePath === ':memory:' ? ':memory:' : `${databasePath}.lock`);
  try { lock.exec('BEGIN EXCLUSIVE'); } catch { lock.close(); throw new Error('Jurnal trading sudah dipakai proses lain.'); }
  const db = new DatabaseSync(databasePath);
  try {
    db.exec(`PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, record TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS events (seq INTEGER PRIMARY KEY, time INTEGER NOT NULL, order_id TEXT, detail TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS config (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS automation (key TEXT PRIMARY KEY, record TEXT NOT NULL);`);
    for (const [product, fingerprint] of Object.entries(fingerprints)) {
      const name = `account:${product}`;
      const stored = db.prepare('SELECT value FROM config WHERE key = ?').get(name)?.value;
      if (stored && stored !== fingerprint) throw new Error(`Jurnal ${product} terikat pada API key lain. Gunakan jurnal yang sesuai.`);
      db.prepare('INSERT OR IGNORE INTO config VALUES (?, ?)').run(name, fingerprint);
    }
  } catch (error) { db.close(); lock.close(); throw error; }

  function transaction(fn) {
    db.exec('BEGIN IMMEDIATE');
    try { fn(); db.exec('COMMIT'); } catch (error) { db.exec('ROLLBACK'); throw error; }
  }
  const orders = () => db.prepare('SELECT record FROM orders ORDER BY rowid').all().map(({ record }) => JSON.parse(record));
  const find = (id) => JSON.parse(db.prepare('SELECT record FROM orders WHERE id = ?').get(id)?.record ?? 'null');
  const halted = () => db.prepare("SELECT value FROM config WHERE key = 'halted'").get()?.value === '1';
  const event = (id, detail) => db.prepare('INSERT INTO events (time, order_id, detail) VALUES (?, ?, ?)').run(now(), id, detail);
  function save(order, detail) {
    transaction(() => {
      db.prepare('INSERT INTO orders VALUES (?, ?) ON CONFLICT(id) DO UPDATE SET record = excluded.record').run(order.id, JSON.stringify(order));
      event(order.id, detail);
    });
    return order;
  }
  const current = (items = orders()) => accounting(items, new Date(now()).toISOString().slice(0, 10));
  const rules = () => db.prepare('SELECT record FROM automation ORDER BY rowid').all().map(({ record }) => JSON.parse(record));
  function saveRule(rule) {
    db.prepare('INSERT INTO automation VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET record = excluded.record')
      .run(instrumentKey(rule), JSON.stringify(rule));
  }
  const protectionHealth = new Map();
  const publicOrder = ({ signature, ...order }) => order;
  const snapshot = () => {
    const items = orders();
    const state = current(items);
    const origins = Object.fromEntries(
      Object.entries(venues).map(([prod, v]) => [prod, v.origin || ''])
    );
    return { halted: halted(), configured: Object.keys(venues), origins, futuresLeverage, symbols: [...allowlisted], maxOrder, dailyLimit,
      riskHalted: !state.complete || state.realized <= -dailyLimit, accountingComplete: state.complete,
      realizedToday: state.complete ? state.realized : null, automation: rules(),
      positions: state.positions.map(({ entryFillQty, entryQuote, cost, ...position }) => {
        const entry = items.find(({ id }) => id === position.entryOrderId);
        return { ...position, ...(entry?.protection ? {
          protection: protectionLevels(position.entryPrice, entry.protection, position.quantity > 0),
          exchangeStopId: entry.exchangeStopId || null,
          trigger: entry.exitTrigger?.reason,
          protectionStatus: protectionHealth.get(entry.id)?.error,
        } : {}) };
      }),
      orders: items.slice(-100).reverse().map(publicOrder) };
  };

  function applyVenue(order, response) {
    const executed = number(response?.executedQty);
    if (!VENUE_STATUS.has(response?.status) || !/^\d+$/.test(String(response?.orderId)) ||
        response.symbol !== order.symbol || response.side !== order.side ||
        (!([response.clientOrderId, response.origClientOrderId].includes(order.id)) &&
          !(response.status === 'CANCELED' && order.venueId === String(response.orderId))) ||
        (order.venueId && String(response.orderId) !== order.venueId) ||
        !Number.isFinite(executed) || executed < order.executed || executed > Number(order.quantity) + EPSILON) {
      throw new Error('Invalid order acknowledgment');
    }
    if (order.venueId && order.status === response.status && order.executed === executed && !order.syncError) return order;
    return save({ ...order, venueId: String(response.orderId), status: response.status,
      executed, fillsPending: executed > order.fills.reduce((sum, fill) => sum + fill.quantity, 0) + EPSILON,
      venueConfirmedAt: now(), syncError: null }, `STATUS_${response.status}`);
  }

  async function reconcileFills(order, venue) {
    if (!order.fillsPending) return order;
    const rows = await venue.fills(order, order.venueId);
    if (!Array.isArray(rows)) throw new Error('Invalid trade history');
    const unique = new Map();
    for (const row of rows) {
      const fill = { id: String(row.id), sequence: number(row.id), time: number(row.time), quantity: number(row.qty),
        price: number(row.price), commission: number(row.commission), commissionAsset: row.commissionAsset,
        realizedPnl: order.product === 'PERP' ? number(row.realizedPnl) : 0 };
      if (String(row.orderId) !== order.venueId || row.symbol !== order.symbol ||
          !Number.isSafeInteger(fill.sequence) || !Number.isSafeInteger(fill.time) || fill.time <= 0 || fill.time > 8.64e15 ||
          ![fill.quantity, fill.price, fill.commission, fill.realizedPnl].every(Number.isFinite) ||
          fill.quantity <= 0 || fill.price <= 0 || (fill.commission !== 0 && !fill.commissionAsset)) {
        throw new Error('Invalid fill');
      }
      unique.set(fill.id, fill);
    }
    const fills = [...unique.values()];
    if (Math.abs(fills.reduce((sum, fill) => sum + fill.quantity, 0) - order.executed) > EPSILON) {
      throw new Error('Fill history not yet complete');
    }
    return save({ ...order, fills, fillsPending: false, syncError: null }, 'FILLS_RECONCILED');
  }

  async function refresh(order) {
    const venue = venues[order.product];
    if (!venue) {
      if (order.syncError) return order;
      return save({ ...order, syncError: 'Kredensial produk diperlukan untuk rekonsiliasi.' }, 'CREDENTIALS_UNAVAILABLE');
    }
    try {
      if (WORKING.has(order.status)) order = applyVenue(order, await venue.order(order));
      return await reconcileFills(order, venue);
    } catch (error) {
      // If Binance explicitly reports -2013 (Order does not exist) for an UNCONFIRMED order with no venueId
      // after grace window, the order was never accepted -> release symbol cleanly instead of permanent deadlock!
      if (
        order.status === 'UNCONFIRMED' &&
        !order.venueId &&
        error instanceof VenueError &&
        error.code === -2013 &&
        now() - (order.createdAt || 0) >= 10_000
      ) {
        return save(
          { ...order, status: 'REJECTED', venueCode: -2013, syncError: null },
          'SUBMIT_NOT_FOUND_AT_VENUE'
        );
      }
      if (order.syncError) return order;
      return save({ ...order, syncError: 'Menunggu konfirmasi Binance.' }, 'RECONCILE_PENDING');
    }
  }

  let tail = Promise.resolve();
  function serial(fn) {
    const work = tail.then(fn);
    tail = work.catch(() => {});
    return work;
  }

  async function cancel(order) {
    const venue = venues[order.product];
    if (!venue || !order.venueId || order.action !== 'OPEN' || !WORKING.has(order.status)) return order;
    try {
      order = applyVenue(order, await venue.cancel(order));
      return await reconcileFills(order, venue);
    } catch {
      return refresh(order);
    }
  }

  async function reconcile() {
    for (const order of orders()) {
      if (!WORKING.has(order.status) && !order.fillsPending) continue;
      const updated = await refresh(order);
      const automationPaused = updated.source === 'AUTOMATION' && updated.action === 'OPEN' &&
        !rules().some((rule) => rule.enabled && instrumentKey(rule) === instrumentKey(updated));
      const entryExpired = updated.expiresAt && now() >= updated.expiresAt;
      // Stabilize tracked inventory for protected orders before a close can be sent.
      const protectedPartial = updated.protection && updated.status === 'PARTIALLY_FILLED';
      if (halted() || current().realized <= -dailyLimit || automationPaused || entryExpired || protectedPartial) {
        await cancel(updated);
      }
    }
  }

  async function protectPositions() {
    const items = orders();
    const positions = current(items).positions;
    const activeIds = new Set(positions.map((position) => position.entryOrderId));
    for (const id of protectionHealth.keys()) if (!activeIds.has(id)) protectionHealth.delete(id);
    const entries = new Map(items.map((order) => [order.id, order]));
    const unsettled = new Set(items.filter((order) => WORKING.has(order.status) || order.fillsPending).map(instrumentKey));
    for (const position of positions) {
      const entry = entries.get(position.entryOrderId);
      if (!entry?.protection) continue;
      const { product, symbol } = position;
      if (unsettled.has(instrumentKey(position))) {
        protectionHealth.set(entry.id, { error: 'Menunggu order dan fill instrumen selesai direkonsiliasi.' });
        continue;
      }
      if ((protectionHealth.get(entry.id)?.retryAt ?? 0) > now()) continue;
      const attempts = items.filter((order) => order.action === 'CLOSE' && order.entryOrderId === entry.id);
      const maxAttempts = entry.exitTrigger?.reason === 'STOP_LOSS' ? MAX_STOP_LOSS_ATTEMPTS : MAX_AUTO_CLOSE_ATTEMPTS;
      if (attempts.length >= maxAttempts) {
        protectionHealth.set(entry.id, { error: 'Batas percobaan exit tercapai. Periksa posisi dan tutup secara manual.' });
        continue;
      }
      const backoffMs = attempts.length >= 2 ? EXIT_RETRY_MS * 2 : EXIT_RETRY_MS;
      if (attempts.length && now() - attempts.at(-1).createdAt < backoffMs) continue;
      try {
        const venue = venues[product];
        requireValue(venue, 503, 'Kredensial produk tidak tersedia untuk proteksi.');
        let reason = entry.exitTrigger?.reason;
        const { bid, ask } = readQuote(await venue.book(symbol), symbol, now());
        const isLong = position.quantity > 0;
        const levels = protectionLevels(position.entryPrice, entry.protection, isLong);

        // Dual-layer protection: arm exchange-hosted Stop-Loss when venue instrument supports STOP_MARKET / STOP_LOSS_LIMIT
        if (!reason && !entry.exchangeStopId && typeof venue.placeStop === 'function') {
          try {
            const inst = await venue.instrument(symbol);
            const stopOrderType = product === 'PERP' ? 'STOP_MARKET' : 'STOP_LOSS_LIMIT';
            if (inst?.orderTypes?.includes(stopOrderType)) {
              const pxFilter = inst.filters?.find((f) => f.filterType === 'PRICE_FILTER');
              const lot = inst.filters?.find((f) => f.filterType === 'LOT_SIZE');
              const stopPx = floorStep(levels.stopLoss, pxFilter?.tickSize);
              const stopPxNum = Number(stopPx);
              const validSide = isLong ? stopPxNum < bid * 0.9999 : stopPxNum > ask * 1.0001;
              if (stopPxNum > 0 && validSide) {
                const limitPx = floorStep(stopPxNum * (isLong ? 0.998 : 1.002), pxFilter?.tickSize);
                const stopQty = floorStep(Math.abs(position.quantity), lot?.stepSize);
                const stopClientId = stableId('stop', entry.id);
                if (product === 'PERP' || Number(stopQty) > 0) {
                  await venue.placeStop({
                    symbol,
                    side: isLong ? 'SELL' : 'BUY',
                    stopPrice: stopPx,
                    limitPrice: limitPx,
                    quantity: stopQty,
                    clientOrderId: stopClientId,
                  });
                  save({ ...entry, exchangeStopId: stopClientId }, 'EXCHANGE_STOP_ARMED');
                }
              }
            }
          } catch {
            // Non-fatal: server-side TP/SL monitor continues protecting the position and retries arming cleanly
          }
        }

        if (!reason) {
          const quote = isLong ? bid : ask;
          reason = protectionTrigger(quote, levels, isLong);
          if (reason) save({ ...entry, exitTrigger: { reason, quote, triggeredAt: now() } }, `TRIGGER_${reason}`);
        }
        if (reason) {
          // The latch belongs to this entry. A restart cannot forget it, and ambiguity blocks further closes.
          await submit({ id: stableId('exit', entry.id, attempts.length), product, symbol, action: 'CLOSE' }, { trigger: reason });
        }
        protectionHealth.delete(entry.id);
      } catch (error) {
        protectionHealth.set(entry.id, { retryAt: now() + EXIT_RETRY_MS,
          error: error.status ? error.message : 'Proteksi menunggu koneksi Binance Testnet.' });
      }
    }
  }

  async function fetchLiveIntelForSymbol(symbol) {
    const baseCoin = String(symbol || '').replace(/USDT$/i, '').replace(/^1000/, '').toUpperCase();
    try {
      const [orderbook, snap] = await Promise.all([
        getRealAggregatedOrderbook(baseCoin, symbol, true),
        getRealMarketSnapshot(),
      ]);
      return { orderbook, snapshot: snap };
    } catch {
      return null;
    }
  }

  let lastAutomationPoll = -Infinity;
  async function scanEntries() {
    if (halted() || now() - lastAutomationPoll < AUTOMATION_POLL_MS) return;
    lastAutomationPoll = now();
    for (const rule of rules()) {
      if (!rule.enabled || !venues[rule.product] || halted()) continue;
      const items = orders();
      const state = current(items);
      const occupied = new Set([...state.positions,
        ...items.filter((order) => order.action === 'OPEN' && (WORKING.has(order.status) || order.fillsPending))].map(instrumentKey));
      if (!state.complete || state.realized <= -dailyLimit || occupied.size >= maxSlots) return;
      if (occupied.has(instrumentKey(rule))) continue;
      const { product, symbol, budget, protection } = rule;
      let evaluated = rule;
      try {
        const signal = closedCandleSignal(await venues[product].candles(symbol), now());
        if (halted()) return;
        if (!signal) {
          if (rule.error !== 'Candle tertutup belum siap.') saveRule({ ...rule, error: 'Candle tertutup belum siap.' });
          continue;
        }
        if (signal.closedAt <= Math.max(rule.activeSince, rule.lastCandle ?? 0)) {
          if (rule.error) saveRule({ ...rule, error: null });
          continue;
        }
        evaluated = { ...rule, lastCandle: signal.closedAt, error: null };
        saveRule(evaluated);
        if (!signal.side || (product === 'SPOT' && signal.side === 'SELL')) continue;

        // Multi-Pillar On-Chain + Live L2 Orderbook + Verified News Confluence Gate
        const intel =
          typeof intelProvider === 'function'
            ? await intelProvider(symbol, product)
            : typeof fetchImpl !== 'function'
              ? await fetchLiveIntelForSymbol(symbol)
              : null;
        if (intel) {
          const confluence = evaluateManagedEntryConfluence({
            side: signal.side,
            symbol,
            orderbook: intel.orderbook,
            snapshot: intel.snapshot,
          });
          evaluated = { ...evaluated, lastIntelSummary: confluence.summary };
          if (!confluence.allowed) {
            saveRule({ ...evaluated, error: confluence.reason });
            continue;
          }
          saveRule(evaluated);
        }

        const order = await submit({ id: stableId('signal', product, symbol, signal.closedAt), product, symbol,
          action: 'OPEN', side: signal.side, budget, protection }, { signalAt: signal.closedAt });
        if (order.status === 'REJECTED' && !halted()) saveRule({ ...evaluated, error: `Entry ditolak Binance (${order.venueCode}).` });
      } catch (error) {
        if (!halted()) saveRule({ ...evaluated, error: error.status ? error.message : 'Data Binance Testnet tidak tersedia.' });
      }
    }
  }

  function configureAutomation(body) {
    const { product, symbol, enabled, budget, protection } = body;
    requireValue(validInstrument(product, symbol) && typeof enabled === 'boolean' &&
      Object.keys(body).every((key) => ['product', 'symbol', 'enabled', 'budget', 'protection'].includes(key)), 400, 'Pengaturan otomasi tidak valid.');
    const existing = rules().find((rule) => instrumentKey(rule) === instrumentKey(body));
    if (!enabled) {
      if (existing) transaction(() => {
        saveRule({ ...existing, enabled: false, error: null });
        event(null, `AUTOMATION_PAUSED:${product}:${symbol}`);
      });
      return snapshot();
    }
    requireValue(!halted() && venues[product] && allowlisted.has(symbol), 423, 'Pasar ini belum bisa mengaktifkan otomasi.');
    requireValue(typeof budget === 'number' && Number.isFinite(budget) && budget > 0 && budget <= maxOrder, 400, 'Nilai entry otomasi di luar batas server.');
    const validated = normalizeProtection(protection);
    requireValue(existing?.enabled || rules().filter((rule) => rule.enabled).length < MAX_AUTOMATION_RULES, 409, 'Batas aturan otomasi aktif tercapai.');
    transaction(() => {
      saveRule({ product, symbol, enabled, budget, protection: validated, activeSince: now(), lastCandle: existing?.lastCandle });
      event(null, `AUTOMATION_ENABLED:${product}:${symbol}`);
    });
    return snapshot();
  }

  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    serial(async () => {
      await reconcile();
      await protectPositions();
      await scanEntries();
    }).catch(() => console.error('Fincept: siklus worker Testnet gagal.')).finally(() => { busy = false; });
  }, intervalMs);
  timer.unref();

  async function submit(body, context = {}) {
    const { id, product, action, symbol, side, budget } = body;
    requireValue(typeof id === 'string' && /^ft-[a-f0-9]{32}$/.test(id), 400, 'ID order tidak valid.');
    requireValue(validInstrument(product, symbol) && ['OPEN', 'CLOSE'].includes(action), 400, 'Instrumen atau tindakan tidak valid.');
    requireValue(action === 'OPEN' ? ['BUY', 'SELL'].includes(side) && typeof budget === 'number' &&
      Number.isFinite(budget) && budget > 0 : side === undefined && budget === undefined, 400, 'Parameter order tidak valid.');
    requireValue(action === 'OPEN' || body.protection === undefined, 400, 'Proteksi hanya diatur pada entry.');
    const protection = body.protection === undefined ? undefined : normalizeProtection(body.protection);
    // Keep idempotency for records created before protection was added.
    const signature = JSON.stringify([product, action, symbol, side, budget, ...(protection ? [protection] : [])]);
    const existing = find(id);
    if (existing) {
      requireValue(existing.signature === signature, 409, 'ID ini sudah dipakai untuk order lain.');
      return publicOrder(existing);
    }
    const venue = venues[product];
    requireValue(venue, 503, 'Kredensial Binance Testnet untuk produk ini belum tersedia.');
    const items = orders();
    const { positions, realized, complete } = current(items);
    const working = items.filter((o) => WORKING.has(o.status) || o.fillsPending);
    requireValue(!working.some((o) => o.product === product && o.symbol === symbol), 409, 'Masih ada order instrumen ini yang perlu direkonsiliasi.');
    const position = positions.find((p) => p.product === product && p.symbol === symbol);
    if (action === 'OPEN') {
      requireValue(allowlisted.has(symbol) && (product !== 'SPOT' || side === 'BUY'), 400, 'Pasar atau arah entry tidak diizinkan.');
      requireValue(!halted() && complete && realized > -dailyLimit, 423, 'Kontrol risiko sedang menahan entry.');
      const occupied = new Set([...positions, ...working.filter((o) => o.action === 'OPEN')].map(instrumentKey));
      requireValue(!position && budget <= maxOrder && occupied.size < maxSlots,
        409, 'Batas nilai order, posisi, atau slot tercapai.');
    } else {
      requireValue(position, 409, 'Tidak ada posisi dari fill yang dapat ditutup.');
    }

    const instrument = await venue.instrument(symbol);
    requireValue(instrument?.orderTypes?.includes(action === 'CLOSE' ? 'MARKET' : product === 'SPOT' ? 'LIMIT_MAKER' : 'LIMIT'),
      422, 'Instrumen atau jenis order tidak aktif di produk Binance Testnet ini.');
    const account = await venue.accountState(symbol, instrument.baseAsset);
    const tracked = position?.quantity ?? 0;
    if (product === 'PERP') {
      requireValue(Number.isFinite(account.signedQuantity) && Math.abs(account.signedQuantity - tracked) <= EPSILON,
        409, 'Posisi Futures bursa berbeda dari jurnal. Lakukan rekonsiliasi akun sebelum trading.');
    }
    const { bid, ask } = readQuote(await venue.book(symbol), symbol, now());
    if (action === 'OPEN') requireValue((ask - bid) / bid <= 0.01, 503, 'Spread entry terlalu lebar.');
    const orderSide = action === 'OPEN' ? side : tracked > 0 ? 'SELL' : 'BUY';
    const filter = (name) => instrument.filters?.find((item) => item.filterType === name);
    const lot = filter('LOT_SIZE');
    const marketLot = action === 'CLOSE' ? filter('MARKET_LOT_SIZE') : null;
    const lotSize = number(marketLot?.stepSize) > 0 ? marketLot : lot;
    const pxFilter = filter('PRICE_FILTER');
    const quotePrice = orderSide === 'BUY' ? (action === 'OPEN' ? bid : ask) : (action === 'OPEN' ? ask : bid);
    const price = action === 'OPEN' ? floorStep(quotePrice, pxFilter?.tickSize) : null;
    const quantity = floorStep(action === 'OPEN' ? budget / Number(price) : Math.abs(tracked), lotSize?.stepSize);
    const qty = Number(quantity);
    const notional = qty * (price === null ? quotePrice : Number(price));
    const notionalFilter = filter('NOTIONAL') || filter('MIN_NOTIONAL');
    const minNotional = Number(notionalFilter?.minNotional ?? notionalFilter?.notional ?? 0);
    const maxNotional = Number(notionalFilter?.maxNotional ?? Infinity);
    requireValue(qty > 0 && qty >= Math.max(number(lot?.minQty), Number(marketLot?.minQty ?? 0)) &&
      qty <= Math.min(number(lot?.maxQty), Number(marketLot?.maxQty) > 0 ? Number(marketLot.maxQty) : Infinity) &&
      (notional >= minNotional || (action === 'CLOSE' && product === 'PERP')) && notional <= maxNotional && (action === 'CLOSE' || (notional <= maxOrder + EPSILON &&
        Number(price) >= number(pxFilter?.minPrice) && Number(price) <= number(pxFilter?.maxPrice))),
      422, 'Nilai atau kuantitas di luar batas instrumen.');
    if (product === 'SPOT') {
      requireValue(action === 'OPEN' ? account.quoteFree >= notional : account.baseFree >= qty,
        409, 'Saldo Spot yang tersedia tidak mencukupi.');
    }
    if (action === 'OPEN') requireValue(!halted(), 423, 'Entry dihentikan sebelum order dikirim.');
    if (context.signalAt) requireValue(now() - context.signalAt < 60_000, 409, 'Sinyal entry sudah kedaluwarsa.');
    // Cancel-Before-Close: cancel any armed exchange-hosted protective stop before submitting CLOSE
    // (releases locked Spot inventory and prevents orphaned Futures conditional stops)
    if (action === 'CLOSE' && position?.entryOrderId && typeof venue.cancelStop === 'function') {
      const entryOrder = find(position.entryOrderId);
      if (entryOrder?.exchangeStopId) {
        await venue.cancelStop({ symbol, clientOrderId: entryOrder.exchangeStopId });
        save({ ...entryOrder, exchangeStopId: null }, 'EXCHANGE_STOP_CANCELED_BEFORE_CLOSE');
      }
    }
    // Sync Futures leverage before OPEN so orders never execute with random stale account leverage
    if (product === 'PERP' && action === 'OPEN' && typeof venue.setLeverage === 'function') {
      await venue.setLeverage(symbol, futuresLeverage);
    }
    let order = save({ id, signature, product, action, symbol, base: instrument.baseAsset, side: orderSide,
      price, quantity, status: 'SUBMITTING', executed: 0, fills: [], fillsPending: false, createdAt: now(),
      ...(protection ? { protection } : {}),
      ...(context.signalAt ? { source: 'AUTOMATION', signalAt: context.signalAt, expiresAt: now() + ENTRY_LIFETIME_MS } : {}),
      ...(context.trigger ? { source: 'AUTOMATION', trigger: context.trigger, entryOrderId: position.entryOrderId } : {}),
    }, 'INTENT_RECORDED');
    try {
      order = applyVenue(order, await venue.place(order));
    } catch (error) {
      if (error instanceof VenueError && error.status >= 400 && error.status < 500 && EXPLICIT_REJECT_CODES.has(error.code)) {
        return publicOrder(save({ ...order, status: 'REJECTED', venueCode: error.code }, 'SUBMIT_REJECTED'));
      }
      // A failed response is ambiguous. Recover by querying the original client order ID, never by resubmitting.
      return publicOrder(save({ ...order, status: 'UNCONFIRMED', syncError: 'Menunggu konfirmasi Binance.' }, 'SUBMIT_UNCONFIRMED'));
    }
    return publicOrder(order);
  }

  let rateStart = now();
  let mutations = 0;
  return {
    async route(path, method, readBody, authorization) {
      if (typeof authorization !== 'string' || authorization.length > 140 ||
          !authorization.startsWith('Bearer ') || !timingSafeEqual(hash(authorization.slice(7)), tokenHash)) {
        throw fail(401, 'Token trading diperlukan.');
      }
      if (path === '/api/trading/testnet' && method === 'GET') return snapshot();
      if (method !== 'POST') throw fail(404, 'Rute trading tidak tersedia.');
      if (now() - rateStart >= 60_000) { rateStart = now(); mutations = 0; }
      // The kill switch must remain usable even when the order submission budget is exhausted.
      if (path !== '/api/trading/testnet/halt' && ++mutations > 20) throw fail(429, 'Batas permintaan trading tercapai.');
      const body = await readBody();
      requireValue(body && typeof body === 'object' && !Array.isArray(body), 400, 'Body JSON tidak valid.');
      if (path === '/api/trading/testnet/halt') {
        transaction(() => {
          db.prepare("INSERT OR REPLACE INTO config VALUES ('halted', '1')").run();
          for (const rule of rules()) if (rule.enabled) saveRule({ ...rule, enabled: false });
          event(null, 'ENTRIES_HALTED');
        });
        return snapshot();
      }
      return serial(async () => {
        if (path === '/api/trading/testnet/automation') return configureAutomation(body);
        if (path === '/api/trading/testnet/orders') {
          requireValue(Object.keys(body).every((key) => ['id', 'product', 'action', 'symbol', 'side', 'budget', 'protection'].includes(key)),
            400, 'Field order tidak didukung.');
          return { order: await submit(body) };
        }
        if (path === '/api/trading/testnet/resume') {
          const items = orders();
          const state = current(items);
          requireValue(halted() && state.complete && state.realized > -dailyLimit &&
            !items.some((order) => WORKING.has(order.status) || order.fillsPending),
          409, 'Selesaikan rekonsiliasi order dan periksa batas rugi sebelum mengaktifkan entry kembali.');
          transaction(() => {
            db.prepare("UPDATE config SET value = '0' WHERE key = 'halted'").run();
            event(null, 'ENTRIES_RESUMED');
          });
          return snapshot();
        }
        if (path === '/api/trading/testnet/cancel') {
          const order = typeof body.id === 'string' ? find(body.id) : null;
          requireValue(order?.action === 'OPEN' && order.venueId && WORKING.has(order.status), 409, 'Order entry belum dapat dibatalkan.');
          return { order: publicOrder(await cancel(order)) };
        }
        throw fail(404, 'Rute trading tidak tersedia.');
      });
    },
    async close() {
      clearInterval(timer);
      await tail;
      db.close();
      lock.close();
    },
  };
}
