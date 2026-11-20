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
  await page.getByTestId('market-ETH-PERP').click();
  await expect(page.locator('.market-picker summary')).toContainText('ETH-PERP');
  await expect(page.locator('.market-picker-panel')).toBeHidden();
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
        orderPurpose: 'ENTRY_MAKER', sizeUsd: 500, price: 60000, useTestnet: true },
    });
    expect(response.status()).toBe(200);
    expect((await response.json()).ok).toBe(false);
  }
  const unknown = await request.get('/api/unknown-e2e-route');
  expect(unknown.status()).toBe(404);
  expect((await unknown.json()).ok).toBe(false);
});
