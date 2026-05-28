import React, { useState } from 'react'

interface ApprovalDialogProps {
  mode: 'approve' | 'reject'
  stepLabel: string
  onConfirm: (notes: string) => Promise<void>
  onCancel: () => void
  loading?: boolean
}

export default function ApprovalDialog({
  mode,
  stepLabel,
  onConfirm,
  onCancel,
  loading = false
}: ApprovalDialogProps) {
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleConfirm() {
    if (mode === 'reject' && !notes.trim()) {
      setError('Rejection reason is required')
      return
    }
    setError(null)
    try {
      await onConfirm(notes.trim())
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'An error occurred')
    }
  }

  return (
    <div className="dialog-overlay" onClick={onCancel}>
      <div className="dialog" onClick={e => e.stopPropagation()}>
        <div className="dialog-header">
          {mode === 'approve' ? '✅ Approve' : '❌ Reject'} — {stepLabel}
        </div>
        <div className="dialog-body">
          <div className="form-group">
            <label>
              {mode === 'reject' ? 'Reason for rejection *' : 'Notes (optional)'}
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={
                mode === 'reject'
                  ? 'Please provide a reason for rejection...'
                  : 'Add any notes about this approval...'
              }
              rows={4}
              disabled={loading}
            />
            {mode === 'reject' && !notes.trim() && (
              <div className="form-error">Reason is required</div>
            )}
          </div>
          {error && (
            <div className="form-error" style={{ marginBottom: 12 }}>{error}</div>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button
            className={`btn ${mode === 'approve' ? 'btn-success' : 'btn-danger'}`}
            onClick={handleConfirm}
            disabled={loading || (mode === 'reject' && !notes.trim())}
          >
            {loading ? 'Processing...' : mode === 'approve' ? 'Confirm Approval' : 'Confirm Rejection'}
          </button>
        </div>
      </div>
    </div>
  )
}