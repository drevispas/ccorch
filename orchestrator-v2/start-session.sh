#!/bin/bash

# Orchestrator V2 - Phase-Based Session Starter Script
# This script helps you start refactoring sessions with proper phase organization,
# prerequisite checking, and testing capabilities

# Color codes for better visibility
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

# Function to show the main phase menu
show_phase_menu() {
    clear
    echo "================================================"
    echo "    ORCHESTRATOR V2 - REFACTORING PHASES       "
    echo "================================================"
    echo ""
    print_color "$GREEN" "Phase 1: Core Architecture [✅ COMPLETED]"
    echo "  - Session 1: Unified State Management ✅"
    echo "  - Session 2: Type-Safe Integration ✅"
    echo "  - Session 3: Agent System Redesign ✅"
    echo ""
    print_color "$GREEN" "Phase 2: Workflow Engine [✅ COMPLETED]"
    echo "  - Session 4: Workflow DSL ✅"
    echo "  - Session 5: Execution Engine ✅"
    echo "  - Session 6: Integration Layer ✅"
    echo ""
    print_color "$YELLOW" "Phase 3: Observability [🔓 READY TO START]"
    echo "  - Session 7: Monitoring & Observability"
    echo "  - Session 8: Resilience & Self-Healing"
    echo ""
    print_color "$CYAN" "Phase 4: Quality & Deployment [🔒 LOCKED - Requires Phase 3]"
    echo "  - Session 9: Testing Framework"
    echo "  - Session 10: Migration & Documentation"
    echo ""
    echo "================================================"
    echo ""
    echo "Select an option:"
    echo "  1) Phase 1 - Test completed implementation"
    echo "  2) Phase 2 - Start workflow engine sessions"
    echo "  3) Phase 3 - Observability (locked)"
    echo "  4) Phase 4 - Quality & Deployment (locked)"
    echo "  5) Run all prerequisite checks"
    echo "  6) View documentation"
    echo "  0) Exit"
    echo ""
    echo -n "Enter your choice (0-6): "
}

# Function to handle Phase 1 (completed)
handle_phase1() {
    clear
    print_color "$GREEN" "=== PHASE 1: CORE ARCHITECTURE (COMPLETED) ==="
    echo ""
    echo "Phase 1 successfully implemented:"
    echo "  ✅ EventDrivenStateManager with CQRS pattern"
    echo "  ✅ EventBus with RxJS integration"
    echo "  ✅ Redis/SQLite persistence adapters"
    echo "  ✅ Full TypeScript server conversion"
    echo "  ✅ Zod validation schemas"
    echo "  ✅ Plugin-based agent architecture"
    echo ""
    echo "Options:"
    echo "  1) Run Phase 1 integration tests"
    echo "  2) View Phase 1 documentation"
    echo "  3) Check Phase 1 implementation status"
    echo "  0) Back to main menu"
    echo ""
    echo -n "Enter your choice (0-3): "
    read choice

    case $choice in
        1)
            print_color "$YELLOW" "\nRunning Phase 1 Integration Tests..."
            echo ""
            if [ -f "scripts/test-phase-1.sh" ]; then
                bash scripts/test-phase-1.sh
            else
                echo "Running npm tests for Phase 1 components..."
                npm test -- tests/state/ tests/server/ tests/plugins/
            fi
            echo ""
            echo "Press Enter to continue..."
            read
            ;;
        2)
            echo ""
            echo "Phase 1 Documentation:"
            echo "  - docs/SESSION-1-SUMMARY.md - State Management"
            echo "  - docs/SESSION-2-SUMMARY.md - Type-Safe Integration"
            echo "  - docs/SESSION-3-SUMMARY.md - Agent System"
            echo "  - docs/STATE-MANAGER-REFERENCE.md - State manager reference"
            echo "  - docs/MIGRATION-GUIDE.md - Migration guide"
            echo ""
            echo -n "View which document? (enter filename or 0 to skip): "
            read doc
            if [ "$doc" != "0" ] && [ -f "$doc" ]; then
                less "$doc"
            fi
            ;;
        3)
            echo ""
            print_color "$GREEN" "Checking Phase 1 Implementation Status..."
            echo ""
            # Check core components
            [ -d "core/state" ] && print_color "$GREEN" "✅ State management directory exists" || print_color "$RED" "❌ State management missing"
            [ -f "core/state/event-driven-state-manager.ts" ] && print_color "$GREEN" "✅ EventDrivenStateManager implemented" || print_color "$RED" "❌ EventDrivenStateManager missing"
            [ -f "server/index.ts" ] && print_color "$GREEN" "✅ TypeScript server exists" || print_color "$RED" "❌ TypeScript server missing"
            [ -d "core/plugins" ] && print_color "$GREEN" "✅ Plugin system directory exists" || print_color "$RED" "❌ Plugin system missing"
            [ -d "agents" ] && print_color "$GREEN" "✅ Agent plugins directory exists" || print_color "$RED" "❌ Agent plugins missing"
            echo ""
            echo "Press Enter to continue..."
            read
            ;;
        0)
            return
            ;;
    esac
}

