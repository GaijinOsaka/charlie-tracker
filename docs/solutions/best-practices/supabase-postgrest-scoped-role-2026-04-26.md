---
title: Supabase scoped Postgres role for n8n — BYPASSRLS with minimal GRANTs
date: 2026-04-26
category: best-practices
module: Supabase / Database Security
problem_type: best_practice
component: database
severity: high
applies_when:
  - A backend service (n8n, external API) needs to write to Supabase tables
  - The service has no authenticated user context (no auth.uid())
  - You want to limit blast radius if the service credential is compromised
  - You are using the Supabase service-role key and want to reduce permissions
tags: [supabase, postgres, security, rls, n8n, jwt, postgrest, credentials]
---

# Supabase scoped Postgres role for n8n — BYPASSRLS with minimal GRANTs

## Context

n8n workflows initially used the Supabase service-role key, which bypasses RLS and has full database access. If the credential was exposed (e.g., in a workflow JSON export), an attacker would have unrestricted DB access. A scoped role with only the permissions actually needed limits the blast radius to the 6 tables the workflows write to.

## Guidance

### Create the role with BYPASSRLS and NOINHERIT

n8n has no authenticated user session, so it cannot satisfy `auth.uid()` checks in RLS policies. The role needs `BYPASSRLS` to skip RLS. `NOINHERIT` prevents the role from inheriting permissions from other roles it belongs to, keeping it isolated.

```sql
CREATE ROLE n8n_worker BYPASSRLS NOINHERIT;
```

### Grant the role to `authenticator`

PostgREST impersonates roles by switching to them after authentication. For PostgREST to be able to SET ROLE to `n8n_worker`, the `authenticator` role (which PostgREST runs as) must be granted membership:

```sql
GRANT n8n_worker TO authenticator;
```

Without this, PostgREST cannot switch to the role and will reject the JWT with a permission error.

### Grant only what the service needs

```sql
GRANT USAGE ON SCHEMA public TO n8n_worker;
GRANT SELECT, INSERT ON public.messages TO n8n_worker;
GRANT SELECT ON public.categories TO n8n_worker;
GRANT INSERT ON public.sync_log TO n8n_worker;
GRANT INSERT ON public.events TO n8n_worker;
GRANT INSERT ON public.event_tags TO n8n_worker;
GRANT INSERT ON public.attachments TO n8n_worker;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO n8n_worker;
```

`USAGE ON ALL SEQUENCES` is required for `INSERT` on tables with serial/bigserial primary keys — without it, inserts fail with "permission denied for sequence".

### Generate a JWT claiming the role

PostgREST reads the `role` claim from the JWT to determine which Postgres role to impersonate. Generate a token with no expiry (or a long TTL) using the Supabase project's JWT secret:

1. Supabase Dashboard → Settings → API → copy **JWT Secret**
2. Go to jwt.io → Algorithm: HS256 → Payload:
   ```json
   { "role": "n8n_worker", "iss": "supabase" }
   ```
3. Paste the JWT secret into the Verify Signature field → copy the encoded token

### Use the token as the "Service Role" key in n8n

In n8n → Credentials → "Supabase account" → paste the generated JWT into the **Service Role** field → Save.

PostgREST will now execute all queries from this credential as `n8n_worker`, not as the full service role.

## Why This Matters

The Supabase service-role key grants full database access with RLS bypassed. If exposed in a workflow JSON export, git history, or log file, an attacker has unrestricted read/write/delete on all tables. A scoped role limits exposure to exactly the tables the service needs: an attacker with the `n8n_worker` JWT can insert messages and sync_log records but cannot read user data, delete records, or access other tables.

## When to Apply

- Any external service (n8n, cron job, webhook receiver) that writes to Supabase using a long-lived credential
- Services that do not have an authenticated user session (cannot use the anon key + RLS)
- When rotating exposed credentials — create the scoped role before revoking the old key to avoid downtime

## Examples

**Before:** n8n credential holds service-role key → PostgREST runs as `service_role` → full DB access, RLS bypassed globally

**After:** n8n credential holds `n8n_worker` JWT → PostgREST runs as `n8n_worker` → only 6 tables accessible, `BYPASSRLS` only for those GRANTs

**Adding a new table later:** If a workflow needs access to a new table, add the grant and the role immediately picks it up — no JWT regeneration needed:

```sql
GRANT SELECT ON public.new_table TO n8n_worker;
```

## Status

**Implemented 2026-04-29.** Role created, grants applied, JWT generated and deployed to n8n credential. See `docs/solutions/best-practices/n8n-scoped-jwt-implementation-2026-04-29.md` for full implementation details including the base64 secret decoding gotcha.

## Related

- `docs/solutions/best-practices/n8n-scoped-jwt-implementation-2026-04-29.md` — full implementation walkthrough
- Supabase docs: [Custom Claims & RLS](https://supabase.com/docs/guides/auth/row-level-security)
- PostgREST docs: [Role System](https://postgrest.org/en/stable/references/auth.html)
