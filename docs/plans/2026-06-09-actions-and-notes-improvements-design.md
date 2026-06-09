# Actions & Notes Usability Improvements

**Date:** 2026-06-09
**Status:** Design approved, ready for implementation
**Scope:** Three independent UX fixes — one CSS-only, one frontend-only, one with a DB migration.

---

## 1. Inline status dot on action rows

### Problem

In `ActionsBox`, the per-row status dot sits as a sibling of `.action-row-info`. On desktop the row is `flex` with `align-items: center`, so the dot floats vertically centered against a potentially tall info block (subject + meta + notes + attachments). On mobile (`max-width: 768px`), `.action-row-header` switches to `flex-direction: column`, which stacks the dot **above** the subject text instead of beside it.

### Fix

Move `.action-row-status-dot` from the row header into `.action-row-subject`, as the first child before `.action-row-subject-text`. The dot becomes part of the title line on all viewports.

**JSX changes (`src/components/ActionsBox.jsx`):**
- `renderCompactRow`: remove the standalone `<div className="action-row-status-dot" />` and add it inside `.action-row-subject` before the subject-text span.
- `renderEventRow`: same change. Event rows always carry the pending (red) state.

**CSS changes (`src/components/ActionsBox.css`):**
- `.action-row-status-dot`: drop `margin-top: 2px`; add `align-self: center` (since `.action-row-subject` uses `align-items: baseline`, the dot would otherwise sit on the text baseline).
- Existing colour selectors (`.action-row-pending .action-row-status-dot` and `.action-row-actioned .action-row-status-dot`) still match because the parent `.action-row` retains its status class.
- Mobile `.action-row-header { flex-direction: column }` no longer affects the dot.

### Verification

- Desktop + 375px width, both message rows and event rows, both states (red pending, green actioned). Dot inline with the title text.

---

## 2. Pagination of actioned messages on the Actions tab

### Problem

- **Messages tab** (`App.jsx:1769-1772`): already slices `actionsCompleted` to top 3 and passes `showRecentlyActioned={true}` → renders as "Recently Actioned (3)". No change needed.
- **Actions tab** (`App.jsx:1647-1649`): passes the full actioned array with no pagination. As the list grows this becomes unwieldy.

### Fix

Add page state inside `ActionsBox`. Pagination is a view concern and the data is already in memory — no need to lift it to `App.jsx`.

**Component state:**
```js
const [actionedPage, setActionedPage] = useState(0);
const PAGE_SIZE = 10;
```

**Slicing — only when `!showRecentlyActioned`:**
```js
const totalActioned = actionedMessages.length;
const totalPages = Math.max(1, Math.ceil(totalActioned / PAGE_SIZE));
const pagedActioned = showRecentlyActioned
  ? actionedMessages
  : actionedMessages.slice(actionedPage * PAGE_SIZE, (actionedPage + 1) * PAGE_SIZE);
```

**Effect to clamp on data change:**
```js
useEffect(() => {
  if (actionedPage >= totalPages) setActionedPage(0);
}, [actionedMessages.length]);
```
Prevents stuck-on-empty-page after the list shrinks.

**UI — renders below the actioned list, only when `!showRecentlyActioned && totalActioned > PAGE_SIZE`:**

```
[‹ Prev]   Page 2 of 5 · 20 of 47   [Next ›]
```

- Prev disabled at page 0, Next disabled at last page.
- Styling reuses `.action-row-btn` tokens for visual consistency.

**Title:** stays "Actioned (N)" on the Actions tab where `N` is the total count.

### Deliberately deferred

- Search/filter within actioned items. Pagination alone may be sufficient — add later if user asks.

### Verification

- Action 25+ items, verify 3 pages with last page partial.
- Action a new item while on page 2 → list reorders, clamping keeps you on a valid page.
- Verify Messages tab still shows just the 3-most-recent strip with no controls.

---

## 3. Inline replies on notes

### Problem

