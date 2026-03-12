# Code Quality & Bug Fixes Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all security vulnerabilities, bugs, and code quality issues identified in the code review.

**Architecture:** Fixes are grouped by severity — security-critical Edge Function auth first, then UI bugs, then performance/quality improvements. Each task is independent and committable.

**Tech Stack:** React 18 + Vite, Supabase Edge Functions (Deno/TypeScript), vitest

---

### Task 1: Fix `linkify()` regex statefulness bug

**Files:**
- Modify: `src/App.jsx:13-22`

**Step 1: Fix the regex**

The `g` flag on the regex makes `.test()` stateful — `lastIndex` advances on each call, causing every other URL to not render as a link.

```jsx
function linkify(text) {
  if (!text) return text
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`[\]]+)/g
  const parts = text.split(urlRegex)
  return parts.map((part, i) =>
    /^https?:\/\//.test(part)
      ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="inline-link">{part}</a>
      : part
  )
}
```

Key change: Use a simple non-global regex `/^https?:\/\//` for the `.test()` call instead of reusing the `g`-flagged `urlRegex`.

**Step 2: Verify manually**

Open the app, find a message with multiple URLs in it. Confirm all URLs render as clickable links, not just alternating ones.

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "fix: use non-global regex in linkify test to prevent stateful skipping"
```

---

### Task 2: Add toast auto-dismiss

**Files:**
- Modify: `src/App.jsx:319-322`

**Step 1: Add setTimeout in addToast**

```jsx
function addToast(message, type = 'info') {
  const id = Date.now()
  setToasts(prev => [...prev, { id, message, type }])
  setTimeout(() => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, 4000)
}
```

**Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "fix: auto-dismiss toasts after 4 seconds"
```

---

### Task 3: Fix realtime message missing `is_read` and `attachments`

**Files:**
- Modify: `src/App.jsx:60-96`

**Step 1: Annotate realtime INSERT messages**

When a new message arrives via realtime, it's a raw row without the `message_read_status` join or `attachments`. Annotate it with defaults:

```jsx
.on(
  'postgres_changes',
  {
    event: 'INSERT',
    schema: 'public',
    table: 'messages',
  },
  (payload) => {
    const newMsg = {
      ...payload.new,
      is_read: false,
      message_read_status: [],
      attachments: [],
    }
    setMessages(prev => [newMsg, ...prev])
    addToast(`New message from ${payload.new.sender_name}`, 'info')
  }
)
```

**Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "fix: annotate realtime messages with is_read and attachments defaults"
```

---

### Task 4: Memoize `getFilteredEvents()` and unread badge count

**Files:**
- Modify: `src/App.jsx:398` (add filteredEvents variable)
- Modify: `src/App.jsx:430-431` (unread count)
- Modify: `src/App.jsx:461-602` (use variable instead of 3 calls)

**Step 1: Store filtered events in a variable**

After line 398 (`const filteredMessages = getFilteredMessages()`), add:

```jsx
const filteredEvents = getFilteredEvents()
const unreadCount = messages.filter(m => !m.is_read).length
```

**Step 2: Replace all `getFilteredEvents()` calls in JSX**

Replace `getFilteredEvents()` on lines ~485, ~489, ~491 with `filteredEvents`.

Replace both `messages.filter(m => !m.is_read).length` on lines ~430-431 with `unreadCount`.

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "perf: memoize filtered events and unread count to avoid redundant computation"
```

---

### Task 5: Fix React key in ChatDrawer and useEffect dependencies

**Files:**
- Modify: `src/components/ChatDrawer.jsx:119`
- Modify: `src/App.jsx:52-57` (useEffect deps)

**Step 1: Fix ChatDrawer message key**

Use a stable key combining role + index (messages are append-only, so index is stable here, but prefix with role for uniqueness):

```jsx
{messages.map((msg, i) => (
  <div key={`${msg.role}-${i}`} className={`chat-msg chat-msg-${msg.role}`}>
```

**Step 2: Fix useEffect dependency arrays in App.jsx**

Wrap the data-loading functions with `useCallback` or move them inside the effect. Simplest fix — move calls inline:

