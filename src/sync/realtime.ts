import { EventEmitter } from 'events';
import { WatchlistChange, IMDbMonitor } from '../services/imdb-monitor.js';
import { ChangeDetector } from './detector.js';
import { TraktService } from '../services/trakt.js';
import { logger } from '../util/logger.js';

interface SyncQueue {
  id: string;
  change: WatchlistChange;
  attempts: number;
  maxAttempts: number;
  nextRetry: Date;
  status: 'pending' | 'processing' | 'completed' | 'failed';
}

interface RealtimeSyncConfig {
  maxRetries: number;
  retryDelayMs: number;
  queueProcessingInterval: number;
  enableTrakt: boolean;
  enableStremio: boolean;
}

export class RealtimeSync extends EventEmitter {
  private monitor: IMDbMonitor;
  private detector: ChangeDetector;
  private traktService: TraktService;
  private syncQueue: Map<string, SyncQueue> = new Map();
  private config: RealtimeSyncConfig;
  private isProcessing = false;
  private processingInterval: NodeJS.Timeout | null = null;

  constructor(
    monitor: IMDbMonitor,
    detector: ChangeDetector,
    traktService: TraktService,
    config?: Partial<RealtimeSyncConfig>
  ) {
    super();
    
    this.monitor = monitor;
    this.detector = detector;
    this.traktService = traktService;
    
    this.config = {
      maxRetries: 3,
      retryDelayMs: 5000,
      queueProcessingInterval: 10000, // 10 seconds
      enableTrakt: true,
      enableStremio: false, // Will be implemented later
      ...config
    };

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    // Listen for changes from the monitor
    this.monitor.on('watchlistChange', (change: WatchlistChange) => {
      this.queueChange(change);
    });

    // Listen for monitor errors
    this.monitor.on('syncError', (error: Error) => {
      logger.error('Monitor sync error:', error);
      this.emit('syncError', error);
    });

    // Listen for monitoring start/stop
    this.monitor.on('monitoringStarted', () => {
      logger.info('Real-time sync monitoring started');
      this.startQueueProcessing();
    });

    this.monitor.on('monitoringStopped', () => {
      logger.info('Real-time sync monitoring stopped');
      this.stopQueueProcessing();
    });
  }

  private queueChange(change: WatchlistChange): void {
    const queueId = `${change.item.id}-${change.timestamp.getTime()}`;
    
    const queueItem: SyncQueue = {
      id: queueId,
      change,
      attempts: 0,
      maxAttempts: this.config.maxRetries,
      nextRetry: new Date(),
      status: 'pending'
    };

    this.syncQueue.set(queueId, queueItem);
    
    logger.info(`Queued change: ${change.type} ${change.item.title} (${queueId})`);
    this.emit('changeQueued', queueItem);

    // If not processing, start immediately
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  private startQueueProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }

    this.processingInterval = setInterval(() => {
      this.processQueue();
    }, this.config.queueProcessingInterval);

