import type { AppRole, ChangeRequest } from './types'

export interface NavItem {
  label: string
  href: string
}

export function canViewCR(roles: AppRole[], cr: ChangeRequest, userId: string): boolean {
  const IT_ROLES = [
    'it_staff', 'it_supervisor', 'it_section_head', 'it_director',
    'committee_member', 'admin'
  ]
  const isIT = roles.some(r => IT_ROLES.includes(r.name))
  if (isIT) return true
  return cr.applicant_id === userId
}

export function canEditCR(roles: AppRole[], cr: ChangeRequest, userId: string): boolean {
  // Only draft CRs can be edited by applicant
  if (cr.status === 'draft' && cr.applicant_id === userId) return true
  // IT staff can edit assigned CRs
  const itRoles = ['it_staff', 'it_supervisor', 'it_section_head', 'it_director', 'admin']
  if (roles.some(r => itRoles.includes(r.name))) return true
  return false
}

export function canApproveAtStep(
  roles: AppRole[],
  cr: ChangeRequest,
  stepKey: string,
  stepRequiresRole: string | null
): boolean {
  if (!stepRequiresRole) return false
  return roles.some(r => r.name === stepRequiresRole)
}

export function getNavItems(roles: AppRole[]): NavItem[] {
  const isAdmin = roles.some(r => r.name === 'admin')
  const isIT = roles.some(r => [
    'it_staff', 'it_supervisor', 'it_section_head', 'it_director',
    'committee_member', 'deployment_executor', 'deployment_checker', 'admin'
  ].includes(r.name))

  if (isAdmin) {
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

  if (isIT) {
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