import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } })
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) throw new Error('No authorization header')
    const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''))
    if (!user) throw new Error('Unauthorized')

    const { cr_id, step_key, step_data } = await req.json()
    if (!cr_id || !step_key) throw new Error('cr_id and step_key are required')

    // Verify CR exists and is at the claimed step
    const { data: cr } = await supabase.from('change_requests').select('id, current_step_key').eq('id', cr_id).single()
    if (!cr) throw new Error('CR not found')
    if (cr.current_step_key !== step_key) throw new Error(`CR is not at step ${step_key}`)

    // Insert step data into the appropriate table
    const tableMap: Record<string, string> = {
      it_impact_analysis: 'cr_impact_analysis',
      cost_estimate: 'cr_cost_estimate',
      system_design: 'cr_system_design',
      sit_test_case: 'cr_sit_test_cases',
      sit_test_result: 'cr_sit_results',
      uat_test_case: 'cr_uat_test_cases',
      uat_test_result: 'cr_uat_results',
    }
    const tableName = tableMap[step_key]
    if (tableName && step_data) {
      const { error: insertError } = await supabase.from(tableName).insert({ cr_id, ...step_data })
      if (insertError) throw new Error(`Failed to save step data: ${insertError.message}`)
    }

    // Advance to next step
    const stepOrder = ['submit', 'user_supervisor_approve', 'it_pickup', 'it_impact_analysis', 'it_supervisor_approve', 'section_head_approve', 'director_approve', 'cost_estimate', 'system_design', 'development', 'sit_test_case', 'sit_test_result', 'uat_test_case', 'uat_test_result', 'committee_review', 'deployment', 'deployment_check', 'completed']
    const idx = stepOrder.indexOf(step_key)
    const nextStepKey = idx >= 0 && idx < stepOrder.length - 1 ? stepOrder[idx + 1] : 'completed'
    const statusMap: Record<string, string> = {
      it_pickup: 'pending_it_pickup', it_impact_analysis: 'pending_it_impact',
      it_supervisor_approve: 'pending_it_supervisor', section_head_approve: 'pending_section_head',
      director_approve: 'pending_director', cost_estimate: 'pending_cost_estimate',
      system_design: 'pending_design', development: 'pending_development',
      sit_test_case: 'pending_sit_test_case', sit_test_result: 'pending_sit_execution',
      uat_test_case: 'pending_uat_test_case', uat_test_result: 'pending_uat_execution',
      committee_review: 'pending_committee', deployment: 'pending_deployment',
      deployment_check: 'pending_deployment_check', completed: 'completed',
    }

    await supabase.from('change_requests').update({ current_step_key: nextStepKey, status: statusMap[nextStepKey] || 'pending', updated_at: new Date().toISOString() }).eq('id', cr_id)
    await supabase.from('cr_audit_log').insert({ cr_id, user_id: user.id, action: 'advanced', step_key, details: { next_step_key: nextStepKey, step_data } })

    return new Response(JSON.stringify({ success: true, next_step_key: nextStepKey }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})