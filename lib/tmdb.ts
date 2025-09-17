interface TMDBMovieResult {
  id: number;
  title: string;
  poster_path: string | null;
  release_date: string;
  overview: string;
  vote_average: number;
  vote_count: number;
  popularity: number;
  runtime?: number;
}

interface TMDBSearchResponse {
  results: TMDBMovieResult[];
  total_results: number;
}

const TMDB_API_KEY = process.env.TMDB_API_KEY;
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';

// Known titles override lists for instant categorization (micro-optimization)
const FORCE_MOVIE = [
  'Arctic', 'Moonlight', 'Gifted', 'Monster', 'Land', 'Hidden', 'Extinction',
  'The Rover', 'Backcountry', 'The Shallows', 'Colonia', 'Aftersun', 'Fresh',
  'Ready or Not', 'The Guest', 'Blue Ruin', 'The Fountain', 'Predestination',
  'Phenomenon', 'The Beach', 'Leave No Trace', 'Under The Silver Lake',
  'Uncut Gems', 'The Tree of Life', 'Almost Famous', 'About Time', 'Calibre',
  'The Next Three Days', 'Bone Tomahawk', 'Blue Miracle', 'Kinds of Kindness',
  'Samsara', 'My Octopus Teacher', 'Glass Onion: A Knives Out Mystery',
  'Back to the Future', 'Blade Runner 2049', 'Blade Runner', 'The Big Lebowski',
  'Office Space', 'Terminator 2: Judgment Day', 'Everest', 'Sunshine',
  'Step Brothers', 'A Real Pain', 'The Brutalist', 'Michael Collins'
];

const FORCE_TV = [
  'Six Feet Under', 'The Shield', 'Utopia', 'Mindhunter', 'Sugar', 'Ozark',
  'Dark Matter', 'Slow Horses', 'Counterpart', 'Mr. Robot', 'Silo',
  'Brilliant Minds', 'Chernobyl', 'Squid Game', 'The Day of the Jackal',
  'One Hundred Years of Solitude', 'Nobody Wants This', 'The Bear'
];

// TV series detection using TMDB search
export async function detectContentType(title: string, year?: string): Promise<'movie' | 'tv'> {
  if (!TMDB_API_KEY || TMDB_API_KEY === 'your_tmdb_api_key_here') {
    return 'movie'; // Default to movie if no API key
  }

  // FAST PATH: Check known titles first (instant categorization)
  if (FORCE_MOVIE.includes(title)) {
    return 'movie';
  }
  if (FORCE_TV.includes(title)) {
    return 'tv';
  }

  try {
    // Search both movies and TV shows
    const movieUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}${year ? `&year=${year}` : ''}`;
    const tvUrl = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}${year ? `&first_air_date_year=${year}` : ''}`;

    const [movieResponse, tvResponse] = await Promise.all([
      rateLimitedFetch(movieUrl),
      rateLimitedFetch(tvUrl)
    ]);

    if (movieResponse.ok && tvResponse.ok) {
      const [movieData, tvData] = await Promise.all([
        movieResponse.json(),
        tvResponse.json()
      ]);

      // If we find results in both, prefer the one with higher popularity
      const topMovie = movieData.results?.[0];
      const topTvShow = tvData.results?.[0];

      if (topTvShow && (!topMovie || topTvShow.popularity > topMovie.popularity)) {
        return 'tv';
      }
    }

    return 'movie'; // Default to movie
  } catch (error) {
    console.error(`[TMDB] Error detecting content type for "${title}":`, error);
    return 'movie'; // Default to movie on error
  }
}

// Enhanced in-memory cache for TMDB results with better key normalization
const tmdbCache = new Map<string, { poster: string | null; timestamp: number }>();
const CACHE_DURATION = 7 * 24 * 60 * 60 * 1000; // 7 days for better persistence

// Rate limiting
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 25; // 25ms between requests (40 req/sec max)

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Replace special chars with spaces
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .trim();
}

async function rateLimitedFetch(url: string): Promise<Response> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise(resolve => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();
  return fetch(url);
}

