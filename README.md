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

## Files

`index.html`, `styles.css`, `app.js`, `videos.js`, `vendor/three.min.js` (three.js r150), `assets/favicon.svg`.
