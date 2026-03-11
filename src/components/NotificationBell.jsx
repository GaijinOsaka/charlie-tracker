import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function NotificationBell({ onNavigateToMessage }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (!user) return
    loadNotifications()

    const channel = supabase
      .channel('user-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications(prev => [payload.new, ...prev])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadNotifications() {
    const { data } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', user.id)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(20)
    setNotifications(data || [])
  }

  async function dismiss(id) {
    await supabase
      .from('user_notifications')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  async function dismissAll() {
    const ids = notifications.map(n => n.id)
    if (ids.length === 0) return
    await supabase
      .from('user_notifications')
      .update({ dismissed_at: new Date().toISOString() })
      .in('id', ids)
    setNotifications([])
  }

  function handleClick(notification) {
    dismiss(notification.id)
    if (onNavigateToMessage && notification.message_id) {
      onNavigateToMessage(notification.message_id)
    }
    setOpen(false)
  }

  const count = notifications.length

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button className="bell-btn" onClick={() => setOpen(!open)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && <span className="bell-badge">{count}</span>}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <span>Notifications</span>
            {count > 0 && (
              <button className="dismiss-all-btn" onClick={dismissAll}>
                Dismiss all
              </button>
            )}
          </div>
          {count === 0 ? (
            <p className="notification-empty">No new notifications</p>
          ) : (
            <ul className="notification-list">
              {notifications.map(n => (
                <li key={n.id} className="notification-item" onClick={() => handleClick(n)}>
                  <p className="notification-summary">{n.summary}</p>
                  <span className="notification-time">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
