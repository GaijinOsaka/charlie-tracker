# Multi-Tenancy Design — Charlie Tracker

**Status:** In Progress (brainstorming)
**Date:** 2026-03-18

## Decisions Made

### 1. Hosting Model: Shared Multi-Tenancy (Option 1)

Single Supabase project, single n8n instance, all families share infrastructure. `tenant_id` column added to all data tables, RLS enforces isolation. Chosen for scalability — per-tenant infrastructure doesn't work past a handful of families.

### 2. Gmail Integration: OAuth2 Per Family

Each family goes through Google OAuth consent during onboarding. Refresh token stored encrypted in Supabase. Developer cannot see credentials in plaintext. Proper Gmail API access (not IMAP), handles attachments correctly.

### 3. Arbor Credentials: Encrypted at Rest (Trust Model)

Stored encrypted in Supabase using `pgcrypto` or Vault with a server-side key. Standard SaaS trust model — developer _could_ theoretically access but credentials are encrypted at rest. Can upgrade to client-side encryption / external KMS later if demand warrants.

### 4. Tenant = Family

- One Gmail connection per family (owned by lead user)
- Access to messages determined by lead user
- Maximum 5 members per tenant
- Lead user role: admin (manages credentials, invites members)
- Other members role: member (read/action messages, no credential access)

### 5. Onboarding: Approval-Gated → Self-Service

**Phase 1 (launch):** Parent signs up → account pending → admin (David) approves → parent completes setup.
**Phase 2 (later):** Remove approval gate, fully self-service signup.

### 6. n8n Pipeline: Single Workflow, Webhook-Triggered Per Tenant → Single Workflow, Dynamic Credentials

**Initial approach:** Option 2 — scheduler triggers workflow per tenant with `tenant_id`, workflow fetches that tenant's OAuth token and processes their inbox. Parallel execution possible.
**Target:** Option 1 — single workflow loops through all tenants dynamically. Move here once stable.

### 7. Tenant Data Model (Proposed)

```
tenants
  ├── tenant_id UUID (PK)
  ├── name TEXT (family name)
  ├── status TEXT (pending → approved → active → suspended)
  ├── lead_user_id UUID (FK → auth.users)
  ├── gmail_oauth_token BYTEA (encrypted)
  ├── gmail_refresh_token BYTEA (encrypted)
  ├── arbor_credentials BYTEA (encrypted, optional)
  ├── created_at TIMESTAMPTZ
  └── updated_at TIMESTAMPTZ

tenant_members
  ├── tenant_id UUID (FK → tenants)
  ├── user_id UUID (FK → auth.users)
  ├── role TEXT (admin | member)
  └── joined_at TIMESTAMPTZ
  └── CONSTRAINT max 5 members per tenant

-- All existing tables gain:
--   tenant_id UUID NOT NULL REFERENCES tenants(tenant_id)
-- All RLS policies gain:
--   AND tenant_id = (SELECT tenant_id FROM tenant_members WHERE user_id = auth.uid())
```

### Tables requiring `tenant_id` addition:

- messages
- attachments
- documents
- document_chunks
- web_pages
- events
- categories (or keep global if categories are universal)
- sync_log
- message_read_status (already per-user, but needs tenant scoping)
- user_notifications (already per-user, but needs tenant scoping)
- message_deletions (already per-user, but needs tenant scoping)

## Still To Decide

### Onboarding Wizard Flow (Proposed, Not Yet Confirmed)

```
1. Create account (email + password)
2. [Waiting: "Your account is pending approval"]
3. [Admin approves → status = approved]
4. Parent gets email → "Complete setup"
5. Connect Gmail (OAuth consent) — MANDATORY
6. Enter Arbor credentials — OPTIONAL (not all schools use Arbor)
7. Dashboard loads, pipeline starts
8. Invite family members from Settings
```

- **Open question:** Is Gmail mandatory before app is usable? (Proposed: yes)
- **Open question:** Is Arbor optional? (Proposed: yes)

### Not Yet Discussed

- Admin panel design (how David approves tenants, monitors health)
- Gmail OAuth scope and consent screen requirements (Google verification)
- How n8n determines which emails are "school emails" vs personal (filtering)
- RAG index isolation (per-tenant vector search, or shared with tenant filter?)
- Billing model (free? paid? freemium?)
- Error handling when Gmail token expires / Arbor password changes
- Migration path for current single-tenant data
- Google OAuth app verification process (required for >100 users)
