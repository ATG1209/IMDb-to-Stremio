import { logger } from '../utils/logger.js';

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';

// Simple in-memory cache for TMDB responses
const tmdbCache = new Map();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export const tmdbService = {
  // Search for a movie/TV show on TMDB
  async searchContent(title, year, type = 'multi') {
    if (!TMDB_API_KEY) {
      logger.warn('TMDB_API_KEY not configured, skipping TMDB enhancement');
      return null;
    }

    const cacheKey = `search:${type}:${title}:${year || 'unknown'}`;

    // Check cache first
    const cached = tmdbCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return cached.data;
    }

    try {
      const params = new URLSearchParams({
        api_key: TMDB_API_KEY,
        query: title,
        ...(year && { year: year }),
        language: 'en-US'
      });

      const endpoint = type === 'multi' ? 'search/multi' : `search/${type}`;
      const url = `${TMDB_BASE_URL}/${endpoint}?${params}`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'IMDb-Scraper-Worker/1.0'
        }
      });

      if (!response.ok) {
        if (response.status === 429) {
          logger.warn('TMDB rate limit hit, waiting...');
          await new Promise(resolve => setTimeout(resolve, 1000));
          return await this.searchContent(title, year, type); // Retry once
        }
        throw new Error(`TMDB API error: ${response.status}`);
      }

      const data = await response.json();

      // Cache the result
      tmdbCache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      return data;

    } catch (error) {
      logger.error(`TMDB search failed for "${title}" (${year}):`, error);
      return null;
    }
  },

  // Get poster URL for a single item
  async getPoster(title, year) {
    try {
      const searchResult = await this.searchContent(title, year);

      if (!searchResult || !searchResult.results || searchResult.results.length === 0) {
        return null;
      }

      // Find best match (prefer exact year match)
      let bestMatch = searchResult.results[0];

      if (year && searchResult.results.length > 1) {
        const exactYearMatch = searchResult.results.find(result => {
          const releaseYear = result.release_date?.substring(0, 4) ||
                             result.first_air_date?.substring(0, 4);
          return releaseYear === year;
        });

        if (exactYearMatch) {
          bestMatch = exactYearMatch;
        }
      }

      if (bestMatch.poster_path) {
        return `${TMDB_IMAGE_BASE}${bestMatch.poster_path}`;
      }

      return null;

    } catch (error) {
      logger.error(`Failed to get poster for "${title}":`, error);
      return null;
    }
  },

  // Batch poster fetching with rate limiting
  async getPosterBatch(items) {
    const posterMap = new Map();

    if (!TMDB_API_KEY) {
      logger.warn('TMDB_API_KEY not configured, skipping poster batch');
      return posterMap;
    }

    logger.info(`Fetching TMDB posters for ${items.length} items...`);

    // Process in batches to respect rate limits
    const batchSize = 10;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      const promises = batch.map(async (item) => {
        const key = `${item.title}_${item.year || 'unknown'}`;
        const poster = await this.getPoster(item.title, item.year);

        if (poster) {
          posterMap.set(key, poster);
        }
      });

      await Promise.all(promises);

      // Rate limiting: wait between batches
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    logger.info(`TMDB poster batch complete: ${posterMap.size}/${items.length} posters found`);
    return posterMap;
  },

  // Detect content type (movie vs TV) using TMDB
  async detectContentType(title, year) {
    try {
      const searchResult = await this.searchContent(title, year);

      if (!searchResult || !searchResult.results || searchResult.results.length === 0) {
        return 'movie'; // Default fallback
      }

      // Find best match
      let bestMatch = searchResult.results[0];

      if (year && searchResult.results.length > 1) {
        const exactYearMatch = searchResult.results.find(result => {
          const releaseYear = result.release_date?.substring(0, 4) ||
                             result.first_air_date?.substring(0, 4);
          return releaseYear === year;
        });

        if (exactYearMatch) {
          bestMatch = exactYearMatch;
        }
      }

      // Determine type based on TMDB media_type or presence of specific fields
      if (bestMatch.media_type === 'tv' || bestMatch.first_air_date) {
        return 'tv';
      } else if (bestMatch.media_type === 'movie' || bestMatch.release_date) {
        return 'movie';
      }

      return 'movie'; // Default fallback

    } catch (error) {
      logger.error(`Failed to detect content type for "${title}":`, error);
      return 'movie'; // Default fallback
    }
  },

  // Batch content type detection
  async detectContentTypeBatch(items) {
    const typeMap = new Map();

    if (!TMDB_API_KEY) {
      logger.warn('TMDB_API_KEY not configured, skipping content type detection');
      return typeMap;
    }

    logger.info(`Detecting content types for ${items.length} items...`);

    // Process in batches to respect rate limits
    const batchSize = 10;
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);

      const promises = batch.map(async (item) => {
        const key = `${item.title}_${item.year || 'unknown'}`;
        const type = await this.detectContentType(item.title, item.year);
        typeMap.set(key, type);
      });

      await Promise.all(promises);

      // Rate limiting: wait between batches
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 250));
      }
    }

    logger.info(`Content type detection complete: ${typeMap.size} items processed`);
    return typeMap;
  },

  // Clean up cache periodically
  cleanupCache() {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, value] of tmdbCache.entries()) {
      if (now - value.timestamp > CACHE_DURATION) {
        tmdbCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`Cleaned up ${cleanedCount} expired TMDB cache entries`);
    }
  }
};