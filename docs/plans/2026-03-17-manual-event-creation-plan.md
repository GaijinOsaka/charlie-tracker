# Manual Event Creation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable both users to manually create diary events with title, date, time, description, and tags, with creator attribution and edit/delete permissions.

**Architecture:** Add `created_by` and `source_type` columns to events table. Create EventModal component for form UI. Modify CalendarView to show "Create Event" button and click-to-create on dates. Update RLS policies to allow INSERT/UPDATE/DELETE based on creator. Add helper functions for CRUD operations.

**Tech Stack:** React (hooks), Supabase (Auth, Realtime), PostgreSQL (constraints, RLS), CSS (modal styling)

---

## Task 1: Database Migration - Add Event Creator Tracking

**Files:**
- Create: `supabase/migrations/2026-03-17-manual-events.sql`

**Step 1: Create migration file with schema changes**

Create `supabase/migrations/2026-03-17-manual-events.sql`:

```sql
-- Add columns to track manual vs extracted events and creator
ALTER TABLE events
  ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN source_type TEXT DEFAULT 'extracted';

-- Index for querying events by creator
CREATE INDEX idx_events_created_by ON events(created_by);

-- Constraint: extracted events must have a source, manual events must not
ALTER TABLE events
  DROP CONSTRAINT events_has_source;

ALTER TABLE events
  ADD CONSTRAINT events_source_constraint CHECK (
    (source_type = 'extracted' AND (message_id IS NOT NULL OR document_id IS NOT NULL))
    OR
    (source_type = 'manual' AND message_id IS NULL AND document_id IS NULL)
  );
```

**Step 2: Verify migration file syntax**

Run: `cat supabase/migrations/2026-03-17-manual-events.sql`
Expected: Migration file contains ALTER TABLE statements with proper constraint logic

**Step 3: Update RLS policies for manual event creation**

Add to the same migration file (append after constraint):

```sql
-- Allow authenticated users to read all events (already exists)
-- Allow users to insert their own manual events
CREATE POLICY "Users can create manual events"
  ON events FOR INSERT
  WITH CHECK (
    auth.uid() = created_by
    AND source_type = 'manual'
    AND message_id IS NULL
    AND document_id IS NULL
  );

-- Allow users to update their own events
CREATE POLICY "Users can update own events"
  ON events FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Allow users to delete their own events
CREATE POLICY "Users can delete own events"
  ON events FOR DELETE
  USING (auth.uid() = created_by);

-- Drop old RLS policy that doesn't distinguish users
DROP POLICY IF EXISTS "Authenticated users can read events" ON events;
```

**Step 4: Apply migration locally (if using Supabase locally)**

Note: You'll apply this to production Supabase via the dashboard SQL editor later.
Run: `echo "Migration file prepared for Supabase dashboard"`

**Step 5: Commit**

```bash
git add supabase/migrations/2026-03-17-manual-events.sql
git commit -m "feat: add event creator tracking and source type distinction"
```

---

## Task 2: Add Event CRUD Helper Functions

**Files:**
- Modify: `src/lib/supabase.js`

**Step 1: Add createManualEvent function**

Add to `src/lib/supabase.js`:

```javascript
export async function createManualEvent(eventData) {
  // eventData: { title, event_date, event_time, event_end_time, description, action_required, action_detail }
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error('User not authenticated');

  const { data, error } = await supabase
    .from('events')
    .insert([{
      title: eventData.title,
      event_date: eventData.event_date,
      event_time: eventData.event_time || null,
      event_end_time: eventData.event_end_time || null,
      description: eventData.description || null,
      action_required: eventData.action_required || false,
      action_detail: eventData.action_detail || null,
      created_by: user.id,
      source_type: 'manual',
      message_id: null,
      document_id: null
    }])
    .select()

  if (error) throw error;
  return data[0];
}
```

**Step 2: Add updateManualEvent function**

Add to `src/lib/supabase.js`:

