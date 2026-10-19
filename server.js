const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const yaml = require('js-yaml');
const { v4: uuidv4 } = require('uuid');
const WorkflowEngine = require('./engine');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const engine = new WorkflowEngine(__dirname);

// Helper to list files in a folder and parse them
function loadConfigsFromDir(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  return fs.readdirSync(dirPath)
    .filter(file => file.endsWith('.yaml') || file.endsWith('.yml'))
    .map(file => {
      try {
        const filePath = path.join(dirPath, file);
        const parsed = yaml.load(fs.readFileSync(filePath, 'utf8'));
        return {
          id: path.basename(file, path.extname(file)),
          ...parsed
        };
      } catch (e) {
        console.error(`Error parsing config file ${file}:`, e);
        return null;
      }
    })
    .filter(Boolean);
}

// API: System Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(process.uptime()),
    nodeVersion: process.version,
    platform: process.platform,
    activeRuns: engine.activeRuns.size,
    memory: {
      heapUsedMb: Math.round((process.memoryUsage().heapUsed / 1024 / 1024) * 100) / 100,
      heapTotalMb: Math.round((process.memoryUsage().heapTotal / 1024 / 1024) * 100) / 100,
      rssMb: Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100
    }
  });
});

// API: System & Run Telemetry Metrics
app.get('/api/metrics', (req, res) => {
  try {
    const runs = engine.listRuns();
    const tools = loadConfigsFromDir(path.join(__dirname, 'config', 'tools'));
    const workflows = loadConfigsFromDir(path.join(__dirname, 'config', 'workflows'));

    const counts = {
      SUCCESS: 0,
      FAILED: 0,
      CANCELLED: 0,
      RUNNING: engine.activeRuns.size
    };

    let totalDurationMs = 0;
    let completedRunsCount = 0;

    runs.forEach(run => {
      if (counts[run.status] !== undefined) {
        counts[run.status]++;
      }
      if (run.startTime && run.endTime) {
        const dur = new Date(run.endTime) - new Date(run.startTime);
        if (dur > 0) {
          totalDurationMs += dur;
          completedRunsCount++;
        }
      }
    });

    const avgDurationMs = completedRunsCount > 0 ? Math.round(totalDurationMs / completedRunsCount) : 0;
    const successRate = runs.length > 0 ? Math.round((counts.SUCCESS / runs.length) * 100) : 100;

    res.json({
      totalRuns: runs.length,
      statusCounts: counts,
      successRate,
      avgDurationMs,
      toolsRegistered: tools.length,
      workflowsRegistered: workflows.length,
      activeWorkers: engine.activeRuns.size
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get all tools
app.get('/api/tools', (req, res) => {
  try {
    const tools = loadConfigsFromDir(path.join(__dirname, 'config', 'tools'));
    res.json(tools);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get all workflows
app.get('/api/workflows', (req, res) => {
  try {
    const workflows = loadConfigsFromDir(path.join(__dirname, 'config', 'workflows'));
    res.json(workflows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get execution runs history
app.get('/api/runs', (req, res) => {
  try {
    const runs = engine.listRuns();
    res.json(runs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Get details of a specific run (including logs)
app.get('/api/runs/:runId', (req, res) => {
  try {
    const run = engine.getRun(req.params.runId);
    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }
    res.json(run);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Real-time Server-Sent Events (SSE) log & status stream for a run
app.get('/api/runs/:runId/stream', (req, res) => {
  const { runId } = req.params;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send initial snapshot
  const initialRun = engine.getRun(runId);
  if (initialRun) {
    res.write(`event: snapshot\ndata: ${JSON.stringify(initialRun)}\n\n`);
    if (initialRun.status !== 'RUNNING') {
      res.write(`event: end\ndata: ${JSON.stringify({ status: initialRun.status })}\n\n`);
      return res.end();
    }
  }

  const onLog = (data) => {
    if (data.runId === runId) {
      res.write(`event: log\ndata: ${JSON.stringify(data)}\n\n`);
    }
  };

  const onStepEvent = (eventName) => (data) => {
    if (data.runId === runId) {
      res.write(`event: step\ndata: ${JSON.stringify({ event: eventName, ...data })}\n\n`);
    }
  };

  const onStepStart = onStepEvent('start');
  const onStepSuccess = onStepEvent('success');
  const onStepFailed = onStepEvent('failed');
  const onStepSkipped = onStepEvent('skipped');

  const onComplete = (data) => {
    if (data.runId === runId) {
      res.write(`event: end\ndata: ${JSON.stringify(data)}\n\n`);
      cleanup();
      res.end();
    }
  };

  engine.on('log', onLog);
  engine.on('step:start', onStepStart);
  engine.on('step:success', onStepSuccess);
  engine.on('step:failed', onStepFailed);
  engine.on('step:skipped', onStepSkipped);
  engine.on('workflow:complete', onComplete);

  const cleanup = () => {
    engine.removeListener('log', onLog);
    engine.removeListener('step:start', onStepStart);
    engine.removeListener('step:success', onStepSuccess);
    engine.removeListener('step:failed', onStepFailed);
    engine.removeListener('step:skipped', onStepSkipped);
    engine.removeListener('workflow:complete', onComplete);
  };

  req.on('close', cleanup);
});

// API: Delete a specific run
app.delete('/api/runs/:runId', (req, res) => {
  try {
    const deleted = engine.deleteRun(req.params.runId);
    if (!deleted) {
      return res.status(404).json({ error: 'Run not found' });
    }
    res.json({ success: true, message: 'Run deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Cancel an active run
app.post('/api/runs/:runId/cancel', (req, res) => {
  try {
    const cancelled = engine.cancelRun(req.params.runId);
    if (!cancelled) {
      return res.status(404).json({ error: 'Run not active or already finished' });
    }
    res.json({ success: true, message: 'Cancellation request sent' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// API: Trigger a workflow run
app.post('/api/workflows/:name/run', (req, res) => {
  const { name } = req.params;
  const inputs = req.body || {};

  try {
    // Generate a unique run ID
    const runId = uuidv4();

    // Verify workflow exists first
    engine.loadWorkflow(name);

    // Write initial RUNNING file before executing asynchronously
    const runRecord = {
      runId,
      workflowName: name,
      status: 'RUNNING',
      startTime: new Date().toISOString(),
      endTime: null,
      inputs,
      steps: {},
      logs: [`[${new Date().toISOString()}] Initiating workflow ${name}...`]
    };
    
    fs.writeFileSync(
      path.join(__dirname, 'runs', `${runId}.json`),
      JSON.stringify(runRecord, null, 2)
    );

    // Execute engine in the background
    engine.runWorkflow(name, inputs, runId)
      .then(result => {
        console.log(`Workflow run ${runId} completed with status: ${result.status}`);
      })
      .catch(error => {
        console.error(`Workflow run ${runId} failed asynchronously:`, error);
      });

    // Return the run status and runId immediately
    res.status(202).json({
      runId,
      status: 'RUNNING',
      message: 'Workflow started in background'
    });

  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Serve frontend fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`ToolFlow server running on http://localhost:${PORT}`);
});
