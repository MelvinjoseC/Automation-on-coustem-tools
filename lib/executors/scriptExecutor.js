const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

class ScriptExecutor {
  static execute({ baseDir, tool, inputs, logCallback, timeout = null, runState = null }) {
    return new Promise((resolve, reject) => {
      if (runState && runState.cancelled) {
        return reject(new Error('Workflow run was cancelled by user'));
      }

      const scriptPath = path.isAbsolute(tool.scriptPath)
        ? tool.scriptPath
        : path.join(baseDir, tool.scriptPath);

      if (!fs.existsSync(scriptPath)) {
        return reject(new Error(`Script not found at ${scriptPath}`));
      }

      logCallback(`[SYSTEM] Spawning process: node ${tool.scriptPath}`);

      const args = [scriptPath];
      Object.keys(inputs).forEach(key => {
        const val = inputs[key];
        if (typeof val === 'boolean') {
          if (val) args.push(`--${key}`);
        } else if (val !== undefined && val !== null) {
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
          try {
            child.kill('SIGKILL');
          } catch (e) {
            // ignore
          }
          reject(new Error(`Step execution timed out after ${timeout}ms`));
        }, timeout);
      }

      child.stdout.on('data', data => {
        stdoutData += data.toString();
      });

      child.stderr.on('data', data => {
        const lines = data.toString().split('\n');
        lines.forEach(line => {
          if (line.trim()) logCallback(`[SCRIPT] ${line.trim()}`);
        });
        stderrData += data.toString();
      });

      child.on('close', code => {
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

      child.on('error', err => {
        if (timeoutId) clearTimeout(timeoutId);
        if (runState) runState.currentSpawned = null;
        reject(err);
      });
    });
  }
}

module.exports = ScriptExecutor;
