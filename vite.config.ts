import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleGatewayApiRoute } from './backend/exchangeGateway.mjs';

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

          try {
            // If production gateway (8080) is running locally, share its warm single-instance cache & rate-limit budget cleanly;
            // otherwise seamlessly fall back to in-process handleGatewayApiRoute.
            const rawBody =
              req.method && req.method !== 'GET' && req.method !== 'HEAD'
                ? await new Promise<string>((resolve) => {
                    let s = '';
                    req.on('data', (c: any) => {
                      s += c;
                    });
                    req.on('end', () => resolve(s));
                  })
                : '';

            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 9000);
              const proxyRes = await fetch(`http://127.0.0.1:8080${req.url}`, {
                method: req.method || 'GET',
                headers: { 'Content-Type': 'application/json' },
                body: rawBody || undefined,
                signal: controller.signal,
              });
              clearTimeout(timer);
              const ct = proxyRes.headers.get('content-type') || 'application/json';
              const cc = proxyRes.headers.get('cache-control');
              res.setHeader('Content-Type', ct);
              if (cc) res.setHeader('Cache-Control', cc);
              res.statusCode = proxyRes.status;
              const buf = Buffer.from(await proxyRes.arrayBuffer());
              res.end(buf);
              return;
            } catch {
              // 8080 not running -> execute in-process gateway cleanly
            }

            const urlObj = new URL(req.url, 'http://localhost:5173');
            const parsedBody = rawBody ? JSON.parse(rawBody) : {};
            const result: any = await handleGatewayApiRoute(
              urlObj.pathname,
              urlObj.searchParams,
              req.method || 'GET',
              async () => parsedBody,
              'VITE_DEV_GATEWAY'
            );
            if (result.contentType) {
              res.setHeader('Content-Type', result.contentType);
              res.setHeader('Cache-Control', 'public, max-age=3600');
              res.statusCode = result.status;
              res.end(result.payload);
              return;
            }
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = result.status;
            res.end(JSON.stringify(result.payload));
            return;
          } catch (err: any) {
            res.setHeader('Content-Type', 'application/json');
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
