import { test, expect, type Page } from '@playwright/test';

/**
 * Terminal desk tests: sub-tabs, orderbook depth, resizable positions dock.
 */

async function gotoDesk(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('subtab-OVERVIEW')).toBeVisible({ timeout: 30_000 });
}

test.describe('terminal desk', () => {
  test('sub-tab navigation shows each workspace', async ({ page }) => {
    await gotoDesk(page);
    await page.getByTestId('subtab-ORDERBOOK_L2').click();
    await expect(page.getByTestId('orderbook-panel')).toBeVisible();

    await page.getByTestId('subtab-WHALE_TAPE').click();
    await expect(page.getByText(/ON-CHAIN BLOCKCHAIN EXPLORER/).first()).toBeVisible();

    await page.getByTestId('subtab-AGENT_BRAIN').click();
    await expect(page.getByText(/AUTONOMOUS AGENT REASONING/).first()).toBeVisible();

    await page.getByTestId('subtab-OVERVIEW').click();
    await expect(page.getByTestId('candlestick-chart')).toBeVisible();
  });

  test('orderbook shows 18 bid and 18 ask levels with microstructure cards', async ({ page }) => {
    await gotoDesk(page);
    await page.getByTestId('subtab-ORDERBOOK_L2').click();
    await expect(page.getByTestId('orderbook-panel')).toBeVisible();
    await expect(page.getByTestId('ob-bid-row')).toHaveCount(18);
    await expect(page.getByTestId('ob-ask-row')).toHaveCount(18);
    await expect(page.getByText('BIDS / ANTRIAN BELI').first()).toBeVisible();
    await expect(page.getByText('ASKS / ANTRIAN JUAL').first()).toBeVisible();
    await expect(page.getByText(/LEVEL AKTIF/).first()).toBeVisible();
  });

  test('chart overview renders with timeframe controls', async ({ page }) => {
    await gotoDesk(page);
    const chart = page.getByTestId('candlestick-chart');
    await expect(chart).toBeVisible();
    await expect(page.getByTestId('chart-autofit-btn')).toBeVisible();
  });

  test('positions dock resizes via presets and drag handle', async ({ page }) => {
    await gotoDesk(page);
    const dock = page.getByTestId('positions-dock');
    await expect(dock).toBeVisible();

    const height = async () =>
      (await dock.evaluate((el) => (el as HTMLElement).getBoundingClientRect().height)) as number;

    const minH = await height();
    await page.getByTestId('dock-preset-MIN').click();
    await page.waitForTimeout(450); // let the height transition settle
    const minAfter = await height();
    expect(minAfter).toBeLessThan(minH);

    await page.getByTestId('dock-preset-MAX').click();
    await page.waitForTimeout(450);
    const maxAfter = await height();
    expect(maxAfter).toBeGreaterThan(minAfter);

    // Drag the handle DOWNWARD to shrink the dock (chart grows).
    // App convention: pulling the handle UP enlarges the table.
    const handle = page.getByTestId('positions-dock-handle');
    await handle.scrollIntoViewIfNeeded();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 8 });
    await page.mouse.up();
    await page.waitForTimeout(350);
    const draggedH = await height();
    expect(draggedH).toBeLessThan(maxAfter);
  });

  test('whale inflow simulation button fires without breaking the desk', async ({ page }) => {
    await gotoDesk(page);
    await page.getByText('⚡ WHALE INFLOW').click();
    await expect(page.getByTestId('subtab-OVERVIEW')).toBeVisible();
  });

  test('4-agent consensus forum, verified news (90-100%), TA indicators and all-market explorer work', async ({
    page,
  }) => {
    await gotoDesk(page);

    // 1. TA strip & indicator toggles on chart
    await expect(page.getByTestId('chart-ta-strip')).toBeVisible();
    await expect(page.getByTestId('chart-legend-bb-btn')).toBeVisible();
    await expect(page.getByTestId('chart-legend-pa-sr-btn')).toBeVisible();

    // 2. All-Crypto Market Sector Explorer (beyond Top 10 CMC)
    await page.getByTestId('watchlist-sector-AI_DEPIN').click();
    await expect(page.getByTestId('market-TAO-PERP')).toBeVisible();
    await page.getByTestId('market-TAO-PERP').click();
    await expect(page.getByText('TAO-PERP').first()).toBeVisible();

    // 3. 4-Agent Consensus Forum inside AGENT_BRAIN sub-tab
    await page.getByTestId('subtab-AGENT_BRAIN').click();
    await expect(page.getByTestId('multi-agent-forum')).toBeVisible();
    await expect(page.getByTestId('forum-agent-card-BLOOMBERG_NEWS')).toBeVisible();
    await expect(page.getByTestId('forum-agent-card-TECHNICAL_ANALYST')).toBeVisible();
    await expect(page.getByTestId('forum-agent-card-WHALE_WALLET')).toBeVisible();
    await expect(page.getByTestId('forum-agent-card-EXECUTION_PRECISION')).toBeVisible();

    // 4. Bloomberg News 90-100% Verified tab
    await page.getByTestId('forum-tab-news').click();
    await expect(page.getByTestId('forum-news-list')).toBeVisible();
    expect(await page.getByTestId('verified-news-item').count()).toBeGreaterThanOrEqual(4);

    // 5. All-Market Scanner tab
    await page.getByTestId('forum-tab-scanner').click();
    await expect(page.getByTestId('forum-all-market-scanner')).toBeVisible();
  });
});
