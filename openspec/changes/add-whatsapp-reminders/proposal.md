## Why

Charlie Tracker centralises school events but offers no push-style nudges off-platform. Important events (transition evenings, sports day, deadlines) are easy to miss if a user does not open the app on the right day. WhatsApp is the household's default messaging channel, so sending reminders there reaches both parents where they already are, without requiring app foreground use.

## What Changes

- Add per-event reminder preference (`none` / `day_before` / `morning_of` / `both`), defaulting to `none` (explicit opt-in).
- Add per-user WhatsApp settings on `profiles`: phone number, master enable toggle, weekly digest toggle.
- Send WhatsApp messages via Twilio: `day_before` reminders at 20:00 UK time, `morning_of` reminders at 07:00 UK time, optional weekly digest at Sunday 18:00 UK time.
- Persist a per-(event, user, kind) dedup ledger so reminders never double-send, and a separate weekly-digest ledger keyed on the upcoming week.
- Expose a "Send test message" action in the Settings tab so users can validate their number end-to-end.
- Surface reminder state on event cards (bell icon when not `none`) and edit it from the existing event modal.
- Two scheduled n8n workflows handle dispatch: one polls every 15 min for event reminders, one runs Sundays 18:00 for the digest.

## Capabilities

### New Capabilities
- `whatsapp-reminders`: Per-event WhatsApp reminder delivery (day-before and/or morning-of), with per-user enrolment, idempotent dispatch, and a weekly Sunday digest of the upcoming week's events.

### Modified Capabilities
<!-- None. No existing specs in openspec/specs/. -->

## Impact

- **Database**: New columns on `events` and `profiles`; new tables `event_reminders` and `weekly_digest_log`; RLS policies for both new tables.
- **Frontend (React)**: Settings tab gains a "WhatsApp Reminders" card (phone, toggles, test button); event create/edit modal gains a reminder dropdown; event cards render a bell indicator.
- **Edge Functions (Supabase)**: New `whatsapp-test-send` function for the Settings "Send test" button.
- **n8n (self-hosted)**: Two new scheduled workflows on the existing droplet, calling Supabase and Twilio over HTTPS.
- **External services**: Twilio WhatsApp sender + three approved templates (`event_reminder_day_before`, `event_reminder_morning_of`, `weekly_digest`).
- **Environment variables**: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `TWILIO_TEMPLATE_*` in n8n; same in the Edge Function secrets.
- **Cost**: Twilio WhatsApp messaging fees (~$0.005-0.01 per message); negligible at expected household volume.
- **Privacy**: Phone numbers stored in Supabase under existing RLS; not exposed to other users.
