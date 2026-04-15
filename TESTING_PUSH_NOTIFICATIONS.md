# Push Notifications Testing Guide

## Prerequisites
- Dev server running on `http://localhost:5173`
- Real device (iOS or Android) or desktop browser with push support
- Two browser instances/devices (if possible) for multi-user testing

## Architecture Overview
1. **Frontend** (React): Requests notification permission → subscribes to push via Service Worker
2. **Service Worker**: Handles push events, displays notifications, routes clicks to message
3. **Database**: `push_subscriptions` table stores endpoints per user
4. **Edge Function**: `notify-action-required` triggered on message status change → sends Web Push to all subscribers

## Test Cases

### Test 1: Push Permission Request & Subscription
**Objective**: Verify users are prompted for notifications and subscription is saved

**Steps**:
1. Open app on device: `http://localhost:5173`
2. Login with test account
3. Observe browser permission prompt for "Notifications"
4. Grant permission
5. Check browser console for: `"Notifications enabled"` or `"Subscribed to push notifications"`

**Expected Result**:
- Permission dialog appears
- After grant, Supabase `push_subscriptions` table has new row with user_id
- Console shows successful subscription
- Settings panel shows notifications toggle ON

**How to Verify DB Entry**:
```sql
SELECT id, user_id, created_at FROM push_subscriptions
WHERE user_id = '[test-user-id]'
ORDER BY created_at DESC LIMIT 1;
```

---

### Test 2: Toggle Notifications in Settings
**Objective**: Verify users can enable/disable push notifications

**Steps**:
1. In Settings panel, locate "Enable Notifications" toggle
2. Toggle OFF
3. Observe: console should show `"Unsubscribed from push notifications"`
4. Refresh page
5. Verify toggle is still OFF (state persisted)
6. Toggle ON again
7. Observe: new subscription row created in database

**Expected Result**:
- Toggle persists across page reloads
- New subscription created when toggled ON
- Old subscription cleaned up when toggled OFF
- Console shows subscription/unsubscription messages

---

### Test 3: Push Notification Delivery on Status Change
**Objective**: Verify notifications are delivered when message status changes to "action_required"

**Setup**:
- Need two test accounts (or simulate with direct database access)
- Account A: receives the message
- Account B: (optional) monitor subscription

**Steps**:
1. As Account A, login and verify subscription created
2. Get a message ID from messages table
3. Update message status to "action_required" via:
   - **Via UI**: Click action button on message, select "Mark Action Required"
   - **Via Database** (for testing edge case):
     ```sql
     UPDATE messages
     SET action_status = 'action_required', old_status = 'pending'
     WHERE id = '[message-id]';
     ```
4. Monitor push notification delivery:
   - **Desktop**: Watch system notification tray
   - **Mobile**: Check notification center
   - **Console**: Check browser dev tools for network requests

**Expected Result**:
- System notification appears with title "Action Required"
- Notification body shows: `"[Sender Name]: [Subject]"`
- Notification has icon and two actions: "Open" and "Dismiss"

**Example Notification**:
```
[Action Required]
Ms Smith: Assignment Due Tomorrow
```

---

### Test 4: Notification Click Navigation
**Objective**: Verify clicking notification navigates to the message

**Steps**:
1. Close or minimize app on device
2. Trigger push notification (as in Test 3)
3. Click notification in system tray/notification center
4. Observe app behavior:
   - If app is closed: app should open and navigate to message
   - If app is open: message should scroll into view
5. Verify message ID in URL or message detail view matches the notification source

**Expected Result**:
- Click "Open" → navigates to `/messages/[message-id]`
- Click "Dismiss" → notification closes (no navigation)
- Message detail view loads and displays content

**How to Test with App Closed**:
1. Open app, subscribe to notifications
2. Minimize/close app completely
3. From another device/terminal, trigger status update
4. Click notification
5. App should reopen and show the message

---

### Test 5: Duplicate Notification Prevention
**Objective**: Verify the same message doesn't send duplicate notifications

**Steps**:
1. Update a message to "action_required"
2. Observe notification is received
3. Update the same message to another status
4. Update back to "action_required" again
5. Check if duplicate notification arrives

