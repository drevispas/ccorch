#!/bin/bash

# Phase 4 Prerequisite Checker
# Verifies that Phases 1, 2, and 3 are complete before starting Phase 4

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Function to print colored text
print_color() {
    color=$1
    text=$2
    echo -e "${color}${text}${NC}"
}

# Track prerequisites
PREREQUISITES_MET=true
FAILED_CHECKS=""
PHASE1_COMPLETE=true
PHASE2_COMPLETE=true
PHASE3_COMPLETE=true

# Function to check file existence
check_file() {
    file_path=$1
    description=$2
    phase=$3

    if [ -f "$file_path" ]; then
        print_color "$GREEN" "✅ $description"
        return 0
    else
        print_color "$RED" "❌ $description (missing: $file_path)"
        PREREQUISITES_MET=false
        FAILED_CHECKS="$FAILED_CHECKS\n  - [$phase] $description: $file_path"
        case "$phase" in
            "Phase 1") PHASE1_COMPLETE=false ;;
            "Phase 2") PHASE2_COMPLETE=false ;;
            "Phase 3") PHASE3_COMPLETE=false ;;
        esac
        return 1
    fi
}

# Function to check directory existence
check_dir() {
    dir_path=$1
    description=$2
    phase=$3

    if [ -d "$dir_path" ]; then
        print_color "$GREEN" "✅ $description"
        return 0
    else
        print_color "$RED" "❌ $description (missing: $dir_path)"
        PREREQUISITES_MET=false
        FAILED_CHECKS="$FAILED_CHECKS\n  - [$phase] $description: $dir_path"
        case "$phase" in
            "Phase 1") PHASE1_COMPLETE=false ;;
            "Phase 2") PHASE2_COMPLETE=false ;;
            "Phase 3") PHASE3_COMPLETE=false ;;
        esac
        return 1
    fi
}

