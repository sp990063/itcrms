import type { NextPage } from 'next'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { getSession } from '@/lib/auth'
import StatusBadge from '@/components/ui/StatusBadge'
import type { ChangeRequest, AppRole } from '@/lib/types'

const MyCRsPage: NextPage = () => {
  const [crs, setCrs] = useState<ChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const perPage = 20
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const session = await getSession(supabase)
      if (!session) {
        window.location.href = '/auth/login'
        return
      }

      let query = supabase
        .from('change_requests')
        .select('*, cr_type:cr_types(name), system_tier:system_tiers(label, code)', { count: 'exact' })
        .eq('applicant_id', session.user.id)
        .order('created_at', { ascending: false })
        .range((page - 1) * perPage, page * perPage - 1)

      if (statusFilter) query = query.eq('status', statusFilter)
      if (typeFilter) query = query.eq('cr_type_id', typeFilter)

      const { data, count } = await query
      setCrs(data as ChangeRequest[] ?? [])
      setTotal(count ?? 0)
      setLoading(false)
    }

    load()
  }, [page, statusFilter, typeFilter])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="page-container">
      <h1 className="page-title">My Change Requests</h1>

      <div className="filters-bar">
        <div className="form-group">
          <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1) }}>
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="pending_user_supervisor">Pending User Supervisor</option>
            <option value="pending_it_pickup">Pending IT Pickup</option>
            <option value="pending_it_impact">Pending IT Impact</option>
            <option value="pending_it_supervisor">Pending IT Supervisor</option>
            <option value="pending_section_head">Pending Section Head</option>
            <option value="pending_director">Pending Director</option>
            <option value="pending_committee">Pending Committee</option>
            <option value="pending_deployment">Pending Deployment</option>
            <option value="completed">Completed</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
        <div className="form-group">
          <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1) }}>
            <option value="">All Types</option>
            <option value="1">System Enhancement</option>
            <option value="2">Data Update</option>
            <option value="3">Data Extraction</option>
            <option value="4">Bug Fix</option>
          </select>
        </div>
        <Link href="/cr/new" className="btn btn-primary">
          + New CR
        </Link>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" />
        </div>
      ) : crs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No CRs found</div>
          <p>You haven&apos;t submitted any change requests yet.</p>
          <Link href="/cr/new" className="btn btn-primary" style={{ marginTop: 16 }}>
            Submit New CR
          </Link>
        </div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>CR Number</th>
                <th>Title</th>
                <th>Type</th>
                <th>Status</th>
                <th>Submitted</th>
                <th>Current Step</th>
              </tr>
            </thead>
            <tbody>
              {crs.map(cr => (
                <tr key={cr.id}>
                  <td><Link href={`/cr/${cr.id}`}>{cr.cr_number}</Link></td>
                  <td>{cr.title}</td>
                  <td>{(cr as any).cr_type?.name ?? '—'}</td>
                  <td><StatusBadge status={cr.status} /></td>
                  <td>{cr.submitted_at ? new Date(cr.submitted_at).toLocaleDateString() : '—'}</td>
                  <td>{cr.current_step_key ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {totalPages > 1 && (
            <div className="pagination">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
                return p <= totalPages ? (
                  <button key={p} onClick={() => setPage(p)} className={p === page ? 'active' : ''}>
                    {p}
                  </button>
                ) : null
              })}
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default MyCRsPage