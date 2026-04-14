# Simplified Action System Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current scattered action UI with a clean two-step action button and dedicated actions box at the top, reducing visual clutter and improving navigation.

**Architecture:** New `ActionButton` component opens a simple popover with two options (action required / actioned). Items with action status move to a dedicated "Actions Box" section at the top showing compact summaries. Colored dots appear on messages in the list. The data model already exists; we're purely refactoring the UI layer.

**Tech Stack:** React hooks, CSS variables (amber/green color coding), Supabase `updateActionStatus()` function

---

## Task 1: Create ActionButton Component

**Files:**

- Create: `src/components/ActionButton.jsx`

**Step 1: Write the ActionButton component**

```jsx
import React, { useState, useRef, useEffect } from "react";
import "./ActionButton.css";

export function ActionButton({ message, onStatusChange }) {
  const [isOpen, setIsOpen] = useState(false);
  const popoverRef = useRef(null);

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (popoverRef.current && !popoverRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () =>
        document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleActionClick = (status) => {
    onStatusChange(message.id, status);
    setIsOpen(false);
  };

  const handleClear = () => {
    onStatusChange(message.id, null);
    setIsOpen(false);
  };

  return (
    <div className="action-button-container" ref={popoverRef}>
      <button
        className="action-button"
        onClick={() => setIsOpen(!isOpen)}
        title="Set action status"
      >
        ⚡
      </button>

      {isOpen && (
        <div className="action-popover">
          <button
            className="action-option action-option-pending"
            onClick={() => handleActionClick("pending")}
          >
            Action Required
          </button>
          <button
            className="action-option action-option-actioned"
            onClick={() => handleActionClick("actioned")}
          >
            Actioned
          </button>
          {message.action_status && (
            <button
              className="action-option action-option-clear"
              onClick={handleClear}
            >
              Clear Status
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Create ActionButton.css styling**

```css
.action-button-container {
  position: relative;
  display: inline-block;
}

.action-button {
  background: none;
  border: none;
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: background-color 0.2s;
}

.action-button:hover {
  background-color: var(--bg-muted);
}

.action-popover {
  position: absolute;
  top: 100%;
  right: 0;
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 6px;
  margin-top: 4px;
  z-index: 1000;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  min-width: 160px;
}

.action-option {
  display: block;
  width: 100%;
  padding: 10px 12px;
  border: none;
  background: none;
  text-align: left;
  cursor: pointer;
  font-size: 14px;
  color: var(--text);
  transition: background-color 0.15s;
  border-bottom: 1px solid var(--bg-muted);
}

.action-option:last-child {
  border-bottom: none;
}

.action-option:hover {
  background-color: var(--bg-muted);
}

.action-option-pending {
  color: #f59e0b;
}

.action-option-pending:hover {
  background-color: rgba(245, 158, 11, 0.1);
}

.action-option-actioned {
  color: #10b981;
}

.action-option-actioned:hover {
  background-color: rgba(16, 185, 129, 0.1);
}

.action-option-clear {
  font-size: 12px;
  color: var(--text-secondary);
}

.action-option-clear:hover {
  background-color: var(--bg-muted);
  color: var(--text);
}
```

**Step 3: Verify ActionButton renders**

In a browser, manually click on the button to verify the popover opens and closes correctly. No automated test (component is simple state management).

**Step 4: Commit**

```bash
git add src/components/ActionButton.jsx src/components/ActionButton.css
git commit -m "feat: add ActionButton component with popover menu"
```

---

## Task 2: Create ActionsBox Component

**Files:**

- Create: `src/components/ActionsBox.jsx`
- Create: `src/components/ActionsBox.css`

**Step 1: Write the ActionsBox component**

```jsx
import React, { useState } from "react";
import "./ActionsBox.css";

