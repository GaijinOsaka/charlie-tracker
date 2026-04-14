# WhatsApp Data Retention Policy - GDPR Compliance

## Overview

This Edge Function implements automatic data retention and deletion for WhatsApp interactions, ensuring GDPR compliance by removing public interaction data after 90 days while retaining private interactions indefinitely for audit purposes.

## What Gets Deleted?

### ✓ Deleted (Public Interactions)

- WhatsApp interactions with `access_level = 'public'`
- Interactions older than **90 days** from creation date
- Query text, response text, and interaction records
- Phone number hashes are removed from logs (anonymization)

### ✓ Retained (Private Interactions)

- WhatsApp interactions with `access_level = 'private'`
- Retained indefinitely (no automatic deletion)
- Useful for audit trails and compliance verification
- Only deleted on explicit admin request with reason logging

### ✓ Always Retained

- GDPR compliance logs (never deleted - for audit purposes)
- Whatsapp user profiles (authorization data)
- All other application data (messages, documents, events, etc.)

## Architecture

### Database Objects

#### 1. **gdpr_deletion_log** Table

Audit trail of all retention policy executions.

```sql
Fields:
- id (UUID): Unique deletion event identifier
- table_name (TEXT): 'whatsapp_interactions'
- deletion_reason (TEXT): Why deletion occurred (automatic or manual)
- records_deleted (INT): Count of deleted records
- affected_phone_hashes (INT): Count of unique users affected
- retention_days (INT): Retention period (NULL for manual deletions)
- deleted_before_timestamp (TIMESTAMPTZ): Cutoff date for deletion
- execution_timestamp (TIMESTAMPTZ): When deletion happened
```

#### 2. **PostgreSQL Functions**

##### `delete_expired_whatsapp_interactions(retention_days INT)`

Automatic retention policy execution.

```typescript
Parameters:
- retention_days: Default 90 days

Returns:
- records_deleted (INT): Number of interactions removed
- affected_users (INT): Number of unique phone hashes
- execution_time (TIMESTAMPTZ): When deletion ran

Behavior:
- Deletes only public interactions older than retention_days
- Logs deletion to gdpr_deletion_log
- Private interactions are never deleted automatically
```

##### `delete_whatsapp_interactions_manual(phone_hash, access_level, reason)`

Manual deletion with admin audit trail.

```typescript
Parameters:
- phone_number_hash (TEXT, optional): Specific phone hash to delete
- access_level (TEXT, optional): 'public' or 'private'
- reason (TEXT): Deletion reason for audit log

Returns:
- records_deleted (INT): Number of records removed
- execution_timestamp (TIMESTAMPTZ): When deletion occurred

Use Cases:
- User requests data deletion (right to be forgotten)
- Admin removes specific user's data
- Compliance cleanup for private interactions
```

##### `get_gdpr_compliance_report(days INT)`

Compliance audit report.

```typescript
Returns:
- total_deletions (INT): Number of deletion events in period
- total_records_deleted (INT): Total interactions removed
- total_users_affected (INT): Unique phone hashes affected
- last_execution (TIMESTAMPTZ): Most recent deletion
- average_records_per_execution (NUMERIC): Avg records per run
- next_scheduled_execution (TIMESTAMPTZ): Projected next run
```

##### `get_retention_policy_status(retention_days INT)`

Current data retention status.

```typescript
Returns:
- public_interactions_total (INT): All public interactions
- public_interactions_eligible_for_deletion (INT): Will be deleted next run
- private_interactions_total (INT): All private interactions
- days_until_next_deletion (INT): Retention period setting
- cutoff_date (TIMESTAMPTZ): Current deletion threshold
```

### Edge Function (`whatsapp-retention-policy`)

HTTP API for executing and monitoring the retention policy.

#### Endpoints

##### **POST /functions/v1/whatsapp-retention-policy**

Execute retention policy.

```bash
curl -X POST https://your-project.supabase.co/functions/v1/whatsapp-retention-policy \
  -H "Authorization: Bearer YOUR_SUPABASE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "execute",
    "retention_days": 90
  }'
```

