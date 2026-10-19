const assert = require('assert');
const ExpressionEvaluator = require('../lib/evaluator');

function runEvaluatorTests() {
  console.log('Testing: ExpressionEvaluator Unit Tests...');

  const context = {
    workflow: {
      inputs: {
        host: 'api.service.internal',
        port: 443,
        enabled: true,
        threshold: 75.5,
        tags: ['prod', 'primary']
      }
    },
    steps: {
      query: {
        outputs: {
          rowCount: 42,
          status: 'HEALTHY',
          code: 200,
          meta: {
            latency: 15
          }
        }
      }
    }
  };

  // 1. Raw Value Extraction
  assert.strictEqual(ExpressionEvaluator.resolveValue('${workflow.inputs.host}', context), 'api.service.internal');
  assert.strictEqual(ExpressionEvaluator.resolveValue('${workflow.inputs.port}', context), 443);
  assert.strictEqual(ExpressionEvaluator.resolveValue('${workflow.inputs.enabled}', context), true);
  assert.strictEqual(ExpressionEvaluator.resolveValue('${steps.query.outputs.rowCount}', context), 42);
  assert.strictEqual(ExpressionEvaluator.resolveValue('${steps.query.outputs.meta.latency}', context), 15);

  // 2. Bracket array indexing
  assert.strictEqual(ExpressionEvaluator.resolveValue('${workflow.inputs.tags[0]}', context), 'prod');
  assert.strictEqual(ExpressionEvaluator.resolveValue('${workflow.inputs.tags[1]}', context), 'primary');

  // 3. String Interpolation
  const interpolated = ExpressionEvaluator.resolveValue('https://${workflow.inputs.host}:${workflow.inputs.port}/v1', context);
  assert.strictEqual(interpolated, 'https://api.service.internal:443/v1');

  // 4. Environment Variables
  process.env.TEST_APP_REGION = 'us-east-1';
  assert.strictEqual(ExpressionEvaluator.resolveValue('${env.TEST_APP_REGION}', context), 'us-east-1');
  delete process.env.TEST_APP_REGION;

  // 5. Conditions: Equality and Inequality
  assert.strictEqual(ExpressionEvaluator.evaluateCondition('${steps.query.outputs.status} == HEALTHY', context), true);
  assert.strictEqual(ExpressionEvaluator.evaluateCondition('${steps.query.outputs.status} != DEGRADED', context), true);
  assert.strictEqual(ExpressionEvaluator.evaluateCondition('${steps.query.outputs.status} == DEGRADED', context), false);

  // 6. Conditions: Numeric Comparisons (<, <=, >, >=)
  assert.strictEqual(ExpressionEvaluator.evaluateCondition('${steps.query.outputs.rowCount} > 10', context), true);
  assert.strictEqual(ExpressionEvaluator.evaluateCondition('${steps.query.outputs.rowCount} >= 42', context), true);
  assert.strictEqual(ExpressionEvaluator.evaluateCondition('${steps.query.outputs.rowCount} < 50', context), true);
  assert.strictEqual(ExpressionEvaluator.evaluateCondition('${steps.query.outputs.rowCount} <= 42', context), true);
  assert.strictEqual(ExpressionEvaluator.evaluateCondition('${steps.query.outputs.rowCount} < 40', context), false);

  // 7. Conditions: Logical Operators (&& and ||)
  assert.strictEqual(
    ExpressionEvaluator.evaluateCondition('${steps.query.outputs.rowCount} > 10 && ${steps.query.outputs.code} == 200', context),
    true
  );
  assert.strictEqual(
    ExpressionEvaluator.evaluateCondition('${steps.query.outputs.rowCount} < 10 && ${steps.query.outputs.code} == 200', context),
    false
  );
  assert.strictEqual(
    ExpressionEvaluator.evaluateCondition('${steps.query.outputs.rowCount} < 10 || ${steps.query.outputs.code} == 200', context),
    true
  );

  // 8. Missing / Undefined values
  assert.strictEqual(ExpressionEvaluator.resolveValue('${workflow.inputs.nonexistent}', context), undefined);
  assert.strictEqual(ExpressionEvaluator.evaluateCondition('${workflow.inputs.nonexistent} == undefined', context), true);

  console.log('✓ All ExpressionEvaluator Unit Tests Passed!\n');
}

runEvaluatorTests();
