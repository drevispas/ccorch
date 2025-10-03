#!/usr/bin/env tsx
/**
 * Test Workflow Execution Features
 * Tests ReactiveExecutionEngine and workflow processing from Sessions 4-5
 */

import { ReactiveExecutionEngine } from '../../core/execution/reactive-execution-engine';
import { WorkflowParser } from '../../core/workflow/parser';
import { WorkflowCompiler } from '../../core/workflow/compiler';
import { WorkflowOptimizer } from '../../core/workflow/optimizer';
import { TaskScheduler } from '../../core/execution/task-scheduler';
import { CircuitBreaker } from '../../core/execution/circuit-breaker';
import { RetryManager } from '../../core/execution/retry-manager';
import { TaskPriority } from '../../core/execution/types';

async function testWorkflowExecution() {
  console.log('🚀 Testing Workflow Execution Features\n');
  console.log('======================================\n');

  // Initialize components
  const parser = new WorkflowParser();
  const compiler = new WorkflowCompiler();
  const optimizer = new WorkflowOptimizer();
  const engine = new ReactiveExecutionEngine();

  // Test 1: Simple Sequential Workflow
  console.log('1️⃣ Testing Simple Sequential Workflow...');

  const simpleWorkflow = {
    name: 'simple-test',
    version: '1.0.0',
    pipeline: [
      {
        id: 'task-1',
        type: 'task',
        name: 'First Task',
        agentName: 'test-agent',
        complexity: 'simple'
      },
      {
        id: 'task-2',
        type: 'task',
        name: 'Second Task',
        agentName: 'test-agent',
        complexity: 'simple'
      }
    ]
  };

  const parsedSimple = await parser.parse(simpleWorkflow, 'json');
  const compiledSimple = compiler.compile(parsedSimple);

  console.log(`✅ Compiled workflow with ${compiledSimple.stages.size} stages`);

  // Test 2: Parallel Execution
  console.log('\n2️⃣ Testing Parallel Workflow Execution...');

  const parallelWorkflow = {
    name: 'parallel-test',
    version: '1.0.0',
    pipeline: [
      {
        id: 'parallel-stage',
        type: 'parallel',
        name: 'Parallel Tasks',
        stages: [
          { id: 'p1', type: 'task', name: 'Parallel 1', agentName: 'test-agent' },
          { id: 'p2', type: 'task', name: 'Parallel 2', agentName: 'test-agent' },
          { id: 'p3', type: 'task', name: 'Parallel 3', agentName: 'test-agent' }
        ]
      }
    ]
  };

  const parsedParallel = await parser.parse(parallelWorkflow, 'json');
  const compiledParallel = compiler.compile(parsedParallel);
  const optimizedParallel = optimizer.optimize(compiledParallel);

  console.log(`✅ Optimized parallel workflow`);
  console.log(`   Original stages: ${compiledParallel.stages.size}`);
  console.log(`   Optimized stages: ${optimizedParallel.stages.size}`);

  // Test 3: Conditional Logic
  console.log('\n3️⃣ Testing Conditional Workflow...');

  const conditionalWorkflow = {
    name: 'conditional-test',
    version: '1.0.0',
    pipeline: [
      {
        id: 'check',
        type: 'task',
        name: 'Check Condition',
        agentName: 'test-agent'
      },
      {
        id: 'branch',
        type: 'conditional',
        name: 'Decision Branch',
        condition: 'result.value > 50',
        then: {
          id: 'high-path',
          type: 'task',
          name: 'High Value Path',
          agentName: 'test-agent'
        },
        else: {
          id: 'low-path',
          type: 'task',
          name: 'Low Value Path',
          agentName: 'test-agent'
        }
      }
    ]
  };

  const parsedConditional = await parser.parse(conditionalWorkflow, 'json');
  const compiledConditional = compiler.compile(parsedConditional);

  console.log(`✅ Compiled conditional workflow with branching logic`);

  // Test 4: Loop Execution
  console.log('\n4️⃣ Testing Loop Workflow...');

  const loopWorkflow = {
    name: 'loop-test',
    version: '1.0.0',
    pipeline: [
      {
        id: 'loop-stage',
        type: 'loop',
        name: 'Process Items',
        items: [1, 2, 3, 4, 5],
        body: {
          id: 'process',
          type: 'task',
          name: 'Process Item',
          agentName: 'test-agent'
        }
      }
    ]
  };

  const parsedLoop = await parser.parse(loopWorkflow, 'json');
  const compiledLoop = compiler.compile(parsedLoop);

  console.log(`✅ Compiled loop workflow for ${loopWorkflow.pipeline[0].items.length} items`);

  // Test 5: Task Scheduling
  console.log('\n5️⃣ Testing Task Scheduler...');

  const scheduler = new TaskScheduler({
    workerPoolSize: 5,
    queueCapacity: 100,
    schedulingInterval: 50
  });

  scheduler.start();

  // Schedule tasks with different priorities
  const taskIds = [];
  taskIds.push(scheduler.scheduleTask(
    { id: 'low-1', stageId: 's1', type: 'agent', agentName: 'test' },
    TaskPriority.LOW
  ));
  taskIds.push(scheduler.scheduleTask(
    { id: 'critical-1', stageId: 's2', type: 'agent', agentName: 'test' },
    TaskPriority.CRITICAL
  ));
  taskIds.push(scheduler.scheduleTask(
    { id: 'high-1', stageId: 's3', type: 'agent', agentName: 'test' },
    TaskPriority.HIGH
  ));

  const stats = scheduler.getQueueStats();
  console.log(`✅ Scheduled ${taskIds.length} tasks`);
  console.log(`   Queue length: ${stats.length}`);
  console.log(`   Priority distribution:`, stats.priorityDistribution);

  await scheduler.shutdown(true);

  // Test 6: Circuit Breaker
  console.log('\n6️⃣ Testing Circuit Breaker...');

  const circuitBreaker = new CircuitBreaker('test-service', {
    failureThreshold: 3,
    resetTimeout: 1000,
    halfOpenRequests: 2
  });

  // Test normal operation
  for (let i = 0; i < 3; i++) {
    try {
      await circuitBreaker.execute(async () => {
        return { success: true, data: `Request ${i}` };
      });
      console.log(`   ✅ Request ${i} succeeded`);
    } catch (error) {
      console.log(`   ❌ Request ${i} failed`);
    }
  }

  console.log(`   Circuit state: ${circuitBreaker.getState()}`);

  // Test 7: Retry Manager
  console.log('\n7️⃣ Testing Retry Manager...');

  const retryManager = new RetryManager();

  let attemptCount = 0;
  const task = {
    id: 'retry-test',
    stageId: 'stage-1',
    type: 'agent' as const,
    agentName: 'test-agent'
  };

  try {
    await retryManager.executeWithRetry(
      task,
      async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Simulated failure');
        }
        return { success: true };
      },
      {
        strategy: 'exponential',
        maxRetries: 3,
        initialDelay: 100,
        maxDelay: 1000
      }
    );
    console.log(`✅ Task succeeded after ${attemptCount} attempts`);
  } catch (error) {
    console.log(`❌ Task failed after ${attemptCount} attempts`);
  }

  // Test 8: Reactive Execution with Events
  console.log('\n8️⃣ Testing Reactive Execution Engine...');

  let eventCount = 0;
  let metricsCount = 0;

  const execution = engine.execute(compiledSimple);

  // Subscribe to events
  const eventSub = execution.events$.subscribe(event => {
    console.log(`   📡 Event: ${event.type} - ${event.timestamp}`);
    eventCount++;
  });

  const metricsSub = execution.metrics$.subscribe(metrics => {
    console.log(`   📊 Metrics: Tasks=${metrics.tasksCompleted}/${metrics.tasksTotal}`);
    metricsCount++;
  });

  // Wait for completion
  setTimeout(() => {
    console.log(`✅ Received ${eventCount} events and ${metricsCount} metrics updates`);
    eventSub.unsubscribe();
    metricsSub.unsubscribe();
  }, 2000);

  // Test 9: Workflow Optimization
  console.log('\n9️⃣ Testing Workflow Optimization...');

  const complexWorkflow = {
    name: 'complex-test',
    version: '1.0.0',
    pipeline: [
      {
        id: 'seq-1',
        type: 'sequential',
        name: 'Sequential Stage',
        stages: [
          { id: 't1', type: 'task', name: 'Task 1', agentName: 'agent1' },
          { id: 't2', type: 'task', name: 'Task 2', agentName: 'agent2' }
        ]
      },
      {
        id: 'par-1',
        type: 'parallel',
        name: 'Parallel Stage',
        stages: [
          { id: 't3', type: 'task', name: 'Task 3', agentName: 'agent1' },
          { id: 't4', type: 'task', name: 'Task 4', agentName: 'agent2' },
          { id: 't5', type: 'task', name: 'Task 5', agentName: 'agent3' }
        ]
      }
    ]
  };

  const parsedComplex = await parser.parse(complexWorkflow, 'json');
  const compiledComplex = compiler.compile(parsedComplex);
  const optimizedComplex = optimizer.optimize(compiledComplex);

  console.log('✅ Optimization Results:');
  console.log(`   Parallelization opportunities: ${optimizedComplex.metadata?.optimizations?.parallelization || 0}`);
  console.log(`   Dead code eliminated: ${optimizedComplex.metadata?.optimizations?.deadCodeElimination || 0}`);
  console.log(`   Constants folded: ${optimizedComplex.metadata?.optimizations?.constantFolding || 0}`);

  console.log('\n======================================');
  console.log('✨ Workflow Execution Tests Completed!\n');
}

// Run tests
testWorkflowExecution().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});