#!/bin/bash

# Session 1: State Management Test Runner
# Tests EventDrivenStateManager and EventBus components

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
print_color "$CYAN" "  SESSION 1: STATE MANAGEMENT TESTS      "
print_color "$CYAN" "=========================================="
echo ""

print_color "$BLUE" "Testing EventDrivenStateManager and EventBus..."
echo ""

# Run Session 1 specific tests
print_color "$YELLOW" "▶ Running State Management Tests..."
npm test -- tests/state/ --verbose

# Check if tests passed
if [ $? -eq 0 ]; then
    print_color "$GREEN" "✅ All Session 1 tests PASSED!"

    # Run coverage report for state components
    print_color "$YELLOW" "\n▶ Generating Coverage Report..."
    npm test -- tests/state/ --coverage --coverageDirectory=coverage/session1

    # Summary
    echo ""
    print_color "$CYAN" "=========================================="
    print_color "$GREEN" "Session 1 State Management: VERIFIED ✅"
    print_color "$CYAN" "=========================================="
    echo ""
    print_color "$BLUE" "Components Tested:"
    echo "  • EventDrivenStateManager"
    echo "  • EventBus"
    echo "  • State Persistence (Redis/SQLite)"
    echo "  • State Migration Utilities"
    echo ""
    print_color "$GREEN" "Session 1 is ready for integration!"
    exit 0
else
    print_color "$RED" "❌ Some Session 1 tests FAILED!"
    echo ""
    print_color "$YELLOW" "Please fix the failing tests before proceeding."
    print_color "$YELLOW" "Review the test output above for details."
    exit 1
fi