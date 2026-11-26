import { expect, test } from '@playwright/test';

const token = 'test-browser-token-0123456789-abcdef';

test('Managed Testnet has an isolated workspace and returns to Paper', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('link', { name: 'Managed Testnet' }).click();
  await expect(page).toHaveURL(/\/testnet\/$/);
  await expect(page).toHaveTitle('Fincept Managed Testnet');
  await expect(page.locator('.simple-workspace')).toHaveCount(0);
  await page.getByRole('button', { name: 'Kembali ke terminal' }).click();
  await expect(page.locator('.simple-workspace')).toBeVisible();
});

test('Managed Testnet keeps Spot rules separate and submits Futures shorts with protection', async ({ page }) => {
  const posted: Record<string, unknown>[] = [];
  let rule: Record<string, unknown> | null = null;
  await page.route(/\/api\/trading\/testnet(?:\/automation|\/orders)?$/, async (route) => {
    const request = route.request();
    expect(request.headers().authorization).toBe(`Bearer ${token}`);
    if (request.method() === 'POST') {
      const payload = request.postDataJSON();
      posted.push(payload);
      if (request.url().endsWith('/orders')) {
        await route.fulfill({ json: { ok: true, order: { symbol: payload.symbol, status: 'NEW' } } });
        return;
      }
      rule = payload.enabled ? payload : null;
    }
    await route.fulfill({ json: { ok: true, configured: ['SPOT', 'PERP'], symbols: ['BTCUSDT'], orders: [], positions: [],
      automation: rule ? [rule] : [], maxOrder: 100, dailyLimit: 25, realizedToday: 0, halted: false, riskHalted: false } });
  });
  await page.goto('/testnet/');
  await page.getByLabel('Token trading server').fill(token);
  await page.getByRole('button', { name: 'Buka jurnal' }).click();
  await page.getByLabel('Take-profit (%)').fill('3');
  await page.getByLabel('Stop-loss (%)').fill('1.5');
  await expect(page.getByRole('button', { name: 'Buka Short' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Aktifkan auto-entry' }).click();
  await expect(page.getByText('Aktif untuk BTCUSDT', { exact: false })).toContainText('TP 3% · SL 1.5%');
  await page.getByLabel('Pasar').selectOption('PERP');
  await expect(page.getByRole('button', { name: 'Aktifkan auto-entry' })).toBeVisible();
  await page.getByRole('button', { name: 'Buka Short' }).click();
  await expect(page.getByRole('status')).toContainText('BTCUSDT · NEW');
  await page.getByLabel('Pasar').selectOption('SPOT');
  await page.getByRole('button', { name: 'Jeda auto-entry' }).click();
  await expect(page.getByRole('button', { name: 'Aktifkan auto-entry' })).toBeEnabled();
  expect(posted).toMatchObject([
    { product: 'SPOT', symbol: 'BTCUSDT', enabled: true, budget: 50, protection: { takeProfitPct: 3, stopLossPct: 1.5 } },
    { product: 'PERP', symbol: 'BTCUSDT', side: 'SELL', action: 'OPEN', protection: { takeProfitPct: 3, stopLossPct: 1.5 } },
    { product: 'SPOT', symbol: 'BTCUSDT', enabled: false },
  ]);
  expect(await page.evaluate(() => JSON.stringify({ ...localStorage, ...sessionStorage }))).not.toContain(token);
});
