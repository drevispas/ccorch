#!/bin/bash

###############################################################################
# CCOrch Load Testing Script
#
# Purpose: Run load tests using autocannon to validate performance under load
# Requirements: autocannon (installed as dev dependency)
# Usage: ./scripts/load-test.sh [test-name]
#
# Tests:
# - health: Health check endpoint
# - hook: UserPromptSubmit hook (workflow creation)
# - status: Workflow status query
# - all: Run all tests sequentially
###############################################################################

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

# Configuration
BASE_URL="${BASE_URL:-http://localhost:3000}"
CONNECTIONS="${CONNECTIONS:-10}"
DURATION="${DURATION:-30}"

# Check if server is running
check_server() {
    log_info "Checking if server is running at ${BASE_URL}..."
    if ! curl -s "${BASE_URL}/health" > /dev/null; then
        log_error "Server is not running at ${BASE_URL}"
        log_info "Start the server with: pnpm dev"
        exit 1
    fi
    log_success "Server is running"
}

# Test 1: Health check endpoint
test_health() {
    log_info "Running load test: Health Check"
    log_info "Target: ${BASE_URL}/health"
    log_info "Connections: ${CONNECTIONS}, Duration: ${DURATION}s"
    echo ""

    npx autocannon \
        -c ${CONNECTIONS} \
        -d ${DURATION} \
        -m GET \
        "${BASE_URL}/health"

    echo ""
    log_success "Health check load test complete"
}

# Test 2: UserPromptSubmit hook (workflow creation)
test_hook() {
    log_info "Running load test: UserPromptSubmit Hook"
    log_info "Target: ${BASE_URL}/hooks/user-prompt-submit"
    log_info "Connections: ${CONNECTIONS}, Duration: ${DURATION}s"
    echo ""

    # Create a temporary payload file
    PAYLOAD_FILE=$(mktemp)
    cat > ${PAYLOAD_FILE} <<EOF
{
  "hookName": "UserPromptSubmit",
  "userPrompt": "Load test workflow - implement user API",
  "conversationId": "load-test-{{INDEX}}",
  "timestamp": {{TIMESTAMP}}
}
EOF

    npx autocannon \
        -c ${CONNECTIONS} \
        -d ${DURATION} \
        -m POST \
        -H "Content-Type: application/json" \
        -i ${PAYLOAD_FILE} \
        "${BASE_URL}/hooks/user-prompt-submit"

    rm -f ${PAYLOAD_FILE}

    echo ""
    log_success "Hook load test complete"
}

# Test 3: Workflow status query
test_status() {
    log_info "Running load test: Workflow Status Query"
    log_info "Preparing test data..."

    # First create a workflow to query
    WORKFLOW_ID=$(curl -s -X POST "${BASE_URL}/hooks/user-prompt-submit" \
        -H "Content-Type: application/json" \
        -d '{
            "hookName": "UserPromptSubmit",
            "userPrompt": "Load test workflow for status query",
            "conversationId": "load-test-status-'$(date +%s)'",
            "timestamp": '$(date +%s%3N)'
        }' | jq -r '.workflowId')

    if [ -z "${WORKFLOW_ID}" ] || [ "${WORKFLOW_ID}" = "null" ]; then
        log_error "Failed to create workflow for testing"
        exit 1
    fi

    log_info "Created test workflow: ${WORKFLOW_ID}"
    log_info "Target: ${BASE_URL}/api/workflows/${WORKFLOW_ID}/status"
    log_info "Connections: ${CONNECTIONS}, Duration: ${DURATION}s"
    echo ""

    npx autocannon \
        -c ${CONNECTIONS} \
        -d ${DURATION} \
        -m GET \
        "${BASE_URL}/api/workflows/${WORKFLOW_ID}/status"

    echo ""
    log_success "Status query load test complete"
}

# Display usage
usage() {
    echo "Usage: $0 [test-name]"
    echo ""
    echo "Available tests:"
    echo "  health  - Load test health check endpoint"
    echo "  hook    - Load test UserPromptSubmit hook"
    echo "  status  - Load test workflow status query"
    echo "  all     - Run all tests sequentially"
    echo ""
    echo "Environment variables:"
    echo "  BASE_URL     - Server URL (default: http://localhost:3000)"
    echo "  CONNECTIONS  - Number of concurrent connections (default: 10)"
    echo "  DURATION     - Test duration in seconds (default: 30)"
    echo ""
    echo "Examples:"
    echo "  $0 health"
    echo "  CONNECTIONS=20 DURATION=60 $0 hook"
    echo "  BASE_URL=http://staging.example.com $0 all"
}

# Main execution
echo "================================================================================"
echo "  CCOrch Load Testing"
echo "================================================================================"
echo ""

# Check if autocannon is available
if ! npx autocannon --version > /dev/null 2>&1; then
    log_error "autocannon is not installed"
    log_info "Install with: pnpm install"
    exit 1
fi

# Check server availability
check_server

# Parse command line arguments
TEST_NAME="${1:-all}"

case "${TEST_NAME}" in
    health)
        test_health
        ;;
    hook)
        test_hook
        ;;
    status)
        test_status
        ;;
    all)
        log_info "Running all load tests..."
        echo ""
        test_health
        echo ""
        echo "---"
        echo ""
        test_hook
        echo ""
        echo "---"
        echo ""
        test_status
        ;;
    help|--help|-h)
        usage
        exit 0
        ;;
    *)
        log_error "Unknown test: ${TEST_NAME}"
        echo ""
        usage
        exit 1
        ;;
esac

echo ""
echo "================================================================================"
echo "  Load Testing Complete"
echo "================================================================================"
echo ""
log_info "Performance targets (PRD §8.1):"
echo "  - Hook response time: <500ms"
echo "  - API response time: <1s"
echo "  - Average latency should meet these targets under load"
echo ""
log_info "Review the results above to verify:"
echo "  - No 500 errors"
echo "  - Average latency meets targets"
echo "  - 99th percentile is acceptable"
echo ""
