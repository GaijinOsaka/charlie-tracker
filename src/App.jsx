import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import DocumentBrowser from './components/DocumentBrowser'
import './App.css'

function App() {
  const [activeTab, setActiveTab] = useState('messages')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toasts, setToasts] = useState([])
  const [statusFilter, setStatusFilter] = useState('all')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [searchQuery, setSearchQuery] = useState('')

  // Load initial messages
  useEffect(() => {
    loadMessages()
  }, [])

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          setMessages(prev => [payload.new, ...prev])
          addToast(`New message from ${payload.new.sender_name}`, 'info')
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          setMessages(prev => prev.map(m =>
            m.id === payload.new.id ? payload.new : m
          ))
        }
      )
      .subscribe((status) => {
        console.log('Realtime status:', status)
      })

    return () => {
      channel.unsubscribe()
    }
  }, [])

  async function loadMessages() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('messages')
        .select('*, attachments(id, filename, file_path, mime_type, file_size)')
        .order('received_at', { ascending: false })
        .limit(100)

      if (error) throw error
      setMessages(data || [])
    } catch (error) {
      setError(error.message)
      console.error('Error loading messages:', error)
    } finally {
      setLoading(false)
    }
  }

  function addToast(message, type = 'info') {
    const id = Date.now()
    setToasts(prev => [...prev, { id, message, type }])
  }

  function removeToast(id) {
    setToasts(prev => prev.filter(t => t.id !== id))
  }

  function getFilteredMessages() {
    let filtered = messages

    if (statusFilter === 'unread') {
      filtered = filtered.filter(m => !m.is_read)
    } else if (statusFilter === 'read') {
      filtered = filtered.filter(m => m.is_read)
    }

    if (sourceFilter !== 'all') {
      filtered = filtered.filter(m => m.source === sourceFilter)
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      filtered = filtered.filter(m =>
        m.subject.toLowerCase().includes(query) ||
        (m.sender_name && m.sender_name.toLowerCase().includes(query)) ||
        (m.content && m.content.toLowerCase().includes(query))
      )
    }

    return filtered
  }

  async function downloadAttachment(filePath, filename) {
    try {
      const { data, error } = await supabase.storage
        .from('charlie-documents')
        .createSignedUrl(filePath, 3600)
      if (error) throw error
      window.open(data.signedUrl, '_blank')
    } catch (err) {
      console.error('Attachment download error:', err)
      addToast('Failed to download attachment', 'error')
    }
  }

  async function toggleReadStatus(message) {
    try {
      const { error } = await supabase
        .from('messages')
        .update({ is_read: !message.is_read })
        .eq('id', message.id)

      if (error) throw error
    } catch (error) {
      console.error('Error updating message:', error)
      addToast('Error updating message', 'error')
    }
  }

  const filteredMessages = getFilteredMessages()

  return (
    <div className="app">
      <header>
        <h1>Charlie Oakes Tracker</h1>
        <p className="subtitle">Communication Dashboard</p>
      </header>

      <nav className="tab-nav">
        <button
          className={`tab-btn ${activeTab === 'messages' ? 'active' : ''}`}
          onClick={() => setActiveTab('messages')}
        >
          Messages
        </button>
        <button
          className={`tab-btn ${activeTab === 'documents' ? 'active' : ''}`}
          onClick={() => setActiveTab('documents')}
        >
          Documents
        </button>
      </nav>

      <main>
        {activeTab === 'documents' && <DocumentBrowser />}

        {activeTab === 'messages' && <>
        <div className="filters">
          <div className="filter-group">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="all">All Messages</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Source</label>
            <select value={sourceFilter} onChange={(e) => setSourceFilter(e.target.value)}>
              <option value="all">All Sources</option>
              <option value="arbor">Arbor</option>
              <option value="gmail">Gmail</option>
            </select>
          </div>

          <div className="filter-group search">
            <label>Search</label>
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        {loading && <p className="loading">Loading messages...</p>}
        {error && <p className="error">Error: {error}</p>}

        {!loading && !error && filteredMessages.length === 0 && (
          <p className="no-messages">No messages found</p>
        )}

        {!loading && !error && filteredMessages.length > 0 && (
          <ul className="message-list">
            {filteredMessages.map(msg => (
              <li
                key={msg.id}
                className={`message-item ${msg.is_read ? 'read' : 'unread'}`}
              >
                <div className="message-header">
                  <div className="message-info">
                    <h3 className="message-subject">{msg.subject}</h3>
                    <p className="message-sender">{msg.sender_name || msg.sender_email}</p>
                    <p className="message-time">
                      {new Date(msg.received_at).toLocaleString()}
                    </p>
                  </div>
                  <div className="message-meta">
                    <span className={`source-badge source-${msg.source}`}>
                      {(msg.source || 'arbor').toUpperCase()}
                    </span>
                    {!msg.is_read && <span className="unread-dot"></span>}
                  </div>
                </div>

                <div className="message-content">
                  {msg.content?.substring(0, 200)}
                  {msg.content && msg.content.length > 200 ? '...' : ''}
                </div>

                {msg.attachments && msg.attachments.length > 0 && (
                  <div className="message-attachments">
                    <span className="attachments-label">Attachments:</span>
                    {msg.attachments.map(att => (
                      <button
                        key={att.id}
                        className="attachment-link"
                        onClick={() => downloadAttachment(att.file_path, att.filename)}
                        title={att.filename}
                      >
                        <span className="attachment-icon">
                          {att.mime_type?.includes('pdf') ? '\u{1F4C4}' : '\u{1F4CE}'}
                        </span>
                        <span className="attachment-name">{att.filename}</span>
                        {att.file_size && (
                          <span className="attachment-size">
                            ({Math.round(att.file_size / 1024)}KB)
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                )}

                <button
                  className="btn-mark-read"
                  onClick={() => toggleReadStatus(msg)}
                >
                  {msg.is_read ? 'Mark as Unread' : 'Mark as Read'}
                </button>
              </li>
            ))}
          </ul>
        )}
        </>}
      </main>

      {/* Toast Container */}
      <div className="toast-container">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.type}`}>
            <p>{toast.message}</p>
            <button
              className="toast-close"
              onClick={() => removeToast(toast.id)}
              aria-label="Close"
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

export default App
