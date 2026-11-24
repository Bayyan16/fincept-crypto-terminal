import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import path from 'node:path';
import {
  HttpRequestError,
  MAX_JSON_BODY_BYTES,
  readBoundedJsonBody,
  resolveCorsOrigin,
  resolveSafeStaticFile,
} from '../backend/httpSecurity.mjs';

test('Issue #11 NEGATIVE: Path traversal via ../, %2e%2e, and Windows backslash is blocked', () => {
  const distDir = path.resolve('dist');
  assert.equal(resolveSafeStaticFile(distDir, '/../../package.json').ok, false);
  assert.equal(resolveSafeStaticFile(distDir, '/%2e%2e/%2e%2e/server.mjs').ok, false);
  assert.equal(resolveSafeStaticFile(distDir, '/..\\server.mjs').ok, false);
  assert.equal(resolveSafeStaticFile(distDir, '/assets/app.js\0.png').ok, false);
});

test('Issue #11 POSITIVE: Normal static paths resolve strictly inside distDir', () => {
  const distDir = path.resolve('dist');
  const rootIdx = resolveSafeStaticFile(distDir, '/');
  assert.equal(rootIdx.ok, true);
  assert.equal(rootIdx.filePath, path.join(distDir, 'index.html'));

  const asset = resolveSafeStaticFile(distDir, '/assets/index.js');
  assert.equal(asset.ok, true);
  assert.ok(asset.filePath.startsWith(distDir + path.sep));
});

test('Issue #11 NEGATIVE/POSITIVE: CORS allowlist blocks external sites & wildcard while allowing localhost', () => {
  assert.equal(resolveCorsOrigin('https://evil.example.com'), null);
  assert.equal(resolveCorsOrigin('https://evil.example.com', '*'), null);
  assert.equal(resolveCorsOrigin('http://localhost:5173'), 'http://localhost:5173');
  assert.equal(resolveCorsOrigin('http://127.0.0.1:5174'), 'http://127.0.0.1:5174');
  assert.equal(
    resolveCorsOrigin('https://terminal.mycorp.io', 'https://terminal.mycorp.io'),
    'https://terminal.mycorp.io'
  );
  // Same-origin frontend on custom PORT or HTTPS domain is allowed when matching request Host
  assert.equal(
    resolveCorsOrigin('http://127.0.0.1:18080', '', '127.0.0.1:18080'),
    'http://127.0.0.1:18080'
  );
  assert.equal(
    resolveCorsOrigin('https://app.myterminal.io', '', 'app.myterminal.io'),
    'https://app.myterminal.io'
  );
  // Cross-origin attacker still blocked even when custom requestHost is set
  assert.equal(resolveCorsOrigin('https://evil.example.com', '', '127.0.0.1:18080'), null);
});

test('Issue #11 NEGATIVE: Oversized body returns 413 and malformed JSON returns 400', async () => {
  const bigReq = new EventEmitter();
  const bigPromise = readBoundedJsonBody(bigReq, 64);
  bigReq.emit('data', Buffer.alloc(100, 'a'));
  await assert.rejects(bigPromise, (err) => err instanceof HttpRequestError && err.status === 413);

  const badJsonReq = new EventEmitter();
  const badPromise = readBoundedJsonBody(badJsonReq, MAX_JSON_BODY_BYTES);
  badJsonReq.emit('data', Buffer.from('{bad-json'));
  badJsonReq.emit('end');
  await assert.rejects(badPromise, (err) => err instanceof HttpRequestError && err.status === 400);
});
