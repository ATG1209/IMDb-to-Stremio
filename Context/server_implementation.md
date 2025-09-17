# Hosting a Stremio Addon with Remote Refresh

This document outlines the best approach for deploying and hosting the Stremio addon to a remote server, including a mechanism for periodic data refreshing.

## Recommended Hosting Platform: Vercel

Given that the project is built with Next.js, the most seamless and efficient hosting solution is **Vercel**. Vercel is created by the same team behind Next.js and offers a robust, serverless platform with native support for Next.js projects.

### Why Vercel?

*   **Effortless Deployment:** Vercel integrates directly with your Git repository (GitHub, GitLab, Bitbucket). Pushing changes to your main branch can automatically trigger a new deployment.
*   **Serverless Functions:** Your API routes (like the ones in `pages/api/`) are automatically deployed as serverless functions, which is ideal for a Stremio addon's manifest and catalog endpoints.
*   **Built-in Cron Jobs:** Vercel provides a simple way to schedule tasks, which directly addresses the requirement to refresh the IMDb watchlist every 6 hours.
*   **Generous Free Tier:** Vercel's free tier is often sufficient for many projects, including Stremio addons with moderate traffic.

## Deployment Steps

1.  **Push to a Git Repository:** If you haven't already, push your project to a GitHub, GitLab, or Bitbucket repository.

2.  **Create a Vercel Account:** Sign up for a free account on [vercel.com](https://vercel.com).

3.  **Import Your Project:** In your Vercel dashboard, import the Git repository you created in step 1. Vercel will automatically detect that it's a Next.js project and configure the build settings for you.

4.  **Configure Environment Variables:** Your application likely requires environment variables (e.g., API keys for TMDB, database connection strings, etc.). You can add these in the "Settings" -> "Environment Variables" section of your Vercel project. You should check your `.env.example` file for the required variables.

## Implementing the 6-Hour Refresh

To have the addon's data refresh every 6 hours, you can use Vercel's Cron Jobs feature. This is configured in a `vercel.json` file at the root of your project.

1.  **Create `vercel.json`:** Create a new file named `vercel.json` in the root of your project directory.

2.  **Add Cron Job Configuration:** Add the following content to your `vercel.json` file:

    ```json
    {
      "crons": [
        {
          "path": "/api/cron/sync-watchlist",
          "schedule": "0 */6 * * *"
        }
      ]
    }
    ```

### How This Works

*   `"path": "/api/cron/sync-watchlist"`: This tells Vercel to send a `GET` request to your `pages/api/cron/sync-watchlist.ts` endpoint.
*   `"schedule": "0 */6 * * *"`: This is a cron expression that means "at minute 0 of every 6th hour". This will trigger the refresh at approximately 00:00, 06:00, 12:00, and 18:00 UTC.

The `sync-watchlist.ts` file should contain the logic to fetch the latest data from IMDb and update your addon's data source.

By following these steps, your Stremio addon will be hosted remotely on Vercel and will automatically refresh its data every 6 hours.
