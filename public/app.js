// Global Application State
let activeTab = 'dashboard';
let workflows = [];
let tools = [];
let runs = [];
let activePollInterval = null;
let activeEventSource = null;
let activeRunId = null;

// DOM Elements
const viewViews = {
  dashboard: document.getElementById('view-dashboard'),
  workflows: document.getElementById('view-workflows'),
  tools: document.getElementById('view-tools'),
  runs: document.getElementById('view-runs')
};
const navItems = document.querySelectorAll('.nav-item');
const pageTitle = document.getElementById('page-title');

// Stats Elements
const statTotal = document.getElementById('stat-total');
const statRate = document.getElementById('stat-rate');

// Initial setup on DOM Content Loaded
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  initApp();
  
  // Drawer close event
  document.getElementById('close-drawer').addEventListener('click', closeDrawer);
  document.getElementById('run-drawer').addEventListener('click', (e) => {
    if (e.target.id === 'run-drawer') closeDrawer();
  });

  // Modal close events
  document.getElementById('close-modal').addEventListener('click', closeModal);
  document.getElementById('cancel-trigger').addEventListener('click', closeModal);
  document.getElementById('trigger-modal').addEventListener('click', (e) => {
    if (e.target.id === 'trigger-modal') closeModal();
  });
  
  document.getElementById('trigger-form').addEventListener('submit', handleTriggerSubmit);
  document.getElementById('drawer-cancel-btn').addEventListener('click', handleCancelClick);

  // Log filter and export listeners
  const filterInput = document.getElementById('filter-logs-input');
  if (filterInput) filterInput.addEventListener('input', renderFilteredLogs);
  const filterSelect = document.getElementById('filter-level-select');
  if (filterSelect) filterSelect.addEventListener('change', renderFilteredLogs);
  const exportBtn = document.getElementById('export-run-btn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      if (!currentDrawerRun) return;
      const blob = new Blob([JSON.stringify(currentDrawerRun, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `toolflow-run-${currentDrawerRun.runId.substring(0, 8)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // Theme Toggle Logic
  const themeToggle = document.getElementById('theme-toggle');
  if (localStorage.getItem('theme') === 'light') {
    document.body.classList.add('light-mode');
  }
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-mode');
    if (document.body.classList.contains('light-mode')) {
      localStorage.setItem('theme', 'light');
    } else {
      localStorage.setItem('theme', 'dark');
    }
  });
});

// Setup sidebar navigation
function setupNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const tab = item.getAttribute('data-tab');
      switchTab(tab);
    });
  });
}

function switchTab(tab) {
  activeTab = tab;
  
  // Update nav UI
  navItems.forEach(item => {
    if (item.getAttribute('data-tab') === tab) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  // Update Viewports UI
  Object.keys(viewViews).forEach(key => {
    if (key === tab) {
      viewViews[key].classList.add('active');
    } else {
      viewViews[key].classList.remove('active');
    }
  });

  // Update Topbar Title
  const titles = {
    dashboard: 'System Overview',
    workflows: 'Automation Workflows',
    tools: 'Custom System Tools',
    runs: 'Execution Logs & History'
  };
  pageTitle.textContent = titles[tab] || 'Dashboard';
  
  // Refresh data based on view
  if (tab === 'dashboard' || tab === 'runs') {
    fetchHistory();
  }
}

// Fetch all initial data
async function initApp() {
  await Promise.all([
    fetchTools(),
    fetchWorkflows(),
    fetchHistory(),
    fetchTelemetry()
  ]);

  // Periodic telemetry polling every 10 seconds
  setInterval(fetchTelemetry, 10000);
}

// Fetch System & Telemetry Metrics
async function fetchTelemetry() {
  try {
    const res = await fetch('/api/metrics');
    if (!res.ok) return;
    const data = await res.json();

    const activeEl = document.getElementById('stat-active');
    if (activeEl) activeEl.textContent = data.activeWorkers;

    const healthEl = document.getElementById('stat-health');
    if (healthEl) {
      healthEl.textContent = '● Online';
      healthEl.style.color = 'var(--success)';
    }

    if (statTotal) statTotal.textContent = data.totalRuns;
    if (statRate) statRate.textContent = `${data.successRate}%`;
  } catch (e) {
    const healthEl = document.getElementById('stat-health');
    if (healthEl) {
      healthEl.textContent = '● Offline';
      healthEl.style.color = 'var(--danger)';
    }
  }
}

// Fetch Custom Tools Specifications
async function fetchTools() {
  try {
    const response = await fetch('/api/tools');
    tools = await response.json();
    renderToolsList();
  } catch (err) {
    console.error('Error fetching tools:', err);
  }
}

// Fetch Registered Workflows
async function fetchWorkflows() {
  try {
    const response = await fetch('/api/workflows');
    workflows = await response.json();
    renderWorkflowsList();
    renderQuickWorkflows();
  } catch (err) {
    console.error('Error fetching workflows:', err);
  }
}

// Fetch Run Execution Logs History
async function fetchHistory() {
  try {
    const response = await fetch('/api/runs');
    runs = await response.json();
    calculateStats();
    renderHistoryTable();
    renderRecentRunsList();
  } catch (err) {
    console.error('Error fetching runs history:', err);
  }
}

// Calculate Stats (Runs Count, Success Ratio)
function calculateStats() {
  statTotal.textContent = runs.length;
  
  if (runs.length === 0) {
    statRate.textContent = '0%';
    return;
  }
  
  const successful = runs.filter(run => run.status === 'SUCCESS').length;
  const rate = Math.round((successful / runs.length) * 100);
  statRate.textContent = `${rate}%`;
}

// Render Tools view
function renderToolsList() {
  const container = document.getElementById('tools-grid');
  container.innerHTML = '';
  
  if (tools.length === 0) {
    container.innerHTML = '<p class="text-muted">No custom tools registered in config/tools/</p>';
    return;
  }
  
  tools.forEach(tool => {
    const card = document.createElement('div');
    card.className = 'card';
    
    // Construct inputs list if any
    const inputsStr = tool.inputs && tool.inputs.length > 0
      ? tool.inputs.map(i => `<span class="tag">${i.name}</span>`).join(' ')
      : '<span class="tag">none</span>';

    card.innerHTML = `
      <div class="card-title">${tool.name}</div>
      <div class="card-desc">${tool.description || 'No description provided'}</div>
      <div class="card-footer">
        <span class="tag ${tool.type}">${tool.type.toUpperCase()}</span>
        <div style="display: flex; gap: 4px;">${inputsStr}</div>
      </div>
    `;
    container.appendChild(card);
  });
}

// Render Workflows View
function renderWorkflowsList() {
  const container = document.getElementById('workflows-grid');
  container.innerHTML = '';
  
  if (workflows.length === 0) {
    container.innerHTML = '<p class="text-muted">No workflows registered in config/workflows/</p>';
    return;
  }
  
  workflows.forEach(flow => {
    const card = document.createElement('div');
    card.className = 'card';
    
    card.innerHTML = `
      <div class="card-title">${flow.name}</div>
      <div class="card-desc">${flow.description || 'No description provided'}</div>
      <div class="card-footer">
        <span class="tag">${flow.steps ? flow.steps.length : 0} Steps</span>
        <button class="btn" onclick="event.stopPropagation(); promptTrigger('${flow.id}')">Run Workflow</button>
      </div>
    `;
    // Clicking the card opens details or triggers it
    card.addEventListener('click', () => promptTrigger(flow.id));
    container.appendChild(card);
  });
}

// Render Quick Trigger buttons on home Dashboard
function renderQuickWorkflows() {
  const container = document.getElementById('quick-workflows-list');
  container.innerHTML = '';
  
  workflows.slice(0, 3).forEach(flow => {
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `
      <div class="card-title" style="font-size:14px;">${flow.name}</div>
      <div class="card-desc" style="font-size:12px; margin-bottom:12px;">${flow.description || 'Quick execute workflow'}</div>
      <div class="card-footer" style="padding-top:12px;">
        <span class="tag">${flow.steps ? flow.steps.length : 0} steps</span>
        <button class="btn" style="padding:6px 12px; font-size:11px;" onclick="event.stopPropagation(); promptTrigger('${flow.id}')">Run</button>
      </div>
    `;
    card.addEventListener('click', () => promptTrigger(flow.id));
    container.appendChild(card);
  });
}

// Render Table History View
function renderHistoryTable() {
  const tbody = document.getElementById('runs-table-body');
  tbody.innerHTML = '';
  
  if (runs.length === 0) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;" class="text-muted">No runs executed yet.</td></tr>';
    return;
  }
  
  runs.forEach(run => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.addEventListener('click', () => viewRunDetails(run.runId));
    
    const duration = calculateDuration(run.startTime, run.endTime);
    const dateStr = new Date(run.startTime).toLocaleString();
    
    tr.innerHTML = `
      <td class="mono">${run.runId.substring(0, 8)}</td>
      <td style="font-weight: 500;">${run.workflowName}</td>
      <td class="text-muted">${dateStr}</td>
      <td>${duration}</td>
      <td><span class="status-badge ${run.status.toLowerCase()}">${run.status}</span></td>
      <td style="display: flex; gap: 6px;">
        <button class="btn secondary" style="padding: 4px 10px; font-size: 11px;">Inspect</button>
        <button class="btn danger" style="padding: 4px 10px; font-size: 11px; background: var(--danger); border: none; color: white;" onclick="event.stopPropagation(); deleteRunHistory('${run.runId}')">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// Delete Run History Item
async function deleteRunHistory(runId) {
  if (!confirm(`Are you sure you want to delete execution run ${runId.substring(0, 8)}?`)) {
    return;
  }
  
  try {
    const response = await fetch(`/api/runs/${runId}`, {
      method: 'DELETE'
    });
    const result = await response.json();
    if (result.success) {
      fetchHistory();
    } else {
      alert(`Error deleting run: ${result.error}`);
    }
  } catch (err) {
    alert(`Failed to connect to API: ${err.message}`);
  }
}

// Render Dashboard View Right Panel (Recent Runs)
function renderRecentRunsList() {
  const container = document.getElementById('recent-runs-list');
  container.innerHTML = '';
  
  if (runs.length === 0) {
    container.innerHTML = '<p class="text-muted" style="text-align:center; padding: 20px 0;">No activity logs found.</p>';
    return;
  }
  
  runs.slice(0, 5).forEach(run => {
    const item = document.createElement('div');
    item.className = 'recent-item';
    item.addEventListener('click', () => viewRunDetails(run.runId));
    
    const timeAgo = formatTimeAgo(run.startTime);
    
    item.innerHTML = `
      <div class="recent-info">
        <h5>${run.workflowName}</h5>
        <span>Run ID: ${run.runId.substring(0, 8)} • ${timeAgo}</span>
      </div>
      <span class="status-badge ${run.status.toLowerCase()}" style="font-size: 9px; padding: 2px 6px;">${run.status}</span>
    `;
    container.appendChild(item);
  });
}

// Open Trigger Config Dialog
function promptTrigger(workflowId) {
  const flow = workflows.find(f => f.id === workflowId);
  if (!flow) return;
  
  const container = document.getElementById('modal-inputs-container');
  container.innerHTML = '';
  
  document.getElementById('modal-title').textContent = `Run ${flow.name}`;
  document.getElementById('trigger-form').setAttribute('data-workflow-id', flow.id);
  
  const flowInputs = flow.inputs || [];
  
  if (flowInputs.length === 0) {
    container.innerHTML = '<p class="text-muted">This workflow runs with no custom parameters.</p>';
  } else {
    flowInputs.forEach(input => {
      const group = document.createElement('div');
      group.className = 'input-group';
      
      const typeAttr = input.type === 'number' ? 'number' : 'text';
      const defaultVal = input.default !== undefined ? input.default : '';
      
      group.innerHTML = `
        <label for="input-${input.name}">${input.name} ${input.required ? '<span style="color:var(--danger)">*</span>' : ''}</label>
        <input type="${typeAttr}" id="input-${input.name}" name="${input.name}" value="${defaultVal}" ${input.required ? 'required' : ''} />
        ${input.description ? `<span class="input-desc">${input.description}</span>` : ''}
      `;
      container.appendChild(group);
    });
  }
  
  document.getElementById('trigger-modal').classList.add('active');
}

// Close Modal
function closeModal() {
  document.getElementById('trigger-modal').classList.remove('active');
}

// Handle Form Submission to trigger run
async function handleTriggerSubmit(e) {
  e.preventDefault();
  const workflowId = e.target.getAttribute('data-workflow-id');
  const formData = new FormData(e.target);
  const inputs = {};
  
  formData.forEach((value, key) => {
    // If the input was defined as number, convert it
    const flow = workflows.find(f => f.id === workflowId);
    const spec = flow.inputs ? flow.inputs.find(i => i.name === key) : null;
    if (spec && spec.type === 'number') {
      inputs[key] = parseFloat(value);
    } else {
      inputs[key] = value;
    }
  });

  closeModal();

  try {
    const response = await fetch(`/api/workflows/${workflowId}/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(inputs)
    });
    
    const result = await response.json();
    if (result.runId) {
      // Trigger details drawer and switch history
      viewRunDetails(result.runId);
      switchTab('runs');
    }
  } catch (err) {
    alert(`Failed to start workflow: ${err.message}`);
  }
}

// Open drawer, pull logs, and handle live streaming with polling fallback
async function viewRunDetails(runId) {
  activeRunId = runId;
  
  // Open drawer UI
  const drawer = document.getElementById('run-drawer');
  drawer.classList.add('active');
  
  // Clear logs terminal and metadata
  document.getElementById('drawer-run-id').textContent = runId;
  document.getElementById('drawer-status').className = 'status-badge pending';
  document.getElementById('drawer-status').textContent = 'PENDING';
  document.getElementById('drawer-time').textContent = 'Loading...';
  document.getElementById('drawer-duration').textContent = 'Loading...';
  document.getElementById('drawer-steps-list').innerHTML = '<p class="text-muted">Waiting for steps...</p>';
  document.getElementById('drawer-logs').textContent = 'Connecting real-time log stream...';

  // Stop any existing pollers or event sources
  if (activePollInterval) {
    clearInterval(activePollInterval);
    activePollInterval = null;
  }
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }

  // Initial Fetch
  await pollRunState();

  // Connect SSE stream for real-time live logs
  if (window.EventSource) {
    try {
      activeEventSource = new EventSource(`/api/runs/${runId}/stream`);

      activeEventSource.addEventListener('log', () => {
        pollRunState();
      });

      activeEventSource.addEventListener('step', () => {
        pollRunState();
      });

      activeEventSource.addEventListener('end', () => {
        pollRunState();
        if (activeEventSource) {
          activeEventSource.close();
          activeEventSource = null;
        }
        fetchHistory();
      });

      activeEventSource.onerror = () => {
        if (activeEventSource) {
          activeEventSource.close();
          activeEventSource = null;
        }
        startPolling();
      };
    } catch (e) {
      startPolling();
    }
  } else {
    startPolling();
  }
}

function startPolling() {
  if (activePollInterval) return;
  activePollInterval = setInterval(async () => {
    const shouldContinue = await pollRunState();
    if (!shouldContinue) {
      clearInterval(activePollInterval);
      activePollInterval = null;
      fetchHistory();
    }
  }, 1000);
}

// Close Run Drawer
function closeDrawer() {
  document.getElementById('run-drawer').classList.remove('active');
  activeRunId = null;
  if (activeEventSource) {
    activeEventSource.close();
    activeEventSource = null;
  }
  if (activePollInterval) {
    clearInterval(activePollInterval);
    activePollInterval = null;
  }
  fetchHistory();
}

// Handle Cancellation Request
async function handleCancelClick() {
  if (!activeRunId) return;
  if (!confirm('Are you sure you want to cancel this active workflow run?')) {
    return;
  }
  
  try {
    const response = await fetch(`/api/runs/${activeRunId}/cancel`, {
      method: 'POST'
    });
    const result = await response.json();
    if (result.success) {
      pollRunState();
    } else {
      alert(`Error cancelling run: ${result.error}`);
    }
  } catch (err) {
    alert(`Failed to cancel run: ${err.message}`);
  }
}

// Core Polling function: returns true if running, false if completed/error
async function pollRunState() {
  if (!activeRunId) return false;
  
  try {
    const response = await fetch(`/api/runs/${activeRunId}`);
    if (response.status === 404) {
      document.getElementById('drawer-logs').textContent = 'Error: Run ID not found.';
      return false;
    }
    
    const run = await response.json();
    
    // Update basic meta
    const statusBadge = document.getElementById('drawer-status');
    statusBadge.className = `status-badge ${run.status.toLowerCase()}`;
    statusBadge.textContent = run.status;

    // Show/hide cancel button based on run status
    const cancelBtn = document.getElementById('drawer-cancel-btn');
    if (run.status === 'RUNNING') {
      cancelBtn.style.display = 'inline-block';
    } else {
      cancelBtn.style.display = 'none';
    }
    
    document.getElementById('drawer-time').textContent = new Date(run.startTime).toLocaleString();
    document.getElementById('drawer-duration').textContent = calculateDuration(run.startTime, run.endTime);
    
    currentDrawerRun = run;

    // Render Steps Timeline Flow
    renderStepsTimeline(run.steps);

    // Render Filtered Logs Console
    renderFilteredLogs();

    return run.status === 'RUNNING';
  } catch (err) {
    console.error('Error polling run:', err);
    return false;
  }
}

// Render steps inside drawer timeline
function renderStepsTimeline(steps = {}) {
  const container = document.getElementById('drawer-steps-list');
  container.innerHTML = '';
  
  const stepIds = Object.keys(steps);
  if (stepIds.length === 0) {
    container.innerHTML = '<p class="text-muted">No steps executed yet.</p>';
    return;
  }

  stepIds.forEach(id => {
    const step = steps[id];
    const node = document.createElement('div');
    node.className = `step-node ${step.status.toLowerCase()}`;
    
    const duration = calculateDuration(step.startTime, step.endTime);
    const outputsStr = step.outputs ? JSON.stringify(step.outputs, null, 2) : '';
    
    node.innerHTML = `
      <div class="step-node-header">
        <span class="step-node-title">${id}</span>
        <span class="step-node-time">${duration} (${step.status})</span>
      </div>
      ${outputsStr ? `<pre class="step-node-outputs">${escapeHtml(outputsStr)}</pre>` : ''}
      ${step.error ? `<div class="text-muted" style="color:var(--danger); font-size:11px; margin-top:4px;">Error: ${escapeHtml(step.error)}</div>` : ''}
    `;
    container.appendChild(node);
  });
}

// Helper: Calculate Duration in ms/sec
function calculateDuration(start, end) {
  if (!start) return '-';
  const startMs = new Date(start).getTime();
  const endMs = end ? new Date(end).getTime() : Date.now();
  const durationMs = endMs - startMs;
  
  if (durationMs < 1000) {
    return `${durationMs}ms`;
  }
  return `${(durationMs / 1000).toFixed(1)}s`;
}

// Helper: Format Time Ago (e.g. 5 minutes ago)
function formatTimeAgo(dateStr) {
  const ms = Date.now() - new Date(dateStr).getTime();
  const sec = Math.round(ms / 1000);
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

// Helper: Escape HTML characters
function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

// Filter and render logs based on search text and log level
function renderFilteredLogs() {
  if (!currentDrawerRun || !currentDrawerRun.logs) return;
  const filterInput = document.getElementById('filter-logs-input');
  const filterSelect = document.getElementById('filter-level-select');
  const filterText = (filterInput ? filterInput.value : '').toLowerCase();
  const filterLevel = filterSelect ? filterSelect.value : 'ALL';

  const terminal = document.getElementById('drawer-logs');
  const wasScrolledToBottom = terminal.scrollHeight - terminal.clientHeight <= terminal.scrollTop + 25;

  const filtered = currentDrawerRun.logs.filter(line => {
    if (filterText && !line.toLowerCase().includes(filterText)) {
      return false;
    }
    if (filterLevel === 'ERROR') {
      return /error|failed|failure|exception/i.test(line);
    }
    if (filterLevel === 'WARNING') {
      return line.includes('[WARNING]');
    }
    if (filterLevel === 'SYSTEM') {
      return line.includes('[SYSTEM]');
    }
    if (filterLevel === 'SCRIPT') {
      return line.includes('[SCRIPT]');
    }
    return true;
  });

  if (filtered.length > 0) {
    terminal.innerHTML = filtered.map(line => {
      if (line.includes('[SYSTEM]')) return `<span style="color:var(--accent-primary)">${escapeHtml(line)}</span>`;
      if (line.includes('[API]')) return `<span style="color:var(--accent-secondary)">${escapeHtml(line)}</span>`;
      if (line.includes('[SCRIPT]')) return `<span style="color:#d1d5db">${escapeHtml(line)}</span>`;
      if (line.includes('[WARNING]')) return `<span style="color:var(--warning)">${escapeHtml(line)}</span>`;
      if (/failed|error|Failed|Error/i.test(line)) {
        return `<span style="color:var(--danger)">${escapeHtml(line)}</span>`;
      }
      return `<span>${escapeHtml(line)}</span>`;
    }).join('\n');
  } else {
    terminal.innerHTML = '<span class="text-muted">No matching log entries found.</span>';
  }

  if (wasScrolledToBottom) {
    terminal.scrollTop = terminal.scrollHeight;
  }
}
