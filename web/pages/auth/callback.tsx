import type { NextPage } from 'next'
import { useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@/lib/supabase'

const CallbackPage: NextPage = () => {
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function handleCallback() {
      const { data: { user }, error } = await supabase.auth.getUser()

      if (error || !user) {
        router.replace('/auth/login')
        return
      }

      router.replace('/')
    }

    handleCallback()
  }, [])

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      flexDirection: 'column',
      gap: 16,
    }}>
      <div className="spinner" />
      <div style={{ color: 'var(--text-secondary)' }}>Completing sign in...</div>
    </div>
  )
}

export default CallbackPage