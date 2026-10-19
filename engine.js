const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const https = require('https');
const http = require('http');
const { EventEmitter } = require('events');
const yaml = require('js-yaml');
const { v4: uuidv4 } = require('uuid');
const ExpressionEvaluator = require('./lib/evaluator');

class WorkflowEngine extends EventEmitter {
  constructor(baseDir) {
    super();
    this.baseDir = baseDir;
    this.toolsDir = path.join(baseDir, 'config', 'tools');
    this.workflowsDir = path.join(baseDir, 'config', 'workflows');
    this.runsDir = path.join(baseDir, 'runs');
    
    if (!fs.existsSync(this.runsDir)) {
      fs.mkdirSync(this.runsDir, { recursive: true });
    }
    this.activeRuns = new Map();
  }

  // Load a tool by name
  loadTool(name) {
    const yamlPath = path.join(this.toolsDir, `${name}.yaml`);
    if (!fs.existsSync(yamlPath)) {
      throw new Error(`Tool "${name}" not found at ${yamlPath}`);
    }
    return yaml.load(fs.readFileSync(yamlPath, 'utf8'));
  }

  // Load a workflow by name
  loadWorkflow(name) {
    const yamlPath = path.join(this.workflowsDir, `${name}.yaml`);
    if (!fs.existsSync(yamlPath)) {
      throw new Error(`Workflow "${name}" not found at ${yamlPath}`);
    }
    return yaml.load(fs.readFileSync(yamlPath, 'utf8'));
  }

  // Resolve template variables like ${workflow.inputs.foo} or ${steps.bar.outputs.baz}
  resolveValue(value, context) {
    return ExpressionEvaluator.resolveValue(value, context);
  }
  
  evaluateExpression(expression, context) {
    return ExpressionEvaluator.evaluateExpression(expression, context);
  }

  // Helper to execute script tool
  executeScriptTool(tool, inputs, logCallback, timeout = null, runId = null) {
    return new Promise((resolve, reject) => {
      const runState = runId ? this.activeRuns.get(runId) : null;
      if (runState && runState.cancelled) {
        return reject(new Error('Workflow run was cancelled by user'));
      }

      const scriptPath = path.join(this.baseDir, tool.scriptPath);
      if (!fs.existsSync(scriptPath)) {
        return reject(new Error(`Script not found at ${scriptPath}`));
      }

      logCallback(`[SYSTEM] Spawning process: node ${tool.scriptPath}`);
      
      const args = [scriptPath];
      // Format inputs as arguments e.g., --verbose or value
      Object.keys(inputs).forEach(key => {
        const val = inputs[key];
        if (typeof val === 'boolean') {
          if (val) args.push(`--${key}`);
        } else {
          args.push(`--${key}`, String(val));
        }
      });

      const child = spawn('node', args);
      if (runState) runState.currentSpawned = child;

      let stdoutData = '';
      let stderrData = '';
      let isTimedOut = false;

      let timeoutId;
      if (timeout) {
        timeoutId = setTimeout(() => {
          isTimedOut = true;
          logCallback(`[SYSTEM] Killing process due to step timeout of ${timeout}ms`);
          child.kill('SIGKILL');
          reject(new Error(`Step execution timed out after ${timeout}ms`));
        }, timeout);
      }

      child.stdout.on('data', (data) => {
        stdoutData += data.toString();
      });

      child.stderr.on('data', (data) => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
          if (line.trim()) logCallback(`[SCRIPT] ${line.trim()}`);
        });
        stderrData += data.toString();
      });

