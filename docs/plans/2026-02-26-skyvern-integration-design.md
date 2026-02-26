# Skyvern + n8n Integration Design

**Date:** 2026-02-26
**Status:** Validated
**Replaces:** Playwright-based Arbor scraping from original MVP plan

---

## Overview

Replace the planned Playwright browser automation in n8n with Skyvern, an AI-powered browser automation tool. Skyvern uses AI vision to navigate websites, making it resilient to UI changes — and it's already proven against Arbor locally.

## Current State

- **n8n**: Self-hosted on DO droplet (1GB RAM, LON1)
- **Docling**: Running as Docker container (`bfc-docling-serve`) on DO droplet (4GB RAM, 80GB disk, LON1, Docker on Ubuntu 22.04)
- **Skyvern**: Running locally on Docker Desktop, tested against Arbor successfully
- **Supabase**: Database ready (schema designed)

## Target State

- **Skyvern** installed as Docker containers on the 4GB droplet alongside Docling
- **n8n** triggers Skyvern via HTTP API over DO private network
- **Skyvern** scrapes Arbor, returns message JSON
- **n8n** deduplicates and inserts into Supabase

---

## Architecture

```
n8n (1GB droplet)                    4GB droplet (Docker)
┌──────────────┐                    ┌─────────────────────┐
│  Schedule     │                   │  bfc-docling-serve   │
│  Trigger      │                   │  (existing)          │
│  (every 15m)  │                   │                      │
│       │       │    HTTP API       │  skyvern             │
│  HTTP Request ├──────────────────►│  (new container)     │
│  Node         │                   │    ├─ Skyvern API    │
│       │       │◄──────────────────┤    ├─ Browser        │
│  Process      │   JSON response   │    └─ Arbor scraping │
│  Results      │                   └─────────────────────┘
│       │       │
│  Supabase     │
│  Insert       │
└──────────────┘
```

**Networking:** Both droplets communicate over DO VPC private network (free, no public exposure).

---

## Resource Allocation (4GB Droplet)

| Container | Idle RAM | Active RAM | Notes |
|-----------|----------|------------|-------|
| Docling | ~300MB | ~1GB | Only when processing |
| Skyvern API | ~200MB | ~500MB | Task engine |
| Skyvern Postgres | ~100MB | ~150MB | Task state/history |
| Skyvern Browser | ~0MB | ~800MB | Only during scrape |
| **Total peak** | | **~2.5GB** | Leaves ~1.5GB headroom |

Skyvern's browser only runs during a scrape (a few minutes every 15). Docling is on-demand. They rarely overlap.

---

## Skyvern Docker Setup

Install Skyvern on the 4GB droplet using Docker Compose. The existing Docling container continues running independently.

### Docker Compose (`docker-compose.yml`)

Based on the proven local Skyvern config, adapted for server deployment:

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

Key differences from local config:
- `BROWSER_TYPE=chromium-headless` (not `cdp-connect` — no external Chrome on server)
- No `skyvern-ui` service (n8n calls the API directly)
- Port binds to private IP via `SKYVERN_BIND_IP`
- Image: `public.ecr.aws/skyvern/skyvern:latest` (official ECR image)
- API runs on port **8000** (not 8080)

### Environment File (`.env`)

```bash
# Compose-level variables
SKYVERN_DB_PASSWORD=<generate-strong-password>
SKYVERN_BIND_IP=10.114.x.x  # DO private IP of this droplet

# LLM
ENABLE_OPENAI=true
OPENAI_API_KEY=<your-openai-api-key>
LLM_KEY=OPENAI_GPT4O

# Browser
BROWSER_TYPE=chromium-headless
MAX_STEPS_PER_RUN=50
PORT=8000
LOG_LEVEL=INFO
```

---

## Proven Skyvern Task Config

Based on working local config, with credentials externalised:

```json
{
  "title": "Access and Extract Unread Message",
  "proxy_location": "RESIDENTIAL",
  "persist_browser_session": false,
  "workflow_definition": {
    "version": 2,
    "parameters": [],
    "blocks": [
      {
        "label": "Message",
        "continue_on_failure": false,
        "block_type": "task_v2",
        "prompt": "Your first goal is to navigate to the following URL: https://archbishop-cranmer-church-of-england-academy.uk.arbor.sc/?/home-ui/index.\n\nOnce there, your goal is to log in to the account using the provided credentials:\n\nEmail: {{arbor_email}}\nPassword: {{arbor_password}}\n\nAfter successfully logging in, your next goal is to locate and click on the 'Unread Messages' section.\n\nOnce you have accessed the unread messages, your goal is to read the latest message.\n\nFinally, extract the content of the latest message and format it as JSON. Provide this JSON output so it can be stored in a database.\n\nYou will know your task is complete when you have successfully logged in, accessed the unread messages, read the latest message, and provided the message content in JSON format.",
        "url": "",
        "max_steps": 25,
        "disable_cache": false
      }
    ]
  },
  "run_with": "code",
  "ai_fallback": true
}
```