`NotesTab` shows a single body per note. There's no way to add follow-up commentary, mark progress, or have a short discussion attached to a note.

### Data model — new `note_replies` table

Mirrors the existing `action_notes` pattern (the project's established convention for "comments on a parent record").

**Migration (`supabase/migrations/20260609_note_replies.sql`):**

```sql
CREATE TABLE note_replies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  note_id UUID NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_note_replies_note ON note_replies(note_id, created_at);

ALTER TABLE note_replies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth read" ON note_replies
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Auth insert own" ON note_replies
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND auth.uid() = author_id);

CREATE POLICY "Auth delete own" ON note_replies
  FOR DELETE USING (auth.role() = 'authenticated' AND auth.uid() = author_id);
```

Decisions:
- **No UPDATE policy** — replies are append-only. Delete + retype to revise. Simpler UI, matches chat-thread behavior.
- **CASCADE on `note_id`** — deleting the parent note removes its discussion. No orphan replies.
- **Delete is author-only** — matches social convention; differs from `notes` (any auth user can delete any note) intentionally.

### Data fetch

Extend the existing `notes` select in `App.jsx`:

```js
.from("notes")
.select(`*, events(event_date), note_replies(id, author_id, body, created_at)`)
.order("created_at", { ascending: false })
```

Replies arrive nested on each note; sort client-side by `created_at` ASC for thread rendering.

### Realtime

Add a parallel `note_replies` subscription that updates the matching parent note's `note_replies` array in state on INSERT/DELETE. **V1 acceptable alternative:** refetch all notes on reply add/delete. Realtime can come later.

### Component changes — `NotesTab.jsx`

Two additions per `.note-card`:

1. **Reply thread** (only if `note.note_replies?.length > 0`):
   ```jsx
   <ul className="note-replies">
     {sortedReplies.map(r => (
       <li key={r.id} className="note-reply">
         <p className="note-reply-body">{r.body}</p>
         <div className="note-reply-meta">
           <span>{profiles[r.author_id]?.display_name || "Unknown"}</span>
           <span>{formatDate(r.created_at)}</span>
           {r.author_id === currentUserId && (
             <button onClick={() => onDeleteReply(r.id)}>Delete</button>
           )}
         </div>
       </li>
     ))}
   </ul>
   ```

2. **Inline composer** behind `replyingId` state (one open at a time):
   - `[Reply]` button in `.note-actions` toggles it.
   - When open: small textarea + `[Cancel] [Post]`.
   - On Post: `await onAddReply(note.id, body)`, clear textarea, close composer.

### New props on `NotesTab`

- `onAddReply(noteId, body) → Promise`
- `onDeleteReply(replyId) → Promise`
- `currentUserId`

Handlers added in `App.jsx` alongside `handleAddNote` / `handleEditNote`.

### Styling (`App.css`, notes section)

- `.note-replies` — subtle left-border thread, indented ~24px, `gap: 6px`.
- `.note-reply-body` — same font size as `.note-body`, slightly muted.
- `.note-reply-meta` — 11px, `var(--ct-muted)`.

Lighter than `.action-notes-chain` — replies are conversation, not status events.

### Out of scope (v1)

- Nested replies (replies-to-replies). One level deep only. `parent_reply_id` is a future migration if needed.
- Editing replies.
- Markdown / mentions.
- Read receipts.

### Verification

- Migration applies; `\d note_replies` shows RLS enabled.
- Add a reply, see it appear inline (refresh acceptable for v1 without realtime).
- Delete own reply works; other user's delete button absent.
- Deleting a parent note via UI removes its replies (verify with SQL count).

---

## Delivery order

Smallest blast radius first, three commits on one branch:

1. **#1 — Inline status dot** (~15 min). CSS/JSX only, no migration.
2. **#2 — Actions tab pagination** (~30 min). Frontend only.
3. **#3 — Note replies** (~60–90 min). Migration + UI.

Single PR at the end, or ship #1+#2 first and queue #3 — user's call.