```javascript
export async function updateManualEvent(eventId, eventData) {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error('User not authenticated');

  // Verify user is the creator (RLS will enforce, but check client-side too)
  const { data: event, error: fetchError } = await supabase
    .from('events')
    .select('created_by')
    .eq('id', eventId)
    .single();

  if (fetchError) throw fetchError;
  if (event.created_by !== user.id) throw new Error('Only event creator can edit');

  const { data, error } = await supabase
    .from('events')
    .update({
      title: eventData.title,
      event_date: eventData.event_date,
      event_time: eventData.event_time || null,
      event_end_time: eventData.event_end_time || null,
      description: eventData.description || null,
      action_required: eventData.action_required || false,
      action_detail: eventData.action_detail || null
    })
    .eq('id', eventId)
    .select()

  if (error) throw error;
  return data[0];
}
```

**Step 3: Add deleteManualEvent function**

Add to `src/lib/supabase.js`:

```javascript
export async function deleteManualEvent(eventId) {
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) throw new Error('User not authenticated');

  // Verify user is the creator (RLS will enforce, but check client-side too)
  const { data: event, error: fetchError } = await supabase
    .from('events')
    .select('created_by')
    .eq('id', eventId)
    .single();

  if (fetchError) throw fetchError;
  if (event.created_by !== user.id) throw new Error('Only event creator can delete');

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)

  if (error) throw error;
}
```

**Step 4: Verify functions are exported**

Run: `grep -n "export async function.*Event" src/lib/supabase.js`
Expected: Shows createManualEvent, updateManualEvent, deleteManualEvent

**Step 5: Commit**

```bash
git add src/lib/supabase.js
git commit -m "feat: add CRUD functions for manual events"
```

---

## Task 3: Create EventModal Component

**Files:**
- Create: `src/components/EventModal.jsx`

**Step 1: Create EventModal component with form**

Create `src/components/EventModal.jsx`:

```javascript
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
```

**Step 2: Create modal styles**

Create `src/styles/EventModal.css`:

```css
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  max-width: 500px;
  width: 90%;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--border);
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
  color: var(--text);
}

.modal-close {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-close:hover {
  color: var(--text);
}

.modal-creator-info {
  padding: 12px 20px;
  background: var(--bg-muted);
  font-size: 0.875rem;
  color: var(--text-secondary);
  border-bottom: 1px solid var(--border);
}

.event-form {
  padding: 20px;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text);
}

.form-group input[type="text"],
.form-group input[type="date"],
.form-group input[type="time"],
.form-group textarea {
  width: 100%;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--bg);
  color: var(--text);
  font-family: inherit;
  font-size: 0.9375rem;
}

.form-group input:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.form-group textarea {
  resize: vertical;
  min-height: 80px;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 12px;
}

.checkbox-group {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  margin: 0;
}

.checkbox-group input[type="checkbox"] {
  margin-right: 6px;
  cursor: pointer;
}

.action-detail-input {
  flex: 1;
  min-width: 200px;
}

.form-error {
  padding: 8px 12px;
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid var(--danger);
  border-radius: 4px;
  color: var(--danger);
  font-size: 0.875rem;
  margin-bottom: 12px;
}

.form-buttons {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
  margin-top: 20px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.btn-cancel,
.btn-submit {
  padding: 8px 16px;
  border-radius: 4px;
  font-size: 0.9375rem;
  cursor: pointer;
  border: none;
  font-weight: 500;
}

.btn-cancel {
  background: var(--bg-muted);
  color: var(--text);
}

.btn-cancel:hover {
  background: var(--border);
}

.btn-submit {
  background: var(--primary);
  color: white;
}

.btn-submit:hover {
  background: #2563eb;
}

@media (max-width: 768px) {
  .modal-content {
    width: 95%;
    max-height: 95vh;
  }

  .form-row {
    grid-template-columns: 1fr;
  }

  .form-buttons {
    flex-direction: column;
  }

  .btn-cancel,
  .btn-submit {
    width: 100%;
  }
}
```

**Step 3: Verify component file exists and has no syntax errors**

Run: `head -20 src/components/EventModal.jsx`
Expected: Shows import statements and component definition

**Step 4: Commit**

```bash
git add src/components/EventModal.jsx src/styles/EventModal.css
git commit -m "feat: add EventModal component for event creation and editing"
```

---

