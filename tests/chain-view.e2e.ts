/**
 * E2E test for Chain Analysis View
 * Requires server running on localhost:3002
 * Run: npx playwright test tests/chain-view.e2e.ts
 */
import { test, expect } from 'playwright/test';

const BASE = 'http://localhost:3002';

test.describe('Chain Analysis View', () => {

  async function openAppAndSelectChain(page: import('playwright/test').Page) {
    await page.goto(BASE);
    await page.waitForLoadState('networkidle');

    // Filter sidebar for PowerBrowser
    const filterInput = page.locator('input[placeholder*="Filter"]');
    await expect(filterInput).toBeVisible({ timeout: 5000 });
    await filterInput.fill('PowerBrowser');
    await page.waitForTimeout(1000);

    // Click on "PowerBrowser LDN" in the sidebar
    const pbItem = page.locator('text=PowerBrowser LDN').first();
    await expect(pbItem).toBeVisible({ timeout: 5000 });
    await pbItem.click();
    await page.waitForTimeout(1500);

    // Click on "Graph" sub-tab to show the graph view
    const graphTab = page.locator('text=Graph').first();
    await expect(graphTab).toBeVisible({ timeout: 5000 });
    await graphTab.click();
    await page.waitForTimeout(1500);

    // Now the layout select should be visible
    const layoutSelect = page.locator('select').first();
    await expect(layoutSelect).toBeVisible({ timeout: 10000 });

    // Select "Ketenanalyse"
    await layoutSelect.selectOption('chain');
    await page.waitForTimeout(2000);

    return layoutSelect;
  }

  test('should load chain view with collapsible tree', async ({ page }) => {
    await openAppAndSelectChain(page);

    // SVG should be rendered with chain nodes
    const svg = page.locator('.chain-view-container svg').first();
    await expect(svg).toBeVisible({ timeout: 10000 });

    const chainNodes = svg.locator('g.chain-node');
    const nodeCount = await chainNodes.count();
    expect(nodeCount).toBeGreaterThan(1);

    // Root node should mention PowerBrowser
    const allText = await svg.locator('text').allTextContents();
    const hasPB = allText.some(t => t.includes('PowerBrowser'));
    expect(hasPB).toBe(true);

    await page.screenshot({ path: 'test-results/chain-loaded.png', fullPage: true });
  });

  test('should show 4 filter preset buttons', async ({ page }) => {
    await openAppAndSelectChain(page);

    await expect(page.locator('button').filter({ hasText: 'Alles' }).first()).toBeVisible({ timeout: 5000 });
    await expect(page.locator('button').filter({ hasText: 'Infrastructuur' }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Datastromen' }).first()).toBeVisible();
    await expect(page.locator('button').filter({ hasText: 'Processen' }).first()).toBeVisible();
  });

  test('should switch filter presets and still render', async ({ page }) => {
    await openAppAndSelectChain(page);

    const svg = page.locator('.chain-view-container svg').first();
    await expect(svg).toBeVisible({ timeout: 10000 });

    // Switch to Infrastructuur
    await page.locator('button').filter({ hasText: 'Infrastructuur' }).first().click();
    await page.waitForTimeout(2000);
    await expect(svg).toBeVisible();
    await page.screenshot({ path: 'test-results/chain-infra.png', fullPage: true });

    // Switch to Processen
    await page.locator('button').filter({ hasText: 'Processen' }).first().click();
    await page.waitForTimeout(2000);
    await expect(svg).toBeVisible();

    // Switch back to Alles
    await page.locator('button').filter({ hasText: 'Alles' }).first().click();
    await page.waitForTimeout(2000);
    await expect(svg).toBeVisible();
  });

  test('should have clickable expanding nodes', async ({ page }) => {
    await openAppAndSelectChain(page);

    const svg = page.locator('.chain-view-container svg').first();
    const chainNodes = svg.locator('g.chain-node');
    const count = await chainNodes.count();
    expect(count).toBeGreaterThan(1);

    // Click a non-root node to trigger expand/collapse
    if (count > 2) {
      await chainNodes.nth(2).click({ force: true });
      await page.waitForTimeout(2000);
      await expect(svg).toBeVisible();
      await page.screenshot({ path: 'test-results/chain-expanded.png', fullPage: true });
    }
  });
});
