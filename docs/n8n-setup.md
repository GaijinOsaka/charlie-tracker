# n8n Setup & Configuration

**Status:** Reference for implementation phase
**Purpose:** Step-by-step guide for setting up n8n workflows

---

## n8n Instance Options

### Option A: n8n Cloud (Recommended for MVP)
- **Pros:** No setup needed, auto-scaling, Supabase integration built-in
- **Cons:** Costs ~$25/month Pro plan
- **Best for:** Quick start, no DevOps knowledge needed

**Setup:**
1. Go to [n8n.cloud](https://n8n.cloud)
2. Sign up with email
3. Create workspace
4. Start building workflows

### Option B: Self-Hosted (Free but requires DevOps)
- **Pros:** Free, full control, can run on own server
- **Cons:** Requires Docker, maintenance, uptime responsibility
- **Best for:** Cost-conscious, DevOps experienced

**Quick start:**
```bash
docker run -d -p 5678:5678 n8nio/n8n
# Access at http://localhost:5678
```

---

## Common Credentials Needed

### 1. Supabase API Key

```
Where to get:
1. Go to Supabase dashboard
2. Project → Settings → API Keys
3. Copy "service_role" key (has write access)

In n8n:
1. Credentials → New Credential
2. Type: HTTP Header Auth
3. Name: supabaseHeaderAuth
4. Header Name: Authorization
5. Header Value: Bearer YOUR_SERVICE_ROLE_KEY
```

### 2. Arbor Credentials

```
Store in n8n as environment variables:
- ARBOR_EMAIL: your@email.com
- ARBOR_PASSWORD: your_password

In n8n expressions:
- {{ $env.ARBOR_EMAIL }}
- {{ $env.ARBOR_PASSWORD }}
```

### 3. Gmail OAuth2

See `gmail-setup.md` for detailed instructions.

---

## Workflow 1: Arbor Scraper Setup

**File to import:** `workflows/arbor-scraper.json`

**Steps:**

1. **Import Workflow**
   - Click "Import" in n8n
   - Upload `arbor-scraper.json`
   - Review imported workflow

2. **Set Environment Variables**
   - Settings → Variables
   - Add: `ARBOR_EMAIL` = your school email
   - Add: `ARBOR_PASSWORD` = your password

3. **Configure Supabase Credential**
   - Find "Check Supabase" node
   - Update HTTP Header Auth credential
   - Paste service_role key

4. **Test Individual Nodes**
   - Click "Execute Node" on Schedule trigger
   - Verify "Check Supabase" returns categories
   - Verify "Open Browser" opens Chrome
   - Verify Arbor login succeeds

5. **Activate Workflow**
   - Click "Activate" button
   - Workflow will now run every 15 minutes

---

## Workflow 2: Gmail Scraper Creation

**Create from scratch in n8n:**

1. **Create New Workflow**
   - Click "New" → Workflow
   - Name: `gmail-scraper`

2. **Add Trigger Node**
   - Node type: Cron
   - Expression: `*/15 * * * *` (every 15 minutes)

3. **Add Gmail Node**
   - Node type: Gmail
   - Operation: Get Messages
   - Configure credential (see gmail-setup.md)
   - Filters:
     ```
     From: contains @archbishop-cranmer.co.uk
     Has attachments: (optional)
     ```

4. **Add Loop (For Each Email)**
   - Node type: Loop
   - Items: Gmail messages array

5. **Add Deduplication Code Node**
   - See code examples in `gmail-setup.md`
   - Check if Arbor message exists

6. **Add Conditional (If NOT Deduplicated)**
   - Node type: IF
   - Condition: skip == false

7. **Add Supabase Insert Node**
   - Table: messages
   - Data: email details
   - (See design.md for full schema)

8. **Add Log to Sync Table**
   - Insert to sync_log table
   - Record: emails_processed, new_emails, status

9. **Test & Activate**
   - Click "Test Workflow"
   - Verify emails are inserted to Supabase
   - Click "Activate"

---

## Monitoring & Debugging

### View Execution History
```
Workflow → Executions → View all
- See success/failure status
- Check timestamps
- View input/output of each node
```

### Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| "Credential missing" | Workflow can't find auth | Check credential selector on node |
| "Timeout" | Arbor/Gmail taking >30s | Increase timeout in node settings |
| "No data returned" | Gmail filter too strict | Loosen filter, test with `*` |
| "Duplicates inserting" | Code node logic broken | Check deduplication logic in code node |

### Debug Mode
- Right-click node → "Debug this node"
- View input/output data
- Test expressions with actual data

---

## Workflow Specifications (Reference)

### Arbor Scraper Nodes

| # | Name | Type | Key Setting |
|---|------|------|-------------|
| 1 | Schedule | Cron Trigger | `*/15 * * * *` |
| 2 | Check Supabase | HTTP Request | GET /rest/v1/categories |
| 3 | Open Browser | Playwright | Chrome, headless |
| 4 | Navigate to Arbor | Playwright | goto(URL) |
| 5 | Fill Email | Playwright | fill(selector, env var) |
| 6 | Fill Password | Playwright | fill(selector, env var) |
| 7 | Click Login | Playwright | click(button) |
| 8 | Wait Dashboard | Playwright | wait(5000ms) |
| 9 | Navigate to Messages | Playwright | goto(messages URL) |
| 10 | Extract Messages | Playwright | evaluate(JS scraper) |
| 11 | Loop Messages | Loop | For each message |
| 12 | Check Exists | Supabase | Query messages table |
| 13 | If New | Conditional | If not exists |
| 14 | Insert Message | Supabase | Insert to messages |
| 15 | Log Sync | Supabase | Insert to sync_log |

### Gmail Scraper Nodes

| # | Name | Type | Key Setting |
|---|------|------|-------------|
| 1 | Schedule | Cron Trigger | `*/15 * * * *` |
| 2 | Get Emails | Gmail | Filter: @school domain |
| 3 | Loop Emails | Loop | For each email |
| 4 | Extract Data | Code | Parse email metadata |
| 5 | Check Deduplicate | Supabase | Query Arbor messages |
| 6 | If Not Dupe | Conditional | If skip == false |
| 7 | Insert Email | Supabase | Insert to messages |
| 8 | Update Sync Log | Supabase | Insert to sync_log |

---

## Next Steps

1. Choose n8n option (Cloud recommended for MVP)
2. Sign up / set up n8n instance
3. Follow Arbor Scraper setup
4. Follow Gmail Scraper creation
5. Test both workflows independently
6. Verify messages sync to Supabase
7. Activate both workflows
8. Monitor sync_log for errors

