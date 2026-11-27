// Similarity-first discovery.
//   MODE=videos (default): finds videos close to the shelf (uploads of approved channels plus searches
//   written from the shelf), ranks them by similarity, has the judge decide, appends to videos.js.
//   MODE=expand: looks for other channels with the same feel and writes channel-candidates.md.
// Needs YOUTUBE_API_KEY and GEMINI_API_KEY (free, aistudio.google.com).
// DRY_RUN=1 prints what would change and leaves the files alone.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { clip, judge, PASS_SCORE } from './judge.mjs';
import { makeLlm } from './llm.mjs';
import { docText, queriesFromShelf, scoreCandidates, vectorsFor } from './similarity.mjs';

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

export { clip };
export function secsOf(iso = '') {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso);
  if (!m) return 0;
  return (+m[1] || 0) * 3600 + (+m[2] || 0) * 60 + (+m[3] || 0);
}


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

// Everything that passes the cheap filters, best like ratio first.
export function rankCandidates(details, cfg, known) {
  return details.filter(v => isCandidate(v, cfg, known)).sort((a, b) => likeRatio(b) - likeRatio(a));
}

// Keeps the order given, at most `perChannelPerRun` per channel and `limit` overall.
export function capPerChannel(items, cfg, limit = cfg.limits.maxPerRun) {
  const perChannel = new Map();
  const out = [];
  for (const it of items) {
    const c = it.v.snippet.channelId || it.v.snippet.channelTitle;
    if ((perChannel.get(c) || 0) >= cfg.limits.perChannelPerRun) continue;
    perChannel.set(c, (perChannel.get(c) || 0) + 1);
    out.push(it);
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
  const log = m => console.log(`  ! ${m}`);
  const llm = makeLlm(process.env.GEMINI_API_KEY, { log });
  if (!llm) { console.log('No GEMINI_API_KEY, so nothing can be judged. Adding nothing.'); return; }
  const taste = JSON.parse(fs.readFileSync(path.join(ROOT, 'taste.json'), 'utf8'));
  const maxAdd = +process.env.MAX_PER_RUN || cfg.limits.maxPerRun;

  // 1. The shelf is the teacher: every video on it, with its real description and tags.
  const win = {};
  vm.runInNewContext(src, { window: win });
  const entries = win.WANDERSPACE_VIDEOS || [];
  const apiShelf = new Map();
  for (const ids of chunk(entries.map(e => e.id), 50)) {
    const r = await yt('videos', { part: 'snippet', id: ids.join(','), maxResults: '50' });
    for (const v of r.items ?? []) apiShelf.set(v.id, v);
  }
  const seeds = entries.map(e => ({ title: e.title, by: e.by, about: e.blurb || '', doc: docText(apiShelf.get(e.id) || e) }));
  const badDocs = taste.bad.map(b => `${b.title}. ${b.channel}. ${b.why || ''}`);
  console.log(`Learning from ${seeds.length} loved video(s) and ${badDocs.length} hated one(s).`);

  // 2. Candidates from two places: new uploads of approved channels, and searches written from the shelf.
  const fromSearch = new Set();
  const fresh = [];
  for (const ch of channels) {
    const up = ch.contentDetails?.relatedPlaylists?.uploads;
    if (!up) continue;
    const items = (await yt('playlistItems', { part: 'contentDetails', playlistId: up, maxResults: '50' })).items ?? [];
    for (const it of items) if (!known.has(it.contentDetails.videoId)) fresh.push(it.contentDetails.videoId);
  }
  const queries = (await queriesFromShelf(seeds, cfg, llm, 10)).slice(0, +process.env.SEARCHES || 12);
  console.log(`Searching for: ${queries.map(q => `"${q}"`).join(', ')}`);
  for (const q of queries) {
    try {
      const r = await yt('search', { part: 'id', type: 'video', q, videoDuration: 'medium', videoEmbeddable: 'true', relevanceLanguage: 'en', maxResults: '25' });
      for (const it of r.items ?? []) if (it.id?.videoId && !known.has(it.id.videoId)) { fresh.push(it.id.videoId); fromSearch.add(it.id.videoId); }
    } catch (err) {
      console.log(`  search stopped: ${String(err.message).slice(0, 120)}`);
      break;
    }
  }
  const details = [];
  for (const ids of chunk([...new Set(fresh)], 50)) {
    const r = await yt('videos', { part: 'snippet,contentDetails,status,statistics', id: ids.join(','), maxResults: '50' });
    details.push(...(r.items ?? []));
  }
  // A video found by search from a channel we do not know must come from a decent mid-size channel.
  const strangers = [...new Set(details.filter(v => !approved.has(v.snippet.channelId)).map(v => v.snippet.channelId))];
  const okStranger = new Set();
  for (const ids of chunk(strangers, 50)) {
    const r = await yt('channels', { part: 'snippet,statistics', id: ids.join(','), maxResults: '50' });
    for (const ch of r.items ?? []) if (channelOk(ch, cfg, approved)) okStranger.add(ch.id);
  }
  const pool = details.filter(v => isCandidate(v, cfg, known) && (approved.has(v.snippet.channelId) || okStranger.has(v.snippet.channelId)));
  console.log(`${details.length} video(s) found, ${pool.length} passed the cheap filters (${pool.filter(v => fromSearch.has(v.id)).length} from searches).`);
  if (!pool.length) { console.log('Nothing to look at.'); return; }

  // 3. Rank by how close each one is to the shelf and how far from the hated examples.
  const { kind, vecs } = await vectorsFor([...seeds.map(s => s.doc), ...badDocs, ...pool.map(docText)], llm);
  const scored = scoreCandidates(vecs, seeds.length, badDocs.length).map((r, i) => ({ v: pool[i], ...r }));
  scored.sort((a, b) => b.score - a.score);
  console.log(`Similarity measured with ${kind}. Closest to the shelf:`);
  for (const c of scored.slice(0, 15))
    console.log(`  ${c.score.toFixed(3)}  ${c.v.snippet.channelTitle} — ${c.v.snippet.title}  [like: ${seeds[c.near[0]]?.title}]`);
  /* at most 3 per channel go to the judge, so one favourite channel cannot use up the whole budget */
  const perCh = {}, toJudge = [];
  for (const c of scored) {
    const ch = c.v.snippet.channelId;
    if ((perCh[ch] = (perCh[ch] || 0) + 1) > 3) continue;
    toJudge.push(c);
    if (toJudge.length >= (+process.env.JUDGE_LIMIT || 40)) break;
  }

  // 4. The judge has the last word, and sees which loved videos each one resembles.
  const PACE = process.env.PACE_MS !== undefined ? +process.env.PACE_MS : 6500;
  const accepted = [];
  let answered = 0, misses = 0;
  const deadline = Date.now() + (+process.env.JUDGE_BUDGET_MS || 13 * 60e3);
  for (const c of toJudge) {
    if (Date.now() > deadline) { console.log('Out of time for judging, using what was found so far.'); break; }
    if (accepted.length >= 10) { console.log('Found plenty, stopping the judge here.'); break; }
    const v = c.v;
    const verdict = await judge(v, taste, llm, { near: c.near.map(i => seeds[i].title) });
    if (!verdict) {
      console.log(`? ${v.snippet.channelTitle} — ${v.snippet.title}: no verdict`);
      if (!answered && ++misses >= 4) { console.log('The judge is not answering, stopping early.'); break; }
    } else {
      answered++;
      const tag = verdict.score >= PASS_SCORE ? 'KEEP' : 'drop';
      console.log(`${tag} ${verdict.score}/10  ${v.snippet.channelTitle} — ${v.snippet.title}  (${verdict.reason})`);
      if (verdict.score >= PASS_SCORE) accepted.push({ v, verdict, sim: c.score, secs: secsOf(v.contentDetails.duration) });
    }
    if (PACE) await new Promise(r => setTimeout(r, PACE));
  }
  if (!answered) { console.log('The judge gave no answers, so nothing is added.'); return; }
  accepted.sort((a, b) => b.verdict.score - a.verdict.score || b.sim - a.sim);
  const picks = capPerChannel(accepted, cfg, Math.min(maxAdd, room));
  if (!picks.length) { console.log('Nothing was good enough.'); return; }
  const out = [];
  for (const { v, secs, verdict } of picks) {
    const copy = verdict.blurb && verdict.ask ? { blurb: verdict.blurb, ask: verdict.ask } : fallbackCopy(v);
    out.push(entryFor(v, secs, copy));
    console.log(`+ ${v.id}  ${v.snippet.channelTitle} — ${v.snippet.title} (${Math.round(secs / 60)} min, score ${verdict.score})`);
  }
  if (DRY) { console.log('Dry run: videos.js not changed.'); return; }
  fs.writeFileSync(file, appendEntries(src, out));
  console.log(`Added ${out.length} video(s).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch(err => { console.error(err); process.exit(1); });
}
