import { useState, useEffect } from 'react';
import ThemeToggle from '../components/ThemeToggle';

export default function SyncPage() {
  const [credentials, setCredentials] = useState({ email: '', password: '' });
  const [config, setConfig] = useState(null);
  const [watchlist, setWatchlist] = useState(null);
  const [syncStatus, setSyncStatus] = useState(null);
  const [loading, setLoading] = useState({ config: false, sync: false, watchlist: false });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Load initial data
  useEffect(() => {
    loadConfig();
    loadWatchlist();
    loadSyncStatus();
  }, []);

  const loadConfig = async () => {
    try {
      const response = await fetch('/api/config');
      const data = await response.json();
      setConfig(data);
    } catch (err) {
      console.error('Failed to load config:', err);
    }
  };

  const loadWatchlist = async () => {
    setLoading(prev => ({ ...prev, watchlist: true }));
    try {
      const response = await fetch('/api/watchlist');
      const data = await response.json();
      setWatchlist(data);
    } catch (err) {
      console.error('Failed to load watchlist:', err);
    } finally {
      setLoading(prev => ({ ...prev, watchlist: false }));
    }
  };

  const loadSyncStatus = async () => {
    try {
      const response = await fetch('/api/sync');
      const data = await response.json();
      setSyncStatus(data);
    } catch (err) {
      console.error('Failed to load sync status:', err);
    }
  };

  const saveCredentials = async (e) => {
    e.preventDefault();
    setLoading(prev => ({ ...prev, config: true }));
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });

      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Failed to save credentials');
      }

      setSuccess('Credentials saved successfully!');
      setCredentials({ email: '', password: '' });
      await loadConfig();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, config: false }));
    }
  };

  const triggerSync = async () => {
    setLoading(prev => ({ ...prev, sync: true }));
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/sync', { method: 'POST' });
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.message || 'Sync failed');
      }

      setSuccess(`Sync completed! Found ${data.data?.totalItems || 0} items.`);
      await loadWatchlist();
      await loadSyncStatus();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, sync: false }));
    }
  };

  const Stat = ({ label, value, className = '' }) => (
    <div className={`flex flex-col ${className}`}>
      <span className="text-sm text-gray-500 dark:text-gray-400">{label}</span>
      <span className="text-lg font-semibold">{value ?? 'N/A'}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-teal-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900">
      <header className="pt-16 pb-8">
        <div className="container">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">
                <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-teal-600">IMDb Sync</span>{' '}
                API
              </h1>
              <p className="mt-3 max-w-2xl text-gray-600 dark:text-gray-300">
                Configure real-time sync with IMDb and manage your Stremio addon.
              </p>
            </div>
            <div className="flex gap-4">
              <a 
                href="/"
                className="text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white"
              >
                ← Back to CSV Upload
              </a>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </header>

      <main className="pb-24">
        <div className="container">
          <div className="mx-auto max-w-4xl space-y-8">
            
            {/* Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="rounded-xl border border-gray-200 bg-white/80 p-4 shadow-lg backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
                <h3 className="font-semibold mb-2">Configuration</h3>
                <Stat 
                  label="IMDb Credentials" 
                  value={config?.configured ? '✓ Configured' : '✗ Not Set'} 
                />
                {config?.email && (
                  <p className="text-xs text-gray-500 mt-1">{config.email}</p>
                )}
              </div>
              
              <div className="rounded-xl border border-gray-200 bg-white/80 p-4 shadow-lg backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
                <h3 className="font-semibold mb-2">Sync Status</h3>
                <Stat 
                  label="Current Status" 
                  value={syncStatus?.syncInProgress ? '🔄 Syncing' : '✓ Ready'} 
                />
              </div>
              
              <div className="rounded-xl border border-gray-200 bg-white/80 p-4 shadow-lg backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
                <h3 className="font-semibold mb-2">Watchlist</h3>
                <Stat 
                  label="Cached Items" 
                  value={loading.watchlist ? '...' : watchlist?.totalItems || 0} 
                />
                {watchlist?.lastUpdated && (
                  <p className="text-xs text-gray-500 mt-1">
                    Updated: {new Date(watchlist.lastUpdated).toLocaleString()}
                  </p>
                )}
              </div>
            </div>

            {/* Error/Success Messages */}
            {error && (
              <div className="rounded-md border border-red-300 bg-red-50 p-3 text-red-700 dark:border-red-800 dark:bg-red-950/40 dark:text-red-300">
                {error}
              </div>
            )}
            
            {success && (
              <div className="rounded-md border border-green-300 bg-green-50 p-3 text-green-700 dark:border-green-800 dark:bg-green-950/40 dark:text-green-300">
                {success}
              </div>
            )}

            {/* Configuration Form */}
            <div className="rounded-xl border border-gray-200 bg-white/80 p-6 shadow-lg backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
              <h2 className="text-xl font-semibold mb-4">IMDb Configuration</h2>
              
              <form onSubmit={saveCredentials} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">IMDb Email</label>
                  <input
                    type="email"
                    value={credentials.email}
                    onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800"
                    placeholder="your-email@example.com"
                    required
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-2">IMDb Password</label>
                  <input
                    type="password"
                    value={credentials.password}
                    onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-gray-700 dark:bg-gray-800"
                    placeholder="Your IMDb password"
                    required
                  />
                </div>
                
                <button
                  type="submit"
                  disabled={loading.config}
                  className="inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading.config && (
                    <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                  )}
                  {loading.config ? 'Saving...' : 'Save Credentials'}
                </button>
              </form>
            </div>

            {/* Sync Controls */}
            <div className="rounded-xl border border-gray-200 bg-white/80 p-6 shadow-lg backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
              <h2 className="text-xl font-semibold mb-4">Sync Controls</h2>
              
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={triggerSync}
                  disabled={loading.sync || !config?.configured}
                  className="inline-flex items-center justify-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-green-500 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {loading.sync && (
                    <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                  )}
                  {loading.sync ? 'Syncing...' : 'Sync Now'}
                </button>
                
                <button
                  onClick={loadWatchlist}
                  disabled={loading.watchlist}
                  className="inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  Refresh Data
                </button>
              </div>
              
              {!config?.configured && (
                <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                  Configure your IMDb credentials above to enable sync functionality.
                </p>
              )}
            </div>

            {/* API Endpoints */}
            <div className="rounded-xl border border-gray-200 bg-white/80 p-6 shadow-lg backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
              <h2 className="text-xl font-semibold mb-4">API Endpoints</h2>
              
              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-3">
                  <code className="rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800">GET</code>
                  <code className="flex-1">/api/watchlist</code>
                  <span className="text-gray-600 dark:text-gray-400">Get cached watchlist</span>
                </div>
                
                <div className="flex items-center gap-3">
                  <code className="rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800">POST</code>
                  <code className="flex-1">/api/sync</code>
                  <span className="text-gray-600 dark:text-gray-400">Trigger manual sync</span>
                </div>
                
                <div className="flex items-center gap-3">
                  <code className="rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800">GET</code>
                  <code className="flex-1">/api/stremio/manifest</code>
                  <span className="text-gray-600 dark:text-gray-400">Stremio addon manifest</span>
                </div>
                
                <div className="flex items-center gap-3">
                  <code className="rounded bg-gray-100 px-2 py-1 text-xs dark:bg-gray-800">POST</code>
                  <code className="flex-1">/api/cron/sync-watchlist</code>
                  <span className="text-gray-600 dark:text-gray-400">Scheduled sync endpoint</span>
                </div>
              </div>
              
              <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/40 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  <strong>Stremio Addon URL:</strong> Use <code className="bg-blue-100 dark:bg-blue-900 px-1 rounded">
                    {typeof window !== 'undefined' ? window.location.origin : 'your-domain'}/api/stremio/manifest
                  </code> to install this as a Stremio addon.
                </p>
              </div>
            </div>

            {/* Watchlist Preview */}
            {watchlist?.items?.length > 0 && (
              <div className="rounded-xl border border-gray-200 bg-white/80 p-6 shadow-lg backdrop-blur dark:border-gray-800 dark:bg-gray-900/80">
                <h2 className="text-xl font-semibold mb-4">Current Watchlist ({watchlist.totalItems} items)</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-96 overflow-y-auto">
                  {watchlist.items.slice(0, 12).map((item, index) => (
                    <div key={index} className="flex items-center gap-3 p-2 rounded bg-gray-50 dark:bg-gray-800">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{item.title}</p>
                        {item.year && (
                          <p className="text-xs text-gray-600 dark:text-gray-400">{item.year} • {item.type}</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                
                {watchlist.totalItems > 12 && (
                  <p className="mt-3 text-sm text-gray-600 dark:text-gray-400">
                    Showing 12 of {watchlist.totalItems} items
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}