# WhatsApp Bot Setup & Usage Guide

This guide covers everything needed to deploy and operate the Charlie Tracker WhatsApp Bot — a dual-number system providing public homework help and private admin access.

## Overview

The WhatsApp Bot uses Twilio's WhatsApp Business API to:
- **Public Number**: Answer parent questions about homework, events, and documents (anonymized)
- **Private Number**: Provide admins full access to all Charlie Tracker content (identified)
- **RAG Search**: Intelligent responses powered by document embeddings and Claude AI
- **GDPR Compliance**: Automatic deletion of public interactions after 90 days

## Prerequisites

### Accounts & Credentials

1. **Twilio Account**
   - Sign up at [twilio.com](https://www.twilio.com)
   - Upgrade to paid account ($0.02-0.05/month minimum)
   - Enable WhatsApp Business Account
   - Credentials needed:
     - Account SID (`TWILIO_ACCOUNT_SID`)
     - Auth Token (`TWILIO_AUTH_TOKEN`)
     - Phone numbers (public and private)

2. **Supabase Project**
   - Project must be deployed (not local)
   - Edge Functions enabled
   - Database schema with WhatsApp tables
   - Service role key for Edge Functions

3. **Two WhatsApp Numbers**
   - Public number: shared with parents/community (e.g., school helpline)
   - Private number: restricted to admin access (e.g., staff group)
   - Both must be registered with Twilio WhatsApp Business Account

## Setup Steps

### Step 1: Create Twilio WhatsApp Business Account

#### 1.1 Register WhatsApp Business Account

```
1. Log in to Twilio Console
2. Navigate to Messaging → WhatsApp
3. Click "Get Started"
4. Complete WhatsApp Business Account registration:
   - Business name: "Charlie Tracker" (or your school name)
   - Business category: "Education"
   - Display name: shown to parents
   - Business address, phone, website
5. Accept WhatsApp's terms of service
```

#### 1.2 Verify Business Account

WhatsApp may require:
- Business phone number verification
- Official documentation
- Website verification
- Processing time: 2-5 business days

#### 1.3 Request Phone Numbers

Once verified:
```
1. In Twilio → WhatsApp → Phone Numbers
2. Click "Request Phone Numbers"
3. Select your country
4. Request 2 numbers:
   - Public number: for parent access
   - Private number: for admin access
5. Wait for approval (usually < 24 hours)
```

### Step 2: Configure Supabase Environment Variables

In **Supabase Dashboard → Settings → Edge Functions → Environment variables**, add:

```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PUBLIC_NUMBER=+1234567890
TWILIO_PRIVATE_NUMBER=+0987654321
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

**Security Note:** Never commit these to git. Keep tokens in Supabase/environment only.

### Step 3: Deploy Edge Functions

All Edge Functions should already be deployed. Verify in Supabase:

```
Supabase Dashboard → Edge Functions
✓ whatsapp-webhook (receives messages)
✓ rag-chat (generates AI responses)
✓ extract-dates (finds event dates)
✓ index-document (embeds documents)
```

If not deployed:
```bash
supabase functions deploy whatsapp-webhook
supabase functions deploy rag-chat
supabase functions deploy extract-dates
supabase functions deploy index-document
```

### Step 4: Configure Twilio Webhook

In **Twilio Console → Messaging → WhatsApp Sandbox** (or Production):

#### 4.1 For Public Number

```
1. Navigate to: Messaging → WhatsApp → Phone Numbers
2. Select your public number
3. Under "Message Setup":
   - Enable "Webhooks"
   - Set "When a message comes in":
     https://your-project.supabase.co/functions/v1/whatsapp-webhook
   - HTTP Method: POST
   - Leave "Disable SSL certificate verification" UNCHECKED
4. Save
```

#### 4.2 For Private Number

Repeat Step 4.1 for your private number.

### Step 5: Test Connectivity

#### 5.1 Send Test Message to Public Number

From any WhatsApp account:
```
Send to public number: "test"
Expected response: Falls back message or RAG response
```

Check Supabase logs:
```sql
-- Verify webhook received the message
SELECT * FROM whatsapp_interactions
WHERE created_at > NOW() - INTERVAL '1 minute'
ORDER BY created_at DESC LIMIT 1;
```

#### 5.2 Send Test Message to Private Number

From an authorized admin account:
```
Send to private number: "test"
Expected response: Full RAG response
```

Check audit log:
```sql
-- Verify interaction logged with private access
SELECT * FROM whatsapp_interactions
WHERE access_level = 'private'
ORDER BY created_at DESC LIMIT 1;
```

#### 5.3 Verify RAG Responses

Test with real queries:
```
Public:  "What's the homework?"
         → Should search documents, respond based on public content

Private: "Show me all events"
         → Should respond with full calendar access
```

## Configuration

### Twilio Settings

#### Changing Phone Numbers

To use different numbers:
```bash
# Update Supabase environment variables
TWILIO_PUBLIC_NUMBER=+new_public_number
TWILIO_PRIVATE_NUMBER=+new_private_number
```

#### Adjusting Message Rate Limits

The webhook handles up to 100 messages/second. For higher volumes, increase Supabase compute.

#### Sandbox vs Production

- **Sandbox**: Free, messages from test numbers only
- **Production**: Paid, real WhatsApp users
- Switch in Twilio Console → WhatsApp settings

### Charlie Tracker Settings

#### Manage Shareable Content

1. Open **Settings → WhatsApp Sharing**
2. Browse **Documents** in document browser
3. Check "Share via WhatsApp" to make available to public
4. Add optional description for context:
   - "Year 5 Maths Curriculum"
   - "School Events Calendar"
   - "Parent Handbook"

#### Authorization

Private number access controlled by `whatsapp_users` table:

```sql
-- Add authorized user
INSERT INTO whatsapp_users (
  phone_number_hash,
  is_active,
  added_by
) VALUES (
  SHA256('+1234567890'),
  true,
  'admin@school.com'
);

-- Revoke access
UPDATE whatsapp_users
SET is_active = false
WHERE phone_number_hash = SHA256('+1234567890');
```

## Monitoring & Maintenance

### View Interaction Log

In **Supabase → whatsapp_interactions**:

```sql
-- Recent messages
SELECT
  created_at,
  phone_number_hash,
  access_level,
  query_text,
  response_text
FROM whatsapp_interactions
ORDER BY created_at DESC
LIMIT 50;

-- Messages by user
SELECT
  phone_number_hash,
  access_level,
  COUNT(*) as messages,
  MAX(created_at) as last_message
FROM whatsapp_interactions
GROUP BY phone_number_hash, access_level
ORDER BY last_message DESC;
```

### Check Data Retention

```sql
-- Public interactions eligible for deletion (90 days)
SELECT COUNT(*) FROM whatsapp_interactions
WHERE access_level = 'public'
  AND created_at < NOW() - INTERVAL '90 days';

-- View deletion log
SELECT * FROM gdpr_deletion_log
ORDER BY execution_timestamp DESC
LIMIT 10;
```

### Monitor Edge Function Logs

In **Supabase Dashboard → Edge Functions → whatsapp-webhook**:
- Check error logs for webhook failures
- Monitor response times (should be < 2 seconds)
- Look for rate limiting or timeout errors

### Monitor Costs

#### Twilio Costs
- Inbound message: $0.0075
- Outbound message: $0.005
- Estimated for 10-20 users, 50-100 messages/day: **$2-5/month**

Track in:
- Twilio Console → Account → Billing
- Set up alerts at $10/month to catch spikes

#### Supabase Costs
- WhatsApp integration uses negligible compute
- Included in existing Supabase plan

### Resolve Common Issues

#### Webhook Not Receiving Messages

```
Problem: Sending message to WhatsApp number but no response
Solution:
1. Verify webhook URL in Twilio Console is correct
2. Check Supabase Edge Function logs for errors
3. Ensure function returns 200 OK response
4. Test connectivity: curl https://your-project.supabase.co/functions/v1/whatsapp-webhook
```

#### Slow Responses

```
Problem: Users wait > 3 seconds for response
Solution:
1. Check RAG chat timeout (max 5 seconds)
2. Verify document index is up to date
3. Review Supabase performance metrics
4. Consider increasing function memory if available
```

#### Authorization Errors

```
Problem: Private number says "you're not authorized"
Solution:
1. Verify phone number is in whatsapp_users table
2. Check is_active = true
3. Confirm phone number hash matches (SHA256 format)
4. Check audit log for which phone hash received message
```

## User Guide

### For Parents (Public Number)

**How to use:**
1. Save public number to contacts: "Charlie Tracker Bot"
2. Send WhatsApp message with question
3. Receive response within 30 seconds

**Example queries:**
- "What's next week's homework?"
- "When's the next school event?"
- "How do I report a concern?"
- "What documents are available?"

**Limitations:**
- Only sees shareable content marked by admins
- Responses anonymized in audit log
- No conversation history (stateless)

### For Admins (Private Number)

**How to use:**
1. Save private number to contacts: "Charlie Tracker Admin"
2. Send WhatsApp message with query
3. Receive response with full access

**Example queries:**
- "List all events this month"
- "Show me Mrs. Smith's messages"
- "Export attendance records"
- "Who hasn't responded to the survey?"

**Capabilities:**
- Full document and message access
- Identified in audit log
- Ideal for admin-to-admin queries

### Privacy & Data

**Public messages:**
- Anonymized (phone number hashed)
- Deleted after 90 days automatically
- Shared only with RAG system for response

**Private messages:**
- Identified by phone number
- Retained indefinitely (audit purposes)
- Only visible to Charlie Tracker admins

## Troubleshooting

### Testing Locally

Run integration tests without live Twilio:

```bash
cd supabase/functions/whatsapp-webhook
deno test --allow-env integration-tests.ts
```

### Enable Debug Logging

In `whatsapp-webhook/index.ts`, uncomment:
```typescript
console.log('[WhatsApp]', 'message received:', phoneHash, accessLevel);
```

### Reset to Sandbox

To test without real WhatsApp:
```
1. Twilio Console → WhatsApp → Sandbox
2. Copy public/private numbers from sandbox
3. Update TWILIO_PUBLIC_NUMBER and TWILIO_PRIVATE_NUMBER
4. Test with sandbox numbers only
```

## Deployment Checklist

- [ ] Twilio WhatsApp Business Account created and verified
- [ ] Two phone numbers requested and approved
- [ ] Supabase environment variables configured
- [ ] Edge Functions deployed
- [ ] Webhook URLs configured in Twilio
- [ ] Test message to public number succeeds
- [ ] Test message to private number succeeds
- [ ] Interaction logged in whatsapp_interactions table
- [ ] Response contains expected content
- [ ] Audit log shows correct access level
- [ ] No errors in Edge Function logs
- [ ] Costs monitored in Twilio Console

## Support

### Common Questions

**Q: Can we use one number for both public and private?**
A: Yes, but not recommended. Authorization based on caller ID, not number. Using two numbers is clearer for users.

**Q: How many concurrent messages can we handle?**
A: Up to 100/second on standard Supabase. Contact Supabase for higher limits.

**Q: Can we archive messages?**
A: Yes, `whatsapp_interactions` can be exported and archived after 90 days (public) or manually.

**Q: What happens if RAG chat fails?**
A: Fallback message sent to user. Error logged. Webhook still returns 200 OK.

**Q: Can we customize the fallback message?**
A: Yes, edit in `whatsapp-webhook/index.ts` in the fallback response handler.

### Getting Help

- **Twilio Issues**: [Twilio Support](https://support.twilio.com)
- **Supabase Issues**: [Supabase Docs](https://supabase.com/docs)
- **Charlie Tracker Issues**: Check project README

## Next Steps

1. **Week 1**: Set up Twilio account and phone numbers
2. **Week 2**: Configure Supabase and deploy Edge Functions
3. **Week 3**: Test end-to-end with real users
4. **Week 4**: Gather feedback and adjust shareable content

---

**Last Updated:** April 11, 2026
**Status:** Production Ready
**Version:** 1.0