## Task 4: Update CalendarView to Support Manual Event Creation

**Files:**
- Modify: `src/components/CalendarView.jsx` (lines 1-20 and calendar grid rendering)

**Step 1: Add state and props for event creation**

Modify `CalendarView.jsx` - update function signature and add state:

```javascript
function CalendarView({
  events,
  linkify,
  downloadAttachment,
  archiveEvent,
  onCreateEvent,        // NEW
  onEditEvent,          // NEW
  onDeleteEvent,        // NEW
  currentUserId,        // NEW
  profiles              // NEW
}) {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState(null)
  const [expandedCalEvent, setExpandedCalEvent] = useState(null)
  const [showEventModal, setShowEventModal] = useState(false)  // NEW
  const [selectedDateForCreate, setSelectedDateForCreate] = useState(null)  // NEW
  const [editingEvent, setEditingEvent] = useState(null)  // NEW
```

**Step 2: Add "Create Event" button to header**

In the calendar grid rendering section, find where month navigation buttons are and add:

```javascript
  function handleCreateEventClick() {
    setEditingEvent(null)
    setSelectedDateForCreate(null)
    setShowEventModal(true)
  }

  function handleDateClick(day) {
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    setSelectedDateForCreate(dateStr)
    setEditingEvent(null)
    setShowEventModal(true)
  }

  function handleEditEvent(evt) {
    setEditingEvent(evt)
    setSelectedDateForCreate(null)
    setShowEventModal(true)
  }

  async function handleModalSubmit(formData) {
    try {
      if (editingEvent) {
        await onEditEvent(editingEvent.id, formData)
      } else {
        await onCreateEvent(formData)
      }
      setShowEventModal(false)
      setEditingEvent(null)
      setSelectedDateForCreate(null)
    } catch (err) {
      console.error('Error saving event:', err)
    }
  }
```

**Step 3: Add Create Event button to render output (before month grid)**

Find the JSX return statement and add button before calendar grid:

```javascript
  return (
    <div className="calendar-container">
      <div className="calendar-header">
        <button onClick={prevMonth} className="btn-month">
          ← Prev
        </button>
        <h3 className="calendar-title">
          {MONTHS[viewMonth]} {viewYear}
        </h3>
        <button onClick={nextMonth} className="btn-month">
          Next →
        </button>
        <button onClick={goToday} className="btn-today">
          Today
        </button>
        <button onClick={handleCreateEventClick} className="btn-create-event">
          + Create Event
        </button>
      </div>
      {/* ... rest of calendar ... */}
```

**Step 4: Update date cells to be clickable for event creation**

In the calendar grid rendering, find where individual date cells are rendered and make them clickable:

```javascript
  // In the calendar grid rendering loop:
  // Replace static date cells with clickable ones
  {cells.map((day, idx) => (
    <div
      key={idx}
      className={`cal-date-cell ${day === null ? 'empty' : ''} ${
        day && todayStr === dateStr(day) ? 'today' : ''
      } ${day && selectedDate === dateStr(day) ? 'selected' : ''}`}
      onClick={() => day && handleDateClick(day)}
    >
      {day && (
        <div className="cal-date-content">
          <div className="cal-date-number">{day}</div>
          {eventsByDate[dateStr(day)] && (
            <div className="cal-date-events">
              {eventsByDate[dateStr(day)].map(evt => (
                <div key={evt.id} className="cal-date-event-dot" title={evt.title} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  ))}
```

**Step 5: Add EventModal component to render output (end of CalendarView)**

Add before closing div of CalendarView:

```javascript
  // Import EventModal at top: import EventModal from './EventModal'

  return (
    <div className="calendar-container">
      {/* ... calendar grid ... */}

      <EventModal
        isOpen={showEventModal}
        onClose={() => {
          setShowEventModal(false)
          setEditingEvent(null)
          setSelectedDateForCreate(null)
        }}
        onSubmit={handleModalSubmit}
        initialDate={selectedDateForCreate}
        editingEvent={editingEvent}
        creatorName={editingEvent && profiles[editingEvent.created_by]
          ? profiles[editingEvent.created_by].display_name
          : null}
      />
    </div>
  )
```

