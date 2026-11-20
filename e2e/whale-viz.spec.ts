import { openExpandedDesk } from './helpers';
import { test, expect, type Page } from '@playwright/test';

/**
 * Whale pipeline visualizer + on-chain stream drawer tests.
 */

async function gotoViz(page: Page) {
  await openExpandedDesk(page);
  await expect(page.getByTestId('subtab-WHALE_TAPE')).toBeVisible({ timeout:30_000 });
  await page.getByTestId('subtab-WHALE_TAPE').click();
  await expect(page.getByTestId('whale-chord-viz')).toBeVisible();
}

test.describe('whale viz & on-chain stream', () => {
  test('viz renders with nodes, layout modes and zoom indicator', async ({ page }) => {
    await gotoViz(page);
    await expect(page.getByTestId('viz-layout-radial')).toBeVisible();
    await expect(page.getByTestId('viz-layout-pipeline')).toBeVisible();
    await expect(page.getByTestId('viz-zoom-indicator')).toBeVisible();
    await expect(page.getByTestId('viz-node-WHALE-CORE')).toBeVisible();
  });

  test('layout mode buttons switch without errors', async ({ page }) => {
    await gotoViz(page);
    await page.getByTestId('viz-layout-pipeline').click();
    await expect(page.getByTestId('whale-chord-viz')).toBeVisible();
    await page.getByTestId('viz-layout-radial').click();
    await expect(page.getByTestId('whale-chord-viz')).toBeVisible();
  });

  test('stream drawer sub-tabs switch content', async ({ page }) => {
    await gotoViz(page);
    await expect(page.getByTestId('stream-drawer')).toBeVisible();
    await page.getByTestId('stream-tab-WHALE').click();
    await expect(page.getByTestId('stream-drawer')).toBeVisible();
    await page.getByTestId('stream-tab-BLOCKS').click();
    await expect(page.getByTestId('stream-drawer')).toBeVisible();
    await page.getByTestId('stream-tab-ONCHAIN').click();
    await expect(page.getByTestId('stream-drawer')).toBeVisible();
  });

  test('drawer quick-size buttons resize the drawer', async ({ page }) => {
    await gotoViz(page);
    const drawer = page.getByTestId('stream-drawer');
    const h = async () => (await drawer.evaluate((el) => (el as HTMLElement).getBoundingClientRect().height)) as number;

    const before = await h();
    await page.getByTestId('stream-size-small').click();
    await page.waitForTimeout(400);
    const small = await h();
    expect(small).toBeLessThan(before);

    await page.getByTestId('stream-size-max').click();
    await page.waitForTimeout(400);
    const max = await h();
    expect(max).toBeGreaterThan(small);
  });
});
