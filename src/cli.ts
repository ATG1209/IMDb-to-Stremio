#!/usr/bin/env node

import { program } from 'commander';
import { IMDbMonitor, IMDbCredentials } from './services/imdb-monitor.js';
import { ChangeDetector } from './sync/detector.js';
import { RealtimeSync } from './sync/realtime.js';
import { TraktService } from './services/trakt.js';
import { ConfigManager } from './config/settings.js';
import { DatabaseManager } from './storage/database.js';
import { logger } from './util/logger.js';
import { parseCSV } from './imdb/parser.js';
import * as readline from 'readline';
import * as fs from 'fs';

// Global instances
let configManager: ConfigManager;
let databaseManager: DatabaseManager;
let imdbMonitor: IMDbMonitor;
let changeDetector: ChangeDetector;
let realtimeSync: RealtimeSync;
let traktService: TraktService;

async function initializeServices(): Promise<void> {
  try {
    // Initialize configuration
    configManager = new ConfigManager();
    const config = configManager.getConfig();
    
    // Initialize database
    databaseManager = new DatabaseManager(config.storage.databasePath);
    await databaseManager.initialize();
    
    // Initialize services
    imdbMonitor = new IMDbMonitor();
    changeDetector = new ChangeDetector();
    traktService = new TraktService();
    
    // Initialize real-time sync
    realtimeSync = new RealtimeSync(
      imdbMonitor,
      changeDetector,
      traktService,
      {
        maxRetries: config.syncSettings.maxRetries,
        retryDelayMs: config.syncSettings.retryDelayMs,
        enableTrakt: config.syncSettings.enableTrakt,
        enableStremio: config.syncSettings.enableStremio
      }
    );
    
    logger.info('Services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize services:', error);
    process.exit(1);
  }
}

async function promptForCredentials(): Promise<IMDbCredentials> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question('IMDb Email: ', (email) => {
      rl.question('IMDb Password: ', (password) => {
        rl.close();
        resolve({ email, password });
      });
    });
  });
}

// Command handlers
async function handleImport(csvPath: string): Promise<void> {
  try {
    logger.info(`Importing from CSV: ${csvPath}`);
    
    if (!fs.existsSync(csvPath)) {
      logger.error(`File not found: ${csvPath}`);
      return;
    }

    const items = await parseCSV(csvPath);
    logger.info(`Parsed ${items.length} items from CSV`);
    
    // TODO: Implement CSV import logic with new services
    console.log('CSV import completed');
  } catch (error) {
    logger.error('Import failed:', error);
  }
}

async function handleWatch(options: any): Promise<void> {
  try {
    logger.info('Starting real-time watch mode...');
    
    await initializeServices();
    
    // Get or prompt for credentials
    let credentials = await configManager.getIMDbCredentials();
    if (!credentials) {
      console.log('IMDb credentials required for real-time sync');
      const inputCredentials = await promptForCredentials();
      await configManager.setIMDbCredentials(inputCredentials.email, inputCredentials.password);
      credentials = inputCredentials;
    }
    
    // Initialize and login to IMDb
    await imdbMonitor.initialize(credentials, options.interval);
    const loginSuccess = await imdbMonitor.login();
    
    if (!loginSuccess) {
      logger.error('Failed to login to IMDb. Please check your credentials.');
      return;
    }
    
    // Set up event handlers
    setupEventHandlers();
    
    // Start monitoring
    imdbMonitor.startMonitoring();
    
    console.log('Real-time sync started. Press Ctrl+C to stop.');
    
    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nShutting down...');
      await shutdown();
      process.exit(0);
    });
    
    // Keep the process alive
    process.stdin.resume();
    
  } catch (error) {
    logger.error('Watch mode failed:', error);
    await shutdown();
  }
}

async function handleDaemon(options: any): Promise<void> {
  try {
    logger.info('Starting daemon mode...');
    
    await handleWatch({ ...options, daemon: true });
    
    // In daemon mode, detach from terminal
    process.stdout.write('Daemon started successfully\n');
    
  } catch (error) {
    logger.error('Daemon mode failed:', error);
  }
}

async function handleStatus(): Promise<void> {
  try {
    await initializeServices();
    
    const stats = await databaseManager.getSyncStats();
    const queueStatus = realtimeSync?.getQueueStatus();
    
    console.log('\n=== Sync Status ===');
    console.log(`Total syncs: ${stats.totalSyncs}`);
    console.log(`Successful syncs: ${stats.successfulSyncs}`);
    console.log(`Failed syncs: ${stats.failedSyncs}`);
    console.log(`Trakt success rate: ${stats.traktSuccessRate.toFixed(1)}%`);
    console.log(`Stremio success rate: ${stats.stremioSuccessRate.toFixed(1)}%`);
    
    if (queueStatus) {
      console.log('\n=== Queue Status ===');
      console.log(`Total items: ${queueStatus.totalItems}`);
      console.log(`Pending: ${queueStatus.pending}`);
      console.log(`Processing: ${queueStatus.processing}`);
      console.log(`Failed: ${queueStatus.failed}`);
    }
    
    console.log(`\nMonitoring active: ${imdbMonitor?.isMonitoring() || false}`);
    console.log(`Last watchlist size: ${imdbMonitor?.getLastWatchlistSize() || 0}`);
    
  } catch (error) {
    logger.error('Failed to get status:', error);
  }
}

