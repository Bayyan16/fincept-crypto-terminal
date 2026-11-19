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

    // 2. All-Crypto Market Sector Explorer (beyond Top 10 CMC) + Real Token Icon verification
    await page.getByTestId('watchlist-sector-AI_DEPIN').click();
    const taoBtn = page.getByTestId('market-TAO-PERP');
    await expect(taoBtn).toBeVisible();
    const taoImg = taoBtn.locator('img');
    await expect(taoImg).toBeVisible();
    await expect
      .poll(async () => taoImg.evaluate((el: HTMLImageElement) => el.naturalWidth))
      .toBeGreaterThan(0);
    await taoBtn.click();
    await expect(page.getByText('TAO-PERP').first()).toBeVisible();

    // 3. 4-Agent Consensus Forum + 3D Isometric War-Room Visualizer + 8-Point Precision Checklist inside AGENT_BRAIN sub-tab
    await page.getByTestId('subtab-AGENT_BRAIN').click();
    await expect(page.getByTestId('multi-agent-forum')).toBeVisible();
    await expect(page.getByTestId('agent-war-room-3d-viz')).toBeVisible();
    await expect(page.getByTestId('agent-subskills-inspector')).toBeVisible();
    await page.getByTestId('viz-pod-TECHNICAL_ANALYST').click();
    await expect(page.getByTestId('agent-subskills-inspector')).toContainText('Skill 2A');
    await page.getByTestId('viz-pod-WHALE_WALLET').click();
    await expect(page.getByTestId('agent-subskills-inspector')).toContainText('Skill 3A');
    await expect(page.getByTestId('forum-agent-card-BLOOMBERG_NEWS')).toBeVisible();
    await expect(page.getByTestId('forum-agent-card-TECHNICAL_ANALYST')).toBeVisible();
    await expect(page.getByTestId('forum-agent-card-WHALE_WALLET')).toBeVisible();
    await expect(page.getByTestId('forum-agent-card-EXECUTION_PRECISION')).toBeVisible();
    await expect(page.getByTestId('forum-precision-checklist')).toBeVisible();

    // 3B. 3D Vault Settlement & Courier Agent Illustration (Profit Inflow Vault vs External Loss Vault)
    await expect(page.getByTestId('vault-settlement-courier-3d-viz')).toBeVisible();
    await expect(page.getByTestId('internal-profit-vault-node')).toBeVisible();
    await expect(page.getByTestId('treasury-courier-agent-node')).toBeVisible();
    await expect(page.getByTestId('external-loss-vault-node')).toBeVisible();
    await expect(page.getByTestId('vault-total-profit-in')).toContainText('MASUK BRANKAS');
    await expect(page.getByTestId('vault-total-loss-out')).toContainText('KELUAR EKSTERNAL');
    await expect(page.getByTestId('vault-realtime-trade-ledger')).toBeVisible();
    expect(await page.getByTestId('vault-closed-trade-item').count()).toBeGreaterThanOrEqual(3);
    await page.getByTestId('vault-filter-PROFIT_IN').click();
    await page.getByTestId('vault-filter-LOSS_OUT').click();
    await page.getByTestId('vault-filter-ALL').click();

    // 4. Bloomberg News 90-100% Verified tab
    await page.getByTestId('forum-tab-news').click();
    await expect(page.getByTestId('forum-news-list')).toBeVisible();
    expect(await page.getByTestId('verified-news-item').count()).toBeGreaterThanOrEqual(4);

    // 5. All-Market Scanner tab
    await page.getByTestId('forum-tab-scanner').click();
    await expect(page.getByTestId('forum-all-market-scanner')).toBeVisible();

    // 6. Position Accuracy & Walk-Forward Backtest Audit tab (Distinct from Tab 4 Execution Audit)
    await page.getByTestId('forum-tab-accuracy-audit').click();
    await expect(page.getByTestId('forum-accuracy-audit-panel')).toBeVisible();
    await expect(page.getByTestId('accuracy-audit-kpis')).toBeVisible();
    await expect(page.getByTestId('vault-settlement-courier-3d-viz')).toHaveCount(0);
  });

  test('TOP GAINERS dynamic markets can execute precision entry directly into Active Positions', async ({
    page,
  }) => {
    await gotoDesk(page);
    await page.getByTestId('watchlist-sector-TOP_GAINERS').click();

    // Pick the first displayed Top Gainer market button
    const firstGainerBtn = page.locator('[data-testid^="market-"]').first();
    await expect(firstGainerBtn).toBeVisible();
    const gainerTestId = (await firstGainerBtn.getAttribute('data-testid')) || '';
    const gainerSymbol = gainerTestId.replace(/^market-/, '');
    expect(gainerSymbol.length).toBeGreaterThan(2);
    await firstGainerBtn.click();

    // Open 4-Agent Consensus Forum and execute precision entry
    await page.getByTestId('subtab-AGENT_BRAIN').click();
    const execBtn = page.getByTestId('forum-execute-consensus-btn');
    await expect(execBtn).toBeVisible();
    await expect(execBtn).toBeEnabled();
    await execBtn.click();

    // Confirm the Top Gainer position immediately appears inside ACTIVE POSITIONS dock
    const positionsDock = page.getByTestId('positions-dock');
    await expect(positionsDock).toContainText(gainerSymbol, { timeout: 5_000 });
  });
});
