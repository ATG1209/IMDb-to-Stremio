import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { APP_VERSION, ADDON_VERSION } from '../lib/version';
import ThemeToggle from '../components/ThemeToggle';
import CatalogPreview from '../components/CatalogPreview';

export default function SimpleDashboard() {
  const router = useRouter();
  const [imdbUserId, setImdbUserId] = useState('');
  const [addonGenerated, setAddonGenerated] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (router.query.userId) {
      setImdbUserId(router.query.userId);
      setAddonGenerated(true);
      setSuccess('¡Addon creado exitosamente! Puedes copiarlo e instalarlo en Stremio.');
    }
  }, [router.query.userId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    
    if (!imdbUserId.trim()) {
      setError('Please enter your IMDb User ID');
      return;
    }

    const userIdMatch = imdbUserId.match(/ur\d+/);
    if (!userIdMatch) {
      setError('Please enter a valid IMDb User ID (format: ur12345678)');
      return;
    }

    const userId = userIdMatch[0];
    setImdbUserId(userId);
    setIsLoading(true);

    try {
      // Test if we can fetch the watchlist
      const response = await fetch(`/api/imdb-watchlist?userId=${userId}`);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to connect to IMDb watchlist');
      }

      setAddonGenerated(true);
      setSuccess('¡Addon creado exitosamente! Puedes copiarlo e instalarlo en Stremio.');
    } catch (err) {
      setError(err.message || 'Failed to create addon');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    setImdbUserId('');
    setAddonGenerated(false);
    setError(null);
    setSuccess(null);
    router.push('/simple-dashboard', undefined, { shallow: true });
  };

  const addonUrl = addonGenerated && imdbUserId ? 
    `${typeof window !== 'undefined' ? window.location.origin : ''}/api/stremio/${imdbUserId}/manifest.json?v=${ADDON_VERSION}` : '';

  const copyToClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
      setSuccess('¡URL copiada al portapapeles!');
    } catch {
      setError('No se pudo copiar al portapapeles');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-pink-50 to-indigo-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-1/2 -left-1/2 w-96 h-96 bg-gradient-to-br from-purple-400/20 to-pink-400/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-1/2 -right-1/2 w-96 h-96 bg-gradient-to-br from-indigo-400/20 to-blue-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 pt-8 pb-4">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-center mb-8">
            <button
              onClick={() => router.push('/')}
              className="flex items-center space-x-2 text-gray-700 dark:text-gray-200 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="font-medium">Back</span>
            </button>
            <ThemeToggle />
          </div>
          
          <div className="text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-purple-500 via-pink-500 to-indigo-500 rounded-2xl mb-4 shadow-xl shadow-purple-500/25">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            
            <h1 className="text-3xl md:text-5xl font-bold bg-gradient-to-r from-purple-600 via-pink-500 to-indigo-600 bg-clip-text text-transparent mb-4">
              Create Your Addon
            </h1>
            
            <p className="text-lg text-gray-600 dark:text-gray-100 max-w-2xl mx-auto">
              Connect your IMDb watchlist to generate a personalized Stremio addon
            </p>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-300">App v{APP_VERSION} · Addon v{ADDON_VERSION}</p>
          </div>
        </div>
      </header>

      <main className="relative z-10 container mx-auto px-4 pb-12">
        <div className="max-w-2xl mx-auto">
          {!addonGenerated ? (
            /* Setup Form */
            <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-600/50 p-8">
              {error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/30 border-l-4 border-red-500 rounded-r-xl">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-red-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-red-700 dark:text-red-200 font-medium">{error}</p>
                  </div>
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label htmlFor="imdbUserId" className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">
                    IMDb User ID
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      id="imdbUserId"
                      value={imdbUserId}
                      onChange={(e) => setImdbUserId(e.target.value)}
                      placeholder="ur12345678"
                      className="w-full px-4 py-4 text-lg bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-2xl focus:border-purple-500 dark:focus:border-purple-400 focus:outline-none transition-all duration-200 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
                      required
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center pr-4">
                      <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                  </div>
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-300">
                    Your IMDb User ID (e.g., ur12345678) - make sure your watchlist is public
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-purple-600 via-pink-500 to-indigo-600 hover:from-purple-700 hover:via-pink-600 hover:to-indigo-700 text-white font-bold py-4 px-8 rounded-2xl transition-all duration-300 transform hover:scale-105 hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-lg shadow-xl shadow-purple-500/25"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                      </svg>
                      <span>Creating Addon...</span>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center space-x-2">
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                      </svg>
                      <span>Generate Addon</span>
                    </div>
                  )}
                </button>
              </form>
            </div>
          ) : (
            /* Success State */
            <div className="space-y-6">
              {success && (
                <div className="p-4 bg-green-50 dark:bg-green-900/30 border-l-4 border-green-500 rounded-r-xl">
                  <div className="flex items-center">
                    <svg className="w-5 h-5 text-green-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <p className="text-green-700 dark:text-green-200 font-medium">{success}</p>
                  </div>
                </div>
              )}

              <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-600/50 p-8">
                <div className="text-center mb-8">
                  <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-green-500 to-emerald-500 rounded-2xl mb-4 shadow-xl shadow-green-500/25">
                    <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Addon Ready!</h2>
                  <p className="text-gray-600 dark:text-gray-200">
                    Your personalized Stremio addon for <span className="font-mono text-purple-600 dark:text-purple-400 font-semibold">{imdbUserId}</span>
                  </p>
                </div>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">
                      Addon URL for Stremio
                    </label>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <input
                        type="text"
                        value={addonUrl}
                        readOnly
                        className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white font-mono text-sm"
                      />
                      <button
                        onClick={() => copyToClipboard(addonUrl)}
                        className="px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-purple-500/25 flex items-center justify-center space-x-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                        <span>Copy</span>
                      </button>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-800/40 dark:to-purple-800/40 rounded-2xl p-6 border border-indigo-200 dark:border-indigo-600/50">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center">
                      <svg className="w-5 h-5 text-indigo-600 dark:text-indigo-400 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      How to Install in Stremio
                    </h3>
                    <ol className="space-y-2 text-gray-700 dark:text-gray-200">
                      <li className="flex items-start">
                        <span className="inline-flex items-center justify-center w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full mr-3 mt-0.5">1</span>
                        <span>Open Stremio and go to the Addons section</span>
                      </li>
                      <li className="flex items-start">
                        <span className="inline-flex items-center justify-center w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full mr-3 mt-0.5">2</span>
                        <span>Paste the addon URL above in the "Addon Repository URL" field</span>
                      </li>
                      <li className="flex items-start">
                        <span className="inline-flex items-center justify-center w-6 h-6 bg-indigo-600 text-white text-xs font-bold rounded-full mr-3 mt-0.5">3</span>
                        <span>Click "Install" and enjoy your personalized IMDb watchlist!</span>
                      </li>
                    </ol>
                  </div>

                  <div className="flex flex-col gap-4">
                    <button
                      onClick={handleReset}
                      className="w-full px-6 py-3 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-semibold rounded-xl transition-all duration-200 flex items-center justify-center space-x-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      <span>Create Another</span>
                    </button>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <a
                        href="stremio:///"
                        className="flex-1 px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-emerald-500/25 flex items-center justify-center space-x-2"
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
                        className="flex-1 px-6 py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all duration-200 shadow-lg shadow-purple-500/25 flex items-center justify-center space-x-2"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9v-9m0-9v9" />
                        </svg>
                        <span>Open Stremio Web</span>
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              {/* Catalog Preview */}
              <CatalogPreview userId={imdbUserId} />
            </div>
          )}
        </div>
      </main>

      {/* Version Footer */}
      <footer className="py-4 mt-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Version {ADDON_VERSION} - Sort dropdown & newest-first ordering ✨
          </p>
        </div>
      </footer>
    </div>
  );
}
