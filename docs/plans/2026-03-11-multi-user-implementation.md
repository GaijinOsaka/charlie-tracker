# Multi-User Support Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add authentication, per-user read/action tracking, notifications, and PWA support so two parents can share Charlie Tracker independently.

**Architecture:** Supabase Auth with email/password, junction tables for per-user state, database triggers for cross-user notifications, vite-plugin-pwa for installable app. All data shared between users, only read status and notifications are user-scoped.

**Tech Stack:** React 18, Vite 4, Supabase Auth v2, Supabase Edge Functions (Deno), vite-plugin-pwa, CSS (no framework).

---

## Task 1: Database Migration — Profiles & Auth Support

**Files:**
- Create: `supabase/migrations/2026-03-11-multi-user-auth.sql`

**Step 1: Write the migration SQL**

```sql
-- 1. Profiles table
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read all profiles"
  ON profiles FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

-- 2. Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, email)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

**Step 2: Apply migration via Supabase MCP**

Run the migration using `mcp__supabase__apply_migration`.

**Step 3: Verify**

Run `mcp__supabase__list_tables` and confirm `profiles` appears.

**Step 4: Commit**

```bash
git add supabase/migrations/2026-03-11-multi-user-auth.sql
git commit -m "feat: add profiles table and auth trigger"
```

---

## Task 2: Database Migration — Per-User Read Status

**Files:**
- Create: `supabase/migrations/2026-03-11-message-read-status.sql`

**Step 1: Write the migration SQL**

```sql
-- 1. Per-user read status table
CREATE TABLE message_read_status (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, message_id)
);

CREATE INDEX idx_read_status_user ON message_read_status(user_id);
CREATE INDEX idx_read_status_message ON message_read_status(message_id);

ALTER TABLE message_read_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own read status"
  ON message_read_status FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Drop old is_read column from messages
ALTER TABLE messages DROP COLUMN IF EXISTS is_read;

-- 3. Change actioned_by from TEXT to UUID, add action_note
ALTER TABLE messages DROP COLUMN IF EXISTS actioned_by;
ALTER TABLE messages ADD COLUMN actioned_by UUID REFERENCES auth.users(id);
ALTER TABLE messages ADD COLUMN action_note TEXT;
```

**Step 2: Apply migration via Supabase MCP**

**Step 3: Verify**

Run SQL: `SELECT column_name FROM information_schema.columns WHERE table_name = 'messages'` — confirm `is_read` gone, `actioned_by` is UUID, `action_note` exists.

**Step 4: Commit**

```bash
git add supabase/migrations/2026-03-11-message-read-status.sql
git commit -m "feat: add per-user read status table, update action columns"
```

---

## Task 3: Database Migration — Notifications & Action Trigger

**Files:**
- Create: `supabase/migrations/2026-03-11-user-notifications.sql`

**Step 1: Write the migration SQL**

```sql
-- 1. Notifications table
CREATE TABLE user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'actioned',
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user_undismissed
  ON user_notifications(user_id) WHERE dismissed_at IS NULL;

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own notifications"
  ON user_notifications FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 2. Trigger: create notification for other user when message is actioned
CREATE OR REPLACE FUNCTION create_action_notification()
RETURNS TRIGGER AS $$
DECLARE
  other_user_id UUID;
  actor_name TEXT;
