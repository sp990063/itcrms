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

    const { cr_id, body } = await req.json()
    if (!cr_id || !body) throw new Error('cr_id and body are required')

    const { data: cr } = await supabase.from('change_requests').select('id').eq('id', cr_id).single()
    if (!cr) throw new Error('CR not found')

    const { data: msg, error: msgError } = await supabase.from('cr_chat_messages').insert({ cr_id, sender_id: user.id, body }).select('id').single()
    if (msgError) throw new Error(`Failed to post message: ${msgError.message}`)

    // Parse @mentions
    const mentionRegex = /@([a-zA-Z0-9_.+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g
    const mentions: string[] = []
    let match
    while ((match = mentionRegex.exec(body)) !== null) mentions.push(match[1])

    if (mentions.length > 0) {
      const { data: mentionedUsers } = await supabase.from('auth.users').select('id').in('email', mentions)
      if (mentionedUsers && mentionedUsers.length > 0) {
        await supabase.from('notifications').insert(
          mentionedUsers.map(u => ({
            user_id: u.id, cr_id, type: 'both',
            subject: `You were mentioned in CR ${cr_id}`,
            body: body.substring(0, 200),
          }))
        )
      }
    }

    await supabase.from('cr_audit_log').insert({ cr_id, user_id: user.id, action: 'comment', step_key: null, details: { message_id: msg.id, mentions } })

    return new Response(JSON.stringify({ success: true, message_id: msg.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})