**Step 6: Update event cards to show creator and edit/delete buttons**

In the `renderEventCard` function, update to show creator info and action buttons:

```javascript
  function renderEventCard(evt, showDate) {
    const isCreator = currentUserId && evt.created_by === currentUserId;
    const creatorDisplayName = evt.created_by && profiles[evt.created_by]
      ? profiles[evt.created_by].display_name
      : 'Unknown';

    return (
      <div key={evt.id} className={`cal-event-card ${expandedCalEvent === evt.id ? 'cal-event-expanded' : ''}`}>
        <div className="cal-event-row" onClick={() => setExpandedCalEvent(expandedCalEvent === evt.id ? null : evt.id)}>
          {/* ... existing date/title/time rendering ... */}

          {/* Add creator info and actions */}
          <div className="cal-event-footer">
            {evt.source_type === 'manual' && (
              <span className="event-creator">Created by: {creatorDisplayName}</span>
            )}
            {isCreator && evt.source_type === 'manual' && (
              <div className="event-actions">
                <button
                  className="btn-event-edit"
                  onClick={(e) => { e.stopPropagation(); handleEditEvent(evt); }}
                  title="Edit event"
                >
                  Edit
                </button>
                <button
                  className="btn-event-delete"
                  onClick={(e) => { e.stopPropagation(); onDeleteEvent(evt.id); }}
                  title="Delete event"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
        {/* ... rest of expanded content ... */}
      </div>
    )
  }
```

**Step 7: Verify changes compile**

Run: `npm run build 2>&1 | tail -5`
Expected: Build completes without errors

**Step 8: Commit**

```bash
git add src/components/CalendarView.jsx
git commit -m "feat: add event creation UI to CalendarView with modal integration"
```

---

## Task 5: Update App Component to Wire Everything Together

**Files:**
- Modify: `src/App.jsx` (event loading and handlers)

**Step 1: Import new functions and component**

At top of App.jsx, add imports:

```javascript
import EventModal from './components/EventModal';
import { createManualEvent, updateManualEvent, deleteManualEvent } from './lib/supabase';
```

**Step 2: Add event creation handler**

Add to App function, alongside existing handlers:

```javascript
  async function handleCreateEvent(formData) {
    try {
      const newEvent = await createManualEvent(formData);
      // Add to local state immediately for instant feedback
      setEvents([...events, newEvent]);
      // Show toast
      showToast('Event created successfully');
    } catch (err) {
      console.error('Error creating event:', err);
      showToast('Failed to create event: ' + err.message, 'error');
    }
  }

  async function handleUpdateEvent(eventId, formData) {
    try {
      const updatedEvent = await updateManualEvent(eventId, formData);
      setEvents(events.map(e => e.id === eventId ? updatedEvent : e));
      showToast('Event updated successfully');
    } catch (err) {
      console.error('Error updating event:', err);
      showToast('Failed to update event: ' + err.message, 'error');
    }
  }

  async function handleDeleteEvent(eventId) {
    if (!confirm('Delete this event?')) return;
    try {
      await deleteManualEvent(eventId);
      setEvents(events.filter(e => e.id !== eventId));
      showToast('Event deleted');
    } catch (err) {
      console.error('Error deleting event:', err);
      showToast('Failed to delete event: ' + err.message, 'error');
    }
  }
```

**Step 3: Update CalendarView component call**

Find where CalendarView is rendered in the JSX and update:

```javascript
  {activeTab === 'calendar' && (
    <CalendarView
      events={events}
      linkify={linkify}
      downloadAttachment={downloadAttachment}
      archiveEvent={archiveEvent}
      onCreateEvent={handleCreateEvent}
      onEditEvent={handleUpdateEvent}
      onDeleteEvent={handleDeleteEvent}
      currentUserId={user?.id}
      profiles={profiles}
    />
  )}
```

**Step 4: Verify App component syntax**

Run: `grep -n "handleCreateEvent\|handleUpdateEvent\|handleDeleteEvent" src/App.jsx | head -5`
Expected: Shows the three handler functions defined

**Step 5: Test build**

