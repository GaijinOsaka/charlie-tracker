---
title: Platform `verify_jwt` rejects opaque service-role key from internal edge-fn calls
date: 2026-05-16
module: supabase-edge-functions
problem_type: auth-failure
tags: [supabase, edge-functions, verify-jwt, jwt-signing-keys, service-to-service]
related:
  - docs/solutions/integration-issues/supabase-edge-fn-jwt-signing-keys-2026-05-13.md
---

## Symptom

Indexing a message-page attachment silently failed: the user clicked "Add to RAG", the success toast appeared, but the document never showed as Indexed on the Documents page, no chunks were created, and `documents.rag_status` stayed at `idle`. The R badge never appeared on the attachment either.

Supabase edge-function logs showed:

```
POST /functions/v1/index-message      → 200  (run 286–375ms)
POST /functions/v1/index-document     → 401  (run 119ms)
POST /functions/v1/extract-dates      → 401  (run 119ms)
```

The `index-message → index-document` and `index-document → extract-dates` chain dies at the 401, leaving the document never extracted/indexed.

## Root cause

After the project migrated to **JWT Signing Keys**, `SUPABASE_SERVICE_ROLE_KEY` is an opaque `sb_secret_*` value — not a JWT. The functions still pass `Authorization: Bearer ${SUPABASE_SERVICE_ROLE_KEY}` for service-to-service calls (see `index-message/index.ts` dispatching `index-document`, and `index-document/index.ts` dispatching `extract-dates`).

The platform-level gateway controlled by `verify_jwt: true` only accepts:

- User JWTs verifiable against project JWKS
- Legacy HS256 service-role JWTs

It does **not** accept the new opaque `sb_secret_*` form. The bearer is rejected at the gateway *before* the function code (and `_shared/auth.ts`) runs. The in-function `auth.ts` would happily accept the opaque key via its direct-match path — but it never gets the chance.

This is a complement to the earlier `supabase-edge-fn-jwt-signing-keys-2026-05-13` fix: that one taught `auth.ts` to recognise all three credential forms, but the gateway gate is a separate layer that still rejects opaque keys.

## Why the cascade was invisible

`index-message` fire-and-forgets the downstream calls with `.catch(() => {})`, so the 401 never propagates to the user. The function returns success and the toast says "Indexed" — only the database state reveals the truth (`last_indexed_at` stays null, `rag_status` stays `idle`).

## Fix

Set `verify_jwt: false` on the functions that are reachable from internal callers carrying the opaque service-role key:

- `index-document` (called by `index-message` and by n8n's RAG-index callback)
- `extract-dates` (called by `index-document` and by `index-message`)

The in-function `_shared/auth.ts` is the authoritative auth check anyway — it covers:

1. Opaque service-role direct match (`token === SUPABASE_SERVICE_ROLE_KEY` or any value in `SUPABASE_SECRET_KEYS`)
2. Legacy HS256 service-role JWT (payload sniff for `role: service_role`)
3. User JWT via `auth.getClaims()` against `SUPABASE_JWKS`

Disabling the gateway gate does not reduce auth strength because every successful path still funnels through `authenticate(req)` inside the function body.

`supabase/config.toml` now locks the flag for both functions so future CLI deploys re-apply it:

```toml
[functions.index-document]
verify_jwt = false

[functions.extract-dates]
verify_jwt = false
```

## Functions that should keep `verify_jwt: true`

`index-message`, `rag-chat`, `invite-user`, `set-user-password`, and the notify-* functions are only called from the frontend (with a user JWT) or from DB triggers (legacy JWT path). Their gateway gate accepts those credentials and adds defence-in-depth.

## Diagnostic SQL

To spot future occurrences of the same shape (function chain dropped a downstream call):

```sql
SELECT id, filename, rag_status, indexed_for_rag, last_indexed_at, last_rag_attempt
FROM documents
WHERE indexed_for_rag = true
  AND (rag_status IS NULL OR rag_status IN ('idle', 'extracting'))
ORDER BY last_indexed_at DESC NULLS LAST;
```

Rows with `indexed_for_rag = true` but `rag_status != 'indexed'` mean the indexing chain wrote `indexed_for_rag` but never reached the final `rag_status = 'indexed'` write — a hallmark of a dropped downstream call.
