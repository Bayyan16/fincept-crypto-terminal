import { test, expect } from '@playwright/test';

for (const width of [1600, 390]) {
  test('Pro opens every workspace without horizontal overflow at ' + width + 'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 950 });
    const errors: string[] = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto('/pro/', { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveTitle('Fincept Pro');
    await expect(page.getByTestId('app-root')).toHaveCount(1);
    await expect(page.getByTestId('whale-chord-viz')).toBeVisible();
    for (const [tab, panel] of [
      ['DEX_SCREENER', 'dex-search'],
      ['AGENT_SKILLS', 'agent-skills-cockpit'],
      ['PORTFOLIO_LOG', 'execution-audit-log-list'],
      ['PORTFOLIO_PROFILE', 'profile'],
      ['TERMINAL_DESK', 'candlestick-chart'],
    ]) {
      await page.getByTestId('top-tab-' + tab).click();
      await expect(page.getByTestId('top-tab-' + tab)).toHaveAttribute('aria-current', 'page');
      if (panel === 'profile') {
        await expect(page.getByText(/TRADER PROFILE/).first()).toBeVisible();
      } else {
        await expect(page.getByTestId(panel)).toBeVisible();
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    expect(errors).toEqual([]);
  });
}

test('edition switches preserve trading state and isolate panel preferences', async ({ page }) => {
  await page.goto('/pro/', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Ukuran order USD').fill('777');
  await page.locator('.market-picker summary').click();
  await page.getByTestId('watchlist-market-search').fill('ETH');
  await page.getByTestId('market-ETH-PERP').click();
  const sessionStart = await page.evaluate(() => performance.timeOrigin);
  await page.locator('.desk-settings summary').click();
  await page.getByLabel('Tampilkan kontrol trading cepat').uncheck();
  await page.getByRole('link', { name: 'Beralih ke mode Simple' }).click();
  await expect(page).toHaveTitle('Fincept Simple');
  await expect(page.locator('.market-picker summary')).toContainText('ETH-PERP');
  await expect(page.locator('.desk-whale-pane')).toBeHidden();
  await expect(page.getByRole('button', { name: 'Kontrol trading', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: 'Kontrol trading', exact: true }).click();
  await expect(page.getByLabel('Ukuran order USD')).toHaveValue('777');
  await page.getByRole('link', { name: 'Beralih ke mode Pro' }).click();
  await expect(page).toHaveTitle('Fincept Pro');
  await expect(page.getByLabel('Ukuran order USD')).toBeHidden();
  await expect(page.locator('.desk-whale-pane')).toBeVisible();
  await page.goBack();
  await expect(page).toHaveTitle('Fincept Simple');
  await expect(page.getByLabel('Ukuran order USD')).toHaveValue('777');
  expect(await page.evaluate(() => performance.timeOrigin)).toBe(sessionStart);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'Kontrol trading', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('link', { name: 'Beralih ke mode Pro' }).click();
  await expect(page.getByLabel('Ukuran order USD')).toBeHidden();
});

test('Simple alias, Pro direct URL and browser history select the correct edition', async ({ page }) => {
  await page.goto('/simple/', { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveTitle('Fincept Simple');
  await page.getByRole('link', { name: 'Beralih ke mode Pro' }).click();
  await expect(page).toHaveURL(/\/pro\//);
  await expect(page).toHaveTitle('Fincept Pro');
  await page.goBack();
  await expect(page).toHaveURL(/\/simple\//);
  await expect(page).toHaveTitle('Fincept Simple');
  await page.goForward();
  await expect(page).toHaveTitle('Fincept Pro');
});
