import { expect, type Page } from '@playwright/test';

export async function openExpandedDesk(page: Page) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('app-root')).toBeVisible();
  const pipeline = page.getByRole('button', { name: 'Whale Pipeline', exact: true });
  if (await pipeline.getAttribute('aria-pressed') === 'false') await pipeline.click();
  const controls = page.getByRole('button', { name: 'Kontrol trading', exact: true });
  if (await controls.getAttribute('aria-pressed') === 'false') await controls.click();
}

export async function openMarketPicker(page: Page) {
  const picker = page.locator('.market-picker');
  if (!(await picker.evaluate((element) => (element as HTMLDetailsElement).open))) {
    await picker.locator('summary').click();
  }
}
