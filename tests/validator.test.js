const assert = require('assert');
const { SchemaValidator } = require('../lib/validator');

function runValidatorTests() {
  console.log('Testing: SchemaValidator Unit Tests...');

  // 1. Valid tool
  const validTool = {
    name: 'valid_script_tool',
    type: 'script',
    scriptPath: 'scripts/sample.js',
    inputs: [
      { name: 'target', type: 'string', required: true },
      { name: 'retries', type: 'number', default: 3 }
    ]
  };
  const r1 = SchemaValidator.validateTool(validTool);
  assert.strictEqual(r1.valid, true);
  assert.strictEqual(r1.errors.length, 0);

  // 2. Invalid tool - missing type & scriptPath
  const invalidTool1 = {
    name: 'broken_tool'
  };
  const r2 = SchemaValidator.validateTool(invalidTool1);
  assert.strictEqual(r2.valid, false);
  assert.ok(r2.errors.some(e => e.includes('type')));

  // 3. Invalid tool - invalid name characters
  const invalidTool2 = {
    name: 'bad name with spaces!',
    type: 'script',
    scriptPath: 'scripts/sample.js'
  };
  const r3 = SchemaValidator.validateTool(invalidTool2);
  assert.strictEqual(r3.valid, false);
  assert.ok(r3.errors.some(e => e.includes('alphanumeric')));

  // 4. Valid workflow
  const validWorkflow = {
    name: 'sample_workflow',
    steps: [
      { id: 'step_1', tool: 'valid_script_tool', timeout: 5000 },
      { id: 'step_2', tool: 'valid_script_tool', retries: 2, retryDelay: 500 }
    ]
  };
  const r4 = SchemaValidator.validateWorkflow(validWorkflow, ['valid_script_tool']);
  assert.strictEqual(r4.valid, true);
  assert.strictEqual(r4.errors.length, 0);

  // 5. Invalid workflow - empty steps
  const invalidWf1 = {
    name: 'empty_steps',
    steps: []
  };
  const r5 = SchemaValidator.validateWorkflow(invalidWf1);
  assert.strictEqual(r5.valid, false);
  assert.ok(r5.errors.some(e => e.includes('non-empty')));

  // 6. Invalid workflow - duplicate step IDs
  const invalidWf2 = {
    name: 'duplicate_ids',
    steps: [
      { id: 'step_a', tool: 'tool1' },
      { id: 'step_a', tool: 'tool2' }
    ]
  };
  const r6 = SchemaValidator.validateWorkflow(invalidWf2);
  assert.strictEqual(r6.valid, false);
  assert.ok(r6.errors.some(e => e.includes('Duplicate step ID')));

  // 7. Invalid workflow - unknown tool reference
  const invalidWf3 = {
    name: 'unknown_tool_wf',
    steps: [
      { id: 'step_x', tool: 'non_existent_tool' }
    ]
  };
  const r7 = SchemaValidator.validateWorkflow(invalidWf3, ['tool1', 'tool2']);
  assert.strictEqual(r7.valid, false);
  assert.ok(r7.errors.some(e => e.includes('unknown tool')));

  console.log('✓ All SchemaValidator Unit Tests Passed!\n');
}

runValidatorTests();
