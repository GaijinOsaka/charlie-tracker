# Action-Note Conversation Chain Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn the notes attached to a message in the Action Required box into a tappable conversation chain where replies are lightweight, author/date-tagged, and do not change the message's action status.

**Architecture:** Add a third `action_notes.action_type` value `'comment'` so a chain entry can be a plain reply rather than a status flip. Pure chain-building/preview logic is extracted into a testable `src/lib/actionChain.js` (unit-tested with Vitest, matching `pagination.js`). `ActionsBox.jsx` consumes those helpers to render a collapsed "subject + latest reply preview" row that expands into the full chain plus an inline reply composer. A new `App.jsx` handler inserts `'comment'` rows without touching status.

**Tech Stack:** React 18, Vitest 4 (node env, pure-function tests only — no component render tests in this repo), Supabase Postgres + RLS, plain CSS in `src/components/ActionsBox.css`.

**Reference docs:** Design at `docs/plans/2026-06-09-action-note-conversation-design.md`. Conventions in `CLAUDE.md` (use `ACTION_STATUS` constants; CSS variables only; test at 768px and below; migrations must be applied to remote separately).

---

## Task 1: Migration — allow `'comment'` action_type

**Files:**
- Create: `supabase/migrations/2026-06-09_action_note_comments.sql`

**Step 1: Write the migration**

```sql
-- Allow a neutral 'comment' entry on action_notes so chain replies can be
-- posted without changing the message's action status.
-- Existing 'action_required' / 'actioned' rows are unaffected.

ALTER TABLE action_notes
  DROP CONSTRAINT IF EXISTS action_notes_action_type_check;

ALTER TABLE action_notes
  ADD CONSTRAINT action_notes_action_type_check
  CHECK (action_type = ANY (ARRAY['action_required'::text, 'actioned'::text, 'comment'::text]));
```

**Step 2: Commit (do NOT apply to remote yet)**

```bash
git add supabase/migrations/2026-06-09_action_note_comments.sql
git commit -m "feat(db): allow 'comment' action_type on action_notes"
```

> Remote apply happens in Task 8 (mirrors the `note_replies` workflow — git push alone does not apply migrations). It is safe to apply early since it only widens a CHECK; do it now via the Supabase MCP `apply_migration` if you want to test the reply insert against the real DB during development.

---

## Task 2: Add the `'comment'` constant

**Files:**
- Modify: `src/lib/constants.js`

**Step 1: Add constant**

```js
export const ACTION_STATUS = {
  REQUIRED: "action_required",
  ACTIONED: "actioned",
};

// Neutral chain entry — a conversational reply that does NOT change status.
export const ACTION_NOTE_COMMENT = "comment";
```

**Step 2: Commit**

```bash
git add src/lib/constants.js
git commit -m "feat: add ACTION_NOTE_COMMENT constant"
```

---

## Task 3: `actionChain.js` pure helpers (TDD)

This is the core testable unit. Build it test-first.

**Files:**
- Create: `src/lib/actionChain.js`
- Test: `src/lib/actionChain.test.js`

**Step 1: Write the failing tests**

