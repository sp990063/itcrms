import type { NextPage } from 'next'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import { getSession, isITRole } from '@/lib/auth'
import StatusBadge from '@/components/ui/StatusBadge'
import type { ChangeRequest, AppRole } from '@/lib/types'

const AllCRsPage: NextPage = () => {
  const [crs, setCrs] = useState<ChangeRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [tierFilter, setTierFilter] = useState('')
  const [riskFilter, setRiskFilter] = useState('')
  const perPage = 20
  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const session = await getSession(supabase)
      if (!session) {
        window.location.href = '/auth/login'
        return
      }

      if (!isITRole(session.roles)) {
        window.location.href = '/'
        return
      }

      let query = supabase
        .from('change_requests')
        .select('*, cr_type:cr_types(name), system_tier:system_tiers(label, code)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * perPage, page * perPage - 1)

      if (statusFilter) query = query.eq('status', statusFilter)
      if (typeFilter) query = query.eq('cr_type_id', typeFilter)
      if (tierFilter) query = query.eq('system_tier_id', tierFilter)
      if (riskFilter) query = query.eq('risk_level', riskFilter)

      const { data, count } = await query
      setCrs(data as ChangeRequest[] ?? [])
      setTotal(count ?? 0)
      setLoading(false)
    }

    load()
  }, [page, statusFilter, typeFilter, tierFilter, riskFilter])

  async function exportCSV() {
    const { data } = await supabase
      .from('change_requests')
      .select('cr_number, title, status, risk_level, created_at')
      .order('created_at', { ascending: false })

    if (!data?.length) return

    const headers = ['CR Number', 'Title', 'Status', 'Risk Level', 'Created']
    const rows = data.map((cr: any) => [
      cr.cr_number,
      `"${cr.title.replace(/"/g, '""')}"`,
      cr.status,
      cr.risk_level,
      cr.created_at,
    ])

    const csv = [headers, ...rows].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cr-export-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="page-container">
      <h1 className="page-title">All Change Requests</h1>

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
        <div className="form-group">
          <select value={tierFilter} onChange={e => { setTierFilter(e.target.value); setPage(1) }}>
            <option value="">All Tiers</option>
            <option value="1">Tier 1</option>
            <option value="2">Tier 1H</option>
            <option value="3">Tier 2</option>
          </select>
        </div>
        <div className="form-group">
          <select value={riskFilter} onChange={e => { setRiskFilter(e.target.value); setPage(1) }}>
            <option value="">All Risks</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
        <button className="btn btn-secondary" onClick={exportCSV}>
          Export CSV
        </button>
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div className="spinner" />
        </div>
      ) : crs.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">📋</div>
          <div className="empty-state-title">No CRs found</div>
          <p>No change requests match the current filters.</p>
        </div>
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>CR Number</th>
                <th>Title</th>
                <th>Type</th>
                <th>Tier</th>
                <th>Risk</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {crs.map(cr => (
                <tr key={cr.id}>
                  <td><Link href={`/cr/${cr.id}`}>{cr.cr_number}</Link></td>
                  <td>{cr.title}</td>
                  <td>{(cr as any).cr_type?.name ?? '—'}</td>
                  <td>{(cr as any).system_tier?.label ?? '—'}</td>
                  <td>
                    <span className={`risk-${cr.risk_level}`} style={{ textTransform: 'capitalize' }}>
                      {cr.risk_level}
                    </span>
                  </td>
                  <td><StatusBadge status={cr.status} /></td>
                  <td>{new Date(cr.created_at).toLocaleDateString()}</td>
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

export default AllCRsPage