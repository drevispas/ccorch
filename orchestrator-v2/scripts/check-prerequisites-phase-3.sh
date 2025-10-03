#!/bin/bash

# Phase 3 Prerequisite Checker
# Verifies that Phase 1 and Phase 2 are complete before starting Phase 3

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
        if [ "$phase" = "Phase 1" ]; then
            PHASE1_COMPLETE=false
        elif [ "$phase" = "Phase 2" ]; then
            PHASE2_COMPLETE=false
        fi
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
        if [ "$phase" = "Phase 1" ]; then
            PHASE1_COMPLETE=false
        elif [ "$phase" = "Phase 2" ]; then
            PHASE2_COMPLETE=false
        fi
        return 1
    fi
}

# Main prerequisite check
main() {
    clear
    print_color "$CYAN" "=========================================="
    print_color "$CYAN" "  PHASE 3 PREREQUISITE CHECK            "
    print_color "$CYAN" "=========================================="
    echo ""
    print_color "$BLUE" "Checking Phase 1 and Phase 2 completion..."
    echo ""

    # Phase 1 Prerequisites (Core Architecture)
    print_color "$YELLOW" "\n📦 PHASE 1: CORE ARCHITECTURE"
    print_color "$YELLOW" "=============================="

    # Session 1: State Management
    print_color "$BLUE" "\nSession 1: State Management"
    check_dir "core/state" "State management directory" "Phase 1"
    check_file "core/state/event-driven-state-manager.ts" "EventDrivenStateManager" "Phase 1"
    check_file "core/state/event-bus.ts" "EventBus" "Phase 1"

    # Session 2: Type-Safe Integration
    print_color "$BLUE" "\nSession 2: Type-Safe Integration"
    check_dir "server" "Server directory" "Phase 1"
    check_file "server/index.ts" "TypeScript server" "Phase 1"
    check_file "server/schemas/common.ts" "Common schemas" "Phase 1"

    # Session 3: Agent System
    print_color "$BLUE" "\nSession 3: Agent System"
    check_dir "core/plugins" "Plugin system" "Phase 1"
    check_dir "agents" "Agent plugins" "Phase 1"

    # Phase 2 Prerequisites (Workflow Engine)
    print_color "$YELLOW" "\n📦 PHASE 2: WORKFLOW ENGINE"
    print_color "$YELLOW" "==========================="

    # Session 4: Workflow DSL
    print_color "$BLUE" "\nSession 4: Workflow DSL"
    check_dir "core/workflow" "Workflow directory" "Phase 2"
    check_file "core/workflow/dsl.ts" "Workflow DSL" "Phase 2"
    check_file "core/workflow/compiler.ts" "Workflow compiler" "Phase 2"
    check_file "core/workflow/schemas.ts" "Workflow schemas" "Phase 2"

    # Session 5: Execution Engine
    print_color "$BLUE" "\nSession 5: Execution Engine"
    check_dir "core/execution" "Execution directory" "Phase 2"
    check_file "core/execution/reactive-engine.ts" "Reactive execution engine" "Phase 2"
    check_file "core/execution/scheduler.ts" "Task scheduler" "Phase 2"
    check_file "core/execution/circuit-breaker.ts" "Circuit breaker" "Phase 2"

    # Session 6: Integration Layer
    print_color "$BLUE" "\nSession 6: Integration Layer"
    check_dir "core/integration" "Integration directory" "Phase 2"
    check_file "core/integration/websocket-server.ts" "WebSocket server" "Phase 2"
    check_file "core/integration/streaming.ts" "Streaming support" "Phase 2"
    check_file "core/integration/hook-manager.ts" "Hook manager" "Phase 2"

    # Check documentation
    print_color "$YELLOW" "\n📋 Documentation"
    print_color "$YELLOW" "-----------------"

    # Phase 1 docs
    check_file "docs/SESSION-1-SUMMARY.md" "Session 1 documentation" "Phase 1"
    check_file "docs/SESSION-2-SUMMARY.md" "Session 2 documentation" "Phase 1"
    check_file "docs/SESSION-3-SUMMARY.md" "Session 3 documentation" "Phase 1"

    # Phase 2 docs
    check_file "docs/SESSION-4-SUMMARY.md" "Session 4 documentation" "Phase 2"
    check_file "docs/SESSION-5-SUMMARY.md" "Session 5 documentation" "Phase 2"
    check_file "docs/SESSION-6-SUMMARY.md" "Session 6 documentation" "Phase 2"

    # Run tests
    print_color "$YELLOW" "\n📋 Testing Prerequisites"
    print_color "$YELLOW" "------------------------"

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

    echo ""

    if [ "$PREREQUISITES_MET" = true ]; then
        print_color "$GREEN" "✅ ALL PREREQUISITES MET!"
        echo ""
        print_color "$GREEN" "Phases 1 and 2 are complete. You can now proceed with Phase 3:"
        echo ""
        print_color "$CYAN" "Phase 3 Sessions:"
        echo "  • Session 7: Monitoring & Observability"
        echo "  • Session 8: Resilience & Self-Healing"
        echo ""
        print_color "$YELLOW" "Phase 3 will implement:"
        echo "  • Structured logging with Winston"
        echo "  • OpenTelemetry integration"
        echo "  • Distributed tracing"
        echo "  • Grafana dashboards"
        echo "  • Self-healing capabilities"
        echo "  • Chaos engineering framework"
        echo ""
        print_color "$YELLOW" "Next Steps:"
        echo "1. Return to the main menu"
        echo "2. Select Phase 3"
        echo "3. Start with Session 7: Monitoring & Observability"
        echo ""
        exit 0
    else
        print_color "$RED" "❌ PREREQUISITES NOT MET"
        echo ""
        print_color "$RED" "The following prerequisites are missing:"
        echo -e "$FAILED_CHECKS"
        echo ""

        if [ "$PHASE1_COMPLETE" = false ]; then
            print_color "$YELLOW" "⚠️  Phase 1 is incomplete!"
            echo "Complete Sessions 1-3 first."
        fi

        if [ "$PHASE2_COMPLETE" = false ]; then
            print_color "$YELLOW" "⚠️  Phase 2 is incomplete!"
            echo "Complete Sessions 4-6 before starting Phase 3."
        fi

        echo ""
        print_color "$YELLOW" "Action Required:"
        echo "1. Complete all missing components from Phase 1 and Phase 2"
        echo "2. Ensure all implementations are in place"
        echo "3. Fix any TypeScript compilation errors"
        echo "4. Run this check again before starting Phase 3"
        echo ""
        print_color "$CYAN" "For help, review the session summaries in docs/"
        echo ""
        exit 1
    fi
}

# Run main function
main