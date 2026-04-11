-- WhatsApp Data Retention Policy - GDPR Compliance
-- Task 9: Implement 90-day auto-delete for public interactions with compliance logging

-- 1. GDPR Deletion Log Table
-- Audit trail for all retention policy executions (for compliance reports)
CREATE TABLE gdpr_deletion_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name TEXT NOT NULL,
  deletion_reason TEXT NOT NULL,
  records_deleted INTEGER NOT NULL,
  affected_phone_hashes INTEGER NOT NULL,
  retention_days INTEGER NOT NULL,
  deleted_before_timestamp TIMESTAMPTZ NOT NULL,
  execution_timestamp TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT valid_table_name CHECK (table_name = 'whatsapp_interactions')
);

-- Index for audit queries
CREATE INDEX idx_gdpr_deletion_log_timestamp ON gdpr_deletion_log(execution_timestamp DESC);
CREATE INDEX idx_gdpr_deletion_log_table ON gdpr_deletion_log(table_name);

-- Enable RLS (only authenticated users can read compliance logs)
ALTER TABLE gdpr_deletion_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read GDPR logs" ON gdpr_deletion_log
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- 2. Data Retention Function
-- Deletes WhatsApp interactions older than specified retention period
-- Only deletes PUBLIC interactions (access_level = 'public')
-- Private interactions are retained indefinitely for audit purposes
CREATE OR REPLACE FUNCTION delete_expired_whatsapp_interactions(
  retention_days INT DEFAULT 90
)
RETURNS TABLE (
  records_deleted INT,
  affected_users INT,
  execution_time TIMESTAMPTZ
) AS $$
DECLARE
  v_deleted_count INT;
  v_affected_users INT;
  v_cutoff_date TIMESTAMPTZ;
  v_execution_time TIMESTAMPTZ;
BEGIN
  v_execution_time := NOW();
  v_cutoff_date := NOW() - MAKE_INTERVAL(days => retention_days);

  -- Count unique phone hashes to be affected
  SELECT COUNT(DISTINCT phone_number_hash) INTO v_affected_users
  FROM whatsapp_interactions
  WHERE access_level = 'public'
    AND created_at < v_cutoff_date;

  -- Delete only public interactions older than retention period
  DELETE FROM whatsapp_interactions
  WHERE access_level = 'public'
    AND created_at < v_cutoff_date;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Log the deletion event for GDPR compliance
  IF v_deleted_count > 0 THEN
    INSERT INTO gdpr_deletion_log (
      table_name,
      deletion_reason,
      records_deleted,
      affected_phone_hashes,
      retention_days,
      deleted_before_timestamp,
      execution_timestamp
    ) VALUES (
      'whatsapp_interactions',
      'Automatic retention policy: public interactions older than ' || retention_days || ' days',
      v_deleted_count,
      v_affected_users,
      retention_days,
      v_cutoff_date,
      v_execution_time
    );
  END IF;

  -- Return results
  RETURN QUERY SELECT v_deleted_count, v_affected_users, v_execution_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Function to manually delete interactions (admin action with logging)
-- Used when deletion needs to happen outside the automatic schedule
CREATE OR REPLACE FUNCTION delete_whatsapp_interactions_manual(
  p_phone_number_hash TEXT DEFAULT NULL,
  p_access_level TEXT DEFAULT NULL,
  p_reason TEXT DEFAULT 'Manual deletion by administrator'
)
RETURNS TABLE (
  records_deleted INT,
  execution_timestamp TIMESTAMPTZ
) AS $$
DECLARE
  v_deleted_count INT;
  v_execution_time TIMESTAMPTZ;
BEGIN
  v_execution_time := NOW();

  -- Delete interactions matching criteria
  DELETE FROM whatsapp_interactions
  WHERE (p_phone_number_hash IS NULL OR phone_number_hash = p_phone_number_hash)
    AND (p_access_level IS NULL OR access_level = p_access_level);

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  -- Log the manual deletion for compliance
  IF v_deleted_count > 0 THEN
    INSERT INTO gdpr_deletion_log (
      table_name,
      deletion_reason,
      records_deleted,
      affected_phone_hashes,
      retention_days,
      deleted_before_timestamp,
      execution_timestamp
    ) VALUES (
      'whatsapp_interactions',
      p_reason,
      v_deleted_count,
      CASE WHEN p_phone_number_hash IS NOT NULL THEN 1 ELSE NULL END,
      NULL,
      NOW(),
      v_execution_time
    );
  END IF;

  RETURN QUERY SELECT v_deleted_count, v_execution_time;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Function to retrieve GDPR compliance report
