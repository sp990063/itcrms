import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    )

    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token)
    if (authError || !user) throw new Error('Unauthorized')

    const { cr_id, notes } = await req.json()
    if (!cr_id) throw new Error('cr_id is required')

    // Get current CR state
    const { data: cr, error: crError } = await supabaseClient
      .from('change_requests')
      .select('*, cr_types(name), system_tiers(code, priority)')
      .eq('id', cr_id)
      .single()
    if (crError || !cr) throw new Error(`CR not found: ${crError?.message}`)

    // Verify caller role matches current step requirement
    const currentStep = cr.current_step_key || 'submit'
    const callerRoles = await getUserRoles(supabaseClient, user.id)
    const stepRoleMap: Record<string, string[]> = {
      user_supervisor_approve: ['user_supervisor'],
      it_supervisor_approve: ['it_supervisor'],
      section_head_approve: ['it_section_head'],
      director_approve: ['it_director'],
      it_impact_analysis: ['it_staff', 'it_supervisor'],
      cost_estimate: ['it_staff', 'it_supervisor'],
      system_design: ['it_staff', 'it_supervisor'],
      sit_test_case: ['it_staff', 'it_supervisor'],
      sit_test_result: ['it_supervisor'],
      uat_test_case: ['it_staff', 'it_supervisor'],
      uat_test_result: ['it_supervisor'],
      committee_review: ['committee_member'],
      deployment: ['deployment_executor'],
      deployment_check: ['deployment_checker'],
    }
    const allowedRoles = stepRoleMap[currentStep] || []
    const hasPermission = callerRoles.some(r => allowedRoles.includes(r)) || allowedRoles.length === 0
    if (!hasPermission) throw new Error(`You do not have permission to approve at step: ${currentStep}`)

    // Build approvals JSONB entry
    const approvalEntry = {
      step_key: currentStep,
      approved_by: user.id,
      approved_at: new Date().toISOString(),
      notes: notes || null,
      skipped: false,
    }

    // Get current approvals array
    const currentApprovals = Array.isArray(cr.approvals) ? cr.approvals : []

    // R3: Guard against duplicate approvals — same user cannot approve same step twice
    const alreadyApproved = currentApprovals.some(
      (a: { step_key: string; approved_by: string }) =>
        a.step_key === currentStep && a.approved_by === user.id
    )
    if (alreadyApproved) throw new Error('You have already approved this step')

    currentApprovals.push(approvalEntry)

    // Determine next step based on routing logic
    const nextSteps = determineNextSteps(cr)
    const newStepKey = nextSteps.length > 0 ? nextSteps[0] : 'completed'
    const newStatus = mapStepToStatus(newStepKey)

    // Update CR
    const { error: updateError } = await supabaseClient
      .from('change_requests')
      .update({
        status: newStatus,
        current_step_key: newStepKey,
        approvals: currentApprovals,
        completed_at: newStepKey === 'completed' ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', cr_id)
    if (updateError) throw new Error(`Failed to update CR: ${updateError.message}`)

    // Audit log
    await supabaseClient.from('cr_audit_log').insert({
      cr_id,
      user_id: user.id,
      action: 'approved',
      step_key: currentStep,
      details: { next_step_key: newStepKey, notes },
    })

    // Notify next approvers
    if (nextSteps.length > 0) {
      const nextApproverRoles = stepRoleMap[newStepKey] || []
      for (const role of nextApproverRoles) {
        const users = await getUsersByRole(supabaseClient, role)
        if (users.length > 0) {
          await supabaseClient.from('notifications').insert(
            users.map(uid => ({
              user_id: uid,
              cr_id,
              type: 'both',
              subject: `CR ${cr.cr_number} requires your approval`,
              body: `Change Request "${cr.title}" is waiting for step: ${newStepKey}`,
            }))
          )
        }
      }
    }

    return new Response(JSON.stringify({ success: true, new_step_key: newStepKey, new_status: newStatus }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})

// ─── Helpers ───────────────────────────────────────────────────────────────────

async function getUserRoles(supabaseClient: ReturnType<typeof createClient>, userId: string): Promise<string[]> {
  const { data } = await supabaseClient
    .from('user_app_roles')
    .select('app_roles(name)')
    .eq('user_id', userId)
  return (data || []).map((d: { app_roles: { name: string } }) => d.app_roles?.name).filter(Boolean) as string[]
}

async function getUsersByRole(supabaseClient: ReturnType<typeof createClient>, roleName: string): Promise<string[]> {
  const { data } = await supabaseClient
    .from('user_app_roles')
    .select('user_id')
    .eq('app_roles!inner(name)', roleName)
  return (data || []).map(d => d.user_id as string)
}

function determineNextSteps(cr: {
  system_tier_id: number,
  is_internet_facing: boolean,
  risk_level: string,
  current_step_key: string,
}): string[] {
  const tier = (cr as Record<string, unknown>).system_tiers as { code: string; priority: number } | null
  const tierCode = tier?.code || ''
  const isInternet = cr.is_internet_facing
  const isHighRisk = cr.risk_level === 'high'
  const isTier2 = tierCode === 'tier2'
  const isTier1H = tierCode === 'tier1h'

  if (cr.current_step_key === 'it_supervisor_approve') {
    if ((isTier2 || isTier1H || isInternet) && isHighRisk) {
      return ['section_head_approve', 'director_approve']
    } else if (isTier2 || isInternet) {
      return ['section_head_approve']
    }
    return ['cost_estimate']
  }
  if (cr.current_step_key === 'section_head_approve') {
    if ((isTier2 || isTier1H || isInternet) && isHighRisk) {
      return ['director_approve']
    }
    return ['cost_estimate']
  }
  if (cr.current_step_key === 'director_approve') {
    return ['cost_estimate']
  }
  // Default step progression (simplified for MVP)
  const stepOrder = ['submit', 'user_supervisor_approve', 'it_pickup', 'it_impact_analysis',
    'it_supervisor_approve', 'section_head_approve', 'director_approve', 'cost_estimate',
    'system_design', 'development', 'sit_test_case', 'sit_test_result', 'uat_test_case',
    'uat_test_result', 'committee_review', 'deployment', 'deployment_check', 'completed']
  const idx = stepOrder.indexOf(cr.current_step_key)
  return idx >= 0 && idx < stepOrder.length - 1 ? [stepOrder[idx + 1]] : ['completed']
}

function mapStepToStatus(stepKey: string): string {
  const map: Record<string, string> = {
    user_supervisor_approve: 'pending_user_supervisor',
    it_pickup: 'pending_it_pickup',
    it_impact_analysis: 'pending_it_impact',
    it_supervisor_approve: 'pending_it_supervisor',
    section_head_approve: 'pending_section_head',
    director_approve: 'pending_director',
    cost_estimate: 'pending_cost_estimate',
    system_design: 'pending_design',
    development: 'pending_development',
    sit_test_case: 'pending_sit_test_case',
    sit_test_result: 'pending_sit_execution',
    uat_test_case: 'pending_uat_test_case',
    uat_test_result: 'pending_uat_execution',
    committee_review: 'pending_committee',
    deployment: 'pending_deployment',
    deployment_check: 'pending_deployment_check',
    completed: 'completed',
  }
  return map[stepKey] || 'pending_it_supervisor'
}