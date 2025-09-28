import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { jobsRouter } from './routes/jobs.js';
import { healthRouter } from './routes/health.js';
import { cacheRouter } from './routes/cache.js';
import { scrapeSyncRouter } from './routes/scrapeSync.js';
import { queueProcessor } from './services/queueProcessor.js';
import { logger } from './utils/logger.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  next();
});

// Routes
app.use('/health', healthRouter);
app.use('/jobs', jobsRouter);
app.use('/cache', cacheRouter);
app.use('/scrape-sync', scrapeSyncRouter);

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: `Route ${req.method} ${req.originalUrl} not found`
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 IMDb Scraper Worker started on port ${PORT}`);
  logger.info(`📊 Health check: http://localhost:${PORT}/health`);

  // Start background queue processor
  queueProcessor.start();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  queueProcessor.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  queueProcessor.stop();
  process.exit(0);
});