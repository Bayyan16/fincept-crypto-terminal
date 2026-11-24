import test from 'node:test';
import assert from 'node:assert/strict';
import {
  sealSessionSecretCore,
  sealWalletVaultForStorageCore,
  unsealSessionSecretCore,
  verifyAndUnsealLoadedWalletsCore,
} from '../backend/vaultIntegrity.mjs';

const DEFAULTS = [
  {
    id: 'trust',
    name: 'Trust Wallet',
    type: 'DEX_WALLET',
    connected: false,
    verifiedReal: false,
    autoSignEnabled: false,
    balanceUsd: 0,
    credentials: {},
  },
  {
    id: 'binance_api',
    name: 'Binance API',
    type: 'CEX_API',
    connected: false,
    verifiedReal: false,
    autoSignEnabled: false,
    balanceUsd: 0,
    credentials: {},
  },
];

test('Issue #13 NEGATIVE: Deleting rlsIntegrityTag on a spoofed verifiedReal row triggers TAMPER_RESET', () => {
  const tampered = [
    {
      id: 'binance_api',
      type: 'CEX_API',
      connected: true,
      verifiedReal: true,
      autoSignEnabled: true,
      balanceUsd: 999999,
      // attacker strips rlsIntegrityTag!
      credentials: { apiKey: 'spoofedkey123' },
    },
  ];
  const loaded = verifyAndUnsealLoadedWalletsCore(tampered, DEFAULTS);
  const binance = loaded.find((w) => w.id === 'binance_api');
  assert.equal(binance.rlsPolicyStatus, 'TAMPER_RESET');
  assert.equal(binance.verifiedReal, false);
  assert.equal(binance.autoSignEnabled, false);
  assert.equal(binance.balanceUsd, 0);
});

test('Issue #13 POSITIVE: Wallet rows match strictly by id even when saved array order is reversed', () => {
  const sealed = sealWalletVaultForStorageCore([
    {
      ...DEFAULTS[1],
      connected: true,
      verifiedReal: true,
      balanceUsd: 1250,
      credentials: { apiKey: 'bin_key_999', apiSecret: 'super_secret_should_not_persist' },
    },
    {
      ...DEFAULTS[0],
      connected: true,
      verifiedReal: true,
      balanceUsd: 500,
      credentials: { walletAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303' },
    },
  ]);

  // Secrets MUST be stripped before localStorage persistence!
  assert.equal(sealed[0].credentials.apiSecret, '');

  const loaded = verifyAndUnsealLoadedWalletsCore(sealed, DEFAULTS);
  // Extension wallet (trust) has no secret stripped -> remains connected & verified
  assert.equal(loaded[0].id, 'trust');
  assert.equal(loaded[0].balanceUsd, 500);
  assert.equal(loaded[0].connected, true);
  assert.equal(loaded[0].verifiedReal, true);
  assert.equal(loaded[0].rlsPolicyStatus, 'ENFORCED');
  // CEX API wallet (binance_api) had secret stripped -> keeps metadata/apiKey cleanly but requires session reauth before trading
  assert.equal(loaded[1].id, 'binance_api');
  assert.equal(loaded[1].balanceUsd, 1250);
  assert.equal(loaded[1].credentials.apiKey, 'bin_key_999');
  assert.equal(loaded[1].connected, false);
  assert.equal(loaded[1].verifiedReal, false);
  assert.equal(loaded[1].autoSignEnabled, false);
  assert.equal(loaded[1].rlsPolicyStatus, 'ENFORCED');
});

test('Issue #13 POSITIVE: Ephemeral session sealing round-trips in RAM without static salt prefix', () => {
  const sealed = sealSessionSecretCore('my-live-api-secret-xyz');
  assert.ok(sealed.startsWith('rls_session_v2:'));
  assert.equal(unsealSessionSecretCore(sealed), 'my-live-api-secret-xyz');
});
