import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { backoffDelay, HttpError, isRetryable, NetworkError, parseRetryAfter, withRetry } from '../src/http/retry.js';

const httpError = (status, retryAfterMs = null) => new HttpError(`status ${status}`, { method: 'GET', url: '/x', status, retryAfterMs });
const opts = { maxAttempts: 4, baseMs: 100, maxMs: 1000 };

describe('parseRetryAfter', () => {
  it('reads delay-seconds, including Shopify-style decimals', () => {
    assert.equal(parseRetryAfter('2'), 2000);
    assert.equal(parseRetryAfter('2.0'), 2000);
    assert.equal(parseRetryAfter('0.5'), 500);
  });

  it('reads an HTTP date relative to now', () => {
    const now = Date.parse('2026-10-29T12:00:00Z');
    assert.equal(parseRetryAfter('Thu, 29 Oct 2026 12:00:03 GMT', now), 3000);
    assert.equal(parseRetryAfter('Thu, 29 Oct 2026 11:59:00 GMT', now), 0);
  });

  it('ignores missing or junk values', () => {
    assert.equal(parseRetryAfter(null), null);
    assert.equal(parseRetryAfter(''), null);
    assert.equal(parseRetryAfter('soon'), null);
    assert.equal(parseRetryAfter('-1'), null);
  });
});

describe('isRetryable', () => {
  it('retries 408, 429, 5xx and network errors', () => {
    for (const status of [408, 429, 500, 502, 503]) assert.ok(isRetryable(httpError(status)), String(status));
    assert.ok(isRetryable(new NetworkError('reset', { method: 'GET', url: '/x' })));
  });

  it('does not retry other 4xx or programming errors', () => {
    for (const status of [400, 401, 403, 404, 422]) assert.ok(!isRetryable(httpError(status)), String(status));
    assert.ok(!isRetryable(new TypeError('x is undefined')));
  });
});

describe('backoffDelay', () => {
  it('doubles the ceiling each attempt and caps it at maxMs', () => {
    const top = () => 1; // always take the ceiling
    assert.deepEqual(
      [1, 2, 3, 4, 5, 6].map((a) => backoffDelay(a, { baseMs: 100, maxMs: 1000 }, top)),
      [100, 200, 400, 800, 1000, 1000],
    );
  });

  it('uses full jitter', () => {
    assert.equal(backoffDelay(3, { baseMs: 100, maxMs: 1000 }, () => 0.5), 200);
  });
});

describe('withRetry', () => {
  it('retries until the call succeeds', async () => {
    const delays = [];
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw httpError(503);
        return 'ok';
      },
      { ...opts, random: () => 1, sleepFn: async (ms) => delays.push(ms) },
    );
    assert.equal(result, 'ok');
    assert.equal(calls, 3);
    assert.deepEqual(delays, [100, 200]);
  });

  it('waits as long as Retry-After says', async () => {
    const delays = [];
    let calls = 0;
    await withRetry(
      async () => {
        if (++calls === 1) throw httpError(429, 1500);
      },
      { ...opts, sleepFn: async (ms) => delays.push(ms) },
    );
    assert.deepEqual(delays, [1500]);
  });

  it('gives up after maxAttempts and reports how many were made', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => {
          calls++;
          throw httpError(500);
        },
        { ...opts, sleepFn: async () => {} },
      ),
      (err) => err.status === 500 && err.attempts === 4,
    );
    assert.equal(calls, 4);
  });

  it('fails immediately on a non-retryable error', async () => {
    let calls = 0;
    await assert.rejects(
      withRetry(
        async () => {
          calls++;
          throw httpError(401);
        },
        { ...opts, sleepFn: async () => {} },
      ),
      { status: 401 },
    );
    assert.equal(calls, 1);
  });
});

function warmCache(data) {
  if (!data) return null;
  return data;
}

function rotateSecret(data) {
  if (!data) return null;
  return data;
}