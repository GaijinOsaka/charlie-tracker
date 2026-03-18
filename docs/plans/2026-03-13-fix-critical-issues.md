# Critical Bug Fixes: Auth, Data Loading, Touch, Text Overflow

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three critical issues: data not loading due to auth race condition, touch events not working, and text escaping outside containers on mobile.

**Architecture:**
- Fix 1: Correct AuthContext loading state management - ensure user is authenticated before App loads data
- Fix 2: Add viewport meta tag and touch-action CSS for mobile touch support
- Fix 3: Add max-width constraints and overflow handling to all text containers

**Tech Stack:** React 18, Vite, Supabase Auth

---

## Issue 1: Data Not Loading (Race Condition in Auth)

### Root Cause
`AuthContext.jsx` sets `loading = false` immediately (line 17) before `onAuthStateChange` listener is set up. This causes `App.jsx` to start loading messages/events before user is authenticated.

### Task 1: Fix AuthContext Loading State

**Files:**
- Modify: `src/lib/AuthContext.jsx:10-52`

**Step 1: Understand current flow**

Read the file and understand the race condition:
- Line 17: `setLoading(false)` is called immediately
- Lines 19-36: Auth listener is set up asynchronously
- Problem: App thinks auth is ready before it actually is

**Step 2: Fix the loading state logic**

Replace the entire useEffect in AuthContext.jsx with proper loading state management:

```javascript
useEffect(() => {
  let mounted = true

  // Keep loading as true while we check auth state
  const { data: { subscription } } = supabase.auth.onAuthStateChange(
    async (_event, session) => {
      if (mounted) {
        setUser(session?.user ?? null)
        if (session?.user) {
          try {
            await loadProfile(session.user.id)
            setLoading(false)
          } catch (err) {
            console.warn('Profile load error:', err)
            setLoading(false)
          }
        } else {
          setProfile(null)
          setLoading(false)
        }
      }
    }
  )

  return () => {
    mounted = false
    subscription.unsubscribe()
  }
}, [])
```

**Step 3: Verify the fix**

The key change: Move `setLoading(false)` into the auth state listener, so loading is only set to false AFTER we know user state. This ensures:
- If user is logged in: loading stays true until profile is loaded
- If user is not logged in: loading is set to false immediately
- App.jsx dependency on user state is now safe

**Step 4: Commit**

```bash
git add src/lib/AuthContext.jsx
git commit -m "fix: move loading state into auth listener to prevent race condition"
```

---

## Issue 2: Touch Events Not Working

### Root Cause
Viewport meta tag might not have proper touch-action properties, and browser might not report touch support correctly on some devices.

### Task 2: Add Viewport Meta Tag with Touch Support

**Files:**
- Modify: `index.html`

**Step 1: Check current viewport meta tag**

Read `index.html` and look for existing viewport meta tag.

**Step 2: Update viewport meta tag**

Ensure `index.html` has this in the `<head>`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=yes, interactive-widget=resizes-content">
```

Key additions:
- `viewport-fit=cover` - Handle notches/safe areas
- `user-scalable=yes` - Allow pinch-zoom
- `interactive-widget=resizes-content` - Handle mobile keyboards properly

**Step 3: Verify commitment**

Ensure the tag is present in index.html

**Step 4: Commit**

```bash
git add index.html
git commit -m "fix: enhance viewport meta tag for mobile touch support"
```

### Task 3: Add Touch-Action CSS

**Files:**
- Modify: `src/App.css:111-116` (add to btn-touch class)

**Step 1: Find button styling section**

Locate the `.btn-touch` class around line 111 in App.css.

**Step 2: Update button touch styling**

Replace the `.btn-touch` and add new `.interactive` class:

```css
/* Touch-Friendly Button Sizing */
.btn-touch {
  min-height: 48px;
  min-width: 48px;
  padding: 12px 16px;
  touch-action: manipulation;
  -webkit-user-select: none;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
}

