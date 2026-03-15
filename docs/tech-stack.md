# Technology Stack & Rationale

## Overview

This project uses a three-tier architecture:

- **Automation:** n8n (data collection)
- **Data:** Supabase (storage & APIs)
- **Frontend:** React (user interface)

---

## n8n (Automation & Data Collection)

### Role

Scrape messages from Arbor, Email, and WhatsApp; normalize data; push to Supabase.

### Why n8n?

- ✅ **Browser Automation:** Playwright integration for scraping Arbor
- ✅ **Multi-Protocol:** HTTP/REST, Email (IMAP), WhatsApp APIs
- ✅ **Scheduling:** Built-in cron triggers for periodic scraping
- ✅ **Error Handling:** Retry logic, webhooks, notifications
- ✅ **No-code/Low-code:** Visual workflow builder
- ✅ **Integrations:** 400+ pre-built nodes

### Current Status

- ✅ Arbor workflow JSON exists (`arbor-message-scraper-workflow.json`)
- ⏳ Needs deployment setup
- 🔄 Email & WhatsApp workflows to be created

### Key Nodes We'll Use

- `Playwright` - Browser automation for Arbor
- `HTTP Request` - REST API calls
- `Email` (IMAP) - Fetch emails
- `Webhook` - WhatsApp webhooks
- `Supabase` - Insert/update messages
- `Schedule` - 15-minute polling interval

---

## Supabase (Database & API)

### Role

Store messages, attachments, metadata; provide REST API for React frontend.

### Why Supabase?

- ✅ **PostgreSQL:** Robust relational database
- ✅ **REST API:** Auto-generated from tables (easy CRUD)
- ✅ **RLS (Row-Level Security):** Fine-grained access control
- ✅ **Realtime:** WebSocket subscriptions for live updates
- ✅ **Built-in Auth:** User management
- ✅ **Free Tier:** Generous limits for prototyping

### Current Status

- ✅ Schema ready (`charlie-oakes-tracker-schema.sql`)
- ✅ Tables: messages, categories, attachments, sync_log
- ✅ Indexes optimized
- ✅ RLS policies prepared
- ⏳ Needs deployment (run SQL in Supabase dashboard)

### Database Structure

```
categories
  ├─ id (UUID)
  ├─ name (TEXT) - "Academic", "Events", "Health", etc.
  ├─ color (TEXT) - UI color code
  └─ keywords (TEXT[]) - auto-categorize messages

messages
  ├─ id (UUID)
  ├─ arbor_message_id (TEXT, UNIQUE) - source system ID
  ├─ subject (TEXT)
  ├─ content (TEXT)
  ├─ sender_name, sender_email
  ├─ received_at (TIMESTAMPTZ) - when message arrived
  ├─ category_id (FK) - linked to categories
  ├─ is_read (BOOLEAN) - for notifications
  └─ created_at, updated_at

attachments
  ├─ id (UUID)
  ├─ message_id (FK)
  ├─ filename, file_path, file_size
  └─ mime_type

sync_log
  ├─ id (UUID)
  ├─ sync_started_at, sync_completed_at
  ├─ messages_found, messages_new
  ├─ status (pending/success/failed)
  └─ error_message
```

### Realtime Features

- WebSocket subscriptions for new messages
- Dashboard updates instantly when Arbor/Email/WhatsApp message arrives
- Notification badge counts update in real-time

---

## React (Frontend)

### Role

Display messages, manage notifications, provide search/filter UI.

### Why React?

- ✅ **Component Reusability:** Build UI with composable parts
- ✅ **State Management:** Handle notifications, read/unread status
- ✅ **Real-time UI:** Subscribe to Supabase changes
- ✅ **Responsive Design:** Mobile + desktop friendly
- ✅ **Ecosystem:** Rich library ecosystem (routing, forms, etc.)

### Key Libraries (To Add)

- `react-router-dom` - Page navigation
- `@supabase/supabase-js` - Supabase client + realtime
- `tailwindcss` - Styling (optional, can use plain CSS)
- `zustand` or `React Context` - State management
- `react-toastify` - In-app notifications/alerts

### Dashboard Components (Sketch)

```
┌─────────────────────────────────────┐
│  Charlie Oakes Tracker              │
├─────────────────────────────────────┤
│  🔔 3 New Messages                  │
│  ┌─────────────────────────────────┐│
│  │ Filter: All | Unread | Academic ││
│  └─────────────────────────────────┘│
│                                       │
│  ┌─────────────────────────────────┐│
│  │ [Unread] School Trip Event      ││
│  │ Arbor • 2 hours ago             ││
│  │ Mrs. Smith: "Trip to museum..." ││
│  └─────────────────────────────────┘│
│                                       │
│  ┌─────────────────────────────────┐│
│  │ [Read] Math Assignment Update   ││
│  │ Arbor • Yesterday               ││
│  │ Mr. Johnson: "Assignment due..." ││
│  └─────────────────────────────────┘│
└─────────────────────────────────────┘
```

---

## Integration Flow

```
Arbor (School App)
    ↓
n8n Workflow (Browser Automation)
    ↓
Supabase REST API
    ↓
React Dashboard (Realtime Subscriptions)
    ↓
User Sees Alert & Message
```

### Data Flow for Email/WhatsApp

```
Email (IMAP) ──┐
WhatsApp (API)─┼→ n8n (Normalize) → Supabase → React Dashboard
Arbor (Scrape)─┘
```

---

## Deployment Strategy

| Component    | Environment              | Tool             |
| ------------ | ------------------------ | ---------------- |
| **n8n**      | n8n Cloud or Self-hosted | TBD              |
| **Supabase** | Cloud (supabase.com)     | Existing project |
| **React**    | Vercel / Netlify / AWS   | TBD              |

---

## Cost Estimate (Monthly)

| Service       | Tier        | Cost |
| ------------- | ----------- | ---- |
| n8n           | Cloud Pro   | ~$20 |
| Supabase      | Pro         | ~$25 |
| React Hosting | Vercel Free | $0   |
| **Total**     |             | ~$45 |

---

## Next Steps

1. Verify Supabase project is ready
2. Deploy database schema to Supabase
3. Test n8n Arbor workflow
4. Build React dashboard (start with hardcoded data)
5. Connect React → Supabase API
6. Add Supabase realtime subscriptions
7. Deploy and test end-to-end