      child.on('close', (code) => {
        if (timeoutId) clearTimeout(timeoutId);
        if (runState) runState.currentSpawned = null;
        if (isTimedOut) return;

        logCallback(`[SYSTEM] Process exited with status code ${code}`);
        if (code !== 0) {
          return reject(new Error(`Script failed with status code ${code}. Error: ${stderrData.trim()}`));
        }
        
        try {
          const parsed = JSON.parse(stdoutData.trim());
          resolve(parsed);
        } catch (e) {
          logCallback(`[WARNING] Failed to parse script output as JSON. Returning raw string.`);
          resolve({ rawOutput: stdoutData.trim() });
        }
      });
    });
  }

  executeApiTool(tool, inputs, logCallback, timeout = null, runId = null) {
    return new Promise((resolve, reject) => {
      const runState = runId ? this.activeRuns.get(runId) : null;
      if (runState && runState.cancelled) {
        return reject(new Error('Workflow run was cancelled by user'));
      }

      const urlStr = inputs.url;
      if (!urlStr) {
        return reject(new Error(`API tool requires a "url" input.`));
      }

      logCallback(`[SYSTEM] Sending HTTP request to ${urlStr}`);
      const startTime = Date.now();
      
      try {
        const urlObj = new URL(urlStr);
        const protocol = urlObj.protocol === 'https:' ? https : http;
        const options = {
          method: (inputs.method || 'GET').toUpperCase(),
          timeout: timeout || inputs.timeout || 5000,
          headers: {}
        };

        if (inputs.headers) {
          if (typeof inputs.headers === 'object') {
            options.headers = { ...inputs.headers };
          } else if (typeof inputs.headers === 'string') {
            try {
              options.headers = JSON.parse(inputs.headers);
            } catch (e) {
              logCallback(`[WARNING] Failed to parse headers as JSON: ${e.message}`);
            }
          }
        }

        let reqBody = null;
        if (inputs.body !== undefined && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(options.method)) {
          if (typeof inputs.body === 'object') {
            reqBody = JSON.stringify(inputs.body);
            if (!options.headers['content-type'] && !options.headers['Content-Type']) {
              options.headers['Content-Type'] = 'application/json';
            }
          } else {
            reqBody = String(inputs.body);
          }
          options.headers['Content-Length'] = Buffer.byteLength(reqBody);
        }

        const req = protocol.request(urlObj, options, (res) => {
          let body = '';
          res.on('data', (chunk) => body += chunk);
          res.on('end', () => {
            if (runState) runState.currentRequest = null;
            const latencyMs = Date.now() - startTime;
            logCallback(`[API] Response: ${res.statusCode} ${res.statusMessage} (${latencyMs}ms)`);
            resolve({
              status: res.statusCode,
              statusText: res.statusMessage,
              latencyMs,
              body: body.substring(0, 1000)
            });
          });
        });

        if (runState) runState.currentRequest = req;

        req.on('timeout', () => {
          if (runState) runState.currentRequest = null;
          req.destroy();
          reject(new Error(`API request timed out after ${options.timeout}ms`));
        });

        req.on('error', (err) => {
          if (runState) runState.currentRequest = null;
          reject(err);
        });

        if (reqBody) {
          req.write(reqBody);
        }
        req.end();
      } catch (err) {
        reject(err);
      }
    });
  }

  // Execute an entire workflow
  async runWorkflow(workflowName, workflowInputs = {}, runId = uuidv4()) {
    const runState = {
      cancelled: false,
      currentSpawned: null,
      currentRequest: null
    };
    this.activeRuns.set(runId, runState);

    const workflow = this.loadWorkflow(workflowName);
    const runFilePath = path.join(this.runsDir, `${runId}.json`);
    
    const runRecord = {
      runId,
      workflowName,
      status: 'RUNNING',
      startTime: new Date().toISOString(),
      endTime: null,
      inputs: workflowInputs,
      steps: {},
      logs: []
    };

    const log = (msg) => {
      const timestamp = new Date().toISOString();
      const logLine = `[${timestamp}] ${msg}`;
      runRecord.logs.push(logLine);
      console.log(`[Run ${runId.substring(0, 8)}] ${msg}`);
      fs.writeFileSync(runFilePath, JSON.stringify(runRecord, null, 2));
      this.emit('log', { runId, message: msg, logLine, timestamp });
    };

    log(`Starting workflow "${workflow.name}"`);

    const context = {
      workflow: {
        inputs: { ...workflowInputs }
      },
      steps: {}
    };

    if (workflow.inputs) {
      workflow.inputs.forEach(input => {
        if (context.workflow.inputs[input.name] === undefined && input.default !== undefined) {
          context.workflow.inputs[input.name] = input.default;
        }
      });
    }

    log(`Workflow inputs: ${JSON.stringify(context.workflow.inputs)}`);
    this.emit('workflow:start', { runId, workflowName, inputs: context.workflow.inputs });

    try {
      for (const step of workflow.steps) {
        if (step.if !== undefined) {
          const shouldExecute = ExpressionEvaluator.evaluateCondition(step.if, context);

          if (!shouldExecute) {
            log(`Skipping step "${step.id}" because condition "${step.if}" evaluated to false`);
            this.emit('step:skipped', { runId, stepId: step.id, condition: step.if });
            runRecord.steps[step.id] = {
              status: 'SKIPPED',
              startTime: new Date().toISOString(),
              endTime: new Date().toISOString(),
              error: null
            };
            fs.writeFileSync(runFilePath, JSON.stringify(runRecord, null, 2));
            continue;
          }
        }

        log(`Executing step "${step.id}" (Tool: ${step.tool})`);
        this.emit('step:start', { runId, stepId: step.id, tool: step.tool });
        
        runRecord.steps[step.id] = {
          status: 'RUNNING',
          startTime: new Date().toISOString(),
          endTime: null,
          error: null
        };
        fs.writeFileSync(runFilePath, JSON.stringify(runRecord, null, 2));

        const tool = this.loadTool(step.tool);
        
        const resolvedInputs = {};
        if (step.inputs) {
          Object.keys(step.inputs).forEach(key => {
            resolvedInputs[key] = this.resolveValue(step.inputs[key], context);
          });
        }

        if (tool.inputs) {
          tool.inputs.forEach(ti => {
            if (resolvedInputs[ti.name] === undefined && ti.default !== undefined) {
              resolvedInputs[ti.name] = ti.default;
            }
            if (ti.required && resolvedInputs[ti.name] === undefined) {
              throw new Error(`Required tool input "${ti.name}" was not provided for step "${step.id}"`);
            }
          });
        }

        const stepTimeout = step.timeout;
        const retries = typeof step.retries === 'number' ? step.retries : 0;
        const retryDelay = typeof step.retryDelay === 'number' ? step.retryDelay : 1000;
        let outputs;
        let attempt = 0;

        while (true) {
          if (runState && runState.cancelled) {
            throw new Error('Workflow run was cancelled by user');
          }
          try {
            if (tool.type === 'script') {
              outputs = await this.executeScriptTool(tool, resolvedInputs, log, stepTimeout, runId);
            } else if (tool.type === 'api') {
              outputs = await this.executeApiTool(tool, resolvedInputs, log, stepTimeout, runId);
            } else {
              throw new Error(`Unsupported tool type: ${tool.type}`);
            }
            break; // Success, exit retry loop
          } catch (err) {
            attempt++;
            if (attempt <= retries) {
              log(`[WARNING] Step "${step.id}" failed: ${err.message}. Retrying (Attempt ${attempt}/${retries}) in ${retryDelay}ms...`);
              this.emit('step:retry', { runId, stepId: step.id, attempt, maxRetries: retries, delay: retryDelay, error: err.message });
              await new Promise(r => setTimeout(r, retryDelay));
            } else {
              this.emit('step:failed', { runId, stepId: step.id, tool: step.tool, error: err.message });
              throw err; // Out of retries, propagate error
            }
          }
        }

        runRecord.steps[step.id].status = 'SUCCESS';
        runRecord.steps[step.id].endTime = new Date().toISOString();
        runRecord.steps[step.id].outputs = outputs;
        
        context.steps[step.id] = { outputs };
        
        log(`Step "${step.id}" completed successfully`);
        this.emit('step:success', { runId, stepId: step.id, tool: step.tool, outputs });
        fs.writeFileSync(runFilePath, JSON.stringify(runRecord, null, 2));
      }

      runRecord.status = 'SUCCESS';
      log(`Workflow "${workflow.name}" completed successfully.`);
      this.emit('workflow:success', { runId, workflowName, runRecord });
    } catch (error) {
      if (runState && runState.cancelled) {
        runRecord.status = 'CANCELLED';
        log(`Workflow execution cancelled by user.`);
        this.emit('workflow:cancelled', { runId, workflowName, runRecord });
      } else {
        runRecord.status = 'FAILED';
        runRecord.error = error.message;
        log(`Workflow execution failed: ${error.message}`);
        this.emit('workflow:failed', { runId, workflowName, error: error.message, runRecord });
      }
      
      const activeStepId = Object.keys(runRecord.steps).find(id => runRecord.steps[id].status === 'RUNNING');
      if (activeStepId) {
        runRecord.steps[activeStepId].status = runState && runState.cancelled ? 'CANCELLED' : 'FAILED';
        runRecord.steps[activeStepId].endTime = new Date().toISOString();
        if (!runState || !runState.cancelled) {
          runRecord.steps[activeStepId].error = error.message;
        }
      }
    } finally {
      runRecord.endTime = new Date().toISOString();
      fs.writeFileSync(runFilePath, JSON.stringify(runRecord, null, 2));
      this.activeRuns.delete(runId);
      this.emit('workflow:complete', { runId, workflowName, status: runRecord.status, runRecord });
    }

    return runRecord;
  }
  
  getRun(runId) {
    const runFilePath = path.join(this.runsDir, `${runId}.json`);
    if (fs.existsSync(runFilePath)) {
      return JSON.parse(fs.readFileSync(runFilePath, 'utf8'));
    }
    return null;
  }

  deleteRun(runId) {
    const runFilePath = path.join(this.runsDir, `${runId}.json`);
    if (fs.existsSync(runFilePath)) {
      fs.unlinkSync(runFilePath);
      return true;
    }
    return false;
  }

  cancelRun(runId) {
    const runState = this.activeRuns.get(runId);
    if (!runState) return false;

    runState.cancelled = true;
    
    if (runState.currentSpawned) {
      try {
        runState.currentSpawned.kill('SIGKILL');
      } catch (e) {
        // ignore
      }
    }
    
    if (runState.currentRequest) {
      try {
        runState.currentRequest.destroy();
      } catch (e) {
        // ignore
      }
    }
    
    this.emit('run:cancel', { runId });
    return true;
  }

  listRuns() {
    if (!fs.existsSync(this.runsDir)) return [];
    return fs.readdirSync(this.runsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => {
        try {
          const content = fs.readFileSync(path.join(this.runsDir, file), 'utf8');
          const data = JSON.parse(content);
          return {
            runId: data.runId,
            workflowName: data.workflowName,
            status: data.status,
            startTime: data.startTime,
            endTime: data.endTime,
            error: data.error
          };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
  }
}

module.exports = WorkflowEngine;