BEGIN
  IF NEW.actioned_at IS NOT NULL AND (OLD.actioned_at IS NULL) THEN
    SELECT id INTO other_user_id FROM profiles WHERE id != NEW.actioned_by LIMIT 1;
    SELECT display_name INTO actor_name FROM profiles WHERE id = NEW.actioned_by;

    IF other_user_id IS NOT NULL THEN
      INSERT INTO user_notifications (user_id, message_id, type, summary)
      VALUES (
        other_user_id,
        NEW.id,
        'actioned',
        actor_name || ' actioned ''' || LEFT(NEW.subject, 60) || '''' ||
          CASE WHEN NEW.action_note IS NOT NULL AND NEW.action_note != ''
            THEN ' — ' || LEFT(NEW.action_note, 200)
            ELSE '' END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_action_notification
  AFTER UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION create_action_notification();
```

**Step 2: Apply migration via Supabase MCP**

**Step 3: Verify**

Run `mcp__supabase__list_tables` — confirm `user_notifications` exists.

**Step 4: Commit**

```bash
git add supabase/migrations/2026-03-11-user-notifications.sql
git commit -m "feat: add notifications table and action trigger"
```

---

## Task 4: Database Migration — RLS Policy Updates

**Files:**
- Create: `supabase/migrations/2026-03-11-rls-hardening.sql`

**Step 1: Write the migration SQL**

```sql
-- Drop old permissive policies and replace with auth-scoped ones

-- Messages: authenticated read, authenticated update (for actioning)
DROP POLICY IF EXISTS "Allow authenticated users to read messages" ON messages;
DROP POLICY IF EXISTS "Allow all read messages" ON messages;
CREATE POLICY "Authenticated read messages" ON messages FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update messages" ON messages FOR UPDATE
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated insert messages" ON messages FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Attachments
DROP POLICY IF EXISTS "Allow authenticated users to read attachments" ON attachments;
DROP POLICY IF EXISTS "Allow all read attachments" ON attachments;
CREATE POLICY "Authenticated read attachments" ON attachments FOR SELECT
  USING (auth.role() = 'authenticated');

-- Categories
DROP POLICY IF EXISTS "Allow authenticated users to read categories" ON categories;
CREATE POLICY "Authenticated read categories" ON categories FOR SELECT
  USING (auth.role() = 'authenticated');

-- sync_log
DROP POLICY IF EXISTS "Allow authenticated users to read sync_log" ON sync_log;
CREATE POLICY "Authenticated read sync_log" ON sync_log FOR SELECT
  USING (auth.role() = 'authenticated');

-- Events
DROP POLICY IF EXISTS "Allow authenticated users to read events" ON events;
CREATE POLICY "Authenticated read events" ON events FOR SELECT
  USING (auth.role() = 'authenticated');

-- Web pages
DROP POLICY IF EXISTS "Allow authenticated read web_pages" ON web_pages;
CREATE POLICY "Authenticated read web_pages" ON web_pages FOR SELECT
  USING (auth.role() = 'authenticated');

-- Documents
DROP POLICY IF EXISTS "Allow authenticated read documents" ON documents;
CREATE POLICY "Authenticated read documents" ON documents FOR SELECT
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated update documents" ON documents FOR UPDATE
  USING (auth.role() = 'authenticated');
CREATE POLICY "Authenticated insert documents" ON documents FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

-- Document chunks
DROP POLICY IF EXISTS "Allow authenticated read chunks" ON document_chunks;
CREATE POLICY "Authenticated read chunks" ON document_chunks FOR SELECT
  USING (auth.role() = 'authenticated');
```

**Step 2: Apply migration via Supabase MCP**

**Step 3: Verify**

Run SQL: `SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename` — confirm new policies, no old ones.

**Step 4: Commit**

```bash
git add supabase/migrations/2026-03-11-rls-hardening.sql
git commit -m "feat: harden RLS policies to require authentication"
```

---

## Task 5: Edge Function — Invite User

**Files:**
- Create: `supabase/functions/invite-user/index.ts`

**Step 1: Write the Edge Function**

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify caller is authenticated
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Not authenticated" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { email, display_name } = await req.json();
    if (!email || !display_name) {
      return new Response(JSON.stringify({ error: "email and display_name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check user count
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );
    const { count } = await supabaseAdmin
      .from("profiles")
      .select("*", { count: "exact", head: true });

    if ((count || 0) >= 2) {
      return new Response(JSON.stringify({ error: "Maximum 2 users allowed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send invite
    const { data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      { data: { display_name } }
    );

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ success: true, user_id: data.user.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
```

**Step 2: Check if `_shared/cors.ts` exists**

Look at existing Edge Functions to see if they share CORS headers. If not, create `supabase/functions/_shared/cors.ts`:

```typescript
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
```

Check existing functions (e.g., `extract-dates/index.ts`) for how they handle CORS and match the pattern.

**Step 3: Deploy via Supabase MCP**

Use `mcp__supabase__deploy_edge_function` with function name `invite-user`.

**Step 4: Commit**

```bash
git add supabase/functions/invite-user/index.ts supabase/functions/_shared/cors.ts
git commit -m "feat: add invite-user Edge Function"
```

---

## Task 6: Supabase Client — Add Auth Support

**Files:**
- Modify: `src/lib/supabase.js`

**Step 1: Update the Supabase client config**

Replace `src/lib/supabase.js` with:

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
})
```

**Step 2: Verify**

Run `npm run dev` — app should still load (no auth enforced in UI yet).

**Step 3: Commit**

```bash
git add src/lib/supabase.js
git commit -m "feat: configure Supabase client for auth"
```

---

## Task 7: Auth Context Provider

**Files:**
- Create: `src/lib/AuthContext.jsx`

**Step 1: Create the auth context**

```jsx
import React, { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from './supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null)
      if (session?.user) loadProfile(session.user.id)
      else setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        setUser(session?.user ?? null)
        if (session?.user) await loadProfile(session.user.id)
        else {
          setProfile(null)
          setLoading(false)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  async function loadProfile(userId) {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .single()
    setProfile(data)
    setLoading(false)
  }

  async function signIn(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  }

  async function signOut() {
    await supabase.auth.signOut()
    setUser(null)
    setProfile(null)
  }

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used within AuthProvider')
  return context
}
```

**Step 2: Verify**

Run `npm run dev` — no errors (context not wired up yet).

**Step 3: Commit**

```bash
git add src/lib/AuthContext.jsx
git commit -m "feat: add AuthContext provider and useAuth hook"
```

---

## Task 8: Login Page

**Files:**
- Create: `src/components/LoginPage.jsx`

**Step 1: Create the login component**

```jsx
import React, { useState } from 'react'
import { useAuth } from '../lib/AuthContext'

export default function LoginPage() {
  const { signIn } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    const { error } = await signIn(email, password)
    if (error) setError(error.message)
    setLoading(false)
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <h1>Charlie Tracker</h1>
        <p className="login-subtitle">Sign in to continue</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="login-error">{error}</p>}
          <button type="submit" className="login-btn" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  )
}
```

**Step 2: Add login page styles to `src/App.css`**

Add at the end of the file:

```css
/* Login Page */
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--bg-primary);
}

.login-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 2.5rem;
  width: 100%;
  max-width: 400px;
  text-align: center;
}

.login-card h1 {
  font-size: 1.75rem;
  color: var(--text-primary);
  margin: 0 0 0.25rem;
}

.login-subtitle {
  color: var(--text-secondary);
  margin: 0 0 1.5rem;
  font-size: 0.9rem;
}

.form-group {
  margin-bottom: 1rem;
  text-align: left;
}

.form-group label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-secondary);
  margin-bottom: 0.25rem;
}

.form-group input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.95rem;
  box-sizing: border-box;
}

.form-group input:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.login-error {
  color: var(--danger);
  font-size: 0.85rem;
  margin: 0 0 1rem;
}

.login-btn {
  width: 100%;
  padding: 0.7rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 1rem;
  cursor: pointer;
  font-weight: 500;
}

.login-btn:hover {
  opacity: 0.9;
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

**Step 3: Verify**

Run `npm run dev`, manually navigate to the component — it should render the form.

**Step 4: Commit**

```bash
git add src/components/LoginPage.jsx src/App.css
git commit -m "feat: add login page component and styles"
```

---

## Task 9: Wire Auth into App Shell

**Files:**
- Modify: `src/index.jsx`
- Modify: `src/App.jsx`

**Step 1: Wrap app with AuthProvider in `src/index.jsx`**

Replace the contents of `src/index.jsx`:

```jsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './lib/AuthContext'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <App />
    </AuthProvider>
  </React.StrictMode>
)
```

**Step 2: Add auth gate to `src/App.jsx`**

At the top of `App.jsx`, add imports:

```javascript
import { useAuth } from './lib/AuthContext'
import LoginPage from './components/LoginPage'
```

Inside the `App` function, at the very beginning (before existing state declarations), add:

```javascript
const { user, profile, loading: authLoading, signOut } = useAuth()

if (authLoading) {
  return <div className="loading-screen">Loading...</div>
}

if (!user) {
  return <LoginPage />
}
```

**Step 3: Update the header in `App.jsx`**

Replace the existing `<header>` block with:

```jsx
<header>
  <div className="header-top">
    <div>
      <h1>Charlie Oakes Tracker</h1>
      <p className="subtitle">Communication Dashboard</p>
    </div>
    <div className="header-right">
      <span className="user-name">{profile?.display_name}</span>
      <button className="sign-out-btn" onClick={signOut}>Sign Out</button>
    </div>
  </div>
</header>
```

**Step 4: Add header styles to `src/App.css`**

```css
/* Header layout */
.header-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.user-name {
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.sign-out-btn {
  padding: 0.4rem 0.75rem;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
  font-size: 0.8rem;
}

.sign-out-btn:hover {
  border-color: var(--danger);
  color: var(--danger);
}

.loading-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  color: var(--text-secondary);
  font-size: 1.1rem;
}
```

**Step 5: Verify**

Run `npm run dev` — should show the login page. Create a test user in Supabase dashboard (Authentication > Users > Add User), login, and verify the main app loads with the user name in the header.

**Step 6: Commit**

```bash
git add src/index.jsx src/App.jsx src/App.css
git commit -m "feat: wire auth into app shell with login gate"
```

---

## Task 10: Replace `is_read` with Per-User Read Status

**Files:**
- Modify: `src/App.jsx`

**Step 1: Update `loadMessages` to include read status**

Replace the existing `loadMessages` function:

```javascript
async function loadMessages() {
  setLoading(true)
  try {
    const { data, error } = await supabase
      .from('messages')
      .select(`
        *,
        attachments(id, filename, file_path, mime_type, file_size),
        message_read_status!left(user_id, read_at)
      `)
      .order('received_at', { ascending: false })
      .limit(100)

    if (error) throw error

    // Annotate each message with is_read for current user
    const annotated = (data || []).map(msg => ({
      ...msg,
      is_read: (msg.message_read_status || []).some(rs => rs.user_id === user.id),
    }))

    setMessages(annotated)
  } catch (err) {
    setError(err.message)
  } finally {
    setLoading(false)
  }
}
```

**Step 2: Replace `toggleReadStatus` with per-user version**

```javascript
async function toggleReadStatus(message) {
  const currentlyRead = message.is_read
  try {
    if (currentlyRead) {
      // Mark as unread: delete the row
      await supabase
        .from('message_read_status')
        .delete()
        .eq('user_id', user.id)
        .eq('message_id', message.id)
    } else {
      // Mark as read: insert a row
      await supabase
        .from('message_read_status')
        .upsert({ user_id: user.id, message_id: message.id })
    }

    setMessages(prev => prev.map(m =>
      m.id === message.id ? { ...m, is_read: !currentlyRead } : m
    ))
  } catch (err) {
    addToast('Failed to update read status', 'error')
  }
}
```

**Step 3: Add auto-mark-as-read on expand**

In the message expand toggle handler (where `expandedMessages` is updated), add a delayed mark-as-read:

```javascript
function toggleExpanded(msgId) {
  setExpandedMessages(prev => {
    const next = new Set(prev)
    if (next.has(msgId)) {
      next.delete(msgId)
    } else {
      next.add(msgId)
      // Auto-mark as read after 1 second
      const msg = messages.find(m => m.id === msgId)
      if (msg && !msg.is_read) {
        setTimeout(() => {
          toggleReadStatus(msg)
        }, 1000)
      }
    }
    return next
  })
}
```

**Step 4: Update unread count in the tab**

Find the Messages tab button and add an unread count badge:

```jsx
<button className={`tab-btn ${activeTab === 'messages' ? 'active' : ''}`}
  onClick={() => setActiveTab('messages')}>
  Messages
  {messages.filter(m => !m.is_read).length > 0 && (
    <span className="tab-badge">{messages.filter(m => !m.is_read).length}</span>
  )}
</button>
```

Add CSS for the badge:

```css
.tab-badge {
  background: var(--danger);
  color: white;
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 10px;
  margin-left: 0.4rem;
  font-weight: 600;
}
```

**Step 5: Verify**

Run `npm run dev`, login, expand a message — after 1 second it should mark as read. Toggle read/unread manually. Check that unread badge shows on Messages tab.

**Step 6: Commit**

```bash
git add src/App.jsx src/App.css
git commit -m "feat: replace global is_read with per-user read status"
```

---

## Task 11: Action Modal with Notes

**Files:**
- Create: `src/components/ActionModal.jsx`
- Modify: `src/App.jsx`

**Step 1: Create the ActionModal component**

```jsx
import React, { useState, useRef, useEffect } from 'react'

export default function ActionModal({ message, onConfirm, onCancel }) {
  const [note, setNote] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  function handleSubmit(e) {
    e.preventDefault()
    onConfirm(note.trim())
  }

  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <h3>Action Message</h3>
        <p className="modal-subject">{message.subject}</p>
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="action-note">What did you do?</label>
            <textarea
              id="action-note"
              ref={inputRef}
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="e.g. Signed and returned the form"
              rows={3}
            />
          </div>
          <div className="modal-actions">
            <button type="button" className="modal-cancel-btn" onClick={onCancel}>Cancel</button>
            <button type="submit" className="modal-confirm-btn">Mark as Actioned</button>
          </div>
        </form>
      </div>
    </div>
  )
}
```

**Step 2: Add modal styles to `src/App.css`**

```css
/* Modal */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-card {
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 1.5rem;
  width: 100%;
  max-width: 440px;
  margin: 1rem;
}

.modal-card h3 {
  margin: 0 0 0.5rem;
  color: var(--text-primary);
}

.modal-subject {
  color: var(--text-secondary);
  font-size: 0.9rem;
  margin: 0 0 1rem;
}

.modal-card textarea {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  background: var(--bg-primary);
  color: var(--text-primary);
  font-size: 0.9rem;
  resize: vertical;
  font-family: inherit;
  box-sizing: border-box;
}

.modal-card textarea:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.modal-actions {
  display: flex;
  gap: 0.75rem;
  justify-content: flex-end;
  margin-top: 1rem;
}

.modal-cancel-btn {
  padding: 0.5rem 1rem;
  background: transparent;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  color: var(--text-secondary);
  cursor: pointer;
}

.modal-confirm-btn {
  padding: 0.5rem 1rem;
  background: var(--success);
  border: none;
  border-radius: 6px;
  color: white;
  cursor: pointer;
  font-weight: 500;
}

.modal-confirm-btn:hover {
  opacity: 0.9;
}
```

**Step 3: Update `actionMessage` in `App.jsx` to use modal**

Add state for the modal:

```javascript
const [actionModalMessage, setActionModalMessage] = useState(null)
```

Replace the existing `actionMessage` function:

```javascript
function openActionModal(msg) {
  if (msg.actioned_at) {
    // Undo action — no modal needed
    undoAction(msg)
  } else {
    setActionModalMessage(msg)
  }
}

async function confirmAction(note) {
  const msg = actionModalMessage
  setActionModalMessage(null)
  try {
    const updates = {
      actioned_at: new Date().toISOString(),
      actioned_by: user.id,
      action_note: note || null,
    }
    const { error } = await supabase
      .from('messages')
      .update(updates)
      .eq('id', msg.id)
    if (error) throw error
    setMessages(prev => prev.map(m =>
      m.id === msg.id ? { ...m, ...updates } : m
    ))
    addToast('Message marked as actioned', 'success')
  } catch (err) {
    addToast('Failed to action message', 'error')
  }
}

async function undoAction(msg) {
  try {
    const updates = { actioned_at: null, actioned_by: null, action_note: null }
    const { error } = await supabase
      .from('messages')
      .update(updates)
      .eq('id', msg.id)
    if (error) throw error
    setMessages(prev => prev.map(m =>
      m.id === msg.id ? { ...m, ...updates } : m
    ))
    addToast('Action undone', 'info')
  } catch (err) {
    addToast('Failed to undo action', 'error')
  }
}
```

**Step 4: Render the modal and update action button references**

Add the modal render at the end of the return JSX (before the closing fragment/div):

```jsx
{actionModalMessage && (
  <ActionModal
    message={actionModalMessage}
    onConfirm={confirmAction}
    onCancel={() => setActionModalMessage(null)}
  />
)}
```

Update all existing `onClick={() => actionMessage(msg)}` calls to use `onClick={() => openActionModal(msg)}`.

**Step 5: Update the message card to show action note and actioner name**

Where the actioned badge currently shows, update to display the profile name and note. This requires loading profiles. Add a `profiles` state and loader:

```javascript
const [profiles, setProfiles] = useState({})

async function loadProfiles() {
  const { data } = await supabase.from('profiles').select('*')
  const map = {}
  ;(data || []).forEach(p => { map[p.id] = p })
  setProfiles(map)
}
```

Call `loadProfiles()` in the initial `useEffect` alongside `loadMessages()`.

In the message card JSX, update the actioned display:

```jsx
{msg.actioned_at && (
  <div className="actioned-info">
    <span className="actioned-badge">Actioned</span>
    <span className="actioned-detail">
      by {profiles[msg.actioned_by]?.display_name || 'Unknown'}
      {msg.action_note && ` — ${msg.action_note}`}
    </span>
  </div>
)}
```

Add CSS:

```css
.actioned-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-top: 0.5rem;
  flex-wrap: wrap;
}

.actioned-detail {
  color: var(--text-secondary);
  font-size: 0.8rem;
}
```

**Step 6: Verify**

Run `npm run dev`. Click "Mark Actioned" on a message — modal should appear. Enter a note, confirm — should show "Actioned by [Name] — [note]" on the card. Undo should clear it.

**Step 7: Commit**

```bash
git add src/components/ActionModal.jsx src/App.jsx src/App.css
git commit -m "feat: add action modal with notes and actioner display"
```

---

## Task 12: Top Bar Notifications

**Files:**
- Create: `src/components/NotificationBell.jsx`
- Modify: `src/App.jsx`

**Step 1: Create the NotificationBell component**

```jsx
import React, { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function NotificationBell({ onNavigateToMessage }) {
  const { user } = useAuth()
  const [notifications, setNotifications] = useState([])
  const [open, setOpen] = useState(false)
  const dropdownRef = useRef(null)

  useEffect(() => {
    if (!user) return
    loadNotifications()

    // Realtime subscription
    const channel = supabase
      .channel('user-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'user_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          setNotifications(prev => [payload.new, ...prev])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  async function loadNotifications() {
    const { data } = await supabase
      .from('user_notifications')
      .select('*')
      .eq('user_id', user.id)
      .is('dismissed_at', null)
      .order('created_at', { ascending: false })
      .limit(20)
    setNotifications(data || [])
  }

  async function dismiss(id) {
    await supabase
      .from('user_notifications')
      .update({ dismissed_at: new Date().toISOString() })
      .eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  async function dismissAll() {
    const ids = notifications.map(n => n.id)
    if (ids.length === 0) return
    await supabase
      .from('user_notifications')
      .update({ dismissed_at: new Date().toISOString() })
      .in('id', ids)
    setNotifications([])
  }

  function handleClick(notification) {
    dismiss(notification.id)
    if (onNavigateToMessage && notification.message_id) {
      onNavigateToMessage(notification.message_id)
    }
    setOpen(false)
  }

  const count = notifications.length

  return (
    <div className="notification-bell" ref={dropdownRef}>
      <button className="bell-btn" onClick={() => setOpen(!open)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {count > 0 && <span className="bell-badge">{count}</span>}
      </button>

      {open && (
        <div className="notification-dropdown">
          <div className="notification-header">
            <span>Notifications</span>
            {count > 0 && (
              <button className="dismiss-all-btn" onClick={dismissAll}>
                Dismiss all
              </button>
            )}
          </div>
          {count === 0 ? (
            <p className="notification-empty">No new notifications</p>
          ) : (
            <ul className="notification-list">
              {notifications.map(n => (
                <li key={n.id} className="notification-item" onClick={() => handleClick(n)}>
                  <p className="notification-summary">{n.summary}</p>
                  <span className="notification-time">
                    {new Date(n.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
```

**Step 2: Add notification styles to `src/App.css`**

```css
/* Notification Bell */
.notification-bell {
  position: relative;
}

.bell-btn {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  cursor: pointer;
  padding: 0.4rem;
  position: relative;
  display: flex;
  align-items: center;
}

.bell-btn:hover {
  color: var(--text-primary);
}

.bell-badge {
  position: absolute;
  top: 0;
  right: -2px;
  background: var(--danger);
  color: white;
  font-size: 0.65rem;
  min-width: 16px;
  height: 16px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 600;
}

.notification-dropdown {
  position: absolute;
  top: 100%;
  right: 0;
  width: 340px;
  max-height: 400px;
  overflow-y: auto;
  background: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
  z-index: 100;
  margin-top: 0.5rem;
}

.notification-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
  font-weight: 600;
  font-size: 0.9rem;
  color: var(--text-primary);
}

.dismiss-all-btn {
  background: transparent;
  border: none;
  color: var(--primary);
  cursor: pointer;
  font-size: 0.8rem;
}

.notification-empty {
  padding: 1.5rem;
  text-align: center;
  color: var(--text-secondary);
  font-size: 0.9rem;
}

.notification-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.notification-item {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--border-color);
  cursor: pointer;
}

.notification-item:hover {
  background: var(--bg-primary);
}

.notification-item:last-child {
  border-bottom: none;
}

.notification-summary {
  margin: 0;
  font-size: 0.85rem;
  color: var(--text-primary);
  line-height: 1.4;
}

.notification-time {
  font-size: 0.75rem;
  color: var(--text-secondary);
  margin-top: 0.25rem;
  display: block;
}
```

**Step 3: Wire into `App.jsx` header**

Import the component:

```javascript
import NotificationBell from './components/NotificationBell'
```

Add a `navigateToMessage` function:

```javascript
function navigateToMessage(messageId) {
  setActiveTab('messages')
  setExpandedMessages(prev => new Set([...prev, messageId]))
  // Scroll to message after a tick
  setTimeout(() => {
    const el = document.getElementById(`message-${messageId}`)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, 100)
}
```

Add an `id` attribute to each message card: `id={`message-${msg.id}`}`.

Add NotificationBell to the header-right div, before the user name:

```jsx
<div className="header-right">
  <NotificationBell onNavigateToMessage={navigateToMessage} />
  <span className="user-name">{profile?.display_name}</span>
  <button className="sign-out-btn" onClick={signOut}>Sign Out</button>
</div>
```

**Step 4: Verify**

Login as user A, action a message. Login as user B in another browser — should see notification bell with badge. Click the notification — should navigate to the message.

**Step 5: Commit**

```bash
git add src/components/NotificationBell.jsx src/App.jsx src/App.css
git commit -m "feat: add notification bell with realtime action alerts"
```

---

## Task 13: Settings Panel with Invite

**Files:**
- Create: `src/components/SettingsPanel.jsx`
- Modify: `src/App.jsx`

**Step 1: Create the SettingsPanel component**

```jsx
import React, { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'

export default function SettingsPanel() {
  const { user, profile } = useAuth()
  const [profiles, setProfiles] = useState([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviting, setInviting] = useState(false)
  const [message, setMessage] = useState(null)

  useEffect(() => {
    loadProfiles()
  }, [])

  async function loadProfiles() {
    const { data } = await supabase.from('profiles').select('*').order('created_at')
    setProfiles(data || [])
  }

  async function handleInvite(e) {
    e.preventDefault()
    setInviting(true)
    setMessage(null)

    try {
      const { data, error } = await supabase.functions.invoke('invite-user', {
        body: { email: inviteEmail, display_name: inviteName },
      })
      if (error) throw error
      if (data.error) throw new Error(data.error)
      setMessage({ type: 'success', text: `Invite sent to ${inviteEmail}` })
      setInviteEmail('')
      setInviteName('')
      loadProfiles()
    } catch (err) {
      setMessage({ type: 'error', text: err.message })
    } finally {
      setInviting(false)
    }
  }

  const canInvite = profiles.length < 2

  return (
    <div className="settings-panel">
      <h2>Settings</h2>

      <section className="settings-section">
        <h3>Users</h3>
        <ul className="user-list">
          {profiles.map(p => (
            <li key={p.id} className="user-item">
              <span className="user-item-name">{p.display_name}</span>
              <span className="user-item-email">{p.email}</span>
              {p.id === user.id && <span className="user-item-you">(you)</span>}
            </li>
          ))}
        </ul>
      </section>

      {canInvite && (
        <section className="settings-section">
          <h3>Invite Partner</h3>
          <form onSubmit={handleInvite} className="invite-form">
            <div className="form-group">
              <label htmlFor="invite-name">Display Name</label>
              <input
                id="invite-name"
                type="text"
                value={inviteName}
                onChange={e => setInviteName(e.target.value)}
                placeholder="e.g. Sarah"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="invite-email">Email</label>
              <input
                id="invite-email"
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="partner@email.com"
                required
              />
            </div>
            {message && (
              <p className={`settings-msg ${message.type}`}>{message.text}</p>
            )}
            <button type="submit" className="invite-btn" disabled={inviting}>
              {inviting ? 'Sending...' : 'Send Invite'}
            </button>
          </form>
        </section>
      )}
    </div>
  )
}
```

**Step 2: Add settings styles to `src/App.css`**

```css
/* Settings Panel */
.settings-panel {
  max-width: 600px;
}

.settings-panel h2 {
  margin: 0 0 1.5rem;
  color: var(--text-primary);
}

.settings-section {
  margin-bottom: 2rem;
}

.settings-section h3 {
  margin: 0 0 0.75rem;
  color: var(--text-primary);
  font-size: 1rem;
}

.user-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.user-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--border-color);
}

.user-item-name {
  font-weight: 500;
  color: var(--text-primary);
}

.user-item-email {
  color: var(--text-secondary);
  font-size: 0.85rem;
}

.user-item-you {
  color: var(--primary);
  font-size: 0.8rem;
}

.invite-form {
  max-width: 360px;
}

.settings-msg {
  font-size: 0.85rem;
  margin: 0 0 0.75rem;
}

.settings-msg.success {
  color: var(--success);
}

.settings-msg.error {
  color: var(--danger);
}

.invite-btn {
  padding: 0.6rem 1.25rem;
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: 500;
}

.invite-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
```

**Step 3: Add Settings tab to `App.jsx`**

Import the component:

```javascript
import SettingsPanel from './components/SettingsPanel'
```

Add a Settings tab button in the tab nav:

```jsx
<button className={`tab-btn ${activeTab === 'settings' ? 'active' : ''}`}
  onClick={() => setActiveTab('settings')}>
  Settings
</button>
```

Add the settings content in the tab content area:

```jsx
{activeTab === 'settings' && <SettingsPanel />}
```

**Step 4: Verify**

Run `npm run dev`, login, go to Settings tab — should see user list and invite form (if < 2 users).

**Step 5: Commit**

```bash
git add src/components/SettingsPanel.jsx src/App.jsx src/App.css
git commit -m "feat: add settings panel with user list and invite"
```

---

## Task 14: PWA Setup

**Files:**
- Modify: `package.json` (add vite-plugin-pwa)
- Modify: `vite.config.js`
- Modify: `index.html`
- Create: `public/icons/` (placeholder icons)

**Step 1: Install vite-plugin-pwa**

```bash
npm install -D vite-plugin-pwa
```

**Step 2: Update `vite.config.js`**

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Charlie Tracker',
        short_name: 'Charlie',
        start_url: '/',
        display: 'standalone',
        background_color: '#1a1a2e',
        theme_color: '#1a1a2e',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-api',
              expiration: { maxEntries: 50, maxAgeSeconds: 300 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
})
```

**Step 3: Update `index.html`**

Add inside `<head>`:

```html
<meta name="theme-color" content="#1a1a2e" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

**Step 4: Create placeholder icons**

Create `public/icons/` directory. Generate simple 192x192 and 512x512 PNG icons. For now, create minimal placeholder SVG-based icons using a script or note to replace with real icons later.

```bash
mkdir -p public/icons
```

Use a canvas-based script or online tool to create simple "CT" text icons at 192px and 512px. For the plan, create simple placeholder PNGs.

**Step 5: Verify**

Run `npm run build && npm run preview` — check that:
- Service worker registers (check DevTools > Application > Service Workers)
- Manifest loads (DevTools > Application > Manifest)
- "Install" option appears in browser

**Step 6: Commit**

```bash
git add vite.config.js index.html public/icons/ package.json package-lock.json
git commit -m "feat: add PWA support with service worker and manifest"
```

---

## Task 15: Update Edge Functions for Auth

**Files:**
- Modify: `supabase/functions/index-message/index.ts`
- Modify: `supabase/functions/index-document/index.ts`
- Modify: `supabase/functions/rag-chat/index.ts`
- Modify: `supabase/functions/extract-dates/index.ts`

**Step 1: Add auth verification to each Edge Function**

Each function should verify the caller is authenticated. Add this block near the top of each function's request handler (after CORS check):

```typescript
// Verify authentication
const authHeader = req.headers.get("Authorization");
if (!authHeader) {
  return new Response(JSON.stringify({ error: "Not authenticated" }), {
    status: 401,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
```

For functions that already create a Supabase client, ensure they use the auth header. For functions called server-to-server (e.g., from n8n), check if they use a service role key — if so, skip the auth check for those paths.

**Step 2: Verify**

Deploy each function and test from the app — should still work when logged in. Test without auth — should get 401.

**Step 3: Commit**

```bash
git add supabase/functions/
git commit -m "feat: add auth checks to Edge Functions"
```

---

## Task 16: Update `schema.sql` Reference

**Files:**
- Modify: `supabase/schema.sql`

**Step 1: Update the schema file to reflect the new state**

Add the new tables (profiles, message_read_status, user_notifications) and updated columns to the schema reference file. Remove `is_read` from messages definition. Update `actioned_by` type. Add `action_note`. This file is a reference — the actual migrations handle the database changes.

**Step 2: Commit**

```bash
git add supabase/schema.sql
git commit -m "docs: update schema.sql reference with multi-user tables"
```

---

## Execution Order Summary

| Task | Description | Dependencies |
|------|-------------|-------------|
| 1 | Profiles table + auth trigger | None |
| 2 | Read status table + message column changes | None |
| 3 | Notifications table + action trigger | Task 1 (profiles) |
| 4 | RLS policy updates | None |
| 5 | Invite user Edge Function | Task 1 |
| 6 | Supabase client auth config | None |
| 7 | AuthContext provider | Task 6 |
| 8 | Login page | Task 7 |
| 9 | Wire auth into App shell | Tasks 7, 8 |
| 10 | Per-user read status frontend | Tasks 2, 9 |
| 11 | Action modal with notes | Tasks 2, 9 |
| 12 | Notification bell | Tasks 3, 9 |
| 13 | Settings panel with invite | Tasks 5, 9 |
| 14 | PWA setup | None (independent) |
| 15 | Edge Function auth | Task 9 |
| 16 | Schema reference update | All above |

**Parallel groups:**
- Tasks 1, 2, 4, 6, 14 can run in parallel (no dependencies)
- Tasks 3, 5, 7 can run after their deps
- Tasks 8-13 are sequential (UI building)
- Tasks 15-16 are final cleanup
