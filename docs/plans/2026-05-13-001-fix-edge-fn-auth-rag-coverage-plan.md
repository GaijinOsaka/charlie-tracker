---
title: "fix: Repair edge-function auth, RAG retrieval, and indexing coverage"
type: fix
status: active
date: 2026-05-13
---

# fix: Repair edge-function auth, RAG retrieval, and indexing coverage

## Summary

Restore RAG functionality across the app by fixing a stale `SUPABASE_ANON_KEY` in edge-function secrets, removing a dead `access_level` parameter from `rag-chat`, enabling RLS on `event_tags`, tightening the `extract-dates` prompt to capture multi-day ranges, and running a manual backfill of unindexed documents and messages from the UI.

---

## Problem Frame

A functional review on 2026-05-13 found that every user-JWT-secured edge function (`rag-chat`, `index-message`, `index-document`) returns `401 "Not authenticated"` from the browser despite a valid session. Inside the functions, `supabaseAuth.auth.getUser()` fails because the `SUPABASE_ANON_KEY` baked into the function secrets no longer matches the project's auth service. As a knock-on effect, only 6 of 29 documents have any chunks (the rest were never indexed), 0 of 66 messages are RAG-indexed, and the "Ask Charlie" chatbot is completely non-functional in the UI.

Three secondary issues surfaced during the same review:

1. `rag-chat` passes an `access_level` parameter to the `search_knowledge_base` RPC, but the RPC's signature is `(query_embedding, match_threshold, match_count)` only — and no `access_level` column exists. Latent bug that will surface once auth is fixed.
2. The `extract-dates` prompt asks GPT for `event_date` + `event_time` but never `event_end_date` / `event_end_time`. Multi-day events (e.g. "Rotary Exhibition 1st–13th June") collapse to a single start date. Only 7 of 107 events have any end date.
3. `public.event_tags` has RLS disabled. Supabase advisory marks this **critical** — anyone with the anon key can read or modify every tag row.

---

## Requirements

- R1. The "Ask Charlie" chatbot returns Claude-authored answers grounded in indexed documents, citing the source filename.
- R2. The "Add to RAG" button on a message produces chunks in `document_chunks` and flips `messages.indexed_for_rag` to `true`.
- R3. The document re-index trigger (`index-document` POST) succeeds when invoked with a user JWT from the browser.
- R4. `search_knowledge_base` RPC calls succeed without parameter-shape errors.
- R5. After backfill, every document that has extractable text and every message the user wants searchable is indexed and queryable via the chatbot.
- R6. Events extracted from documents with multi-day ranges store both `event_date` and `event_end_date` (and times when given).
- R7. `public.event_tags` enforces row-level security so unauthenticated callers cannot read or modify tags.

---

## Scope Boundaries

- Not changing the Skyvern/Arbor scraper or Gmail Monitor n8n workflows.
- Not redesigning the chat UI, citation rendering, or chunk-similarity threshold tuning.
- Not introducing public-vs-private document visibility as a real feature (removing the stub parameter only — see Key Technical Decisions).
- Not fixing the `May Issue 29.docx.pdf` document stuck at `rag_status='extracting'` as a one-off — it will resolve itself once the backfill runbook runs.
- Not replacing `gpt-4o-mini` with a different model for `extract-dates`.
- Not adding automation that monitors `indexed_for_rag=false` drift over time.

### Deferred to Follow-Up Work

- Automated backfill script or n8n watchdog for `indexed_for_rag=false`: deferred — user prefers manual click-through in the UI for now. If the manual approach proves tedious for 90+ items, revisit.
- Public/private RAG (real `access_level` column + UI toggle): deferred — only worth building if the use case appears. Stub is removed in U2.

---

## Context & Research

### Relevant Code and Patterns

