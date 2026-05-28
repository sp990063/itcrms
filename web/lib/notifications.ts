import type { Notification } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

export async function getUnreadNotifications(
  supabase: SupabaseClient,
  userId: string
): Promise<Notification[]> {
  const { data } = await supabase
    .from('notifications')
    .select(`
      *,
      cr:change_requests(id, cr_number, title)
    `)
    .eq('user_id', userId)
    .eq('is_read', false)
    .order('created_at', { ascending: false })
    .limit(20)

  return (data ?? []) as Notification[]
}

export async function getAllNotifications(
  supabase: SupabaseClient,
  userId: string,
  limit = 50
): Promise<Notification[]> {
  const { data } = await supabase
    .from('notifications')
    .select(`
      *,
      cr:change_requests(id, cr_number, title)
    `)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)

  return (data ?? []) as Notification[]
}

export async function markAsRead(
  supabase: SupabaseClient,
  notificationId: string
): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('id', notificationId)
}

export async function markAllAsRead(
  supabase: SupabaseClient,
  userId: string
): Promise<void> {
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
}

export function getNotificationColor(type: string): string {
  switch (type) {
    case 'email': return '#ea4335'
    case 'in_app': return '#1a73e8'
    case 'both':
    default: return '#34a853'
  }
}

export function getNotificationIcon(type: string): string {
  switch (type) {
    case 'email': return '📧'
    case 'in_app': return '🔔'
    case 'both':
    default: return '📬'
  }
}