```js
import { describe, it, expect } from "vitest";
import {
  ENTRY_KIND,
  classifyEntry,
  buildChain,
  getLatestPreview,
} from "./actionChain";

describe("actionChain", () => {
  describe("classifyEntry", () => {
    it("maps action_required to a status entry", () => {
      expect(classifyEntry("action_required")).toBe(ENTRY_KIND.STATUS_REQUIRED);
    });
    it("maps actioned to a status entry", () => {
      expect(classifyEntry("actioned")).toBe(ENTRY_KIND.STATUS_ACTIONED);
    });
    it("maps comment to a comment entry", () => {
      expect(classifyEntry("comment")).toBe(ENTRY_KIND.COMMENT);
    });
    it("treats unknown/null as a comment", () => {
      expect(classifyEntry(null)).toBe(ENTRY_KIND.COMMENT);
    });
  });

  describe("buildChain", () => {
    it("normalizes and sorts action_notes oldest-first", () => {
      const msg = {
        id: "m1",
        action_notes: [
          { id: "b", user_id: "u2", note: "second", action_type: "comment", created_at: "2026-06-09T10:00:00Z" },
          { id: "a", user_id: "u1", note: "first", action_type: "action_required", created_at: "2026-06-08T09:00:00Z" },
        ],
      };
      const chain = buildChain(msg);
      expect(chain.map((e) => e.id)).toEqual(["a", "b"]);
      expect(chain[0]).toMatchObject({
        author_id: "u1", body: "first", kind: ENTRY_KIND.STATUS_REQUIRED,
      });
      expect(chain[1]).toMatchObject({
        author_id: "u2", body: "second", kind: ENTRY_KIND.COMMENT,
      });
    });

    it("renders a legacy action_note as a single system entry", () => {
      const msg = { id: "m2", action_note: "old text", received_at: "2026-06-01T00:00:00Z" };
      const chain = buildChain(msg);
      expect(chain).toHaveLength(1);
      expect(chain[0]).toMatchObject({
        author_id: null, body: "old text", kind: ENTRY_KIND.SYSTEM,
      });
    });

    it("prefers action_notes rows over the legacy field", () => {
      const msg = {
        id: "m3",
        action_note: "legacy",
        action_notes: [
          { id: "x", user_id: "u1", note: "real", action_type: "comment", created_at: "2026-06-09T10:00:00Z" },
        ],
      };
      const chain = buildChain(msg);
      expect(chain).toHaveLength(1);
      expect(chain[0].body).toBe("real");
    });

    it("returns an empty array when there are no notes", () => {
      expect(buildChain({ id: "m4" })).toEqual([]);
    });
  });

  describe("getLatestPreview", () => {
    const getName = (id) => ({ u1: "Clare", u2: "David" }[id] || "Unknown");

    it("returns the newest entry with author name and snippet", () => {
      const chain = [
        { id: "a", author_id: "u1", body: "ask mum if ok", kind: ENTRY_KIND.STATUS_REQUIRED },
        { id: "b", author_id: "u2", body: "That's great, thank you", kind: ENTRY_KIND.COMMENT },
      ];
      expect(getLatestPreview(chain, getName)).toMatchObject({
        name: "David", snippet: "That's great, thank you", kind: ENTRY_KIND.COMMENT,
      });
    });

    it("truncates long snippets to maxLen with an ellipsis", () => {
      const long = "x".repeat(80);
      const chain = [{ id: "a", author_id: "u2", body: long, kind: ENTRY_KIND.COMMENT }];
      const preview = getLatestPreview(chain, getName, 60);
      expect(preview.snippet.endsWith("…")).toBe(true);
      expect(preview.snippet.length).toBeLessThanOrEqual(61);
    });

    it("returns no name for a system entry", () => {
      const chain = [{ id: "a", author_id: null, body: "old", kind: ENTRY_KIND.SYSTEM }];
      expect(getLatestPreview(chain, getName).name).toBeNull();
    });

    it("returns null for an empty chain", () => {
      expect(getLatestPreview([], getName)).toBeNull();
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npm test -- src/lib/actionChain.test.js`
Expected: FAIL — `actionChain` module / exports not defined.

**Step 3: Write minimal implementation**

```js
import { ACTION_STATUS, ACTION_NOTE_COMMENT } from "./constants";

export const ENTRY_KIND = {
  STATUS_REQUIRED: "status-required",
  STATUS_ACTIONED: "status-actioned",
  COMMENT: "comment",
  SYSTEM: "system",
};

export function classifyEntry(actionType) {
  if (actionType === ACTION_STATUS.REQUIRED) return ENTRY_KIND.STATUS_REQUIRED;
  if (actionType === ACTION_STATUS.ACTIONED) return ENTRY_KIND.STATUS_ACTIONED;
  return ENTRY_KIND.COMMENT; // ACTION_NOTE_COMMENT, null, or anything else
}

export function buildChain(msg) {
  const notes = msg?.action_notes || [];

  if (notes.length === 0 && msg?.action_note) {
    return [
      {
        id: `legacy-${msg.id}`,
        author_id: null,
        body: msg.action_note,
        created_at: msg.received_at || null,
        kind: ENTRY_KIND.SYSTEM,
      },
    ];
  }

  return notes
    .map((n) => ({
      id: n.id,
      author_id: n.user_id,
      body: n.note,
      created_at: n.created_at,
      kind: classifyEntry(n.action_type),
    }))
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
}

function truncate(text, maxLen) {
  if (!text) return "";
  return text.length > maxLen ? text.slice(0, maxLen).trimEnd() + "…" : text;
}

export function getLatestPreview(chain, getName, maxLen = 60) {
  if (!chain || chain.length === 0) return null;
  const last = chain[chain.length - 1];
  return {
    name: last.author_id ? getName(last.author_id) : null,
    snippet: truncate(last.body, maxLen),
    kind: last.kind,
  };
}
```

