import type { AppProps } from 'next/app'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Link from 'next/link'
import { createBrowserClient } from '@supabase/ssr'
import NotificationBell from '@/components/ui/NotificationBell'
import { getSession } from '@/lib/auth'
import { getNavItems } from '@/lib/rbac'
import type { AppRole } from '@/lib/types'
import '@/styles/globals.css'

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  useEffect(() => {
    async function loadUser() {
      const session = await getSession(supabase)
      if (session) {
        setUser(session.user)
        setRoles(session.roles)
      }
      setLoading(false)
    }
    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        const s = await getSession(supabase)
        if (s) {
          setUser(s.user)
          setRoles(s.roles)
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null)
        setRoles([])
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  // Skip layout for auth pages
  const isAuthPage = router.pathname.startsWith('/auth')

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
        <div className="spinner" />
      </div>
    )
  }

  if (isAuthPage) {
    return <Component {...pageProps} />
  }

  const navItems = getNavItems(roles)
  const isActive = (href: string) => router.pathname === href

  return (
    <div>
      {!user ? (
        <Component {...pageProps} />
      ) : (
        <>
          <header className="header">
            <div className="header-logo">ITCRMS</div>
            <nav className="header-nav">
              {navItems.map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className={isActive(item.href) ? 'active' : ''}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <NotificationBell />
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                {user.email}
              </div>
              <button
                onClick={async () => {
                  await supabase.auth.signOut()
                  router.push('/auth/login')
                }}
                style={{
                  background: 'none',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  padding: '4px 10px',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Logout
              </button>
            </div>
          </header>
          <main>
            <Component {...pageProps} />
          </main>
        </>
      )}
    </div>
  )
}