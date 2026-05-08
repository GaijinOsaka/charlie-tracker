## Why

Both parents need a lightweight shared scratchpad for school-related information that doesn't arrive via email or Arbor — things like verbal reminders from teachers, PE kit days, consent decisions, or ad-hoc reminders. The existing system only surfaces content ingested from Gmail or Arbor; there is no way to capture information from other sources, or to share a quick note between the two parents without creating a dummy message.

## What Changes

- A new **Notes** tab is added to the main nav (between Actions and Settings)
- Either authenticated user can create, edit, and delete their own notes
- All notes are visible to both parents in real time via Supabase Realtime
- Each note has an optional **"Add to Calendar"** action that promotes the note into the events table, seeding the event title and description from the note content
- When promoted, the note is linked to the event so the promotion can be traced back

## Capabilities

### New Capabilities

- `shared-notes`: Core CRUD for the notes table — create, read, update, delete notes; real-time sync between both parents
- `promote-note-to-event`: The flow that converts a note into a calendar event, including the date/time picker modal and the link written back to the note

### Modified Capabilities

(none — the events table gains a nullable `note_id` FK but the existing event creation flow is unchanged)

## Impact

- **New DB table**: `notes` (id, title, body, author_id, event_id nullable, created_at, updated_at) with RLS
- **Schema migration**: `events` gains a nullable `note_id UUID REFERENCES notes(id)` column
- **New component**: `NotesTab.jsx` rendered when `activeTab === "notes"`
- **New component**: `NoteModal.jsx` (create / edit form)
- **Reused component**: `EventModal.jsx` is opened by the promote flow to let the user set date/time before saving
- **App.jsx**: one new tab button, one new `activeTab` branch, notes state + Realtime subscription
- **No new Edge Functions or n8n workflows required**
