#!/bin/bash

# WhatsApp Webhook Test Runner
# Runs all test suites with appropriate permissions

set -e

echo "╔═════════════════════════════════════════════════╗"
echo "║  WhatsApp Webhook Test Suite                    ║"
echo "╚═════════════════════════════════════════════════╝"
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test 1: Basic Unit Tests
echo -e "${BLUE}Running Unit Tests...${NC}"
deno test --allow-env --allow-net whatsapp_webhook.test.ts
echo -e "${GREEN}✓ Unit tests passed${NC}"
echo ""

# Test 2: Integration Tests (Logic & Mocks)
echo -e "${BLUE}Running Integration Tests...${NC}"
deno test --allow-env integration-tests.ts
echo -e "${GREEN}✓ Integration tests passed${NC}"
echo ""

# Test 3: End-to-End Tests (if env vars are set)
if [ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo -e "${BLUE}Running End-to-End Tests...${NC}"
    deno test --allow-env --allow-net end-to-end-tests.ts
    echo -e "${GREEN}✓ End-to-end tests passed${NC}"
else
    echo -e "${BLUE}End-to-End Tests Skipped${NC}"
    echo "  (Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to run)"
fi
echo ""

# Summary
echo "╔═════════════════════════════════════════════════╗"
echo "║  All Tests Completed Successfully! ✓            ║"
echo "╚═════════════════════════════════════════════════╝"
echo ""
echo "Test Coverage:"
echo "  • HTTP Interface (CORS, methods, parameters)"
echo "  • Authorization (hashing, access levels)"
echo "  • Message Handling (validation, encoding)"
echo "  • Error Handling (failures, fallbacks)"
echo "  • Privacy (anonymization, security)"
echo "  • Integration (RAG chat, database)"
echo ""
echo "Next steps:"
echo "  1. Deploy the webhook to Supabase"
echo "  2. Configure Twilio webhooks to point to deployed function"
echo "  3. Monitor interactions in whatsapp_interactions table"
echo ""
