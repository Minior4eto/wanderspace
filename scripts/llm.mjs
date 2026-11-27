// The free model used by the bot: Google's Gemini API (free tier, key from aistudio.google.com).
// Every call fails soft: null means "no answer", and the callers then add nothing.
const wait = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

export function makeLlm(key, { fetchImpl = fetch, sleep = wait, log = () => {}, model = process.env.GEMINI_MODEL, tries = 2 } = {}) {
  if (!key) return null;
  /* when one model is overloaded (503) or out of quota (429) the next one is tried, instead of waiting it out */
  let models = [...new Set([model, 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean))];
  const coolUntil = {};
  let listed = false;
  /* model names change over time, so ask Google which flash models this key can use right now */
  async function discoverModels() {
    listed = true;
    try {
      const r = await fetchImpl(BASE.replace(/models\/$/, 'models') + '?pageSize=200', { headers: { 'x-goog-api-key': key } });
      if (!r.ok) { log(`Gemini model list HTTP ${r.status}`); return; }
      const j = await r.json();
      const ver = n => Number((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1]) || 0;
      const found = (j.models || [])
        .filter(m => (m.supportedGenerationMethods || []).includes('generateContent'))
        .map(m => m.name.replace(/^models\//, ''))
        .filter(n => /^gemini-[\d.]+-flash/.test(n) && !/image|tts|audio|live|thinking|exp|vision|embedding|robotics|computer/.test(n))
        .sort((a, b) => (/lite/.test(a) - /lite/.test(b)) || (ver(b) - ver(a)) || (/preview/.test(a) - /preview/.test(b)));
      models = [...new Set([model, ...found.slice(0, 4), 'gemini-flash-latest', 'gemini-flash-lite-latest'].filter(Boolean))];
      log(`Gemini models to try: ${models.join(', ')}`);
    } catch (err) { log(`Gemini model list error: ${err.message}`); }
  }
  /* returns { json } on success, or { status, perDay } on failure. Rate limits (429) are never waited out here:
     the caller moves to another model, and only an overloaded model (503) gets one quick second try. */
  async function post(path, body, { retry503 = 1, wait429 = 0 } = {}) {
    for (let attempt = 0; attempt <= Math.max(retry503, wait429); attempt++) {
      try {
        const r = await fetchImpl(BASE + path, {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (r.ok) return { json: await r.json() };
        const raw = (await r.text().catch(() => '')).replace(/\s+/g, ' ');
        log(`Gemini HTTP ${r.status}: ${raw.slice(0, 160)}`);
        const perDay = /PerDay|per day/i.test(raw);
        if (r.status === 429) {
          if (attempt < wait429 && !perDay) { await sleep(62000); continue; }
          return { status: 429, perDay };
        }
        if (r.status >= 500 && attempt < retry503) { await sleep(3000); continue; }
        return { status: r.status };
      } catch (err) {
        log(`Gemini error: ${err.message}`);
        if (attempt >= retry503) return { status: 0 };
        await sleep(3000);
      }
    }
    return { status: 0 };
  }
  return {
    async chat(messages, { temperature = 0 } = {}) {
      const system = messages.find(m => m.role === 'system')?.content;
      const user = messages.filter(m => m.role !== 'system').map(m => m.content).join('\n\n');
      const body = {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature, responseMimeType: 'application/json' }
      };
      if (!listed) await discoverModels();
      for (const m of models) {
        if (coolUntil[m] > Date.now()) continue;
        const r = await post(`${m}:generateContent`, body);
        const text = r.json?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
        if (text) return text;
        coolUntil[m] = Date.now() + (r.perDay ? 6 * 3600e3 : r.status === 429 ? 90e3 : r.status === 404 ? 6 * 3600e3 : 60e3);
        log(`Model ${m} is not answering, trying the next one`);
      }
      return null;
    },
    async embed(texts) {
      const out = [];
      /* the free tier counts every text, about 100 a minute, so wait out a rate limit once per batch */
      for (let i = 0; i < texts.length; i += 80) {
        const batch = texts.slice(i, i + 80);
        const r = await post('gemini-embedding-001:batchEmbedContents', {
          requests: batch.map(t => ({ model: 'models/gemini-embedding-001', content: { parts: [{ text: t }] }, taskType: 'SEMANTIC_SIMILARITY' }))
        }, { retry503: 1, wait429: 3 });
        const e = r.json?.embeddings;
        if (!Array.isArray(e) || e.length !== batch.length) return null;
        out.push(...e.map(x => x.values));
      }
      return out;
    }
  };
}
