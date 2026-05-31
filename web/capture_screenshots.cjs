const { chromium } = require('playwright');
const BASE = 'http://localhost:3001';
const OUT = '/home/cwlai/itcrms/web/screenshots';
const fs = require('fs');

const ACCOUNTS = [
  { email: 'user_local@test.com',   password: 'Test1234!', role: 'user',        roleLabel: 'User' },
  { email: 'supervisor@test.com',   password: 'Test1234!', role: 'supervisor',  roleLabel: 'Supervisor' },
  { email: 'itstaff@test.com',      password: 'Test1234!', role: 'it_staff',    roleLabel: 'ITStaff' },
  { email: 'itdirector@test.com',   password: 'Test1234!', role: 'it_director', roleLabel: 'ITDirector' },
  { email: 'admin@test.com',        password: 'Test1234!', role: 'admin',       roleLabel: 'Admin' },
];

const PAGES = {
  user:        [{ url: '/cr/my', name: 'My CRs' }, { url: '/cr/new', name: 'New CR' }],
  supervisor:  [{ url: '/cr/my', name: 'My CRs' }, { url: '/cr/new', name: 'New CR' }],
  it_staff:    [{ url: '/cr/my', name: 'My CRs' }, { url: '/cr/all', name: 'All CRs' }, { url: '/cr/new', name: 'New CR' }],
  it_director: [{ url: '/cr/all', name: 'All CRs' }, { url: '/cr/new', name: 'New CR' }, { url: '/admin/users', name: 'Admin Users' }],
  admin:       [{ url: '/cr/all', name: 'All CRs' }, { url: '/cr/new', name: 'New CR' }, { url: '/admin/users', name: 'Admin Users' }, { url: '/admin/roles', name: 'Admin Roles' }, { url: '/admin/cr-types', name: 'Admin CR Types' }],
};

async function getNavLinks(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('nav a'))
      .map(el => ({ text: el.textContent.trim(), href: el.getAttribute('href') || '' }))
      .filter(el => el.text && el.href)
  );
}

async function getPageState(page) {
  return page.evaluate(() => ({
    h1: (document.querySelector('h1') || {}).textContent || '',
    main: (document.querySelector('main') || {}).innerText?.slice(0, 400) || '',
    url: window.location.href,
    loginForm: !!document.querySelector('input[type="email"]'),
  }));
}

async function captureByNav(page, pageInfo, role) {
  const key = role + '_' + (pageInfo.url.replace(/\//g, '_') || 'index');
  const filename = key + '.png';
  const path = OUT + '/' + filename;
  try {
    const navLinks = await getNavLinks(page);
    const match = navLinks.find(l => l.href === pageInfo.url || l.href.endsWith(pageInfo.url));
    if (match) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'networkidle', timeout: 10000 }),
        page.click('nav a[href="' + match.href + '"]'),
      ]);
    } else {
      await page.goto(BASE + pageInfo.url, { waitUntil: 'domcontentloaded', timeout: 8000 });
    }
    await page.waitForTimeout(2500);
    await page.screenshot({ path, fullPage: true });
    const state = await getPageState(page);
    return { ok: !state.loginForm && !state.url.includes('/auth/login'), role, page: pageInfo.name, filename, h1: state.h1, main: state.main, url: state.url, nav: navLinks.map(l => l.text).join(' | '), error: null };
  } catch(e) {
    return { ok: false, role, page: pageInfo.name, filename, h1: '', main: '', url: '', nav: '', error: e.message };
  }
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const account of ACCOUNTS) {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();

    // Login
    await page.goto(BASE + '/auth/login', { waitUntil: 'networkidle' });
    await page.click('button:has-text("Use local test account")');
    await page.waitForTimeout(500);
    await page.locator('input[type="email"], input[name="email"]').first().fill(account.email);
    await page.locator('input[type="password"], input[name="password"]').first().fill(account.password);
    await page.click('button[type="submit"], button:has-text("Sign in")');
    try {
      await page.waitForURL(url => !url.includes('/auth/login'), { timeout: 10000 });
    } catch {}
    await page.waitForTimeout(3000);

    if (page.url().includes('/auth/login')) {
      console.log('LOGIN_FAIL:' + account.roleLabel);
      await ctx.close();
      continue;
    }

    const navLinks = await getNavLinks(page);
    const nav = navLinks.map(l => l.text).join(' | ');
    console.log('LOGIN_OK:' + account.roleLabel + ':' + page.url());

    for (const pi of (PAGES[account.role] || [])) {
      const r = await captureByNav(page, pi, account.role);
      r.roleLabel = account.roleLabel;
      r.nav = nav;
      results.push(r);
      console.log((r.ok ? 'PASS' : 'FAIL') + ':' + account.roleLabel + ':' + pi.name + ':' + r.url);
    }
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync('/tmp/e2e_results.json', JSON.stringify(results, null, 2));
  console.log('DONE:' + results.filter(r => r.ok).length + '/' + results.length);
})().catch(e => { console.error(e); process.exit(1); });