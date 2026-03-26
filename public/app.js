const elements = {
  portCodeInput: document.getElementById('portCodeInput'),
  startTimeInput: document.getElementById('startTimeInput'),
  endTimeInput: document.getElementById('endTimeInput'),
  refreshToggle: document.getElementById('refreshToggle'),
  visibilityToggleButton: document.getElementById('visibilityToggleButton'),
  applyFiltersButton: document.getElementById('applyFiltersButton'),
  visibilityPanel: document.getElementById('visibilityPanel'),
  visibilitySummary: document.getElementById('visibilitySummary'),
  visibilityOptions: document.getElementById('visibilityOptions'),
  selectAllPortsButton: document.getElementById('selectAllPortsButton'),
  hideAllPortsButton: document.getElementById('hideAllPortsButton'),
  resetHiddenPortsButton: document.getElementById('resetHiddenPortsButton'),
  applyHiddenPortsButton: document.getElementById('applyHiddenPortsButton'),
  refreshState: document.getElementById('refreshState'),
  lastRefresh: document.getElementById('lastRefresh'),
  windowLabel: document.getElementById('windowLabel'),
  metricTotalPorts: document.getElementById('metricTotalPorts'),
  metricReadyPorts: document.getElementById('metricReadyPorts'),
  metricTotalBags: document.getElementById('metricTotalBags'),
  metricAlertPorts: document.getElementById('metricAlertPorts'),
  metricTotalWeight: document.getElementById('metricTotalWeight'),
  metricActivePorts: document.getElementById('metricActivePorts'),
  completionGauge: document.getElementById('completionGauge'),
  completionValue: document.getElementById('completionValue'),
  overviewBadge: document.getElementById('overviewBadge'),
  pollingMode: document.getElementById('pollingMode'),
  statusBreakdown: document.getElementById('statusBreakdown'),
  recentScans: document.getElementById('recentScans'),
  portsGrid: document.getElementById('portsGrid'),
  portCountLabel: document.getElementById('portCountLabel'),
  portCardTemplate: document.getElementById('portCardTemplate')
};

const state = {
  autoRefresh: true,
  timerId: null,
  pollingMs: 15000,
  hiddenPorts: loadHiddenPorts(),
  availablePorts: []
};

const hiddenPortsStorageKey = 'muvs-dashboard-hidden-ports';

function loadHiddenPorts() {
  try {
    const value = window.localStorage.getItem(hiddenPortsStorageKey);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

function saveHiddenPorts(hiddenPorts) {
  state.hiddenPorts = [...new Set(hiddenPorts.map((item) => String(item)))];
  window.localStorage.setItem(hiddenPortsStorageKey, JSON.stringify(state.hiddenPorts));
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function toDateTimeLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function initializeDefaultWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  elements.startTimeInput.value = toDateTimeLocal(start);
  elements.endTimeInput.value = toDateTimeLocal(now);
}

function formatNumber(value, digits = 0) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number(value || 0));
}

function formatTimestamp(value) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

function getWindowLabel() {
  const start = elements.startTimeInput.value;
  const end = elements.endTimeInput.value;
  if (!start && !end) {
    return 'Procedure default window';
  }
  return `${start || '--'} -> ${end || '--'}`;
}

function buildQuery() {
  const params = new URLSearchParams();

  if (elements.portCodeInput.value.trim()) {
    params.set('portCode', elements.portCodeInput.value.trim());
  }

  if (elements.startTimeInput.value) {
    params.set('startTime', elements.startTimeInput.value);
  }

  if (elements.endTimeInput.value) {
    params.set('endTime', elements.endTimeInput.value);
  }

  if (state.hiddenPorts.length) {
    params.set('hiddenPorts', state.hiddenPorts.join(','));
  }

  return params.toString();
}

function collectHiddenPortsFromPanel() {
  const checkboxes = [...elements.visibilityOptions.querySelectorAll('input[type="checkbox"]')];
  return checkboxes.filter((checkbox) => !checkbox.checked).map((checkbox) => checkbox.value);
}

function updateVisibilitySummary() {
  const hiddenCount = collectHiddenPortsFromPanel().length;
  const visibleCount = Math.max(state.availablePorts.length - hiddenCount, 0);
  elements.visibilitySummary.textContent = `Visible ${visibleCount} / Hidden ${hiddenCount}`;
}

