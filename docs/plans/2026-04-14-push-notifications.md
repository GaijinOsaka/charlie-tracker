# Push Notifications for "Action Required" Messages

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver rich push notifications to all users' phones when a message is flagged as "action required".

**Architecture:** When a message's status changes to "action_required", a PostgreSQL trigger fires an Edge Function that sends Web Push notifications to all subscribed devices. Frontend captures push subscriptions on first app load and Service Worker handles notification display and clicks. Works on Android (full support) and iOS 16.4+ (PWA only).

**Tech Stack:**
- Supabase (PostgreSQL, Realtime, Edge Functions)
- Web Push API (browser standard)
- Service Worker (PWA)
- React (permission UI)

---

## Task 1: Create push_subscriptions Table

**Files:**
- Modify: `supabase/schema.sql` (add table definition)
- Create: `supabase/migrations/20260414_create_push_subscriptions.sql` (migration file)

**Step 1: Write migration file**

Create file `supabase/migrations/20260414_create_push_subscriptions.sql`:

```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  device_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(user_id, subscription)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only view their own subscriptions"
  ON push_subscriptions
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions"
  ON push_subscriptions
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions"
  ON push_subscriptions
  FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX push_subscriptions_user_id_idx ON push_subscriptions(user_id);
```

**Step 2: Update schema.sql**

Append the table definition to `supabase/schema.sql` (copy the CREATE TABLE + RLS policies from migration above).

**Step 3: Test migration locally**

Run: `supabase db push`
Expected: No errors, table created in local database

**Step 4: Commit**

```bash
git add supabase/migrations/20260414_create_push_subscriptions.sql supabase/schema.sql
git commit -m "feat: add push_subscriptions table and RLS policies"
```

---

## Task 2: Write notify-action-required Edge Function

**Files:**
- Create: `supabase/functions/notify-action-required/index.ts`

**Step 1: Create Edge Function file**

Create `supabase/functions/notify-action-required/index.ts`:

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface MessagePayload {
  id: string;
  status: string;
  subject: string;
  body: string;
  sender: string;
  old_status: string | null;
}

