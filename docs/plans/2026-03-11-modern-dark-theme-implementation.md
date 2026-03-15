# Modern Dark Theme Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Charlie Tracker from a warm, vintage aesthetic to a modern dark mode interface with improved contrast, contemporary styling, and smooth interactions.

**Architecture:** Multi-phase implementation starting with CSS variables and base styling, then updating components systematically, adding animations and polish in final phases. All styling changes in `App.css` and component-specific styles, no structural changes to JSX.

**Tech Stack:** React, CSS3 (variables, transitions, box-shadow, transforms), Vite bundler

---

## Phase 1: Core Styling & CSS Variables

### Task 1: Update CSS Variables and Base Styles

**Files:**

- Modify: `src/App.css:1-60` (CSS variables section)

**Step 1: Replace CSS color variables**

Current variables in `:root` starting at line 1. Replace entire color variable block (lines 1-17) with:

```css
:root {
  --primary: #06b6d4;
  --primary-dark: #0891b2;
  --primary-light: #22d3ee;
  --accent: #ec4899;
  --accent-dark: #db2777;
  --success: #10b981;
  --danger: #ef4444;
  --warning: #f59e0b;

  --bg: #0f172a;
  --bg-secondary: #1e293b;
  --bg-tertiary: #334155;

  --border: #334155;
  --border-light: #475569;

  --text: #f1f5f9;
  --text-secondary: #cbd5e1;
  --text-tertiary: #94a3b8;

  --shadow-sm: 0 4px 12px rgba(0, 0, 0, 0.3);
  --shadow-md: 0 8px 16px rgba(0, 0, 0, 0.4);
  --glow: 0 0 12px rgba(6, 182, 212, 0.3);
}
```

**Step 2: Update base body and app styles**

Replace lines 51-64 (body and .app styles):

```css
body {
  font-family: "Inter", "Raleway", sans-serif;
  background: linear-gradient(135deg, #0f172a 0%, #1a1f2e 100%);
  color: var(--text);
  line-height: 1.7;
  letter-spacing: 0.5px;
}

.app {
  min-height: 100vh;
  padding: 32px 24px;
  max-width: 1200px;
  margin: 0 auto;
}
```

**Step 3: Update scrollbar colors**

Replace lines 27-49 (scrollbar styles):

```css
html {
  scrollbar-color: var(--primary) var(--border);
  scrollbar-width: thin;
}

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: var(--border);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: var(--primary);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--primary-light);
}
```

**Step 4: Verify changes in browser**

Run: `npm run dev`
Expected: App loads with dark blue/charcoal background, cyan accents visible in any interactive elements. Text is bright and readable.

**Step 5: Commit**

```bash
git add src/App.css
git commit -m "feat: update CSS variables for modern dark theme"
```

---

### Task 2: Update Header Styling

**Files:**

- Modify: `src/App.css` (header section, approximately lines 66-100)

**Step 1: Rewrite header styles**

Find and replace the entire `header` block:

```css
header {
  margin-bottom: 40px;
  padding-bottom: 24px;
  border-bottom: 1px solid var(--border);
  animation: slideDown 0.5s ease-out;
}

header h1 {
  font-family: "Inter", sans-serif;
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}

header .subtitle {
  color: var(--text-secondary);
  font-size: 0.95rem;
  margin-top: 4px;
}

.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}

.user-name {
  color: var(--text-secondary);
  font-size: 0.95rem;
  font-weight: 500;
}

.sign-out-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
  transition: all 0.2s ease;
}

.sign-out-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: rgba(6, 182, 212, 0.05);
}
```

**Step 2: Verify header appearance**

Run: `npm run dev` and check:

- Title is large, bold, white
- Subtitle is subtle gray
- Sign out button has cyan border on hover
- Layout is clean and spacious

**Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat: modernize header styling with dark theme"
```

---

### Task 3: Update Navigation Tabs

**Files:**

- Modify: `src/App.css` (tab-nav and tab-btn sections)

**Step 1: Rewrite tab navigation styles**

Find `.tab-nav` and `.tab-btn` rules. Replace with:

```css
.tab-nav {
  display: flex;
  gap: 8px;
  margin-bottom: 32px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 16px;
}

