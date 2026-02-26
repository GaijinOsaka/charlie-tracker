# Skyvern + n8n Integration — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Install Skyvern on the 4GB DO droplet alongside Docling, then build an n8n workflow that triggers Skyvern to scrape Arbor messages and store them in Supabase.

**Architecture:** n8n (1GB droplet) triggers Skyvern (4GB droplet) via HTTP API over DO private network. Skyvern navigates Arbor using AI vision, extracts unread messages as JSON, returns them to n8n. n8n deduplicates and inserts into Supabase.

**Tech Stack:** Skyvern (Docker), n8n (self-hosted DO), Supabase (PostgreSQL), Docker Compose

**Reference:** See [design doc](2026-02-26-skyvern-integration-design.md) for full architecture diagrams.

---

## Pre-requisites

- SSH access to both DO droplets
- Skyvern working locally on Docker Desktop (confirmed)
- n8n running on 1GB DO droplet (confirmed)
- Docling running as Docker container on 4GB DO droplet (confirmed)
- Your local Skyvern folder at `C:\Users\david\skyvern` with working config

---

## Task 1: Verify 4GB Droplet State

**Goal:** Confirm what's running, available resources, and Docker setup before installing anything.

**Step 1: SSH into the 4GB droplet and check Docker**

```bash
ssh root@<4GB-DROPLET-IP>
```

**Step 2: Check running containers and resources**

Run these commands and note the output:

```bash
docker ps
docker stats --no-stream
df -h
free -m
```

Expected:
- `bfc-docling-serve` container running
- At least 2GB RAM free
- At least 10GB disk free

**Step 3: Check Docker Compose is available**

```bash
docker compose version
```

Expected: `Docker Compose version v2.x.x`

If not installed:
```bash
apt-get update && apt-get install -y docker-compose-plugin
```

**Step 4: Check the droplet's private IP**

```bash
ip addr show eth1
```

Note the `10.x.x.x` address — this is the VPC private IP. If `eth1` doesn't exist, check:
```bash
ip addr show | grep "10\."
```

If no private IP exists, you'll need to enable VPC networking in the DO console (Task 3 covers this).

---

## Task 2: Prepare Skyvern Files on the Droplet

**Goal:** Copy the necessary Skyvern config files to the droplet and adapt them for server use.

**Step 1: Create the Skyvern directory on the droplet**

```bash
mkdir -p /opt/skyvern
cd /opt/skyvern
```

**Step 2: Create the Docker Compose file**

Create `/opt/skyvern/docker-compose.yml`:

```yaml
services:
  postgres:
    image: postgres:14-alpine
    restart: always
    volumes:
      - ./postgres-data:/var/lib/postgresql/data
    environment:
      - PGDATA=/var/lib/postgresql/data/pgdata
      - POSTGRES_USER=skyvern
      - POSTGRES_PASSWORD=${SKYVERN_DB_PASSWORD}
      - POSTGRES_DB=skyvern
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U skyvern"]
      interval: 5s
      timeout: 5s
      retries: 5

  skyvern:
    image: public.ecr.aws/skyvern/skyvern:latest
    restart: on-failure
    env_file:
      - .env
    ports:
      - "${SKYVERN_BIND_IP:-0.0.0.0}:8000:8000"
    volumes:
      - ./artifacts:/data/artifacts
      - ./videos:/data/videos
      - ./har:/data/har
      - ./log:/data/log
      - ./.streamlit:/app/.streamlit
    environment:
      - DATABASE_STRING=postgresql+psycopg://skyvern:${SKYVERN_DB_PASSWORD}@postgres:5432/skyvern
      - BROWSER_TYPE=chromium-headless
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "test", "-f", "/app/.streamlit/secrets.toml"]
      interval: 5s
      timeout: 5s
      retries: 5
```

Key differences from the local config:
- `BROWSER_TYPE=chromium-headless` (not `cdp-connect` — no external Chrome on server)
- No `skyvern-ui` service (not needed — n8n calls the API directly)
- Port binds to `SKYVERN_BIND_IP` (will be set to private IP later)
- DB password externalised to env var

**Step 3: Create the environment file**

Create `/opt/skyvern/.env` based on your working local config:

