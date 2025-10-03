#!/bin/bash
# Enhanced task result submission script
# Usage: ./submit-task-result.sh [workflow_id] [agent_type] [result_message]
#        ./submit-task-result.sh auto [agent_type] [result_message]
#        ./submit-task-result.sh list

WORKFLOW_ID="$1"
AGENT_TYPE="$2"
RESULT_MESSAGE="$3"

# Function to show usage
show_usage() {
  echo "Enhanced Task Result Submission Script"
  echo ""
  echo "Usage:"
  echo "  $0 <workflow_id> <agent_type> <result_message>"
  echo "  $0 auto <agent_type> <result_message>          # Auto-detect workflow"
  echo "  $0 list                                         # List active workflows"
  echo ""
  echo "Examples:"
  echo "  $0 wf_123456 backend-architect 'Design completed successfully'"
  echo "  $0 auto java-backend-developer 'Implementation complete'"
  echo "  $0 list"
  echo ""
  echo "Available agent types:"
  echo "  - backend-architect"
  echo "  - java-backend-developer"
  echo "  - nextjs-react-developer"
  echo "  - e2e-test-architect"
  echo "  - code-reviewer"
  echo "  - issue-detective"
}

# Function to list workflows
list_workflows() {
  echo "📋 Active Workflows:"
  echo ""
  WORKFLOWS=$(curl -s http://localhost:3001/api/workflows)
  if [ $? -ne 0 ]; then
    echo "❌ Failed to fetch workflows - server may not be running"
    return 1
  fi

  echo "$WORKFLOWS" | jq -r '.workflows[] | "🔄 \(.workflowId) (\(.status)) - \(.type) - Created: \(.createdAt | strftime("%Y-%m-%d %H:%M"))"' 2>/dev/null || {
    echo "❌ No workflows found or jq not available"
    echo "Raw response:"
    echo "$WORKFLOWS"
  }
}

# Function to auto-detect active workflow
auto_detect_workflow() {
  echo "🔍 Auto-detecting active workflow..."
  WORKFLOWS=$(curl -s http://localhost:3001/api/workflows)
  if [ $? -ne 0 ]; then
    echo "❌ Failed to fetch workflows"
    return 1
  fi

  # Find the most recent active workflow
  DETECTED_WF=$(echo "$WORKFLOWS" | jq -r '.workflows[] | select(.status == "running" or .status == "starting") | .workflowId' | head -n1)

  if [ -z "$DETECTED_WF" ] || [ "$DETECTED_WF" = "null" ]; then
    echo "⚠️ No active workflows found. Available workflows:"
    list_workflows
    return 1
  fi

  echo "✅ Found active workflow: $DETECTED_WF"
  echo "$DETECTED_WF"
}

# Handle special commands
if [ "$WORKFLOW_ID" = "list" ]; then
  list_workflows
  exit 0
fi

if [ "$WORKFLOW_ID" = "auto" ]; then
  if [ $# -lt 3 ]; then
    echo "Usage for auto mode: $0 auto <agent_type> <result_message>"
    exit 1
  fi

  DETECTED=$(auto_detect_workflow)
  if [ $? -ne 0 ]; then
    exit 1
  fi

  WORKFLOW_ID="$DETECTED"
  AGENT_TYPE="$2"
  RESULT_MESSAGE="$3"
elif [ $# -lt 3 ]; then
  show_usage
  exit 1
fi

echo "🔄 Processing workflow: $WORKFLOW_ID"
echo "👤 Agent: $AGENT_TYPE"
echo "📝 Result: $RESULT_MESSAGE"
echo ""

# Check if server is available
echo "🏥 Checking server health..."
if ! curl -s http://localhost:3001/api/health > /dev/null; then
  echo "❌ Server not available at http://localhost:3001"
  echo "💡 Start server with: cd engine && npm run server"
  exit 1
fi
echo "✅ Server is healthy"

# Get current workflow status
echo ""
echo "📊 Getting workflow status..."
TASK_INFO=$(curl -s "http://localhost:3001/api/status/$WORKFLOW_ID")

if [ $? -ne 0 ]; then
  echo "❌ Failed to get workflow status"
  exit 1
fi

TASK_ID=$(echo "$TASK_INFO" | jq -r '.pendingTaskId // empty')
WORKFLOW_STATUS=$(echo "$TASK_INFO" | jq -r '.status // "unknown"')

echo "📋 Workflow status: $WORKFLOW_STATUS"

if [ -z "$TASK_ID" ] || [ "$TASK_ID" = "null" ]; then
  echo "⚠️ No pending task found for workflow $WORKFLOW_ID"
  echo "🔍 Current workflow status:"
  echo "$TASK_INFO" | jq
  exit 1
fi

echo "🎯 Found pending task: $TASK_ID"

# Submit task result
echo ""
echo "📤 Submitting task result..."
RESPONSE=$(curl -s -X POST http://localhost:3001/api/agent-result \
  -H "Content-Type: application/json" \
  -d "{
    \"taskId\": \"$TASK_ID\",
    \"result\": \"$RESULT_MESSAGE\",
    \"success\": true,
    \"agentType\": \"$AGENT_TYPE\"
  }")

if [ $? -ne 0 ]; then
  echo "❌ Failed to submit task result"
  exit 1
fi

echo "✅ Task result submitted successfully"

# Parse response for next task info
NEXT_TASK=$(echo "$RESPONSE" | jq -r '.nextTask.taskId // empty')

if [ -n "$NEXT_TASK" ] && [ "$NEXT_TASK" != "null" ]; then
  NEXT_AGENT=$(echo "$RESPONSE" | jq -r '.nextTask.params.subagent_type // "unknown"')
  echo ""
  echo "🔄 Next task available:"
  echo "   Task ID: $NEXT_TASK"
  echo "   Agent: $NEXT_AGENT"
  echo ""
  echo "💡 After completing the $NEXT_AGENT task, run:"
  echo "   ./submit-task-result.sh $WORKFLOW_ID $NEXT_AGENT \"<result_description>\""
else
  echo ""
  echo "🎉 Workflow completed! No more tasks pending."
fi

echo ""
echo "🔍 Final workflow status:"
curl -s "http://localhost:3001/api/status/$WORKFLOW_ID" | jq '{status, completedTasks: .completedTasks | length, pendingTasks}'