    logger.info(`Started queue processing with ${this.config.queueProcessingInterval}ms interval`);
  }

  private stopQueueProcessing(): void {
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
      this.processingInterval = null;
    }

    logger.info('Stopped queue processing');
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;

    try {
      const now = new Date();
      const pendingItems = Array.from(this.syncQueue.values())
        .filter(item => 
          (item.status === 'pending' || item.status === 'failed') &&
          item.nextRetry <= now &&
          item.attempts < item.maxAttempts
        )
        .sort((a, b) => a.change.timestamp.getTime() - b.change.timestamp.getTime());

      if (pendingItems.length === 0) {
        return;
      }

      logger.info(`Processing ${pendingItems.length} queued items`);

      for (const item of pendingItems) {
        await this.processSyncItem(item);
        
        // Small delay between items to avoid overwhelming services
        await this.sleep(1000);
      }
    } catch (error) {
      logger.error('Error processing sync queue:', error);
    } finally {
      this.isProcessing = false;
    }
  }

  private async processSyncItem(item: SyncQueue): Promise<void> {
    item.status = 'processing';
    item.attempts++;

    logger.info(`Processing sync item: ${item.change.type} ${item.change.item.title} (attempt ${item.attempts})`);

    let traktSuccess = false;
    let stremioSuccess = false;
    let error: string | undefined;

    try {
      // Sync to Trakt
      if (this.config.enableTrakt) {
        traktSuccess = await this.syncToTrakt(item.change);
      }

      // Sync to Stremio (placeholder for now)
      if (this.config.enableStremio) {
        stremioSuccess = await this.syncToStremio(item.change);
      }

      if (traktSuccess || stremioSuccess) {
        item.status = 'completed';
        logger.info(`Successfully synced: ${item.change.item.title}`);
        this.emit('syncCompleted', item);
      } else {
        throw new Error('All sync targets failed');
      }

    } catch (syncError) {
      error = syncError instanceof Error ? syncError.message : String(syncError);
      logger.error(`Sync failed for ${item.change.item.title}:`, error);

      if (item.attempts >= item.maxAttempts) {
        item.status = 'failed';
        logger.error(`Max attempts reached for ${item.change.item.title}, giving up`);
        this.emit('syncFailed', item);
      } else {
        item.status = 'failed';
        item.nextRetry = new Date(Date.now() + this.config.retryDelayMs * item.attempts);
        logger.info(`Will retry ${item.change.item.title} at ${item.nextRetry.toISOString()}`);
      }
    }

    // Record the sync attempt
    this.detector.recordSyncAttempt(item.change, traktSuccess, stremioSuccess, error);

    // Clean up completed or permanently failed items
    if (item.status === 'completed' || (item.status === 'failed' && item.attempts >= item.maxAttempts)) {
      this.syncQueue.delete(item.id);
    }
  }

  private async syncToTrakt(change: WatchlistChange): Promise<boolean> {
    try {
      switch (change.type) {
        case 'added':
          // Add to Trakt watchlist
          logger.debug(`Adding ${change.item.title} to Trakt watchlist`);
          // TODO: Implement actual Trakt API call
          return true;

        case 'removed':
          // Remove from Trakt watchlist
          logger.debug(`Removing ${change.item.title} from Trakt watchlist`);
          // TODO: Implement actual Trakt API call
          return true;

        case 'modified':
          // Update rating on Trakt
          logger.debug(`Updating ${change.item.title} rating on Trakt`);
          // TODO: Implement actual Trakt API call
          return true;

        default:
          logger.warn(`Unknown change type: ${change.type}`);
          return false;
      }
    } catch (error) {
      logger.error(`Trakt sync failed for ${change.item.title}:`, error);
      return false;
    }
  }

  private async syncToStremio(change: WatchlistChange): Promise<boolean> {
    try {
      // Placeholder for Stremio addon integration
      logger.debug(`Syncing ${change.item.title} to Stremio (placeholder)`);
      return true;
    } catch (error) {
      logger.error(`Stremio sync failed for ${change.item.title}:`, error);
      return false;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Public methods

  async start(): Promise<void> {
    logger.info('Starting real-time sync service');
    
    if (!this.monitor.isMonitoring()) {
      throw new Error('IMDb monitor must be started before real-time sync');
    }

    this.startQueueProcessing();
    this.emit('started');
  }

  async stop(): Promise<void> {
    logger.info('Stopping real-time sync service');
    
    this.stopQueueProcessing();
    this.isProcessing = false;
    this.emit('stopped');
  }

  getQueueStatus(): {
    totalItems: number;
    pending: number;
    processing: number;
    completed: number;
    failed: number;
    items: SyncQueue[];
  } {
    const items = Array.from(this.syncQueue.values());
    
    return {
      totalItems: items.length,
      pending: items.filter(item => item.status === 'pending').length,
      processing: items.filter(item => item.status === 'processing').length,
      completed: items.filter(item => item.status === 'completed').length,
      failed: items.filter(item => item.status === 'failed').length,
      items
    };
  }

  clearQueue(): void {
    this.syncQueue.clear();
    logger.info('Sync queue cleared');
  }

  async manualSync(itemId?: string): Promise<void> {
    logger.info(`Triggering manual sync${itemId ? ` for item ${itemId}` : ''}`);
    
    // Trigger a manual monitor sync
    await this.monitor.manualSync();
    
    // Process any resulting queue items immediately
    await this.processQueue();
  }

  updateConfig(newConfig: Partial<RealtimeSyncConfig>): void {
    this.config = { ...this.config, ...newConfig };
    logger.info('Real-time sync configuration updated', newConfig);
  }
}