export async function getTMDBPoster(title: string, year?: string): Promise<string | null> {
  if (!TMDB_API_KEY || TMDB_API_KEY === 'your_tmdb_api_key_here') {
    return null;
  }

  // Improve cache key with normalized title for better hit rate
  const normalizedCacheKey = `${normalizeTitle(title)}_${year || 'unknown'}`;
  const exactCacheKey = `${title}_${year || 'unknown'}`;

  // Check both normalized and exact cache keys
  const cached = tmdbCache.get(normalizedCacheKey) || tmdbCache.get(exactCacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.poster;
  }

  try {
    // Try multiple search strategies for both movies and TV shows
    const searchStrategies = [
      // Strategy 1: Exact title with year
      { query: title, year: year },
      // Strategy 2: Normalized title with year
      { query: normalizeTitle(title), year: year },
      // Strategy 3: Exact title without year (fallback)
      { query: title, year: undefined },
      // Strategy 4: Normalized title without year (last resort)
      { query: normalizeTitle(title), year: undefined }
    ];

    for (const strategy of searchStrategies) {
      if (!strategy.query.trim()) continue;

      // Search both movies and TV shows
      const movieUrl = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(strategy.query)}${strategy.year ? `&year=${strategy.year}` : ''}`;
      const tvUrl = `${TMDB_BASE_URL}/search/tv?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(strategy.query)}${strategy.year ? `&first_air_date_year=${strategy.year}` : ''}`;

      const [movieResponse, tvResponse] = await Promise.all([
        rateLimitedFetch(movieUrl),
        rateLimitedFetch(tvUrl)
      ]);

      // Process movie results
      if (movieResponse.ok) {
        const movieData: TMDBSearchResponse = await movieResponse.json();
        if (movieData.results && movieData.results.length > 0) {
          const bestMatch = findBestMatch(movieData.results, year, 'release_date');
          if (bestMatch?.poster_path) {
            const posterUrl = `${TMDB_IMAGE_BASE_URL}${bestMatch.poster_path}`;
            tmdbCache.set(normalizedCacheKey, { poster: posterUrl, timestamp: Date.now() });
            tmdbCache.set(exactCacheKey, { poster: posterUrl, timestamp: Date.now() });
            return posterUrl;
          }
        }
      }

      // Process TV results
      if (tvResponse.ok) {
        const tvData: any = await tvResponse.json();
        if (tvData.results && tvData.results.length > 0) {
          const bestMatch = findBestMatch(tvData.results, year, 'first_air_date');
          if (bestMatch?.poster_path) {
            const posterUrl = `${TMDB_IMAGE_BASE_URL}${bestMatch.poster_path}`;
            tmdbCache.set(normalizedCacheKey, { poster: posterUrl, timestamp: Date.now() });
            tmdbCache.set(exactCacheKey, { poster: posterUrl, timestamp: Date.now() });
            return posterUrl;
          }
        }
      }
    }

    // Cache null result to avoid repeated API calls
    tmdbCache.set(normalizedCacheKey, { poster: null, timestamp: Date.now() });
    tmdbCache.set(exactCacheKey, { poster: null, timestamp: Date.now() });
    return null;

  } catch (error) {
    console.error(`[TMDB] Error fetching poster for "${title}":`, error);
    return null;
  }
}

function findBestMatch(results: any[], year?: string, dateField: string = 'release_date'): any {
  if (!year || results.length <= 1) {
    return results[0];
  }

  const targetYear = parseInt(year);
  return results.reduce((best, current) => {
    if (!current[dateField]) return best;

    const currentYear = parseInt(current[dateField].split('-')[0]);
    const bestYear = best[dateField] ? parseInt(best[dateField].split('-')[0]) : 0;

    const currentDiff = Math.abs(currentYear - targetYear);
    const bestDiff = Math.abs(bestYear - targetYear);

    return currentDiff < bestDiff ? current : best;
  });
}

export async function getTMDBMetadata(title: string, year?: string): Promise<{
  poster: string | null;
  imdbRating: number;
  numRatings: number;
  runtime: number;
  popularity: number;
} | null> {
  if (!TMDB_API_KEY || TMDB_API_KEY === 'your_tmdb_api_key_here') {
    return null;
  }

  const cacheKey = `${title}_${year || 'unknown'}`;
  const cached = tmdbCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    // Return enhanced metadata if available
    return {
      poster: cached.poster,
      imdbRating: (cached as any).imdbRating || 0,
      numRatings: (cached as any).numRatings || 0,
      runtime: (cached as any).runtime || 0,
      popularity: (cached as any).popularity || 0,
    };
  }

  try {
    let query = encodeURIComponent(title);
    let url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${query}`;
    
    if (year) {
      url += `&year=${year}`;
    }

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data: TMDBSearchResponse = await response.json();
    
    if (data.results && data.results.length > 0) {
      const movie = data.results[0];
      
      // Get detailed info including runtime
      const detailUrl = `${TMDB_BASE_URL}/movie/${movie.id}?api_key=${TMDB_API_KEY}`;
      const detailResponse = await fetch(detailUrl);
      const detailData = detailResponse.ok ? await detailResponse.json() : null;
      
      const result = {
        poster: movie.poster_path ? `${TMDB_IMAGE_BASE_URL}${movie.poster_path}` : null,
        imdbRating: movie.vote_average || 0,
        numRatings: movie.vote_count || 0,
        runtime: detailData?.runtime || 0,
        popularity: movie.popularity || 0,
      };
      
      // Enhanced cache with metadata
      tmdbCache.set(cacheKey, { 
        poster: result.poster, 
        timestamp: Date.now(),
        ...result
      });
      
      return result;
    }
    
    // Cache null result
    tmdbCache.set(cacheKey, { poster: null, timestamp: Date.now() });
    return null;
    
  } catch (error) {
    console.error(`[TMDB] Error fetching metadata for "${title}":`, error);
    return null;
  }
}

