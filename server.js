const path = require('path');
const express = require('express');
const sql = require('mssql');
const dotenv = require('dotenv');

dotenv.config();

const app = express();
const port = Number(process.env.APP_PORT || 3036);
const host = process.env.APP_HOST || '0.0.0.0';
const cacheTtlMs = Number(process.env.DASHBOARD_CACHE_TTL_MS || 60000);

const dbConfig = {
  server: process.env.DB_SERVER || '',
  database: process.env.DB_DATABASE || 'MUVS',
  user: process.env.DB_USER || '',
  password: process.env.DB_PASSWORD || '',
  port: Number(process.env.DB_PORT || 1433),
  options: {
    trustServerCertificate: true,
    encrypt: false
  },
  pool: {
    max: 10,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

let poolPromise;
const dashboardCache = new Map();

function getPool() {
  if (!dbConfig.server || !dbConfig.user || !dbConfig.password) {
    throw new Error('Missing database connection settings. Configure DB_SERVER, DB_USER, and DB_PASSWORD in .env.');
  }

  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(dbConfig)
      .connect()
      .catch((error) => {
        poolPromise = undefined;
        throw error;
      });
  }

  return poolPromise;
}

function parseNumber(value) {
  const numeric = Number.parseFloat(String(value ?? '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatDateTimeInput(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

function getDefaultWindowBounds() {
  const startTime = new Date();
  startTime.setHours(0, 0, 0, 0);
  const endTime = new Date(startTime);
  endTime.setDate(endTime.getDate() + 1);

  return { startTime, endTime };
}

function resolveWindowBounds(startTime, endTime) {
  const defaults = getDefaultWindowBounds();
  return {
    startTime: startTime || defaults.startTime,
    endTime: endTime || defaults.endTime
  };
}

function normalizeDateTimeOutput(value) {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toISOString();
}

function normalizeHiddenPorts(value) {
  const rawValues = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(rawValues.map((item) => String(item || '').trim()).filter(Boolean))]
    .sort((left, right) => parseNumber(left) - parseNumber(right));
}

function normalizeBool(value) {
  return String(value || '').toLowerCase() === 'true';
}

function resolveLampState(tags) {
  if (tags.redLamp && tags.greenLamp) {
    return { key: 'red-green', label: 'Red + Green On', tone: 'warning' };
  }

  if (tags.redLamp) {
    return { key: 'red', label: 'Red Lamp On', tone: 'critical' };
  }

  if (tags.greenLamp) {
    return { key: 'green', label: 'Green Lamp On', tone: 'healthy' };
  }

  return { key: 'off', label: 'Lamp Off', tone: 'muted' };
}

function resolvePortState({ opcFault, tags, totalPutWeight }) {
  if (opcFault) {
    return { key: 'opc-error', label: 'OPC Fault', tone: 'critical' };
  }

  if (tags.bypass) {
    return { key: 'bypass', label: 'Bypass Active', tone: 'critical' };
  }

  if (tags.locked) {
    return { key: 'locked', label: 'Locked', tone: 'warning' };
  }

  if (tags.redLamp) {
    return { key: 'alarm', label: 'Alarm', tone: 'critical' };
  }

  if (totalPutWeight > 0) {
    return { key: 'feeding', label: 'Feeding', tone: 'active' };
  }

  if (tags.secondCheck && tags.greenLamp) {
    return { key: 'ready', label: 'Ready To Feed', tone: 'healthy' };
  }

  if (tags.power) {
    return { key: 'armed', label: 'Power On', tone: 'active' };
  }

  return { key: 'idle', label: 'Idle', tone: 'muted' };
}

function resolveBypassState(tags) {
  return tags.bypass
    ? { key: 'bypass-on', label: 'Bypass On', tone: 'critical' }
    : { key: 'bypass-off', label: 'Bypass Off', tone: 'muted' };
}

function toPortModel(row) {
  const targetWeight = parseNumber(row.PushWeight);
  const totalPutWeight = parseNumber(row.TotalPutWeight);
  const totalPutBags = parseNumber(row.TotalPutBags);
  const parsedProgress = parseNumber(row.PutProgress);
  const progress = Math.max(0, Math.min(parsedProgress || (targetWeight ? (totalPutWeight / targetWeight) * 100 : 0), 100));
  const tags = {
    power: normalizeBool(row.PowerSwitchTag_Val),
    secondCheck: normalizeBool(row.SecondCheckTag_Val),
    redLamp: normalizeBool(row.RedLampTag_Val),
    greenLamp: normalizeBool(row.GreenLampTag_Val),
    locked: normalizeBool(row.LockedTag_Val),
    bypass: normalizeBool(row.ByPassTag_Val)
  };
  const opcFault = normalizeBool(row.OPCStatusShow);
  const lampState = resolveLampState(tags);
  const portState = resolvePortState({ opcFault, tags, totalPutWeight });
  const bypassState = resolveBypassState(tags);
  const status = portState;

  return {
    gid: row.GID,
    portCode: row.PortCode,
    portName: row.PortName,
    portType: row.PortType,
    portTypeDesc: row.PortTypeDesc,
    materialCode: row.CurrentMatCode || row.MatCode || '',
    materialName: row.CurrentMatName || row.MatName || '',
    materialQrCode: row.CurrentMatQRCode || '',
    batchCode: row.CurrentMatBatchCode || '',
    targetWeight,
    totalPutWeight,
    totalPutBags,
    progress,
    lastScanTime: row.LastScanTime || row.SPut_Time || '',
    createdTime: row.CTime || '',
    updatedTime: row.MTime || '',
    operators: {
      createdBy: row.CUser || '',
      updatedBy: row.MUser || '',
      scannedBy: row.SPut_User || ''
    },
    tags,
    opcFault,
    lampState,
    portState,
    bypassState,
    status
  };
}

function toHistoryRecord(row) {
  return {
    gid: row.GID || '',
    portCode: String(row.PortCode || ''),
    portName: row.PortName || '',
    materialCode: row.PushMatCode || '',
    materialName: row.PushMatName || '',
    batchCode: row.PushMatBatch || '',
    pushWeight: parseNumber(row.PushWeight),
    scanTime: normalizeDateTimeOutput(row.STime),
    scanUser: row.SUser || ''
  };
}

function buildHistoryByPort(historyRecords) {
  return historyRecords.reduce((accumulator, historyItem) => {
    const key = String(historyItem.portCode || '');
    const current = accumulator.get(key) || {
      totalPutWeight: 0,
      totalPutBags: 0,
      lastScanTime: '',
      latestRecord: null
    };

    current.totalPutWeight += historyItem.pushWeight;
    current.totalPutBags += 1;

    if (!current.lastScanTime || new Date(historyItem.scanTime).getTime() > new Date(current.lastScanTime).getTime()) {
      current.lastScanTime = historyItem.scanTime;
      current.latestRecord = historyItem;
    }

    accumulator.set(key, current);
    return accumulator;
  }, new Map());
}

function mergePortsWithHistory(ports, historyRecords) {
  const historyByPort = buildHistoryByPort(historyRecords);

  return ports.map((portItem) => {
    const historySummary = historyByPort.get(String(portItem.portCode));
    const totalPutWeight = historySummary ? Number(historySummary.totalPutWeight.toFixed(2)) : 0;
    const totalPutBags = historySummary ? historySummary.totalPutBags : 0;
    const lastScanTime = historySummary ? historySummary.lastScanTime : '';
    const latestRecord = historySummary?.latestRecord;
    const progress = Math.max(
      0,
      Math.min(portItem.targetWeight ? (totalPutWeight / portItem.targetWeight) * 100 : 0, 100)
    );
    const portState = resolvePortState({
      opcFault: portItem.opcFault,
      tags: portItem.tags,
      totalPutWeight
    });

    return {
      ...portItem,
      materialCode: latestRecord?.materialCode || portItem.materialCode,
      materialName: latestRecord?.materialName || portItem.materialName,
      batchCode: latestRecord?.batchCode || portItem.batchCode,
      totalPutWeight,
      totalPutBags,
      progress: Number(progress.toFixed(1)),
      lastScanTime,
      portState,
      status: portState
    };
  });
}

function summarize(ports, historyRecords) {
  const breakdown = ports.reduce((accumulator, portItem) => {
    accumulator[portItem.status.key] = (accumulator[portItem.status.key] || 0) + 1;
    return accumulator;
  }, {});

  const totalPutWeight = historyRecords.reduce((sum, historyItem) => sum + historyItem.pushWeight, 0);
  const totalPutBags = historyRecords.length;
  const readyPorts = ports.filter((portItem) => portItem.status.key === 'ready').length;
  const alertPorts = ports.filter((portItem) => portItem.status.key === 'alarm' || portItem.status.key === 'opc-error').length;
  const bypassPorts = ports.filter((portItem) => portItem.status.key === 'bypass').length;
  const activePorts = ports.filter((portItem) => ['ready', 'feeding', 'armed'].includes(portItem.status.key)).length;
  const completionAverage = ports.length
    ? ports.reduce((sum, portItem) => sum + portItem.progress, 0) / ports.length
    : 0;

  breakdown.ready = breakdown.ready || 0;
  breakdown.feeding = breakdown.feeding || 0;
  breakdown.armed = breakdown.armed || 0;
  breakdown.idle = breakdown.idle || 0;
  breakdown.locked = breakdown.locked || 0;
  breakdown.alarm = breakdown.alarm || 0;
  breakdown.bypass = breakdown.bypass || 0;
  breakdown['opc-error'] = breakdown['opc-error'] || 0;

  const recentScans = historyRecords
    .filter((historyItem) => historyItem.scanTime)
    .sort((left, right) => new Date(right.scanTime).getTime() - new Date(left.scanTime).getTime())
    .slice(0, 6)
    .map((historyItem) => ({
      portCode: historyItem.portCode,
      portName: historyItem.portName,
      materialName: historyItem.materialName,
      lastScanTime: historyItem.scanTime,
      status: 'History Record',
      totalPutWeight: historyItem.pushWeight,
      scanUser: historyItem.scanUser
    }));

  return {
    totalPorts: ports.length,
    readyPorts,
    activePorts,
    alertPorts,
    bypassPorts,
    totalPutWeight: Number(totalPutWeight.toFixed(2)),
    totalPutBags,
    completionAverage: Number(completionAverage.toFixed(1)),
    breakdown,
    recentScans
  };
}

async function fetchPortStates({ portCode, startTime, endTime }) {
  const pool = await getPool();
  const request = pool.request();

  request.input('PortCode', sql.NVarChar(50), portCode || '');
  request.input('STime', sql.DateTime, startTime || null);
  request.input('ETime', sql.DateTime, endTime || null);

  const result = await request.execute('dbo.GetPortState_Test');
  return (result.recordset || []).map(toPortModel).sort((left, right) => parseNumber(left.portCode) - parseNumber(right.portCode));
}

async function fetchPortHistory({ portCode, startTime, endTime }) {
  const pool = await getPool();
  const request = pool.request();

  request.input('PortCode', sql.NVarChar(50), portCode || '');
  request.input('STime', sql.DateTime, startTime || null);
  request.input('ETime', sql.DateTime, endTime || null);

  const result = await request.query(`
    SELECT
      GID,
      PortCode,
      PortName,
      PushMatCode,
      PushMatName,
      PushWeight,
      PushMatBatch,
      STime,
      SUser
    FROM PortHis WITH (NOLOCK)
    WHERE (@PortCode = '' OR PortCode = @PortCode)
      AND STime >= @STime
      AND STime < @ETime
    ORDER BY STime DESC, TRY_CAST(PortCode AS int)
  `);

  return (result.recordset || []).map(toHistoryRecord);
}

function buildCacheKey({ portCode, startTime, endTime }) {
  return JSON.stringify({
    portCode: portCode || '',
    startTime: startTime ? startTime.toISOString() : null,
    endTime: endTime ? endTime.toISOString() : null
  });
}

async function getBaseDashboardPayload({ portCode, startTime, endTime }) {
  const cacheKey = buildCacheKey({ portCode, startTime, endTime });
  const now = Date.now();
  const cached = dashboardCache.get(cacheKey);

  if (cached && now - cached.cachedAt < cacheTtlMs) {
    return {
      ...cached.payload,
      cache: {
        hit: true,
        ttlMs: cacheTtlMs,
        ageMs: now - cached.cachedAt,
        cachedAt: new Date(cached.cachedAt).toISOString()
      }
    };
  }

  const [basePorts, historyRecords] = await Promise.all([
    fetchPortStates({ portCode, startTime, endTime }),
    fetchPortHistory({ portCode, startTime, endTime })
  ]);
  const ports = mergePortsWithHistory(basePorts, historyRecords);
  const payload = {
    title: 'Chengdu 6F MUVS Real-time Dashboard',
    generatedAt: new Date().toISOString(),
    filters: {
      portCode,
      startTime: startTime ? startTime.toISOString() : null,
      endTime: endTime ? endTime.toISOString() : null,
      hiddenPorts: []
    },
    availablePorts: ports.map((portItem) => ({
      portCode: portItem.portCode,
      portName: portItem.portName
    })),
    historyRecords,
    ports
  };

  dashboardCache.set(cacheKey, {
    cachedAt: now,
    payload
  });

  return {
    ...payload,
    cache: {
      hit: false,
      ttlMs: cacheTtlMs,
      ageMs: 0,
      cachedAt: new Date(now).toISOString()
    }
  };
}

function applyHiddenPorts(basePayload, hiddenPorts) {
  const hiddenPortSet = new Set(hiddenPorts);
  const visiblePorts = basePayload.ports.filter((portItem) => !hiddenPortSet.has(String(portItem.portCode)));
  const visibleHistoryRecords = basePayload.historyRecords.filter((historyItem) => !hiddenPortSet.has(String(historyItem.portCode)));
  const hiddenPortCount = basePayload.availablePorts.filter((portItem) => hiddenPortSet.has(String(portItem.portCode))).length;

  return {
    ...basePayload,
    filters: {
      ...basePayload.filters,
      hiddenPorts
    },
    summary: {
      ...summarize(visiblePorts, visibleHistoryRecords),
      hiddenPortCount,
      availablePortCount: basePayload.availablePorts.length
    },
    historyRecords: visibleHistoryRecords,
    ports: visiblePorts
  };
}

app.use(express.static(path.join(__dirname, 'public')));

app.get('/board', (request, response) => {
  response.sendFile(path.join(__dirname, 'public', 'board.html'));
});

app.get('/nav', (request, response) => {
  response.sendFile(path.join(__dirname, 'public', 'nav.html'));
});

app.get('/api/health', async (request, response) => {
  try {
    const pool = await getPool();
    await pool.request().query('SELECT 1 AS ok');
    response.json({ ok: true, timestamp: new Date().toISOString() });
  } catch (error) {
    response.status(500).json({ ok: false, message: error.message });
  }
});

app.get('/api/dashboard', async (request, response) => {
  try {
    const requestedStartTime = formatDateTimeInput(request.query.startTime);
    const requestedEndTime = formatDateTimeInput(request.query.endTime);
    const { startTime, endTime } = resolveWindowBounds(requestedStartTime, requestedEndTime);
    const portCode = String(request.query.portCode || '').trim();
    const hiddenPorts = normalizeHiddenPorts(request.query.hiddenPorts);
    const basePayload = await getBaseDashboardPayload({ portCode, startTime, endTime });
    const payload = applyHiddenPorts(basePayload, hiddenPorts);

    response.set('Cache-Control', 'no-store');
    response.json(payload);
  } catch (error) {
    response.status(500).json({
      message: 'Failed to load dashboard data.',
      detail: error.message
    });
  }
});

app.listen(port, host, () => {
  console.log(`MUVS dashboard listening on http://localhost:${port}`);
  console.log(`MUVS dashboard LAN access may be available on http://<this-machine-ip>:${port}`);
});