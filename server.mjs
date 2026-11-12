import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getRealCandles,
  getRealMarketSnapshot,
  getRealAggregatedOrderbook,
  verifyAndFetchAccountBalance,
  executeRealExchangeOrder,
} from './backend/exchangeGateway.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.join(__dirname, 'dist');
const PORT = Number(process.env.PORT || 8080);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  // Enable CORS so Frontend can also be hosted on a separate domain/CDN if desired
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // 1. Online Backend API Routes (/api/*)
  if (urlObj.pathname.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    try {
      if (urlObj.pathname === '/api/health' && req.method === 'GET') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            ok: true,
            service: 'fincept-whale-quant-online-gateway',
            timestamp: new Date().toISOString(),
          })
        );
        return;
      }

      if (urlObj.pathname === '/api/live/snapshot' && req.method === 'GET') {
        const snap = await getRealMarketSnapshot();
        res.writeHead(200);
        res.end(JSON.stringify(snap));
        return;
      }

      if (urlObj.pathname === '/api/live/candles' && req.method === 'GET') {
        const hlCoin = urlObj.searchParams.get('hlCoin') || 'BTC';
        const binanceSymbol = urlObj.searchParams.get('binanceSymbol') || 'BTCUSDT';
        const interval = urlObj.searchParams.get('interval') || '15m';
        const limit = Number(urlObj.searchParams.get('limit') || '140');
        const candleRes = await getRealCandles(hlCoin, binanceSymbol, interval, limit);
        res.writeHead(200);
        res.end(JSON.stringify(candleRes));
        return;
      }

      if (urlObj.pathname === '/api/live/orderbook' && req.method === 'GET') {
        const hlCoin = urlObj.searchParams.get('hlCoin') || 'BTC';
        const binanceSymbol = urlObj.searchParams.get('binanceSymbol') || 'BTCUSDT';
        const book = await getRealAggregatedOrderbook(hlCoin, binanceSymbol);
        res.writeHead(200);
        res.end(JSON.stringify(book));
        return;
      }

      if (urlObj.pathname === '/api/account/verify' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = await verifyAndFetchAccountBalance(body);
        res.writeHead(200);
        res.end(JSON.stringify(result));
        return;
      }

      if (urlObj.pathname === '/api/execute/order' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const result = await executeRealExchangeOrder(body);
        res.writeHead(200);
        res.end(JSON.stringify(result));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ ok: false, error: 'API Endpoint not found' }));
      return;
    } catch (err) {
      res.writeHead(500);
      res.end(
        JSON.stringify({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      );
      return;
    }
  }

  // 2. Serve Compiled Frontend Static Files (dist/) for Online Cloud Deployment
  let filePath = path.join(DIST_DIR, urlObj.pathname === '/' ? 'index.html' : urlObj.pathname);
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Frontend build not found. Run "npm run build" first.');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(
    `[Fincept Online Cloud Server] Running on http://0.0.0.0:${PORT} (Serving Frontend + On-Chain/CEX API Gateway)`
  );
});

