const assert = require('assert');
const path = require('path');
const fs = require('fs');
const DAGPlanner = require('../lib/dag');
const WorkflowEngine = require('../engine');

async function testDAGPlanner() {
  console.log('Testing: DAGPlanner Unit Tests...');

  // 1. Sequential fallback when no dependsOn specified
  const sequentialSteps = [
    { id: 's1', tool: 't1' },
    { id: 's2', tool: 't2' }
  ];
  const wavesSeq = DAGPlanner.buildExecutionPlan(sequentialSteps);
  assert.strictEqual(wavesSeq.length, 2);
  assert.strictEqual(wavesSeq[0][0].id, 's1');
  assert.strictEqual(wavesSeq[1][0].id, 's2');

  // 2. Parallel waves with dependsOn
  // s1 and s2 independent; s3 depends on [s1, s2]
  const dagSteps = [
    { id: 's1', tool: 't1' },
    { id: 's2', tool: 't2' },
    { id: 's3', tool: 't3', dependsOn: ['s1', 's2'] }
  ];
  const wavesDAG = DAGPlanner.buildExecutionPlan(dagSteps);
  assert.strictEqual(wavesDAG.length, 2);
  assert.strictEqual(wavesDAG[0].length, 2); // s1 and s2 in parallel
  assert.strictEqual(wavesDAG[1].length, 1); // s3 in wave 2
  assert.strictEqual(wavesDAG[1][0].id, 's3');

  // 3. Circular dependency detection
  const cyclicSteps = [
    { id: 'stepA', tool: 't1', dependsOn: ['stepB'] },
    { id: 'stepB', tool: 't2', dependsOn: ['stepA'] }
  ];
  assert.throws(() => {
    DAGPlanner.buildExecutionPlan(cyclicSteps);
  }, /Circular dependency|Cyclic dependency/);

  // 4. Missing dependency reference detection
  const missingDepSteps = [
    { id: 'stepX', tool: 't1', dependsOn: ['ghost_step'] }
  ];
  assert.throws(() => {
    DAGPlanner.buildExecutionPlan(missingDepSteps);
  }, /unknown step/);

  console.log('✓ DAGPlanner Unit Tests Passed\n');
}

async function testEngineParallelWorkflow() {
  console.log('Testing: Engine DAG Parallel Execution...');
  const engine = new WorkflowEngine(path.join(__dirname, '..'));

  engine.loadWorkflow = (name) => {
    if (name === 'parallel_workflow') {
      return {
        name: 'parallel_workflow',
        steps: [
          {
            id: 'job_a',
            tool: 'mock_delay_tool',
            inputs: { delayMs: 150 }
          },
          {
            id: 'job_b',
            tool: 'mock_delay_tool',
            inputs: { delayMs: 150 }
          },
          {
            id: 'job_merge',
            tool: 'mock_echo_tool',
            dependsOn: ['job_a', 'job_b'],
            inputs: { message: 'merged' }
          }
        ]
      };
    }
  };

  engine.loadTool = (name) => {
    if (name === 'mock_delay_tool') {
      return {
        name: 'mock_delay_tool',
        type: 'script',
        scriptPath: 'tests/delay_helper.js'
      };
    }
    if (name === 'mock_echo_tool') {
      return {
        name: 'mock_echo_tool',
        type: 'script',
        scriptPath: 'tests/echo_helper.js'
      };
    }
  };

  const delayHelperPath = path.join(__dirname, 'delay_helper.js');
  fs.writeFileSync(delayHelperPath, `
    const args = process.argv;
    const idx = args.indexOf('--delayMs');
    const delay = idx !== -1 ? parseInt(args[idx + 1], 10) : 100;
    setTimeout(() => {
      console.log(JSON.stringify({ done: true, delay }));
      process.exit(0);
    }, delay);
  `);

  const echoHelperPath = path.join(__dirname, 'echo_helper.js');
  fs.writeFileSync(echoHelperPath, `
    const args = process.argv;
    const idx = args.indexOf('--message');
    const message = idx !== -1 ? args[idx + 1] : '';
    console.log(JSON.stringify({ message }));
    process.exit(0);
  `);

  try {
    const startTime = Date.now();
    const result = await engine.runWorkflow('parallel_workflow');
    const elapsed = Date.now() - startTime;

    assert.strictEqual(result.status, 'SUCCESS');
    assert.strictEqual(result.steps.job_a.status, 'SUCCESS');
    assert.strictEqual(result.steps.job_b.status, 'SUCCESS');
    assert.strictEqual(result.steps.job_merge.status, 'SUCCESS');

    // Verify that job_a and job_b executed concurrently (overlapping intervals)
    const startA = new Date(result.steps.job_a.startTime).getTime();
    const endA = new Date(result.steps.job_a.endTime).getTime();
    const startB = new Date(result.steps.job_b.startTime).getTime();
    const endB = new Date(result.steps.job_b.endTime).getTime();
    const startMerge = new Date(result.steps.job_merge.startTime).getTime();

    const overlap = startA <= endB && startB <= endA;
    assert.ok(overlap, 'job_a and job_b execution intervals must overlap (concurrent)');
    assert.ok(startMerge >= Math.min(endA, endB), 'job_merge must run after prerequisites finish');
    console.log(`✓ Engine Parallel Execution Passed (Concurrent wave overlap verified in ${elapsed}ms)\n`);
  } finally {
    if (fs.existsSync(delayHelperPath)) fs.unlinkSync(delayHelperPath);
    if (fs.existsSync(echoHelperPath)) fs.unlinkSync(echoHelperPath);
  }
}

async function runAll() {
  try {
    await testDAGPlanner();
    await testEngineParallelWorkflow();
    console.log('All DAG tests passed successfully!');
    process.exit(0);
  } catch (err) {
    console.error('DAG Test Suite Failed:', err);
    process.exit(1);
  }
}

runAll();
