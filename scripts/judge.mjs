// Asks a model whether a video fits the taste described in taste.json.
// Fails closed: any error, timeout or odd answer means "not good enough".
export const clip = (s, n) => {
  const t = (s || '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…';
};

export const PASS_SCORE = 8;

export function buildMessages(v, taste, near = []) {
  const good = taste.good.map(x => `- "${x.title}" (${x.channel})`).join('\n');
  const bad = taste.bad.map(x => `- "${x.title}" (${x.channel})${x.why ? ` — ${x.why}` : ''}`).join('\n');
  const system = [
    'You pick videos for one person\'s daily "philosophy through stories" shelf. Judge by what the video is MAINLY ABOUT, using its title, channel and description.',
    `The rule: ${taste.rule}`,
    `Reject if:\n${taste.rejectIf.map(r => `- ${r}`).join('\n')}`,
    `Videos this person LOVES:\n${good}`,
    `Videos this person HATES:\n${bad}`,
    'Be strict: when unsure, score low. Titles that name famous philosophers or promise "explained" are a warning sign.',
    'Reply with JSON only: {"score": 0-10 integer, "reason": short, "blurb": one neutral sentence under 20 words on what the video explores, "ask": one reflective question under 20 words}.'
  ].join('\n\n');
  const closest = near.length ? `\nClosest videos this person already loves: ${near.map(t => `"${t}"`).join('; ')}. Judge whether this one has the same kind of feel, not just a similar topic.` : '';
  const user = `Title: ${v.snippet.title}\nChannel: ${v.snippet.channelTitle}\nDescription: ${clip(v.snippet.description, 900)}${closest}`;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

export function parseVerdict(raw) {
  try {
    const j = JSON.parse(String(raw).replace(/```json|```/g, '').trim());
    const score = Number(j.score);
    if (!Number.isFinite(score)) return null;
    return {
      score,
      reason: clip(j.reason || '', 160),
      blurb: j.blurb ? clip(j.blurb, 200) : '',
      ask: j.ask ? clip(j.ask, 200) : ''
    };
  } catch {
    return null;
  }
}

// llm comes from llm.mjs; it paces and retries by itself. Any failure means "no verdict".
export async function judge(v, taste, llm, opts = {}) {
  if (!llm) return null;
  const raw = await llm.chat(buildMessages(v, taste, opts.near || []), { temperature: 0 });
  return raw ? parseVerdict(raw) : null;
}
