const assert = require('assert');
const path = require('path');
const fs = require('fs');
const http = require('http');
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

let mockServer;
let mockPort;

function startMockServer() {
  return new Promise((resolve, reject) => {
    mockServer = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        res.setHeader('Content-Type', 'application/json');
        if (req.method === 'POST') {
          res.writeHead(200);
          res.end(JSON.stringify({
            headers: { 'X-Test-Header': req.headers['x-test-header'] },
            data: body
          }));
        } else {
          res.writeHead(200);
          res.end(JSON.stringify({ status: 'ok', url: req.url }));
        }
      });
    });
    mockServer.listen(0, '127.0.0.1', () => {
      mockPort = mockServer.address().port;
      resolve(mockPort);
    });
    mockServer.on('error', reject);
  });
}

async function testEngineExecution() {
  console.log('Testing: Workflow Engine Execution...');
  const engine = new WorkflowEngine(path.join(__dirname, '..'));
  
  // Run mock workflow with local mock server
  const result = await engine.runWorkflow('health_check_alert', {
    pingUrl: `http://127.0.0.1:${mockPort}/get`
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

  // Test POST with body and headers using local mock server
  const inputs = {
    url: `http://127.0.0.1:${mockPort}/post`,
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

async function testStepTimeouts() {
  console.log('Testing: Step Timeouts...');
  const engine = new WorkflowEngine(path.join(__dirname, '..'));

  // Mock loadWorkflow and loadTool
  engine.loadWorkflow = (name) => {
    if (name === 'timeout_workflow') {
      return {
        name: 'timeout_workflow',
        steps: [
          {
            id: 'sleep_step',
            tool: 'mock_sleep_tool',
            timeout: 500 // 500ms timeout
          }
        ]
      };
    }
  };

  engine.loadTool = (name) => {
    if (name === 'mock_sleep_tool') {
      return {
        name: 'mock_sleep_tool',
        type: 'script',
        scriptPath: 'tests/sleep_helper.js'
      };
    }
  };

  // Write a temporary helper script that sleeps for 2 seconds
  const helperPath = path.join(__dirname, 'sleep_helper.js');
  fs.writeFileSync(helperPath, 'setTimeout(() => { console.log(JSON.stringify({ok: true})); }, 2000);');

  try {
    const result = await engine.runWorkflow('timeout_workflow');
    assert.strictEqual(result.status, 'FAILED');
    assert.ok(result.error.includes('timed out'));
    assert.strictEqual(result.steps.sleep_step.status, 'FAILED');
    assert.ok(result.steps.sleep_step.error.includes('timed out'));
    console.log('✓ Step Timeouts Passed\n');
  } finally {
    if (fs.existsSync(helperPath)) {
      fs.unlinkSync(helperPath);
    }
  }
}

async function testStepRetries() {
  console.log('Testing: Step Retries...');
  const engine = new WorkflowEngine(path.join(__dirname, '..'));

  engine.loadWorkflow = (name) => {
    if (name === 'retry_workflow') {
      return {
        name: 'retry_workflow',
        steps: [
          {
            id: 'retry_step',
            tool: 'mock_retry_tool',
            retries: 2,
            retryDelay: 100
          }
        ]
      };
    }
  };

  engine.loadTool = (name) => {
    if (name === 'mock_retry_tool') {
      return {
        name: 'mock_retry_tool',
        type: 'script',
        scriptPath: 'tests/retry_helper.js'
      };
    }
  };

  const counterFile = path.join(__dirname, 'retry_counter.txt');
  fs.writeFileSync(counterFile, '0');

  const helperPath = path.join(__dirname, 'retry_helper.js');
  fs.writeFileSync(helperPath, `
    const fs = require('fs');
    const path = require('path');
    const file = path.join(__dirname, 'retry_counter.txt');
    const val = parseInt(fs.readFileSync(file, 'utf8'), 10);
    if (val < 1) {
      fs.writeFileSync(file, String(val + 1));
      process.exit(1); // Fail
    } else {
      console.log(JSON.stringify({ ok: true }));
      process.exit(0); // Success
    }
  `);

  try {
    const result = await engine.runWorkflow('retry_workflow');
    assert.strictEqual(result.status, 'SUCCESS');
    assert.strictEqual(result.steps.retry_step.status, 'SUCCESS');
    console.log('✓ Step Retries Passed\n');
  } finally {
    if (fs.existsSync(helperPath)) fs.unlinkSync(helperPath);
    if (fs.existsSync(counterFile)) fs.unlinkSync(counterFile);
  }
}

async function testConditionalSteps() {
  console.log('Testing: Conditional Steps...');
  const engine = new WorkflowEngine(path.join(__dirname, '..'));

  engine.loadWorkflow = (name) => {
    if (name === 'conditional_workflow') {
      return {
        name: 'conditional_workflow',
        steps: [
          {
            id: 'step1',
            tool: 'mock_tool',
            inputs: { value: 'yes' }
          },
          {
            id: 'step2',
            tool: 'mock_tool',
            if: '${steps.step1.outputs.value} == yes',
            inputs: { value: 'run_me' }
          },
          {
            id: 'step3',
            tool: 'mock_tool',
            if: '${steps.step1.outputs.value} == no',
            inputs: { value: 'skip_me' }
          }
        ]
      };
    }
  };

  engine.loadTool = (name) => {
    if (name === 'mock_tool') {
      return {
        name: 'mock_tool',
        type: 'script',
        scriptPath: 'tests/echo_helper.js'
      };
    }
  };

  const helperPath = path.join(__dirname, 'echo_helper.js');
  fs.writeFileSync(helperPath, `
    const args = process.argv;
    const valIndex = args.indexOf('--value');
    const val = valIndex !== -1 ? args[valIndex + 1] : '';
    console.log(JSON.stringify({ value: val }));
  `);

  try {
    const result = await engine.runWorkflow('conditional_workflow');
    assert.strictEqual(result.status, 'SUCCESS');
    assert.strictEqual(result.steps.step1.status, 'SUCCESS');
    assert.strictEqual(result.steps.step2.status, 'SUCCESS');
    assert.strictEqual(result.steps.step3.status, 'SKIPPED');
    assert.strictEqual(result.steps.step2.outputs.value, 'run_me');
    assert.strictEqual(result.steps.step3.outputs, undefined);
    console.log('✓ Conditional Steps Passed\n');
  } finally {
    if (fs.existsSync(helperPath)) {
      fs.unlinkSync(helperPath);
    }
  }
}

async function runAll() {
  try {
    await startMockServer();
    await testVariableResolution();
    await testWorkflowLoading();
    await testEngineExecution();
    await testApiAdvancedFeatures();
    await testStepTimeouts();
    await testStepRetries();
    await testConditionalSteps();
    console.log('All tests passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('Test Suite Failed:', err);
    process.exit(1);
  } finally {
    if (mockServer) {
      mockServer.close();
    }
  }
}

runAll();