- `supabase/functions/rag-chat/index.ts` — embeds query, calls `search_knowledge_base` RPC, sends Claude prompt. Currently fails at auth.
- `supabase/functions/index-message/index.ts` — synthetic-document pattern (`file_path = email_message/{id}`), chunks message body, dispatches `index-document` for attachments, fires `extract-dates`. Currently fails at auth.
- `supabase/functions/index-document/index.ts` — Docling-driven extraction and chunking. Service-role calls from `index-message` work; user-JWT calls fail at auth.
- `supabase/functions/extract-dates/index.ts` — GPT-4o-mini prompt that returns `events[]` array. Insert payload at lines ~150–165 maps only 6 columns; needs 2 more (`event_end_date`, `event_end_time`).
- `supabase/functions/_shared/chunking.ts` — `chunkText` (800 chars, 100 overlap) + `generateEmbeddings` via `text-embedding-3-small`. Reused by both `index-message` and `index-document`.
- `public.search_knowledge_base(query_embedding, match_threshold, match_count)` — pgvector cosine search joining `document_chunks` → `documents` where `indexed_for_rag = true`.
- `supabase/schema.sql` — reference schema; the live DB is the source of truth but this file must be updated alongside any migration (convention used by every prior migration, e.g. `docs/plans/2026-03-11-document-date-extraction-plan.md`).
- `supabase/migrations/` — naming convention `YYYYMMDDHHMMSS_descriptive_name.sql`.

### Institutional Learnings

- `docs/solutions/integration-issues/n8n-api-credential-scopes-v2-2026-04-29.md` — Supabase service-role vs anon key confusion has bitten this project before. Reinforces the diagnosis that an env-var mismatch is the most likely culprit.
- `docs/solutions/best-practices/n8n-scoped-jwt-implementation-2026-04-29.md` — pattern of using scoped JWTs in n8n; not directly relevant but confirms the project's auth model is JWT-validation-driven.
- `docs/plans/2026-03-11-document-date-extraction-plan.md` — original `extract-dates` design. Schema includes `event_end_date` / `event_end_time` columns (added in `2026-03-13-attachments-soft-delete-implementation.md` era) but the function was never updated to populate them.

### External References

- Supabase Edge Functions: `auth.getUser()` validation requires the project's current anon key to be set as `SUPABASE_ANON_KEY` in the function's secrets. When project keys rotate or get swapped, `getUser()` returns null and the function 401s. https://supabase.com/docs/guides/functions/auth
- Supabase RLS: `auth.role() = 'authenticated'` is the project's existing convention (per CLAUDE.md). Mirror it for `event_tags`.

---

## Key Technical Decisions

- **Re-set the `SUPABASE_ANON_KEY` secret in Supabase Functions dashboard, do not change function code.** The bug is environmental, not algorithmic. Editing the auth-check logic would obscure the real issue and likely re-break later. Verified via direct `/auth/v1/user` call from the browser: the user JWT validates fine when paired with the current legacy anon key, so the legacy key is the right value to set.
- **Remove the `access_level` parameter from `rag-chat` outright instead of adding a column.** Stub feature with no UI surface; carrying broken plumbing is worse than deleting. Removing it also lets `search_knowledge_base` keep its 3-arg signature (no migration needed).
- **Backfill is manual click-through in the UI.** User explicitly chose this path. Plan ships a verification checklist instead of a script. If 90 items turns out painful, a follow-up can add a script — but not now.
- **`event_tags` RLS policy mirrors the rest of the app: `USING (auth.role() = 'authenticated')`.** Tighter scoping (e.g. only event creator can tag) was considered but rejected — the app caps at 2 users and any household member should be able to tag any event.
- **`extract-dates` prompt asks for date ranges and times explicitly, with examples.** Plain "extract dates" prompting underperformed in observed output (only 3 multi-day events of 107 captured). Adding shape-by-example to the prompt and persisting the extra columns is the cheapest fix.
- **`extract-dates` insert payload also persists `event_end_date` and `event_end_time`.** Prompt change alone is insufficient — the insert at the end of the function maps only 6 columns. Both ends must move together.

---

## Open Questions

### Resolved During Planning

- Sequencing — hotfix the env var first (no PR), then bundle the rest into one PR. *(see review report 2026-05-13)*
- Backfill style — manual UI click-through. *(see review report 2026-05-13)*
- access_level fate — delete the param. *(see review report 2026-05-13)*
- RLS scope — authenticated read + write. *(see review report 2026-05-13)*

### Deferred to Implementation

- Exact `event_end_time` semantics when the prompt returns only a start time for a multi-day event — current schema allows NULL, so default to NULL rather than fabricating an end. Confirm during U4.
- Whether to leave the existing 107 events untouched or selectively re-run `extract-dates` for newsletters that span multi-day ranges. Default: leave them, only future extractions get the new prompt. Revisit if users notice gaps post-fix.

---

## High-Level Technical Design

> *This illustrates the intended approach and is directional guidance for review, not implementation specification. The implementing agent should treat it as context, not code to reproduce.*

