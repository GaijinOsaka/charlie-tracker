# Architecture Design Document

**Date:** 2026-02-21
**Status:** Approved for Implementation
**Version:** 1.0

---

## Executive Summary

Charlie Oakes Communication Tracker consolidates messages from **Arbor (school app)** and **Gmail (school emails)** into a single dashboard with real-time alerts. Data flows through n8n automation → Supabase database → React frontend using WebSocket subscriptions for instant updates.

**MVP Scope:**
- ✅ Arbor scraping (browser automation via Playwright)
- ✅ Gmail integration (OAuth2 + label-based filtering)
- ✅ React dashboard with real-time notifications
- 📋 WhatsApp (Phase 2)

---

## Architecture Decision: Approach 1 - Realtime-First

### Data Flow Diagram

```
┌─────────────────────┐
│  Arbor (School App) │
└──────────┬──────────┘
           │
    n8n Playwright
    (browser automation)
           │
           ├────────────────────────┐
           │                        │
           ↓                        ↓
    ┌──────────────┐         ┌─────────────┐
    │   Gmail      │         │  Supabase   │
    │ (OAuth2)     │         │  REST API   │
    │ (15-min)     │         │             │
    └──────────────┘         │ messages    │
           │                 │ categories  │
           │                 │ attachments │
           │                 │ sync_log    │
           └────────┬────────┘
                    │
           ┌────────▼────────┐
           │  Deduplication  │
           │  (Trust Arbor)  │
           └────────┬────────┘
                    │
           ┌────────▼─────────────┐
           │ Supabase Realtime    │
           │ (WebSocket Broadcast)│
           └────────┬─────────────┘
                    │
           ┌────────▼─────────────┐
           │  React Dashboard    │
           │  (Subscriptions)    │
           │                     │
           │ • Message List      │
           │ • Unread Badge      │
           │ • Toast Alerts      │
           │ • Filter/Search     │
           └─────────────────────┘
```

### Why Realtime-First?

| Criterion | Realtime-First | Polling | Hybrid |
|-----------|---|---|---|
| Alert Speed | <1s | 30s+ | <1s |
| Complexity | Medium | Low | High |
| UX Quality | Excellent | Poor | Excellent |
| Cost | Low | Moderate | High |
| This Project | ✅ BEST | ❌ | ✓ |

---

## Data Model

### Messages Table (Primary)

```sql
messages {
  id: UUID (PK)
  source: TEXT               -- 'arbor' or 'gmail'
  source_id: TEXT (UNIQUE)   -- arbor_message_id or gmail_message_id
  subject: TEXT
  content: TEXT
  sender_name: TEXT
  sender_email: TEXT
  received_at: TIMESTAMPTZ   -- when message arrived at source
  category_id: UUID (FK)     -- Academic, Events, Health, etc.
  is_read: BOOLEAN (default: false)
  created_at: TIMESTAMPTZ    -- when we stored it
  updated_at: TIMESTAMPTZ    -- last modification
  metadata: JSONB            -- source-specific data (attachments, etc.)
}

-- Index for fast queries
CREATE INDEX idx_messages_source ON messages(source);
CREATE INDEX idx_messages_received_at ON messages(received_at DESC);
CREATE INDEX idx_messages_is_read ON messages(is_read);
```

### Deduplication Strategy

**Problem:** Same message might arrive via both Arbor AND Gmail

**Solution:** Trust Arbor as source of truth

```
Rule: If message exists from Arbor with same sender + subject + received_at,
      IGNORE the Gmail version (deduplicate)

Implementation:
1. n8n fetches Arbor messages → marks source='arbor'
2. n8n fetches Gmail messages → marks source='gmail'
3. Before INSERT to Supabase:
   - Check if similar message from Arbor already exists
   - If yes: SKIP the Gmail message
   - If no: INSERT the Gmail message
4. Query on frontend shows unified list (source-agnostic)
```

---

## n8n Workflows (Two Parallel Scrapers)

### Workflow 1: Arbor Scraper

**Trigger:** Every 15 minutes (cron schedule)
**Steps:**
1. Navigate to Arbor login page
2. Fill email (from env: ARBOR_EMAIL)
3. Fill password (from env: ARBOR_PASSWORD)
4. Click login
5. Wait for dashboard
6. Navigate to messages page
7. Extract message list (Playwright)
8. For each message:
   - Check if `arbor_message_id` exists in Supabase
   - If NEW: Insert to messages table (source='arbor')
   - If EXISTS: Skip (already synced)
9. Log sync result to sync_log table

**File:** `workflows/arbor-scraper.json` (already exists, needs deployment)

