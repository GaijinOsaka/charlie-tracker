# Mobile Responsiveness Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform Charlie Tracker into a fully responsive mobile-first app with proper text constraints, mobile navigation (hamburger menu), collapsible filters, and touch-friendly UI.

**Architecture:**

- Mobile-first CSS with breakpoints at 320px, 480px, 768px, 1024px
- Hamburger menu for navigation on screens <768px (drawer component)
- Collapsible/scrollable filter sections on mobile
- Text overflow handling with word-break and ellipsis utilities
- Touch-friendly button/interactive element sizing (48px minimum)
- Responsive spacing and padding hierarchy

**Tech Stack:** React, CSS with media queries, localStorage for mobile preferences

---

## Task 1: Add Mobile Breakpoint Variables & Utilities to CSS

**Files:**

- Modify: `src/App.css:1-100` (CSS variables section)

**Step 1: Add responsive design utilities**

After the color variables and before the `html` selector, add:

```css
/* Mobile Breakpoints */
:root {
  --bp-mobile: 320px;
  --bp-tablet: 480px;
  --bp-small-desktop: 768px;
  --bp-desktop: 1024px;
  --bp-large: 1200px;
}

/* Text Overflow Utilities */
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.truncate-lines-2 {
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  word-break: break-word;
}

.word-break {
  word-break: break-word;
  overflow-wrap: break-word;
}

/* Touch-Friendly Button Sizing */
.btn-touch {
  min-height: 48px;
  min-width: 48px;
  padding: 12px 16px;
}

/* Mobile Utilities */
.hide-mobile {
  display: none;
}

.hide-desktop {
  display: block;
}

@media (min-width: 768px) {
  .hide-mobile {
    display: block;
  }

  .hide-desktop {
    display: none;
  }
}
```

**Step 2: Verify CSS syntax**

Run: `npm run build`

Expected: Build succeeds with no CSS errors

**Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat: add mobile breakpoint variables and text overflow utilities"
```

---

## Task 2: Create Mobile Navigation Drawer Component

**Files:**

- Create: `src/components/MobileNav.jsx`
- Modify: `src/App.jsx:1-30` (imports and state)
- Modify: `src/App.css` (append drawer styles)

**Step 1: Create MobileNav component**

Create `src/components/MobileNav.jsx`:

```jsx
import React from "react";
import "../styles/MobileNav.css";

