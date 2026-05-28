import type { NextPage } from 'next'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@/lib/supabase'

const LoginPage: NextPage = () => {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    supabase.auth.getUser().then(({ data }: { data: { user: unknown } }) => {
      if (data.user) {
        router.replace('/')
      }
    })
  }, [])

  async function handleSSOLogin() {
    const redirectTo = typeof window !== 'undefined'
      ? `${window.location.origin}/auth/callback`
      : undefined

    const { data, error } = await (supabase.auth as any).signInWithOAuth({
      provider: 'openidconnect' as any,
      options: {
        redirectTo,
        scopes: 'openid profile email',
      },
    })

    if (error) {
      alert('Login failed: ' + error.message)
    } else if (data?.url) {
      router.push(data.url)
    }
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

        <div style={{ marginTop: 24, fontSize: 11, color: 'var(--text-secondary)' }}>
          Having trouble signing in? Contact IT Support.
        </div>
      </div>
    </div>
  )
}

export default LoginPage