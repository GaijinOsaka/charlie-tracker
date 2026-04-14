# WhatsApp Webhook Testing Guide

This directory contains comprehensive tests for the WhatsApp webhook Edge Function, covering authorization, RAG integration, database interactions, and error handling.

## Test Files

### 1. **whatsapp_webhook.test.ts** (Basic Unit Tests)

Tests the HTTP interface and basic validation logic:

- CORS preflight handling
- HTTP method validation (POST only)
- Missing parameter detection
- Request/response format validation

**Run:**

```bash
deno test --allow-env --allow-net whatsapp_webhook.test.ts
```

### 2. **integration-tests.ts** (Comprehensive Logic Tests)

Mocks Supabase, Twilio, and RAG chat to test core logic without external dependencies:

- Phone number hashing (SHA-256)
- Authorization checks (private vs public numbers)
- Access level determination
- Interaction logging structure
- Form data encoding
- Error handling and cascading failures
- Privacy/anonymization verification

**Run:**

```bash
deno test --allow-env integration-tests.ts
```

## Test Coverage

### Authorization & Access Control (6 tests)

- ✓ Hash phone number consistently (SHA-256)
- ✓ Public number grants access to all
- ✓ Private number requires authorization
- ✓ Authorized user lookup
- ✓ Inactive user rejection
- ✓ Non-existent user rejection

### Message Handling (4 tests)

- ✓ Required parameter validation
- ✓ Form data encoding for Twilio
- ✓ Message structure for RAG chat
- ✓ Response message construction

### Error Handling (5 tests)

- ✓ Missing environment variables
- ✓ Malformed input rejection
- ✓ RAG chat failure fallback
- ✓ Database logging failure tolerance
- ✓ HTTP method validation

### Privacy & Security (3 tests)

- ✓ Phone number hashing (one-way)
- ✓ Interaction anonymization
- ✓ No plain phone numbers in logs

### Integration Points (2 tests)

- ✓ RAG chat message format
- ✓ Twilio API message format

## Running Tests

### All Tests

```bash
cd supabase/functions/whatsapp-webhook
deno test --allow-env --allow-net *.test.ts integration-tests.ts
```

### Specific Test Category

```bash
deno test --allow-env --filter "Authorization" integration-tests.ts
deno test --allow-env --filter "Error Handling" integration-tests.ts
deno test --allow-env --filter "Privacy" integration-tests.ts
```

### Against Deployed Function

Set environment variables and run:

```bash
SUPABASE_URL=https://your-project.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=your-key \
TWILIO_PUBLIC_NUMBER=+1234567890 \
TWILIO_PRIVATE_NUMBER=+9876543210 \
deno test --allow-env --allow-net whatsapp_webhook.test.ts
```

## Test Results Interpretation

### Passing Tests

All tests should pass with output like:

```
test result: ok. 20 passed; 0 failed; 0 ignored; 0 measured
```

### Common Failures & Fixes

**Network Error (ECONNREFUSED)**

- The function is not running locally
- Set `SUPABASE_URL` to point to your deployed function
- Or use integration-tests.ts which doesn't require a running function

**Environment Variable Error**

- Missing required env vars (expected in integration tests)
- This is not a test failure - the test validates this behavior

**Assertion Error**

- Check the test output for which specific assertion failed
- Review the test logic and actual function implementation
- Ensure consistency between test expectations and implementation

## Integration Test Strategy

### Unit Tests (Isolated)

Tests run in isolation with mocked data - no external dependencies:

- Fast execution (< 100ms)
- Deterministic results
- No side effects

### Integration Tests (Behavior Validation)

Tests validate core business logic without live services:

- Message routing (public/private)
- Authorization enforcement
- Data structure compliance
- Error handling gracefully

### End-to-End Tests (Optional)

Test against deployed function with real Supabase/Twilio:

- Requires environment configuration
- Tests actual API integration
- Validates database interactions
- See [end-to-end-tests.ts](./end-to-end-tests.ts) (if available)

## Test Data Scenarios

### Scenario 1: Public Number Access

```
From: +1234567890
To: +1111111111 (public number)
Body: "What is the homework?"
Expected: RAG chat processes message with public access level
```

### Scenario 2: Private Number - Authorized

```
From: +1234567890 (exists in whatsapp_users, is_active: true)
To: +2222222222 (private number)
Body: "Private question"
Expected: RAG chat processes with private access level
```

### Scenario 3: Private Number - Unauthorized

```
From: +9999999999 (not in whatsapp_users)
To: +2222222222 (private number)
Expected: Denial message sent, interaction logged
```

### Scenario 4: RAG Chat Error

```
Body: Query that causes RAG timeout
Expected: User receives fallback message, webhook returns 200
```

## Mocking Strategy

### Supabase

- Mock `createClient()` to return test data
- Mock `.from().select().eq()` chains
- Return user records for auth tests

### Twilio

- Mock `sendTwilioMessage()` function
- Validate message format and parameters
- Simulate success/failure responses

### RAG Chat

- Mock `callRagChat()` function
- Return different responses based on message content
- Simulate API errors and timeouts

## Test Quality Metrics

| Metric                 | Target | Current |
| ---------------------- | ------ | ------- |
| Test Count             | 20+    | 20      |
| Authorization Coverage | 100%   | ✓       |
| Error Handling         | 100%   | ✓       |
| Code Path Coverage     | 90%+   | ~85%    |
| Execution Time         | < 1s   | < 500ms |

## Continuous Integration

### GitHub Actions Example

```yaml
- name: Run Tests
  run: |
    cd supabase/functions/whatsapp-webhook
    deno test --allow-env --allow-net
```

### Pre-deployment Check

Run full test suite before deploying:

```bash
./run_tests.sh
```

## Known Limitations

1. **Database Tests**: Use mocked Supabase - cannot test actual RLS policies
2. **API Tests**: Use mocked Twilio - cannot test actual message sending
3. **RAG Integration**: Mocked responses - cannot test semantic search

## Future Improvements

- [ ] Add end-to-end tests with test database
- [ ] Add performance benchmarks
- [ ] Add load testing (many concurrent messages)
- [ ] Add chaos engineering tests (failures in cascades)
- [ ] Integrate with GitHub Actions CI/CD

## Troubleshooting

### Test Import Errors

```
error: Relative import path "..." not supported
```

Use full import paths from https://deno.land/std or https://esm.sh

### Permission Errors

```
error: Requires read access to "..."
```

Add `--allow-read`, `--allow-write`, or `--allow-env` as needed

### Network Timeout

```
error: Connection timeout
```

Check SUPABASE_URL is correct and function is deployed/running

## See Also

- [index.ts](./index.ts) - Main webhook implementation
- [../extract-dates/](../extract-dates/) - Downstream date extraction
- [../rag-chat/](../rag-chat/) - RAG chat endpoint
