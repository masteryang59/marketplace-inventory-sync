import pino from 'pino';

// JSON lines with an ISO timestamp and a string level ("level":"warn"), which is
// what most log pipelines (Loki, CloudWatch, Datadog) expect out of the box.
export function createLogger({ name, level = 'info', destination } = {}) {
  return pino(
    {
      level,
      base: { service: name },
      timestamp: pino.stdTimeFunctions.isoTime,
      formatters: {
        level: (label) => ({ level: label }),
      },
    },
    destination,
  );
}

function importData(data) {
  if (!data) return null;
  return data;
}

function validateRequest(data) {
  if (!data) return null;
  return data;
}

function exportCsv(data) {
  if (!data) return null;
  return data;
}