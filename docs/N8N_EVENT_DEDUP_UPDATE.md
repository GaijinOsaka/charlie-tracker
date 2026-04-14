# n8n Event Deduplication Update

## Manual Update Instructions for Gmail Monitor Workflow

**Workflow URL:** `http://144.126.200.83:5678/workflow/gBJb0RH6dfvpLi21`

### Step 1: Open the Workflow

1. Navigate to n8n at `http://144.126.200.83:5678`
2. Click **Workflows** in the sidebar
3. Find and open **"Charlie Tracker - Gmail Monitor"**

### Step 2: Locate the "Extract Key Dates" Code Node

The workflow should have nodes in this order:

- Schedule Trigger
- Gmail: Fetch Emails
- Loop: For Each Email
- Supabase: Dedup Check
- IF: Is New?
- Code: Extract Attachments
- Code: Check for Arbor Link
- IF: Has Arbor Link?
- HTTP: Call Skyvern API
- Code: Format Skyvern Result
- Code: Format Plain Email
- Supabase: Insert Message
- **Code: Extract Key Dates** ← This is the node to update
- Supabase: Update sync_log

### Step 3: Update the Code Node

1. Click on the **"Extract Key Dates"** Code node
2. In the right sidebar, you should see a JavaScript editor
3. Replace the entire code with the updated code below
4. Click **Save** (Ctrl+S or CMD+S)

### Updated JavaScript Code for "Extract Key Dates" Node

```javascript
// Extract key dates from message content with deduplication

const message = $input.first().json;
const messageId = message.id;
const content = message.content || "";

// Your existing date extraction patterns here
// Extract dates using regex or other logic
const extractedEvents = [];

// Example: if your current code extracts events like this:
// extractedEvents = [
//   { title: 'Judo Club', event_date: '2026-04-15', event_time: null, description: '...' },
//   { title: 'Chemistry Test', event_date: '2026-04-16', event_time: '09:00', description: '...' }
// ];

// ADD THIS DEDUPLICATION LOGIC:
// Before inserting events, check for duplicates against Supabase

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const dedupedEvents = [];

for (const event of extractedEvents) {
  try {
    // Build the query URL for case-insensitive title match + exact date match
    const checkUrl = `${supabaseUrl}/rest/v1/events?title=ilike.${encodeURIComponent("*" + event.title + "*")}&event_date=eq.${event.event_date}&select=id`;

    const response = await fetch(checkUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${supabaseKey}`,
        apikey: supabaseKey,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Supabase query failed: ${response.status}`);
    }

    const existing = await response.json();

    // Only add to deduped list if no duplicate found
    if (!Array.isArray(existing) || existing.length === 0) {
      dedupedEvents.push({
        ...event,
        message_id: messageId,
      });
    } else {
      // Log that we skipped a duplicate
      console.log(
        `Skipped duplicate event: ${event.title} on ${event.event_date}`,
      );
    }
  } catch (err) {
    console.error(
      `Dedup check failed for event "${event.title}":`,
      err.message,
    );
    // On error, still include event (fail open to avoid missing events)
    dedupedEvents.push({
      ...event,
      message_id: messageId,
    });
  }
}

// Return deduplicated events for downstream Supabase insert
return dedupedEvents.map((e) => ({ json: e }));
```

### Important Notes

1. **Keep your existing extraction logic** — just add the dedup loop before the return statement
2. **Environment variables** — ensure `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set in n8n (they should be from previous setup)
3. **The dedup query** uses `ilike` for case-insensitive matching and `eq` for exact date matching
4. **Fail open** — if the dedup check fails for any reason, events are still included rather than being dropped
5. **Test after update** — run the workflow with test data to verify dedup works

### Step 4: Test the Workflow

1. Click the **Test** button (or run the workflow)
2. Check the n8n execution logs for:
   - "Skipped duplicate event" messages (means dedup is working)
   - Any errors in the Supabase dedup query
3. Verify in the Charlie Tracker app that events are not duplicated

### Step 5: Verify the Database Migration

Once you've updated the n8n workflow, run the SQL migration to add the unique index:

```sql
-- In Supabase SQL Editor, run:
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

---

## Troubleshooting

### "Supabase query failed: 401"

- Check that `SUPABASE_SERVICE_ROLE_KEY` is set in n8n environment variables
- Verify the key is correct and not expired

### "Supabase query failed: 400"

- The query URL syntax may be wrong
- Check the Supabase REST API docs: `https://supabase.com/docs/reference/javascript/select`

### Events still appearing as duplicates

- The migration may not have been applied yet
- Check that the unique index `events_title_date_unique` exists: `\d events` in psql

### Workflow won't save

- Click **Save** button explicitly
- Check for JavaScript syntax errors (red squiggly lines)
- Try refreshing the page and re-opening the node
