const boardElements = {
  refreshInterval: document.getElementById('boardRefreshInterval'),
  visibilityToggle: document.getElementById('boardVisibilityToggle'),
  applyButton: document.getElementById('boardApplyButton'),
  fullscreenButton: document.getElementById('boardFullscreenButton'),
  visibilityPanel: document.getElementById('boardVisibilityPanel'),
  visibilitySummary: document.getElementById('boardVisibilitySummary'),
  visibilityOptions: document.getElementById('boardVisibilityOptions'),
  showAllPorts: document.getElementById('boardShowAllPorts'),
  hideAllPorts: document.getElementById('boardHideAllPorts'),
  resetPorts: document.getElementById('boardResetPorts'),
  applyPorts: document.getElementById('boardApplyPorts'),
  refreshState: document.getElementById('boardRefreshState'),
  lastRefresh: document.getElementById('boardLastRefresh'),
  cacheState: document.getElementById('boardCacheState'),
  totalBags: document.getElementById('headlineTotalBags'),
  activePorts: document.getElementById('headlineActivePorts'),
  alertPorts: document.getElementById('headlineAlertPorts'),
  bypassPorts: document.getElementById('headlineBypassPorts'),
  totalWeight: document.getElementById('headlineTotalWeight'),
  readyPorts: document.getElementById('headlineReadyPorts'),
  completion: document.getElementById('headlineCompletion'),
  bagRing: document.getElementById('bagTotalRing'),
  bagRingValue: document.getElementById('bagTotalRingValue'),
  breakdown: document.getElementById('boardBreakdown'),
  recentActivity: document.getElementById('boardRecentActivity'),
  portsGrid: document.getElementById('boardPortsGrid'),
  portCount: document.getElementById('boardPortCount'),
  windowLabel: document.getElementById('boardWindowLabel'),
  portTemplate: document.getElementById('boardPortTemplate')
};

const boardState = {
  timerId: null,
  intervalMs: 120000,
  hiddenPorts: boardLoadHiddenPorts(),
  availablePorts: []
};

const boardHiddenPortsStorageKey = 'muvs-dashboard-hidden-ports';

function boardLoadHiddenPorts() {
  try {
    const value = window.localStorage.getItem(boardHiddenPortsStorageKey);
    return value ? JSON.parse(value) : [];
  } catch {
    return [];
  }
}

function boardSaveHiddenPorts(hiddenPorts) {
  boardState.hiddenPorts = [...new Set(hiddenPorts.map((item) => String(item)))];
  window.localStorage.setItem(boardHiddenPortsStorageKey, JSON.stringify(boardState.hiddenPorts));
}

function boardPad(value) {
  return String(value).padStart(2, '0');
}

function toLocalInput(date) {
  return `${date.getFullYear()}-${boardPad(date.getMonth() + 1)}-${boardPad(date.getDate())}T${boardPad(date.getHours())}:${boardPad(date.getMinutes())}`;
}

function getBoardTodayWindow() {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  return {
    start,
    end: now,
    startInput: toLocalInput(start),
    endInput: toLocalInput(now)
  };
}

function boardFormatNumber(value, digits = 0) {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits
  }).format(Number(value || 0));
}

