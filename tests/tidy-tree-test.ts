import { chromium } from 'playwright';

const BASE = 'http://localhost:3003';
const ALLEGRO_ID = '58bec779c59ff20df8c89805';

async function testTidyTree() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  // Navigate to Allegro LDN
  console.log('Opening Allegro LDN...');
  await page.goto(`${BASE}/#object/${ALLEGRO_ID}`);
  await page.waitForTimeout(2000);

  // Switch to Tidy Tree view
  const layoutSelect = page.locator('select').last();
  await layoutSelect.selectOption({ label: 'Tidy Tree (D3)' });
  await page.waitForTimeout(2000);

  // Take screenshot
  await page.screenshot({ path: 'tests/tidy-tree-allegro.png', fullPage: false });
  console.log('Screenshot: tests/tidy-tree-allegro.png');

  // Check tree structure
  const svgEl = page.locator('.tidy-tree-svg svg');
  const exists = await svgEl.count();
  console.log('SVG exists:', exists > 0);

  // Count nodes and group nodes
  const allNodes = await page.locator('.tidy-tree-svg svg g.node').count();
  console.log('Total nodes in tree:', allNodes);

  // Check for group labels (italic text = branch labels)
  const groupLabels = await page.evaluate(() => {
    const texts = document.querySelectorAll('.tidy-tree-svg svg g.node text[font-style="italic"]');
    return Array.from(texts).map(t => t.textContent);
  });
  console.log('Branch groups:', groupLabels);

  // Check tree depth: measure unique X positions (horizontal = depth levels)
  const xPositions = await page.evaluate(() => {
    const nodes = document.querySelectorAll('.tidy-tree-svg svg g.node');
    const xs = new Set<number>();
    for (const n of nodes) {
      const transform = n.getAttribute('transform') ?? '';
      const match = transform.match(/translate\(([^,]+),/);
      if (match) xs.add(Math.round(parseFloat(match[1]) / 50) * 50); // bucket by 50px
    }
    return Array.from(xs).sort((a, b) => a - b);
  });
  console.log('Depth levels (unique X buckets):', xPositions.length, xPositions);

  const success = xPositions.length >= 3;
  console.log(success ? 'PASS: Tree has multiple depth levels (branches!)' : 'FAIL: Tree is still flat');

  await page.waitForTimeout(5000); // Keep open for visual inspection
  await browser.close();
  process.exit(success ? 0 : 1);
}

testTidyTree().catch(e => { console.error(e); process.exit(1); });
