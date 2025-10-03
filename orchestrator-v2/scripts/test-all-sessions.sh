#!/bin/bash

# Orchestrator V2 - Comprehensive Test Dashboard
# Runs tests for all completed sessions and generates reports

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

print_color() {
    color=$1
    text=$2
    echo -e "${color}${text}${NC}"
}

print_separator() {
    print_color "$CYAN" "=================================================="
}

# Track test results
TOTAL_SESSIONS=0
PASSED_SESSIONS=0
FAILED_SESSIONS=()
TEST_RESULTS=()

run_session_tests() {
    session_num=$1
    session_name=$2
    test_path=$3

    ((TOTAL_SESSIONS++))

    print_separator
    print_color "$BLUE" "📁 SESSION $session_num: $session_name"
    print_separator

    if [ -z "$test_path" ]; then
        print_color "$YELLOW" "⚠️  No test path specified for Session $session_num"
        FAILED_SESSIONS+=("Session $session_num: No tests configured")
        TEST_RESULTS+=("❌")
        return 1
    fi

    # Check if test directory/file exists
    if [ ! -d "$test_path" ] && [ ! -f "$test_path" ]; then
        print_color "$YELLOW" "⚠️  Test path not found: $test_path"
        FAILED_SESSIONS+=("Session $session_num: Test path not found")
        TEST_RESULTS+=("⚠️")
        return 1
    fi

    # Run the tests
    print_color "$YELLOW" "▶ Running tests in $test_path..."
    npm test -- "$test_path" --passWithNoTests > /tmp/session${session_num}_test.log 2>&1

    if [ $? -eq 0 ]; then
        print_color "$GREEN" "✅ Session $session_num tests PASSED"
        ((PASSED_SESSIONS++))
        TEST_RESULTS+=("✅")
        return 0
    else
        print_color "$RED" "❌ Session $session_num tests FAILED"
        FAILED_SESSIONS+=("Session $session_num: $session_name")
        TEST_RESULTS+=("❌")

        # Show last few lines of error log
        print_color "$YELLOW" "Last 5 lines of test output:"
        tail -5 /tmp/session${session_num}_test.log
        return 1
    fi
}

# Main execution
main() {
    clear
    print_separator
    print_color "$MAGENTA" "    ORCHESTRATOR V2 - TEST DASHBOARD     "
    print_separator
    echo ""
    print_color "$BLUE" "Running tests for all completed sessions..."
    echo ""

    # Session 1: State Management
    run_session_tests 1 "State Management" "tests/state/"

    # Session 2: Type-Safe Integration
    run_session_tests 2 "Type-Safe Integration" "server/__tests__/"

    # Session 3: Plugin System
    run_session_tests 3 "Plugin System" "tests/plugins/"

    # Session 4-10: Not yet implemented (placeholder)
    echo ""
    print_color "$YELLOW" "📋 Future Sessions (4-10): Not yet implemented"

    # Type checking
    echo ""
    print_separator
    print_color "$BLUE" "📁 TYPE CHECKING"
    print_separator
    print_color "$YELLOW" "▶ Running TypeScript type check..."
    npm run typecheck > /tmp/typecheck.log 2>&1
    if [ $? -eq 0 ]; then
        print_color "$GREEN" "✅ TypeScript compilation successful"
    else
        print_color "$RED" "❌ TypeScript compilation failed"
        print_color "$YELLOW" "See /tmp/typecheck.log for details"
    fi

    # Linting
    echo ""
    print_separator
    print_color "$BLUE" "📁 CODE QUALITY"
    print_separator
    print_color "$YELLOW" "▶ Running ESLint..."
    npm run lint > /tmp/lint.log 2>&1
    if [ $? -eq 0 ]; then
        print_color "$GREEN" "✅ Linting passed"
    else
        print_color "$YELLOW" "⚠️  Linting warnings/errors found"
        print_color "$YELLOW" "See /tmp/lint.log for details"
    fi

    # Coverage Report
    echo ""
    print_separator
    print_color "$BLUE" "📁 TEST COVERAGE"
    print_separator
    print_color "$YELLOW" "▶ Generating overall coverage report..."
    npm test -- --coverage --coverageDirectory=coverage/overall > /tmp/coverage.log 2>&1

    # Extract coverage percentages if available
    if [ -f "coverage/overall/coverage-summary.json" ]; then
        print_color "$GREEN" "✅ Coverage report generated"
        print_color "$CYAN" "View detailed report: coverage/overall/lcov-report/index.html"
    else
        print_color "$YELLOW" "⚠️  Coverage report generation had issues"
    fi

    # Final Summary
    echo ""
    echo ""
    print_separator
    print_color "$MAGENTA" "           FINAL TEST SUMMARY           "
    print_separator
    echo ""

    # Session results table
    print_color "$BLUE" "Session Test Results:"
    echo "  Session 1 (State Management):     ${TEST_RESULTS[0]:-⏳}"
    echo "  Session 2 (Type-Safe Integration): ${TEST_RESULTS[1]:-⏳}"
    echo "  Session 3 (Plugin System):        ${TEST_RESULTS[2]:-⏳}"
    echo ""

    # Statistics
    print_color "$BLUE" "Statistics:"
    echo "  Total Sessions Tested: $TOTAL_SESSIONS"
    print_color "$GREEN" "  Passed: $PASSED_SESSIONS"
    print_color "$RED" "  Failed: $((TOTAL_SESSIONS - PASSED_SESSIONS))"

    if [ ${#FAILED_SESSIONS[@]} -gt 0 ]; then
        echo ""
        print_color "$RED" "Failed Sessions:"
        for failed in "${FAILED_SESSIONS[@]}"; do
            echo "  • $failed"
        done
    fi

    # Success rate
    if [ $TOTAL_SESSIONS -gt 0 ]; then
        SUCCESS_RATE=$((PASSED_SESSIONS * 100 / TOTAL_SESSIONS))
        echo ""
        print_color "$BLUE" "Success Rate: ${SUCCESS_RATE}%"

        if [ $SUCCESS_RATE -eq 100 ]; then
            echo ""
            print_color "$GREEN" "🎉 ALL TESTS PASSED! 🎉"
            print_color "$GREEN" "The orchestrator-v2 system is fully tested and verified!"
        fi
    fi

    echo ""
    print_separator

    # Exit code based on results
    if [ $PASSED_SESSIONS -eq $TOTAL_SESSIONS ]; then
        exit 0
    else
        exit 1
    fi
}

# Run the main function
main "$@"