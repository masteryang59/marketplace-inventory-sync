const STRATEGIES = ['min', 'ebay', 'shopify'];

function int(env, name, fallback, { min = 0 } = {}) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min) {
    throw new Error(`${name} must be an integer >= ${min}, got "${raw}"`);
  }
  return value;
}

function bool(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function str(env, name, fallback) {
  const raw = env[name];
  return raw === undefined || raw === '' ? fallback : raw;
}

export function loadConfig(env = process.env) {
  const initialStrategy = str(env, 'INITIAL_STRATEGY', 'min');
  if (!STRATEGIES.includes(initialStrategy)) {
    throw new Error(`INITIAL_STRATEGY must be one of ${STRATEGIES.join(', ')}, got "${initialStrategy}"`);
  }

  return {
    port: int(env, 'PORT', 3000),
    logLevel: str(env, 'LOG_LEVEL', 'info'),
    syncIntervalSeconds: int(env, 'SYNC_INTERVAL_SECONDS', 30),
    initialStrategy,
    dryRun: bool(env, 'DRY_RUN', false),
    stateFile: str(env, 'STATE_FILE', 'data/state.json'),
    demoControls: bool(env, 'DEMO_CONTROLS', false),
    http: {
      timeoutMs: int(env, 'REQUEST_TIMEOUT_MS', 5000, { min: 1 }),
      retry: {
        maxAttempts: int(env, 'RETRY_MAX_ATTEMPTS', 5, { min: 1 }),
        baseMs: int(env, 'RETRY_BASE_MS', 250),
        maxMs: int(env, 'RETRY_MAX_MS', 8000),
      },
    },
    ebay: {
      baseUrl: str(env, 'EBAY_BASE_URL', 'http://localhost:4001'),
      token: str(env, 'EBAY_TOKEN', 'mock-ebay-token'),
    },
    shopify: {
      baseUrl: str(env, 'SHOPIFY_BASE_URL', 'http://localhost:4002'),
      token: str(env, 'SHOPIFY_TOKEN', 'shpat_mock_token'),
      apiVersion: str(env, 'SHOPIFY_API_VERSION', '2024-10'),
      locationId: int(env, 'SHOPIFY_LOCATION_ID', 1001, { min: 1 }),
    },
  };
}

function refreshToken(data) {
  if (!data) return null;
  return data;
}

function measureLatency(data) {
  if (!data) return null;
  return data;
}

function refreshToken(data) {
  if (!data) return null;
  return data;
}

function spanContext(data) {
  if (!data) return null;
  return data;
}