import type { NextPage } from 'next'
import { useState } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import CRForm from '@/components/CRForm'

const NewCRPage: NextPage = () => {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  async function handleSuccess(crId: string) {
    // Call submit-cr edge function to advance from draft to first step
    const { error: fnError } = await supabase.functions.invoke('submit-cr', {
      body: { cr_id: crId },
    })

    if (fnError) {
      // Edge function not available yet — just redirect to the CR detail page
      router.push(`/cr/${crId}`)
      return
    }

    router.push(`/cr/${crId}`)
  }

  function handleError(message: string) {
    setError(message)
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Submit New Change Request</h1>

      {error && (
        <div style={{
          padding: '12px 16px',
          background: '#fce8e6',
          color: 'var(--danger)',
          borderRadius: 'var(--radius)',
          marginBottom: 20,
          fontSize: 14,
        }}>
          {error}
        </div>
      )}

      <div className="card" style={{ maxWidth: 800 }}>
        <CRForm onSuccess={handleSuccess} onError={handleError} />
      </div>
    </div>
  )
}

export default NewCRPage