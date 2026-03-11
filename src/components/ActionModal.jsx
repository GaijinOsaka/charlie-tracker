import React, { useState, useRef, useEffect } from 'react'

export default function ActionModal({ message, onConfirm, onCancel }) {
  const [note, setNote] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    onConfirm(note.trim())
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3>Action Message</h3>
        <p className="modal-subject">{message.subject}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="action-note">What did you do?</label>
            <textarea
              id="action-note"
              ref={inputRef}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Signed and returned the form"
              rows={3}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="modal-cancel-btn" onClick={onCancel}>Cancel</button>
            <button type="submit" className="modal-confirm-btn">Mark as Actioned</button>
          </div>
        </form>
      </div>
    </div>
  )
}
