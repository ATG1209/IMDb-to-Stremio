import { chromium } from 'playwright';
import { logger } from '../utils/logger.js';
import { tmdbService } from './tmdbService.js';

export class ImdbScraper {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    try {
      logger.info('Launching browser...');

      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--disable-gpu',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',
          '--window-size=1920,1080'
        ]
      });

      this.page = await this.browser.newPage();
      await this.page.setViewport({ width: 1920, height: 1080 });
      await this.page.setUserAgent(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      );

      // Set additional headers to avoid detection
      await this.page.setExtraHTTPHeaders({
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
      });

      // Set longer timeouts for pagination strategy
      this.page.setDefaultTimeout(60000);
      this.page.setDefaultNavigationTimeout(60000);

      logger.info('✅ Browser initialized successfully');
    } catch (error) {
      logger.error('❌ Failed to initialize browser:', error);
      throw error;
    }
  }

  async scrapeWatchlist(userId) {
    if (!this.browser || !this.page) {
      throw new Error('Browser not initialized. Call initialize() first.');
    }

    logger.info(`Starting watchlist scrape for user ${userId}`);

    try {
      // URL configurations for pagination strategy
      const urlConfigs = [
        {
          name: 'page-1',
          url: `https://www.imdb.com/user/${userId}/watchlist?ref_=up_nv_urwls_all`,
          priority: 1
        },
        {
          name: 'page-2',
          url: `https://www.imdb.com/user/${userId}/watchlist?ref_=up_nv_urwls_all&page=2`,
          priority: 2
        }
      ];

      let allItems = [];
      const seenIds = new Set();

      // Extract items from each page
      for (const config of urlConfigs) {
        try {
          logger.info(`Processing ${config.name} (${config.url})`);

          await this.page.goto(config.url, { timeout: 45000, waitUntil: 'networkidle' });
          await this.page.waitForTimeout(1500);

          const pageOffset = config.name === 'page-1' ? 0 : 250;
          const pageItems = await this.extractItemsFromCurrentPage(config.name, pageOffset);

          logger.info(`${config.name}: Extracted ${pageItems.length} items`);

          // Add new items (deduplicate by IMDb ID)
          let newItemsCount = 0;
          for (const item of pageItems) {
            if (!seenIds.has(item.imdbId)) {
              seenIds.add(item.imdbId);
              allItems.push(item);
              newItemsCount++;
            }
          }

          logger.info(`${config.name}: Added ${newItemsCount} new items (total: ${allItems.length})`);

          // Stop if we have enough items
          if (allItems.length > 450) {
            logger.info(`Reached ${allItems.length} items, stopping extraction`);
            break;
          }

        } catch (error) {
          logger.error(`Error processing ${config.name}:`, error);
          // Continue with next URL configuration
        }
      }

      logger.info(`Extraction complete: Found ${allItems.length} total unique items`);

      // Reverse array for newest-first order
      allItems.reverse();

      // Enhance with TMDB data
      if (allItems.length > 0) {
        logger.info(`Enhancing ${allItems.length} items with TMDB data...`);
        try {
          // Detect content types
          const contentTypes = await tmdbService.detectContentTypeBatch(
            allItems.map(item => ({ title: item.title, year: item.year }))
          );

          // Get posters
          const tmdbPosters = await tmdbService.getPosterBatch(
            allItems.map(item => ({ title: item.title, year: item.year }))
          );

          // Apply enhancements
          allItems.forEach(item => {
            const key = `${item.title}_${item.year || 'unknown'}`;
            const detectedType = contentTypes.get(key);
            const poster = tmdbPosters.get(key);

            if (detectedType) {
              item.type = detectedType;
            }
            if (poster) {
              item.poster = poster;
            }
          });

          const posterCount = allItems.filter(item => item.poster).length;
          const movieCount = allItems.filter(item => item.type === 'movie').length;
          const tvCount = allItems.filter(item => item.type === 'tv').length;

          logger.info(`TMDB enhancement complete: ${posterCount}/${allItems.length} items have posters (${movieCount} movies, ${tvCount} TV series)`);

        } catch (error) {
          logger.error('Error enhancing with TMDB data:', error);
        }
      }

      return allItems;

    } catch (error) {
      logger.error(`Failed to scrape watchlist for ${userId}:`, error);
      throw error;
    }
  }

  async extractItemsFromCurrentPage(sortName, pageOffset = 0) {
    logger.info(`Extracting items for ${sortName}...`);

    try {
      // Enhanced scrolling for pagination
      logger.info(`Scrolling ${sortName} page to load all items...`);

      const finalCount = await this.page.evaluate(async () => {
        const sleep = (ms) => new Promise(r => setTimeout(r, ms));

        for (let i = 0; i < 25; i++) {
          window.scrollTo(0, document.body.scrollHeight);
          await sleep(800);

          const currentCount = Math.max(
            document.querySelectorAll('.lister-item').length,
            document.querySelectorAll('.ipc-poster-card').length,
            document.querySelectorAll('a[href*="/title/"]').length
          );

          if (i > 3 && currentCount > 0 && currentCount >= 200) {
            break;
          }
        }

        window.scrollTo(0, 0);
        return document.querySelectorAll('a[href*="/title/"]').length;
      });

      logger.info(`${sortName}: Found ${finalCount} items after scrolling`);
      await this.page.waitForTimeout(2000);

    } catch (e) {
      logger.warn(`${sortName}: Scroll loading failed:`, e);
    }

    // Extract watchlist items
    return await this.page.evaluate((pageOffset) => {
      const normalize = (arr) => arr.filter(item => item && item.imdbId && item.title).map((x, index) => {
        const addedAt = new Date(Date.now() - (pageOffset + index) * 1000).toISOString();
        return {
          imdbId: x.imdbId,
          title: (x.title || '').replace(/^\\d+\\.\\s*/, '').replace(/\\s+/g, ' ').trim(),
          year: x.year,
          type: x.type === 'tv' ? 'tv' : 'movie',
          poster: x.poster || undefined,
          imdbRating: x.imdbRating || 0,
          numRatings: x.numRatings || 0,
          runtime: x.runtime || 0,
          popularity: x.popularity || 0,
          userRating: x.userRating || 0,
          addedAt,
        };
      });

      // Extract from different DOM structures
      const lister = Array.from(document.querySelectorAll('.lister-item')).map((el) => {
        try {
          const a = el.querySelector('h3 a[href*="/title/"]');
          const href = a ? a.getAttribute('href') : '';
          const id = href ? (href.match(/tt\\d+/) || [])[0] || '' : '';
          const title = a ? (a.textContent || '').trim() : '';
          const yearEl = el.querySelector('.lister-item-year, .secondaryInfo');
          const yearText = yearEl ? yearEl.textContent || '' : '';
          const year = (yearText.match(/(19|20)\\d{2}/) || [])[0];
          const img = el.querySelector('img[src]');
          const text = (el.textContent || '').toLowerCase();
          const type = text.includes('tv series') || text.includes('mini series') || text.includes('series') ? 'tv' : 'movie';

          const ratingEl = el.querySelector('.ratings-bar .inline-block strong');
          const imdbRating = ratingEl ? parseFloat((ratingEl.textContent || '').trim() || '0') || 0 : 0;

          return id && title ? {
            imdbId: id,
            title,
            year,
            type,
            poster: img ? img.src : undefined,
            imdbRating,
            numRatings: 0,
            runtime: 0,
            popularity: 0,
            userRating: 0,
          } : null;
        } catch (e) {
          return null;
        }
      });

      // Fallback: extract from all title links
      const links = Array.from(document.querySelectorAll('a[href*="/title/"]')).map((a) => {
        let id = '';
        if (a.href) {
          const match = a.href.match(/\\/title\\/(tt\\d+)/) || a.href.match(/(tt\\d+)/);
          id = match ? match[1] : '';
        }

        let title = (a.textContent || '').trim();
        title = title.replace(/^\\d+\\.\\s*/, '').replace(/\\s+/g, ' ').trim();

        if (!id || !title || title.length < 3) return null;

        const parent = a.closest('li, .titleColumn, .cli-item, [class*="item"]');
        let year = null;
        if (parent) {
          const parentText = parent.textContent || '';
          const yearMatch = parentText.match(/\\(?(19|20)\\d{2}\\)?/);
          year = yearMatch ? yearMatch[0].replace(/[()]/g, '') : null;
        }

        const contextText = parent ? (parent.textContent || '').toLowerCase() : '';
        const type = contextText.includes('series') || contextText.includes('tv') ? 'tv' : 'movie';

        return {
          imdbId: id,
          title,
          year,
          type,
          poster: undefined,
          imdbRating: 0,
          numRatings: 0,
          runtime: 0,
          popularity: 0,
          userRating: 0,
        };
      }).filter(Boolean);

      // Remove duplicates
      const uniqueLinks = links.reduce((acc, current) => {
        if (current && !acc.find(item => item.imdbId === current.imdbId)) {
          acc.push(current);
        }
        return acc;
      }, []);

      // Choose the method that gives us the most items
      const normalizedLister = normalize(lister);
      const normalizedLinks = normalize(uniqueLinks);

      let chosen = normalizedLister;
      if (normalizedLinks.length > chosen.length) {
        chosen = normalizedLinks;
      }

      return chosen;
    }, pageOffset);
  }

  async cleanup() {
    try {
      if (this.page) {
        await this.page.close();
        this.page = null;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      logger.info('✅ Browser cleanup completed');
    } catch (error) {
      logger.error('❌ Error during browser cleanup:', error);
    }
  }
}