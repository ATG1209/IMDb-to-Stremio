// Simple client for communicating with the VPS worker service

const WORKER_URL = process.env.WORKER_URL; // http://37.27.92.76:3003

export interface WorkerWatchlistItem {
  imdbId: string;
  title: string;
  year?: string;
  type: 'movie' | 'tv';
  poster?: string;
  plot?: string;
  genres?: string[];
  rating?: string;
  imdbRating?: number;
  numRatings?: number;
  runtime?: number;
  popularity?: number;
  userRating?: number;
  addedAt: string;
}

class VPSWorkerClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = WORKER_URL || 'http://localhost:3000';
  }

  // Check if worker is available
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: {
          'Authorization': `Bearer ${process.env.WORKER_SECRET || 'worker-secret'}`
        },
        timeout: 5000
      });
      return response.ok;
    } catch (error) {
      console.warn('[VPSWorker] Health check failed:', error);
      return false;
    }
  }

  // Smart cache-first approach
  async scrapeWatchlist(imdbUserId: string, options: {
    forceRefresh?: boolean;
  } = {}): Promise<WorkerWatchlistItem[]> {

    if (!WORKER_URL) {
      throw new Error('WORKER_URL not configured');
    }

    try {
      // Step 1: Try cache first (unless force refresh)
      if (!options.forceRefresh) {
        console.log(`[VPSWorker] Checking cache for user ${imdbUserId}...`);

        try {
          const cacheResponse = await fetch(`${this.baseUrl}/cache/${imdbUserId}`, {
            headers: {
              'Authorization': `Bearer ${process.env.WORKER_SECRET || 'worker-secret'}`
            },
            timeout: 5000
          });

          if (cacheResponse.ok) {
            const cacheResult = await cacheResponse.json();
            if (cacheResult.success && cacheResult.data && cacheResult.data.length > 0) {
              console.log(`[VPSWorker] Cache hit! Found ${cacheResult.data.length} items`);
              return cacheResult.data;
            }
          }
        } catch (cacheError) {
          console.warn('[VPSWorker] Cache lookup failed, will trigger fresh scrape');
        }
      }

      // Step 2: Trigger async job and return immediately with error (triggers fallback)
      console.log(`[VPSWorker] Triggering async scrape job for user ${imdbUserId}...`);

      const jobResponse = await fetch(`${this.baseUrl}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.WORKER_SECRET || 'worker-secret'}`
        },
        body: JSON.stringify({
          imdbUserId,
          forceRefresh: options.forceRefresh || false
        }),
        timeout: 10000
      });

      if (jobResponse.ok) {
        const jobResult = await jobResponse.json();
        console.log(`[VPSWorker] Job queued: ${jobResult.jobId}. Data will be available in cache after completion.`);
      }

      // Always throw error to trigger fallback for immediate response
      // The job runs in background and populates cache for next request
      throw new Error('VPS Worker: Async job triggered, use fallback for immediate response');

    } catch (error) {
      console.error(`[VPSWorker] Failed to get data for ${imdbUserId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const vpsWorkerClient = new VPSWorkerClient();