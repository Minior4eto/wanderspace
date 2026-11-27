# WANDERSPACE

One philosophical YouTube video a day, 25 minutes or shorter. Static site: no build step, no backend, no tracking.

## Run it locally

```
python3 -m http.server 8000
```

Open http://localhost:8000. Use http(s) rather than double-clicking `index.html`. From `file://`, YouTube refuses embeds, so Watch opens YouTube in a new tab instead.

## Deploy

- **GitHub Pages:** push this folder to a repo, then Settings → Pages → deploy from the `main` branch, root folder.
- **Vercel:** import the repo, framework preset "Other", no build command, output directory `.`.

## What it does

- **Today's pick:** the same video all day, chosen by a seeded shuffle over local-date days. It cycles through every eligible video before repeating.
- **Refresh** (button or `R`): a random video from the current filter, avoiding recent repeats. `T` returns to today's pick.
- **Colour** (button or `C`): ten presets, a custom colour picker and "Drift", which cycles colours slowly. The whole UI and the particles change live. Your choice is saved on your device.
- **Filters, save (♡), watched (✓) and a private note per video:** stored in your browser's localStorage only.

## The 25-minute rule

A video is only in rotation if its length is known and ≤ 25:00.

- `secs` in `videos.js` is the length in seconds. `check: 'checked'` means I read it from a source; `'est'` (shown as "≈") means it is an estimate.
- On http(s) the page measures each video through the YouTube player and drops any over 25 minutes, plus any that are unavailable or embed-blocked.
- Entries with `secs: null` stay out of rotation until measured.

## Add videos

Append an entry to `videos.js`:

```js
{ id:'VIDEO_ID', title:'…', by:'Channel', secs:900, check:'est',
  themes:['meaning'], blurb:'One neutral sentence.', ask:'A question to carry.', lang:'en' }
```

Use `secs:null` if you don't know the length.

## Daily discovery (automatic)

`.github/workflows/discover.yml` runs every day at 06:17 UTC and looks for videos that resemble what is already on the shelf.

1. It reads every video on the shelf (real description and tags) as the examples to match, plus the hated ones in `taste.json`.
2. Candidates come from new uploads of approved channels and from YouTube searches that a model writes from the shelf (`discoveryQueries` in `channels.json` is the fallback). Videos from unknown channels need a mid-size, non-content-mill channel.
3. Every candidate is scored by how close it is to the three nearest loved videos, minus how close it is to the nearest hated one (free GitHub Models embeddings, or plain word matching if they are unavailable). The log prints the closest ones.
4. The judge (GitHub Models, free with the workflow's own token) then reads the top 40, sees which loved videos each resembles, and scores it 0 to 10 against `taste.json`. Only 8 and up pass. If the model is unavailable, nothing is added.
5. At most 2 per channel and 3 per run are added. With `"autoPublish": false` in `channels.json` they arrive as a pull request you can preview; set it to `true` to publish straight to `main`.

**Teaching it:** add a video you loved to `good` in `taste.json`, or one you hated to `bad` (with a `why`). It reads these every run.

- **expand** mode looks for similar channels, drops big ones, content mills and channels full of shorts and streams, and opens a pull request with `channel-candidates.md`. Approve a channel by adding its ID to `extraChannelIds`.
- Run by hand: Actions → Discover videos → Run workflow. Tick `dry_run` to print every verdict without changing anything.
- Needs the repo secret `YOUTUBE_API_KEY` and workflow permissions set to read and write.

## Keys

`R` refresh, `B` previous video, `T` back to today's pick, `C` colours, `Esc` close.

## Files

`index.html`, `styles.css`, `app.js`, `videos.js`, `channels.json`, `scripts/discover.mjs`, `.github/workflows/discover.yml`, `vendor/three.min.js` (three.js r150), `assets/favicon.svg`.
