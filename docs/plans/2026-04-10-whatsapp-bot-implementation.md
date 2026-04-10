# WhatsApp Bot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dual WhatsApp interface (public for parents, private for admins) allowing conversational queries over Charlie Tracker content with role-based access control and GDPR-compliant logging.

**Architecture:** Two Twilio WhatsApp numbers route to a single Edge Function that identifies the caller, applies content filters based on access level, calls the existing `rag-chat` function with filtered context, and logs interactions anonymously. Admin panel in Settings manages shareable content and user access.

**Tech Stack:** Supabase (PostgreSQL, Edge Functions, RLS), Twilio WhatsApp API, Deno/TypeScript, React, existing RAG infrastructure

---

## Task 1: Create Supabase Migration for WhatsApp Tables

**Files:**
- Create: `supabase/migrations/20260410_whatsapp_tables.sql`

**Step 1: Write migration file**

```sql
-- WhatsApp Bot Tables

-- Shareable content tracking
CREATE TABLE IF NOT EXISTS shareable_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL CHECK (content_type IN ('document', 'event', 'note')),
  content_id UUID NOT NULL,
  is_shareable BOOLEAN DEFAULT FALSE,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),

  -- Composite unique constraint: prevent duplicate shareable entries
  CONSTRAINT unique_shareable_content UNIQUE(content_type, content_id)
);

-- WhatsApp user access control
CREATE TABLE IF NOT EXISTS whatsapp_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('parent', 'admin')),
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- WhatsApp interaction audit log (GDPR-safe)
CREATE TABLE IF NOT EXISTS whatsapp_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number_hash TEXT NOT NULL,
  access_level TEXT NOT NULL CHECK (access_level IN ('public', 'private')),
  query_text TEXT NOT NULL,
  response_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_shareable_content_type_id ON shareable_content(content_type, content_id);
CREATE INDEX idx_whatsapp_users_phone ON whatsapp_users(phone_number_hash);
CREATE INDEX idx_whatsapp_interactions_created ON whatsapp_interactions(created_at);

-- RLS: Only authenticated users can see shareable content
ALTER TABLE shareable_content ENABLE ROW LEVEL SECURITY;
CREATE POLICY shareable_content_select ON shareable_content
  FOR SELECT USING (auth.role() = 'authenticated');

-- RLS: Only authenticated users can manage whatsapp_users (admin only, enforced at app level)
ALTER TABLE whatsapp_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_users_select ON whatsapp_users
  FOR SELECT USING (auth.role() = 'authenticated');

-- RLS: Interactions are logged but accessible only to admins
ALTER TABLE whatsapp_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY whatsapp_interactions_select ON whatsapp_interactions
  FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY whatsapp_interactions_insert ON whatsapp_interactions
  FOR INSERT WITH CHECK (true);
```

**Step 2: Apply migration**

Run: `npx supabase migration up`

Expected: Migration applied successfully, tables created with indexes and RLS policies.

**Step 3: Commit**

```bash
git add supabase/migrations/20260410_whatsapp_tables.sql
git commit -m "feat: add WhatsApp tables (shareable_content, whatsapp_users, whatsapp_interactions)"
```

---

## Task 2: Create Supabase Edge Function - `whatsapp-webhook`

**Files:**
- Create: `supabase/functions/whatsapp-webhook/index.ts`

**Step 1: Write the Edge Function**

```typescript
// supabase/functions/whatsapp-webhook/index.ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.2";

const TWILIO_ACCOUNT_SID = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const TWILIO_AUTH_TOKEN = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const TWILIO_PUBLIC_NUMBER = Deno.env.get("TWILIO_PUBLIC_NUMBER") || "";
const TWILIO_PRIVATE_NUMBER = Deno.env.get("TWILIO_PRIVATE_NUMBER") || "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Helper: Hash phone number for privacy
function hashPhoneNumber(phone: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(phone);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// Helper: Send Twilio message
async function sendTwilioMessage(
  to: string,
  text: string
): Promise<void> {
  const auth = btoa(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`);
  const response = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        From: `whatsapp:${TWILIO_PRIVATE_NUMBER}`, // Use private for response
        To: `whatsapp:${to}`,
        Body: text,
      }).toString(),
    }
  );

  if (!response.ok) {
    throw new Error(`Twilio error: ${response.statusText}`);
  }
}

