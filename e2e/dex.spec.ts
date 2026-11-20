import { openExpandedDesk } from './helpers';
import { test, expect, type Page } from '@playwright/test';

/**
 * DEX screener tab tests: on-chain pool list, chain filters, and search.
 */

async function gotoDex(page: Page) {
  await openExpandedDesk(page);
  await expect(page.getByTestId('top-tab-DEX_SCREENER')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('top-tab-DEX_SCREENER').click();
  await expect(page.getByTestId('dex-search')).toBeVisible();
}

test.describe('dex screener', () => {
  test('dex panel renders with search and chain filter', async ({ page }) => {
    await gotoDex(page);
    await expect(page.getByTestId('dex-search')).toBeVisible();
    await expect(page.getByText('🔍 SCAN ALL DEX').first()).toBeVisible();
    await expect(page.getByText(/4 DEX INDEXERS/).first()).toBeVisible();
  });

  test('search input accepts a query and RESET clears it', async ({ page }) => {
    await gotoDex(page);
    const search = page.getByTestId('dex-search');
    await search.fill('BTC');
    await expect(search).toHaveValue('BTC');
    await page.getByText('RESET').click();
    await expect(search).toHaveValue('');
  });

  test('submitting search keeps the panel alive', async ({ page }) => {
    await gotoDex(page);
    await page.getByTestId('dex-search').fill('SOL');
    await page.getByTestId('dex-search').press('Enter');
    await expect(page.getByTestId('dex-search')).toBeVisible();
    await expect(page.getByText(/DEX INDEXERS/).first()).toBeVisible();
  });
});
