# Mobile Attachments Viewer + Per-User Soft Delete Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enable in-app attachment viewing on mobile (PDFs/images in modal) and implement per-user soft deletion so messages are hidden only from the deleting user.

**Architecture:** Soft delete uses `message_deletions` table + RLS policy to hide messages per user at database level. Attachment viewer detects file type and opens PDFs/images in modal, other types download. Two independent features with no cross-dependencies.

**Tech Stack:** React 18, Supabase (Auth + RLS), Postgres, pdfjs-dist, CSS for modal

---

## Task 1: Create message_deletions Table in Supabase

**Files:**
- Modify: Supabase SQL Editor (via dashboard)

**Step 1: Create the table via SQL**

Go to Supabase dashboard → SQL Editor → New Query. Run:

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

Expected: Table created, indices created, no errors.

**Step 2: Enable RLS on message_deletions table**

In Supabase dashboard, go to message_deletions table → RLS tab → Enable RLS

Expected: RLS toggled on (appears enabled in UI)

**Step 3: Create RLS policy for message_deletions**

In RLS tab, click "New Policy" and select "Create a policy from scratch":

```sql
CREATE POLICY "users_can_manage_own_deletions" ON message_deletions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

Expected: Policy created and showing in RLS tab

**Step 4: Commit (git)**

```bash
cd /c/Users/david/charlie-tracker/.worktrees/attachments-soft-delete
git add -A
git commit -m "database: create message_deletions table with RLS policy"
```

---

## Task 2: Update RLS Policy on messages Table

**Files:**
- Modify: Supabase SQL Editor (existing messages table RLS)

**Step 1: Add policy to filter soft-deleted messages**

In Supabase dashboard, go to messages table → RLS tab. Find the existing SELECT policy and verify it exists. Create a new SELECT policy:

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

Expected: Policy created. When a user has deleted a message, that message won't appear in their SELECT queries.

**Step 2: Test policy (manual verification)**

- Login as User A in the app
- See messages list
- Login as User B in the app (different browser/incognito)
- Both users see same messages initially
- User A deletes a message → Check User A's list (message gone)
- Check User B's list in other browser (message still there)

Expected: Message hidden for A only, visible for B

**Step 3: Commit**

```bash
git add -A
git commit -m "database: add RLS policy to filter soft-deleted messages"
```

---

## Task 3: Create AttachmentViewer Component

**Files:**
- Create: `src/components/AttachmentViewer.jsx`
- Create: `src/components/AttachmentViewer.css`

**Step 1: Create AttachmentViewer.jsx component**

```javascript
// src/components/AttachmentViewer.jsx
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import * as pdfjsLib from 'pdfjs-dist';
import './AttachmentViewer.css';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

