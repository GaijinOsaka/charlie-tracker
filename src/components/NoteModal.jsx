import { useState, useEffect, useRef } from "react";

export default function NoteModal({ isOpen, note, onSave, onCancel }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(note?.title || "");
      setBody(note?.body || "");
      setError("");
      setSaving(false);
      setTimeout(() => titleRef.current?.focus(), 50);
    }
  }, [isOpen, note]);

  async function handleSubmit(e) {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    setSaving(true);
    try {
      await onSave({ title: title.trim(), body: body.trim() || null });
    } catch (err) {
      setError(err.message || "Failed to save note");
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>{note ? "Edit Note" : "New Note"}</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="note-title">Title *</label>
            <input
              id="note-title"
              ref={titleRef}
              type="text"
              value={title}
              onChange={(e) => { setTitle(e.target.value); setError(""); }}
              placeholder="Note title"
            />
          </div>
          <div className="form-group">
            <label htmlFor="note-body">Details (optional)</label>
            <textarea
              id="note-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add more detail..."
              rows={4}
            />
          </div>
          {error && <p className="form-error">{error}</p>}
          <div className="modal-actions">
            <button type="button" className="modal-cancel-btn" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="modal-confirm-btn" disabled={saving}>
              {saving ? "Saving..." : note ? "Update" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
