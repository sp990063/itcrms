import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import type { CRType, WorkflowStep } from '@/lib/types'

interface CRTypeManagerProps {
  onUpdate: () => void
}

export default function CRTypeManager({ onUpdate }: CRTypeManagerProps) {
  const [crTypes, setCrTypes] = useState<CRType[]>([])
  const [stepsMap, setStepsMap] = useState<Record<number, WorkflowStep[]>>({})
  const [selectedTypeId, setSelectedTypeId] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAddType, setShowAddType] = useState(false)
  const [newTypeName, setNewTypeName] = useState('')
  const [newTypeDesc, setNewTypeDesc] = useState('')
  const supabase = createClient()

  useEffect(() => {
    loadCRTypes()
  }, [])

  async function loadCRTypes() {
    const { data } = await supabase
      .from('cr_types')
      .select('*')
      .order('name')
    setCrTypes(data ?? [])
  }

  async function loadSteps(crTypeId: number) {
    const { data } = await supabase
      .from('workflow_steps')
      .select('*')
      .eq('cr_type_id', crTypeId)
      .order('step_order')
    setStepsMap(prev => ({ ...prev, [crTypeId]: data ?? [] }))
  }

  function selectType(id: number) {
    setSelectedTypeId(id)
    if (!stepsMap[id]) {
      loadSteps(id)
    }
  }

  async function toggleCanSkip(step: WorkflowStep) {
    setLoading(true)
    try {
      await supabase
        .from('workflow_steps')
        .update({ can_skip: !step.can_skip })
        .eq('id', step.id)
      if (selectedTypeId) {
        await loadSteps(selectedTypeId)
      }
      onUpdate()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to update step')
    } finally {
      setLoading(false)
    }
  }

  async function addCRType() {
    if (!newTypeName.trim()) return
    setLoading(true)
    try {
      const { error } = await supabase
        .from('cr_types')
        .insert({ name: newTypeName.trim(), description: newTypeDesc.trim() })
      if (error) throw error
      setNewTypeName('')
      setNewTypeDesc('')
      setShowAddType(false)
      await loadCRTypes()
      onUpdate()
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : 'Failed to add CR type')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div style={{ fontWeight: 600 }}>CR Types</div>
        <button className="btn btn-primary" onClick={() => setShowAddType(true)}>
          + Add CR Type
        </button>
      </div>

      {showAddType && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="form-group">
            <label>Type Name *</label>
            <input
              type="text"
              value={newTypeName}
              onChange={e => setNewTypeName(e.target.value)}
              placeholder="e.g. system_enhancement"
            />
          </div>
          <div className="form-group">
            <label>Description</label>
            <textarea
              value={newTypeDesc}
              onChange={e => setNewTypeDesc(e.target.value)}
              placeholder="Describe this CR type..."
              rows={2}
            />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={addCRType} disabled={loading}>
              Add
            </button>
            <button className="btn btn-secondary" onClick={() => setShowAddType(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 20 }}>
        {/* CR Type List */}
        <div style={{ width: 250, flexShrink: 0 }}>
          {crTypes.map(ct => (
            <div
              key={ct.id}
              onClick={() => selectType(ct.id)}
              style={{
                padding: '10px 12px',
                borderBottom: '1px solid var(--border)',
                cursor: 'pointer',
                fontWeight: selectedTypeId === ct.id ? 600 : 400,
                background: selectedTypeId === ct.id ? 'var(--bg)' : 'transparent',
              }}
            >
              <div style={{ fontWeight: 500 }}>{ct.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{ct.description}</div>
            </div>
          ))}
        </div>

        {/* Steps for selected type */}
        <div style={{ flex: 1 }}>
          {selectedTypeId && stepsMap[selectedTypeId] && (
            <>
              <div style={{ fontWeight: 600, marginBottom: 12 }}>
                Workflow Steps for: {crTypes.find(t => t.id === selectedTypeId)?.name}
              </div>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Step</th>
                    <th>Required Role</th>
                    <th>Can Skip</th>
                  </tr>
                </thead>
                <tbody>
                  {stepsMap[selectedTypeId].map(step => (
                    <tr key={step.id}>
                      <td>{step.step_order}</td>
                      <td>
                        <span style={{ fontWeight: 500 }}>{step.step_key}</span>
                        <br />
                        <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{step.step_label}</span>
                      </td>
                      <td>{step.requires_role ?? '—'}</td>
                      <td>
                        <input
                          type="checkbox"
                          checked={step.can_skip}
                          onChange={() => toggleCanSkip(step)}
                          disabled={loading}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {!selectedTypeId && (
            <div style={{ color: 'var(--text-secondary)', padding: 24, textAlign: 'center' }}>
              Select a CR type to view its workflow steps
            </div>
          )}
        </div>
      </div>
    </div>
  )
}