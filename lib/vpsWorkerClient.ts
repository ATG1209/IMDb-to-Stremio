// Simple client for communicating with the VPS worker service

const WORKER_URL = process.env.WORKER_URL; // http://37.27.92.76:3003
const WORKER_SECRET = process.env.WORKER_SECRET || 'worker-secret';
const CACHE_TIMEOUT_MS = 7000;
const JOB_TIMEOUT_MS = 10000;
const CACHE_POLL_ATTEMPTS = 6;
const CACHE_POLL_INTERVAL_MS = 2000;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const createTimeoutSignal = (ms: number) => {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
};

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

export type WorkerRefreshSource =
  | 'worker-cache'
  | 'worker-job'
  | 'worker-refresh'
  | 'worker-stale';

export type WorkerWatchlistResult = WorkerWatchlistItem[] & {
  source?: WorkerRefreshSource;
  metadata?: Record<string, unknown>;
};

export class WorkerPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'WorkerPendingError';
  }
}

class VPSWorkerClient {
  private baseUrl: string;

  constructor() {
    this.baseUrl = WORKER_URL || 'http://localhost:3000';
  }

  private authHeaders() {
    return {
      Authorization: `Bearer ${WORKER_SECRET}`
    } as const;
  }

  private async fetchCache(imdbUserId: string, label = 'cache-check'): Promise<WorkerWatchlistResult | null> {
    const url = `${this.baseUrl}/cache/${imdbUserId}`;

    try {
      const response = await fetch(url, {
        headers: {
          ...this.authHeaders(),
          Accept: 'application/json'
        },
        signal: createTimeoutSignal(CACHE_TIMEOUT_MS)
      });

      if (response.status === 404) {
        console.log(`[VPSWorker] (${label}) Cache miss for ${imdbUserId}`);
        return null;
      }

      if (!response.ok) {
        console.warn(`[VPSWorker] (${label}) Cache request failed: ${response.status}`);
        return null;
      }

      const payload = await response.json();
      if (payload?.success && Array.isArray(payload.data)) {
        const items = payload.data as WorkerWatchlistResult;
        if (payload.metadata) {
          items.metadata = payload.metadata;
        }
        console.log(`[VPSWorker] (${label}) Cache hit for ${imdbUserId}: ${items.length} items`);
        return items;
      }

      console.warn('[VPSWorker] Cache response missing data payload');
      return null;

    } catch (error) {
      console.warn(`[VPSWorker] (${label}) Cache lookup error:`, error);
      return null;
    }
  }

  private async triggerJob(imdbUserId: string, forceRefresh: boolean): Promise<void> {
    console.log(`[VPSWorker] Triggering ${forceRefresh ? 'force ' : ''}job for ${imdbUserId}`);

    const response = await fetch(`${this.baseUrl}/jobs`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...this.authHeaders()
      },
      body: JSON.stringify({ imdbUserId, forceRefresh }),
      signal: createTimeoutSignal(JOB_TIMEOUT_MS)
    });

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`VPS Worker: failed to enqueue job (${response.status}) ${body}`);
    }

    const jobResult = await response.json().catch(() => ({}));
    console.log(`[VPSWorker] Job accepted for ${imdbUserId}`, jobResult);
  }

  private async pollCache(imdbUserId: string, attempts: number, delayMs: number): Promise<WorkerWatchlistResult | null> {
    for (let attempt = 1; attempt <= attempts; attempt++) {
      const data = await this.fetchCache(imdbUserId, `poll-${attempt}`);
      if (data) {
        console.log(`[VPSWorker] Cache ready on attempt ${attempt} (${data.length} items)`);
        return data;
      }

      if (attempt < attempts) {
        console.log(`[VPSWorker] Cache not ready (attempt ${attempt}/${attempts}), waiting ${delayMs}ms...`);
        await sleep(delayMs);
      }
    }

    return null;
  }

  // Check if worker is available
  async isHealthy(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        headers: {
          ...this.authHeaders()
        },
        signal: createTimeoutSignal(CACHE_TIMEOUT_MS)
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
  } = {}): Promise<WorkerWatchlistResult> {
    if (!WORKER_URL) {
      throw new Error('WORKER_URL not configured');
    }

    try {
      const forceRefresh = options.forceRefresh === true;

      let preRefreshCache: WorkerWatchlistResult | null = null;

      if (!forceRefresh) {
        const cached = await this.fetchCache(imdbUserId);
        if (cached) {
          cached.source = 'worker-cache';
          return cached;
        }
      } else {
        preRefreshCache = await this.fetchCache(imdbUserId, 'pre-refresh');
        if (preRefreshCache) {
          console.log(`[VPSWorker] Force refresh requested — existing cache has ${preRefreshCache.length} items`);
        }
      }

      await this.triggerJob(imdbUserId, forceRefresh);

      const pollAttempts = forceRefresh ? CACHE_POLL_ATTEMPTS : Math.max(3, CACHE_POLL_ATTEMPTS - 1);
      const polled = await this.pollCache(imdbUserId, pollAttempts, CACHE_POLL_INTERVAL_MS);

      if (polled) {
        polled.source = forceRefresh ? 'worker-refresh' : 'worker-job';
        return polled;
      }

      if (forceRefresh && preRefreshCache) {
        console.warn('[VPSWorker] Force refresh timed out; returning previously cached data');
        preRefreshCache.source = 'worker-stale';
        return preRefreshCache;
      }

      throw new WorkerPendingError('VPS worker job queued but cache not ready yet');

    } catch (error) {
      console.error(`[VPSWorker] Failed to get data for ${imdbUserId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const vpsWorkerClient = new VPSWorkerClient();