> Note: `ACTION_NOTE_COMMENT` is imported for intent/reference even though `classifyEntry` falls through to COMMENT for any non-status value. Keep the import to anchor the contract; if the linter flags it as unused, reference it in `classifyEntry` via an explicit `actionType === ACTION_NOTE_COMMENT` branch before the fallback.

**Step 4: Run tests to verify they pass**

Run: `npm test -- src/lib/actionChain.test.js`
Expected: PASS (all cases).

**Step 5: Commit**

```bash
git add src/lib/actionChain.js src/lib/actionChain.test.js
git commit -m "feat: action-note chain builder + latest-reply preview helpers"
```

---

## Task 4: Render the chain via helpers + collapsed preview

Rewire `ActionsBox.jsx` to: (a) use `buildChain` for the expanded chain, (b) show a collapsed "subject + latest reply preview", (c) make tapping the row toggle the **chain** (not the email body), (d) style `comment`/`system` entries neutrally.

**Files:**
- Modify: `src/components/ActionsBox.jsx`
- Modify: `src/components/ActionsBox.css`

**Step 1: Import helpers** (top of `ActionsBox.jsx`)

```js
import { buildChain, getLatestPreview, ENTRY_KIND } from "../lib/actionChain";
```

**Step 2: Replace `renderNotes`** (`ActionsBox.jsx:158-194`) with a chain renderer that uses `buildChain` and maps `ENTRY_KIND` to a CSS modifier:

```js
const ENTRY_CLASS = {
  [ENTRY_KIND.STATUS_REQUIRED]: "action-note-required",
  [ENTRY_KIND.STATUS_ACTIONED]: "action-note-actioned",
  [ENTRY_KIND.COMMENT]: "action-note-comment",
  [ENTRY_KIND.SYSTEM]: "action-note-system",
};

const renderChain = (chain) => {
  if (chain.length === 0) return null;
  return (
    <div className="action-notes-chain">
      {chain.map((e) => (
        <div key={e.id} className={`action-note-entry ${ENTRY_CLASS[e.kind]}`}>
          <span className="action-note-type-dot" />
          <div className="action-note-body">
            <span className="action-note-text">{e.body}</span>
            <span className="action-note-meta">
              {e.author_id ? getUserName(e.author_id) : "—"}
              {e.created_at ? <> &bull; {formatNoteDate(e.created_at)}</> : null}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
};
```

**Step 3: Add the collapsed preview** — a one-liner shown only when the row is collapsed. Inside `renderCompactRow`, compute the chain once and render a preview under the meta row:

```js
const chain = buildChain(msg);
const isExpanded = expandedId === msg.id;
const preview = getLatestPreview(chain, getUserName);
```

Collapsed preview markup (render when `!isExpanded && preview`):

```jsx
{!isExpanded && preview && (
  <div className="action-row-preview">
    <span className="action-row-preview-icon">💬</span>
    {preview.name ? <span className="action-row-preview-author">{preview.name}:</span> : null}{" "}
    <span className="action-row-preview-text">{preview.snippet}</span>
  </div>
)}
```

**Step 4: Repurpose the expand** — replace the email-body expand block (`ActionsBox.jsx:301-305`) so the expanded state shows the chain (Task 5 adds the composer here):

```jsx
{isExpanded && (
  <div className="action-row-expanded">
    {renderChain(chain)}
  </div>
)}
```

Remove the old always-on `{renderNotes(msg)}` call (`ActionsBox.jsx:222`) — the chain now lives in the expanded area; the collapsed area shows only the preview. Add a chevron to `action-row-subject` indicating expandability.

