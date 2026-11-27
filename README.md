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

## Weekly discovery (automatic, with a review step)

`.github/workflows/discover.yml` runs every Sunday and starts from channels you approved (`approvedChannels` in `channels.json`), not from keywords.

- **videos** (default): takes recent uploads from approved channels, keeps those 4 to 25 minutes long with a good like-to-view ratio, at most 2 per channel, and opens a pull request. Nothing goes live until you merge it; Vercel builds a preview of the branch so you can see the picks first.
- **expand**: looks for similar channels (featured channels plus a few searches), drops big channels and content mills, and writes `channel-candidates.md` in a pull request. Approve a channel by adding its name to `approvedChannels` or its ID to `extraChannelIds`.
- Run either by hand: Actions → Discover videos → Run workflow. Tick `dry_run` to only print the result.
- Needs the repo secret `YOUTUBE_API_KEY`, and Settings → Actions → General → Workflow permissions set to read and write, with "Allow GitHub Actions to create and approve pull requests" ticked.
- Steer it in `channels.json`: `blockedChannels`, `blockedWords`, `blockedVideos` and the `limits`.

## Files

`index.html`, `styles.css`, `app.js`, `videos.js`, `channels.json`, `scripts/discover.mjs`, `.github/workflows/discover.yml`, `vendor/three.min.js` (three.js r150), `assets/favicon.svg`.
