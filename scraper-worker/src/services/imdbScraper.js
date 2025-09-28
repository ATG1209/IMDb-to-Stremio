import { chromium } from 'playwright';
import crypto from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import { logger } from '../utils/logger.js';
import { tmdbService } from './tmdbService.js';
import { sessionManager } from './sessionManager.js';

class ImdbBlockError extends Error {
  constructor(message, meta = {}) {
    super(message);
    this.name = 'ImdbBlockError';
    this.code = 'IMDB_BLOCKED';
    this.meta = meta;
  }
}

const DEFAULT_LAUNCH_ARGS = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--disable-gpu',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--window-size=1920,1080'
];

const DEFAULT_HEADERS = {
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  DNT: '1',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1'
};

const USER_AGENT_POOL = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.184 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.216 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2.1 Safari/605.1.15',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_1_1) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.139 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 11_7_10) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.129 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.140 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.110 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.200 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.122 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.152 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.5845.140 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.5790.171 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 12_6_9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.122 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5_2) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.149 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_3_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15',
  'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0',
  'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:119.0) Gecko/20100101 Firefox/119.0',
  'Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.6045.105 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.216 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.3 Safari/605.1.15',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/117.0.5938.89 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 13; SM-S908B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.210 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.6167.178 Mobile Safari/537.36',
  'Mozilla/5.0 (Linux; Android 14; Pixel 7 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.5993.90 Mobile Safari/537.36',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (iPad; CPU OS 17_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Mobile/15E148 Safari/604.1',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/121.0.2277.128 Chrome/121.0.6167.140 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edg/120.0.2210.144 Chrome/120.0.6099.129 Safari/537.36'
];

const LANGUAGE_PROFILES = [
  ['en-US', 'en'],
  ['en-GB', 'en'],
  ['en-CA', 'en'],
  ['en-AU', 'en'],
  ['fr-FR', 'fr', 'en'],
  ['es-ES', 'es', 'en'],
  ['de-DE', 'de', 'en'],
  ['it-IT', 'it', 'en'],
  ['pt-BR', 'pt-BR', 'pt', 'en'],
  ['nl-NL', 'nl', 'en'],
  ['sv-SE', 'sv', 'en'],
  ['pl-PL', 'pl', 'en'],
  ['da-DK', 'da', 'en']
];

const TIMEZONES = [
  'America/New_York',
  'America/Los_Angeles',
  'America/Toronto',
  'America/Sao_Paulo',
  'Europe/Amsterdam',
  'Europe/London',
  'Europe/Berlin',
  'Europe/Paris',
  'Europe/Madrid',
  'Europe/Prague',
  'Europe/Rome',
  'Asia/Tokyo',
  'Asia/Singapore',
  'Asia/Hong_Kong',
  'Australia/Sydney'
];

const VIEWPORTS = [
  { width: 1920, height: 1080 },
  { width: 1600, height: 900 },
  { width: 1536, height: 864 },
  { width: 1440, height: 900 },
  { width: 1366, height: 768 },
  { width: 1280, height: 720 }
];

const WARMUP_URLS = [
  'https://www.google.com/?hl=en',
  'https://www.imdb.com/?ref_=nv_home'
];

const BLOCK_PATTERNS = [
  /Access Denied/i,
  /Request blocked/i,
  /unusual traffic/i,
  /captcha/i,
  /robot check/i,
  /forbidden/i,
  /not authorized/i,
  /px-captcha/i,
  /amicontent/i
];

const MAX_NAVIGATION_TIMEOUT = parseInt(process.env.SCRAPER_NAV_TIMEOUT || '60000', 10);

