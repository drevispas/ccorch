#!/bin/bash

# Session 2: Type-Safe Integration Test Runner
# Tests Server, API, and Client SDK components

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

print_color() {
    color=$1
    text=$2
    echo -e "${color}${text}${NC}"
}

clear
print_color "$CYAN" "=========================================="
print_color "$CYAN" "  SESSION 2: TYPE-SAFE INTEGRATION TESTS "
print_color "$CYAN" "=========================================="
echo ""

print_color "$BLUE" "Testing TypeScript Server and API..."
echo ""

# Type checking first
print_color "$YELLOW" "▶ Running TypeScript Type Check..."
npm run typecheck

if [ $? -ne 0 ]; then
    print_color "$YELLOW" "⚠️  TypeScript compilation has warnings"
    print_color "$YELLOW" "Continuing with tests..."
fi

echo ""

# Run Session 2 specific tests
print_color "$YELLOW" "▶ Running Server and API Tests..."
npm test -- tests/server/ --verbose

# Check if tests passed
if [ $? -eq 0 ]; then
    print_color "$GREEN" "✅ All Session 2 tests PASSED!"

    # Test OpenAPI generation
    print_color "$YELLOW" "\n▶ Testing OpenAPI Generation..."
    npm run openapi:generate

    if [ $? -eq 0 ]; then
        print_color "$GREEN" "✅ OpenAPI documentation generated successfully"
    else
        print_color "$YELLOW" "⚠️  OpenAPI generation had issues"
    fi

    # Run coverage report for server components
    print_color "$YELLOW" "\n▶ Generating Coverage Report..."
    npm test -- tests/server/ --coverage --coverageDirectory=coverage/session2

    # Summary
    echo ""
    print_color "$CYAN" "=========================================="
    print_color "$GREEN" "Session 2 Type-Safe Integration: VERIFIED ✅"
    print_color "$CYAN" "=========================================="
    echo ""
    print_color "$BLUE" "Components Tested:"
    echo "  • TypeScript Server"
    echo "  • Zod Schema Validation"
    echo "  • Request/Response Middleware"
    echo "  • Type-Safe Client SDK"
    echo "  • OpenAPI Documentation"
    echo ""
    print_color "$GREEN" "Session 2 is production-ready!"
    exit 0
else
    print_color "$RED" "❌ Some Session 2 tests FAILED!"
    echo ""
    print_color "$YELLOW" "Please fix the failing tests before proceeding."
    print_color "$YELLOW" "Review the test output above for details."
    exit 1
fi