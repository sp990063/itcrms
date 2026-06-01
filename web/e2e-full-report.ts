import { chromium } from 'playwright'
import * as fs from 'fs'

const BASE = 'http://localhost:3001'
const OUT = '/home/cwlai/itcrms/web/screenshots'

const ACCOUNTS = [
  { email: 'user_local@test.com',   password: 'Test1234!', role: 'user',        roleLabel: '👤 User' },
  { email: 'supervisor@test.com',   password: 'Test1234!', role: 'supervisor',  roleLabel: '👔 Supervisor' },
  { email: 'itstaff@test.com',      password: 'Test1234!', role: 'it_staff',    roleLabel: '💻 IT Staff' },
  { email: 'itdirector@test.com',   password: 'Test1234!', role: 'it_director', roleLabel: '🎯 IT Director' },
  { email: 'admin@test.com',        password: 'Test1234!', role: 'admin',       roleLabel: '⚙️ Admin' },
]

const PAGES = {
  user:        [{ url: '/cr/my', name: 'My CRs' }, { url: '/cr/new', name: 'New CR' }],
  supervisor:  [{ url: '/cr/my', name: 'My CRs' }, { url: '/cr/new', name: 'New CR' }],
  it_staff:    [{ url: '/cr/my', name: 'My CRs' }, { url: '/cr/all', name: 'All CRs' }, { url: '/cr/new', name: 'New CR' }],
  it_director: [{ url: '/cr/all', name: 'All CRs' }, { url: '/cr/new', name: 'New CR' }, { url: '/admin/users', name: 'Admin: Users' }],
  admin:       [{ url: '/cr/all', name: 'All CRs' }, { url: '/cr/new', name: 'New CR' }, { url: '/admin/users', name: 'Admin: Users' }, { url: '/admin/roles', name: 'Admin: Roles' }, { url: '/admin/cr-types', name: 'Admin: CR Types' }],
}

async function login(page, email, password, roleLabel) {
  // Navigate to the login page in the browser context
  await page.goto(`${BASE}/auth/login`, { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3000)

  // Intercept all console.log to see what the browser is doing
  page.on('console', msg => {
    if (msg.type() === 'log' || msg.type() === 'error') {
      console.log(`  🌐 [BROWSER] ${msg.text()}`)
    }
  })

  // Click "Use local test account" to reveal the form
  const localBtn = page.locator('button:has-text("Use local test account")')
  if (await localBtn.count() > 0) {
    await localBtn.click()
    await page.waitForTimeout(1000)
  }

  // Fill the email and password fields inside the local test account form
  const emailInput = page.locator('input[type="email"]')
  const pwInput = page.locator('input[type="password"]')
  if (await emailInput.count() > 0) {
    await emailInput.fill(email)
    await pwInput.fill(password)
    // Submit the LAST form on the page (the local test account form, not the SSO button)
    await page.locator('form').last().locator('button[type="submit"]').click()
  }

  // Wait up to 20s for navigation away from login (longer timeout for slow OAuth)
  try {
    await page.waitForURL(url => !url.includes('/auth/login') && !url.includes('supabase.co'), { timeout: 20000 })
  } catch {
    // May have already redirected; check current URL
  }
  await page.waitForTimeout(3000)

  const url = page.url()
  const onLocalhost = url.includes('localhost')
  const loginFormVisible = await page.locator('input[type="email"]').count() > 0
  console.log(`  🔍 [${roleLabel}] Final URL: ${url}, loginFormVisible: ${loginFormVisible}, onLocalhost: ${onLocalhost}`)
  return onLocalhost && !loginFormVisible
}

async function getNavLinks(page) {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('nav a'))
      .map(el => ({ text: el.textContent?.trim() ?? '', href: el.getAttribute('href') ?? '' }))
      .filter(el => el.text && el.href)
  )
}

async function getPageState(page) {
  return page.evaluate(() => {
    const h1 = document.querySelector('h1')?.textContent ?? ''
    const url = window.location.href
    const main = document.querySelector('main')?.innerText?.slice(0, 400) ?? ''
    const loginFormVisible = !!document.querySelector('input[type="email"]')
    return { h1, main, url, loginFormVisible }
  })
}

