import { chromium, Browser, Page } from 'playwright';
import * as cron from 'node-cron';
import { logger } from '../util/logger.js';
import { EventEmitter } from 'events';

export interface WatchlistChange {
  type: 'added' | 'removed' | 'modified';
  item: {
    id: string;
    title: string;
    year?: string;
    rating?: string;
    url: string;
  };
  timestamp: Date;
}

export interface IMDbCredentials {
  email: string;
  password: string;
}

export class IMDbMonitor extends EventEmitter {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private isRunning = false;
  private cronJob: cron.ScheduledTask | null = null;
  private lastWatchlist: Map<string, any> = new Map();
  private credentials: IMDbCredentials | null = null;
  private syncInterval: string = '*/15 * * * *'; // Default: every 15 minutes

  constructor() {
    super();
  }

  async initialize(credentials: IMDbCredentials, interval?: string): Promise<void> {
    this.credentials = credentials;
    if (interval) {
      this.syncInterval = interval;
    }

    logger.info('Initializing IMDb monitor...');
    
    try {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      this.page = await this.browser.newPage();
      
      // Set realistic user agent
      await this.page.setExtraHTTPHeaders({
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      });
      
      logger.info('IMDb monitor initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize IMDb monitor:', error);
      throw error;
    }
  }

  async login(): Promise<boolean> {
    if (!this.page || !this.credentials) {
      throw new Error('Monitor not initialized or credentials missing');
    }

    try {
      logger.info('Logging into IMDb...');
      
      await this.page.goto('https://www.imdb.com/ap/signin');
      await this.page.waitForLoadState('networkidle');

      // Fill in credentials
      await this.page.fill('input[name="email"]', this.credentials.email);
      await this.page.fill('input[name="password"]', this.credentials.password);
      
      // Submit form
      await this.page.click('input[type="submit"]');
      await this.page.waitForLoadState('networkidle');

      // Check if login was successful
      const isLoggedIn = await this.page.locator('[data-testid="user-menu"]').isVisible();
      
      if (isLoggedIn) {
        logger.info('Successfully logged into IMDb');
        return true;
      } else {
        logger.error('Failed to log into IMDb');
        return false;
      }
    } catch (error) {
      logger.error('Login error:', error);
      return false;
    }
  }

  async scrapeWatchlist(): Promise<Map<string, any>> {
    if (!this.page) {
      throw new Error('Monitor not initialized');
    }

    try {
      logger.info('Scraping watchlist...');
      
      await this.page.goto('https://www.imdb.com/user/ur*/watchlist');
      await this.page.waitForLoadState('networkidle');

      // Wait for watchlist items to load
      await this.page.waitForSelector('.lister-list', { timeout: 10000 });

      const watchlistItems = await this.page.$$eval('.lister-item', items => {
        return items.map(item => {
          const titleElement = item.querySelector('.titleColumn a');
          const yearElement = item.querySelector('.secondaryInfo');
          const ratingElement = item.querySelector('.ipl-rating-star__rating');
          const imageElement = item.querySelector('.loadlate');

          const title = titleElement?.textContent?.trim() || '';
          const href = titleElement?.getAttribute('href') || '';
          const id = href.match(/\/title\/(tt\d+)\//)?.[1] || '';
          const year = yearElement?.textContent?.replace(/[()]/g, '').trim();
          const rating = ratingElement?.textContent?.trim();
          const imageUrl = imageElement?.getAttribute('loadlate');

          return {
            id,
            title,
            year,
            rating,
            url: `https://www.imdb.com${href}`,
            imageUrl,
            scrapedAt: new Date().toISOString()
          };
        });
      });

      const watchlistMap = new Map();
      watchlistItems.forEach(item => {
        if (item.id) {
          watchlistMap.set(item.id, item);
        }
      });

      logger.info(`Scraped ${watchlistMap.size} watchlist items`);
      return watchlistMap;
    } catch (error) {
      logger.error('Error scraping watchlist:', error);
      throw error;
    }
  }

  async detectChanges(currentWatchlist: Map<string, any>): Promise<WatchlistChange[]> {
    const changes: WatchlistChange[] = [];
    const timestamp = new Date();

    // Detect additions
    for (const [id, item] of currentWatchlist) {
      if (!this.lastWatchlist.has(id)) {
        changes.push({
          type: 'added',
          item,
          timestamp
        });
      }
    }

    // Detect removals
    for (const [id, item] of this.lastWatchlist) {
      if (!currentWatchlist.has(id)) {
        changes.push({
          type: 'removed',
          item,
          timestamp
        });
      }
    }

    // Detect modifications (rating changes)
    for (const [id, currentItem] of currentWatchlist) {
      const lastItem = this.lastWatchlist.get(id);
      if (lastItem && lastItem.rating !== currentItem.rating) {
        changes.push({
          type: 'modified',
          item: currentItem,
          timestamp
        });
      }
    }

    return changes;
  }

  async performSync(): Promise<void> {
    try {
      logger.info('Starting watchlist sync...');
      
      const currentWatchlist = await this.scrapeWatchlist();
      const changes = await this.detectChanges(currentWatchlist);

      if (changes.length > 0) {
        logger.info(`Detected ${changes.length} changes`);
        
        for (const change of changes) {
          this.emit('watchlistChange', change);
        }
      } else {
        logger.info('No changes detected');
      }

      this.lastWatchlist = currentWatchlist;
    } catch (error) {
      logger.error('Sync failed:', error);
      this.emit('syncError', error);
    }
  }

  startMonitoring(): void {
    if (this.isRunning) {
      logger.warn('Monitoring is already running');
      return;
    }

    logger.info(`Starting monitoring with interval: ${this.syncInterval}`);
    
    this.cronJob = cron.schedule(this.syncInterval, async () => {
      await this.performSync();
    });

    this.isRunning = true;
    this.emit('monitoringStarted');
  }

  stopMonitoring(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
    }
    
    this.isRunning = false;
    logger.info('Monitoring stopped');
    this.emit('monitoringStopped');
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down IMDb monitor...');
    
    this.stopMonitoring();
    
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
    
    logger.info('IMDb monitor shutdown complete');
  }

  isMonitoring(): boolean {
    return this.isRunning;
  }

  setSyncInterval(interval: string): void {
    this.syncInterval = interval;
    
    if (this.isRunning) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }

  async manualSync(): Promise<void> {
    logger.info('Performing manual sync...');
    await this.performSync();
  }

  getLastWatchlistSize(): number {
    return this.lastWatchlist.size;
  }
}