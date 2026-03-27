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
  metricBypassPorts: document.getElementById('metricBypassPorts'),
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
  historyCountLabel: document.getElementById('historyCountLabel'),
  historyRecords: document.getElementById('historyRecords'),
  exportHistoryCsvButton: document.getElementById('exportHistoryCsvButton'),
  exportHistoryExcelButton: document.getElementById('exportHistoryExcelButton'),
  portCardTemplate: document.getElementById('portCardTemplate')
};

const state = {
  autoRefresh: true,
  timerId: null,
  pollingMs: 15000,
  hiddenPorts: loadHiddenPorts(),
  availablePorts: [],
  historyRecords: []
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

function formatFileStamp(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function escapeCsvValue(value) {
  const normalized = String(value ?? '');
  if (normalized.includes(',') || normalized.includes('"') || normalized.includes('\n')) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
}

function downloadBlob(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.URL.revokeObjectURL(url);
}

function getHistoryExportRows() {
  return state.historyRecords.map((historyItem) => ({
    portCode: historyItem.portCode || '',
    portName: historyItem.portName || '',
    materialCode: historyItem.materialCode || '',
    materialName: historyItem.materialName || '',
    batchCode: historyItem.batchCode || '',
    pushWeight: Number(historyItem.pushWeight || 0),
    scanTime: formatTimestamp(historyItem.scanTime),
    scanUser: historyItem.scanUser || ''
  }));
}

function exportHistoryCsv() {
  const rows = getHistoryExportRows();
  if (!rows.length) {
    return;
  }

  const headers = ['PortCode', 'PortName', 'MaterialCode', 'MaterialName', 'BatchCode', 'PushWeightKg', 'ScanTime', 'ScanUser'];
  const lines = [headers.join(',')];

  rows.forEach((row) => {
    lines.push([
      row.portCode,
      row.portName,
      row.materialCode,
      row.materialName,
      row.batchCode,
      row.pushWeight,
      row.scanTime,
      row.scanUser
    ].map(escapeCsvValue).join(','));
  });

  downloadBlob(`\uFEFF${lines.join('\r\n')}`, `muvs_history_${formatFileStamp()}.csv`, 'text/csv;charset=utf-8;');
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function exportHistoryExcel() {
  const rows = getHistoryExportRows();
  if (!rows.length) {
    return;
  }

  const tableRows = rows.map((row) => `
    <tr>
      <td>${escapeHtml(row.portCode)}</td>
      <td>${escapeHtml(row.portName)}</td>
      <td>${escapeHtml(row.materialCode)}</td>
      <td>${escapeHtml(row.materialName)}</td>
      <td>${escapeHtml(row.batchCode)}</td>
      <td>${escapeHtml(row.pushWeight)}</td>
      <td>${escapeHtml(row.scanTime)}</td>
      <td>${escapeHtml(row.scanUser)}</td>
    </tr>
  `).join('');

  const workbook = `
    <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
      <head>
        <meta charset="UTF-8" />
      </head>
      <body>
        <table>
          <thead>
            <tr>
              <th>PortCode</th>
              <th>PortName</th>
              <th>MaterialCode</th>
              <th>MaterialName</th>
              <th>BatchCode</th>
              <th>PushWeightKg</th>
              <th>ScanTime</th>
              <th>ScanUser</th>
            </tr>
          </thead>
          <tbody>${tableRows}</tbody>
        </table>
      </body>
    </html>
  `;

  downloadBlob(`\uFEFF${workbook}`, `muvs_history_${formatFileStamp()}.xls`, 'application/vnd.ms-excel;charset=utf-8;');
}

function statusText(status) {
  const dictionary = {
    'Ready To Feed': '可投料 Ready To Feed',
    Feeding: '投料中 Feeding',
    'Power On': '已上电 Power On',
    Locked: '锁定 Locked',
    Alarm: '报警 Alarm',
    'Bypass Active': '旁路开启 Bypass Active',
    'Bypass On': '旁路开启 Bypass On',
    'Bypass Off': '未旁路 Bypass Off',
    'Red Lamp On': '红灯亮 Red Lamp On',
    'Green Lamp On': '绿灯亮 Green Lamp On',
    'Red + Green On': '红绿灯同时亮 Red + Green On',
    'Lamp Off': '灯灭 Lamp Off',
    'History Record': '历史投料 History Record',
    'OPC Fault': '通讯异常 OPC Fault',
    Idle: '待机 Idle'
  };

  return dictionary[status] || status;
}

function getWindowLabel() {
  const start = elements.startTimeInput.value;
  const end = elements.endTimeInput.value;
  if (!start && !end) {
    return '存储过程默认窗口 / Procedure default window';
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
  elements.visibilitySummary.textContent = `显示 ${visibleCount} / 隐藏 ${hiddenCount} | Visible ${visibleCount} / Hidden ${hiddenCount}`;
}

function renderVisibilityOptions() {
  elements.visibilityOptions.innerHTML = '';

  if (!state.availablePorts.length) {
    elements.visibilityOptions.innerHTML = '<div class="empty-state">尚未加载料口数据。 No ports loaded yet.</div>';
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
  const bypassPorts = Number(summary.bypassPorts || 0);
  const bypassKpiCard = elements.metricBypassPorts.closest('.metric-card');
  elements.metricTotalPorts.textContent = formatNumber(summary.totalPorts);
  elements.metricReadyPorts.textContent = formatNumber(summary.readyPorts);
  elements.metricTotalBags.textContent = formatNumber(summary.totalPutBags);
  elements.metricAlertPorts.textContent = formatNumber(summary.alertPorts);
  elements.metricBypassPorts.textContent = formatNumber(bypassPorts);
  elements.metricTotalWeight.textContent = `${formatNumber(summary.totalPutWeight, 2)} kg`;
  elements.metricActivePorts.textContent = formatNumber(summary.activePorts);
  elements.completionValue.textContent = `${formatNumber(summary.completionAverage, 1)}%`;
  elements.completionGauge.style.setProperty('--progress', summary.completionAverage);
  elements.overviewBadge.textContent = summary.alertPorts > 0 ? '需要关注 Attention required' : '系统稳定 System stable';
  elements.portCountLabel.textContent = `${summary.totalPorts} 个料口 ${summary.totalPorts} ports${summary.hiddenPortCount ? ` | 已隐藏 ${summary.hiddenPortCount} | Hidden ${summary.hiddenPortCount}` : ''}`;
  bypassKpiCard.classList.toggle('kpi-critical-active', bypassPorts > 0);
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
    bypass: 'tone-critical',
    'opc-error': 'tone-critical'
  };
  const labelMap = {
    ready: '可投料 Ready',
    feeding: '投料中 Feeding',
    armed: '已上电 Power On',
    idle: '待机 Idle',
    locked: '锁定 Locked',
    alarm: '报警 Alarm',
    bypass: '旁路开启 Bypass Active',
    'opc-error': '通讯异常 OPC Fault'
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
    elements.recentScans.innerHTML = '<div class="empty-state">当前时间范围内没有扫码记录。 No scan activity found in the current time window.</div>';
    return;
  }

  summary.recentScans.forEach((item) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'timeline-item';
    wrapper.innerHTML = `
      <div class="timeline-item-top">
        <strong>${item.portName || `Port ${item.portCode}`}</strong>
        <span class="status-pill tone-active">${statusText(item.status)}</span>
      </div>
      <p>${item.materialName || '未分配物料 / No material assigned'} | ${formatNumber(item.totalPutWeight, 2)} kg</p>
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

function createStateBadge(label, stateItem) {
  return `
    <div class="state-badge tone-${stateItem.tone}">
      <span>${label}</span>
      <strong>${statusText(stateItem.label)}</strong>
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
    elements.portsGrid.innerHTML = '<div class="empty-state">当前筛选条件下没有料口数据。 No port records matched the selected filters.</div>';
    return;
  }

  ports.forEach((port) => {
    const node = elements.portCardTemplate.content.firstElementChild.cloneNode(true);
    node.querySelector('.port-code').textContent = `Port ${port.portCode}`;
    node.querySelector('.port-name').textContent = port.portName || `Port ${port.portCode}`;
    const statusPill = node.querySelector('.status-pill');
    statusPill.textContent = statusText(port.status.label);
    statusPill.classList.add(`tone-${port.status.tone}`);

    const gauge = node.querySelector('.mini-gauge');
    gauge.style.setProperty('--progress', port.progress);
    gauge.querySelector('span').textContent = `${Math.round(port.progress)}%`;
    node.querySelector('.progress-value').textContent = `${formatNumber(port.totalPutWeight, 2)} kg`;
    node.querySelector('.progress-detail').textContent = `当前（历史）累计 ${formatNumber(port.totalPutBags)} 袋 bags / 目标 target ${formatNumber(port.targetWeight, 0)} kg`;
    node.querySelector('.material-name').textContent = port.materialName || '未分配物料 / No material assigned';
    node.querySelector('.material-meta').textContent = `Code ${port.materialCode || '--'} | Batch ${port.batchCode || '--'}`;
    node.querySelector('.state-strip').innerHTML = [
      createStateBadge('当前（历史）料口状态 Current (History) Port State', port.portState),
      createStateBadge('当前（历史）灯状态 Current (History) Lamp', port.lampState),
      createStateBadge('当前（历史）旁路状态 Current (History) Bypass', port.bypassState)
    ].join('');

    node.querySelector('.signals').innerHTML = [
      createSignal('上电 Power', port.tags.power),
      createSignal('二次校验 2nd Check', port.tags.secondCheck),
      createSignal('绿灯 Green Lamp', port.tags.greenLamp),
      createSignal('红灯 Red Lamp', port.tags.redLamp),
      createSignal('锁定 Locked', port.tags.locked),
      createSignal('旁路 Bypass', port.tags.bypass)
    ].join('');

    node.querySelector('.port-meta-grid').innerHTML = [
      createMeta('当前（历史）最后扫码 Current (History) Last Scan', formatTimestamp(port.lastScanTime)),
      createMeta('料口类型 Port Type', port.portTypeDesc || port.portType || '--'),
      createMeta('创建时间 Created', formatTimestamp(port.createdTime)),
      createMeta('更新时间 Updated', formatTimestamp(port.updatedTime))
    ].join('');

    elements.portsGrid.appendChild(node);
  });
}

function renderHistoryRecords(historyRecords) {
  state.historyRecords = [...historyRecords];
  elements.historyRecords.innerHTML = '';
  elements.historyCountLabel.textContent = `${historyRecords.length} 条记录 ${historyRecords.length} records`;
  elements.exportHistoryCsvButton.disabled = historyRecords.length === 0;
  elements.exportHistoryExcelButton.disabled = historyRecords.length === 0;

  if (!historyRecords.length) {
    elements.historyRecords.innerHTML = '<div class="empty-state">所选时间范围内没有投料历史记录。 No feeding history found in the selected window.</div>';
    return;
  }

  historyRecords.forEach((historyItem) => {
    const row = document.createElement('article');
    row.className = 'history-item';
    row.innerHTML = `
      <div class="history-item-main">
        <div>
          <p class="history-port">${historyItem.portName || `Port ${historyItem.portCode}`}</p>
          <h3>${historyItem.materialName || '未分配物料 / No material assigned'}</h3>
        </div>
        <span class="status-pill tone-active">${formatNumber(historyItem.pushWeight, 2)} kg</span>
      </div>
      <div class="history-meta-grid">
        <div class="meta-item"><span>料口 Port</span><strong>${historyItem.portCode || '--'}</strong></div>
        <div class="meta-item"><span>批次 Batch</span><strong>${historyItem.batchCode || '--'}</strong></div>
        <div class="meta-item"><span>扫码时间 Scan Time</span><strong>${formatTimestamp(historyItem.scanTime)}</strong></div>
        <div class="meta-item"><span>操作人 Operator</span><strong>${historyItem.scanUser || '--'}</strong></div>
      </div>
    `;
    elements.historyRecords.appendChild(row);
  });
}

function setRefreshState(message, healthy = true) {
  elements.refreshState.textContent = message;
  document.querySelector('.pulse-dot').style.background = healthy ? 'var(--green)' : 'var(--rose)';
}

async function loadDashboard() {
  elements.windowLabel.textContent = getWindowLabel();
  setRefreshState('正在刷新实时数据... Refreshing live data...', true);

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
    renderHistoryRecords(payload.historyRecords || []);
    elements.lastRefresh.textContent = formatTimestamp(payload.generatedAt);
    setRefreshState('实时轮询已开启 Live polling active', true);
  } catch (error) {
    elements.recentScans.innerHTML = `<div class="empty-state">${error.message}</div>`;
    elements.portsGrid.innerHTML = '<div class="empty-state">看板数据暂不可用。 Dashboard data is unavailable.</div>';
    elements.historyRecords.innerHTML = '<div class="empty-state">历史数据暂不可用。 History data is unavailable.</div>';
    setRefreshState('连接告警 Connection warning', false);
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

  elements.pollingMode.textContent = state.autoRefresh ? '自动 AUTO' : '手动 MANUAL';
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
elements.exportHistoryCsvButton.addEventListener('click', exportHistoryCsv);
elements.exportHistoryExcelButton.addEventListener('click', exportHistoryExcel);

initializeDefaultWindow();
resetAutoRefresh();
loadDashboard();