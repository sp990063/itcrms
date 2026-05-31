import type { AppRole, ChangeRequest } from './types'

// R5: Centralized IT role constants — used across rbac.ts and auth.ts
export const IT_ROLE_NAMES = [
  'it_staff', 'it_supervisor', 'it_section_head', 'it_director',
  'committee_member', 'deployment_executor', 'deployment_checker', 'admin'
] as const

export const IT_STAFF_ROLES = [
  'it_staff', 'it_supervisor', 'it_section_head', 'it_director', 'admin'
] as const

export type ITStaffRole = typeof IT_STAFF_ROLES[number]

export function isITStaff(roles: AppRole[]): boolean {
  return roles.some(r => IT_ROLE_NAMES.includes(r.name as any))
}

export function isAdmin(roles: AppRole[]): boolean {
  return roles.some(r => r.name === 'admin')
}

export interface NavItem {
  label: string
  href: string
}

export function canViewCR(roles: AppRole[], cr: ChangeRequest, userId: string): boolean {
  if (isITStaff(roles)) return true
  return cr.applicant_id === userId
}

export function canEditCR(roles: AppRole[], cr: ChangeRequest, userId: string): boolean {
  // Only draft CRs can be edited by applicant
  if (cr.status === 'draft' && cr.applicant_id === userId) return true
  // R5: Use centralized IT_STAFF_ROLES constant
  const isITStaff = roles.some(r => (IT_STAFF_ROLES as readonly string[]).includes(r.name))
  if (isITStaff) {
    // admin can edit any CR; other IT roles only their own draft CRs
    if (isAdmin(roles)) return true
    // applicant can always edit their own draft CRs
    return cr.applicant_id === userId
  }
  return false
}

export function canApproveAtStep(
  roles: AppRole[],
  cr: ChangeRequest,
  stepKey: string,
  stepRequiresRole: string | null,
  allSteps?: { step_key: string; step_order: number }[]
): boolean {
  if (!stepRequiresRole) return false
  // R2: Guard against out-of-order approvals — only enforce when allSteps is provided
  if (allSteps && allSteps.length > 0) {
    const currentStep = allSteps.find(s => s.step_order === cr.current_step_order)
    if (!currentStep || currentStep.step_key !== stepKey) return false
  }
  return roles.some(r => r.name === stepRequiresRole)
}

export function getNavItems(roles: AppRole[]): NavItem[] {
  if (isAdmin(roles)) {
    return [
      { label: 'Dashboard', href: '/' },
      { label: 'Submit New CR', href: '/cr/new' },
      { label: 'My CRs', href: '/cr/my' },
      { label: 'All CRs', href: '/cr/all' },
      { label: 'Users', href: '/admin/users' },
      { label: 'Roles', href: '/admin/roles' },
      { label: 'CR Types', href: '/admin/cr-types' },
    ]
  }

  if (isITStaff(roles)) {
    return [
      { label: 'Dashboard', href: '/' },
      { label: 'Submit New CR', href: '/cr/new' },
      { label: 'My CRs', href: '/cr/my' },
      { label: 'All CRs', href: '/cr/all' },
      { label: 'Admin', href: '/admin/users' },
    ]
  }

  return [
    { label: 'Dashboard', href: '/' },
    { label: 'Submit New CR', href: '/cr/new' },
    { label: 'My CRs', href: '/cr/my' },
  ]
}