```
                  Hotfix (U1)                          PR (U2 → U5)
                  ─────────────                        ──────────────
   Supabase           rag-chat        event_tags        extract-dates
   dashboard          edge fn         table             edge fn
   secrets            (TS edit)       (SQL migration)   (TS edit)
       │                  │                 │                 │
       │ set ANON_KEY     │ delete          │ enable RLS      │ add end_date
       │ to legacy        │ access_level    │ + add policy    │ to prompt
       │ anon JWT         │ param           │                 │ + insert
       ▼                  ▼                 ▼                 ▼
   ──────────────────────────────────────────────────────────────
                              │
                              ▼
                  U6: Manual backfill via UI
                  (Add-to-RAG on 23 docs + 66 msgs)
                              │
                              ▼
                  Verify: Ask Charlie returns
                  cited answers; events show
                  end-dates on multi-day items
```

The four code/config changes are independent and can land in any order *within* the PR; they only depend on U1 (the hotfix) succeeding first so that backfill and verification work. U6 is sequenced last because it depends on U1 + U2 being live.

---

## Implementation Units

- U1. **Reset SUPABASE_ANON_KEY in Edge Function secrets (hotfix)**

**Goal:** Make `auth.getUser()` succeed inside `rag-chat`, `index-message`, `index-document`, and `extract-dates` by giving the functions the current project anon key.

**Requirements:** R1, R2, R3.

**Dependencies:** None — pure config change in the Supabase dashboard.

**Files:** None. This is a runbook step performed in the Supabase web UI (Project → Functions → Secrets). Document the operation in the PR description and in `MEMORY.md` so the value is recoverable next time.

**Approach:**
- In Supabase Dashboard → Project Settings → Edge Functions → Secrets, set `SUPABASE_ANON_KEY` to the current legacy anon JWT (retrievable via `mcp__supabase__get_publishable_keys` → the entry where `type: "legacy"` and `name: "anon"`).
- No redeploy required — Edge Functions read secrets at cold start. Wait ~30s or trigger one OPTIONS request to force a refresh.
- Do **not** rewrite the function auth logic. The bug is environmental.

**Execution note:** Hotfix outside the PR. Land this immediately so the chatbot works again; the rest of the plan can follow in a single PR over the next hour or two.

**Patterns to follow:** None — operational.

**Test scenarios:**
- *Happy path:* After the secret is updated, calling `rag-chat` from the UI with a valid session returns `200` and an answer (even if empty-context). Smoke via "Ask Charlie" with the prompt `"hello"`.
- *Happy path:* Calling `index-message` from the UI's "Add to RAG" button on any message returns `200` and the message flips to `indexed_for_rag=true` within 5s.
- *Error path:* Calling `rag-chat` with no `Authorization` header still returns `401` (sanity that the auth check still triggers when truly unauthenticated).

**Verification:**
- `mcp__supabase__get_logs` for the `rag-chat` function shows `POST | 200` (not 401) for fresh requests after the secret update.
- Browser DevTools Network tab on "Ask Charlie" send → `200` on `/functions/v1/rag-chat`.

---

- U2. **Remove `access_level` parameter from rag-chat RPC call**

**Goal:** Eliminate the unused, signature-mismatched `access_level` parameter so `search_knowledge_base` calls are valid post-auth-fix.

**Requirements:** R4.

**Dependencies:** None for the code change; verification depends on U1.

**Files:**
- Modify: `supabase/functions/rag-chat/index.ts`

**Approach:**
- Delete the `accessLevel` destructure from the request body parsing block.
- Delete the `level` variable derivation and the `console.log` line referencing it.
- Remove `access_level: level` from the RPC POST body (the `fetch` to `/rest/v1/rpc/search_knowledge_base`).
- Leave the RPC's three remaining params (`query_embedding`, `match_threshold`, `match_count`) untouched.
- Redeploy via `supabase functions deploy rag-chat` (or MCP `deploy_edge_function`).

**Patterns to follow:**
- Other edge functions in `supabase/functions/` use the same simple RPC POST shape — match their style.

**Test scenarios:**
- *Happy path:* Ask Charlie "When is the Y6 residential returning?" → answer cites `Feb Issue 21.docx.pdf` and gives a date.
- *Happy path:* Ask a question that no indexed doc covers (e.g. "What's the weather in Paris?") → answer responds with a "documents don't contain this information" style fallback, not an error.
- *Edge case:* Empty chat history (first message in session) returns a valid answer (proves history-array handling is still intact).
- *Error path:* Direct curl/fetch to `search_knowledge_base` RPC with the same body shape returns 200, not "function not found".

