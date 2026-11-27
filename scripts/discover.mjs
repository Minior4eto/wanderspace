// Channel-first discovery.
//   MODE=videos (default): new uploads from approved channels are appended to videos.js.
//   MODE=expand: looks for other channels with the same feel and writes channel-candidates.md.
// Needs YOUTUBE_API_KEY. GITHUB_TOKEN (models: read) is optional and only writes blurbs.
// DRY_RUN=1 prints what would change and leaves the files alone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIN_SECS = 240;   // 4 minutes
const MAX_SECS = 1500;  // 25 minutes, the rule in the app
const MAX_SHELF = 80;

const THEME_WORDS = {
  existentialism: ['existential', 'meaning of life', 'why we exist'],
  mortality: ['death', 'dying', 'mortal', 'grief'],
  stoicism: ['stoic', 'discipline', 'self-control'],
  meaning: ['meaning', 'purpose', 'fulfil'],
  identity: ['identity', 'self', 'who am i', 'mind', 'genius'],
  absurd: ['absurd', 'camus', 'sisyphus'],
  evil: ['evil', 'villain', 'monster'],
  love: ['love', 'heart', 'loneliness']
};

export function secsOf(iso = '') {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!m) return 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}

export const clip = (s, n) => {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
};

const textOf = v => `${v.snippet?.title ?? ''} ${v.snippet?.description ?? ''}`.toLowerCase();

export function themesOf(v) {
  const t = textOf(v);
  const found = Object.entries(THEME_WORDS)
    .filter(([, words]) => words.some(w => t.includes(w)))
    .map(([name]) => name);
  return found.length ? found : ['meaning'];
}

export function likeRatio(v) {
  const views = +v.statistics?.viewCount || 0;
  const likes = +v.statistics?.likeCount || 0;
  return views ? likes / views : 0;
}

// A video from an approved channel must still be embeddable, the right length and clean of junk words.
export function isCandidate(v, cfg, known) {
  if (!v?.id || known.has(v.id) || cfg.blockedVideos.includes(v.id)) return false;
  if (v.status?.embeddable !== true || v.status?.privacyStatus !== 'public') return false;
  if (v.contentDetails?.regionRestriction) return false;
  const secs = secsOf(v.contentDetails?.duration);
  if (secs < MIN_SECS || secs > MAX_SECS) return false;
  const channel = (v.snippet?.channelTitle || '').toLowerCase();
  if (cfg.blockedChannels.some(c => channel.includes(c.toLowerCase()))) return false;
  const t = textOf(v);
  if (cfg.blockedWords.some(w => t.includes(w.toLowerCase()))) return false;
  const views = +v.statistics?.viewCount || 0;
  if (views < cfg.limits.minViews) return false;
  if (likeRatio(v) < cfg.limits.minLikeRatio) return false;
  return true;
}

// Best like ratio first, at most `perChannelPerRun` per channel, at most `limit` overall.
export function pickNew(details, cfg, known, limit = cfg.limits.maxPerRun) {
  const ok = details.filter(v => isCandidate(v, cfg, known)).sort((a, b) => likeRatio(b) - likeRatio(a));
  const perChannel = new Map();
  const out = [];
  for (const v of ok) {
    const c = v.snippet.channelId || v.snippet.channelTitle;
    if ((perChannel.get(c) || 0) >= cfg.limits.perChannelPerRun) continue;
    perChannel.set(c, (perChannel.get(c) || 0) + 1);
    out.push({ v, secs: secsOf(v.contentDetails.duration) });
    if (out.length >= limit) break;
  }
  return out;
}

// Channel quality gate for the expand step: mid-size, not a content mill.
export function channelOk(ch, cfg, approved, now = Date.now()) {
  const L = cfg.limits;
  if (!ch || approved.has(ch.id)) return false;
  const name = (ch.snippet?.title || '').toLowerCase();
  if (cfg.blockedChannels.some(c => name.includes(c.toLowerCase()))) return false;
  if (ch.statistics?.hiddenSubscriberCount) return false;
  const subs = +ch.statistics?.subscriberCount || 0;
  const vids = +ch.statistics?.videoCount || 0;
  if (subs < L.candidateMinSubs || subs > L.candidateMaxSubs || vids < 5) return false;
  const ageDays = Math.max(30, (now - Date.parse(ch.snippet?.publishedAt || now)) / 864e5);
  return vids / ageDays <= L.candidateMaxUploadsPerDay;
}