The current pattern works correctly because `user` is the real dependency trigger. The functions close over `user` from the outer scope. Add an eslint-disable comment to acknowledge this is intentional:

```jsx
useEffect(() => {
  if (!user) return
  loadMessages()
  loadEvents()
  loadProfiles()
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, [user])
```

Similarly for the realtime subscription effect.

**Step 3: Commit**

```bash
git add src/App.jsx src/components/ChatDrawer.jsx
git commit -m "fix: stabilize React keys in ChatDrawer and acknowledge useEffect deps"
```

---

### Task 6: Fix Edge Function authentication (SECURITY)

**Files:**
- Modify: `supabase/functions/rag-chat/index.ts:31-48`
- Modify: `supabase/functions/index-document/index.ts:180-188`
- Modify: `supabase/functions/index-message/index.ts:322-329`
- Modify: `supabase/functions/extract-dates/index.ts:15-23`

**Step 1: Add auth verification helper pattern**

Each Edge Function that currently only checks `if (!authHeader)` needs to actually verify the token. Use the same pattern as `invite-user`:

```typescript
// Verify caller is authenticated (accepts user JWT or service role key)
const authHeader = req.headers.get("Authorization");
if (!authHeader) {
  return new Response(
    JSON.stringify({ error: "Not authenticated" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

// Check if it's the service role key (for server-to-server calls)
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const isServiceRole = authHeader === `Bearer ${supabaseKey}`;

if (!isServiceRole) {
  // Verify as user JWT
  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Not authenticated" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
```

**Important:** `index-document` and `index-message` are called server-to-server by other Edge Functions using the service role key. The auth check must accept both user JWTs AND the service role key.

**Step 2: Add auth to `rag-chat`**

`rag-chat` currently has zero auth. Add the user JWT verification (no service role needed — only users call this):

```typescript
const authHeader = req.headers.get("Authorization");
if (!authHeader) {
  return new Response(
    JSON.stringify({ error: "Not authenticated" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

const supabaseAuth = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_ANON_KEY")!,
  { global: { headers: { Authorization: authHeader } } }
);
const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
if (authError || !user) {
  return new Response(
    JSON.stringify({ error: "Not authenticated" }),
    { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}
```

Place this right after the `OPTIONS` check, before reading the request body.

**Step 3: Deploy and test**

```bash
supabase functions deploy rag-chat
supabase functions deploy index-document
supabase functions deploy index-message
supabase functions deploy extract-dates
```

Test: open the app, use Ask Charlie chat, index a document — all should still work. Test with an expired/invalid token to confirm 401.

**Step 4: Commit**

```bash
git add supabase/functions/
git commit -m "security: add JWT verification to all Edge Functions"
```

---

### Task 7: DRY up shared Edge Function utilities

**Files:**
- Create: `supabase/functions/_shared/chunking.ts`
- Modify: `supabase/functions/index-document/index.ts`
- Modify: `supabase/functions/index-message/index.ts`

**Step 1: Extract shared functions**

Create `supabase/functions/_shared/chunking.ts` with `chunkText` and `generateEmbeddings`.

**Step 2: Import in both functions**

```typescript
import { chunkText, generateEmbeddings } from "../_shared/chunking.ts";
```

Remove the duplicated function bodies from both files.

**Step 3: Commit**

```bash
git add supabase/functions/
git commit -m "refactor: extract shared chunkText and generateEmbeddings to _shared module"
```

---

### Task 8: Add error handling to silent async functions

**Files:**
- Modify: `src/App.jsx:44-49` (loadProfiles)
- Modify: `src/components/NotificationBell.jsx:44-52` (loadNotifications)
- Modify: `src/components/NotificationBell.jsx:55-61` (dismiss)

**Step 1: Add try/catch to loadProfiles**

```jsx
async function loadProfiles() {
  try {
    const { data } = await supabase.from('profiles').select('*')
    const map = {}
    ;(data || []).forEach(p => { map[p.id] = p })
    setProfiles(map)
  } catch (err) {
    console.error('Error loading profiles:', err)
  }
}
```

