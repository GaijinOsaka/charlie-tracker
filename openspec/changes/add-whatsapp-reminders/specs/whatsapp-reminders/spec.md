## ADDED Requirements

### Requirement: User WhatsApp enrolment
The system SHALL allow each authenticated user to store a WhatsApp phone number, enable or disable reminder delivery, and opt in or out of the weekly digest, independently per user.

#### Scenario: User adds a phone number
- **WHEN** a user enters a valid E.164 phone number in the Settings WhatsApp card and saves
- **THEN** the system persists the number to that user's `profiles` row
- **AND** future reminder dispatches MAY target this number

#### Scenario: User disables reminders without losing their number
- **WHEN** a user toggles "Enable WhatsApp reminders" off
- **THEN** the system sets `profiles.whatsapp_enabled = false` and retains `whatsapp_phone`
- **AND** the dispatcher MUST NOT send event reminders or weekly digests to this user

#### Scenario: User toggles weekly digest independently
- **WHEN** a user toggles "Send weekly digest on Sunday evenings" without changing the master toggle
- **THEN** the system updates `profiles.whatsapp_weekly_digest` only
- **AND** event reminders continue to dispatch if the master toggle is on

### Requirement: User sends a test WhatsApp message
The system SHALL provide an in-app action that sends a test WhatsApp message to the user's stored number and reports the outcome inline.

#### Scenario: Test send succeeds
- **WHEN** a user with a stored phone number and `whatsapp_enabled = true` clicks "Send test message"
- **THEN** the system dispatches a Twilio WhatsApp message to that number
- **AND** the UI displays a success confirmation referencing the Twilio message SID

#### Scenario: Test send fails
- **WHEN** the Twilio send returns an error (e.g., invalid number, unverified sandbox)
- **THEN** the UI displays the Twilio error message inline
- **AND** the system MUST NOT persist any `event_reminders` or `weekly_digest_log` rows

#### Scenario: Test send without configuration
- **WHEN** a user clicks "Send test message" with no stored phone number
- **THEN** the action is disabled or the UI returns a validation message
- **AND** no Twilio request is made

### Requirement: Per-event reminder preference
The system SHALL allow an event to declare a reminder preference of `none`, `day_before`, `morning_of`, or `both`, defaulting to `none` on creation.

#### Scenario: New event defaults to no reminder
- **WHEN** an event is inserted without an explicit reminder value
- **THEN** the `events.reminder` column is set to `'none'`

#### Scenario: User changes reminder preference on an event
- **WHEN** a user selects "Morning of" in the event modal and saves
- **THEN** `events.reminder` becomes `'morning_of'`
- **AND** the event card displays a bell indicator
- **AND** the dispatcher schedules exactly one morning-of reminder for each enrolled user

#### Scenario: Setting "both" schedules two reminders
- **WHEN** an event has `reminder = 'both'`
- **THEN** the dispatcher considers it eligible for both day-before and morning-of sends per enrolled user

### Requirement: Day-before reminder dispatch
The system SHALL send a WhatsApp message at 20:00 Europe/London time on the day before an event's `event_date`, for each enrolled user, when the event's reminder preference includes `day_before`.

#### Scenario: Day-before reminder fires on time
- **WHEN** an event has `reminder IN ('day_before','both')`, is not archived, and the current time enters the 15-minute window containing 20:00 Europe/London on the day before `event_date`
- **AND** an enrolled user has `whatsapp_enabled = true` and a non-null `whatsapp_phone`
- **THEN** the system sends the day-before WhatsApp template to that user's number
- **AND** records a row in `event_reminders` with `kind = 'day_before'`, `status = 'sent'`, and the Twilio SID

#### Scenario: Daylight savings transition
- **WHEN** the day before an event spans a BST/GMT transition
- **THEN** the send is timestamped at 20:00 Europe/London local time, not 20:00 UTC

### Requirement: Morning-of reminder dispatch
The system SHALL send a WhatsApp message at 07:00 Europe/London time on the day of an event's `event_date`, for each enrolled user, when the event's reminder preference includes `morning_of`.

#### Scenario: Morning-of reminder fires on time
- **WHEN** an event has `reminder IN ('morning_of','both')`, is not archived, and the current time enters the 15-minute window containing 07:00 Europe/London on `event_date`
- **AND** an enrolled user has `whatsapp_enabled = true` and a non-null `whatsapp_phone`
- **THEN** the system sends the morning-of WhatsApp template to that user's number
- **AND** records a row in `event_reminders` with `kind = 'morning_of'`, `status = 'sent'`, and the Twilio SID

