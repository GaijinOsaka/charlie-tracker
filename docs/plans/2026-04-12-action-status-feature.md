# Action Status Feature Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the "Recently Actioned" box with an "Actions" box that displays messages with mutually-exclusive action states (null → pending → actioned), allowing users to toggle messages between states with contextual buttons.

**Architecture:** Add a new `action_status` column (ENUM: null/pending/actioned) to the messages table. Update the message row buttons to show conditional options: "Needs Action" only in null state, both buttons in pending state, "Mark Actioned" only in actioned state. The "Actions" box displays two sections (Pending first, Actioned below).

**Tech Stack:** Supabase PostgreSQL (ENUM type), React hooks (useState/useEffect), Realtime subscriptions via Supabase

---

## Task 1: Create Database Migration

**Files:**

- Create: `supabase/migrations/20260412_add_action_status.sql`

**Step 1: Write migration file**

```sql
-- Add action_status enum type
CREATE TYPE action_status_enum AS ENUM ('pending', 'actioned');

-- Add action_status column to messages table
ALTER TABLE messages ADD COLUMN action_status action_status_enum DEFAULT NULL;

-- Create indexes for filtering
CREATE INDEX idx_messages_action_status ON messages(action_status);

-- Backfill existing data: if actioned_at is set, mark as 'actioned'; otherwise null
UPDATE messages SET action_status = 'actioned' WHERE actioned_at IS NOT NULL;
```

**Step 2: Verify migration syntax**

Open `supabase/migrations/20260412_add_action_status.sql` and check:

- ENUM type created ✓
- Column added ✓
- Index created ✓
- Backfill logic correct ✓

**Step 3: Apply migration to Supabase**

Run in Supabase SQL Editor (copy entire contents of the migration file):

```
Expected result: "Success. No rows returned"
```

**Step 4: Verify schema change**

Run in Supabase SQL Editor:

```sql
SELECT column_name, data_type FROM information_schema.columns
WHERE table_name = 'messages' AND column_name = 'action_status';
```

Expected output:

```
action_status | USER-DEFINED (action_status_enum)
```

**Step 5: Commit**

```bash
git add supabase/migrations/20260412_add_action_status.sql
git commit -m "feat: add action_status enum and column to messages table"
```

---

## Task 2: Update Supabase Client to Handle Action Status

**Files:**

- Modify: `src/lib/supabase.js`

**Step 1: Add action status update functions**

Find the section with message update functions (look for `openActionModal` logic). Add these new functions before the export:

```javascript
export async function updateActionStatus(messageId, newStatus) {
  // newStatus can be: 'pending', 'actioned', or null
  const { error } = await supabase
    .from("messages")
    .update({ action_status: newStatus })
    .eq("id", messageId);

  if (error) {
    console.error("Failed to update action status:", error);
    throw error;
  }
}
```

**Step 2: Verify function is exportable**

Check that `updateActionStatus` is not shadowed by other code in the file.

```bash
grep -n "updateActionStatus" src/lib/supabase.js
```

Expected: One result showing the function definition ✓

**Step 3: Commit**

```bash
git add src/lib/supabase.js
git commit -m "feat: add updateActionStatus function to supabase client"
```

---

## Task 3: Update App.jsx Message Action Handlers

**Files:**

- Modify: `src/App.jsx` (around lines 383-430, the openActionModal and related functions)

**Step 1: Replace openActionModal and undoAction functions**

Find the `openActionModal` function (starts ~line 383). Replace both `openActionModal` and `undoAction` functions with:

```javascript
async function toggleActionStatus(msg, targetStatus) {
  try {
    await updateActionStatus(msg.id, targetStatus);

    // Update local state optimistically
    setMessages((prev) =>
      prev.map((m) =>
        m.id === msg.id ? { ...m, action_status: targetStatus } : m,
      ),
    );

    const statusLabels = {
      pending: "marked as needing action",
      actioned: "marked as actioned",
      null: "cleared action status",
    };
    addToast(`Message ${statusLabels[targetStatus]}`, "success");
  } catch (err) {
    console.error("Failed to update action status:", err);
    addToast("Failed to update action status", "error");
  }
}
```

**Step 2: Add import for updateActionStatus**