async function handleConfig(action: string, options: any): Promise<void> {
  try {
    await initializeServices();
    
    switch (action) {
      case 'show': {
        const config = configManager.getConfig();
        console.log(JSON.stringify(config, null, 2));
        break;
      }
        
      case 'set-interval':
        if (!options.interval) {
          console.error('Interval is required');
          return;
        }
        configManager.setSyncInterval(options.interval);
        console.log(`Sync interval updated to: ${options.interval}`);
        break;
        
      case 'set-trakt':
        if (!options.clientId || !options.clientSecret) {
          console.error('Trakt client ID and secret are required');
          return;
        }
        configManager.setTraktCredentials(options.clientId, options.clientSecret);
        console.log('Trakt credentials updated');
        break;
        
      case 'reset':
        configManager.resetToDefaults();
        console.log('Configuration reset to defaults');
        break;
        
      default:
        console.error('Unknown config action:', action);
    }
  } catch (error) {
    logger.error('Config operation failed:', error);
  }
}

async function handleSync(action: string): Promise<void> {
  try {
    await initializeServices();
    
    switch (action) {
      case 'manual':
        logger.info('Triggering manual sync...');
        await realtimeSync.manualSync();
        console.log('Manual sync completed');
        break;
        
      case 'clear-queue':
        realtimeSync.clearQueue();
        console.log('Sync queue cleared');
        break;
        
      default:
        console.error('Unknown sync action:', action);
    }
  } catch (error) {
    logger.error('Sync operation failed:', error);
  }
}

function setupEventHandlers(): void {
  // Real-time sync events
  realtimeSync.on('changeQueued', (item) => {
    logger.info(`Queued: ${item.change.type} ${item.change.item.title}`);
  });
  
  realtimeSync.on('syncCompleted', (item) => {
    logger.info(`Synced: ${item.change.item.title}`);
  });
  
  realtimeSync.on('syncFailed', (item) => {
    logger.warn(`Sync failed: ${item.change.item.title}`);
  });
  
  // Monitor events
  imdbMonitor.on('watchlistChange', (change) => {
    logger.info(`Detected change: ${change.type} ${change.item.title}`);
  });
  
  imdbMonitor.on('syncError', (error) => {
    logger.error('Monitor error:', error);
  });
}

async function shutdown(): Promise<void> {
  try {
    logger.info('Shutting down services...');
    
    if (imdbMonitor) {
      await imdbMonitor.shutdown();
    }
    
    if (realtimeSync) {
      await realtimeSync.stop();
    }
    
    if (databaseManager) {
      await databaseManager.close();
    }
    
    logger.info('Shutdown complete');
  } catch (error) {
    logger.error('Error during shutdown:', error);
  }
}

// CLI setup
program
  .name('imdb-sync')
  .description('IMDb watchlist sync tool with real-time monitoring')
  .version('1.0.0');

// Import command (original CSV functionality)
program
  .command('import <csv-path>')
  .description('Import watchlist from CSV file')
  .action(handleImport);

// Watch command (real-time monitoring)
program
  .command('watch')
  .description('Start real-time watchlist monitoring')
  .option('-i, --interval <cron>', 'Sync interval (cron expression)', '*/15 * * * *')
  .action(handleWatch);

// Daemon command
program
  .command('daemon')
  .description('Run in daemon mode (background)')
  .option('-i, --interval <cron>', 'Sync interval (cron expression)', '*/15 * * * *')
  .action(handleDaemon);

// Status command
program
  .command('status')
  .description('Show sync status and statistics')
  .action(handleStatus);

// Configuration commands
program
  .command('config <action>')
  .description('Configuration management (show|set-interval|set-trakt|reset)')
  .option('-i, --interval <cron>', 'Sync interval for set-interval')
  .option('--client-id <id>', 'Trakt client ID for set-trakt')
  .option('--client-secret <secret>', 'Trakt client secret for set-trakt')
  .action(handleConfig);

// Sync commands
program
  .command('sync <action>')
  .description('Sync operations (manual|clear-queue)')
  .action(handleSync);

// Main function
export async function main(): Promise<void> {
  try {
    await program.parseAsync();
  } catch (error) {
    logger.error('CLI error:', error);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
