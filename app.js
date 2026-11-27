/* WANDERSPACE — app logic.
   Sections: data · helpers · colour themes · 3D scene (scene.js) · length check
             · picking · rendering · views · actions · watch page · wiring    */
(() => {
  'use strict';

  /* ───────────────────────────── data ───────────────────────────── */
  const MAX_SECS = 25 * 60;
  const RAW = Array.isArray(window.WANDERSPACE_VIDEOS) ? window.WANDERSPACE_VIDEOS : [];
  const VIDEOS = RAW.map((v, i) => Object.assign({ n: i + 1, blocked: false, dead: false, noEmbed: false }, v));
  const BY_ID = new Map(VIDEOS.map(v => [v.id, v]));
  const THEME_ORDER = ['existentialism', 'mortality', 'stoicism', 'meaning', 'identity', 'absurd', 'evil', 'love'];
  const IS_FILE = location.protocol === 'file:';

  const KEYS = {
    saved: 'wanderspace:saved:v1',
    watched: 'wanderspace:watched:v1',
    notes: 'wanderspace:notes:v1',
    theme: 'wanderspace:theme:v2',
    lens: 'wanderspace:len:v1'
  };

  /* ──────────────────────────── helpers ─────────────────────────── */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pad2 = n => String(n).padStart(2, '0');
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

  const load = (key, fallback) => {
    try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : fallback; }
    catch (e) { return fallback; }
  };
  const store = (key, value) => {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (e) { return false; }
  };

  const saved = new Set(load(KEYS.saved, []));
  const watched = new Set(load(KEYS.watched, []));
  const notes = load(KEYS.notes, {}) || {};
  /* lengths measured in an earlier visit, so a video's place in the daily order never depends on timing */
  const lens = load(KEYS.lens, {}) || {};
  VIDEOS.forEach(v => { if (v.secs === null && lens[v.id] > 0) { v.secs = lens[v.id]; v.check = 'checked'; } });

  const state = {
    current: null,
    view: 'today',        // 'today' | 'explore' | 'saved' | 'watch'
    from: 'today',        // where the watch page returns to
    env: null,            // an environment picked by hand from the cards
    mode: 'today',        // 'today' | 'random' | 'chosen'
    chosen: false,        // user clicked this one on purpose (never auto-skipped)
    filter: 'all',
    recent: [],
    history: [],          // what was on screen before, newest last (for the Previous button)
    notice: '',
    noticeTimer: 0
  };

  const fmtClock = s => `${pad2(Math.floor(s / 60))}:${pad2(Math.round(s % 60))}`;
  const durBadge = v => {
    if (v.dead) return 'N/A';
    if (v.secs === null) return '--:--';
    if (v.check === 'checked') return fmtClock(v.secs);
    return `≈${Math.max(1, Math.round(v.secs / 60))} MIN`;
  };
  const durLong = v => {
    if (v.dead) return 'unavailable';
    if (v.secs === null) return 'length not checked yet';
    if (v.check === 'checked') {
      const m = Math.floor(v.secs / 60), s = Math.round(v.secs % 60);
      return `${m} min${s ? ` ${pad2(s)} sec` : ''}`;
    }
    return `about ${Math.max(1, Math.round(v.secs / 60))} min`;
  };
  const eligible = v => !v.blocked && !v.dead && v.secs !== null && v.secs <= MAX_SECS;
  const ytUrl = v => `https://www.youtube.com/watch?v=${v.id}`;
  const thumbUrl = v => `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
  const trunc = (s, n = 34) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

  function localDayKey(d = new Date()) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
  function dayOrdinal(d = new Date()) { return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5); }
  function dayOfYear(d = new Date()) { return dayOrdinal(d) - Math.floor(Date.UTC(d.getFullYear(), 0, 0) / 864e5); }
  function daysInYear(d = new Date()) { const y = d.getFullYear(); return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365; }

  function mulberry32(a) {
    return () => {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function seededShuffle(arr, seed) {
    const rnd = mulberry32(seed), a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  }

  /* ─────────────────────────── colour themes ────────────────────── */
  const PRESETS = [
    { id: 'lavender', name: 'Lavender', hex: '#aa88ff' },
    { id: 'ember',    name: 'Ember',    hex: '#ff7849' },
    { id: 'crimson',  name: 'Crimson',  hex: '#ff3b52' },
    { id: 'rose',     name: 'Rose',     hex: '#ff6b9d' },
    { id: 'gold',     name: 'Gold',     hex: '#f4c542' },
    { id: 'jade',     name: 'Jade',     hex: '#35e0a1' },
    { id: 'ice',      name: 'Ice',      hex: '#5cc8ff' },
    { id: 'bone',     name: 'Bone',     hex: '#e6e2d6' },
    { id: 'mono',     name: 'Mono',     hex: '#ffffff' },
    { id: 'drift',    name: 'Drift (slowly cycles)', hex: null }
  ];

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || ''));
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0; const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s, l];
  }
  function hslToRgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    if (s === 0) return [l, l, l];
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
    const f = t => {
      if (t < 0) t += 1; if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [f(h + 1 / 3), f(h), f(h - 1 / 3)];
  }
  const toHex = rgb => '#' + rgb.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('');
  const hslCss = (h, s, l) => `hsl(${h.toFixed(1)} ${(s * 100).toFixed(1)}% ${(l * 100).toFixed(1)}%)`;

  /* One accent in → a full palette out. Keeps text readable whatever colour is picked. */
  function buildPalette(hex) {
    const rgb = hexToRgb(hex) || hexToRgb('#aa88ff');
    let [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const mono = s < 0.12;
    l = clamp(l, 0.58, 0.86);
    const accentRgb = hslToRgb(h, s, l);
    const bgSat = Math.min(0.55, s * 0.6);
    const bgRgb = mono ? [0, 0, 0] : hslToRgb(h, bgSat, 0.018);
    return {
      accent: toHex(accentRgb),
      css: {
        '--accent': toHex(accentRgb),
        '--bg': mono ? '#000000' : hslCss(h, bgSat, 0.018),
        '--text': mono ? '#dddddd' : hslCss(h, 0.10, 0.87),
        '--muted': mono ? '#8a8a8a' : hslCss(h, 0.07, 0.55),
        '--chip': mono ? '#1c1c1c' : hslCss(h, 0.10, 0.11),
        '--line': mono ? '#2a2a2a' : hslCss(h, 0.10, 0.17)
      },
      fx: {
        accent: hslToRgb(h, s, Math.max(0.6, l)),
        base: mono ? [0.5, 0.51, 0.54] : hslToRgb(h, 0.08, 0.5),
        bg: bgRgb
      }
    };
  }

  /* ───────────────────────────── 3D scene ───────────────────────── */
  const FX = (() => {
    const noop = { setColors() {}, setForm() {}, setView() {}, setScroll() {}, setLow() {}, pulse() {}, pause() {}, resume() {} };
    const scene = window.WanderScene && window.WanderScene.create($('#bg'), { still: reduceMotion() });
    if (!scene || !scene.ok) { document.body.classList.add('no-webgl'); return noop; }
    return scene;
  })();

  /* each idea has a shape: the first theme of a video picks the environment */
  const FORM_OF = { mortality: 'eclipse', evil: 'eclipse', identity: 'shards', existentialism: 'ribbon', absurd: 'ribbon', stoicism: 'ribbon', meaning: 'tree', love: 'tree' };
  const formOf = v => FORM_OF[(v && v.themes && v.themes[0]) || 'meaning'] || 'tree';

  /* ───────────────────────────── theme UI ───────────────────────── */
  let theme = Object.assign({ id: 'lavender', custom: '#aa88ff' }, load(KEYS.theme, {}));
  let driftTimer = 0, driftHue = 265;

  function paint(hex, snap) {
    const pal = buildPalette(hex);
    const root = document.documentElement;
    Object.keys(pal.css).forEach(k => root.style.setProperty(k, pal.css[k]));
    const meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', pal.css['--bg'].startsWith('#') ? pal.css['--bg'] : '#000000');
    FX.setColors(pal.fx, snap);
    return pal;
  }

  function stopDrift() { clearInterval(driftTimer); driftTimer = 0; document.documentElement.classList.remove('drifting'); }
  function startDrift() {
    stopDrift();
    document.documentElement.classList.add('drifting');
    const tick = () => { driftHue = (driftHue + 1.4) % 360; paint(toHex(hslToRgb(driftHue, 0.82, 0.68)), false); };
    tick();
    if (!reduceMotion()) driftTimer = setInterval(tick, 120);
  }

  function setTheme(id, custom, { persist = true, snap = false } = {}) {
    stopDrift();
    theme = { id, custom: custom || theme.custom };
    if (id === 'drift') startDrift();
    else if (id === 'custom') paint(theme.custom, snap);
    else paint((PRESETS.find(p => p.id === id) || PRESETS[0]).hex, snap);
    $$('.swatch').forEach(b => b.setAttribute('aria-checked', String(b.dataset.id === id)));
    const input = $('#custom-colour');
    if (id === 'custom') input.value = theme.custom;
    if (persist) store(KEYS.theme, theme);
    if (!snap && id !== 'drift') starTrail();
  }

  /* little stars fly off the colour dot when the colour changes */
  let trailAt = 0;
  function starTrail() {
    const now = performance.now();
    if (reduceMotion() || now - trailAt < 350) return;
    trailAt = now;
    const r = $('#btn-theme').getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let i = 0; i < 10; i++) {
      const s = document.createElement('span'); s.className = 'spark'; s.style.left = cx + 'px'; s.style.top = cy + 'px';
      document.body.appendChild(s);
      const a = Math.random() * Math.PI * 2, d = 30 + Math.random() * 46;
      const an = s.animate([{ transform: 'translate(0,0) scale(1)', opacity: 1 }, { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d + 14}px) scale(.1)`, opacity: 0 }],
        { duration: 650 + Math.random() * 400, easing: 'cubic-bezier(.2,.7,.2,1)', delay: i * 18 });
      an.onfinish = () => s.remove();
    }
  }

  /* ───────── page polish: headline, scroll-ins, glow, scroll drift ───────── */
  function polish() {
    const root = document.documentElement;
    if (!reduceMotion()) root.classList.add('js');
    const h1 = $('.hero h1');
    if (h1 && !reduceMotion()) {
      let i = 0;
      const wrap = node => {
        if (node.nodeType === 3) {
          const frag = document.createDocumentFragment();
          node.textContent.split(/(\s+)/).forEach(p => {
            if (!p) return;
            if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(' ')); return; }
            const w = document.createElement('span'); w.className = 'word'; w.style.setProperty('--i', i++); w.textContent = p; frag.appendChild(w);
          });
          node.replaceWith(frag);
        } else if (node.nodeName === 'EM') { node.classList.add('word'); node.style.setProperty('--i', i++); }
      };
      Array.from(h1.childNodes).forEach(wrap);
    }
    if (!reduceMotion() && 'IntersectionObserver' in window) {
      const items = [['.how .label', 0], ['.reflect-copy', 0], ['.reflect .panel', 120], ['.spaces h2', 0], ['.spaces .lead', 60], ['.foot', 0]];
      const els = [];
      items.forEach(([sel, d]) => $$(sel).forEach(el => { el.style.setProperty('--d', d + 'ms'); els.push(el); }));
      $$('.how-grid li').forEach((el, k) => { el.style.setProperty('--d', k * 120 + 'ms'); els.push(el); });
      $$('.env').forEach((el, k) => { el.style.setProperty('--d', k * 110 + 'ms'); els.push(el); });
      const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12 });
      els.forEach(el => { el.classList.add('reveal'); io.observe(el); });
    }
    /* cursor glow on cards and buttons */
    if (window.matchMedia('(hover: hover)').matches) {
      document.addEventListener('pointermove', e => {
        const t = e.target.closest && e.target.closest('.card, .btn, .env, .panel');
        if (!t) return;
        const r = t.getBoundingClientRect();
        t.style.setProperty('--mx', (e.clientX - r.left) + 'px'); t.style.setProperty('--my', (e.clientY - r.top) + 'px');
      }, { passive: true });
    }
    /* the scene drifts as the page scrolls */
    let ticking = false;
    window.addEventListener('scroll', () => {
      document.body.classList.toggle('scrolled', window.scrollY > 24);
      if (ticking || state.view !== 'today') return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; FX.setScroll(Math.min(1, window.scrollY / Math.max(1, window.innerHeight * 0.9))); });
    }, { passive: true });
  }

  /* the thumbnail grows into the player */
  function growFrom(rect) {
    const f = $('#w-frame');
    if (!rect || reduceMotion() || !f.animate) return;
    const to = f.getBoundingClientRect();
    if (!to.width || !rect.width) return;
    const sx = rect.width / to.width, sy = rect.height / to.height;
    f.style.transformOrigin = 'top left';
    f.animate([{ transform: `translate(${rect.left - to.left}px, ${rect.top - to.top}px) scale(${sx}, ${sy})`, opacity: .6 }, { transform: 'none', opacity: 1 }],
      { duration: 640, easing: 'cubic-bezier(.2,.7,.2,1)' });
  }

  function buildThemePanel() {
    const wrap = $('#swatches');
    PRESETS.forEach(p => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'swatch' + (p.id === 'drift' ? ' drift' : '');
      b.dataset.id = p.id;
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', 'false');
      b.setAttribute('aria-label', p.name);
      b.title = p.name;
      if (p.hex) b.style.setProperty('--sw', p.hex);
      b.addEventListener('click', () => setTheme(p.id));
      wrap.appendChild(b);
    });
    const input = $('#custom-colour');
    input.addEventListener('input', () => setTheme('custom', input.value, { persist: false }));
    input.addEventListener('change', () => setTheme('custom', input.value));
  }

  function toggleThemePanel(force) {
    const panel = $('#theme-panel'), btn = $('#btn-theme');
    const open = typeof force === 'boolean' ? force : panel.hidden;
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }

  /* ──────────────── length / availability check (client-side) ───────
     YouTube's oEmbed has no duration, so durations I could not confirm are
     marked "est" in videos.js. When the page is served over http(s) we ask the
     YouTube IFrame API for the real length of each video as it is shown, and
     drop anything over 25 min or unavailable. It never blocks the UI. */
  let ytPromise = null;
  function loadYT() {
    if (IS_FILE) return Promise.resolve(null);
    if (window.YT && window.YT.Player) return Promise.resolve(window.YT);
    if (ytPromise) return ytPromise;
    ytPromise = new Promise(resolve => {
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { if (typeof prev === 'function') prev(); resolve(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
      setTimeout(() => resolve(window.YT && window.YT.Player ? window.YT : null), 9000);
    });
    return ytPromise;
  }

  const queue = [];
  let running = 0;
  const MAX_PAR = 2;
  function pump() {
    while (running < MAX_PAR && queue.length) {
      const item = queue.shift();
      running++;
      item.job().then(item.done, () => item.done(null)).then(() => { running--; pump(); });
    }
  }
  function schedule(job, priority) {
    return new Promise(done => {
      const item = { job, done };
      if (priority) queue.unshift(item); else queue.push(item);
      pump();
    });
  }

  function probeOnce(v) {
    return loadYT().then(YT => {
      if (!YT) return null;
      return new Promise(resolve => {
        const host = document.createElement('div');
        host.setAttribute('aria-hidden', 'true');
        host.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;overflow:hidden;pointer-events:none;';
        const mount = document.createElement('div');
        host.appendChild(mount);
        document.body.appendChild(host);
        let finished = false, player = null, poll = 0;
        const finish = val => {
          if (finished) return;
          finished = true;
          clearInterval(poll); clearTimeout(timer);
          try { player && player.destroy && player.destroy(); } catch (e) { /* ignore */ }
          host.remove();
          resolve(val);
        };
        const timer = setTimeout(() => finish(null), 9000);
        const read = () => {
          try { const d = player && player.getDuration && player.getDuration(); if (d && d > 0) finish({ secs: Math.round(d) }); } catch (e) { /* not ready */ }
        };
        try {
          player = new YT.Player(mount, {
            width: 1, height: 1, videoId: v.id,
            playerVars: { controls: 0, disablekb: 1, playsinline: 1, rel: 0, origin: location.origin },
            events: {
              onReady: () => { read(); poll = setInterval(read, 250); },
              onError: e => finish({ error: e && e.data })
            }
          });
        } catch (e) { finish(null); }
      });
    });
  }

  function verify(v, priority) {
    if (IS_FILE || v._probed || v.check === 'checked' || v.dead) return;
    v._probed = true;
    schedule(() => probeOnce(v), priority).then(res => afterProbe(v, res));
  }

  function afterProbe(v, res) {
    if (!res) return;
    let why = '';
    if (res.error) {
      if (res.error === 100 || res.error === 2) { v.dead = true; why = 'UNAVAILABLE'; }
      else if (res.error === 101 || res.error === 150) { v.noEmbed = true; }
    } else if (res.secs) {
      v.secs = res.secs; v.check = 'checked';
      lens[v.id] = res.secs; store(KEYS.lens, lens);
      if (res.secs > MAX_SECS) { v.blocked = true; why = 'OVER 25 MIN'; }
    }
    updateCard(v);
    renderTags();
    if (state.current === v) {
      if ((v.blocked || v.dead) && !state.chosen) {
        setNotice(`SKIPPED "${trunc(v.title)}" · ${why}`);
        advance();
      } else { fillFeature(v, false); }
    }
  }

  /* ─────────────────────────────── picking ──────────────────────── */
  const DAILY = seededShuffle(VIDEOS.filter(v => v.secs === null || v.secs <= MAX_SECS).map(v => v.id), 7919);

  /* the daily pick may be a video whose length is not measured yet; it is verified as soon as it is shown,
     so the pick never depends on how fast background measuring runs */
  const dailyOk = v => !v.blocked && !v.dead && (v.secs === null || v.secs <= MAX_SECS);

  function dailyPick(d = new Date()) {
    if (!DAILY.length) return null;
    const start = ((dayOrdinal(d) % DAILY.length) + DAILY.length) % DAILY.length;
    for (let i = 0; i < DAILY.length; i++) {
      const v = BY_ID.get(DAILY[(start + i) % DAILY.length]);
      if (dailyOk(v)) return v;
    }
    return null;
  }

  function matchesFilter(v) {
    if (state.view === 'saved') return saved.has(v.id);
    if (state.filter === 'all') return true;
    return Array.isArray(v.themes) && v.themes.includes(state.filter);
  }

  function nextRandom() {
    const pool = VIDEOS.filter(v => eligible(v) && v !== state.current);
    if (!pool.length) return null;
    const fresh = pool.filter(v => !state.recent.includes(v.id));
    const from = fresh.length ? fresh : pool;
    const v = from[Math.floor(Math.random() * from.length)];
    state.recent.push(v.id);
    while (state.recent.length > Math.max(3, Math.min(12, Math.floor(VIDEOS.length / 2)))) state.recent.shift();
    return v;
  }

  function advance() {
    const next = state.mode === 'today' ? dailyPick() : nextRandom();
    if (next && next !== state.current) show(next, state.mode, { animate: true });
  }

  /* ───────────────────────────── rendering ──────────────────────── */
  function setNotice(text, ms = 7000) {
    state.notice = text;
    renderState();
    clearTimeout(state.noticeTimer);
    state.noticeTimer = setTimeout(() => { if (state.notice === text) { state.notice = ''; renderState(); } }, ms);
  }
  function renderState() {
    const v = state.current;
    const bits = [];
    if (v && saved.has(v.id)) bits.push('Saved');
    if (v && watched.has(v.id)) bits.push('Watched');
    $('#f-state').textContent = state.notice || bits.join('  ·  ');
  }

  const cardEls = new Map();
  const themeLine = v => (v.themes || []).slice(0, 2).join(' · ');
  function buildCard(v) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = v.id;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `Watch ${v.title}`);
    el.innerHTML = '<div class="thumb"><img loading="lazy" decoding="async" alt="" /><span class="mark" hidden></span><span class="badge"></span></div><div class="meta"><span class="t"></span><span class="s"></span></div>';
    $('img', el).src = thumbUrl(v);
    $('img', el).addEventListener('error', e => { e.target.removeAttribute('src'); });
    $('.t', el).textContent = v.title;
    const open = () => { show(v, 'chosen', { animate: true, chosen: true }); watch(v); };
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    cardEls.set(v.id, el);
    updateCard(v);
    return el;
  }
  function updateCard(v) {
    const el = cardEls.get(v.id);
    if (!el) return;
    $('.s', el).textContent = `${v.by} · ${themeLine(v)}`;
    const badge = $('.badge', el);
    badge.textContent = v.blocked ? 'Over 25 min' : durBadge(v);
    badge.classList.toggle('warn', v.blocked || v.dead);
    const mark = $('.mark', el);
    const flags = (saved.has(v.id) ? '♥' : '') + (watched.has(v.id) ? ' ✓' : '');
    mark.textContent = flags; mark.hidden = !flags;
    el.classList.toggle('current', state.current === v);
  }

  function renderTags() {
    const nav = $('#tags');
    if (!nav) return;
    const present = THEME_ORDER.filter(t => VIDEOS.some(v => (v.themes || []).includes(t)));
    nav.replaceChildren();
    [['all', 'All'], ...present.map(t => [t, t])].forEach(([key, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'tag' + (state.filter === key ? ' active' : '');
      b.textContent = label;
      b.setAttribute('aria-pressed', String(state.filter === key));
      b.addEventListener('click', () => { state.filter = key; renderTags(); renderGrid(); });
      nav.appendChild(b);
    });
  }

  function renderGrid() {
    const grid = $('#grid');
    grid.replaceChildren();
    const shown = VIDEOS.filter(matchesFilter);
    if (!shown.length) {
      const d = document.createElement('div');
      d.className = 'empty';
      d.textContent = state.view === 'saved' ? 'Nothing saved yet. Tap the heart on any video.' : 'Nothing here yet.';
      grid.appendChild(d);
      return;
    }
    shown.forEach(v => grid.appendChild(cardEls.get(v.id) || buildCard(v)));
    VIDEOS.forEach(updateCard);
  }

  function renderLibrary() {
    const isSaved = state.view === 'saved';
    $('#lib-title').textContent = isSaved ? 'Saved' : 'Explore ideas';
    $('#lib-sub').textContent = isSaved ? 'The ones you kept for later.' : 'A small, hand-picked library of philosophy told through stories, art and film.';
    $('#tags').hidden = isSaved;
    renderTags();
    renderGrid();
  }

  function kickerText() {
    return state.mode === 'today' ? "Today's recommendation" : state.mode === 'random' ? 'Another wander' : 'From the shelf';
  }

  function syncNotes() {
    const key = localDayKey();
    const text = notes[key] || '';
    [['#note', '#note-status', '#note-count'], ['#w-note', '#w-note-status', '#w-note-count']].forEach(([t, st, c]) => {
      const ta = $(t);
      if (document.activeElement !== ta) ta.value = text;
      $(st).textContent = text ? 'Private, reflection saved' : 'Private, kept on this device';
      $(c).textContent = String(ta.value.length);
    });
  }

  function fillFeature(v, animate) {
    if (!v) return;
    $('#f-kicker').textContent = kickerText();
    const img = $('#f-img');
    if (img.dataset.id !== v.id) {
      img.dataset.id = v.id;
      img.alt = `Thumbnail for ${v.title}`;
      img.src = thumbUrl(v);
    }
    const dur = $('#f-dur');
    dur.textContent = v.blocked ? 'Over 25 min' : durBadge(v);
    dur.classList.toggle('warn', v.blocked || v.dead);
    $('#f-title').textContent = v.title;

    const meta = $('#f-meta');
    meta.replaceChildren();
    const by = document.createElement('b');
    by.textContent = v.by;
    meta.append(by, document.createTextNode(` · ${durLong(v)}${(v.themes && v.themes[0]) ? ' · ' + v.themes[0] : ''}`));
    if (v.blocked) meta.append(document.createElement('br'), document.createTextNode('Longer than 25 minutes: shown because you picked it.'));

    $('#f-blurb').textContent = v.blurb || '';
    $('#f-ask').textContent = v.ask || '';
    $('#reflect-h').textContent = v.ask || '';
    syncNotes();
    syncActionButtons(v);
    $('#btn-today').hidden = state.mode === 'today';
    renderState();
  }

  function syncActionButtons(v) {
    const s = saved.has(v.id), w = watched.has(v.id);
    [$('#btn-save'), $('#btn-w-save')].forEach(sb => {
      sb.setAttribute('aria-pressed', String(s));
      sb.textContent = s ? '♥' : '♡';
      sb.setAttribute('aria-label', s ? 'Remove from saved' : 'Save for later');
      sb.title = s ? 'Remove from saved' : 'Save for later';
    });
    const wb = $('#btn-watched');
    wb.setAttribute('aria-pressed', String(w));
    wb.setAttribute('aria-label', w ? 'Mark as not watched' : 'Mark as watched');
    wb.title = w ? 'Mark as not watched' : 'Mark as watched';
  }

  let swapToken = 0;
  function show(v, mode, { animate = true, chosen = false, fromHistory = false } = {}) {
    if (!v) return;
    const tok = ++swapToken;
    const prev = state.current;
    if (prev && prev !== v && !fromHistory) {
      state.history.push({ v: prev, mode: state.mode, chosen: state.chosen });
      if (state.history.length > 40) state.history.shift();
    }
    state.current = v; state.mode = mode; state.chosen = chosen;
    state.env = null;
    $$('.env').forEach(e => e.classList.remove('on'));
    FX.setForm(formOf(v), !prev);
    syncBack();
    if (prev && prev !== v) updateCard(prev);
    updateCard(v);

    const main = $('#f-main');
    const apply = () => { if (tok !== swapToken) return; fillFeature(state.current, animate); main.classList.remove('swapping'); };
    if (animate && !reduceMotion() && state.view === 'today') { main.classList.add('swapping'); setTimeout(apply, 190); }
    else apply();
    verify(v, true);
  }

  /* ───────────────────────────── views ──────────────────────────── */
  const TITLES = { today: 'WANDERSPACE · A daily philosophy video', explore: 'Explore · WANDERSPACE', saved: 'Saved · WANDERSPACE', watch: 'WANDERSPACE' };
  let pauseTimer = 0;
  function setView(name, { scroll = true, hash = true } = {}) {
    const lib = name === 'explore' || name === 'saved';
    state.view = name;
    $('#view-today').hidden = name !== 'today';
    $('#view-library').hidden = !lib;
    $('#view-watch').hidden = name !== 'watch';
    document.body.dataset.view = name === 'today' ? 'today' : 'other';
    $$('.links a').forEach(a => a.classList.toggle('on', a.dataset.viewLink === name || (name === 'watch' && a.dataset.viewLink === state.from)));
    FX.setView(name === 'today' ? 'today' : 'other');
    FX.setScroll(name === 'today' ? Math.min(1, window.scrollY / Math.max(1, window.innerHeight * 0.9)) : 0);
    if (name !== 'watch') { clearTimeout(pauseTimer); FX.resume(); }
    if (lib) renderLibrary();
    if (hash && name !== 'watch') { try { history.replaceState(null, '', '#' + name); } catch (e) { /* ignore */ } }
    document.title = TITLES[name] || TITLES.today;
    if (scroll) window.scrollTo({ top: 0, behavior: 'instant' });
  }

  const routeFromHash = () => {
    const h = location.hash.replace('#', '');
    if (h === 'explore' || h === 'saved' || h === 'today') { if (state.view === 'watch') leaveWatch(true); setView(h, { hash: false }); }
  };

  /* ───────────────────────────── actions ────────────────────────── */
  function spin(btn) {
    btn.classList.remove('spin');
    void btn.offsetWidth;
    btn.classList.add('spin');
    setTimeout(() => btn.classList.remove('spin'), 750);
  }
  function syncBack() {
    const b = $('#btn-back');
    if (b) b.hidden = !state.history.some(h => h.v !== state.current && !h.v.blocked && !h.v.dead);
  }
  function toToday() {
    if (state.view === 'watch') leaveWatch(true);
    if (state.view !== 'today') setView('today');
  }
  function goBack() {
    let h;
    while ((h = state.history.pop())) {
      if (h.v !== state.current && !h.v.blocked && !h.v.dead) break;
      h = null;
    }
    if (!h) { syncBack(); return; }
    toToday();
    spin($('#btn-back'));
    state.notice = '';
    show(h.v, h.mode, { animate: true, chosen: h.chosen, fromHistory: true });
  }
  function refresh() {
    const v = nextRandom();
    if (!v) { setNotice('Nothing else on the shelf yet'); return; }
    toToday();
    spin($('#btn-refresh')); spin($('#btn-refresh-2'));
    FX.pulse();
    state.notice = '';
    show(v, 'random', { animate: true });
  }
  function backToToday() {
    const v = dailyPick();
    if (!v) return;
    toToday();
    state.notice = '';
    FX.pulse();
    show(v, 'today', { animate: true });
  }
  function toggleSaved() {
    const v = state.current; if (!v) return;
    if (saved.has(v.id)) saved.delete(v.id); else saved.add(v.id);
    store(KEYS.saved, Array.from(saved));
    syncActionButtons(v); renderState(); updateCard(v);
    if (state.view === 'saved') renderGrid();
  }
  function toggleWatched() {
    const v = state.current; if (!v) return;
    if (watched.has(v.id)) watched.delete(v.id); else watched.add(v.id);
    store(KEYS.watched, Array.from(watched));
    syncActionButtons(v); renderState(); updateCard(v);
  }
  function saveNote(from) {
    const ta = $(from === 'watch' ? '#w-note' : '#note');
    const text = ta.value.trim();
    const key = localDayKey();
    if (text) notes[key] = text; else delete notes[key];
    const ok = store(KEYS.notes, notes);
    syncNotes();
    if (!ok) { $('#note-status').textContent = 'Storage unavailable'; $('#w-note-status').textContent = 'Storage unavailable'; }
  }

  /* ───────────────────────────── watch page ─────────────────────── */
  function watch(v = state.current) {
    if (!v) return;
    if (IS_FILE || v.noEmbed) {
      window.open(ytUrl(v), '_blank', 'noopener,noreferrer');
      setNotice(IS_FILE ? 'Opened on YouTube. The in-page player needs http(s)' : 'Opened on YouTube. Embedding is off for this one');
      return;
    }
    let srcRect = null;
    if (state.view !== 'watch') {
      const src = state.view === 'today' ? $('#art') : document.querySelector(`.card[data-id="${v.id}"] .thumb`);
      if (src) srcRect = src.getBoundingClientRect();
    }
    if (state.view !== 'watch') state.from = state.view === 'saved' ? 'saved' : state.view === 'explore' ? 'explore' : 'today';
    $('#leave-label').textContent = state.from === 'today' ? 'Back to today' : `Back to ${state.from}`;
    $('#w-title').textContent = v.title;
    const meta = $('#w-meta');
    meta.replaceChildren();
    const by = document.createElement('b'); by.textContent = v.by;
    meta.append(by, document.createTextNode(` · ${durLong(v)}`));
    $('#w-blurb').textContent = v.blurb || '';
    $('#w-ask').textContent = v.ask || '';
    $('#w-yt').href = ytUrl(v);
    const tags = $('#w-tags');
    tags.replaceChildren();
    (v.themes || []).forEach(t => { const s = document.createElement('span'); s.className = 'pill'; s.textContent = t; tags.appendChild(s); });
    const frame = $('#w-frame');
    frame.replaceChildren();
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;
    f.title = v.title;
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.allowFullscreen = true;
    frame.appendChild(f);
    syncNotes();
    syncActionButtons(v);
    setView('watch', { hash: false });
    growFrom(srcRect);
    /* let the background settle into its dim place, then stop drawing so the video gets the machine */
    pauseTimer = setTimeout(() => { if (state.view === 'watch') FX.pause(); }, 1600);
  }
  function leaveWatch(quiet) {
    if (state.view !== 'watch') return;
    $('#w-frame').replaceChildren();
    clearTimeout(pauseTimer);
    FX.resume();
    if (!quiet) setView(state.from || 'today');
  }

  /* ───────────────────────────── wiring ─────────────────────────── */
  function updateCountdown() {
    const now = new Date(), next = new Date(now);
    next.setHours(24, 0, 0, 0);
    let s = Math.max(0, Math.floor((next - now) / 1000));
    const h = Math.floor(s / 3600); s %= 3600;
    const m = Math.floor(s / 60); s %= 60;
    $('#countdown').textContent = `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  }

  function wire() {
    $('#btn-refresh').addEventListener('click', refresh);
    $('#btn-refresh-2').addEventListener('click', refresh);
    $('#btn-back').addEventListener('click', goBack);
    $('#btn-today').addEventListener('click', backToToday);
    $('#btn-theme').addEventListener('click', e => { e.stopPropagation(); toggleThemePanel(); });
    $('#btn-watch').addEventListener('click', () => watch());
    $('#btn-play').addEventListener('click', e => { e.stopPropagation(); watch(); });
    $('#art').addEventListener('click', () => watch());
    $('#btn-save').addEventListener('click', toggleSaved);
    $('#btn-w-save').addEventListener('click', toggleSaved);
    $('#btn-watched').addEventListener('click', toggleWatched);
    $('#btn-leave').addEventListener('click', () => leaveWatch());

    $$('[data-view-link]').forEach(a => a.addEventListener('click', e => {
      e.preventDefault();
      const name = a.dataset.viewLink;
      if (state.view === 'watch') leaveWatch(true);
      if (name === 'explore') state.filter = state.filter === 'saved' ? 'all' : state.filter;
      setView(name);
    }));
    window.addEventListener('hashchange', routeFromHash);

    $$('.env').forEach(b => b.addEventListener('click', () => {
      state.env = b.dataset.form;
      FX.setForm(b.dataset.form);
      FX.pulse();
      $$('.env').forEach(x => x.classList.toggle('on', x === b));
      window.scrollTo({ top: 0, behavior: reduceMotion() ? 'instant' : 'smooth' });
    }));

    [['#note', '#note-count', 'today', '#btn-note'], ['#w-note', '#w-note-count', 'watch', '#btn-w-note']].forEach(([t, c, from, btn]) => {
      const ta = $(t);
      ta.addEventListener('input', () => { $(c).textContent = String(ta.value.length); });
      ta.addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveNote(from); });
      ta.addEventListener('blur', () => { if (ta.value.trim() !== (notes[localDayKey()] || '')) saveNote(from); });
      $(btn).addEventListener('click', () => saveNote(from));
    });

    document.addEventListener('click', e => {
      const panel = $('#theme-panel');
      if (!panel.hidden && !panel.contains(e.target) && !$('#btn-theme').contains(e.target)) toggleThemePanel(false);
    });
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (!$('#theme-panel').hidden) toggleThemePanel(false);
        else if (state.view === 'watch') leaveWatch();
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
      if (e.key === 'c' || e.key === 'C') { toggleThemePanel(); return; }
      if (state.view === 'watch') return;
      if (e.key === 'r' || e.key === 'R') refresh();
      else if (e.key === 't' || e.key === 'T') backToToday();
      else if (e.key === 'b' || e.key === 'B') goBack();
    });
  }

  function init() {
    $('#counter').textContent = pad2(VIDEOS.length);
    buildThemePanel();
    setTheme(theme.id || 'lavender', theme.custom, { persist: false, snap: true });
    wire();
    polish();
    updateCountdown();
    setInterval(updateCountdown, 1000);

    const first = dailyPick();
    if (first) { state.recent.push(first.id); show(first, 'today', { animate: false }); }
    else $('#f-title').textContent = 'No videos on the shelf yet.';

    const h = location.hash.replace('#', '');
    if (h === 'explore' || h === 'saved') setView(h, { scroll: false, hash: false }); else setView('today', { scroll: false, hash: false });

    let dayKey = localDayKey();
    setInterval(() => {
      const k = localDayKey();
      if (k !== dayKey) { dayKey = k; if (state.mode === 'today') backToToday(); else fillFeature(state.current, false); }
    }, 20000);

    /* quietly measure the references whose length is still unknown */
    if (!IS_FILE) setTimeout(() => VIDEOS.filter(v => v.secs === null).forEach(v => verify(v, false)), 1500);
  }

  init();
})();
