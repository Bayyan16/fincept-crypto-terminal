import { openExpandedDesk } from './helpers';
import { test, expect, type Page } from '@playwright/test';

/**
 * Comprehensive Mobile Android & iPhone UI/UX & Touch/Pointer Drag-and-Drop E2E Suite.
 * Covers small Android (Galaxy A55 360x800), compact iPhone (iPhone SE 375x667),
 * tall Android (Galaxy Z Fold 6 412x915), and flagship iPhone (iPhone 16 Pro Max 440x956).
 */

const MOBILE_DEVICES = [
  { name: 'Android Galaxy A55 (360x800)', width: 360, height: 800 },
  { name: 'iPhone SE (375x667)', width: 375, height: 667 },
  { name: 'Android Galaxy Z Fold 6 (412x915)', width: 412, height: 915 },
  { name: 'iPhone 16 Pro Max (440x956)', width: 440, height: 956 },
] as const;

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const metrics = await page.evaluate(() => {
    const doc = document.documentElement;
    return {
      innerWidth: window.innerWidth,
      docClientWidth: doc.clientWidth,
      docScrollWidth: doc.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      bodyOverflowY: getComputedStyle(document.body).overflowY,
    };
  });
  expect(metrics.bodyOverflowY, `${label}: body vertical scroll must not be locked`).not.toBe('hidden');
  expect(
    metrics.docScrollWidth,
    `${label}: documentElement scrollWidth (${metrics.docScrollWidth}) exceeded viewport (${metrics.docClientWidth})`
  ).toBeLessThanOrEqual(metrics.docClientWidth + 1);
  expect(
    metrics.bodyScrollWidth,
    `${label}: body scrollWidth (${metrics.bodyScrollWidth}) exceeded viewport (${metrics.docClientWidth})`
  ).toBeLessThanOrEqual(metrics.docClientWidth + 1);
}