function boardFormatTimestamp(value) {
  if (!value) {
    return '--';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(date);
}

function boardQuery() {
  const todayWindow = getBoardTodayWindow();
  const params = new URLSearchParams();
  params.set('startTime', todayWindow.startInput);
  params.set('endTime', todayWindow.endInput);
  if (boardState.hiddenPorts.length) {
    params.set('hiddenPorts', boardState.hiddenPorts.join(','));
  }
  return params.toString();
}

function boardCollectHiddenPorts() {
  const checkboxes = [...boardElements.visibilityOptions.querySelectorAll('input[type="checkbox"]')];
  return checkboxes.filter((checkbox) => !checkbox.checked).map((checkbox) => checkbox.value);
}

function boardUpdateVisibilitySummary() {
  const hiddenCount = boardCollectHiddenPorts().length;
  const visibleCount = Math.max(boardState.availablePorts.length - hiddenCount, 0);
  boardElements.visibilitySummary.textContent = `Visible ${visibleCount} / Hidden ${hiddenCount}`;
}

function boardRenderVisibilityOptions() {
  boardElements.visibilityOptions.innerHTML = '';
  if (!boardState.availablePorts.length) {
    boardElements.visibilityOptions.innerHTML = '<div class="empty-board-state">No ports loaded yet.</div>';
    return;
  }

  boardState.availablePorts.forEach((portItem) => {
    const wrapper = document.createElement('label');
    wrapper.className = 'board-visibility-option';
    wrapper.innerHTML = `
      <input type="checkbox" value="${portItem.portCode}" ${boardState.hiddenPorts.includes(String(portItem.portCode)) ? '' : 'checked'} />
      <span>${portItem.portName || `Port ${portItem.portCode}`}</span>
      <strong>Port ${portItem.portCode}</strong>
    `;
    boardElements.visibilityOptions.appendChild(wrapper);
  });

  boardUpdateVisibilitySummary();
}

function boardSetVisibilityCheckboxes(checked) {
  boardElements.visibilityOptions.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    checkbox.checked = checked;
  });
  boardUpdateVisibilitySummary();
}

function boardStatusText(status) {
  const dictionary = {
    'Ready To Feed': 'Ready To Feed / 可投料',
    Feeding: 'Feeding / 投料中',
    'Power On': 'Power On / 已上电',
    Locked: 'Locked / 锁定',
    Alarm: 'Alarm / 报警',
    'Bypass Active': 'Bypass Active / 旁路开启',
    'Bypass On': 'Bypass On / 旁路开启',
    'Bypass Off': 'Bypass Off / 未旁路',
    'Red Lamp On': 'Red Lamp On / 红灯亮',
    'Green Lamp On': 'Green Lamp On / 绿灯亮',
    'Red + Green On': 'Red + Green On / 红绿灯同时亮',
    'Lamp Off': 'Lamp Off / 灯灭',
    'OPC Fault': 'OPC Fault / 通讯异常',
    Idle: 'Idle / 待机'
  };

  return dictionary[status] || status;
}

function boardTone(statusTone) {
  return `tone-${statusTone || 'muted'}`;
}

function boardStateBadge(label, stateItem) {
  return `
    <div class="board-state-badge ${boardTone(stateItem.tone)}">
      <span>${label}</span>
      <strong>${boardStatusText(stateItem.label)}</strong>
    </div>
  `;
}

function boardSetState(message, healthy) {
  boardElements.refreshState.textContent = message;
  document.querySelector('.live-dot').style.background = healthy ? 'var(--green)' : 'var(--rose)';
}

function boardRenderHeadlines(summary) {
  const bypassPorts = Number(summary.bypassPorts || 0);
  const bypassKpiCard = boardElements.bypassPorts.closest('.headline-card');
  boardElements.totalBags.textContent = boardFormatNumber(summary.totalPutBags);
  boardElements.activePorts.textContent = boardFormatNumber(summary.activePorts);
  boardElements.alertPorts.textContent = boardFormatNumber(summary.alertPorts);
  boardElements.bypassPorts.textContent = boardFormatNumber(bypassPorts);
  boardElements.totalWeight.textContent = `${boardFormatNumber(summary.totalPutWeight, 2)} kg`;
  boardElements.readyPorts.textContent = boardFormatNumber(summary.readyPorts);
  boardElements.completion.textContent = `${boardFormatNumber(summary.completionAverage, 1)}%`;
  boardElements.bagRingValue.textContent = boardFormatNumber(summary.totalPutBags);
  const ringProgress = Math.min(summary.totalPutBags * 10, 100);
  boardElements.bagRing.style.setProperty('--progress', ringProgress);
  bypassKpiCard.classList.toggle('kpi-critical-active', bypassPorts > 0);
}

