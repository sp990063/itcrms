import { chromium } from 'playwright'

const BASE = 'http://localhost:3001'
const OUT = '/home/cwlai/itcrms/web/screenshots'
const REPORT = '/home/cwlai/itcrms/web/test-report.html'

const ADMIN_PAGES = [
  { url: '/cr/all', name: 'All CRs' },
  { url: '/cr/new', name: 'New CR' },
  { url: '/admin/users', name: 'Admin: Users' },
  { url: '/admin/roles', name: 'Admin: Roles' },
  { url: '/admin/cr-types', name: 'Admin: CR Types' },
]

async function loginAdmin(page) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' })
  await page.click('button:has-text("Use local test account")')
  await page.waitForTimeout(500)
  await page.fill('input[type="email"], input[name="email"]', 'admin@test.com')
  await page.fill('input[type="password"], input[name="password"]', 'Test1234!')
  await page.click('button[type="submit"], button:has-text("Sign in")')
  await page.waitForURL('**/cr/my**', { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(2000)
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  await loginAdmin(page)
  const results = []

  for (const pageInfo of ADMIN_PAGES) {
    const filename = `admin${pageInfo.url.replace(/\//g, '_') || 'index'}.png`
    const path = `${OUT}/${filename}`
    try {
      await page.goto(`${BASE}${pageInfo.url}`, { waitUntil: 'networkidle', timeout: 10000 })
      await page.waitForTimeout(1000)
      await page.screenshot({ path, fullPage: true })
      const navText = await page.evaluate(() =>
        Array.from(document.querySelectorAll('nav a, nav button'))
          .map(el => el.textContent?.trim()).filter(Boolean).join(' | ')
      )
      const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 200) ?? '')
      results.push({ ok: true, filename, name: pageInfo.name, navText, bodyText, roleLabel: '⚙️ Admin' })
      console.log(`  ✅ [Admin] ${pageInfo.name}`)
    } catch (e) {
      results.push({ ok: false, filename, name: pageInfo.name, error: e.message, roleLabel: '⚙️ Admin' })
      console.log(`  ❌ [Admin] ${pageInfo.name}: ${e.message}`)
    }
  }

  await browser.close()
  console.log(`\n${results.filter(r => r.ok).length}/${results.length} admin pages captured`)
}

main().catch(console.error)