-- Migration: Event deduplication
-- Removes duplicate events and enforces uniqueness on (title, event_date)
-- Timestamp: 2026-04-14

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