function boardRenderBreakdown(summary) {
  const labels = {
    ready: '可投 Ready',
    feeding: '投料中 Feeding',
    armed: '已上电 Armed',
    idle: '待机 Idle',
    locked: '锁定 Locked',
    alarm: '报警 Alarm',
    bypass: '旁路开启 Bypass',
    'opc-error': '异常 OPC Fault'
  };
  const tones = {
    ready: 'tone-healthy',
    feeding: 'tone-active',
    armed: 'tone-active',
    idle: 'tone-muted',
    locked: 'tone-warning',
    alarm: 'tone-critical',
    bypass: 'tone-critical',
    'opc-error': 'tone-critical'
  };

  boardElements.breakdown.innerHTML = '';
  Object.entries(summary.breakdown)
    .sort((left, right) => right[1] - left[1])
    .forEach(([key, value]) => {
      const node = document.createElement('div');
      node.className = `breakdown-pill ${tones[key] || 'tone-muted'}`;
      node.innerHTML = `<span>${labels[key] || key}</span><strong>${boardFormatNumber(value)}</strong>`;
      boardElements.breakdown.appendChild(node);
    });
}

function boardRenderRecentActivity(summary) {
  boardElements.recentActivity.innerHTML = '';
  if (!summary.recentScans.length) {
    boardElements.recentActivity.innerHTML = '<div class="empty-board-state">当前时间窗没有扫码记录 / No scan activity in the selected window.</div>';
    return;
  }

  summary.recentScans.forEach((item) => {
    const node = document.createElement('div');
    node.className = 'activity-item';
    node.innerHTML = `
      <div class="activity-item-title">
        <strong>${item.portName}</strong>
        <span class="board-chip">${boardStatusText(item.status)}</span>
      </div>
      <p>${item.materialName || 'No material / 无物料'}</p>
      <p>${boardFormatTimestamp(item.lastScanTime)} | ${boardFormatNumber(item.totalPutWeight, 2)} kg</p>
    `;
    boardElements.recentActivity.appendChild(node);
  });
}

function boardRenderPorts(ports) {
  boardElements.portsGrid.innerHTML = '';
  boardElements.portCount.textContent = `${ports.length} ports${boardState.hiddenPorts.length ? ` | Hidden ${boardState.hiddenPorts.length}` : ''}`;

  if (!ports.length) {
    boardElements.portsGrid.innerHTML = '<div class="empty-board-state">没有匹配到料口数据 / No port data matched the current filter.</div>';
    return;
  }

  const orderedPorts = [...ports].sort((left, right) => {
    const bagDiff = Number(right.totalPutBags || 0) - Number(left.totalPutBags || 0);
    if (bagDiff !== 0) {
      return bagDiff;
    }
    return Number(left.portCode || 0) - Number(right.portCode || 0);
  });

  orderedPorts.forEach((port) => {
    const node = boardElements.portTemplate.content.firstElementChild.cloneNode(true);
    if (port.tags.bypass) {
      node.classList.add('board-port-bypass');
    }
    node.querySelector('.board-port-code').textContent = `Port ${port.portCode}`;
    node.querySelector('.board-port-name').textContent = `${port.portName || `Port ${port.portCode}`}`;
    const pill = node.querySelector('.board-status-pill');
    pill.textContent = boardStatusText(port.portState.label);
    pill.classList.add(boardTone(port.portState.tone));

    node.querySelector('.board-bag-count').textContent = boardFormatNumber(port.totalPutBags);
    node.querySelector('.board-material-name').textContent = port.materialName || 'No material / 无物料';
    node.querySelector('.board-material-meta').textContent = `Code ${port.materialCode || '--'} | Batch ${port.batchCode || '--'}`;
    node.querySelector('.board-state-strip').innerHTML = [
      boardStateBadge('Port / 口状态', port.portState),
      boardStateBadge('Lamp / 灯状态', port.lampState),
      boardStateBadge('Bypass / 旁路', port.bypassState)
    ].join('');
    node.querySelector('.board-port-weight').textContent = `${boardFormatNumber(port.totalPutWeight, 2)} kg`;
    node.querySelector('.board-port-progress').textContent = `${boardFormatNumber(port.progress, 0)}%`;
    node.querySelector('.board-port-lastscan').textContent = boardFormatTimestamp(port.lastScanTime);

    boardElements.portsGrid.appendChild(node);
  });
}

