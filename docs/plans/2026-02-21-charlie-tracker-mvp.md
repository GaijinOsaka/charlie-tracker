# Charlie Oakes Communication Tracker - MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a real-time dashboard that consolidates school messages from Arbor and Gmail, with instant alerts when new messages arrive.

**Architecture:** Three independent layers working in concert:
1. **n8n (Data Collection):** Two parallel workflows scrape Arbor (browser automation) and Gmail (API) every 15 minutes, normalize messages, deduplicate against Arbor, and insert to Supabase
2. **Supabase (Data Distribution):** PostgreSQL database with REST API (for n8n inserts) and WebSocket Realtime (for React live updates)
3. **React (Dashboard):** Single-page app that subscribes to realtime changes, displays messages, shows toast alerts, allows mark-as-read

**Tech Stack:**
- n8n Cloud/Self-hosted (automation engine)
- Supabase (PostgreSQL + Realtime + REST API)
- React 18+ (frontend)
- Supabase JS Client (realtime subscriptions)

---

## Phase 1: Database Setup

### Task 1: Deploy Supabase Schema

**Files:**
- Read: `supabase/schema.sql`
- No code changes needed (schema already prepared)

**Step 1: Open Supabase dashboard**

Go to: https://app.supabase.com
- Log in with your account
- Select the "charlie-oakes-tracker" project (or create if not exists)

**Step 2: Open SQL editor**

In Supabase dashboard:
- Click "SQL Editor" (left sidebar)
- Click "New Query"

**Step 3: Copy and paste the schema**

```sql
-- (Copy entire contents of supabase/schema.sql here)
-- This file includes:
-- - CREATE TABLE messages, categories, attachments, sync_log
-- - CREATE INDEXES for performance
-- - INSERT default categories
-- - CREATE TRIGGER for updated_at
-- - ENABLE RLS and CREATE POLICIES
```

**Step 4: Execute the schema**

Click "Run" button (or Cmd+Enter)
Expected output: "Success" with no errors

**Step 5: Verify tables exist**

Click "Table Editor" (left sidebar)
Expected: You see 4 tables:
- `messages`
- `categories`
- `attachments`
- `sync_log`

**Step 6: Verify data inserted**

Click on `categories` table
Expected: 6 rows (Academic, Events, Health, Admin, Pastoral, General)

**Step 7: Note your project credentials**

Go to Settings → API → Project URL and API Keys
Save these for later:
- **SUPABASE_URL:** `https://your-project.supabase.co`
- **SUPABASE_ANON_KEY:** `eyJ...` (anon/public key)
- **SUPABASE_SERVICE_ROLE_KEY:** `eyJ...` (service role for n8n)

Store in secure location (will use in n8n setup)

**Step 8: Commit (if using git)**

```bash
git add docs/plans/2026-02-21-charlie-tracker-mvp.md
git commit -m "docs: add implementation plan for MVP"
```

**Verification Checklist:**
- [ ] All 4 tables exist in Supabase
- [ ] Categories table has 6 rows
- [ ] RLS is enabled
- [ ] Project credentials noted

---

## Phase 2: n8n Setup (Infrastructure)

### Task 2: Set Up n8n Instance

**Prerequisite Decision:**
Choose one (see `docs/n8n-setup.md` for detailed comparison):
- **Option A: n8n Cloud (Recommended)** - Sign up at https://n8n.cloud
- **Option B: Self-hosted** - Run Docker locally
- **Option C: Existing Instance** - Use if already running

**Step 1: Create n8n Account or Access Instance**

If n8n Cloud:
- Go to https://n8n.cloud
- Click "Sign up"
- Create account with email
- Create workspace

If Self-hosted:
```bash
docker run -d -p 5678:5678 \
  -e N8N_USER_EMAIL=your@email.com \
  -e N8N_USER_PASSWORD=password \
  n8nio/n8n
# Access at http://localhost:5678
```

**Step 2: Note n8n Access Details**

- **n8n URL:** (Cloud: `https://your-account.n8n.cloud`, Self-hosted: `http://localhost:5678`)
- **Username/Email:** (Cloud: signup email, Self-hosted: set above)
- **Password:** (Cloud: signup password, Self-hosted: set above)

Save these for later reference

**Step 3: Create Supabase Credentials in n8n**

In n8n dashboard:
- Click "Credentials" (left sidebar)
- Click "Create New Credential"
- Type: `HTTP Header Auth`
- Name: `supabaseHeaderAuth`
- Header Name: `Authorization`
- Header Value: `Bearer YOUR_SERVICE_ROLE_KEY` (from Task 1, Step 7)
- Click "Save"

**Step 4: Create Environment Variables (if self-hosted) or Credentials (if Cloud)**

In n8n Settings → Variables (or Credentials):
- Add: `ARBOR_EMAIL` = your school email address
- Add: `ARBOR_PASSWORD` = your Arbor login password

**Step 5: Test Supabase Connection**

In n8n:
- Click "+" to add new node
- Search "HTTP Request"
- Add node
- Method: GET
- URL: `https://YOUR_PROJECT.supabase.co/rest/v1/categories?limit=1`
- Authentication: HTTP Header Auth → select `supabaseHeaderAuth`
- Click "Execute"

Expected: Returns 1 category object (e.g., `{"id": "...", "name": "Academic", ...}`)

**Step 6: Delete Test Node**

