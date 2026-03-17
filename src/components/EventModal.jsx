import { useState, useEffect } from 'react';
import '../styles/EventModal.css';

export default function EventModal({
  isOpen,
  onClose,
  onSubmit,
  initialDate = null,
  editingEvent = null,
  creatorName = null
}) {
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState(initialDate || '');
  const [eventTime, setEventTime] = useState('');
  const [eventEndTime, setEventEndTime] = useState('');
  const [description, setDescription] = useState('');
  const [actionRequired, setActionRequired] = useState(false);
  const [actionDetail, setActionDetail] = useState('');
  const [error, setError] = useState('');

  // Pre-fill form if editing
  useEffect(() => {
    if (editingEvent) {
      setTitle(editingEvent.title || '');
      setEventDate(editingEvent.event_date || '');
      setEventTime(editingEvent.event_time || '');
      setEventEndTime(editingEvent.event_end_time || '');
      setDescription(editingEvent.description || '');
      setActionRequired(editingEvent.action_required || false);
      setActionDetail(editingEvent.action_detail || '');
    } else {
      setTitle('');
      setEventDate(initialDate || '');
      setEventTime('');
      setEventEndTime('');
      setDescription('');
      setActionRequired(false);
      setActionDetail('');
    }
    setError('');
  }, [editingEvent, initialDate, isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validation
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!eventDate) {
      setError('Date is required');
      return;
    }

    try {
      await onSubmit({
        title: title.trim(),
        event_date: eventDate,
        event_time: eventTime || null,
        event_end_time: eventEndTime || null,
        description: description.trim() || null,
        action_required: actionRequired,
        action_detail: actionDetail.trim() || null
      });
      // Form reset happens in parent on successful submission
    } catch (err) {
      setError(err.message || 'Error saving event');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{editingEvent ? 'Edit Event' : 'Create Event'}</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            &times;
          </button>
        </div>

        {editingEvent && creatorName && (
          <div className="modal-creator-info">
            Created by: <strong>{creatorName}</strong>
          </div>
        )}

        <form onSubmit={handleSubmit} className="event-form">
          <div className="form-group">
            <label htmlFor="title">Title *</label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Sports Day, Parent Evening"
              required
            />
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="date">Date *</label>
              <input
                id="date"
                type="date"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="time">Time</label>
              <input
                id="time"
                type="time"
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="endTime">End Time</label>
              <input
                id="endTime"
                type="time"
                value={eventEndTime}
                onChange={(e) => setEventEndTime(e.target.value)}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="description">Description</label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Additional details (optional)"
              rows="3"
            />
          </div>

          <div className="form-group checkbox-group">
            <label htmlFor="actionRequired">
              <input
                id="actionRequired"
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

          {error && <div className="form-error">{error}</div>}

          <div className="form-buttons">
            <button type="button" className="btn-cancel" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-submit">
              {editingEvent ? 'Update Event' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