export default function MobileNav({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  unreadCount,
}) {
  const tabs = [
    { id: "messages", label: "Messages", icon: "💬" },
    { id: "events", label: "Events", icon: "📅" },
    { id: "calendar", label: "Calendar", icon: "🗓️" },
    { id: "documents", label: "Documents", icon: "📄" },
    { id: "settings", label: "Settings", icon: "⚙️" },
  ];

  const handleTabClick = (tabId) => {
    onTabChange(tabId);
    onClose();
  };

  return (
    <>
      {isOpen && <div className="mobile-nav-overlay" onClick={onClose} />}
      <nav className={`mobile-nav ${isOpen ? "open" : ""}`}>
        <div className="mobile-nav-header">
          <h2>Menu</h2>
          <button className="mobile-nav-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <ul className="mobile-nav-list">
          {tabs.map((tab) => (
            <li key={tab.id}>
              <button
                className={`mobile-nav-item ${activeTab === tab.id ? "active" : ""}`}
                onClick={() => handleTabClick(tab.id)}
              >
                <span className="mobile-nav-icon">{tab.icon}</span>
                <span className="mobile-nav-label">{tab.label}</span>
                {tab.id === "messages" && unreadCount > 0 && (
                  <span className="mobile-nav-badge">{unreadCount}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
```

**Step 2: Create MobileNav styles**

Create `src/styles/MobileNav.css`:

```css
.mobile-nav-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  z-index: 998;
}

.mobile-nav {
  position: fixed;
  left: -100%;
  top: 0;
  width: 80%;
  max-width: 300px;
  height: 100vh;
  background: var(--bg-secondary);
  border-right: 1px solid var(--border);
  transition: left 0.3s ease;
  z-index: 999;
  overflow-y: auto;
}

.mobile-nav.open {
  left: 0;
}

.mobile-nav-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid var(--border);
}

.mobile-nav-header h2 {
  font-size: 1.2rem;
  margin: 0;
  color: var(--text);
}

.mobile-nav-close {
  background: transparent;
  border: none;
  color: var(--text);
  font-size: 1.5rem;
  cursor: pointer;
  padding: 0;
  width: 40px;
  height: 40px;
}

.mobile-nav-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.mobile-nav-item {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 16px 20px;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  text-align: left;
  cursor: pointer;
  transition: all 0.2s ease;
  border-left: 4px solid transparent;
  gap: 12px;
}

.mobile-nav-item:hover {
  background: var(--bg-tertiary);
  color: var(--text);
}

.mobile-nav-item.active {
  background: var(--bg-tertiary);
  color: var(--primary);
  border-left-color: var(--primary);
  font-weight: 600;
}

.mobile-nav-icon {
  font-size: 1.2rem;
}

.mobile-nav-label {
  flex: 1;
}

.mobile-nav-badge {
  background: var(--danger);
  color: white;
  border-radius: 50%;
  padding: 2px 8px;
  font-size: 0.75rem;
  font-weight: 600;
  min-width: 24px;
  text-align: center;
}
```

**Step 3: Update App.jsx to use MobileNav**

Add to imports (after line 10):

```jsx
import MobileNav from "./components/MobileNav";
```

Add to state (after line 43):

```jsx
const [mobileNavOpen, setMobileNavOpen] = useState(false);
```

Update header-right section (around line 430):

```jsx
<div className="header-right">
  <button
    className="hamburger-btn hide-desktop"
    onClick={() => setMobileNavOpen(true)}
    title="Open menu"
  >
    ☰
  </button>
  <NotificationBell onNavigateToMessage={navigateToMessage} />
  <span className="user-name">{profile?.display_name}</span>
  <button
    className="theme-toggle-btn"
    onClick={toggleTheme}
    title="Toggle light/dark mode"
  >
    {theme === "light" ? "🌙" : "☀️"}
  </button>
  <button className="sign-out-btn" onClick={signOut}>
    Sign Out
  </button>
</div>
```

Add before `</div>` closing tag of return statement (before ChatDrawer, around line 840):

```jsx
<MobileNav
  isOpen={mobileNavOpen}
  onClose={() => setMobileNavOpen(false)}
  activeTab={activeTab}
  onTabChange={setActiveTab}
  unreadCount={messages.filter((m) => !m.is_read).length}
/>
```

**Step 4: Add hamburger button styles to App.css**

Append to App.css:

```css
.hamburger-btn {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1.2rem;
  transition: all 0.2s ease;
  min-width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.hamburger-btn:hover {
  border-color: var(--primary);
  color: var(--primary);
  background: rgba(102, 102, 102, 0.05);
}
```

**Step 5: Build and test**

Run: `npm run build`

Expected: Build succeeds, no errors

**Step 6: Commit**

```bash
git add src/components/MobileNav.jsx src/styles/MobileNav.css src/App.jsx src/App.css
git commit -m "feat: add mobile navigation drawer with hamburger menu"
```

---

## Task 3: Add Comprehensive Media Query Breakpoints for App Layout

**Files:**

- Modify: `src/App.css:1635-1700` (existing media queries)

**Step 1: Replace and expand media queries**

Replace the entire mobile media query block starting at line 1635 with comprehensive responsive design:

```css
/* ===== MOBILE FIRST RESPONSIVE DESIGN ===== */

/* Extra Small (320px - 479px) */
@media (max-width: 479px) {
  .app {
    padding: 20px 12px;
  }

  header {
    margin-bottom: 32px;
    padding-bottom: 20px;
  }

  header h1 {
    font-size: 1.5rem;
  }

  header .subtitle {
    font-size: 0.85rem;
  }

  .header-right {
    gap: 12px;
  }

  .user-name {
    display: none;
  }

  .sign-out-btn {
    padding: 6px 10px;
    font-size: 0.8rem;
  }

  .tab-nav {
    gap: 8px;
    margin-bottom: 24px;
    padding-bottom: 12px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .tab-btn {
    padding: 10px 14px;
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .filters {
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    margin-bottom: 20px;
    border-radius: 8px;
  }

  .filter-group {
    width: 100%;
  }

  .filter-group label {
    font-size: 0.85rem;
  }

  .filter-group select,
  .filter-group input {
    padding: 8px 10px;
    font-size: 0.9rem;
    border-radius: 6px;
  }

  .filter-group.search {
    min-width: auto;
  }

  .message-list,
  .event-list {
    gap: 12px;
  }

  .message-item {
    padding: 16px;
    border-radius: 10px;
  }

  .message-header {
    flex-direction: column;
    gap: 8px;
  }

  .message-info {
    width: 100%;
  }

  .message-subject {
    font-size: 0.95rem;
    word-break: break-word;
  }

  .message-sender {
    font-size: 0.85rem;
    word-break: break-word;
  }

  .message-time {
    font-size: 0.8rem;
  }

  .message-meta {
    width: 100%;
    flex-wrap: wrap;
    gap: 8px;
  }

  .source-badge {
    font-size: 0.75rem;
    padding: 4px 8px;
  }

  .btn-action,
  .btn-read {
    padding: 8px 12px;
    font-size: 0.8rem;
    border-radius: 6px;
  }

  .cal {
    padding: 12px;
  }

  .cal-title {
    font-size: 0.9rem;
    min-width: 120px;
  }

  .cal-cell {
    min-height: 48px;
    padding: 3px;
    font-size: 0.75rem;
  }

  .event-item {
    padding: 12px;
  }

  .event-title {
    font-size: 0.95rem;
  }

  .event-desc {
    font-size: 0.85rem;
  }

  .event-meta {
    gap: 6px;
    flex-wrap: wrap;
  }

  .event-tag {
    font-size: 0.75rem;
    padding: 2px 6px;
  }

  .actioned-item {
    padding: 12px;
  }

  .actioned-subject {
    font-size: 0.9rem;
    word-break: break-word;
  }

  .actioned-meta {
    font-size: 0.8rem;
  }

  .tab-badge {
    font-size: 0.7rem;
    min-width: 18px;
    min-height: 18px;
    padding: 2px 4px;
  }
}

/* Small (480px - 767px) */
@media (min-width: 480px) and (max-width: 767px) {
  .app {
    padding: 28px 16px;
  }

  header h1 {
    font-size: 2rem;
  }

  header .subtitle {
    font-size: 0.9rem;
  }

  .tab-nav {
    gap: 10px;
    margin-bottom: 32px;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }

  .tab-btn {
    padding: 10px 16px;
    font-size: 0.9rem;
  }

  .filters {
    flex-direction: column;
    gap: 14px;
    padding: 20px;
    margin-bottom: 24px;
  }

  .message-item {
    padding: 18px;
  }

  .message-subject {
    font-size: 1rem;
  }

  .message-sender {
    font-size: 0.9rem;
  }

  .cal {
    padding: 14px;
  }

  .cal-title {
    font-size: 0.95rem;
    min-width: 130px;
  }

  .cal-cell {
    min-height: 50px;
    padding: 4px;
    font-size: 0.8rem;
  }
}

/* Medium (768px - 1023px) */
@media (min-width: 768px) and (max-width: 1023px) {
  .app {
    padding: 36px 24px;
  }

  .tab-nav {
    gap: 10px;
    margin-bottom: 36px;
  }

  .filters {
    flex-direction: row;
    gap: 16px;
    padding: 24px;
    margin-bottom: 28px;
  }

  .filter-group.search {
    min-width: 180px;
  }

  .message-item {
    padding: 20px;
  }

  .cal-title {
    min-width: 140px;
  }
}

/* Large (1024px+) */
@media (min-width: 1024px) {
  .hide-desktop {
    display: none !important;
  }

  .app {
    padding: 48px 32px;
  }
}
```

**Step 2: Update .app max-width for all screens**

Find and update:

```css
.app {
  min-height: 100vh;
  padding: 48px 32px;
  max-width: 1200px;
  margin: 0 auto;
}
```

To:

```css
.app {
  min-height: 100vh;
  padding: 48px 32px;
  max-width: 100%;
  width: 100%;
  margin: 0 auto;
}

@media (min-width: 1024px) {
  .app {
    max-width: 1200px;
  }
}
```

**Step 3: Build and verify**

Run: `npm run build`

Expected: Build succeeds, no errors

**Step 4: Commit**

```bash
git add src/App.css
git commit -m "feat: add comprehensive mobile-first responsive design with multiple breakpoints"
```

---

## Task 4: Fix Text Overflow in Message/Event Cards

**Files:**

- Modify: `src/App.css` (find message-item and event-item sections)

**Step 1: Add word-break and truncate classes to message styling**

Find `.message-subject` (around line 290) and update:

```css
.message-subject {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text);
  margin: 0 0 4px 0;
  word-break: break-word;
  overflow-wrap: break-word;
}
```

Find `.message-sender` and update:

```css
.message-sender {
  font-size: 0.9rem;
  color: var(--text-secondary);
  word-break: break-word;
  overflow-wrap: break-word;
}
```

Find `.message-content` and update:

```css
.message-content {
  padding: 16px 0;
  color: var(--text);
  line-height: 1.6;
  word-break: break-word;
  overflow-wrap: break-word;
}
```

**Step 2: Add word-break to event styling**

Find `.event-title` and update:

```css
.event-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text);
  margin-bottom: 4px;
  word-break: break-word;
  overflow-wrap: break-word;
}
```

Find `.event-desc` and update:

```css
.event-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 6px;
  word-break: break-word;
  overflow-wrap: break-word;
}
```

Find `.event-month` and add min-width constraint:

```css
.event-month {
  font-size: 12px;
  font-weight: 700;
  color: var(--primary);
  text-transform: uppercase;
  min-width: 40px;
}
```

**Step 3: Build and verify**

Run: `npm run build`

Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/App.css
git commit -m "fix: add word-break and overflow handling to message/event cards"
```

---

## Task 5: Optimize Header for Mobile

**Files:**

- Modify: `src/App.css` (header section)

**Step 1: Make header responsive**

Find `.header-top` and update:

```css
.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

@media (max-width: 479px) {
  .header-top {
    gap: 12px;
  }
}
```

Find `.header-right` and update:

```css
.header-right {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}

@media (max-width: 479px) {
  .header-right {
    gap: 10px;
  }
}

@media (max-width: 767px) {
  .header-right {
    order: -1;
    width: 100%;
    justify-content: space-between;
  }
}
```

Find `.user-name` and update:

```css
.user-name {
  color: var(--text-secondary);
  font-size: 0.95rem;
  font-weight: 500;
}

@media (max-width: 479px) {
  .user-name {
    display: none;
  }
}
```

**Step 2: Update header styles for small screens**

Find `header h1` and add:

```css
header h1 {
  font-family: "Inter", sans-serif;
  font-size: 2.5rem;
  font-weight: 700;
  color: var(--text);
  margin: 0;
}

@media (max-width: 479px) {
  header h1 {
    font-size: 1.5rem;
  }
}

@media (max-width: 767px) {
  header h1 {
    font-size: 1.75rem;
  }
}
```

**Step 3: Build and verify**

Run: `npm run build`

Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/App.css
git commit -m "feat: optimize header layout for mobile screens"
```

---

## Task 6: Make Tab Navigation Mobile-Friendly

**Files:**

- Modify: `src/App.css` (tab-nav section)

**Step 1: Add horizontal scrolling to tabs on mobile**

Find `.tab-nav` and update:

```css
.tab-nav {
  display: flex;
  gap: 12px;
  margin-bottom: 40px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 20px;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
  scroll-behavior: smooth;
}

@media (max-width: 767px) {
  .tab-nav {
    gap: 8px;
    margin-bottom: 28px;
    padding-bottom: 16px;
    -ms-overflow-style: none;
    scrollbar-width: none;
  }

  .tab-nav::-webkit-scrollbar {
    display: none;
  }
}
```

Find `.tab-btn` and update:

```css
.tab-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  padding: 12px 20px;
  cursor: pointer;
  font-size: 0.95rem;
  font-weight: 500;
  transition: all 0.2s ease;
  border-radius: 8px;
  position: relative;
  white-space: nowrap;
  flex-shrink: 0;
}

@media (max-width: 767px) {
  .tab-btn {
    padding: 10px 16px;
    font-size: 0.9rem;
  }
}
```

**Step 2: Build and verify**

Run: `npm run build`

Expected: Build succeeds

**Step 3: Commit**

```bash
git add src/App.css
git commit -m "feat: add horizontal scrolling for tab navigation on mobile"
```

---

## Task 7: Create Collapsible Filter Section Component

**Files:**

- Create: `src/components/MobileFilters.jsx`
- Modify: `src/App.jsx` (conditional rendering)
- Modify: `src/App.css` (append styles)

**Step 1: Create MobileFilters component**

Create `src/components/MobileFilters.jsx`:

```jsx
import React, { useState } from "react";

export default function MobileFilters({
  statusFilter,
  setStatusFilter,
  sourceFilter,
  setSourceFilter,
  searchQuery,
  setSearchQuery,
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="mobile-filters hide-desktop">
      <button
        className="mobile-filters-toggle"
        onClick={() => setIsOpen(!isOpen)}
      >
        🔍 Filters {isOpen ? "▲" : "▼"}
      </button>

      {isOpen && (
        <div className="mobile-filters-panel">
          <div className="filter-group">
            <label>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">All Messages</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Source</label>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
            >
              <option value="all">All Sources</option>
              <option value="arbor">Arbor</option>
              <option value="gmail">Gmail</option>
            </select>
          </div>

          <div className="filter-group search">
            <label>Search</label>
            <input
              type="text"
              placeholder="Search messages..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update App.jsx to use MobileFilters**

Add import after other component imports:

```jsx
import MobileFilters from "./components/MobileFilters";
```

In the messages tab rendering section, replace the existing `.filters` div with:

```jsx
{
  activeTab === "messages" && (
    <>
      <MobileFilters
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        sourceFilter={sourceFilter}
        setSourceFilter={setSourceFilter}
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
      />

      <div className="filters hide-mobile">
        <div className="filter-group">
          <label>Status</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">All Messages</option>
            <option value="unread">Unread</option>
            <option value="read">Read</option>
          </select>
        </div>

        <div className="filter-group">
          <label>Source</label>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
          >
            <option value="all">All Sources</option>
            <option value="arbor">Arbor</option>
            <option value="gmail">Gmail</option>
          </select>
        </div>

        <div className="filter-group search">
          <label>Search</label>
          <input
            type="text"
            placeholder="Search messages..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>
    </>
  );
}
```

**Step 3: Add MobileFilters styles to App.css**

Append to App.css:

```css
/* Mobile Filters Component */
.mobile-filters {
  margin-bottom: 20px;
}

.mobile-filters-toggle {
  width: 100%;
  padding: 14px 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mobile-filters-toggle:hover {
  background: var(--bg-tertiary);
  border-color: var(--primary);
}

.mobile-filters-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 12px;
  padding: 16px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 10px;
  animation: slideDown 0.2s ease;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

**Step 4: Build and verify**

Run: `npm run build`

Expected: Build succeeds

**Step 5: Commit**

```bash
git add src/components/MobileFilters.jsx src/App.jsx src/App.css
git commit -m "feat: add collapsible mobile filters component"
```

---

## Task 8: Ensure Touch-Friendly Button Sizes

**Files:**

- Modify: `src/App.css` (find all button styles)

**Step 1: Update button sizing for touch**

Find and update all button styles to meet 48px minimum:

```css
.sign-out-btn,
.theme-toggle-btn,
.hamburger-btn {
  min-height: 44px;
  min-width: 44px;
  padding: 10px 14px;
}

.tab-btn {
  min-height: 40px;
  padding: 12px 20px;
}

.btn-action,
.btn-read,
.btn-batch-clear,
.btn-doc,
.btn-event-delete {
  min-height: 40px;
  padding: 10px 16px;
  border-radius: 8px;
}

@media (max-width: 767px) {
  .btn-action,
  .btn-read,
  .btn-batch-clear,
  .btn-doc {
    min-height: 44px;
    padding: 12px 16px;
    font-size: 0.95rem;
  }
}
```

**Step 2: Add touch-friendly hover states**

Update button hover states:

```css
@media (hover: hover) {
  .tab-btn:hover {
    color: var(--text);
    background: rgba(102, 102, 102, 0.08);
  }
}

/* Touch devices skip hover, use active states */
@media (hover: none) {
  .tab-btn:active {
    background: rgba(102, 102, 102, 0.12);
  }
}
```

**Step 3: Build and verify**

Run: `npm run build`

Expected: Build succeeds

**Step 4: Commit**

```bash
git add src/App.css
git commit -m "feat: ensure all buttons meet 44px minimum touch-friendly sizing"
```

---

## Task 9: Add Viewport Meta Tag & PWA Updates

**Files:**

- Modify: `index.html`

**Step 1: Ensure proper viewport meta tag**

In `index.html`, verify the viewport meta tag exists (in `<head>`):

```html
<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover"
/>
```

Update to include safe area insets for notched devices:

```html
<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0, maximum-scale=5.0, user-scalable=yes, viewport-fit=cover"
/>
<meta
  name="theme-color"
  content="#ffffff"
  media="(prefers-color-scheme: light)"
/>
<meta
  name="theme-color"
  content="#000000"
  media="(prefers-color-scheme: dark)"
/>
```

**Step 2: Verify manifest.json**

Ensure `public/manifest.json` includes proper mobile app metadata:

```json
{
  "name": "Charlie Tracker",
  "short_name": "CT",
  "description": "Communication Dashboard for Charlie Oakes",
  "start_url": "/",
  "display": "standalone",
  "scope": "/",
  "orientation": "portrait-primary",
  "theme_color": "#000000",
  "background_color": "#ffffff"
}
```

**Step 3: Build and verify**

Run: `npm run build`

Expected: Build succeeds

**Step 4: Commit**

```bash
git add index.html public/manifest.json
git commit -m "feat: add proper viewport and PWA meta tags for mobile"
```

---

## Task 10: Test Responsive Design at Key Breakpoints

**Files:**

- No files modified (testing/verification task)

**Step 1: Test at 320px (iPhone SE)**

Using browser DevTools:

1. Open Chrome DevTools (F12)
2. Click Device Toggle (Ctrl+Shift+M)
3. Select iPhone SE (375px width, but test at 320px)
4. Resize manually to 320px

Verify:

- [ ] Navigation hamburger menu appears and works
- [ ] Header stacks properly (no text overflow)
- [ ] Filters collapse into collapsible component
- [ ] Message cards display properly (no horizontal scroll)
- [ ] Tab nav scrolls horizontally
- [ ] All buttons are at least 44px tall
- [ ] Text wraps properly in all containers

**Step 2: Test at 480px (small tablet)**

Resize to 480px:

- [ ] Filters still collapsed or partially visible
- [ ] All cards readable
- [ ] No text overflow
- [ ] Navigation still accessible

**Step 3: Test at 768px (iPad)**

Resize to 768px:

- [ ] Hamburger menu disappears, tab nav shows
- [ ] Desktop filters appear inline
- [ ] Layout transitions smoothly
- [ ] All text is readable

**Step 4: Test at 1024px+ (desktop)**

Resize to 1200px:

- [ ] Full desktop layout visible
- [ ] Hamburger menu hidden
- [ ] All filters visible
- [ ] Mobile components hidden

**Step 5: Test on actual devices**

If available:

- [ ] Test on iPhone 12 (390px)
- [ ] Test on Android phone (360-412px)
- [ ] Test on iPad (768px)
- [ ] Test touch scrolling and interactions

**Step 6: Document results**

Create a mobile testing checklist file: `docs/MOBILE_TESTING.md`

```markdown
# Mobile Responsiveness Testing Checklist

## Devices Tested

- [ ] iPhone SE (375px)
- [ ] iPhone 12 (390px)
- [ ] Android Phone (360px)
- [ ] iPad (768px)
- [ ] Desktop (1200px)

## Features Tested

- [ ] Hamburger menu opens/closes
- [ ] Filters collapse on mobile
- [ ] Text does not overflow boxes
- [ ] All buttons touch-friendly (44px+)
- [ ] Tab navigation scrolls horizontally
- [ ] Smooth transitions between breakpoints
- [ ] Light/dark mode works on all sizes
- [ ] Notifications work on mobile
- [ ] Forms accessible on mobile

## Issues Found

[Document any issues found during testing]

## Date Tested

[Date]
```

**Step 7: Commit testing results**

```bash
git add docs/MOBILE_TESTING.md
git commit -m "docs: add mobile responsiveness testing checklist"
```

---

## Summary

**Total Tasks:** 10
**Estimated Time:** 4-6 hours
**Key Features Implemented:**

- ✅ Mobile-first responsive design (320px, 480px, 768px, 1024px breakpoints)
- ✅ Hamburger menu drawer navigation
- ✅ Collapsible mobile filters
- ✅ Text overflow handling (word-break, ellipsis)
- ✅ Touch-friendly button sizing (44px minimum)
- ✅ Horizontal scrolling tab navigation
- ✅ Optimized header layout
- ✅ Smooth theme transitions on all screen sizes

**Testing Required:**

- Manual testing at key breakpoints
- Device testing (if available)
- Browser DevTools responsive mode testing

---

## Execution Handoff

**Plan saved to:** `docs/plans/2026-03-12-mobile-responsiveness.md`

**Execution Options:**

**1. Subagent-Driven (this session)** - I dispatch fresh subagent per task, review between tasks, fast iteration

**2. Parallel Session (separate)** - Open new session with executing-plans, batch execution with checkpoints

**Which approach would you prefer?**