function randomChoice(items) {
  if (!items || items.length === 0) {
    return null;
  }
  const index = Math.floor(Math.random() * items.length);
  return items[index];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function uniqueSequence(values) {
  const seen = new Set();
  const sequence = [];
  values.forEach(value => {
    if (!seen.has(value)) {
      seen.add(value);
      sequence.push(value);
    }
  });
  return sequence;
}

function parseProxyEntry(entry) {
  const value = entry.trim();
  if (!value) {
    return null;
  }

  const formatted = value.startsWith('http') ? value : `http://${value}`;
  try {
    const url = new URL(formatted);
    const hostPort = `${url.hostname}:${url.port || '80'}`;
    const id = crypto.createHash('sha1').update(hostPort).digest('hex').slice(0, 8);

    return {
      server: `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ''}`,
      username: url.username || undefined,
      password: url.password || undefined,
      id,
      mask: hostPort
    };
  } catch (error) {
    logger.warn('Skipping invalid proxy entry', { entry });
    return null;
  }
}

function parseProxyList(raw) {
  if (!raw) {
    return [];
  }

  const tokens = raw
    .split(/\r?\n|,/)
    .map(token => token.trim())
    .filter(Boolean);

  const proxies = tokens
    .map(parseProxyEntry)
    .filter(Boolean);

  if (proxies.length === 0) {
    logger.warn('Proxy list configured but no valid proxies parsed');
  }

  return proxies;
}

async function waitFor(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export class ImdbScraper {
  constructor() {
    this.browser = null;
    this.context = null;
    this.page = null;
    this.currentProfile = null;
    this.proxyPool = parseProxyList(process.env.RESIDENTIAL_PROXY_LIST || process.env.IMDB_PROXY_LIST || '');
    this.lastProxyId = null;
    this.maxAttempts = parseInt(process.env.SCRAPER_MAX_ATTEMPTS || '4', 10);
    this.keepBrowserOpen = process.env.SCRAPER_KEEP_BROWSER === '1';
    this.debugDir = process.env.SCRAPER_DEBUG_DIR || null;
    this.minItemsThreshold = parseInt(process.env.SCRAPER_MIN_ITEMS_THRESHOLD || '10', 10);
  }

  async initialize() {
    await this.rotateSession({ attempt: 1, reason: 'initialization' });
  }

  async rotateSession({ attempt, reason }) {
    await this.cleanup();

    const profile = this.buildStealthProfile(attempt);
    this.currentProfile = profile;

    const launchOptions = {
      headless: true,
      args: DEFAULT_LAUNCH_ARGS
    };

    if (profile.proxy) {
      launchOptions.proxy = {
        server: profile.proxy.server,
        username: profile.proxy.username,
        password: profile.proxy.password
      };
    }

    logger.info('Launching Chromium with stealth profile', {
      attempt,
      reason,
      proxy: profile.proxy ? profile.proxy.mask : 'direct',
      timezone: profile.timezone,
      locale: profile.locale,
      userAgent: profile.userAgent
    });

    this.browser = await chromium.launch(launchOptions);

    const storageState = await sessionManager.load(profile.sessionKey);

    const contextOptions = {
      viewport: profile.viewport,
      userAgent: profile.userAgent,
      locale: profile.locale,
      timezoneId: profile.timezone,
      extraHTTPHeaders: {
        ...DEFAULT_HEADERS,
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-User': '?1',
        'Sec-Fetch-Dest': 'document'
      }
    };

    if (storageState) {
      contextOptions.storageState = storageState;
    }

    this.context = await this.browser.newContext(contextOptions);

    await this.context.addInitScript(({ fingerprint }) => {
      const override = (key, value) => {
        try {
          Object.defineProperty(navigator, key, {
            get: () => value,
            configurable: true
          });
        } catch (_) {
          navigator[key] = value;
        }
      };

      // Basic navigator overrides
      override('webdriver', undefined);
      override('languages', fingerprint.languages);
      override('platform', fingerprint.platform);
      override('hardwareConcurrency', fingerprint.hardwareConcurrency);
      override('deviceMemory', fingerprint.deviceMemory);
      override('maxTouchPoints', fingerprint.maxTouchPoints);

      // Enhanced stealth: Remove automation indicators
      delete window.navigator.__proto__.webdriver;
      delete window.navigator.webdriver;

      // Override chrome runtime detection
      window.chrome = {
        runtime: {
          onConnect: undefined,
          onMessage: undefined
        }
      };

      // Canvas fingerprinting randomization
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, attributes) {
        if (type === '2d') {
          const context = getContext.call(this, type, attributes);
          const imageData = context.getImageData;
          context.getImageData = function(...args) {
            const result = imageData.apply(this, args);
            // Add minimal noise to canvas fingerprint
            for (let i = 0; i < result.data.length; i += 4) {
              if (Math.random() < 0.001) {
                result.data[i] = (result.data[i] + Math.floor(Math.random() * 3) - 1) % 256;
              }
            }
            return result;
          };
          return context;
        }
        return getContext.call(this, type, attributes);
      };

      // WebGL fingerprinting randomization
      const getParameter = WebGLRenderingContext.prototype.getParameter;
      WebGLRenderingContext.prototype.getParameter = function(parameter) {
        // Randomize WebGL vendor and renderer
        if (parameter === 37445) {
          return fingerprint.webglVendor || 'Intel Inc.';
        }
        if (parameter === 37446) {
          return fingerprint.webglRenderer || 'Intel Iris OpenGL Engine';
        }
        return getParameter.call(this, parameter);
      };

      // Screen and timing fingerprinting
      Object.defineProperty(screen, 'availWidth', {
        get: () => fingerprint.screenWidth || 1920
      });
      Object.defineProperty(screen, 'availHeight', {
        get: () => fingerprint.screenHeight || 1080
      });
      Object.defineProperty(screen, 'colorDepth', {
        get: () => fingerprint.colorDepth || 24
      });

      // Performance timing randomization
      const originalNow = performance.now;
      performance.now = function() {
        return originalNow.call(this) + Math.random() * 0.1;
      };

      // Remove playwright indicators
      delete window.__playwright;
      delete window._playwright;
      delete window.playwright;

      // Plugin array spoofing
      Object.defineProperty(navigator, 'plugins', {
        get: () => fingerprint.plugins || []
      });

      // Permissions API
      const originalPermissions = window.navigator.permissions && window.navigator.permissions.query;
      if (originalPermissions) {
        window.navigator.permissions.query = parameters => (
          parameters && parameters.name === 'notifications'
            ? Promise.resolve({ state: 'denied' })
            : originalPermissions(parameters)
        );
      }
    }, {
      fingerprint: {
        languages: profile.languages,
        platform: profile.platform,
        hardwareConcurrency: profile.hardwareConcurrency,
        deviceMemory: profile.deviceMemory,
        maxTouchPoints: profile.maxTouchPoints,
        webglVendor: profile.webglVendor,
        webglRenderer: profile.webglRenderer,
        screenWidth: profile.viewport.width,
        screenHeight: profile.viewport.height,
        colorDepth: profile.colorDepth,
        plugins: profile.plugins
      }
    });

    this.page = await this.context.newPage();
    this.page.setDefaultTimeout(MAX_NAVIGATION_TIMEOUT);
    this.page.setDefaultNavigationTimeout(MAX_NAVIGATION_TIMEOUT);
  }

  buildStealthProfile(attempt) {
    const userAgent = randomChoice(USER_AGENT_POOL);
    const viewport = randomChoice(VIEWPORTS) || { width: 1920, height: 1080 };
    // FORCE ENGLISH: Always use English locale to prevent French titles
    const languages = ['en-US', 'en']; // Force English instead of random choice
    const timezone = randomChoice(TIMEZONES) || 'America/New_York';
    const locale = 'en-US'; // Force en-US locale

    let platform = 'Win32';
    if (userAgent.includes('Macintosh') || userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      platform = 'MacIntel';
    } else if (userAgent.includes('Linux') && !userAgent.includes('Android')) {
      platform = 'Linux x86_64';
    } else if (userAgent.includes('Android')) {
      platform = 'Linux armv8l';
    }

    const hardwareConcurrency = randomChoice([4, 6, 8, 12]);
    const deviceMemory = randomChoice([4, 8, 16]);
    const maxTouchPoints = userAgent.includes('Mobile') || userAgent.includes('iPhone') ? randomChoice([2, 3, 5]) : 0;

    // Enhanced fingerprinting properties
    const webglVendors = ['Intel Inc.', 'AMD', 'NVIDIA Corporation', 'Microsoft Corporation'];
    const webglRenderers = [
      'Intel Iris OpenGL Engine',
      'Intel(R) UHD Graphics 630',
      'AMD Radeon Pro 555 OpenGL Engine',
      'NVIDIA GeForce GTX 1060',
      'ANGLE (Intel, Intel(R) UHD Graphics 630 Direct3D11 vs_5_0 ps_5_0)'
    ];
    const webglVendor = randomChoice(webglVendors);
    const webglRenderer = randomChoice(webglRenderers);
    const colorDepth = randomChoice([24, 32]);

    // Basic plugin simulation
    const plugins = platform.includes('Mac') ? [
      { name: 'PDF Viewer', description: 'PDF Viewer' },
      { name: 'Chrome PDF Viewer', description: 'Portable Document Format' }
    ] : [
      { name: 'PDF Viewer', description: 'PDF Viewer' },
      { name: 'Chrome PDF Plugin', description: 'Portable Document Format' },
      { name: 'Native Client', description: 'Native Client' }
    ];

    const proxy = this.selectProxy(attempt);
    const sessionKey = proxy ? `proxy-${proxy.id}` : 'direct';

    const viewSequence = uniqueSequence([
      randomChoice(['detail', 'grid', 'simple']),
      'detail',
      'grid'
    ]);

    const sortOrder = randomChoice(['created:desc', 'date_added:desc', 'user_rating:desc']) || 'created:desc';

    return {
      userAgent,
      viewport,
      languages,
      timezone,
      locale,
      platform,
      hardwareConcurrency,
      deviceMemory,
      maxTouchPoints,
      webglVendor,
      webglRenderer,
      colorDepth,
      plugins,
      proxy,
      sessionKey,
      viewSequence,
      sortOrder
    };
  }

  selectProxy(attempt) {
    if (!this.proxyPool || this.proxyPool.length === 0) {
      return null;
    }

    if (this.proxyPool.length === 1) {
      this.lastProxyId = this.proxyPool[0].id;
      return this.proxyPool[0];
    }

    const available = this.proxyPool.filter(proxy => proxy.id !== this.lastProxyId);
    const choice = randomChoice(available.length > 0 ? available : this.proxyPool);
    this.lastProxyId = choice.id;
    logger.info('Selected residential proxy', { attempt, proxy: choice.mask });
    return choice;
  }

  async warmUpSession(profile) {
    for (const url of WARMUP_URLS) {
      try {
        await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        await waitFor(randomInt(600, 1200));
      } catch (error) {
        logger.debug('Warm-up navigation failed', { url, error: error.message });
      }
    }

    // IMDb specific warmup to set cookies before hitting watchlist
    try {
      await this.page.goto('https://www.imdb.com/offsite/?page-action=ft-generic', {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });
      await waitFor(randomInt(500, 900));
    } catch (error) {
      logger.debug('IMDb warm-up failed', { error: error.message });
    }
  }

  async scrapeWatchlist(userId) {
    if (!this.browser || !this.page) {
      await this.rotateSession({ attempt: 1, reason: 'first-run' });
    }

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      try {
        if (!this.browser || !this.page) {
          await this.rotateSession({ attempt, reason: `retry-${attempt}` });
        }

        logger.info('Starting watchlist extraction', {
          userId,
          attempt,
          proxy: this.currentProfile?.proxy ? this.currentProfile.proxy.mask : 'direct'
        });

        await this.warmUpSession(this.currentProfile);
        await waitFor(randomInt(400, 900));

        const items = await this.performExtraction(userId, attempt);

        if (!items || items.length === 0 || items.length < this.minItemsThreshold) {
          throw new ImdbBlockError('Extraction returned insufficient items', {
            userId,
            itemCount: items ? items.length : 0
          });
        }

        // Persist storage state for the current proxy/session
        const storageState = await this.context.storageState();
        await sessionManager.save(this.currentProfile.sessionKey, storageState);

        if (!this.keepBrowserOpen) {
          await this.cleanup();
        }

        logger.info('Watchlist extraction completed', {
          userId,
          itemCount: items.length,
          attempt
        });

        return items;

      } catch (error) {
        const isBlock = error instanceof ImdbBlockError || error.code === 'IMDB_BLOCKED';
        logger.warn('Watchlist extraction attempt failed', {
          attempt,
          userId,
          reason: error.message,
          blocked: isBlock,
          proxy: this.currentProfile?.proxy ? this.currentProfile.proxy.mask : 'direct'
        });

        await this.captureDiagnostics(`attempt-${attempt}`, error);

        await this.cleanup();

        if (attempt === this.maxAttempts) {
          throw error;
        }
      }
    }

    throw new Error('Failed to scrape watchlist after maximum retries');
  }

  async performExtraction(userId, attempt) {
    const allItems = [];
    const seenIds = new Set();

    for (const view of this.currentProfile.viewSequence) {
      logger.info(`Starting extraction for ${view} view`);

      const pageOneItems = await this.extractPage({ userId, pageNumber: 1, view, attempt });
      logger.info(`Page 1 (${view}): Found ${pageOneItems.length} items`);
      this.mergeItems(allItems, seenIds, pageOneItems);

      // PAGINATION FIX: Removed 250-item limit to enable page 2 extraction
      // Previously: if (allItems.length >= 250) { break; }

      const pageTwoItems = await this.extractPage({ userId, pageNumber: 2, view, attempt });
      logger.info(`Page 2 (${view}): Found ${pageTwoItems.length} items`);
      this.mergeItems(allItems, seenIds, pageTwoItems);

      logger.info(`Total after ${view}: ${allItems.length} unique items`);

      if (allItems.length > 0) {
        logger.info(`Breaking early - found ${allItems.length} items with ${view} view`);
        break;
      }
    }

    logger.info('Extraction summary', {
      userId,
      uniqueItems: allItems.length
    });

    allItems.reverse();

    await this.enhanceWithTmdb(allItems);

    return allItems;
  }

  mergeItems(target, seenIds, items) {
    for (const item of items) {
      if (!seenIds.has(item.imdbId)) {
        seenIds.add(item.imdbId);
        target.push(item);
      }
    }
  }

  async extractPage({ userId, pageNumber, view, attempt }) {
    const baseUrl = `https://www.imdb.com/user/${userId}/watchlist`;
    const params = new URLSearchParams();
    params.set('sort', this.currentProfile.sortOrder);
    params.set('view', view);
    params.set('ref_', 'watchlist&language=en-US'); // Force English language
    if (pageNumber > 1) {
      params.set('page', String(pageNumber));
    }

    const url = `${baseUrl}?${params.toString()}`;
    const label = `page-${pageNumber}-${view}`;

    logger.info('Navigating to watchlist page', { url, label, attempt });

    // Add small random delay to appear more human
    await new Promise(resolve => setTimeout(resolve, Math.random() * 1000 + 500));

    const response = await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: MAX_NAVIGATION_TIMEOUT
    });

    if (response && !response.ok()) {
      throw new ImdbBlockError(`HTTP ${response.status()} for ${label}`, {
        status: response.status(),
        statusText: response.statusText(),
        url
      });
    }

    await waitFor(randomInt(800, 1300));

    const blockReason = await this.detectBlocking(label);
    if (blockReason) {
      throw new ImdbBlockError(blockReason, { label, url });
    }

    const pageOffset = pageNumber === 1 ? 0 : 250;
    const items = await this.extractItemsFromCurrentPage(label, pageOffset);

    if (!items || items.length === 0) {
      logger.warn('Extraction returned zero items', { label, url });
      await waitFor(randomInt(400, 700));
      const retryItems = await this.extractItemsFromCurrentPage(`${label}-retry`, pageOffset);
      if (!retryItems || retryItems.length === 0) {
        const postCheck = await this.detectBlocking(`${label}-post`);
        if (postCheck) {
          throw new ImdbBlockError(postCheck, { label, url, stage: 'post-extraction' });
        }
      } else {
        return retryItems;
      }
    }

    return items;
  }

  async detectBlocking(stage) {
    try {
      const url = this.page.url();
      if (/register|signin|login/.test(url)) {
        return `Redirected to sign-in (${url})`;
      }

      const bodySnapshot = await this.page.evaluate(() => {
        const payload = {
          title: document.title || '',
          text: document.body ? document.body.innerText.slice(0, 5000) : ''
        };
        return payload;
      });

      if (bodySnapshot.title && /captcha|access denied|blocked/i.test(bodySnapshot.title)) {
        return `Blocked by title indicator (${bodySnapshot.title})`;
      }

      if (bodySnapshot.text) {
        const hit = BLOCK_PATTERNS.find(pattern => pattern.test(bodySnapshot.text));
        if (hit) {
          return `Blocked by body indicator (${hit})`;
        }
      }

      const captchaDetected = await this.page.$('input[name="captcha"]') || await this.page.$('[id*="captcha"], [class*="captcha"]');
      if (captchaDetected) {
        return 'CAPTCHA detected on page';
      }

      return null;
    } catch (error) {
      logger.warn('Block detection failed', { stage, error: error.message });
      return null;
    }
  }

  async extractItemsFromCurrentPage(sortName, pageOffset = 0) {
    logger.info('Extracting items from current page', { sortName, pageOffset });

    try {
      await this.page.evaluate(async () => {
        const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
        let stableRounds = 0;
        let previousCount = 0;

        for (let i = 0; i < 30; i++) {
          window.scrollTo(0, document.body.scrollHeight);
          await sleep(600 + Math.random() * 400);
          const count = Math.max(
            document.querySelectorAll('.lister-item').length,
            document.querySelectorAll('.ipc-poster-card').length,
            document.querySelectorAll('a[href*="/title/"]').length
          );

          if (count === previousCount) {
            stableRounds += 1;
          } else {
            stableRounds = 0;
          }

          previousCount = count;

          if (stableRounds >= 3 || count >= 300) {
            break;
          }
        }

        window.scrollTo(0, 0);
        await sleep(1000 + Math.random() * 500);
      });
    } catch (error) {
      logger.warn('Smooth scrolling failed', { sortName, error: error.message });
    }

    const items = await this.page.evaluate((offset) => {
      const normalize = (entry, index) => {
        if (!entry || !entry.imdbId || !entry.title) {
          return null;
        }

        const addedAt = new Date(Date.now() - (offset + index) * 850).toISOString();

        return {
          imdbId: entry.imdbId,
          title: entry.title,
          year: entry.year || undefined,
          type: entry.type === 'tv' ? 'tv' : 'movie',
          poster: entry.poster || undefined,
          imdbRating: entry.imdbRating || 0,
          numRatings: entry.numRatings || 0,
          runtime: entry.runtime || 0,
          popularity: entry.popularity || 0,
          userRating: entry.userRating || 0,
          addedAt
        };
      };

      const scrubText = (text = '') => text.replace(/\s+/g, ' ').trim();

      const listerItems = Array.from(document.querySelectorAll('.lister-item')).map(el => {
        try {
          const anchor = el.querySelector('h3 a[href*="/title/"]');
          const href = anchor ? anchor.getAttribute('href') || '' : '';
          const idMatch = href.match(/tt\d+/);
          const title = scrubText(anchor ? anchor.textContent || '' : '');
          const yearNode = el.querySelector('.lister-item-year, .secondaryInfo');
          const yearText = scrubText(yearNode ? yearNode.textContent || '' : '');
          const yearMatch = yearText.match(/(19|20)\d{2}/);
          const img = el.querySelector('img[src]');
          const text = (el.textContent || '').toLowerCase();
          const type = text.includes('tv series') || text.includes('mini series') || text.includes('series') ? 'tv' : 'movie';
          const ratingNode = el.querySelector('.ratings-bar .inline-block strong');
          const imdbRating = ratingNode ? parseFloat(scrubText(ratingNode.textContent || '0')) || 0 : 0;

          if (!idMatch || !title) {
            return null;
          }

          return {
            imdbId: idMatch[0],
            title,
            year: yearMatch ? yearMatch[0] : undefined,
            type,
            poster: img ? img.src : undefined,
            imdbRating
          };
        } catch (error) {
          return null;
        }
      }).filter(Boolean);

      const linkItems = Array.from(document.querySelectorAll('a[href*="/title/"]')).map(anchor => {
        const href = anchor.getAttribute('href') || anchor.href || '';
        const idMatch = href.match(/tt\d+/);
        const title = scrubText(anchor.textContent || '');
        if (!idMatch || title.length < 2) {
          return null;
        }

        const container = anchor.closest('li, .titleColumn, .cli-item, [class*="item"]');
        const containerText = container ? (container.textContent || '').toLowerCase() : '';
        const yearMatch = container ? (container.textContent || '').match(/(19|20)\d{2}/) : null;

        return {
          imdbId: idMatch[0],
          title,
          year: yearMatch ? yearMatch[0] : undefined,
          type: containerText.includes('series') || containerText.includes('tv') ? 'tv' : 'movie'
        };
      }).filter(Boolean);

      const uniqueLinks = [];
      const linkSeen = new Set();
      for (const entry of linkItems) {
        if (!linkSeen.has(entry.imdbId)) {
          linkSeen.add(entry.imdbId);
          uniqueLinks.push(entry);
        }
      }

      const bestSource = listerItems.length >= uniqueLinks.length ? listerItems : uniqueLinks;
      const normalized = bestSource
        .map((entry, index) => normalize(entry, index))
        .filter(Boolean);

      return normalized;
    }, pageOffset);

    return items || [];
  }

  async enhanceWithTmdb(items) {
    if (!items || items.length === 0) {
      return;
    }

    try {
      const contentTypes = await tmdbService.detectContentTypeBatch(
        items.map(item => ({ title: item.title, year: item.year }))
      );

      const posters = await tmdbService.getPosterBatch(
        items.map(item => ({ title: item.title, year: item.year }))
      );

      items.forEach(item => {
        const key = `${item.title}_${item.year || 'unknown'}`;
        if (contentTypes.has(key)) {
          item.type = contentTypes.get(key);
        }
        if (posters.has(key) && !item.poster) {
          item.poster = posters.get(key);
        }
      });

      const posterCount = items.filter(item => item.poster).length;
      logger.info('TMDB enhancement applied', {
        total: items.length,
        posters: posterCount
      });

    } catch (error) {
      logger.warn('TMDB enhancement failed', { error: error.message });
    }
  }

  async captureDiagnostics(stage, error) {
    if (!this.debugDir) {
      return;
    }

    try {
      await fs.mkdir(this.debugDir, { recursive: true });
      const timestamp = Date.now();
      const baseName = `${stage}-${timestamp}`.replace(/[^a-z0-9_-]/gi, '_');

      if (this.page) {
        const screenshotPath = path.join(this.debugDir, `${baseName}.png`);
        const htmlPath = path.join(this.debugDir, `${baseName}.html`);

        await this.page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {});
        const html = await this.page.content();
        await fs.writeFile(htmlPath, html, 'utf-8');
      }

      const metaPath = path.join(this.debugDir, `${baseName}.json`);
      const meta = {
        stage,
        error: error ? error.message : null,
        code: error ? error.code : null,
        url: this.page ? this.page.url() : null,
        profile: this.currentProfile ? {
          proxy: this.currentProfile.proxy ? this.currentProfile.proxy.mask : 'direct',
          timezone: this.currentProfile.timezone,
          locale: this.currentProfile.locale,
          sortOrder: this.currentProfile.sortOrder
        } : null
      };
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');

    } catch (captureError) {
      logger.warn('Failed to capture diagnostics', { error: captureError.message });
    }
  }

  async cleanup() {
    try {
      if (this.page) {
        await this.page.close().catch(() => {});
        this.page = null;
      }
      if (this.context) {
        await this.context.close().catch(() => {});
        this.context = null;
      }
      if (this.browser) {
        await this.browser.close().catch(() => {});
        this.browser = null;
      }
    } catch (error) {
      logger.error('Error during browser cleanup', { error: error.message });
    }
  }
}
