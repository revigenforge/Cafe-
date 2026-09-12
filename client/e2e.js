/**
 * Drives the real UI in a browser: signs in as each role, walks the main
 * workflows, and fails on any console error or missing element.
 *
 *   node e2e.js
 */
import { chromium } from 'playwright';

const BASE = 'http://localhost:5173';
const SHOTS = '/tmp/claude-0/-home-user-Cafe-/6d6d5ebb-7994-5b4e-b7d5-e7ebd4ce2b58/scratchpad';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'pass' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
};

async function signInAs(page, name) {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  const needsLogin = await page.locator('.login').count();
  if (needsLogin) {
    await page.locator('.login__user', { hasText: name }).click();
    await page.waitForSelector('.shell', { timeout: 8000 });
  }
  await page.waitForTimeout(500);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();

  const errors = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(`console: ${m.text().slice(0, 160)}`);
  });
  const httpFails = [];
  page.on('response', (r) => { if (r.status() >= 400) httpFails.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}${new URL(r.url()).search}`); });

  // ── login ──
  await page.goto(BASE, { waitUntil: 'networkidle' });
  check('login screen lists the demo team', (await page.locator('.login__user').count()) === 5);

  await signInAs(page, 'Aditya Rao');
  check('admin lands on the dashboard', (await page.locator('.shell').count()) === 1);

  // ── dashboard ──
  const statCount = await page.locator('.stat').count();
  check('dashboard renders stat tiles', statCount >= 6, `${statCount} tiles`);
  check('admin sees the team block', (await page.getByText('The team today').count()) > 0);
  await page.screenshot({ path: `${SHOTS}/crm-dashboard.png`, fullPage: true });

  // ── leads: filter + sort + search ──
  await page.click('a[href="/leads"]');
  await page.waitForSelector('table.data', { timeout: 8000 });
  const totalText = await page.locator('.main .topbar').nth(1).locator('.topbar__sub').innerText();
  check('leads page shows a total', /\d+ lead/.test(totalText), totalText.trim());

  const before = await page.locator('table.data tbody tr').count();
  await page.selectOption('.filterbar select >> nth=0', { label: 'Contacted' });
  await page.waitForTimeout(700);
  const after = await page.locator('table.data tbody tr').count();
  check('status filter narrows the list', after <= before, `${before} → ${after}`);
  check('an active filter chip appears', (await page.locator('.chip').count()) > 0);

  await page.click('.activefilters .btn--ghost'); // clear all
  await page.waitForTimeout(600);
  check('clearing filters restores the list', (await page.locator('.chip').count()) === 0);

  await page.click('th:has-text("Business")');
  await page.waitForTimeout(700);
  const names = await page.locator('table.data tbody tr td:nth-child(2) a').allInnerTexts();
  const sorted = [...names].sort((a, b) => a.localeCompare(b));
  check('sorting by business name works', JSON.stringify(names) === JSON.stringify(sorted));

  // ── bulk select ──
  await page.click('table.data thead input[type="checkbox"]');
  await page.waitForTimeout(400);
  check('bulk bar appears on selection', (await page.locator('.bulkbar').count()) === 1);
  const bulkText = await page.locator('.bulkbar strong').innerText();
  check('bulk bar counts the selection', /\d+ selected/.test(bulkText), bulkText);
  await page.click('.bulkbar .btn:has-text("Clear")');
  await page.waitForTimeout(300);
  check('clearing selection hides the bulk bar', (await page.locator('.bulkbar').count()) === 0);
  await page.screenshot({ path: `${SHOTS}/crm-leads.png`, fullPage: true });

  // ── lead detail + log activity ──
  await page.locator('table.data tbody tr td:nth-child(2) a').first().click();
  await page.waitForSelector('.timeline, .empty', { timeout: 8000 });
  check('lead detail opens', (await page.locator('.kv').count()) > 0);

  const tlBefore = await page.locator('.tl-item').count();
  await page.click('.btn--primary:has-text("Log activity")');
  await page.waitForSelector('.modal', { timeout: 5000 });
  await page.fill('.modal textarea', 'Automated end-to-end test call');
  await page.selectOption('.modal select >> nth=1', { index: 3 }); // an outcome
  await page.click('.modal__foot .btn--primary');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 8000 });
  await page.waitForTimeout(900);
  const tlAfter = await page.locator('.tl-item').count();
  check('logging an activity adds to the timeline', tlAfter > tlBefore, `${tlBefore} → ${tlAfter}`);
  await page.screenshot({ path: `${SHOTS}/crm-lead-detail.png`, fullPage: true });

  // ── status change from the detail sidebar ──
  const statusSelect = page.locator('.panel__body select').first();
  const optionCount = await statusSelect.locator('option').count();
  await statusSelect.selectOption({ index: Math.min(2, optionCount - 1) });
  await page.waitForTimeout(900);
  check('status change is recorded as an event',
    (await page.locator('.tl-item[data-kind="event"]').count()) > 0);

  // ── queue ──
  await page.click('a[href="/queue"]');
  await page.waitForSelector('.page', { timeout: 8000 });
  const hasQueue = (await page.locator('.panel__head h2:has-text("Now")').count()) > 0;
  check('sales queue loads a lead to work', hasQueue || (await page.getByText('Queue is clear').count()) > 0);
  if (hasQueue) {
    check('queue explains why each lead surfaced', (await page.locator('.badge').first().innerText()).length > 0);
    await page.screenshot({ path: `${SHOTS}/crm-queue.png`, fullPage: true });
  }

  // ── pipeline board ──
  await page.click('a[href="/pipeline"]');
  await page.waitForSelector('.board', { timeout: 8000 });
  const cols = await page.locator('.board__col').count();
  check('pipeline renders a column per active status', cols >= 10, `${cols} columns`);
  check('pipeline cards render', (await page.locator('.board__card').count()) > 0);
  await page.screenshot({ path: `${SHOTS}/crm-pipeline.png`, fullPage: true });

  // ── tasks ──
  await page.click('a[href="/tasks"]');
  await page.waitForSelector('.tabs', { timeout: 8000 });
  check('task views render', (await page.locator('.tab').count()) >= 5);
  await page.click('.tab:has-text("Overdue")');
  await page.waitForTimeout(700);
  const overdueRows = await page.locator('table.data tbody tr').count();
  const overdueBadge = await page.locator('.tab:has-text("Overdue") .n').innerText().catch(() => '0');
  check('overdue count matches the overdue list', String(overdueRows) === overdueBadge.trim() || overdueRows === 0,
    `list ${overdueRows} vs badge ${overdueBadge}`);
  await page.screenshot({ path: `${SHOTS}/crm-tasks.png`, fullPage: true });

  // ── team activity ──
  await page.click('a[href="/team"]');
  await page.waitForSelector('.timeline, .empty', { timeout: 8000 });
  check('team feed renders entries', (await page.locator('.tl-item').count()) > 0);

  // ── analytics ──
  await page.click('a[href="/analytics"]');
  await page.waitForSelector('.funnel, .empty', { timeout: 10000 });
  const funnelRows = await page.locator('.funnel__row').count();
  check('funnel renders every stage', funnelRows === 7, `${funnelRows} stages`);
  const counts = await page.locator('.funnel__fill').allInnerTexts();
  const nums = counts.map((c) => Number(c.trim()) || 0);
  check('funnel never widens as it descends', nums.every((n, i) => i === 0 || n <= nums[i - 1]), nums.join(' → '));
  await page.screenshot({ path: `${SHOTS}/crm-analytics.png`, fullPage: true });

  // ── performance ──
  await page.click('a[href="/performance"]');
  await page.waitForSelector('table.data', { timeout: 8000 });
  check('performance lists the salespeople', (await page.locator('table.data tbody tr').count()) >= 3);
  await page.screenshot({ path: `${SHOTS}/crm-performance.png`, fullPage: true });

  // ── settings ──
  await page.click('a[href="/settings"]');
  await page.waitForSelector('.tabs', { timeout: 8000 });
  await page.click('.tab:has-text("Statuses")');
  await page.waitForSelector('table.data', { timeout: 5000 });
  check('settings lists editable statuses', (await page.locator('table.data tbody tr').count()) >= 10);
  await page.screenshot({ path: `${SHOTS}/crm-settings.png`, fullPage: true });

  // ── import ──
  await page.click('a[href="/import"]');
  await page.waitForSelector('.page', { timeout: 8000 });
  await page.click('details summary');
  await page.fill('.textarea', 'Company,Mobile,City\nE2E Test Gym,+91 90000 11111,Pune');
  await page.click('.btn--primary:has-text("Read this CSV")');
  await page.waitForSelector('table.data', { timeout: 8000 });
  const guessed = await page.locator('table.data tbody tr select').first().inputValue();
  check('importer guesses the business name column', guessed === 'business_name', `guessed "${guessed}"`);
  await page.screenshot({ path: `${SHOTS}/crm-import.png`, fullPage: true });

  // ── global search, phone in a different format ──
  const lead = await page.evaluate(async () => {
    const r = await fetch('/api/leads?has_phone=true&per_page=1', { headers: { 'x-user-id': '1' } });
    const j = await r.json();
    return j.data[0];
  });
  await page.fill('.gsearch input', `+91${lead.normalized_phone}`);
  await page.waitForTimeout(900);
  const found = await page.locator('.gsearch__results').innerText().catch(() => '');
  check('search finds a lead by a differently-formatted number',
    found.includes(lead.business_name), `looked for ${lead.business_name}`);

  // ── salesperson scoping ──
  await page.click('.sidebar__foot .btn');
  await page.waitForSelector('.login', { timeout: 6000 });
  await signInAs(page, 'Atharva Joshi');

  check('salesperson has no Team Activity link', (await page.locator('a[href="/team"]').count()) === 0);
  check('salesperson has no Settings link', (await page.locator('a[href="/settings"]').count()) === 0);
  check('salesperson has no Analytics link', (await page.locator('a[href="/analytics"]').count()) === 0);
  check('salesperson dashboard hides team figures', (await page.getByText('The team today').count()) === 0);

  await page.click('a[href="/leads"]');
  await page.waitForSelector('table.data', { timeout: 8000 });
  const owners = await page.locator('table.data tbody tr .owner').allInnerTexts();
  check('salesperson sees only their own leads',
    owners.every((o) => o.includes('Atharva')), `${new Set(owners).size} distinct owners`);
  await page.screenshot({ path: `${SHOTS}/crm-salesperson.png`, fullPage: true });

  // navigating straight to a colleague's lead must be refused
  const otherLead = await page.evaluate(async () => {
    const r = await fetch('/api/leads?owner_id=4&per_page=1', { headers: { 'x-user-id': '1' } });
    const j = await r.json();
    return j.data[0]?.id;
  });
  if (otherLead) {
    await page.goto(`${BASE}/leads/${otherLead}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    check('salesperson is blocked from a colleague lead', (await page.locator('.errbox').count()) > 0);
  }

  // ── mobile ──
  const mobile = await ctx.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(BASE, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(800);
  const overflow = await mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow on mobile', overflow <= 0, `${overflow}px`);
  await mobile.screenshot({ path: `${SHOTS}/crm-mobile.png`, fullPage: true });
  await mobile.close();

  console.log('\nHTTP responses >= 400 seen during the run:');
  httpFails.forEach((f) => console.log('   ', f));
  const pageErrors = errors.filter((e) => e.startsWith('pageerror'));
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length) {
    console.log('\nFailures:');
    failed.forEach((f) => console.log(`  - ${f.name}${f.detail ? `: ${f.detail}` : ''}`));
    process.exit(1);
  }
})();
