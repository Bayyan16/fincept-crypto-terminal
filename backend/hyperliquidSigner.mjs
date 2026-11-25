import crypto from 'node:crypto';
import { hashHyperliquidTypedData, keccak256Hex } from './hyperliquidProtocol.mjs';

/**
 * Pure-JS Zero-Dependency secp256k1 ECDSA Signer (RFC 6979 Deterministic k + EIP-2 Low-s)
 * for Server-Side Unattended Hyperliquid L1 Agent Key Signing.
 *
 * Strictly server-side (uses Node `node:crypto` HMAC-SHA256 for RFC 6979).
 */

const SECP256K1_P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const SECP256K1_N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const SECP256K1_HALF_N = SECP256K1_N >> 1n;
const SECP256K1_GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const SECP256K1_GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;
const SECP256K1_G = { x: SECP256K1_GX, y: SECP256K1_GY };

const PRIVATE_KEY_RE = /^(0x)?[a-fA-F0-9]{64}$/;

function mod(a, m) {
  const r = a % m;
  return r >= 0n ? r : r + m;
}

function modInv(a, m) {
  let t = 0n;
  let newT = 1n;
  let r = m;
  let newR = mod(a, m);
  while (newR !== 0n) {
    const q = r / newR;
    [t, newT] = [newT, t - q * newT];
    [r, newR] = [newR, r - q * newR];
  }
  if (r > 1n) throw new Error('Modular inverse does not exist');
  return t < 0n ? t + m : t;
}

function modPow(base, exp, m) {
  let result = 1n;
  let b = mod(base, m);
  let e = exp;
  while (e > 0n) {
    if (e & 1n) result = mod(result * b, m);
    b = mod(b * b, m);
    e >>= 1n;
  }
  return result;
}

function pointAdd(P, Q) {
  if (!P) return Q;
  if (!Q) return P;
  if (P.x === Q.x) {
    if (mod(P.y + Q.y, SECP256K1_P) === 0n) return null;
    // Point doubling: lambda = (3 * x^2) / (2 * y)
    const lam = mod(3n * P.x * P.x * modInv(2n * P.y, SECP256K1_P), SECP256K1_P);
    const x3 = mod(lam * lam - 2n * P.x, SECP256K1_P);
    const y3 = mod(lam * (P.x - x3) - P.y, SECP256K1_P);
    return { x: x3, y: y3 };
  }
  const lam = mod((Q.y - P.y) * modInv(Q.x - P.x, SECP256K1_P), SECP256K1_P);
  const x3 = mod(lam * lam - P.x - Q.x, SECP256K1_P);
  const y3 = mod(lam * (P.x - x3) - P.y, SECP256K1_P);
  return { x: x3, y: y3 };
}

function pointMul(scalar, P = SECP256K1_G) {
  let k = mod(scalar, SECP256K1_N);
  if (k === 0n) return null;
  let result = null;
  let addend = P;
  while (k > 0n) {
    if (k & 1n) result = pointAdd(result, addend);
    addend = pointAdd(addend, addend);
    k >>= 1n;
  }
  return result;
}

function bigIntToBytes32(val) {
  const hex = val.toString(16).padStart(64, '0');
  return Buffer.from(hex, 'hex');
}

function bytesToBigInt(buf) {
  return BigInt('0x' + Buffer.from(buf).toString('hex'));
}

function hmacSha256(key, data) {
  return crypto.createHmac('sha256', key).update(data).digest();
}

/**
 * RFC 6979 deterministic nonce generator for secp256k1 with SHA-256.
 */
function* rfc6979NonceGenerator(privateKeyBigInt, msgHashBytes32) {
  const x = bigIntToBytes32(privateKeyBigInt);
  let h1Int = bytesToBigInt(msgHashBytes32);
  if (h1Int >= SECP256K1_N) h1Int -= SECP256K1_N;
  const h1 = bigIntToBytes32(h1Int);

  let V = Buffer.alloc(32, 0x01);
  let K = Buffer.alloc(32, 0x00);

  K = hmacSha256(K, Buffer.concat([V, Buffer.from([0x00]), x, h1]));
  V = hmacSha256(K, V);
  K = hmacSha256(K, Buffer.concat([V, Buffer.from([0x01]), x, h1]));
  V = hmacSha256(K, V);

  for (let i = 0; i < 1000; i++) {
    V = hmacSha256(K, V);
    const candidate = bytesToBigInt(V);
    if (candidate >= 1n && candidate < SECP256K1_N) {
      yield candidate;
    }
    K = hmacSha256(K, Buffer.concat([V, Buffer.from([0x00])]));
    V = hmacSha256(K, V);
  }
  throw new Error('RFC 6979 failed to produce a valid nonce');
}

function parsePrivateKey(privateKeyHex) {
  const trimmed = String(privateKeyHex || '').trim();
  if (!PRIVATE_KEY_RE.test(trimmed)) {
    throw new Error('Hyperliquid Agent Private Key tidak valid (wajib 64 karakter hex 32-byte).');
  }
  const clean = trimmed.replace(/^0x/i, '');
  const d = BigInt('0x' + clean);
  if (d <= 0n || d >= SECP256K1_N) {
    throw new Error('Hyperliquid Agent Private Key di luar rentang kurva secp256k1.');
  }
  return d;
}

