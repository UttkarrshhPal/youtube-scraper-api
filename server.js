import express from 'express';
import { scrapePlaylist } from './scraper.js';  // Corrected import

const app = express();
const PORT = 3000;

app.get('/analyze_playlist', async (req, res) => {
  const { link } = req.query;

  if (!link) {
    return res.status(400).json({ error: 'Playlist link is required' });
  }

  try {
    const data = await scrapePlaylist(link); // Correct function call
    res.json({
      videoCount: data.videoList.length,  // Adjusted based on your scraper's response structure
      videos: data.videoList,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to scrape playlist' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