```bash
ENV=local

# LLM — copy from your working local .env
ENABLE_OPENAI=true
OPENAI_API_KEY=<your-openai-api-key>
LLM_KEY=OPENAI_GPT4O
SECONDARY_LLM_KEY=

# Browser
BROWSER_TYPE=chromium-headless
MAX_SCRAPING_RETRIES=0
VIDEO_PATH=./videos
BROWSER_ACTION_TIMEOUT_MS=5000

# Agent
MAX_STEPS_PER_RUN=50

# Database (overridden by docker-compose environment, but needed for reference)
DATABASE_STRING=postgresql+psycopg://skyvern:${SKYVERN_DB_PASSWORD}@postgres:5432/skyvern

# Server
PORT=8000
LOG_LEVEL=INFO

# Analytics
ANALYTICS_ID=anonymous

# Disable unused features
ENABLE_ANTHROPIC=false
ENABLE_AZURE=false
ENABLE_GEMINI=false
ENABLE_LOG_ARTIFACTS=false
```

**Step 4: Create the compose override for the DB password**

Create `/opt/skyvern/.env.compose`:

```bash
SKYVERN_DB_PASSWORD=<generate-a-strong-password>
SKYVERN_BIND_IP=0.0.0.0
```

We'll change `SKYVERN_BIND_IP` to the private IP in Task 3.

Note: Docker Compose reads `.env` by default for variable substitution in `docker-compose.yml`. Since the Skyvern container also uses `.env` via `env_file`, we need the compose-level variables (`SKYVERN_DB_PASSWORD`, `SKYVERN_BIND_IP`) in a separate file.

Update `docker-compose.yml` to read from both:

At the top of `docker-compose.yml`, before `services:`, there's no explicit `env_file` for compose-level substitution — Docker Compose always reads `.env` by default. So put the compose variables in `.env` as well:

Add these lines to the **top** of `/opt/skyvern/.env`:

```bash
# Compose-level variables (used in docker-compose.yml)
SKYVERN_DB_PASSWORD=<generate-a-strong-password>
SKYVERN_BIND_IP=0.0.0.0
```

**Step 5: Create required directories**

```bash
mkdir -p /opt/skyvern/{artifacts,videos,har,log,postgres-data,.streamlit}
```

---

## Task 3: Configure DO Private Networking

**Goal:** Ensure both droplets can communicate over DO's private VPC network.

**Step 1: Check VPC in DO Console**

1. Go to https://cloud.digitalocean.com/networking/vpc
2. Check if both droplets are in the same VPC (LON1)
3. If not, you'll need to add them to the same VPC

Both droplets must be in the **same region (LON1)** and the **same VPC**.

**Step 2: Find private IPs**

On the **4GB droplet** (Skyvern/Docling):
```bash
ip addr show eth1 | grep "inet " | awk '{print $2}' | cut -d/ -f1
```

On the **1GB droplet** (n8n):
```bash
ip addr show eth1 | grep "inet " | awk '{print $2}' | cut -d/ -f1
```

Note both IPs. Example: `10.114.0.2` (4GB) and `10.114.0.3` (1GB).

If `eth1` doesn't exist on either droplet, the VPC private network interface hasn't been attached. You may need to:
1. Power off the droplet in DO console
2. Go to Networking > VPC > assign droplet
3. Power it back on

**Step 3: Test connectivity**

From the **n8n droplet**, ping the 4GB droplet's private IP:

```bash
ping -c 3 10.114.x.x
```

Expected: replies with low latency (<1ms).

**Step 4: Update Skyvern to bind to private IP only**

On the 4GB droplet, edit `/opt/skyvern/.env`:

```bash
SKYVERN_BIND_IP=10.114.x.x
```

(Replace with the actual private IP of the 4GB droplet.)

This ensures Skyvern's API is only accessible from the private network, not the public internet.

---

## Task 4: Start Skyvern and Verify

**Goal:** Launch Skyvern containers and confirm the API is responding.

**Step 1: Pull the images**

```bash
cd /opt/skyvern
docker compose pull
```

**Step 2: Start the services**

```bash
docker compose up -d
```

**Step 3: Check containers are running**

```bash
docker compose ps
```

Expected: `postgres` (healthy) and `skyvern` (healthy) both running.

**Step 4: Check logs for errors**

```bash
docker compose logs skyvern --tail 50
```

Look for:
- `Application startup complete` or similar success message
- No `ERROR` lines related to database connection or LLM keys

**Step 5: Test the API locally on the droplet**

```bash
curl -s http://localhost:8000/api/v1/health || curl -s http://localhost:8000/
```

If that doesn't work (bound to private IP only), use:

