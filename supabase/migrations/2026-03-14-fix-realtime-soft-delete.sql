-- Fix Realtime connection timeout by removing complex RLS policy
-- The subquery in RLS policies is too expensive for Realtime subscriptions
-- We'll filter soft-deleted messages in the app instead

-- Drop the problematic policy that causes Realtime to timeout
DROP POLICY IF EXISTS "users_see_non_deleted_messages" ON messages;

-- Keep the simpler original policy that allows Realtime to work
-- The app will handle soft-delete filtering in JavaScript
