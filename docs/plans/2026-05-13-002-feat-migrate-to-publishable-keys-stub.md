---
title: "feat: migrate from legacy anon key to SUPABASE_PUBLISHABLE_KEYS"
type: feat
status: stub
date: 2026-05-13
---

# feat: migrate from legacy anon key to SUPABASE_PUBLISHABLE_KEYS

> **This is a stub, not a ready-to-execute plan.** Captured so the work is not forgotten. Run `/ce-plan` against this file when you are ready to implement — the stub gives planning agents the context they need to expand it.

---

## Why this exists

Supabase has deprecated the legacy anonymous JWT (`SUPABASE_ANON_KEY`) and is steering projects toward the new JWT Signing Keys system, surfaced as `SUPABASE_PUBLISHABLE_KEYS` (plural — supports rotation). The dashboard now displays a "Deprecated — use SUPABASE_PUBLISHABLE_KEYS issued through JWT Signing Keys instead" warning next to the legacy slot.

The 2026-05-13 edge-function-auth fix (see `docs/plans/2026-05-13-001-fix-edge-fn-auth-rag-coverage-plan.md`) deliberately stays on the legacy key because every edge function reads `Deno.env.get("SUPABASE_ANON_KEY")`. The legacy key is still functional — Supabase MCP reports `disabled: false` — but the migration should happen before Supabase actually disables it.

---

## Scope (rough sketch — to be refined by `/ce-plan`)

**In:**

- Update every edge function that reads `SUPABASE_ANON_KEY` to read from `SUPABASE_PUBLISHABLE_KEYS` instead. Confirmed call sites at the time of writing:
  - `supabase/functions/rag-chat/index.ts`
  - `supabase/functions/index-message/index.ts`
  - `supabase/functions/index-document/index.ts`
  - `supabase/functions/extract-dates/index.ts`
  - `supabase/functions/invite-user/index.ts`
  - `supabase/functions/set-user-password/index.ts`
  - `supabase/functions/whatsapp-webhook/index.ts` (if relevant)
  - `supabase/functions/whatsapp-test-send/index.ts` (if relevant)
  - `supabase/functions/notify-action-required/index.ts` (if relevant)
  - `supabase/functions/notify-new-message/index.ts` (if relevant)
- Decide on a helper module under `supabase/functions/_shared/` that picks the active key from the publishable-keys list (the list supports rotation — older keys remain valid during a grace window).
- Update the frontend Supabase client (`src/lib/supabase.js` and any env-var docs) to use the publishable key (`sb_publishable_eBTCRd4xC_2ooU2pLRZVSQ_SgAc4MPE` at time of writing) instead of the legacy anon JWT — and update `VITE_SUPABASE_ANON_KEY` references in `.env` / Vercel env to match (or rename the env var to `VITE_SUPABASE_PUBLISHABLE_KEY` for clarity).
- Once everything migrated, rotate or disable the legacy anon key in Supabase Dashboard → API Settings.
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