```bash
curl -s http://10.114.x.x:8000/api/v1/health || curl -s http://10.114.x.x:8000/
```

Expected: a JSON response (not connection refused).

**Step 6: Verify the API key**

Skyvern generates an API key on first start. Find it:

```bash
docker compose logs skyvern | grep -i "api.key\|api_key\|token"
```

Or check the `.streamlit/secrets.toml` file:

```bash
cat /opt/skyvern/.streamlit/secrets.toml
```

Note the API key — you'll need it for n8n.

**Step 7: Check resource usage**

```bash
docker stats --no-stream
```

Verify total memory usage is reasonable (~500-800MB idle, leaving room for Docling).

---

## Task 5: Test Skyvern from n8n Droplet

**Goal:** Confirm n8n's droplet can reach Skyvern's API over the private network.

**Step 1: SSH into the n8n droplet (1GB)**

```bash
ssh root@<1GB-DROPLET-IP>
```

**Step 2: Test connectivity to Skyvern API**

```bash
curl -s -H "x-api-key: <SKYVERN_API_KEY>" http://10.114.x.x:8000/api/v1/health
```

Expected: JSON response confirming API is reachable.

**Step 3: Run a test task**

Send a simple test task (not Arbor — just a public website):

```bash
curl -X POST http://10.114.x.x:8000/api/v1/run/tasks \
  -H "Content-Type: application/json" \
  -H "x-api-key: <SKYVERN_API_KEY>" \
  -d '{
    "prompt": "Go to https://example.com and extract the page title and first paragraph as JSON",
    "url": "https://example.com",
    "engine": "skyvern_v2",
    "max_steps": 5
  }'
```

Expected response includes:
```json
{
  "run_id": "tsk_v2_xxxxx",
  "status": "created",
  ...
}
```

**Step 4: Poll for completion**

```bash
curl -s -H "x-api-key: <SKYVERN_API_KEY>" \
  http://10.114.x.x:8000/api/v1/runs/<run_id>
```

Repeat until `status` is `completed` or `failed`.

Expected: `status: "completed"` with `output` containing extracted data.

**Step 5: Test with Arbor**

```bash
curl -X POST http://10.114.x.x:8000/api/v1/run/tasks \
  -H "Content-Type: application/json" \
  -H "x-api-key: <SKYVERN_API_KEY>" \
  -d '{
    "prompt": "Navigate to https://archbishop-cranmer-church-of-england-academy.uk.arbor.sc/?/home-ui/index. Log in with email: <ARBOR_EMAIL> and password: <ARBOR_PASSWORD>. After logging in, locate and click on the Unread Messages section. Read the latest message. Extract the message content (subject, sender, date, body) and format as JSON.",
    "url": "https://archbishop-cranmer-church-of-england-academy.uk.arbor.sc/?/home-ui/index",
    "engine": "skyvern_v2",
    "proxy_location": "RESIDENTIAL_GB",
    "max_steps": 25
  }'
```

Poll for completion. Expected: `status: "completed"` with `output` containing the Arbor message data as JSON.

Note: Use `RESIDENTIAL_GB` proxy since Arbor is a UK school system.

---

## Task 6: Set Up DO Cloud Firewall

**Goal:** Restrict Skyvern API access to only the n8n droplet.

**Step 1: Create firewall in DO Console**

1. Go to https://cloud.digitalocean.com/networking/firewalls
2. Click "Create Firewall"
3. Name: `skyvern-firewall`

**Step 2: Configure inbound rules**

| Type | Protocol | Port Range | Sources |
|------|----------|------------|---------|
| SSH | TCP | 22 | Your home IP |
| Custom | TCP | 8000 | n8n droplet private IP (10.114.x.x) |

**Step 3: Configure outbound rules**

Leave default (all outbound traffic allowed — Skyvern needs to reach Arbor and OpenAI).

**Step 4: Apply to 4GB droplet**

Select the 4GB droplet (Docling/Skyvern) and apply.

**Step 5: Verify**

From n8n droplet:
```bash
curl -s -H "x-api-key: <SKYVERN_API_KEY>" http://10.114.x.x:8000/api/v1/runs/test_nonexistent
```

Expected: a 404 response (API reachable).

From your local machine:
```bash
curl -s http://<4GB-PUBLIC-IP>:8000/
```

Expected: connection timeout or refused (blocked by firewall).

---

## Task 7: Configure n8n Environment Variables

**Goal:** Add Skyvern and Arbor credentials to n8n so workflows can reference them.

