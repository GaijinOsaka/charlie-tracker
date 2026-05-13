---
title: "feat: migrate from legacy anon key to SUPABASE_PUBLISHABLE_KEYS"
type: feat
status: stub
date: 2026-05-13
---

# feat: migrate from legacy anon key to SUPABASE_PUBLISHABLE_KEYS

> **This is a stub, not a ready-to-execute plan.** Captured so the work is not forgotten. Run `/ce-plan` against this file when you are ready to implement — the stub gives planning agents the context they need to expand it.

> **Edge-function portion already shipped on 2026-05-13** (commit `8adc8b7` on `fix/edge-fn-auth-rag-coverage`). Diagnostics in that branch revealed the project had silently migrated to opaque keys: `SUPABASE_ANON_KEY` in the function runtime had been remapped to the new `sb_publishable_*` value, breaking `auth.getUser()`. The fix uses `auth.getClaims()` against `SUPABASE_JWKS` and reads `SUPABASE_PUBLISHABLE_KEYS.default`. **Remaining scope below covers only frontend + legacy-key cleanup.**

---

## Why this exists

Supabase deprecated the legacy anonymous JWT (`SUPABASE_ANON_KEY`) in favour of the new JWT Signing Keys system, surfaced as `SUPABASE_PUBLISHABLE_KEYS` (plural — JSON object, supports rotation). The dashboard now displays a "Deprecated — use SUPABASE_PUBLISHABLE_KEYS issued through JWT Signing Keys instead" warning next to the legacy slot and locks it from editing.

The 2026-05-13 edge-function-auth fix (see `docs/plans/2026-05-13-001-fix-edge-fn-auth-rag-coverage-plan.md`) handled the edge-function side end-to-end. The frontend Supabase client still uses the legacy anon JWT (`VITE_SUPABASE_ANON_KEY`); migrating it to the publishable key is the remaining gap before the legacy key can be fully retired.

---

## Scope (rough sketch — to be refined by `/ce-plan`)

**Done (2026-05-13, commit `8adc8b7`):**

- ~~Update every edge function that reads `SUPABASE_ANON_KEY` to read from `SUPABASE_PUBLISHABLE_KEYS` instead.~~ Done for `rag-chat`, `index-message`, `index-document`, `extract-dates`.
- ~~Replace `auth.getUser()` with `auth.getClaims()` against JWKS.~~ Done.
- ~~Bump supabase-js to `npm:@supabase/supabase-js@2` (latest).~~ Done.

**Still in scope:**

- Audit the remaining edge functions for any lingering `SUPABASE_ANON_KEY` references or `auth.getUser()` calls. Likely candidates:
  - `supabase/functions/invite-user/index.ts`
  - `supabase/functions/set-user-password/index.ts`
  - `supabase/functions/whatsapp-webhook/index.ts`
  - `supabase/functions/whatsapp-test-send/index.ts`
  - `supabase/functions/notify-action-required/index.ts`
  - `supabase/functions/notify-new-message/index.ts`
- Consider extracting the auth-check pattern (`SUPABASE_PUBLISHABLE_KEYS.default` + `getClaims()`) into a helper module under `supabase/functions/_shared/auth.ts` so future functions inherit it.
- Update the frontend Supabase client (`src/lib/supabase.js`) to use the publishable key (`sb_publishable_eBTCRd4xC_2ooU2pLRZVSQ_SgAc4MPE` at time of writing) instead of the legacy anon JWT. Update `VITE_SUPABASE_ANON_KEY` references in `.env` / Vercel env to match (or rename the env var to `VITE_SUPABASE_PUBLISHABLE_KEY` for clarity).
- Once frontend is migrated, rotate or disable the legacy anon key in Supabase Dashboard → API Settings.
- Update `CLAUDE.md` and `MEMORY.md` to reflect the new key system.

**Out (for this stub — call out during full planning if relevant):**

- Changing JWT validation logic itself (Supabase Auth still issues user JWTs the same way).
- Touching the n8n workflows' Supabase credentials — separate work; n8n nodes use service-role keys, not anon.
- Refactoring the shared auth-check pattern across functions (worth doing while we're here, but scope it explicitly).

---

## Risks to think about during full planning

- `SUPABASE_PUBLISHABLE_KEYS` is plural — likely returned as an array (e.g. `[{ id, value, status }]`). Functions need to know which one to use as the `apikey` header. Resolve during planning.
- Rolling migration vs. flag day: if some functions are migrated and others are not, both keys must remain active during the transition. Plan the sequence so both work concurrently until cutover.
- Frontend cache: PWA service worker may have cached the old anon key in fetch headers — confirm cache-busting strategy.
- Any n8n workflow that authenticates as a frontend-style user (rare) would need an updated credential.

---

## When to run `/ce-plan` on this

- Before Supabase auto-disables the legacy key (watch the dashboard for a deadline notice).
- Or when convenient — there is no immediate functional pressure today.

## References

- Companion fix: `docs/plans/2026-05-13-001-fix-edge-fn-auth-rag-coverage-plan.md`
- Supabase docs on JWT Signing Keys (search: "Supabase JWT Signing Keys publishable" — confirm current URL during planning)
- Project anon keys (via Supabase MCP `get_publishable_keys`):
  - Legacy anon (deprecated, still active): `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3M…` — `type: legacy`
  - New publishable (current): `sb_publishable_eBTCRd4xC_2ooU2pLRZVSQ_SgAc4MPE` — `type: publishable`