**Note:** `{{arbor_email}}` and `{{arbor_password}}` are injected by n8n at runtime from environment variables. Never hardcoded.

---

## n8n Workflow Design

### Trigger
Schedule trigger: `*/15 * * * *` (every 15 minutes)

### Step 1: Create Skyvern Task (HTTP Request)

```
POST http://{{$env.SKYVERN_HOST}}:8000/api/v1/run/tasks
Headers:
  x-api-key: {{$env.SKYVERN_API_KEY}}
  Content-Type: application/json
Body:
  {
    "prompt": "Navigate to Arbor, log in with email {{$env.ARBOR_EMAIL}} and password {{$env.ARBOR_PASSWORD}}, click Unread Messages, read all messages, extract as JSON",
    "url": "https://archbishop-cranmer-church-of-england-academy.uk.arbor.sc/?/home-ui/index",
    "engine": "skyvern_v2",
    "proxy_location": "RESIDENTIAL_GB",
    "max_steps": 25
  }
```

### Step 2: Poll for Completion (HTTP Request + Loop)

```
GET http://{{$env.SKYVERN_HOST}}:8000/api/v1/runs/{{run_id}}
Headers:
  x-api-key: {{$env.SKYVERN_API_KEY}}

Loop: Wait 10s, retry until status = "completed" or "failed"
Max attempts: 30 (5 minutes timeout)

Response includes:
  - run_id: "tsk_v2_xxxxx"
  - status: "created | queued | running | completed | failed"
  - output: { extracted message data as JSON }
  - failure_reason: "string or null"
```

### Step 3: Process Results

- Parse extracted message JSON from Skyvern response
- For each message: check Supabase for existing `source_id`
- Insert new messages with `source = 'arbor'`
- Log to `sync_log` table

### Step 4: Error Handling

- If Skyvern task fails: log to `sync_log` with `status = 'failed'`
- Retry on next 15-minute interval
- No manual intervention needed for transient failures

---

## Security

### Private Networking

- Both droplets on same DO account in LON1
- Enable DO VPC — each droplet gets a private IP (`10.114.x.x`)
- Skyvern API binds **only to private IP**, not `0.0.0.0`
- n8n calls `http://10.114.x.x:8000` — traffic never leaves DO network

### DO Cloud Firewall

| Rule | Port | Source | Purpose |
|------|------|--------|---------|
| Allow | 8000 | n8n droplet private IP only | Skyvern API |
| Allow | 22 | Your home IP | SSH access |
| Deny | All | Everything else | Default deny |

### Credentials

| Credential | Stored In | Access |
|------------|-----------|--------|
| Arbor email/password | n8n environment variables | Passed to Skyvern per-task |
| Skyvern API key | n8n credentials + `.env.skyvern` | Auth between n8n and Skyvern |
| Skyvern DB password | `.env.skyvern` on 4GB droplet | Internal only |

---

## Implementation Steps

1. **SSH into 4GB droplet** — verify Docker setup, check Docling is healthy
2. **Create docker-compose file** — add Skyvern containers alongside Docling
3. **Configure networking** — find/enable DO private IPs on both droplets
4. **Start Skyvern** — `docker compose up -d`, verify API responds
5. **Test Skyvern** — run the Arbor task via curl from the n8n droplet
6. **Build n8n workflow** — Schedule → HTTP Request → Poll → Process → Supabase
7. **Configure n8n env vars** — ARBOR_USERNAME, ARBOR_PASSWORD, SKYVERN_HOST, SKYVERN_API_KEY
8. **Set up DO firewall** — restrict Skyvern API to n8n's private IP
9. **End-to-end test** — trigger workflow, verify messages land in Supabase
10. **Activate schedule** — enable 15-minute cron

---

## Changes to Original MVP Plan

| Component | Original Plan | New Plan |
|-----------|--------------|----------|
| Arbor scraping | Playwright in n8n | Skyvern on separate container |
| Browser automation | CSS selectors (brittle) | AI vision (resilient) |
| n8n workflow | Complex Playwright nodes | Simple HTTP Request nodes |
| Infrastructure | n8n droplet only | n8n droplet + 4GB droplet |
| Resilience | Breaks on UI changes | Adapts to UI changes |

Everything else (Supabase schema, React dashboard, Gmail integration, deduplication) remains unchanged.
