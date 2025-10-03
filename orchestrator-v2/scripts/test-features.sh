#!/bin/bash

# Orchestrator V2 - Interactive Feature Testing Script
# Tests all Phase 1 and Phase 2 features

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Configuration
API_URL="http://localhost:3001/api"
WS_URL="ws://localhost:3002"
LOG_DIR="logs"
RESULTS_DIR="test-results"

# Create directories
mkdir -p "$LOG_DIR" "$RESULTS_DIR"

# Helper functions
print_header() {
    echo -e "\n${CYAN}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BOLD}${MAGENTA}  $1${NC}"
    echo -e "${CYAN}═══════════════════════════════════════════════════════${NC}\n"
}

print_section() {
    echo -e "\n${BLUE}▶ $1${NC}"
    echo -e "${BLUE}$(printf '%.0s─' {1..50})${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ️  $1${NC}"
}

check_command() {
    if ! command -v $1 &> /dev/null; then
        print_error "$1 is not installed"
        return 1
    fi
    return 0
}

check_service() {
    local url=$1
    local name=$2

    if curl -s -o /dev/null -w "%{http_code}" "$url" | grep -q "200\|404"; then
        print_success "$name is running at $url"
        return 0
    else
        print_error "$name is not responding at $url"
        return 1
    fi
}

# Main menu
show_menu() {
    clear
    print_header "ORCHESTRATOR V2 - FEATURE TESTING"

    echo "Select a test category:"
    echo ""
    echo "  ${BOLD}Phase 1 - Core Architecture${NC}"
    echo "    1) State Management (Session 1)"
    echo "    2) Type-Safe API (Session 2)"
    echo "    3) Plugin System (Session 3)"
    echo ""
    echo "  ${BOLD}Phase 2 - Workflow Engine${NC}"
    echo "    4) Workflow DSL (Session 4)"
    echo "    5) Execution Engine (Session 5)"
    echo "    6) WebSocket Integration (Session 6)"
    echo ""
    echo "  ${BOLD}Integration Tests${NC}"
    echo "    7) End-to-End Workflow Test"
    echo "    8) Performance Benchmark"
    echo "    9) Load Testing"
    echo ""
    echo "  ${BOLD}Utilities${NC}"
    echo "    S) Start All Services"
    echo "    C) Check Service Health"
    echo "    L) View Logs"
    echo "    R) Generate Report"
    echo "    Q) Quit"
    echo ""
    read -p "Enter your choice: " choice
}

# Test functions
test_state_management() {
    print_section "Testing State Management"

    print_info "Running state management tests..."
    npx tsx examples/test-scripts/test-state-management.ts > "$RESULTS_DIR/state-management.log" 2>&1

    if [ $? -eq 0 ]; then
        print_success "State management tests passed"
        tail -5 "$RESULTS_DIR/state-management.log"
    else
        print_error "State management tests failed"
        tail -10 "$RESULTS_DIR/state-management.log"
    fi
}