function boardUpdateWindowLabel() {
  const todayWindow = getBoardTodayWindow();
  boardElements.windowLabel.textContent = `今日 Today | ${todayWindow.startInput.replace('T', ' ')} -> ${todayWindow.endInput.replace('T', ' ')}`;
}

async function boardLoad() {
  boardUpdateWindowLabel();
  boardSetState('Refreshing / 刷新中', true);
  try {
    const response = await fetch(`/api/dashboard?${boardQuery()}`);
    const payload = await response.json();
    if (!response.ok) {
      throw new Error(payload.detail || payload.message || 'Unknown error');
    }

    boardState.availablePorts = payload.availablePorts || [];
    boardState.hiddenPorts = payload.filters?.hiddenPorts || boardState.hiddenPorts;
    boardRenderVisibilityOptions();
    boardRenderHeadlines(payload.summary);
    boardRenderBreakdown(payload.summary);
    boardRenderRecentActivity(payload.summary);
    boardRenderPorts(payload.ports);
    boardElements.lastRefresh.textContent = boardFormatTimestamp(payload.generatedAt);
    boardElements.cacheState.textContent = payload.cache.hit
      ? `Hit ${Math.round(payload.cache.ageMs / 1000)}s / TTL ${Math.round(payload.cache.ttlMs / 1000)}s`
      : `Fresh / TTL ${Math.round(payload.cache.ttlMs / 1000)}s`;
    boardSetState('Running / 运行中', true);
  } catch (error) {
    boardElements.recentActivity.innerHTML = `<div class="empty-board-state">${error.message}</div>`;
    boardElements.portsGrid.innerHTML = '<div class="empty-board-state">数据不可用 / Dashboard data unavailable.</div>';
    boardSetState('Warning / 异常', false);
  }
}

function boardResetTimer() {
  if (boardState.timerId) {
    clearInterval(boardState.timerId);
  }
  boardState.intervalMs = Number(boardElements.refreshInterval.value || 120000);
  boardState.timerId = setInterval(boardLoad, boardState.intervalMs);
}

boardElements.applyButton.addEventListener('click', () => {
  boardResetTimer();
  boardLoad();
});

boardElements.visibilityToggle.addEventListener('click', () => {
  boardElements.visibilityPanel.classList.toggle('hidden-panel');
});

boardElements.visibilityOptions.addEventListener('change', boardUpdateVisibilitySummary);

boardElements.showAllPorts.addEventListener('click', () => {
  boardSetVisibilityCheckboxes(true);
});

boardElements.hideAllPorts.addEventListener('click', () => {
  boardSetVisibilityCheckboxes(false);
});

boardElements.resetPorts.addEventListener('click', () => {
  boardSaveHiddenPorts([]);
  boardRenderVisibilityOptions();
  boardLoad();
});

boardElements.applyPorts.addEventListener('click', () => {
  boardSaveHiddenPorts(boardCollectHiddenPorts());
  boardLoad();
});

boardElements.refreshInterval.addEventListener('change', () => {
  boardResetTimer();
});

boardElements.fullscreenButton.addEventListener('click', async () => {
  if (!document.fullscreenElement) {
    await document.documentElement.requestFullscreen();
    return;
  }
  await document.exitFullscreen();
});

boardResetTimer();
boardLoad();