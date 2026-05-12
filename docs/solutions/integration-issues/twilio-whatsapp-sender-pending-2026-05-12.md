---
title: Twilio WhatsApp sender approval gates outbound sends
date: 2026-05-12
category: integration-issues
module: twilio
problem_type: external_approval_required
component: messaging
severity: medium
applies_when:
  - Setting up WhatsApp outbound from Twilio for the first time
  - Twilio API returns code 63007 ("could not find a Channel with the specified From address")
  - Edge Function secret value visible as the literal string "PENDING"
tags: [twilio, whatsapp, edge-function, secrets, sender-approval, sandbox]
---

# Twilio WhatsApp sender approval gates outbound sends

## Context

Charlie Tracker uses Twilio for both inbound WhatsApp (`whatsapp-webhook` Edge Function) and outbound reminders (`whatsapp-test-send` Edge Function + n8n workflows). Two non-obvious gates can block outbound sends even when the API credentials are correct.

## Gate 1 — Placeholder `TWILIO_PRIVATE_NUMBER` value

Supabase Edge Function secrets accept literally any string. During initial setup the secret was stored as the value `PENDING` while waiting for a real number. Twilio's API responds:

> "The 'From' number whatsapp:PENDING is not a valid phone number, shortcode, or alphanumeric sender ID." (code 21212)

Fix: replace the secret value in `Project Settings → Edge Functions → Secrets` with the real E.164 number (e.g. `+441156477587`). No redeploy needed — the next invocation picks up the new value.

## Gate 2 — Number exists in Twilio account but has no WhatsApp Channel

Even after the env var is correct, Twilio returns:

> "Twilio could not find a Channel with the specified From address." (code 63007)

This means the number is registered in your Twilio account but is not yet enabled for WhatsApp messaging. WhatsApp senders require:

1. Meta Business Manager verification of your business identity
2. Submission via Twilio Console → Messaging → Senders → WhatsApp Senders
3. Approval from Meta (days to weeks)
4. Approved message templates if you want to send proactive (non-session) messages

## Workaround — Twilio Sandbox

Use the shared sandbox sender `+14155238886` while waiting for production approval:

1. Twilio Console → Messaging → Try it out → Send a WhatsApp message — note your unique join keyword (e.g. `join purple-tiger`)
2. From the recipient's personal WhatsApp, send that exact message to `+14155238886`
3. Set `TWILIO_WHATSAPP_FROM=+14155238886` as an override on both the Supabase Edge Function secrets and the n8n env. The codepath in `whatsapp-test-send` and both n8n workflows reads `TWILIO_WHATSAPP_FROM` first, falling back to `TWILIO_PRIVATE_NUMBER`.
4. Once Twilio/Meta approves the production sender, delete `TWILIO_WHATSAPP_FROM` and update `TWILIO_PRIVATE_NUMBER`. No code or workflow changes required.

## Diagnostic pattern

When debugging Twilio integration, embed the env values in the error response (truncated or full depending on sensitivity). `whatsapp-test-send` follows this pattern — if env var reads as `"PENDING"` it returns a specific error referencing the secret name, saving a round trip.

## Related

- Edge Function: `supabase/functions/whatsapp-test-send/index.ts`
- n8n workflows: `docs/n8n-snapshots/whatsapp-event-reminders.json`, `whatsapp-weekly-digest.json`
- README with the full setup: `docs/n8n-snapshots/README-whatsapp-reminders.md`
