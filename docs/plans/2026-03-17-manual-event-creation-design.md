# Manual Event Creation Feature Design

**Date:** 2026-03-17
**Objective:** Allow both you and Charlie's mum to manually create diary events (in addition to auto-extracted events from messages/documents)

## Requirements

### Functional
- Create manual events with: title (required), date (required), time/end time (optional), description, tags/categories
- Both users can see all manually created events
- Events show creator attribution
- Only the creator can edit or delete their own events
- UI: "Create Event" button + click empty calendar date to create

### Data Model
- Distinguish manual events from extracted events
- Track event creator via `created_by` user ID
- Preserve existing extracted event functionality

## Database Changes

### Migration: `2026-03-XX-manual-events.sql`

**Add columns to events table:**
```sql
ALTER TABLE events
  ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  ADD COLUMN source_type TEXT DEFAULT 'extracted';

CREATE INDEX idx_events_created_by ON events(created_by);
```

**Update constraint logic:**
- For `extracted` events: must have `message_id` OR `document_id`
- For `manual` events: both sources must be NULL
- Use trigger or check constraint to enforce

**Update RLS policies:**
```sql
-- Allow users to insert their own manual events
CREATE POLICY "Users can create manual events"
  ON events FOR INSERT
  WITH CHECK (auth.uid() = created_by AND source_type = 'manual');

-- Allow users to update their own events
CREATE POLICY "Users can update own events"
  ON events FOR UPDATE
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Allow users to delete their own events
CREATE POLICY "Users can delete own events"
  ON events FOR DELETE
  USING (auth.uid() = created_by);
```

## Frontend Changes

### New Component: `EventModal.jsx`
- Form fields: title, date, time, end_time, description, tags, action_required, action_detail
- Validation: title + date required
- Submit handler: calls `createEvent()` or `updateEvent()`
- Edit mode: pre-fills form data, show delete button

### Modify `CalendarView.jsx`
- Add "Create Event" button near month navigation
- Add click handler on date cells (only empty dates)
- Pass `onCreateEvent`, `onEditEvent`, `onDeleteEvent` callbacks to parent
- Show creator name on event cards
- Show edit/delete buttons for creator only

### Modify `App.jsx`
- Import EventModal
- Add state: `showEventModal`, `editingEvent`, `selectedDateForEvent`
- Implement `createEvent(eventData)` — calls Supabase
- Implement `updateEvent(eventId, eventData)` — creator only
- Implement `deleteEvent(eventId)` — creator only
- Subscribe to events realtime updates (already exists, handles manual events too)
- Pass callbacks to CalendarView

### Supabase Helper Functions (`src/lib/supabase.js`)
```javascript
export async function createManualEvent(eventData) {
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
      created_by: supabase.auth.user().id,
      source_type: 'manual'
    }])
    .select()
  return { data, error }
}

export async function updateManualEvent(eventId, eventData) {
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
  return { data, error }
}

export async function deleteManualEvent(eventId) {
  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)
  return { error }
}
```

## Data Flow

1. User clicks "Create Event" button or empty date cell
2. EventModal opens (date pre-filled if clicked from calendar)
3. User fills form and submits
4. `createEvent()` calls Supabase with `created_by: currentUser.id`, `source_type: 'manual'`
5. Realtime subscription triggers `INSERT` event
6. Events list updates in App state
7. CalendarView re-renders with new event

For edits: same flow but uses `updateEvent()`
For deletes: `deleteEvent()` removes the event

## UI Layout

**Event card (manual events):**
```
[Title]
[Date] [Time–EndTime]
[Description]
Created by: [Creator Name]
[Tags/Action badges]
[Edit] [Delete] buttons (if creator)
```

**Event creation modal:**
```
Title: [________]
Date: [________] (required)
Time: [______] End: [______]
Description: [text area]
Tags: [multi-select dropdown]
☐ Action Required [detail field]

[Create] [Cancel]
```

## Success Criteria
- ✓ Can create manual events from "Create Event" button
- ✓ Can create events by clicking empty dates
- ✓ Both users see all manual events in calendar
- ✓ Events show creator attribution
- ✓ Only creator can edit/delete their events
- ✓ No regression to existing extracted event functionality
- ✓ Realtime sync works (both users see new events immediately)