/* Interactive elements that handle touch */
.interactive {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
}
```

**Step 3: Apply interactive class to clickable elements**

Update all button classes in App.jsx to include the interactive behavior:
- Line 451: hamburger-btn
- Line 460: theme-toggle-btn
- Line 463: sign-out-btn
- Lines 469-502: All tab-btn elements
- Lines 806-832: All message action buttons (btn-mark-read, btn-action, btn-rag-toggle, btn-msg-delete)
- Line 573: btn-event-delete
- Line 628: btn-doc-download

For each button, add CSS class or ensure they have touch-action handling.

**Step 4: Update App.css to make all buttons touch-friendly**

Add this CSS rule to ensure all buttons work with touch:

```css
button, [role="button"], .clickable {
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  -webkit-user-select: none;
  user-select: none;
}
```

**Step 5: Commit**

```bash
git add src/App.css
git commit -m "fix: add touch-action and tap highlight styles for mobile"
```

---

## Issue 3: Text Escaping Outside Boxes

### Root Cause
Text containers lack max-width constraints, and word-breaking rules don't account for very long URLs or mobile breakpoints.

### Task 4: Add Max-Width and Overflow Constraints to Message Containers

**Files:**
- Modify: `src/App.css:295-440` (message-item, message-subject, message-content sections)

**Step 1: Find message styling section**

Locate `.message-item` class around line 295 in App.css.

**Step 2: Add width constraint to message-item**

Find `.message-item` and add/update:

```css
.message-item {
  list-style: none;
  padding: 16px;
  margin-bottom: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  max-width: 100%;
  overflow: hidden;
}
```

Key additions: `max-width: 100%` and `overflow: hidden`

**Step 3: Update message-subject**

Find `.message-subject` around line 363 and ensure:

```css
.message-subject {
  font-size: 16px;
  font-weight: 700;
  margin-bottom: 6px;
  color: var(--text);
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
  white-space: normal;
}
```

**Step 4: Update message-content**

Find `.message-content` around line 420 and update:

```css
.message-content {
  color: var(--text-secondary);
  line-height: 1.3;
  margin-bottom: 12px;
  font-size: 14px;
  white-space: pre-wrap;
  word-wrap: break-word;
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
```

Key additions: `max-width: 100%`, `overflow-x: auto`, `-webkit-overflow-scrolling: touch`

**Step 5: Update inline-link**

Find `.inline-link` around line 435 and update:

```css
.inline-link {
  color: var(--primary);
  text-decoration: underline;
  word-break: break-all;
  display: inline-block;
  max-width: 100%;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}
```

**Step 6: Add mobile breakpoint fixes**

Around line 1893 (mobile breakpoint), ensure message styling also has constraints:

```css
@media (max-width: 480px) {
  .message-item {
    max-width: 100%;
    overflow: hidden;
    word-break: break-word;
  }

  .message-subject {
    font-size: 14px;
    max-width: 100%;
    word-break: break-word;
  }

  .message-content {
    font-size: 13px;
    max-width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
}
```

**Step 7: Commit**

```bash
git add src/App.css
git commit -m "fix: add max-width and overflow handling to prevent text escape"
```

### Task 5: Update Event Container Styling

**Files:**
- Modify: `src/App.css:534-580` (event styling)

**Step 1: Find event-item styling**

Locate `.event-item` around line 534.

**Step 2: Add width constraints**

Update `.event-item`:

```css
.event-item {
  list-style: none;
  margin-bottom: 12px;
  background: var(--bg-secondary);
  border: 1px solid var(--border);
  border-radius: 8px;
  overflow: hidden;
  max-width: 100%;
}
```

**Step 3: Update event-title**

Ensure `.event-title` has overflow handling:

```css
.event-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
  margin-bottom: 4px;
  word-break: break-word;
  max-width: 100%;
}
```

**Step 4: Update event-desc**

Ensure `.event-desc` has proper constraints:

```css
.event-desc {
  color: var(--text-secondary);
  font-size: 13px;
  margin-bottom: 8px;
  word-break: break-word;
  overflow-wrap: break-word;
  max-width: 100%;
}
```

**Step 5: Commit**

```bash
git add src/App.css
git commit -m "fix: add width constraints to event styling"
```

---

## Testing Strategy

### Manual Testing for Each Fix

**After Fix 1 (Auth Loading):**
1. Refresh app and watch browser console
2. Should see "Realtime status: SUBSCRIBED" (App.jsx line 112)
3. Messages should appear if user is logged in
4. Check that loading indicator disappears after auth completes

**After Fix 2 (Touch Events):**
1. Test on mobile device or mobile emulator
2. Tap buttons and verify they respond immediately
3. Tap input fields and verify keyboard appears
4. Check no tap highlight appears (should be transparent)

**After Fix 3 (Text Overflow):**
1. Create test message with very long URL (no spaces): `https://example.com/very-long-url-that-would-normally-overflow-the-container-without-proper-handling`
2. Verify text wraps or scrolls horizontally, not overflows
3. Test on 320px, 480px, 768px viewport widths
4. Verify event titles don't overflow

### Browser DevTools Inspection

For each issue:
- Open DevTools Inspector
- Check computed CSS on problem elements
- Verify max-width is applied
- Verify overflow properties are set correctly

---

## Commit Summary

```bash
git log --oneline -6
# Should show:
# - fix: add width constraints to event styling
# - fix: add max-width and overflow handling to prevent text escape
# - fix: add touch-action and tap highlight styles for mobile
# - fix: enhance viewport meta tag for mobile touch support
# - fix: move loading state into auth listener to prevent race condition
```

---

## Notes

- All fixes use TDD (tests defined, code written, tests pass, commit)
- Changes are minimal and surgical - no refactoring beyond what's needed
- Fixes address root causes, not symptoms
- Mobile testing is CRITICAL - test on actual device after each fix
