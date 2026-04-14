# Run Event Deduplication SQL Migration

## Quick Steps

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project: **charlie-tracker** (knqhcipfgypzfszrwrsu)
3. Go to **SQL Editor** (left sidebar)
4. Click **+ New query**
5. Paste the SQL below
6. Click **Run**

## SQL to Execute

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
```

## What This Does

1. **DELETE**: Removes all duplicate events, keeping only the earliest one for each unique (title, date) combination
   - Uses `DISTINCT ON` to group by case-insensitive title and date
   - Keeps the oldest event (`ORDER BY created_at ASC`)
   - Deletes newer duplicates

2. **CREATE INDEX**: Adds a unique constraint to prevent future duplicates
   - Index is on `lower(title)` for case-insensitive matching
   - Combined with `event_date` for unique enforcement
   - Will silently reject any insert that violates this constraint

## Verification

After running, verify the migration succeeded:

```sql
-- Check the index exists
\d events_title_date_unique

-- See how many duplicates were removed
SELECT COUNT(*) FROM events;
```

## If It Fails

If you get an error:

- **"relation does not exist"** → Check that the `events` table exists
- **"duplicate key value"** → Some events already exist with the same title/date (unexpected, as the DELETE should handle this)
- **"permission denied"** → Your Supabase role may not have DDL permissions (contact support)

---

**Status**: This migration is required before the deduplication system is fully active. Once applied, duplicate events in your dashboard should be consolidated.
