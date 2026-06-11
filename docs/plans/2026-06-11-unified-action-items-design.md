# Unified Action Items — Design

**Date:** 2026-06-11
**Status:** Approved, building

## Problem

The action-required / actioned workflow is implemented three different (and inconsistent) ways:

- **Messages** — full support: `action_status` enum, `actioned_at`, `actioned_by`, `action_note` + `action_notes` chain. Surfaced in the `ActionsBox` (Action Required + Recently Actioned).
- **Events** — partial: `action_required` boolean + `action_detail` + `event_notes` chain, but **no actioned timestamp**. "Mark as Actioned" only flips `action_required` to false, so the event **disappears entirely** instead of moving into Recently Actioned. This is the reported bug.
- **Notes** — **no action concept at all** (just title/body/`note_replies`).

Additionally:
- "Recently Actioned" should show only the **3 most recently actioned** items; the **Actions tab** should host the full history.
- Actioned items should sort by **when they were actioned**.
- The Actions tab actioned list should be **filterable**.

## Goal

A single unified action workflow across **messages, events, and notes**, with identical functionality: flag as action-required → appears in Action Required → mark actioned (optional closing note) → moves to Recently Actioned → searchable/filterable in the Actions tab.

## Design

### 1. Unified "action item" model

Normalise all three record types into one shared shape via a new helper `src/lib/actionItems.js`:

```
{
  key,        // 'msg-<id>' | 'evt-<id>' | 'note-<id>'
  type,       // 'message' | 'event' | 'note'
  id,
  title,
  source,     // 'Arbor' | 'Gmail' | 'Calendar' | 'Note'
  status,     // 'required' | 'actioned'
  actionedAt, // timestamp | null
  pendingAt,  // timestamp used to order the pending list
  raw,        // original record, for the type-specific row renderer
}
```

Shared semantics:
- **Action required** (pending) = flagged and `actionedAt` is null.
- **Actioned** = `actionedAt` is set.
- Actioned items sort by `actionedAt` desc. Pending items keep existing newest-first ordering.

### 2. Database changes

Two dated migrations under `supabase/migrations/`:

- **`events`** — add `actioned_at TIMESTAMPTZ`, `actioned_by UUID REFERENCES auth.users(id)`. (`action_required` already exists.)
- **`notes`** — add `action_required BOOLEAN DEFAULT FALSE`, `actioned_at TIMESTAMPTZ`, `actioned_by UUID REFERENCES auth.users(id)`.

### 3. Two surfaces, one component

`ActionsBox` is fed the normalised pending/actioned lists and a `mode` prop.

**Messages tab (`mode="summary"`)** — unchanged in feel:
- Two expandable boxes (Action Required, Recently Actioned), tap to expand/collapse.
- Action Required = all pending items, all types.
- Recently Actioned = **top 3** actioned items across all types, plus a "View all in Actions →" link.
- No filter.

**Actions tab (`mode="full"`)** — a real page:
- Action Required section at top (full, **not** filtered).
- Filter bar.
- Full actioned history (all types, paginated, newest-actioned first) — the filter applies here only.

**Filter bar** (actioned list only), additive + instant:
- **Type** — Message / Event / Note
- **Source** — Arbor / Gmail / Calendar / Note
- **Text search** — across title/subject + note content

Rendering still dispatches by `type` so each keeps its own row style (attachments for messages, date range for events, replies for notes).

### 4. Tagging & actioning each type

- **Messages** — unchanged (existing action menu + `ActionModal`).
- **Events** — already flaggable via `EventModal`. Fix: `handleEventActionConfirm` also sets `actioned_at`/`actioned_by`.
- **Notes** — new:
  - "Action required" toggle in `NoteModal`.
  - Mark as Actioned / Clear buttons in NotesTab and the Actions box, mirroring events.
  - Reuse `note_replies` as the conversation chain.

"Mark as Actioned" everywhere opens the same lightweight modal to capture an optional closing note, then stamps `actioned_at`. "Clear" removes the action-required flag without an actioned timestamp.

### 5. Edge cases

- **Clear vs Actioned** — Clear drops the item (no `actionedAt`); Actioned stamps the time and keeps history. Re-flagging a previously-actioned item clears `actioned_at` so it returns to Action Required.
- **Notes linked to events** — note flag and event flag are independent items; no double-counting.
- **Empty states** — hide empty Action Required; "Nothing actioned yet"; "No actioned items match these filters."
- **Optimistic updates** set `actioned_at` locally so ordering is correct without a refetch (the message handler currently omits this — fixed).

### 6. Testing

- Unit-test `actionItems.js`: normalisation per type, status derivation, sort order, top-3 selection, filter predicates (type/source/text). Follows `actionChain.test.js`.
- Manual: flag + action each type, confirm Recently Actioned (3-cap) on Messages tab and appearance/filtering on the Actions tab.