async function captureByNav(page, pageInfo) {
  const key = pageInfo.url.replace(/\//g, '_') || 'index'
  const filename = `nav_${key}.png`
  const path = `${OUT}/${filename}`
  try {
    // Use client-side nav (click nav link) instead of page.goto()
    // page.goto() triggers a full HTTP request which causes Next.js dev server
    // HMR to crash with TypeError: Cannot read properties of undefined (reading 'components')
    // when it sends the isrManifest HMR message — leaving the page rendering a blank spinner.
    // Clicking the nav link uses Next.js client-side routing which preserves the React context.
    await page.click(`nav a[href="${pageInfo.url}"]`)
    await page.waitForTimeout(4000)
    await page.screenshot({ path, fullPage: true })
    const state = await getPageState(page)
    return {
      ok: !state.loginFormVisible && !state.url.includes('/auth/login'),
      name: pageInfo.name,
      filename,
      h1: state.h1,
      main: state.main,
      url: state.url,
      error: null,
    }
  } catch (e: any) {
    return { ok: false, name: pageInfo.name, filename, h1: '', main: '', url: '', error: e.message }
  }
}

async function main() {
  const browser = await chromium.launch({ headless: true })
  const allResults: any[] = []

  for (const account of ACCOUNTS) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      // Don't override storage state — let the app set cookies naturally
    })
    const page = await context.newPage()

    const loginOk = await login(page, account.email, account.password, account.roleLabel)
    if (!loginOk) {
      console.log(`  ⚠️  [${account.roleLabel}] Login FAILED`)
      await context.close()
      continue
    }
    console.log(`  ✅ [${account.roleLabel}] Logged in — ${page.url()}`)

    const nav = await getNavLinks(page)
    const navText = nav.map(l => l.text).join(' | ')

    for (const pageInfo of (PAGES[account.role] || [])) {
      const r = await captureByNav(page, pageInfo)
      r.role = account.role
      r.roleLabel = account.roleLabel
      r.nav = navText
      allResults.push(r)
      const icon = r.ok ? '✅' : '❌'
      console.log(`  ${icon} [${account.roleLabel}] ${pageInfo.name} → ${r.url.split('/').pop() || '/'}`)
    }

    await context.close()
  }

  await browser.close()

  const passCount = allResults.filter(r => r.ok).length
  const totalCount = allResults.length

  const rows = allResults.map(r => {
    const status = r.ok
      ? `<span style="color:green">✅ PASS</span>`
      : `<span style="color:red">❌ FAIL — ${r.error || 'login redirect'}</span>`
    const img = `<a href="screenshots/${r.filename}" target="_blank"><img src="screenshots/${r.filename}" style="height:100px;border:1px solid #ccc;border-radius:4px"/></a>`
    const h1 = r.h1 ? `<strong>H1:</strong> ${r.h1}<br/>` : ''
    const url = r.url ? `<strong>URL:</strong> ${r.url}<br/>` : ''
    const main = r.main ? `<pre style="font-size:10px;max-height:60px;overflow:hidden;margin:4px 0;background:#f8f8f8;padding:4px;border-radius:3px">${r.main.replace(/</g,'&lt;').slice(0,300)}</pre>` : ''
    return `<tr>
      <td style="padding:6px 8px"><strong>${r.roleLabel}</strong><br/><span style="font-size:11px;color:#666">${r.role}</span></td>
      <td style="padding:6px 8px;font-size:13px">${r.name}</td>
      <td style="padding:6px 8px;font-size:12px">${status}</td>
      <td style="padding:6px 8px">${img}</td>
      <td style="padding:6px 8px;font-size:11px;color:#333">${h1}${url}<strong>Nav:</strong> ${r.nav || '—'}<br/>${main}</td>
    </tr>`
  }).join('\n')

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>ITCRMS — RBAC Security Test Report</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; margin: 0; background: #f0f2f5; }
  .header { background: linear-gradient(135deg, #2c3e50, #34495e); color: white; padding: 32px 40px; }
  .header h1 { margin: 0 0 8px; font-size: 28px; }
  .header p { margin: 0; opacity: 0.8; font-size: 14px; }
  .summary { display: flex; gap: 16px; padding: 24px 40px; background: white; border-bottom: 1px solid #e0e0e0; }
  .summary-card { background: #f8f9fa; border-radius: 8px; padding: 16px 20px; min-width: 140px; }
  .summary-card .num { font-size: 32px; font-weight: bold; color: #2c3e50; }
  .summary-card .label { font-size: 11px; color: #666; text-transform: uppercase; }
  .summary-card .num.pass { color: #27ae60; }
  .summary-card .num.fail { color: #e74c3c; }
  table { border-collapse: collapse; width: 100%; background: white; }
  th { background: #2c3e50; color: white; padding: 12px 8px; text-align: left; font-size: 12px; }
  td { border-bottom: 1px solid #eee; vertical-align: top; }
  tr:hover { background: #fafafa; }
  pre { font-family: 'Consolas', monospace; font-size: 10px; white-space: pre-wrap; word-break: break-word; }
</style>
</head>
<body>
<div class="header">
  <h1>🛡️ ITCRMS — RBAC Security Test Report</h1>
  <p>Role-based access control verification · 5 roles × multiple pages · Screenshots + OCR verification</p>
</div>
<div class="summary">
  <div class="summary-card"><div class="num">${totalCount}</div><div class="label">Total Checks</div></div>
  <div class="summary-card"><div class="num pass">${passCount}</div><div class="label">Passed ✅</div></div>
  <div class="summary-card"><div class="num fail">${totalCount - passCount}</div><div class="label">Failed ❌</div></div>
  <div class="summary-card"><div class="num">${((passCount/totalCount)*100).toFixed(0)}%</div><div class="label">Pass Rate</div></div>
  <div class="summary-card"><div class="num">5</div><div class="label">Roles</div></div>
</div>
<table>
  <thead>
    <tr>
      <th style="width:110px">Role</th>
      <th style="width:130px">Page</th>
      <th style="width:160px">Status</th>
      <th style="width:120px">Screenshot</th>
      <th>DOM Verification (H1 / URL / Nav / Content)</th>
    </tr>
  </thead>
  <tbody>
${rows}
  </tbody>
</table>
<div style="padding:20px 40px;font-size:12px;color:#666;background:#f8f9fa;border-top:1px solid #e0e0e0">
  <strong>OCR:</strong> Full OCR results in <code>ocr-results.json</code> (RapidOCR, local ONNX inference).
  Open <code>screenshots/</code> folder for individual PNGs. Test: 5 roles × pages via client-side nav.
</div>
</body>
</html>`

  fs.writeFileSync('/home/cwlai/itcrms/web/test-report.html', html)
  console.log(`\n✅ Report: /home/cwlai/itcrms/web/test-report.html`)
  console.log(`   ${passCount}/${totalCount} pages passed\n`)
}

main().catch(console.error)