// Share of a channel's recent titles that look like shorts, streams, playthroughs, reviews...
export function junkShare(titles, cfg) {
  if (!titles.length) return 1;
  const words = (cfg.junkTitleWords || []).map(w => w.toLowerCase());
  const bad = titles.filter(t => words.some(w => t.toLowerCase().includes(w)));
  return bad.length / titles.length;
}

export function fallbackCopy(v) {
  const first = (v.snippet?.description || '').split(/[.\n]/)[0].trim();
  return {
    blurb: clip(first || `A video essay by ${v.snippet?.channelTitle || 'its creator'}.`, 160),
    ask: 'What would you keep if you stopped trying to be impressive?'
  };
}

export function entryFor(v, secs, copy) {
  const fields = {
    id: v.id, title: v.snippet.title, by: v.snippet.channelTitle, secs, check: 'checked',
    themes: themesOf(v), blurb: copy.blurb, ask: copy.ask, lang: 'en'
  };
  const body = Object.entries(fields).map(([k, val]) => `    ${k}: ${JSON.stringify(val)}`).join(',\n');
  return `  {\n${body}\n  }`;
}

export function appendEntries(src, entries) {
  if (!entries.length) return src;
  const end = src.lastIndexOf('\n];');
  if (end === -1) throw new Error('videos.js: could not find the end of the list');
  let head = src.slice(0, end).replace(/\s*$/, '');
  if (!head.endsWith(',')) head += ',';
  return `${head}\n${entries.join(',\n')}${src.slice(end)}`;
}

async function writeCopy(v, token) {
  const fallback = fallbackCopy(v);
  if (!token) return fallback;
  try {
    const r = await fetch('https://models.github.ai/inference/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Reply with JSON only: {"blurb": one neutral sentence under 20 words saying what the video explores, no hype, "ask": one reflective question under 20 words}.' },
          { role: 'user', content: `Title: ${v.snippet.title}\nChannel: ${v.snippet.channelTitle}\nDescription: ${clip(v.snippet.description, 800)}` }
        ]
      })
    });
    if (!r.ok) return fallback;
    const j = JSON.parse((await r.json()).choices[0].message.content.replace(/```json|```/g, '').trim());
    return j.blurb && j.ask ? { blurb: clip(j.blurb, 200), ask: clip(j.ask, 200) } : fallback;
  } catch {
    return fallback;
  }
}

const chunk = (a, n) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

