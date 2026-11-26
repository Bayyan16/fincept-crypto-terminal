import { HttpRequestError, readBoundedJsonBody } from './httpSecurity.mjs';

const testnetRoot = '/api/trading/testnet';
const isUnder = (pathname, root) => pathname === root || pathname.startsWith(`${root}/`);

function send(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.statusCode = status;
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) {
    throw new HttpRequestError(415, 'Content-Type JSON diperlukan.');
  }
  return readBoundedJsonBody(req, 8192);
}

export async function createManagedTestnetGateway(trading) {
  if (trading === undefined && process.env.FINCEPT_ENABLE_BINANCE_TESTNET === '1') {
    const { createTradingJournal } = await import('./tradingJournal.mjs');
    trading = createTradingJournal();
  }

  async function middleware(req, res, next) {
    let pathname;
    try { pathname = new URL(req.url || '/', 'http://localhost').pathname; }
    catch { return send(res, 400, { ok: false, error: 'URL tidak valid.' }); }
    if (trading && (isUnder(pathname, '/api/execute') || isUnder(pathname, '/api/account'))) {
      return send(res, 410, { ok: false, error: 'Gateway ini dikhususkan untuk Binance Testnet terkelola.' });
    }
    if (!isUnder(pathname, '/api/trading')) return next();
    const origin = req.headers.origin;
    try {
      if (origin) {
        const parsed = new URL(origin);
        if (!['http:', 'https:'].includes(parsed.protocol) || parsed.host.toLowerCase() !== req.headers.host?.toLowerCase()) {
          return send(res, 403, { ok: false, error: 'Akses lintas origin tidak diizinkan.' });
        }
      }
      if (!isUnder(pathname, testnetRoot)) return send(res, 403, { ok: false, error: 'Eksekusi Mainnet tidak tersedia di gateway terkelola.' });
      if (!trading) return send(res, 503, { ok: false, error: 'Binance Testnet terkelola belum diaktifkan di server.' });
      const result = await trading.route(pathname, req.method, () => readBody(req), req.headers.authorization);
      return send(res, 200, { ok: true, ...result });
    } catch (error) {
      const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 503;
      return send(res, status, { ok: false, error: status === 503 ? 'Layanan Binance Testnet belum tersedia.' : error.message });
    }
  }

  return { middleware, close: () => trading?.close() };
}