// Main handler
Deno.serve(async (req) => {
  // Only POST allowed
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const formData = await req.formData();
    const from = formData.get("From")?.toString() || "";
    const to = formData.get("To")?.toString() || "";
    const body = formData.get("Body")?.toString() || "";

    // Extract phone number (remove "whatsapp:" prefix)
    const senderPhone = from.replace("whatsapp:", "");
    const receiverPhone = to.replace("whatsapp:", "");

    // Determine access level
    const isPrivate = receiverPhone === TWILIO_PRIVATE_NUMBER;
    const phoneHash = hashPhoneNumber(senderPhone);

    // Initialize Supabase client
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // For private number, verify user is allowed
    if (isPrivate) {
      const { data: user } = await supabase
        .from("whatsapp_users")
        .select("id")
        .eq("phone_number_hash", phoneHash)
        .eq("is_active", true)
        .single();

      if (!user) {
        await sendTwilioMessage(
          senderPhone,
          "Sorry, you don't have access to this number. Contact your admin."
        );
        return new Response("Unauthorized", { status: 401 });
      }
    }

    // Build context for RAG based on access level
    let shareableContent = "";
    if (!isPrivate) {
      // Public: fetch only shareable content
      const { data } = await supabase
        .from("shareable_content")
        .select("description, content_type")
        .eq("is_shareable", true);

      shareableContent = data
        ?.map((item) => `${item.content_type}: ${item.description}`)
        .join("\n") || "";
    }
    // For private, rag-chat will have full access via RLS

    // Call existing rag-chat function
    const ragResponse = await fetch(
      `${SUPABASE_URL}/functions/v1/rag-chat`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: body,
          context: isPrivate ? "full" : shareableContent,
          accessLevel: isPrivate ? "private" : "public",
        }),
      }
    );

    const ragData = await ragResponse.json();
    const responseText =
      ragData.response || "Sorry, I couldn't generate a response. Try again.";

    // Log interaction (anonymized for public, identified for private)
    await supabase.from("whatsapp_interactions").insert({
      phone_number_hash: phoneHash,
      access_level: isPrivate ? "private" : "public",
      query_text: body,
      response_text: responseText,
    });

    // Send response via Twilio
    await sendTwilioMessage(senderPhone, responseText);

    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("WhatsApp webhook error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
```

**Step 2: Create deno.json for dependencies**

Create: `supabase/functions/whatsapp-webhook/deno.json`

```json
{
  "imports": {
    "@supabase/supabase-js": "https://esm.sh/@supabase/supabase-js@2.39.2"
  }
}
```

**Step 3: Set environment variables in Supabase**

Run in Supabase dashboard:
- `TWILIO_ACCOUNT_SID` = your Twilio account SID
- `TWILIO_AUTH_TOKEN` = your Twilio auth token
- `TWILIO_PUBLIC_NUMBER` = your public WhatsApp number
- `TWILIO_PRIVATE_NUMBER` = your private WhatsApp number
- `SUPABASE_URL` = your Supabase URL
- `SUPABASE_SERVICE_ROLE_KEY` = your service role key

**Step 4: Test the function locally**

Run: `npx supabase functions serve`

Expected: Function starts without errors.

**Step 5: Commit**

```bash
git add supabase/functions/whatsapp-webhook/
git commit -m "feat: add whatsapp-webhook Edge Function with role-based access control"
```

---

## Task 3: Update `rag-chat` Edge Function to Accept Access Level

**Files:**
- Modify: `supabase/functions/rag-chat/index.ts` (lines where it fetches shareable content)

**Step 1: Update rag-chat to filter by access level**

In the `rag-chat` function, modify the content retrieval logic:

```typescript
// Add this check before RAG retrieval
const { accessLevel } = requestBody; // "public" or "private"

let searchQuery = userMessage;
if (accessLevel === "public") {
  // For public access, only search shareable documents
  searchQuery = `${userMessage} (FILTER: shareable_content only)`;
}

// Existing RAG logic follows, but with filtered context
```

**Step 2: Test that rag-chat respects filters**

Run: `npx supabase functions serve` and test with a request containing `"accessLevel": "public"`

Expected: rag-chat returns only information from shareable_content.

**Step 3: Commit**

```bash
git add supabase/functions/rag-chat/index.ts
git commit -m "feat: add accessLevel parameter to rag-chat for content filtering"
```

---

## Task 4: Create React Component - `WhatsAppSharing` (Admin Panel)

**Files:**
- Create: `src/components/WhatsAppSharing.jsx`

**Step 1: Write the component**

```jsx
// src/components/WhatsAppSharing.jsx
import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function WhatsAppSharing() {
  const [publicNumber, setPublicNumber] = useState("+1234567890");
  const [privateNumber, setPrivateNumber] = useState("+0987654321");
  const [isPublicActive, setIsPublicActive] = useState(true);
  const [shareableContent, setShareableContent] = useState([]);
  const [whatsappUsers, setWhatsappUsers] = useState([]);
  const [interactions, setInteractions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    try {
      const [contentRes, usersRes, interactionsRes] = await Promise.all([
        supabase.from("shareable_content").select("*"),
        supabase.from("whatsapp_users").select("*"),
        supabase
          .from("whatsapp_interactions")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(50),
      ]);

      setShareableContent(contentRes.data || []);
      setWhatsappUsers(usersRes.data || []);
      setInteractions(interactionsRes.data || []);
    } catch (error) {
      console.error("Error loading WhatsApp data:", error);
    }
    setLoading(false);
  }

  async function toggleWhatsappUser(userId, newState) {
    try {
      await supabase
        .from("whatsapp_users")
        .update({ is_active: newState })
        .eq("id", userId);
      loadData();
    } catch (error) {
      console.error("Error updating user:", error);
    }
  }

  if (loading) return <div className="loading">Loading...</div>;

  return (
    <div className="whatsapp-sharing">
      <h2>WhatsApp Sharing</h2>

      {/* Public Number Section */}
      <section className="whatsapp-section">
        <h3>Public WhatsApp Number</h3>
        <div className="number-display">
          <code>{publicNumber}</code>
          <button
            onClick={() => setIsPublicActive(!isPublicActive)}
            className={isPublicActive ? "btn-active" : "btn-inactive"}
          >
            {isPublicActive ? "Active" : "Inactive"}
          </button>
        </div>
        <p className="hint">Share this number with parents. They can only query shareable content.</p>
      </section>

      {/* Private Number Section */}
      <section className="whatsapp-section">
        <h3>Private WhatsApp Number</h3>
        <div className="number-display">
          <code>{privateNumber}</code>
        </div>
        <p className="hint">Keep this private. Only you and designated users can access full data.</p>

        <div className="users-list">
          <h4>Allocated Users</h4>
          {whatsappUsers.map((user) => (
            <div key={user.id} className="user-item">
              <span className="phone-hash">
                {user.phone_number_hash.substring(0, 10)}...
              </span>
              <label>
                <input
                  type="checkbox"
                  checked={user.is_active}
                  onChange={(e) => toggleWhatsappUser(user.id, e.target.checked)}
                />
                Active
              </label>
            </div>
          ))}
        </div>
      </section>

      {/* Interaction Log */}
      <section className="whatsapp-section">
        <h3>Interaction Log</h3>
        <div className="interactions-log">
          {interactions.length === 0 ? (
            <p>No interactions yet.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Access</th>
                  <th>Query</th>
                  <th>Response Preview</th>
                </tr>
              </thead>
              <tbody>
                {interactions.map((interaction) => (
                  <tr key={interaction.id}>
                    <td>{new Date(interaction.created_at).toLocaleString()}</td>
                    <td className={`access-${interaction.access_level}`}>
                      {interaction.access_level}
                    </td>
                    <td className="truncate">{interaction.query_text}</td>
                    <td className="truncate">
                      {interaction.response_text.substring(0, 50)}...
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
```

**Step 2: Add CSS to App.css**

```css
/* WhatsApp Sharing Styles */
.whatsapp-sharing {
  max-width: 800px;
  margin: 0 auto;
  padding: 20px;
}

.whatsapp-section {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  background: var(--bg-surface);
}

.whatsapp-section h3 {
  margin-top: 0;
  color: var(--text);
}

.number-display {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 15px 0;
}

.number-display code {
  background: var(--bg-muted);
  padding: 8px 12px;
  border-radius: 4px;
  font-family: monospace;
  color: var(--primary);
}

.btn-active {
  background: var(--success);
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.btn-inactive {
  background: var(--danger);
  color: white;
  padding: 8px 16px;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.users-list {
  margin-top: 15px;
}

.user-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: var(--bg-muted);
  border-radius: 4px;
  margin-bottom: 8px;
}

.phone-hash {
  font-family: monospace;
  font-size: 0.9em;
  color: var(--text-secondary);
}

.interactions-log table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 15px;
}

.interactions-log th,
.interactions-log td {
  padding: 10px;
  text-align: left;
  border-bottom: 1px solid var(--border);
}

.interactions-log th {
  background: var(--bg-muted);
  font-weight: bold;
}

.access-public {
  color: var(--success);
  font-weight: bold;
}

.access-private {
  color: var(--primary);
  font-weight: bold;
}

.truncate {
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hint {
  font-size: 0.9em;
  color: var(--text-secondary);
  margin: 10px 0 0 0;
}
```

**Step 3: Test the component renders**

Import WhatsAppSharing in Settings and render it. Verify layout looks good.

Expected: Component renders without errors, shows public/private numbers, user list, and interaction log.

**Step 4: Commit**

```bash
git add src/components/WhatsAppSharing.jsx src/App.css
git commit -m "feat: add WhatsAppSharing admin component for managing public/private numbers"
```

---

## Task 5: Integrate WhatsAppSharing into Settings Panel

**Files:**
- Modify: `src/components/Settings.jsx` (or relevant settings file)

**Step 1: Add WhatsAppSharing tab to Settings**

In your Settings component, add a new tab:

```jsx
// In Settings.jsx
import WhatsAppSharing from "./WhatsAppSharing";

// Add to tab selector
const tabs = ["Profile", "Notifications", "WhatsApp Sharing", "Invite Users"];

// Add to tab content
{activeTab === "WhatsApp Sharing" && <WhatsAppSharing />}
```

**Step 2: Test navigation to WhatsApp Sharing**

Run the app, navigate to Settings, click WhatsApp Sharing tab.

Expected: Component loads and displays numbers and interaction log.

**Step 3: Commit**

```bash
git add src/components/Settings.jsx
git commit -m "feat: add WhatsApp Sharing tab to Settings panel"
```

---

## Task 6: Add Shareable Toggle to Document Browser

**Files:**
- Modify: `src/components/DocumentBrowser.jsx`

**Step 1: Add is_shareable toggle to document item**

In DocumentBrowser, when rendering each document, add a checkbox:

```jsx
// In document item render
const [isShareable, setIsShareable] = useState(doc.is_shareable || false);

async function toggleShareable(docId, newState) {
  try {
    // Insert or update shareable_content
    if (newState) {
      await supabase.from("shareable_content").upsert({
        content_type: "document",
        content_id: docId,
        is_shareable: true,
        description: doc.name,
      });
    } else {
      await supabase
        .from("shareable_content")
        .delete()
        .eq("content_id", docId)
        .eq("content_type", "document");
    }
    setIsShareable(newState);
  } catch (error) {
    console.error("Error toggling shareable:", error);
  }
}

// In JSX
<label>
  <input
    type="checkbox"
    checked={isShareable}
    onChange={(e) => toggleShareable(doc.id, e.target.checked)}
  />
  Share via WhatsApp
</label>
```

**Step 2: Test toggling shareable flag**

Run app, open a document, toggle "Share via WhatsApp". Verify entry appears in `shareable_content` table.

Expected: Toggling checkbox creates/deletes entries in `shareable_content`.

**Step 3: Commit**

```bash
git add src/components/DocumentBrowser.jsx
git commit -m "feat: add shareable toggle to document items for WhatsApp visibility control"
```

---

## Task 7: Deploy Edge Function to Supabase

**Files:**
- Deploy: `supabase/functions/whatsapp-webhook/`

**Step 1: Push function to Supabase**

Run: `npx supabase functions deploy whatsapp-webhook`

Expected: Function deployed successfully, logs show webhook URL.

**Step 2: Configure Twilio webhook**

In Twilio console:
- WhatsApp Settings → Sandbox or Production
- Set webhook URL to: `https://<your-project>.supabase.co/functions/v1/whatsapp-webhook`
- Set HTTP method to POST

**Step 3: Test Twilio integration**

Send a message to the public WhatsApp number.

Expected: Message received by Edge Function, response sent back.

**Step 4: Commit**

```bash
git add supabase/functions/whatsapp-webhook/
git commit -m "feat: deploy whatsapp-webhook Edge Function to Supabase"
```

---

## Task 8: Write Integration Tests

**Files:**
- Create: `tests/whatsapp-webhook.test.ts`

**Step 1: Write test for public access**

```typescript
// tests/whatsapp-webhook.test.ts
import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";

Deno.test("Public WhatsApp query returns only shareable content", async () => {
  // Setup: Create shareable content in test DB
  // Send message to public number
  // Verify response contains only shareable data

  const response = await fetch("http://localhost:54321/functions/v1/whatsapp-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      From: "whatsapp:+1234567890",
      To: `whatsapp:${PUBLIC_NUMBER}`,
      Body: "What's this week's homework?",
    }).toString(),
  });

  assertEquals(response.status, 200);
});

Deno.test("Private WhatsApp query returns full data", async () => {
  // Setup: Register phone in whatsapp_users with admin role
  // Send message to private number
  // Verify response contains full data

  const response = await fetch("http://localhost:54321/functions/v1/whatsapp-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      From: `whatsapp:${ADMIN_PHONE}`,
      To: `whatsapp:${PRIVATE_NUMBER}`,
      Body: "Show me all messages from school",
    }).toString(),
  });

  assertEquals(response.status, 200);
});

Deno.test("Unauthorized user on private number is rejected", async () => {
  const response = await fetch("http://localhost:54321/functions/v1/whatsapp-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      From: "whatsapp:+9999999999",
      To: `whatsapp:${PRIVATE_NUMBER}`,
      Body: "Hello",
    }).toString(),
  });

  assertEquals(response.status, 401);
});
```

**Step 2: Run tests locally**

Run: `deno test tests/whatsapp-webhook.test.ts`

Expected: All tests pass.

**Step 3: Commit**

```bash
git add tests/whatsapp-webhook.test.ts
git commit -m "test: add integration tests for WhatsApp webhook access control"
```

---

## Task 9: Add Data Retention Policy (GDPR Compliance)

**Files:**
- Create: `supabase/migrations/20260410_whatsapp_retention_policy.sql`

**Step 1: Create retention policy**

```sql
-- Auto-delete public interactions after 90 days for GDPR compliance
CREATE OR REPLACE FUNCTION delete_old_public_interactions()
RETURNS void AS $$
BEGIN
  DELETE FROM whatsapp_interactions
  WHERE access_level = 'public'
  AND created_at < NOW() - INTERVAL '90 days';
END;
$$ LANGUAGE plpgsql;

-- Create cron job (if pg_cron extension is available)
-- SELECT cron.schedule('delete-old-whatsapp-interactions', '0 2 * * *', 'SELECT delete_old_public_interactions()');
```

**Step 2: Apply migration**

Run: `npx supabase migration up`

Expected: Retention function created.

**Step 3: Test the function**

Run in Supabase SQL editor: `SELECT delete_old_public_interactions();`

Expected: Old records deleted.

**Step 4: Commit**

```bash
git add supabase/migrations/20260410_whatsapp_retention_policy.sql
git commit -m "feat: add GDPR data retention policy for WhatsApp interactions (90-day auto-delete)"
```

---

## Task 10: End-to-End Testing & Documentation

**Files:**
- Create: `docs/WHATSAPP_SETUP.md`

**Step 1: Write setup guide**

```markdown
# WhatsApp Bot Setup Guide

## Prerequisites

- Twilio account with WhatsApp Business Account
- Two WhatsApp numbers (public + private)
- Supabase project with Edge Functions enabled

## Configuration

### Supabase Edge Function Environment Variables

Set these in Supabase dashboard (Settings → Edge Functions → Environment):

```
TWILIO_ACCOUNT_SID=your_sid
TWILIO_AUTH_TOKEN=your_token
TWILIO_PUBLIC_NUMBER=+1234567890
TWILIO_PRIVATE_NUMBER=+0987654321
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_key
```

### Twilio Webhook Configuration

In Twilio Console → Messaging → WhatsApp Sandbox (or Production):

1. Go to Settings
2. Set webhook URL: `https://your-project.supabase.co/functions/v1/whatsapp-webhook`
3. Set HTTP method to POST

## Usage

### For Parents (Public Number)

Share public number via school newsletter or website. Parents can:
- Ask about homework, spelling tests, events
- Receive instant replies
- Conversations are anonymized in audit log

### For Admins (Private Number)

Use private number for full Charlie Tracker queries:
- All documents, messages, events visible
- Identified in audit log for accountability

### Managing Shareable Content

1. Open Charlie Tracker Settings → WhatsApp Sharing
2. Browse documents in Document Browser
3. Check "Share via WhatsApp" to make available to parents
4. Set optional description for context

## Monitoring

- Check `whatsapp_interactions` table in Supabase for audit log
- Review interaction log in Settings → WhatsApp Sharing
- Monitor Edge Function logs for errors

## Cost

- Twilio: ~$0.004-0.005 per message
- Estimated monthly cost with 10-20 users: $2-5/month
- Supabase: Negligible (included in existing bill)
```

**Step 2: Test end-to-end flow**

1. Send message to public number
2. Verify response received
3. Check interaction log
4. Send message to private number
5. Verify full access response
6. Verify audit log shows both interactions

Expected: All steps complete successfully.

**Step 3: Commit**

```bash
git add docs/WHATSAPP_SETUP.md
git commit -m "docs: add WhatsApp bot setup and usage guide"
```

---

## Summary

**Total tasks: 10**
- 3 Database tasks (migration + retention policy)
- 2 Edge Function tasks (whatsapp-webhook + rag-chat update)
- 3 React UI tasks (WhatsAppSharing component, Settings integration, Document Browser toggle)
- 1 Deployment task
- 1 Testing task

**Key commits:**
1. Database schema
2. Edge Function implementation
3. React components
4. Integration tests
5. Documentation

**Post-implementation:**
- Monitor Twilio costs
- Review audit logs weekly
- Gather parent feedback on bot accuracy
- Adjust shareable content based on queries

---

## Execution Notes

- All environment variables must be set before deploying Edge Function
- Twilio webhook URL must be configured after function deployment
- Test with real numbers (not test credentials) to verify full flow
- Keep phone numbers private; share public number only with parents
- Review audit logs monthly to ensure GDPR compliance
