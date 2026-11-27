// The free model used by the bot: Google's Gemini API (free tier, key from aistudio.google.com).
// Every call fails soft: null means "no answer", and the callers then add nothing.
const wait = ms => new Promise(r => setTimeout(r, ms));
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';

export function makeLlm(key, { fetchImpl = fetch, sleep = wait, log = () => {}, model = process.env.GEMINI_MODEL || 'gemini-flash-latest', tries = 4 } = {}) {
  if (!key) return null;
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
        await sleep(Math.min(Number.isFinite(after) && after > 0 ? after * 1000 : 15000 * attempt, 90000));
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
      const j = await post(`${model}:generateContent`, {
        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
        contents: [{ role: 'user', parts: [{ text: user }] }],
        generationConfig: { temperature, responseMimeType: 'application/json' }
      });
      return j?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || null;
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
