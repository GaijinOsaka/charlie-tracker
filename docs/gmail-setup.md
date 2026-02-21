# Gmail Integration Setup Guide

**Status:** Reference for implementation phase
**Purpose:** Step-by-step instructions for setting up Gmail OAuth2 in n8n

---

## Overview

The Gmail scraper workflow will connect to your Gmail account via OAuth2 to fetch school emails and sync them to Supabase. This guide covers the setup process.

## Step 1: Create Gmail API Project (Google Cloud Console)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project: `Charlie-Tracker-Gmail`
3. Enable APIs:
   - Navigate to "APIs & Services" → "Library"
   - Search for "Gmail API"
   - Click "Enable"
4. Create OAuth2 Credentials:
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth client ID"
   - Application type: "Web application"
   - Authorized redirect URIs:
     ```
     https://n8n.cloud/rest/oauth2/callback  (if using n8n Cloud)
     OR
     http://localhost:5678/rest/oauth2/callback  (if self-hosted)
     ```
   - Save Client ID & Client Secret

## Step 2: Add Gmail Credential in n8n

1. Open n8n workflow editor
2. Click "Credentials" (in left sidebar)
3. Create new credential:
   - Type: `Gmail`
   - Name: `Gmail OAuth2`
   - Authentication: `OAuth2`
   - Client ID: [from Google Cloud Console]
   - Client Secret: [from Google Cloud Console]
   - Scopes:
     ```
     https://www.googleapis.com/auth/gmail.readonly
     https://www.googleapis.com/auth/gmail.modify
     ```
4. Click "Sign in with Google" to authorize
5. Grant permission when prompted

## Step 3: Create Gmail Node in Workflow

**Node Type:** `Gmail`
**Operation:** `Get Messages`

**Configuration:**
```
Credentials: Gmail OAuth2
Return all: true
Filters:
  - From: (school email domain, e.g., @archbishop-cranmer.co.uk)
  - Is unread: true (optional, for first sync set to false)
  - Has attachment: (optional, only emails with attachments)
```

**Output Format:**
```json
{
  "id": "gmail_message_id",
  "from": "mr.smith@school.co.uk",
  "subject": "Homework Assignment Update",
  "snippet": "Please ensure your child completes...",
  "internalDate": "1708520400000",
  "payload": {
    "headers": [...],
    "parts": [...]
  }
}
```

## Step 4: Deduplication Code Node

**Purpose:** Check if Arbor message already exists before inserting

```javascript
// Extract email details
const email = $input.first().json;

// Convert Gmail timestamp (ms) to ISO string
const receivedAt = new Date(parseInt(email.internalDate)).toISOString();

// Extract email address from "Name <email@domain.com>" format
const senderEmail = email.from.match(/<(.+?)>/)?.[1] || email.from;
const senderName = email.from.match(/^(.+?)</)?.[1]?.trim() || email.from;

// Normalize subject (remove "Re:", "Fwd:", etc.)
const normalizedSubject = email.subject
  .replace(/^(Re|Fwd):\s*/i, '')
  .trim();

return {
  email_id: email.id,
  from: senderEmail,
  sender_name: senderName,
  subject: normalizedSubject,
  snippet: email.snippet,
  received_at: receivedAt,
  gmail_timestamp: email.internalDate
};
```

## Step 5: Deduplication Lookup (Supabase Query)

**Purpose:** Check if Arbor message already exists

```javascript
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

const email = $input.first().json;

// Check Supabase for existing Arbor message
const response = await fetch(`${supabaseUrl}/rest/v1/messages`, {
  method: 'GET',
  headers: {
    'apikey': supabaseKey,
    'Authorization': `Bearer ${supabaseKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    select: 'id',
    eq: {
      source: 'arbor',
      sender_email: email.from,
      subject: email.subject
    },
    limit: 1
  })
});

const result = await response.json();

if (result.length > 0) {
  // Arbor message exists, skip this email
  return {
    skip: true,
    reason: 'Arbor message already exists'
  };
}

// Email is unique, proceed with insert
return {
  skip: false,
  email: email
};
```

## Step 6: Insert to Supabase (Conditional)

**Purpose:** Only insert if email is unique

**Configuration:**
```
Operation: Insert
Table: messages
Data:
  source: "gmail"
  source_id: {{ $input.json.email.id }}
  subject: {{ $input.json.email.subject }}
  content: {{ $input.json.email.snippet }}
  sender_name: {{ $input.json.email.senderName }}
  sender_email: {{ $input.json.email.senderEmail }}
  received_at: {{ $input.json.email.receivedAt }}
  category_id: null  (Will be auto-categorized)
  is_read: false
```

## Gmail API Rate Limits

- **Free tier:** 1,000,000 requests/day
- **Expected usage:** ~500-1,000 requests/day
- **Conclusion:** No rate limiting needed

## Troubleshooting

### "Gmail: Invalid Credentials"
- Check Client ID & Secret are correct
- Verify OAuth2 flow completed
- Check Google Cloud Console APIs are enabled

### "Permission Denied"
- Verify scopes include `gmail.readonly` + `gmail.modify`
- Re-authorize by creating new credential

### "No emails found"
- Check email filter is correct (domain name)
- Try searching all emails first (remove filters)
- Check Gmail account actually has emails from that sender

### Email shows twice (not deduplicated)
- Check Arbor message has exact same subject
- Check email arrived within 5 minutes of Arbor message
- Verify deduplication code is running before INSERT

---

## Testing

### Test 1: Fetch Emails
1. Run Gmail node in isolation
2. Verify emails are returned
3. Check email format matches expected structure

### Test 2: Deduplication
1. Manually create a Supabase message with source='arbor'
2. Run Gmail workflow
3. Verify the duplicate email was skipped (check sync_log)

### Test 3: End-to-End
1. Send test email to your Gmail from school account
2. Run full workflow
3. Check Supabase messages table for new email
4. Verify React dashboard shows it within 1 second