.tab-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 8px 16px;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 500;
  transition: all 0.2s ease;
  border-radius: 6px;
  position: relative;
}

.tab-btn:hover {
  color: var(--text);
  background: rgba(6, 182, 212, 0.1);
}

.tab-btn.active {
  background: var(--primary);
  color: var(--bg);
  font-weight: 600;
}

.tab-badge {
  display: inline-block;
  background: var(--accent);
  color: white;
  border-radius: 12px;
  padding: 2px 8px;
  margin-left: 8px;
  font-size: 0.8rem;
  font-weight: 600;
}
```

**Step 2: Verify tab styling**

Check in browser:

- Inactive tabs are gray
- Active tab has cyan background with dark text
- Hover effect shows subtle cyan background
- Badge is pink and visible

**Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat: modernize tab navigation with pill-style active state"
```

---

## Phase 2: Component Styling

### Task 4: Update Button Styles

**Files:**

- Modify: `src/App.css` (button section)

**Step 1: Create comprehensive button styles**

Add or replace all button-related styles:

```css
button {
  font-family: inherit;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

/* Primary button style */
.btn-primary,
.btn-mark-read,
.btn-msg-delete {
  background: var(--primary);
  color: var(--bg);
  border: none;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
}

.btn-primary:hover,
.btn-mark-read:hover,
.btn-msg-delete:hover {
  background: var(--primary-dark);
  transform: translateY(-2px);
  box-shadow: var(--glow);
}

.btn-primary:active,
.btn-mark-read:active,
.btn-msg-delete:active {
  transform: scale(0.98);
}

/* Action button */
.btn-action {
  background: var(--accent);
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
}

.btn-action:hover {
  background: var(--accent-dark);
  transform: translateY(-2px);
  box-shadow: 0 0 12px rgba(236, 72, 153, 0.3);
}

.btn-action-undo {
  background: var(--text-tertiary);
  color: var(--bg);
}

.btn-action-undo:hover {
  background: var(--text-secondary);
  box-shadow: 0 0 12px rgba(203, 213, 225, 0.2);
}

/* RAG toggle buttons */
.btn-rag-toggle {
  border: 1px solid var(--success);
  color: var(--success);
  background: transparent;
  padding: 10px 16px;
  border-radius: 8px;
  font-size: 0.9rem;
  font-weight: 600;
}

.btn-rag-toggle:hover {
  background: rgba(16, 185, 129, 0.1);
  transform: translateY(-2px);
}

.btn-rag-add {
  border-color: var(--success);
  color: var(--success);
}

.btn-rag-remove {
  border-color: var(--danger);
  color: var(--danger);
  background: rgba(239, 68, 68, 0.05);
}

.btn-rag-remove:hover {
  background: rgba(239, 68, 68, 0.1);
}

.btn-rag-toggle:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

/* Event delete button */
.btn-event-delete {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 4px 8px;
  transition: all 0.2s ease;
}

.btn-event-delete:hover {
  color: var(--danger);
  transform: scale(1.2);
}

/* Document download button */
.btn-doc-download {
  background: var(--primary);
  color: var(--bg);
  border: none;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-doc-download:hover {
  background: var(--primary-dark);
  transform: translateY(-1px);
  box-shadow: var(--glow);
}

/* Attachment link button */
.attachment-link {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--primary);
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.9rem;
  transition: all 0.2s ease;
  margin-right: 8px;
  margin-bottom: 8px;
}

.attachment-link:hover {
  border-color: var(--primary);
  background: rgba(6, 182, 212, 0.05);
  transform: translateY(-1px);
}
```

**Step 2: Verify button styling**

Check in browser:

- Primary buttons are cyan
- Action buttons are pink
- RAG buttons show green or red outline depending on state
- Hover effects lift buttons and show glow
- Disabled state looks muted

**Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat: modernize button styling with color strategy and hover effects"
```

---

### Task 5: Update Form Controls (Input, Select)

**Files:**

- Modify: `src/App.css` (input and select styles)

**Step 1: Write input and select styles**

Add or replace input/select styles:

```css
input[type="text"],
select {
  background: var(--bg);
  border: 2px solid var(--border);
  color: var(--text);
  padding: 10px 12px;
  border-radius: 6px;
  font-size: 0.95rem;
  font-family: inherit;
  transition: all 0.2s ease;
}

input[type="text"]::placeholder {
  color: var(--text-tertiary);
}

input[type="text"]:focus,
select:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: var(--glow);
  background: var(--bg-secondary);
}

select {
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%2306B6D4' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;
  padding-right: 32px;
}

select option {
  background: var(--bg-secondary);
  color: var(--text);
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-group label {
  color: var(--text-secondary);
  font-size: 0.9rem;
  font-weight: 500;
}

.filters {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  background: var(--bg-secondary);
  padding: 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
}

.filters .filter-group.search input {
  width: 300px;
  max-width: 100%;
}

@media (max-width: 768px) {
  .filters {
    flex-direction: column;
  }

  .filters .filter-group.search input {
    width: 100%;
  }
}
```

**Step 2: Test input focus states**

In browser, click on search input:

- Border should turn cyan
- Glow effect visible
- Background slightly lighter

**Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat: modernize form controls with dark theme styling"
```

---

### Task 6: Update Card and Container Styles

**Files:**

- Modify: `src/App.css` (message-list, event-list, card styles)

**Step 1: Write message list item styles**

```css
.message-list,
.event-list,
.actioned-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.message-item {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s ease;
}

.message-item:hover {
  border-color: var(--border-light);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.message-item.unread {
  border-left: 4px solid var(--primary);
}

.message-item.read {
  opacity: 0.85;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 12px;
  gap: 16px;
}

.message-info {
  flex: 1;
}

.message-subject {
  font-family: "Inter", sans-serif;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 6px 0;
}

.message-sender {
  color: var(--text-secondary);
  font-size: 0.9rem;
  display: block;
  margin-bottom: 4px;
}

.message-time {
  color: var(--text-tertiary);
  font-size: 0.85rem;
}

.message-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
}

.source-badge {
  font-size: 0.75rem;
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.source-arbor {
  background: var(--primary);
  color: var(--bg);
}

.source-gmail {
  background: #4285f4;
  color: white;
}

.unread-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: var(--primary);
  border-radius: 50%;
}

.actioned-badge {
  background: var(--accent);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.actioned-detail {
  color: var(--text-tertiary);
  font-size: 0.85rem;
}

.indexed-badge {
  background: var(--success);
  color: var(--bg);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.message-content {
  color: var(--text-secondary);
  line-height: 1.7;
  margin-bottom: 12px;
  word-wrap: break-word;
}

.message-content.expandable {
  cursor: pointer;
}

.message-content.expandable:hover {
  color: var(--text);
}

.expand-toggle {
  color: var(--primary);
  font-weight: 600;
  font-size: 0.9rem;
  margin-left: 8px;
}

.message-attachments {
  margin-bottom: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border);
}

.attachments-label {
  color: var(--text-secondary);
  font-size: 0.85rem;
  font-weight: 600;
  margin-right: 8px;
}

.attachment-icon {
  margin-right: 4px;
}

.attachment-name {
  color: var(--text);
}

.attachment-size {
  color: var(--text-tertiary);
  font-size: 0.8rem;
  margin-left: 4px;
}

.message-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.message-actions button {
  font-size: 0.85rem;
  padding: 8px 12px;
}
```

**Step 2: Verify message cards**

Check:

- Cards have subtle border and gray background
- Unread messages have left cyan border
- Hover effect lifts card and brightens border
- Badges display with correct colors
- Content is readable

**Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat: modernize message card styling with dark theme"
```

---

### Task 7: Update Event Card Styles

**Files:**

- Modify: `src/App.css` (event-list and event-item styles)

**Step 1: Write event card styles**

```css
.event-item {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.2s ease;
  margin-bottom: 0;
}

.event-item:hover {
  border-color: var(--border-light);
  box-shadow: var(--shadow-md);
  transform: translateY(-1px);
}

.event-item.event-today {
  border-left: 4px solid var(--success);
}

.event-item.event-past {
  opacity: 0.7;
}

.event-item.event-expanded {
  border-color: var(--primary);
}

.event-row {
  display: flex;
  gap: 16px;
  cursor: pointer;
  align-items: flex-start;
  position: relative;
}

.event-date-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: var(--bg);
  padding: 12px 16px;
  border-radius: 6px;
  border: 1px solid var(--border);
  min-width: 70px;
}