Deno.serve(async (req) => {
  // Only handle POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
    });
  }

  try {
    const payload: MessagePayload = await req.json();

    // Only trigger if status changed TO "action_required"
    if (payload.status !== "action_required" || payload.old_status === "action_required") {
      return new Response(
        JSON.stringify({ message: "No notification triggered" }),
        { status: 200 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all active push subscriptions
    const { data: subscriptions, error: fetchError } = await supabase
      .from("push_subscriptions")
      .select("id, subscription, user_id");

    if (fetchError) {
      throw new Error(`Failed to fetch subscriptions: ${fetchError.message}`);
    }

    if (!subscriptions || subscriptions.length === 0) {
      return new Response(JSON.stringify({ message: "No subscriptions found" }), {
        status: 200,
      });
    }

    // Prepare notification payload
    const messageSnippet = payload.body.substring(0, 150).replace(/\n/g, " ");
    const notificationPayload = {
      title: "Action Required",
      body: `${payload.sender}: ${payload.subject}`,
      icon: "/icon-192.png",
      badge: "/badge-72.png",
      tag: `message-${payload.id}`, // Prevent duplicates for same message
      data: {
        messageId: payload.id,
        snippet: messageSnippet,
        url: `/messages/${payload.id}`,
      },
    };

    // Send push to all subscriptions
    const pushResults = [];
    const failedSubscriptions = [];

    for (const sub of subscriptions) {
      try {
        const response = await fetch("https://fcm.googleapis.com/fcm/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `key=${Deno.env.get("FCM_SERVER_KEY")}`,
          },
          body: JSON.stringify({
            to: sub.subscription.endpoint,
            notification: notificationPayload,
            data: notificationPayload.data,
          }),
        });

        if (!response.ok) {
          const status = response.status;
          // 401/403 = invalid subscription, should be deleted
          if (status === 401 || status === 403 || status === 404) {
            failedSubscriptions.push(sub.id);
          }
          pushResults.push({
            subscriptionId: sub.id,
            success: false,
            status,
          });
        } else {
          pushResults.push({
            subscriptionId: sub.id,
            success: true,
          });
        }
      } catch (error) {
        console.error(`Failed to send push to ${sub.id}:`, error);
        pushResults.push({
          subscriptionId: sub.id,
          success: false,
          error: error.message,
        });
      }
    }

    // Clean up failed subscriptions
    if (failedSubscriptions.length > 0) {
      await supabase
        .from("push_subscriptions")
        .delete()
        .in("id", failedSubscriptions);
    }

    return new Response(
      JSON.stringify({
        message: "Notifications sent",
        total: subscriptions.length,
        succeeded: pushResults.filter((r) => r.success).length,
        failed: pushResults.filter((r) => !r.success).length,
        results: pushResults,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in notify-action-required:", error);
    return new Response(
      JSON.stringify({
        error: "Failed to process notifications",
        details: error.message,
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

**Step 2: Deploy Edge Function**

Run: `supabase functions deploy notify-action-required`
Expected: "Function deployed successfully"

**Step 3: Commit**

```bash
git add supabase/functions/notify-action-required/index.ts
git commit -m "feat: add notify-action-required edge function for web push"
```

---

## Task 3: Add PostgreSQL Trigger for Status Changes

**Files:**
- Modify: `supabase/schema.sql` (add trigger)
- Create: `supabase/migrations/20260414_add_message_status_trigger.sql`

**Step 1: Create migration**

Create `supabase/migrations/20260414_add_message_status_trigger.sql`:

```sql
CREATE OR REPLACE FUNCTION trigger_notify_action_required()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger if status changed TO "action_required"
  IF NEW.status = 'action_required' AND OLD.status IS DISTINCT FROM NEW.status THEN
    -- Call the Edge Function via http_request (Supabase provides this)
    PERFORM
      net.http_post(
        url := 'https://' || current_setting('app.settings.supabase_url') || '/functions/v1/notify-action-required',
        headers := jsonb_build_object(
          'Authorization', 'Bearer ' || current_setting('app.settings.supabase_service_key'),
          'Content-Type', 'application/json'
        ),
        body := jsonb_build_object(
          'id', NEW.id,
          'status', NEW.status,
          'subject', NEW.subject,
          'body', NEW.body,
          'sender', NEW.sender,
          'old_status', OLD.status
        )
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS message_status_change_notify ON messages;
CREATE TRIGGER message_status_change_notify
  AFTER UPDATE ON messages
  FOR EACH ROW
  EXECUTE FUNCTION trigger_notify_action_required();
```

**Step 2: Enable pgsql-http extension**

In Supabase dashboard, go to SQL Editor and run:
```sql
CREATE EXTENSION IF NOT EXISTS http;
```

**Step 3: Update schema.sql**

Append the trigger and function to `supabase/schema.sql`.

**Step 4: Test trigger locally**

Run: `supabase db push`
Expected: No errors, function and trigger created

**Step 5: Commit**

```bash
git add supabase/migrations/20260414_add_message_status_trigger.sql supabase/schema.sql
git commit -m "feat: add database trigger for action-required notifications"
```

---

## Task 4: Update Service Worker to Handle Push Events

**Files:**
- Modify: `public/service-worker.js`

**Step 1: Add push event handler**

In `public/service-worker.js`, add this after existing event listeners:

```javascript
// Handle incoming push notifications
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};

  const notificationOptions = {
    body: data.body || 'New notification',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/badge-72.png',
    tag: data.tag || 'default', // Prevents duplicate notifications for same tag
    data: data.data || {},
    actions: [
      {
        action: 'open',
        title: 'Open',
      },
      {
        action: 'close',
        title: 'Dismiss',
      },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'Charlie Tracker', notificationOptions)
  );
});

// Handle notification clicks
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const messageId = event.notification.data.messageId;
  const url = messageId ? `/messages/${messageId}` : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      // Check if app is already open
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url === '/' && 'focus' in client) {
          return client.focus().then(() => {
            // Post message to app to navigate to message
            client.postMessage({ type: 'NAVIGATE_TO_MESSAGE', messageId });
          });
        }
      }
      // App not open, open it
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
```

**Step 2: Commit**

```bash
git add public/service-worker.js
git commit -m "feat: handle push notifications in service worker"
```

---

## Task 5: Add Push Subscription Management to App.jsx

**Files:**
- Modify: `src/App.jsx` (add subscription logic in useEffect)

**Step 1: Add subscription function**

Add this function at the top of `src/App.jsx` (before the App component):

```javascript
async function subscribeToPushNotifications() {
  // Check if browser supports notifications
  if (!('Notification' in window)) {
    console.log('Notifications not supported');
    return;
  }

  // Check if service worker is available
  if (!navigator.serviceWorker) {
    console.log('Service workers not supported');
    return;
  }

  try {
    // Get permission if not already granted
    if (Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        console.log('Notification permission denied');
        return;
      }
    }

    // Skip if permission not granted
    if (Notification.permission !== 'granted') {
      return;
    }

    // Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // Check if push is supported
    if (!registration.pushManager) {
      console.log('Push notifications not supported');
      return;
    }

    // Subscribe to push
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(process.env.VITE_VAPID_PUBLIC_KEY),
    });

    // Send subscription to Supabase
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          subscription: subscription.toJSON(),
          device_name: `${navigator.userAgent.split('/')[0]} ${new Date().toLocaleDateString()}`,
        },
        { onConflict: 'user_id,subscription' }
      );

    if (error) {
      console.error('Failed to save subscription:', error);
    } else {
      console.log('Push subscription saved');
    }
  } catch (error) {
    console.error('Failed to subscribe to push:', error);
  }
}

// Helper function to convert VAPID key
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  return new Uint8Array([...rawData].map((char) => char.charCodeAt(0)));
}
```

**Step 2: Call subscription on app load**

In the main `useEffect` of `App.jsx`, add this after user auth check:

```javascript
useEffect(() => {
  // ... existing auth check code ...

  if (user) {
    subscribeToPushNotifications();
  }
}, [user]);
```

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: subscribe to push notifications on app load"
```

---

## Task 6: Handle Navigation from Push Notification

**Files:**
- Modify: `src/App.jsx` (add message listener in useEffect)

**Step 1: Add message listener**

Add this useEffect to `src/App.jsx`:

```javascript
useEffect(() => {
  if (!navigator.serviceWorker) return;

  // Listen for navigation messages from service worker
  const handleMessage = (event) => {
    if (event.data.type === 'NAVIGATE_TO_MESSAGE' && event.data.messageId) {
      // Set selected message and scroll to it
      setSelectedMessageId(event.data.messageId);
      // Close any open modals/drawers
      setShowChatDrawer(false);
      setShowActionModal(false);
    }
  };

  navigator.serviceWorker.addEventListener('message', handleMessage);
  return () => {
    navigator.serviceWorker.removeEventListener('message', handleMessage);
  };
}, []);
```

**Step 2: Commit**

```bash
git add src/App.jsx
git commit -m "feat: handle navigation from push notification clicks"
```

---

## Task 7: Add Notification Permission UI to Settings

**Files:**
- Modify: `src/components/SettingsPanel.jsx` (add notification toggle)

**Step 1: Add toggle UI**

Add this section to the settings panel (find or create the Settings component):

```javascript
const [notificationPermission, setNotificationPermission] = useState(
  Notification.permission
);

const handleNotificationToggle = async () => {
  if (notificationPermission === 'granted') {
    // Remove subscription
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    if (subscription) {
      await supabase
        .from('push_subscriptions')
        .delete()
        .match({ user_id: user.id, subscription: subscription.toJSON() });
      await subscription.unsubscribe();
      setNotificationPermission('denied');
    }
  } else {
    // Request permission and subscribe
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      await subscribeToPushNotifications();
      setNotificationPermission('granted');
    }
  }
};

// In JSX:
<div className="settings-section">
  <h3>Notifications</h3>
  <label className="notification-toggle">
    <input
      type="checkbox"
      checked={notificationPermission === 'granted'}
      onChange={handleNotificationToggle}
    />
    <span>Enable push notifications for action items</span>
  </label>
  {notificationPermission === 'denied' && (
    <p className="text-secondary">
      Notifications blocked. Enable in browser settings to receive alerts.
    </p>
  )}
</div>
```

**Step 2: Style the toggle**

Add to `src/components/SettingsPanel.css`:

```css
.settings-section {
  margin-bottom: 1.5rem;
  padding: 1rem;
  background-color: var(--bg-surface);
  border-radius: 8px;
}

.settings-section h3 {
  margin-top: 0;
  color: var(--text);
  font-size: 1rem;
}

.notification-toggle {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  cursor: pointer;
}

.notification-toggle input[type="checkbox"] {
  cursor: pointer;
}

.notification-toggle span {
  color: var(--text);
}
```

**Step 3: Commit**

```bash
git add src/components/SettingsPanel.jsx src/components/SettingsPanel.css
git commit -m "feat: add notification toggle to settings panel"
```

---

## Task 8: Add VAPID Keys to Environment

**Files:**
- Modify: `.env.local` (add VAPID key)

**Step 1: Generate VAPID keys**

Run (requires npm package `web-push`):
```bash
npm install -g web-push
web-push generate-vapid-keys
```
This outputs: `Public Key: ...` and `Private Key: ...`

**Step 2: Add to .env.local**

Add to `.env.local`:
```
VITE_VAPID_PUBLIC_KEY=<public-key-from-step-1>
```

**Step 3: Add to Supabase secrets**

In Supabase dashboard (Project Settings → Secrets), add:
```
FCM_SERVER_KEY=<your-fcm-key>  (get from Firebase Console)
```

Or for simpler setup, use Web Push Protocol directly (no Firebase needed). Skip FCM and use standard Web Push API.

**Step 4: Commit**

```bash
git add .env.local
git commit -m "chore: add vapid keys for web push notifications"
```

---

## Task 9: Update Message Status Change to "action_required"

**Files:**
- Verify: `src/App.jsx` or message update function (find where message status is updated)

**Step 1: Verify status update flow**

Search in App.jsx for where messages update their status. Ensure the update goes through Supabase:

```javascript
// This should already exist somewhere:
const updateMessageStatus = async (messageId, newStatus) => {
  const { error } = await supabase
    .from('messages')
    .update({ status: newStatus })
    .eq('id', messageId);

  if (error) {
    console.error('Failed to update message:', error);
  }
  // PostgreSQL trigger will fire automatically
};
```

**Step 2: Test locally**

- Update a message's status to "action_required" in the app
- Check browser console for any errors
- Verify Service Worker logs show push event received

**Step 3: No commit needed** (verify existing code works)

---

## Task 10: Manual Testing on Real Devices

**Files:**
- No new files, testing phase

**Step 1: Deploy to staging**

Run:
```bash
npm run build
# Deploy to Vercel or your hosting
```

**Step 2: Test on Android (Chrome)**

1. Open app on Android phone
2. Allow notifications when prompted
3. Open another window and update a message to "action_required"
4. Verify notification appears on lock screen
5. Click notification, verify it opens the message

**Step 3: Test on iOS PWA**

1. Install app to home screen (`Share → Add to Home Screen`)
2. Allow notifications when prompted
3. Close app (go to home)
4. Update message to "action_required" from another device/window
5. Verify notification appears (may take 10-30 seconds)
6. Tap notification, verify it opens the message

**Step 4: Test cleanup**

1. Disable notifications in settings
2. Verify `push_subscriptions` table is cleaned up in Supabase dashboard

**Step 5: Document any issues**

If any failures, note them for debugging.

---

## Testing Checklist

- [ ] Android Chrome: notification appears and clicks work
- [ ] iOS PWA: notification appears (if iOS 16.4+)
- [ ] Notification shows correct sender, subject, snippet
- [ ] Clicking notification opens correct message
- [ ] Disabling notifications removes subscription from DB
- [ ] Re-enabling works without prompting again
- [ ] Multiple notifications for different messages appear separately
- [ ] Old subscriptions auto-cleanup if push fails

---

## Rollback Plan

If issues occur:
1. Remove trigger: `DROP TRIGGER message_status_change_notify ON messages;`
2. Disable function call in Edge Function (comment out push loop)
3. Disable Service Worker listeners (comment out push/notificationclick)
4. Clear `push_subscriptions` table: `DELETE FROM push_subscriptions;`