# Function to handle Phase 2 (ready to start)
handle_phase2() {
    clear
    print_color "$YELLOW" "=== PHASE 2: WORKFLOW ENGINE ==="
    echo ""
    echo "This phase will implement:"
    echo "  • Declarative workflow DSL"
    echo "  • Reactive execution engine"
    echo "  • Modern integration layer"
    echo ""
    echo "Options:"
    echo "  1) Check Phase 2 prerequisites"
    echo "  2) Start Session 4: Workflow DSL"
    echo "  3) Start Session 5: Execution Engine"
    echo "  4) Start Session 6: Integration Layer"
    echo "  5) View Phase 2 plan"
    echo "  0) Back to main menu"
    echo ""
    echo -n "Enter your choice (0-5): "
    read choice

    case $choice in
        1)
            print_color "$YELLOW" "\nChecking Phase 2 Prerequisites..."
            echo ""
            if [ -f "scripts/check-prerequisites-phase-2.sh" ]; then
                bash scripts/check-prerequisites-phase-2.sh
            else
                # Manual prerequisite check
                print_color "$BLUE" "Checking Phase 1 completion..."
                [ -f "core/state/event-driven-state-manager.ts" ] && print_color "$GREEN" "✅ State manager exists" || print_color "$RED" "❌ State manager missing"
                [ -f "server/index.ts" ] && print_color "$GREEN" "✅ TypeScript server exists" || print_color "$RED" "❌ Server missing"
                [ -d "core/plugins" ] && print_color "$GREEN" "✅ Plugin system exists" || print_color "$RED" "❌ Plugin system missing"

                echo ""
                print_color "$BLUE" "Running Phase 1 tests..."
                npm test -- tests/state/ --passWithNoTests
            fi
            echo ""
            echo "Press Enter to continue..."
            read
            ;;
        2)
            show_session_prompt 4
            ;;
        3)
            show_session_prompt 5
            ;;
        4)
            show_session_prompt 6
            ;;
        5)
            echo ""
            print_color "$CYAN" "Phase 2 Implementation Plan:"
            echo ""
            echo "Session 4: Workflow DSL"
            echo "  - Design workflow DSL with JSON Schema"
            echo "  - Implement workflow compiler and optimizer"
            echo "  - Add workflow versioning and migration"
            echo "  - Create visual workflow editor/viewer"
            echo ""
            echo "Session 5: Execution Engine"
            echo "  - Reactive execution engine with RxJS"
            echo "  - Priority-based task scheduling"
            echo "  - Circuit breakers and retry logic"
            echo "  - Execution checkpointing and recovery"
            echo ""
            echo "Session 6: Integration Layer"
            echo "  - WebSocket server for real-time updates"
            echo "  - Streaming execution support"
            echo "  - Bidirectional communication protocol"
            echo "  - Hook versioning and compatibility"
            echo ""
            echo "Press Enter to continue..."
            read
            ;;
        0)
            return
            ;;
    esac
}

# Function to handle Phase 3 (locked)
handle_phase3() {
    clear
    print_color "$CYAN" "=== PHASE 3: OBSERVABILITY ==="
    echo ""
    print_color "$RED" "🔒 This phase is currently LOCKED"
    echo ""
    echo "Prerequisites not met:"
    echo "  ❌ Phase 2 (Workflow Engine) must be completed first"
    echo ""
    echo "Phase 3 will implement:"
    echo "  • Structured logging with Winston"
    echo "  • OpenTelemetry integration"
    echo "  • Distributed tracing"
    echo "  • Self-healing capabilities"
    echo "  • Chaos engineering framework"
    echo ""
    echo "Press Enter to return to main menu..."
    read
}

# Function to handle Phase 4 (locked)
handle_phase4() {
    clear
    print_color "$CYAN" "=== PHASE 4: QUALITY & DEPLOYMENT ==="
    echo ""
    print_color "$RED" "🔒 This phase is currently LOCKED"
    echo ""
    echo "Prerequisites not met:"
    echo "  ❌ Phase 2 (Workflow Engine) must be completed first"
    echo "  ❌ Phase 3 (Observability) must be completed first"
    echo ""
    echo "Phase 4 will implement:"
    echo "  • Comprehensive testing framework"
    echo "  • Performance benchmarks"
    echo "  • Migration guide and tools"
    echo "  • API documentation"
    echo "  • Deployment strategies"
    echo ""
    echo "Press Enter to return to main menu..."
    read
}

