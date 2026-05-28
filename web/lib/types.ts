import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export type User = Database['public']['Tables']['auth']['users']['Row']
export type UserProfile = Database['public']['Tables']['user_profiles']['Row']
export type AppRole = Database['public']['Tables']['app_roles']['Row']
export type UserAppRole = Database['public']['Tables']['user_app_roles']['Row']

export type CRType = Database['public']['Tables']['cr_types']['Row']
export type WorkflowStep = Database['public']['Tables']['workflow_steps']['Row']
export type SystemTier = Database['public']['Tables']['system_tiers']['Row']

export type ChangeRequest = Database['public']['Tables']['change_requests']['Row'] & {
  cr_type?: CRType
  system_tier?: SystemTier
  applicant?: User
  approvals?: CRApproval[]
}

export type CRApproval = {
  step_key: string
  approved_by: string
  approved_at: string
  notes?: string
  skipped?: boolean
}

export type CRImpactAnalysis = Database['public']['Tables']['cr_impact_analysis']['Row']
export type CRCostEstimate = Database['public']['Tables']['cr_cost_estimate']['Row']
export type CRSystemDesign = Database['public']['Tables']['cr_system_design']['Row']
export type CRSITTestCases = Database['public']['Tables']['cr_sit_test_cases']['Row']
export type CRSITResults = Database['public']['Tables']['cr_sit_results']['Row']
export type CRUATTestCases = Database['public']['Tables']['cr_uat_test_cases']['Row']
export type CRUATResults = Database['public']['Tables']['cr_uat_results']['Row']
export type CRDeploymentRecord = Database['public']['Tables']['cr_deployment_record']['Row']

export type ChatMessage = Database['public']['Tables']['cr_chat_messages']['Row'] & {
  sender?: User
}

export type Notification = Database['public']['Tables']['notifications']['Row'] & {
  cr?: ChangeRequest
}

export type AuditLogEntry = Database['public']['Tables']['cr_audit_log']['Row'] & {
  user?: User
}

// ─── API Request/Response Types ─────────────────────────────────────────────

export interface SubmitCRRequest {
  cr_type_id: number
  title: string
  description: string
  system_tier_id: number
  is_internet_facing: boolean
  risk_level: 'high' | 'medium' | 'low'
}

export interface SubmitCRResponse {
  id: string
  cr_number: string
}

export interface ApproveCRRequest {
  cr_id: string
  step_key: string
  notes?: string
}

export interface RejectCRRequest {
  cr_id: string
  step_key: string
  reason: string
}

export interface AdvanceCRRequest {
  cr_id: string
  step_key: string
}

export interface AddNoteRequest {
  cr_id: string
  body: string
  mentions?: string[]
}

export interface DashboardStats {
  total_cr: number
  by_status: Record<string, number>
  by_type: Record<string, number>
  recent_cr: ChangeRequest[]
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  per_page: number
}

// ─── Constants ─────────────────────────────────────────────────────────────

export const CR_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  pending_user_supervisor: 'Pending User Supervisor',
  pending_it_pickup: 'Pending IT Pickup',
  pending_it_impact: 'Pending IT Impact Analysis',
  pending_it_supervisor: 'Pending IT Supervisor',
  pending_section_head: 'Pending Section Head',
  pending_director: 'Pending Director',
  pending_cost_estimate: 'Pending Cost Estimate',
  pending_design: 'Pending System Design',
  pending_development: 'Pending Development',
  pending_sit_test_case: 'Pending SIT Test Case',
  pending_sit_execution: 'Pending SIT Execution',
  pending_uat_test_case: 'Pending UAT Test Case',
  pending_uat_execution: 'Pending UAT Execution',
  pending_committee: 'Pending Committee Review',
  pending_deployment: 'Pending Deployment',
  pending_deployment_check: 'Pending Deployment Check',
  completed: 'Completed',
  rejected: 'Rejected',
  cancelled: 'Cancelled',
}

export const RISK_LEVELS = ['high', 'medium', 'low'] as const
export type RiskLevel = typeof RISK_LEVELS[number]

export const STEP_KEYS = {
  SUBMIT: 'submit',
  USER_SUPERVISOR_APPROVE: 'user_supervisor_approve',
  IT_PICKUP: 'it_pickup',
  IT_IMPACT_ANALYSIS: 'it_impact_analysis',
  IT_SUPERVISOR_APPROVE: 'it_supervisor_approve',
  SECTION_HEAD_APPROVE: 'section_head_approve',
  DIRECTOR_APPROVE: 'director_approve',
  COST_ESTIMATE: 'cost_estimate',
  SYSTEM_DESIGN: 'system_design',
  DEVELOPMENT: 'development',
  SIT_TEST_CASE: 'sit_test_case',
  SIT_TEST_EXECUTION: 'sit_test_execution',
  UAT_TEST_CASE: 'uat_test_case',
  UAT_TEST_EXECUTION: 'uat_test_execution',
  COMMITTEE_REVIEW: 'committee_review',
  DEPLOYMENT: 'deployment',
  DEPLOYMENT_CHECK: 'deployment_check',
  COMPLETE: 'complete',
} as const

export const ROLE_NAMES = {
  USER: 'user',
  USER_SUPERVISOR: 'user_supervisor',
  IT_STAFF: 'it_staff',
  IT_SUPERVISOR: 'it_supervisor',
  IT_SECTION_HEAD: 'it_section_head',
  IT_DIRECTOR: 'it_director',
  COMMITTEE_MEMBER: 'committee_member',
  DEPLOYMENT_EXECUTOR: 'deployment_executor',
  DEPLOYMENT_CHECKER: 'deployment_checker',
  ADMIN: 'admin',
} as const

export const IT_ROLES = [
  ROLE_NAMES.IT_STAFF,
  ROLE_NAMES.IT_SUPERVISOR,
  ROLE_NAMES.IT_SECTION_HEAD,
  ROLE_NAMES.IT_DIRECTOR,
  ROLE_NAMES.COMMITTEE_MEMBER,
  ROLE_NAMES.DEPLOYMENT_EXECUTOR,
  ROLE_NAMES.DEPLOYMENT_CHECKER,
  ROLE_NAMES.ADMIN,
] as const

export const ALL_IT_ROLES = [...IT_ROLES]

export const NAV_ITEMS = {
  USER: [
    { label: 'Dashboard', href: '/' },
    { label: 'Submit New CR', href: '/cr/new' },
    { label: 'My CRs', href: '/cr/my' },
  ],
  IT: [
    { label: 'Dashboard', href: '/' },
    { label: 'Submit New CR', href: '/cr/new' },
    { label: 'My CRs', href: '/cr/my' },
    { label: 'All CRs', href: '/cr/all' },
    { label: 'Admin', href: '/admin/users' },
  ],
  ADMIN: [
    { label: 'Dashboard', href: '/' },
    { label: 'Submit New CR', href: '/cr/new' },
    { label: 'My CRs', href: '/cr/my' },
    { label: 'All CRs', href: '/cr/all' },
    { label: 'Users', href: '/admin/users' },
    { label: 'Roles', href: '/admin/roles' },
    { label: 'CR Types', href: '/admin/cr-types' },
  ],
} as const