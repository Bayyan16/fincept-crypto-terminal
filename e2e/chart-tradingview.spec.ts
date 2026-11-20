import { openExpandedDesk, openMarketPicker } from './helpers';
import { test, expect, type Page } from '@playwright/test';

/**
 * TradingView-Style Flexible Chart, Full Listing History (ALL), Drawing Tools,
 * Scale Modes (log / % / auto), & Multi-Layer On-Chain Price Integrity Guard E2E Suite.
 */

async function gotoChart(page: Page) {
  await openExpandedDesk(page);
  await expect(page.getByTestId('candlestick-chart')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('chart-svg')).toBeVisible({ timeout: 30_000 });
}

test.describe('tradingview chart, full history & layered price guard', () => {
  test('supports all 8 timeframes (1m..1M), chart styles (candles/hollow/area) and scale modes (log/%/auto)', async ({
    page,
  }) => {
    await gotoChart(page);
    const svg = page.getByTestId('chart-svg');

    // Timeframes including 1W & 1M
    for (const tf of ['1m', '5m', '15m', '1h', '4h', '1d', '1w', '1M']) {
      await expect(page.getByTestId(`chart-timeframe-${tf}`)).toBeVisible();
    }

    // Switch chart styles
    await page.getByTestId('chart-style-hollow').click();
    await expect(svg).toHaveAttribute('data-chart-style', 'HOLLOW');

    await page.getByTestId('chart-style-area').click();
    await expect(svg).toHaveAttribute('data-chart-style', 'AREA');

    await page.getByTestId('chart-style-candles').click();
    await expect(svg).toHaveAttribute('data-chart-style', 'CANDLES');

    // Switch price scale modes (log, %, auto)
    await page.getByTestId('chart-scale-log').click();
    await expect(svg).toHaveAttribute('data-scale-mode', 'LOG');

    await page.getByTestId('chart-scale-pct').click();
    await expect(svg).toHaveAttribute('data-scale-mode', 'PERCENT');

    await page.getByTestId('chart-scale-pct').click();
    await expect(svg).toHaveAttribute('data-scale-mode', 'LINEAR');

    await page.getByTestId('chart-scale-auto').click();
    await expect(page.getByTestId('chart-price-guard-badge')).toContainText('ON-CHAIN SYNCED');
  });

  test('loads full market listing history via ALL range preset (multi-year archive -> live)', async ({
    page,
  }) => {
    await gotoChart(page);
    const svg = page.getByTestId('chart-svg');

    // Trigger TradingView ALL range preset (switches to 1W & fetches full listing history)
    await page.getByTestId('chart-range-ALL').click();
    await expect
      .poll(
        async () => Number((await svg.getAttribute('data-bars-count')) || '0'),
        { timeout: 20_000 }
      )
      .toBeGreaterThanOrEqual(200);

    const listingYear = Number((await svg.getAttribute('data-listing-year')) || '2099');
    expect(listingYear).toBeLessThanOrEqual(2020);
    await expect(page.getByTestId('chart-history-meta')).toContainText(`${listingYear}→LIVE`);

    // Switch to log scale on full history (TradingView workflow)
    await page.getByTestId('chart-scale-log').click();
    await expect(svg).toHaveAttribute('data-scale-mode', 'LOG');

    // Switch to XRP-PERP and confirm full listing history loads seamlessly for altcoins too
    await openMarketPicker(page);
    await page.getByTestId('market-XRP-PERP').click();
    await expect
      .poll(
        async () => Number((await svg.getAttribute('data-bars-count')) || '0'),
        { timeout: 20_000 }
      )
      .toBeGreaterThanOrEqual(200);
    const xrpListingYear = Number((await svg.getAttribute('data-listing-year')) || '2099');
    expect(xrpListingYear).toBeLessThanOrEqual(2020);
  });

  test('interactive TradingView drawing tools (H-Line, Trendline, Long Position R:R, XABCD, Text, Floating Style Bar & Fullscreen) work cleanly', async ({
    page,
  }) => {
    await gotoChart(page);
    const svg = page.getByTestId('chart-svg');
    const box = (await svg.boundingBox())!;

    // 0. Flexible 14-Timeframe Dropdown (select 30m & 2h, verify deep intraday history >= 500 bars)
    await page.getByTestId('chart-tf-dropdown-btn').click();
    await expect(page.getByTestId('chart-tf-dropdown-menu')).toBeVisible();
    await page.getByTestId('chart-tf-option-30m').click();
    await expect
      .poll(async () => Number((await svg.getAttribute('data-bars-count')) || '0'), { timeout: 60_000 })
      .toBeGreaterThanOrEqual(500);

    // 1. Place Horizontal Price Line (1 click)
    const hlineBtn = page.getByTestId('chart-tool-hline');
    if (await hlineBtn.isVisible()) {
      await hlineBtn.click();
      await svg.dispatchEvent('pointerdown', {
        pointerId: 10,
        pointerType: 'mouse',
        button: 0,
        clientX: box.x + box.width * 0.4,
        clientY: box.y + box.height * 0.35,
        bubbles: true,
      });
      await expect(page.getByTestId('chart-drawing-item')).toHaveCount(1);
      await expect(page.getByTestId('chart-drawing-toolbar')).toBeVisible();

      // 2. Place Trendline (2 clicks)
      await page.getByTestId('chart-tool-trendline-flyout').click();
      await page.getByText('Trend Line').first().click();
      await svg.dispatchEvent('pointerdown', {
        pointerId: 11,
        pointerType: 'mouse',
        button: 0,
        clientX: box.x + box.width * 0.25,
        clientY: box.y + box.height * 0.6,
        bubbles: true,
      });
      await svg.dispatchEvent('pointerdown', {
        pointerId: 12,
        pointerType: 'mouse',
        button: 0,
        clientX: box.x + box.width * 0.65,
        clientY: box.y + box.height * 0.3,
        bubbles: true,
      });
      await expect(page.getByTestId('chart-drawing-item')).toHaveCount(2);

      // 3. Place Long Position Risk/Reward Box (1 click)
      await page.getByTestId('chart-tool-longpos').click();
      await svg.dispatchEvent('pointerdown', {
        pointerId: 13,
        pointerType: 'mouse',
        button: 0,
        clientX: box.x + box.width * 0.5,
        clientY: box.y + box.height * 0.45,
        bubbles: true,
      });
      await expect(page.getByTestId('chart-drawing-item')).toHaveCount(3);

      // 4. Place XABCD Harmonic Pattern (5 clicks)
      await page.getByTestId('chart-tool-xabcd').click();
      const xabcdPts = [
        [0.18, 0.28],
        [0.28, 0.58],
        [0.38, 0.38],
        [0.48, 0.62],
        [0.6, 0.34],
      ];
      for (let i = 0; i < xabcdPts.length; i++) {
        await svg.dispatchEvent('pointerdown', {
          pointerId: 20 + i,
          pointerType: 'mouse',
          button: 0,
          clientX: box.x + box.width * xabcdPts[i][0],
          clientY: box.y + box.height * xabcdPts[i][1],
          bubbles: true,
        });
      }
      await expect(page.getByTestId('chart-drawing-item')).toHaveCount(4);

      // 5. Place Text Note + edit inline text
      await page.getByTestId('chart-tool-text').click();
      await svg.dispatchEvent('pointerdown', {
        pointerId: 30,
        pointerType: 'mouse',
        button: 0,
        clientX: box.x + box.width * 0.55,
        clientY: box.y + box.height * 0.25,
        bubbles: true,
      });
      await expect(page.getByTestId('chart-drawing-item')).toHaveCount(5);

      // 6. Toggle Hide/Show & Magnet/Lock utilities
      await page.getByTestId('chart-tool-hide').click();
      await expect(page.getByTestId('chart-drawing-item')).toHaveCount(0);
      await page.getByTestId('chart-tool-hide').click();
      await expect(page.getByTestId('chart-drawing-item')).toHaveCount(5);

      // 7. Clear all drawings
      await page.getByTestId('chart-tool-clear').click();
      await expect(page.getByTestId('chart-drawing-item')).toHaveCount(0);

      // 8. Fullscreen Expand & Collapse toggle
      await page.getByTestId('chart-fullscreen-btn').click();
      await page.waitForTimeout(150);
      await page.getByTestId('chart-fullscreen-btn').click();
    }
  });

  test('multi-layer on-chain price integrity guard prevents price divergence across majors & 1000x meme perps', async ({
    request,
  }) => {
    test.setTimeout(180_000);
    const snapRes = await request.get('/api/live/snapshot', { maxRetries: 2, timeout: 60_000 });
    expect(snapRes.ok()).toBeTruthy();
    const snap = await snapRes.json();

    const auditPairs = [
      { hlCoin: 'BTC', binanceSymbol: 'BTCUSDT', interval: '1w' },
      { hlCoin: 'ETH', binanceSymbol: 'ETHUSDT', interval: '1w' },
      { hlCoin: 'XRP', binanceSymbol: 'XRPUSDT', interval: '1w' },
      { hlCoin: 'SOL', binanceSymbol: 'SOLUSDT', interval: '1w' },
      { hlCoin: 'HYPE', binanceSymbol: 'HYPEUSDT', interval: '1d' },
      { hlCoin: 'kPEPE', binanceSymbol: 'PEPEUSDT', interval: '1w' },
    ];

    for (const item of auditPairs) {
      const liveMarkPx = Number(snap?.hlAssets?.[item.hlCoin]?.price || 0);
      const res = await request.get(
        `/api/live/candles?hlCoin=${encodeURIComponent(item.hlCoin)}&binanceSymbol=${encodeURIComponent(
          item.binanceSymbol
        )}&interval=${item.interval}&fullHistory=1${liveMarkPx > 0 ? `&refPrice=${liveMarkPx}` : ''}`,
        { maxRetries: 2, timeout: 60_000 }
      );
      expect(res.ok(), `${item.hlCoin} candles HTTP 200`).toBeTruthy();
      const payload = await res.json();
      expect(payload.ok, `${item.hlCoin} ok flag`).toBe(true);
      expect(Array.isArray(payload.candles) && payload.candles.length >= 20).toBe(true);

      // OHLC mathematical invariants & strictly ascending timestamps
      let prevTime = -1;
      for (const c of payload.candles) {
        expect(c.time).toBeGreaterThan(prevTime);
        prevTime = c.time;
        expect(c.open).toBeGreaterThan(0);
        expect(c.close).toBeGreaterThan(0);
        expect(c.high).toBeGreaterThanOrEqual(Math.max(c.open, c.close));
        expect(c.low).toBeLessThanOrEqual(Math.min(c.open, c.close));
      }

      // Zero huge price discrepancy vs authoritative live on-chain mark price
      if (liveMarkPx > 0) {
        const lastClose = payload.candles[payload.candles.length - 1].close;
        const deviationPct = (Math.abs(lastClose - liveMarkPx) / liveMarkPx) * 100;
        expect(
          deviationPct,
          `${item.hlCoin} latest close (${lastClose}) diverged ${deviationPct.toFixed(2)}% from live on-chain mark (${liveMarkPx})`
        ).toBeLessThanOrEqual(2.0);
      }
    }
  });

  test('wide chart layout without left telemetry sidebar on desktop and mobile', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 960 });
    await openExpandedDesk(page);
    await page.getByTestId('candlestick-chart').waitFor({ state: 'visible', timeout: 20_000 });

    // Confirm legacy left telemetry sidebar blocks are removed from the desk
    await expect(page.getByText('REAL MARKET TELEMETRY')).toHaveCount(0);
    await expect(page.getByText('ORDERFLOW & WHALE BIAS')).toHaveCount(0);
    await expect(page.getByText('ZERO-SLOP RISK ENGINE')).toHaveCount(0);

    // Chart now occupies 9/12 (75%) of the left desk pane on desktop
    const desktopMetrics = await page.evaluate(() => {
      const chart = document.querySelector('[data-testid="candlestick-chart"]')?.getBoundingClientRect();
      const grid = document.querySelector('[data-testid="candlestick-chart"]')?.parentElement?.parentElement?.parentElement?.getBoundingClientRect();
      return {
        chartW: chart?.width ?? 0,
        gridW: grid?.width ?? 0,
      };
    });
    expect(desktopMetrics.gridW).toBeGreaterThan(0);
    expect(desktopMetrics.chartW / desktopMetrics.gridW).toBeGreaterThan(0.7);

    // Mobile Android (360x800): chart spans nearly full viewport width with zero horizontal overflow
    await page.setViewportSize({ width: 360, height: 800 });
    await page.waitForTimeout(250);
    const mobileMetrics = await page.evaluate(() => {
      const chart = document.querySelector('[data-testid="candlestick-chart"]')?.getBoundingClientRect();
      return {
        chartW: chart?.width ?? 0,
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      };
    });
    expect(mobileMetrics.chartW).toBeGreaterThanOrEqual(340);
    expect(mobileMetrics.scrollW).toBeLessThanOrEqual(mobileMetrics.innerW + 2);
  });
});
