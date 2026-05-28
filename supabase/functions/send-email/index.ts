import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })
  try {
    // This function is called internally by other functions — not directly by the web app
    const { to, subject, body, cr_id } = await req.json()
    if (!to || !Array.isArray(to) || to.length === 0) throw new Error('to (array) and subject are required')

    // Use Supabase Resend integration or configured SMTP
    const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false } })

    // Log the email attempt
    if (cr_id) {
      await supabase.from('cr_audit_log').insert({
        cr_id, user_id: null, action: 'email_sent',
        step_key: null, details: { to, subject, body: body?.substring(0, 500) },
      })
    }

    // Supabase email is sent via the auth email helper — for custom SMTP use Resend API
    // This is a placeholder: integrate with Resend (resend.com) or Supabase SMTP
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to, from: 'ITCRMS <noreply@yourcompany.com>', subject, html: `<p>${body}</p>` }),
      })
      if (!res.ok) throw new Error(`Resend API error: ${res.statusText}`)
    }

    return new Response(JSON.stringify({ success: true, sent_count: to.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})