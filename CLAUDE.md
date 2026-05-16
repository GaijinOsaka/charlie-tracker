# Charlie Tracker

School communication tracker — a React + Supabase PWA that centralises messages, events, documents, and calendar into a single dashboard.

## Tech Stack

- **Frontend:** React 18, Vite 4, plain CSS with CSS variables (dark blue theme)
- **Backend:** Supabase (PostgreSQL, Auth on JWT Signing Keys, Realtime, Storage, Edge Functions in Deno/TS)
- **Infrastructure:** DigitalOcean (private VPC networking)
  - **n8n:** Self-hosted on 1GB Droplet (144.126.200.83) — Gmail ingestion, Arbor scraping, RAG indexing, WhatsApp reminders
  - **Skyvern + Docling:** Self-hosted on 4GB Droplet (139.59.165.79) — Skyvern (headless Chromium for Arbor portal) and Docling (document extraction), Docker Compose with PostgreSQL
- **AI:** OpenAI embeddings for RAG chat via `rag-chat` Edge Function; Docling for PDF/doc text extraction
- **Messaging:** Twilio WhatsApp for shareable content webhook, event reminders, and weekly digest
- **Push:** Web Push (VAPID) via `notify-action-required` and `notify-new-message` Edge Functions
- **PWA:** vite-plugin-pwa with Workbox caching, standalone mode

## Project Structure

```
src/
  App.jsx                # Main dashboard (~2k lines: messages, events, calendar, filters, push sub)
  App.css                # All main styling (~4k lines, single file)
  components/            # Functional components — ActionsBox, ActionButton, ActionModal,
                         #   AttachmentViewer, CalendarView, ChatDrawer, DocumentBrowser,
                         #   DocumentCard, ErrorBoundary, EventModal, LoginPage,
                         #   MobileNav, MobileFilters, NoteModal, NotesTab,
                         #   NotificationBell, SetPassword, SettingsPanel, TagEditor,
                         #   WhatsAppSharing
  lib/                   # supabase client + helpers, AuthContext, constants, pagination
  styles/                # Per-component CSS (MobileNav, MobileFilters, EventModal)
supabase/
  schema.sql             # Full DB schema with RLS policies
  migrations/            # Migration files (dated YYYY-MM-DD or YYYYMMDD)
  functions/             # Edge Functions — see Edge Functions section below
  functions/_shared/     # Shared TS modules — auth.ts (JWT validation), chunking.ts
docs/
  plans/                 # Implementation plans
  solutions/             # Searchable knowledge base (bugs, patterns, best practices) — search by module, tags, or problem_type before starting work in a documented area
  n8n-snapshots/         # Workflow JSON backups for rollback
public/                  # Static assets, PWA icons, service worker scripts
```

## Key Patterns

- **State:** useState at App level, useEffect for data load + Supabase Realtime subscriptions
- **Auth:** Supabase Auth with email/password, invite-only (max 2 users), AuthContext provider. Project is on **JWT Signing Keys** — see Auth Architecture below
- **RLS:** All tables require `auth.role() = 'authenticated'`; user-scoped tables filter by `auth.uid()`
- **Actions workflow:** Messages carry an `action_status` (`action_required` / `actioned`); ActionsBox surfaces pending items, ActionButton opens the action menu, ActionModal captures notes. Use `ACTION_STATUS` constants from `src/lib/constants.js` — never hardcode the strings
- **Notes:** Shared notes table with promote-to-event flow (NotesTab → NoteModal → manual event)
- **Push notifications:** Web Push via VAPID. Subscriptions stored in `push_subscriptions`; DB triggers call `notify-action-required` / `notify-new-message` Edge Functions
- **Soft delete:** Messages/attachments use soft-delete flags (`deleted_at`); AttachmentViewer respects this
- **Styling:** CSS variables for theming, no CSS-in-JS. Responsive with flexbox/grid + media queries at 768px
- **Components:** Functional with hooks, no class components. ErrorBoundary wraps the app
- **Pagination:** Server-paged messages via `src/lib/pagination.js` (has unit tests)

## CSS Theme Variables

```
--primary: #3B82F6    --bg: #1a2332         --text: #e2e8f0
--success: #10B981    --bg-surface: #1e2a3a  --text-secondary: #94a3b8
--danger: #EF4444     --bg-muted: #243044    --border: #2d3a4a
--warning: #F59E0B
```

## Commands

```bash
npm run dev          # Dev server on port 5173
npx vite build       # Production build to dist/
```

## Environment Variables

Frontend (`.env.local`):
- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase publishable key (legacy slot now holds `sb_publishable_*`)
- `VITE_N8N_RAG_WEBHOOK_URL` — n8n webhook for RAG indexing
- `VITE_VAPID_PUBLIC_KEY` — Web Push VAPID public key (push notifications disabled if unset)

