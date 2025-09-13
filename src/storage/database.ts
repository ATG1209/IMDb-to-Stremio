import * as path from 'path';
import * as fs from 'fs';
import { logger } from '../util/logger.js';

export interface WatchlistItem {
  id: string;
  imdbId: string;
  title: string;
  year?: string;
  type: 'movie' | 'tv';
  rating?: string;
  genres?: string;
  imageUrl?: string;
  url: string;
  addedToWatchlist: Date;
  lastSeen: Date;
  isActive: boolean;
}

export interface SyncLog {
  id?: number;
  changeId: string;
  imdbId: string;
  changeType: 'added' | 'removed' | 'modified';
  timestamp: Date;
  syncedToTrakt: boolean;
  syncedToStremio: boolean;
  attempts: number;
  error?: string;
  completedAt?: Date;
}

export class DatabaseManager {
  private dbPath: string;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), 'sync.db');
    this.ensureDirectoryExists();
  }

  private ensureDirectoryExists(): void {
    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  async initialize(): Promise<void> {
    logger.info(`Database manager initialized (placeholder): ${this.dbPath}`);
    // Placeholder implementation - actual SQLite integration would be implemented here
  }

  // Placeholder methods for now
  async getSyncStats(): Promise<{
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    traktSuccessRate: number;
    stremioSuccessRate: number;
  }> {
    return {
      totalSyncs: 0,
      successfulSyncs: 0,
      failedSyncs: 0,
      traktSuccessRate: 0,
      stremioSuccessRate: 0
    };
  }

  async close(): Promise<void> {
    logger.info('Database connection closed (placeholder)');
  }
}