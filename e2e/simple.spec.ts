import { test, expect } from '@playwright/test';

test('Simple is the default edition and Pro is accessible', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('/');
  await expect(page).toHaveTitle('Fincept Simple');
  await expect(page.locator('.simple-workspace')).toBeVisible();
  await expect(page.locator('.desk-whale-pane')).toBeHidden();
  await expect(page.getByRole('button', { name: /MAKER LONG/ })).toBeHidden();
  await page.getByRole('button', { name: 'Whale Pipeline', exact: true }).click();
  await expect(page.getByTestId('whale-chord-viz')).toBeVisible();
  await page.getByRole('button', { name: 'Kontrol trading', exact: true }).click();
  await expect(page.getByRole('button', { name: /MAKER LONG/ })).toBeVisible();
  await page.getByRole('link', { name: /Pro/ }).click({ noWaitAfter: true });
  await expect(page).toHaveURL(/\/pro\//);
  await expect(page.locator('.workspace-shell:not(.simple-workspace)')).toBeVisible();
  await page.getByRole('link', { name: /Simple/ }).click({ noWaitAfter: true });
  await expect(page.locator('.simple-workspace')).toBeVisible();
  expect(errors).toEqual([]);
});

test('market selector closes after selecting a searched market', async ({ page }) => {
  await page.goto('/');
  await page.locator('.market-picker summary').click();
  await page.getByTestId('watchlist-market-search').fill('ETH');
  const ethItem = page.getByTestId('market-ETH-PERP');
  const ethImg = ethItem.locator('img[alt="ETH icon"]');
  await expect(ethImg).toBeVisible();
  expect(
    await ethImg.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)
  ).toBe(true);
  await ethItem.click();
  await expect(page.locator('.market-picker summary')).toContainText('ETH-PERP');
  await expect(page.locator('.market-picker-panel')).toBeHidden();
});

test('ETH-PERP and WETH resolve authentic official Ethereum (#627EEA) diamond icon without DEX hint pollution', async ({
  request,
}) => {
  await request.get('/api/live/snapshot');
  for (const query of [
    '/api/live/token-icon?symbol=ETH&chain=hyperliquid&v=2',
    '/api/live/token-icon?symbol=WETH&chain=ethereum&v=2',
    '/api/live/token-icon?symbol=ETH&chain=bsc&addr=0x2170Ed0880ac9A755fd29B2688956BD959F933F8&v=2',
  ]) {
    const res = await request.get(query);
    expect(res.status()).toBe(200);
    expect(res.headers()['content-type']).toContain('image/svg+xml');
    const body = await res.text();
    expect(body).toContain('#627EEA');
    expect(body).toContain('M16.498 4v8.87l7.497 3.35z');
  }
});

test('AI orbital camera, planet selection and flight controls work', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('top-tab-AGENT_SKILLS').click();
  const planet = page.getByTestId('viz-pod-TECHNICAL_ANALYST');
  await planet.locator('circle').nth(1).click();
  await expect(planet).toHaveAttribute('aria-pressed', 'true');
  const before = await planet.getAttribute('transform');
  await page.getByRole('button', { name: 'Perbesar tata surya', exact: true }).click();
  await expect(planet).not.toHaveAttribute('transform', before!);
  await page.getByRole('button', { name: 'Jeda roket' }).click();
  expect(await page.locator('.agent-orbit-scene').evaluate((svg) => (svg as SVGSVGElement).animationsPaused())).toBe(true);
});

test('backend rejects missing exchange credentials and unknown routes', async ({ request }) => {
  for (const exchange of ['BINANCE', 'BYBIT', 'OKX']) {
    const response = await request.post('/api/execute/order', {
      data: { exchange, symbol: 'BTC-PERP', binanceSymbol: 'BTCUSDT', side: 'LONG',
        orderPurpose: 'ENTRY_MAKER', sizeUsd: 500, price: 60000, useTestnet: true, bypassOracleGuard: true },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).ok).toBe(false);
  }
  const unknown = await request.get('/api/unknown-e2e-route');
  expect(unknown.status()).toBe(404);
  expect((await unknown.json()).ok).toBe(false);
});

