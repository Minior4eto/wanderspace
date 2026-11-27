// "Is this video like the ones already on the shelf?" as a number.
// Every video becomes a vector; a candidate scores high when it sits close to the loved videos
// and low when it sits close to the hated ones. Uses free GitHub Models embeddings when they
// answer, and falls back to plain TF-IDF word matching so the bot still works without them.
import { clip } from './judge.mjs';

const STOP = new Set(('the and for are but not you all any can had her was one our out has have this that with from they been were what when your will ' +
  'about which their there would could into than then them these those some such only over also just like more most very much how why who its ' +
  'video videos channel subscribe watch watching follow link links instagram twitter patreon music credits thanks https http www com').split(/\s+/));

export const docText = v => {
  const s = v.snippet || {};
  const tags = (s.tags || []).slice(0, 12).join(', ');
  return clip(`${s.title || v.title || ''}. ${s.channelTitle || v.by || ''}. ${tags}. ${s.description || v.blurb || ''}`, 700);
};

const words = t => (t.toLowerCase().match(/[a-z][a-z']{2,}/g) || []).filter(w => !STOP.has(w));

export function tfidf(texts) {
  const docs = texts.map(t => words(t));
  const df = new Map();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) || 0) + 1);
  const N = docs.length;
  return docs.map(d => {
    const tf = new Map();
    for (const w of d) tf.set(w, (tf.get(w) || 0) + 1);
    const vec = new Map();
    for (const [w, c] of tf) vec.set(w, (1 + Math.log(c)) * (Math.log((N + 1) / (df.get(w) + 1)) + 1));
    return vec;
  });
}

export function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  if (a instanceof Map) {
    for (const [, x] of a) na += x * x;
    for (const [, y] of b) nb += y * y;
    const [small, big] = a.size <= b.size ? [a, b] : [b, a];
    for (const [w, x] of small) { const y = big.get(w); if (y) dot += x * y; }
  } else {
    for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export async function vectorsFor(texts, llm) {
  const emb = llm ? await llm.embed(texts) : null;
  return emb ? { kind: 'embeddings', vecs: emb } : { kind: 'tfidf', vecs: tfidf(texts) };
}

const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

// vecs = [...good, ...bad, ...candidates]. Returns one result per candidate.
//   score = how close to the 3 nearest loved videos  -  half of how close to the nearest hated one.
export function scoreCandidates(vecs, nGood, nBad, { k = 3, badWeight = 0.5 } = {}) {
  const good = vecs.slice(0, nGood);
  const bad = vecs.slice(nGood, nGood + nBad);
  return vecs.slice(nGood + nBad).map(c => {
    const sims = good.map((g, i) => ({ i, s: cosine(c, g) })).sort((a, b) => b.s - a.s);
    const near = sims.slice(0, k);
    const sim = mean(near.map(x => x.s));
    const worst = bad.length ? Math.max(...bad.map(b => cosine(c, b))) : 0;
    return { sim, worst, score: sim - badWeight * worst, near: near.map(x => x.i) };
  });
}

// Search queries written from the shelf itself, so they change when the shelf does.
export async function queriesFromShelf(seeds, cfg, llm, count = 10) {
  const fixed = cfg.discoveryQueries || [];
  if (!llm) return fixed;
  const list = seeds.slice(0, 30).map(s => `- "${s.title}" (${s.by}): ${clip(s.about, 140)}`).join('\n');
  const messages = [
    {
      role: 'system',
      content: 'You help find YouTube videos that are similar to someone\'s favourites. The favourites are small-creator video essays that carry a philosophical idea through a specific story, character, painting, film, anime, book, myth or poem. ' +
        `Write ${count} different YouTube search queries (3 to 8 words each) that would surface MORE videos of that same kind. Name concrete subjects and moods, not abstract topics. ` +
        'Never use famous philosopher names, "stoicism", "explained", "in 5 minutes", "top 10" or "life lessons". Reply with a JSON array of strings only.'
    },
    { role: 'user', content: `Favourites:\n${list}` }
  ];
  try {
    const raw = await llm.chat(messages, { temperature: 0.9 });
    const arr = JSON.parse(String(raw || '').replace(/```json|```/g, '').trim());
    const made = (Array.isArray(arr) ? arr : []).filter(q => typeof q === 'string').map(q => clip(q, 80)).filter(Boolean);
    return [...new Set([...made, ...fixed])];
  } catch {
    return fixed;
  }
}