**Step 2: Add try/catch to NotificationBell functions**

```jsx
async function loadNotifications() {
  try {
    const { data } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', user.id)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(20)
    setNotifications(data || [])
  } catch (err) {
    console.error('Error loading notifications:', err)
  }
}

async function dismiss(id) {
  try {
    await supabase
      .from('user_notifications')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  } catch (err) {
    console.error('Error dismissing notification:', err)
  }
}
```

**Step 3: Commit**

```bash
git add src/App.jsx src/components/NotificationBell.jsx
git commit -m "fix: add error handling to loadProfiles, loadNotifications, and dismiss"
```

---

### Task 9: Fix DocumentBrowser fetching full `content_text`

**Files:**
- Modify: `src/components/DocumentBrowser.jsx:63`

**Step 1: Remove content_text from select, use a boolean check instead**

Replace the select to exclude `content_text` and derive the badge from presence:

```jsx
const { data, error } = await supabase
  .from('documents')
  .select('id, filename, file_path, source_url, source_type, tags, category, indexed_for_rag, dates_extracted, created_at')
  .not('content_text', 'is', null)
  .order('filename', { ascending: true })
```

Wait — that would filter OUT documents without content_text. Instead, just drop `content_text` from the select and add a computed column or just remove the "Text Extracted" badge dependency:

```jsx
const { data, error } = await supabase
  .from('documents')
  .select('id, filename, file_path, source_url, source_type, tags, category, indexed_for_rag, dates_extracted, created_at, content_text')
  .order('filename', { ascending: true })
```

Actually, the simplest performant fix: select `content_text::boolean` isn't possible in PostgREST. Use `content_text.is.null` as a separate check... or just select a minimal slice. The cleanest approach: keep the select but truncate server-side isn't available either.

Best practical fix: just remove `content_text` from the select and derive the badge from `indexed_for_rag` (if it's indexed, it must have had text). The `dates_extracted` flag already exists.

```jsx
.select('id, filename, file_path, source_url, source_type, tags, category, indexed_for_rag, dates_extracted, created_at')
```

Then in DocumentCard, remove the `content_text` badge or derive it from `indexed_for_rag`:

```jsx
{document.indexed_for_rag && (
  <span className="doc-text-badge">Text Extracted</span>
)}
```

**Step 2: Commit**

```bash
git add src/components/DocumentBrowser.jsx src/components/DocumentCard.jsx
git commit -m "perf: stop fetching content_text in document list to reduce payload size"
```

---

### Task 10: Fix PWA caching Supabase auth routes

**Files:**
- Modify: `vite.config.js:24-33`

**Step 1: Exclude auth paths from caching**

```js
runtimeCaching: [
  {
    urlPattern: /^https:\/\/.*\.supabase\.co\/auth\/.*/i,
    handler: 'NetworkOnly',
  },
  {
    urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
    handler: 'NetworkFirst',
    options: {
      cacheName: 'supabase-api',
      expiration: { maxEntries: 50, maxAgeSeconds: 300 },
    },
  },
],
```

Auth routes must come first since workbox matches in order.

**Step 2: Commit**

```bash
git add vite.config.js
git commit -m "fix: exclude Supabase auth routes from PWA cache"
```

---

## Summary

| Task | Severity | Component |
|------|----------|-----------|
| 1. Fix linkify regex | HIGH - Bug | App.jsx |
| 2. Toast auto-dismiss | HIGH - Bug | App.jsx |
| 3. Realtime message annotation | HIGH - Bug | App.jsx |
| 4. Memoize filtered events + unread | MEDIUM - Perf | App.jsx |
| 5. React key + useEffect deps | MEDIUM - Quality | ChatDrawer, App.jsx |
| 6. Edge Function auth | CRITICAL - Security | 4 Edge Functions |
| 7. DRY shared utilities | MEDIUM - Quality | 2 Edge Functions |
| 8. Error handling | MEDIUM - Quality | App.jsx, NotificationBell |
| 9. content_text payload | LOW - Perf | DocumentBrowser, DocumentCard |
| 10. PWA auth caching | LOW - Bug | vite.config.js |
