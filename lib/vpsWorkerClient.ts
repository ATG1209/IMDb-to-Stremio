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
        timeout: 5000
      });
      return response.ok;
    } catch (error) {
      console.warn('[VPSWorker] Health check failed:', error);
      return false;
    }
  }

  // Request scraping job from VPS worker
  async scrapeWatchlist(imdbUserId: string, options: {
    forceRefresh?: boolean;
  } = {}): Promise<WorkerWatchlistItem[]> {

    if (!WORKER_URL) {
      throw new Error('WORKER_URL not configured');
    }

    try {
      console.log(`[VPSWorker] Requesting scrape for user ${imdbUserId}...`);

      const response = await fetch(`${this.baseUrl}/jobs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          imdbUserId,
          forceRefresh: options.forceRefresh || false
        }),
        timeout: 120000 // 2 minutes for scraping
      });

      if (!response.ok) {
        throw new Error(`VPS Worker error: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      if (result.success && result.data) {
        console.log(`[VPSWorker] Successfully scraped ${result.data.length} items`);
        return result.data;
      } else {
        console.warn('[VPSWorker] No data returned:', result);
        return [];
      }

    } catch (error) {
      console.error(`[VPSWorker] Failed to scrape watchlist for ${imdbUserId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const vpsWorkerClient = new VPSWorkerClient();