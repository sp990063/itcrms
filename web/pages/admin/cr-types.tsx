import type { NextPage } from 'next'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@/lib/supabase'
import { getSession, isAdmin } from '@/lib/auth'
import CRTypeManager from '@/components/Admin/CRTypeManager'

const CRTypesPage: NextPage = () => {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const session = await getSession(supabase)
      if (!session) {
        router.replace('/auth/login')
        return
      }

      if (!isAdmin(session.roles)) {
        router.replace('/')
        return
      }

      setLoading(false)
    }

    load()
  }, [])

  if (loading) {
    return (
      <div className="page-container" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page-container">
      <h1 className="page-title">CR Type Configuration</h1>
      <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
        Configure CR types and their workflow steps. Click a CR type to view and edit its workflow steps.
      </p>

      <CRTypeManager onUpdate={() => {}} />
    </div>
  )
}

export default CRTypesPage