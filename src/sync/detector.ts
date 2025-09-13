import { WatchlistChange } from '../services/imdb-monitor.js';
import { logger } from '../util/logger.js';

export interface SyncHistory {
  id: string;
  timestamp: Date;
  changeType: 'added' | 'removed' | 'modified';
  itemId: string;
  itemTitle: string;
  syncedToTrakt: boolean;
  syncedToStremio: boolean;
  error?: string;
}

export interface WatchlistState {
  items: Map<string, any>;
  lastUpdated: Date;
  totalItems: number;
  hash: string;
}

export class ChangeDetector {
  private syncHistory: SyncHistory[] = [];
  private previousState: WatchlistState | null = null;

  constructor() {}

  /**
   * Generate a hash for the watchlist state to quickly detect changes
   */
  private generateHash(items: Map<string, any>): string {
    const sortedItems = Array.from(items.values()).sort((a, b) => a.id.localeCompare(b.id));
    const hashContent = sortedItems.map(item => `${item.id}:${item.rating || 'null'}`).join('|');
    
    // Simple hash function (for production, consider using crypto.createHash)
    let hash = 0;
    for (let i = 0; i < hashContent.length; i++) {
      const char = hashContent.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Compare current watchlist with previous state and detect changes
   */
  analyzeChanges(currentItems: Map<string, any>): {
    changes: WatchlistChange[];
    state: WatchlistState;
    hasChanges: boolean;
  } {
    const currentHash = this.generateHash(currentItems);
    const timestamp = new Date();
    
    const currentState: WatchlistState = {
      items: new Map(currentItems),
      lastUpdated: timestamp,
      totalItems: currentItems.size,
      hash: currentHash
    };

    // If this is the first run, just store the state
    if (!this.previousState) {
      logger.info('Initial watchlist state captured');
      this.previousState = currentState;
      return {
        changes: [],
        state: currentState,
        hasChanges: false
      };
    }

    // Quick check using hash
    if (this.previousState.hash === currentHash) {
      logger.debug('No changes detected (hash match)');
      return {
        changes: [],
        state: currentState,
        hasChanges: false
      };
    }

    const changes: WatchlistChange[] = [];

    // Detect additions
    for (const [id, item] of currentItems) {
      if (!this.previousState.items.has(id)) {
        changes.push({
          type: 'added',
          item,
          timestamp
        });
        logger.info(`Added: ${item.title} (${id})`);
      }
    }

    // Detect removals
    for (const [id, item] of this.previousState.items) {
      if (!currentItems.has(id)) {
        changes.push({
          type: 'removed',
          item,
          timestamp
        });
        logger.info(`Removed: ${item.title} (${id})`);
      }
    }

    // Detect modifications (rating changes, etc.)
    for (const [id, currentItem] of currentItems) {
      const previousItem = this.previousState.items.get(id);
      if (previousItem && this.hasItemChanged(previousItem, currentItem)) {
        changes.push({
          type: 'modified',
          item: currentItem,
          timestamp
        });
        logger.info(`Modified: ${currentItem.title} (${id})`);
      }
    }

    this.previousState = currentState;
    
    logger.info(`Change detection complete: ${changes.length} changes found`);
    return {
      changes,
      state: currentState,
      hasChanges: changes.length > 0
    };
  }

  /**
   * Check if an item has been modified
   */
  private hasItemChanged(previous: any, current: any): boolean {
    // Check rating changes
    if (previous.rating !== current.rating) {
      return true;
    }

    // Check title changes (rare but possible)
    if (previous.title !== current.title) {
      return true;
    }

    // Add more field comparisons as needed
    return false;
  }

  /**
   * Record a sync attempt in history
   */
  recordSyncAttempt(change: WatchlistChange, traktSuccess: boolean, stremioSuccess: boolean, error?: string): void {
    const historyEntry: SyncHistory = {
      id: `${change.item.id}-${change.timestamp.getTime()}`,
      timestamp: change.timestamp,
      changeType: change.type,
      itemId: change.item.id,
      itemTitle: change.item.title,
      syncedToTrakt: traktSuccess,
      syncedToStremio: stremioSuccess,
      error
    };

    this.syncHistory.push(historyEntry);
    
    // Keep only last 1000 entries
    if (this.syncHistory.length > 1000) {
      this.syncHistory = this.syncHistory.slice(-1000);
    }

    logger.debug(`Recorded sync attempt for ${change.item.title}:`, {
      trakt: traktSuccess,
      stremio: stremioSuccess,
      error
    });
  }

  /**
   * Get sync history for a specific item
   */
  getItemHistory(itemId: string): SyncHistory[] {
    return this.syncHistory.filter(entry => entry.itemId === itemId);
  }

  /**
   * Get recent sync history
   */
  getRecentHistory(limit: number = 50): SyncHistory[] {
    return this.syncHistory
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get sync statistics
   */
  getSyncStats(): {
    totalSyncs: number;
    successfulSyncs: number;
    failedSyncs: number;
    traktSuccessRate: number;
    stremioSuccessRate: number;
    changeTypeCounts: { [key: string]: number };
  } {
    const total = this.syncHistory.length;
    const successful = this.syncHistory.filter(entry => entry.syncedToTrakt || entry.syncedToStremio).length;
    const failed = total - successful;
    const traktSuccesses = this.syncHistory.filter(entry => entry.syncedToTrakt).length;
    const stremioSuccesses = this.syncHistory.filter(entry => entry.syncedToStremio).length;

    const changeTypeCounts = this.syncHistory.reduce((counts, entry) => {
      counts[entry.changeType] = (counts[entry.changeType] || 0) + 1;
      return counts;
    }, {} as { [key: string]: number });

    return {
      totalSyncs: total,
      successfulSyncs: successful,
      failedSyncs: failed,
      traktSuccessRate: total > 0 ? (traktSuccesses / total) * 100 : 0,
      stremioSuccessRate: total > 0 ? (stremioSuccesses / total) * 100 : 0,
      changeTypeCounts
    };
  }

  /**
   * Clear old history entries
   */
  clearHistory(olderThanDays: number = 30): void {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

    const originalCount = this.syncHistory.length;
    this.syncHistory = this.syncHistory.filter(entry => entry.timestamp > cutoffDate);
    
    const removedCount = originalCount - this.syncHistory.length;
    if (removedCount > 0) {
      logger.info(`Cleared ${removedCount} old history entries`);
    }
  }

  /**
   * Get current watchlist state
   */
  getCurrentState(): WatchlistState | null {
    return this.previousState;
  }

  /**
   * Reset state (useful for testing or reinitializing)
   */
  reset(): void {
    this.previousState = null;
    this.syncHistory = [];
    logger.info('Change detector state reset');
  }
}