Run: `npm run build 2>&1 | grep -E "error|success|✓"`
Expected: Build succeeds with no errors

**Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire event creation handlers in App component"
```

---

## Task 6: Add Event CSS Styling

**Files:**
- Modify: `src/App.css` (add event-related styles)

**Step 1: Add calendar date cell clickability styles**

Add to App.css:

```css
.cal-date-cell {
  cursor: pointer;
  transition: background-color 0.2s;
}

.cal-date-cell:hover:not(.empty) {
  background-color: var(--bg-muted);
}

.cal-date-cell.selected {
  background-color: var(--primary);
  color: white;
}

.cal-date-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  height: 100%;
  min-height: 60px;
  padding: 4px;
}

.cal-date-number {
  font-weight: 500;
  text-align: center;
}

.cal-date-events {
  display: flex;
  gap: 2px;
  justify-content: center;
  flex-wrap: wrap;
}

.cal-date-event-dot {
  width: 6px;
  height: 6px;
  background-color: var(--primary);
  border-radius: 50%;
}

.btn-create-event {
  padding: 8px 12px;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: 500;
  margin-left: auto;
}

.btn-create-event:hover {
  background: #2563eb;
}

.cal-event-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--border);
  font-size: 0.8125rem;
}

.event-creator {
  color: var(--text-secondary);
  font-style: italic;
}

.event-actions {
  display: flex;
  gap: 4px;
}

.btn-event-edit,
.btn-event-delete {
  padding: 4px 8px;
  font-size: 0.75rem;
  border: none;
  border-radius: 3px;
  cursor: pointer;
  background: var(--bg-muted);
  color: var(--text);
  transition: background-color 0.2s;
}

.btn-event-edit:hover {
  background: var(--primary);
  color: white;
}

.btn-event-delete:hover {
  background: var(--danger);
  color: white;
}
```

**Step 2: Verify CSS additions**

Run: `grep -n "cal-date-cell\|btn-create-event\|event-creator" src/App.css | head -3`
Expected: Shows newly added CSS rules

**Step 3: Build and check for CSS errors**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds, no CSS errors

**Step 4: Commit**

```bash
git add src/App.css
git commit -m "feat: add styling for event creation UI"
```

---

## Task 7: Apply Database Migration to Supabase

**Files:**
- Use: `supabase/migrations/2026-03-17-manual-events.sql` (created in Task 1)

**Step 1: Copy migration SQL**

Run: `cat supabase/migrations/2026-03-17-manual-events.sql`
Expected: Shows full migration with ALTER TABLE, constraints, and RLS policies

**Step 2: Apply migration via Supabase dashboard**

Manual steps:
1. Go to Supabase project → SQL Editor
2. Create new query
3. Copy entire migration file contents
4. Run query
5. Verify success (should show "0 rows" responses)

**Step 3: Verify RLS policies applied**

In Supabase dashboard:
1. Go to Authentication → Policies
2. Check events table has:
   - "Authenticated users can read events" (SELECT)
   - "Users can create manual events" (INSERT)
   - "Users can update own events" (UPDATE)
   - "Users can delete own events" (DELETE)

**Step 4: Test manual event insert via Supabase SQL**

Run in SQL editor:

```sql
-- Insert a test manual event as authenticated user
INSERT INTO events (title, event_date, created_by, source_type)
SELECT
  'Test Manual Event',
  '2026-03-20'::date,
  auth.uid(),
  'manual'
WHERE auth.uid() IS NOT NULL;

