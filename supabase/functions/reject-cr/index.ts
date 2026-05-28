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
    const { data: { user } } = await supabaseClient.auth.getUser(token)
    if (!user) throw new Error('Unauthorized')

    const { cr_id, reason } = await req.json()
    if (!cr_id) throw new Error('cr_id is required')
    if (!reason || reason.trim().length === 0) throw new Error('reason is required')

    const { data: cr } = await supabaseClient
      .from('change_requests')
      .select('id, cr_number, title, applicant_id')
      .eq('id', cr_id)
      .single()
    if (!cr) throw new Error('CR not found')

    const { error } = await supabaseClient
      .from('change_requests')
      .update({ status: 'rejected', updated_at: new Date().toISOString() })
      .eq('id', cr_id)
    if (error) throw new Error(`Failed to reject CR: ${error.message}`)

    await supabaseClient.from('cr_audit_log').insert({
      cr_id,
      user_id: user.id,
      action: 'rejected',
      step_key: null,
      details: { reason },
    })

    await supabaseClient.from('notifications').insert([
      {
        user_id: cr.applicant_id,
        cr_id,
        type: 'both',
        subject: `CR ${cr.cr_number} has been rejected`,
        body: `Your Change Request "${cr.title}" was rejected. Reason: ${reason}`,
      },
    ])

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})