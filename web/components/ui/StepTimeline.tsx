import React from 'react'
import type { WorkflowStep as WorkflowStepType } from '@/lib/types'

interface StepTimelineProps {
  steps: WorkflowStepType[]
  currentStepOrder: number | null
  approvals: Array<{ step_key: string; approved_at?: string; skipped?: boolean }>
}

export default function StepTimeline({ steps, currentStepOrder, approvals }: StepTimelineProps) {
  if (!steps.length) return null

  const approvalMap = new Map(
    approvals.map(a => [a.step_key, a])
  )

  return (
    <div className="timeline">
      {steps.map((step, index) => {
        const approval = approvalMap.get(step.step_key)
        const isCompleted = !!approval?.approved_at || !!approval?.skipped
        const isRejected = false // rejected state would come from audit log
        const isCurrent = step.step_order === currentStepOrder
        const isFuture = !isCompleted && !isCurrent

        let dotClass = 'future'
        let labelClass = ''
        if (isCompleted) { dotClass = 'completed'; labelClass = 'completed' }
        else if (isCurrent) { dotClass = 'current'; labelClass = 'current' }
        else if (isRejected) { dotClass = 'rejected'; labelClass = 'rejected' }
        if (step.can_skip && !isCompleted && !isCurrent) dotClass = 'skippable'

        return (
          <div key={step.id} className="timeline-item">
            <div className="timeline-marker">
              <div className={`timeline-dot ${dotClass}`}>
                {isCompleted ? '✓' : isCurrent ? (index + 1) : (index + 1)}
              </div>
              {index < steps.length - 1 && (
                <div className={`timeline-connector ${isCompleted ? 'completed' : ''}`} />
              )}
            </div>
            <div className="timeline-content">
              <div className={`timeline-label ${labelClass}`}>
                {step.step_label}
                {step.can_skip && <span style={{ fontSize: 10, marginLeft: 4, color: 'var(--text-secondary)' }}>(skippable)</span>}
              </div>
              {approval?.approved_at && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Completed {new Date(approval.approved_at).toLocaleDateString()}
                </div>
              )}
              {approval?.skipped && (
                <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 2 }}>
                  Skipped
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}