**Verification:**
- The `rag-chat` function logs (`mcp__supabase__get_logs`) show no `chunks_found: 0` for queries that should have hits.
- A SQL run of `SELECT * FROM public.search_knowledge_base((SELECT embedding FROM document_chunks LIMIT 1), 0.2, 3)` returns 1–3 rows.

---

- U3. **Enable RLS on event_tags with authenticated policy**

**Goal:** Close the Supabase advisory by enabling RLS on `public.event_tags` and adding a policy that mirrors the project convention.

**Requirements:** R7.

**Dependencies:** None. Independent of all other units.

**Files:**
- Create: `supabase/migrations/20260513120000_enable_event_tags_rls.sql`
- Modify: `supabase/schema.sql` (reflect the new policy in the reference schema)

**Approach:**
- Add policy first, then enable RLS, in the same migration. Order matters: enabling RLS without a policy locks out the app instantly.
- Policy uses `auth.role() = 'authenticated'` for `SELECT`, `INSERT`, `UPDATE`, `DELETE` — mirroring the pattern in CLAUDE.md.
- Apply via `mcp__supabase__apply_migration` (server-side); commit both files.
- Smoke test before pushing the PR: load the Events tab in the UI, click the × on any event tag, then add it back. Both must work.

**Patterns to follow:**
- `supabase/schema.sql` for the other "authenticated read+write" policies on tables like `events`, `messages`, `attachments`.

**Test scenarios:**
- *Happy path:* As an authenticated user, `SELECT count(*) FROM event_tags` succeeds and returns the existing 5 rows.
- *Happy path:* Adding a tag in the UI (Events tab → click +tag on an event card) inserts a new `event_tags` row; clicking × deletes it.
- *Error path:* A SQL call using only the publishable anon key (no user JWT) against `event_tags` returns 0 rows for SELECT and is denied on INSERT/UPDATE/DELETE.
- *Integration:* Existing event-tag filtering on the Events tab still works (the `option "club"`, `option "concert"` etc. dropdown still surfaces the same tag set).

**Verification:**
- `mcp__supabase__get_advisors` no longer flags `event_tags` as RLS-disabled.
- The 5 pre-existing tag rows still appear in the Events tab UI for the authenticated user.

---

- U4. **Tighten extract-dates prompt to capture multi-day ranges and persist end fields**

**Goal:** Future date extractions store both start and end dates (and times) when the source clearly states a range.

**Requirements:** R6.

**Dependencies:** None for the code change. New extractions don't run until backfill (U6) — which the user is doing manually — but the change itself is independent.

**Files:**
- Modify: `supabase/functions/extract-dates/index.ts`

**Approach:**
- Update the prompt's per-event schema to include `event_end_date` (YYYY-MM-DD, nullable) and `event_end_time` (HH:MM, nullable).
- Add 2 worked examples to the prompt: one single-day with `start` only ("School holiday tennis camp 27 May 09:00–15:00"), one multi-day ("Rotary Art Competition Exhibition displayed at Bingham Library from 1st–13th June"). The multi-day example shows how the prompt should produce both `event_date` and `event_end_date`.
- Add a tightening note: "Use UK date conventions (DD/MM/YYYY). When a date range is stated (e.g. '1st-13th June', '12 May to 14 May'), populate both `event_date` and `event_end_date`."
- Extend the insert payload to include the two new fields (mapping from the GPT response, defaulting to `null`).
- Redeploy via `supabase functions deploy extract-dates`.

**Patterns to follow:**
- Existing prompt structure in the same file — keep the same `events[]` JSON shape, just extend it.

**Test scenarios:**
- *Happy path:* Re-run `extract-dates` on `Feb Issue 21.docx.pdf` (doc_id `77178d1d-3ec0-4a30-8890-9eff15a99b75`). Confirm at least one new event has both `event_date` AND `event_end_date` set (e.g. half-term week).
- *Happy path:* Re-run on a doc that's purely single-day (e.g. `Junior Training Days.docx`) — events still get `event_end_date = NULL`, not fabricated values.
- *Edge case:* Doc with no dates returns `events: []` cleanly (no schema-violation insert).
- *Error path:* If GPT returns malformed JSON, the function returns a 500 with an "OpenAI" error message and does not partially-insert.
- *Integration:* After re-extracting one multi-day doc, the Events tab in the UI shows a "DD MMM – DD MMM" range on the corresponding card (confirms ChatDrawer/EventCard already supports `event_end_date` rendering — verify in the React code, may need a tiny UI follow-up if not).

