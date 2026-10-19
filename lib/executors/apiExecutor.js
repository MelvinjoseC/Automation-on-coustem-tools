const http = require('http');
const https = require('https');

class ApiExecutor {
  static execute({ tool, inputs, logCallback, timeout = null, runState = null }) {
    return new Promise((resolve, reject) => {
      if (runState && runState.cancelled) {
        return reject(new Error('Workflow run was cancelled by user'));
      }

      const urlStr = inputs.url;
      if (!urlStr) {
        return reject(new Error('API tool requires a "url" input.'));
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

        const req = protocol.request(urlObj, options, res => {
          let body = '';
          res.on('data', chunk => {
            body += chunk;
          });
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

        req.on('error', err => {
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
}

module.exports = ApiExecutor;
