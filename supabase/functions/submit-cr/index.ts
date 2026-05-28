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

    const { cr_type_id, title, description, system_tier_id, is_internet_facing, risk_level } = await req.json()
    if (!cr_type_id || !title || !description || !system_tier_id) {
      throw new Error('Missing required fields: cr_type_id, title, description, system_tier_id')
    }
    if (!['high', 'medium', 'low'].includes(risk_level)) {
      throw new Error('risk_level must be high, medium, or low')
    }

    // Generate CR number
    const { data: crNumber } = await supabaseClient.rpc('next_cr_number')
    const cr_number = crNumber as string

    // Insert CR
    const { data: cr, error: crError } = await supabaseClient
      .from('change_requests')
      .insert({
        cr_number,
        cr_type_id,
        title,
        description,
        system_tier_id,
        is_internet_facing: is_internet_facing ?? false,
        risk_level,
        status: 'pending_user_supervisor',
        submitted_at: new Date().toISOString(),
      })
      .select()
      .single()
    if (crError) throw new Error(`Failed to create CR: ${crError.message}`)

    // Insert audit log
    await supabaseClient.from('cr_audit_log').insert({
      cr_id: cr.id,
      user_id: user.id,
      action: 'created',
      step_key: 'submit',
      details: { cr_number, title },
    })

    return new Response(JSON.stringify({ success: true, cr_id: cr.id, cr_number }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})