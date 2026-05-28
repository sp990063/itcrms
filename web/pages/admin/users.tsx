import type { NextPage } from 'next'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { createClient } from '@/lib/supabase'
import { getSession, isAdmin } from '@/lib/auth'
import type { User, AppRole } from '@/lib/types'

const UsersPage: NextPage = () => {
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

      // Load all users
      const { data: usersData } = await supabase
        .from('auth.users')
        .select('*')
        .order('email')

      // Load all roles
      const { data: rolesData } = await supabase
        .from('app_roles')
        .select('*')
        .order('name')

      setAllRoles(rolesData ?? [])

      // Load roles for each user
      const usersWithRoles = await Promise.all(
        (usersData ?? []).map(async (user: { id: string; email: string; created_at: string }) => {
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

  async function handleUpdate() {
    // Reload data
    const { data: usersData } = await supabase
      .from('auth.users')
      .select('*')
      .order('email')

    const usersWithRoles = await Promise.all(
      (usersData ?? []).map(async (user: { id: string; email: string; created_at: string }) => {
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
  }

  if (loading) {
    return (
      <div className="page-container" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <div className="spinner" />
      </div>
    )
  }

  return (
    <div className="page-container">
      <h1 className="page-title">User Management</h1>
      <p style={{ marginBottom: 24, color: 'var(--text-secondary)' }}>
        Manage user roles and role assignments. All users are synced from SSO automatically.
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <button
          className="btn btn-secondary"
          onClick={handleUpdate}
        >
          Refresh
        </button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Email</th>
            <th>Display Name</th>
            <th>Admin</th>
            <th>Roles</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {users.map(({ user, roles }) => (
            <tr key={user.id}>
              <td style={{ fontWeight: 500 }}>{user.email}</td>
              <td>—</td>
              <td>{(user as any).is_admin ? 'Yes' : 'No'}</td>
              <td>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {roles.map(role => (
                    <span key={role.id} style={{
                      display: 'inline-block',
                      padding: '2px 8px',
                      background: 'var(--bg)',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 500,
                    }}>
                      {role.name}
                    </span>
                  ))}
                </div>
              </td>
              <td>{new Date(user.created_at).toLocaleDateString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default UsersPage