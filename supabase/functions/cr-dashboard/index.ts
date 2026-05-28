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

    const { cr_id } = await req.json().catch(() => ({}))

    // Get user's roles
    const { data: rolesData } = await supabase.from('user_app_roles').select('app_roles(name)').eq('user_id', user.id)
    const roleNames = (rolesData || []).map(d => (d.app_roles as { name: string } | null)?.name).filter(Boolean) as string[]
    const isIT = roleNames.some(r => ['it_staff', 'it_supervisor', 'it_section_head', 'it_director', 'committee_member', 'deployment_executor', 'deployment_checker', 'admin'].includes(r))
    const isAdmin = roleNames.includes('admin')

    let query = supabase.from('change_requests').select(`
      id, cr_number, title, status, risk_level, submitted_at, completed_at,
      cr_types(name), system_tiers(code)
    `)

    if (!isIT) {
      query = query.eq('applicant_id', user.id)
    }
    if (cr_id) {
      query = query.eq('id', cr_id)
    }

    const { data: crs, error } = await query.order('submitted_at', { ascending: false }).limit(100)
    if (error) throw new Error(`Failed to fetch CRs: ${error.message}`)

    // Aggregate stats
    const { data: allCRs } = !cr_id
      ? await supabase.from('change_requests').select('status')
          .eq(isIT ? 'id' : 'id', isIT ? { single: false } : 'applicant_id').neq('id', '')
          .then(async ({ data: d }) => {
            const q = supabase.from('change_requests').select('status')
            if (!isIT) q.eq('applicant_id', user.id)
            const r = await q
            return { data: r.data }
          })
      : { data: null }

    const byStatus: Record<string, number> = {}
    const byType: Record<string, number> = {}

    for (const cr of crs || []) {
      byStatus[cr.status] = (byStatus[cr.status] || 0) + 1
      const typeName = (cr.cr_types as { name: string } | null)?.name || 'unknown'
      byType[typeName] = (byType[typeName] || 0) + 1
    }

    // Recent activity from audit log
    const { data: recentActivity } = cr_id
      ? await supabase.from('cr_audit_log').select('action, step_key, created_at, user_id, details').eq('cr_id', cr_id).order('created_at', { ascending: false }).limit(20)
      : { data: [] }

    return new Response(JSON.stringify({
      total: crs?.length || 0,
      by_status: byStatus,
      by_type: byType,
      recent_activity: recentActivity || [],
      crs: crs || [],
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})