import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleGatewayApiRoute } from './backend/exchangeGateway.mjs';
import {
  HttpRequestError,
  MAX_JSON_BODY_BYTES,
  readBoundedJsonBody,
  resolveCorsOrigin,
  resolveSafeStaticFile,
} from './backend/httpSecurity.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DIST_DIR = path.resolve(__dirname, 'dist');
const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '127.0.0.1';

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

const server = http.createServer(async (req, res) => {
  const originHeader = req.headers.origin;
  const allowedOrigin = resolveCorsOrigin(originHeader, undefined, req.headers.host);
  res.setHeader('Vary', 'Origin');
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  if (req.method === 'OPTIONS') {
    if (originHeader && !allowedOrigin) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Origin not allowed by CORS policy' }));
      return;
    }
    res.writeHead(204);
    res.end();
    return;
  }

  const urlObj = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);

  // 1. Online Backend API Routes (/api/*)
  if (urlObj.pathname.startsWith('/api/')) {
    if (originHeader && !allowedOrigin) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ ok: false, error: 'Cross-origin request blocked by CORS allowlist' }));
      return;
    }
    try {
      const result = await handleGatewayApiRoute(
        urlObj.pathname,
        urlObj.searchParams,
        req.method,
        () => readBoundedJsonBody(req, MAX_JSON_BODY_BYTES),
        'PROD_GATEWAY'
      );
      if (result.contentType) {
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.writeHead(result.status);
        res.end(result.payload);
        return;
      }
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(result.status);
      res.end(JSON.stringify(result.payload));
      return;
    } catch (err) {
      const status = err instanceof HttpRequestError ? err.status : 500;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.writeHead(status);
      res.end(
        JSON.stringify({
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        })
      );
      return;
    }
  }

  // 2. Serve Compiled Frontend Static Files (dist/) with canonical path traversal containment
  const safePath = resolveSafeStaticFile(DIST_DIR, urlObj.pathname);
  if (!safePath.ok) {
    res.writeHead(safePath.status, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end(safePath.error);
    return;
  }
  let filePath = safePath.filePath;
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    filePath = path.join(DIST_DIR, 'index.html');
  }

  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).toLowerCase();
    res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
    const stream = fs.createReadStream(filePath);
    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      }
      res.end('Error reading static asset.');
    });
    stream.pipe(res);
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Frontend build not found. Run "npm run build" first.');
  }
});

server.listen(PORT, HOST, () => {
  console.log(
    `[Fincept Online Cloud Server] Running on http://${HOST}:${PORT} (Serving Frontend + On-Chain/CEX API Gateway)`
  );
});

