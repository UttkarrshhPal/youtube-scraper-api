import { PlaywrightCrawler, Dataset } from 'crawlee';
import { v4 as uuidv4 } from 'uuid';

export async function scrapePlaylist(playlistUrl) {
  if (!playlistUrl) {
    throw new Error("Playlist URL is required");
  }

  const playlistId = new URL(playlistUrl).searchParams.get("list");
  if (!playlistId) {
    throw new Error("Invalid playlist URL");
  }

  const uuid = uuidv4();
  const dataset = await Dataset.open(`playlist-${uuid}`);

  const crawler = new PlaywrightCrawler({
    maxRequestsPerCrawl: 50,
    async requestHandler({ request, page, log }) {
      log.info(`Processing ${request.url}...`);

      await page.waitForSelector("#contents ytd-playlist-video-renderer", {
        timeout: 30000,
      });

      await page.evaluate(async () => {
        while (true) {
          const oldHeight = document.body.scrollHeight;
          window.scrollTo(0, document.body.scrollHeight);
          await new Promise((resolve) => setTimeout(resolve, 2000));
          if (document.body.scrollHeight === oldHeight) break;
        }
      });

      const videos = await page.$$eval(
        "#contents ytd-playlist-video-renderer",
        (elements) => {
          return elements.map((el) => {
            const title =
              el.querySelector("#video-title")?.textContent?.trim() || "";
            const viewsText =
              el.querySelector("#video-info span")?.textContent?.trim() || "";
            const thumbnail = el.querySelector("img")?.src || "";

            const viewsMatch = viewsText.match(/^([\d,.]+[KMB]?)\s*views?$/i);
            let views = 0;
            if (viewsMatch) {
              const viewString = viewsMatch[1].toUpperCase().replace(/,/g, "");
              if (viewString.endsWith("K"))
                views = parseFloat(viewString) * 1000;
              else if (viewString.endsWith("M"))
                views = parseFloat(viewString) * 1000000;
              else if (viewString.endsWith("B"))
                views = parseFloat(viewString) * 1000000000;
              else views = parseInt(viewString);
            }

            return { title, views, thumbnail };
          });
        }
      );

      log.info(`Found ${videos.length} videos in the playlist`);

      await dataset.pushData({ videos });

      const nextButton = await page.$('tp-yt-paper-button[aria-label="Next"]');
      if (nextButton) {
        const nextPageUrl = await nextButton.evaluate((el) =>
          el.getAttribute("href")
        );
        if (nextPageUrl) {
          log.info(`Queueing next page: https://www.youtube.com${nextPageUrl}`);
          await crawler.addRequest({ url: `https://www.youtube.com${nextPageUrl}` });
        }
      }
    },

    failedRequestHandler({ request, log }) {
      log.error(`Request ${request.url} failed too many times.`);
    },
  });

  try {
    await crawler.run([
      { url: playlistUrl, uniqueKey: `${playlistUrl}:${uuid}` },
    ]);

    const results = await dataset.getData();
    const videos = (results.items[0]?.videos) || [];

    const graphData = videos.map((video, index) => ({
      name: `Video ${index + 1}`,
      views: video.views,
    }));

    const playlistData = {
      videoList: videos,
      graphData: graphData,
    };

    await dataset.drop();

    return playlistData;
  } catch (error) {
    console.error("Crawling failed:", error);
    await dataset.drop();
    throw new Error("An error occurred while scraping the playlist");
  }
}
