import { promises as fs } from 'fs';
import path from 'path';

const DEFAULT_SESSION_DIR = process.env.SCRAPER_SESSION_DIR || path.join(process.cwd(), '.session-store');

function sanitizeKey(key) {
  return key.replace(/[^a-z0-9_-]/gi, '_');
}

export class SessionManager {
  constructor(rootDir = DEFAULT_SESSION_DIR) {
    this.rootDir = rootDir;
    this.cache = new Map();
    this.ensureDirPromise = null;
  }

  async ensureDir() {
    if (!this.ensureDirPromise) {
      this.ensureDirPromise = fs.mkdir(this.rootDir, { recursive: true });
    }
    await this.ensureDirPromise;
  }

  getFilePath(key) {
    const safeKey = sanitizeKey(key || 'default');
    return path.join(this.rootDir, `${safeKey}.json`);
  }

  async load(key) {
    const safeKey = key || 'default';
    if (this.cache.has(safeKey)) {
      return this.cache.get(safeKey);
    }

    const filePath = this.getFilePath(safeKey);

    try {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsed = JSON.parse(data);
      this.cache.set(safeKey, parsed);
      return parsed;
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`[SessionManager] Failed to load session for ${safeKey}:`, error.message);
      }
      return null;
    }
  }

  async save(key, storageState) {
    if (!storageState) {
      return;
    }

    await this.ensureDir();
    const safeKey = key || 'default';
    const filePath = this.getFilePath(safeKey);

    try {
      await fs.writeFile(filePath, JSON.stringify(storageState, null, 2), 'utf-8');
      this.cache.set(safeKey, storageState);
    } catch (error) {
      console.warn(`[SessionManager] Failed to persist session for ${safeKey}:`, error.message);
    }
  }

  async clear(key) {
    const safeKey = key || 'default';
    const filePath = this.getFilePath(safeKey);

    try {
      await fs.unlink(filePath);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.warn(`[SessionManager] Failed to clear session for ${safeKey}:`, error.message);
      }
    }

    this.cache.delete(safeKey);
  }
}

export const sessionManager = new SessionManager();
