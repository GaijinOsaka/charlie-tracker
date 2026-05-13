---
title: Supabase Edge Functions return 401 after silent migration to JWT Signing Keys
date: 2026-05-13
module: supabase-edge-functions
problem_type: auth-failure
tags: [supabase, edge-functions, auth, jwt-signing-keys, publishable-key]
---

## Symptom

Every secured edge function (`rag-chat`, `index-message`, `index-document`, `extract-dates`) starts returning `401 {"error": "Not authenticated"}` to authenticated browser sessions. Function execution_time_ms in logs is 100-650ms — i.e. the function code runs, the user is logged in with a valid session, and yet `supabaseAuth.auth.getUser()` returns `null` inside the function.

User-visible breakage: "Ask Charlie" chat returns "Sorry, something went wrong: Not authenticated", and "Add to RAG" buttons silently fail.

## Root cause

Supabase has been progressively migrating projects from the legacy HS256 anon/service-role JWTs to a new **JWT Signing Keys** system that uses asymmetric (RSA/EC) signing plus opaque `sb_publishable_*` / `sb_secret_*` API keys. The migration changes the **values** injected into edge function env vars without changing the **names**:

| Env var | Before migration | After migration |
|---|---|---|
| `SUPABASE_ANON_KEY` | Legacy HS256 anon JWT (`eyJhbGciOi…`) | Opaque publishable key (`sb_publishable_…`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy HS256 service_role JWT | Opaque secret key (`sb_secret_…`) |
| `SUPABASE_PUBLISHABLE_KEYS` | (not present) | JSON object: `{"default": "sb_publishable_…"}` |
| `SUPABASE_SECRET_KEYS` | (not present) | JSON object: `{"default": "sb_secret_…"}` |
| `SUPABASE_JWKS` | (not present) | JWKS JSON for verifying asymmetric JWTs |

Old call pattern that breaks:

```ts
const supabaseAuth = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
  global: { headers: { Authorization: authHeader } }
});
const { data: { user } } = await supabaseAuth.auth.getUser();  // ← returns null
```

`auth.getUser()` makes an HTTP call to `/auth/v1/user` and uses the configured client key as the `apikey` header. The auth service used to validate the legacy anon JWT here; with the new opaque keys it silently rejects, returning no user. supabase-js@2.38.0 (and older) was written for the legacy flow.

The dashboard shows a "Deprecated — use SUPABASE_PUBLISHABLE_KEYS issued through JWT Signing Keys instead" warning next to the locked `SUPABASE_ANON_KEY` slot. The slot cannot be edited.

## Diagnosis steps that worked

1. Decoded the user JWT from localStorage — confirmed it was valid (correct `iss`, future `exp`, `role: authenticated`).
2. Called `/auth/v1/user` directly with that JWT + the **legacy** anon JWT (retrieved via `mcp__supabase__get_publishable_keys`) — got 200 OK. So the user JWT itself is fine.
3. Called the edge function with the same JWT — got 401 from inside the function.
4. Deployed a temporary `env-diag` edge function (`verify_jwt: false`, returns just env-var names + lengths) and curled it. Discovered `SUPABASE_ANON_KEY` was now 46 chars and started with `sb_p` — the opaque publishable key, not the legacy JWT. Also saw `SUPABASE_PUBLISHABLE_KEYS`, `SUPABASE_JWKS`, `SUPABASE_SECRET_KEYS` were all auto-injected.

## Fix

Replace the legacy auth pattern with `auth.getClaims()` against the JWKS:

```ts
import { createClient } from "npm:@supabase/supabase-js@2";  // 2.46+ required for getClaims

const publishableKeys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!);

const supabaseAuth = createClient(supabaseUrl, publishableKeys.default, {
  global: { headers: { Authorization: authHeader } },
});
const jwt = authHeader.replace(/^Bearer\s+/i, "");
const { data: claimsData, error: authError } =
  await supabaseAuth.auth.getClaims(jwt);
if (authError || !claimsData?.claims?.sub) {
  return new Response(JSON.stringify({ error: "Not authenticated" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

`getClaims()` verifies the JWT signature against `SUPABASE_JWKS` (cached automatically) without depending on `apikey` validation, so it works with both legacy and new key formats.

## Why this is surprisingly hard to spot

- Frontend Auth still works (login, session persistence, RLS queries) because the auth-service has compat shims for the new key system.
- Service-role internal calls inside edge functions (e.g. PostgREST, RPCs) still succeed — opaque secret keys work fine for direct DB access.
- The only thing that breaks is `auth.getUser()` (and any older library path that hits `/auth/v1/user` with the apikey as identity).
- The 401 response body is the function's own `"Not authenticated"` message — easy to misdiagnose as a JWT or session-refresh issue.

## Detection rule for future projects

If you see consistent 401s from secured edge functions on a project where the dashboard is showing the "Deprecated" warning next to `SUPABASE_ANON_KEY`, this is almost certainly the same bug. Check the project's auto-injected env vars with a short diagnostic function — if `SUPABASE_PUBLISHABLE_KEYS` is present, you're on the new system and need `getClaims()`.

## Related work

- This was repaired for four edge functions in commit `8adc8b7` on `fix/edge-fn-auth-rag-coverage` (PR pending).
- Frontend Supabase client migration (use publishable key, drop legacy JWT) is still outstanding — tracked in [stub plan 2026-05-13-002](../../plans/2026-05-13-002-feat-migrate-to-publishable-keys-stub.md).
- Supabase docs: https://supabase.com/docs/guides/functions/auth and https://supabase.com/docs/guides/auth/signing-keys.
