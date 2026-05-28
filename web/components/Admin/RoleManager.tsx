import React, { useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { User, AppRole } from '@/lib/types'

interface RoleManagerProps {
  users: Array<{ user: User; roles: AppRole[] }>
  allRoles: AppRole[]
  onUpdate: () => void
}

export default function RoleManager({ users, allRoles, onUpdate }: RoleManagerProps) {
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState<string | null>(null)
  const supabase = createClient()

  const filteredUsers = users.filter(({ user }) =>
    user.email?.toLowerCase().includes(search.toLowerCase())
  )

  async function assignRole(userId: string, roleId: number) {
    setLoading(userId)
    try {
      const { error } = await supabase
        .from('user_app_roles')
        .insert({ user_id: userId, role_id: roleId })
      if (error) throw error
      onUpdate()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to assign role')
    } finally {
      setLoading(null)
    }
  }

  async function removeRole(userId: string, roleId: number) {
    setLoading(userId)
    try {
      const { error } = await supabase
        .from('user_app_roles')
        .delete()
        .eq('user_id', userId)
        .eq('role_id', roleId)
      if (error) throw error
      onUpdate()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to remove role')
    } finally {
      setLoading(null)
    }
  }

  return (
    <div>
      <div className="form-group" style={{ maxWidth: 400, marginBottom: 20 }}>
        <input
          type="text"
          placeholder="Search by email..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', padding: '8px 12px' }}
        />
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Current Roles</th>
            <th>Assign Role</th>
          </tr>
        </thead>
        <tbody>
          {filteredUsers.map(({ user, roles }) => (
            <tr key={user.id}>
              <td>
                <div style={{ fontWeight: 500 }}>{user.email}</div>
              </td>
              <td>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {roles.map(role => (
                    <span key={role.id} style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      padding: '2px 8px',
                      background: 'var(--bg)',
                      borderRadius: 4,
                      fontSize: 12,
                      fontWeight: 500,
                    }}>
                      {role.name}
                      <button
                        onClick={() => removeRole(user.id, role.id)}
                        disabled={loading === user.id}
                        style={{
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: 'var(--danger)',
                          fontSize: 12,
                          padding: 0,
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {roles.length === 0 && (
                    <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>No roles assigned</span>
                  )}
                </div>
              </td>
              <td>
                <select
                  onChange={e => {
                    if (e.target.value) {
                      assignRole(user.id, Number(e.target.value))
                      e.target.value = ''
                    }
                  }}
                  disabled={loading === user.id}
                  style={{ padding: '4px 8px', fontSize: 13 }}
                >
                  <option value="">Add role...</option>
                  {allRoles
                    .filter(r => !roles.some(ur => ur.id === r.id))
                    .map(role => (
                      <option key={role.id} value={role.id}>{role.name}</option>
                    ))}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}