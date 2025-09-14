const { fetchWatchlist } = require('./lib/fetch-watchlist.ts');

async function testFetchWatchlist() {
  console.log('Testing fetchWatchlist with user ur31595220...');
  
  try {
    const watchlistItems = await fetchWatchlist('ur31595220');
    console.log(`Found ${watchlistItems.length} items in watchlist:`);
    console.log(JSON.stringify(watchlistItems, null, 2));
  } catch (error) {
    console.error('Error fetching watchlist:', error.message);
    console.error('Stack:', error.stack);
  }
}

testFetchWatchlist();