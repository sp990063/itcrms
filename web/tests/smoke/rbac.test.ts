import { describe, it, expect } from 'vitest'
import { canViewCR, canEditCR, canApproveAtStep } from '@/lib/rbac'
import type { AppRole, ChangeRequest } from '@/lib/types'

// Helper to create mock roles
function createRoles(...names: string[]): AppRole[] {
  return names.map((name, i) => ({
    id: i + 1,
    name,
    description: null,
    created_at: new Date().toISOString(),
  }))
}

// Helper to create mock CR
function createMockCR(overrides: Partial<ChangeRequest> = {}): ChangeRequest {
  return {
    id: 'cr-1',
    cr_number: 'CR-2025-00001',
    cr_type_id: 1,
    title: 'Test CR',
    description: 'Test description',
    applicant_id: 'user-1',
    applicant_supervisor_id: 'supervisor-1',
    system_tier_id: 1,
    is_internet_facing: false,
    risk_level: 'medium',
    status: 'draft',
    current_step_key: null,
    current_step_order: null,
    approvals: [],
    submitted_at: null,
    completed_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

describe('rbac module', () => {
  describe('canViewCR', () => {
    it('user can view their own CR', () => {
      const roles = createRoles('user')
      const cr = createMockCR({ applicant_id: 'user-1' })
      const result = canViewCR(roles, cr, 'user-1')
      expect(result).toBe(true)
    })

    it('user cannot view another user\'s CR', () => {
      const roles = createRoles('user')
      const cr = createMockCR({ applicant_id: 'user-2' })
      const result = canViewCR(roles, cr, 'user-1')
      expect(result).toBe(false)
    })

    it('IT staff can view all CRs', () => {
      const roles = createRoles('it_staff')
      const cr = createMockCR({ applicant_id: 'user-1' })
      const result = canViewCR(roles, cr, 'it-staff-1')
      expect(result).toBe(true)
    })

    it('IT supervisor can view all CRs', () => {
      const roles = createRoles('it_supervisor')
      const cr = createMockCR({ applicant_id: 'user-1' })
      expect(canViewCR(roles, cr, 'sup-1')).toBe(true)
    })

    it('IT section head can view all CRs', () => {
      const roles = createRoles('it_section_head')
      const cr = createMockCR({ applicant_id: 'user-1' })
      expect(canViewCR(roles, cr, 'section-head-1')).toBe(true)
    })

    it('IT director can view all CRs', () => {
      const roles = createRoles('it_director')
      const cr = createMockCR({ applicant_id: 'user-1' })
      expect(canViewCR(roles, cr, 'director-1')).toBe(true)
    })

    it('committee member can view all CRs', () => {
      const roles = createRoles('committee_member')
      const cr = createMockCR({ applicant_id: 'user-1' })
      expect(canViewCR(roles, cr, 'committee-1')).toBe(true)
    })

    it('admin can view all CRs', () => {
      const roles = createRoles('admin')
      const cr = createMockCR({ applicant_id: 'user-1' })
      expect(canViewCR(roles, cr, 'admin-1')).toBe(true)
    })
  })

  describe('canEditCR', () => {
    it('user cannot edit submitted CR', () => {
      const roles = createRoles('user')
      const cr = createMockCR({
        applicant_id: 'user-1',
        status: 'pending_user_supervisor',
      })
      const result = canEditCR(roles, cr, 'user-1')
      expect(result).toBe(false)
    })

    it('user can edit their own draft CR', () => {
      const roles = createRoles('user')
      const cr = createMockCR({
        applicant_id: 'user-1',
        status: 'draft',
      })
      const result = canEditCR(roles, cr, 'user-1')
      expect(result).toBe(true)
    })

    it('IT staff can edit their own draft CRs', () => {
      const roles = createRoles('it_staff')
      const cr = createMockCR({
        applicant_id: 'it-staff-1', // same user → own draft CR
        status: 'draft',
      })
      expect(canEditCR(roles, cr, 'it-staff-1')).toBe(true)
    })

    it('IT staff cannot edit others\' non-draft CRs', () => {
      const roles = createRoles('it_staff')
      const cr = createMockCR({
        applicant_id: 'user-1', // different user
        status: 'pending_it_impact',
      })
      // New secure policy: IT staff can only edit their own draft CRs
      expect(canEditCR(roles, cr, 'it-staff-1')).toBe(false)
    })

    it('IT supervisor can edit any non-draft CR (acting as admin)', () => {
      const roles = createRoles('it_supervisor', 'admin')
      const cr = createMockCR({
        applicant_id: 'user-1',
        status: 'pending_it_supervisor',
      })
      // it_supervisor without admin role cannot edit non-draft
      expect(canEditCR(createRoles('it_supervisor'), cr, 'sup-1')).toBe(false)
      // it_supervisor WITH admin role CAN edit any non-draft
      expect(canEditCR(roles, cr, 'sup-1')).toBe(true)
    })
  })

  describe('canApproveAtStep', () => {
    it('returns true when user has the required role for the step', () => {
      const roles = createRoles('it_supervisor')
      const cr = createMockCR()
      const result = canApproveAtStep(roles, cr, 'it_supervisor_approve', 'it_supervisor')
      expect(result).toBe(true)
    })

    it('returns false when user lacks the required role', () => {
      const roles = createRoles('user')
      const cr = createMockCR()
      const result = canApproveAtStep(roles, cr, 'it_supervisor_approve', 'it_supervisor')
      expect(result).toBe(false)
    })

    it('returns false when step requires no role', () => {
      const roles = createRoles('admin')
      const cr = createMockCR()
      const result = canApproveAtStep(roles, cr, 'submit', null)
      expect(result).toBe(false)
    })

    it('user_supervisor role can approve user_supervisor_approve step', () => {
      const roles = createRoles('user_supervisor')
      const cr = createMockCR()
      const result = canApproveAtStep(roles, cr, 'user_supervisor_approve', 'user_supervisor')
      expect(result).toBe(true)
    })

    it('it_staff role cannot approve it_supervisor_approve step', () => {
      const roles = createRoles('it_staff')
      const cr = createMockCR()
      const result = canApproveAtStep(roles, cr, 'it_supervisor_approve', 'it_supervisor')
      expect(result).toBe(false)
    })

    it('section_head role can approve section_head_approve step', () => {
      const roles = createRoles('it_section_head')
      const cr = createMockCR()
      const result = canApproveAtStep(roles, cr, 'section_head_approve', 'it_section_head')
      expect(result).toBe(true)
    })

    it('director role can approve director_approve step', () => {
      const roles = createRoles('it_director')
      const cr = createMockCR()
      const result = canApproveAtStep(roles, cr, 'director_approve', 'it_director')
      expect(result).toBe(true)
    })

    it('committee_member role can approve committee_review step', () => {
      const roles = createRoles('committee_member')
      const cr = createMockCR()
      const result = canApproveAtStep(roles, cr, 'committee_review', 'committee_member')
      expect(result).toBe(true)
    })

    it('admin without specific role cannot approve step requiring that role', () => {
      const roles = createRoles('admin')
      const cr = createMockCR()
      // Admin alone doesn't have it_supervisor role, so cannot approve
      expect(canApproveAtStep(roles, cr, 'it_supervisor_approve', 'it_supervisor')).toBe(false)
      expect(canApproveAtStep(roles, cr, 'section_head_approve', 'it_section_head')).toBe(false)
      expect(canApproveAtStep(roles, cr, 'director_approve', 'it_director')).toBe(false)
    })

    it('admin with additional role can approve that role\'s steps', () => {
      const roles = createRoles('admin', 'it_supervisor')
      const cr = createMockCR()
      expect(canApproveAtStep(roles, cr, 'it_supervisor_approve', 'it_supervisor')).toBe(true)
    })
  })
})