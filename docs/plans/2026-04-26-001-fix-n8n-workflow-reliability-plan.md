---
title: "fix: n8n workflow reliability — error handling, observability, and edge cases"
type: fix
status: complete
date: 2026-04-26
---

# fix: n8n Workflow Reliability — Error Handling, Observability, and Edge Cases

## Overview

Nine reliability and quality gaps remain from the original CE review of Gmail Monitor (`gBJb0RH6dfvpLi21`) and Arbor Skyvern Scraper (`y6vFVjpnwzr4qGMo`). All P0s and three P1s were resolved in a prior session. This plan addresses the remaining P1–P3 findings.

All changes are applied via n8n MCP tools (`mcp__n8n-mcp__n8n_update_partial_workflow` etc.) against the live n8n instance at `https://n8n.klowai.com`. No local code files change.

---

## Problem Frame

The workflows currently: silently swallow failed Supabase inserts with no error branch, produce no email or log alert on execution failure, allow concurrent Gmail Monitor runs (race condition risk), use timezone-naive date parsing (off-by-one-day risk on Arbor timestamps), and contain inconsistent n8n expression syntax that is fragile to node renames.

---

## Requirements Trace

- R1. Failed Supabase inserts must not be silently swallowed — errors must be captured and logged to sync_log
- R2. Workflow execution failures must surface via Gmail notification and sync_log write
- R3. Gmail Monitor must not run more than one execution concurrently
- R4. Date strings from Arbor without timezone info must be treated as UTC
- R5. All cross-node expressions must use n8n v2 syntax: `$('NodeName').item.json.field` — not `$node["NodeName"].json.field`
- R6. sync_log error entries must contain enough context (workflow, node, error text, timestamp) to diagnose failures without n8n UI access

---

## Scope Boundaries

