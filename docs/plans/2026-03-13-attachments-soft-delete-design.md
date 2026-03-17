# Mobile Attachments Viewer + Per-User Soft Delete Design

> **Status:** Design approved, ready for implementation

**Goal:** Enable in-app attachment viewing on mobile (PDFs/images in modal) and allow users to delete messages from their own view without affecting other users.

**Architecture:** Two independent features - attachment viewer modal for mobile UX, and soft-delete tracking via `message_deletions` table with RLS policies for per-user visibility.

**Tech Stack:** React 18, Supabase (Auth + RLS), Postgres, pdfjs-dist

---

## Feature 1: Attachment Viewer Modal

### Design

When users click an attachment on mobile:

- **PDFs & Images:** Open in in-app modal/lightbox (full-screen on mobile, centered on desktop)
- **Other types:** Download as before

### Components

- New: `AttachmentViewer.jsx` - Modal component
  - PDF rendering via `pdfjs-dist`
  - Image lightbox with next/prev navigation
  - Mobile-optimized full-screen layout
  - Close: ESC key or button

### Frontend Changes

In `App.jsx`:

1. Add `openAttachmentViewer(attachment)` function
2. Update attachment click handlers to call viewer instead of download
3. Add dependency: `pdfjs-dist`

### Logic

```javascript
openAttachmentViewer(attachment) {
  // Check mime_type
  // If PDF: render with pdfjs
  // If image: show in lightbox
  // Else: fall back to downloadAttachment()
}
```

---

## Feature 2: Per-User Soft Delete

### Database Schema

**New table: `message_deletions`**

```sql
CREATE TABLE message_deletions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  deleted_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, message_id)
);

CREATE INDEX idx_message_deletions_user ON message_deletions(user_id);
CREATE INDEX idx_message_deletions_message ON message_deletions(message_id);
```

**Updated RLS Policy on `messages` table**

```sql
CREATE POLICY "users_see_non_deleted_messages" ON messages
  FOR SELECT
  USING (
    auth.uid() IN (SELECT shared_with FROM messages WHERE id = messages.id)
    AND NOT EXISTS (
      SELECT 1 FROM message_deletions
      WHERE user_id = auth.uid() AND message_id = messages.id
    )
  );
```

This ensures:

- User A deletes message → Hidden from A only
- User B doesn't delete same message → Still visible to B
- Database enforces visibility at query level

**Admin visibility (optional enhancement):**
Create view `messages_with_deletion_info` showing deletion metadata for admins.

### Frontend Changes

**Update `deleteMessage()` function:**
Replace hard delete (`.delete()`) with soft delete insert:

```javascript
async function deleteMessage(msgId) {
  if (!window.confirm("Delete this message from your view?")) return;
  try {
    const { error } = await supabase
      .from("message_deletions")
      .insert({ user_id: user.id, message_id: msgId });
    if (error) throw error;

    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    addToast("Message deleted from your view", "success");
  } catch (err) {
    console.error("Error deleting message:", err);
    addToast("Failed to delete message", "error");
  }
}
```

**Toast wording:** Change to "Message deleted from your view" to clarify it's not deleted globally.

**No query changes needed:** RLS policy automatically filters results - existing `loadMessages()` works as-is.

### Behavior

- Related events and attachments are NOT soft-deleted (only message)
- Message stays in database with deletion tracking
- Other users can still see message, events, and attachments
- Admins can see deleted messages with deletion metadata

---

## Data Flow

**User A deletes a message:**

1. Clicks "Delete" button
2. Confirms: "Delete this message from your view?"
3. Inserts row into `message_deletions` (user_id=A, message_id=X)
4. RLS policy excludes message from A's queries
5. Frontend filters message from state
6. Toast: "Message deleted from your view"

**User B views same message:**

- No deletion record for (B, X)
- RLS policy allows view
- Message still visible with all events/attachments

**User clicks attachment:**

1. Handler calls `openAttachmentViewer(att)`
2. Checks `att.mime_type`
3. PDF/image: Fetch and render in modal
4. Other: Download via `downloadAttachment()`
5. Modal closes on ESC or button click

---

## Testing Plan

### Soft Delete Tests

- [ ] User A deletes message → Not visible to A
- [ ] Same message still visible to User B
- [ ] User B deletes same message → Not visible to B
- [ ] Message not visible to either user after both delete
- [ ] Events/attachments persist for all users
- [ ] Admin can see both deletions with metadata

### Attachment Viewer Tests

- [ ] Click PDF → Opens in modal with pdfjs viewer
- [ ] Click image → Opens in lightbox (next/prev nav)
- [ ] Click Word/Excel → Downloads (fallback)
- [ ] ESC key closes modal
- [ ] Works on mobile (320px-480px) and desktop (1024px+)
- [ ] Mobile viewer full-screen optimized

---

## Implementation Tasks

1. Create `message_deletions` table in Supabase
2. Update RLS policy on `messages` table
3. Create `AttachmentViewer.jsx` component
4. Update `deleteMessage()` in App.jsx
5. Add `openAttachmentViewer()` function
6. Update attachment click handlers
7. Add `pdfjs-dist` dependency
8. Test per-user deletion flow
9. Test attachment viewer on mobile

---

## Notes

- Soft delete preserves data integrity for multi-user scenarios
- RLS enforces deletions at database level (secure, not app-level)
- Attachment viewer improves mobile UX without breaking desktop
- No breaking changes to existing message/event data
- Admin bypass provides audit trail capability