-- Verify it was inserted
SELECT id, title, event_date, source_type, created_by FROM events
WHERE source_type = 'manual' ORDER BY created_at DESC LIMIT 1;
```

Expected: Event inserted successfully, shows in results

**Step 5: Commit migration record (if using version control for migrations)**

Run: `git add supabase/migrations/2026-03-17-manual-events.sql && git commit -m "chore: apply manual events database migration"`
(Already committed in Task 1, but confirming here)

---

## Task 8: Manual Testing and Verification

**Files:**
- Test manually via app UI (no automated tests, verification-based)

**Step 1: Start dev server**

Run: `npm run dev`
Expected: App starts on http://localhost:5173

**Step 2: Test "Create Event" button**

1. Navigate to Calendar tab
2. Click "+ Create Event" button
3. Verify EventModal opens with empty form
4. Click Cancel
5. Verify modal closes without creating event

**Step 3: Test click-to-create on calendar date**

1. In calendar view, click on an empty date cell
2. Verify EventModal opens with date pre-filled
3. Cancel and verify modal closes

**Step 4: Test event creation with minimal data**

1. Click "Create Event"
2. Fill title: "Test Event"
3. Select date: tomorrow
4. Leave time empty
5. Click "Create Event"
6. Verify: Event appears on calendar, no errors in console

**Step 5: Test event creation with all fields**

1. Click "Create Event"
2. Title: "Parents Evening"
3. Date: Pick a date
4. Time: 19:00
5. End Time: 20:30
6. Description: "School update meeting"
7. Check "Action Required"
8. Action Detail: "Prepare questions"
9. Click "Create Event"
10. Verify event appears with all details when expanded

**Step 6: Test creator attribution**

1. Verify newly created event shows "Created by: [Your Name]"
2. If second user is available, create event as second user
3. Verify first user sees event with correct creator name

**Step 7: Test edit functionality**

1. On a manual event you created, click "Edit" button
2. Change title and description
3. Click "Update Event"
4. Verify event updates on calendar

**Step 8: Test delete functionality**

1. On a manual event you created, click "Delete" button
2. Confirm deletion in dialog
3. Verify event is removed from calendar

**Step 9: Test permission restrictions**

If two users available:
1. User 1 creates event
2. User 2 logs in and views calendar
3. Verify User 2 can see User 1's event but no Edit/Delete buttons
4. Verify User 1 can edit/delete their own events

**Step 10: Test realtime sync**

1. Open app in two browser tabs (same user or different users)
2. In Tab A: Create a new event
3. Verify event appears in Tab B immediately without refresh

**Step 11: Commit final test verification**

Run: `git log --oneline -5`
Expected: Shows commits from tasks 1-7

---

## Task 9: Code Review & Final Checks

**Files:**
- Review: All modified/created files for quality

**Step 1: Verify no console errors**

Open browser DevTools (F12) → Console tab
Run through all testing steps again
Expected: No errors, only info/debug logs

**Step 2: Check responsive design (mobile)**

1. Open browser DevTools → Device emulation
2. Select iPhone SE or similar (375px width)
3. Test: Create Event button visible
4. Test: EventModal fits on screen and scrolls if needed
5. Test: Form inputs work on mobile

Expected: All elements readable, form functional

**Step 3: Review database constraints**

Run in Supabase SQL:

```sql
-- Verify constraint enforces source_type rules
SELECT constraint_name, constraint_definition
FROM information_schema.table_constraints
WHERE table_name = 'events' AND constraint_name LIKE '%source%';
```

Expected: Shows events_source_constraint

**Step 4: Verify RLS policies protect data**

Attempt as unauthenticated user:
```sql
-- Should fail with permission denied
SELECT * FROM events WHERE source_type = 'manual' LIMIT 1;
```

Expected: Permission denied error

**Step 5: Check code formatting**

Run: `npm run build`
Expected: No warnings or errors

**Step 6: Final commit**

Run: `git log --oneline -10`
Review all commits look good

**Step 7: Create summary commit**

```bash
git commit --allow-empty -m "feat: manual event creation - complete implementation

- Database: Add created_by, source_type columns with RLS policies
- EventModal: New component for create/edit event forms
- CalendarView: 'Create Event' button + click-to-create on dates
- App: Wire event handlers and realtime subscriptions
- Styling: Add event creation UI styles
- Testing: Verified creation, editing, deletion, permissions, realtime sync"
```

---

## Rollout Checklist

Before deploying to production:

- [ ] Database migration applied to Supabase production
- [ ] All event handlers tested with both users
- [ ] Realtime subscriptions working (events sync across tabs/users)
- [ ] Edit/delete permissions enforced (only creator can modify)
- [ ] No console errors in DevTools
- [ ] Mobile responsive design verified
- [ ] RLS policies preventing unauthorized access
- [ ] Code review completed
