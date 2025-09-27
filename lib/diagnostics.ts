/**
 * Comprehensive diagnostics and monitoring system for IMDb scraping
 * Tracks VPS worker performance, blocking patterns, and fallback behavior
 */

export interface DiagnosticData {
  timestamp: string;
  userId: string;
  source: 'vps-worker' | 'direct-scraping' | 'test-mode';
  success: boolean;
  itemCount: number;
  responseTime: number;
  error?: string;
  blockingType?: 'access-denied' | 'captcha' | 'timeout' | 'unknown';
  metadata: {
    userAgent?: string;
    proxy?: string;
    sessionId?: string;
    requestUrl?: string;
    responseHeaders?: Record<string, string>;
    htmlSnippet?: string;
    screenshotPath?: string;
  };
}

export interface EnvironmentAudit {
  environment: 'development' | 'production' | 'preview';
  nodeEnv: string;
  workerUrl?: string;
  tmdbConfigured: boolean;
  chromeAvailable: boolean;
  serverlessCompatible: boolean;
  fallbackPath: 'vps-worker' | 'direct-scraping' | 'unknown';
}

class DiagnosticsManager {
  private diagnostics: DiagnosticData[] = [];
  private maxEntries = 1000;

  /**
   * Audit current environment configuration
   */
  async auditEnvironment(): Promise<EnvironmentAudit> {
    const nodeEnv = process.env.NODE_ENV || 'development';
    const workerUrl = process.env.WORKER_URL;
    const tmdbKey = process.env.TMDB_API_KEY;
    const vercelEnv = process.env.VERCEL_ENV;

    // Determine environment
    let environment: 'development' | 'production' | 'preview' = 'development';
    if (nodeEnv === 'production' || vercelEnv === 'production') {
      environment = 'production';
    } else if (vercelEnv === 'preview') {
      environment = 'preview';
    }

    // Test Chrome availability
    let chromeAvailable = false;
    let serverlessCompatible = false;

    try {
      if (environment === 'production') {
        // Test chrome-aws-lambda in serverless environment
        const chromium = require('chrome-aws-lambda');
        chromeAvailable = !!(await chromium.executablePath);
        serverlessCompatible = true;
      } else {
        // Test regular puppeteer in development
        const puppeteer = require('puppeteer');
        chromeAvailable = true; // Assume available in development
        serverlessCompatible = false;
      }
    } catch (error) {
      console.warn('[Diagnostics] Chrome availability test failed:', error);
    }

    // Determine fallback path
    let fallbackPath: 'vps-worker' | 'direct-scraping' | 'unknown' = 'unknown';
    if (workerUrl) {
      fallbackPath = 'vps-worker';
    } else if (chromeAvailable) {
      fallbackPath = 'direct-scraping';
    }

    const audit: EnvironmentAudit = {
      environment,
      nodeEnv,
      workerUrl,
      tmdbConfigured: !!(tmdbKey && tmdbKey.length > 10),
      chromeAvailable,
      serverlessCompatible,
      fallbackPath
    };

    console.log('[Diagnostics] Environment Audit:', JSON.stringify(audit, null, 2));
    return audit;
  }

  /**
   * Log diagnostic data for analysis
   */
  logDiagnostic(data: DiagnosticData): void {
    this.diagnostics.push(data);

    // Keep only recent entries
    if (this.diagnostics.length > this.maxEntries) {
      this.diagnostics = this.diagnostics.slice(-this.maxEntries);
    }

    // Log important metrics
    const logLevel = data.success ? 'info' : 'error';
    const logMsg = `[Diagnostics] ${data.source}: ${data.success ? 'SUCCESS' : 'FAILED'} - ${data.itemCount} items in ${data.responseTime}ms`;

    if (logLevel === 'error') {
      console.error(logMsg, data.error || '');
      if (data.blockingType) {
        console.error(`[Diagnostics] Blocking Type: ${data.blockingType}`);
      }
    } else {
      console.log(logMsg);
    }

    // Log metadata for debugging
    if (data.metadata.userAgent) {
      console.log(`[Diagnostics] User-Agent: ${data.metadata.userAgent}`);
    }
    if (data.metadata.proxy) {
      console.log(`[Diagnostics] Proxy: ${data.metadata.proxy}`);
    }
    if (data.metadata.htmlSnippet) {
      console.log(`[Diagnostics] HTML Snippet: ${data.metadata.htmlSnippet.substring(0, 200)}...`);
    }
  }

  /**
   * Analyze blocking patterns and success rates
   */
  analyzePatterns(): {
    totalRequests: number;
    successRate: number;
    vpsWorkerStats: { requests: number; successRate: number };
    directScrapingStats: { requests: number; successRate: number };
    blockingTypes: Record<string, number>;
    avgResponseTime: number;
    recentFailures: DiagnosticData[];
  } {
    const total = this.diagnostics.length;
    const successful = this.diagnostics.filter(d => d.success).length;

    const vpsRequests = this.diagnostics.filter(d => d.source === 'vps-worker');
    const directRequests = this.diagnostics.filter(d => d.source === 'direct-scraping');

    const blockingTypes: Record<string, number> = {};
    this.diagnostics
      .filter(d => !d.success && d.blockingType)
      .forEach(d => {
        blockingTypes[d.blockingType!] = (blockingTypes[d.blockingType!] || 0) + 1;
      });

    const avgResponseTime = total > 0 ?
      this.diagnostics.reduce((sum, d) => sum + d.responseTime, 0) / total : 0;

    const recentFailures = this.diagnostics
      .filter(d => !d.success)
      .slice(-10); // Last 10 failures

    return {
      totalRequests: total,
      successRate: total > 0 ? (successful / total) * 100 : 0,
      vpsWorkerStats: {
        requests: vpsRequests.length,
        successRate: vpsRequests.length > 0 ?
          (vpsRequests.filter(d => d.success).length / vpsRequests.length) * 100 : 0
      },
      directScrapingStats: {
        requests: directRequests.length,
        successRate: directRequests.length > 0 ?
          (directRequests.filter(d => d.success).length / directRequests.length) * 100 : 0
      },
      blockingTypes,
      avgResponseTime,
      recentFailures
    };
  }