test.describe('mobile android & iphone ux and drag-and-drop', () => {
  for (const device of MOBILE_DEVICES) {
    test(`${device.name}: seamless layout, single-row swipeable nav, full-width chart, zero overflow across all 5 tabs`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: device.width, height: device.height });
      await openExpandedDesk(page);
      await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 30_000 });

      // 1. Compact single-row horizontal swipeable nav (not 5 stacked rows)
      const navBox = await page.locator('nav').first().boundingBox();
      expect(navBox).not.toBeNull();
      expect(navBox!.height).toBeLessThan(64);

      // 2. Full-width candlestick chart (no side-by-side 3-col squishing)
      const chartSvg = page.getByTestId('chart-svg');
      await expect(chartSvg).toBeVisible();
      const chartBox = await chartSvg.boundingBox();
      expect(chartBox).not.toBeNull();
      expect(chartBox!.width).toBeGreaterThanOrEqual(device.width - 48);

      // 3. Zero horizontal overflow & unlocked vertical scroll across all 5 tabs
      await assertNoHorizontalOverflow(page, `${device.name} Tab 1 Desk`);

      for (const tabId of [
        'DEX_SCREENER',
        'AGENT_SKILLS',
        'PORTFOLIO_LOG',
        'PORTFOLIO_PROFILE',
        'TERMINAL_DESK',
      ] as const) {
        const tabBtn = page.getByTestId(`top-tab-${tabId}`);
        await tabBtn.scrollIntoViewIfNeeded();
        await tabBtn.click();
        await page.waitForTimeout(150);
        await assertNoHorizontalOverflow(page, `${device.name} ${tabId}`);
      }
    });
  }

  test('mobile touch/pointer drag-and-drop works on Candlestick Chart, Whale Node Canvas, and Positions Dock', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 }); // iPhone 14 / 15 / 16 baseline
    await openExpandedDesk(page);
    await expect(page.getByTestId('chart-svg')).toBeVisible({ timeout: 30_000 });

    // 1. Drag Candlestick Chart 2D (pan across time + price mark) via Pointer Events
    const chartSvg = page.getByTestId('chart-svg');
    await chartSvg.scrollIntoViewIfNeeded();
    const chartBox = (await chartSvg.boundingBox())!;
    const cx = chartBox.x + chartBox.width * 0.45;
    const cy = chartBox.y + chartBox.height * 0.5;

    const beforePricePan = Number((await chartSvg.getAttribute('data-price-pan')) || '0');

    // Dispatch touch-type PointerEvents (matching Android/iPhone touch drag)
    await chartSvg.dispatchEvent('pointerdown', {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: cx,
      clientY: cy,
      bubbles: true,
    });
    for (let step = 1; step <= 6; step++) {
      await chartSvg.dispatchEvent('pointermove', {
        pointerId: 1,
        pointerType: 'touch',
        isPrimary: true,
        clientX: cx + step * 14,
        clientY: cy + step * 10,
        bubbles: true,
      });
      await page.waitForTimeout(20);
    }
    await chartSvg.dispatchEvent('pointerup', {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      clientX: cx + 84,
      clientY: cy + 60,
      bubbles: true,
    });
    await page.waitForTimeout(120);

    const afterPricePan = Number((await chartSvg.getAttribute('data-price-pan')) || '0');
    expect(Math.abs(afterPricePan - beforePricePan)).toBeGreaterThan(0.05);

    // 2. Drag Positions Dock handle via touch PointerEvents
    const dock = page.getByTestId('positions-dock');
    const dockHandle = page.getByTestId('positions-dock-handle');
    await dockHandle.scrollIntoViewIfNeeded();
    const beforeDockH = await dock.evaluate((el) => el.getBoundingClientRect().height);
    const handleBox = (await dockHandle.boundingBox())!;
    const hx = handleBox.x + handleBox.width / 2;
    const hy = handleBox.y + handleBox.height / 2;

    await dockHandle.dispatchEvent('pointerdown', {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: true,
      clientX: hx,
      clientY: hy,
      bubbles: true,
    });
    await page.evaluate(
      ({ startX, startY }) => {
        for (let i = 1; i <= 5; i++) {
          window.dispatchEvent(
            new PointerEvent('pointermove', {
              pointerId: 2,
              pointerType: 'touch',
              isPrimary: true,
              clientX: startX,
              clientY: startY - i * 16,
              bubbles: true,
            })
          );
        }
        window.dispatchEvent(
          new PointerEvent('pointerup', {
            pointerId: 2,
            pointerType: 'touch',
            isPrimary: true,
            clientX: startX,
            clientY: startY - 80,
            bubbles: true,
          })
        );
      },
      { startX: hx, startY: hy }
    );
    await page.waitForTimeout(250);
    const afterDockH = await dock.evaluate((el) => el.getBoundingClientRect().height);
    expect(afterDockH).toBeGreaterThan(beforeDockH);

    // 3. Drag Whale Topology Node via touch PointerEvents
    await page.getByRole('button', { name: 'Jeda orbit' }).click();
    const coreNode = page.getByTestId('viz-node-HYPERLIQUID');
    await coreNode.scrollIntoViewIfNeeded();
    await expect(coreNode).toBeVisible();
    const beforeX = Number((await coreNode.getAttribute('data-node-x')) || '0');
    const beforeY = Number((await coreNode.getAttribute('data-node-y')) || '0');
    const nodeBox = (await coreNode.boundingBox())!;
    const nx = nodeBox.x + nodeBox.width / 2;
    const ny = nodeBox.y + nodeBox.height / 2;

    await coreNode.dispatchEvent('pointerdown', {
      pointerId: 3,
      pointerType: 'touch',
      isPrimary: true,
      clientX: nx,
      clientY: ny,
      bubbles: true,
    });
    for (let step = 1; step <= 6; step++) {
      await coreNode.dispatchEvent('pointermove', {
        pointerId: 3,
        pointerType: 'touch',
        isPrimary: true,
        clientX: nx + step * 10,
        clientY: ny + step * 8,
        bubbles: true,
      });
      await page.waitForTimeout(20);
    }
    await coreNode.dispatchEvent('pointerup', {
      pointerId: 3,
      pointerType: 'touch',
      isPrimary: true,
      clientX: nx + 60,
      clientY: ny + 48,
      bubbles: true,
    });
    await page.waitForTimeout(120);

    const afterX = Number((await coreNode.getAttribute('data-node-x')) || '0');
    const afterY = Number((await coreNode.getAttribute('data-node-y')) || '0');
    expect(Math.hypot(afterX - beforeX, afterY - beforeY)).toBeGreaterThan(15);
  });
});
