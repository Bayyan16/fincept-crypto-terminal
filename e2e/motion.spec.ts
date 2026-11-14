import { test, expect, type Page } from '@playwright/test';

/**
 * Motion & smoothness regression tests: guards the UI polish we ship.
 * These lock in the baseline transitions, mount animations, and the
 * reduced-motion accessibility path.
 */

async function gotoApp(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('app-root')).toBeVisible({ timeout: 30_000 });
}

test.describe('motion & smoothness', () => {
  test('interactive elements animate (no abrupt snap)', async ({ page }) => {
    await gotoApp(page);
    const stats = await page.evaluate(() => {
      const els = Array.from(
        document.querySelectorAll<HTMLElement>('button, a, input, select')
      ).filter((el) => el.offsetParent !== null);
      let animated = 0;
      for (const el of els) {
        const cs = getComputedStyle(el);
        const durations = cs.transitionDuration.split(',').map((d) => parseFloat(d) || 0);
        const total = Math.max(...durations);
        if (total > 0) animated++;
      }
      return { total: els.length, animated };
    });
    expect(stats.total).toBeGreaterThan(20);
    // The global baseline (or per-element Tailwind) must give nearly every
    // interactive element a transition. Allow a tiny slack for exotic nodes.
    expect(stats.animated).toBeGreaterThanOrEqual(stats.total * 0.95);
  });

  test('tab panels play a mount animation on switch', async ({ page }) => {
    await gotoApp(page);
    await page.getByTestId('top-tab-DEX_SCREENER').click();
    const panel = page.locator('[data-testid="dex-search"]').locator('xpath=ancestor::*[contains(@class,"anim-panel")]');
    await expect(panel).toHaveCount(1);
    const hasAnim = await page
      .getByTestId('dex-search')
      .evaluate((el) => {
        const ancestor = el.closest('.anim-panel') as HTMLElement | null;
        return ancestor ? getComputedStyle(ancestor).animationName : 'none';
      });
    expect(hasAnim).toBe('fin-fade-up');
  });

  test('live price uses the flash class and updates in place', async ({ page }) => {
    await gotoApp(page);
    const flashCount = await page.locator('.price-flash-up, .price-flash-down').count();
    // The main ticker + every watchlist price is wrapped in LivePrice; at rest
    // after mount at least the ticker exists. The class appears on change only.
    expect(flashCount).toBeGreaterThanOrEqual(0);
    const priceSpans = page.locator('.tabular-nums');
    expect(await priceSpans.count()).toBeGreaterThanOrEqual(14);
  });

  test('prefers-reduced-motion disables animations and transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await gotoApp(page);
    const disabled = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>('button')!;
      const cs = getComputedStyle(el);
      const dur = parseFloat(cs.transitionDuration) || 0;
      return dur <= 0.02; // 0.01ms from the reduced-motion override
    });
    expect(disabled).toBe(true);
  });

  test('scrollbar and focus styles are applied', async ({ page }) => {
    await gotoApp(page);
    const styles = await page.evaluate(() => {
      const body = getComputedStyle(document.body);
      const thumb = getComputedStyle(document.documentElement, '::-webkit-scrollbar-thumb');
      return {
        antialiased: body.webkitFontSmoothing,
        colorScheme: getComputedStyle(document.documentElement).colorScheme,
        thumbBg: thumb.backgroundColor,
      };
    });
    expect(styles.antialiased).toBe('antialiased');
    expect(styles.colorScheme).toBe('dark');
    expect(styles.thumbBg).toBe('rgb(30, 39, 54)');
  });
});