Click the HTTP Request node → Delete (we don't need this permanently)

**Verification Checklist:**
- [ ] n8n instance is running and accessible
- [ ] Can log in successfully
- [ ] Supabase credentials created
- [ ] Supabase HTTP test worked
- [ ] Environment variables set (ARBOR_EMAIL, ARBOR_PASSWORD)

---

## Phase 3: n8n Arbor Workflow

### Task 3: Import and Configure Arbor Scraper Workflow

**Files:**
- Existing: `workflows/arbor-scraper.json`
- No modifications needed (workflow is ready)

**Step 1: Open n8n Workflows**

In n8n dashboard:
- Click "Workflows" (left sidebar)

**Step 2: Import Arbor Workflow**

- Click "Import from file"
- Select `workflows/arbor-scraper.json`
- Click "Open"

Expected: Workflow loads with multiple nodes (Schedule, Open Browser, Navigate to Arbor, Fill Email, etc.)

**Step 3: Verify All Nodes Load**

Scroll through the workflow and verify all nodes are present:
- Schedule (Cron trigger)
- Check Supabase (HTTP Request)
- Open Browser (Playwright)
- Navigate to Arbor (Playwright)
- Fill Email (Playwright)
- Fill Password (Playwright)
- Click Login (Playwright)
- Wait for Dashboard (Playwright)
- (... more message extraction nodes)

**Step 4: Fix HTTP Header Credential**

Find "Check Supabase" node:
- Click the node
- Under "Authentication", select `supabaseHeaderAuth` (created in Task 2)
- If not available, create it again

**Step 5: Verify Environment Variables**

Find "Fill Email" node:
- Value field should be: `{{ $env.ARBOR_EMAIL }}`
- If not, update it

Find "Fill Password" node:
- Value field should be: `{{ $env.ARBOR_PASSWORD }}`
- If not, update it

**Step 6: Test Arbor Workflow (Individual Nodes)**

For safety, test nodes step-by-step:

1. **Test Schedule trigger:**
   - Right-click "Schedule" node → "Execute Node"
   - Expected: Returns { "timestamp": "..." }

2. **Test Check Supabase:**
   - Right-click "Check Supabase" node → "Execute Node"
   - Expected: Returns categories list (same as Task 2, Step 5)

3. **Test Open Browser:**
   - Right-click "Open Browser" node → "Execute Node"
   - Expected: Chrome opens (may see browser window briefly)
   - Close browser after test

**Step 7: Save Workflow**

Click "Save" button (Ctrl+S or Cmd+S)

Expected: "Workflow saved" notification

**Step 8: Don't Activate Yet**

We'll activate after testing the full pipeline. Leave workflow in "inactive" state for now.

**Verification Checklist:**
- [ ] Workflow imported successfully
- [ ] All nodes load without errors
- [ ] Supabase credential linked
- [ ] ARBOR_EMAIL and ARBOR_PASSWORD environment variables set
- [ ] Schedule node test passed
- [ ] Check Supabase node test passed
- [ ] Open Browser node test passed
- [ ] Workflow saved

---

### Task 4: Complete Arbor Workflow Message Extraction

**Files:**
- Modify: `workflows/arbor-scraper.json` (the imported workflow in n8n)
- Reference: `docs/design.md` → "Workflow 1: Arbor Scraper" section

**Context:**
The imported workflow has browser automation setup but may need the message extraction logic completed. This task adds the final steps to:
1. Navigate to messages page
2. Extract message list from HTML
3. Check Supabase for duplicates
4. Insert new messages
5. Log sync results

**Step 1: Add "Navigate to Messages Page" Node**

In n8n:
- After "Wait for Dashboard" node, click "+" to add node
- Type: `Playwright`
- Name: `Navigate to Messages Page`
- Browser Action: `goto`
- URL: `https://archbishop-cranmer-church-of-england-academy.uk.arbor.sc/?/guardians/home-ui/messages` (or find actual path in Arbor)
- Click "Add"

**Step 2: Add "Extract Messages" Code Node**

- Click "+" to add node
- Type: `Code`
- Language: `JavaScript`
- Name: `Extract Messages`

Code:
```javascript
// Extract all messages from Arbor page DOM
// This is a simplified example - adjust selectors based on actual Arbor HTML

const messages = [];
const messageElements = document.querySelectorAll('[data-testid="message"]'); // adjust selector

messageElements.forEach(el => {
  const message = {
    arbor_message_id: el.getAttribute('data-id'),
    subject: el.querySelector('.message-subject')?.textContent || '',
    content: el.querySelector('.message-content')?.textContent || '',
    sender_name: el.querySelector('.sender-name')?.textContent || '',
    sender_email: el.querySelector('.sender-email')?.textContent || '',
    received_at: el.getAttribute('data-timestamp')
  };
  messages.push(message);
});

return { items: messages };
```

**Step 3: Add Loop Node**

- Click "+" to add node
- Type: `Loop`
- Name: `Loop Messages`
- Items: Connect to "Extract Messages" output
- Items to loop over: `{{ $input.json.items }}`
- Click "Add"

**Step 4: Add "Check if Message Exists" Node (Inside Loop)**

Inside the loop:
- Click "+" to add node
- Type: `HTTP Request`
- Name: `Check if Message Exists`

Configuration:
```
Method: GET
URL: https://YOUR_PROJECT.supabase.co/rest/v1/messages?arbor_message_id=eq.{{ $json.arbor_message_id }}&select=id
Authentication: supabaseHeaderAuth
```

**Step 5: Add Conditional Node**

- Click "+" to add node
- Type: `IF`
- Name: `If Message is New`
- Condition: `{{ $json.length === 0 }}` (if query returned no results, message is new)
- Click "Add"

**Step 6: Add "Insert Message" Node (True Branch)**

On the "True" branch of the IF node:
- Click "+" to add node
- Type: `HTTP Request`
- Name: `Insert Message to Supabase`

Configuration:
```
Method: POST
URL: https://YOUR_PROJECT.supabase.co/rest/v1/messages
Authentication: supabaseHeaderAuth
Body:
{
  "source": "arbor",
  "source_id": "{{ $json.arbor_message_id }}",
  "subject": "{{ $json.subject }}",
  "content": "{{ $json.content }}",
  "sender_name": "{{ $json.sender_name }}",
  "sender_email": "{{ $json.sender_email }}",
  "received_at": "{{ $json.received_at }}",
  "is_read": false
}
```

**Step 7: Add "Log to Sync Table" Node (After Loop)**

After the loop completes:
- Click "+" to add node
- Type: `HTTP Request`
- Name: `Log Sync Result`

Configuration:
```
Method: POST
URL: https://YOUR_PROJECT.supabase.co/rest/v1/sync_log
Authentication: supabaseHeaderAuth
Body:
{
  "sync_started_at": "{{ $input.first().json.timestamp }}",
  "sync_completed_at": "{{ now() }}",
  "messages_found": "{{ $input.json.items.length }}",
  "messages_new": "{{ COUNT_OF_NEW_MESSAGES }}",
  "status": "success"
}
```

**Step 8: Save Workflow**

Click "Save" (Ctrl+S)

**Step 9: Test Full Workflow**

Do NOT activate yet. Just test:
- Right-click "Schedule" node → "Execute Node"
- Watch the workflow execute through all steps
- Expected: Messages extracted, checked, and inserted (if new)

Check Supabase `sync_log` table to verify run was logged

**Verification Checklist:**
- [ ] All extraction nodes added and configured
- [ ] Loop node correctly configured
- [ ] Conditional logic correct (only insert new messages)
- [ ] Supabase insert node working
- [ ] Sync log node logging results
- [ ] Manual test passed
- [ ] Workflow saved

---

## Phase 4: n8n Gmail Workflow

### Task 5: Create Gmail OAuth2 Credentials in n8n

**Files:**
- Reference: `docs/gmail-setup.md` → Steps 1-2
- No code files yet

**Prerequisite:**
You need a Google Cloud Console project with Gmail API enabled. See `docs/gmail-setup.md` Step 1 for detailed instructions. This task assumes you've completed that.

**Step 1: Note Google Cloud Credentials**

From Google Cloud Console:
- Client ID: `...googleusercontent.com`
- Client Secret: `...` (keep this secret!)

**Step 2: Add Gmail Credential in n8n**

In n8n dashboard:
- Click "Credentials" (left sidebar)
- Click "Create New Credential"
- Type: `Gmail`
- Name: `Gmail OAuth2`
- Authentication: `OAuth2`
- Client ID: (paste from Google Cloud)
- Client Secret: (paste from Google Cloud)

**Step 3: Set OAuth2 Scopes**

In the credential form:
- Scopes field: `https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify`

**Step 4: Authorize with Google**

In the credential form:
- Click "Sign in with Google"
- You'll be redirected to Google
- Select your account
- Grant permission when prompted
- You'll be redirected back to n8n

**Step 5: Save Credential**

Click "Save"

Expected: "Credential saved successfully"

**Step 6: Verify in n8n**

- Click "Credentials" again
- You should see `Gmail OAuth2` in the list

**Verification Checklist:**
- [ ] Google Cloud Console project created
- [ ] Gmail API enabled
- [ ] OAuth2 credentials created (Client ID & Secret)
- [ ] Credential added to n8n
- [ ] OAuth2 authorization completed
- [ ] Credential appears in n8n credentials list

---

### Task 6: Create Gmail Scraper Workflow

**Files:**
- Create: `workflows/email-scraper.json` (will be auto-saved by n8n)
- Reference: `docs/design.md` → "Workflow 2: Gmail Scraper" section
- Reference: `docs/gmail-setup.md` → "Step 3: Create Gmail Node"

**Step 1: Create New Workflow in n8n**

- Click "Workflows" (left sidebar)
- Click "New Workflow"
- Name: `email-scraper`
- Click "Create"

**Step 2: Add Schedule Trigger Node**

- Click "+" to add node (in center)
- Type: `Cron`
- Name: `Schedule`
- Expression: `*/15 * * * *` (every 15 minutes, matching Arbor scraper)
- Click "Add"

**Step 3: Add Gmail Node**

- Click "+"
- Type: `Gmail`
- Name: `Get Emails`

Configuration:
```
Credentials: Gmail OAuth2 (select from dropdown)
Operation: Get Messages
Return all: true
Filter by From: (optional, you can leave blank or filter by domain)
```

- Click "Add"

**Step 4: Test Gmail Node**

- Right-click "Get Emails" node → "Execute Node"
- Expected: Returns list of emails (or empty if no emails)
- Check output to see email structure

**Step 5: Add Loop Node**

- Click "+"
- Type: `Loop`
- Name: `Loop Emails`
- Items to loop over: `{{ $input.json }}`
- Click "Add"

**Step 6: Add "Extract Email Data" Code Node (Inside Loop)**

Inside the loop:
- Click "+"
- Type: `Code`
- Language: `JavaScript`
- Name: `Extract Email Data`

Code:
```javascript
// Parse Gmail message format
const email = $json;

// Convert Gmail timestamp (milliseconds) to ISO string
const receivedAt = new Date(parseInt(email.internalDate)).toISOString();

// Extract email address from "Name <email@domain>" format
const senderEmail = email.from.match(/<(.+?)>/)?.[1] || email.from;
const senderName = email.from.match(/^(.+?)</)?.[1]?.trim() || email.from;

// Normalize subject (remove "Re:", "Fwd:")
const normalizedSubject = email.subject
  .replace(/^(Re|Fwd):\s*/i, '')
  .trim();

return {
  gmail_id: email.id,
  from: senderEmail,
  sender_name: senderName,
  subject: normalizedSubject,
  snippet: email.snippet,
  received_at: receivedAt,
  full_email: email
};
```

**Step 7: Add "Check Deduplication" Node**

- Click "+"
- Type: `HTTP Request`
- Name: `Check if Arbor Message Exists`

Configuration:
```
Method: GET
URL: https://YOUR_PROJECT.supabase.co/rest/v1/messages?source=eq.arbor&sender_email=eq.{{ $json.from }}&subject=ilike.{{ $json.subject }}&select=id
Authentication: supabaseHeaderAuth
```

**Step 8: Add Conditional Node**

- Click "+"
- Type: `IF`
- Name: `If Not Duplicate`
- Condition: `{{ $json.length === 0 }}` (if no Arbor message found, this is new)

**Step 9: Add "Insert Email" Node (True Branch)**

On the "True" branch:
- Click "+"
- Type: `HTTP Request`
- Name: `Insert Email to Supabase`

Configuration:
```
Method: POST
URL: https://YOUR_PROJECT.supabase.co/rest/v1/messages
Authentication: supabaseHeaderAuth
Body:
{
  "source": "gmail",
  "source_id": "{{ $json.gmail_id }}",
  "subject": "{{ $json.subject }}",
  "content": "{{ $json.snippet }}",
  "sender_name": "{{ $json.sender_name }}",
  "sender_email": "{{ $json.from }}",
  "received_at": "{{ $json.received_at }}",
  "is_read": false
}
```

**Step 10: Add "Log Sync" Node (After Loop)**

After the loop ends:
- Click "+"
- Type: `HTTP Request`
- Name: `Log Sync Result`

Configuration:
```
Method: POST
URL: https://YOUR_PROJECT.supabase.co/rest/v1/sync_log
Authentication: supabaseHeaderAuth
Body:
{
  "sync_started_at": "{{ now() }}",
  "sync_completed_at": "{{ now() }}",
  "messages_found": "{{ $input.json.length }}",
  "messages_new": "{{ COUNT_OF_INSERTED }}",
  "status": "success"
}
```

**Step 11: Save Workflow**

Click "Save" (Ctrl+S)

**Step 12: Test Gmail Workflow**

- Right-click "Schedule" node → "Execute Node"
- Watch execution
- Check Supabase messages table for any new emails

**Step 13: Export Workflow**

For version control:
- Click "..." menu → "Download"
- Save to `workflows/email-scraper.json`

**Verification Checklist:**
- [ ] Workflow created with correct name
- [ ] Schedule trigger (15-min) configured
- [ ] Gmail node gets emails successfully
- [ ] Loop iterates through emails
- [ ] Deduplication logic correct (checks for Arbor version)
- [ ] Only new emails inserted (skips duplicates)
- [ ] Sync log recorded
- [ ] Manual test passed
- [ ] Workflow exported to file
- [ ] Workflow saved in n8n

---

## Phase 5: React Dashboard Setup

### Task 7: Initialize React Project

**Files:**
- Create: `package.json`
- Create: `.env.local`
- Create: `public/index.html`
- Create: `src/index.js`
- Create: `src/App.js`

**Step 1: Choose React Setup Method**

Pick one:
- **Option A: Vite (Fastest, Recommended)** - Modern, instant HMR
- **Option B: Create React App** - Traditional, well-known
- **Option C: Next.js** - Full-stack if needed later

This plan uses **Vite**. Adjust commands if using different tool.

**Step 2: Create package.json**

File: `/c/Users/david/charlie-tracker/package.json`

```json
{
  "name": "charlie-tracker",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "test": "vitest"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@supabase/supabase-js": "^2.38.0"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^4.4.0"
  }
}
```

**Step 3: Install Dependencies**

```bash
cd /c/Users/david/charlie-tracker
npm install
```

Expected: `node_modules/` folder created, ~200 packages installed

**Step 4: Create Vite Config**

File: `/c/Users/david/charlie-tracker/vite.config.js`

```javascript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173
  }
})
```

**Step 5: Create HTML Entry Point**

File: `/c/Users/david/charlie-tracker/public/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Charlie Oakes Tracker</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/index.js"></script>
</body>
</html>
```

**Step 6: Create React Root**

File: `/c/Users/david/charlie-tracker/src/index.js`

```javascript
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
```

**Step 7: Create Environment Config**

File: `/c/Users/david/charlie-tracker/.env.local`

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

(Get these from Supabase dashboard → Settings → API)

**Step 8: Create Supabase Client**

File: `/c/Users/david/charlie-tracker/src/lib/supabase.js`

```javascript
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```

**Step 9: Create Basic App Component**

File: `/c/Users/david/charlie-tracker/src/App.js`

```javascript
import React, { useState, useEffect } from 'react'
import { supabase } from './lib/supabase'
import './App.css'

function App() {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadMessages()
  }, [])

  async function loadMessages() {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .order('received_at', { ascending: false })
        .limit(50)

      if (error) throw error
      setMessages(data || [])
    } catch (error) {
      setError(error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="app">
      <header>
        <h1>Charlie Oakes Tracker</h1>
      </header>
      <main>
        {loading && <p>Loading...</p>}
        {error && <p className="error">Error: {error}</p>}
        <ul className="message-list">
          {messages.map(msg => (
            <li key={msg.id} className="message-item">
              <h3>{msg.subject}</h3>
              <p className="sender">{msg.sender_name}</p>
              <p className="preview">{msg.content?.substring(0, 100)}...</p>
              <span className="source">{msg.source}</span>
            </li>
          ))}
        </ul>
      </main>
    </div>
  )
}

export default App
```

**Step 10: Create Basic Styles**

File: `/c/Users/david/charlie-tracker/src/App.css`

```css
:root {
  --primary: #3B82F6;
  --success: #10B981;
  --danger: #EF4444;
  --bg: #f9fafb;
  --border: #e5e7eb;
}

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  background-color: var(--bg);
}

.app {
  min-height: 100vh;
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

header {
  margin-bottom: 30px;
  border-bottom: 1px solid var(--border);
  padding-bottom: 20px;
}

header h1 {
  color: #1f2937;
  font-size: 24px;
}

.message-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.message-item {
  background: white;
  padding: 15px;
  border: 1px solid var(--border);
  border-radius: 8px;
  cursor: pointer;
  transition: box-shadow 0.2s;
}

.message-item:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.message-item h3 {
  color: #1f2937;
  font-size: 16px;
  margin-bottom: 8px;
}

.sender {
  color: #6b7280;
  font-size: 14px;
  margin-bottom: 8px;
}

.preview {
  color: #6b7280;
  font-size: 14px;
  margin-bottom: 8px;
  line-height: 1.5;
}

.source {
  display: inline-block;
  background: #dbeafe;
  color: var(--primary);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  margin-top: 8px;
}

.error {
  background: #fee2e2;
  color: var(--danger);
  padding: 12px;
  border-radius: 4px;
  margin-bottom: 20px;
}
```

**Step 11: Test Dev Server**

```bash
cd /c/Users/david/charlie-tracker
npm run dev
```

Expected:
```
VITE v4.4.0  ready in 200 ms

➜  Local:   http://localhost:5173/
```

Open http://localhost:5173 in browser
Expected: Page loads, shows "Loading..." initially, then displays messages from Supabase

**Step 12: Stop Dev Server**

Press `Ctrl+C` in terminal

**Step 13: Commit**

```bash
cd /c/Users/david/charlie-tracker
git add package.json package-lock.json .env.local public/ src/
git commit -m "feat: initialize React project with Supabase integration"
```

**Verification Checklist:**
- [ ] npm install succeeded
- [ ] vite.config.js created
- [ ] .env.local has Supabase credentials
- [ ] Dev server starts without errors
- [ ] App loads in browser
- [ ] Messages display from Supabase
- [ ] CSS styling applied

---

### Task 8: Add Real-Time Message Subscriptions

**Files:**
- Modify: `src/App.js`
- Create: `src/hooks/useRealtime.js`

**Step 1: Create Custom Hook for Realtime**

File: `/c/Users/david/charlie-tracker/src/hooks/useRealtime.js`

```javascript
import { useEffect } from 'react'
import { supabase } from '../lib/supabase'

export function useRealtimeMessages(onInsert) {
  useEffect(() => {
    const channel = supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
        },
        (payload) => {
          onInsert(payload.new)
        }
      )
      .subscribe((status) => {
        console.log('Realtime status:', status)
      })

    return () => {
      channel.unsubscribe()
    }
  }, [onInsert])
}
```

**Step 2: Update App.js to Use Realtime**

Modify: `/c/Users/david/charlie-tracker/src/App.js`

Add import at top:
```javascript
import { useRealtimeMessages } from './hooks/useRealtime'
```

Replace the `useEffect` with:
```javascript
useEffect(() => {
  loadMessages()
}, [])

useRealtimeMessages((newMessage) => {
  setMessages(prev => [newMessage, ...prev])
  showNotification(`New message from ${newMessage.sender_name}`)
})

function showNotification(text) {
  // Simple notification (will enhance in next task)
  console.log('Notification:', text)
}
```

**Step 3: Test Realtime Connection**

Start dev server:
```bash
npm run dev
```

Open browser console (F12 → Console tab)
Expected: See "Realtime status: ok"

**Step 4: Verify Connection Works**

In another terminal, insert a test message to Supabase:
```bash
curl -X POST https://YOUR_PROJECT.supabase.co/rest/v1/messages \
  -H "Authorization: Bearer YOUR_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "test",
    "subject": "Test Message",
    "content": "This is a test",
    "sender_name": "Test Sender",
    "received_at": "2026-02-21T15:00:00Z",
    "is_read": false
  }'
```

Expected: Message appears instantly in dashboard without page refresh

**Step 5: Clean Up Test Message**

```bash
# In Supabase SQL Editor or via API:
DELETE FROM messages WHERE source = 'test'
```

**Step 6: Commit**

```bash
git add src/hooks/useRealtime.js src/App.js
git commit -m "feat: add real-time message subscriptions"
```

**Verification Checklist:**
- [ ] useRealtime hook created
- [ ] App.js updated with realtime subscription
- [ ] Dev server running without errors
- [ ] Realtime status shows "ok" in console
- [ ] New messages appear instantly (< 1 second)
- [ ] Test message inserted and appeared live
- [ ] Test message cleaned up

---

### Task 9: Add Toast Notifications

**Files:**
- Create: `src/components/Toast.js`
- Modify: `src/App.js`
- Create: `src/App.css` (update with toast styles)

**Step 1: Create Toast Component**

File: `/c/Users/david/charlie-tracker/src/components/Toast.js`

```javascript
import React, { useState, useEffect } from 'react'
import '../styles/Toast.css'

export function Toast({ message, onClose, type = 'info' }) {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000) // Auto-dismiss after 3 seconds
    return () => clearTimeout(timer)
  }, [onClose])

  return (
    <div className={`toast toast-${type}`}>
      <p>{message}</p>
      <button onClick={onClose} className="toast-close">×</button>
    </div>
  )
}

export function ToastContainer({ toasts, onRemove }) {
  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <Toast
          key={toast.id}
          message={toast.message}
          type={toast.type}
          onClose={() => onRemove(toast.id)}
        />
      ))}
    </div>
  )
}
```

**Step 2: Create Toast Styles**

File: `/c/Users/david/charlie-tracker/src/styles/Toast.css`

```css
.toast-container {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.toast {
  background: white;
  border-left: 4px solid #3B82F6;
  padding: 15px;
  border-radius: 4px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 15px;
  min-width: 300px;
  animation: slideIn 0.3s ease-out;
}

.toast-success {
  border-left-color: #10B981;
}

.toast-error {
  border-left-color: #EF4444;
}

.toast-warning {
  border-left-color: #F59E0B;
}

.toast-info {
  border-left-color: #3B82F6;
}

.toast p {
  margin: 0;
  flex: 1;
  color: #1f2937;
}

.toast-close {
  background: none;
  border: none;
  font-size: 24px;
  color: #d1d5db;
  cursor: pointer;
  padding: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.toast-close:hover {
  color: #6b7280;
}

@keyframes slideIn {
  from {
    transform: translateX(400px);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}
```

**Step 3: Update App.js to Use Toasts**

Modify: `/c/Users/david/charlie-tracker/src/App.js`

Add imports:
```javascript
import { ToastContainer } from './components/Toast'
```

Add state:
```javascript
const [toasts, setToasts] = useState([])
```

Add function:
```javascript
function addToast(message, type = 'info') {
  const id = Date.now()
  setToasts(prev => [...prev, { id, message, type }])
}

function removeToast(id) {
  setToasts(prev => prev.filter(t => t.id !== id))
}
```

Update realtime handler:
```javascript
useRealtimeMessages((newMessage) => {
  setMessages(prev => [newMessage, ...prev])
  addToast(`New message from ${newMessage.sender_name}`, 'info')
})
```

Add to JSX (inside the app div):
```javascript
<ToastContainer toasts={toasts} onRemove={removeToast} />
```

**Step 4: Test Toast Notifications**

Start dev server:
```bash
npm run dev
```

Insert a test message (using curl command from Task 8, Step 4)
Expected: Toast notification appears in top-right corner, auto-dismisses after 3 seconds

**Step 5: Test Manual Close**

Click the × button on a toast
Expected: Toast closes immediately

**Step 6: Clean Up**

Delete test message from Supabase

**Step 7: Commit**

```bash
git add src/components/Toast.js src/styles/Toast.css src/App.js
git commit -m "feat: add toast notification system"
```

**Verification Checklist:**
- [ ] Toast component created
- [ ] Toast styles created
- [ ] App.js updated with toast state and handlers
- [ ] Toast appears on new message
- [ ] Toast auto-dismisses after 3 seconds
- [ ] Manual close button works
- [ ] Multiple toasts stack vertically

---

### Task 10: Add Message Filtering & Search

**Files:**
- Create: `src/components/Filters.js`
- Modify: `src/App.js`
- Modify: `src/App.css`

**Step 1: Create Filters Component**

File: `/c/Users/david/charlie-tracker/src/components/Filters.js`

```javascript
import React from 'react'
import '../styles/Filters.css'

export function Filters({
  onStatusChange,
  onSourceChange,
  onSearchChange,
  categories = []
}) {
  return (
    <div className="filters">
      <div className="filter-group">
        <label>Status</label>
        <select onChange={(e) => onStatusChange(e.target.value)}>
          <option value="all">All Messages</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
      </div>

      <div className="filter-group">
        <label>Source</label>
        <select onChange={(e) => onSourceChange(e.target.value)}>
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
          onChange={(e) => onSearchChange(e.target.value)}
        />
      </div>
    </div>
  )
}
```

**Step 2: Create Filters Styles**

File: `/c/Users/david/charlie-tracker/src/styles/Filters.css`

```css
.filters {
  display: flex;
  gap: 15px;
  padding: 20px;
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-group label {
  font-size: 12px;
  font-weight: 600;
  color: #6b7280;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.filter-group select,
.filter-group input {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 14px;
  font-family: inherit;
}

.filter-group select:focus,
.filter-group input:focus {
  outline: none;
  border-color: #3B82F6;
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.filter-group.search {
  flex: 1;
  min-width: 200px;
}
```

**Step 3: Update App.js with Filtering**

Modify: `/c/Users/david/charlie-tracker/src/App.js`

Add imports:
```javascript
import { Filters } from './components/Filters'
```

Add state:
```javascript
const [statusFilter, setStatusFilter] = useState('all')
const [sourceFilter, setSourceFilter] = useState('all')
const [searchQuery, setSearchQuery] = useState('')
```

Add filter function:
```javascript
function getFilteredMessages() {
  let filtered = messages

  // Status filter
  if (statusFilter === 'unread') {
    filtered = filtered.filter(m => !m.is_read)
  } else if (statusFilter === 'read') {
    filtered = filtered.filter(m => m.is_read)
  }

  // Source filter
  if (sourceFilter !== 'all') {
    filtered = filtered.filter(m => m.source === sourceFilter)
  }

  // Search filter
  if (searchQuery) {
    const query = searchQuery.toLowerCase()
    filtered = filtered.filter(m =>
      m.subject.toLowerCase().includes(query) ||
      m.sender_name.toLowerCase().includes(query) ||
      (m.content && m.content.toLowerCase().includes(query))
    )
  }

  return filtered
}
```

Add to JSX (after header, before message list):
```javascript
<Filters
  onStatusChange={setStatusFilter}
  onSourceChange={setSourceFilter}
  onSearchChange={setSearchQuery}
/>
```

Update message list to use filtered messages:
```javascript
const filteredMessages = getFilteredMessages()

// In JSX:
{filteredMessages.length === 0 ? (
  <p className="no-messages">No messages found</p>
) : (
  <ul className="message-list">
    {filteredMessages.map(msg => (
      // ...existing message item JSX...
    ))}
  </ul>
)}
```

Add CSS to `src/App.css`:
```css
.no-messages {
  text-align: center;
  color: #9ca3af;
  padding: 40px;
  font-size: 14px;
}
```

**Step 4: Test Filtering**

Start dev server:
```bash
npm run dev
```

Test each filter:
1. Click "Status" → Select "Unread" → Should show only unread
2. Click "Source" → Select "Arbor" → Should show only Arbor messages
3. Type in "Search" field → Should filter by subject/sender

Expected: Filtering works in real-time, counts update correctly

**Step 5: Test Search**

Type a word from a message subject
Expected: Only matching messages show

**Step 6: Clear Search**

Clear the search field
Expected: All messages reappear

**Step 7: Commit**

```bash
git add src/components/Filters.js src/styles/Filters.css src/App.js
git commit -m "feat: add message filtering and search"
```

**Verification Checklist:**
- [ ] Filters component created
- [ ] Status filter works (All, Unread, Read)
- [ ] Source filter works (All, Arbor, Gmail)
- [ ] Search works (filters by subject/sender/content)
- [ ] Multiple filters combine correctly
- [ ] "No messages" message shows when filtered results empty
- [ ] All filters responsive on mobile

---

### Task 11: Add Mark-as-Read Functionality

**Files:**
- Create: `src/components/MessageCard.js`
- Modify: `src/App.js`
- Modify: `src/App.css`

**Step 1: Create MessageCard Component**

File: `/c/Users/david/charlie-tracker/src/components/MessageCard.js`

```javascript
import React, { useState } from 'react'
import { supabase } from '../lib/supabase'
import '../styles/MessageCard.css'

export function MessageCard({ message, onMarkAsRead }) {
  const [expanded, setExpanded] = useState(false)
  const [isUpdating, setIsUpdating] = useState(false)

  async function toggleReadStatus() {
    try {
      setIsUpdating(true)
      const { error } = await supabase
        .from('messages')
        .update({ is_read: !message.is_read })
        .eq('id', message.id)

      if (error) throw error
      onMarkAsRead(message.id, !message.is_read)
    } catch (error) {
      console.error('Error updating message:', error)
    } finally {
      setIsUpdating(false)
    }
  }

  return (
    <li className={`message-card ${message.is_read ? 'read' : 'unread'}`}>
      <div className="message-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="message-card-info">
          <h3 className="message-subject">{message.subject}</h3>
          <p className="message-sender">{message.sender_name}</p>
          <p className="message-time">
            {new Date(message.received_at).toLocaleString()}
          </p>
        </div>
        <div className="message-card-meta">
          <span className={`source-badge source-${message.source}`}>
            {message.source.toUpperCase()}
          </span>
          {!message.is_read && <span className="unread-dot"></span>}
        </div>
      </div>

      {expanded && (
        <div className="message-card-expanded">
          <div className="message-content">
            {message.content}
          </div>
          <div className="message-card-actions">
            <button
              onClick={toggleReadStatus}
              disabled={isUpdating}
              className="btn btn-secondary"
            >
              {message.is_read ? 'Mark as Unread' : 'Mark as Read'}
            </button>
          </div>
        </div>
      )}
    </li>
  )
}
```

**Step 2: Create MessageCard Styles**

File: `/c/Users/david/charlie-tracker/src/styles/MessageCard.css`

```css
.message-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  overflow: hidden;
  transition: all 0.2s;
}

.message-card.unread {
  background: #f0f9ff;
  border-left: 4px solid #3B82F6;
}

.message-card.read {
  opacity: 0.8;
}

.message-card:hover {
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}

.message-card-header {
  padding: 16px;
  cursor: pointer;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 12px;
}

.message-card-info {
  flex: 1;
  min-width: 0;
}

.message-subject {
  font-size: 16px;
  font-weight: 600;
  color: #1f2937;
  margin: 0 0 4px 0;
}

.message-sender {
  font-size: 14px;
  color: #6b7280;
  margin: 0 0 2px 0;
}

.message-time {
  font-size: 12px;
  color: #9ca3af;
  margin: 0;
}

.message-card-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-shrink: 0;
}

.source-badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.source-arbor {
  background: #dbeafe;
  color: #0284c7;
}

.source-gmail {
  background: #fce7f3;
  color: #be185d;
}

.source-whatsapp {
  background: #dcfce7;
  color: #15803d;
}

.unread-dot {
  width: 8px;
  height: 8px;
  background: #3B82F6;
  border-radius: 50%;
}

.message-card-expanded {
  padding: 0 16px 16px 16px;
  border-top: 1px solid #e5e7eb;
  animation: slideDown 0.2s ease-out;
}

.message-content {
  color: #4b5563;
  line-height: 1.6;
  margin-bottom: 12px;
  font-size: 14px;
  white-space: pre-wrap;
  word-wrap: break-word;
}

.message-card-actions {
  display: flex;
  gap: 8px;
}

.btn {
  padding: 8px 12px;
  border: 1px solid #d1d5db;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  background: white;
  color: #4b5563;
}

.btn:hover:not(:disabled) {
  background: #f3f4f6;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  border-color: #3B82F6;
  color: #3B82F6;
}

.btn-secondary:hover:not(:disabled) {
  background: #eff6ff;
}

@keyframes slideDown {
  from {
    opacity: 0;
    max-height: 0;
  }
  to {
    opacity: 1;
    max-height: 500px;
  }
}
```

**Step 3: Update App.js to Use MessageCard**

Modify: `/c/Users/david/charlie-tracker/src/App.js`

Add import:
```javascript
import { MessageCard } from './components/MessageCard'
```

Add function:
```javascript
function handleMarkAsRead(messageId, isRead) {
  setMessages(prev => prev.map(m =>
    m.id === messageId ? { ...m, is_read: isRead } : m
  ))
}
```

Replace message list JSX with:
```javascript
<ul className="message-list">
  {filteredMessages.map(msg => (
    <MessageCard
      key={msg.id}
      message={msg}
      onMarkAsRead={handleMarkAsRead}
    />
  ))}
</ul>
```

Update App.css to remove the old .message-item styles:
Remove:
```css
.message-item { ... }
.message-item:hover { ... }
.message-item h3 { ... }
.sender { ... }
.preview { ... }
.source { ... }
```

**Step 4: Test Mark as Read**

Start dev server:
```bash
npm run dev
```

1. Click a message to expand it
2. Click "Mark as Read"
   - Expected: Message background changes, unread dot disappears, button text changes
3. Click "Mark as Unread"
   - Expected: Unread dot reappears, message background changes back
4. Check Supabase: `messages` table → `is_read` column should update

**Step 5: Test Unread Filter**

1. Mark some messages as read
2. Filter by "Status" → "Unread"
3. Expected: Only unread messages show

**Step 6: Commit**

```bash
git add src/components/MessageCard.js src/styles/MessageCard.css src/App.js
git commit -m "feat: add message expansion and mark-as-read functionality"
```

**Verification Checklist:**
- [ ] MessageCard component created with expand/collapse
- [ ] Mark as read button works
- [ ] is_read field updates in Supabase
- [ ] Unread dot shows/hides correctly
- [ ] Message styling reflects read status
- [ ] Unread filter works correctly
- [ ] Multiple messages can be expanded independently

---

## Phase 6: Activation & Testing

### Task 12: Activate n8n Workflows

**Files:**
- No code changes (configuration only)
- Existing: `workflows/arbor-scraper.json`
- Existing: `workflows/email-scraper.json`

**Step 1: Activate Arbor Scraper**

In n8n:
- Click "Workflows" → "arbor-scraper"
- Click "Activate" button (should be green)

Expected: "Workflow activated" notification

**Step 2: Verify Schedule Running**

Wait 15 minutes OR manually trigger:
- Right-click "Schedule" node → "Execute Node"
- Workflow should run through to completion
- Check Supabase `sync_log` table for a new entry

**Step 3: Activate Gmail Scraper**

In n8n:
- Click "Workflows" → "email-scraper"
- Click "Activate" button

Expected: "Workflow activated" notification

**Step 4: Verify Gmail Running**

Manually trigger:
- Right-click "Schedule" node → "Execute Node"
- Workflow should run through to completion
- Check Supabase `sync_log` table for a new entry

**Step 5: Check Both Are in Status**

In n8n Workflows list:
- Both "arbor-scraper" and "email-scraper" should show green "Active" badge

**Step 6: Monitor for 24 Hours**

- Check Supabase every 15 minutes to verify messages sync
- Check sync_log for any errors
- Alert on any failures in workflow execution history

**Verification Checklist:**
- [ ] Arbor scraper is activated (green badge)
- [ ] Gmail scraper is activated (green badge)
- [ ] Both workflows run every 15 minutes
- [ ] Messages appear in Supabase after each run
- [ ] sync_log shows success status
- [ ] No errors in execution history
- [ ] Dashboard receives realtime updates

---

### Task 13: Deploy React App to Production

**Files:**
- Existing: `src/`, `public/`, package.json, vite.config.js
- Create: `.env.production` (for production Supabase credentials)

**Choose Deployment Target:**

**Option A: Vercel (Recommended, easiest)**
- Zero-config, auto-deployed on git push
- Free for personal projects

**Option B: Netlify**
- Similar to Vercel, great DX
- Free tier available

**Option C: Self-hosted (AWS, DigitalOcean)**
- More control, ongoing cost

This plan uses **Vercel**. Adjust if different.

**Step 1: Build for Production**

```bash
cd /c/Users/david/charlie-tracker
npm run build
```

Expected:
```
vite v4.4.0 building for production...
✓ 123 modules transformed
dist/index.html        0.50 kB
dist/assets/index-abc.js  45.23 kB
dist/assets/index-xyz.css 2.15 kB
```

**Step 2: Verify Build Output**

Check `dist/` folder exists with:
- index.html
- assets/ folder with .js and .css files

**Step 3: Sign Up for Vercel (if needed)**

Go to https://vercel.com
- Click "Sign Up"
- Use GitHub account (recommended)
- Authorize Vercel

**Step 4: Create .env.production**

File: `/c/Users/david/charlie-tracker/.env.production`

```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

(Same credentials as .env.local)

**Step 5: Initialize Git (if not already)**

```bash
cd /c/Users/david/charlie-tracker
git init
git add .
git commit -m "initial commit: Charlie Tracker MVP"
```

**Step 6: Push to GitHub**

```bash
git remote add origin https://github.com/YOUR_USERNAME/charlie-tracker.git
git branch -M main
git push -u origin main
```

(Create empty repo on GitHub first)

**Step 7: Deploy to Vercel**

Option A: Via GitHub (recommended)
- Go to https://vercel.com/import
- Select your GitHub repo
- Click "Import"
- Vercel auto-detects Vite and builds

Option B: Via Vercel CLI
```bash
npm i -g vercel
vercel login
vercel
```

**Step 8: Verify Deployment**

- Vercel shows deployment URL (e.g., `https://charlie-tracker.vercel.app`)
- Visit URL in browser
- Expected: Dashboard loads with all messages

**Step 9: Test Realtime**

1. Open dashboard in two browsers
2. In one browser, insert a test message to Supabase
3. Expected: Message appears instantly in both browsers (< 1 second)

**Step 10: Clean Up Test Data**

Delete test message from Supabase

**Step 11: Configure Custom Domain (Optional)**

In Vercel dashboard:
- Go to Settings → Domains
- Add your domain (e.g., charlie-tracker.yourdomain.com)
- Follow DNS instructions

**Verification Checklist:**
- [ ] `npm run build` succeeds
- [ ] dist/ folder created with all assets
- [ ] GitHub repo created and code pushed
- [ ] Vercel deployment succeeds
- [ ] Dashboard loads at production URL
- [ ] Realtime works (< 1 second)
- [ ] All filters and search work
- [ ] Mark as read works
- [ ] Toast notifications work

---

### Task 14: End-to-End Testing & Verification

**Files:**
- None (testing and verification only)

**Test 1: Arbor → Supabase → React Pipeline**

1. Log into Arbor app manually
2. Send yourself a test message
3. Wait for n8n to run (or manually trigger)
4. Check Supabase: new message in `messages` table
5. Check React dashboard: message appears instantly
6. Expected: Complete pipeline works, < 1 second latency

**Test 2: Gmail → Supabase → React Pipeline**

1. Send yourself a test email from school email domain
2. Wait for n8n to run (or manually trigger)
3. Check Supabase: new message in `messages` table with source='gmail'
4. Check React dashboard: message appears instantly
5. Expected: Email pipeline works, < 1 second latency

**Test 3: Deduplication**

1. From Arbor, send a message that ALSO arrives via email
2. Run both workflows
3. Check `messages` table: should have only 1 entry (the Arbor one)
4. Check `sync_log`: email workflow shows `messages_new=0` (deduplicated)
5. Expected: Email version is skipped, Arbor is trusted

**Test 4: Mark as Read Across Realtime**

1. Open React dashboard in 2 browser windows
2. In window 1, mark a message as read
3. In window 2: message should update immediately (no refresh)
4. Check Supabase: `is_read` is true
5. Expected: Realtime propagates to all clients

**Test 5: Filtering**

1. Mark 5 messages as read, leave 5 unread
2. Click filter "Status" → "Unread"
3. Expected: Only 5 unread show
4. Click filter "Status" → "Read"
5. Expected: Only 5 read show
6. Click filter "Source" → "Arbor"
7. Expected: Only Arbor messages show (assuming mixed)
8. Search for a word from a message
9. Expected: Only matching messages show

**Test 6: Toast Notifications**

1. Open React dashboard
2. Send a test Arbor message
3. Wait for n8n (or trigger manually)
4. Expected: Toast appears in top-right with sender name
5. Toast auto-dismisses after 3 seconds

**Test 7: Error Handling**

1. Disconnect WiFi / disable internet
2. Try to mark a message as read
3. Expected: Show error in console, button shows disabled state
4. Reconnect internet
5. Try again
6. Expected: Works normally

**Test 8: Performance**

1. Generate 100+ messages in Supabase
2. Load React dashboard
3. Expected: Loads within 2 seconds, responsive scrolling

**Test 9: Mobile Responsiveness**

1. Open React dashboard on mobile device (or browser dev tools mobile view)
2. All elements should be readable
3. Buttons should be clickable
4. Filters should work on mobile
5. Expected: Fully functional on mobile

**Test 10: Concurrent Users (Optional)**

1. Open dashboard in 3+ browsers simultaneously
2. Insert a message in one
3. Expected: All browsers receive realtime update instantly

**Verification Checklist:**
- [ ] Arbor → Supabase → React works end-to-end
- [ ] Gmail → Supabase → React works end-to-end
- [ ] Deduplication correctly skips email (trusts Arbor)
- [ ] Realtime updates all browsers < 1 second
- [ ] All filters work correctly
- [ ] Mark as read works across clients
- [ ] Toast notifications appear and dismiss
- [ ] Error states handled gracefully
- [ ] Performance acceptable with 100+ messages
- [ ] Mobile view fully functional

---

## Phase 7: Production Monitoring

### Task 15: Set Up Monitoring & Alerts

**Files:**
- Create: `docs/monitoring.md` (reference guide)

**Step 1: Monitor Supabase**

In Supabase dashboard:
- Go to "Database" → "Realtime" → Monitor WebSocket connections
- Should see connections from React dashboard
- Check "Storage" for any attachment uploads

**Step 2: Monitor n8n Workflows**

In n8n:
- Go to each workflow → "Executions" tab
- Should see runs every 15 minutes
- Click each run to verify success
- Check for any errors

**Step 3: Query Sync Log**

In Supabase SQL Editor, run:
```sql
SELECT
  DATE(created_at) as day,
  COUNT(*) as total_runs,
  SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as successful,
  SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failed,
  SUM(messages_new) as new_messages
FROM sync_log
GROUP BY day
ORDER BY day DESC
LIMIT 7;
```

Expected: All rows show status='success', messages_new > 0

**Step 4: Check Database Performance**

In Supabase SQL Editor:
```sql
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size('"' || schemaname || '"."' || tablename || '"')) AS size
FROM pg_tables
WHERE schemaname NOT IN ('pg_catalog', 'information_schema')
ORDER BY pg_total_relation_size('"' || schemaname || '"."' || tablename || '"') DESC;
```

Expected: messages table growing at expected rate (~10-50 new rows per day)

**Step 5: Set Up Email Alert (Optional)**

Configure n8n to send you an email if a workflow fails:
- After error handling node
- Add "Email" node
- Send to your email address

**Step 6: Daily Health Check**

Create a checklist to run daily:
- [ ] n8n Arbor scraper ran last 15 min (check Executions)
- [ ] n8n Gmail scraper ran last 15 min (check Executions)
- [ ] New messages appeared in Supabase
- [ ] React dashboard loads without errors
- [ ] No errors in Supabase logs

**Step 7: Document in `docs/monitoring.md`**

Create monitoring guide with:
- How to check workflow executions
- How to query sync_log
- How to check Supabase performance
- How to access logs
- Troubleshooting common issues

---

## Completion Checklist

### Setup Complete ✅
- [ ] Supabase database deployed
- [ ] n8n Arbor workflow activated
- [ ] n8n Gmail workflow activated
- [ ] React dashboard deployed to production

### Functionality Complete ✅
- [ ] Messages sync from Arbor every 15 minutes
- [ ] Messages sync from Gmail every 15 minutes
- [ ] Duplicate emails are skipped (trust Arbor)
- [ ] React shows messages in real-time (< 1s)
- [ ] Toast notifications on new messages
- [ ] Mark messages as read/unread
- [ ] Filter by status (all/unread/read)
- [ ] Filter by source (arbor/gmail)
- [ ] Search messages by subject/sender

### Testing Complete ✅
- [ ] End-to-end Arbor pipeline tested
- [ ] End-to-end Gmail pipeline tested
- [ ] Deduplication tested and working
- [ ] Realtime updates verified
- [ ] Mobile responsiveness verified
- [ ] Performance acceptable

### Documentation Complete ✅
- [ ] Implementation plan saved to git
- [ ] README updated with setup instructions
- [ ] Architecture documented in ARCHITECTURE.md
- [ ] Monitoring guide created

### Ready for Production ✅
- [ ] All workflows monitoring for 24+ hours
- [ ] No errors in logs
- [ ] Dashboard stable and responsive
- [ ] Realtime working reliably
- [ ] Team trained (if applicable)

