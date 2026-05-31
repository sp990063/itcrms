import type { SupabaseClient, User as SupabaseUser } from '@supabase/supabase-js'
import type { UserProfile, AppRole } from './types'
import { IT_ROLE_NAMES, isITStaff, isAdmin } from './rbac'

// Re-export rbac helpers for consumers of auth.ts
export { isITStaff, isAdmin } from './rbac'
export { IT_ROLE_NAMES } from './rbac'

export interface Session {
  user: SupabaseUser
  profile?: UserProfile
  roles: AppRole[]
}

export async function getSession(supabase: SupabaseClient): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error || !data.session) return null
  const user = data.session.user

  const [profileResult, rolesResult] = await Promise.all([
    supabase
      .from('public.user_profiles')
      .select('*')
      .eq('id', user.id)
      .single(),
    supabase
      .from('user_app_roles')
      .select(`
        role:app_roles(*)
      `)
      .eq('user_id', user.id),
  ])

  const profile = profileResult.data as UserProfile | null
  const roles = (rolesResult.data ?? []).flatMap((r: { role: AppRole[] | AppRole }) =>
    Array.isArray(r.role) ? r.role : [r.role]
  ).filter(Boolean) as AppRole[]

  return { user, profile: profile ?? undefined, roles }
}

export async function getUserRoles(
  supabase: SupabaseClient,
  userId: string
): Promise<AppRole[]> {
  const { data } = await supabase
    .from('user_app_roles')
    .select('role:app_roles(*)')
    .eq('user_id', userId)

  return (data ?? []).flatMap((r: { role: AppRole[] | AppRole }) =>
    Array.isArray(r.role) ? r.role : [r.role]
  ).filter(Boolean) as AppRole[]
}

export function hasRole(roles: AppRole[], roleName: string): boolean {
  return roles.some(r => r.name === roleName)
}

export function hasAnyRole(roles: AppRole[], roleNames: string[]): boolean {
  return roles.some(r => roleNames.includes(r.name))
}

export function isITRole(roles: AppRole[]): boolean {
  const IT_ROLE_NAMES = [
    'it_staff', 'it_supervisor', 'it_section_head', 'it_director',
    'committee_member', 'deployment_executor', 'deployment_checker', 'admin'
  ]
  return hasAnyRole(roles, IT_ROLE_NAMES)
}



export async function isAuthenticated(supabase: SupabaseClient): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  return !!user
}

export async function logout(supabase: SupabaseClient): Promise<void> {
  await supabase.auth.signOut()
}

export async function getUserDisplayName(
  supabase: SupabaseClient,
  userId: string
): Promise<string> {
  const { data } = await supabase
    .from('public.user_profiles')
    .select('display_name')
    .eq('id', userId)
    .single()
  return data?.display_name ?? 'Unknown User'
}