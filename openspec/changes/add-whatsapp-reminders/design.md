## Context

Charlie Tracker is a React + Supabase PWA shared by up to two household users. Events are derived from ingested messages (Gmail via n8n) and documents, surfaced in the dashboard's calendar view. Today there is no off-platform notification path — if a user does not open the PWA on the relevant day, they can miss an event.

Existing infrastructure already supports the building blocks: an n8n droplet runs scheduled workflows (Gmail Monitor, Arbor scraper), Supabase Auth identifies users, the `profiles` table holds per-user state, and the `events` table holds the data we need to remind on. The user already has a Twilio account.

## Goals / Non-Goals

**Goals:**
- Deliver opt-in event reminders to each user's WhatsApp at predictable times (08:00pm the day before, 07:00am the day of).
- Provide an optional weekly digest of the upcoming week's events, delivered Sunday evening.
- Guarantee no double-sends across retries, workflow re-runs, or n8n restarts.
- Keep dispatch logic on existing infrastructure (n8n + Supabase) rather than adding new services.
- Let users self-validate their phone number from the Settings tab without waiting for a real event.

**Non-Goals:**
- Two-way WhatsApp interaction (replying, marking actioned, etc.).
- Reminders to non-app users (grandparents, school staff). Recipients are limited to enrolled `profiles`.
- Per-user reminder time customisation (07:00 / 20:00 are fixed for v1).
- SMS, email, or push-notification fallback when WhatsApp delivery fails.
- Catch-up sends for reminders missed during an outage (a missed window is a missed window).

## Decisions

### 1. Twilio WhatsApp API (vs Meta Cloud API, vs self-hosted whatsapp-web.js)
**Chosen**: Twilio. The user already has an account, setup is faster than Meta direct, and the cost (~$0.01/msg) is trivial at household volume. Self-hosting against WhatsApp's ToS risks the personal number being banned. Meta Cloud API would be ~free but adds setup friction with no real benefit at this scale.

### 2. Single TEXT column for per-event reminder preference (vs two booleans, vs enum type)
**Chosen**: `events.reminder TEXT CHECK (reminder IN ('none','day_before','morning_of','both'))`. Maps 1:1 to the UI dropdown, easy to read, no Postgres enum migration cost.

### 3. Separate dedup ledger tables (vs JSONB on events)
**Chosen**: `event_reminders` and `weekly_digest_log` as standalone tables with `UNIQUE` constraints. Reminders fan out to multiple users, so we need per-user dedup, not per-event. A unique-violation on insert is a clean idempotency primitive — n8n retries become safe by construction. JSONB on events would require read-modify-write with race risk.

### 3a. Separate `user_whatsapp_settings` table (vs columns on `profiles`)
**Chosen**: New table `user_whatsapp_settings(user_id PK, whatsapp_phone, whatsapp_enabled, whatsapp_weekly_digest, ...)` with SELECT/UPDATE/INSERT policies restricted to `auth.uid() = user_id`. The existing `profiles` table has a SELECT policy allowing all authenticated users to read all rows (used by `App.jsx` to resolve display names for `actioned_by`, `created_by`, etc.). Postgres RLS is row-level only, so adding phone numbers to `profiles` would either expose them cross-user or require a view layer. A separate table is the simplest way to honour the privacy requirement without breaking display-name resolution across the app.

### 4. n8n scheduled workflows (vs pg_cron + Edge Function)
**Chosen**: n8n. Existing infrastructure, visual debugging of runs, easy reuse of HTTP nodes for Twilio. pg_cron + Edge Function would be marginally cheaper but harder to inspect when something goes wrong. Trade-off accepted: if the n8n droplet is down at 07:00, that morning's reminders are lost (no catch-up — see Non-Goals).

### 5. Send-time computation in n8n Code node, not SQL
**Chosen**: Code node using `DateTime.fromISO(...).setZone('Europe/London')` to derive the absolute send timestamp from `event_date` + `event_time` + reminder kind. Keeps the migration minimal (no Postgres timezone gymnastics) and the BST/GMT transitions handled by Luxon's tz database. SQL filters only on date windows; the precise time filter happens in n8n.

### 6. 15-minute polling window
**Chosen**: Workflow A runs every 15 min, queries for reminders scheduled in `[now, now+15min)`. Coarse enough to be cheap, fine enough that users perceive "on time" delivery. Workflow B runs once on the Sunday 18:00 cron.

### 7. All-day events (no `event_time`)
**Chosen**: Send `morning_of` at 07:00 regardless; format the message without a time ("Today: Sports Day"). Send `day_before` at 20:00 the previous day. Treats absent time as "all day", which matches user expectation.

### 8. Failed sends are logged but not retried
**Chosen**: A row in `event_reminders` with `status='failed'` is the terminal state. Retry on Twilio bounce is unhelpful (the number is wrong), and retry on transient network is rarely worth the complexity at this volume. If a user reports a miss, the failure is visible in the ledger.

## Risks / Trade-offs

- **n8n droplet downtime during a send window** → Missed reminders are not recovered. Mitigation: n8n droplet uptime monitoring (out of scope here); accept the trade-off.
- **Twilio template approval delay (~24h)** → Cannot ship proactive sends until templates are live. Mitigation: develop and test against Twilio Sandbox (no template requirement); switch to approved templates once they land.
- **Event edited between reminder schedule and send** → Title/time in the message may be stale by up to 15 min. Acceptable; we do not chase mid-window edits.
- **Event archived after reminder sent** → No callback to "un-send" the WhatsApp. Acceptable; the user can simply ignore the message.
- **Phone number typo** → First send fails noisily in the ledger; the "Send test message" button in Settings is the prevention surface.
- **Weekly digest race with manual deactivation** → If a user disables `whatsapp_weekly_digest` on Sunday at 18:00 mid-workflow, they may receive one last digest. Acceptable.
- **Twilio cost overrun** → Caps naturally at ~4 messages/user/day. Negligible at planned volume. No budget alert configured.
- **Reminder dedup across user removal** → `event_reminders.user_id` references `auth.users` with `ON DELETE CASCADE`. If a user is removed, their reminder history goes with them; a re-invited user starts clean. Acceptable.

## Migration Plan

Rollout follows the order in `tasks.md`. Each step is independently verifiable:

1. Database migration (columns + tables + RLS). Safe; backfill not required since `reminder` defaults to `'none'`.
2. Settings UI + `whatsapp-test-send` Edge Function. Useful on its own — users can store numbers and confirm Twilio works.
3. Event modal reminder dropdown + bell icon. Captures intent without yet sending.
4. n8n Workflow A (event reminders). First real send path goes live.
5. n8n Workflow B (weekly digest). Second send path goes live.

**Rollback**: Disable the n8n workflow (Workflow A or B) to halt sends. Database additions are non-breaking (new columns nullable / defaulted, new tables additive). Reverting the migration is straightforward if needed — no destructive changes.

## Open Questions

- Should `whatsapp_phone` be validated against E.164 at the DB level (CHECK constraint with regex) or only client-side? Currently client-side; revisit if invalid numbers reach the workflow.
- Should the weekly digest cover Monday-Sunday or the literal "next 7 days"? Currently Monday-Sunday; revisit if user feedback says otherwise.
