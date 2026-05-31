"""Python script to capture screenshots via browser navigation (not page.goto).
Uses subprocess to drive the browser via a Node.js Playwright script.
"""
import subprocess, os, json

BASE = 'http://localhost:3001'
OUT = '/home/cwlai/itcrms/web/screenshots'
REPORT_HTML = '/home/cwlai/itcrms/web/test-report.html'
OCR_JSON = '/home/cwlai/itcrms/web/ocr-results.json'

os.makedirs(OUT, exist_ok=True)

# Clean old screenshots
for f in os.listdir(OUT):
    if f.endswith('.png'):
        os.remove(os.path.join(OUT, f))

SCRIPT = r"""
const { chromium } = require('playwright');
const BASE = 'http://localhost:3001';
const OUT = process.argv[2];

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

async function login(page, email, password) {
  await page.goto(BASE + '/auth/login', { waitUntil: 'networkidle' });
  await page.click('button:has-text("Use local test account")');
  await page.waitForTimeout(500);
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"], input[name="password"]').first().fill(password);
  await page.click('button[type="submit"], button:has-text("Sign in")');
  try {
    await page.waitForURL(url => !url.includes('/auth/login'), { timeout: 10000 });
  } catch {}
  await page.waitForTimeout(3000);
  return !page.url().includes('/auth/login');
}

async function getNavLinks(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('nav a'))
      .map(el => ({ text: el.textContent.trim(), href: el.getAttribute('href') || '' }))
      .filter(el => el.text && el.href)
  );
}

async function getPageState(page) {
  return page.evaluate(() => {
    const h1 = document.querySelector('h1')?.textContent || '';
    const main = document.querySelector('main')?.innerText?.slice(0, 400) || '';
    const loginForm = !!document.querySelector('input[type="email"]');
    return { h1, main, url: window.location.href, loginForm };
  });
}

async function captureByNav(page, pageInfo, role) {
  const key = role + '_' + (pageInfo.url.replace(/\//g, '_') || 'index');
  const filename = key + '.png';
  const path = OUT + '/' + filename;
  try {
    const navLinks = await getNavLinks(page);
    const match = navLinks.find(l => l.href === pageInfo.url || l.href.endsWith(pageInfo.url));
    if (match) {
      await page.click('nav a[href="' + match.href + '"]');
    } else {
      await page.goto(BASE + pageInfo.url, { waitUntil: 'domcontentloaded', timeout: 8000 });
    }
    await page.waitForTimeout(2500);
    await page.screenshot({ path, fullPage: true });
    const state = await getPageState(page);
    return { ok: !state.loginForm, role, page: pageInfo.name, filename, h1: state.h1, main: state.main, url: state.url, nav: navLinks.map(l => l.text).join(' | '), error: null };
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
    const ok = await login(page, account.email, account.password);
    if (!ok) { console.log('LOGIN_FAIL:' + account.roleLabel); await ctx.close(); continue; }
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
  console.log('RESULTS_JSON:' + JSON.stringify(results));
})();
"""

result = subprocess.run(
    ['node', '-e', SCRIPT, OUT],
    capture_output=True, text=True, timeout=300, cwd='/home/cwlai/itcrms/web'
)
print("STDOUT:", result.stdout[-2000:] if len(result.stdout) > 2000 else result.stdout)
print("STDERR:", result.stderr[-500:] if result.stderr else '')

# Parse results from stdout
lines = result.stdout.strip().split('\n')
results_json_line = [l for l in lines if l.startswith('RESULTS_JSON:')]
if results_json_line:
    results = json.loads(results_json_line[0].replace('RESULTS_JSON:', ''))
    print(f"\nCaptured {len(results)} results")
else:
    results = []
    print("\nNo RESULTS_JSON found in output")
    for line in lines:
        if ':' in line and not line.startswith('LOGIN') and not line.startswith('RESULTS'):
            parts = line.split(':')
            if len(parts) >= 4:
                results.append({'ok': parts[0] == 'PASS', 'roleLabel': parts[1], 'page': parts[2], 'url': parts[3] if len(parts) > 3 else '', 'h1': '', 'nav': '', 'error': None if parts[0] == 'PASS' else 'redirect'})
    print(f"Parsed {len(results)} results from logs")

# Save intermediate results
with open('/tmp/e2e_results.json', 'w') as f:
    json.dump(results, f, indent=2)

print(f"\nResults: {sum(1 for r in results if r.get('ok'))}/{len(results)} passed")