-- Shows deletion history and metrics for compliance audits
CREATE OR REPLACE FUNCTION get_gdpr_compliance_report(
  p_days INT DEFAULT 90
)
RETURNS TABLE (
  total_deletions INT,
  total_records_deleted INT,
  total_users_affected INT,
  last_execution TIMESTAMPTZ,
  average_records_per_execution NUMERIC,
  next_scheduled_execution TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INT as total_deletions,
    COALESCE(SUM(records_deleted), 0)::INT as total_records_deleted,
    COALESCE(SUM(affected_phone_hashes), 0)::INT as total_users_affected,
    MAX(execution_timestamp) as last_execution,
    CASE
      WHEN COUNT(*) > 0 THEN (SUM(records_deleted)::NUMERIC / COUNT(*))
      ELSE 0
    END as average_records_per_execution,
    (MAX(execution_timestamp) + MAKE_INTERVAL(days => 7))::TIMESTAMPTZ as next_scheduled_execution
  FROM gdpr_deletion_log
  WHERE table_name = 'whatsapp_interactions'
    AND execution_timestamp > NOW() - MAKE_INTERVAL(days => p_days);
END;
$$ LANGUAGE plpgsql;

-- 5. Function to get current data retention status
-- Shows how many interactions will be deleted on next run
CREATE OR REPLACE FUNCTION get_retention_policy_status(
  retention_days INT DEFAULT 90
)
RETURNS TABLE (
  public_interactions_total INT,
  public_interactions_eligible_for_deletion INT,
  private_interactions_total INT,
  days_until_next_deletion INT,
  cutoff_date TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::INT FROM whatsapp_interactions WHERE access_level = 'public') as public_interactions_total,
    (SELECT COUNT(*)::INT FROM whatsapp_interactions
     WHERE access_level = 'public'
     AND created_at < NOW() - MAKE_INTERVAL(days => retention_days)) as public_interactions_eligible_for_deletion,
    (SELECT COUNT(*)::INT FROM whatsapp_interactions WHERE access_level = 'private') as private_interactions_total,
    retention_days as days_until_next_deletion,
    (NOW() - MAKE_INTERVAL(days => retention_days))::TIMESTAMPTZ as cutoff_date;
END;
$$ LANGUAGE plpgsql;

-- 6. Grant permissions for Edge Functions and service role
-- Service role can execute retention functions
GRANT EXECUTE ON FUNCTION delete_expired_whatsapp_interactions(INT) TO service_role;
GRANT EXECUTE ON FUNCTION delete_whatsapp_interactions_manual(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION get_gdpr_compliance_report(INT) TO service_role;
GRANT EXECUTE ON FUNCTION get_retention_policy_status(INT) TO service_role;

-- 7. View for compliance dashboard
-- Shows current state of data retention and deletion history
CREATE OR REPLACE VIEW gdpr_compliance_dashboard AS
SELECT
  'Data Retention Status' as metric_category,
  'Public Interactions' as metric_name,
  COUNT(*)::TEXT as metric_value,
  NOW() as last_updated
FROM whatsapp_interactions
WHERE access_level = 'public'
UNION ALL
SELECT
  'Data Retention Status',
  'Private Interactions (Retained)',
  COUNT(*)::TEXT,
  NOW()
FROM whatsapp_interactions
WHERE access_level = 'private'
UNION ALL
SELECT
  'Compliance Log',
  'Total Deletions Executed',
  COUNT(*)::TEXT,
  MAX(execution_timestamp)
FROM gdpr_deletion_log
UNION ALL
SELECT
  'Compliance Log',
  'Total Records Deleted',
  COALESCE(SUM(records_deleted), 0)::TEXT,
  MAX(execution_timestamp)
FROM gdpr_deletion_log;

-- Enable RLS on views (inherited from underlying tables)
ALTER VIEW gdpr_compliance_dashboard OWNER TO postgres;
