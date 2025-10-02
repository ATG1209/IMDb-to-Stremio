import { jobQueue } from './jobQueue.js';
import { jobStorage } from './jobStorage.js';
import { redisClient } from './redis.js';
import { ImdbScraper } from './imdbScraper.js';
import { logger } from '../utils/logger.js';

class QueueProcessor {
  constructor() {
    this.isRunning = false;
    this.processingJob = null;
    this.scraper = new ImdbScraper();
  }

  async start() {
    if (this.isRunning) {
      logger.warn('Queue processor already running');
      return;
    }

    this.isRunning = true;
    logger.info('🔄 Starting queue processor...');

    // Start the processing loop
    this.processLoop();
  }

  async stop() {
    logger.info('⏹️ Stopping queue processor...');
    this.isRunning = false;

    // Wait for current job to finish
    if (this.processingJob) {
      logger.info('Waiting for current job to complete...');
      await this.processingJob;
    }

    // Cleanup browser
    await this.scraper.cleanup();
    logger.info('✅ Queue processor stopped');
  }

  async processLoop() {
    while (this.isRunning) {
      try {
        // Get next job from queue
        const job = await jobQueue.dequeue();

        if (!job) {
          // No jobs available, wait a bit
          await new Promise(resolve => setTimeout(resolve, 5000));
          continue;
        }

        // Process the job
        this.processingJob = this.processJob(job);
        await this.processingJob;
        this.processingJob = null;

      } catch (error) {
        logger.error('Error in processing loop:', error);
        // Wait a bit before retrying
        await new Promise(resolve => setTimeout(resolve, 10000));
      }
    }
  }

  async processJob(job) {
    const startTime = Date.now();
    logger.info(`🔄 Processing job ${job.id} for user ${job.imdbUserId}`);

    try {
      // Update job status to processing
      await jobStorage.updateJob(job.id, {
        status: 'processing',
        startedAt: new Date().toISOString(),
        progress: 'Initializing browser...'
      });

      // Initialize browser if needed
      if (!this.scraper.browser) {
        await this.scraper.initialize();
      }

      // Update progress
      await jobStorage.updateJob(job.id, {
        progress: 'Scraping IMDb watchlist...'
      });

      // Scrape the watchlist
      const watchlistItems = await this.scraper.scrapeWatchlist(job.imdbUserId);

      // Prepare result
      const result = {
        totalItems: watchlistItems.length,
        items: watchlistItems,
        lastUpdated: new Date().toISOString(),
        scrapedAt: new Date().toISOString(),
        processingTime: Date.now() - startTime
      };

      // Store result separately for faster access
      await jobStorage.saveResult(job.id, result);

      // Save to watchlist cache for direct access by production app
      // Cache for 12 hours to keep data fresh with new IMDb additions
      await redisClient.setEx(
        `watchlist:${job.imdbUserId}`,
        12 * 60 * 60, // 12 hours
        JSON.stringify(watchlistItems)
      );

      logger.info(`Watchlist cached for user ${job.imdbUserId}`, {
        itemCount: watchlistItems.length,
        cacheKey: `watchlist:${job.imdbUserId}`
      });

      // Update progress
      await jobStorage.updateJob(job.id, {
        progress: 'Finalizing...'
      });

      // Mark job as completed
      await jobQueue.complete(job, result);
      await jobStorage.updateJob(job.id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
        result
      });

      const duration = Date.now() - startTime;
      logger.info(`✅ Job ${job.id} completed successfully in ${duration}ms (${result.totalItems} items)`);

      // Send callback if provided
      if (job.callbackUrl) {
        await this.sendCallback(job, result);
      }

    } catch (error) {
      logger.error(`❌ Job ${job.id} failed:`, error);

      // Mark job as failed
      await jobQueue.fail(job, error);
      await jobStorage.updateJob(job.id, {
        status: 'failed',
        failedAt: new Date().toISOString(),
        error: error.message,
        attempts: (job.attempts || 0) + 1
      });

      // Send failure callback if provided
      if (job.callbackUrl) {
        await this.sendCallback(job, null, error);
      }

      // Clean up browser on failure
      await this.scraper.cleanup();
    }
  }

  async sendCallback(job, result, error = null) {
    if (!job.callbackUrl) return;

    try {
      const payload = {
        jobId: job.id,
        imdbUserId: job.imdbUserId,
        status: error ? 'failed' : 'completed',
        timestamp: new Date().toISOString()
      };

      if (result) {
        payload.result = {
          totalItems: result.totalItems,
          lastUpdated: result.lastUpdated,
          processingTime: result.processingTime
        };
      }

      if (error) {
        payload.error = error.message;
      }

      const response = await fetch(job.callbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.VERCEL_CALLBACK_SECRET}`,
          'User-Agent': 'IMDb-Scraper-Worker/1.0'
        },
        body: JSON.stringify(payload),
        timeout: 10000
      });

      if (response.ok) {
        logger.info(`Callback sent successfully for job ${job.id}`);
      } else {
        logger.warn(`Callback failed for job ${job.id}: ${response.status}`);
      }

    } catch (callbackError) {
      logger.error(`Failed to send callback for job ${job.id}:`, callbackError);
    }
  }

  // Get current processor status
  getStatus() {
    return {
      isRunning: this.isRunning,
      hasActiveBrowser: !!this.scraper.browser,
      currentJob: this.processingJob ? 'Processing job...' : 'Idle'
    };
  }
}

// Export singleton instance
export const queueProcessor = new QueueProcessor();