// Client for communicating with the worker service

const WORKER_URL = process.env.WORKER_URL || 'http://localhost:3000';
const WORKER_SECRET = process.env.WORKER_SECRET;

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

export interface WorkerJobResult {
  totalItems: number;
  items: WorkerWatchlistItem[];
  lastUpdated: string;
  scrapedAt: string;
  processingTime: number;
}

export interface WorkerJob {
  id: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  result?: WorkerJobResult;
  error?: string;
  progress?: string;
}

class WorkerClient {
  private baseUrl: string;
  private secret: string | undefined;

  constructor() {
    this.baseUrl = WORKER_URL;
    this.secret = WORKER_SECRET;
  }

  private async makeRequest(path: string, options: RequestInit = {}) {
    if (!this.secret) {
      throw new Error('WORKER_SECRET not configured');
    }

    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.secret}`,
        'Content-Type': 'application/json',
        ...options.headers
      },
      timeout: options.timeout || 10000
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Worker API error: ${response.status} - ${errorText}`);
    }

    return response.json();
  }

  // Enqueue a sync job
  async enqueueSyncJob(imdbUserId: string, options: {
    forceRefresh?: boolean;
    callbackUrl?: string;
  } = {}) {
    return this.makeRequest('/jobs', {
      method: 'POST',
      body: JSON.stringify({
        imdbUserId,
        forceRefresh: options.forceRefresh || false,
        callbackUrl: options.callbackUrl
      })
    });
  }

  // Get job status
  async getJobStatus(jobId: string): Promise<WorkerJob> {
    return this.makeRequest(`/jobs/${jobId}`);
  }

  // Get latest cached result for a user
  async getLatestResult(imdbUserId: string): Promise<WorkerWatchlistItem[] | null> {
    try {
      // List recent jobs for this user
      const response = await this.makeRequest(`/jobs?imdbUserId=${imdbUserId}&limit=1`);
      const jobs = response.jobs || [];

      if (jobs.length === 0) {
        return null;
      }

      const latestJob = jobs[0];
      if (latestJob.status !== 'completed' || !latestJob.id) {
        return null;
      }

      // Get the full job details with result
      const jobDetails = await this.getJobStatus(latestJob.id);
      return jobDetails.result?.items || null;

    } catch (error) {
      console.warn('Failed to get latest result from worker:', error);
      return null;
    }
  }

  // Get watchlist with smart caching
  async getWatchlist(imdbUserId: string, options: {
    forceRefresh?: boolean;
    maxAgeHours?: number;
  } = {}): Promise<WorkerWatchlistItem[]> {
    const { forceRefresh = false, maxAgeHours = 12 } = options;

    if (!forceRefresh) {
      // Try to get cached result first
      const cachedResult = await this.getLatestResult(imdbUserId);
      if (cachedResult && cachedResult.length > 0) {
        // Check if it's fresh enough
        const latestItem = cachedResult[0];
        if (latestItem.addedAt) {
          const itemAge = Date.now() - new Date(latestItem.addedAt).getTime();
          const maxAge = maxAgeHours * 60 * 60 * 1000;

          if (itemAge < maxAge) {
            console.log(`[WorkerClient] Returning cached result for ${imdbUserId} (${cachedResult.length} items)`);
            return cachedResult;
          }
        }
      }
    }

    // Enqueue a fresh sync job
    console.log(`[WorkerClient] Enqueueing fresh sync for ${imdbUserId}`);
    const job = await this.enqueueSyncJob(imdbUserId, { forceRefresh });

    // If we got cached data immediately, return it
    if (job.cached && job.result) {
      return job.result.items || [];
    }

    // For new jobs, we need to wait or poll
    if (job.status === 'pending' || job.status === 'processing') {
      // For API endpoints, we should return empty array and let client poll
      // But for initial requests, try waiting a bit
      console.log(`[WorkerClient] Job ${job.jobId} is ${job.status}, checking for cached data...`);

      // Try to return any cached data we have while the new job processes
      const fallbackResult = await this.getLatestResult(imdbUserId);
      return fallbackResult || [];
    }

    return [];
  }

  // Health check
  async healthCheck() {
    try {
      const response = await fetch(`${this.baseUrl}/health`, {
        timeout: 5000
      });
      return response.ok;
    } catch {
      return false;
    }
  }
}

// Export singleton instance
export const workerClient = new WorkerClient();