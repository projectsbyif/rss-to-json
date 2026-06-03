# What this is
This repo runs a GitHub Actions workflow that fetches the [Writing by IF](https://medium.com/writing-by-if) Medium RSS feed and converts it to JSON.

It runs daily at 6:00 AM UTC, and saves the resulting JSON to [public/feed.json](public/feed.json).

With that, we can do things like render our own display cards for our Medium content on our website!

## How it works

- **Schedule:** The workflow runs daily at 06:00 UTC.
- **Fail-safe:** If the fetch fails, the previous `feed.json` is left untouched so the website keeps working.
- **Conversion package:** [`fetch-feed.js`](fetch-feed.js) does the conversion using `fast-xml-parser`.

## Common tasks

### Running the workflow manually
You can run the schedule manually, if needed. This is useful for testing after changing the URL or schedule, or for forcing a refresh.

1. Go to the **Actions** tab
2. Click **Update RSS Feed** in the sidebar
3. Click **Run workflow → Run workflow**

### Checking for failures
Failures appear as red ✗ runs in the **Actions** tab. Click into a failed run to see the error log. The most common causes are the Medium feed being temporarily unreachable (transient — next day's run will recover) or the feed structure changing (needs a code fix).

### Updating the RSS feed URL
The feed URL is stored as a repo secret, not in code, so it can be changed without a commit.

If the Medium RSS feed URL changes for any reason, you'll need to edit it on here to keep the workflow running

To update the RSS feed URL:
1. Navigate to **Settings** [on the top bar, next to Insights]
2. Scroll to **Secrets and variables** in the side bar, and click the dropdown
3. Click on **Actions**
4. Edit the **RSS_URL** secret to the new URL

### Changing the schedule
If you need to change the frequency or time with which the workflow updates, you'll want to edit the [update-feed.yml](.github/workflows/update-feed.yml) file.

1. Open up the [update-feed.yml](.github/workflows/update-feed.yml) file
2. Find the line that has `- cron: ' ... '`
3. Edit the cron expression to match your needs – use [Crontab.guru](https://crontab.guru/#0_6_*_*_*) to help you. 

#### Note on Timezones
GitHub Actions cron jobs always run in UTC. 

In the winter months, this is the same timezone as the UK.
In the summer (during British Summertime), this will run an hour later: `0 6 * * *` runs at 7:00 AM UK.