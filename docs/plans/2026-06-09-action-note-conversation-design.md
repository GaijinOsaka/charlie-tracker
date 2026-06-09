# Action-note conversation chain — design

**Date:** 2026-06-09
**Branch:** `feat/actions-notes-improvements`
**Status:** Design approved, ready for implementation plan

## Problem

Notes attached to a message in the **Action Required** box don't read as a
conversation. Today the only way to add to the chain is the "Add Note" button,
which opens a full modal asking *"What action is required? / What did you do?"*
and — critically — **also flips the message's action status** and fires a
"Moved to Action Required" toast (`App.jsx` `handleActionModalConfirm`). Each
entry carries an `action_type` of `action_required`/`actioned` and renders as a
red/green status dot, so the chain reads as a *status audit log*, not a
back-and-forth.

The user also reports notes showing with **no author name and no date**. The
chain renderer (`ActionsBox.renderNotes`) *does* tag author + timestamp for real
`action_notes` rows; the untagged ones are going through the **legacy fallback**
(`notes.length === 0 && msg.action_note`) which prints the old single
`action_note` text field with no structured author/date.

## Goal

A message in Action Required shows its notes as a **conversation chain** —
each entry tagged with author name + date — where replying is a lightweight
inline action that stacks onto the thread **without changing the message's
status**, and tapping the message expands/collapses the whole chain.

Worked example:
- Clare — 8 Jun: *"ask mum if…"*  (opening entry)
- David — 9 Jun: *"That's great, thank you"*  (reply, tagged David, no status change)

## Section 1 — Data model & decoupling reply from status

`action_notes` columns: `id, message_id, user_id, note, action_type, created_at`.
Constraint today:

```sql
CHECK (action_type = ANY (ARRAY['action_required','actioned']))
```

**Migration** (`supabase/migrations/2026-06-09_action_note_comments.sql`):
- Drop `action_notes_action_type_check`, re-add allowing a third value `'comment'`.
- Existing rows unaffected.

**Behaviour split:**
- **"Add Note" (reply)** → inserts `action_notes` row with `action_type = 'comment'`,
  tagged `user_id` + `created_at`. Does **not** call `toggleActionStatus`, does
  **not** overwrite the legacy `action_note` field, no status toast. Pure append.
- **"Mark as Actioned"** → unchanged; flips status and records an `'actioned'` entry.
- **First entry** (item first marked action-required) stays an `'action_required'`
  entry — the opening message of the thread.

**Rendering implication:** the colored dot regains meaning — red/green dots mark
real status decisions; `'comment'` entries get a neutral style so conversation
reads naturally while status milestones stand out.

Per `CLAUDE.md`: use `ACTION_STATUS` constants; add a `COMMENT` constant rather
than hardcoding `'comment'`.

## Section 2 — UI & interaction

**Collapsed row (default)** — subject + latest reply preview:

```
● Charlie — ask mum if…                    [8 Jun]
  💬 David: That's great, thank you            ⌄
```

- Status dot + subject (as today).
- One-line preview of the **most recent** chain entry: `author: snippet`
  (truncated ~60 chars).
- Chevron signalling expandability. Tapping anywhere on the row toggles.

**Expanded row** — the full conversation:
- Complete chain oldest→newest; each entry shows **author • date/time** + body;
  status entries (red/green dot) visually distinct from neutral `comment` entries.
- **Inline reply composer** at the bottom (mirrors the Notes-tab composer already
  built in `NotesTab.jsx`): small textarea + Post / Cancel. Replaces the modal for
  replies — type inline, it stacks immediately tagged as the current user.
- Action buttons (Mark as Actioned / Clear / View) stay. **"View"** owns the
  original email body, which moves out of the row-expand.

**Expand repurpose:** today tapping a row reveals `msg.content` (email body). We
repurpose the expand to show the **conversation**, and let the existing "View"
button own the email body — avoiding two competing expand behaviours.

## Section 3 — Legacy data, edge cases & testing

**Legacy notes:**
- Keep the legacy `action_note` fallback so old data still shows, but render it as
  a single **"system" entry** (no author; date from `received_at` if available),
  visually distinct from tagged chain entries — obviously pre-conversation history.
- New replies always create proper `action_notes` rows. No risky bulk backfill.

**Edge cases:**
- **Empty chain:** collapsed shows subject only (no preview line); expanded shows
  just the composer.
- **Profiles not loaded / unknown author:** falls back to "Unknown".
- **Other user's replies:** appear on next data load (V1 relies on existing
  message refetch / optimistic update; live realtime is a later enhancement, as
  `note_replies` shipped).
- **Delete:** users can delete their **own** `comment` entries (RLS
  `auth.uid() = user_id`, mirrors note-reply delete). Status entries are not
  deletable from the chain.

**Testing:**
- Migration applies cleanly; CHECK allows `comment`; existing rows unaffected.
- Unit: chain sort order; collapsed preview picks newest entry; legacy fallback
  renders as system entry.
- Manual (768px and below per `CLAUDE.md`): add reply → stacks tagged name+date,
  no status change, no toast; Mark as Actioned still flips status; expand/collapse
  toggles the chain; View opens the email body.

## Deployment notes

- The migration must be **applied to the remote DB** after merge (same workflow as
  `note_replies` — git push alone does not apply migrations).
- Frontend changes go live only when `feat/actions-notes-improvements` is merged to
  `main` and the app redeploys.