**Error Handling:**
- Retry on timeout (3 attempts)
- Log errors to sync_log
- Alert user if sync fails 2x in a row

---

### Workflow 2: Gmail Scraper

**Trigger:** Every 15 minutes (cron schedule)
**Steps:**
1. Authenticate with Gmail (OAuth2)
2. Search Gmail: `from:(@archbishop-cranmer.co.uk OR @school.co.uk) is:unread`
3. For each email:
   - Extract subject, body, sender, date
   - Check Supabase: does Arbor message already exist?
     - If yes (same sender + subject + date ±5min): SKIP
     - If no: Continue to step 4
   - Download attachments (if any)
   - Upload to Supabase Storage
   - Insert message to messages table (source='gmail')
4. Mark email as read in Gmail (optional)
5. Log sync result to sync_log

**File:** `workflows/email-scraper.json` (to be created)

**Deduplication Logic (in n8n Code Node):**
```javascript
// Check if Arbor message already exists
const existingArborMessage = await supabase
  .from('messages')
  .select('id')
  .eq('source', 'arbor')
  .eq('sender_email', email.from)
  .eq('subject', email.subject)
  .gte('received_at', email.date - 5min)
  .lte('received_at', email.date + 5min)
  .single();

if (existingArborMessage) {
  // Skip this email (Arbor version already synced)
  return { skipped: true, reason: 'Arbor message exists' };
}

// Email is unique, proceed with insert
return { skipped: false };
```

**n8n Credentials Needed:**
- `gmail_oauth2` - Gmail API with `Gmail.readonly` + `Gmail.modify` scopes
- `supabase_api_key` - Supabase REST API key

---

## React Dashboard Architecture

### Component Structure

```
App
├── Layout
│   ├── Header
│   │   ├── Logo/Title
│   │   └── Unread Badge (🔔 3)
│   ├── Sidebar
│   │   ├── Filter: All | Unread | Categories
│   │   ├── Search Input
│   │   └── Stats (Total, Unread, By Category)
│   └── Main Content
│       ├── MessageList
│       │   └── MessageCard (repeated)
│       │       ├── Avatar
│       │       ├── Sender Name
│       │       ├── Subject
│       │       ├── Preview (first 100 chars)
│       │       ├── Timestamp
│       │       ├── Source Badge (Arbor | Gmail)
│       │       └── Category Tag
│       └── MessageDetail (when clicked)
│           ├── Full Content
│           ├── Attachments
│           ├── Mark as Read/Unread
│           └── Delete Button
└── NotificationContainer
    └── Toast Alerts (top-right)
```

### State Management

```javascript
// React Context (simple for single user)
const ChatContext = {
  messages: Message[],
  unreadCount: number,
  filter: 'all' | 'unread' | 'academic' | ...,
  selectedMessage: Message | null,
  isLoading: boolean,

  // Actions
  markAsRead(id: UUID),
  deleteMessage(id: UUID),
  setFilter(filter),
  setSelectedMessage(message),
}

// Local component state
function MessageList() {
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('received_at');
  // Filtering logic
}
```

### Realtime Subscription (useEffect Hook)

```typescript
useEffect(() => {
  // Subscribe to new messages
  const subscription = supabase
    .from('messages')
    .on('INSERT', (payload) => {
      setMessages([payload.new, ...messages]);
      setUnreadCount(unreadCount + 1);
      showToast(`New message from ${payload.new.sender_name}`);
    })
    .subscribe();

  return () => subscription.unsubscribe();
}, []);
```

### Key Components

| Component | Purpose | Features |
|-----------|---------|----------|
| **MessageList** | Display all messages | Filter, sort, search |
| **MessageCard** | Individual message preview | Click to expand, mark read |
| **MessageDetail** | Full message view | Full content, attachments, actions |
| **Filter Sidebar** | Category/status filtering | "All", "Unread", category tags |
| **Header** | Navigation & unread badge | Unread count, refresh button |
| **Toast** | In-app notifications | Auto-dismiss, different colors |

---

## Database Operations Flow

### On New Arbor Message

```
1. n8n inserts: messages(source='arbor', subject, content, sender, received_at)
   ↓
2. Database trigger fires (if configured)
   ↓
3. Supabase Realtime broadcasts INSERT event
   ↓
4. React subscriber receives event
   ↓
5. React updates state: prepend message to list
   ↓
6. Toast shows: "New message from [Sender]"
   ↓
7. Unread badge updates: +1
```

### On Duplicate Email (Arbor Already Has It)

