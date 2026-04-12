# Action Status Feature - Testing Checklist
**Date:** 2026-04-12 | **Feature:** Message action status (pending/actioned/null)

## Pre-Test Setup
- [ ] Dev server running (`npm run dev`)
- [ ] Signed into Supabase with valid auth
- [ ] Browser console open (F12) to verify realtime logging
- [ ] Multiple browser tabs/windows open for multi-user testing (if possible)

## Unit Test Scenarios

### 1. Single Message State Transitions
- [ ] **From null → pending:** Click "✓ Needs Action" on unactioned message
  - Expected: Button toggles to show both "Needs Action" and "Mark Actioned"
  - Verify: action_status badge appears as "Pending"
  - Console: Should log `[Realtime] Message {id} action_status updated to: pending`

- [ ] **From pending → actioned:** Click "✓ Mark Actioned" on pending message
  - Expected: Only "Mark Actioned" button visible, action_status badge shows "Actioned"
  - Verify: Message moves to "Actioned" section in Actions box

- [ ] **From actioned → pending:** Click "✓ Needs Action" on actioned message
  - Expected: Both buttons visible again, badge shows "Pending"
  - Verify: Message moves back to "Pending" section

- [ ] **From pending/actioned → null:** Click button again to clear
  - Expected: Action status clears, message returns to default state

### 2. Actions Box Display
- [ ] **Pending section:**
  - Shows only messages with `action_status = 'pending'`
  - Sorted by `updated_at DESC` (newest first)
  - Empty state message displays if no pending messages

- [ ] **Actioned section:**
  - Shows only messages with `action_status = 'actioned'`
  - Sorted by `updated_at DESC`
  - Empty state message displays if no actioned messages

- [ ] **Section visibility:**
  - Both sections visible when they have messages
  - Sections hide when empty (or show empty state)

### 3. Action Status Badge
- [ ] **Badge appearance on message rows:**
  - Displays for messages with `action_status = 'pending'` (warning color/icon)
  - Displays for messages with `action_status = 'actioned'` (success color/icon)
  - Does NOT display for messages with `action_status = null`

### 4. Filtering & Search
- [ ] **Action filter dropdown:**
  - "All" — shows all messages regardless of action status
  - "Pending" — shows only pending messages
  - "Actioned" — shows only actioned messages
  - Filter persists across tab switches

- [ ] **Search with action status:**
  - Searching by text + action status filter works correctly
  - Example: Search for "math" with "Pending" filter only shows pending math-related messages

### 5. Realtime Multi-User Sync
- [ ] **Two browser tabs/windows (simulating different users):**
  - Update action status in Tab A
  - Observe status change appears immediately in Tab B without page refresh
  - Console logs show realtime update with action_status value

- [ ] **Toast notifications:**
  - Success toast appears after action status update
  - Correct message text for different state transitions

### 6. Edge Cases
- [ ] **Soft-deleted messages:**
  - Action status buttons don't appear for soft-deleted messages
  - Messages in Actions box don't appear if user deleted them

- [ ] **Rapid state changes:**
  - Click button multiple times quickly — UI stays consistent
  - No duplicate messages in state

- [ ] **Error handling:**
  - Network error during update → error toast appears
  - State reverts to previous value on error

### 7. Mobile Responsiveness (768px breakpoint)
- [ ] **Actions box on mobile:**
  - Sections stack vertically
  - Buttons are touch-friendly
  - Text doesn't overflow in constrained width

## Integration Test Scenarios

### 8. Database Integrity
- [ ] **Migrations applied:**
  - `action_status_enum` type exists in database
  - `messages.action_status` column has DEFAULT NULL
  - Index `idx_messages_action_status` exists

- [ ] **Data persistence:**
  - Refresh page → action statuses still visible
  - Close app → action statuses preserved in database

### 9. Realtime Subscription Verification
- [ ] **Schema compatibility:**
  - UPDATE payloads include `action_status` field
  - Logging confirms field is present in realtime events

## Manual Verification Steps

```bash
# Check migration was applied
git log supabase/migrations/ | grep "action_status"

# Verify schema.sql is updated
grep -n "action_status" supabase/schema.sql

# Check for any console errors
# (Open browser DevTools while performing state transitions)
```

## Known Limitations
- Multi-user testing requires 2+ authenticated users (invite a second user to test)
- Realtime subscription auto-unsubscribes when app backgrounded (PWA feature)

## Pass/Fail Criteria
✅ **PASS** if:
- All single user state transitions work
- Actions box displays pending/actioned sections correctly
- Action badges appear on message rows
- Realtime logging shows action_status in console
- No console errors during any operation
- Mobile layout is responsive

❌ **FAIL** if:
- Any state transition doesn't update UI
- Actions box shows incorrect messages
- Realtime updates don't sync to other tabs
- Console shows errors with action_status operations
- Mobile layout breaks at 768px
