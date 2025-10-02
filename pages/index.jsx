import { useState } from 'react';
import { useRouter } from 'next/router';
import { ADDON_VERSION } from '../lib/version';
import ThemeToggle from '../components/ThemeToggle';

export default function Home() {
  const [imdbUserId, setImdbUserId] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const extractUserIdFromUrl = (input) => {
    const trimmed = input.trim();
    
    // If it's already a user ID format (ur12345678)
    if (/^ur\d+$/.test(trimmed)) {
      return trimmed;
    }
    
    // If it's a full URL
    const match = trimmed.match(/\/user\/(ur\d+)/);
    if (match) {
      return match[1];
    }
    
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!imdbUserId.trim()) return;

    setIsLoading(true);

    const userId = extractUserIdFromUrl(imdbUserId);
    if (!userId) {
      alert('Please enter a valid IMDb User ID (format: ur12345678) or IMDb profile URL');
      setIsLoading(false);
      return;
    }

    // Navigate to new persistent dashboard
    router.push(`/dashboard/${userId}`);
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
        <div className="container mx-auto px-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">IM</span>
            </div>
            <span className="font-semibold text-gray-900 dark:text-white">IMDb → Stremio</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 flex items-center justify-center min-h-[calc(100vh-200px)]">
        <div className="w-full max-w-lg mx-auto px-4">
          {/* Hero Section */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-purple-500 via-pink-500 to-indigo-500 rounded-2xl mb-6 shadow-2xl shadow-purple-500/25 animate-bounce">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            
            <h1 className="text-4xl md:text-6xl font-bold bg-gradient-to-r from-purple-600 via-pink-500 to-indigo-600 bg-clip-text text-transparent mb-4 leading-tight">
              Connect Your
              <br />
              IMDb Watchlist
            </h1>
            
            <p className="text-xl text-gray-600 dark:text-gray-100 mb-2 max-w-md mx-auto">
              Transform your IMDb watchlist into a personalized Stremio addon
            </p>

            <p className="text-sm text-gray-500 dark:text-gray-300 mt-3 max-w-md mx-auto">
              Your dashboard will be at: <code className="px-2 py-1 bg-purple-100 dark:bg-purple-800 rounded text-purple-700 dark:text-purple-200 font-mono">/dashboard/ur12345678</code>
            </p>
            
            <div className="flex flex-wrap justify-center gap-4 text-sm">
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-green-100 dark:bg-green-800 text-green-700 dark:text-green-100 rounded-full">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Auto-sync
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-blue-100 dark:bg-blue-800 text-blue-700 dark:text-blue-100 rounded-full">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Secure
              </span>
              <span className="inline-flex items-center gap-2 px-3 py-1 bg-purple-100 dark:bg-purple-800 text-purple-700 dark:text-purple-100 rounded-full">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Instant
              </span>
            </div>
          </div>

          {/* Connection Form */}
          <div className="bg-white/90 dark:bg-gray-800/90 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/20 dark:border-gray-600/50 p-8">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label htmlFor="imdbUserId" className="block text-sm font-semibold text-gray-900 dark:text-white mb-3">
                  IMDb Profile URL or User ID
                </label>
                <div className="relative">
                  <input
                    type="text"
                    id="imdbUserId"
                    value={imdbUserId}
                    onChange={(e) => setImdbUserId(e.target.value)}
                    placeholder="https://www.imdb.com/user/ur12345678 or ur12345678"
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
                  Make sure your IMDb watchlist is public
                </p>
              </div>

              <button
                type="submit"
                disabled={isLoading || !imdbUserId.trim()}
                className="w-full bg-gradient-to-r from-purple-600 via-pink-500 to-indigo-600 hover:from-purple-700 hover:via-pink-600 hover:to-indigo-700 text-white font-bold py-4 px-8 rounded-2xl transition-all duration-300 transform hover:scale-105 hover:shadow-2xl disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none text-lg shadow-xl shadow-purple-500/25"
              >
                {isLoading ? (
                  <div className="flex items-center justify-center space-x-2">
                    <svg className="w-6 h-6 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"></path>
                    </svg>
                    <span>Connecting...</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center space-x-2">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                    </svg>
                    <span>Create My Addon</span>
                  </div>
                )}
              </button>
            </form>

            {/* Help Section */}
            <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-600">
              <details className="group">
                <summary className="flex items-center justify-between cursor-pointer text-gray-700 dark:text-gray-200 hover:text-purple-600 dark:hover:text-purple-400 transition-colors">
                  <span className="text-sm font-medium">Need help finding your User ID?</span>
                  <svg className="w-4 h-4 transition-transform group-open:rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </summary>
                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm text-gray-600 dark:text-gray-300">
                  <ol className="list-decimal list-inside space-y-2">
                    <li>Go to your IMDb profile</li>
                    <li>Copy the URL (looks like: imdb.com/user/ur12345678)</li>
                    <li>Make sure your watchlist is set to public in your privacy settings</li>
                    <li>Paste the URL or just the User ID (ur12345678) above</li>
                  </ol>
                </div>
              </details>
            </div>
          </div>
        </div>
      </main>

      {/* Version Footer */}
      <footer className="relative z-10 py-4 mt-8">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Version {ADDON_VERSION} - Recently Added default ✨
          </p>
        </div>
      </footer>
    </div>
  );
}