export function AttachmentViewer({ attachment, isOpen, onClose }) {
  const [fileData, setFileData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [pdfPages, setPdfPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [error, setError] = useState(null);

  const isImage = attachment?.mime_type?.includes('image');
  const isPdf = attachment?.mime_type?.includes('pdf');

  // Fetch file from storage
  useEffect(() => {
    if (!isOpen || !attachment) return;

    const fetchFile = async () => {
      try {
        setLoading(true);
        setError(null);
        const { data, error: fetchError } = await supabase.storage
          .from('charlie-documents')
          .download(attachment.file_path);

        if (fetchError) throw fetchError;

        if (isImage) {
          const url = URL.createObjectURL(data);
          setFileData(url);
        } else if (isPdf) {
          const arrayBuffer = await data.arrayBuffer();
          const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
          setFileData(pdf);
          setPdfPages(pdf.numPages);
          setCurrentPage(1);
        }
      } catch (err) {
        console.error('Error loading attachment:', err);
        setError('Failed to load file');
      } finally {
        setLoading(false);
      }
    };

    fetchFile();
  }, [isOpen, attachment, isImage, isPdf]);

  // Handle keyboard close
  useEffect(() => {
    const handleEsc = (e) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="attachment-viewer-overlay" onClick={onClose}>
      <div className="attachment-viewer-modal" onClick={(e) => e.stopPropagation()}>
        <button className="viewer-close-btn" onClick={onClose}>✕</button>

        {loading && <div className="viewer-loading">Loading...</div>}
        {error && <div className="viewer-error">{error}</div>}

        {isImage && fileData && (
          <div className="viewer-image">
            <img src={fileData} alt={attachment.filename} />
          </div>
        )}

        {isPdf && fileData && (
          <div className="viewer-pdf">
            <PDFPage pdf={fileData} pageNum={currentPage} />
            <div className="pdf-controls">
              <button
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
              >
                ← Previous
              </button>
              <span>{currentPage} / {pdfPages}</span>
              <button
                disabled={currentPage === pdfPages}
                onClick={() => setCurrentPage(Math.min(pdfPages, currentPage + 1))}
              >
                Next →
              </button>
            </div>
          </div>
        )}

        <div className="viewer-filename">{attachment.filename}</div>
      </div>
    </div>
  );
}

// PDF page renderer component
function PDFPage({ pdf, pageNum }) {
  const [imageUrl, setImageUrl] = useState(null);

  useEffect(() => {
    pdf.getPage(pageNum).then((page) => {
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;

      page.render({
        canvasContext: canvas.getContext('2d'),
        viewport: viewport,
      }).promise.then(() => {
        setImageUrl(canvas.toDataURL());
      });
    });
  }, [pdf, pageNum]);

  return imageUrl ? <img src={imageUrl} alt="PDF page" className="pdf-page" /> : <div>Rendering...</div>;
}
```

**Step 2: Create AttachmentViewer.css**

```css
/* src/components/AttachmentViewer.css */
.attachment-viewer-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.attachment-viewer-modal {
  position: relative;
  background: white;
  border-radius: 12px;
  max-width: 90vw;
  max-height: 90vh;
  overflow: auto;
  display: flex;
  flex-direction: column;
}

.viewer-close-btn {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(0, 0, 0, 0.6);
  color: white;
  border: none;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  font-size: 24px;
  cursor: pointer;
  z-index: 1001;
  transition: background 0.2s;
}

.viewer-close-btn:hover {
  background: rgba(0, 0, 0, 0.8);
}

.viewer-image {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.viewer-image img {
  max-width: 100%;
  max-height: 80vh;
  object-fit: contain;
}

.viewer-pdf {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px;
}

.pdf-page {
  max-width: 100%;
  max-height: 70vh;
  object-fit: contain;
  margin-bottom: 16px;
}

.pdf-controls {
  display: flex;
  gap: 16px;
  align-items: center;
  justify-content: center;
}

.pdf-controls button {
  padding: 8px 16px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.pdf-controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.viewer-filename {
  padding: 12px 20px;
  background: #f5f5f5;
  border-top: 1px solid #ddd;
  font-size: 14px;
  color: #666;
  text-align: center;
  word-break: break-all;
}

.viewer-loading,
.viewer-error {
  padding: 40px;
  text-align: center;
  font-size: 16px;
}

.viewer-error {
  color: #dc3545;
}

/* Mobile optimization */
@media (max-width: 480px) {
  .attachment-viewer-modal {
    max-width: 100vw;
    max-height: 100vh;
    border-radius: 0;
  }

  .viewer-close-btn {
    width: 48px;
    height: 48px;
    font-size: 28px;
  }

  .pdf-controls {
    flex-wrap: wrap;
  }
}
```

**Step 3: Install pdfjs-dist**

```bash
cd /c/Users/david/charlie-tracker/.worktrees/attachments-soft-delete
npm install pdfjs-dist
```

Expected: Package installed, no errors

**Step 4: Commit**

```bash
git add src/components/AttachmentViewer.jsx src/components/AttachmentViewer.css package.json package-lock.json
git commit -m "feat: add AttachmentViewer component for PDFs and images"
```

---

## Task 4: Update App.jsx - Add openAttachmentViewer Function

**Files:**
- Modify: `src/App.jsx:10-15` (add import)
- Modify: `src/App.jsx:50-60` (add state)
- Modify: `src/App.jsx:402-420` (add function)

**Step 1: Add import for AttachmentViewer**

At the top of `src/App.jsx`, add:

```javascript
import { AttachmentViewer } from './components/AttachmentViewer';
```

**Step 2: Add state for attachment viewer**

In the `App()` component function, after other useState calls (around line 50), add:

```javascript
const [viewerAttachment, setViewerAttachment] = useState(null);
const [viewerOpen, setViewerOpen] = useState(false);
```

**Step 3: Add openAttachmentViewer function**

After `downloadAttachment()` function (around line 420), add:

```javascript
function openAttachmentViewer(attachment) {
  setViewerAttachment(attachment);
  setViewerOpen(true);
}
```

**Step 4: Add AttachmentViewer component to render**

At the end of the component's JSX (before closing div), add:

```javascript
<AttachmentViewer
  attachment={viewerAttachment}
  isOpen={viewerOpen}
  onClose={() => setViewerOpen(false)}
/>
```

**Step 5: Test component renders**

```bash
npm run dev
```

Expected: App starts without errors, no console warnings about missing component

**Step 6: Commit**

```bash
git add src/App.jsx
git commit -m "feat: add attachment viewer state and function to App.jsx"
```

---

## Task 5: Update Attachment Click Handlers in App.jsx

**Files:**
- Modify: `src/App.jsx` (two locations with attachment.map)

**Step 1: Update first attachment click handler (messages)**

Find the code around line 949-955 that looks like:

```javascript
{msg.attachments.map((att) => (
  <button
    key={att.id}
    className="attachment-link"
    onClick={() =>
      downloadAttachment(att.file_path, att.filename)
    }
```

Change to:

```javascript
{msg.attachments.map((att) => (
  <button
    key={att.id}
    className="attachment-link"
    onClick={() => openAttachmentViewer(att)}
```

**Step 2: Update second attachment click handler (events)**

Find the code around line 695-700 that looks like:

```javascript
onClick={(e) => {
  e.stopPropagation();
  downloadAttachment(
    att.file_path,
    att.filename,
  );
}}
```

Change to:

```javascript
onClick={(e) => {
  e.stopPropagation();
  openAttachmentViewer(att);
}}
```

**Step 3: Test in browser**

```bash
npm run dev
```

- Click an attachment → Modal should open with file
- ESC key → Modal should close
- Click X button → Modal should close

Expected: Viewer opens/closes correctly

**Step 4: Commit**

```bash
git add src/App.jsx
git commit -m "feat: wire up openAttachmentViewer to attachment buttons"
```

---

## Task 6: Update deleteMessage Function for Soft Delete

**Files:**
- Modify: `src/App.jsx:244-266` (deleteMessage function)

**Step 1: Replace deleteMessage implementation**

Find the `deleteMessage()` function and replace it with:

```javascript
async function deleteMessage(msgId) {
  if (!window.confirm("Delete this message from your view?"))
    return;
  try {
    // Insert soft delete record
    const { error } = await supabase
      .from("message_deletions")
      .insert({ user_id: user.id, message_id: msgId });

    if (error) throw error;

    // Update local state
    setMessages((prev) => prev.filter((m) => m.id !== msgId));
    addToast("Message deleted from your view", "success");
  } catch (err) {
    console.error("Error deleting message:", err);
    addToast("Failed to delete message", "error");
  }
}
```

**Step 2: Test soft delete**

```bash
npm run dev
```

- Login as User A
- See a message
- Click "Delete" on that message → Should disappear from A's view
- Open new browser/incognito and login as User B
- Same message should still be visible to User B

Expected: Message hidden for A only, visible for B

**Step 3: Commit**

```bash
git add src/App.jsx
git commit -m "feat: convert hard delete to soft delete for messages"
```

---

## Task 7: Update loadMessages Query (Optional Verification)

**Files:**
- Read: `src/App.jsx` (check loadMessages function)

**Step 1: Verify RLS policy handles filtering**

The RLS policy on messages table already filters soft-deleted messages. When you call:

```javascript
const { data } = await supabase.from("messages").select(...);
```

Supabase automatically applies the RLS policy. The soft-deleted messages won't appear in results.

**Step 2: No code changes needed**

The query works as-is because RLS is enforced at database level, not in the app.

**Step 3: Commit**

```bash
git add -A
git commit -m "docs: verified RLS policy handles message deletion filtering"
```

---

## Task 8: Manual Testing - Multi-User Soft Delete

**Files:**
- No code changes

**Step 1: Test scenario**

```
1. Open app in Browser 1, login as user@example.com (User A)
2. See messages list
3. Note a specific message (e.g., from teacher)
4. Open app in Browser 2 (incognito), login as other-user@example.com (User B)
5. See same messages list
6. In Browser 1: Click "Delete" on the message
7. Verify: Message gone from Browser 1's view
8. In Browser 2: Refresh the page
9. Verify: Message still visible to User B
10. In Browser 2: Click "Delete" on the message
11. Verify: Message gone from Browser 2's view
```

Expected: All steps pass - message hidden per user, not globally deleted

**Step 2: Test attachment viewer**

```
1. In Browser 1, logged in as User A
2. Find a message with a PDF attachment
3. Click the attachment
4. Verify: PDF opens in modal
5. Click ESC key
6. Verify: Modal closes
7. Click attachment again
8. Click X button
9. Verify: Modal closes
10. Find a message with an image attachment
11. Click the image
12. Verify: Image opens in lightbox
13. Test next/previous buttons if multiple images
```

Expected: All attachment types open correctly

**Step 3: Document results**

Record any issues found. If tests fail, document what failed and why.

---

## Task 9: Final Integration Test

**Files:**
- No code changes

**Step 1: Full user flow test**

```
1. Start app: npm run dev
2. Login with test account
3. See messages and events
4. Click various attachments → Verify they open
5. Delete a message → Verify it's hidden
6. Login as different user (different browser)
7. Verify deleted message is still visible
8. Navigate between tabs (messages, events, documents)
9. No console errors
```

Expected: All features work together, no errors

**Step 2: Mobile testing**

```
1. Resize browser to 320px width
2. Tap an attachment → Viewer opens full-screen
3. Viewer displays correctly on mobile
4. Can scroll PDF pages
5. Close button accessible
```

Expected: Mobile experience smooth

**Step 3: Commit (if any test fixes needed)**

```bash
git add -A
git commit -m "test: verified multi-user soft delete and attachment viewer"
```

---

## Summary of Changes

- **Database:** Created `message_deletions` table with RLS policy
- **Database:** Updated messages RLS to filter soft-deleted messages
- **Frontend:** Created `AttachmentViewer` component with PDF.js and image viewer
- **Frontend:** Added `openAttachmentViewer` state and function
- **Frontend:** Updated attachment click handlers to use viewer
- **Frontend:** Converted `deleteMessage` from hard delete to soft delete
- **Dependencies:** Added `pdfjs-dist`

---

## Expected Outcomes

1. ✅ Users can delete messages from their own view only
2. ✅ Other users still see deleted messages
3. ✅ PDFs open in modal on all devices
4. ✅ Images open in lightbox on all devices
5. ✅ Other file types download as before
6. ✅ No breaking changes to existing features

---

## Testing Checklist

- [ ] Soft delete works per-user (A deletes, B still sees)
- [ ] PDF attachment opens in modal
- [ ] Image attachment opens in lightbox
- [ ] Word/other file downloads
- [ ] Modal closes with ESC key
- [ ] Modal closes with X button
- [ ] Mobile viewer full-screen
- [ ] No console errors
- [ ] Build succeeds: `npm run build`