**Step 1: Access n8n Settings**

Go to your n8n instance UI → Settings → Variables (or Environment Variables depending on your n8n version).

**Step 2: Add the following variables**

| Variable | Value | Notes |
|----------|-------|-------|
| `SKYVERN_HOST` | `http://10.114.x.x:8000` | 4GB droplet private IP |
| `SKYVERN_API_KEY` | `<key from Task 4 Step 6>` | Skyvern API key |
| `ARBOR_EMAIL` | `<your-arbor-email>` | Arbor login email |
| `ARBOR_PASSWORD` | `<your-new-arbor-password>` | After you rotate the old one |
| `SUPABASE_URL` | `https://knqhcipfgypzfszrwrsu.supabase.co` | From existing config |
| `SUPABASE_SERVICE_KEY` | `<your-service-role-key>` | From existing config |

If n8n uses `.env` file instead of UI settings, SSH into the n8n droplet and add these to n8n's environment file, then restart n8n.

**Step 3: Verify variables are accessible**

In n8n, create a temporary workflow with a Code node:

```javascript
return [{ json: {
  host: $env.SKYVERN_HOST,
  hasKey: !!$env.SKYVERN_API_KEY,
  hasArbor: !!$env.ARBOR_EMAIL
}}];
```

Execute — verify all values are present (don't log the actual secrets).

---

## Task 8: Build the n8n Workflow

**Goal:** Create the Skyvern-based Arbor scraper workflow in n8n.

This replaces the old Playwright-based `arbor-scraper.json` with a simpler HTTP-based workflow.

### Workflow Overview

```
Schedule Trigger (15 min)
  → HTTP Request: Create Skyvern Task
  → Wait (10s)
  → HTTP Request: Poll Skyvern (loop until done)
  → IF: Task Completed?
    → YES: Code Node — Parse extracted messages
      → Code Node — Deduplicate against Supabase
      → Loop: Insert new messages into Supabase
      → HTTP Request: Log to sync_log
    → NO: HTTP Request — Log failure to sync_log
```

### Node-by-Node Setup

**Node 1: Schedule Trigger**
- Type: Schedule Trigger
- Rule: Every 15 minutes
- Cron: `*/15 * * * *`

**Node 2: Create Skyvern Task (HTTP Request)**
- Method: `POST`
- URL: `{{ $env.SKYVERN_HOST }}/api/v1/run/tasks`
- Authentication: None (we use header)
- Headers:
  - `x-api-key`: `{{ $env.SKYVERN_API_KEY }}`
  - `Content-Type`: `application/json`
- Body (JSON):

```json
{
  "prompt": "Navigate to https://archbishop-cranmer-church-of-england-academy.uk.arbor.sc/?/home-ui/index. Log in using email: {{ $env.ARBOR_EMAIL }} and password: {{ $env.ARBOR_PASSWORD }}. After logging in, locate and click on the 'Unread Messages' section. Read ALL unread messages. For each message, extract: subject, sender name, sender email (if visible), date received, and the full message body. Return all messages as a JSON array.",
  "url": "https://archbishop-cranmer-church-of-england-academy.uk.arbor.sc/?/home-ui/index",
  "engine": "skyvern_v2",
  "proxy_location": "RESIDENTIAL_GB",
  "max_steps": 25,
  "data_extraction_schema": {
    "type": "array",
    "items": {
      "type": "object",
      "properties": {
        "subject": { "type": "string" },
        "sender_name": { "type": "string" },
        "sender_email": { "type": "string" },
        "received_at": { "type": "string" },
        "body": { "type": "string" }
      }
    }
  }
}
```

**Node 3: Wait**
- Type: Wait
- Duration: 15 seconds (give Skyvern time to start)

**Node 4: Poll Skyvern Status (HTTP Request in Loop)**
- Method: `GET`
- URL: `{{ $env.SKYVERN_HOST }}/api/v1/runs/{{ $node["Create Skyvern Task"].json.run_id }}`
- Headers:
  - `x-api-key`: `{{ $env.SKYVERN_API_KEY }}`

Connect to a **Loop/Retry** pattern:

**Node 5: Check Status (IF)**
- Condition: `{{ $json.status }}` equals `completed` OR `{{ $json.status }}` equals `failed`
- TRUE → continue to processing
- FALSE → Wait 10 seconds → loop back to Node 4
- Max iterations: 30 (5 minutes total timeout)

**Node 6: Check Success (IF)**
- Condition: `{{ $json.status }}` equals `completed`
- TRUE → parse messages
- FALSE → log failure

**Node 7: Parse Messages (Code Node)**

```javascript
// Extract messages from Skyvern's output
const skyvernOutput = $input.first().json.output;

// Handle various output formats Skyvern might return
let messages = [];
if (Array.isArray(skyvernOutput)) {
  messages = skyvernOutput;
} else if (skyvernOutput && typeof skyvernOutput === 'object') {
  // Might be wrapped in a key like "messages" or "data"
  messages = skyvernOutput.messages || skyvernOutput.data || [skyvernOutput];
} else if (typeof skyvernOutput === 'string') {
  try {
    const parsed = JSON.parse(skyvernOutput);
    messages = Array.isArray(parsed) ? parsed : [parsed];
  } catch (e) {
    messages = [];
  }
}

return messages.map(msg => ({
  json: {
    subject: msg.subject || '',
    sender_name: msg.sender_name || msg.sender || '',
    sender_email: msg.sender_email || '',
    received_at: msg.received_at || msg.date || new Date().toISOString(),
    content: msg.body || msg.content || msg.message || '',
    source: 'arbor',
    source_id: `arbor_${Buffer.from((msg.subject || '') + (msg.received_at || msg.date || '')).toString('base64').substring(0, 32)}`
  }
}));
```

**Node 8: Check Existing in Supabase (HTTP Request)**
- Method: `GET`
- URL: `{{ $env.SUPABASE_URL }}/rest/v1/messages?source=eq.arbor&select=source_id`
- Headers:
  - `Authorization`: `Bearer {{ $env.SUPABASE_SERVICE_KEY }}`
  - `apikey`: `{{ $env.SUPABASE_SERVICE_KEY }}`

**Node 9: Filter Duplicates (Code Node)**

```javascript
const existingIds = $node["Check Existing in Supabase"].json.map
  ? $node["Check Existing in Supabase"].json.map(m => m.source_id)
  : [];

const allMessages = $node["Parse Messages"].json
  ? [$node["Parse Messages"].json]
  : $items("Parse Messages").map(item => item.json);

const newMessages = allMessages.filter(
  msg => !existingIds.includes(msg.source_id)
);

if (newMessages.length === 0) {
  return [{ json: { newMessages: [], count: 0 } }];
}

return newMessages.map(msg => ({ json: msg }));
```

**Node 10: Insert Message (HTTP Request — in loop)**
- Method: `POST`
- URL: `{{ $env.SUPABASE_URL }}/rest/v1/messages`
- Headers:
  - `Authorization`: `Bearer {{ $env.SUPABASE_SERVICE_KEY }}`
  - `apikey`: `{{ $env.SUPABASE_SERVICE_KEY }}`
  - `Content-Type`: `application/json`
  - `Prefer`: `return=representation`
- Body:

```json
{
  "source": "{{ $json.source }}",
  "source_id": "{{ $json.source_id }}",
  "subject": "{{ $json.subject }}",
  "content": "{{ $json.content }}",
  "sender_name": "{{ $json.sender_name }}",
  "sender_email": "{{ $json.sender_email }}",
  "received_at": "{{ $json.received_at }}",
  "is_read": false
}
```

**Node 11: Log Sync Success (HTTP Request)**
- Method: `POST`
- URL: `{{ $env.SUPABASE_URL }}/rest/v1/sync_log`
- Headers:
  - `Authorization`: `Bearer {{ $env.SUPABASE_SERVICE_KEY }}`
  - `apikey`: `{{ $env.SUPABASE_SERVICE_KEY }}`
  - `Content-Type`: `application/json`
- Body:

```json
{
  "sync_started_at": "{{ $now.minus(15, 'minutes').toISO() }}",
  "sync_completed_at": "{{ $now.toISO() }}",
  "messages_found": {{ $node["Parse Messages"].json.length || 0 }},
  "messages_new": {{ $node["Filter Duplicates"].json.length || 0 }},
  "status": "success"
}
```

**Node 12: Log Sync Failure (HTTP Request)** — connected from Node 6 FALSE branch
- Same as Node 11 but with:

```json
{
  "sync_started_at": "{{ $now.minus(15, 'minutes').toISO() }}",
  "sync_completed_at": "{{ $now.toISO() }}",
  "messages_found": 0,
  "messages_new": 0,
  "status": "failed",
  "error_message": "{{ $node['Poll Skyvern Status'].json.failure_reason || 'Skyvern task failed' }}"
}
```

---

## Task 9: Save the Workflow JSON

**Goal:** Export the n8n workflow and save it to the project repo, replacing the old Playwright version.

**Step 1: Export from n8n**

In n8n: Workflow menu → Download as file → save as `arbor-skyvern-scraper.json`

**Step 2: Save to project**

Copy the exported JSON to:
```
charlie-tracker/workflows/arbor-skyvern-scraper.json
```

**Step 3: Update README to reference new workflow**

In `README.md`, update the workflow reference from `arbor-scraper.json` to `arbor-skyvern-scraper.json`.

**Step 4: Commit**

```bash
git add workflows/arbor-skyvern-scraper.json docs/plans/2026-02-26-skyvern-integration-design.md docs/plans/2026-02-26-skyvern-n8n-implementation.md
git commit -m "feat: add Skyvern-based Arbor scraper workflow replacing Playwright"
```

---

## Task 10: End-to-End Test

**Goal:** Verify the complete pipeline: n8n → Skyvern → Arbor → Supabase.

**Step 1: Manual trigger**

In n8n, click "Test Workflow" on the Arbor Skyvern scraper.

**Step 2: Monitor Skyvern**

On the 4GB droplet, watch logs:
```bash
cd /opt/skyvern && docker compose logs -f skyvern
```

Expected: see Skyvern receive the task, launch browser, navigate Arbor, extract data.

**Step 3: Verify n8n receives data**

In n8n execution view, check:
- "Create Skyvern Task" node: returns `run_id` and `status: "created"`
- "Poll Skyvern Status" node: eventually returns `status: "completed"` with `output`
- "Parse Messages" node: outputs structured message array
- "Insert Message" nodes: return 201 from Supabase

**Step 4: Verify Supabase**

Check the Supabase dashboard or run:
```bash
curl -s -H "Authorization: Bearer <SERVICE_KEY>" \
  -H "apikey: <SERVICE_KEY>" \
  "https://knqhcipfgypzfszrwrsu.supabase.co/rest/v1/messages?source=eq.arbor&order=created_at.desc&limit=5"
```

Expected: the messages Skyvern extracted are in the table.

**Step 5: Verify sync_log**

```bash
curl -s -H "Authorization: Bearer <SERVICE_KEY>" \
  -H "apikey: <SERVICE_KEY>" \
  "https://knqhcipfgypzfszrwrsu.supabase.co/rest/v1/sync_log?order=sync_completed_at.desc&limit=1"
```

Expected: `status: "success"` with correct message counts.

**Step 6: Run a second time to test deduplication**

Trigger the workflow again. Expected:
- Skyvern extracts the same messages
- "Filter Duplicates" node filters them all out
- No new inserts to Supabase
- sync_log shows `messages_found > 0, messages_new = 0`

---

## Task 11: Activate and Monitor

**Goal:** Enable the schedule and monitor for 24 hours.

**Step 1: Activate the workflow**

In n8n, toggle the workflow to "Active". It will now run every 15 minutes.

**Step 2: Monitor first few runs**

Check n8n execution history after 30-60 minutes. Verify at least 2-3 successful runs.

**Step 3: Check resource usage on 4GB droplet**

```bash
docker stats --no-stream
```

Verify memory stays under 3GB during Skyvern scraping. Verify Docling container is unaffected.

**Step 4: Set up basic alerting (optional)**

If a sync fails 3 times in a row, you'll see it in sync_log. For now, check manually. Future enhancement: add an n8n error workflow that sends a notification.

---

## Summary of Endpoints

| What | Method | URL |
|------|--------|-----|
| Create task | POST | `{SKYVERN_HOST}/api/v1/run/tasks` |
| Check status | GET | `{SKYVERN_HOST}/api/v1/runs/{run_id}` |
| Cancel task | POST | `{SKYVERN_HOST}/api/v1/runs/{run_id}/cancel` |
| Auth header | — | `x-api-key: {SKYVERN_API_KEY}` |
| API port | — | `8000` (not 8080) |

## Key Response Fields

```json
{
  "run_id": "tsk_v2_xxxxx",
  "status": "created | queued | running | completed | failed | terminated | canceled",
  "output": { ... },
  "failure_reason": "string or null",
  "created_at": "2026-02-26T10:00:00Z",
  "modified_at": "2026-02-26T10:05:00Z"
}
```
