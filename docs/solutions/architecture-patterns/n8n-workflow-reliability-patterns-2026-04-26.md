---
title: n8n workflow reliability patterns — error handling, credentials, and observability
date: 2026-04-26
category: architecture-patterns
module: n8n / Workflow Automation
problem_type: architecture_pattern
component: development_workflow
severity: high
applies_when:
  - Building or auditing n8n workflows that write to a database
  - Adding error handling to existing n8n workflows
  - Migrating hardcoded secrets to the n8n credential store
  - Workflows that poll an external API in a loop
tags: [n8n, workflow, error-handling, reliability, credentials, observability, supabase]
---

# n8n workflow reliability patterns — error handling, credentials, and observability

## Context

A CE review of the Gmail Monitor and Arbor Skyvern Scraper workflows surfaced 17 reliability findings across P0–P3 severity. Implementing all fixes required discovering several non-obvious n8n behaviours around error routing, credential storage, and the MCP tooling used to update workflows programmatically.

## Guidance

### 1. Migrate hardcoded secrets to the n8n credential store immediately

Any secret (JWT, API key, password) inside a Set node or expression string is exposed in the workflow JSON export and n8n UI. Rotate the secret after migrating.

Pattern: create a credential via n8n UI or `n8n_manage_credentials`, then attach it to the node that needs it using `updates: { credentials: { credentialType: { id: "...", name: "..." } } }`.

### 2. Use `onError: "continueErrorOutput"` not `continueOnFail`

`continueOnFail: true` silently swallows errors and routes items to the next node as if nothing happened. `onError: "continueErrorOutput"` adds a second output pin (index 1) that receives the failed item with error context in `$json.message`. This is always preferable for insert nodes where silent data loss is unacceptable.

```js
// In n8n_update_partial_workflow updateNode operation:
updates: {
  continueOnFail: null,          // remove the old setting
  onError: "continueErrorOutput" // add the error output pin
}
```

Connect the error output with `sourceIndex: 1` (not 0):

```js
{
  type: "addConnection",
  source: "Insert Message",
  sourceIndex: 1,   // ← error output pin
  target: "Log Insert Error"
}
```

### 3. Add a workflow-level Error Trigger as a catch-all

Node-level `onError` handles expected failures (bad inserts). Unhandled failures (credential expired, node misconfigured) reach the Error Trigger:

- Node type: `n8n-nodes-base.errorTrigger`
- Place as a standalone root node (not connected to the main flow)
- Chain: Error Trigger → Format Error Alert (Code) → Write to sync_log + Send email

The Error Trigger fires automatically on any execution that ends in an unhandled error — no wiring into the main flow needed or wanted.

### 4. Verify live DB column names before writing error records

The workflow JSON and the `schema.sql` source file can drift. The Arbor Scraper had `sync_timestamp` in its log nodes while the live DB column is `sync_started_at`. Always check `information_schema.columns` or the Supabase MCP `list_tables` output before writing insert parameters.

### 5. Add polling termination to prevent infinite loops

Any workflow that polls an external API (e.g., waiting for a Skyvern task to complete) must have a counter-and-merge pattern to cap iterations:

- Add a Merge node (mode: `passThrough`) before the poll HTTP Request
- Add a Code node after the poll that reads `$('Merge & Increment Counter').item.json.counter ?? 0`, increments, and returns `{ counter: n }`
- Add an IF node: `counter >= MAX_ITERATIONS` → stop branch (Set node or NoOp)
- Connect the continue branch back to the Merge node's second input

Gmail Monitor uses 30 iterations max; Arbor Scraper uses 20.

### 6. Set `maxConcurrency: 1` on scheduled/triggered workflows

Without this, a slow execution and a new trigger can overlap, causing duplicate inserts before the deduplication check runs. Set via `updateSettings`:

```js
{ type: "updateSettings", settings: { maxConcurrency: 1 } }
```

### 7. Use timezone-safe date parsing in Code nodes

JavaScript's `new Date("2026-03-15")` is parsed as UTC midnight, but `new Date("2026-03-15T10:00:00")` is parsed as local time. Arbor timestamps arrive as date-only strings. Force UTC:

```js
function parseDateSafe(str) {
  if (!str) return new Date().toISOString();
  if (/Z|[+-]\d{2}:?\d{2}$/.test(str)) {
    const d = new Date(str);
    return isNaN(d) ? new Date().toISOString() : d.toISOString();
  }
  if (!str.includes('T')) str += 'T00:00:00Z';
  else if (!/Z$/.test(str)) str += 'Z';
  const d = new Date(str);
  return isNaN(d) ? new Date().toISOString() : d.toISOString();
}
```

### 8. Use n8n v2 expression syntax

`$node["NodeName"].json.field` is deprecated and breaks on node renames. Replace with:

```js
$('NodeName').item.json.field
```

Scan for `$node["` and `$node['` patterns in workflow JSON and patch each occurrence. Only cross-node references need updating — `$json.field` (current item) is already correct.

### 9. n8n MCP: `patchNodeField` on Supabase column mappings requires array-indexed paths

The `patchNodeField` tool only works on string-type leaf values. Supabase insert node column mappings are stored as an array. To patch them, use the array index in the path:

```js
{
  type: "patchNodeField",
  nodeName: "Write Insert Error",
  path: "parameters.columns.mappings.0.columnId",
  value: "sync_started_at"
}
```

Using `updateNode` with `updates: { columns: {...} }` will fail with "must NOT have additional properties" because `updateNode` only accepts top-level node properties.

## Why This Matters

Silent failures in workflows that write to a database produce invisible data loss — messages not stored, events dropped — with no indication that anything went wrong. Without a catch-all Error Trigger, a credential expiry at 2am produces no alert until the user notices missing data. These patterns together provide both node-level recovery (onError) and workflow-level alerting (Error Trigger + email).

## When to Apply

- Any n8n workflow that writes to a database
- Any workflow that polls an external API in a loop
- Any workflow triggered on a schedule (add concurrency lock)
- Any audit of existing workflows before going to production

## Examples

**Before (silent failure):**
```
Insert Message [continueOnFail: true] → Extract Events → Insert Events
```
If Insert Message fails, execution continues with no data, Insert Events writes orphaned records.

**After (routed failure):**
```
Insert Message [onError: continueErrorOutput]
  → (pin 0) Extract Events → Insert Events
  → (pin 1) Log Insert Error → Write Insert Error (sync_log status='error')
```

## Related

- `memory/project_n8n_workflow_hardening.md` — full CE review finding list with status
- `docs/plans/2026-04-26-001-fix-n8n-workflow-reliability-plan.md` — implementation plan
- `supabase/schema.sql` lines 79–88 — sync_log schema
