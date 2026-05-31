import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { getSession, hasRole, isAdmin } from '@/lib/auth'
import type { Session } from '@/lib/auth'
import type { AppRole } from '@/lib/types'

// Mock Supabase client factory
function createMockSupabaseClient(options: {
  getUserError?: Error | null
  user?: { id: string; email: string } | null
  profileData?: object | null
  rolesData?: object[]
}) {
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: options.user ?? null },
        error: options.getUserError ?? null,
      }),
      getSession: vi.fn().mockResolvedValue({
        data: { session: options.user ? { user: options.user } : null },
        error: options.getUserError ?? null,
      }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: options.profileData ?? null }),
        }),
      }),
    }),
  } as unknown as SupabaseClient
}

describe('auth module', () => {
  describe('getSession', () => {
    it('returns null when no session', async () => {
      const supabase = createMockSupabaseClient({ user: null })
      const result = await getSession(supabase)
      expect(result).toBeNull()
    })

    it('returns null when getUser returns error', async () => {
      const supabase = createMockSupabaseClient({
        getUserError: new Error('Auth error'),
      })
      const result = await getSession(supabase)
      expect(result).toBeNull()
    })
  })

  describe('hasRole', () => {
    it('returns true when user has the role', () => {
      const roles: AppRole[] = [
        { id: 1, name: 'user', description: null, created_at: '' },
        { id: 2, name: 'it_staff', description: null, created_at: '' },
      ]
      expect(hasRole(roles, 'it_staff')).toBe(true)
    })

    it('returns false when user does not have the role', () => {
      const roles: AppRole[] = [
        { id: 1, name: 'user', description: null, created_at: '' },
      ]
      expect(hasRole(roles, 'it_staff')).toBe(false)
    })

    it('returns false for empty roles array', () => {
      expect(hasRole([], 'admin')).toBe(false)
    })
  })

  describe('isAdmin', () => {
    it('returns true when user has admin role', () => {
      const roles: AppRole[] = [
        { id: 1, name: 'user', description: null, created_at: '' },
        { id: 2, name: 'admin', description: null, created_at: '' },
      ]
      expect(isAdmin(roles)).toBe(true)
    })

    it('returns false when user does not have admin role', () => {
      const roles: AppRole[] = [
        { id: 1, name: 'user', description: null, created_at: '' },
        { id: 2, name: 'it_staff', description: null, created_at: '' },
      ]
      expect(isAdmin(roles)).toBe(false)
    })

    it('returns false for empty roles array', () => {
      expect(isAdmin([])).toBe(false)
    })
  })
})