# WhatsApp Query Bot Design

**Date:** 2026-04-10
**Status:** Validated Design
**Scope:** Dual WhatsApp interface (public + private) for Charlie Tracker

## Overview

Two-tier WhatsApp system allowing parents to query shareable content (newsletters, spelling tests, homework) while providing you and your mum full Charlie Tracker access via a separate private number.

## Architecture

**Components:**

- **Public WhatsApp Number** — Parents query shareable content only (anonymized interactions)
- **Private WhatsApp Number** — You & mum have full Charlie Tracker access (identified)
- **Edge Function (`whatsapp-webhook`)** — Routes messages, filters content by access level, generates responses via RAG
- **Twilio** — Handles WhatsApp messaging ($0.004-0.005/message)
- **Supabase tables** — Content marking, user access, interaction logs

**Message flow:**

1. Parent/user messages WhatsApp number
2. Twilio webhooks to Edge Function
3. Function identifies public vs private number
4. Function checks phone against `whatsapp_users` table (for private number)
5. Function calls existing `rag-chat` with filtered content based on access level
6. Response returned via Twilio
7. Interaction logged (anonymized for public, identified for private)

## Data Model

### `shareable_content`

- `id` (UUID, PK)
- `content_type` ('document' | 'event' | 'note')
- `content_id` (reference to documents/events/notes)
- `is_shareable` (boolean)
- `description` (optional, what parents should know)
- `created_at`, `updated_at`

### `whatsapp_users`

- `id` (UUID, PK)
- `phone_number_hash` (SHA-256)
- `role` ('parent' | 'admin') — 'admin' for you/mum only
- `is_active` (boolean)
- `created_at`

### `whatsapp_interactions`

- `id` (UUID, PK)
- `phone_number_hash` (SHA-256, always)
- `access_level` ('public' | 'private')
- `query_text` (what they asked)
- `response_text` (bot response)
- `created_at`
- Retention: Auto-delete after 90 days for public queries

## Admin Panel (`Settings → WhatsApp Sharing`)

**Sections:**

1. **Public Number Management**
   - Display public number + QR code
   - Toggle: active/inactive
   - Recent anonymous query log

2. **Shareable Content Manager**
   - Browse Charlie Tracker documents/events
   - Checkbox to mark as shareable
   - Optional description per item

3. **Private Number Management**
   - Display private number
   - List allocated users (you, mum)
   - Toggle each user on/off

4. **Audit Log**
   - Anonymous for public (date, query type, response)
   - Identified for private (user, full query/response)
   - Filterable by date range

## Role-Based Content Filtering

**Public Users (Parents):**

- RAG searches only `shareable_content=true` documents
- Cannot access private notes, messages, personal data
- Interactions logged anonymously (phone hash only)
- No user identification

**Private Users (You & Mum):**

- Full Charlie Tracker access via RAG
- Can query all documents, messages, events
- Phone number identified (with consent)
- Interactions logged with identification for audit

## Implementation Components

### Edge Function: `whatsapp-webhook`

- Receive Twilio message
- Parse phone number (public or private)
- If private: check against `whatsapp_users` table
- Call `rag-chat` with appropriate content filter
- Log interaction
- Return response to Twilio
- Error handling: timeouts, invalid queries, rate limiting (~5 queries/min per user)

### React Admin UI (Settings)

- New "WhatsApp Sharing" tab in Settings panel
- Integrate shareable toggles into Document Browser
- Simple log viewer
- Role/user management interface

### Database Schema

- 3 new tables (shareable_content, whatsapp_users, whatsapp_interactions)
- Foreign keys to existing documents table
- RLS policies to ensure private content never leaks

### Twilio Setup

- Two WhatsApp Business Account numbers
- Both route to same Edge Function webhook
- Function routes based on `to` phone number

## Cost Estimate

- **Twilio:** $1/month per number + $0.004/message
  - 10-20 parents × 2 queries/week = ~40 messages/week = ~$0.16/week = ~$0.64/month
  - Your queries (variable) = ~$0.05-0.20/month
  - **Total: ~$3-4/month**
- **Supabase:** Negligible (3 new tables, same DB)
- **Edge Function:** Reuses existing `rag-chat`, minimal overhead

## Risks & Mitigations

| Risk                                     | Mitigation                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------- |
| Accidentally sharing private data        | Two separate numbers + strict RLS policies + content filter layer           |
| Phone number privacy                     | Always hash phone numbers; no plain numbers in logs                         |
| High message volume                      | Rate limiting per user (5 queries/min)                                      |
| Bot responses leaking non-shareable data | RAG query filtered at Edge Function layer; RLS on `shareable_content` table |
| Parent confusion                         | Clear bot name/greeting for public number                                   |

## Success Criteria

- ✓ Parents can query shareable content conversationally
- ✓ You/mum can query full Charlie Tracker via WhatsApp
- ✓ No PII/private data leaked to parents
- ✓ All interactions logged for audit
- ✓ Cost stays under $5/month
- ✓ Bot responds within 5 seconds
