# Charlie Tracker

School communication tracker — a React + Supabase PWA that centralises messages, events, documents, and calendar into a single dashboard.

## Tech Stack

- **Frontend:** React 18, Vite 4, plain CSS with CSS variables (dark blue theme)
- **Backend:** Supabase (PostgreSQL, Auth, Realtime, Storage, Edge Functions in Deno/TS)
- **Infrastructure:** DigitalOcean (private VPC networking)
  - **n8n:** Self-hosted on 1GB Droplet (144.126.200.83) — Gmail ingestion, Arbor scraping, RAG indexing
  - **Skyvern:** Self-hosted on 4GB Droplet (139.59.165.79) — headless Chromium for web automation, Docker Compose with PostgreSQL
- **Web Scraper:** Skyvern v2.0 for Arbor portal interaction, orchestrated via n8n workflow
- **AI:** OpenAI embeddings for RAG chat via `rag-chat` Edge Function
- **PWA:** vite-plugin-pwa with Workbox caching, standalone mode

## Project Structure

```
src/                     # React frontend
  App.jsx                # Main dashboard (messages, events, calendar, filters)
  App.css                # All main styling (~41KB, single file)
  components/            # Functional components (ChatDrawer, ActionModal, etc.)
  lib/                   # Supabase client, AuthContext
  styles/                # MobileNav.css, MobileFilters.css
supabase/
  schema.sql             # Full DB schema with RLS policies
  migrations/            # Migration files
  functions/             # Edge Functions (rag-chat, index-message, invite-user, etc.)
docs/
  plans/                 # Implementation plans
  solutions/             # Searchable knowledge base (bugs, patterns, best practices) — search by module, tags, or problem_type before starting work in a documented area
  n8n-snapshots/         # Workflow JSON backups for rollback
public/                  # Static assets, PWA icons
```

## Key Patterns

- **State:** useState at App level, useEffect for data load + Supabase Realtime subscriptions
- **Auth:** Supabase Auth with email/password, invite-only (max 2 users), AuthContext provider
- **RLS:** All tables require `auth.role() = 'authenticated'`; user-scoped tables filter by `auth.uid()`
- **Styling:** CSS variables for theming, no CSS-in-JS. Responsive with flexbox/grid + media queries at 768px
- **Components:** Functional with hooks, no class components

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

- `VITE_SUPABASE_URL` — Supabase project URL
- `VITE_SUPABASE_ANON_KEY` — Supabase public anon key
- `VITE_N8N_RAG_WEBHOOK_URL` — n8n webhook for RAG indexing

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

## Conventions

- Keep styling in existing CSS files (App.css for main, component-specific for mobile nav/filters)
- Use CSS variables for all colours — never hardcode hex values outside `:root`
- Mobile-first: test changes at 768px breakpoint and below
- Text in flex containers must handle overflow (word-break, overflow-wrap, min-width: 0)
- Edge Functions use Deno + TypeScript, import from `https://esm.sh/`
- Supabase client uses custom storage (no Navigator LockManager) — see `src/lib/supabase.js`
- Skyvern tasks are queued from n8n via private network API; use `/v1/...` paths (not `/api/v1/...`)
- All DigitalOcean infrastructure uses private networking for security; never expose Skyvern API publicly