**Step 5: CSS** (`ActionsBox.css`) — neutral styles for comment/system entries and the preview line, using theme variables only:

```css
.action-row-preview {
  display: flex; align-items: baseline; gap: 4px;
  font-size: 0.85rem; color: var(--text-secondary);
  margin-top: 4px; min-width: 0;
}
.action-row-preview-author { font-weight: 600; color: var(--text); }
.action-row-preview-text {
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; min-width: 0;
}
.action-note-comment .action-note-type-dot { background: var(--text-secondary); }
.action-note-system .action-note-type-dot { background: var(--border); }
.action-note-system .action-note-text { font-style: italic; color: var(--text-secondary); }
```

**Step 6: Manual smoke + commit**

Run: `npm run dev`, open Actions tab, confirm a multi-note message shows a collapsed preview and expands to the full chain. Then:

```bash
git add src/components/ActionsBox.jsx src/components/ActionsBox.css
git commit -m "feat(actions): collapsed reply preview + expand-to-chain rendering"
```

---

## Task 5: Inline reply composer + status-free insert

Add an inline composer in the expanded row and an `App.jsx` handler that inserts a `'comment'` row **without** changing status.

**Files:**
- Modify: `src/App.jsx` (new handler + pass prop)
- Modify: `src/components/ActionsBox.jsx` (composer UI + local state)

**Step 1: Add `handleAddActionComment` in `App.jsx`** (near `handleActionModalConfirm`, ~`App.jsx:1033`):

```js
async function handleAddActionComment(message, body) {
  const text = body?.trim();
  if (!text) return;
  const { data, error } = await supabase
    .from("action_notes")
    .insert({
      message_id: message.id,
      user_id: user.id,
      note: text,
      action_type: ACTION_NOTE_COMMENT,
    })
    .select("id, user_id, note, action_type, created_at")
    .single();
  if (error) {
    console.error("Failed to add reply:", error);
    addToast("Failed to add reply", "error");
    return;
  }
  setMessages((prev) =>
    prev.map((m) =>
      m.id === message.id
        ? { ...m, action_notes: [...(m.action_notes || []), data] }
        : m,
    ),
  );
}
```

Import the constant at top of `App.jsx`: add `ACTION_NOTE_COMMENT` to the existing `constants` import. Pass the handler to `<ActionsBox onAddComment={handleAddActionComment} ... />` (find the existing `<ActionsBox` usage and add the prop). Note: **no `toggleActionStatus`, no status toast** — that is the whole point.

**Step 2: Composer in `ActionsBox.jsx`** — add `onAddComment` to the component props, and per-row composer state:

```js
const [replyDrafts, setReplyDrafts] = useState({});
const [postingId, setPostingId] = useState(null);

const postReply = async (msg) => {
  const body = (replyDrafts[msg.id] || "").trim();
  if (!body || !onAddComment) return;
  setPostingId(msg.id);
  try {
    await onAddComment(msg, body);
    setReplyDrafts((d) => ({ ...d, [msg.id]: "" }));
  } finally {
    setPostingId(null);
  }
};
```

Render inside the expanded block (Task 4 Step 4), after `renderChain(chain)`:

```jsx
<div className="action-reply-composer" onClick={(e) => e.stopPropagation()}>
  <textarea
    className="action-reply-input"
    placeholder="Reply…"
    rows={2}
    value={replyDrafts[msg.id] || ""}
    onChange={(e) =>
      setReplyDrafts((d) => ({ ...d, [msg.id]: e.target.value }))
    }
  />
  <button
    className="action-row-btn action-row-btn-action"
    disabled={postingId === msg.id || !(replyDrafts[msg.id] || "").trim()}
    onClick={() => postReply(msg)}
  >
    {postingId === msg.id ? "Posting…" : "Post Reply"}
  </button>
</div>
```

> The "Add Note" button on the row can stay for now (it still opens the status modal). The inline composer is the new lightweight reply path. A later cleanup can remove/relabel "Add Note" once the inline flow is confirmed.

**Step 3: CSS** for `.action-reply-composer` / `.action-reply-input` (theme variables, mobile-friendly — full-width textarea, button below at <768px).

