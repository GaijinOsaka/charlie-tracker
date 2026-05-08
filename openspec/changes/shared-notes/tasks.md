## 1. Database

- [x] 1.1 Write migration SQL: create `notes` table (id, title, body, author_id, event_id nullable FK → events, created_at, updated_at)
- [x] 1.2 Write migration SQL: add nullable `note_id` column to `events` table with `ON DELETE SET NULL`
- [x] 1.3 Add RLS policies to `notes`: authenticated read-all, authenticated insert (author_id = auth.uid()), authenticated update-all, authenticated delete-all
- [x] 1.4 Apply migration in Supabase dashboard and verify table structure
- [x] 1.5 Add `notes` to `schema.sql` for documentation

## 2. Data Loading & Realtime

- [x] 2.1 Add `notes` state and `notesLoading` state to App.jsx
- [x] 2.2 Implement `loadNotes()` function (select id, title, body, author_id, event_id, created_at, updated_at ordered by created_at desc)
- [x] 2.3 Call `loadNotes()` in the existing `useEffect` that calls `loadMessages()` on user available
- [x] 2.4 Add Realtime INSERT/UPDATE/DELETE handlers for `public:notes` to the existing subscription effect

## 3. NoteModal Component

- [x] 3.1 Create `src/components/NoteModal.jsx` with title (required) and body (optional textarea) fields
- [x] 3.2 Wire up form validation — prevent submit if title is empty
- [x] 3.3 Accept `note` prop (null = create mode, object = edit mode) and pre-fill fields in edit mode
- [x] 3.4 On submit call `supabase.from("notes").insert(...)` or `.update(...)` depending on mode
- [x] 3.5 Call `onSave` callback on success, `onCancel` on dismiss

## 4. NotesTab Component

- [x] 4.1 Create `src/components/NotesTab.jsx` accepting `notes`, `notesLoading`, `profiles`, `onEdit`, `onDelete`, `onPromote`, `onAdd` props
- [x] 4.2 Render an "Add Note" button at the top of the tab
- [x] 4.3 Render notes list newest-first; each card shows title, body (truncated), author display name, timestamp
- [x] 4.4 Show skeleton loading state while `notesLoading` is true
- [x] 4.5 Show "No notes yet" empty state when list is empty
- [x] 4.6 Each note card has Edit and Delete action buttons
- [x] 4.7 Each note card without an `event_id` shows an "Add to Calendar" button
- [x] 4.8 Each note card with a non-null `event_id` shows an "In Calendar" badge; clicking it calls `onNavigateToCalendar`

## 5. Promote-to-Event Flow

- [x] 5.1 Add `handlePromoteNote(note)` function to App.jsx that opens EventModal pre-filled with `note.title` and `note.body`
- [x] 5.2 Pass a `noteId` param through the EventModal create flow so the saved event's id can be written back
- [x] 5.3 On EventModal save: insert the event, then update `notes.event_id = newEvent.id`
- [x] 5.4 Update local notes state to reflect the new `event_id` without a full reload

## 6. App.jsx Wiring

- [x] 6.1 Add "Notes" tab button to the nav (between Actions and Settings)
- [x] 6.2 Add `activeTab === "notes"` render branch that mounts `<NotesTab />`
- [x] 6.3 Pass `onNavigateToCalendar` prop that calls `setActiveTab("calendar")`
- [x] 6.4 Wire up `handleAddNote`, `handleEditNote`, `handleDeleteNote`, `handlePromoteNote` handlers
- [x] 6.5 Confirm mobile nav layout still works at 375px with 7 tabs

## 7. Styling

- [x] 7.1 Add note card styles to App.css using existing CSS variables (no new colours)
- [x] 7.2 Add "In Calendar" badge style consistent with existing `source-badge` classes
- [x] 7.3 Verify NoteModal styles are consistent with ActionModal