- Arbor pagination (#12) is deferred — requires Skyvern workflow changes, outside n8n scope
- No new Supabase columns or schema migrations — use existing `sync_log` columns
- No frontend changes — observability is workflow/backend only
- P2 #14 (scoped DB user, remove service-role) is deferred — requires Supabase role changes

### Deferred to Follow-Up Work

- Arbor pagination (#12): separate plan once Skyvern workflow supports page navigation
- Scoped Supabase DB user (#14): separate Supabase migration + credential update

---

## Context & Research

### Relevant Code and Patterns

- `docs/n8n-snapshots/gmail-monitor-gBJb0RH6dfvpLi21-snapshot.json` — pre-change state
- `docs/n8n-snapshots/arbor-scraper-y6vFVjpnwzr4qGMo-snapshot.json` — pre-change state
- `supabase/schema.sql` lines 79–88 — sync_log schema: `sync_started_at TIMESTAMPTZ NOT NULL`, `status TEXT`, `error_message TEXT`
- Existing `log_failure` node in Arbor Scraper uses column `sync_timestamp` — **verify live schema column name** before inserting (deployed schema may differ from schema.sql)
- n8n Gmail credential used by Gmail Trigger — reuse for send-email notifications
- n8n Supabase credential `uHoIp3VvWENJhTtI` "Supabase account" — for sync_log inserts

### Key n8n Patterns

- `onError: "continueErrorOutput"` on HTTP Request / Supabase nodes adds a separate error output pin; must remove `continueOnFail: true` in the same updateNode call — they are mutually exclusive
- Error Trigger node type: `n8n-nodes-base.errorTrigger` — fires when a workflow execution has an unhandled error; exists as a standalone root node, never connected mid-workflow
- Gmail send: `n8n-nodes-base.gmail`, `resource: "message"`, `operation: "send"` using existing Gmail credential
- Concurrency: `updateSettings` with `{maxConcurrency: 1}` prevents concurrent executions (community edition)
- n8n v2 expression syntax: `$('NodeName').item.json.field` replaces `$node["NodeName"].json.field`

---

## Key Technical Decisions

- **`onError` over `continueOnFail`**: `continueOnFail: true` silently swallows errors and continues; `onError: "continueErrorOutput"` routes failures to a named branch that can write to sync_log. The latter is strictly better for diagnosability.
- **Workflow-level Error Trigger as catch-all**: One error trigger per workflow catches any unhandled failure without duplicating error logic on every node. Node-level `onError` handles insert-specific failures; Error Trigger handles everything else.
- **Both email + log**: Email provides immediate push awareness; sync_log provides queryable in-app history. Both are needed.
- **UTC default for timezone-naive dates**: Deterministic and consistent regardless of n8n server timezone. Arbor likely produces date-only strings (`2026-03-15`) that JavaScript parses differently depending on locale if not forced to UTC.
- **Expression syntax normalisation**: Standardise to `$('NodeName').item.json.field` across all workflows to eliminate rename-fragility and match n8n v2 documentation.

---

## Open Questions

### Resolved During Planning

- **sync_log column name**: schema.sql uses `sync_started_at` but existing workflow nodes use `sync_timestamp`. Resolution: verify live schema during U2 implementation before writing error records.
- **Pagination (#12)**: Deferred — requires Skyvern workflow changes, not addressable in n8n alone.
- **maxConcurrency community support**: Available in n8n community edition via workflow settings object; supported since v1.x.

### Deferred to Implementation

- Exact list of nodes containing old `$node["Name"]` syntax — scan live workflow JSON during U5
- Whether the `Log Sync` node in Gmail Monitor is reading or writing sync_log — inspect live parameters before U2 to avoid conflict

---

## Implementation Units

- U1. **Add error outputs to critical insert nodes — Gmail Monitor**

**Goal:** Replace silent `continueOnFail` on insert nodes with `onError: "continueErrorOutput"`, routing failures to a dedicated error logging node that writes to sync_log.

**Requirements:** R1, R6

**Dependencies:** None

**Files:** Remote — Gmail Monitor `gBJb0RH6dfvpLi21` (n8n MCP only)

**Approach:**
- Nodes to update: `Insert Message` (insert_msg), `Insert Events`, `Insert Tags`, `Upload to Storage`, `Insert Attachment Record`
- For each: single updateNode call with `continueOnFail: null, onError: "continueErrorOutput"`
- Add a Code node "Log Insert Error" that formats a sync_log payload from `$json.message` (error text) and context
- Add a Supabase node "Write Insert Error" that inserts to sync_log with `status: 'error'`, `error_message`, `sync_started_at: now`
- Connect all five error output pins to the Code node → Supabase insert

**Patterns to follow:**
- Existing `log_failure` node in Arbor Scraper for Supabase insert shape
- `updateNode` with `continueOnFail: null, onError: "continueErrorOutput"` per MCP tools documentation

**Test scenarios:**
- Happy path: normal insert succeeds → no error output fired, execution continues unchanged
- Error path: insert fails (e.g., network error, RLS violation) → error output fires → sync_log record written with `status: 'error'` and non-empty `error_message`

**Verification:**
- All five insert nodes have `onError: "continueErrorOutput"` and no `continueOnFail` property
- Five error output connections exist routing to Log Insert Error node
- A forced failure produces a sync_log record with `status: 'error'`

---

- U2. **Add workflow-level error handler with email + log — both workflows**

**Goal:** Add an Error Trigger node to each workflow that catches any unhandled execution failure, writes a structured sync_log record, and sends a Gmail alert.

**Requirements:** R2, R6

**Dependencies:** None

**Files:** Remote — both workflows (n8n MCP only)

**Approach:**
- Add `n8n-nodes-base.errorTrigger` root node to each workflow (standalone, not connected to main flow)
- Add Code node "Format Error Alert" extracting: `$json.execution.error.message`, `$json.execution.id`, `$json.workflow.name`
- Add Supabase insert node: `sync_started_at: now`, `status: 'error'`, `error_message: "[workflow] execution [id]: [error]"`
- Add Gmail send node: to `davidjamesoakes@gmail.com`, subject `"Charlie Tracker error: [workflow name]"`, body with error message and execution ID
- Error Trigger → Format Error Alert → Supabase write + Gmail send (two parallel outputs from Format node)
- Use existing Gmail credential (same one as Gmail Trigger node) and Supabase account credential

**Patterns to follow:**
- n8n Error Trigger is a root node type — place it visually away from main flow to avoid confusion

**Test scenarios:**
- Error path: deliberate workflow failure (disable a credential temporarily) → Error Trigger fires → sync_log record created → email delivered to davidjamesoakes@gmail.com
- Happy path: normal successful execution → Error Trigger does not fire → no spurious records or emails

**Verification:**
- Both workflows contain an `errorTrigger` node
- Connections: errorTrigger → Format → Supabase + Gmail exist in both workflows
- A forced failure in each workflow produces both a sync_log record and an email

---

- U3. **Execution concurrency lock — Gmail Monitor**

**Goal:** Prevent two Gmail Monitor executions from running simultaneously, eliminating the race condition that allows duplicate inserts before the dedup check runs.

**Requirements:** R3

**Dependencies:** None

**Files:** Remote — Gmail Monitor `gBJb0RH6dfvpLi21` (n8n MCP only)

**Approach:**
- Single MCP call: `{type: "updateSettings", settings: {maxConcurrency: 1}}`
- No node changes required

**Test scenarios:**
- Test expectation: none — settings change with no code path to unit test. Verified observationally: a second trigger while the first execution is running queues rather than spawning a concurrent run.

**Verification:**
- Workflow settings object contains `maxConcurrency: 1`
- n8n UI Settings panel for Gmail Monitor shows "Max concurrent executions: 1"

---

- U4. **Timezone-safe date parsing — Arbor Scraper Parse Messages node**

**Goal:** Ensure Arbor date strings without timezone info are parsed as UTC midnight, not shifted by the n8n server's local timezone.

**Requirements:** R4

**Dependencies:** None

**Files:** Remote — Arbor Scraper `Parse Messages` Code node (n8n MCP only)

**Approach:**
- Replace the bare `msg.received_at || msg.message_date || new Date().toISOString()` date assignment with a helper function that:
  1. Returns `new Date().toISOString()` if no date string provided
  2. If string contains timezone info (matches `/Z|[+-]\d{2}:?\d{2}$/`), parses as-is and validates
  3. If date-only string (no `T`), appends `T00:00:00Z` to force UTC
  4. If datetime string without timezone (has `T` but no `Z`/offset), appends `Z`
  5. Falls back to `new Date().toISOString()` if result is `NaN`
- Apply via `patchNodeField` on `parameters.jsCode`

**Patterns to follow:**
- Null guard pattern added to `Prepare Email Data` node (Gmail Monitor) in previous session

**Test scenarios:**
- Edge case: `"2026-03-15"` (date-only, no TZ) → `"2026-03-15T00:00:00.000Z"` regardless of server TZ
- Edge case: `"2026-03-15T10:30:00+01:00"` (with offset) → preserved as-is, correctly normalised to UTC
- Edge case: `null` or `""` → fallback to `new Date().toISOString()`
- Edge case: `"not-a-date"` → fallback to `new Date().toISOString()` (NaN check)

**Verification:**
- `Parse Messages` Code node contains the timezone-aware helper function
- Expression `new Date("2026-03-15").toISOString()` in the updated code produces `2026-03-15T00:00:00.000Z`

---

- U5. **Fix expression syntax inconsistency — both workflows**

**Goal:** Replace all `$node["NodeName"].json.field` expressions with the n8n v2 equivalent `$('NodeName').item.json.field`, eliminating rename-fragility.

**Requirements:** R5

**Dependencies:** None

**Files:** Remote — both workflows (n8n MCP only)

**Approach:**
- Fetch full JSON for both workflows (via `n8n_get_workflow` with mode `full`, extract via PowerShell)
- Scan all node `parameters` fields for the patterns `$node["` and `$node['`
- For each match: apply `patchNodeField` with strict find/replace to the specific node and field path
- Note: `$json.field` (current item) is already correct; only cross-node references need updating

**Test scenarios:**
- Test expectation: none — syntax normalisation with no behavioral change. Verification is by inspection of updated expressions.

**Verification:**
- Neither workflow contains any `$node["` or `$node['` patterns in node parameters
- Expressions that used old syntax still resolve to the same values in a test execution

---

- U6. **Observability sticky notes and sync_log coverage confirmation**

**Goal:** Document the error handling architecture in both workflows and confirm sync_log entries from U1/U2 include sufficient diagnostic context.

**Requirements:** R6

**Dependencies:** U1, U2

**Files:** Remote — both workflows (n8n MCP only)

**Approach:**
- Add a sticky note to each workflow: "Error handling: node-level insert failures (onError) → Log Insert Error node → sync_log. Unhandled execution failures → Error Trigger → email + sync_log. Check sync_log (status='error') or email for failure diagnosis."
- Confirm the `error_message` written by U1 and U2 nodes includes: workflow name, node name where relevant, UTC timestamp, and error text — all within the existing TEXT column

**Test scenarios:**
- Test expectation: none — documentation and coverage confirmation only

**Verification:**
- Both workflows have an observability sticky note near the error handler nodes
- sync_log `error_message` from a test failure contains enough context to identify source without the n8n UI

---

## System-Wide Impact

- **Interaction graph:** Error Trigger nodes are root nodes — n8n activates them automatically on unhandled failure; they must not be wired into the main execution flow or they will fire spuriously
- **Error propagation:** `onError: "continueErrorOutput"` means the main flow continues past a failed insert — downstream nodes relying on the insert result (e.g., event extraction after message insert) receive no data for that item; this is acceptable but monitored via sync_log
- **State lifecycle risks:** An insert failure followed by continued execution may leave partial state (e.g., message not stored but events attempted). The error log captures this; no cleanup logic is added in this plan
- **Unchanged invariants:** All happy-path execution flows are unchanged; these changes add error branches and settings only

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| sync_log column name mismatch (`sync_started_at` vs `sync_timestamp`) | Verify live schema column name before U1/U2 inserts; adapt to whatever the deployed DB has |
| `maxConcurrency` not honoured in n8n v2.1.5 | Verify after applying U3; if ineffective, note as deferred pending n8n upgrade |
| Error Trigger email itself fails (e.g. Gmail rate limit) | Acceptable — error-handler-of-error-handler is omitted for simplicity; sync_log write still succeeds |
| Partial state after insert failure + continued execution | Logged to sync_log via U1; no cleanup logic in scope |

---

## Documentation / Operational Notes

- After U1/U2 are live: test by temporarily breaking the Supabase credential → confirm email arrives and sync_log is populated
- sync_log `error_message` is TEXT (no length limit) — safe for verbose error payloads
- Pagination remains unaddressed: Arbor results beyond page 1 are silently dropped until Skyvern workflow is updated
- When n8n is upgraded (manual action item), re-verify `maxConcurrency` behaviour

---

## Sources & References

- CE review findings: see `memory/project_n8n_workflow_hardening.md`
- Workflow snapshots: `docs/n8n-snapshots/`
- sync_log schema: `supabase/schema.sql` lines 79–88
- n8n MCP tool docs: loaded via `mcp__n8n-mcp__tools_documentation`
