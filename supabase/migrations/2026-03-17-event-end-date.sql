-- Add event_end_date column to support multi-day events
ALTER TABLE events
  ADD COLUMN event_end_date DATE;

-- Index for efficient multi-day event range queries
CREATE INDEX idx_events_date_range ON events(event_date, event_end_date);