async function main() {
  const KEY = process.env.YOUTUBE_API_KEY;
  if (!KEY) { console.log('YOUTUBE_API_KEY is not set, nothing to do.'); return; }
  const MODE = process.env.MODE || 'videos';
  const DRY = process.env.DRY_RUN === '1';
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'channels.json'), 'utf8'));
  const file = path.join(ROOT, 'videos.js');
  const src = fs.readFileSync(file, 'utf8');
  const known = new Set([...src.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map(m => m[1]));

  const yt = async (endpoint, params) => {
    const r = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}?${new URLSearchParams({ ...params, key: KEY })}`);
    if (!r.ok) throw new Error(`${endpoint} ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.json();
  };

  // 1. Work out the approved channel IDs: from videos already on the shelf, plus any added by ID.
  const approvedNames = cfg.approvedChannels.map(n => n.toLowerCase());
  const seedIds = [];
  for (const m of src.matchAll(/id:\s*['"]([^'"]+)['"][\s\S]*?by:\s*['"]((?:[^'"\\]|\\.)*)['"]/g)) {
    if (approvedNames.includes(m[2].replace(/\\(.)/g, '$1').toLowerCase())) seedIds.push(m[1]);
  }
  const approved = new Set(cfg.extraChannelIds);
  for (const ids of chunk(seedIds, 50)) {
    const r = await yt('videos', { part: 'snippet', id: ids.join(','), maxResults: '50' });
    for (const v of r.items ?? []) approved.add(v.snippet.channelId);
  }
  console.log(`Approved channels: ${approved.size}`);

  const channels = [];
  for (const ids of chunk([...approved], 50)) {
    const r = await yt('channels', { part: 'snippet,contentDetails,statistics,brandingSettings', id: ids.join(','), maxResults: '50' });
    channels.push(...(r.items ?? []));
  }

  if (MODE === 'expand') {
    const found = new Set();
    for (const ch of channels)
      for (const id of ch.brandingSettings?.channel?.featuredChannelsUrls ?? []) found.add(id);
    for (const q of cfg.expandQueries) {
      const r = await yt('search', { part: 'snippet', type: 'channel', q, maxResults: '15' });
      for (const it of r.items ?? []) if (it.id?.channelId) found.add(it.id.channelId);
    }
    const pool = [];
    for (const ids of chunk([...found].filter(id => !approved.has(id)), 50)) {
      const r = await yt('channels', { part: 'snippet,contentDetails,statistics', id: ids.join(','), maxResults: '50' });
      pool.push(...(r.items ?? []));
    }
    const good = [];
    const lines = ['# Channel candidates', '', 'Mid-size channels that are not content mills and whose recent uploads are mostly essays. Tell Claude which to approve.', ''];
    for (const ch of pool.filter(ch => channelOk(ch, cfg, approved))) {
      const up = ch.contentDetails?.relatedPlaylists?.uploads;
      let titles = [];
      if (up) {
        try {
          const items = (await yt('playlistItems', { part: 'snippet', playlistId: up, maxResults: '10' })).items ?? [];
          titles = items.map(i => i.snippet.title);
        } catch { /* skip */ }
      }
      if (junkShare(titles, cfg) >= 0.3) continue;   // mostly shorts, streams, playthroughs, reviews
      good.push(ch);
      lines.push(`## ${ch.snippet.title}`, `https://www.youtube.com/channel/${ch.id}  ·  ${ch.statistics.subscriberCount} subs  ·  ${ch.statistics.videoCount} videos`, ...titles.slice(0, 5).map(t => `- ${t}`), '');
    }
    console.log(lines.join('\n'));
    if (!DRY) fs.writeFileSync(path.join(ROOT, 'channel-candidates.md'), lines.join('\n'));
    console.log(`${good.length} candidate channel(s) of ${pool.length} checked.`);
    return;
  }

  // MODE=videos
  const room = MAX_SHELF - known.size;
  if (room <= 0) { console.log('Shelf is full.'); return; }
  const fresh = [];
  for (const ch of channels) {
    const up = ch.contentDetails?.relatedPlaylists?.uploads;
    if (!up) continue;
    const items = (await yt('playlistItems', { part: 'contentDetails', playlistId: up, maxResults: '50' })).items ?? [];
    for (const it of items) if (!known.has(it.contentDetails.videoId)) fresh.push(it.contentDetails.videoId);
  }
  const details = [];
  for (const ids of chunk([...new Set(fresh)], 50)) {
    const r = await yt('videos', { part: 'snippet,contentDetails,status,statistics', id: ids.join(','), maxResults: '50' });
    details.push(...(r.items ?? []));
  }
  const maxAdd = +process.env.MAX_PER_RUN || cfg.limits.maxPerRun;
  const picks = pickNew(details, cfg, known, Math.min(maxAdd, room));
  if (!picks.length) { console.log('Nothing new passed the filters.'); return; }
  const entries = [];
  for (const { v, secs } of picks) {
    entries.push(entryFor(v, secs, await writeCopy(v, process.env.GITHUB_TOKEN)));
    console.log(`+ ${v.id}  ${v.snippet.channelTitle} — ${v.snippet.title} (${Math.round(secs / 60)} min, ${(likeRatio(v) * 100).toFixed(1)}% likes)`);
  }
  if (DRY) { console.log('Dry run: videos.js not changed.'); return; }
  fs.writeFileSync(file, appendEntries(src, entries));
  console.log(`Added ${entries.length} video(s).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => { console.error(err); process.exit(1); });
}
