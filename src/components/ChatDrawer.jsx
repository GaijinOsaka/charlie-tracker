import React, { useState, useRef, useEffect } from 'react'
import { supabase } from '../lib/supabase'

export default function ChatDrawer() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const messagesEndRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSend(e) {
    e?.preventDefault()
    const question = input.trim()
    if (!question || loading) return

    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: question }])
    setLoading(true)

    try {
      // Build history from previous messages (exclude the one we just added)
      const history = messages.map(m => ({ role: m.role, content: m.content }))

      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await supabase.functions.invoke('rag-chat', {
        body: { question, history },
        headers: session?.access_token
          ? { Authorization: `Bearer ${session.access_token}` }
          : {},
      })

      if (error) {
        let msg = error.message
        try {
          if (error.context && typeof error.context.json === 'function') {
            const body = await error.context.json()
            msg = body.error || msg
          }
        } catch (_) {}
        throw new Error(msg)
      }

      if (data?.error) throw new Error(data.error)

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: data.answer,
        sources: data.sources || [],
      }])
    } catch (err) {
      console.error('Chat error:', err)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `Sorry, something went wrong: ${err.message}`,
        sources: [],
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleClear() {
    setMessages([])
  }

  return (
    <>
      {/* Floating button */}
      <button
        className={`chat-fab ${isOpen ? 'chat-fab-open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title="Ask Charlie"
      >
        {isOpen ? '\u2715' : '\u{1F4AC}'}
        {!isOpen && <span className="chat-fab-label">Ask Charlie</span>}
      </button>

      {/* Backdrop */}
      {isOpen && (
        <div className="chat-backdrop" onClick={() => setIsOpen(false)} />
      )}

      {/* Drawer */}
      <div className={`chat-drawer ${isOpen ? 'chat-drawer-open' : ''}`}>
        <div className="chat-header">
          <h3 className="chat-title">Ask Charlie</h3>
          <div className="chat-header-actions">
            {messages.length > 0 && (
              <button className="chat-clear-btn" onClick={handleClear}>
                Clear
              </button>
            )}
            <button className="chat-close-btn" onClick={() => setIsOpen(false)}>
              &times;
            </button>
          </div>
        </div>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">
              <p>Ask me anything about your indexed documents.</p>
              <p className="chat-empty-hint">Try: "When is the next training day?" or "What events are coming up?"</p>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`chat-msg chat-msg-${msg.role}`}>
              <div className="chat-msg-bubble">
                {msg.content}
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="chat-sources">
                  {msg.sources.map((src, j) => (
                    <span key={j} className="chat-source-chip" title={src.content}>
                      {src.filename}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="chat-msg chat-msg-assistant">
              <div className="chat-msg-bubble chat-typing">
                <span></span><span></span><span></span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        <form className="chat-input-area" onSubmit={handleSend}>
          <input
            ref={inputRef}
            type="text"
            className="chat-input"
            placeholder="Ask a question..."
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={loading}
          />
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!input.trim() || loading}
          >
            Send
          </button>
        </form>
      </div>
    </>
  )
}