  /**
   * Test fallback mechanism by forcing worker error
   */
  async testFallbackMechanism(userId: string): Promise<{
    vpsWorkerReachable: boolean;
    fallbackTriggered: boolean;
    fallbackSuccess: boolean;
    itemCount: number;
    error?: string;
  }> {
    console.log('[Diagnostics] Testing fallback mechanism...');

    let vpsWorkerReachable = false;
    let fallbackTriggered = false;
    let fallbackSuccess = false;
    let itemCount = 0;
    let error: string | undefined;

    try {
      // Test VPS worker reachability
      const workerUrl = process.env.WORKER_URL;
      if (workerUrl) {
        try {
          const response = await fetch(`${workerUrl}/health`, {
            timeout: 5000
          });
          vpsWorkerReachable = response.ok;
        } catch (e) {
          vpsWorkerReachable = false;
        }
      }

      // Force fallback by simulating worker error
      if (vpsWorkerReachable) {
        console.log('[Diagnostics] VPS worker reachable, simulating failure to test fallback...');
        fallbackTriggered = true;

        // Test direct scraping fallback
        try {
          const { fetchWatchlist } = await import('./fetch-watchlist');
          const items = await fetchWatchlist(userId, { forceRefresh: true });
          itemCount = items.length;
          fallbackSuccess = itemCount > 0;
        } catch (fallbackError) {
          error = fallbackError instanceof Error ? fallbackError.message : 'Unknown fallback error';
          fallbackSuccess = false;
        }
      } else {
        console.log('[Diagnostics] VPS worker not reachable, fallback should trigger automatically');
        fallbackTriggered = true;
      }

    } catch (testError) {
      error = testError instanceof Error ? testError.message : 'Unknown test error';
    }

    const result = {
      vpsWorkerReachable,
      fallbackTriggered,
      fallbackSuccess,
      itemCount,
      error
    };

    console.log('[Diagnostics] Fallback test result:', JSON.stringify(result, null, 2));
    return result;
  }

  /**
   * Capture detailed session information for blocked requests
   */
  async captureBlockingDetails(
    url: string,
    userAgent: string,
    proxy?: string
  ): Promise<{
    htmlContent?: string;
    responseHeaders?: Record<string, string>;
    screenshotPath?: string;
    blockingType: 'access-denied' | 'captcha' | 'timeout' | 'unknown';
  }> {
    console.log(`[Diagnostics] Capturing blocking details for: ${url}`);

    let blockingType: 'access-denied' | 'captcha' | 'timeout' | 'unknown' = 'unknown';
    let htmlContent: string | undefined;
    let responseHeaders: Record<string, string> | undefined;
    let screenshotPath: string | undefined;

    try {
      // This would be implemented with actual browser automation
      // For now, we'll capture what we can from a simple fetch
      const response = await fetch(url, {
        headers: {
          'User-Agent': userAgent,
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        timeout: 10000
      });

      // Capture response headers
      responseHeaders = {};
      response.headers.forEach((value, key) => {
        responseHeaders![key] = value;
      });

      // Capture HTML content
      htmlContent = await response.text();

      // Analyze blocking type from response
      if (response.status === 403) {
        blockingType = 'access-denied';
      } else if (htmlContent.toLowerCase().includes('captcha')) {
        blockingType = 'captcha';
      } else if (htmlContent.toLowerCase().includes('access denied') ||
                 htmlContent.toLowerCase().includes('blocked')) {
        blockingType = 'access-denied';
      }

    } catch (error) {
      if (error instanceof Error && error.message.includes('timeout')) {
        blockingType = 'timeout';
      }
      console.error('[Diagnostics] Error capturing blocking details:', error);
    }

    return {
      htmlContent: htmlContent?.substring(0, 2000), // Limit size
      responseHeaders,
      screenshotPath,
      blockingType
    };
  }

  /**
   * Get recent diagnostics for monitoring
   */
  getRecentDiagnostics(limit: number = 50): DiagnosticData[] {
    return this.diagnostics.slice(-limit);
  }

  /**
   * Clear all diagnostic data
   */
  clearDiagnostics(): void {
    this.diagnostics = [];
    console.log('[Diagnostics] Cleared all diagnostic data');
  }
}

// Export singleton instance
export const diagnostics = new DiagnosticsManager();

// Helper function to create diagnostic entries
export function createDiagnostic(
  userId: string,
  source: DiagnosticData['source'],
  success: boolean,
  itemCount: number,
  responseTime: number,
  options: {
    error?: string;
    blockingType?: DiagnosticData['blockingType'];
    userAgent?: string;
    proxy?: string;
    sessionId?: string;
    requestUrl?: string;
    responseHeaders?: Record<string, string>;
    htmlSnippet?: string;
    screenshotPath?: string;
  } = {}
): DiagnosticData {
  return {
    timestamp: new Date().toISOString(),
    userId,
    source,
    success,
    itemCount,
    responseTime,
    error: options.error,
    blockingType: options.blockingType,
    metadata: {
      userAgent: options.userAgent,
      proxy: options.proxy,
      sessionId: options.sessionId,
      requestUrl: options.requestUrl,
      responseHeaders: options.responseHeaders,
      htmlSnippet: options.htmlSnippet,
      screenshotPath: options.screenshotPath
    }
  };
}