# Function to run all prerequisite checks
run_all_checks() {
    clear
    print_color "$YELLOW" "=== RUNNING ALL PREREQUISITE CHECKS ==="
    echo ""

    # Phase 1 status
    print_color "$BLUE" "Phase 1: Core Architecture"
    [ -f "core/state/event-driven-state-manager.ts" ] && print_color "$GREEN" "  ✅ State Management" || print_color "$RED" "  ❌ State Management"
    [ -f "server/index.ts" ] && print_color "$GREEN" "  ✅ TypeScript Server" || print_color "$RED" "  ❌ TypeScript Server"
    [ -d "core/plugins" ] && print_color "$GREEN" "  ✅ Plugin System" || print_color "$RED" "  ❌ Plugin System"
    echo ""

    # Phase 2 readiness
    print_color "$BLUE" "Phase 2: Workflow Engine"
    if [ -f "core/state/event-driven-state-manager.ts" ] && [ -f "server/index.ts" ] && [ -d "core/plugins" ]; then
        print_color "$GREEN" "  ✅ Ready to start"
    else
        print_color "$RED" "  ❌ Prerequisites not met"
    fi
    echo ""

    # Phase 3 readiness
    print_color "$BLUE" "Phase 3: Observability"
    if [ -d "core/workflow" ] && [ -d "core/execution" ]; then
        print_color "$GREEN" "  ✅ Ready to start"
    else
        print_color "$YELLOW" "  ⏳ Waiting for Phase 2 completion"
    fi
    echo ""

    # Phase 4 readiness
    print_color "$BLUE" "Phase 4: Quality & Deployment"
    print_color "$YELLOW" "  ⏳ Waiting for Phase 3 completion"
    echo ""

    echo "Press Enter to continue..."
    read
}

# Function to show session prompt
show_session_prompt() {
    session_num=$1

    clear
    echo "================================================"
    echo "COPY THIS ENTIRE PROMPT TO CLAUDE CODE:"
    echo "================================================"
    echo ""

    case $session_num in
        4)
            echo "First, read REFACTORING-QUICK-REFERENCE.md and BIGBANG-REFACTORING-PLAN.md to understand the context. Do design and implement declarative workflow DSL in orchestrator-v2. Create workflow compiler with optimizer, add JSON Schema validation, implement workflow versioning and migration, build visual workflow editor/viewer. Ensure integration with Phase 1 components (EventDrivenStateManager, TypeScript server, Plugin system). IMPORTANT: Create comprehensive unit tests in tests/workflow/ directory with >90% coverage. Run 'npm test -- tests/workflow/' to verify all tests pass before marking complete. Ultrathink to do refactoring. After completing the refactoring and tests, update REFACTORING-QUICK-REFERENCE.md and start-session.sh to mark  Session 4 as completed and document the changes."
            ;;
        5)
            echo "First, read REFACTORING-QUICK-REFERENCE.md and BIGBANG-REFACTORING-PLAN.md to understand the context. Do build ReactiveExecutionEngine with RxJS Observable patterns in orchestrator-v2. Implement priority-based task scheduling, circuit breakers, retry logic, execution checkpointing, recovery mechanisms, and debugging tools. Ensure integration with EventDrivenStateManager from Phase 1 and WorkflowDSL from Session 4. IMPORTANT: Create comprehensive unit tests in tests/execution/ directory with >90% coverage. Run 'npm test -- tests/execution/' to verify all tests pass before marking complete. Ultrathink to do refactoring. After completing the refactoring and tests, update REFACTORING-QUICK-REFERENCE.md and start-session.sh to mark  Session 5 as completed and document the changes."
            ;;
        6)
            echo "First, read REFACTORING-QUICK-REFERENCE.md and BIGBANG-REFACTORING-PLAN.md to understand the context. Do modernize integration layer with WebSocket server and streaming support in orchestrator-v2. Implement real-time bidirectional communication, hook versioning, compatibility layers, and comprehensive integration testing framework. Ensure integration with all Phase 1 and Phase 2 components. IMPORTANT: Create comprehensive unit tests in tests/integration/ directory with >90% coverage. Run 'npm test -- tests/integration/' to verify all tests pass before marking complete. Ultrathink to do refactoring. After completing the refactoring and tests, update REFACTORING-QUICK-REFERENCE.md and start-session.sh to mark  Session 6 as completed and document the changes."
            ;;
        7)
            echo "First, read REFACTORING-QUICK-REFERENCE.md and BIGBANG-REFACTORING-PLAN.md to understand the context. Do implement comprehensive observability system in orchestrator-v2. Add structured logging with Winston, OpenTelemetry integration, distributed tracing, Grafana dashboards, performance profiling, and correlation IDs. Build on top of Phase 1 and Phase 2 components. Ultrathink to do refactoring. After completing the refactoring, update REFACTORING-QUICK-REFERENCE.md and start-session.sh to mark  Session 7 as completed and document the changes."
            ;;
        8)
            echo "First, read REFACTORING-QUICK-REFERENCE.md and BIGBANG-REFACTORING-PLAN.md to understand the context. Do add resilience and self-healing capabilities to orchestrator-v2. Implement comprehensive error recovery system, self-healing orchestrator, chaos engineering framework, automatic rollback mechanisms, and health check monitoring. Integrate with all previous phase components. Ultrathink to do refactoring. After completing the refactoring, update REFACTORING-QUICK-REFERENCE.md and start-session.sh to mark  Session 8 as completed and document the changes."
            ;;
        9)
            echo "First, read REFACTORING-QUICK-REFERENCE.md and BIGBANG-REFACTORING-PLAN.md to understand the context. Do create comprehensive testing framework for orchestrator-v2. Build unit test suite, integration tests, E2E test scenarios, performance benchmarks, property-based testing, contract testing, and test data generators. Test all components from Phases 1-3. Ultrathink to do refactoring. After completing the refactoring, update REFACTORING-QUICK-REFERENCE.md and start-session.sh to mark  Session 9 as completed and document the changes."
            ;;
        10)
            echo "First, read REFACTORING-QUICK-REFERENCE.md and BIGBANG-REFACTORING-PLAN.md to understand the context. Do complete migration from orchestrator to orchestrator-v2. Create comprehensive API documentation, migration guide, operator manual, interactive tutorials, architecture decision records, and execute phased cutover strategy. Document all phases and prepare for production deployment. Ultrathink to do refactoring. After completing the refactoring, update REFACTORING-QUICK-REFERENCE.md and start-session.sh to mark  Session 10 as completed and document the changes."
            ;;
        *)
            echo "Invalid session number."
            return
            ;;
    esac

    echo ""
    echo "================================================"
    echo ""
    echo "Working directory: /Users/yonggeon.kim/repos/drevispas/app-conf/claude/orchestrator-v2"
    echo ""
    echo "Tips:"
    echo "1. Copy the entire prompt above"
    echo "2. Paste it into Claude Code"
    echo "3. Claude will read the documentation and work in ultrathink mode"
    echo "4. Ensure Phase prerequisites are met before starting"
    echo ""
    echo "Press Enter to return to menu..."
    read
}

