import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function SettingsPanel() {
  const { user, profile } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviting, setInviting] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    loadProfiles()
  }, [])

  async function loadProfiles() {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setProfiles(data || [])
  }

  async function handleInvite(e) {
    e.preventDefault()
    setInviting(true)
    setMessage(null)

    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email: inviteEmail, display_name: inviteName },
      })
      if (error) throw error
      if (data.error) throw new Error(data.error)
      setMessage({ type: 'success', text: `Invite sent to ${inviteEmail}` })
      setInviteEmail('')
      setInviteName('')
      loadProfiles()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setInviting(false)
    }
  }

  const canInvite = profiles.length < 2

  return (
    <div className="settings-panel">
      <h2>Settings</h2>

      <section className="settings-section">
        <h3>Users</h3>
        <ul className="user-list">
          {profiles.map(p => (
            <li key={p.id} className="user-item">
              <span className="user-item-name">{p.display_name}</span>
              <span className="user-item-email">{p.email}</span>
              {p.id === user.id && <span className="user-item-you">(you)</span>}
            </li>
          ))}
        </ul>
      </section>

      {canInvite && (
        <section className="settings-section">
          <h3>Invite Partner</h3>
          <form onSubmit={handleInvite} className="invite-form">
            <div className="form-group">
              <label htmlFor="invite-name">Display Name</label>
              <input
                id="invite-name"
                type="text"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                placeholder="e.g. Sarah"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="invite-email">Email</label>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="partner@email.com"
                required
              />
            </div>
            {message && (
              <p className={`settings-msg ${message.type}`}>{message.text}</p>
            )}
            <button type="submit" className="invite-btn" disabled={inviting}>
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
          </form>
        </section>
      )}
    </div>
  )
}
