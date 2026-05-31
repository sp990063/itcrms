import type { NextPage } from 'next'
import { useRouter } from 'next/router'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { getSession, hasAnyRole } from '@/lib/auth'
import StatusBadge from '@/components/ui/StatusBadge'
import StepTimeline from '@/components/ui/StepTimeline'
import CRChatroom from '@/components/CRChatroom'
import ApprovalDialog from '@/components/ApprovalDialog'
import type { ChangeRequest, WorkflowStep, AppRole, AuditLogEntry, User } from '@/lib/types'
import { STEP_KEYS, ROLE_NAMES } from '@/lib/types'

const CRDetailPage: NextPage = () => {
  const router = useRouter()
  const { id } = router.query
  const [cr, setCr] = useState<ChangeRequest | null>(null)
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialogMode, setDialogMode] = useState<'approve' | 'reject' | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [currentStep, setCurrentStep] = useState<WorkflowStep | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [displayName, setDisplayName] = useState('Unknown')
  const [roles, setRoles] = useState<AppRole[]>([])
  const supabase = createClient()

  useEffect(() => {
    if (!id) return
    async function load() {
      const session = await getSession(supabase)
      if (!session) {
        router.replace('/auth/login')
        return
      }

      setUser(session.user as unknown as User)
      setRoles(session.roles)

      // Get display name
      const { data: profile } = await supabase
        .from('auth.user_profiles')
        .select('display_name')
        .eq('id', session.user.id)
        .single()
      setDisplayName(profile?.display_name ?? session.user.email ?? 'Unknown')

      // Load CR with joins
      const { data: crData } = await supabase
        .from('change_requests')
        .select(`
          *,
          cr_type:cr_types(*),
          system_tier:system_tiers(*),
          applicant:auth.users!applicant_id(id, email)
        `)
        .eq('id', id as string)
        .single()

      if (!crData) {
        setError('CR not found')
        setLoading(false)
        return
      }

      setCr(crData as unknown as ChangeRequest)

      // Load workflow steps for this CR type
      const { data: stepsData } = await supabase
        .from('workflow_steps')
        .select('*')
        .eq('cr_type_id', crData.cr_type_id)
        .order('step_order')

      setSteps(stepsData ?? [])

      // Set current step
      const current = (stepsData ?? []).find((s: { step_order: number }) => s.step_order === crData.current_step_order)
      setCurrentStep(current ?? null)

      // Load audit log
      const { data: auditData } = await supabase
        .from('cr_audit_log')
        .select('*, user:auth.users(id, email)')
        .eq('cr_id', id as string)
        .order('created_at', { ascending: true })

      setAuditLog(auditData as AuditLogEntry[] ?? [])
      setLoading(false)
    }

    load()
  }, [id])

  async function handleApprove(notes: string) {
    if (!cr || !currentStep || !user) return
    setActionLoading(true)

    try {
      const { error: fnErr } = await supabase.functions.invoke('approve-cr', {
        body: {
          cr_id: cr.id,
          step_key: currentStep.step_key,
          notes,
        },
      })

      if (fnErr) throw new Error(fnErr.message)

      // Refresh data
      const { data: updated } = await supabase
        .from('change_requests')
        .select('*, cr_type:cr_types(*), system_tier:system_tiers(*)')
        .eq('id', id as string)
        .single()
      setCr(updated as unknown as ChangeRequest)

      // Reload steps + current step
      if (updated) {
        const { data: stepsData } = await supabase
          .from('workflow_steps')
          .select('*')
          .eq('cr_type_id', (updated as any).cr_type_id)
          .order('step_order')
        setSteps(stepsData ?? [])
        const refreshed = (stepsData ?? []).find((s: WorkflowStep) => s.step_order === (updated as any).current_step_order)
        setCurrentStep(refreshed ?? null)

        // Reload audit log
        const { data: auditData } = await supabase
          .from('cr_audit_log')
          .select('*, user:auth.users(id, email)')
          .eq('cr_id', id as string)
          .order('created_at', { ascending: true })
        setAuditLog(auditData as AuditLogEntry[] ?? [])
      }

      setDialogMode(null)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to approve')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleReject(notes: string) {
    if (!cr || !currentStep || !user) return
    setActionLoading(true)

    try {
      const { error: fnErr } = await supabase.functions.invoke('reject-cr', {
        body: {
          cr_id: cr.id,
          step_key: currentStep.step_key,
          reason: notes,
        },
      })

      if (fnErr) throw new Error(fnErr.message)

      const { data: updated } = await supabase
        .from('change_requests')
        .select('*, cr_type:cr_types(*), system_tier:system_tiers(*)')
        .eq('id', id as string)
        .single()
      setCr(updated as unknown as ChangeRequest)

      // Reload steps + current step
      if (updated) {
        const { data: stepsData } = await supabase
          .from('workflow_steps')
          .select('*')
          .eq('cr_type_id', (updated as any).cr_type_id)
          .order('step_order')
        setSteps(stepsData ?? [])
        const refreshed = (stepsData ?? []).find((s: WorkflowStep) => s.step_order === (updated as any).current_step_order)
        setCurrentStep(refreshed ?? null)

        // Reload audit log
        const { data: auditData } = await supabase
          .from('cr_audit_log')
          .select('*, user:auth.users(id, email)')
          .eq('cr_id', id as string)
          .order('created_at', { ascending: true })
        setAuditLog(auditData as AuditLogEntry[] ?? [])
      }

      setDialogMode(null)
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to reject')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleAdvance() {
    if (!cr || !currentStep || !user) return
    setActionLoading(true)

    try {
      const { error: fnErr } = await supabase.functions.invoke('advance-cr', {
        body: {
          cr_id: cr.id,
          step_key: currentStep.step_key,
        },
      })

      if (fnErr) throw new Error(fnErr.message)

      const { data: updated } = await supabase
        .from('change_requests')
        .select('*, cr_type:cr_types(*), system_tier:system_tiers(*)')
        .eq('id', id as string)
        .single()
      setCr(updated as unknown as ChangeRequest)

      // Reload steps + current step
      if (updated) {
        const { data: stepsData } = await supabase
          .from('workflow_steps')
          .select('*')
          .eq('cr_type_id', (updated as any).cr_type_id)
          .order('step_order')
        setSteps(stepsData ?? [])
        const refreshed = (stepsData ?? []).find((s: WorkflowStep) => s.step_order === (updated as any).current_step_order)
        setCurrentStep(refreshed ?? null)

        // Reload audit log
        const { data: auditData } = await supabase
          .from('cr_audit_log')
          .select('*, user:auth.users(id, email)')
          .eq('cr_id', id as string)
          .order('created_at', { ascending: true })
        setAuditLog(auditData as AuditLogEntry[] ?? [])
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to advance')
    } finally {
      setActionLoading(false)
    }
  }

  async function handleSubmitToCommittee() {
    if (!cr || !currentStep || !user) return
    setActionLoading(true)

    try {
      const { error: fnErr } = await supabase.functions.invoke('approve-cr', {
        body: {
          cr_id: cr.id,
          step_key: STEP_KEYS.IT_SUPERVISOR_APPROVE,
          notes: 'Approved by IT Supervisor - submitted to committee',
        },
      })

      if (fnErr) throw new Error(fnErr.message)

      const { data: updated } = await supabase
        .from('change_requests')
        .select('*')
        .eq('id', id as string)
        .single()
      setCr(updated as unknown as ChangeRequest)

      // Reload steps + current step
      if (updated) {
        const { data: stepsData } = await supabase
          .from('workflow_steps')
          .select('*')
          .eq('cr_type_id', (updated as any).cr_type_id)
          .order('step_order')
        setSteps(stepsData ?? [])
        const refreshed = (stepsData ?? []).find((s: WorkflowStep) => s.step_order === (updated as any).current_step_order)
        setCurrentStep(refreshed ?? null)

        // Reload audit log
        const { data: auditData } = await supabase
          .from('cr_audit_log')
          .select('*, user:auth.users(id, email)')
          .eq('cr_id', id as string)
          .order('created_at', { ascending: true })
        setAuditLog(auditData as AuditLogEntry[] ?? [])
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to submit to committee')
    } finally {
      setActionLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="page-container" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <div className="spinner" />
      </div>
    )
  }

  if (error || !cr) {
    return (
      <div className="page-container">
        <div className="empty-state">
          <div className="empty-state-title">{error ?? 'CR not found'}</div>
          <button className="btn btn-secondary" onClick={() => router.back()} style={{ marginTop: 16 }}>
            Go Back
          </button>
        </div>
      </div>
    )
  }

  const approvals = cr.approvals ?? []
  const canApprove = currentStep?.requires_role
    ? roles.some(r => r.name === currentStep.requires_role)
    : false

  const tierCode = (cr as any).system_tier?.code ?? ''
  const tierLabel = (cr as any).system_tier?.label ?? ''

  return (
    <div className="page-container">
      {dialogMode && currentStep && (
        <ApprovalDialog
          mode={dialogMode}
          stepLabel={currentStep.step_label}
          onConfirm={dialogMode === 'approve' ? handleApprove : handleReject}
          onCancel={() => setDialogMode(null)}
          loading={actionLoading}
        />
      )}

      {/* CR Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 4 }}>
            {cr.cr_number}
          </div>
          <h1 className="page-title" style={{ marginBottom: 8 }}>{cr.title}</h1>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <StatusBadge status={cr.status} />
            <span className={`tier-badge ${tierCode}`}>{tierLabel}</span>
            {cr.is_internet_facing && (
              <span className="tier-badge" style={{ background: '#e3f2fd', color: 'var(--primary)' }}>
                Internet Facing
              </span>
            )}
            <span className={`risk-${cr.risk_level}`} style={{ textTransform: 'capitalize' }}>
              {cr.risk_level} Risk
            </span>
          </div>
        </div>
      </div>

      <div className="cr-detail-layout">
        {/* Left Panel */}
        <div>
          {/* Info Cards */}
          <div className="cr-info-grid">
            <div className="cr-info-card">
              <div className="cr-info-card-label">Applicant</div>
              <div className="cr-info-card-value">
                {(cr as any).applicant?.email ?? '—'}
              </div>
            </div>
            <div className="cr-info-card">
              <div className="cr-info-card-label">CR Type</div>
              <div className="cr-info-card-value">
                {(cr as any).cr_type?.name ?? '—'}
              </div>
            </div>
            <div className="cr-info-card">
              <div className="cr-info-card-label">Submitted</div>
              <div className="cr-info-card-value">
                {cr.submitted_at
                  ? new Date(cr.submitted_at).toLocaleDateString()
                  : 'Not submitted'}
              </div>
            </div>
            <div className="cr-info-card">
              <div className="cr-info-card-label">Current Step</div>
              <div className="cr-info-card-value">
                {currentStep?.step_label ?? '—'}
              </div>
            </div>
          </div>

          {/* Description */}
          <div className="card" style={{ marginBottom: 20 }}>
            <div className="section-title">Description</div>
            <p style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>{cr.description}</p>
          </div>

          {/* Workflow Timeline */}
          {steps.length > 0 && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="section-title">Workflow Progress</div>
              <StepTimeline
                steps={steps}
                currentStepOrder={cr.current_step_order}
                approvals={approvals}
              />
            </div>
          )}

          {/* Action Buttons */}
          {canApprove && currentStep && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="section-title">Actions</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  className="btn btn-success"
                  onClick={() => setDialogMode('approve')}
                  disabled={actionLoading}
                >
                  ✅ Approve
                </button>
                <button
                  className="btn btn-danger"
                  onClick={() => setDialogMode('reject')}
                  disabled={actionLoading}
                >
                  ❌ Reject
                </button>
                {currentStep.step_key === STEP_KEYS.IT_SUPERVISOR_APPROVE && (
                  <button
                    className="btn btn-secondary"
                    onClick={handleSubmitToCommittee}
                    disabled={actionLoading}
                  >
                    Submit to Committee
                  </button>
                )}
              </div>
            </div>
          )}

          {/* IT Staff Advance Button */}
          {roles.some(r => r.name === ROLE_NAMES.IT_STAFF) &&
           currentStep?.step_key === STEP_KEYS.IT_PICKUP && (
            <div className="card" style={{ marginBottom: 20 }}>
              <div className="section-title">Actions</div>
              <button
                className="btn btn-primary"
                onClick={handleAdvance}
                disabled={actionLoading}
              >
                Pick Up CR
              </button>
            </div>
          )}

          {/* Step-specific forms would go here in expanded version */}

          {/* Audit Log */}
          {auditLog.length > 0 && (
            <div className="card">
              <div className="section-title">Audit Log</div>
              <div className="audit-log">
                {auditLog.map(entry => (
                  <div key={entry.id} className="audit-entry">
                    <div className="audit-entry-dot" />
                    <div className="audit-entry-content">
                      <div className="audit-entry-action">
                        {entry.action}
                        {entry.step_key && <span style={{ fontWeight: 400 }}> — {entry.step_key}</span>}
                      </div>
                      <div className="audit-entry-meta">
                        {(entry.user as any)?.email ?? 'System'} • {new Date(entry.created_at).toLocaleString()}
                      </div>
                      {entry.details && typeof entry.details === 'object' ? (
                        <div style={{ fontSize: 12, marginTop: 2, color: 'var(--text-secondary)' }}>
                          {String(JSON.stringify(entry.details as Record<string, unknown>))}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Panel - Chatroom */}
        <div>
          {user && (
            <CRChatroom
              crId={cr.id}
              currentUser={user}
              displayName={displayName}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default CRDetailPage