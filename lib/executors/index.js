const ScriptExecutor = require('./scriptExecutor');
const ApiExecutor = require('./apiExecutor');

const executors = {
  script: ScriptExecutor,
  api: ApiExecutor
};

function getExecutor(type) {
  const executor = executors[type];
  if (!executor) {
    throw new Error(`Unsupported tool type: ${type}`);
  }
  return executor;
}

function registerExecutor(type, executorClass) {
  executors[type] = executorClass;
}

module.exports = {
  getExecutor,
  registerExecutor,
  ScriptExecutor,
  ApiExecutor
};