Supabase Edge Function secrets (auto-injected, JWT Signing Keys system):
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` (now opaque `sb_publishable_*`), `SUPABASE_SERVICE_ROLE_KEY` (now opaque `sb_secret_*`)
- `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_SECRET_KEYS` — JSON `{"default": "..."}` for rotation
- `SUPABASE_JWKS` — JWKS for asymmetric JWT verification
- `OPENAI_API_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`
- Twilio: `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`

## Auth Architecture (JWT Signing Keys)

The Supabase project has been migrated to JWT Signing Keys. Edge Functions must:

- **Use `supabase.auth.getClaims(token)`** against `SUPABASE_JWKS` — never `getUser()`, which hits `/auth/v1/user` and rejects opaque publishable keys
- **Accept legacy service-role JWTs** in addition to the new opaque `sb_secret_*`. n8n's Set Credentials node still pins a legacy HS256 service-role JWT; service-role detection must match both forms or the RAG callback chain breaks (401 "missing sub claim")
- **Use the shared helper** at `supabase/functions/_shared/auth.ts` (`authenticate(req)`) rather than re-implementing this logic per function. It returns `{ ok, isServiceRole, userId? }` and handles all three cases (opaque key match, legacy JWT payload sniff, user JWT via JWKS)
- Requires `supabase-js ≥ 2.46`

Frontend still uses the legacy anon-JWT slot under `VITE_SUPABASE_ANON_KEY` (which now holds the publishable key). Migration plan: `docs/plans/2026-05-13-002-feat-migrate-to-publishable-keys-stub.md`.

## Edge Functions

Deployed under `supabase/functions/`:

- **rag-chat** — OpenAI embedding + chat over indexed messages/documents
- **index-message** — embed and store a single message; n8n callback target
- **index-document** — embed and store a document chunked by `_shared/chunking.ts`
- **extract-dates** — pull event date ranges (incl. multi-day, end times) from message text
- **invite-user** — invite second user (caps at 2)
- **set-user-password** — admin password reset for existing users
- **notify-action-required** — Web Push fan-out when `action_status` flips
- **notify-new-message** — Web Push fan-out on message INSERT (DB trigger)
- **whatsapp-webhook** — Twilio inbound WhatsApp handler with role-based access
- **whatsapp-test-send** — manual send for sender approval / smoke tests
- **whatsapp-retention-policy** — GDPR retention sweep over WhatsApp tables

## Infrastructure & Deployment

### DigitalOcean Setup

- **n8n Droplet:** 1GB, IP 144.126.200.83, private network 10.114.0.3
- **Skyvern Droplet:** 4GB, IP 139.59.165.79, private network 10.106.0.5
- **Private VPC:** Droplets communicate via private network (<1ms latency)

### Skyvern Configuration

- **Endpoint:** `http://10.106.0.5:8000` (from n8n droplet via private network)
- **API Routes:** POST `/v1/run/tasks`, GET `/v1/runs/{run_id}`, GET `/v1/workflows`
- **Engine:** `skyvern-2.0` (headless Chromium in server mode)
- **Database:** PostgreSQL in Docker Compose (password: `skyvern_secure_password_2026`)
- **Workflows:** Arbor portal scraping via Skyvern workflow ID `wpid_501572503217945790`

### n8n Workflows

- **Gmail Monitor:** gBJb0RH6dfvpLi21 (detects Arbor notifications, routes to Skyvern)
- **Arbor Scraper:** y6vFVjpnwzr4qGMo (orchestrates Skyvern tasks)
- **WhatsApp Event Reminders:** every 15 min, sends day-before (20:00 UK) + morning-of (07:00 UK) per-event reminders via Twilio. Calls Supabase RPC `get_due_event_reminders` and writes to `event_reminders`. JSON at `docs/n8n-snapshots/whatsapp-event-reminders.json`.
- **WhatsApp Weekly Digest:** Sundays 18:00 UK, sends upcoming-week digest via Twilio. Calls Supabase RPC `get_due_weekly_digest` and writes to `weekly_digest_log`. JSON at `docs/n8n-snapshots/whatsapp-weekly-digest.json`.
- Both reminder workflows support a dry-run mode via env `WHATSAPP_REMINDERS_DRY_RUN=true` — useful while waiting on Twilio WhatsApp sender approval. See `docs/n8n-snapshots/README-whatsapp-reminders.md` for env vars and smoke tests.

## Conventions

- Keep styling in existing CSS files (App.css for main, component-specific for mobile nav/filters/EventModal)
- Use CSS variables for all colours — never hardcode hex values outside `:root`
- Mobile-first: test changes at 768px breakpoint and below
- Text in flex containers must handle overflow (word-break, overflow-wrap, min-width: 0)
- Edge Functions use Deno + TypeScript, import from `npm:` or `https://esm.sh/`. Always call `authenticate()` from `_shared/auth.ts` — do not re-implement JWT validation
- Action status strings come from `ACTION_STATUS` in `src/lib/constants.js` — never hardcode `"action_required"` / `"actioned"`
- Supabase client uses custom storage (no Navigator LockManager) — see `src/lib/supabase.js`
- Before searching for solutions to a bug or pattern question, check `docs/solutions/` (organised by `architecture-patterns/`, `best-practices/`, `integration-issues/`) — past learnings are captured there
- Skyvern tasks are queued from n8n via private network API; use `/v1/...` paths (not `/api/v1/...`)
- All DigitalOcean infrastructure uses private networking for security; never expose Skyvern, Docling, or Skyvern's UI publicly
- Do not push commits without explicit instruction; commits after a task are fine, `git push` requires an explicit "push" in the same turn
