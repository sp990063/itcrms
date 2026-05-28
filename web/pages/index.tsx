import type { NextPage } from 'next'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { getSession, isITRole, isAdmin } from '@/lib/auth'
import StatusBadge from '@/components/ui/StatusBadge'
import type { ChangeRequest, AppRole } from '@/lib/types'

interface DashboardStats {
  total: number
  byStatus: Record<string, number>
  byType: Record<string, number>
}

const DashboardPage: NextPage = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [recentCRs, setRecentCRs] = useState<ChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [roles, setRoles] = useState<AppRole[]>([])
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const session = await getSession(supabase)
      if (!session) {
        window.location.href = '/auth/login'
        return
      }

      setUser(session.user)
      setRoles(session.roles)

      // Load stats
      const { data: crs } = await supabase
        .from('change_requests')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50)

      const allCRs = crs ?? []
      const byStatus: Record<string, number> = {}
      const byType: Record<string, number> = {}

      allCRs.forEach((cr: ChangeRequest) => {
        byStatus[cr.status] = (byStatus[cr.status] ?? 0) + 1
      })

      setStats({
        total: allCRs.length,
        byStatus,
        byType,
      })

      // Load recent 10 CRs
      const { data: recent } = await supabase
        .from('change_requests')
        .select(`
          *,
          cr_type:cr_types(name),
          system_tier:system_tiers(label, code)
        `)
        .order('created_at', { ascending: false })
        .limit(10)

      setRecentCRs(recent as ChangeRequest[] ?? [])
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

  const itAccess = isITRole(roles)
  const adminAccess = isAdmin(roles)

  return (
    <div className="page-container">
      <h1 className="page-title">Dashboard</h1>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card-label">Total CRs</div>
          <div className="stat-card-value">{stats?.total ?? 0}</div>
        </div>
        {Object.entries(stats?.byStatus ?? {}).slice(0, 5).map(([status, count]) => (
          <div key={status} className="stat-card">
            <div className="stat-card-label" style={{ textTransform: 'capitalize' }}>
              {status.replace(/_/g, ' ')}
            </div>
            <div className="stat-card-value">{count}</div>
          </div>
        ))}
      </div>

      <div className="quick-actions">
        <Link href="/cr/new" className="btn btn-primary">
          + Submit New CR
        </Link>
        <Link href="/cr/my" className="btn btn-secondary">
          My CRs
        </Link>
        {itAccess && (
          <Link href="/cr/all" className="btn btn-secondary">
            All CRs
          </Link>
        )}
        {adminAccess && (
          <Link href="/admin/users" className="btn btn-secondary">
            Admin Panel
          </Link>
        )}
      </div>

      <div className="section-title">Recent Change Requests</div>

      {recentCRs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No CRs yet</div>
          <p>Submit your first change request to get started.</p>
          <Link href="/cr/new" className="btn btn-primary" style={{ marginTop: 16 }}>
            Submit New CR
          </Link>
        </div>
      ) : (
        <table className="data-table">
          <thead>
            <tr>
              <th>CR Number</th>
              <th>Title</th>
              <th>Type</th>
              <th>Status</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {recentCRs.map(cr => (
              <tr key={cr.id}>
                <td>
                  <Link href={`/cr/${cr.id}`}>{cr.cr_number}</Link>
                </td>
                <td>{cr.title}</td>
                <td>{(cr as any).cr_type?.name ?? '—'}</td>
                <td><StatusBadge status={cr.status} /></td>
                <td>{new Date(cr.created_at).toLocaleDateString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

export default DashboardPage