test('5-Layer Row-Level Security (RLS) & Wallet Vault guards protect real-money accounts and orders end-to-end', async ({
  page,
  request,
}) => {
  // 1. Verify backend RLS status endpoint reports all 6 enforced policies
  const statusRes = await request.get('/api/security/rls-status');
  expect(statusRes.status()).toBe(200);
  const statusData = await statusRes.json();
  expect(statusData.ok).toBe(true);
  expect(statusData.rlsVersion).toBe('FINCEPT_RLS_V1.0');
  expect(statusData.enforcedPolicies).toContain('RLS_WALLET_VAULT_ISOLATION');
  expect(statusData.enforcedPolicies).toContain('RLS_SIGNER_OWNERSHIP_MATCH');
  expect(statusData.enforcedPolicies).toContain('RLS_ANTI_REPLAY_NONCE_GUARD');

  // 2. Verify Wallet Configuration Guards (EVM burn address, malformed EVM, malformed Solana, identical CEX Key/Secret)
  const burnEvmRes = await request.post('/api/account/verify', {
    data: { providerId: 'trust', walletAddress: '0x0000000000000000000000000000000000000000' },
  });
  expect((await burnEvmRes.json()).ok).toBe(false);

  const shortEvmRes = await request.post('/api/account/verify', {
    data: { providerId: 'hyperliquid_agent', walletAddress: '0x12345678901234567890123456789012345678' },
  });
  expect((await shortEvmRes.json()).ok).toBe(false);

  const badAgentKeyRes = await request.post('/api/account/verify', {
    data: {
      providerId: 'hyperliquid_agent',
      walletAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
      agentPrivateKey: '0x0000000000000000000000000000000000000000000000000000000000000000',
    },
  });
  const badAgentJson = await badAgentKeyRes.json();
  expect(badAgentJson.ok).toBe(false);
  expect(badAgentJson.rlsPolicy).toBe('RLS_AGENT_KEY_VALIDATION');

  const badSolRes = await request.post('/api/account/verify', {
    data: { providerId: 'phantom', walletAddress: '11111111111111111111111111111111' },
  });
  expect((await badSolRes.json()).ok).toBe(false);

  const sameKeySecretRes = await request.post('/api/account/verify', {
    data: { providerId: 'binance_api', apiKey: 'identicalKey12345', apiSecret: 'identicalKey12345' },
  });
  const sameKeyJson = await sameKeySecretRes.json();
  expect(sameKeyJson.ok).toBe(false);
  expect(sameKeyJson.rlsPolicy).toBe('RLS_CEX_KEY_SECRET_DISTINCT');

  // 3. Verify Cross-Account RLS Isolation, Fat-Finger Capital Cap, Oracle Price Deviation & Anti-Replay Nonce
  const crossAccountRes = await request.post('/api/execute/order', {
    data: {
      exchange: 'HYPERLIQUID',
      symbol: 'ETH-PERP',
      side: 'LONG',
      orderPurpose: 'SCRATCH_EXIT',
      sizeUsd: 250,
      price: 2200,
      rlsContext: {
        rowOwnerScope: 'rls:trust:aaaa1111bbbb2222',
        sessionOwnerScope: 'rls:trust:cccc3333dddd4444',
      },
    },
  });
  const crossAccountJson = await crossAccountRes.json();
  expect(crossAccountJson.ok).toBe(false);
  expect(crossAccountJson.rlsPolicy).toBe('RLS_ROW_OWNERSHIP_ISOLATION');

  const fatFingerRes = await request.post('/api/execute/order', {
    data: {
      exchange: 'BINANCE',
      symbol: 'BTC-PERP',
      side: 'LONG',
      orderPurpose: 'ENTRY_MAKER',
      sizeUsd: 500_000,
      price: 60000,
    },
  });
  const fatFingerJson = await fatFingerRes.json();
  expect(fatFingerJson.ok).toBe(false);
  expect(fatFingerJson.rlsPolicy).toBe('RLS_CAPITAL_CAP_GUARD');

  const oracleDeviationRes = await request.post('/api/execute/order', {
    data: {
      exchange: 'HYPERLIQUID',
      symbol: 'ETH-PERP',
      side: 'LONG',
      orderPurpose: 'ENTRY_MAKER',
      sizeUsd: 250,
      price: 70000, // Wrong-symbol fat-finger price vs live ETH price
      refMarkPrice: 2200,
      bypassOracleGuard: true, // Negative control (#12): client MUST NOT be able to bypass Layer 4!
    },
  });
  const oracleJson = await oracleDeviationRes.json();
  expect(oracleJson.ok).toBe(false);
  expect(oracleJson.rlsPolicy).toBe('RLS_ORACLE_PRICE_DEVIATION_GUARD');

  // Resolve live ETH & SOL mark prices so Layer 4 legitimately passes before testing signer/replay guards
  const snapRes = await request.get('/api/live/snapshot');
  const snapJson = await snapRes.json();
  const liveEthPx = Number(snapJson?.hlAssets?.ETH?.price || 2200);
  const liveSolPx = Number(snapJson?.hlAssets?.SOL?.price || 150);

  // Signer mismatch & anti-replay guard on Hyperliquid EIP-712
  const validSig = '0x' + 'a1'.repeat(64) + '1b';
  const mismatchRes = await request.post('/api/execute/order', {
    data: {
      exchange: 'HYPERLIQUID',
      symbol: 'ETH-PERP',
      side: 'LONG',
      orderPurpose: 'ENTRY_MAKER',
      sizeUsd: 250,
      price: liveEthPx,
      credentials: { walletAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303' },
      hlSignedAction: {
        nonce: Date.now(),
        rawSignature: validSig,
        signedChainId: 1337,
        signer: '0x71C0000000000000000000000000000000009A4E',
      },
    },
  });
  const mismatchJson = await mismatchRes.json();
  expect(mismatchJson.ok).toBe(false);
  expect(mismatchJson.rlsPolicy).toBe('RLS_SIGNER_OWNERSHIP_MATCH');

  const replayNonce = Date.now();
  const firstSignedRes = await request.post('/api/execute/order', {
    data: {
      exchange: 'HYPERLIQUID',
      symbol: 'ETH-PERP',
      side: 'LONG',
      orderPurpose: 'ENTRY_MAKER',
      sizeUsd: 250,
      price: liveEthPx,
      credentials: { walletAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303' },
      hlSignedAction: {
        nonce: replayNonce,
        rawSignature: validSig,
        signedChainId: 1337,
        signer: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
      },
    },
  });
  const firstSignedJson = await firstSignedRes.json();
  // Negative control (#2): dummy EIP-712 signature MUST NOT produce false-positive ok:true when Hyperliquid rejects it
  expect(firstSignedJson.ok).toBe(false);
  expect(firstSignedJson.rlsPolicy).toBeUndefined();
  expect(String(firstSignedJson.error || '')).toContain('Hyperliquid L1 Error');

  // Negative control (#2): unbroadcast Solana signMessage intent MUST NOT fabricate CONFIRMED_SOLANA
  const fakeSolRes = await request.post('/api/execute/order', {
    data: {
      exchange: 'JUPITER',
      symbol: 'SOL-PERP',
      side: 'LONG',
      orderPurpose: 'ENTRY_MAKER',
      sizeUsd: 250,
      price: liveSolPx,
      credentials: { walletAddress: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU' },
      solanaSigner: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      solanaSignedTx: 'deadbeef'.repeat(8),
    },
  });
  const fakeSolJson = await fakeSolRes.json();
  expect(fakeSolJson.ok).toBe(false);
  expect(fakeSolJson.status).not.toBe('CONFIRMED_SOLANA');

  const replaySignedRes = await request.post('/api/execute/order', {
    data: {
      exchange: 'HYPERLIQUID',
      symbol: 'ETH-PERP',
      side: 'LONG',
      orderPurpose: 'ENTRY_MAKER',
      sizeUsd: 250,
      price: liveEthPx,
      credentials: { walletAddress: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303' },
      hlSignedAction: {
        nonce: replayNonce,
        rawSignature: validSig,
        signedChainId: 1337,
        signer: '0xdfc24b077bc1425ad1dea75bcb6f8158e10df303',
      },
    },
  });
  const replayJson = await replaySignedRes.json();
  expect(replayJson.ok).toBe(false);
  expect(replayJson.rlsPolicy).toBe('RLS_ANTI_REPLAY_NONCE_GUARD');

  // 4. Verify Binance / CEX DoH server connectivity ping endpoint works live
  const bncPingRes = await request.post('/api/account/ping-venue', {
    data: { providerId: 'binance_api', useTestnet: false },
  });
  expect(bncPingRes.status()).toBe(200);
  const bncPingJson = await bncPingRes.json();
  expect(bncPingJson.ok).toBe(true);
  expect(bncPingJson.providerId).toBe('binance_api');

  // 5. Verify UI Wallet Modal renders RLS 5-Layer Shield & RLS Row Scopes for all 6 wallets
  await page.goto('/');
  await page.getByTestId('wallet-modal-trigger').click();
  await expect(page.getByTestId('wallet-rls-security-banner')).toBeVisible();
  await expect(page.getByTestId('wallet-rls-enforced-badge')).toContainText('RLS 5-LAYER ACTIVE');
  for (const wid of ['trust', 'phantom', 'hyperliquid_agent', 'binance_api', 'bybit_api', 'okx_api']) {
    await expect(page.getByTestId(`wallet-rls-scope-${wid}`)).toContainText('SEALED');
  }
});
