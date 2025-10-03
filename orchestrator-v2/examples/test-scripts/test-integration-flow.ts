#!/usr/bin/env tsx

/**
 * Integration Test Flow
 * Tests the complete workflow lifecycle from initialization through execution
 */

import axios from 'axios';
import WebSocket from 'ws';

const API_URL = 'http://localhost:3001/api';
const WS_URL = 'ws://localhost:3002/ws';

interface WorkflowResponse {
  workflowId: string;
  status: string;
  workflowType: string;
  taskDescription: string;
}

interface TodosResponse {
  todos: Array<{
    content: string;
    status: string;
    activeForm: string;
  }>;
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testIntegrationFlow() {
  console.log('🚀 Starting integration test...\n');

  try {
    // 1. Check health first
    console.log('0️⃣ Checking server health...');
    const healthResponse = await axios.get(`${API_URL}/health`);
    console.log(`   Server status: ${healthResponse.data.status}`);
    console.log(`   Initialized: ${healthResponse.data.initialized}`);

    // 2. Initialize orchestrator if needed
    if (!healthResponse.data.initialized) {
      console.log('\n1️⃣ Initializing orchestrator...');
      const initResponse = await axios.post(`${API_URL}/init`, {
        logLevel: 'info',
        enableMetrics: true
      });
      console.log(`   Status: ${initResponse.data.status}`);
      console.log(`   Available workflows: ${initResponse.data.availableWorkflows.join(', ')}`);
    } else {
      console.log('\n1️⃣ Orchestrator already initialized');
    }

    // 3. Connect WebSocket FIRST to capture all events
    console.log('\n2️⃣ Connecting WebSocket...');
    const ws = new WebSocket(WS_URL);

    const events: any[] = [];

    // Set up event listener before connecting
    ws.on('message', (data) => {
      const message = JSON.parse(data.toString());
      events.push(message);

      if (message.type !== 'pong') {
        console.log(`📨 Event: ${message.type}`);
        if (message.payload?.workflowId) {
          console.log(`   Workflow: ${message.payload.workflowId}`);
        }
      }
    });

    await new Promise<void>((resolve, reject) => {
      ws.on('open', () => {
        console.log('✅ WebSocket connected\n');

        // Send a ping to test connection
        ws.send(JSON.stringify({
          id: 'test-ping',
          type: 'ping',
          timestamp: new Date()
        }));

        resolve();
      });

      ws.on('error', (error) => {
        console.error('❌ WebSocket error:', error.message);
        reject(error);
      });

      setTimeout(() => reject(new Error('WebSocket connection timeout')), 5000);
    });

    // 4. NOW Execute workflow (after WebSocket is connected)
    console.log('3️⃣ Executing workflow...');
    const executeResponse = await axios.post<WorkflowResponse>(`${API_URL}/execute`, {
      workflowType: 'testing',
      taskDescription: 'Integration test workflow for comprehensive testing',
      projectDirectory: '.',
      complexity: 'moderate'
    });

    const workflowId = executeResponse.data.workflowId;
    console.log(`✅ Workflow started: ${workflowId}\n`);

    // 5. Monitor todos
    console.log('4️⃣ Monitoring todos...');

    let hasTodos = false;
    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts && !hasTodos) {
      try {
        const todosResponse = await axios.get<TodosResponse>(`${API_URL}/todos/${workflowId}`);
        if (todosResponse.data.todos && todosResponse.data.todos.length > 0) {
          console.log(`   Found ${todosResponse.data.todos.length} todos`);
          hasTodos = true;

          // Display first few todos
          todosResponse.data.todos.slice(0, 3).forEach((todo, index) => {
            console.log(`   ${index + 1}. ${todo.content} [${todo.status}]`);
          });
          if (todosResponse.data.todos.length > 3) {
            console.log(`   ... and ${todosResponse.data.todos.length - 3} more`);
          }
        } else {
          process.stdout.write('.');
        }
      } catch (error: any) {
        // 404 is expected if todos aren't ready yet
        if (error.response?.status !== 404) {
          console.log(`\n   Error checking todos: ${error.message}`);
        } else {
          process.stdout.write('.');
        }
      }

      attempts++;
      await delay(1000);
    }

    if (!hasTodos) {
      console.log('\n   ⚠️  No todos found - workflow may be running differently');
    }

    // 6. Check workflow status
    console.log('\n5️⃣ Checking workflow status...');
    try {
      const statusUrl = `${API_URL}/status/${workflowId}`;
      const statusResponse = await axios.get(statusUrl);
      console.log(`   Status: ${statusResponse.data.status || 'Not available'}`);
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log('   Status endpoint not implemented or workflow not found');
      } else {
        console.log(`   Error: ${error.message}`);
      }
    }

    // 7. Wait a bit more for events
    console.log('\n6️⃣ Waiting for workflow events...');
    await delay(3000);

    // 8. Check events received
    const workflowEvents = events.filter(e =>
      e.type && e.type.startsWith('workflow:')
    );

    console.log(`\n📊 Received ${events.length} WebSocket events:`);
    const eventTypes = events.reduce((acc, e) => {
      acc[e.type] = (acc[e.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    Object.entries(eventTypes).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

    ws.close();

    // 9. Final health check
    console.log('\n7️⃣ Final health check...');
    const finalHealth = await axios.get(`${API_URL}/health`);
    console.log(`   Active workflows: ${finalHealth.data.activeWorkflows}`);
    console.log(`   WebSocket running: ${finalHealth.data.websocket?.running}`);

    // Success criteria
    const success = events.length > 0 &&
                   workflowEvents.length > 0 &&
                   healthResponse.data.status === 'healthy';

    if (success) {
      console.log('\n✨ Integration test completed successfully!');
    } else {
      console.log('\n⚠️  Integration test completed with warnings');
      if (events.length === 0) {
        console.log('   - No WebSocket events received');
      }
      if (workflowEvents.length === 0) {
        console.log('   - No workflow events received');
      }
    }

    process.exit(success ? 0 : 1);

  } catch (error: any) {
    console.error('\n❌ Test failed:', error.message);

    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Make sure the server is running:');
      console.log('   npm run dev');
    }

    process.exit(1);
  }
}

// Run the test
testIntegrationFlow().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});