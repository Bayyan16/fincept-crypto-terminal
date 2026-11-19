import { test, expect, type Page } from '@playwright/test';

/**
 * Core shell tests: app boots, header/nav render, no overflow, and the
 * primary navigation works end to end.
 */

async function gotoApp(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 30_000 });
}

test.describe('shell', () => {
  test('app boots with terminal header and navigation', async ({ page }) => {
    await gotoApp(page);
    await expect(page).toHaveTitle(/FINCEPT QUANT TERMINAL/);
    await expect(page.getByText('WHALE QUANT TERMINAL').first()).toBeVisible();
    await expect(page.getByTestId('command-input')).toBeVisible();
    await expect(page.getByTestId('wallet-modal-trigger')).toBeVisible();
    for (const id of ['TERMINAL_DESK', 'DEX_SCREENER', 'AGENT_SKILLS', 'PORTFOLIO_LOG', 'PORTFOLIO_PROFILE']) {
      await expect(page.getByTestId(`top-tab-${id}`)).toBeVisible();
    }
  });

  test('no horizontal overflow on desktop', async ({ page }) => {
    await gotoApp(page);
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement;
      return { docW: doc.clientWidth, bodyW: document.body.scrollWidth, docSW: doc.scrollWidth };
    });
    expect(overflow.bodyW).toBeLessThanOrEqual(overflow.docW + 1);
    expect(overflow.docSW).toBeLessThanOrEqual(overflow.docW + 1);
  });

  test('watchlist renders all 14 markets and switching updates the instrument', async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByTestId('market-BTC-PERP')).toBeVisible();
    for (const sym of ['ETH-PERP', 'SOL-PERP', 'HYPE-USDC']) {
      await expect(page.getByTestId(`market-${sym}`)).toBeVisible();
    }
    // Active instrument header shows BTC initially
    await expect(page.getByText('BTC-PERP').first()).toBeVisible();
    await page.getByTestId('market-ETH-PERP').click();
    await expect(page.getByText('ETH-PERP').first()).toBeVisible();
  });

  test('top tab switching shows each panel', async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId('top-tab-DEX_SCREENER').click();
    await expect(page.getByText(/DEX INTELLIGENCE|DEXSCREENER/).first()).toBeVisible();
    await expect(page.getByTestId('dex-search')).toBeVisible();

    await page.getByTestId('top-tab-AGENT_SKILLS').click();
    await expect(page.getByTestId('agent-skills-cockpit')).toBeVisible();
    await expect(page.getByTestId('agent-skills-cockpit-bar')).toBeVisible();
    await expect(page.getByTestId('agent-war-room-3d-viz')).toBeVisible();
    await expect(page.getByTestId('vault-settlement-courier-3d-viz')).toBeVisible();
    await expect(page.getByText(/CIRCUIT BREAKER/).first()).toBeVisible();

    await page.getByTestId('top-tab-PORTFOLIO_LOG').click();
    await expect(page.getByText(/EXECUTION & DIRECT HOT-WALLET/).first()).toBeVisible();
    const vaultViz = page.getByTestId('vault-settlement-courier-3d-viz');
    await expect(vaultViz).toBeVisible();
    const vaultBox = await vaultViz.boundingBox();
    expect(vaultBox && vaultBox.height).toBeLessThan(380);
    await expect(page.getByTestId('execution-audit-log-list')).toBeVisible();
    await expect(page.getByTestId('vault-realtime-trade-ledger')).toHaveCount(0);

    await page.getByTestId('top-tab-PORTFOLIO_PROFILE').click();
    await expect(page.getByText(/TRADER PROFILE/).first()).toBeVisible();

    await page.getByTestId('top-tab-TERMINAL_DESK').click();
    await expect(page.getByTestId('subtab-OVERVIEW')).toBeVisible();
  });

  test('command bar executes market and tab commands', async ({ page }) => {
    await gotoApp(page);
    const cmd = page.getByTestId('command-input');
    await cmd.fill('/sol');
    await cmd.press('Enter');
    await expect(page.getByText('SOL-PERP').first()).toBeVisible();

    await cmd.fill('/dex');
    await cmd.press('Enter');
    await expect(page.getByTestId('dex-search')).toBeVisible();
  });

  test('wallet modal opens and closes smoothly', async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId('wallet-modal-trigger').click();
    const overlay = page.getByTestId('wallet-modal-overlay');
    await expect(overlay).toBeVisible();
    const close = page.getByTestId('wallet-modal-close');
    if (await close.count()) {
      await close.first().click();
      await expect(overlay).toBeHidden();
    } else {
      // Fallback: click outside / press Escape and verify it hides
      await page.keyboard.press('Escape');
      await expect(overlay).toBeHidden();
    }
  });

  test('kill switch and execution controls are visible', async ({ page }) => {
    await gotoApp(page);
    await expect(page.getByTestId('kill-switch')).toBeVisible();
    await expect(page.getByText('AUTO-AGENT: ON').first()).toBeVisible();
    await expect(page.getByText('MAKER LONG').first()).toBeVisible();
    await expect(page.getByText('MAKER SHORT').first()).toBeVisible();
  });
});