function pubPointToEvmAddress(Q) {
  if (!Q) throw new Error('Invalid public key point');
  const pub64 = Buffer.concat([bigIntToBytes32(Q.x), bigIntToBytes32(Q.y)]);
  const hash = keccak256Hex(new Uint8Array(pub64));
  return '0x' + hash.slice(-40).toLowerCase();
}

/**
 * Derives the lowercase 0x-prefixed Ethereum / Hyperliquid address for a 32-byte private key.
 */
export function deriveEvmAddressFromPrivateKey(privateKeyHex) {
  const d = parsePrivateKey(privateKeyHex);
  const Q = pointMul(d, SECP256K1_G);
  return pubPointToEvmAddress(Q);
}

/**
 * Signs a 32-byte hash (`0x`-prefixed hex) using secp256k1 ECDSA with RFC 6979 deterministic k
 * and EIP-2 low-s canonicalization.
 */
export function signSecp256k1Digest(digestHex, privateKeyHex) {
  const d = parsePrivateKey(privateKeyHex);
  const cleanDigest = String(digestHex || '').replace(/^0x/i, '');
  if (!/^[a-fA-F0-9]{64}$/.test(cleanDigest)) {
    throw new Error('Digest hash wajib 32-byte hex.');
  }
  const msgBytes = Buffer.from(cleanDigest, 'hex');
  const z = BigInt('0x' + cleanDigest);

  for (const k of rfc6979NonceGenerator(d, msgBytes)) {
    const R = pointMul(k, SECP256K1_G);
    if (!R) continue;
    const r = mod(R.x, SECP256K1_N);
    if (r === 0n) continue;
    const kInv = modInv(k, SECP256K1_N);
    let s = mod(kInv * (z + r * d), SECP256K1_N);
    if (s === 0n) continue;
    let recId = Number(R.y & 1n) | (R.x >= SECP256K1_N ? 2 : 0);
    if (s > SECP256K1_HALF_N) {
      s = SECP256K1_N - s;
      recId ^= 1;
    }
    const v = 27 + recId;
    const rHex = '0x' + r.toString(16).padStart(64, '0');
    const sHex = '0x' + s.toString(16).padStart(64, '0');
    const rawSignature = '0x' + rHex.slice(2) + sHex.slice(2) + v.toString(16).padStart(2, '0');
    return {
      r: rHex,
      s: sHex,
      v,
      rawSignature,
      signer: deriveEvmAddressFromPrivateKey(privateKeyHex),
    };
  }
  throw new Error('secp256k1 signing failed');
}

/**
 * Recovers the Ethereum address from a 32-byte digest and `{ r, s, v }` signature (ecrecover).
 * Useful for mathematical verification of signatures in unit tests and pre-flight checks.
 */
export function recoverEvmAddressFromSignature(digestHex, { r, s, v }) {
  const cleanDigest = String(digestHex || '').replace(/^0x/i, '');
  const z = BigInt('0x' + cleanDigest);
  const rInt = BigInt(r);
  const sInt = BigInt(s);
  const recId = Number(v) >= 27 ? Number(v) - 27 : Number(v);
  if (rInt <= 0n || rInt >= SECP256K1_N || sInt <= 0n || sInt >= SECP256K1_N || recId < 0 || recId > 3) {
    throw new Error('Invalid ECDSA signature components');
  }
  const x = rInt + (recId >= 2 ? SECP256K1_N : 0n);
  if (x >= SECP256K1_P) throw new Error('Invalid R.x coordinate');
  // y^2 = x^3 + 7 (mod p); since p % 4 == 3, sqrt(y2) = y2^((p+1)/4) mod p
  const y2 = mod(modPow(x, 3n, SECP256K1_P) + 7n, SECP256K1_P);
  let y = modPow(y2, (SECP256K1_P + 1n) >> 2n, SECP256K1_P);
  if ((y & 1n) !== BigInt(recId & 1)) {
    y = SECP256K1_P - y;
  }
  const R = { x, y };
  const rInv = modInv(rInt, SECP256K1_N);
  const u1 = mod(-z * rInv, SECP256K1_N);
  const u2 = mod(sInt * rInv, SECP256K1_N);
  const Q = pointAdd(pointMul(u1, SECP256K1_G), pointMul(u2, R));
  return pubPointToEvmAddress(Q);
}

/**
 * Signs any Hyperliquid L1 action (`order`, `updateLeverage`, `cancel`) with an Agent Private Key
 * using official Phantom Agent EIP-712 typed data (chainId: 1337, source: 'a' Mainnet / 'b' Testnet).
 */
export function signHyperliquidActionWithPrivateKey({
  action,
  nonce,
  privateKey,
  useTestnet = false,
  vaultAddress = null,
}) {
  const effectiveNonce = Number.isFinite(Number(nonce)) ? Number(nonce) : Date.now();
  const { digest, connectionId } = hashHyperliquidTypedData(
    action,
    effectiveNonce,
    Boolean(useTestnet),
    vaultAddress || null
  );
  const sig = signSecp256k1Digest(digest, privateKey);
  return {
    action,
    nonce: effectiveNonce,
    signature: { r: sig.r, s: sig.s, v: sig.v },
    rawSignature: sig.rawSignature,
    signer: sig.signer,
    digest,
    connectionId,
    ...(vaultAddress ? { vaultAddress } : {}),
  };
}