**Verification:**
- `SELECT count(*) FROM events WHERE event_end_date IS NOT NULL AND document_id IS NOT NULL` increases by at least the number of multi-day items in the test doc after re-running extraction.
- No regression: pre-existing single-day events on the same doc still match their previous `event_date` (re-extraction deletes and re-inserts).

---

- U5. **Verify rendering of event_end_date in the UI**

**Goal:** Make sure the UI actually displays multi-day ranges on event cards once U4 starts producing them. This is a small parity check, not a redesign.

**Requirements:** R6 (rendering side).

**Dependencies:** U4 deployed (so we have test data with end dates).

**Files:**
- Read-only: `src/App.jsx`, `src/components/` event card / event list rendering.
- Modify (only if needed): the file rendering the event card date column.

**Approach:**
- Open the Events tab in the live app, locate a known multi-day event (e.g. the re-extracted Rotary Exhibition). If it shows a single date when `event_end_date` is populated in the DB, find the event-card render code and extend it to show `DD MMM – DD MMM` when `event_end_date > event_date`.
- If the UI already handles this correctly (the rendering may already check `event_end_date`), close the unit as no-op with a note in the PR description.

**Patterns to follow:**
- Date formatting in `src/App.jsx` for `event_date` — use the same locale/formatter for `event_end_date`.

**Test scenarios:**
- *Happy path:* An event with `event_date=2026-06-01, event_end_date=2026-06-13` displays as "1 JUN – 13 JUN" (or whichever format the app uses).
- *Edge case:* An event with `event_end_date IS NULL` still displays as a single date (no "DD MMM – NULL" or trailing dash).
- *Edge case:* An event with `event_end_date = event_date` (same-day range from GPT) renders as a single date, not "1 JUN – 1 JUN".

**Verification:**
- Visual check in the deployed app after manual click-through backfill (U6) re-extracts at least one multi-day doc.

---

- U6. **Manual backfill runbook — re-index documents and messages from the UI**

**Goal:** Get the 23 unchunked documents and 66 unindexed messages into RAG via the UI's existing "Add to RAG" buttons, after U1–U4 have landed.

**Requirements:** R5.

**Dependencies:** U1 (auth fix), U2 (clean rag-chat), U4 (improved extract-dates prompt — so re-extractions get end dates).

**Files:** None. This is a runbook checklist captured in the PR description and committed as a short note to `docs/plans/` (this plan acts as the runbook).

**Approach:**

A. **Documents** — In the Documents tab:
1. Filter to "Not indexed" (or sort by `indexed_for_rag = false`).
2. For each unindexed document, click "Add to RAG" / "Re-index". Wait for the row to update (Docling + chunking + embedding takes 5–20 seconds per doc depending on size).
3. Skip documents that are obviously images-only (`.png`, `.jpg`) unless OCR is in play — the chunker needs text. Note any that fail in the PR description.

B. **Messages** — In the Messages tab:
1. Click through pages 1–3 of the message list.
2. For each message that is content-bearing (not just an "Arbor system notification" empty body), click "Add to RAG".
3. Watch the inline button state flip to "Indexed" or equivalent.

C. **Spot-check** — After the backfill:
- Run `SELECT count(*) FROM documents WHERE indexed_for_rag=true` and `SELECT count(*) FROM messages WHERE indexed_for_rag=true`. Expect both numbers to climb materially (target: most docs and most content-bearing messages).
- Ask Charlie 3 questions whose answers depend on freshly indexed sources. Confirm chunks are retrieved (`chunks_found` > 0 in the function logs).

**Execution note:** Operational task, no test-first. Document any items that consistently fail and their error messages — those become a follow-up bug fix, not part of this plan.

**Patterns to follow:** None — operational.

**Test scenarios:**
- *Happy path:* "Add to RAG" on `April Issue 26.docx.pdf` succeeds and chunk count for that doc > 0 within 30s.
- *Happy path:* "Add to RAG" on any sufficiently long message creates a synthetic doc with `file_path='email_message/{id}'` and at least one chunk.
- *Edge case:* "Add to RAG" on an image-only doc (e.g. `Drumming Flyer with QR.png`) either skips gracefully or surfaces a clear "no text content" error in the UI.
- *Error path:* If Docling on the bfc-docling-serve droplet is down, the UI shows an error per click rather than silently failing.

