const { chromium } = require('playwright');
const fs = require('fs');
const BASE = 'http://localhost:3001';
const OUT = '/home/cwlai/itcrms/web/screenshots';

const ACCOUNTS = [
  { email: 'user_local@test.com', password: 'Test1234!', role: 'user', roleLabel: 'User' },
  { email: 'supervisor@test.com', password: 'Test1234!', role: 'supervisor', roleLabel: 'Supervisor' },
  { email: 'itstaff@test.com', password: 'Test1234!', role: 'it_staff', roleLabel: 'IT Staff' },
  { email: 'itdirector@test.com', password: 'Test1234!', role: 'it_director', roleLabel: 'IT Director' },
  { email: 'admin@test.com', password: 'Test1234!', role: 'admin', roleLabel: 'Admin' },
];

const PAGES = {
  user:        [{ url: '/cr/my', name: 'My CRs' }, { url: '/cr/new', name: 'New CR' }],
  supervisor:  [{ url: '/cr/my', name: 'My CRs' }, { url: '/cr/new', name: 'New CR' }],
  it_staff:    [{ url: '/cr/my', name: 'My CRs' }, { url: '/cr/all', name: 'All CRs' }, { url: '/cr/new', name: 'New CR' }],
  it_director: [{ url: '/cr/all', name: 'All CRs' }, { url: '/cr/new', name: 'New CR' }, { url: '/admin/users', name: 'Admin: Users' }],
  admin:       [{ url: '/cr/all', name: 'All CRs' }, { url: '/cr/new', name: 'New CR' }, { url: '/admin/users', name: 'Admin: Users' }, { url: '/admin/roles', name: 'Admin: Roles' }, { url: '/admin/cr-types', name: 'Admin: CR Types' }],
};

async function login(page, email, password, roleLabel) {
  await page.goto(`${BASE}/auth/login`, { timeout: 10000 });
  await page.waitForTimeout(2000);
  const localBtn = page.locator('button:has-text("Use local test account")');
  if (await localBtn.count() > 0) { await localBtn.click(); await page.waitForTimeout(1000); }
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('form').last().locator('button[type="submit"]').click();
  await page.waitForTimeout(4000);
  const url = page.url();
  const loginFormVisible = await page.locator('input[type="email"]').count() > 0;
  return !loginFormVisible && url.includes('localhost');
}

async function getNavLinks(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('nav a'))
      .map(el => ({ text: el.textContent?.trim() ?? '', href: el.getAttribute('href') ?? '' }))
      .filter(el => el.text && el.href)
  );
}

async function captureByNav(page, pageInfo) {
  const key = pageInfo.url.replace(/\//g, '_') || 'index';
  const filename = `nav_${key}.png`;
  const path = `${OUT}/${filename}`;
  await page.click(`nav a[href="${pageInfo.url}"]`);
  await page.waitForTimeout(4000);
  await page.screenshot({ path, fullPage: true });
  const h1 = await page.evaluate(() => document.querySelector('h1')?.textContent || 'none');
  const main = await page.evaluate(() => document.querySelector('main')?.innerText?.slice(0, 300) || '');
  const url = page.url();
  const loginFormVisible = await page.locator('input[type="email"]').count() > 0;
  return {
    ok: !loginFormVisible && !url.includes('/auth/login'),
    name: pageInfo.name,
    filename,
    h1,
    main,
    url,
  };
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const allResults = [];

  for (const account of ACCOUNTS) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    const loginOk = await login(page, account.email, account.password, account.roleLabel);
    if (!loginOk) {
      console.log(`  SKIP [${account.roleLabel}] Login FAILED`);
      await context.close();
      continue;
    }
    console.log(`  LOGIN OK [${account.roleLabel}]`);

    const nav = await getNavLinks(page);
    const navText = nav.map(l => l.text).join(' | ');

    for (const pageInfo of (PAGES[account.role] || [])) {
      const r = await captureByNav(page, pageInfo);
      r.role = account.role;
      r.roleLabel = account.roleLabel;
      r.nav = navText;
      allResults.push(r);
      const icon = r.ok ? 'PASS' : 'FAIL';
      console.log(`  ${icon} [${account.roleLabel}] ${pageInfo.name} -> ${r.h1}`);
    }
    await context.close();
  }

  await browser.close();

  const passCount = allResults.filter(r => r.ok).length;
  const totalCount = allResults.length;
  console.log(`\n=== ${passCount}/${totalCount} pages passed ===`);

  const rows = allResults.map(r => {
    const status = r.ok
      ? '<span style="color:green">PASS</span>'
      : '<span style="color:red">FAIL</span>';
    const img = `<a href="screenshots/${r.filename}" target="_blank"><img src="screenshots/${r.filename}" style="height:100px;border:1px solid #ccc;border-radius:4px"/></a>`;
    return `<tr><td>${r.roleLabel}</td><td>${r.name}</td><td>${status}</td><td>${img}</td><td>H1: ${r.h1}<br/>URL: ${r.url}</td></tr>`;
  }).join('\n');

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>ITCRMS Test</title></head>
<body><h1>ITCRMS Test Report</h1><p>${passCount}/${totalCount} passed</p>
<table><thead><tr><th>Role</th><th>Page</th><th>Status</th><th>Screenshot</th><th>Info</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;

  fs.writeFileSync('/home/cwlai/itcrms/web/test-report.html', html);
  console.log('Report written to /home/cwlai/itcrms/web/test-report.html');
}

main().catch(console.error);