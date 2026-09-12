/**
 * Proves the demo file works with no server and no network at all:
 * every request is aborted, and the API process is stopped first.
 * Then it walks the same six workflows.
 */
import { chromium } from 'playwright';

const FILE = 'file:///home/user/Cafe-/client/crm-demo.html';
const SHOTS = '/tmp/claude-0/-home-user-Cafe-/6d6d5ebb-7994-5b4e-b7d5-e7ebd4ce2b58/scratchpad';

const out = [];
const check = (n, ok, d = '') => { out.push({ n, ok }); console.log(`${ok ? 'pass' : 'FAIL'}  ${n}${d ? `  — ${d}` : ''}`); };

(async () => {
  const b = await chromium.launch({
    executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
    args: ['--no-sandbox'],
  });
  const page = await b.newPage({ viewport: { width: 1440, height: 950 } });

  // nothing but the file itself may load
  const blocked = [];
  await page.route('**', (r) => {
    if (r.request().url().startsWith('file:')) return r.continue();
    blocked.push(r.request().url());
    return r.abort();
  });

  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto(FILE, { waitUntil: 'load' });
  await page.waitForTimeout(1200);

  check('demo boots offline', (await page.locator('.login__user').count()) === 5);

  await page.locator('.login__user', { hasText: 'Keeya Menon' }).click();
  await page.waitForSelector('.shell', { timeout: 8000 });
  await page.waitForTimeout(900);
  check('demo banner is shown', (await page.locator('.demobar').count()) === 1);

  // 1 + 2 — create a lead assigned to a salesperson
  await page.click('a[href$="/leads"]');
  await page.waitForSelector('table.data');
  const startTotal = await page.locator('.main .topbar').nth(1).locator('.topbar__sub').innerText();
  check('leads load from memory', /\d+ lead/.test(startTotal), startTotal.trim());

  await page.click('.btn--primary:has-text("New lead")');
  await page.waitForSelector('.modal');
  await page.fill('.modal input >> nth=0', 'Demo Test Gym');
  await page.fill('.modal input >> nth=2', '+91 98200 55555');
  await page.locator('.modal select').filter({ hasText: 'Unassigned' }).selectOption({ label: 'Atharva Joshi' });
  await page.click('.modal__foot .btn--primary');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 8000 });
  await page.waitForTimeout(900);

  await page.fill('.filterbar input', 'Demo Test Gym');
  await page.waitForTimeout(800);
  const owner = await page.locator('table.data tbody tr .owner').first().innerText();
  check('lead created and assigned', owner.includes('Atharva'), owner.trim().replace(/\n/g, ' '));

  // 3 + 4 — log an activity with a follow-up
  await page.locator('table.data tbody tr td:nth-child(2) a').first().click();
  await page.waitForSelector('.kv');
  await page.click('.btn--primary:has-text("Log activity")');
  await page.waitForSelector('.modal');
  await page.fill('.modal textarea', 'Offline demo call');
  await page.locator('.modal select').nth(1).selectOption({ label: 'Interested' });
  await page.locator('.modal select').nth(2).selectOption({ label: 'Interested' });
  const fu = new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10);
  await page.locator('.modal input[type="date"]').fill(fu);
  await page.click('.modal__foot .btn--primary');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 8000 });
  await page.waitForTimeout(900);

  check('activity logged', (await page.locator('.tl-item').count()) >= 3);
  check('follow-up saved', (await page.locator('.panel__body input[type="date"]').inputValue()) === fu, fu);
  check('status change audited', (await page.locator('.tl-item[data-kind="event"]').count()) > 0);

  // 5 — task create + complete
  await page.click('.btn:has-text("+ Task")');
  await page.waitForSelector('.modal');
  await page.fill('.modal input >> nth=0', 'Demo follow-up task');
  await page.click('.modal__foot .btn--primary');
  await page.waitForSelector('.modal', { state: 'detached', timeout: 8000 });
  await page.waitForTimeout(900);
  const row = page.locator('table.data tbody tr', { hasText: 'Demo follow-up task' }).first();
  check('task created', (await row.count()) === 1);
  await row.locator('input[type="checkbox"]').first().click();
  await page.waitForTimeout(1100);
  const struck = await page.locator('table.data tbody tr', { hasText: 'Demo follow-up task' })
    .first().locator('.cell-main').evaluate((el) => getComputedStyle(el).textDecorationLine);
  check('task completed', struck === 'line-through', struck);

  // 6 — dashboard + analytics
  await page.click('a[href$="/"]');
  await page.waitForSelector('.stat');
  await page.waitForTimeout(700);
  check('dashboard renders', (await page.locator('.stat').count()) >= 6);
  await page.screenshot({ path: `${SHOTS}/demo-dashboard.png`, fullPage: true });

  await page.click('a[href$="/analytics"]');
  await page.waitForSelector('.funnel__row');
  await page.waitForTimeout(700);
  const nums = (await page.locator('.funnel__fill').allInnerTexts()).map((t) => Number(t.trim()) || 0);
  check('funnel narrows correctly', nums.every((n, i) => i === 0 || n <= nums[i - 1]), nums.join(' → '));
  await page.screenshot({ path: `${SHOTS}/demo-analytics.png`, fullPage: true });

  // pipeline, queue, settings, import, performance all reachable
  for (const [href, sel, label] of [
    ['/queue', '.page', 'sales queue'],
    ['/pipeline', '.board__col', 'pipeline board'],
    ['/team', '.tl-item, .empty', 'team activity'],
    ['/performance', 'table.data', 'performance'],
    ['/import', '.page', 'import'],
  ]) {
    await page.click(`a[href$="${href}"]`);
    await page.waitForSelector(sel, { timeout: 8000 });
    check(`${label} page loads`, true);
  }

  // search by a differently-formatted phone number
  await page.fill('.gsearch input', '+919820055555');
  await page.waitForTimeout(800);
  const found = await page.locator('.gsearch__results').innerText().catch(() => '');
  check('phone search normalises', found.includes('Demo Test Gym'));

  // data survives a reload
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await page.click('a[href$="/leads"]');
  await page.waitForSelector('table.data');
  await page.fill('.filterbar input', 'Demo Test Gym');
  await page.waitForTimeout(800);
  check('changes survive a reload', (await page.locator('table.data tbody tr').count()) === 1);

  // mobile
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(600);
  const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check('no horizontal overflow on mobile', ov <= 0, `${ov}px`);
  await page.screenshot({ path: `${SHOTS}/demo-mobile.png`, fullPage: true });

  console.log(`\nnetwork requests blocked: ${blocked.length ? blocked.join(', ') : 'none attempted'}`);
  check('no page errors', errs.length === 0, errs.slice(0, 2).join(' | '));

  await b.close();
  const failed = out.filter((r) => !r.ok);
  console.log(`\n${out.length - failed.length}/${out.length} checks passed`);
  if (failed.length) process.exit(1);
})();