function renderVisibilityOptions() {
  elements.visibilityOptions.innerHTML = '';

  if (!state.availablePorts.length) {
    elements.visibilityOptions.innerHTML = '<div class="empty-state">No ports loaded yet.</div>';
    return;
  }

  state.availablePorts.forEach((portItem) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'visibility-option';
    wrapper.innerHTML = `
      <input type="checkbox" value="${portItem.portCode}" ${state.hiddenPorts.includes(String(portItem.portCode)) ? '' : 'checked'} />
      <span>${portItem.portName || `Port ${portItem.portCode}`}</span>
      <strong>Port ${portItem.portCode}</strong>
    `;
    elements.visibilityOptions.appendChild(wrapper);
  });

  updateVisibilitySummary();
}

function setVisibilityCheckboxes(checked) {
  elements.visibilityOptions.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = checked;
  });
  updateVisibilitySummary();
}

function renderSummary(summary) {
  elements.metricTotalPorts.textContent = formatNumber(summary.totalPorts);
  elements.metricReadyPorts.textContent = formatNumber(summary.readyPorts);
  elements.metricTotalBags.textContent = formatNumber(summary.totalPutBags);
  elements.metricAlertPorts.textContent = formatNumber(summary.alertPorts);
  elements.metricTotalWeight.textContent = `${formatNumber(summary.totalPutWeight, 2)} kg`;
  elements.metricActivePorts.textContent = formatNumber(summary.activePorts);
  elements.completionValue.textContent = `${formatNumber(summary.completionAverage, 1)}%`;
  elements.completionGauge.style.setProperty('--progress', summary.completionAverage);
  elements.overviewBadge.textContent = summary.alertPorts > 0 ? 'Attention required' : 'System stable';
  elements.portCountLabel.textContent = `${summary.totalPorts} ports${summary.hiddenPortCount ? ` | Hidden ${summary.hiddenPortCount}` : ''}`;
}

function createBreakdownCard(statusKey, count) {
  const card = document.createElement('div');
  const toneMap = {
    ready: 'tone-healthy',
    feeding: 'tone-active',
    armed: 'tone-active',
    idle: 'tone-muted',
    locked: 'tone-warning',
    alarm: 'tone-critical',
    bypass: 'tone-notice',
    'opc-error': 'tone-critical'
  };
  const labelMap = {
    ready: 'Ready',
    feeding: 'Feeding',
    armed: 'Power On',
    idle: 'Idle',
    locked: 'Locked',
    alarm: 'Alarm',
    bypass: 'Bypass',
    'opc-error': 'OPC Fault'
  };

  card.className = `breakdown-card ${toneMap[statusKey] || 'tone-muted'}`;
  card.innerHTML = `<span>${labelMap[statusKey] || statusKey}</span><strong>${count}</strong>`;
  return card;
}

function renderBreakdown(summary) {
  elements.statusBreakdown.innerHTML = '';
  const orderedKeys = ['ready', 'feeding', 'armed', 'idle', 'locked', 'alarm', 'bypass', 'opc-error'];
  orderedKeys.forEach((statusKey) => {
    if (summary.breakdown[statusKey] === undefined) {
      return;
    }
    elements.statusBreakdown.appendChild(createBreakdownCard(statusKey, summary.breakdown[statusKey]));
  });
}

function renderRecentScans(summary) {
  elements.recentScans.innerHTML = '';

  if (!summary.recentScans.length) {
    elements.recentScans.innerHTML = '<div class="empty-state">No scan activity found in the current time window.</div>';
    return;
  }

  summary.recentScans.forEach((item) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'timeline-item';
    wrapper.innerHTML = `
      <div class="timeline-item-top">
        <strong>${item.portName || `Port ${item.portCode}`}</strong>
        <span class="status-pill tone-active">${item.status}</span>
      </div>
      <p>${item.materialName || 'No material assigned'} | ${formatNumber(item.totalPutWeight, 2)} kg</p>
      <p>${formatTimestamp(item.lastScanTime)}</p>
    `;
    elements.recentScans.appendChild(wrapper);
  });
}

function createSignal(label, active) {
  return `
    <div class="signal-item">
      <span>${label}</span>
      <span class="signal-badge ${active ? 'signal-on' : 'signal-off'}"></span>
    </div>
  `;
}

function createMeta(label, value) {
  return `
    <div class="meta-item">
      <span>${label}</span>
      <strong>${value || '--'}</strong>
    </div>
  `;
}

