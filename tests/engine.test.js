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

async function testApiAdvancedFeatures() {
  console.log('Testing: API Advanced Features (POST, headers, body)...');
  const engine = new WorkflowEngine(path.join(__dirname, '..'));

  const tool = {
    type: 'api'
  };

  // Test POST with body and headers
  const inputs = {
    url: 'https://httpbin.org/post',
    method: 'POST',
    headers: {
      'X-Test-Header': 'ToolFlowValue'
    },
    body: {
      message: 'hello toolflow'
    }
  };

  const result = await engine.executeApiTool(tool, inputs, () => {});
  assert.strictEqual(result.status, 200);

  const parsedBody = JSON.parse(result.body);
  assert.strictEqual(parsedBody.headers['X-Test-Header'], 'ToolFlowValue');
  assert.deepStrictEqual(JSON.parse(parsedBody.data), { message: 'hello toolflow' });

  console.log('✓ API Advanced Features Passed\n');
}

async function runAll() {
  try {
    await testVariableResolution();
    await testWorkflowLoading();
    await testEngineExecution();
    await testApiAdvancedFeatures();
    console.log('All tests passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  }
}

runAll();
