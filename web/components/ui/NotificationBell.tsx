import React, { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase'
import type { Notification as NotificationType } from '@/lib/types'
import { markAsRead } from '@/lib/notifications'
import styles from './NotificationBell.module.css'

export default function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState<NotificationType[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const supabase = createClient()

  useEffect(() => {
    loadNotifications()
    // Auto-refresh every 30 seconds
    const interval = setInterval(loadNotifications, 30000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadNotifications() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from('notifications')
      .select('*, cr:change_requests(id, cr_number, title)')
      .eq('user_id', user.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false })
      .limit(20)

    const notifs = (data ?? []) as NotificationType[]
    setNotifications(notifs)
    setUnreadCount(notifs.length)
  }

  async function handleNotificationClick(notif: NotificationType) {
    if (!notif.is_read) {
      await markAsRead(supabase, notif.id)
      setUnreadCount(c => Math.max(0, c - 1))
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n))
    }
    setOpen(false)
  }

  function formatTime(date: string) {
    const d = new Date(date)
    const now = new Date()
    const diff = now.getTime() - d.getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'Just now'
    if (mins < 60) return `${mins}m ago`
    const hours = Math.floor(mins / 60)
    if (hours < 24) return `${hours}h ago`
    const days = Math.floor(hours / 24)
    return `${days}d ago`
  }

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        className="notification-bell"
        onClick={() => setOpen(o => !o)}
        aria-label={`Notifications (${unreadCount} unread)`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
        </svg>
        {unreadCount > 0 && (
          <span className="notification-bell-badge">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 600, fontSize: 14 }}>
            Notifications
          </div>
          {notifications.length === 0 ? (
            <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No unread notifications
            </div>
          ) : (
            notifications.map(notif => (
              <div
                key={notif.id}
                className={`notification-item ${notif.is_read ? '' : 'unread'}`}
                onClick={() => handleNotificationClick(notif)}
              >
                {notif.cr && (
                  <Link
                    href={`/cr/${notif.cr.id}`}
                    onClick={e => e.stopPropagation()}
                    style={{ display: 'block' }}
                  >
                    <div className="notification-subject">{notif.subject}</div>
                    <div className="notification-body">{notif.body}</div>
                    <div className="notification-time">
                      {notif.cr.cr_number} • {formatTime(notif.created_at)}
                    </div>
                  </Link>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}