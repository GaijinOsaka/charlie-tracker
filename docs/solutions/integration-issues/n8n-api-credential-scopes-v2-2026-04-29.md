---
title: n8n v2.17+ API key requires explicit credential scopes
date: 2026-04-29
category: integration-issues
module: n8n
problem_type: api_breaking_change
component: infrastructure
severity: medium
applies_when:
  - Upgrading n8n from v2.1.x to v2.17+
  - n8n MCP tools return 403 Forbidden on credential operations
  - API key works for workflows but not credentials
tags: [n8n, api, credentials, upgrade, breaking-change]
---

# n8n v2.17+ API key requires explicit credential scopes

## Context

After upgrading n8n from v2.1.5 to v2.17.18, the existing API key continued to work for workflow operations (`/api/v1/workflows`) but returned 403 Forbidden for credential operations (`/api/v1/credentials`).

## Problem

n8n v2.17+ introduced granular API key scopes. Existing API keys created before the upgrade lack the credential management scope by default. This manifests as:

- `n8n_manage_credentials` MCP tool returns `{ "success": false, "error": "Forbidden" }`
- Direct curl to `/api/v1/credentials` returns HTTP 403
- All other API endpoints (workflows, executions) continue to work

## Solution

1. Open n8n UI → Settings → API Keys
2. Edit the existing API key
3. Enable the **Credentials** scope
4. Save

The API key value does not change — only the scopes are updated. No need to update `.mcp.json` or any config files.

## Key Gotcha

The MCP server may cache the old 403 response briefly. If the first call after updating scopes still fails, retry once — it resolves immediately.