Find the imports at the top of App.jsx (around line 4). Update the supabase import to include the new function:

```javascript
import {
  supabase,
  createManualEvent,
  updateManualEvent,
  deleteManualEvent,
  updateActionStatus,
} from "./lib/supabase";
```

**Step 3: Verify function signature**

Check that `toggleActionStatus` takes `msg` and `targetStatus` parameters:

```bash
grep -n "toggleActionStatus" src/App.jsx
```

Expected: Definition + calls ✓

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: replace action modal functions with toggleActionStatus"
```

---

## Task 4: Update Message Button Rendering (Conditional Button Display)

**Files:**

- Modify: `src/App.jsx` (around lines 1118-1123, the button rendering logic)

**Step 1: Replace button logic**

Find the section with "Mark as Unread" and "Mark Actioned" buttons (~line 1116-1123). Replace with:

```javascript
{
  msg.action_status === null && (
    <button
      className="btn-action"
      onClick={() => toggleActionStatus(msg, "pending")}
    >
      ✓ Needs Action
    </button>
  );
}

{
  msg.action_status === "pending" && (
    <>
      <button
        className="btn-action btn-action-active"
        onClick={() => toggleActionStatus(msg, null)}
      >
        ✓ Needs Action
      </button>
      <button
        className="btn-action btn-action-active"
        onClick={() => toggleActionStatus(msg, "actioned")}
      >
        ✓ Mark Actioned
      </button>
    </>
  );
}

{
  msg.action_status === "actioned" && (
    <button
      className="btn-action btn-action-active"
      onClick={() => toggleActionStatus(msg, "pending")}
    >
      ✓ Mark Actioned
    </button>
  );
}
```

**Step 2: Verify conditional rendering**

Ensure all three states are covered (null, pending, actioned) and buttons have correct class names.

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add conditional action status buttons based on state"
```

---

## Task 5: Update "Recently Actioned" Box to "Actions" Box

**Files:**

- Modify: `src/App.jsx` (around lines 956-990, the actioned-box section)
- Modify: `src/App.css` (styling for the new actions box)

**Step 1: Replace the actioned-box JSX**

Find the section starting with `const actioned = messages` (~line 957). Replace the entire block with:

```javascript
const actionsPending = messages
  .filter((m) => m.action_status === "pending")
  .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

const actionsCompleted = messages
  .filter((m) => m.action_status === "actioned")
  .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

if (actionsPending.length === 0 && actionsCompleted.length === 0) return null;

return (
  <div className="actions-box">
    <h4 className="actions-box-title">Actions</h4>

    {actionsPending.length > 0 && (
      <div className="actions-section">
        <h5 className="actions-section-title">Pending</h5>
        <ul className="actions-list">
          {actionsPending.map((msg) => (
            <li key={msg.id} className="actions-item">
              <div className="actions-info">
                <span className="actions-subject">{msg.subject}</span>
                <span className="actions-meta">
                  {(msg.source || "arbor").toUpperCase()} &middot;{" "}
                  {new Date(msg.received_at).toLocaleString()}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    )}

    {actionsCompleted.length > 0 && (
      <div className="actions-section">
        <h5 className="actions-section-title">Actioned</h5>
        <ul className="actions-list">
          {actionsCompleted.map((msg) => (
            <li key={msg.id} className="actions-item">
              <div className="actions-info">
                <span className="actions-subject">{msg.subject}</span>
                <span className="actions-meta">
                  {(msg.source || "arbor").toUpperCase()} &middot;{" "}
                  {new Date(msg.received_at).toLocaleString()}
                </span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    )}
  </div>
);
```

**Step 2: Verify JSX structure**

Check the returned JSX:

- Has `.actions-box` outer container ✓
- Title "Actions" ✓
- Two sections: Pending and Actioned ✓
- Conditional rendering for empty sections ✓
- Lists messages with subject and metadata ✓

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: replace 'Recently Actioned' with 'Actions' box showing pending and actioned sections"
```

---

## Task 6: Update CSS for New Actions Box

**Files:**

- Modify: `src/App.css` (find and replace `.actioned-box` styles)

**Step 1: Find existing actioned box styles**

```bash
grep -n "actioned-box\|actioned-list\|actioned-item" src/App.css | head -20
```

Expected output shows line numbers for `.actioned-box`, `.actioned-list`, `.actioned-item` styles.

**Step 2: Replace with new actions box styles**

Find the `.actioned-box` section and replace all `.actioned-*` classes with new styles:

```css
.actions-box {
  margin-top: 1.5rem;
  padding: 1rem;
  background-color: var(--bg-surface);
  border-left: 3px solid var(--primary);
  border-radius: 0.5rem;
}

