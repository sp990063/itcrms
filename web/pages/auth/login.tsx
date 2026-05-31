import type { NextPage } from 'next'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@/lib/supabase'

const LOCAL_ACCOUNTS = [
  { email: 'user_local@test.com',    password: 'Test1234!',  role: 'User',       label: '👤 User Staff' },
  { email: 'supervisor@test.com',    password: 'Test1234!',  role: 'Supervisor', label: '👔 Supervisor' },
  { email: 'itstaff@test.com',       password: 'Test1234!',  role: 'IT Staff',   label: '💻 IT Staff' },
  { email: 'itdirector@test.com',   password: 'Test1234!',  role: 'IT Director',label: '🎯 IT Director' },
  { email: 'admin@test.com',        password: 'Test1234!',  role: 'Admin',      label: '⚙️ Admin' },
]

const LoginPage: NextPage = () => {
  const router = useRouter()
  const supabase = createClient()
  const [showLocal, setShowLocal] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Check localStorage directly (bypasses getUser() network call that fails in HMR)
    const storedUser = localStorage.getItem('itcrms_user')
    if (storedUser) {
      router.replace('/')
      return
    }
    // Also check Supabase's own localStorage key for refresh flow
    const raw = localStorage.getItem('sb-fkacjlozwittzulmbapc-auth-token')
    if (raw) {
      try { JSON.parse(raw); router.replace('/'); return } catch {}
    }
  }, [])

  async function handleSSOLogin() {
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback`
      : undefined

    const { data, error } = await (supabase.auth as any).signInWithOAuth({
      provider: 'openidconnect' as any,
      options: { redirectTo, scopes: 'openid profile email' },
    })
    if (error) alert('Login failed: ' + error.message)
    else if (data?.url) router.push(data.url)
  }

  async function handleLocalLogin(e: React.FormEvent) {
    console.log('[ITCRMS] handleLocalLogin called', { email, password, loading })
    e.preventDefault()
    setLoading(true)
    setError('')

    console.log('[ITCRMS] calling signInWithPassword...')
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    console.log('[ITCRMS] signInWithPassword result', { data, error })
    if (error) {
      console.error('[ITCRMS] signInWithPassword error:', error)
      setError(error.message)
      setLoading(false)
    } else {
      console.log('[ITCRMS] login success, data contains user:', !!data?.user, 'session:', !!data?.session)
      // Store in localStorage so _app.tsx can recover session after navigation
      if (data?.session) {
        localStorage.setItem('itcrms_session', JSON.stringify(data.session))
        // Also write Supabase's own localStorage token so getSession() (used by
        // _app.tsx after navigation) can read it without making a network request.
        const { user: _u, ...sessionWithoutUser } = data.session
        const encoded = btoa(JSON.stringify(sessionWithoutUser))
          .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
        localStorage.setItem('sb-fkacjlozwittzulmbapc-auth-token', encoded)
      }
      if (data?.user) {
        localStorage.setItem('itcrms_user', JSON.stringify(data.user))
      }
      router.push('/')
    }
  }

  function quickLogin(account: typeof LOCAL_ACCOUNTS[0]) {
    setEmail(account.email)
    setPassword(account.password)
    setShowLocal(true)
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">ITCRMS</div>
        <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 32 }}>
          IT Service Change Request Management System
        </div>

        <div style={{ marginBottom: 24 }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            Sign in with your organizational SSO account to access the IT Change Request Management System.
          </p>
        </div>

        <button className="login-btn" onClick={handleSSOLogin}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/>
            <polyline points="10 17 15 12 10 7"/>
            <line x1="15" y1="12" x2="3" y2="12"/>
          </svg>
          Sign in with SSO
        </button>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <button
            onClick={() => setShowLocal(v => !v)}
            style={{
              background: 'none', border: 'none', color: 'var(--primary-color)',
              fontSize: 13, cursor: 'pointer', textDecoration: 'underline'
            }}
          >
            Use local test account
          </button>
        </div>

        {showLocal && (
          <div style={{ marginTop: 20, borderTop: '1px solid var(--border-color)', paddingTop: 20 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
              Local test accounts (email: Test1234! as password)
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {LOCAL_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  onClick={() => quickLogin(acc)}
                  style={{
                    padding: '8px 12px', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)',
                    borderRadius: 8, color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer',
                    textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
                >
                  <span>{acc.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{acc.email}</span>
                </button>
              ))}
            </div>

            <form onSubmit={handleLocalLogin} style={{ marginTop: 16 }}>
              <div style={{ display: 'grid', gap: 10 }}>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }}
                  required
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border-color)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontSize: 13 }}
                  required
                />
                {error && <div style={{ color: 'var(--error-color)', fontSize: 12 }}>{error}</div>}
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    padding: '8px 16px', background: 'var(--primary-color)', color: '#fff',
                    border: 'none', borderRadius: 8, fontSize: 13, cursor: 'pointer', opacity: loading ? 0.6 : 1
                  }}
                >
                  {loading ? 'Signing in...' : 'Sign in'}
                </button>
              </div>
            </form>
          </div>
        )}

        <div style={{ marginTop: 24, fontSize: 11, color: 'var(--text-secondary)' }}>
          Having trouble signing in? Contact IT Support.
        </div>
      </div>
    </div>
  )
}

export default LoginPage