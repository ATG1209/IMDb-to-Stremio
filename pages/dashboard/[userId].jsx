import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { ADDON_VERSION } from '../../lib/version';
import ThemeToggle from '../../components/ThemeToggle';

export default function UserDashboard() {
  const router = useRouter();
  const { userId } = router.query;

  const [activeTab, setActiveTab] = useState('watchlist');
  const [watchlistData, setWatchlistData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [lastSynced, setLastSynced] = useState(null);
  const [copied, setCopied] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [refreshSource, setRefreshSource] = useState('');

  const describeSource = (source) => {
    const lookup = {
      'worker-cache': 'VPS cache',
      'worker-job': 'VPS worker (fresh)',
      'worker-refresh': 'VPS worker (manual refresh)',
      'worker-stale': 'VPS cache (stale)',
      'fallback-direct': 'Direct scrape fallback',
      'fallback-after-worker-pending': 'Fallback (worker timeout)',
      'direct-scrape': 'Direct scrape',
      'development-direct': 'Local scrape',
      'fallback-error': 'Fallback failed',
      'vps-worker': 'VPS worker'
    };
    return lookup[source] || (source ? source.replace(/-/g, ' ') : 'unknown');
  };

  // Load watchlist data on mount
  useEffect(() => {
    if (userId) {
      loadWatchlist();
    }
  }, [userId]);

  const loadWatchlist = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/imdb-watchlist?userId=${userId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to load watchlist');
      }

      setWatchlistData(data);
      setLastSynced(new Date());
      setRefreshSource(data.source || 'unknown');
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/imdb-watchlist?userId=${userId}&refresh=1&nocache=1`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Sync failed');
      }

      const sourceLabel = describeSource(data.source || 'unknown');
      const totalItems = data.items?.length || 0;

      setWatchlistData(data);
      setLastSynced(new Date());
      setRefreshSource(data.source || 'unknown');
      setSuccess(
        totalItems > 0
          ? `✓ Synced via ${sourceLabel}. Found ${totalItems} items.`
          : `Sync via ${sourceLabel} completed but returned 0 items. Double-check your IMDb watchlist visibility.`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setIsSyncing(false);
    }
  };

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  const getFilteredWatchlist = () => {
    if (!watchlistData?.items) return [];

    let filtered = [...watchlistData.items];

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(item => item.type === filterType);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(item =>
        item.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.title?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Reverse order - newest added first
    return filtered.reverse();
  };

  const filteredItems = getFilteredWatchlist();
  const addonUrl = typeof window !== 'undefined' ?
    `${window.location.origin}/api/stremio/${userId}/manifest.json?v=${ADDON_VERSION}` : '';

  const formatTimeAgo = (date) => {
    if (!date) return 'Never';
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };


  if (!userId) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/')}
              className="flex items-center space-x-2 text-gray-700 dark:text-gray-200 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
            </button>

            <img
              src="/logo.svg"
              alt="IMDb to Stremio Syncer logo"
              className="w-9 h-9 hidden sm:block drop-shadow-lg"
            />

            <div className="flex flex-col">
              <h1 className="text-lg font-bold">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-purple-600 to-pink-600">
                  IMDb → Stremio Syncer
                </span>
              </h1>
              <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{userId}</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden sm:block text-xs text-gray-500 dark:text-gray-400">
              v{ADDON_VERSION}
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="bg-white/60 dark:bg-gray-900/60 backdrop-blur border-b border-gray-200 dark:border-gray-800">
        <div className="container mx-auto px-4">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('watchlist')}
              className={`px-6 py-3 font-medium transition-all ${
                activeTab === 'watchlist'
                  ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                </svg>
                My Watchlist
              </span>
            </button>

            <button
              onClick={() => setActiveTab('addon')}
              className={`px-6 py-3 font-medium transition-all ${
                activeTab === 'addon'
                  ? 'text-purple-600 dark:text-purple-400 border-b-2 border-purple-600 dark:border-purple-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Addon Setup
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-8">
        {/* Alerts */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 rounded-r-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <p className="text-red-700 dark:text-red-200 font-medium">{error}</p>
              </div>
              <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {success && (
          <div className="mb-6 p-4 bg-green-50 dark:bg-green-900/30 border-l-4 border-green-500 rounded-r-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <p className="text-green-700 dark:text-green-200 font-medium">{success}</p>
              </div>
              <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'watchlist' && (
          <div className="space-y-6">
            {/* Sync Header - Refined */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-semibold text-gray-900 dark:text-white">Your Watchlist</h2>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                  Last synced: {formatTimeAgo(lastSynced)}
                </p>
                {refreshSource && (
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Source: {describeSource(refreshSource)}
                  </p>
                )}
              </div>
              <button
                onClick={handleManualSync}
                disabled={isSyncing}
                className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-sm"
              >
                {isSyncing ? (
                  <>
                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                    <span>Syncing...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Refresh</span>
                  </>
                )}
              </button>
            </div>

            {/* Stats Cards - Refined */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-50 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                      {watchlistData?.items?.length || 0}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Total Items</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-50 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16l13-8-13-8z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                      {filteredItems.filter(item => item.type === 'movie').length}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Movies</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-50 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-semibold text-gray-900 dark:text-white">
                      {filteredItems.filter(item => item.type === 'series').length}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Series</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Search & Filter - Refined */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input
                  type="text"
                  placeholder="Search titles..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                />
              </div>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="px-3 py-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white text-sm focus:ring-1 focus:ring-purple-500 focus:border-purple-500 transition-colors"
              >
                <option value="all">All Types</option>
                <option value="movie">Movies Only</option>
                <option value="series">Series Only</option>
              </select>
            </div>

            {/* Watchlist Grid */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
                  <p className="text-gray-600 dark:text-gray-400">Loading your watchlist...</p>
                </div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-12 text-center border border-gray-200 dark:border-gray-700">
                <svg className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                </svg>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                  {searchTerm || filterType !== 'all' ? 'No results found' : 'No items in watchlist'}
                </h3>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {searchTerm || filterType !== 'all' ?
                    'Try adjusting your filters or search term' :
                    'Click "Refresh" to load your IMDb watchlist'
                  }
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {filteredItems.map((item, index) => (
                    <div key={index} className="group">
                      <div className="aspect-[2/3] bg-gray-100 dark:bg-gray-700 rounded-lg overflow-hidden group-hover:ring-2 group-hover:ring-purple-500 transition-all">
                        {item.poster ? (
                          <img
                            src={item.poster}
                            alt={item.name || item.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <svg className="w-10 h-10 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16l13-8-13-8z" />
                            </svg>
                          </div>
                        )}
                      </div>
                      <div className="mt-2">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {item.name || item.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs px-1.5 py-0.5 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 rounded">
                            {item.type === 'movie' ? 'Movie' : 'Series'}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100 dark:border-gray-700 text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Showing {filteredItems.length} of {watchlistData?.items?.length || 0} items
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'addon' && (
          <div className="max-w-3xl mx-auto space-y-6">
            {/* Addon URL Card */}
            <div className="bg-white dark:bg-gray-800 rounded-2xl p-8 shadow-xl border border-gray-200 dark:border-gray-700">
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-500 rounded-2xl mb-4 shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Your Addon is Ready!</h2>
                <p className="text-gray-600 dark:text-gray-400">
                  Use this URL to install your personalized Stremio addon
                </p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Addon Manifest URL
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={addonUrl}
                      readOnly
                      className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white font-mono text-sm"
                    />
                    <button
                      onClick={() => copyToClipboard(addonUrl)}
                      className={`px-6 py-3 font-semibold rounded-lg transition-all duration-300 flex items-center justify-center gap-2 ${
                        copied
                          ? 'bg-green-600 text-white'
                          : 'bg-purple-600 hover:bg-purple-700 text-white'
                      }`}
                    >
                      {copied ? (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Installation Instructions */}
                <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-6 border border-indigo-200 dark:border-indigo-800">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                    <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    How to Install
                  </h3>
                  <ol className="space-y-3 text-gray-700 dark:text-gray-300">
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">1</span>
                      <span>Open Stremio and navigate to the <strong>Addons</strong> section</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">2</span>
                      <span>Click on <strong>"Community Addons"</strong> or the <strong>"+"</strong> button</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">3</span>
                      <span>Paste your addon URL in the input field</span>
                    </li>
                    <li className="flex items-start gap-3">
                      <span className="flex-shrink-0 w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full flex items-center justify-center mt-0.5">4</span>
                      <span>Click <strong>"Install"</strong> and enjoy your IMDb watchlist in Stremio!</span>
                    </li>
                  </ol>
                </div>

                {/* Quick Links */}
                <div className="flex flex-col sm:flex-row gap-3 pt-4">
                  <a
                    href="stremio:///"
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    <span>Open Stremio App</span>
                  </a>

                  <a
                    href="https://web.stremio.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-lg transition-all duration-200 shadow-lg flex items-center justify-center gap-2"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                    </svg>
                    <span>Open Stremio Web</span>
                  </a>
                </div>
              </div>
            </div>

            {/* Bookmark Reminder */}
            <div className="bg-gradient-to-r from-yellow-50 to-orange-50 dark:from-yellow-900/20 dark:to-orange-900/20 rounded-xl p-6 border border-yellow-200 dark:border-yellow-800">
              <div className="flex items-start gap-3">
                <svg className="w-6 h-6 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white mb-1">💡 Pro Tip: Bookmark This Page</h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    Save this dashboard URL (<code className="px-1 py-0.5 bg-yellow-100 dark:bg-yellow-900/40 rounded text-xs font-mono">/dashboard/{userId}</code>) on all your devices (phone, laptop, tablet).
                    You can quickly sync your watchlist before watching TV!
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