**Expected Result**:
- First status change → notification delivered
- Subsequent status changes to same status → NO new notification
- (Current implementation doesn't have full idempotency; this documents current behavior)

**Note**: Issue #8 in Edge Function is TODO for full idempotency prevention

---

### Test 6: Multi-User Notification Delivery
**Objective**: Verify all users with subscriptions receive notifications

**Setup**:
- Create 2-3 test accounts
- All should have active subscriptions

**Steps**:
1. Ensure all test accounts have subscriptions (verify in DB)
2. Update message status to "action_required"
3. Check each device/account for notification delivery

**Expected Result**:
- All subscribed users receive notification
- Each user sees their own notification
- No notifications sent to users without subscriptions

**Database Check**:
```sql
SELECT COUNT(*) as active_subscriptions
FROM push_subscriptions
WHERE deleted_at IS NULL;
```

---

### Test 7: Invalid Subscription Cleanup
**Objective**: Verify invalid subscriptions are removed automatically

**Setup**:
- Manually insert invalid subscription:
  ```sql
  INSERT INTO push_subscriptions (user_id, subscription)
  VALUES ('[user-id]', '{"endpoint":"https://invalid-endpoint.invalid","keys":{"p256dh":"key1","auth":"key2"}}');
  ```

**Steps**:
1. Trigger message status change to "action_required"
2. Edge Function attempts to send to all subscriptions
3. Invalid endpoint should fail, be cleaned up
4. Valid subscriptions continue working

**Expected Result**:
- Invalid subscription deleted from DB after failed push attempt
- Valid subscriptions still work
- Function returns: `"failed": 1` (for invalid sub)

---

### Test 8: Service Worker Registration Verification
**Objective**: Verify Service Worker is properly registered and active

**Steps**:
1. Open DevTools (F12)
2. Go to Application → Service Workers tab
3. Verify:
   - Service Worker is listed with URL `http://localhost:5173/service-worker.js`
   - Status shows "activated and running"
   - Scope is `/`

**Expected Result**:
```
Service Worker
URL: http://localhost:5173/service-worker.js
Status: activated and running
Scope: /
```

---

### Test 9: VAPID Key Validation
**Objective**: Verify VAPID public key is loaded in manifest

**Steps**:
1. Open DevTools → Application → Manifest tab
2. Look for manifest.webmanifest
3. Open Network tab, reload page
4. Check `manifest.webmanifest` request in Console or by inspecting PWA config

**Expected Result**:
- Web manifest loads successfully
- App is installable as PWA
- Push permission works (tied to VAPID key)

---

### Test 10: Offline Notification Handling
**Objective**: Verify notifications work even when network is degraded

**Steps**:
1. Open DevTools → Network tab
2. Set throttling to "Slow 3G" or offline
3. Trigger message status change
4. Edge Function should still send (server-side)
5. Notification should be queued/retried by browser/push service

**Expected Result**:
- Notification eventually delivered when network recovers
- No errors in browser console about subscription failure

---

## Debugging Checklist

If notifications aren't working:

### 1. Check Permissions
```javascript
// In browser console:
navigator.permissions.query({name:'notifications'}).then(r => console.log(r.state))
// Should print: "granted"
```

### 2. Check Service Worker
```javascript
// In browser console:
navigator.serviceWorker.getRegistration().then(r => {
  console.log('SW registered:', !!r);
  console.log('SW active:', !!r.active);
  console.log('SW scope:', r?.scope);
});
```

### 3. Check Subscription
```javascript
// In browser console:
navigator.serviceWorker.ready.then(r => {
  r.pushManager.getSubscription().then(sub => {
    console.log('Subscription:', sub);
    console.log('Endpoint:', sub?.endpoint);
  });
});
```

### 4. Check Database
```sql
-- Verify subscription was saved
SELECT id, user_id, created_at, subscription->>'endpoint' as endpoint
FROM push_subscriptions
WHERE user_id = '[current-user-id]';

-- Verify message status changes
SELECT id, action_status, created_at
FROM messages
ORDER BY created_at DESC LIMIT 5;
```

### 5. Check Edge Function Logs
```
Supabase Dashboard → Edge Functions → notify-action-required → Logs
Look for: successful sends, failed endpoints, error messages
```

### 6. Check Browser Console
- Look for "Notifications enabled" or "Failed to subscribe" messages
- Check for CORS errors
- Look for Service Worker registration errors

---

## Environment Requirements

For full testing, you need:

1. **Local Dev Server**
   ```bash
   npm run dev  # http://localhost:5173
   ```

2. **Real Device or Simulator**
   - Desktop: Chrome, Edge, Firefox, Safari (macOS 16+)
   - Mobile: iOS 16+ (Safari), Android 8+ (Chrome)

3. **Supabase Backend**
   - Push subscriptions table with RLS
   - notify-action-required Edge Function deployed
   - PostgreSQL trigger on message status changes

4. **VAPID Key Pair**
   - Public key in `.env.local` (VITE_VAPID_PUBLIC_KEY)
   - Private key in Supabase secrets (used by Edge Function)

---

## Expected Behavior Summary

| Action | Expected | Status |
|--------|----------|--------|
| Grant notification permission | Subscription saved to DB | ✓ Ready to test |
| Update message to "action_required" | Push notification delivered | ✓ Ready to test |
| Click notification "Open" | Navigate to message | ✓ Ready to test |
| Click notification "Dismiss" | Close without navigating | ✓ Ready to test |
| Toggle notifications OFF | Subscription removed | ✓ Ready to test |
| Toggle notifications ON (again) | New subscription created | ✓ Ready to test |

---

## Next Steps After Testing

1. **Deploy to Vercel** for public URL testing
2. **Add VAPID Private Key** to Supabase secrets
3. **Deploy Edge Functions** if not already deployed
4. **Test on Real Devices** (iOS, Android)
5. **Monitor Edge Function Logs** for any delivery failures

