/**
 * Spec-accurate Hyperliquid L1 Protocol Helpers (Zero External Dependencies):
 * - Standard Keccak-256 (Ethereum / EIP-712 / Hyperliquid action hash)
 * - Canonical MessagePack encoder matching Hyperliquid Python/TS SDK key ordering
 * - Hyperliquid L1 order action builder (dynamic asset index, reduceOnly, side flip on exit, trigger SL)
 * - Hyperliquid Phantom Agent EIP-712 typed data (chainId: 1337)
 */

const KECCAK_ROUNDS = 24;
const KECCAK_RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const KECCAK_ROTC = [
  1, 3, 6, 10, 15, 21, 28, 36, 45, 55, 2, 14,
  27, 41, 56, 8, 25, 43, 62, 18, 39, 61, 20, 44,
];
const KECCAK_PILN = [
  10, 7, 11, 17, 18, 3, 5, 16, 8, 21, 24, 4,
  15, 23, 19, 13, 12, 2, 20, 14, 22, 9, 6, 1,
];
const MASK_64 = (1n << 64n) - 1n;

function rotl64(x, n) {
  const shift = BigInt(n);
  return ((x << shift) | (x >> (64n - shift))) & MASK_64;
}

function keccakF1600(st) {
  const bc = new Array(5);
  for (let round = 0; round < KECCAK_ROUNDS; round++) {
    // Theta
    for (let i = 0; i < 5; i++) {
      bc[i] = st[i] ^ st[i + 5] ^ st[i + 10] ^ st[i + 15] ^ st[i + 20];
    }
    for (let i = 0; i < 5; i++) {
      const t = bc[(i + 4) % 5] ^ rotl64(bc[(i + 1) % 5], 1);
      for (let j = 0; j < 25; j += 5) {
        st[j + i] = (st[j + i] ^ t) & MASK_64;
      }
    }
    // Rho and Pi
    let t = st[1];
    for (let i = 0; i < 24; i++) {
      const j = KECCAK_PILN[i];
      bc[0] = st[j];
      st[j] = rotl64(t, KECCAK_ROTC[i]);
      t = bc[0];
    }
    // Chi
    for (let j = 0; j < 25; j += 5) {
      for (let i = 0; i < 5; i++) bc[i] = st[j + i];
      for (let i = 0; i < 5; i++) {
        st[j + i] = (bc[i] ^ ((~bc[(i + 1) % 5] & MASK_64) & bc[(i + 2) % 5])) & MASK_64;
      }
    }
    // Iota
    st[0] = (st[0] ^ KECCAK_RC[round]) & MASK_64;
  }
}

/**
 * Computes standard Ethereum Keccak-256 (0x01 padding, NOT NIST SHA3-256 0x06)
 * and returns a 0x-prefixed 64-char hex string.
 */
export function keccak256Hex(input) {
  const bytes =
    input instanceof Uint8Array
      ? input
      : new TextEncoder().encode(String(input ?? ''));
  const rate = 136; // (1600 - 2*256)/8
  const st = new Array(25).fill(0n);

  // Pad: 0x01 ... 0x80
  const paddedLen = Math.ceil((bytes.length + 1) / rate) * rate;
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x01;
  padded[paddedLen - 1] |= 0x80;

  for (let offset = 0; offset < paddedLen; offset += rate) {
    for (let i = 0; i < rate / 8; i++) {
      let lane = 0n;
      for (let b = 0; b < 8; b++) {
        lane |= BigInt(padded[offset + i * 8 + b]) << BigInt(b * 8);
      }
      st[i] = (st[i] ^ lane) & MASK_64;
    }
    keccakF1600(st);
  }

  let hex = '0x';
  for (let i = 0; i < 4; i++) {
    const lane = st[i];
    for (let b = 0; b < 8; b++) {
      const byte = Number((lane >> BigInt(b * 8)) & 0xffn);
      hex += byte.toString(16).padStart(2, '0');
    }
  }
  return hex;
}

/**
 * Minimal canonical MessagePack encoder supporting Hyperliquid L1 action payloads
 * (null, booleans, integers, floats, strings, arrays, plain objects).
 */
