import { useState, useEffect, useRef } from "react";
import "../styles/EventModal.css";

export default function NoteModal({ isOpen, note, onSave, onCancel }) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [addToCalendar, setAddToCalendar] = useState(false);
  const [eventDate, setEventDate] = useState("");
  const [eventTime, setEventTime] = useState("");
  const [eventEndTime, setEventEndTime] = useState("");
  const [actionRequired, setActionRequired] = useState(false);
  const [actionDetail, setActionDetail] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const titleRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setTitle(note?.title || "");
      setBody(note?.body || "");
      setAddToCalendar(false);
      setEventDate("");
      setEventTime("");
      setEventEndTime("");
      setActionRequired(false);
      setActionDetail("");
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
    if (addToCalendar && !eventDate) {
      setError("Date is required when adding to calendar");
      return;
    }
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        body: body.trim() || null,
        addToCalendar,
        eventDate,
        eventTime: eventTime || null,
        eventEndTime: eventEndTime || null,
        actionRequired,
        actionDetail: actionDetail.trim() || null,
      });
    } catch (err) {
      setError(err.message || "Failed to save note");
      setSaving(false);
    }
  }

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{note ? "Edit Note" : "New Note"}</h2>
          <button className="modal-close" onClick={onCancel} aria-label="Close">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="event-form">
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
              rows={3}
            />
          </div>

          <div className="form-group checkbox-group">
            <label htmlFor="add-to-calendar">
              <input
                id="add-to-calendar"
                type="checkbox"
                checked={addToCalendar}
                onChange={(e) => { setAddToCalendar(e.target.checked); setError(""); }}
              />
              Add to Calendar
            </label>
          </div>

          {addToCalendar && (
            <>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="note-event-date">Date *</label>
                  <input
                    id="note-event-date"
                    type="date"
                    value={eventDate}
                    onChange={(e) => { setEventDate(e.target.value); setError(""); }}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="note-event-time">Start Time</label>
                  <input
                    id="note-event-time"
                    type="time"
                    value={eventTime}
                    onChange={(e) => setEventTime(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="note-event-end-time">End Time</label>
                  <input
                    id="note-event-end-time"
                    type="time"
                    value={eventEndTime}
                    onChange={(e) => setEventEndTime(e.target.value)}
                  />
                </div>
              </div>

              <div className="form-group checkbox-group">
                <label htmlFor="note-action-required">
                  <input
                    id="note-action-required"
                    type="checkbox"
                    checked={actionRequired}
                    onChange={(e) => setActionRequired(e.target.checked)}
                  />
                  Action Required
                </label>
                {actionRequired && (
                  <input
                    type="text"
                    value={actionDetail}
                    onChange={(e) => setActionDetail(e.target.value)}
                    placeholder="What action is needed?"
                    className="action-detail-input"
                  />
                )}
              </div>
            </>
          )}

          {error && <div className="form-error">{error}</div>}

          <div className="form-buttons">
            <button type="button" className="btn-cancel" onClick={onCancel} disabled={saving}>
              Cancel
            </button>
            <button type="submit" className="btn-submit" disabled={saving}>
              {saving ? "Saving..." : note ? "Update" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
