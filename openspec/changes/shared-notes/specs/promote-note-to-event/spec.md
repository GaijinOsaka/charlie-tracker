## ADDED Requirements

### Requirement: A note can be promoted to a calendar event
The system SHALL provide an "Add to Calendar" action on each note. Triggering it SHALL open the event creation modal pre-filled with the note's title (as event title) and body (as event description). On save the event is inserted and the note's `event_id` is updated to link to the new event.

#### Scenario: Promote a note to an event
- **WHEN** user taps "Add to Calendar" on a note
- **THEN** the EventModal opens with `title` pre-filled from `note.title` and `description` pre-filled from `note.body`
- **AND** user can adjust date, time, and other event fields before saving

#### Scenario: Event is saved and note is linked
- **WHEN** user confirms the event in the modal
- **THEN** a new row is inserted into the `events` table with `source_type = 'manual'`
- **AND** `notes.event_id` is updated to reference the new event's id
- **AND** the note card shows a "In Calendar" badge

#### Scenario: User cancels the promotion
- **WHEN** user opens the promote modal and then cancels
- **THEN** no event is created and `notes.event_id` remains unchanged

---

### Requirement: A note that has been promoted shows its calendar link
The system SHALL display a visible indicator on any note whose `event_id` is set. The indicator SHALL navigate to the Calendar tab when tapped.

#### Scenario: Promoted note shows badge
- **WHEN** a note has a non-null `event_id`
- **THEN** the note card displays an "In Calendar" badge
- **AND** the "Add to Calendar" action is hidden (already promoted)

#### Scenario: Tapping the badge navigates to calendar
- **WHEN** user taps the "In Calendar" badge on a promoted note
- **THEN** the app switches to the Calendar tab

---

### Requirement: A note cannot be promoted more than once
The system SHALL prevent a note that already has a linked event from being promoted again. The "Add to Calendar" action SHALL be hidden once `event_id` is set.

#### Scenario: Add to Calendar is hidden after promotion
- **WHEN** a note's `event_id` is not null
- **THEN** the "Add to Calendar" button is not rendered for that note

---

### Requirement: Deleting the linked event does not break the note
If the event linked to a note is deleted, the system SHALL set `notes.event_id` to null automatically (via ON DELETE SET NULL). The note SHALL remain and the "In Calendar" badge SHALL disappear.

#### Scenario: Event deleted externally
- **WHEN** a linked event is deleted from the Events or Calendar tab
- **THEN** the note's `event_id` becomes null (database FK cascade)
- **AND** the note card no longer shows the "In Calendar" badge on next render
