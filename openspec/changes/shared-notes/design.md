## Context

Charlie Tracker is a two-parent React + Supabase PWA. All data lives in Supabase Postgres with RLS enforcing `auth.role() = 'authenticated'`. The app has a single `App.jsx` holding all tab state, and uses Supabase Realtime for live updates to messages. The existing `events` table is the canonical calendar store; `EventModal.jsx` already handles create/edit for manual events.

The notes feature adds a `notes` table and a new tab without touching the ingestion pipeline.

## Goals / Non-Goals

**Goals:**
- Both parents can create, edit, and delete notes from a dedicated Notes tab
- Notes are visible to both parents immediately via Realtime (no page refresh needed)
- A note can be promoted to a calendar event; the event is pre-seeded with the note's content
- Promoted notes retain a visible link back to the created event

**Non-Goals:**
- Rich text / Markdown formatting in notes
- Attaching files to notes
- Note history / version tracking
- RAG indexing of notes (can be added later)
- Notification push when the other parent adds a note (can be added later)

## Decisions

### 1 — Separate `notes` table (not reusing `messages`)

**Decision:** New `notes` table with its own schema.

**Rationale:** Messages are immutable ingestion artefacts with a `source_message_id`, RLS tied to the ingestion pipeline, and a fixed schema. Notes are mutable, user-authored, and need an `event_id` FK. Reusing messages would require nullable columns and conditional logic throughout.

**Alternative considered:** A `source = 'manual'` row in `messages` — rejected because it couples unrelated concerns and confuses the Actions/filter logic.

---

### 2 — Promote-to-event reuses `EventModal.jsx`

**Decision:** Clicking "Add to Calendar" on a note opens the existing `EventModal` pre-filled with the note's title and body. On save, the new event row is inserted and its `id` is written back to `notes.event_id`.

**Rationale:** `EventModal` already handles date/time/tag fields and validation. Reusing it avoids duplicating form logic.

**Alternative considered:** Inline date picker on the note card — rejected as it hides the full event fields (end date, action_required, etc.) that users may want to set.

---

### 3 — Author tracks `author_id` but both parents can delete any note

**Decision:** `notes.author_id` is stored for display ("Added by David") but RLS allows any authenticated user to delete any note.

**Rationale:** With only two users in a cooperative context, locking deletion to the author adds friction without meaningful protection. Either parent should be able to tidy up.

**Alternative considered:** Author-only delete (RLS `USING (auth.uid() = author_id)`) — rejected as overly restrictive for a two-person household tool.

---

### 4 — Realtime subscription mirrors the existing messages pattern

**Decision:** A Supabase Realtime channel on `public:notes` subscribes to INSERT/UPDATE/DELETE events and patches local state, using the same `setupSubscription` / `handleVisibilityChange` pattern already in App.jsx.

**Rationale:** Consistency — avoids a second subscription strategy in the codebase.

---

### 5 — `event_id` FK direction: notes → events (not events → notes)

**Decision:** `notes.event_id UUID REFERENCES events(id) ON DELETE SET NULL`.

**Rationale:** A note exists independently; the event is the derivative. If the event is deleted, the note survives (FK set to null). The reverse (events.note_id) would mean every event row carries a nullable column for a minority use case.

## Risks / Trade-offs

- **Concurrent edit collision** → Two parents editing the same note simultaneously will result in last-write-wins (Postgres UPDATE, no locking). Acceptable given the two-user context; optimistic UI is sufficient.
- **Orphaned event link** → If an event is deleted after promotion, `notes.event_id` is set null (ON DELETE SET NULL). The note UI should handle null gracefully (hide the event link). Mitigation: check for null before rendering the "View event" badge.
- **Tab count creep** → Adding a 7th tab pushes the mobile nav. Mitigation: the existing MobileNav already handles overflow; verify layout at 375px before shipping.

## Migration Plan

1. Run migration SQL in Supabase dashboard (or `supabase migration apply`):
   - Create `notes` table with RLS
   - Add nullable `note_id` column to `events` — **no backfill needed** (all existing events have no linked note)
2. Deploy updated frontend (new tab, components, Realtime subscription)
3. No rollback complexity — the notes table is additive; removing it later is a simple `DROP TABLE notes`

## Open Questions

- Should promoted notes show a badge ("In Calendar") or a clickable link that navigates to the Calendar tab? (Recommendation: clickable badge — minimal extra code using existing `setActiveTab`.)
- Should notes have a `pinned` boolean for important reminders that surface at the top? (Deferred — can add later without schema change.)
