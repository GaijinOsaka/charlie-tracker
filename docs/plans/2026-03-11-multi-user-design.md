# Multi-User Support Design

## Overview

Add authentication and per-user tracking to Charlie Tracker so two parents can share the platform while maintaining independent read/action status. Deploy as a PWA for mobile app experience.

## Users

- Exactly 2 parent/guardian accounts
- Invite-only (no public sign-up)
- Fully shared data — both users see all messages, documents, events, calendar
- Per-user distinction: read/unread status, action notifications

## Authentication

### Supabase Auth (email/password)

- Simple login page with email + password form
- Session persists via refresh token in local storage (set to 30+ days in Supabase dashboard)
- Users log in once and stay logged in until explicit sign-out
- Auth context provider wraps the entire app

### Profiles Table

```sql
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, display_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

### Invite Flow

- "Invite Partner" button in settings area
- Edge Function `invite-user`:
  - Validates caller is authenticated
  - Checks total profiles < 2
  - Calls `supabase.auth.admin.inviteUserByEmail()` with display_name in metadata
- Invited user receives email link to set their password
- On first login, trigger auto-creates their profile

## Per-User Read Status

### Replace global `is_read` with junction table

```sql
CREATE TABLE message_read_status (
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, message_id)
);

CREATE INDEX idx_read_status_user ON message_read_status(user_id);

ALTER TABLE message_read_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own read status"
  ON message_read_status FOR ALL
  USING (auth.uid() = user_id);
```

### Behaviour

- Message is **unread** for a user if no row exists in `message_read_status` for their user_id + message_id
- Auto-mark as read when user expands a message card (after 1 second delay to avoid accidental marks)
- "Mark as unread" option available (deletes the row)
- Unread count in top bar: count of messages with no matching read_status row for current user
- Drop `is_read` column from `messages` table

## Action Tracking with Notes

### Schema changes on `messages`

```sql
-- Change actioned_by from TEXT to UUID
ALTER TABLE messages ALTER COLUMN actioned_by TYPE UUID USING NULL;
ALTER TABLE messages ADD CONSTRAINT fk_actioned_by FOREIGN KEY (actioned_by) REFERENCES auth.users(id);

-- Add action note
ALTER TABLE messages ADD COLUMN action_note TEXT;
```

### Behaviour

- When user clicks "Action" on a message, a modal/popover appears
- Text field: "What did you do?" (optional but encouraged)
- On confirm: sets `actioned_at`, `actioned_by` (current user UUID), `action_note`
- Message card displays: "Actioned by [display_name] - [note]" with relative timestamp
- "Undo action" option clears all three fields

## Top Bar Notifications

### Notification table

```sql
CREATE TABLE user_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'actioned',
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  dismissed_at TIMESTAMPTZ
);

CREATE INDEX idx_notifications_user_undismissed
  ON user_notifications(user_id) WHERE dismissed_at IS NULL;

ALTER TABLE user_notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own notifications"
  ON user_notifications FOR ALL
  USING (auth.uid() = user_id);
```

### Behaviour

- When Parent A actions a message, a notification row is created for Parent B
- Notification summary: "[Name] actioned '[Subject]' - [note]"
- Top bar shows badge count of undismissed notifications + dropdown list
- Clicking a notification highlights the relevant message and marks notification as dismissed
- "Dismiss all" option available
- Notifications older than 30 days cleaned up via scheduled SQL
- Subscribe to `user_notifications` via Supabase Realtime for instant updates

### Notification creation (database trigger)

```sql
CREATE OR REPLACE FUNCTION create_action_notification()
RETURNS TRIGGER AS $$
DECLARE
  other_user_id UUID;
  actor_name TEXT;
BEGIN
  -- Only fire when actioned_at is newly set
  IF NEW.actioned_at IS NOT NULL AND (OLD.actioned_at IS NULL) THEN
    -- Get the other user
    SELECT id INTO other_user_id FROM profiles WHERE id != NEW.actioned_by LIMIT 1;
    SELECT display_name INTO actor_name FROM profiles WHERE id = NEW.actioned_by;

    IF other_user_id IS NOT NULL THEN
      INSERT INTO user_notifications (user_id, message_id, type, summary)
      VALUES (
        other_user_id,
        NEW.id,
        'actioned',
        actor_name || ' actioned ''' || NEW.subject || '''' ||
          CASE WHEN NEW.action_note IS NOT NULL THEN ' — ' || NEW.action_note ELSE '' END
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_action_notification
  AFTER UPDATE ON messages
  FOR EACH ROW EXECUTE FUNCTION create_action_notification();
```

## RLS Policy Updates

Update all existing permissive policies to require authentication:

```sql
-- Replace all USING (true) policies with:
USING (auth.role() = 'authenticated')

-- For user-scoped tables (message_read_status, user_notifications):
USING (auth.uid() = user_id)
```

Tables to update: messages, attachments, categories, sync_log, events, web_pages, documents, document_chunks.

Add INSERT/UPDATE/DELETE policies for messages (actioning), message_read_status, and user_notifications for authenticated users.

## PWA Setup

### Web Manifest (`public/manifest.json`)

```json
{
  "name": "Charlie Tracker",
  "short_name": "Charlie",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#1a1a2e",
  "theme_color": "#1a1a2e",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

### Service Worker

- Cache app shell (HTML, CSS, JS) for offline loading
- Network-first strategy for API calls
- Use Vite PWA plugin (`vite-plugin-pwa`) for automatic generation

### index.html additions

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#1a1a2e" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta
  name="apple-mobile-web-app-status-bar-style"
  content="black-translucent"
/>
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

### Install prompt

- Show a subtle "Add to Home Screen" banner on first visit (if not already installed)
- Use `beforeinstallprompt` event on Android / instructions overlay on iOS

## Migration Order

Each step is independently deployable:

1. **Auth & profiles** — create profiles table, trigger, Edge Function. Add login page + auth context.
2. **Per-user read status** — create table, migrate from `is_read`, update frontend logic.
3. **Action notes** — alter messages table, add action modal, update message card display.
4. **Notifications** — create table + trigger, add top bar badge/dropdown, Realtime subscription.
5. **PWA** — add manifest, service worker, icons, install prompt.
6. **RLS hardening** — update all policies from permissive to auth-scoped.

## Data Migration

- Existing `is_read = true` messages: no migration needed (start fresh — both users see everything as unread)
- Existing `actioned_by` TEXT values: clear the column (set to NULL) since there are no user UUIDs yet
- First user signs up normally, invites second user
