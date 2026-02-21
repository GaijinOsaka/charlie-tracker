# Brainstorming Notes & Clarifications

**Session Date:** 2026-02-21
**Facilitator:** Claude (Opus 4.6)
**Participant:** David

## Problem Statement

Need a centralized system to track all communication related to Charlie Oakes across multiple sources, with the ability to receive alerts and maintain organized records.

## Requirements Clarifications

### Primary Goals
- **Goal 1:** Centralized repository - one place for all Charlie-related communication
- **Goal 2:** Alerts & notifications - particularly important
- **Access Pattern:** Dashboard (not just email/SMS)

### Data Sources to Consolidate
1. **Arbor** (school messaging app) - PRIMARY for MVP
2. **Email** - Phase 2
3. **WhatsApp** - Phase 3

### Notification System
- **Channel:** In-app dashboard alerts (web-based)
- **Trigger:** All new messages across sources
- **Future:** Could add filtering (by category, sender, priority)

### Technology Decisions

| Layer | Choice | Rationale |
|-------|--------|-----------|
| **Automation** | n8n | Browser automation for Arbor scraping, extensible for other sources |
| **Database** | Supabase | PostgreSQL with RLS, REST API, built-in auth |
| **Frontend** | React | SPA for real-time dashboard, notification system |
| **Notifications** | In-app (dashboard) | Start simple, can extend to email/SMS later |

### MVP Scope (Highest Value First)
1. **Phase 1 - Arbor Dashboard:** Deploy existing n8n workflow → build React UI
2. **Phase 2 - Email Integration:** Add email scraping → extend dashboard
3. **Phase 3 - WhatsApp Integration:** Add WhatsApp source → unified view

## Design Questions (Answered)

### Q1: Primary Goal?
**A:** Centralized repository + alerts/notifications (YES to both)

### Q2: Communication Sources?
**A:** Arbor + Email + WhatsApp (MVP: Arbor first)

### Q3: Notification Triggers?
**A:** In-app dashboard alerts

### Q4: Tech Stack?
**A:** n8n + Supabase + React

### Q5: MVP Approach?
**A:** Arbor scraping → Supabase → React dashboard (skip email/WhatsApp for Phase 1)

### Q6: Workflow Status?
**A:** JSON exists but not deployed yet

## Open Questions for Design Phase

- Architecture for handling 3 different message sources?
- Real-time vs. polling for dashboard updates?
- Category/tagging strategy across sources?
- Historical data import strategy?
- Rate limiting & error handling in n8n workflows?
- Authentication & multi-user access model?

## Key Assumptions

1. Arbor workflow is ready to deploy (JSON exists)
2. Supabase project is already created
3. n8n instance is available (cloud or self-hosted)
4. React app will be built from scratch
5. Email & WhatsApp sources use standard APIs/automation
6. User wants incremental approach (MVP first, then expand)

## Next Phase: Design Proposals

Will present 2-3 architectural approaches with trade-offs before implementation.
