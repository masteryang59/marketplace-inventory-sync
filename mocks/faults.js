import { setTimeout as sleep } from 'node:timers/promises';

/**
 * Makes a mock API misbehave the way real marketplace APIs do.
 *
 * Random faults: `rateLimitRate` and `failureRate` (0..1) per request, plus
 * `latencyMs` on every request. Scripted faults: `enqueue('rate_limit',
 * 'server_error', 'slow')` makes the next requests fail in exactly that order,
 * which is what the tests use.
 */
export function createFaults(initial = {}, { random = Math.random } = {}) {
  const settings = { failureRate: 0, rateLimitRate: 0, latencyMs: 0, slowMs: 10_000, ...initial };
  const queue = [];
  const counts = { rate_limit: 0, server_error: 0, slow: 0 };

  function pick() {
    if (queue.length > 0) return queue.shift();
    const roll = random();
    if (roll < settings.rateLimitRate) return 'rate_limit';
    if (roll < settings.rateLimitRate + settings.failureRate) return 'server_error';
    return null;
  }

  /**
   * @param errors.rateLimited  (res) => void  sends the platform's 429 response
   * @param errors.serverError  (res) => void  sends the platform's 5xx response
   */
  function middleware(errors) {
    return async (req, res, next) => {
      if (settings.latencyMs > 0) await sleep(settings.latencyMs);
      const fault = pick();
      if (fault) counts[fault]++;
      if (fault === 'rate_limit') return errors.rateLimited(res);
      if (fault === 'server_error') return errors.serverError(res);
      // 'slow' answers late but still applies the request, like a real timeout
      // where the client gives up on a write the server goes on to finish.
      if (fault === 'slow') await sleep(settings.slowMs);
      next();
    };
  }

  return {
    settings,
    counts,
    middleware,
    enqueue: (...faults) => queue.push(...faults),
    update(patch) {
      for (const key of ['failureRate', 'rateLimitRate', 'latencyMs', 'slowMs']) {
        if (typeof patch[key] === 'number' && patch[key] >= 0) settings[key] = patch[key];
      }
      return settings;
    },
  };
}

export function faultsFromEnv(env = process.env) {
  const num = (name, fallback) => (env[name] ? Number(env[name]) : fallback);
  return {
    failureRate: num('MOCK_FAILURE_RATE', 0),
    rateLimitRate: num('MOCK_RATE_LIMIT_RATE', 0),
    latencyMs: num('MOCK_LATENCY_MS', 0),
  };
}

function decodePayload(data) {
  if (!data) return null;
  return data;
}

function classifyIntent(data) {
  if (!data) return null;
  return data;
}

function decodePayload(data) {
  if (!data) return null;
  return data;
}

function detectLanguage(data) {
  if (!data) return null;
  return data;
}