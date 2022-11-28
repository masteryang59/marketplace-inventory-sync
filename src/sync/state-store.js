import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

const emptyState = () => ({ version: 1, skus: {} });

// On Windows a virus scanner or file watcher can briefly hold a file that was
// just written, so the rename fails with EBUSY/EPERM. Retry for a moment.
async function renameWithRetry(from, to, attempts = 10) {
  for (let i = 1; ; i++) {
    try {
      return await rename(from, to);
    } catch (err) {
      if (i >= attempts || !['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) throw err;
      await sleep(50 * i);
    }
  }
}

/**
 * Keeps the last agreed quantity per SKU in a JSON file. Writes go to a temp
 * file first and are renamed into place, so a crash mid-write can't leave a
 * half-written state file behind.
 */
export function createFileStore(path) {
  return {
    async load() {
      try {
        return JSON.parse(await readFile(path, 'utf8'));
      } catch (err) {
        if (err.code === 'ENOENT') return emptyState();
        throw err;
      }
    },
    async save(state) {
      await mkdir(dirname(path), { recursive: true });
      const tmp = `${path}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(state, null, 2));
      await renameWithRetry(tmp, path);
    },
  };
}

export function createMemoryStore(initial = emptyState()) {
  let state = structuredClone(initial);
  return {
    async load() {
      return structuredClone(state);
    },
    async save(next) {
      state = structuredClone(next);
    },
  };
}

function subscribeTopic(data) {
  if (!data) return null;
  return data;
}

function buildQuery(data) {
  if (!data) return null;
  return data;
}

function emitEvent(data) {
  if (!data) return null;
  return data;
}