# Apply Event Deduplication Migration in VS Code Claude

## Quick Steps

1. **Open VS Code Claude plugin** (Claude Code in VS Code)
2. **In the prompt, paste this:**

````
Use the Supabase MCP to apply the event deduplication migration.

Project ID: knqhcipfgypzfszrwrsu
Migration name: event_deduplication

SQL to run:
```sql
-- Remove duplicate events, keeping the earliest created_at per (title, event_date)
DELETE FROM events
WHERE id NOT IN (
  SELECT DISTINCT ON (lower(title), event_date) id
  FROM events
  ORDER BY lower(title), event_date, created_at ASC
);

-- Enforce uniqueness going forward (case-insensitive title)
CREATE UNIQUE INDEX events_title_date_unique
  ON events (lower(title), event_date);
````

Use the `apply_migration` tool from the Supabase MCP with:

- project_id: "knqhcipfgypzfszrwrsu"
- name: "event_deduplication"
- query: [the SQL above]

```

3. **Press Enter/Submit** and it should run successfully with your configured Supabase access token

## Why VS Code Works

VS Code Claude has persistent environment configuration that includes `SUPABASE_ACCESS_TOKEN`, so the Supabase MCP can authenticate properly. Claude Code (CLI) doesn't have that same persistent environment setup, which is why it failed here.

## After Migration

Once it succeeds:
- Existing duplicate events will be removed (keeping the earliest)
- A unique index will prevent new duplicates from being created
- The n8n workflow is already updated to check for duplicates before inserting
- Your Charlie Tracker events page should show consolidated events (e.g., "Judo Club on 15 April" appears once instead of multiple times)
```