export function encodeMsgPack(value) {
  const out = [];
  const encoder = new TextEncoder();

  function write(val) {
    if (val === null || val === undefined) {
      out.push(0xc0);
      return;
    }
    if (typeof val === 'boolean') {
      out.push(val ? 0xc3 : 0xc2);
      return;
    }
    if (typeof val === 'number') {
      if (Number.isInteger(val)) {
        if (val >= 0 && val <= 0x7f) {
          out.push(val);
        } else if (val >= -32 && val < 0) {
          out.push(val & 0xff);
        } else if (val >= 0 && val <= 0xff) {
          out.push(0xcc, val);
        } else if (val >= 0 && val <= 0xffff) {
          out.push(0xcd, (val >> 8) & 0xff, val & 0xff);
        } else if (val >= 0 && val <= 0xffffffff) {
          out.push(0xce, (val >>> 24) & 0xff, (val >>> 16) & 0xff, (val >>> 8) & 0xff, val & 0xff);
        } else {
          const buf = new ArrayBuffer(8);
          const dv = new DataView(buf);
          dv.setBigInt64(0, BigInt(val), false);
          out.push(0xd3, ...new Uint8Array(buf));
        }
      } else {
        const buf = new ArrayBuffer(8);
        const dv = new DataView(buf);
        dv.setFloat64(0, val, false);
        out.push(0xcb, ...new Uint8Array(buf));
      }
      return;
    }
    if (typeof val === 'string') {
      const strBytes = encoder.encode(val);
      const len = strBytes.length;
      if (len <= 31) {
        out.push(0xa0 | len);
      } else if (len <= 0xff) {
        out.push(0xd9, len);
      } else if (len <= 0xffff) {
        out.push(0xda, (len >> 8) & 0xff, len & 0xff);
      } else {
        out.push(0xdb, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
      }
      for (const b of strBytes) out.push(b);
      return;
    }
    if (Array.isArray(val)) {
      const len = val.length;
      if (len <= 15) {
        out.push(0x90 | len);
      } else if (len <= 0xffff) {
        out.push(0xdc, (len >> 8) & 0xff, len & 0xff);
      } else {
        out.push(0xdd, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
      }
      for (const item of val) write(item);
      return;
    }
    if (typeof val === 'object') {
      const entries = Object.entries(val).filter(([, v]) => v !== undefined);
      const len = entries.length;
      if (len <= 15) {
        out.push(0x80 | len);
      } else if (len <= 0xffff) {
        out.push(0xde, (len >> 8) & 0xff, len & 0xff);
      } else {
        out.push(0xdf, (len >>> 24) & 0xff, (len >>> 16) & 0xff, (len >>> 8) & 0xff, len & 0xff);
      }
      for (const [k, v] of entries) {
        write(k);
        write(v);
      }
      return;
    }
    throw new Error(`Unsupported msgpack type: ${typeof val}`);
  }

  write(value);
  return new Uint8Array(out);
}

/**
 * Strips trailing zeros per Hyperliquid wire formatting requirements (e.g. "2500.1000" -> "2500.1").
 */
export function formatHlWireNumber(num, maxDecimals = 6) {
  const n = Number(num);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const fixed = n.toFixed(Math.max(0, Math.min(8, maxDecimals)));
  return fixed.includes('.') ? fixed.replace(/\.?0+$/, '') : fixed;
}

/**
 * Quantizes a Hyperliquid perpetual price to comply with official tick-size rules:
 * - Integer prices are always allowed regardless of significant figures.
 * - Non-integer prices may have at most 5 significant figures.
 * - Perpetual prices may have at most `max(0, 6 - szDecimals)` decimal places.
 * - Trailing zeros are stripped.
 */
export function formatHlPerpPrice(price, szDecimals = 4) {
  const n = Number(price);
  if (!Number.isFinite(n) || n <= 0) return '0';
  const safeSzDecimals = Math.max(0, Math.min(6, Number.isFinite(Number(szDecimals)) ? Math.floor(Number(szDecimals)) : 4));
  const maxDecimals = Math.max(0, 6 - safeSzDecimals);
  if (Number.isInteger(n)) {
    return String(n);
  }
  if (n >= 100000) {
    return String(Math.round(n));
  }
  const sigRounded = Number(n.toPrecision(5));
  return formatHlWireNumber(sigRounded, maxDecimals);
}

/**
 * Computes Hyperliquid L1 action hash (`connectionId`):
 * keccak256(msgpack(action) || uint64_be(nonce) || (vaultAddress ? 0x01 || vaultBytes20 : 0x00))
 */
export function computeHyperliquidActionHash(action, nonce, vaultAddress = null) {
  const packed = encodeMsgPack(action);
  const nonceBuf = new Uint8Array(8);
  new DataView(nonceBuf.buffer).setBigUint64(0, BigInt(nonce), false);

  let vaultBytes = new Uint8Array([0x00]);
  if (vaultAddress && /^0x[a-fA-F0-9]{40}$/.test(vaultAddress)) {
    const clean = vaultAddress.slice(2);
    vaultBytes = new Uint8Array(21);
    vaultBytes[0] = 0x01;
    for (let i = 0; i < 20; i++) {
      vaultBytes[i + 1] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    }
  }

  const combined = new Uint8Array(packed.length + nonceBuf.length + vaultBytes.length);
  combined.set(packed, 0);
  combined.set(nonceBuf, packed.length);
  combined.set(vaultBytes, packed.length + nonceBuf.length);
  return keccak256Hex(combined);
}

/**
 * Builds a protocol-accurate Hyperliquid L1 order action respecting:
 * - Dynamic asset index (`a`)
 * - Proper side flip on exits/stops (`b`)
 * - `reduceOnly` (`r: true` for SCRATCH_EXIT and BREAKEVEN_STOP, `false` for ENTRY_MAKER)
 * - Floored lot size (`s`) per asset `szDecimals`
 * - Appropriate order type (`Alo` maker entry, `Ioc` scratch exit, `trigger` SL for BREAKEVEN_STOP)
 */
export function buildHyperliquidOrderAction({
  assetIndex,
  side,
  orderPurpose = 'ENTRY_MAKER',
  price,
  stopPrice,
  sizeUsd,
  quantity,
  szDecimals = 4,
  makerOnly = true,
}) {
  if (!Number.isInteger(assetIndex) || assetIndex < 0) {
    throw new Error(`Invalid Hyperliquid asset index: ${assetIndex}`);
  }
  const isEntry = orderPurpose === 'ENTRY_MAKER';
  const isBuy = (isEntry && side === 'LONG') || (!isEntry && side === 'SHORT');
  const isReduceOnly = !isEntry;

  const rawQty = Number.isFinite(Number(quantity)) && Number(quantity) > 0
    ? Number(quantity)
    : Number(sizeUsd) / Number(price);
  const factor = 10 ** Math.max(0, Math.min(8, szDecimals));
  const flooredQty = Math.floor(rawQty * factor) / factor;

  const limitPx =
    orderPurpose === 'SCRATCH_EXIT'
      ? isBuy
        ? Number(price) * 1.005
        : Number(price) * 0.995
      : Number(price);

  const orderType =
    orderPurpose === 'BREAKEVEN_STOP'
      ? {
          trigger: {
            isMarket: true,
            triggerPx: formatHlPerpPrice(stopPrice || price, szDecimals),
            tpsl: 'sl',
          },
        }
      : orderPurpose === 'SCRATCH_EXIT'
        ? { limit: { tif: 'Ioc' } }
        : { limit: { tif: makerOnly ? 'Alo' : 'Ioc' } };

  return {
    type: 'order',
    orders: [
      {
        a: assetIndex,
        b: isBuy,
        p: formatHlPerpPrice(limitPx, szDecimals),
        s: formatHlWireNumber(flooredQty, szDecimals),
        r: isReduceOnly,
        t: orderType,
      },
    ],
    grouping: 'na',
  };
}

/**
 * Builds a protocol-accurate Hyperliquid L1 leverage sync action (`updateLeverage`).
 * Canonical key order matches Hyperliquid Python/TS SDK (`type`, `asset`, `isCross`, `leverage`).
 */
export function buildHyperliquidLeverageAction({
  assetIndex,
  leverage,
  isCross = true,
}) {
  if (!Number.isInteger(assetIndex) || assetIndex < 0) {
    throw new Error(`Invalid Hyperliquid asset index: ${assetIndex}`);
  }
  const lev = Math.max(1, Math.min(100, Math.round(Number(leverage) || 1)));
  return {
    type: 'updateLeverage',
    asset: assetIndex,
    isCross: Boolean(isCross),
    leverage: lev,
  };
}

/**
 * Builds a protocol-accurate Hyperliquid L1 cancel action (`cancel`).
 * Canonical key order matches Hyperliquid Python/TS SDK (`type`, `cancels: [{ a, o }]`).
 */
export function buildHyperliquidCancelAction({ assetIndex, orderId }) {
  if (!Number.isInteger(assetIndex) || assetIndex < 0) {
    throw new Error(`Invalid Hyperliquid asset index: ${assetIndex}`);
  }
  const oid = Number(orderId);
  if (!Number.isSafeInteger(oid) || oid <= 0) {
    throw new Error(`Invalid Hyperliquid order id (oid): ${orderId}`);
  }
  return {
    type: 'cancel',
    cancels: [{ a: assetIndex, o: oid }],
  };
}

function hexToBytes32(hex) {
  const clean = String(hex || '').replace(/^0x/i, '').padStart(64, '0');
  const out = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

function uint256ToBytes32(val) {
  const hex = BigInt(val).toString(16).padStart(64, '0');
  return hexToBytes32(hex);
}

function concatUint8Arrays(parts) {
  const total = parts.reduce((sum, p) => sum + p.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

const EIP712_DOMAIN_TYPEHASH = hexToBytes32(
  keccak256Hex('EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)')
);
const EIP712_AGENT_TYPEHASH = hexToBytes32(
  keccak256Hex('Agent(string source,bytes32 connectionId)')
);
const HL_DOMAIN_SEPARATOR = hexToBytes32(
  keccak256Hex(
    concatUint8Arrays([
      EIP712_DOMAIN_TYPEHASH,
      hexToBytes32(keccak256Hex('Exchange')),
      hexToBytes32(keccak256Hex('1')),
      uint256ToBytes32(1337),
      new Uint8Array(32), // verifyingContract = 0x0000000000000000000000000000000000000000
    ])
  )
);

/**
 * Computes the exact EIP-712 signing digest (keccak256(0x1901 || domainSeparator || structHash))
 * for Hyperliquid L1 Phantom Agent typed data. Works in both Node.js and browser environments.
 */
export function hashHyperliquidTypedData(action, nonce, useTestnet = false, vaultAddress = null) {
  const connectionId = computeHyperliquidActionHash(action, nonce, vaultAddress);
  const sourceHash = hexToBytes32(keccak256Hex(useTestnet ? 'b' : 'a'));
  const structHash = hexToBytes32(
    keccak256Hex(
      concatUint8Arrays([
        EIP712_AGENT_TYPEHASH,
        sourceHash,
        hexToBytes32(connectionId),
      ])
    )
  );
  const digest = keccak256Hex(
    concatUint8Arrays([
      new Uint8Array([0x19, 0x01]),
      HL_DOMAIN_SEPARATOR,
      structHash,
    ])
  );
  return { digest, connectionId };
}

/**
 * Builds Hyperliquid L1 Phantom Agent EIP-712 typed data (official chainId: 1337).
 */
export function buildHyperliquidEip712TypedData(action, nonce, useTestnet = false, vaultAddress = null) {
  const connectionId = computeHyperliquidActionHash(action, nonce, vaultAddress);
  return {
    domain: {
      name: 'Exchange',
      version: '1',
      chainId: 1337,
      verifyingContract: '0x0000000000000000000000000000000000000000',
    },
    types: {
      EIP712Domain: [
        { name: 'name', type: 'string' },
        { name: 'version', type: 'string' },
        { name: 'chainId', type: 'uint256' },
        { name: 'verifyingContract', type: 'address' },
      ],
      Agent: [
        { name: 'source', type: 'string' },
        { name: 'connectionId', type: 'bytes32' },
      ],
    },
    primaryType: 'Agent',
    message: {
      source: useTestnet ? 'b' : 'a',
      connectionId,
    },
  };
}