**Step 4: Manual smoke + commit**

Run `npm run dev`: expand a message, type a reply, Post → it appends tagged with your name + time, status unchanged, no "Moved to Action Required" toast. Collapse → preview shows your reply.

```bash
git add src/App.jsx src/components/ActionsBox.jsx src/components/ActionsBox.css
git commit -m "feat(actions): inline status-free reply composer on action chain"
```

---

## Task 6: Delete own comment

**Files:**
- Modify: `src/App.jsx` (handler), `src/components/ActionsBox.jsx` (delete button on own comment entries)

**Step 1: `handleDeleteActionComment` in `App.jsx`:**

```js
async function handleDeleteActionComment(message, noteId) {
  const { error } = await supabase.from("action_notes").delete().eq("id", noteId);
  if (error) {
    console.error("Failed to delete reply:", error);
    addToast("Failed to delete reply", "error");
    return;
  }
  setMessages((prev) =>
    prev.map((m) =>
      m.id === message.id
        ? { ...m, action_notes: (m.action_notes || []).filter((n) => n.id !== noteId) }
        : m,
    ),
  );
}
```

Pass `onDeleteComment={handleDeleteActionComment}` and `currentUserId={user?.id}` to `<ActionsBox>`.

**Step 2: Delete button in `renderChain`** — only on `COMMENT` entries authored by the current user:

```jsx
{e.kind === ENTRY_KIND.COMMENT && currentUserId && e.author_id === currentUserId && onDeleteComment && (
  <button
    className="btn-note-reply-delete"
    onClick={(ev) => { ev.stopPropagation(); onDeleteComment(msg, e.id); }}
  >
    Delete
  </button>
)}
```

(`renderChain` needs access to `msg`; pass it as a second arg: `renderChain(chain, msg)`.) Status/system entries get no delete button (matches design — only own comments are deletable; RLS already enforces `auth.uid() = user_id`).

**Step 3: Manual smoke + commit**

```bash
git add src/App.jsx src/components/ActionsBox.jsx
git commit -m "feat(actions): delete own reply from action chain"
```

---

## Task 7: Full-suite check + responsive pass

**Step 1: Run the whole test suite**

Run: `npm test`
Expected: PASS — `actionChain.test.js` + existing `pagination.test.js`, no regressions.

**Step 2: Production build sanity**

Run: `npx vite build`
Expected: builds with no errors.

**Step 3: Responsive manual check (CLAUDE.md: 768px and below)**

In dev tools at ≤768px verify: preview line truncates without overflow; composer textarea + button stack and don't overflow; expand/collapse works on tap; long author names + bodies wrap (`word-break`/`min-width: 0`).

**Step 4: Commit any CSS fixes**

```bash
git add src/components/ActionsBox.css
git commit -m "fix(actions): responsive polish for chain + composer at <=768px"
```

---

## Task 8: Apply migration to remote + wrap-up

**Step 1: Apply the migration to the remote DB** (mirrors the `note_replies` workflow — git push does NOT apply migrations). Use the Supabase MCP:
- `apply_migration` with name `action_note_comments` and the SQL from Task 1, against project `knqhcipfgypzfszrwrsu`.

**Step 2: Verify the constraint**

```sql
select pg_get_constraintdef(con.oid)
from pg_constraint con join pg_class rel on rel.oid = con.conrelid
where rel.relname = 'action_notes' and con.conname = 'action_notes_action_type_check';
```
Expected: the CHECK now includes `'comment'`.

**Step 3: Final manual end-to-end** against the real DB (reply persists across reload; other user's reply appears on refresh).

**Step 4: Confirm branch state**

```bash
git log --oneline origin/feat/actions-notes-improvements..HEAD
```
Then stop — merge to `main` (to reach the phone) is a separate, explicit user decision per `CLAUDE.md` (do not push without instruction).

---

## Out of scope (YAGNI)

- Live realtime sync of replies between users (refetch-on-load is sufficient for V1, matching how `note_replies` shipped).
- Backfilling historical `action_note` text into structured rows.
- Editing existing entries.
- Replies on event rows (`renderEventRow`) — this plan covers message action chains only.
