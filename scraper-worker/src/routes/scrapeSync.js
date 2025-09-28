import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { imdbScraper } from '../services/imdbScraper.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Synchronous scrape endpoint - waits for completion
router.post('/', authMiddleware, async (req, res) => {
  const { imdbUserId, forceRefresh = false } = req.body;

  if (!imdbUserId) {
    return res.status(400).json({
      success: false,
      error: 'Missing imdbUserId'
    });
  }

  try {
    logger.info('Starting SYNCHRONOUS scrape', { imdbUserId, forceRefresh });

    // Directly scrape without queue - wait for completion
    const startTime = Date.now();
    const items = await imdbScraper.scrapeWatchlist(imdbUserId, { forceRefresh });
    const duration = Date.now() - startTime;

    logger.info('Synchronous scrape completed', {
      imdbUserId,
      itemCount: items.length,
      duration: `${duration}ms`
    });

    res.json({
      success: true,
      data: items,
      metadata: {
        itemCount: items.length,
        scrapedAt: new Date().toISOString(),
        duration: `${duration}ms`,
        forceRefresh
      }
    });

  } catch (error) {
    logger.error('Synchronous scrape failed', {
      imdbUserId,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Scraping failed',
      message: error.message
    });
  }
});

export { router as scrapeSyncRouter };