.actions-box-title {
  margin: 0 0 1rem 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--text);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.actions-section {
  margin-bottom: 1.5rem;
}

.actions-section:last-child {
  margin-bottom: 0;
}

.actions-section-title {
  margin: 0 0 0.75rem 0;
  font-size: 0.85rem;
  font-weight: 500;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.actions-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.actions-item {
  padding: 0.75rem;
  background-color: var(--bg-muted);
  border-radius: 0.35rem;
  border-left: 2px solid var(--primary);
  transition: all 0.2s ease;
}

.actions-item:hover {
  background-color: var(--bg);
}

.actions-info {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.actions-subject {
  font-weight: 500;
  color: var(--text);
  word-break: break-word;
}

.actions-meta {
  font-size: 0.8rem;
  color: var(--text-secondary);
}
```

**Step 3: Remove old actioned styles (optional but clean)**

Search for and remove/comment out old `.actioned-box`, `.actioned-list`, `.actioned-item`, `.actioned-badge`, etc. classes that are no longer used.

**Step 4: Test responsive design**

Check that `.actions-box` looks good on mobile by adding a media query if needed:

```css
@media (max-width: 768px) {
  .actions-box {
    margin-top: 1rem;
    padding: 0.75rem;
  }
}
```

**Step 5: Commit**

```bash
git add src/App.css
git commit -m "feat: add CSS styling for new actions box with pending/actioned sections"
```

---

## Task 7: Update Message Display to Show Action Status Badge

**Files:**

- Modify: `src/App.jsx` (around lines 1036-1044, the message row display)

**Step 1: Replace action status badge**

Find the section with `.actioned-info` and `.actioned-badge` (~line 1036-1044). Replace with:

```javascript
{
  msg.action_status && (
    <div className="action-status-badge">
      <span
        className={`action-status-label action-status-${msg.action_status}`}
      >
        {msg.action_status === "pending" ? "⏳ Needs Action" : "✓ Actioned"}
      </span>
    </div>
  );
}
```

**Step 2: Verify placement in message row**

Ensure this badge appears near other message metadata (source, unread dot, etc.).

**Step 3: Add CSS for action status badge**

Add to `src/App.css`:

```css
.action-status-badge {
  display: inline-block;
  margin-left: 0.5rem;
}

.action-status-label {
  display: inline-block;
  padding: 0.25rem 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

.action-status-pending {
  background-color: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
}

.action-status-actioned {
  background-color: rgba(16, 185, 129, 0.2);
  color: #10b981;
}
```

**Step 4: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat: add action status badge to message rows"
```

---

## Task 8: Update Message Filtering to Include Action Status

**Files:**

- Modify: `src/App.jsx` (the getFilteredMessages function, around lines 502-530)

**Step 1: Add action status filter state**

Add new state at the top with other filters:

```javascript
const [actionFilter, setActionFilter] = useState("all"); // all, pending, actioned
```

**Step 2: Update getFilteredMessages function**

Add action status filtering logic:

```javascript
if (actionFilter === "pending") {
  filtered = filtered.filter((m) => m.action_status === "pending");
} else if (actionFilter === "actioned") {
  filtered = filtered.filter((m) => m.action_status === "actioned");
}
```

**Step 3: Add filter UI (optional for Phase 2)**

Note: This can be added to the filter panel later if needed. For now, document that `actionFilter` state is ready.

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add action status filtering to message list"
```

---

## Task 9: Update Realtime Subscription to Include action_status

**Files:**

- Modify: `src/App.jsx` (the loadMessages function and subscription setup)

**Step 1: Find realtime subscription setup**

Search for `.on('postgres_changes'` in the loadMessages function.

**Step 2: Verify action_status is included in subscription**

Ensure the subscription includes the full message object with `action_status`:

```javascript
const subscription = supabase
  .channel("messages")
  .on(
    "postgres_changes",
    { event: "*", schema: "public", table: "messages" },
    (payload) => {
      if (payload.eventType === "INSERT") {
        setMessages((prev) => [payload.new, ...prev]);
      } else if (payload.eventType === "UPDATE") {
        setMessages((prev) =>
          prev.map((m) => (m.id === payload.new.id ? payload.new : m)),
        );
      } else if (payload.eventType === "DELETE") {
        setMessages((prev) => prev.filter((m) => m.id !== payload.old.id));
      }
    },
  )
  .subscribe();
```

**Step 3: Test realtime updates**

This should work automatically once schema is updated, but verify in testing phase that action_status changes propagate in realtime across multiple users.

**Step 4: No code changes needed**

If realtime is already properly set up, this task is verification only.

**Step 5: Commit**

```bash
git commit --allow-empty -m "chore: verify realtime subscription includes action_status"
```

---

## Task 10: Testing Checklist

**Files:**

- Reference: Manual testing checklist

**Manual Tests:**

1. **null → pending toggle**
   - [ ] Open a message with no action status
   - [ ] Click "Needs Action" button
   - [ ] Verify button changes to show both buttons highlighted
   - [ ] Verify message appears in "Actions" → "Pending" section

2. **pending → actioned toggle**
   - [ ] From pending state, click "Mark Actioned" button
   - [ ] Verify button changes to show only "Mark Actioned" highlighted
   - [ ] Verify message moves from "Pending" to "Actioned" section in Actions box

3. **actioned → pending toggle**
   - [ ] From actioned state, click "Mark Actioned" button
   - [ ] Verify it toggles back to pending state
   - [ ] Verify message moves back to "Pending" section

4. **pending → null toggle**
   - [ ] From pending state, click "Needs Action" button
   - [ ] Verify it clears action status (no buttons highlighted)
   - [ ] Verify message disappears from "Actions" box

5. **Realtime sync**
   - [ ] Open the app in two tabs/browsers
   - [ ] Mark a message as pending in one tab
   - [ ] Verify it appears in the Actions box in the other tab in real-time

6. **Actions box display**
   - [ ] Empty state: no messages with action status → Actions box should not appear
   - [ ] Only pending: should show "Pending" section only
   - [ ] Only actioned: should show "Actioned" section only
   - [ ] Mixed: should show both sections with Pending above Actioned

7. **Mobile responsiveness**
   - [ ] Test at 768px breakpoint
   - [ ] Verify buttons stack properly
   - [ ] Verify text doesn't overflow in message rows

**Step 1: Run through checklist manually**

Navigate the app, trigger state changes, verify all points above.

**Step 2: Document any issues**

If bugs found, create issues and reference them in commit message.

**Step 3: Commit test completion**

```bash
git commit --allow-empty -m "test: manual testing of action status feature complete"
```

---

## Task 11: Clean Up Old Code (Optional)

**Files:**

- Modify: `src/App.jsx`

**Step 1: Remove unused openActionModal/undoAction references**

Search for any remaining references to the old functions and remove them:

```bash
grep -n "openActionModal\|undoAction" src/App.jsx
```

If found, remove or replace with `toggleActionStatus`.

**Step 2: Commit cleanup**

```bash
git add src/App.jsx
git commit -m "chore: remove unused action modal functions"
```

---

## Implementation Order

Follow tasks in sequence:

1. Database migration (Task 1)
2. Supabase client update (Task 2)
3. App handler functions (Task 3)
4. Button rendering (Task 4)
5. Actions box JSX (Task 5)
6. CSS styling (Task 6)
7. Badge display (Task 7)
8. Message filtering (Task 8)
9. Realtime verification (Task 9)
10. Testing (Task 10)
11. Cleanup (Task 11)

---

## Success Criteria

✓ `action_status` column exists in messages table
✓ Three mutually-exclusive states work: null → pending ↔ actioned
✓ Buttons show conditionally (null: 1 button, pending: 2 buttons, actioned: 1 button)
✓ Buttons highlight when active
✓ "Actions" box displays two sections (Pending, Actioned)
✓ Messages move between sections on status change
✓ Realtime updates propagate across users
✓ Mobile responsive
✓ All old "actioned_at" code removed or refactored
