import path from 'node:path';

export const MAX_JSON_BODY_BYTES = 256 * 1024; // 256 KB

const DEFAULT_ALLOWED_ORIGINS = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
]);

export class HttpRequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Resolves whether an Origin header is permitted by the strict CORS allowlist (never '*'),
 * including same-origin requests matching the server's active Host header (custom PORT or HTTPS reverse proxy).
 */
export function resolveCorsOrigin(
  originHeader,
  extraOriginsCsv = process.env.FINCEPT_CORS_ORIGINS || '',
  requestHost = ''
) {
  const origin = String(originHeader || '').trim();
  if (!origin) return null;
  if (DEFAULT_ALLOWED_ORIGINS.has(origin)) return origin;

  // Same-origin allowance for the served frontend on configured PORT or HTTPS domain
  const normalizedHost = String(requestHost || '').trim().toLowerCase();
  if (normalizedHost) {
    try {
      const parsed = new URL(origin);
      if (
        (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
        parsed.host.toLowerCase() === normalizedHost
      ) {
        return origin;
      }
    } catch {
      return null;
    }
  }

  if (extraOriginsCsv) {
    for (const raw of extraOriginsCsv.split(',')) {
      const candidate = raw.trim();
      if (candidate && candidate !== '*' && candidate === origin) {
        return origin;
      }
    }
  }
  return null;
}

/**
 * Resolves a static asset path strictly contained within `distDir` (blocks ../, %2e%2e, and Windows backslash traversal).
 */
export function resolveSafeStaticFile(distDir, rawPathname) {
  const root = path.resolve(distDir);
  let decoded;
  try {
    decoded = decodeURIComponent(String(rawPathname || '/'));
  } catch {
    return { ok: false, status: 400, error: 'Malformed URL path' };
  }
  if (decoded.includes('\0') || decoded.includes('\\')) {
    return { ok: false, status: 403, error: 'Forbidden path characters' };
  }
  if (decoded.split('/').some((seg) => seg === '..')) {
    return { ok: false, status: 403, error: 'Path traversal blocked' };
  }
  const normalizedPosix = path.posix.normalize(decoded);
  if (normalizedPosix.startsWith('..') || normalizedPosix.includes('/../')) {
    return { ok: false, status: 403, error: 'Path traversal blocked' };
  }
  const rel = normalizedPosix === '/' ? 'index.html' : normalizedPosix.replace(/^\/+/, '');
  const resolved = path.resolve(root, rel);
  const rootPrefix = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (resolved !== root && !resolved.startsWith(rootPrefix)) {
    return { ok: false, status: 403, error: 'Path outside static root' };
  }
  return { ok: true, filePath: resolved };
}

/**
 * Reads and parses a JSON request body with strict byte-length limit (413) and parse validation (400).
 */
export function readBoundedJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let totalBytes = 0;
    const chunks = [];
    let aborted = false;

    req.on('data', (chunk) => {
      if (aborted) return;
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;
      if (totalBytes > maxBytes) {
        aborted = true;
        reject(new HttpRequestError(413, `Request payload exceeds ${maxBytes} bytes limit`));
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      if (aborted) return;
      const text = Buffer.concat(chunks).toString('utf8').trim();
      if (!text) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          reject(new HttpRequestError(400, 'JSON request body must be a JSON object'));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new HttpRequestError(400, 'Malformed JSON request body'));
      }
    });
    req.on('error', (err) => {
      if (!aborted) reject(err);
    });
  });
}
