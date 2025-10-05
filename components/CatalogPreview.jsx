import { useState, useEffect } from 'react';
import { APP_VERSION } from '../lib/version';

export default function CatalogPreview({ userId }) {
  const [activeTab, setActiveTab] = useState('movies');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const ITEMS_PER_PAGE = 20;

  // Reset page when switching tabs - MUST be before early returns
  useEffect(() => {
    setCurrentPage(0);
  }, [activeTab]);

  const buildWatchlistUrl = (forceRefresh = false) => {
    const params = new URLSearchParams({ userId, v: APP_VERSION });
    if (forceRefresh) {
      params.set('forceRefresh', 'true');
    }
    return `/api/imdb-watchlist?${params.toString()}`;
  };

  const fetchWatchlist = async (forceRefresh = false) => {
    try {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);

      if (!userId) {
        setError('Please enter a valid IMDb user ID');
        return;
      }

      const url = buildWatchlistUrl(forceRefresh);

      const response = await fetch(url);
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to fetch watchlist');
      }

      setData(result);
      if (forceRefresh) {
        setLastRefreshTime(new Date());
      }
    } catch (err) {
      console.error('Error fetching watchlist:', err);
      setError(err.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleManualRefresh = () => {
    fetchWatchlist(true);
  };

  useEffect(() => {
    if (!userId) return;
    fetchWatchlist(false);
  }, [userId]);

  if (loading) {
    return (
      <div className="mt-8 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-600/50 p-8">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
          Catalog Preview
        </h3>

        {/* Loading skeleton */}
        <div className="flex justify-center space-x-4 mb-6">
          <div className="h-10 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
          <div className="h-10 w-24 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {[...Array(10)].map((_, i) => (
            <div key={i} className="aspect-[2/3] bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mt-8 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-600/50 p-8">
        <h3 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
          Catalog Preview
        </h3>

        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <p className="text-gray-600 dark:text-gray-300 mb-2">Unable to load catalog preview</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">{error}</p>
        </div>
      </div>
    );
  }

  // Reverse order so newest items appear first (same as addon)
  const movies = data?.items ? [...data.items].filter(item => item.type === 'movie').reverse() : [];
  const series = data?.items ? [...data.items].filter(item => item.type === 'tv').reverse() : [];

  const currentItems = activeTab === 'movies' ? movies : series;

  // Pagination
  const totalPages = Math.ceil(currentItems.length / ITEMS_PER_PAGE);
  const startIndex = currentPage * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const displayItems = currentItems.slice(startIndex, endIndex);

  return (
    <div className="mt-8 bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-600/50 p-8">
      <div className="text-center mb-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex-1"></div>
          <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
            Catalog Preview
          </h3>
          <div className="flex-1 flex justify-end">
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className={`px-4 py-2 rounded-lg font-semibold transition-all duration-200 flex items-center space-x-2 ${
                refreshing
                  ? 'bg-gray-300 dark:bg-gray-600 text-gray-500 dark:text-gray-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg shadow-green-500/25 hover:scale-105'
              }`}
              title="Fetch latest watchlist from IMDb (bypasses 12-hour cache)"
            >
              <svg
                className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
            </button>
          </div>
        </div>
        <p className="text-gray-600 dark:text-gray-300">
          How your watchlist will look in Stremio
        </p>
        {lastRefreshTime && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Last refreshed: {lastRefreshTime.toLocaleTimeString()}
          </p>
        )}
      </div>

      {/* Info Banner */}
      <div className="mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700/50 rounded-xl p-4">
        <div className="flex items-start">
          <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-3 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <div className="text-sm text-blue-800 dark:text-blue-200">
            <p className="font-semibold mb-1">Auto-sync enabled</p>
            <p>Your watchlist automatically updates every 12 hours. Click "Refresh" above to sync instantly with IMDb.</p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex justify-center space-x-2 mb-8">
        <button
          onClick={() => setActiveTab('movies')}
          className={`px-6 py-2 rounded-lg font-semibold transition-all duration-200 ${
            activeTab === 'movies'
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/25'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Movies ({movies.length})
        </button>
        <button
          onClick={() => setActiveTab('series')}
          className={`px-6 py-2 rounded-lg font-semibold transition-all duration-200 ${
            activeTab === 'series'
              ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-lg shadow-purple-500/25'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
          }`}
        >
          Series ({series.length})
        </button>
      </div>

      {/* Content Grid */}
      {displayItems.length > 0 || (!loading && !error && data?.totalItems === 0) ? (
        displayItems.length > 0 ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {displayItems.map((item, index) => (
            <div
              key={item.imdbId || index}
              className="group relative aspect-[2/3] bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-300"
            >
              {item.poster ? (
                <img
                  src={item.poster}
                  alt={item.title}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    e.target.nextSibling.style.display = 'flex';
                  }}
                />
              ) : null}

              {/* Fallback when no poster or image fails to load */}
              <div
                className={`${item.poster ? 'hidden' : 'flex'} w-full h-full items-center justify-center text-center p-4`}
                style={{ display: item.poster ? 'none' : 'flex' }}
              >
                <div>
                  <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-500 rounded-lg flex items-center justify-center mb-2 mx-auto">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 4v10a1 1 0 001 1h8a1 1 0 001-1V8M7 8h10M9 12h6" />
                    </svg>
                  </div>
                  <p className="text-xs font-medium text-gray-600 dark:text-gray-300 line-clamp-2">
                    {item.title}
                  </p>
                  {item.year && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {item.year}
                    </p>
                  )}
                </div>
              </div>

              {/* IMDb Rating Badge - Always visible at bottom */}
              {item.imdbRating && item.imdbRating > 0 && (
                <a
                  href={`https://www.imdb.com/title/${item.imdbId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="absolute bottom-2 left-1/2 transform -translate-x-1/2 bg-yellow-500/95 hover:bg-yellow-400 backdrop-blur-sm px-2.5 py-1 rounded-md shadow-lg transition-all duration-200 hover:scale-110 z-10"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1">
                    <span className="text-sm">⭐</span>
                    <span className="text-xs font-bold text-gray-900">
                      {item.imdbRating.toFixed(1)}
                    </span>
                  </div>
                </a>
              )}
            </div>
          ))}
        </div>
        ) : (
          // Empty state for when API returns 0 items
          <div className="text-center py-12">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-yellow-100 dark:bg-yellow-900/30 rounded-2xl mb-4">
              <svg className="w-8 h-8 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 19c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <p className="text-gray-600 dark:text-gray-300 mb-2">
              Watchlist appears to be empty or private
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Make sure your IMDb watchlist is set to public and contains items
            </p>
            <div className="text-xs text-gray-400 dark:text-gray-500">
              This preview will show your actual watchlist content once the scraping service is working
            </div>
          </div>
        )
      ) : (
        <div className="text-center py-12">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-2xl mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2m-9 4v10a1 1 0 001 1h8a1 1 0 001-1V8M7 8h10" />
            </svg>
          </div>
          <p className="text-gray-600 dark:text-gray-300 mb-2">
            No {activeTab === 'movies' ? 'movies' : 'series'} found
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Your watchlist doesn't contain any {activeTab === 'movies' ? 'movies' : 'TV series'} yet
          </p>
        </div>
      )}

      {/* Pagination Controls */}
      {displayItems.length > 0 && totalPages > 1 && (
        <div className="mt-8 flex flex-col items-center gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(prev => Math.max(0, prev - 1))}
              disabled={currentPage === 0}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span>Previous</span>
            </button>

            <div className="px-6 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-gray-700 dark:text-gray-300 font-semibold">
              Page {currentPage + 1} of {totalPages}
            </div>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages - 1, prev + 1))}
              disabled={currentPage === totalPages - 1}
              className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg shadow-purple-500/25 disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none flex items-center gap-2"
            >
              <span>Next</span>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Showing {startIndex + 1}-{Math.min(endIndex, currentItems.length)} of {currentItems.length} {activeTab}
          </p>
        </div>
      )}
    </div>
  );
}
