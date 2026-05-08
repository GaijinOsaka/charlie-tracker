## ADDED Requirements

### Requirement: Notes tab is visible to all authenticated users
The app SHALL display a "Notes" tab in the main navigation. The tab SHALL be accessible from any authenticated session.

#### Scenario: Notes tab appears in nav
- **WHEN** a user is authenticated
- **THEN** a "Notes" tab is visible in the main nav alongside Messages, Events, Calendar, Documents, Actions, Settings

---

### Requirement: Any parent can create a note
The system SHALL allow any authenticated user to create a note with a title and optional body text. The note SHALL be stored with the author's user ID and a creation timestamp.

#### Scenario: Create a note with title and body
- **WHEN** user taps the add button and submits a title and body
- **THEN** a new note row is inserted in the `notes` table with `author_id = auth.uid()`
- **AND** the note appears at the top of the notes list immediately

#### Scenario: Create a note with title only
- **WHEN** user submits a note with a title but leaves the body empty
- **THEN** the note is saved with `body = null` and displays normally

#### Scenario: Attempt to create a note with no title
- **WHEN** user attempts to submit with an empty title field
- **THEN** the form SHALL prevent submission and show a validation message

---

### Requirement: Notes list is visible to both parents in real time
The system SHALL display all notes (from both parents) in the Notes tab, ordered newest-first. Changes made by either parent SHALL appear in the other's view within 2 seconds without a page refresh.

#### Scenario: Other parent adds a note
- **WHEN** the second parent creates a note on their device
- **THEN** the note appears in the first parent's Notes tab via Supabase Realtime without reload

#### Scenario: Author label is shown
- **WHEN** a note is displayed
- **THEN** the author's display name (from `profiles`) is shown alongside the creation timestamp

---

### Requirement: Any parent can edit any note
The system SHALL allow any authenticated user to edit the title or body of any note, regardless of who created it.

#### Scenario: Edit a note inline
- **WHEN** user taps "Edit" on a note
- **THEN** the note form opens pre-filled with the current title and body
- **AND** saving updates the row and reflects the change in real time for both parents

---

### Requirement: Any parent can delete any note
The system SHALL allow any authenticated user to delete any note. If the note has been promoted to an event, the event SHALL NOT be deleted — only the `event_id` link on the note is cleared.

#### Scenario: Delete a note with no linked event
- **WHEN** user confirms deletion of a note that has no linked event
- **THEN** the note row is deleted and removed from the list immediately

#### Scenario: Delete a note that was promoted to an event
- **WHEN** user deletes a note that has an `event_id`
- **THEN** the note row is deleted
- **AND** the linked event in the events table is NOT deleted

---

### Requirement: Notes persist across sessions
Notes SHALL be loaded from the database on every session start and SHALL survive app restarts, background/foreground cycles, and page reloads.

#### Scenario: Notes load on app open
- **WHEN** an authenticated user opens the Notes tab
- **THEN** all existing notes are fetched and displayed, newest first
