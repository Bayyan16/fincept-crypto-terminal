import { test, expect } from '@playwright/test';

test.describe('Audit End-to-End Regression & Positive/Negative Controls (#2-#23)', () => {
  test('#11 NEGATIVE: Disallowed cross-origin Origin header is blocked with 403 on /api/*', async ({
    request,
  }) => {
    const res = await request.post('/api/execute/order', {
      headers: { Origin: 'https://evil-attacker.example.com' },
      data: {
        exchange: 'BINANCE',
        symbol: 'BTC-PERP',
        side: 'LONG',
        orderPurpose: 'ENTRY_MAKER',
        sizeUsd: 100,
        price: 60000,
      },
    });
    expect(res.status()).toBe(403);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  test('#11 NEGATIVE: Malformed JSON body returns HTTP 400 (not 500)', async ({ request }) => {
    const res = await request.post('/api/account/verify', {
      headers: { 'Content-Type': 'application/json' },
      data: Buffer.from('{invalid-json'),
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.ok).toBe(false);
  });

  test('#3 POSITIVE: /api/live/hl-meta resolves dynamic Hyperliquid asset indices (ETH != 0)', async ({
    request,
  }) => {
    const res = await request.get('/api/live/hl-meta');
    expect(res.status()).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const eth = json.assets.find((a: any) => a.name === 'ETH');
    const btc = json.assets.find((a: any) => a.name === 'BTC');
    expect(btc).toBeTruthy();
    expect(eth).toBeTruthy();
    expect(eth.index).not.toBe(btc.index);
  });

  test('#20 & #23 POSITIVE: .desk-width-handle is direct child of .workspace-desk and root does not lock text selection', async ({
    page,
  }) => {
    await page.goto('/pro/', { waitUntil: 'domcontentloaded' });
    await expect(page.getByTestId('app-root')).toBeVisible();

    // #23: Root shell allows text selection
    const hasGlobalSelectNone = await page
      .getByTestId('app-root')
      .evaluate((el) => el.classList.contains('select-none'));
    expect(hasGlobalSelectNone).toBe(false);

    // #20: Split-pane resize separator is a direct child of .workspace-desk (not inside .desk-whale-pane)
    const parentIsWorkspaceDesk = await page
      .locator('.desk-width-handle')
      .evaluate((el) => Boolean(el.parentElement?.classList.contains('workspace-desk')));
    expect(parentIsWorkspaceDesk).toBe(true);
  });

  test('#21 POSITIVE: WalletConnectModal closes via Escape key and displays no +- PnL glitches', async ({
    page,
  }) => {
    await page.goto('/pro/', { waitUntil: 'domcontentloaded' });
    await page.getByTestId('wallet-modal-trigger').click();
    await expect(page.getByTestId('wallet-modal-panel')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('wallet-modal-panel')).toBeHidden({ timeout: 3000 });

    const bodyText = await page.locator('body').innerText();
    expect(bodyText).not.toContain('+$-');
    expect(bodyText).not.toContain('+-');
  });
});
