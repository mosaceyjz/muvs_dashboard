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

function normalizeHiddenPorts(value) {
  const rawValues = Array.isArray(value) ? value : String(value || '').split(',');
  return [...new Set(rawValues.map((item) => String(item || '').trim()).filter(Boolean))]
    .sort((left, right) => parseNumber(left) - parseNumber(right));
}

function normalizeBool(value) {
  return String(value || '').toLowerCase() === 'true';
}

function resolveStatus(row) {
  if (normalizeBool(row.OPCStatusShow)) {
    return { key: 'opc-error', label: 'OPC Fault', tone: 'critical' };
  }

  if (normalizeBool(row.RedLampTag_Val) && !normalizeBool(row.GreenLampTag_Val)) {
    return { key: 'alarm', label: 'Alarm', tone: 'critical' };
  }

  if (normalizeBool(row.LockedTag_Val)) {
    return { key: 'locked', label: 'Locked', tone: 'warning' };
  }

  if (normalizeBool(row.ByPassTag_Val)) {
    return { key: 'bypass', label: 'Bypass', tone: 'notice' };
  }

  if (normalizeBool(row.SecondCheckTag_Val) && normalizeBool(row.GreenLampTag_Val)) {
    return { key: 'ready', label: 'Ready To Feed', tone: 'healthy' };
  }

  if (normalizeBool(row.PowerSwitchTag_Val)) {
    return { key: 'armed', label: 'Power On', tone: 'active' };
  }

  if (parseNumber(row.TotalPutWeight) > 0) {
    return { key: 'feeding', label: 'Feeding', tone: 'active' };
  }

  return { key: 'idle', label: 'Idle', tone: 'muted' };
}

function toPortModel(row) {
  const targetWeight = parseNumber(row.PushWeight);
  const totalPutWeight = parseNumber(row.TotalPutWeight);
  const totalPutBags = parseNumber(row.TotalPutBags);
  const parsedProgress = parseNumber(row.PutProgress);
  const progress = Math.max(0, Math.min(parsedProgress || (targetWeight ? (totalPutWeight / targetWeight) * 100 : 0), 100));
  const status = resolveStatus(row);

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
    tags: {
      power: normalizeBool(row.PowerSwitchTag_Val),
      secondCheck: normalizeBool(row.SecondCheckTag_Val),
      redLamp: normalizeBool(row.RedLampTag_Val),
      greenLamp: normalizeBool(row.GreenLampTag_Val),
      locked: normalizeBool(row.LockedTag_Val),
      bypass: normalizeBool(row.ByPassTag_Val)
    },
    status
  };
}

function summarize(ports) {
  const breakdown = ports.reduce((accumulator, portItem) => {
    accumulator[portItem.status.key] = (accumulator[portItem.status.key] || 0) + 1;
    return accumulator;
  }, {});

  const totalPutWeight = ports.reduce((sum, portItem) => sum + portItem.totalPutWeight, 0);
  const totalPutBags = ports.reduce((sum, portItem) => sum + portItem.totalPutBags, 0);
  const readyPorts = ports.filter((portItem) => portItem.status.key === 'ready').length;
  const alertPorts = ports.filter((portItem) => portItem.status.key === 'alarm' || portItem.status.key === 'opc-error').length;
  const activePorts = ports.filter((portItem) => ['ready', 'feeding', 'armed'].includes(portItem.status.key)).length;
  const completionAverage = ports.length
    ? ports.reduce((sum, portItem) => sum + portItem.progress, 0) / ports.length
    : 0;

  const recentScans = ports
    .filter((portItem) => portItem.lastScanTime)
    .sort((left, right) => new Date(right.lastScanTime).getTime() - new Date(left.lastScanTime).getTime())
    .slice(0, 6)
    .map((portItem) => ({
      portCode: portItem.portCode,
      portName: portItem.portName,
      materialName: portItem.materialName,
      lastScanTime: portItem.lastScanTime,
      status: portItem.status.label,
      totalPutWeight: portItem.totalPutWeight
    }));

  return {
    totalPorts: ports.length,
    readyPorts,
    activePorts,
    alertPorts,
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

  const ports = await fetchPortStates({ portCode, startTime, endTime });
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
  const hiddenPortCount = basePayload.availablePorts.filter((portItem) => hiddenPortSet.has(String(portItem.portCode))).length;

  return {
    ...basePayload,
    filters: {
      ...basePayload.filters,
      hiddenPorts
    },
    summary: {
      ...summarize(visiblePorts),
      hiddenPortCount,
      availablePortCount: basePayload.availablePorts.length
    },
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
    const startTime = formatDateTimeInput(request.query.startTime);
    const endTime = formatDateTimeInput(request.query.endTime);
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