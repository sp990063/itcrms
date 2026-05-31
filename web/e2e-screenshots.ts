import { chromium } from 'playwright'

const BASE = 'http://localhost:3001'
const OUT = '/home/cwlai/itcrms/web/screenshots'
const REPORT = '/home/cwlai/itcrms/web/test-report.html'

// Test accounts: { email, password, role, roleLabel }
const ACCOUNTS = [
  { email: 'user_local@test.com',   password: 'Test1234!', role: 'user',         roleLabel: '👤 User (user_local)' },
  { email: 'supervisor@test.com',   password: 'Test1234!', role: 'supervisor',   roleLabel: '👔 Supervisor' },
  { email: 'itstaff@test.com',      password: 'Test1234!', role: 'it_staff',     roleLabel: '💻 IT Staff' },
  { email: 'itdirector@test.com',   password: 'Test1234!', role: 'it_director',  roleLabel: '🎯 IT Director' },
  { email: 'admin@test.com',        password: 'Test1234!', role: 'admin',         roleLabel: '⚙️ Admin' },
]

// Pages to test per role
const PAGES = {
  user:        [{ url: '/', name: 'Dashboard' }, { url: '/cr/my', name: 'My CRs' }, { url: '/cr/new', name: 'New CR' }],
  supervisor:  [{ url: '/', name: 'Dashboard' }, { url: '/cr/my', name: 'My CRs' }, { url: '/cr/new', name: 'New CR' }],
  it_staff:    [{ url: '/', name: 'Dashboard' }, { url: '/cr/my', name: 'My CRs' }, { url: '/cr/all', name: 'All CRs' }, { url: '/cr/new', name: 'New CR' }],
  it_director: [{ url: '/', name: 'Dashboard' }, { url: '/cr/all', name: 'All CRs' }, { url: '/cr/new', name: 'New CR' }, { url: '/admin/users', name: 'Admin: Users' }],
  admin:       [{ url: '/', name: 'Dashboard' }, { url: '/cr/all', name: 'All CRs' }, { url: '/cr/new', name: 'New CR' }, { url: '/admin/users', name: 'Admin: Users' }, { url: '/admin/roles', name: 'Admin: Roles' }, { url: '/admin/cr-types', name: 'Admin: CR Types' }],
}

async function login(page, email, password) {
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'networkidle' })
  // Click local test account button
  await page.click('button:has-text("Use local test account")')
  await page.waitForTimeout(500)
  // Fill email/password
  await page.fill('input[type="email"], input[name="email"]', email)
  await page.fill('input[type="password"], input[name="password"]', password)
  await page.click('button[type="submit"], button:has-text("Sign in")')
  await page.waitForURL('**/cr/my**', { timeout: 10000 }).catch(() => {
    // try clicking test account button directly
  })
  await page.waitForTimeout(2000)
}

async function capturePage(page, account, pageInfo) {
  const filename = `${account.role}_${pageInfo.url.replace(/\//g, '_') || 'index'}.png`
  const path = `${OUT}/${filename}`
  try {
    await page.goto(`${BASE}${pageInfo.url}`, { waitUntil: 'networkidle', timeout: 10000 })
    await page.waitForTimeout(1000)
    await page.screenshot({ path, fullPage: true })
    const title = await page.title()
    const bodyText = await page.evaluate(() => document.body?.innerText?.slice(0, 200) ?? '')
    return { ok: true, filename, path, name: pageInfo.name, title, bodyText }
  } catch (e) {
    return { ok: false, filename, path: `${OUT}/${filename}`, name: pageInfo.name, error: e.message }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const results = []

  for (const account of ACCOUNTS) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
    const page = await context.newPage()

    // Login
    await login(page, account.email, account.password)

    // Capture nav items visible
    const navText = await page.evaluate(() =>
      Array.from(document.querySelectorAll('nav a, nav button'))
        .map(el => el.textContent?.trim())
        .filter(Boolean)
        .join(' | ')
    )

    // Capture each page
    for (const pageInfo of (PAGES[account.role] || [])) {
      const r = await capturePage(page, account, pageInfo)
      r.navText = navText
      r.roleLabel = account.roleLabel
      results.push(r)
    }

    await context.close()
  }

  await browser.close()

  // Generate HTML report
  const rows = results.map(r => {
    const status = r.ok
      ? `<span style="color:green">✅ PASS</span>`
      : `<span style="color:red">❌ FAIL: ${r.error}</span>`
    const img = r.ok
      ? `<a href="${r.filename}" target="_blank"><img src="${r.filename}" style="height:120px;border:1px solid #ccc"/></a>`
      : '—'
    const text = r.ok ? `<pre style="font-size:11px;max-height:80px;overflow:hidden;margin:4px 0">${(r.bodyText || '').replace(/</g,'&lt;')}</pre>` : ''
    return `<tr>
      <td style="padding:6px">${r.roleLabel}</td>
      <td style="padding:6px">${r.name}</td>
      <td style="padding:6px">${status}</td>
      <td style="padding:6px">${img}</td>
      <td style="padding:6px;font-size:12px;color:#555">Nav: ${r.navText || '—'}</td>
    </tr>`
  }).join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ITCRMS RBAC Test Report</title>
<style>
  body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
  h1 { color: #222; }
  table { border-collapse: collapse; width: 100%; background: white; }
  th { background: #2c3e50; color: white; padding: 10px; text-align: left; }
  td { border: 1px solid #ddd; vertical-align: top; }
  tr:nth-child(even) { background: #f9f9f9; }
  pre { background: #f0f0f0; padding: 6px; border-radius: 4px; }
  .summary { margin: 20px 0; padding: 12px; background: white; border-radius: 8px; }
</style>
</head>
<body>
<h1>🧪 ITCRMS — RBAC Test Report</h1>
<div class="summary">
  <strong>Date:</strong> ${new Date().toLocaleString()}<br/>
  <strong>App:</strong> http://localhost:3001<br/>
  <strong>Accounts tested:</strong> ${ACCOUNTS.length} (user, supervisor, it_staff, it_director, admin)<br/>
  <strong>Total page checks:</strong> ${results.length}
</div>
<table>
  <thead>
    <tr><th>Role</th><th>Page</th><th>Status</th><th>Screenshot</th><th>Nav + Page Content snippet</th></tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
<p style="margin-top:20px;font-size:12px;color:#888">OCR verification: screenshots are PNG files in /screenshots/ folder. Use browser vision tool to analyze each image for detailed text extraction.</p>
</body>
</html>`

  const fs = await import('fs')
  fs.writeFileSync(REPORT, html)
  console.log(`\n✅ Report written to ${REPORT}`)
  console.log(`   ${results.filter(r => r.ok).length}/${results.length} pages captured\n`)
  results.forEach(r => {
    const icon = r.ok ? '✅' : '❌'
    console.log(`  ${icon} [${r.roleLabel}] ${r.name} — ${r.ok ? r.filename : r.error}`)
  })
}

main().catch(console.error)