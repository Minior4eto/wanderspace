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
  async function post(path, body) {
    for (let attempt = 1; attempt <= tries; attempt++) {
      try {
        const r = await fetchImpl(BASE + path, {
          method: 'POST',
          headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (r.ok) return await r.json();
        const text = (await r.text().catch(() => '')).slice(0, 200).replace(/\s+/g, ' ');
        log(`Gemini HTTP ${r.status}: ${text}`);
        if (r.status !== 429 && r.status < 500) return null;
        const after = Number(r.headers?.get?.('retry-after'));
        await sleep(Math.min(Number.isFinite(after) && after > 0 ? after * 1000 : 4000 * attempt, 20000));
      } catch (err) {
        log(`Gemini error: ${err.message}`);
        await sleep(5000);
      }
    }
    return null;
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
        const j = await post(`${m}:generateContent`, body);
        const text = j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('');
        if (text) return text;
        coolUntil[m] = Date.now() + 120000;
        log(`Model ${m} is not answering, trying the next one`);
      }
      return null;
    },
    async embed(texts) {
      const out = [];
      for (let i = 0; i < texts.length; i += 100) {
        const batch = texts.slice(i, i + 100);
        const j = await post('gemini-embedding-001:batchEmbedContents', {
          requests: batch.map(t => ({ model: 'models/gemini-embedding-001', content: { parts: [{ text: t }] }, taskType: 'SEMANTIC_SIMILARITY' }))
        });
        const e = j?.embeddings;
        if (!Array.isArray(e) || e.length !== batch.length) return null;
        out.push(...e.map(x => x.values));
      }
      return out;
    }
  };
}
