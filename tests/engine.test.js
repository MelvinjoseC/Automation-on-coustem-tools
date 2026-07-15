const assert = require('assert');
const path = require('path');
const fs = require('fs');
const WorkflowEngine = require('../engine');

async function testVariableResolution() {
  console.log('Testing: Variable Resolution...');
  const engine = new WorkflowEngine(path.join(__dirname, '..'));
  
  const context = {
    workflow: {
      inputs: {
        host: 'localhost',
        port: 8080
      }
    },
    steps: {
      step1: {
        outputs: {
          success: true,
          code: 200
        }
      }
    }
  };

  // Test full expression replacement
  const r1 = engine.resolveValue('${workflow.inputs.host}', context);
  assert.strictEqual(r1, 'localhost');

  const r2 = engine.resolveValue('${workflow.inputs.port}', context);
  assert.strictEqual(r2, 8080);

  const r3 = engine.resolveValue('${steps.step1.outputs.success}', context);
  assert.strictEqual(r3, true);

  // Test string interpolation
  const r4 = engine.resolveValue('http://${workflow.inputs.host}:${workflow.inputs.port}/api', context);
  assert.strictEqual(r4, 'http://localhost:8080/api');

  console.log('✓ Variable Resolution Passed\n');
}

async function testWorkflowLoading() {
  console.log('Testing: Workflow Loading...');
  const engine = new WorkflowEngine(path.join(__dirname, '..'));
  
  const workflow = engine.loadWorkflow('health_check_alert');
  assert.strictEqual(workflow.name, 'health_check_alert');
  assert.ok(workflow.steps.length >= 2);
  
  console.log('✓ Workflow Loading Passed\n');
}

async function testEngineExecution() {
  console.log('Testing: Workflow Engine Execution...');
  const engine = new WorkflowEngine(path.join(__dirname, '..'));
  
  // Run mock workflow
  const result = await engine.runWorkflow('health_check_alert', {
    pingUrl: 'https://httpbin.org/get'
  });
  
  assert.strictEqual(result.status, 'SUCCESS');
  assert.ok(result.runId);
  assert.ok(result.steps.check_local_system);
  assert.ok(result.steps.ping_website);
  
  // Verify outputs
  const systemOutputs = result.steps.check_local_system.outputs;
  assert.ok(typeof systemOutputs.cpuLoad === 'number');
  assert.ok(typeof systemOutputs.freeMemory === 'number');
  
  const apiOutputs = result.steps.ping_website.outputs;
  assert.strictEqual(apiOutputs.status, 200);
  
  console.log('✓ Workflow Engine Execution Passed\n');
}

async function runAll() {
  try {
    await testVariableResolution();
    await testWorkflowLoading();
    await testEngineExecution();
    console.log('All tests passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  }
}

runAll();
