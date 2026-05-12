## 1. Database migration

- [x] 1.1 Create migration `supabase/migrations/<timestamp>_whatsapp_reminders.sql`
- [x] 1.2 Add `reminder TEXT NOT NULL DEFAULT 'none' CHECK (reminder IN ('none','day_before','morning_of','both'))` to `events`
- [x] 1.3 Create `user_whatsapp_settings` table (user_id PK references auth.users CASCADE, whatsapp_phone TEXT, whatsapp_enabled BOOLEAN DEFAULT TRUE, whatsapp_weekly_digest BOOLEAN DEFAULT FALSE, created_at, updated_at)
- [x] 1.4 Create `event_reminders` table (id, event_id FK CASCADE, user_id FK auth.users CASCADE, kind, sent_at, twilio_sid, status, error) with `UNIQUE (event_id, user_id, kind)`
- [x] 1.5 Create `weekly_digest_log` table (id, user_id FK auth.users CASCADE, week_start_date, sent_at, twilio_sid, status, error, event_count) with `UNIQUE (user_id, week_start_date)`
- [x] 1.6 Enable RLS on `event_reminders` and `weekly_digest_log` — authenticated read, no client writes
- [x] 1.7 RLS on `user_whatsapp_settings`: SELECT/INSERT/UPDATE/DELETE all restricted to `auth.uid() = user_id`
- [x] 1.8 Apply migration to the dev project and verify with `\d events`, `\d user_whatsapp_settings`, `\d event_reminders`, `\d weekly_digest_log`

## 2. Settings UI + test send

- [x] 2.1 In `src/components/SettingsPanel.jsx` Settings tab, add a "WhatsApp Reminders" card
- [x] 2.2 Phone number input with client-side E.164 validation hint (`+447700900000`)
- [x] 2.3 "Enable WhatsApp reminders" toggle bound to `user_whatsapp_settings.whatsapp_enabled`
- [x] 2.4 "Send weekly digest on Sunday evenings" toggle bound to `user_whatsapp_settings.whatsapp_weekly_digest`
- [x] 2.5 Save handler upserts the three fields to the user's `user_whatsapp_settings` row
- [x] 2.6 Create `supabase/functions/whatsapp-test-send/index.ts` Edge Function — reads caller's settings, calls Twilio, returns SID or error
- [x] 2.7 Set Edge Function secrets: reuses existing `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PRIVATE_NUMBER` (already configured for `whatsapp-webhook`)
- [x] 2.8 Settings card "Send test message" button invokes the function and displays inline success/error
- [ ] 2.9 Edge Function deployed (version 1, ACTIVE). Manual verification pending: store own number, click test, confirm receipt on phone

## 3. Event reminder UI

- [x] 3.1 In the event create/edit modal (EventModal.jsx), added a "WhatsApp reminder" select with values `None`, `Day before (8pm)`, `Morning of (7am)`, `Both`
- [x] 3.2 Wired the select to `events.reminder` via createManualEvent/updateManualEvent, default `'none'` on new events
- [x] 3.3 On event cards in the calendar view, render a 🔔 emoji when `reminder !== 'none'` (`.event-reminder-bell` CSS class)
- [x] 3.4 Tooltip on the bell summarising which reminders are set
- [ ] 3.5 Manual verification: set reminder on an event, reload, confirm value persists and bell renders

## 4. Twilio templates

- [ ] 4.1 In Twilio console, create and submit three templates: `event_reminder_day_before` ("Reminder: {{1}} tomorrow at {{2}}. {{3}}"), `event_reminder_morning_of` ("Today: {{1}} at {{2}}. {{3}}"), `weekly_digest` ("This week's events:\n{{1}}")
- [ ] 4.2 Record approved template SIDs
- [ ] 4.3 During development, point n8n at the Twilio Sandbox sender; switch to approved templates once they land

## 5. n8n Workflow A — Event reminders

- [ ] 5.1 Set n8n env vars per `docs/n8n-snapshots/README-whatsapp-reminders.md` (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY already needed; Twilio vars reused from existing setup; new `WHATSAPP_REMINDERS_DRY_RUN`)
- [x] 5.2 Create workflow "WhatsApp Event Reminders" — JSON at `docs/n8n-snapshots/whatsapp-event-reminders.json` (Schedule Trigger every 15 min, Europe/London)
- [x] 5.3 Candidate query — implemented as Postgres RPC `get_due_event_reminders(window_start, window_end)`; n8n calls it via HTTP. Joins events × user_whatsapp_settings, filters archived/disabled, excludes already-logged
- [x] 5.4 Send-time scheduling — Postgres computes `(event_date - 1 day) + 20:00` and `event_date + 07:00` AT TIME ZONE 'Europe/London'; n8n passes [now, now+15min) window
- [x] 5.5 Message body — `Build Message` Code node constructs day-before / morning-of body with title, time, description
- [x] 5.6 HTTP Request to Twilio — `Send via Twilio` node uses Basic Auth; freeform `Body` (swap to ContentSid once templates approved)
- [x] 5.7 Insert `event_reminders` — `Log Reminder` HTTP node POSTs to Supabase; UNIQUE constraint is dedup backstop
- [ ] 5.8 Verification — manual trigger smoke test (see README). Requires Twilio sender activation.
- [ ] 5.9 Activate the workflow after smoke test

## 6. n8n Workflow B — Weekly digest

- [ ] 6.1 Add n8n env var `TWILIO_TEMPLATE_WEEKLY` (deferred until proactive sending requires templates; freeform `Body` works in sandbox/session)
- [x] 6.2 Create workflow "WhatsApp Weekly Digest" — JSON at `docs/n8n-snapshots/whatsapp-weekly-digest.json` (cron `0 18 * * 0`, Europe/London timezone)
- [x] 6.3 Enrolled-profile + event query — Postgres RPC `get_due_weekly_digest(week_start)`
- [x] 6.4 Per-profile event window — RPC LEFT JOIN selects events in [week_start, week_start + 7 days)
- [x] 6.5 Skip if already-logged — `NOT EXISTS` against weekly_digest_log in RPC; UNIQUE constraint backstop
- [x] 6.6 `Build Digests` Code node — groups events by day with weekday/date headers
- [x] 6.7 event_count > 0 path — `Send Digest` Twilio call → `Shape Log (Live)` → `Log Digest` (status='sent')
- [x] 6.8 event_count == 0 path — `Shape Log (Skipped)` → `Log Digest` (status='skipped', event_count=0)
- [ ] 6.9 Verification — manual smoke test per README. Requires Twilio sender activation.
- [ ] 6.10 Activate the workflow after smoke test

## 7. Documentation and rollout

- [x] 7.1 Update `CLAUDE.md` with the two new workflows, their schedules, and where to find them
- [x] 7.2 Add a `docs/solutions/` entry capturing the Twilio sender approval gates and Sandbox-to-production switchover
- [x] 7.3 Snapshot both workflows to `docs/n8n-snapshots/` + README with import/env/test instructions
- [ ] 7.4 Verify end-to-end with a real event over a full day cycle (day-before send at 20:00, morning-of send at 07:00, ledger correct, no duplicates)