#### Scenario: All-day event has no time in the message
- **WHEN** an event has `event_time IS NULL` and a morning-of reminder fires
- **THEN** the message body MUST omit the time portion
- **AND** the message still references the event title

### Requirement: Reminder idempotency
The system SHALL guarantee that no `(event, user, kind)` combination results in more than one delivered WhatsApp reminder, even if the dispatcher runs concurrently or restarts mid-window.

#### Scenario: Concurrent dispatch attempts
- **WHEN** two dispatcher runs attempt to send the same `(event_id, user_id, kind)` reminder
- **THEN** the `UNIQUE (event_id, user_id, kind)` constraint on `event_reminders` rejects the second insert
- **AND** at most one Twilio send is observed by the user

#### Scenario: Workflow retry after partial failure
- **WHEN** a workflow run sends a Twilio message successfully but crashes before logging
- **THEN** a subsequent run MAY re-send the same reminder (acceptable trade-off — the alternative is missed reminders); operators SHOULD prefer at-most-once behaviour by inserting the ledger row first when feasible

### Requirement: Archived events do not trigger reminders
The system SHALL exclude archived events from all reminder dispatch logic.

#### Scenario: Event is archived before its send window
- **WHEN** an event has `archived = true` at the moment the dispatcher evaluates eligibility
- **THEN** no reminder is sent for that event in that run
- **AND** no `event_reminders` row is created

### Requirement: Weekly digest dispatch
The system SHALL send a single WhatsApp message at 18:00 Europe/London every Sunday to each user with `whatsapp_enabled = true`, `whatsapp_weekly_digest = true`, and a non-null `whatsapp_phone`, summarising unarchived events whose `event_date` falls in the coming Monday-Sunday range.

#### Scenario: Digest with upcoming events
- **WHEN** the Sunday 18:00 workflow runs and a user is enrolled with one or more events in the upcoming Monday-Sunday window
- **THEN** the system sends one WhatsApp message listing those events grouped by day
- **AND** records a row in `weekly_digest_log` with the upcoming Monday's date as `week_start_date`, `status = 'sent'`, and `event_count` set to the number of listed events

#### Scenario: Digest with no events is skipped
- **WHEN** the Sunday 18:00 workflow runs and a user has zero unarchived events in the upcoming Monday-Sunday window
- **THEN** the system MUST NOT send a WhatsApp message
- **AND** still records a `weekly_digest_log` row with `status = 'skipped'` and `event_count = 0`

#### Scenario: Digest idempotency
- **WHEN** the workflow runs more than once for the same `(user_id, week_start_date)`
- **THEN** the `UNIQUE (user_id, week_start_date)` constraint rejects duplicates and no second WhatsApp message is delivered

### Requirement: Failed sends are recorded, not retried
The system SHALL persist failed Twilio dispatches to the appropriate ledger and SHALL NOT automatically retry them.

#### Scenario: Twilio returns an error
- **WHEN** a Twilio dispatch attempt for an event reminder returns a non-success response
- **THEN** the system inserts an `event_reminders` row with `status = 'failed'` and the error message in the `error` column
- **AND** no further send attempts are made for that `(event_id, user_id, kind)`

#### Scenario: Digest send fails
- **WHEN** a Twilio dispatch attempt for a weekly digest returns a non-success response
- **THEN** the system inserts a `weekly_digest_log` row with `status = 'failed'` and the error message
- **AND** no further send attempts are made for that `(user_id, week_start_date)`

### Requirement: Phone numbers are private to their owner
The system SHALL ensure no user can read or modify another user's WhatsApp configuration.

#### Scenario: User reads their own profile
- **WHEN** an authenticated user queries `profiles` for their own row
- **THEN** they receive their `whatsapp_phone`, `whatsapp_enabled`, and `whatsapp_weekly_digest` values

#### Scenario: User cannot read another user's phone number
- **WHEN** an authenticated user queries `profiles` for a different user's row
- **THEN** RLS MUST exclude `whatsapp_phone` from the result, OR the row MUST NOT be returned at all

#### Scenario: User cannot update another user's settings
- **WHEN** an authenticated user attempts to update another user's `whatsapp_*` fields
- **THEN** RLS rejects the update