# Function to view documentation
view_documentation() {
    clear
    print_color "$CYAN" "=== DOCUMENTATION ==="
    echo ""
    echo "Available documentation:"
    echo "  1) README.md - Project overview"
    echo "  2) BIGBANG-REFACTORING-PLAN.md - Complete refactoring plan"
    echo "  3) REFACTORING-QUICK-REFERENCE.md - Quick reference guide"
    echo "  4) docs/SESSION-1-SUMMARY.md - Session 1 summary"
    echo "  5) docs/SESSION-2-SUMMARY.md - Session 2 summary"
    echo "  6) docs/SESSION-3-SUMMARY.md - Session 3 summary"
    echo "  7) docs/STATE-MANAGER-REFERENCE.md - State manager reference"
    echo "  8) docs/MIGRATION-GUIDE.md - Migration guide"
    echo "  0) Back to main menu"
    echo ""
    echo -n "Enter your choice (0-8): "
    read choice

    case $choice in
        1) less CLAUDE.md ;;
        2) less BIGBANG-REFACTORING-PLAN.md ;;
        3) less REFACTORING-QUICK-REFERENCE.md ;;
        4) less docs/SESSION-1-SUMMARY.md ;;
        5) less docs/SESSION-2-SUMMARY.md ;;
        6) less docs/SESSION-3-SUMMARY.md ;;
        7) less docs/STATE-MANAGER-REFERENCE.md ;;
        0) return ;;
    esac
}

# Main loop
while true; do
    show_phase_menu
    read choice

    case $choice in
        1)
            handle_phase1
            ;;
        2)
            handle_phase2
            ;;
        3)
            handle_phase3
            ;;
        4)
            handle_phase4
            ;;
        5)
            run_all_checks
            ;;
        6)
            view_documentation
            ;;
        0)
            print_color "$GREEN" "\nExiting Orchestrator V2 Session Starter. Good luck with your refactoring!"
            exit 0
            ;;
        *)
            print_color "$RED" "\nInvalid choice. Please try again."
            sleep 2
            ;;
    esac
done
