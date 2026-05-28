import React from 'react'
import { CR_STATUS_LABELS } from '@/lib/types'

interface StatusBadgeProps {
  status: string
}

export default function StatusBadge({ status }: StatusBadgeProps) {
  const label = CR_STATUS_LABELS[status] ?? status
  const statusClass = getStatusClass(status)

  return (
    <span className={`status-badge ${statusClass}`}>
      {label}
    </span>
  )
}

function getStatusClass(status: string): string {
  switch (status) {
    case 'draft':
      return 'draft'
    case 'pending_user_supervisor':
    case 'pending_it_pickup':
    case 'pending_it_impact':
    case 'pending_it_supervisor':
    case 'pending_section_head':
    case 'pending_director':
    case 'pending_cost_estimate':
    case 'pending_design':
    case 'pending_development':
    case 'pending_sit_test_case':
    case 'pending_sit_execution':
    case 'pending_uat_test_case':
    case 'pending_uat_execution':
    case 'pending_committee':
    case 'pending_deployment':
    case 'pending_deployment_check':
      return 'pending'
    case 'completed':
      return 'completed'
    case 'rejected':
    case 'cancelled':
      return 'rejected'
    default:
      return 'draft'
  }
}