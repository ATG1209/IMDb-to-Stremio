import { chromium, Browser, Page } from 'playwright';
import path from 'path';
import fs from 'fs/promises';

interface WatchlistItem {
  imdbId: string;
  title: string;
  year?: string;
  type: 'movie' | 'tv';
  poster?: string;
  plot?: string;
  genres?: string[];
  addedAt: string;
}

interface WatchlistCache {
  items: WatchlistItem[];
  lastUpdated: string;
  totalItems: number;
}

interface IMDbCredentials {
  email: string;
  password: string;
}

const CACHE_FILE = path.join(process.cwd(), 'data', 'watchlist-cache.json');
const CONFIG_FILE = path.join(process.cwd(), 'data', 'config.json');

export class IMDbSyncService {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async ensureDataDir() {
    const dataDir = path.dirname(CACHE_FILE);
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
    }
  }

  async saveCredentials(credentials: IMDbCredentials) {
    const { saveCredentials } = await import('./storage');
    await saveCredentials(credentials.email, credentials.password);
  }

  async loadCredentials(): Promise<IMDbCredentials | null> {
    const { getCredentials } = await import('./storage');
    return await getCredentials();
  }

  async initializeBrowser() {
    if (this.browser) return;

    this.browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    this.page = await this.browser.newPage();
    
    // Set realistic headers
    await this.page.setExtraHTTPHeaders({
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });
  }

  async login(credentials: IMDbCredentials): Promise<boolean> {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      console.log('Navigating to IMDb sign-in page...');
      await this.page.goto('https://www.imdb.com/ap/signin');
      await this.page.waitForLoadState('networkidle', { timeout: 10000 });

      // Fill credentials
      await this.page.fill('input[name="email"]', credentials.email);
      await this.page.fill('input[name="password"]', credentials.password);
      
      // Submit
      await this.page.click('input[type="submit"]');
      await this.page.waitForLoadState('networkidle', { timeout: 10000 });

      // Check if login was successful
      const isLoggedIn = await this.page.locator('[data-testid="user-menu"]').isVisible().catch(() => false);
      
      console.log(`Login ${isLoggedIn ? 'successful' : 'failed'}`);
      return isLoggedIn;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  }

  async scrapeWatchlist(): Promise<WatchlistItem[]> {
    if (!this.page) throw new Error('Browser not initialized');

    try {
      console.log('Navigating to watchlist...');
      
      // Try to find the watchlist URL - it might be user-specific
      await this.page.goto('https://www.imdb.com/user/ur*/watchlist/', { timeout: 10000 });
      
      // If that doesn't work, try navigating from profile
      if (this.page.url().includes('404')) {
        await this.page.goto('https://www.imdb.com/profile');
        await this.page.waitForLoadState('networkidle');
        
        // Look for watchlist link
        const watchlistLink = this.page.locator('a[href*="watchlist"]').first();
        if (await watchlistLink.isVisible()) {
          await watchlistLink.click();
          await this.page.waitForLoadState('networkidle');
        }
      }

      await this.page.waitForLoadState('networkidle');

      // Try multiple selectors for watchlist items
      const selectors = [
        '.lister-item',
        '.titleColumn',
        '[data-testid="title-list-item"]',
        '.cli-item'
      ];

      let items: any[] = [];
      
      for (const selector of selectors) {
        try {
          await this.page.waitForSelector(selector, { timeout: 5000 });
          
          items = await this.page.$$eval(selector, (elements) => {
            return elements.map(item => {
              // Try different ways to extract data
              const titleElement = item.querySelector('a[href*="/title/"]') || 
                                 item.querySelector('.titleColumn a') ||
                                 item.querySelector('.title a');
              
              const yearElement = item.querySelector('.secondaryInfo') ||
                                item.querySelector('.year') ||
                                item.querySelector('[class*="year"]');

              if (!titleElement) return null;

              const href = titleElement.getAttribute('href') || '';
              const imdbId = href.match(/\/title\/(tt\d+)\//)?.[1] || '';
              const title = titleElement.textContent?.trim() || '';
              const year = yearElement?.textContent?.replace(/[()]/g, '').trim();

              if (!imdbId || !title) return null;

              return {
                imdbId,
                title,
                year,
                type: 'movie' as const, // We'll improve this detection later
                addedAt: new Date().toISOString()
              };
            }).filter(Boolean);
          });
          
          if (items.length > 0) break;
        } catch (e) {
          continue; // Try next selector
        }
      }

      console.log(`Scraped ${items.length} watchlist items`);
      return items;
    } catch (error) {
      console.error('Error scraping watchlist:', error);
      throw error;
    }
  }

  async syncWatchlist(): Promise<WatchlistCache> {
    const credentials = await this.loadCredentials();
    if (!credentials) {
      throw new Error('No IMDb credentials configured');
    }

    await this.initializeBrowser();
    
    const loginSuccess = await this.login(credentials);
    if (!loginSuccess) {
      throw new Error('Failed to login to IMDb');
    }

    const items = await this.scrapeWatchlist();
    
    const cache: WatchlistCache = {
      items,
      lastUpdated: new Date().toISOString(),
      totalItems: items.length
    };

    // Save cache
    await this.ensureDataDir();
    await fs.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));

    console.log(`Watchlist synced: ${items.length} items`);
    return cache;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}