const test = require('node:test');
const assert = require('node:assert');
const { parseWatchlist, parseRatings } = require('../dist/imdb/parser.js');

test('parseWatchlist parses items', () => {
  const csv = 'const,Title,Year,Title Type\n' +
    'tt0133093,The Matrix,1999,movie';
  const items = parseWatchlist(csv);
  assert.deepStrictEqual(items, [{
    imdbId: 'tt0133093',
    title: 'The Matrix',
    year: 1999,
    type: 'movie'
  }]);
});

test('parseRatings parses items', () => {
  const csv = 'const,Title,Year,Your Rating,Date Rated\n' +
    'tt0137523,Fight Club,1999,9,2024-01-01';
  const items = parseRatings(csv);
  assert.deepStrictEqual(items, [{
    imdbId: 'tt0137523',
    title: 'Fight Club',
    year: 1999,
    rating: 9,
    ratedAt: '2024-01-01'
  }]);
});