**Verification:**
- `SELECT count(*) FROM document_chunks` is materially larger than today's 27.
- Ask Charlie returns relevant cited answers for at least 3 questions covering newly-indexed content.

---

## System-Wide Impact

- **Interaction graph:** `rag-chat`, `index-message`, `index-document`, and `extract-dates` all share the same auth-check pattern reading `SUPABASE_ANON_KEY`. U1 unblocks every one of them, not just the chatbot.
- **Error propagation:** The current 401s surface in the UI as "Sorry, something went wrong: Not authenticated". Post-fix, real backend errors (e.g. Docling timeouts during backfill) need to remain visible — verify that the `ChatDrawer` and "Add to RAG" handlers still bubble non-401 errors instead of swallowing them.
- **State lifecycle risks:** The `extract-dates` function deletes existing `events WHERE document_id = ?` before re-inserting. Re-running on a doc that has *manually* edited events would lose those edits. The current `events` table has 8 events with no `message_id` and no `document_id` (manual events) — those are safe. But any document-derived event the user manually edited would be overwritten. Out of scope to fix here; flag in the PR description for awareness.
- **API surface parity:** No external API consumers — this is a single-tenant household app.
- **Integration coverage:** End-to-end test path: log in → click "Add to RAG" on a message → ask the chatbot a question that needs that message → see a cited answer. This is the only integration that proves all four code/config changes work together; run it as the post-merge smoke.
- **Unchanged invariants:** The `events` table schema is unchanged. `messages.indexed_for_rag` boolean is unchanged. `documents.rag_status` enum and transitions are unchanged. RPC `search_knowledge_base` signature is unchanged. The two-user authentication cap is unchanged.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| Re-setting the anon key in Supabase functions secrets to the wrong value (e.g. accidentally pasting the service-role key) | Use `mcp__supabase__get_publishable_keys` to read the canonical legacy anon JWT immediately before pasting. Verify by hitting `rag-chat` from the UI with a small "hello" query; 200 means the key is correct, 401 means try again. |
| Removing `access_level` breaks a code path elsewhere | Grep the whole repo for `access_level` and `accessLevel` before the change. Currently only present in `rag-chat`. |
| Enabling RLS on `event_tags` locks the app out because the policy isn't registered first | Migration writes `CREATE POLICY` first, then `ALTER TABLE ... ENABLE RLS`. Smoke test on a Supabase preview branch (`mcp__supabase__create_branch`) before applying to prod if nervous. |
| Improved `extract-dates` prompt regresses on existing single-day extraction quality | Re-run on one already-indexed doc (`Feb Issue 21.docx.pdf`) and diff event titles/dates before/after. If quality drops, revert prompt and keep only the schema extension. |
| Manual backfill misses items because the UI's "Add to RAG" silently fails on some docs | The verification SQL queries in U6 will reveal any gaps. If significant drift remains, write the deferred follow-up script. |
| Docling on bfc-docling-serve is overloaded by 23 simultaneous re-index requests | User is doing manual click-through one at a time; concurrency is naturally bounded. If a click takes >60s, wait before the next. |

---

## Documentation / Operational Notes

- Update `docs/solutions/integration-issues/` with a new learning file once the auth fix lands, capturing the symptom (401 from secured edge functions despite valid JWT), the diagnosis (stale `SUPABASE_ANON_KEY` in function secrets), and the fix (re-set from `mcp__supabase__get_publishable_keys`). Title suggestion: `supabase-edge-fn-anon-key-drift-2026-05-13.md`.
- Update `MEMORY.md` with a one-line note: "Edge function `SUPABASE_ANON_KEY` secret must match the project's current legacy anon key — drift causes 401s on every user-JWT call (incident 2026-05-13)."
- Update CLAUDE.md if a new convention emerges (e.g. running `get_advisors` before every PR merge). Otherwise no change.

---

## Sources & References

- **Functional review (2026-05-13)**: in-conversation report covering chatbot 401, RAG coverage gaps, date extraction shortcomings, and RLS advisory.
- `supabase/functions/rag-chat/index.ts` — current state of the chatbot edge function.
- `supabase/functions/index-message/index.ts` — message RAG indexing path, including the synthetic-document pattern.
- `supabase/functions/extract-dates/index.ts` — current prompt and insert mapping.
- `docs/plans/2026-03-11-document-date-extraction-plan.md` — original design for `extract-dates`.
- Supabase MCP advisory: `event_tags` RLS disabled.
- `CLAUDE.md` — project conventions for RLS, edge function patterns, and migrations.
