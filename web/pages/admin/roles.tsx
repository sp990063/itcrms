import type { NextPage } from 'next'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@/lib/supabase'
import { getSession, isAdmin } from '@/lib/auth'
import type { User, AppRole } from '@/lib/types'
import RoleManager from '@/components/Admin/RoleManager'

const RolesPage: NextPage = () => {
  const router = useRouter()
  const [users, setUsers] = useState<Array<{ user: User; roles: AppRole[] }>>([])
  const [allRoles, setAllRoles] = useState<AppRole[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const session = await getSession(supabase)
      if (!session) {
        router.replace('/auth/login')
        return
      }

      if (!isAdmin(session.roles)) {
        router.replace('/')
        return
      }

      const { data: rolesData } = await supabase
        .from('app_roles')
        .select('*')
        .order('name')
      setAllRoles(rolesData ?? [])

      const { data: usersData } = await supabase
        .from('auth.users')
        .select('*')
        .order('email')

      const usersWithRoles = await Promise.all(
        (usersData ?? []).map(async (user: { id: string; email: string }) => {
          const { data: userRoles } = await supabase
            .from('user_app_roles')
            .select('role:app_roles(*)')
            .eq('user_id', user.id)

          return {
            user,
            roles: (userRoles ?? []).map((r: { role: AppRole }) => r.role).filter(Boolean),
          }
        })
      )

      setUsers(usersWithRoles)
      setLoading(false)
    }

    load()
  }, [])

  if (loading) {
    return (
      <div className="page-container" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page-container">
      <h1 className="page-title">Role Management</h1>
      <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
        Assign and remove application roles from users. Changes take effect immediately.
      </p>

      <RoleManager
        users={users}
        allRoles={allRoles}
        onUpdate={async () => {
          const { data: usersData } = await supabase
            .from('auth.users')
            .select('*')
            .order('email')

          const usersWithRoles = await Promise.all(
            (usersData ?? []).map(async (user: { id: string; email: string }) => {
              const { data: userRoles } = await supabase
                .from('user_app_roles')
                .select('role:app_roles(*)')
                .eq('user_id', user.id)

              return {
                user,
                roles: (userRoles ?? []).map((r: { role: AppRole }) => r.role).filter(Boolean),
              }
            })
          )
          setUsers(usersWithRoles)
        }}
      />
    </div>
  )
}

export default RolesPage