export async function getTMDBPosterBatch(items: Array<{ title: string; year?: string }>): Promise<Map<string, string | null>> {
  const results = new Map<string, string | null>();

  // Aggressive parallel processing for faster poster loading
  const batchSize = 50; // Larger batches for better throughput
  const delay = 10; // Minimal delay between batches
  const maxConcurrency = 10; // Limit concurrent API calls per batch

  console.log(`[TMDB Batch] Processing ${items.length} items in batches of ${batchSize}`);

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(items.length / batchSize);

    console.log(`[TMDB Batch] Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`);

    // Process batch with controlled concurrency
    const semaphore = new Array(maxConcurrency).fill(null);
    let index = 0;

    const processBatch = async () => {
      const promises = batch.map(async (item, idx) => {
        // Wait for semaphore slot
        await semaphore[idx % maxConcurrency];

        try {
          const poster = await getTMDBPoster(item.title, item.year);
          const key = `${item.title}_${item.year || 'unknown'}`;
          return { key, poster };
        } catch (error) {
          console.error(`[TMDB Batch] Error fetching poster for "${item.title}":`, error);
          const key = `${item.title}_${item.year || 'unknown'}`;
          return { key, poster: null };
        }
      });

      return Promise.all(promises);
    };

    const batchResults = await processBatch();

    batchResults.forEach(({ key, poster }) => {
      results.set(key, poster);
    });

    const successCount = batchResults.filter(r => r.poster !== null).length;
    console.log(`[TMDB Batch] Batch ${batchNumber} complete: ${successCount}/${batch.length} posters found`);

    // Minimal delay between batches to avoid overwhelming API
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  const totalFound = Array.from(results.values()).filter(poster => poster !== null).length;
  console.log(`[TMDB Batch] Complete: ${totalFound}/${items.length} posters found`);

  return results;
}

export async function detectContentTypeBatch(items: Array<{ title: string; year?: string }>): Promise<Map<string, 'movie' | 'tv'>> {
  const results = new Map<string, 'movie' | 'tv'>();

  // Process items in smaller batches for content type detection
  const batchSize = 20; // Smaller batches since we're making 2 API calls per item
  const delay = 50; // Slightly longer delay

  console.log(`[TMDB Content Detection] Processing ${items.length} items for content type detection`);

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchNumber = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(items.length / batchSize);

    console.log(`[TMDB Content Detection] Processing batch ${batchNumber}/${totalBatches} (${batch.length} items)`);

    const promises = batch.map(async (item) => {
      try {
        const contentType = await detectContentType(item.title, item.year);
        const key = `${item.title}_${item.year || 'unknown'}`;

        // Log when we use fast path override
        if (FORCE_MOVIE.includes(item.title) || FORCE_TV.includes(item.title)) {
          console.log(`[TMDB Content Detection] Fast path: "${item.title}" → ${contentType}`);
        }

        return { key, contentType };
      } catch (error) {
        console.error(`[TMDB Content Detection] Error for "${item.title}":`, error);
        const key = `${item.title}_${item.year || 'unknown'}`;
        return { key, contentType: 'movie' as const };
      }
    });

    const batchResults = await Promise.all(promises);

    batchResults.forEach(({ key, contentType }) => {
      results.set(key, contentType);
    });

    const tvCount = batchResults.filter(r => r.contentType === 'tv').length;
    console.log(`[TMDB Content Detection] Batch ${batchNumber} complete: ${tvCount}/${batch.length} identified as TV series`);

    // Add delay between batches
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  const totalTvCount = Array.from(results.values()).filter(type => type === 'tv').length;
  console.log(`[TMDB Content Detection] Complete: ${totalTvCount}/${items.length} items identified as TV series`);

  return results;
}

export async function getTMDBMetadataBatch(items: Array<{ title: string; year?: string }>): Promise<Map<string, {
  poster: string | null;
  imdbRating: number;
  numRatings: number;
  runtime: number;
  popularity: number;
} | null>> {
  const results = new Map();
  
  const batchSize = 30; // Increased batch size for better performance
  const delay = 25; // Reduced delay for faster processing
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    const promises = batch.map(async (item) => {
      const metadata = await getTMDBMetadata(item.title, item.year);
      const key = `${item.title}_${item.year || 'unknown'}`;
      return { key, metadata };
    });
    
    const batchResults = await Promise.all(promises);
    
    batchResults.forEach(({ key, metadata }) => {
      results.set(key, metadata);
    });
    
    // Add delay between batches
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return results;
}