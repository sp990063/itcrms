import React from 'react'
import { createClient } from '@/lib/supabase'
import type { SubmitCRRequest, SystemTier, CRType } from '@/lib/types'
import { RISK_LEVELS } from '@/lib/types'

interface CRFormProps {
  onSuccess: (crId: string) => void
  onError: (message: string) => void
}

export default function CRForm({ onSuccess, onError }: CRFormProps) {
  const [crTypeId, setCrTypeId] = React.useState<number | ''>('')
  const [title, setTitle] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [systemTierId, setSystemTierId] = React.useState<number | ''>('')
  const [isInternetFacing, setIsInternetFacing] = React.useState(false)
  const [riskLevel, setRiskLevel] = React.useState<'high' | 'medium' | 'low'>('medium')
  const [crTypes, setCrTypes] = React.useState<CRType[]>([])
  const [systemTiers, setSystemTiers] = React.useState<SystemTier[]>([])
  const [loading, setLoading] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const supabase = createClient()

  React.useEffect(() => {
    Promise.all([
      supabase.from('cr_types').select('*').eq('is_active', true),
      supabase.from('system_tiers').select('*'),
    ]).then(([typesRes, tiersRes]) => {
      setCrTypes(typesRes.data ?? [])
      setSystemTiers(tiersRes.data ?? [])
    })
  }, [])

  function validate(): boolean {
    const errs: Record<string, string> = {}
    if (!crTypeId) errs.cr_type_id = 'CR Type is required'
    if (!title.trim()) errs.title = 'Title is required'
    else if (title.length > 200) errs.title = 'Title must be 200 characters or less'
    if (!description.trim()) errs.description = 'Description is required'
    else if (description.length > 5000) errs.description = 'Description must be 5000 characters or less'
    if (!systemTierId) errs.system_tier_id = 'System Tier is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setLoading(true)
    setErrors({})

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      // Create draft CR
      const { data: crData, error: crErr } = await supabase
        .from('change_requests')
        .insert({
          cr_type_id: crTypeId as number,
          title: title.trim(),
          description: description.trim(),
          system_tier_id: systemTierId as number,
          is_internet_facing: isInternetFacing,
          risk_level: riskLevel,
          applicant_id: user.id,
          status: 'draft',
        })
        .select('id')
        .single()

      if (crErr) {
        console.error('[CRForm] insert error:', crErr)
        throw new Error(crErr.message ?? 'Failed to create CR')
      }
      if (!crData) throw new Error('No data returned from insert')

      onSuccess(crData.id)
    } catch (err: unknown) {
      console.error('[CRForm] submit error:', err)
      const msg = err instanceof Error ? err.message : 'Failed to submit CR'
      setErrors({ form: msg })
      onError(msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="form-group">
        <label>CR Type *</label>
        <select
          value={crTypeId}
          onChange={e => setCrTypeId(e.target.value ? Number(e.target.value) : '')}
          disabled={loading}
        >
          <option value="">Select CR Type...</option>
          {crTypes.map(ct => (
            <option key={ct.id} value={ct.id}>{ct.name}</option>
          ))}
        </select>
        {errors.cr_type_id && <div className="form-error">{errors.cr_type_id}</div>}
      </div>

      <div className="form-group">
        <label>Title *</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="Brief description of the change request"
          maxLength={200}
          disabled={loading}
        />
        {errors.title && <div className="form-error">{errors.title}</div>}
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
          {title.length}/200
        </div>
      </div>

      <div className="form-group">
        <label>Description *</label>
        <textarea
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="Detailed description of the proposed change..."
          maxLength={5000}
          rows={6}
          disabled={loading}
        />
        {errors.description && <div className="form-error">{errors.description}</div>}
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
          {description.length}/5000
        </div>
      </div>

      <div className="grid-2">
        <div className="form-group">
          <label>System Tier *</label>
          <select
            value={systemTierId}
            onChange={e => setSystemTierId(e.target.value ? Number(e.target.value) : '')}
            disabled={loading}
          >
            <option value="">Select Tier...</option>
            {systemTiers.map(tier => (
              <option key={tier.id} value={tier.id}>{tier.label}</option>
            ))}
          </select>
          {errors.system_tier_id && <div className="form-error">{errors.system_tier_id}</div>}
        </div>

        <div className="form-group">
          <label>Risk Level *</label>
          <div style={{ display: 'flex', gap: 12, padding: '8px 0' }}>
            {RISK_LEVELS.map(risk => (
              <label key={risk} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <input
                  type="radio"
                  name="risk_level"
                  value={risk}
                  checked={riskLevel === risk}
                  onChange={() => setRiskLevel(risk)}
                  disabled={loading}
                />
                <span className={`risk-${risk}`} style={{ textTransform: 'capitalize' }}>{risk}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="form-group">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={isInternetFacing}
            onChange={e => setIsInternetFacing(e.target.checked)}
            disabled={loading}
          />
          Internet Facing System
        </label>
      </div>

      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="btn btn-secondary" onClick={() => window.history.back()} disabled={loading}>
          Cancel
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Submitting...' : 'Submit CR'}
        </button>
      </div>
    </form>
  )
}