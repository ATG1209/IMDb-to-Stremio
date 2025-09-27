import { useState, useEffect } from 'react';
import ThemeToggle from '../components/ThemeToggle';
import { ADDON_VERSION } from '../lib/version';

export default function Dashboard() {
  // const [user, setUser] = useState(null); // Unused until authentication is implemented
  const [watchlist, setWatchlist] = useState(null);
  const [config, setConfig] = useState(null);
  const [sortBy, setSortBy] = useState('dateAdded');
  const [filterType, setFilterType] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState({ watchlist: false, sync: false });
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [showCredentialsModal, setShowCredentialsModal] = useState(false);
  const [credentials, setCredentials] = useState({ email: '', password: '' });

  useEffect(() => {
    loadInitialData();
  }, []);

  const loadInitialData = async () => {
    await Promise.all([
      loadConfig(),
      loadWatchlist()
    ]);
  };

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

  const saveCredentials = async (e) => {
    e.preventDefault();
    setLoading(prev => ({ ...prev, sync: true }));
    setError(null);

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

      setShowCredentialsModal(false);
      setCredentials({ email: '', password: '' });
      await loadConfig();
      
      // Auto sync after saving credentials
      await triggerSync();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, sync: false }));
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

      setSuccess(`¡Sincronizado! Se encontraron ${data.data?.totalItems || 0} elementos.`);
      await loadWatchlist();
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(prev => ({ ...prev, sync: false }));
    }
  };

  // Filter and sort watchlist
  const getFilteredAndSortedWatchlist = () => {
    if (!watchlist?.items) return [];

    let filtered = watchlist.items;

    // Filter by type
    if (filterType !== 'all') {
      filtered = filtered.filter(item => item.type === filterType);
    }

    // Filter by search term
    if (searchTerm) {
      filtered = filtered.filter(item => 
        item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.year && item.year.toString().includes(searchTerm))
      );
    }

    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'year':
          return (parseInt(b.year) || 0) - (parseInt(a.year) || 0);
        case 'dateAdded':
        default:
          return new Date(b.addedAt || 0) - new Date(a.addedAt || 0);
      }
    });

    return filtered;
  };

  const filteredItems = getFilteredAndSortedWatchlist();
  const addonUrl = typeof window !== 'undefined' ? `${window.location.origin}/api/stremio/manifest.json?v=${ADDON_VERSION}` : '';

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-teal-50 dark:from-gray-900 dark:via-gray-950 dark:to-gray-900">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur border-b border-gray-200 dark:bg-gray-900/80 dark:border-gray-800">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">
              <span className="bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-teal-600">
                IMDb → Stremio
              </span>
            </h1>
            {config?.configured && (
              <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full dark:bg-green-900/40 dark:text-green-300">
                ✓ Conectado
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-4">
            <button
              onClick={triggerSync}
              disabled={loading.sync || !config?.configured}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading.sync ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                </svg>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              {loading.sync ? 'Sincronizando...' : 'Sincronizar'}
            </button>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Connection Status & Setup */}
        {!config?.configured ? (
          <div className="max-w-2xl mx-auto">
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center">
              <div className="w-16 h-16 bg-indigo-100 dark:bg-indigo-900/40 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-indigo-600 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </div>
              
              <h2 className="text-2xl font-bold mb-2">Conecta tu cuenta de IMDb</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Para comenzar, necesitas conectar tu cuenta de IMDb para acceder a tu watchlist
              </p>
              
              <button
                onClick={() => setShowCredentialsModal(true)}
                className="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 font-medium"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Conectar IMDb
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/40 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2h4a1 1 0 011 1v1a1 1 0 01-1 1v12a2 2 0 01-2 2H6a2 2 0 01-2-2V7a1 1 0 01-1-1V5a1 1 0 011-1h4z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{loading.watchlist ? '...' : watchlist?.totalItems || 0}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Total en Watchlist</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-green-100 dark:bg-green-900/40 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16l9-8-9-8z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{filteredItems.filter(item => item.type === 'movie').length}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Películas</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/40 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{filteredItems.filter(item => item.type === 'tv').length}</p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Series</p>
                  </div>
                </div>
              </div>

              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/40 rounded-lg flex items-center justify-center">
                    <svg className="w-5 h-5 text-orange-600 dark:text-orange-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      {watchlist?.lastUpdated ? 
                        new Date(watchlist.lastUpdated).toLocaleDateString() : 
                        'Nunca'
                      }
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">Última Sincronización</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Alerts */}
            {error && (
              <div className="bg-red-50 dark:bg-red-900/40 border border-red-200 dark:border-red-800 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <p className="text-red-800 dark:text-red-200">{error}</p>
                  <button onClick={() => setError(null)} className="ml-auto text-red-600 dark:text-red-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {success && (
              <div className="bg-green-50 dark:bg-green-900/40 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 text-green-600 dark:text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-green-800 dark:text-green-200">{success}</p>
                  <button onClick={() => setSuccess(null)} className="ml-auto text-green-600 dark:text-green-400">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            )}

            {/* Stremio Addon Info */}
            <div className="bg-gradient-to-r from-indigo-500 to-teal-500 rounded-xl p-6 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold mb-2">🎬 Tu Addon de Stremio está listo</h3>
                  <p className="text-indigo-100 mb-3">
                    Usa esta URL en Stremio para instalar tu addon personalizado
                  </p>
                  <code className="bg-black/20 px-3 py-1 rounded text-sm">
                    {addonUrl}
                  </code>
                </div>
                <button
                  onClick={() => navigator.clipboard.writeText(addonUrl)}
                  className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium"
                >
                  Copiar URL
                </button>
              </div>
            </div>

            {/* Controls */}
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6">
              <div className="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between mb-6">
                <h3 className="text-lg font-semibold">Tu Watchlist</h3>
                
                <div className="flex flex-col sm:flex-row gap-3">
                  {/* Search */}
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Buscar..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm w-full sm:w-auto"
                    />
                  </div>

                  {/* Filter */}
                  <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
                  >
                    <option value="all">Todos</option>
                    <option value="movie">Solo Películas</option>
                    <option value="tv">Solo Series</option>
                  </select>

                  {/* Sort */}
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-sm"
                  >
                    <option value="dateAdded">Más Recientes</option>
                    <option value="title">Por Título</option>
                    <option value="year">Por Año</option>
                  </select>
                </div>
              </div>

              {/* Watchlist Grid */}
              {loading.watchlist ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                  <span className="ml-3">Cargando watchlist...</span>
                </div>
              ) : filteredItems.length === 0 ? (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4V2a1 1 0 011-1h8a1 1 0 011 1v2h4a1 1 0 011 1v1a1 1 0 01-1 1v12a2 2 0 01-2-2H6a2 2 0 01-2-2V7a1 1 0 01-1-1V5a1 1 0 011-1h4z" />
                  </svg>
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-2">
                    {searchTerm || filterType !== 'all' ? 'No se encontraron resultados' : 'Tu watchlist está vacía'}
                  </h3>
                  <p className="text-gray-500 dark:text-gray-400">
                    {searchTerm || filterType !== 'all' ? 
                      'Intenta cambiar los filtros o buscar algo diferente' : 
                      'Haz clic en "Sincronizar" para cargar tu watchlist de IMDb'
                    }
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredItems.map((item, index) => (
                    <div key={index} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex items-start gap-4">
                        <div className="w-16 h-24 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center flex-shrink-0">
                          {item.poster ? (
                            <img src={item.poster} alt={item.title} className="w-full h-full object-cover rounded-lg" />
                          ) : (
                            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16l9-8-9-8z" />
                            </svg>
                          )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-1 truncate">
                            {item.title}
                          </h4>
                          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
                            <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 rounded text-xs">
                              {item.type === 'movie' ? 'Película' : 'Serie'}
                            </span>
                            {item.year && <span>{item.year}</span>}
                          </div>
                          {item.genres && item.genres.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {item.genres.slice(0, 2).map((genre, i) => (
                                <span key={i} className="px-1.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-200 text-xs rounded">
                                  {genre}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {filteredItems.length > 0 && (
                <div className="mt-6 text-center text-sm text-gray-600 dark:text-gray-400">
                  Mostrando {filteredItems.length} de {watchlist?.totalItems || 0} elementos
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Credentials Modal */}
      {showCredentialsModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-900 rounded-xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Conectar cuenta de IMDb</h3>
              <button
                onClick={() => setShowCredentialsModal(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={saveCredentials} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Email de IMDb</label>
                <input
                  type="email"
                  value={credentials.email}
                  onChange={(e) => setCredentials({ ...credentials, email: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                  placeholder="tu-email@ejemplo.com"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2">Contraseña</label>
                <input
                  type="password"
                  value={credentials.password}
                  onChange={(e) => setCredentials({ ...credentials, password: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                  placeholder="Tu contraseña de IMDb"
                  required
                />
              </div>
              
              <div className="bg-blue-50 dark:bg-blue-900/40 p-3 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  🔐 Tus credenciales se almacenan de forma segura y solo se usan para sincronizar tu watchlist.
                </p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCredentialsModal(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={loading.sync}
                  className="flex-1 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-500 disabled:opacity-50"
                >
                  {loading.sync ? 'Conectando...' : 'Conectar y Sincronizar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
