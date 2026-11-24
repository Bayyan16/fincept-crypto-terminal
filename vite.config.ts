import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleGatewayApiRoute } from './backend/exchangeGateway.mjs';
import { MAX_JSON_BODY_BYTES, resolveCorsOrigin } from './backend/httpSecurity.mjs';

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

          const originHeader = req.headers.origin;
          if (originHeader && !resolveCorsOrigin(originHeader, undefined, req.headers.host)) {
            res.setHeader('Content-Type', 'application/json');
            res.statusCode = 403;
            res.end(JSON.stringify({ ok: false, error: 'Cross-origin request blocked by CORS allowlist' }));
            return;
          }

          try {
            // If production gateway (8080) is running locally, share its warm single-instance cache & rate-limit budget cleanly;
            // otherwise seamlessly fall back to in-process handleGatewayApiRoute.
            const rawBody =
              req.method && req.method !== 'GET' && req.method !== 'HEAD'
                ? await new Promise<string>((resolve, reject) => {
                    let totalBytes = 0;
                    const chunks: Buffer[] = [];
                    let aborted = false;
                    req.on('data', (c: any) => {
                      if (aborted) return;
                      const buf = Buffer.isBuffer(c) ? c : Buffer.from(c);
                      totalBytes += buf.length;
                      if (totalBytes > MAX_JSON_BODY_BYTES) {
                        aborted = true;
                        const err: any = new Error(`Request payload exceeds ${MAX_JSON_BODY_BYTES} bytes limit`);
                        err.status = 413;
                        reject(err);
                        return;
                      }
                      chunks.push(buf);
                    });
                    req.on('end', () => {
                      if (!aborted) resolve(Buffer.concat(chunks).toString('utf8'));
                    });
                    req.on('error', reject);
                  })
                : '';

            let parsedBody: any = {};
            if (rawBody.trim()) {
              try {
                parsedBody = JSON.parse(rawBody);
                if (!parsedBody || typeof parsedBody !== 'object' || Array.isArray(parsedBody)) {
                  res.setHeader('Content-Type', 'application/json');
                  res.statusCode = 400;
                  res.end(JSON.stringify({ ok: false, error: 'JSON request body must be a JSON object' }));
                  return;
                }
              } catch {
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 400;
                res.end(JSON.stringify({ ok: false, error: 'Malformed JSON request body' }));
                return;
              }
            }

            try {
              const controller = new AbortController();
              const timer = setTimeout(() => controller.abort(), 20000);
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
            } catch (proxyErr: any) {
              // Only fall back to in-process gateway when :8080 is unreachable (not when an order/request timed out mid-flight!)
              const errCode = proxyErr?.cause?.code || proxyErr?.code || '';
              if (proxyErr?.name === 'AbortError') {
                res.setHeader('Content-Type', 'application/json');
                res.statusCode = 504;
                res.end(JSON.stringify({ ok: false, error: 'Upstream gateway timeout (port 8080)' }));
                return;
              }
              if (errCode && !['ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'].includes(errCode)) {
                throw proxyErr;
              }
              // 8080 not running -> execute in-process gateway cleanly
            }

            const urlObj = new URL(req.url, 'http://localhost:5173');
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
            res.statusCode = Number(err?.status) || 500;
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
    host: process.env.FINCEPT_DEV_HOST || '127.0.0.1',
    watch: {
      // Editor atomic-save tmp dirs (e.g. .index.css.<pid>.<rand>.tmpdir) can trip
      // chokidar's Windows watcher with EBUSY; ignore them so the dev server
      // never crashes on hot-reload.
      ignored: ['**/*.tmp', '**/*.tmpdir/**', '**/artifacts/**', '**/playwright-report/**', '**/test-results/**', '**/dist/**', '**/.git/**'],
    },
  },
});
