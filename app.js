/* WANDERSPACE — app logic.
   Sections: data · helpers · colour themes · particle field · length check
             · picking · rendering · player · wiring                         */
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

  /* ─────────────────────────── particle field ───────────────────── */
  /* The AXON reference ring: a twisted hollow torus of points, additive blending,
     cursor swirl. Colours are uniforms so the theme can change live. */
  const FX = (() => {
    const noop = { setColors() {}, pulse() {}, pause() {}, resume() {} };
    const canvas = $('#bg');
    const THREE = window.THREE;
    if (!canvas || !THREE) { document.body.classList.add('no-webgl'); return noop; }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance' });
    } catch (e) { document.body.classList.add('no-webgl'); return noop; }

    const TAU = Math.PI * 2;
    const mobile = window.matchMedia('(max-width: 920px)').matches;
    const count = mobile ? 26000 : 60000;
    const still = reduceMotion();

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 1000);
    const baseCamera = new THREE.Vector3(-1.17, 0, 6);
    camera.position.copy(baseCamera);
    const group = new THREE.Group();
    group.position.set(0.46, 0.12, -0.35);
    group.rotation.set(THREE.MathUtils.degToRad(-10), THREE.MathUtils.degToRad(18), THREE.MathUtils.degToRad(4));
    group.scale.set(1.7, 1.7, 1.7);
    scene.add(group);

    const positions = new Float32Array(count * 3);
    const randoms = new Float32Array(count * 4);
    const gaussian = () => {
      let u = 0, v = 0;
      while (u === 0) u = Math.random();
      while (v === 0) v = Math.random();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
    };
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * TAU, phi = Math.random() * TAU;
      const tube = 0.23 * (0.78 + Math.random() * 0.34);
      const radius = 0.88 + 0.055 * Math.sin(theta * 3.0) + 0.035 * Math.sin(theta * 7.0 + 0.8);
      const twist = phi + theta * 0.74 + 0.15 * Math.sin(theta * 2.0);
      const ringRadius = radius + tube * Math.cos(twist);
      const jitter = 0.012 * gaussian();
      const i3 = i * 3, i4 = i * 4;
      positions[i3]     = ringRadius * Math.cos(theta) + jitter;
      positions[i3 + 1] = ringRadius * Math.sin(theta) + jitter;
      positions[i3 + 2] = tube * Math.sin(twist) + 0.06 * Math.cos(theta * 2.0) + jitter * 0.65;
      randoms[i4] = Math.random(); randoms[i4 + 1] = Math.random(); randoms[i4 + 2] = Math.random(); randoms[i4 + 3] = Math.random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 4));
    geometry.computeBoundingSphere();

    const material = new THREE.ShaderMaterial({
      uniforms: {
        uTime: { value: 0 }, uMouse: { value: new THREE.Vector2() }, uEnergy: { value: 0 },
        uPixelRatio: { value: 1 }, uPulse: { value: 0 },
        uBase: { value: new THREE.Vector3(0.5, 0.51, 0.54) },
        uAccent: { value: new THREE.Vector3(0.68, 0.51, 1.0) }
      },
      vertexShader: `
        attribute vec4 aRandom;
        uniform float uTime; uniform vec2 uMouse; uniform float uEnergy; uniform float uPixelRatio; uniform float uPulse;
        varying float vTint; varying float vAlpha;
        void main() {
          vec3 p = position;
          float softClock = uTime * 0.22 + aRandom.x * 6.2831;
          vec2 delta = p.xy * 0.9 - uMouse * 0.72;
          float influence = exp(-dot(delta, delta) * 2.75) * uEnergy;
          vec3 swirlAxis = normalize(vec3(-delta.y, delta.x, 0.24 + sin(p.z * 4.0 + uTime) * 0.04));
          p += swirlAxis * influence * (0.17 + aRandom.y * 0.08);
          p += vec3(sin(p.y * 4.1 + softClock), cos(p.z * 4.7 - softClock * 0.73), sin(p.x * 3.8 + softClock * 0.51)) * (0.009 + uEnergy * 0.024);
          p *= 1.0 + sin(uTime * 0.32 + aRandom.x * 6.2831) * 0.008;
          p.xy *= 1.0 + uPulse * 0.10 * (0.4 + aRandom.y);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float dist = max(1.0, -mv.z);
          float sparkle = pow(aRandom.z, 80.0);
          gl_PointSize = clamp((11.0 / dist) * (0.55 + aRandom.y * 0.9 + sparkle * 1.8) * uPixelRatio, 0.8, 7.0);
          vTint = min(1.0, pow(aRandom.z, 8.0) + uPulse * 0.4 * aRandom.w);
          vAlpha = (0.6 + 0.4 * sin(uTime * 2.8 + aRandom.y * 18.0) * sparkle) * (1.0 + uPulse * 0.5);
        }`,
      fragmentShader: `
        uniform vec3 uBase; uniform vec3 uAccent;
        varying float vTint; varying float vAlpha;
        void main() {
          vec2 uv = gl_PointCoord * 2.0 - 1.0;
          float d = dot(uv, uv);
          if (d > 1.0) discard;
          float soft = smoothstep(1.0, 0.02, d);
          vec3 color = mix(uBase, uAccent, vTint);
          color += smoothstep(0.48, 0.0, d) * 0.3;
          gl_FragColor = vec4(color, soft * vAlpha * 0.88);
        }`,
      transparent: true, depthTest: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    group.add(points);

    /* colours lerp toward a target so a theme change glides instead of snapping */
    const cur = { accent: [0.68, 0.51, 1], base: [0.5, 0.51, 0.54], bg: [0, 0, 0] };
    const tgt = { accent: [0.68, 0.51, 1], base: [0.5, 0.51, 0.54], bg: [0, 0, 0] };
    const clearColor = new THREE.Color();
    function pushColors() {
      material.uniforms.uAccent.value.set(cur.accent[0], cur.accent[1], cur.accent[2]);
      material.uniforms.uBase.value.set(cur.base[0], cur.base[1], cur.base[2]);
      clearColor.setRGB(cur.bg[0], cur.bg[1], cur.bg[2]);
      renderer.setClearColor(clearColor, 1);
    }
    function lerpColors(k) {
      let moving = false;
      ['accent', 'base', 'bg'].forEach(key => {
        for (let i = 0; i < 3; i++) {
          const d = tgt[key][i] - cur[key][i];
          if (Math.abs(d) > 0.0005) { cur[key][i] += d * k; moving = true; } else cur[key][i] = tgt[key][i];
        }
      });
      if (moving) pushColors();
      return moving;
    }
    pushColors();

    const targetMouse = new THREE.Vector2(), smoothMouse = new THREE.Vector2();
    let lastPointer = null, energy = 0, pulse = 0, paused = false, raf = 0;
    let lastTime = performance.now(), frames = 0, slow = 0, degraded = false;
    const clock = new THREE.Clock();

    function onPointer(x, y) {
      if (lastPointer) energy = Math.min(1, energy + Math.min(0.12, Math.hypot(x - lastPointer.x, y - lastPointer.y) / 90));
      lastPointer = { x, y };
      targetMouse.set((x / window.innerWidth) * 2 - 1, -((y / window.innerHeight) * 2 - 1));
    }
    if (!still) {
      window.addEventListener('pointermove', e => onPointer(e.clientX, e.clientY), { passive: true });
      window.addEventListener('pointerleave', () => { lastPointer = null; }, { passive: true });
      window.addEventListener('touchmove', e => { if (e.touches[0]) onPointer(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    }

    function resize() {
      const w = window.innerWidth, h = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, degraded ? 1 : (mobile ? 1.5 : 2));
      renderer.setPixelRatio(dpr);
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.fov = camera.aspect < 1 ? Math.min(62, 30 + (1 - camera.aspect) * 48) : 30;
      camera.updateProjectionMatrix();
      material.uniforms.uPixelRatio.value = dpr;
      if (still || paused) drawOnce();
    }
    function drawOnce() { camera.lookAt(0.26, 0.08, 0); renderer.render(scene, camera); }
    window.addEventListener('resize', resize, { passive: true });
    resize();

    function animate(now) {
      raf = requestAnimationFrame(animate);
      if (paused) return;
      const raw = (now - lastTime) / 1000 || 0.016;
      const delta = Math.min(0.05, raw);
      lastTime = now;
      /* if the first second of frames is very slow, thin the cloud once */
      frames++;
      if (!degraded && frames > 30 && frames <= 90) { slow += raw; if (frames === 90 && slow / 60 > 0.04) { degraded = true; geometry.setDrawRange(0, Math.floor(count * 0.4)); resize(); } }

      smoothMouse.lerp(targetMouse, 0.08);
      energy *= Math.pow(0.035, delta);
      pulse *= Math.pow(0.12, delta);
      lerpColors(1 - Math.exp(-delta * 7));
      material.uniforms.uTime.value = clock.getElapsedTime();
      material.uniforms.uMouse.value.copy(smoothMouse);
      material.uniforms.uEnergy.value = energy;
      material.uniforms.uPulse.value = pulse;
      camera.position.lerp(new THREE.Vector3(baseCamera.x - smoothMouse.x * 0.28, baseCamera.y + smoothMouse.y * 0.16, baseCamera.z), 0.045);
      camera.lookAt(0.26, 0.08, 0);
      group.rotation.y += delta * 0.018;
      group.rotation.z += delta * 0.006;
      renderer.render(scene, camera);
    }
    if (still) drawOnce(); else raf = requestAnimationFrame(animate);

    return {
      setColors(fx, snap) {
        tgt.accent = fx.accent.slice(); tgt.base = fx.base.slice(); tgt.bg = fx.bg.slice();
        if (snap || still) { cur.accent = fx.accent.slice(); cur.base = fx.base.slice(); cur.bg = fx.bg.slice(); pushColors(); if (still) drawOnce(); }
      },
      pulse() { if (!still) { pulse = 1; energy = Math.min(1, energy + 0.8); } },
      pause() { paused = true; },
      resume() { paused = false; lastTime = performance.now(); if (still) drawOnce(); }
    };
  })();

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
    if (state.filter === 'all') return true;
    if (state.filter === 'saved') return saved.has(v.id);
    return Array.isArray(v.themes) && v.themes.includes(state.filter);
  }

  function nextRandom() {
    let pool = VIDEOS.filter(v => eligible(v) && v !== state.current && matchesFilter(v));
    if (!pool.length) pool = VIDEOS.filter(v => eligible(v) && v !== state.current);
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
    if (v && saved.has(v.id)) bits.push('SAVED TO YOUR SHELF');
    if (v && watched.has(v.id)) bits.push('WATCHED');
    $('#f-state').textContent = state.notice || bits.join('  ·  ');
  }

  function renderTags() {
    const nav = $('#tags');
    const present = THEME_ORDER.filter(t => VIDEOS.some(v => (v.themes || []).includes(t)));
    const items = [['all', 'All'], ...present.map(t => [t, t]), ['saved', `♥ Saved`]];
    nav.replaceChildren();
    items.forEach(([key, label]) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip' + (state.filter === key ? ' active' : '');
      b.textContent = label;
      b.setAttribute('aria-pressed', String(state.filter === key));
      b.addEventListener('click', () => { state.filter = key; renderTags(); renderList(); });
      nav.appendChild(b);
    });
  }

  const cardEls = new Map();
  function cardMeta(v) {
    const themes = (v.themes || []).slice(0, 2).join(' / ');
    return { sub: `${v.by} / ${themes}${v.lang ? ' / ' + v.lang : ''}`, right: `${String(v.n).padStart(3, '0')}\n${durBadge(v)}` };
  }
  function buildCard(v) {
    const el = document.createElement('div');
    el.className = 'card';
    el.dataset.id = v.id;
    el.tabIndex = 0;
    el.setAttribute('role', 'button');
    el.setAttribute('aria-label', `Show ${v.title}`);
    el.innerHTML = '<div class="thumb"><img loading="lazy" decoding="async" alt="" /><span class="mark" hidden></span><span class="badge"></span></div><div class="meta"><div><span class="t"></span><span class="s"></span></div><div class="r"></div></div>';
    $('img', el).src = thumbUrl(v);
    $('img', el).addEventListener('error', e => { e.target.removeAttribute('src'); });
    $('.t', el).textContent = v.title;
    const open = () => show(v, 'chosen', { animate: true, chosen: true });
    el.addEventListener('click', open);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    cardEls.set(v.id, el);
    updateCard(v);
    return el;
  }
  function updateCard(v) {
    const el = cardEls.get(v.id);
    if (!el) return;
    const m = cardMeta(v);
    $('.s', el).textContent = m.sub;
    $('.r', el).textContent = m.right;
    const badge = $('.badge', el);
    badge.textContent = v.blocked ? 'OVER 25 MIN' : durBadge(v);
    badge.classList.toggle('warn', v.blocked || v.dead);
    const mark = $('.mark', el);
    const flags = (saved.has(v.id) ? '♥' : '') + (watched.has(v.id) ? '✓' : '');
    mark.textContent = flags; mark.hidden = !flags;
    el.classList.toggle('current', state.current === v);
  }
  function renderList() {
    const list = $('#list');
    list.replaceChildren();
    const shown = VIDEOS.filter(matchesFilter);
    if (!shown.length) {
      const d = document.createElement('div');
      d.className = 'empty';
      d.textContent = state.filter === 'saved' ? 'Nothing saved yet. Tap ♡ on any video.' : 'Nothing here yet.';
      list.appendChild(d);
      return;
    }
    shown.forEach(v => list.appendChild(cardEls.get(v.id) || buildCard(v)));
    VIDEOS.forEach(updateCard);
  }

  let scrambleToken = 0;
  function scramble(el, text, animate) {
    const tok = ++scrambleToken;
    if (!animate || reduceMotion()) { el.textContent = text; return; }
    const glyphs = '▒░/\\+*#<>';
    const start = performance.now(), dur = 420;
    const step = now => {
      if (tok !== scrambleToken) return;
      const t = clamp((now - start) / dur, 0, 1);
      const reveal = Math.floor(text.length * t);
      let out = '';
      for (let i = 0; i < text.length; i++) out += i < reveal || text[i] === ' ' ? text[i] : glyphs[Math.floor(Math.random() * glyphs.length)];
      el.textContent = t >= 1 ? text : out;
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function dateStamp() {
    return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'short', day: '2-digit' }).format(new Date()).replace(',', ' ·');
  }

  function fillFeature(v, animate) {
    if (!v) return;
    const now = new Date();
    $('#f-kicker').textContent =
      state.mode === 'today' ? `[today · ${pad2(dayOfYear(now))}/${daysInYear(now)}]`
      : state.mode === 'random' ? '[wander · refreshed]' : '[wander · from the shelf]';
    $('#f-date').textContent = dateStamp();

    const img = $('#f-img');
    if (img.dataset.id !== v.id) {
      img.dataset.id = v.id;
      img.alt = `Thumbnail for ${v.title}`;
      img.src = thumbUrl(v);
    }
    const dur = $('#f-dur');
    dur.textContent = v.blocked ? 'OVER 25 MIN' : durBadge(v);
    dur.classList.toggle('warn', v.blocked || v.dead);

    scramble($('#f-title'), v.title, animate);

    const meta = $('#f-meta');
    meta.replaceChildren();
    const by = document.createElement('b');
    by.textContent = v.by;
    meta.append(by, document.createElement('br'),
      document.createTextNode(`${(v.themes || []).join(' / ')}${v.lang ? ' / ' + v.lang : ''} · ${durLong(v)}`));
    if (v.blocked) meta.append(document.createElement('br'), document.createTextNode('Longer than 25 minutes: shown because you picked it.'));

    $('#f-blurb').textContent = v.blurb || '';
    $('#f-ask').textContent = v.ask || '';
    $('#f-yt').href = ytUrl(v);

    const key = localDayKey();
    const noteEl = $('#note');
    if (document.activeElement !== noteEl) noteEl.value = notes[key] || '';
    $('#note-status').textContent = notes[key] ? 'Private / note saved' : 'Private / saved on this device';

    syncActionButtons(v);
    $('#btn-today').hidden = state.mode === 'today';
    renderState();
  }

  function syncActionButtons(v) {
    const s = saved.has(v.id), w = watched.has(v.id);
    const sb = $('#btn-save'), wb = $('#btn-watched');
    sb.setAttribute('aria-pressed', String(s));
    sb.textContent = s ? '♥' : '♡';
    sb.setAttribute('aria-label', s ? 'Remove from saved' : 'Save for later');
    sb.title = s ? 'Remove from saved' : 'Save for later';
    wb.setAttribute('aria-pressed', String(w));
    wb.setAttribute('aria-label', w ? 'Mark as not watched' : 'Mark as watched');
    wb.title = w ? 'Mark as not watched' : 'Mark as watched';
  }

  /* bring a card into view inside the shelf only (never scrolls the page itself) */
  function scrollShelfTo(el) {
    const list = $('#list');
    if (!el || !el.isConnected || list.scrollHeight <= list.clientHeight + 1) return;
    const top = el.offsetTop - 12;
    const visible = top >= list.scrollTop && top + el.offsetHeight <= list.scrollTop + list.clientHeight;
    if (!visible) list.scrollTo({ top: Math.max(0, top), behavior: reduceMotion() ? 'auto' : 'smooth' });
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
    syncBack();
    if (prev && prev !== v) updateCard(prev);
    updateCard(v);
    if (animate && !chosen) scrollShelfTo(cardEls.get(v.id));

    const main = $('#f-main');
    const apply = () => { if (tok !== swapToken) return; fillFeature(state.current, animate); main.classList.remove('swapping'); };
    if (animate && !reduceMotion()) { main.classList.add('swapping'); setTimeout(apply, 190); }
    else apply();
    verify(v, true);
  }

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
  function goBack() {
    let h;
    while ((h = state.history.pop())) {
      if (h.v !== state.current && !h.v.blocked && !h.v.dead) break;
      h = null;
    }
    if (!h) { syncBack(); return; }
    spin($('#btn-back'));
    state.notice = '';
    show(h.v, h.mode, { animate: true, chosen: h.chosen, fromHistory: true });
  }
  function refresh() {
    const v = nextRandom();
    if (!v) { setNotice('NOTHING ELSE ON THE SHELF YET'); return; }
    spin($('#btn-refresh')); spin($('#btn-refresh-2'));
    FX.pulse();
    state.notice = '';
    show(v, 'random', { animate: true });
  }
  function backToToday() {
    const v = dailyPick();
    if (!v) return;
    state.notice = '';
    FX.pulse();
    show(v, 'today', { animate: true });
  }
  function toggleSaved() {
    const v = state.current; if (!v) return;
    if (saved.has(v.id)) saved.delete(v.id); else saved.add(v.id);
    store(KEYS.saved, Array.from(saved));
    syncActionButtons(v); renderState(); updateCard(v);
    if (state.filter === 'saved') renderList();
  }
  function toggleWatched() {
    const v = state.current; if (!v) return;
    if (watched.has(v.id)) watched.delete(v.id); else watched.add(v.id);
    store(KEYS.watched, Array.from(watched));
    syncActionButtons(v); renderState(); updateCard(v);
  }
  function saveNote() {
    const text = $('#note').value.trim();
    const key = localDayKey();
    if (text) notes[key] = text; else delete notes[key];
    const ok = store(KEYS.notes, notes);
    $('#note-status').textContent = ok ? (text ? 'Private / note saved' : 'Private / empty note') : 'Storage unavailable';
  }

  /* ───────────────────────────── player ─────────────────────────── */
  let lastFocus = null;
  function watch(v = state.current) {
    if (!v) return;
    if (IS_FILE || v.noEmbed) {
      window.open(ytUrl(v), '_blank', 'noopener,noreferrer');
      setNotice(IS_FILE ? 'OPENED ON YOUTUBE · THE IN-PAGE PLAYER NEEDS HTTP(S)' : 'OPENED ON YOUTUBE · EMBEDDING IS OFF FOR THIS ONE');
      return;
    }
    openModal(v);
  }
  function openModal(v) {
    lastFocus = document.activeElement;
    const modal = $('#modal');
    $('#m-title').textContent = v.title;
    $('#m-yt').href = ytUrl(v);
    const frame = $('#m-frame');
    frame.replaceChildren();
    const f = document.createElement('iframe');
    f.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(v.id)}?autoplay=1&rel=0&playsinline=1&modestbranding=1`;
    f.title = v.title;
    f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    f.referrerPolicy = 'strict-origin-when-cross-origin';
    f.allowFullscreen = true;
    frame.appendChild(f);
    modal.hidden = false;
    modal.setAttribute('aria-hidden', 'false');
    FX.pause();
    $('#btn-close').focus();
  }
  function closeModal() {
    const modal = $('#modal');
    if (modal.hidden) return;
    $('#m-frame').replaceChildren();
    modal.hidden = true;
    modal.setAttribute('aria-hidden', 'true');
    FX.resume();
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
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
    $('#btn-watched').addEventListener('click', toggleWatched);
    $('#btn-note').addEventListener('click', saveNote);
    $('#note').addEventListener('keydown', e => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') saveNote(); });
    $('#note').addEventListener('blur', () => { if ($('#note').value.trim() !== (notes[localDayKey()] || '')) saveNote(); });
    $('#btn-close').addEventListener('click', closeModal);
    $('[data-close]').addEventListener('click', closeModal);

    document.addEventListener('click', e => {
      const panel = $('#theme-panel');
      if (!panel.hidden && !panel.contains(e.target) && !$('#btn-theme').contains(e.target)) toggleThemePanel(false);
    });
    document.addEventListener('keydown', e => {
      const modalOpen = !$('#modal').hidden;
      if (e.key === 'Escape') { if (modalOpen) closeModal(); else toggleThemePanel(false); return; }
      if (modalOpen && e.key === 'Tab') {
        const f = $$('button, a[href]', $('#modal')).filter(x => !x.hidden);
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        return;
      }
      if (modalOpen || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target;
      if (t && (t.tagName === 'TEXTAREA' || t.tagName === 'INPUT')) return;
      if (e.key === 'r' || e.key === 'R') refresh();
      else if (e.key === 'c' || e.key === 'C') toggleThemePanel();
      else if (e.key === 't' || e.key === 'T') backToToday();
      else if (e.key === 'b' || e.key === 'B') goBack();
    });
  }

  function init() {
    $('#counter').textContent = pad2(VIDEOS.length);
    $('#counter').setAttribute('aria-label', `${VIDEOS.length} videos on the shelf`);
    buildThemePanel();
    setTheme(theme.id || 'lavender', theme.custom, { persist: false, snap: true });
    renderTags();
    renderList();
    wire();
    updateCountdown();
    setInterval(updateCountdown, 1000);

    const first = dailyPick();
    if (first) { state.recent.push(first.id); show(first, 'today', { animate: false }); }
    else $('#f-title').textContent = 'No videos on the shelf yet.';

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
