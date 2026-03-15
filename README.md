# Charlie Oakes Communication Tracker

A centralized system for tracking all communication related to Charlie Oakes, consolidating messages from Arbor (school app), Email, and WhatsApp with intelligent alerts and notifications.

## Project Status

**Current Phase:** Design & Planning (Brainstorming)

## Quick Links

### 📐 Architecture & Design

- [**System Architecture** (ARCHITECTURE.md)](ARCHITECTURE.md) - High-level component overview
- [**Design Document** (design.md)](docs/design.md) - Complete architecture with data flows & diagrams
- [**Tech Stack** (tech-stack.md)](docs/tech-stack.md) - Technology choices and rationale

### 🛠️ Implementation Guides

- [**n8n Setup** (n8n-setup.md)](docs/n8n-setup.md) - Configure Arbor + Gmail workflows
- [**Gmail Integration** (gmail-setup.md)](docs/gmail-setup.md) - Gmail OAuth2 setup & deduplication
- [**Database Schema** (schema.sql)](supabase/schema.sql) - Supabase setup

### 📊 Progress & Documentation

- [**Progress Log** (PROGRESS.md)](PROGRESS.md) - Session-by-session progress
- [**Brainstorming Notes** (brainstorming-notes.md)](docs/brainstorming-notes.md) - Requirements & decisions

## Tech Stack

- **Backend Automation:** n8n (browser automation + message scraping)
- **Database:** Supabase (PostgreSQL with RLS)
- **Frontend:** React (dashboard + notifications)
- **Deployment:** TBD

## Project Structure

```
charlie-tracker/
├── README.md (this file)
├── PROGRESS.md
├── docs/
│   ├── design.md
│   ├── tech-stack.md
│   └── brainstorming-notes.md
├── src/
│   ├── components/
│   ├── pages/
│   ├── lib/
│   └── styles/
├── supabase/
│   ├── schema.sql
│   ├── migrations/
│   └── rls-policies.sql
├── workflows/
│   ├── arbor-scraper.json
│   ├── email-scraper.json
│   └── whatsapp-scraper.json
├── public/
├── .env.example
└── package.json
```

## Key Features (MVP)

✅ **Phase 1 (Current):** Arbor message scraping + React dashboard

- [ ] Deploy n8n Arbor scraper workflow
- [ ] Build React dashboard UI
- [ ] Configure in-app notifications
- [ ] Test end-to-end data flow

📋 **Phase 2 (Future):** Email integration
📋 **Phase 3 (Future):** WhatsApp integration

## Recent Decisions

**Brainstorming Session (2026-02-21):**

- MVP: Arbor scraping → Supabase → React dashboard
- Notifications: In-app dashboard alerts (start simple)
- Access: Centralized repository for all Charlie-related communication
- n8n MCP: Verified working ✓

## Getting Started

See [PROGRESS.md](PROGRESS.md) for setup instructions as they're added.
