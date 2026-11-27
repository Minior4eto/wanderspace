// Weekly discovery: finds new essay-style videos that fit the shelf, and appends them to videos.js.
// Needs YOUTUBE_API_KEY. GITHUB_TOKEN (models: read) is optional and only used to write blurbs.
// DRY_RUN=1 prints the picks and leaves videos.js alone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIN_SECS = 240;      // 4 minutes
const MAX_SECS = 1500;     // 25 minutes, the rule in the app
const MAX_ADD = 5;         // per run
const MAX_SHELF = 80;      // stop adding once the shelf is this big
const MIN_SCORE = 2;

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

// "PT1H2M3S" -> seconds
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
  return true;
}

export function scoreCandidate(v, cfg) {
  const t = textOf(v);
  const channel = (v.snippet?.channelTitle || '').toLowerCase();
  const hits = cfg.keywords.filter(k => t.includes(k.toLowerCase())).length;
  const trusted = cfg.trustedChannels.some(c => channel.includes(c.toLowerCase())) ? 3 : 0;
  return hits + trusted;
}

// details: videos.list items. Returns the best new picks: [{ v, secs, score }]
export function pickNew(details, cfg, known, limit = MAX_ADD) {
  return details
    .filter(v => isCandidate(v, cfg, known))
    .map(v => ({ v, secs: secsOf(v.contentDetails.duration), score: scoreCandidate(v, cfg) }))
    .filter(x => x.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
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
    id: v.id,
    title: v.snippet.title,
    by: v.snippet.channelTitle,
    secs,
    check: 'checked',
    themes: themesOf(v),
    blurb: copy.blurb,
    ask: copy.ask,
    lang: 'en'
  };
  const body = Object.entries(fields).map(([k, val]) => `    ${k}: ${JSON.stringify(val)}`).join(',\n');
  return `  {\n${body}\n  }`;
}

// Inserts entries at the end of the window.WANDERSPACE_VIDEOS array.
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
          {
            role: 'system',
            content: 'Reply with JSON only: {"blurb": one neutral sentence under 20 words saying what the video explores, no hype, "ask": one reflective question under 20 words}.'
          },
          {
            role: 'user',
            content: `Title: ${v.snippet.title}\nChannel: ${v.snippet.channelTitle}\nDescription: ${clip(v.snippet.description, 800)}`
          }
        ]
      })
    });
    if (!r.ok) return fallback;
    const raw = (await r.json()).choices[0].message.content.replace(/```json|```/g, '').trim();
    const j = JSON.parse(raw);
    return j.blurb && j.ask ? { blurb: clip(j.blurb, 200), ask: clip(j.ask, 200) } : fallback;
  } catch {
    return fallback;
  }
}

async function main() {
  const KEY = process.env.YOUTUBE_API_KEY;
  if (!KEY) {
    console.log('YOUTUBE_API_KEY is not set, nothing to do.');
    return;
  }
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'channels.json'), 'utf8'));
  const file = path.join(ROOT, 'videos.js');
  const src = fs.readFileSync(file, 'utf8');
  const known = new Set([...src.matchAll(/id:\s*['"]([^'"]+)['"]/g)].map(m => m[1]));
  const room = MAX_SHELF - known.size;
  if (room <= 0) {
    console.log('Shelf is full.');
    return;
  }

  const yt = async (endpoint, params) => {
    const qs = new URLSearchParams({ ...params, key: KEY });
    const r = await fetch(`https://www.googleapis.com/youtube/v3/${endpoint}?${qs}`);
    if (!r.ok) throw new Error(`${endpoint} ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r.json();
  };

  const since = new Date(Date.now() - 2 * 365 * 864e5).toISOString();
  const ids = new Set();
  for (const q of cfg.queries) {
    const r = await yt('search', {
      part: 'snippet', type: 'video', q, maxResults: '10', order: 'relevance',
      videoEmbeddable: 'true', videoDuration: 'any', publishedAfter: since, safeSearch: 'moderate'
    });
    for (const it of r.items ?? []) if (it.id?.videoId) ids.add(it.id.videoId);
  }

  const fresh = [...ids].filter(id => !known.has(id));
  const details = [];
  for (let i = 0; i < fresh.length; i += 50) {
    const r = await yt('videos', {
      part: 'snippet,contentDetails,status', id: fresh.slice(i, i + 50).join(','), maxResults: '50'
    });
    details.push(...(r.items ?? []));
  }

  const picks = pickNew(details, cfg, known, Math.min(MAX_ADD, room));
  if (!picks.length) {
    console.log('Nothing new passed the filters this week.');
    return;
  }

  const entries = [];
  for (const { v, secs } of picks) {
    const copy = await writeCopy(v, process.env.GITHUB_TOKEN);
    entries.push(entryFor(v, secs, copy));
    console.log(`+ ${v.id}  ${v.snippet.channelTitle} — ${v.snippet.title} (${Math.round(secs / 60)} min)`);
  }

  if (process.env.DRY_RUN === '1') {
    console.log('Dry run: videos.js not changed.');
    return;
  }
  fs.writeFileSync(file, appendEntries(src, entries));
  console.log(`Added ${entries.length} video(s).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
