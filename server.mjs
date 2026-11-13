import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleGatewayApiRoute } from './backend/exchangeGateway.mjs';

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
    try {
      const result = await handleGatewayApiRoute(
        urlObj.pathname,
        urlObj.searchParams,
        req.method,
        () => readJsonBody(req),
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
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
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

