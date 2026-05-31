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
      console.log('[ITCRMS] loadUser starting...')
      try {
        // 1. localStorage recovery (set by login.tsx before navigation)
        const storedSessionRaw = localStorage.getItem('itcrms_session')
        const storedUserRaw = localStorage.getItem('itcrms_user')
        if (storedSessionRaw && storedUserRaw) {
          console.log('[ITCRMS] recovered session from localStorage')
          const storedUser = JSON.parse(storedUserRaw)
          setUser(storedUser)
          // Fetch roles from DB while localStorage still has the session
          // (getSession() reads from localStorage — must NOT remove items before this call)
          try {
            const s = await getSession(supabase)
            setRoles(s?.roles ?? [])
          } catch (err) {
            console.error('[ITCRMS] loadUser roles error:', err)
            setRoles([])
          } finally {
            // Clean up temp localStorage after roles are fetched
            // Note: we intentionally do NOT remove itcrms_session here — it is
            // needed by getSession() called from onAuthStateChange below.
            // Only remove the user key; session stays as fallback for getSession().
            localStorage.removeItem('itcrms_user')
          }
          return
        }

        // 2. Normal getSession (page refresh flow — reads localStorage via Supabase)
        const session = await getSession(supabase)
        console.log('[ITCRMS] getSession result:', { session: !!session, roles: session?.roles?.length })
        if (!session) {
          console.log('[ITCRMS] no session found, setting null')
          setUser(null)
          setRoles([])
          return
        }
        setUser(session.user)
        setRoles(session.roles)
      } catch (err) {
        console.error('[ITCRMS] loadUser error:', err)
        setUser(null)
        setRoles([])
      } finally {
        console.log('[ITCRMS] loadUser finished, setting loading=false')
        setLoading(false)
      }
    }
    loadUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        setUser(session.user)
        try {
          const s = await getSession(supabase)
          setRoles(s?.roles ?? [])
        } catch (err) {
          console.error('[ITCRMS] onAuthStateChange error:', err)
          setRoles([])
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