**Response (Success):**

```json
{
  "success": true,
  "message": "Retention policy executed successfully",
  "data": {
    "recordsDeleted": 42,
    "affectedUsers": 15,
    "executionTime": "2026-04-11T02:00:00Z"
  },
  "timestamp": "2026-04-11T02:00:00Z"
}
```

**Response (No Data to Delete):**

```json
{
  "success": true,
  "message": "No interactions eligible for deletion",
  "data": {
    "recordsDeleted": 0,
    "affectedUsers": 0,
    "executionTime": "2026-04-11T02:00:00Z"
  },
  "timestamp": "2026-04-11T02:00:00Z"
}
```

##### **GET /functions/v1/whatsapp-retention-policy?action=status**

Check retention policy status and compliance metrics.

```bash
curl https://your-project.supabase.co/functions/v1/whatsapp-retention-policy?action=status \
  -H "Authorization: Bearer YOUR_SUPABASE_KEY"
```

**Response:**

```json
{
  "success": true,
  "message": "Compliance status retrieved",
  "data": {
    "recordsDeleted": 1250,
    "affectedUsers": 340,
    "executionTime": "2026-04-10T02:00:00Z"
  },
  "timestamp": "2026-04-11T14:32:00Z"
}
```

## Deployment

### Prerequisites

- Supabase project with WhatsApp tables
- Migration 20260411_whatsapp_retention_policy.sql applied
- Environment variables configured

### Step 1: Apply Migration

```bash
# Using Supabase CLI
supabase migration up

# Or manually execute:
psql $DATABASE_URL < supabase/migrations/20260411_whatsapp_retention_policy.sql
```

### Step 2: Deploy Edge Function

```bash
# Using Supabase CLI
supabase functions deploy whatsapp-retention-policy

# Environment variables are inherited from Supabase project
```

### Step 3: Schedule Automatic Execution

Option A: **Using n8n Webhook** (Recommended)

1. Create n8n workflow with Webhook trigger
2. Set webhook URL to: `https://your-project.supabase.co/functions/v1/whatsapp-retention-policy`
3. Configure schedule: Daily at 2 AM
4. Add error handling and notification

Example n8n workflow:

```yaml
Trigger: Schedule (Daily, 2 AM)
→ HTTP Request POST to whatsapp-retention-policy
→ Log response
→ Slack notification (if errors)
```

Option B: **Using Supabase pg_cron** (Alternative)

```sql
-- Install pg_cron extension (must be done by Supabase support)
-- Then create scheduled job:

SELECT cron.schedule(
  'delete-expired-whatsapp-daily',
  '0 2 * * *', -- 2 AM daily
  'SELECT delete_expired_whatsapp_interactions(90);'
);
```

## Monitoring & Auditing

### View Compliance History

```sql
-- Get all deletion events
SELECT * FROM gdpr_deletion_log
ORDER BY execution_timestamp DESC;

-- Get last 30 days of deletions
SELECT
  DATE(execution_timestamp) as deletion_date,
  COUNT(*) as deletion_events,
  SUM(records_deleted) as total_records,
  SUM(affected_phone_hashes) as users_affected
FROM gdpr_deletion_log
WHERE execution_timestamp > NOW() - INTERVAL '30 days'
GROUP BY DATE(execution_timestamp)
ORDER BY deletion_date DESC;
```

### Check Current Data Retention Status

```sql
SELECT * FROM get_retention_policy_status(90);

-- Output example:
-- public_interactions_total: 2150
-- public_interactions_eligible_for_deletion: 340
-- private_interactions_total: 85
-- days_until_next_deletion: 90
-- cutoff_date: 2026-01-11 14:32:00
```

### Monitor Compliance Metrics

```sql
-- Get compliance report
SELECT * FROM get_gdpr_compliance_report(90);

-- View compliance dashboard
SELECT * FROM gdpr_compliance_dashboard;
```

