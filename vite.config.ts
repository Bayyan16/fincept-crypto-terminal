import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import {
  getRealCandles,
  getRealMarketSnapshot,
  getRealAggregatedOrderbook,
  verifyAndFetchAccountBalance,
  executeRealExchangeOrder,
} from './backend/exchangeGateway.mjs';

function readJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: any) => {
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

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'fincept-real-money-gateway',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (!req.url || !req.url.startsWith('/api/')) {
            return next();
          }

          res.setHeader('Content-Type', 'application/json');

          try {
            const urlObj = new URL(req.url, 'http://localhost:5173');

            if (urlObj.pathname === '/api/health' && req.method === 'GET') {
              res.statusCode = 200;
              res.end(
                JSON.stringify({
                  ok: true,
                  service: 'fincept-whale-quant-terminal',
                  mode: 'VITE_DEV_GATEWAY',
                  timestamp: new Date().toISOString(),
                })
              );
              return;
            }

            if (urlObj.pathname === '/api/live/snapshot' && req.method === 'GET') {
              const snap = await getRealMarketSnapshot();
              res.statusCode = 200;
              res.end(JSON.stringify(snap));
              return;
            }

            if (urlObj.pathname === '/api/live/candles' && req.method === 'GET') {
              const hlCoin = urlObj.searchParams.get('hlCoin') || 'BTC';
              const binanceSymbol = urlObj.searchParams.get('binanceSymbol') || 'BTCUSDT';
              const interval = urlObj.searchParams.get('interval') || '15m';
              const limit = Number(urlObj.searchParams.get('limit') || '140');
              const candleRes = await getRealCandles(hlCoin, binanceSymbol, interval, limit);
              res.statusCode = 200;
              res.end(JSON.stringify(candleRes));
              return;
            }

            if (urlObj.pathname === '/api/live/orderbook' && req.method === 'GET') {
              const hlCoin = urlObj.searchParams.get('hlCoin') || 'BTC';
              const binanceSymbol = urlObj.searchParams.get('binanceSymbol') || 'BTCUSDT';
              const book = await getRealAggregatedOrderbook(hlCoin, binanceSymbol);
              res.statusCode = 200;
              res.end(JSON.stringify(book));
              return;
            }

            if (urlObj.pathname === '/api/account/verify' && req.method === 'POST') {
              const body = await readJsonBody(req);
              const result = await verifyAndFetchAccountBalance(body);
              res.statusCode = 200;
              res.end(JSON.stringify(result));
              return;
            }

            if (urlObj.pathname === '/api/execute/order' && req.method === 'POST') {
              const body = await readJsonBody(req);
              const result = await executeRealExchangeOrder(body);
              res.statusCode = 200;
              res.end(JSON.stringify(result));
              return;
            }

            res.statusCode = 404;
            res.end(JSON.stringify({ ok: false, error: 'Endpoint not found' }));
          } catch (err: any) {
            res.statusCode = 500;
            res.end(
              JSON.stringify({
                ok: false,
                error: err instanceof Error ? err.message : String(err),
              })
            );
          }
        });
      },
    },
  ],
  server: {
    port: 5173,
    host: true,
  },
});