export function ActionsBox({
  pendingMessages,
  actionedMessages,
  onMessageClick,
}) {
  const [expandedId, setExpandedId] = useState(null);

  const renderCompactRow = (msg, status) => (
    <div
      key={msg.id}
      className={`action-row action-row-${status}`}
      onClick={() => setExpandedId(expandedId === msg.id ? null : msg.id)}
    >
      <div className="action-row-header">
        <div className="action-row-status-dot" />
        <div className="action-row-info">
          <div className="action-row-subject">
            {msg.subject || "(No subject)"}
          </div>
          <div className="action-row-meta">
            <span className="action-row-source">{msg.source}</span>
            <span className="action-row-date">
              {new Date(msg.received_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </div>

      {expandedId === msg.id && (
        <div className="action-row-expanded">
          <div className="action-row-content">{msg.content}</div>
          <button
            className="action-row-view-btn"
            onClick={(e) => {
              e.stopPropagation();
              onMessageClick(msg.id);
            }}
          >
            View Full Message
          </button>
        </div>
      )}
    </div>
  );

  if (pendingMessages.length === 0 && actionedMessages.length === 0) {
    return null;
  }

  return (
    <div className="actions-box">
      {pendingMessages.length > 0 && (
        <div className="actions-section">
          <div className="actions-section-title pending">
            ⏳ Action Required ({pendingMessages.length})
          </div>
          <div className="actions-list">
            {pendingMessages.map((msg) => renderCompactRow(msg, "pending"))}
          </div>
        </div>
      )}

      {actionedMessages.length > 0 && (
        <div className="actions-section">
          <div className="actions-section-title actioned">
            ✓ Actioned ({actionedMessages.length})
          </div>
          <div className="actions-list">
            {actionedMessages.map((msg) => renderCompactRow(msg, "actioned"))}
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Write ActionsBox.css**

```css
.actions-box {
  background: var(--bg-surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  margin-bottom: 20px;
  overflow: hidden;
}

.actions-section {
  border-bottom: 1px solid var(--bg-muted);
}

.actions-section:last-child {
  border-bottom: none;
}

.actions-section-title {
  padding: 12px 16px;
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.actions-section-title.pending {
  background: rgba(245, 158, 11, 0.1);
  color: #f59e0b;
  border-bottom: 1px solid #f59e0b;
}

.actions-section-title.actioned {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
  border-bottom: 1px solid #10b981;
}

.actions-list {
  display: flex;
  flex-direction: column;
}

.action-row {
  padding: 12px 16px;
  border-bottom: 1px solid var(--bg-muted);
  cursor: pointer;
  transition: background-color 0.15s;
  user-select: none;
}

.action-row:last-child {
  border-bottom: none;
}

.action-row:hover {
  background-color: var(--bg-muted);
}

.action-row-header {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.action-row-status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 6px;
  flex-shrink: 0;
}

.action-row-pending .action-row-status-dot {
  background: #f59e0b;
}

.action-row-actioned .action-row-status-dot {
  background: #10b981;
}

.action-row-info {
  flex: 1;
  min-width: 0;
}

.action-row-subject {
  font-weight: 500;
  color: var(--text);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
}

.action-row-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: var(--text-secondary);
}

.action-row-source {
  text-transform: capitalize;
}

.action-row-expanded {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--bg-muted);
}

.action-row-content {
  font-size: 13px;
  color: var(--text);
  line-height: 1.5;
  margin-bottom: 10px;
  max-height: 150px;
  overflow-y: auto;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.action-row-view-btn {
  background: var(--primary);
  color: white;
  border: none;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.action-row-view-btn:hover {
  opacity: 0.9;
}

@media (max-width: 768px) {
  .action-row-meta {
    flex-direction: column;
    gap: 2px;
  }

  .action-row-subject {
    font-size: 13px;
  }
}
```

**Step 3: Manual verification**

Will verify during integration in App.jsx.

**Step 4: Commit**

```bash
git add src/components/ActionsBox.jsx src/components/ActionsBox.css
git commit -m "feat: add ActionsBox component showing pending and actioned items"
```

---

## Task 3: Add Action Status Indicator Dot to Messages

**Files:**

- Modify: `src/App.css`

**Step 1: Add CSS for action status dot**

In `src/App.css`, find the `.message` or `.message-header` class and add this rule:

```css
.message-action-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-left: 8px;
  vertical-align: middle;
}

.message-action-indicator.pending {
  background: #f59e0b;
}

.message-action-indicator.actioned {
  background: #10b981;
}
```

**Step 2: Verify CSS loads**

Build and check the stylesheet loads without errors.

**Step 3: Commit**

```bash
git add src/App.css
git commit -m "style: add CSS for action status indicator dots"
```

---

## Task 4: Integrate ActionButton into Message List

**Files:**

- Modify: `src/App.jsx` (around lines 1000–1140 where messages are rendered)

**Step 1: Import ActionButton**

At the top of `src/App.jsx`, add the import:

```jsx
import { ActionButton } from "./components/ActionButton";
```

**Step 2: Find the message render block**

Locate the code around line 1020–1025 where the message subject and action badge are shown. You'll see code like:

```jsx
<span className="message-subject">{msg.subject}</span>;
{
  msg.action_status && (
    <div className="action-status-badge">
      <span
        className={`action-status-label action-status-${msg.action_status}`}
      >
        ...
      </span>
    </div>
  );
}
```

**Step 3: Replace action badge with indicator dot and button**

Replace that section with:

```jsx
<span className="message-subject">
  {msg.subject}
  {msg.action_status && (
    <span className={`message-action-indicator ${msg.action_status}`} />
  )}
</span>
<ActionButton message={msg} onStatusChange={toggleActionStatus} />
```

**Step 4: Remove old inline action buttons**

Find and **delete** the following buttons (around lines 1098–1135):

- `{msg.action_status === null && <button ... "Mark as Pending" ...}`
- `{msg.action_status === "pending" && <button ... "Mark as Actioned" ...}`
- `{msg.action_status === "actioned" && <button ... "Clear Status" ...}`

**Step 5: Test in browser**

Open the app, hover over a message, click the ⚡ button, and verify the popover opens with the two options.

**Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: integrate ActionButton into message list, remove old inline buttons"
```

---

## Task 5: Integrate ActionsBox at Top of Message List

**Files:**

- Modify: `src/App.jsx` (top of message list rendering)

**Step 1: Import ActionsBox**

At the top of `src/App.jsx`:

```jsx
import { ActionsBox } from "./components/ActionsBox";
```

**Step 2: Add state for managing expanded message in actions box**

Add to the state hooks in `App()`:

```jsx
const [expandedActionMessageId, setExpandedActionMessageId] = useState(null);
```

**Step 3: Prepare filtered action messages**

Before the return statement, add:

```jsx
const actionsPending = messages
  .filter((m) => m.action_status === "pending")
  .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));

const actionsCompleted = messages
  .filter((m) => m.action_status === "actioned")
  .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
```

**Step 4: Render ActionsBox at top of messages section**

Find the messages section in the render (around line 937 where "activeTab === messages"). Add `<ActionsBox />` **right before** the messages list:

```jsx
{
  activeTab === "messages" && (
    <div className="messages-container">
      <ActionsBox
        pendingMessages={actionsPending}
        actionedMessages={actionsCompleted}
        onMessageClick={(msgId) => {
          setExpandedMessages(new Set([...expandedMessages, msgId]));
        }}
      />

      <div className="messages-list">
        {/* ... existing message list rendering ... */}
      </div>
    </div>
  );
}
```

**Step 5: Test in browser**

Mark a message as "action required" using the ActionButton. Verify it appears in the ActionsBox at the top. Click on it to expand.

**Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add ActionsBox at top of messages section"
```

---

## Task 6: Remove ActionFilter UI Control (Optional Cleanup)

**Files:**

- Modify: `src/App.jsx`

**Step 1: Identify actionFilter UI**

Search for where `setActionFilter` is called in the JSX (the filter dropdown).

**Step 2: Remove the action filter control**

Delete the dropdown/control for filtering by "Pending", "Actioned", "All". The ActionsBox now serves this purpose.

**Step 3: Keep the state variable**

Leave `actionFilter` state as-is (not used, no harm).

**Step 4: Test in browser**

Verify the filter UI is gone, ActionsBox still shows pending/actioned correctly.

**Step 5: Commit**

```bash
git add src/App.jsx
git commit -m "refactor: remove actionFilter dropdown UI, ActionsBox replaces it"
```

---

## Task 7: Final Testing & Visual Polish

**Files:**

- Verify: `src/App.css` (if needed, adjust spacing/colors)

**Step 1: Test the complete flow**

- Open the app
- Click ActionButton on a message → select "Action Required"
- Verify: colored dot appears on message, item moves to ActionsBox
- Click item in ActionsBox → expands to show full message
- Click "View Full Message" → scrolls to it in the main list
- Click ActionButton again → change to "Actioned"
- Verify: message moves to "Actioned" section in ActionsBox, dot color changes to green
- Click "Clear Status" from button → item disappears from ActionsBox

**Step 2: Check mobile responsiveness (768px breakpoint)**

- Resize browser to mobile width
- Verify ActionsBox still readable, action rows stack properly
- Verify ActionButton popover is still accessible

**Step 3: Check dark theme consistency**

- All colors match CSS variables
- No hardcoded colors outside `:root`

**Step 4: Commit**

```bash
git add src/App.css
git commit -m "style: final polish for simplified action system"
```

---

## Task 8: Build & Verify

**Files:**

- None (verification step)

**Step 1: Run production build**

```bash
npm run build
```

Expected: Build succeeds, no new errors.

**Step 2: Verify no console errors**

Open DevTools console, reload, check for errors.

**Step 3: Commit**

```bash
git add -A
git commit -m "build: verify simplified action system builds cleanly" || echo "No changes to commit"
```

---

## Summary

This plan replaces the scattered, busy action UI with:

1. ✅ One-click ActionButton (⚡) on each message
2. ✅ Clean popover with two options + clear
3. ✅ Dedicated ActionsBox at the top (amber pending, green actioned)
4. ✅ Colored dots on messages in the list
5. ✅ Expandable rows in ActionsBox to view content
6. ✅ Removed old inline action buttons

The data model is unchanged; only the UI is refactored for clarity.
