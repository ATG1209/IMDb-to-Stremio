import express from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { cacheService } from '../services/cacheService.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

// Get cached watchlist data
router.get('/:imdbUserId', authMiddleware, async (req, res) => {
  const { imdbUserId } = req.params;

  try {
    logger.info('Fetching cached data', { imdbUserId });

    const cachedData = await cacheService.get(`watchlist:${imdbUserId}`);

    if (!cachedData) {
      logger.info('No cached data found', { imdbUserId });
      return res.status(404).json({
        success: false,
        error: 'No cached data found',
        message: 'Run a scrape job first to populate cache'
      });
    }

    logger.info('Cached data retrieved', {
      imdbUserId,
      itemCount: cachedData.length
    });

    res.json({
      success: true,
      data: cachedData,
      metadata: {
        itemCount: cachedData.length,
        source: 'cache',
        fetchedAt: new Date().toISOString()
      }
    });

  } catch (error) {
    logger.error('Cache fetch failed', {
      imdbUserId,
      error: error.message
    });

    res.status(500).json({
      success: false,
      error: 'Cache fetch failed',
      message: error.message
    });
  }
});

export { router as cacheRouter };