test_api_server() {
    print_section "Testing Type-Safe API"

    # Check if server is running
    if ! check_service "$API_URL/health" "API Server"; then
        print_warning "Starting API server..."
        npm run server:dev > "$LOG_DIR/api-server.log" 2>&1 &
        sleep 3
    fi

    # Test endpoints
    print_info "Testing API endpoints..."

    # Health check
    echo -n "  Health endpoint: "
    if curl -s "$API_URL/health" | grep -q "ok"; then
        print_success "Working"
    else
        print_error "Failed"
    fi

    # Create workflow
    echo -n "  Create workflow: "
    WORKFLOW_RESPONSE=$(curl -s -X POST "$API_URL/workflows" \
        -H "Content-Type: application/json" \
        -d '{
            "name": "test-workflow",
            "version": "1.0.0",
            "pipeline": [
                {"id": "t1", "type": "task", "name": "Test", "agentName": "test-agent"}
            ]
        }')

    if echo "$WORKFLOW_RESPONSE" | grep -q "id"; then
        WORKFLOW_ID=$(echo "$WORKFLOW_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
        print_success "Created workflow: $WORKFLOW_ID"
        echo "$WORKFLOW_ID" > "$RESULTS_DIR/last-workflow-id.txt"
    else
        print_error "Failed to create workflow"
    fi
}

test_plugin_system() {
    print_section "Testing Plugin System"

    print_info "Testing plugin loading and discovery..."

    npx tsx -e "
import { PluginLoader } from './core/plugins/plugin-loader';
import { AgentManager } from './core/plugins/agent-manager';

async function test() {
    const loader = new PluginLoader();
    const manager = new AgentManager();

    await loader.loadBuiltIn();
    const plugins = loader.list();
    console.log('Loaded plugins:', plugins.length);

    const capabilities = manager.discoverCapabilities();
    console.log('Discovered capabilities:', capabilities.length);

    if (plugins.length > 0 && capabilities.length > 0) {
        process.exit(0);
    } else {
        process.exit(1);
    }
}

test().catch(() => process.exit(1));
" > "$RESULTS_DIR/plugin-system.log" 2>&1

    if [ $? -eq 0 ]; then
        print_success "Plugin system working"
        cat "$RESULTS_DIR/plugin-system.log"
    else
        print_error "Plugin system test failed"
    fi
}

test_workflow_dsl() {
    print_section "Testing Workflow DSL"

    print_info "Testing workflow parsing and compilation..."

    # Test YAML parsing
    npx tsx -e "
import { WorkflowParser } from './core/workflow/parser';
import { WorkflowCompiler } from './core/workflow/compiler';
import fs from 'fs';

async function test() {
    const parser = new WorkflowParser();
    const compiler = new WorkflowCompiler();

    const yaml = fs.readFileSync('examples/workflows/simple-sequential.yaml', 'utf-8');
    const workflow = await parser.parse(yaml, 'yaml');
    console.log('Parsed workflow:', workflow.name);

    const compiled = compiler.compile(workflow);
    console.log('Compiled stages:', compiled.stages.size);

    process.exit(compiled.stages.size > 0 ? 0 : 1);
}

test().catch(err => {
    console.error(err);
    process.exit(1);
});
" > "$RESULTS_DIR/workflow-dsl.log" 2>&1

    if [ $? -eq 0 ]; then
        print_success "Workflow DSL working"
        cat "$RESULTS_DIR/workflow-dsl.log"
    else
        print_error "Workflow DSL test failed"
        tail -10 "$RESULTS_DIR/workflow-dsl.log"
    fi
}

test_execution_engine() {
    print_section "Testing Execution Engine"

    print_info "Running workflow execution tests..."
    npx tsx examples/test-scripts/test-workflow-execution.ts > "$RESULTS_DIR/execution-engine.log" 2>&1

    if [ $? -eq 0 ]; then
        print_success "Execution engine tests passed"
        grep "✅" "$RESULTS_DIR/execution-engine.log" | tail -5
    else
        print_error "Execution engine tests failed"
        tail -10 "$RESULTS_DIR/execution-engine.log"
    fi
}

test_websocket() {
    print_section "Testing WebSocket Integration"

    print_info "Testing WebSocket server..."

    # Test WebSocket connection
    if command -v wscat &> /dev/null; then
        echo '{"type":"ping"}' | wscat -c "$WS_URL" -w 1 > "$RESULTS_DIR/websocket.log" 2>&1 &
        WS_PID=$!
        sleep 2
        kill $WS_PID 2>/dev/null

        if grep -q "pong" "$RESULTS_DIR/websocket.log"; then
            print_success "WebSocket server responding"
        else
            print_error "WebSocket server not responding"
        fi
    else
        print_warning "wscat not installed, skipping WebSocket test"
        print_info "Install with: npm install -g wscat"
    fi

    print_info "Open examples/websocket-client.html in a browser for interactive testing"
}

test_e2e_workflow() {
    print_section "End-to-End Workflow Test"

    print_info "Running complete workflow execution test..."

    # Check services
    if ! check_service "$API_URL/health" "API Server"; then
        print_error "API server not running. Start it first (option S)"
        return
    fi

    # Run integration test
    npx tsx examples/test-scripts/test-integration-flow.ts > "$RESULTS_DIR/e2e-workflow.log" 2>&1

    if [ $? -eq 0 ]; then
        print_success "E2E workflow test passed"
        grep "✅" "$RESULTS_DIR/e2e-workflow.log"
    else
        print_error "E2E workflow test failed"
        tail -15 "$RESULTS_DIR/e2e-workflow.log"
    fi
}

run_benchmark() {
    print_section "Performance Benchmark"

    print_info "Running performance benchmarks..."

    # State Manager benchmark
    echo -e "\n${BOLD}State Manager Performance:${NC}"
    time npx tsx -e "
import { EventDrivenStateManager } from './core/state/event-driven-state-manager';
import { SqliteStateAdapter } from './core/state/persistence/sqlite-adapter';

async function benchmark() {
    const adapter = new SqliteStateAdapter(':memory:');
    const manager = new EventDrivenStateManager(adapter);
    await manager.initialize();

    const start = Date.now();
    const promises = [];

    for (let i = 0; i < 1000; i++) {
        promises.push(manager.createWorkflow({
            name: \`workflow-\${i}\`,
            version: '1.0.0',
            pipeline: []
        }));
    }

    await Promise.all(promises);
    const elapsed = Date.now() - start;
    console.log(\`Created 1000 workflows in \${elapsed}ms\`);
    console.log(\`Rate: \${(1000 / elapsed * 1000).toFixed(2)} workflows/sec\`);
}

benchmark().catch(console.error);
" 2>&1 | tee "$RESULTS_DIR/benchmark-state.log"

    # Task Scheduler benchmark
    echo -e "\n${BOLD}Task Scheduler Performance:${NC}"
    time npx tsx -e "
import { TaskScheduler } from './core/execution/task-scheduler';

const scheduler = new TaskScheduler({
    workerPoolSize: 10,
    queueCapacity: 10000
});

scheduler.start();

const start = Date.now();
for (let i = 0; i < 10000; i++) {
    scheduler.scheduleTask({
        id: \`task-\${i}\`,
        stageId: 'stage-1',
        type: 'agent',
        agentName: 'test'
    }, i % 4);
}

const stats = scheduler.getQueueStats();
const elapsed = Date.now() - start;
console.log(\`Scheduled 10000 tasks in \${elapsed}ms\`);
console.log(\`Rate: \${(10000 / elapsed * 1000).toFixed(2)} tasks/sec\`);

scheduler.shutdown();
" 2>&1 | tee "$RESULTS_DIR/benchmark-scheduler.log"
}

start_services() {
    print_section "Starting All Services"

    print_info "Building project..."
    npm run build > "$LOG_DIR/build.log" 2>&1

    if [ $? -ne 0 ]; then
        print_error "Build failed. Check $LOG_DIR/build.log"
        return
    fi

    print_info "Starting API server..."
    npm run server:dev > "$LOG_DIR/api-server.log" 2>&1 &
    API_PID=$!
    echo $API_PID > "$LOG_DIR/api-server.pid"

    sleep 3

    if check_service "$API_URL/health" "API Server"; then
        print_success "API server started (PID: $API_PID)"
    else
        print_error "Failed to start API server"
    fi

    print_info "WebSocket server included in API server on port 3002"
}

check_health() {
    print_section "Service Health Check"

    check_service "$API_URL/health" "API Server"
    check_service "$API_URL/metrics" "Metrics Endpoint"

    # Check WebSocket
    if command -v wscat &> /dev/null; then
        echo '{"type":"ping"}' | timeout 2 wscat -c "$WS_URL" > /dev/null 2>&1
        if [ $? -eq 0 ]; then
            print_success "WebSocket server is healthy"
        else
            print_warning "WebSocket server not responding"
        fi
    fi

    # Check processes
    print_info "Running processes:"
    ps aux | grep -E "node|tsx" | grep -v grep | head -5
}

view_logs() {
    print_section "Log Viewer"

    echo "Available logs:"
    echo "  1) API Server"
    echo "  2) Build Log"
    echo "  3) Test Results"
    echo "  4) All Logs"
    read -p "Select log to view: " log_choice

    case $log_choice in
        1) tail -f "$LOG_DIR/api-server.log" ;;
        2) cat "$LOG_DIR/build.log" ;;
        3) ls -la "$RESULTS_DIR/" ;;
        4) tail -f "$LOG_DIR"/*.log ;;
        *) print_error "Invalid choice" ;;
    esac
}

generate_report() {
    print_section "Generating Test Report"

    REPORT_FILE="$RESULTS_DIR/test-report-$(date +%Y%m%d-%H%M%S).md"

    cat > "$REPORT_FILE" << EOF
# Orchestrator V2 - Test Report
Generated: $(date)

## Test Summary

### Phase 1 - Core Architecture
EOF

    # Check each test result
    for test_file in "$RESULTS_DIR"/*.log; do
        if [ -f "$test_file" ]; then
            test_name=$(basename "$test_file" .log)
            if grep -q "error\|failed\|Failed" "$test_file"; then
                echo "- ❌ $test_name: FAILED" >> "$REPORT_FILE"
            else
                echo "- ✅ $test_name: PASSED" >> "$REPORT_FILE"
            fi
        fi
    done

    cat >> "$REPORT_FILE" << EOF

## Performance Metrics
EOF

    if [ -f "$RESULTS_DIR/benchmark-state.log" ]; then
        echo "### State Manager" >> "$REPORT_FILE"
        grep "Rate:" "$RESULTS_DIR/benchmark-state.log" >> "$REPORT_FILE"
    fi

    if [ -f "$RESULTS_DIR/benchmark-scheduler.log" ]; then
        echo "### Task Scheduler" >> "$REPORT_FILE"
        grep "Rate:" "$RESULTS_DIR/benchmark-scheduler.log" >> "$REPORT_FILE"
    fi

    print_success "Report generated: $REPORT_FILE"
    cat "$REPORT_FILE"
}

# Main loop
while true; do
    show_menu

    case $choice in
        1) test_state_management ;;
        2) test_api_server ;;
        3) test_plugin_system ;;
        4) test_workflow_dsl ;;
        5) test_execution_engine ;;
        6) test_websocket ;;
        7) test_e2e_workflow ;;
        8) run_benchmark ;;
        9)
            print_info "Load testing requires Artillery"
            print_info "Install with: npm install -g artillery"
            print_info "Then run: artillery run artillery.yml"
            ;;
        S|s) start_services ;;
        C|c) check_health ;;
        L|l) view_logs ;;
        R|r) generate_report ;;
        Q|q)
            print_info "Goodbye!"
            exit 0
            ;;
        *)
            print_error "Invalid choice"
            ;;
    esac

    echo ""
    read -p "Press Enter to continue..."
done