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

// Simple in-memory cache for TMDB results
const tmdbCache = new Map<string, { poster: string | null; timestamp: number }>();
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function getTMDBPoster(title: string, year?: string): Promise<string | null> {
  if (!TMDB_API_KEY || TMDB_API_KEY === 'your_tmdb_api_key_here') {
    console.log('[TMDB] API key not configured, skipping poster fetch');
    return null;
  }

  const cacheKey = `${title}_${year || 'unknown'}`;
  const cached = tmdbCache.get(cacheKey);
  
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.poster;
  }

  try {
    // Build search query
    let query = encodeURIComponent(title);
    let url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${query}`;
    
    if (year) {
      url += `&year=${year}`;
    }

    console.log(`[TMDB] Searching for: "${title}" (${year || 'no year'})`);
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`TMDB API error: ${response.status}`);
    }

    const data: TMDBSearchResponse = await response.json();
    
    if (data.results && data.results.length > 0) {
      const movie = data.results[0]; // Take first result
      
      if (movie.poster_path) {
        const posterUrl = `${TMDB_IMAGE_BASE_URL}${movie.poster_path}`;
        console.log(`[TMDB] Found poster for "${title}": ${posterUrl}`);
        
        // Cache the result
        tmdbCache.set(cacheKey, { poster: posterUrl, timestamp: Date.now() });
        return posterUrl;
      }
    }
    
    console.log(`[TMDB] No poster found for "${title}"`);
    // Cache null result to avoid repeated API calls
    tmdbCache.set(cacheKey, { poster: null, timestamp: Date.now() });
    return null;
    
  } catch (error) {
    console.error(`[TMDB] Error fetching poster for "${title}":`, error);
    return null;
  }
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
  
  // Process items in batches to avoid overwhelming the API
  const batchSize = 25; // Further increased for poster requests
  const delay = 30; // Faster delay for poster-only requests
  
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    
    const promises = batch.map(async (item) => {
      const poster = await getTMDBPoster(item.title, item.year);
      const key = `${item.title}_${item.year || 'unknown'}`;
      return { key, poster };
    });
    
    const batchResults = await Promise.all(promises);
    
    batchResults.forEach(({ key, poster }) => {
      results.set(key, poster);
    });
    
    // Add delay between batches
    if (i + batchSize < items.length) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
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