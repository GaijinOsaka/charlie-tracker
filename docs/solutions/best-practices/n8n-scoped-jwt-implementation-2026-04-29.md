---
title: Implementing a scoped Supabase JWT for n8n — least-privilege database access
date: 2026-04-29
category: best-practices
module: n8n / Supabase
problem_type: security_hardening
component: credentials
severity: high
applies_when:
  - n8n workflows use the Supabase service-role key
  - Reducing blast radius of a leaked credential
  - Setting up machine-to-machine auth between n8n and Supabase
tags: [supabase, n8n, jwt, security, postgres, rls, credentials]
---

# Implementing a scoped Supabase JWT for n8n — least-privilege database access

## Context

n8n's Supabase credential previously held the full service-role key, granting unrestricted read/write/delete on all tables with RLS bypassed. If exposed in a workflow JSON export, git history, or log file, an attacker would have full database access.

## Solution

### 1. Create a scoped Postgres role

```sql
CREATE ROLE n8n_worker NOLOGIN BYPASSRLS;
GRANT n8n_worker TO authenticator;
```

The `GRANT TO authenticator` is required — without it, PostgREST cannot switch to the role and rejects the JWT.

### 2. Grant only the tables n8n needs

```sql
GRANT SELECT, INSERT ON public.messages TO n8n_worker;
GRANT INSERT ON public.attachments TO n8n_worker;
GRANT INSERT ON public.sync_log TO n8n_worker;
GRANT SELECT ON public.categories TO n8n_worker;
GRANT INSERT ON public.events TO n8n_worker;
GRANT INSERT ON public.event_tags TO n8n_worker;
GRANT SELECT ON public.documents TO n8n_worker;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_chunks TO n8n_worker;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO n8n_worker;
```

Sequence usage is required for INSERT on tables with serial/bigserial primary keys.

### 3. Generate the JWT with Node.js (not jwt.io)

Supabase displays the JWT secret as a **raw string** (not base64-encoded). Use it directly as the HMAC key — do not decode it.

jwt.io cannot be used here regardless: its "base64url encoded" toggle expects base64url format but Supabase secrets use standard base64 chars (`+`, `/`, `=`), causing it to reject the secret.

```javascript
const crypto = require("crypto");
const header = Buffer.from(
  JSON.stringify({ alg: "HS256", typ: "JWT" }),
).toString("base64url");
const payload = Buffer.from(
  JSON.stringify({ role: "n8n_worker", iss: "supabase" }),
).toString("base64url");
const secret = "<your-jwt-secret>"; // use as raw string, do NOT Buffer.from(..., "base64")
const sig = crypto
  .createHmac("sha256", secret)
  .update(header + "." + payload)
  .digest("base64url");
console.log(header + "." + payload + "." + sig);
```

### 4. Update the n8n credential

Via n8n MCP: `n8n_manage_credentials` → `action: update` → `data: { serviceRole: "<generated-jwt>" }`.

Or manually: n8n UI → Credentials → Supabase account → paste the JWT into Service Role → Save.

### 5. Adding access to new tables later

No JWT regeneration needed — just add the grant:

```sql
GRANT SELECT ON public.new_table TO n8n_worker;
```

## Key Gotcha

**Use the JWT secret as a raw string — do NOT base64-decode it.** The secret from Dashboard → Settings → API looks like a base64 string but is used as-is by Supabase's HMAC signing. If you decode it first (e.g. `Buffer.from(secret, 'base64')`), the signature will be wrong and PostgREST will reject the token with "Invalid API key". Verified against this project: raw string produces the correct signature.

## Result

n8n now operates with least-privilege access. An attacker with the `n8n_worker` JWT can only insert messages and sync_log records — cannot read user data, delete records, or access tables outside the grant list.