function renderPorts(ports) {
  elements.portsGrid.innerHTML = '';

  if (!ports.length) {
    elements.portsGrid.innerHTML = '<div class="empty-state">No port records matched the selected filters.</div>';
    return;
  }

  ports.forEach((port) => {
    const node = elements.portCardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.port-code').textContent = `Port ${port.portCode}`;
    node.querySelector('.port-name').textContent = port.portName || `Port ${port.portCode}`;
    const statusPill = node.querySelector('.status-pill');
    statusPill.textContent = port.status.label;
    statusPill.classList.add(`tone-${port.status.tone}`);

    const gauge = node.querySelector('.mini-gauge');
    gauge.style.setProperty('--progress', port.progress);
    gauge.querySelector('span').textContent = `${Math.round(port.progress)}%`;
    node.querySelector('.progress-value').textContent = `${formatNumber(port.totalPutWeight, 2)} kg`;
    node.querySelector('.progress-detail').textContent = `${formatNumber(port.totalPutBags)} bags / target ${formatNumber(port.targetWeight, 0)} kg`;
    node.querySelector('.material-name').textContent = port.materialName || 'No material assigned';
    node.querySelector('.material-meta').textContent = `Code ${port.materialCode || '--'} | Batch ${port.batchCode || '--'}`;

    node.querySelector('.signals').innerHTML = [
      createSignal('Power', port.tags.power),
      createSignal('2nd Check', port.tags.secondCheck),
      createSignal('Green Lamp', port.tags.greenLamp),
      createSignal('Red Lamp', port.tags.redLamp),
      createSignal('Locked', port.tags.locked),
      createSignal('Bypass', port.tags.bypass)
    ].join('');

    node.querySelector('.port-meta-grid').innerHTML = [
      createMeta('Last Scan', formatTimestamp(port.lastScanTime)),
      createMeta('Port Type', port.portTypeDesc || port.portType || '--'),
      createMeta('Created', formatTimestamp(port.createdTime)),
      createMeta('Updated', formatTimestamp(port.updatedTime))
    ].join('');

    elements.portsGrid.appendChild(node);
  });
}

function setRefreshState(message, healthy = true) {
  elements.refreshState.textContent = message;
  document.querySelector('.pulse-dot').style.background = healthy ? 'var(--green)' : 'var(--rose)';
}

async function loadDashboard() {
  elements.windowLabel.textContent = getWindowLabel();
  setRefreshState('Refreshing live data...', true);

  try {
    const query = buildQuery();
    const response = await fetch(`/api/dashboard${query ? `?${query}` : ''}`);
    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.detail || payload.message || 'Unknown error');
    }

    state.availablePorts = payload.availablePorts || [];
    state.hiddenPorts = payload.filters?.hiddenPorts || state.hiddenPorts;
    renderVisibilityOptions();
    renderSummary(payload.summary);
    renderBreakdown(payload.summary);
    renderRecentScans(payload.summary);
    renderPorts(payload.ports);
    elements.lastRefresh.textContent = formatTimestamp(payload.generatedAt);
    setRefreshState('Live polling active', true);
  } catch (error) {
    elements.recentScans.innerHTML = `<div class="empty-state">${error.message}</div>`;
    elements.portsGrid.innerHTML = '<div class="empty-state">Dashboard data is unavailable.</div>';
    setRefreshState('Connection warning', false);
  }
}

function resetAutoRefresh() {
  if (state.timerId) {
    clearInterval(state.timerId);
    state.timerId = null;
  }

  if (state.autoRefresh) {
    state.timerId = setInterval(loadDashboard, state.pollingMs);
  }

  elements.pollingMode.textContent = state.autoRefresh ? 'AUTO' : 'MANUAL';
}

elements.refreshToggle.addEventListener('click', () => {
  state.autoRefresh = !state.autoRefresh;
  elements.refreshToggle.classList.toggle('active', state.autoRefresh);
  elements.refreshToggle.textContent = state.autoRefresh ? 'ON' : 'OFF';
  resetAutoRefresh();
});

elements.visibilityToggleButton.addEventListener('click', () => {
  elements.visibilityPanel.classList.toggle('hidden-panel');
});

elements.visibilityOptions.addEventListener('change', updateVisibilitySummary);

elements.selectAllPortsButton.addEventListener('click', () => {
  setVisibilityCheckboxes(true);
});

elements.hideAllPortsButton.addEventListener('click', () => {
  setVisibilityCheckboxes(false);
});

elements.resetHiddenPortsButton.addEventListener('click', () => {
  saveHiddenPorts([]);
  renderVisibilityOptions();
  loadDashboard();
});

elements.applyHiddenPortsButton.addEventListener('click', () => {
  saveHiddenPorts(collectHiddenPortsFromPanel());
  loadDashboard();
});

elements.applyFiltersButton.addEventListener('click', loadDashboard);

initializeDefaultWindow();
resetAutoRefresh();
loadDashboard();