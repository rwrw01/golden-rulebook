/**
 * E2E test: GGM (Gemeentelijk Gegevensmodel) view
 * Tests the GGM sidebar and domain detail view in the BlueDolphin SPA.
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:3002';

async function testGgmView() {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  const issues: string[] = [];

  // ─── Step 1: Open the app ───────────────────────────────────────────────────
  console.log('\n[1] Opening', BASE);
  await page.goto(BASE);
  await page.waitForTimeout(2000);

  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.screenshot({ path: 'tests/ggm-01-initial.png' });
  console.log('    Screenshot saved: tests/ggm-01-initial.png');

  // ─── Step 2: Verify /api/ggm endpoint ──────────────────────────────────────
  console.log('\n[2] Checking /api/ggm endpoint…');

  interface GgmApiOverview {
    totalApps?: number;
    classifiedApps?: number;
    coverage?: number;
    unclassifiedCount?: number;
    domains?: Array<{ id: string; name: string; color: string; appCount: number }>;
    unclassified?: { appCount: number; functionCount: number };
  }

  const apiOverview = await page.evaluate(async () => {
    const res = await fetch('/api/ggm');
    const text = await res.text();
    let parsed: unknown = null;
    let parseError = '';
    try { parsed = JSON.parse(text); } catch (e: unknown) { parseError = String(e); }
    return { status: res.status, parsed, parseError };
  }) as { status: number; parsed: GgmApiOverview | null; parseError: string };

  console.log('    HTTP status:', apiOverview.status);
  if (apiOverview.parseError) {
    console.log('    FAIL: JSON parse error:', apiOverview.parseError);
    issues.push('API /api/ggm: invalid JSON response');
  } else {
    const data = apiOverview.parsed!;
    console.log('    Response keys:', Object.keys(data).join(', '));
    console.log('    totalApps:', data.totalApps);
    console.log('    classifiedApps:', data.classifiedApps);
    console.log('    coverage:', data.coverage, '%');
    console.log('    domains array length:', data.domains?.length ?? 'missing');
    console.log('    has "unclassified" key (expected by sidebar):', 'unclassified' in data);

    if (data.domains && data.domains.length > 0) {
      console.log('    PASS: /api/ggm returns domain data');
      console.log('    Sample domains:', data.domains.slice(0, 3).map(d => d.name).join(', '));
    } else {
      issues.push('API /api/ggm: domains array is empty or missing');
    }

    // Structural mismatch check: sidebar expects { domains, unclassified: { appCount, functionCount } }
    // API returns { totalApps, classifiedApps, coverage, domains, unclassifiedCount }
    if (!('unclassified' in data)) {
      console.log('\n    STRUCTURAL MISMATCH DETECTED:');
      console.log('    Sidebar (ggm.ts) expects: { domains: GgmDomain[], unclassified: { appCount, functionCount } }');
      console.log('    API actually returns:      { totalApps, classifiedApps, coverage, domains, unclassifiedCount }');
      console.log('    -> "unclassified" key is missing from API response');
      console.log('    -> This will not cause a crash, but sidebar renders ok (cast to GgmOverview)');
    }
  }

  // ─── Step 3: Inspect activity bar buttons ──────────────────────────────────
  console.log('\n[3] Inspecting activity bar buttons…');
  const activityButtons = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('.activity-bar button'));
    return buttons.map((btn, i) => ({
      index: i,
      title: btn.getAttribute('title') ?? '',
      isActive: btn.classList.contains('active'),
    }));
  });
  console.log('    Found', activityButtons.length, 'buttons:');
  for (const btn of activityButtons) {
    console.log(`      [${btn.index}] "${btn.title}" active=${btn.isActive}`);
  }

  // ─── Step 4: Find and click the GGM button ─────────────────────────────────
  console.log('\n[4] Looking for GGM button…');
  const ggmBtnInfo = activityButtons.find(btn => btn.title.toLowerCase().includes('ggm'));

  if (!ggmBtnInfo) {
    console.log('    FAIL: No GGM button found in activity bar');
    issues.push('Activity bar: no GGM button found');
  } else {
    console.log(`    Found: [${ggmBtnInfo.index}] "${ggmBtnInfo.title}"`);
    await page.locator('.activity-bar button').nth(ggmBtnInfo.index).click();
    await page.waitForTimeout(2000);
    console.log('    Clicked GGM button, waiting for sidebar to load…');
  }

  // ─── Step 5: Verify sidebar shows GGM content ──────────────────────────────
  console.log('\n[5] Verifying GGM sidebar…');
  await page.screenshot({ path: 'tests/ggm-02-sidebar.png' });
  console.log('    Screenshot saved: tests/ggm-02-sidebar.png');

  const sidebarTitle = await page.locator('.sidebar-title').textContent().catch(() => null);
  console.log('    Sidebar title:', sidebarTitle);

  if (!sidebarTitle?.toLowerCase().includes('ggm')) {
    console.log('    FAIL: Sidebar title does not contain "GGM"');
    issues.push(`Sidebar: title is "${sidebarTitle}", expected to contain "GGM"`);
  } else {
    console.log('    PASS: Sidebar title correct');
  }

  // Wait for loading to resolve
  await page.waitForTimeout(2000);

  const loadingEl = await page.locator('.sidebar-loading').count();
  const errorEl = await page.locator('.sidebar-error').textContent().catch(() => null);
  const domainItems = await page.locator('.ggm-domain-item').count();

  console.log('    .sidebar-loading elements:', loadingEl);
  console.log('    .sidebar-error text:', errorEl);
  console.log('    .ggm-domain-item count:', domainItems);

  if (loadingEl > 0) {
    const loadingText = await page.locator('.sidebar-loading').textContent().catch(() => '');
    console.log('    FAIL: Sidebar stuck in loading state:', loadingText);
    issues.push('Sidebar: stuck showing "Laden..." — likely shape mismatch between API response and GgmOverview interface, or fetch error not caught');

    // Deep-dive: run the same fetch the sidebar would run, capture error
    const fetchDiag = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/ggm');
        if (!res.ok) return { error: `HTTP ${res.status}` };
        const data = await res.json() as Record<string, unknown>;
        return {
          ok: true,
          hasDomains: Array.isArray(data['domains']),
          domainCount: Array.isArray(data['domains']) ? (data['domains'] as unknown[]).length : -1,
          hasUnclassified: 'unclassified' in data,
          keys: Object.keys(data),
        };
      } catch (e: unknown) {
        return { error: String(e) };
      }
    });
    console.log('\n    Fetch diagnostic from page context:', JSON.stringify(fetchDiag, null, 2));

  } else if (errorEl) {
    console.log('    FAIL: Sidebar shows error:', errorEl);
    issues.push(`Sidebar: shows error "${errorEl}"`);
  } else if (domainItems === 0) {
    console.log('    FAIL: No .ggm-domain-item elements rendered');
    issues.push('Sidebar: 0 domain items rendered despite API returning data');
  } else {
    console.log('    PASS:', domainItems, 'domain items rendered');
    const domainNames = await page.locator('.ggm-domain-name').allTextContents();
    console.log('    Domain names:', domainNames);
  }

  // ─── Step 6: Click on first domain (if any loaded) ─────────────────────────
  if (domainItems > 0) {
    console.log('\n[6] Clicking first domain…');
    const firstDomain = page.locator('.ggm-domain-item').first();
    const firstDomainName = await firstDomain.locator('.ggm-domain-name').textContent().catch(() => 'unknown');
    console.log('    Clicking:', firstDomainName);
    await firstDomain.click();
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'tests/ggm-03-domain-click.png' });
    console.log('    Screenshot saved: tests/ggm-03-domain-click.png');

    // ─── Step 7: Verify detail view ──────────────────────────────────────────
    console.log('\n[7] Verifying GGM detail view…');
    const tabTitles = await page.locator('.tab-title').allTextContents();
    console.log('    Open tabs:', tabTitles);

    const detailBanner = await page.locator('.ggm-domain-banner').count();
    const detailLoading = await page.locator('.dashboard-loading').count();
    const detailLoadingText = detailLoading > 0
      ? await page.locator('.dashboard-loading').first().textContent().catch(() => '')
      : '';

    console.log('    .ggm-domain-banner:', detailBanner);
    console.log('    .dashboard-loading:', detailLoading, detailLoadingText ? `("${detailLoadingText}")` : '');

    if (detailBanner > 0) {
      console.log('    PASS: GGM detail view rendered');
      const detailTitle = await page.locator('.ggm-domain-banner h2').textContent().catch(() => null);
      const subtitle = await page.locator('.ggm-domain-banner .dash-subtitle').textContent().catch(() => null);
      const functionGroups = await page.locator('.ggm-function-group').count();
      console.log('    Domain title:', detailTitle);
      console.log('    Subtitle:', subtitle);
      console.log('    Bedrijfsfunctie groups:', functionGroups);
      await page.screenshot({ path: 'tests/ggm-04-detail.png' });
      console.log('    Screenshot saved: tests/ggm-04-detail.png');
    } else {
      console.log('    FAIL: Detail view did not render');
      issues.push('Detail view: .ggm-domain-banner not found after clicking domain');

      // Diagnose the API routing bug
      console.log('\n[7b] Diagnosing detail API endpoint…');
      const diagResult = await page.evaluate(async () => {
        // Get domain id from overview
        const overviewRes = await fetch('/api/ggm');
        const overview = await overviewRes.json() as {
          domains?: Array<{ id: string; name: string }>
        };
        const firstDomain = overview.domains?.[0];
        if (!firstDomain) return { error: 'No domains in overview' };

        const id = firstDomain.id;

        // Client-side call: /api/ggm/<id>  (path-based — what ggm-detail.ts uses)
        const pathRes = await fetch(`/api/ggm/${encodeURIComponent(id)}`);
        const pathStatus = pathRes.status;
        const pathBody = await pathRes.text().then(t => t.slice(0, 150));

        // Server-side call: /api/ggm?domain=<id>  (query-param — what api.ts handles)
        const queryRes = await fetch(`/api/ggm?domain=${encodeURIComponent(id)}`);
        const queryStatus = queryRes.status;
        const queryBody = await queryRes.text().then(t => t.slice(0, 150));

        return { domainId: id, pathStatus, pathBody, queryStatus, queryBody };
      });

      console.log('    Domain ID used:', 'domainId' in diagResult ? diagResult.domainId : 'N/A');
      if ('pathStatus' in diagResult) {
        console.log(`    Path-based  GET /api/ggm/<id>      -> HTTP ${diagResult.pathStatus}`);
        console.log(`    Body: ${diagResult.pathBody}`);
        console.log(`    Query-param GET /api/ggm?domain=<id> -> HTTP ${diagResult.queryStatus}`);
        console.log(`    Body: ${diagResult.queryBody}`);

        if (diagResult.pathStatus !== 200 && diagResult.queryStatus === 200) {
          console.log('\n    ROOT CAUSE: URL routing mismatch');
          console.log('    ggm-detail.ts calls: fetch(`/api/ggm/${id}`)  (path-based)');
          console.log('    api.ts handles:      /api/ggm?domain=<id>     (query-param)');
          console.log('    Fix: change api.ts to handle /api/ggm/<id>, OR');
          console.log('         change ggm-detail.ts to use fetch(`/api/ggm?domain=${id}`)');
          issues.push(
            `BUG: Detail API URL mismatch — client calls /api/ggm/${diagResult.domainId} (path-based, returns HTTP ${diagResult.pathStatus}), ` +
            `server only handles /api/ggm?domain=<id> (query-param, returns HTTP ${diagResult.queryStatus})`
          );
        }
      } else if ('error' in diagResult) {
        console.log('    Diagnostic error:', diagResult.error);
      }
    }
  } else {
    console.log('\n[6] SKIPPED: No domain items to click (sidebar not loaded)');
    console.log('[7] SKIPPED: Cannot test detail view');
  }

  // ─── Step 8: Browser console errors ────────────────────────────────────────
  console.log('\n[8] Browser console errors:');
  if (consoleErrors.length === 0) {
    console.log('    None');
  } else {
    for (const e of consoleErrors) console.log('    ERROR:', e);
  }

  // ─── Final summary ──────────────────────────────────────────────────────────
  const pass = issues.length === 0;
  console.log('\n' + '='.repeat(60));
  if (pass) {
    console.log('OVERALL: PASS — all checks passed');
  } else {
    console.log('OVERALL: FAIL');
    console.log('\nIssues found:');
    for (const issue of issues) console.log('  -', issue);
  }
  console.log('='.repeat(60) + '\n');

  await page.waitForTimeout(3000);
  await browser.close();
  process.exit(pass ? 0 : 1);
}

testGgmView().catch(e => {
  console.error('Test crashed:', e);
  process.exit(1);
});
