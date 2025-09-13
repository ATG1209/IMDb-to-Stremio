const { parseWatchlist, parseRatings } = require('../../src/imdb/parser');
const formidable = require('formidable');
const fs = require('fs');

const config = {
  api: {
    bodyParser: false,
  },
};

async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({});
    const [_fields, files] = await form.parse(req);
    
    const result = {
      watchlist: [],
      ratings: [],
      stats: {}
    };

    // Process watchlist file
    if (files.watchlist && files.watchlist[0]) {
      const watchlistContent = fs.readFileSync(files.watchlist[0].filepath, 'utf8');
      result.watchlist = parseWatchlist(watchlistContent);
      result.stats.watchlistCount = result.watchlist.length;
    }

    // Process ratings file  
    if (files.ratings && files.ratings[0]) {
      const ratingsContent = fs.readFileSync(files.ratings[0].filepath, 'utf8');
      result.ratings = parseRatings(ratingsContent);
      result.stats.ratingsCount = result.ratings.length;
    }

    // Clean up temporary files
    if (files.watchlist?.[0]) fs.unlinkSync(files.watchlist[0].filepath);
    if (files.ratings?.[0]) fs.unlinkSync(files.ratings[0].filepath);

    res.status(200).json({
      success: true,
      message: 'Files processed successfully',
      data: result
    });

  } catch (error) {
    console.error('Error processing files:', error);
    res.status(500).json({ error: 'Failed to process files', details: error.message });
  }
}

module.exports = handler;
module.exports.config = config;