### Set Up Alerts

**Alert:** When eligible deletions exceed threshold

```sql
-- Check if more than 1000 records eligible for deletion
WITH status AS (
  SELECT public_interactions_eligible_for_deletion
  FROM get_retention_policy_status(90)
)
SELECT CASE
  WHEN public_interactions_eligible_for_deletion > 1000
  THEN 'ALERT: Large deletion pending - ' ||
       public_interactions_eligible_for_deletion || ' records'
  ELSE 'OK: ' || public_interactions_eligible_for_deletion || ' records eligible'
END
FROM status;
```

## GDPR Compliance Features

### ✓ Data Minimization

- Only stores phone number **hashes** (SHA-256), not plain numbers
- Hashes are one-way - cannot be reversed to phone numbers
- Public interactions deleted after 90 days
- Private interactions retained for audit trail only

### ✓ Purpose Limitation

- Deletion only occurs for public interactions (shared data)
- Private interactions retained for authorization audit
- All deletions logged with timestamp and reason

### ✓ Storage Limitation

- Automatic 90-day deletion for public data
- Never stores unnecessary PII
- Separate audit log never deleted (compliance requirement)

### ✓ Accountability

- Complete audit trail in gdpr_deletion_log
- Timestamp of each deletion event
- Count of affected users and records
- Reason for each deletion (automatic or manual)

### ✓ Right to be Forgotten

- Admin can manually delete specific user's data
- Use: `SELECT delete_whatsapp_interactions_manual('+1234567890', NULL, 'User right to be forgotten')`
- Deletion is logged for compliance proof

## Testing

### Manual Test: Execute Retention Policy

```bash
# Execute immediate deletion (no waiting 90 days)
curl -X POST https://your-project.supabase.co/functions/v1/whatsapp-retention-policy \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "action": "execute",
    "retention_days": 90
  }'
```

### Manual Test: Check Status

```bash
curl https://your-project.supabase.co/functions/v1/whatsapp-retention-policy?action=status \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

### Manual Test: Simulate Old Data

```sql
-- Create test interaction dated 95 days ago
INSERT INTO whatsapp_interactions (
  phone_number_hash,
  access_level,
  query_text,
  response_text,
  created_at
) VALUES (
  'test_hash_old',
  'public',
  'Old query',
  'Old response',
  NOW() - INTERVAL '95 days'
);

-- Verify it exists
SELECT COUNT(*) FROM whatsapp_interactions
WHERE phone_number_hash = 'test_hash_old';

-- Execute retention policy
SELECT * FROM delete_expired_whatsapp_interactions(90);

-- Verify it was deleted
SELECT COUNT(*) FROM whatsapp_interactions
WHERE phone_number_hash = 'test_hash_old'; -- Should return 0
```

## Cost Impact

- **Database Storage**: Minimal (small deletion logs, no additional tables for main data)
- **Execution**: ~50ms per run, negligible cost (~1 execution/day)
- **Bandwidth**: ~1KB per request

## Configuration

### Retention Period (Default: 90 days)

To change retention period, update the scheduled job:

```sql
-- Change to 120 days
SELECT cron.alter_job(
  'delete-expired-whatsapp-daily',
  schedule => '0 2 * * *',
  command => 'SELECT delete_expired_whatsapp_interactions(120);'
);
```

Or when calling Edge Function:

```bash
curl -X POST https://your-project.supabase.co/functions/v1/whatsapp-retention-policy \
  -d '{"action": "execute", "retention_days": 120}'