```
1. n8n fetches email from Gmail
   ↓
2. Code node checks: does Arbor message exist?
   ↓
3. Query: SELECT * FROM messages
          WHERE source='arbor'
          AND sender_email=X
          AND subject=Y
          AND received_at ~= Z
   ↓
4. Match found → SKIP (don't insert)
   ↓
5. Log to sync_log: "1 email deduplicated"
```

---

## Error Handling & Resilience

### n8n Workflow Errors

| Error | Handling | Result |
|-------|----------|--------|
| Arbor login fails | Retry 3x, exponential backoff | Alert user if fails 2x+ |
| Gmail API 429 (rate limit) | Wait 60s, retry once | Log and skip, continue next run |
| Supabase connection error | Retry 5x with backoff | Alert user, try again in 15min |
| Parsing error (malformed HTML) | Log error, skip message | Log to sync_log for manual review |

### React/Dashboard Errors

| Error | Handling | Result |
|-------|----------|--------|
| Realtime disconnect | Auto-reconnect with backoff | Show "Connecting..." banner |
| Supabase query fails | Retry on next refresh | Show error toast |
| Attachment load fails | Show "Failed to load" | Allow user to try again |

### Monitoring

```sql
-- Query sync_log to check health
SELECT
  DATE(created_at) as day,
  COUNT(*) as sync_runs,
  SUM(CASE WHEN status='success' THEN 1 ELSE 0 END) as successes,
  SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) as failures,
  SUM(messages_new) as total_new_messages
FROM sync_log
GROUP BY day
ORDER BY day DESC;
```

---

## Implementation Phases

### Phase 1: MVP (Arbor + Gmail Dashboard)
- ✅ Deploy Supabase schema
- ✅ Set up n8n Arbor scraper
- ✅ Create n8n Gmail scraper
- ✅ Build React dashboard (realtime UI)
- ✅ Test end-to-end
- ⏳ Deploy to production

**Timeline:** 1-2 weeks
**Effort:** Medium

### Phase 2: Polish & Features
- [ ] Advanced filtering (by date range, category, sender)
- [ ] Message search functionality
- [ ] Attachment preview/download
- [ ] Archive/unarchive messages
- [ ] Email notifications for critical messages

**Timeline:** 1 week

### Phase 3: WhatsApp Integration
- [ ] Webhook setup for WhatsApp Business API
- [ ] n8n webhook receiver
- [ ] Similar deduplication logic
- [ ] Unified dashboard (3 sources)

**Timeline:** 1-2 weeks

---

## Security Considerations

### Credentials Management

```
Environment Variables (NEVER commit these):
- ARBOR_EMAIL → n8n secret
- ARBOR_PASSWORD → n8n secret
- GMAIL_OAUTH_REFRESH_TOKEN → n8n secret
- SUPABASE_SERVICE_ROLE_KEY → n8n secret

Store in:
- n8n Cloud: Credentials UI (encrypted)
- Self-hosted n8n: .env file (git-ignored)
```

### Database Security

```sql
-- RLS Policies (Row-Level Security)
-- Allow only authenticated users to read (no public access)
CREATE POLICY "Users can read messages"
  ON messages FOR SELECT
  USING (auth.role() = 'authenticated');

-- Service role (n8n) bypasses RLS, directly inserts
```

### Data Privacy

- Passwords encrypted in n8n
- Supabase uses SSL/TLS
- API keys never logged
- Email content stored encrypted in Supabase

---

## Success Criteria (MVP)

- ✅ Arbor messages sync to Supabase every 15 minutes
- ✅ Gmail emails sync to Supabase every 15 minutes
- ✅ Duplicates correctly deduplicated (trust Arbor)
- ✅ React dashboard displays all messages in real-time (<1s)
- ✅ Toast notification appears on new message
- ✅ Mark as read/unread functionality works
- ✅ Search & filter work correctly
- ✅ Dashboard responsive on mobile

---

## Next Steps

1. **Approval Checkpoint** - Does this design look good?
2. **Create implementation plan** - Step-by-step tasks
3. **Deploy database schema** - Run SQL in Supabase
4. **Configure n8n Arbor workflow** - Set credentials, test
5. **Create n8n Gmail workflow** - Build from scratch
6. **Build React components** - Start with MessageList
7. **Test end-to-end** - Verify entire flow
8. **Deploy** - Choose hosting (Vercel, Netlify, etc.)

---

## Appendix: Tools & Services

| Tool | Version | Purpose |
|------|---------|---------|
| n8n | Cloud/Self-hosted | Automation engine |
| Supabase | v4 | PostgreSQL + REST API + Realtime |
| React | 18+ | Frontend framework |
| Supabase JS Client | v2 | Realtime subscriptions |
| Tailwind CSS | v3 | Styling (optional) |

