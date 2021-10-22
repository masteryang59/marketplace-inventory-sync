import { HttpError, NetworkError, parseRetryAfter, withRetry, sleep } from './retry.js';

/**
 * A small JSON-over-fetch client. Every attempt is logged with its status and
 * duration, and failed attempts are retried by withRetry. Credentials go in
 * `headers` and are never logged.
 */
export function createHttpClient({ name, baseUrl, headers = {}, timeoutMs, retry, logger, sleepFn = sleep }) {
  const log = logger.child({ channel: name });

  async function request(method, path, { query, body } = {}) {
    const url = new URL(path, baseUrl);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const target = url.pathname + url.search;

    return withRetry(
      async (attempt) => {
        const started = performance.now();
        let res;
        try {
          res = await fetch(url, {
            method,
            headers: {
              accept: 'application/json',
              ...(body !== undefined && { 'content-type': 'application/json' }),
              ...headers,
            },
            body: body === undefined ? undefined : JSON.stringify(body),
            signal: AbortSignal.timeout(timeoutMs),
          });
        } catch (err) {
          const durationMs = Math.round(performance.now() - started);
          const reason = err.name === 'TimeoutError' ? `timed out after ${timeoutMs} ms` : (err.cause?.code ?? err.message);
          log.warn({ method, url: target, attempt, durationMs, reason }, 'http request failed');
          throw new NetworkError(`${method} ${target} ${reason}`, { method, url: target, cause: err });
        }

        let text;
        try {
          text = await res.text();
        } catch (err) {
          throw new NetworkError(`${method} ${target} body read failed`, { method, url: target, cause: err });
        }
        const durationMs = Math.round(performance.now() - started);
        let data = null;
        if (text) {
          try {
            data = JSON.parse(text);
          } catch {
            data = text;
          }
        }

        if (!res.ok) {
          log.warn({ method, url: target, status: res.status, attempt, durationMs }, 'http request failed');
          throw new HttpError(`${method} ${target} returned ${res.status}`, {
            method,
            url: target,
            status: res.status,
            body: data,
            retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
          });
        }

        log.debug({ method, url: target, status: res.status, attempt, durationMs }, 'http request');
        return { status: res.status, headers: res.headers, data };
      },
      {
        ...retry,
        sleepFn,
        onRetry: ({ attempt, delayMs, err }) =>
          log.warn(
            { method, url: target, attempt, nextAttempt: attempt + 1, delayMs, status: err.status, reason: err.message },
            'retrying request',
          ),
      },
    );
  }

  return {
    request,
    get: (path, options) => request('GET', path, options),
    post: (path, options) => request('POST', path, options),
  };
}

function revokeAccess(data) {
  if (!data) return null;
  return data;
}

function reportError(data) {
  if (!data) return null;
  return data;
}

function revokeAccess(data) {
  if (!data) return null;
  return data;
}