```

## Security & Authorization

### Authorization Requirements

**Function-Level Authorization:**

- Both `delete_expired_whatsapp_interactions()` and `delete_whatsapp_interactions_manual()` use `SECURITY DEFINER` with session user validation
- Only `service_role` can execute these functions directly
- Attempting to call as another user will raise an exception with helpful error message

**Edge Function Authorization:**

- All requests to POST `/whatsapp-retention-policy` MUST include valid Authorization header with Bearer token
- Token is validated before any database operations
- Invalid or missing authorization returns HTTP 401 (Unauthorized)

**Setting Authorization in n8n Workflow:**

```javascript
// In n8n HTTP Request node:
Headers:
- Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
- Content-Type: application/json
```

### Phone Number Hash Encryption

**Current Implementation:**

- Phone numbers are stored as **SHA-256 hashes** (one-way cryptographic function)
- Hashes cannot be reversed to original phone numbers
- Compliance logs reference hashes only, never plain numbers

**Future Enhancement (Recommended):**
For additional security, consider encryption at rest:

```sql
-- Add encrypted backup column (not yet implemented)
ALTER TABLE gdpr_deletion_log
  ADD COLUMN affected_phone_hashes_encrypted bytea;

-- Encrypt with pgcrypto extension
UPDATE gdpr_deletion_log
  SET affected_phone_hashes_encrypted = pgp_sym_encrypt(
    affected_phone_hashes::text,
    'encryption_key'
  );
```

### GDPR Article 17 (Right to Erasure) - Implementation Notes

**What's Implemented:**

- ✓ Manual deletion function with admin audit trail
- ✓ Deletion logging and compliance reporting
- ✓ Retention period enforcement (90 days for public data)

**Gaps (Future Implementation):**

- ⏳ User notification upon erasure (email alert when data is deleted)
- ⏳ Erasure confirmation (return deletion confirmation to requestor)
- ⏳ Timeline compliance ("without undue delay" = 30 days max per GDPR)

**Recommended Enhancement:**

```sql
-- Add user notification table
CREATE TABLE gdpr_erasure_notifications (
  id UUID PRIMARY KEY,
  phone_number_hash TEXT NOT NULL,
  erasure_reason TEXT,
  notification_sent_at TIMESTAMPTZ,
  notification_status TEXT -- sent, pending, failed
);

-- Trigger notification after deletion
CREATE TRIGGER notify_user_on_deletion
AFTER DELETE ON whatsapp_interactions
FOR EACH ROW
EXECUTE FUNCTION send_gdpr_erasure_notification();
```

## Troubleshooting

### Issue: Function not found

**Solution**: Ensure migration 20260411_whatsapp_retention_policy.sql was applied.

### Issue: Permission denied

**Solution**: Ensure service role key has execute permissions on retention functions. Verify Bearer token is included in Authorization header.

### Issue: "Only service_role can execute..." error

**Cause**: Function was called with non-service credentials.
**Solution**: Verify the Edge Function is using SUPABASE_SERVICE_ROLE_KEY environment variable, not the anon key.

### Issue: No records deleted

**Check**:

```sql
-- Verify eligible records exist
SELECT COUNT(*) as eligible FROM whatsapp_interactions
WHERE access_level = 'public'
AND created_at < NOW() - INTERVAL '90 days';
```

### Issue: Retention policy running too slowly

**Solution**: Performance index is included in migration:

```sql
-- Composite index on (access_level, created_at) for efficient deletion
CREATE INDEX idx_whatsapp_interactions_access_created
ON whatsapp_interactions(access_level, created_at DESC)
WHERE access_level = 'public';
```

This index significantly improves deletion query performance by avoiding full table scans.

## References

- [GDPR Article 5: Data Protection Principles](https://gdpr-info.eu/art-5-gdpr/)
- [GDPR Article 17: Right to Erasure](https://gdpr-info.eu/art-17-gdpr/)
- [GDPR Article 32: Security of Processing](https://gdpr-info.eu/art-32-gdpr/)
- [Supabase Edge Functions Documentation](https://supabase.com/docs/guides/functions)
- [PostgreSQL Date Functions](https://www.postgresql.org/docs/current/functions-datetime.html)

## Support

For questions or issues:

1. Check troubleshooting section above
2. Review gdpr_deletion_log for deletion history
3. Verify migration was applied: `SELECT COUNT(*) FROM gdpr_deletion_log;`
4. Check Edge Function logs in Supabase dashboard
