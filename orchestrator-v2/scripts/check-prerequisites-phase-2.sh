#!/bin/bash

# Phase 2 Prerequisite Checker
# Verifies that Phase 1 is complete before starting Phase 2

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

# Function to check file existence
check_file() {
    file_path=$1
    description=$2

    if [ -f "$file_path" ]; then
        print_color "$GREEN" "✅ $description"
        return 0
    else
        print_color "$RED" "❌ $description (missing: $file_path)"
        PREREQUISITES_MET=false
        FAILED_CHECKS="$FAILED_CHECKS\n  - $description: $file_path"
        return 1
    fi
}

# Function to check directory existence
check_dir() {
    dir_path=$1
    description=$2

    if [ -d "$dir_path" ]; then
        print_color "$GREEN" "✅ $description"
        return 0
    else
        print_color "$RED" "❌ $description (missing: $dir_path)"
        PREREQUISITES_MET=false
        FAILED_CHECKS="$FAILED_CHECKS\n  - $description: $dir_path"
        return 1
    fi
}

# Main prerequisite check
main() {
    clear
    print_color "$CYAN" "=========================================="
    print_color "$CYAN" "  PHASE 2 PREREQUISITE CHECK            "
    print_color "$CYAN" "=========================================="
    echo ""
    print_color "$BLUE" "Checking Phase 1 completion status..."
    echo ""

    # Session 1: State Management Prerequisites
    print_color "$YELLOW" "\n📋 Session 1: State Management"
    print_color "$YELLOW" "--------------------------------"

    check_dir "core/state" "State management directory"
    check_file "core/state/event-driven-state-manager.ts" "EventDrivenStateManager implementation"
    check_file "core/state/event-bus.ts" "EventBus implementation"
    check_file "core/state/types.ts" "State type definitions"
    check_file "core/state/schemas.ts" "Zod validation schemas"

    # Check persistence adapters
    if [ -d "core/state/persistence" ]; then
        print_color "$GREEN" "✅ Persistence adapters directory"
        check_file "core/state/persistence/redis-adapter.ts" "Redis adapter"
        check_file "core/state/persistence/sqlite-adapter.ts" "SQLite adapter"
    else
        print_color "$RED" "❌ Persistence adapters directory missing"
        PREREQUISITES_MET=false
    fi

    # Session 2: Type-Safe Integration Prerequisites
    print_color "$YELLOW" "\n📋 Session 2: Type-Safe Integration"
    print_color "$YELLOW" "------------------------------------"

    check_dir "server" "Server directory"
    check_file "server/index.ts" "TypeScript server entry point"
    check_file "server/schemas/common.ts" "Common Zod schemas"
    check_file "server/schemas/api.ts" "API schemas"
    check_file "server/middleware/validation.ts" "Validation middleware"
    check_file "server/routes/workflow.ts" "Workflow routes"

    # Check client SDK
    if [ -d "client" ]; then
        print_color "$GREEN" "✅ Client SDK directory"
        check_file "client/index.ts" "Client SDK implementation"
    else
        print_color "$YELLOW" "⚠️  Client SDK directory not found (optional)"
    fi

    # Session 3: Agent System Prerequisites
    print_color "$YELLOW" "\n📋 Session 3: Agent System"
    print_color "$YELLOW" "---------------------------"

    check_dir "core/plugins" "Plugin system directory"
    check_file "core/plugins/plugin-manager.ts" "Plugin manager"
    check_file "core/plugins/plugin-loader.ts" "Plugin loader"
    check_file "core/plugins/capability-registry.ts" "Capability registry"
    check_file "core/plugins/base-plugin.ts" "Base plugin class"

    check_dir "agents" "Agent plugins directory"

    # Check documentation
    print_color "$YELLOW" "\n📋 Documentation"
    print_color "$YELLOW" "-----------------"

    check_file "docs/SESSION-1-SUMMARY.md" "Session 1 documentation"
    check_file "docs/SESSION-2-SUMMARY.md" "Session 2 documentation"
    check_file "docs/SESSION-3-SUMMARY.md" "Session 3 documentation"

    # Run basic tests
    print_color "$YELLOW" "\n📋 Testing Phase 1 Components"
    print_color "$YELLOW" "------------------------------"

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

    # Run Phase 1 tests
    print_color "$BLUE" "Running Phase 1 unit tests..."
    if npm test -- tests/state/ --passWithNoTests > /dev/null 2>&1; then
        print_color "$GREEN" "✅ State management tests passed"
    else
        print_color "$YELLOW" "⚠️  State management tests failed (non-blocking)"
    fi

    # Final Report
    echo ""
    print_color "$CYAN" "=========================================="
    print_color "$CYAN" "         PREREQUISITE CHECK SUMMARY      "
    print_color "$CYAN" "=========================================="
    echo ""

    if [ "$PREREQUISITES_MET" = true ]; then
        print_color "$GREEN" "✅ ALL PREREQUISITES MET!"
        echo ""
        print_color "$GREEN" "Phase 1 is complete. You can now proceed with Phase 2:"
        echo ""
        print_color "$CYAN" "Phase 2 Sessions:"
        echo "  • Session 4: Workflow DSL"
        echo "  • Session 5: Execution Engine"
        echo "  • Session 6: Integration Layer"
        echo ""
        print_color "$YELLOW" "Next Steps:"
        echo "1. Return to the main menu"
        echo "2. Select Phase 2"
        echo "3. Start with Session 4: Workflow DSL"
        echo ""
        exit 0
    else
        print_color "$RED" "❌ PREREQUISITES NOT MET"
        echo ""
        print_color "$RED" "The following prerequisites are missing:"
        echo -e "$FAILED_CHECKS"
        echo ""
        print_color "$YELLOW" "Action Required:"
        echo "1. Complete the missing Phase 1 components"
        echo "2. Ensure all Session 1-3 implementations are in place"
        echo "3. Fix any TypeScript compilation errors"
        echo "4. Run this check again before starting Phase 2"
        echo ""
        print_color "$CYAN" "For help, review:"
        echo "  • docs/SESSION-1-SUMMARY.md"
        echo "  • docs/SESSION-2-SUMMARY.md"
        echo "  • docs/SESSION-3-SUMMARY.md"
        echo ""
        exit 1
    fi
}

# Run main function
main