.event-day {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text);
}

.event-month {
  font-size: 0.85rem;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.event-time {
  font-size: 0.8rem;
  color: var(--primary);
  margin-top: 4px;
  font-weight: 600;
}

.event-details {
  flex: 1;
}

.event-title {
  font-family: "Inter", sans-serif;
  font-size: 1.05rem;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 6px 0;
}

.event-desc {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin: 4px 0;
}

.event-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
  align-items: center;
}

.event-action-badge {
  background: var(--accent);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.event-today-badge {
  background: var(--success);
  color: var(--bg);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
}

.event-tag {
  background: var(--bg);
  border: 1px solid var(--primary);
  color: var(--primary);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.event-tag:hover {
  background: var(--primary);
  color: var(--bg);
}

.event-source {
  color: var(--text-tertiary);
  font-size: 0.8rem;
}

.event-document-source {
  border-left: 2px solid var(--warning);
  padding-left: 6px;
}

.event-expand-hint {
  color: var(--text-tertiary);
  font-size: 0.8rem;
  margin-left: auto;
}

.btn-event-delete {
  position: absolute;
  right: 0;
  top: 0;
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 8px;
  transition: all 0.2s ease;
}

.btn-event-delete:hover {
  color: var(--danger);
}

.event-message-panel {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--border);
  background: var(--bg);
  padding: 16px;
  border-radius: 6px;
}

.event-message-header {
  margin-bottom: 12px;
}

.event-message-meta-row {
  display: flex;
  gap: 12px;
  align-items: center;
  margin-top: 8px;
  flex-wrap: wrap;
  font-size: 0.9rem;
}

.message-sender {
  color: var(--text-secondary);
}

.message-time {
  color: var(--text-tertiary);
}

.event-doc-panel {
  display: flex;
  align-items: center;
  gap: 12px;
}

.event-doc-icon {
  font-size: 1.5rem;
}

.event-doc-info {
  flex: 1;
}

.event-doc-filename {
  color: var(--text);
  font-weight: 500;
}
```

**Step 2: Verify event cards**

Check:

- Events show date in nice box on left
- Title and description readable
- Today events have green left border
- Past events are slightly faded
- Action required badge is pink
- Tags are interactive

**Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat: modernize event card styling"
```

---

### Task 8: Update Recently Actioned Section

**Files:**

- Modify: `src/App.css` (actioned-box styles)

**Step 1: Write actioned box styles**

```css
.actioned-box {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 24px;
}

.actioned-box-title {
  font-family: "Inter", sans-serif;
  font-size: 1rem;
  font-weight: 600;
  color: var(--primary);
  margin: 0 0 12px 0;
}

.actioned-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.actioned-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px;
  background: var(--bg);
  border-radius: 6px;
  border: 1px solid var(--border);
  gap: 12px;
}

.actioned-info {
  flex: 1;
}

.actioned-subject {
  display: block;
  color: var(--text);
  font-weight: 500;
  font-size: 0.95rem;
  margin-bottom: 2px;
}

.actioned-meta {
  color: var(--text-tertiary);
  font-size: 0.8rem;
}
```

**Step 2: Verify actioned section**

Check in browser - should show recently actioned messages in a card.

**Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat: style recently actioned section"
```

---

## Phase 3: Animations & Polish

### Task 9: Add Transition and Hover Effects

**Files:**

- Modify: `src/App.css` (add transitions throughout)

**Step 1: Add global transitions**

Add after `:root` definition:

```css
* {
  transition:
    color 0.2s ease,
    background-color 0.2s ease,
    border-color 0.2s ease;
}

button {
  transition: all 0.2s ease;
}

input,
select {
  transition: all 0.2s ease;
}
```

**Step 2: Add card lift effects**

Already included in card styles from Task 6-7. Verify by hovering over cards - should lift slightly.

**Step 3: Add focus ring styles**

```css
:focus-visible {
  outline: 2px solid var(--primary);
  outline-offset: 2px;
}

input:focus,
select:focus {
  outline: none;
}
```

**Step 4: Test transitions**

Hover over buttons, cards, inputs - all should animate smoothly.

**Step 5: Commit**

```bash
git add src/App.css
git commit -m "feat: add smooth transitions and hover effects"
```

---

### Task 10: Add Loading and Toast Styling

**Files:**

- Modify: `src/App.css` (loading, error, toast styles)

**Step 1: Update loading and error styles**

```css
.loading-screen {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100vh;
  background: linear-gradient(135deg, var(--bg) 0%, var(--bg-secondary) 100%);
  color: var(--text);
  font-size: 1.2rem;
  font-family: "Inter", sans-serif;
  font-weight: 500;
}

.loading {
  text-align: center;
  color: var(--text-secondary);
  padding: 32px;
  font-style: italic;
}

.error {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid var(--danger);
  color: #fca5a5;
  padding: 16px;
  border-radius: 8px;
  margin-bottom: 16px;
}

.no-messages {
  text-align: center;
  color: var(--text-tertiary);
  padding: 32px;
  font-style: italic;
}

.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.toast {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 16px;
  color: var(--text);
  display: flex;
  justify-content: space-between;
  align-items: center;
  min-width: 300px;
  animation: slideIn 0.3s ease-out;
  box-shadow: var(--shadow-md);
}

.toast p {
  margin: 0;
  flex: 1;
}

.toast-info {
  border-left: 4px solid var(--primary);
}

.toast-success {
  border-left: 4px solid var(--success);
}

.toast-error {
  border-left: 4px solid var(--danger);
}

.toast-warning {
  border-left: 4px solid var(--warning);
}

.toast-close {
  background: transparent;
  border: none;
  color: var(--text-tertiary);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  margin-left: 16px;
  transition: all 0.2s ease;
}

.toast-close:hover {
  color: var(--text);
}

@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(100px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
```

**Step 2: Verify toasts**

Trigger an action that shows a toast - should slide in from right, display with colored left border.

**Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat: add modern toast and loading styles"
```

---

### Task 11: Update Inline Links and Special Elements

**Files:**

- Modify: `src/App.css` (inline-link and other special styles)

**Step 1: Style inline links and special elements**

```css
.inline-link {
  color: var(--primary);
  text-decoration: none;
  font-weight: 500;
  transition: all 0.2s ease;
}

.inline-link:hover {
  color: var(--primary-light);
  text-decoration: underline;
}

/* Chat drawer and modals styling */
.chat-drawer {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text);
}

.modal-overlay {
  background: rgba(0, 0, 0, 0.7);
}

.modal-content {
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  color: var(--text);
}

.modal-header {
  border-bottom: 1px solid var(--border);
}

.modal-footer {
  border-top: 1px solid var(--border);
}
```

**Step 2: Verify links and special elements**

Check that links have correct color and hover state.

**Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat: style inline links and special elements"
```

---

## Phase 4: Testing & Refinement

### Task 12: Cross-Component Testing and Contrast Verification

**Files:**

- Test: Visual inspection in browser, all tabs and components

**Step 1: Test all tabs in browser**

Run: `npm run dev`

Visit each tab and verify:

- **Messages tab:** Cards readable, buttons distinct, hover effects work
- **Events tab:** Events display correctly, dates visible, tags clear
- **Calendar tab:** If visible, check styling is consistent
- **Documents tab:** Check file listing is readable
- **Settings tab:** Check layout is clean

**Step 2: Test contrast ratios**

For critical text:

- Check primary text (`#F1F5F9`) on dark bg (`#0F172A`) = 18.5:1 ✓ (WCAG AAA)
- Check secondary text (`#CBD5E1`) on dark bg = 12:1+ ✓ (WCAG AA)
- Check cyan accent (`#06B6D4`) on dark = 8.5:1 ✓ (WCAG AA)

**Step 3: Test interactive elements**

- Hover buttons - check glow and lift
- Click buttons - check scale feedback
- Focus inputs - check outline visible
- Expand messages - check smooth transition

**Step 4: Test on different screen sizes**

Resize to 1024px, 768px, mobile - check layout adapts.

**Step 5: Document results**

Note any issues found for refinement in next task.

**Step 6: Commit**

```bash
git add -A
git commit -m "test: verify dark theme styling across all components"
```

---

### Task 13: Refinement and Fine-Tuning

**Files:**

- Modify: `src/App.css` (any adjustments needed)

**Step 1: Address any visual issues**

Based on testing in Task 12, adjust:

- Color brightness if any text is hard to read
- Spacing if elements feel cramped
- Border colors if contrast insufficient
- Shadow intensity if too harsh or too subtle

**Common adjustments:**

- If text too dim: Increase text lightness slightly
- If buttons too bright: Reduce saturation
- If spacing feels off: Adjust padding/gap values
- If shadows too strong: Reduce opacity or blur

**Step 2: Optimize animations**

Ensure:

- Transitions are smooth (0.2s-0.3s)
- No janky movements
- Loading states clear

**Step 3: Verify mobile responsiveness**

Check:

- Tabs stack on mobile
- Buttons remain clickable
- Text doesn't overflow
- Filters collapse properly

**Step 4: Final visual check**

Screenshot key components and verify:

- Professional appearance
- Good contrast
- Modern feel
- Consistent styling

**Step 5: Commit refinements**

```bash
git add src/App.css
git commit -m "refine: adjust colors and spacing for optimal appearance"
```

---

### Task 14: Final Verification and Build

**Files:**

- Build and test: Full production build

**Step 1: Build project**

Run: `npm run build`
Expected: Build completes successfully, no errors.

**Step 2: Preview build**

Run: `npm run preview`
Check that app looks identical to dev version.

**Step 3: Test PWA functionality**

If PWA features used, verify they still work in preview.

**Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete modern dark theme implementation

- Updated CSS variables for dark palette (cyan primary, pink accent)
- Modernized all components with high contrast and smooth interactions
- Added animations, transitions, and hover effects
- Verified WCAG AA/AAA contrast ratios
- Tested across all tabs and screen sizes
- Build verified, no regressions"
```

---

## Rollback Plan

If issues arise, revert specific commits:

```bash
git log --oneline  # Find commit hash
git revert <hash>  # Revert specific commit
```

Or reset entire branch to main:

```bash
git checkout feature/modern-dark-theme
git reset --hard main
```

---

## Success Criteria

✓ All text meets WCAG AA contrast (4.5:1 minimum)
✓ All interactive elements have clear hover/focus states
✓ Smooth transitions on all interactions (0.2-0.3s)
✓ Dark theme applied consistently across all components
✓ No layout shifts or regressions
✓ Mobile responsive (tested at 320px, 768px, 1024px+)
✓ Build succeeds with no errors
✓ Professional, modern appearance achieved

---

## Architecture Decisions

**Color Palette:** Cyan primary for modern tech feel, pink for important actions, emerald for success
**Typography:** Inter for headings (modern sans), Raleway for body (maintains existing feel)
**Spacing:** 16px base for breathing room on dark backgrounds, avoids claustrophobic feeling
**Shadows:** Subtle (0.3 opacity) to maintain dark aesthetic without looking flat
**Animations:** Consistent 0.2s easing for responsive feel without jarring movement