# Main prerequisite check
main() {
    clear
    print_color "$CYAN" "=========================================="
    print_color "$CYAN" "  PHASE 4 PREREQUISITE CHECK            "
    print_color "$CYAN" "=========================================="
    echo ""
    print_color "$BLUE" "Checking all previous phases completion..."
    echo ""

    # Phase 1: Core Architecture
    print_color "$YELLOW" "\n📦 PHASE 1: CORE ARCHITECTURE"
    print_color "$YELLOW" "=============================="

    print_color "$BLUE" "\nChecking core components..."
    check_dir "core/state" "State management" "Phase 1"
    check_file "core/state/event-driven-state-manager.ts" "EventDrivenStateManager" "Phase 1"
    check_dir "server" "TypeScript server" "Phase 1"
    check_dir "core/plugins" "Plugin system" "Phase 1"
    check_dir "agents" "Agent plugins" "Phase 1"

    # Phase 2: Workflow Engine
    print_color "$YELLOW" "\n📦 PHASE 2: WORKFLOW ENGINE"
    print_color "$YELLOW" "==========================="

    print_color "$BLUE" "\nChecking workflow components..."
    check_dir "core/workflow" "Workflow DSL" "Phase 2"
    check_file "core/workflow/dsl.ts" "DSL implementation" "Phase 2"
    check_file "core/workflow/compiler.ts" "Workflow compiler" "Phase 2"

    check_dir "core/execution" "Execution engine" "Phase 2"
    check_file "core/execution/reactive-engine.ts" "Reactive engine" "Phase 2"
    check_file "core/execution/scheduler.ts" "Task scheduler" "Phase 2"

    check_dir "core/integration" "Integration layer" "Phase 2"
    check_file "core/integration/websocket-server.ts" "WebSocket server" "Phase 2"

    # Phase 3: Observability
    print_color "$YELLOW" "\n📦 PHASE 3: OBSERVABILITY"
    print_color "$YELLOW" "========================="

    print_color "$BLUE" "\nChecking observability components..."
    check_dir "core/monitoring" "Monitoring system" "Phase 3"
    check_file "core/monitoring/logger.ts" "Structured logger" "Phase 3"
    check_file "core/monitoring/tracer.ts" "Distributed tracer" "Phase 3"
    check_file "core/monitoring/metrics.ts" "Metrics collector" "Phase 3"

    check_dir "core/resilience" "Resilience system" "Phase 3"
    check_file "core/resilience/error-recovery.ts" "Error recovery" "Phase 3"
    check_file "core/resilience/self-healing.ts" "Self-healing" "Phase 3"
    check_file "core/resilience/chaos-engineer.ts" "Chaos engineering" "Phase 3"

    # Check documentation for all phases
    print_color "$YELLOW" "\n📋 Documentation Check"
    print_color "$YELLOW" "----------------------"

    # Phase 1 docs
    print_color "$BLUE" "Phase 1 documentation:"
    check_file "docs/SESSION-1-SUMMARY.md" "Session 1 docs" "Phase 1"
    check_file "docs/SESSION-2-SUMMARY.md" "Session 2 docs" "Phase 1"
    check_file "docs/SESSION-3-SUMMARY.md" "Session 3 docs" "Phase 1"

    # Phase 2 docs
    print_color "$BLUE" "\nPhase 2 documentation:"
    check_file "docs/SESSION-4-SUMMARY.md" "Session 4 docs" "Phase 2"
    check_file "docs/SESSION-5-SUMMARY.md" "Session 5 docs" "Phase 2"
    check_file "docs/SESSION-6-SUMMARY.md" "Session 6 docs" "Phase 2"

    # Phase 3 docs
    print_color "$BLUE" "\nPhase 3 documentation:"
    check_file "docs/SESSION-7-SUMMARY.md" "Session 7 docs" "Phase 3"
    check_file "docs/SESSION-8-SUMMARY.md" "Session 8 docs" "Phase 3"

    # System health checks
    print_color "$YELLOW" "\n📋 System Health Checks"
    print_color "$YELLOW" "-----------------------"

    # Type checking
    print_color "$BLUE" "Running TypeScript type check..."
    if npm run typecheck > /dev/null 2>&1; then
        print_color "$GREEN" "✅ TypeScript compilation successful"
    else
        print_color "$RED" "❌ TypeScript compilation failed"
        PREREQUISITES_MET=false
        FAILED_CHECKS="$FAILED_CHECKS\n  - TypeScript compilation errors"
    fi

    # Build test
    print_color "$BLUE" "Testing build process..."
    if npm run build > /dev/null 2>&1; then
        print_color "$GREEN" "✅ Build successful"
    else
        print_color "$RED" "❌ Build failed"
        PREREQUISITES_MET=false
        FAILED_CHECKS="$FAILED_CHECKS\n  - Build process failed"
    fi

    # Test coverage check
    print_color "$BLUE" "Checking test coverage..."
    if [ -d "tests" ]; then
        test_count=$(find tests -name "*.test.ts" 2>/dev/null | wc -l)
        if [ $test_count -gt 0 ]; then
            print_color "$GREEN" "✅ Found $test_count test files"
        else
            print_color "$YELLOW" "⚠️  No test files found"
        fi
    else
        print_color "$YELLOW" "⚠️  Tests directory not found"
    fi

    # Final Report
    echo ""
    print_color "$CYAN" "=========================================="
    print_color "$CYAN" "         PREREQUISITE CHECK SUMMARY      "
    print_color "$CYAN" "=========================================="
    echo ""

    # Phase completion status
    if [ "$PHASE1_COMPLETE" = true ]; then
        print_color "$GREEN" "✅ Phase 1: Core Architecture - COMPLETE"
    else
        print_color "$RED" "❌ Phase 1: Core Architecture - INCOMPLETE"
    fi

    if [ "$PHASE2_COMPLETE" = true ]; then
        print_color "$GREEN" "✅ Phase 2: Workflow Engine - COMPLETE"
    else
        print_color "$RED" "❌ Phase 2: Workflow Engine - INCOMPLETE"
    fi

    if [ "$PHASE3_COMPLETE" = true ]; then
        print_color "$GREEN" "✅ Phase 3: Observability - COMPLETE"
    else
        print_color "$RED" "❌ Phase 3: Observability - INCOMPLETE"
    fi

    echo ""

    if [ "$PREREQUISITES_MET" = true ]; then
        print_color "$GREEN" "✅ ALL PREREQUISITES MET!"
        echo ""
        print_color "$GREEN" "All previous phases are complete. You can now proceed with Phase 4:"
        echo ""
        print_color "$CYAN" "Phase 4: Quality & Deployment"
        print_color "$CYAN" "=============================="
        echo ""
        echo "Phase 4 Sessions:"
        echo "  • Session 9: Testing Framework"
        echo "  • Session 10: Migration & Documentation"
        echo ""
        print_color "$YELLOW" "Phase 4 will implement:"
        echo "  • Comprehensive testing framework"
        echo "  • Unit, integration, and E2E tests"
        echo "  • Performance benchmarks"
        echo "  • Property-based testing"
        echo "  • Contract testing"
        echo "  • Migration guide and tools"
        echo "  • API documentation"
        echo "  • Deployment strategies"
        echo ""
        print_color "$YELLOW" "Next Steps:"
        echo "1. Return to the main menu"
        echo "2. Select Phase 4"
        echo "3. Start with Session 9: Testing Framework"
        echo ""
        print_color "$CYAN" "Final Phase Goals:"
        echo "  • Achieve >90% test coverage"
        echo "  • Complete migration from v1 to v2"
        echo "  • Prepare for production deployment"
        echo "  • Document all systems comprehensively"
        echo ""
        exit 0
    else
        print_color "$RED" "❌ PREREQUISITES NOT MET"
        echo ""
        print_color "$RED" "The following prerequisites are missing:"
        echo -e "$FAILED_CHECKS"
        echo ""

        incomplete_phases=""
        if [ "$PHASE1_COMPLETE" = false ]; then
            incomplete_phases="$incomplete_phases\n  • Phase 1: Core Architecture (Sessions 1-3)"
        fi
        if [ "$PHASE2_COMPLETE" = false ]; then
            incomplete_phases="$incomplete_phases\n  • Phase 2: Workflow Engine (Sessions 4-6)"
        fi
        if [ "$PHASE3_COMPLETE" = false ]; then
            incomplete_phases="$incomplete_phases\n  • Phase 3: Observability (Sessions 7-8)"
        fi

        print_color "$YELLOW" "⚠️  Incomplete Phases:"
        echo -e "$incomplete_phases"
        echo ""

        print_color "$YELLOW" "Action Required:"
        echo "1. Complete all missing components from previous phases"
        echo "2. Ensure all implementations are in place"
        echo "3. Fix any TypeScript compilation errors"
        echo "4. Run prerequisite checks for each incomplete phase"
        echo "5. Complete phases in order (1 → 2 → 3 → 4)"
        echo ""
        print_color "$CYAN" "For help, review:"
        echo "  • BIGBANG-REFACTORING-PLAN.md"
        echo "  • REFACTORING-QUICK-REFERENCE.md"
        echo "  • Session summaries in docs/"
        echo ""
        exit 1
    fi
}

# Run main function
main