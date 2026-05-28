import React, { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { ChatMessage as ChatMessageType } from '@/lib/types'
import type { User } from '@/lib/types'

interface CRChatroomProps {
  crId: string
  currentUser: User
  displayName: string
}

export default function CRChatroom({ crId, currentUser, displayName }: CRChatroomProps) {
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    loadMessages()
    const interval = setInterval(loadMessages, 10000)
    return () => clearInterval(interval)
  }, [crId])

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  async function loadMessages() {
    const { data } = await supabase
      .from('cr_chat_messages')
      .select('*, sender:auth.users(id, email)')
      .eq('cr_id', crId)
      .order('created_at', { ascending: true })

    if (data) {
      setMessages(data as unknown as ChatMessageType[])
    }
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  function extractMentions(text: string): string[] {
    const emailMentions = text.match(/@[\w.-]+@[\w.-]+\.\w+/g)?.map(m => m.slice(1)) ?? []
    const roleMentions = text.match(/@it-[a-z_]+/gi)?.map(m => m.slice(1)) ?? []
    return [...emailMentions, ...roleMentions]
  }

  function highlightMentions(text: string): React.ReactNode {
    const parts = text.split(/(@[\w.-]+@[\w.-]+\.\w+|@\w+)/g)
    return parts.map((part, i) => {
      if (part.match(/^@[\w.-]+@[\w.-]+\.\w+$/) || part.match(/^@\w+$/)) {
        return <span key={i} className="mention">{part}</span>
      }
      return part
    })
  }

  async function handleSend() {
    if (!input.trim()) return
    setSending(true)
    setError(null)

    try {
      const mentions = extractMentions(input)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { error: err } = await supabase
        .from('cr_chat_messages')
        .insert({
          cr_id: crId,
          sender_id: user.id,
          body: input.trim(),
          mentions,
        })

      if (err) throw err

      setInput('')
      await loadMessages()
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send message')
    } finally {
      setSending(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function formatTime(date: string) {
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }

  return (
    <div className="chatroom">
      <div className="chatroom-header">💬 Discussion</div>

      <div className="chatroom-messages">
        {messages.length === 0 && (
          <div style={{ textAlign: 'center', color: 'var(--text-secondary)', padding: '24px' }}>
            No messages yet. Start the conversation!
          </div>
        )}
        {messages.map(msg => {
          const isSelf = msg.sender_id === currentUser.id
          return (
            <div key={msg.id} className={`chat-message ${isSelf ? 'self' : 'other'}`}>
              <div className="chat-message-sender">
                {isSelf ? 'You' : (msg.sender as unknown as User)?.email ?? 'Unknown'}
              </div>
              <div className="chat-message-body">
                {highlightMentions(msg.body)}
              </div>
              <div className="chat-message-time">{formatTime(msg.created_at)}</div>
            </div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      <div className="chatroom-input">
        <input
          type="text"
          placeholder="Type a message... (use @email@domain.com to mention)"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={sending}
        />
        <button onClick={handleSend} disabled={sending || !input.trim()}>
          {sending ? '...' : 'Send'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '8px 16px', background: '#fce8e6', color: 'var(--danger)', fontSize: 12 }}>
          {error}
        </div>
      )}
    </div>
  )
}