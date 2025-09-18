import express from 'express';
import { redisClient } from '../services/redis.js';
import { logger } from '../utils/logger.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'imdb-scraper-worker',
    version: '1.0.0',
    checks: {
      redis: 'unknown',
      memory: 'unknown',
      uptime: process.uptime()
    }
  };

  try {
    // Check Redis connection
    await redisClient.ping();
    health.checks.redis = 'healthy';
  } catch (error) {
    health.checks.redis = 'unhealthy';
    health.status = 'degraded';
    logger.warn('Redis health check failed:', { error: error.message });
  }

  // Check memory usage
  const memUsage = process.memoryUsage();
  const memUsageMB = Math.round(memUsage.heapUsed / 1024 / 1024);
  health.checks.memory = `${memUsageMB}MB`;

  // If any critical checks fail, mark as unhealthy
  if (health.checks.redis === 'unhealthy') {
    health.status = 'unhealthy';
    return res.status(503).json(health);
  }

  res.json(health);
});

router.get('/metrics', async (req, res) => {
  try {
    const queueInfo = await redisClient.llen('imdb:jobs:pending');
    const processingInfo = await redisClient.llen('imdb:jobs:processing');

    const metrics = {
      timestamp: new Date().toISOString(),
      queue: {
        pending: queueInfo || 0,
        processing: processingInfo || 0
      },
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage()
      }
    };

    res.json(metrics);
  } catch (error) {
    logger.error('Failed to get metrics:', error);
    res.status(500).json({ error: 'Failed to get metrics' });
  }
});

export { router as healthRouter };