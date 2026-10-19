const { spawnSync } = require('child_process');
const path = require('path');

const testSuites = [
  'evaluator.test.js',
  'validator.test.js',
  'dag.test.js',
  'engine.test.js'
];

console.log('====================================================');
console.log('⚡ ToolFlow Master Test Runner');
console.log('====================================================\n');

let failed = false;

for (const suite of testSuites) {
  const suitePath = path.join(__dirname, suite);
  console.log(`>>> Running Suite: ${suite}`);
  const result = spawnSync('node', [suitePath], { stdio: 'inherit' });
  if (result.status !== 0) {
    failed = true;
    console.error(`❌ Suite failed: ${suite}\n`);
    break;
  }
  console.log(`----------------------------------------------------\n`);
}

if (failed) {
  console.error('💥 Test execution failed!');
  process.exit(1);
} else {
  console.log('🎉 All test suites passed successfully!');
  process.exit(0);
}
