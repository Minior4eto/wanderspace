/* WANDERSPACE — the 3D environment.
   One real object per idea, lit with fresnel edges, slowly breathing, and it changes shape with the theme:
     eclipse  (mortality, evil)             a dark body with a thin ring of light behind it
     shards   (identity)                    a fragmented mirrored sculpture that gathers and drifts apart
     ribbon   (existentialism, absurd)      a twisting trefoil ribbon with no beginning or end
     tree     (meaning, love, stoicism)     luminous branches that grow, hold and fade
   Everything is built from three.js core, with custom GLSL, no post-processing.
   window.WanderScene.create(canvas, { still }) -> { setColors, setForm, setView, pulse, pause, resume } */
(() => {
  'use strict';

  const NOISE = `
    vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
    vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
    vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
    vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
    float snoise(vec3 v){
      const vec2 C=vec2(1./6.,1./3.); const vec4 D=vec4(0.,.5,1.,2.);
      vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
      vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
      vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
      i=mod289(i);
      vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
      float n_=.142857142857; vec3 ns=n_*D.wyz-D.xzx;
      vec4 j=p-49.*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.*x_);
      vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.-abs(x)-abs(y);
      vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
      vec4 s0=floor(b0)*2.+1.; vec4 s1=floor(b1)*2.+1.; vec4 sh=-step(h,vec4(0.));
      vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
      vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
      vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
      p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
      vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.); m=m*m;
      return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
    }`;

  const FORMS = ['eclipse', 'shards', 'ribbon', 'tree'];

  function create(canvas, opts = {}) {
    const noop = { ok: false, setColors() {}, setForm() {}, setView() {}, pulse() {}, pause() {}, resume() {} };
    const THREE = window.THREE;
    if (!canvas || !THREE) return noop;
    let renderer;
    try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' }); }
    catch (e) { return noop; }

    const still = !!opts.still;
    const mobile = window.matchMedia('(max-width: 820px)').matches;
    const TAU = Math.PI * 2;
    const V3 = THREE.Vector3;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 400);
    const CAM_Z = 7.2;
    camera.position.set(0, 0, CAM_Z);

    /* uniforms shared by every material, so one write updates the whole scene */
    const U = {
      uTime: { value: 0 }, uPulse: { value: 0 }, uDim: { value: 1 },
      uAccent: { value: new V3(0.68, 0.51, 1) }, uBase: { value: new V3(0.5, 0.51, 0.54) }, uBg: { value: new V3(0, 0, 0) },
      uRes: { value: new THREE.Vector2(1, 1) }, uPx: { value: 1 }
    };
    const own = extra => Object.assign({}, U, extra);

    /* ── atmosphere: deep nebula + stars + a soft glow where the object sits ── */
    const world = new THREE.Group();
    scene.add(world);

    const nebula = new THREE.Mesh(
      new THREE.SphereGeometry(90, 32, 20),
      new THREE.ShaderMaterial({
        uniforms: own({}), side: THREE.BackSide, depthWrite: false,
        vertexShader: 'varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `${NOISE}
          uniform float uTime; uniform vec3 uAccent; uniform vec3 uBg; uniform float uDim;
          varying vec3 vD;
          float fbm(vec3 p){ float a=.5, s=0.; for(int i=0;i<4;i++){ s+=a*snoise(p); p*=2.03; a*=.5; } return s; }
          void main(){
            vec3 d = normalize(vD);
            float n = fbm(d*1.7 + vec3(0., uTime*0.006, 0.));
            float m = smoothstep(-.1, .75, n);
            float band = smoothstep(.9, 0., abs(d.y + .15*n));
            vec3 col = uBg + uAccent*(0.05*m*m + 0.05*band*m);
            gl_FragColor = vec4(col*(0.55+0.45*uDim), 1.);
          }`
      })
    );
    nebula.renderOrder = -10;
    world.add(nebula);

    function sprites(n, rMin, rMax, size, tw) {
      const pos = new Float32Array(n * 3), rnd = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const u = Math.random() * 2 - 1, th = Math.random() * TAU, r = rMin + Math.random() * (rMax - rMin), s = Math.sqrt(1 - u * u);
        pos[i * 3] = r * s * Math.cos(th); pos[i * 3 + 1] = r * u * 0.8; pos[i * 3 + 2] = r * s * Math.sin(th);
        rnd[i * 3] = Math.random(); rnd[i * 3 + 1] = Math.random(); rnd[i * 3 + 2] = Math.random();
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('aR', new THREE.BufferAttribute(rnd, 3));
      const m = new THREE.ShaderMaterial({
        uniforms: own({ uSize: { value: size }, uTw: { value: tw } }),
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `uniform float uTime, uSize, uTw, uPx; attribute vec3 aR; varying float vA; varying float vT;
          void main(){ vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv;
            float tw = 0.65 + 0.35*sin(uTime*(0.4+aR.x*1.4)*uTw + aR.y*40.);
            gl_PointSize = clamp(uSize*uPx*(0.5+aR.z)*(30./max(-mv.z,1.)), 1., 9.*uPx); vA = tw*(0.25+0.75*aR.y); vT = aR.x; }`,
        fragmentShader: `uniform vec3 uAccent; uniform float uDim; varying float vA; varying float vT;
          void main(){ vec2 c = gl_PointCoord*2.-1.; float d = dot(c,c); if(d>1.) discard;
            vec3 col = mix(vec3(0.85,0.88,1.0), uAccent, step(0.7, vT)*0.8);
            gl_FragColor = vec4(col, smoothstep(1.,0.,d)*vA*(0.35+0.65*uDim)); }`
      });
      const p = new THREE.Points(g, m); p.frustumCulled = false; return p;
    }
    const stars = sprites(mobile ? 700 : 1500, 40, 85, 1.1, 1);
    const dust = sprites(mobile ? 90 : 220, 2.4, 6.5, 2.2, 0.6);
    world.add(stars);

    /* ── the stage holds the current object ── */
    const stage = new THREE.Group();
    scene.add(stage);
    stage.add(dust);

    /* ── dust that carries one shape into the next ── */
    const NB = mobile ? 1400 : 3200;
    const bDir = new Float32Array(NB * 3), bR = new Float32Array(NB * 4), bPos = new Float32Array(NB * 3);
    for (let i = 0; i < NB; i++) {
      const u = Math.random() * 2 - 1, a = Math.random() * 6.2832, q = Math.sqrt(1 - u * u);
      bDir.set([q * Math.cos(a), u, q * Math.sin(a)], i * 3);
      bR.set([Math.random(), Math.random(), Math.random(), Math.random()], i * 4);
    }
    const bg = new THREE.BufferGeometry();
    bg.setAttribute('position', new THREE.BufferAttribute(bPos, 3));
    bg.setAttribute('aDir', new THREE.BufferAttribute(bDir, 3));
    bg.setAttribute('aR', new THREE.BufferAttribute(bR, 4));
    const burst = new THREE.Points(bg, new THREE.ShaderMaterial({
      uniforms: own({ uBurst: { value: 0 }, uShapeA: { value: new THREE.Vector3(1, 1, 1) }, uShapeB: { value: new THREE.Vector3(1, 1, 1) } }),
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `uniform float uBurst, uPx, uTime; uniform vec3 uShapeA, uShapeB; attribute vec3 aDir; attribute vec4 aR; varying float vA;
        void main(){
          float t = uBurst;
          vec3 d = aDir * pow(aR.x, .33);
          vec3 A = d * uShapeA, B = d * uShapeB;
          float m = smoothstep(.18, .82, t + (aR.y - .5) * .3);
          vec3 p = mix(A, B, m);
          float sw = sin(3.14159 * t);
          vec3 tang = normalize(vec3(-aDir.z, .25, aDir.x));
          p += tang * sw * (.5 + aR.z) * 1.1 + (aR.xyz - .5) * sw * 1.4;
          vA = sw * (.35 + .65 * aR.w);
          vec4 mv = modelViewMatrix * vec4(p, 1.); gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.6 + 2.6 * aR.w) * uPx * (7. / -mv.z) * (.6 + sw);
        }`,
      fragmentShader: `uniform vec3 uAccent; uniform float uDim; varying float vA;
        void main(){ vec2 c = gl_PointCoord*2.-1.; float d = dot(c,c); if(d>1.) discard;
          gl_FragColor = vec4(mix(uAccent, vec3(1.), .45) * smoothstep(1., 0., d) * vA * (.5 + .5*uDim), 1.); }`
    }));
    burst.frustumCulled = false; burst.visible = false;
    stage.add(burst);
    const SHAPE = { eclipse: [1.05, 1.05, .4], shards: [1.3, 1.3, 1.1], ribbon: [1.5, 1.1, .8], tree: [1.2, 1.5, .6] };

    const halo = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 14),
      new THREE.ShaderMaterial({
        uniforms: own({ uShow: { value: 1 } }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform vec3 uAccent; uniform float uDim, uPulse; varying vec2 vUv;
          void main(){ float r = length(vUv-.5)*2.; float g = exp(-r*r*5.5); gl_FragColor = vec4(uAccent*g*(0.10+0.06*uPulse)*uDim, 1.); }`
      })
    );
    halo.position.z = -3; halo.renderOrder = -5;
    stage.add(halo);

    /* a lit, translucent surface: dark body, glowing fresnel edge, a thin specular glint */
    function glass(glassAmount, wob, extra, solid) {
      return new THREE.ShaderMaterial({
        uniforms: own(Object.assign({ uShow: { value: 0 }, uGlass: { value: glassAmount }, uWob: { value: wob }, uSolid: { value: solid ? 1 : 0 }, uRun: { value: 0 } }, extra || {})),
        transparent: true, depthWrite: !!solid, blending: solid ? THREE.NormalBlending : THREE.AdditiveBlending, side: solid ? THREE.FrontSide : THREE.DoubleSide,
        polygonOffset: !!solid, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
        vertexShader: `${NOISE}
          uniform float uTime, uPulse, uWob; attribute float aU;
          varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vU;
          void main(){
            vec3 p = position; vec3 n = normal;
            float w = snoise(p*1.4 + vec3(0., uTime*0.12, 0.)) * uWob;
            p += n * (w + uPulse*0.05*sin(length(p)*7. - uTime*5.));
            vec4 mv = modelViewMatrix*vec4(p,1.);
            vN = normalize(normalMatrix*n); vV = -mv.xyz; vP = p; vU = aU;
            gl_Position = projectionMatrix*mv;
          }`,
        fragmentShader: `${NOISE}
          uniform vec3 uAccent, uBase; uniform float uShow, uDim, uGlass, uTime, uSolid, uRun;
          varying vec3 vN; varying vec3 vV; varying vec3 vP; varying float vU;
          void main(){
            vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
            vec3 V = normalize(vV);
            float nv = clamp(dot(N,V),0.,1.);
            float f = pow(1.-nv, 2.3);
            vec3 L = normalize(vec3(-.55,.6,.65));
            float diff = max(dot(N,L),0.);
            float spec = pow(max(dot(N,normalize(L+V)),0.), 70.);
            float band = .5+.5*sin(vU*46. + uTime*.35 + nv*5.);
            vec3 hot = mix(uAccent, vec3(1.), .55);
            vec3 R = reflect(-V, N);
            float sh = snoise(R*1.6 + vec3(0., uTime*.07, 0.));
            float env = smoothstep(-.3,.9, R.y*.7 + R.x*.35 + sh*.5*uSolid);
            float run = pow(max(0., sin((vU - uTime*.045)*25.13)), 22.);
            float env2 = smoothstep(.55,.98, dot(R, normalize(vec3(.6,.25,.75))));
            vec3 col = uBase*(.03+.20*diff*diff) + uAccent*f*1.0 + hot*band*f*.25 + vec3(1.)*spec*.22;
            vec3 film = .5 + .5*cos(6.2832*(nv*1.1 + sh*.25 + vec3(0., .33, .67)));
            col += (uAccent*env*.34 + vec3(1.)*env2*.30 + film*f*.32 + film*env*.08) * uSolid;
            col += hot * run * (.25 + f) * uRun * .9;
            float alpha = mix(1., .16 + f*.84, uGlass);
            if (uSolid > .5) gl_FragColor = vec4(col*uDim, uShow);
            else gl_FragColor = vec4(col*uShow*uDim, alpha*uShow);
          }`
      });
    }

    const forms = {};
    const edgeMats = [];
    const lineMat = k => { const m = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }); m.userData.k = k; edgeMats.push(m); return m; };

    /* 1 ─ eclipse ─────────────────────────────────────────────── */
    (() => {
      const g = new THREE.Group();
      const body = new THREE.Mesh(
        new THREE.SphereGeometry(1, mobile ? 64 : 112, mobile ? 40 : 72),
        new THREE.ShaderMaterial({
          uniforms: own({ uShow: { value: 0 }, uBump: { value: 1 } }), transparent: true, extensions: { derivatives: true },
          vertexShader: `${NOISE} uniform float uTime, uPulse; varying vec3 vN; varying vec3 vV; varying vec3 vP;
            void main(){ vec3 p = position*(1.+uPulse*0.02*sin(position.y*9.-uTime*4.)); vec4 mv = modelViewMatrix*vec4(p,1.); vN = normalize(normalMatrix*normal); vV = -mv.xyz; vP = position; gl_Position = projectionMatrix*mv; }`,
          fragmentShader: `${NOISE} uniform vec3 uAccent, uBase; uniform float uShow, uDim, uTime; uniform float uBump; varying vec3 vN; varying vec3 vV; varying vec3 vP;
            void main(){
              vec3 N = normalize(vN), V = normalize(vV);
              float nv = clamp(dot(N,V),0.,1.);
              float rim = pow(1.-nv, 3.2);
              vec3 L = normalize(vec3(-.8,.62,-.7));
              float lit = pow(max(dot(N,L)*.5+.5, 0.), 3.2);
              vec3 q = normalize(vP);
              float h0 = .55*snoise(q*2.2) + .28*snoise(q*5.1) + .14*snoise(q*11.) + .07*snoise(q*23.);
              float cr = 1. - abs(snoise(q*4.3 + 7.)); cr = pow(cr, 5.);
              float crr = 1. - abs(snoise(q*9.1 + 3.)); crr = pow(crr, 7.);
              float hgt = h0 + .6*cr + .35*crr;
              vec3 gh = vec3(dFdx(hgt), dFdy(hgt), 0.);
              vec3 Nb = normalize(N - gh*vec3(1.6*uBump, 1.6*uBump, 0.));
              float litB = pow(max(dot(Nb,L)*.5+.5, 0.), 2.4);
              float limb = pow(1.-nv, 1.6);
              float maria = smoothstep(-.1, .5, snoise(q*1.3 + 11.));
              vec3 col = uBase*(.010 + .020*(hgt*.5+.5)*(1.-.4*maria)) + uAccent*limb*litB*(.55 + 1.6*(hgt*.5+.5)) + uAccent*rim*lit*1.1 + uBase*.07*litB*litB;
              col += mix(uAccent, vec3(1.), .5) * cr * limb * litB * .35;
              gl_FragColor = vec4(col*uDim, uShow);
            }`
        })
      );
      body.renderOrder = 1;
      g.add(body);
      const dist = CAM_Z + 0.7, k = dist / CAM_Z;
      const corona = new THREE.Mesh(
        new THREE.PlaneGeometry(9 * k, 9 * k),
        new THREE.ShaderMaterial({
          uniforms: own({ uShow: { value: 0 }, uScale: { value: 9 / 2 } }),
          transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
          vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
          fragmentShader: `${NOISE} uniform vec3 uAccent; uniform float uShow, uDim, uTime, uPulse, uScale; varying vec2 vUv;
            void main(){
              vec2 p = (vUv-.5)*2.*uScale;
              float r = length(p); float a = atan(p.y,p.x);
              float la = 2.3;
              float side = pow(.5+.5*cos(a-la), 2.2);
              float edge = r - 1.0;
              float ring = exp(-pow(edge/(.016+.012*side), 2.));
              float halo = exp(-max(edge,0.)*(3.4-1.8*side)) * step(0., edge);
              float streak = .6 + .4*snoise(vec3(cos(a)*2.4, sin(a)*2.4, uTime*.07 + r*.8));
              float breathe = .92+.08*sin(uTime*.5);
              float rays = .55 + .45*snoise(vec3(cos(a)*4.5, sin(a)*4.5, uTime*.05 + 3.)) * snoise(vec3(cos(a)*1.7, sin(a)*1.7, r*.5 - uTime*.02));
              float I = (ring*(.35+1.35*side) + halo*(.10+.55*side)*streak*clamp(rays,.12,1.2)) * breathe * (1.+uPulse*.8);
              vec3 col = mix(uAccent, vec3(1.), ring*side*.55);
              /* the diamond ring: one bead of light where the sun slips out, with fine cross spikes */
              vec2 dq = p - vec2(cos(la), sin(la)) * 1.0;
              float bead = exp(-dot(dq,dq)*260.) * 3.2;
              float sp1 = exp(-abs(dq.y)*70.) * exp(-abs(dq.x)*3.4);
              float sp2 = exp(-abs(dq.x)*70.) * exp(-abs(dq.y)*3.4);
              float flare = (bead + (sp1 + sp2) * .55) * (.75 + .25*sin(uTime*.7));
              /* faint filaments streaming outward */
              float fil = pow(max(0., snoise(vec3(a*14., r*2.6 - uTime*.04, 5.))), 3.) * exp(-max(edge,0.)*1.7) * step(0., edge) * (.2 + .8*side);
              gl_FragColor = vec4((col*I + mix(uAccent, vec3(1.), .7)*flare + uAccent*fil*.55)*uShow*uDim, 1.);
            }`
        })
      );
      corona.position.z = -0.7; corona.renderOrder = 0;
      g.add(corona);
      /* stars that flicker on in the ring of light, one after another */
      const nS = mobile ? 24 : 48, sp = new Float32Array(nS * 3), sph = new Float32Array(nS);
      for (let i = 0; i < nS; i++) {
        const a = 2.3 + (Math.random() - .5) * 2.8, r = 1.04 + Math.random() * 0.55;
        sp.set([Math.cos(a) * r, Math.sin(a) * r, -0.2], i * 3); sph[i] = Math.random();
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('aP', new THREE.BufferAttribute(sph, 1));
      const ringStars = new THREE.Points(sg, new THREE.ShaderMaterial({
        uniforms: own({ uShow: { value: 0 } }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `uniform float uTime, uPx; attribute float aP; varying float vA;
          void main(){ float tw = pow(max(0., sin(uTime*.23 + aP*6.2832)), 6.); vA = tw; vec4 mv = modelViewMatrix*vec4(position,1.); gl_Position = projectionMatrix*mv; gl_PointSize = (2.5 + 7.*tw)*uPx*(7.2/-mv.z); }`,
        fragmentShader: `uniform vec3 uAccent; uniform float uShow, uDim; varying float vA;
          void main(){ vec2 c = gl_PointCoord*2.-1.; float d = dot(c,c); if(d>1.) discard; gl_FragColor = vec4(mix(uAccent, vec3(1.), .65)*smoothstep(1.,0.,d)*vA*uShow*uDim, 1.); }`
      }));
      ringStars.frustumCulled = false;
      g.add(ringStars);
      /* an orbiting moon on a thin tilted ring */
      const orbit = new THREE.Group(); orbit.rotation.set(1.18, 0.18, -0.38);
      const ringMat = glass(1, 0, {});
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.8, 0.0045, 6, 260), ringMat);
      const moon = new THREE.Mesh(new THREE.SphereGeometry(0.11, 40, 28), glass(1, 0.012, {}));
      orbit.add(ring, moon);
      g.add(orbit);
      forms.eclipse = {
        group: g, mats: [body.material, corona.material, ringMat, moon.material, ringStars.material], scale: 1.05,
        update(t) { moon.position.set(Math.cos(t * 0.11) * 1.8, Math.sin(t * 0.11) * 1.8, 0); body.rotation.y = t * 0.01; }
      };
    })();

    /* 2 ─ shards ──────────────────────────────────────────────── */
    (() => {
      const g = new THREE.Group();
      const mat = glass(0, 0.0, {}, true);
      const edge = lineMat(0.6);
      const bases = [new THREE.OctahedronGeometry(1, 0), new THREE.TetrahedronGeometry(1, 0), new THREE.IcosahedronGeometry(1, 0)];
      const edges = bases.map(b => new THREE.EdgesGeometry(b));
      const N = mobile ? 20 : 30;
      const items = [];
      for (let i = 0; i < N; i++) {
        const k = i % 3;
        const m = new THREE.Mesh(bases[k], mat);
        m.add(new THREE.LineSegments(edges[k], edge));
        const y = 1 - (i + 0.5) / N * 2, rad = Math.sqrt(1 - y * y), th = i * 2.399963;
        const home = new V3(Math.cos(th) * rad * 0.82, y * 1.05, Math.sin(th) * rad * 0.7);
        const s = 0.2 + Math.random() * 0.2;
        m.scale.set(s * (0.5 + Math.random() * 0.9), s * (0.7 + Math.random() * 1.1), s * (0.4 + Math.random() * 0.8));
        items.push({ m, home, dir: home.clone().normalize().add(new V3(Math.random() - .5, Math.random() - .5, Math.random() - .5).multiplyScalar(0.7)),
          rot0: new V3(Math.random() * TAU, Math.random() * TAU, Math.random() * TAU), dev: new V3((Math.random() - .5) * 2.4, (Math.random() - .5) * 2.4, (Math.random() - .5) * 2.4), ph: Math.random() * TAU });
        g.add(m);
      }
      /* thin threads between neighbours: they light up as the pieces drift apart, as if the mirror remembers being whole */
      const pairs = [];
      items.forEach((a, i) => {
        items.map((b, j) => [j, a.home.distanceTo(b.home)]).filter(x => x[0] !== i).sort((p, q) => p[1] - q[1]).slice(0, 2)
          .forEach(([j]) => { if (!pairs.some(p => (p[0] === i && p[1] === j) || (p[0] === j && p[1] === i))) pairs.push([i, j]); });
      });
      const lp = new Float32Array(pairs.length * 6), lc = new Float32Array(pairs.length * 6);
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(lp, 3).setUsage(THREE.DynamicDrawUsage));
      lg.setAttribute('color', new THREE.BufferAttribute(lc, 3).setUsage(THREE.DynamicDrawUsage));
      const lmat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
      const threads = new THREE.LineSegments(lg, lmat); threads.frustumCulled = false;
      g.add(threads);
      forms.shards = {
        group: g, mats: [mat], edges: [edge, lmat], scale: 0.8, threads,
        update(t, pulse) {
          const gather = 0.5 + 0.5 * Math.sin(t * 0.21);          /* 0 = assembled, 1 = scattered */
          const spread = 0.04 + 0.72 * gather * gather + pulse * 0.5;
          for (const it of items) {
            const w = 0.5 + 0.5 * Math.sin(t * 0.4 + it.ph);
            it.m.position.copy(it.home).addScaledVector(it.dir, spread * (0.6 + 0.4 * w));
            it.m.rotation.set(it.rot0.x + it.dev.x * spread + t * 0.03, it.rot0.y + it.dev.y * spread + t * 0.04, it.rot0.z + it.dev.z * spread);
          }
          g.rotation.y = t * 0.05;
          const ac = U.uAccent.value;
          for (let k = 0; k < pairs.length; k++) {
            const a = items[pairs[k][0]].m.position, b = items[pairs[k][1]].m.position, d = a.distanceTo(b);
            const w = Math.max(0, Math.min(1, (d - 0.45) / 0.9)) * (1 - Math.max(0, Math.min(1, (d - 2.0) / 1.0)));
            lp.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6);
            lc.set([ac.x * w, ac.y * w, ac.z * w, ac.x * w, ac.y * w, ac.z * w], k * 6);
          }
          lg.attributes.position.needsUpdate = true; lg.attributes.color.needsUpdate = true;
        }
      };
    })();

    /* 3 ─ ribbon: layered silk, each sheet made of fine iridescent strands ───────── */
    (() => {
      const g = new THREE.Group();
      const segs = mobile ? 360 : 700, across = 28;
      const C = t => new V3(Math.sin(t) + 2 * Math.sin(2 * t), Math.cos(t) - 2 * Math.cos(2 * t), -Math.sin(3 * t)).multiplyScalar(0.44);
      const silk = new THREE.ShaderMaterial({
        uniforms: own({ uShow: { value: 0 } }), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: `uniform float uTime, uPulse; attribute float aU; attribute float aV; attribute float aL; varying vec3 vN; varying vec3 vV; varying float vU; varying float vW; varying float vL;
          void main(){ vec3 p = position + normal * sin(aU*60. + uTime*.6 + aV*2.)*.006*(1.+uPulse*3.);
            vec4 mv = modelViewMatrix*vec4(p,1.); vN = normalize(normalMatrix*normal); vV = -mv.xyz; vU = aU; vW = aV; vL = aL; gl_Position = projectionMatrix*mv; }`,
        fragmentShader: `uniform vec3 uAccent; uniform float uShow, uDim, uTime; varying vec3 vN; varying vec3 vV; varying float vU; varying float vW; varying float vL;
          void main(){
            vec3 N = normalize(vN); if(!gl_FrontFacing) N = -N;
            vec3 V = normalize(vV); float nv = clamp(dot(N,V), 0., 1.); float f = pow(1.-nv, 1.8);
            float wob = sin(vU*38. + vL*5.) * .6 + sin(vU*91. - vL*3.) * .25;
            float strand = pow(.5 + .5*sin(vW*(46. + 10.*vL) + wob + uTime*.12), 5.);
            float fine = pow(.5 + .5*sin(vW*180. + vU*9.), 8.);
            vec3 film = .5 + .5*cos(6.2832*(nv*1.3 + vU*2. + vL*.2 + vec3(0., .33, .67)));
            vec3 hot = mix(uAccent, vec3(1.), .55);
            float run = pow(max(0., sin((vU - uTime*.045)*25.13)), 22.);
            float edge = 1. - pow(abs(vW), 3.);
            vec3 col = uAccent*(.05 + f*.45) + mix(uAccent, film, .45)*strand*(.22 + .8*f) + hot*fine*.1 + film*f*.22 + hot*run*(.3 + f)*.9;
            gl_FragColor = vec4(col*edge*uShow*uDim*.34, 1.);
          }`
      });
      const sheet = (phiOff, W, sc, layer) => {
        const pos = [], uv = [], av = [], al = [], idx = [];
        for (let i = 0; i <= segs; i++) {
          const t = (i / segs) * TAU, e = 1e-3;
          const p = C(t).multiplyScalar(sc), p1 = C(t + e).multiplyScalar(sc), p0 = C(t - e).multiplyScalar(sc);
          const T = p1.clone().sub(p0).normalize();
          const acc = p1.clone().add(p0).sub(p.clone().multiplyScalar(2));
          const Nn = acc.sub(T.clone().multiplyScalar(acc.dot(T))).normalize();
          const B = new V3().crossVectors(T, Nn);
          const phi = 1.5 * t + phiOff;
          const Wv = Nn.clone().multiplyScalar(Math.cos(phi)).addScaledVector(B, Math.sin(phi));
          const w = W * (.85 + .15 * Math.sin(t * 3 + layer));
          for (let j = 0; j <= across; j++) {
            const v = (j / across) * 2 - 1;
            const q = p.clone().addScaledVector(Wv, v * w).addScaledVector(Nn.clone().cross(Wv).normalize(), Math.sin(v * 2.2 + t * 4 + layer) * .025);
            pos.push(q.x, q.y, q.z); uv.push(i / segs); av.push(v); al.push(layer);
          }
        }
        for (let i = 0; i < segs; i++) for (let j = 0; j < across; j++) {
          const a = i * (across + 1) + j, b = a + across + 1;
          idx.push(a, b, a + 1, b, b + 1, a + 1);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('aU', new THREE.Float32BufferAttribute(uv, 1));
        geo.setAttribute('aV', new THREE.Float32BufferAttribute(av, 1));
        geo.setAttribute('aL', new THREE.Float32BufferAttribute(al, 1));
        geo.setIndex(idx); geo.computeVertexNormals();
        const m = new THREE.Mesh(geo, silk); m.frustumCulled = false; return m;
      };
      g.add(sheet(0, .36, 1.0, 0), sheet(.9, .24, 1.06, 1), sheet(-.8, .16, .94, 2));
      /* three hair-thin strands tracing the path */
      const pts = []; for (let i = 0; i < 200; i++) pts.push(C((i / 200) * TAU));
      const spine = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 600, 0.008, 5, true), glass(1, 0, { uRun: { value: 1 } }));
      g.add(spine);
      forms.ribbon = { group: g, mats: [silk, spine.material], scale: 1.0, update(t) { g.rotation.y = t * 0.08; g.rotation.x = 0.35 + Math.sin(t * 0.13) * 0.12; g.rotation.z = t * 0.02; } };
    })();

    /* 4 ─ tree ────────────────────────────────────────────────── */
    (() => {
      const g = new THREE.Group();
      let seed = 1234567;
      const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
      const segs = [];
      const MAXD = mobile ? 7 : 8;
      const grow = (a, dir, len, d, birth) => {
        const b = a.clone().addScaledVector(dir, len);
        segs.push({ a, b, d, birth, w: Math.max(0.8, 3.2 * Math.pow(0.7, d)) });
        if (d >= MAXD) return;
        const n = d < 2 ? 3 : 2;
        for (let k = 0; k < n; k++) {
          const axis = new V3(rnd() - .5, 0.1 * (rnd() - .5), rnd() - .5).normalize();
          const nd = dir.clone().applyAxisAngle(axis, (0.35 + rnd() * 0.5) * (k % 2 ? 1 : -1)).add(new V3(0, 0.12, 0)).normalize();
          grow(b, nd, len * (0.7 + rnd() * 0.08), d + 1, birth + 0.09 + rnd() * 0.05);
        }
      };
      grow(new V3(0, -1.55, 0), new V3(0, 1, 0), 0.82, 0, 0);
      const n = segs.length;
      const P = new Float32Array(n * 4 * 3), O = new Float32Array(n * 4 * 3), S = new Float32Array(n * 4), M = new Float32Array(n * 4 * 4), I = [];
      segs.forEach((s, i) => {
        const ends = [s.a, s.a, s.b, s.b], others = [s.b, s.b, s.a, s.a], side = [-1, 1, -1, 1];
        for (let k = 0; k < 4; k++) {
          const o = (i * 4 + k);
          P.set([ends[k].x, ends[k].y, ends[k].z], o * 3); O.set([others[k].x, others[k].y, others[k].z], o * 3);
          S[o] = side[k]; M.set([s.d / MAXD, s.birth, s.w, k < 2 ? 0 : 1], o * 4);
        }
        const o = i * 4; I.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
      });
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
      geo.setAttribute('aOther', new THREE.BufferAttribute(O, 3));
      geo.setAttribute('aSide', new THREE.BufferAttribute(S, 1));
      geo.setAttribute('aMeta', new THREE.BufferAttribute(M, 4));
      geo.setIndex(I);
      const gl = { uGrow: { value: 0 }, uFade: { value: 0 }, uShow: { value: 0 } };
      const mat = new THREE.ShaderMaterial({
        uniforms: own(gl), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: `${NOISE}
          uniform float uTime, uPx, uPulse; uniform vec2 uRes;
          attribute vec3 aOther; attribute float aSide; attribute vec4 aMeta;
          varying float vSide; varying vec4 vMeta;
          vec3 sway(vec3 p){ float k = (p.y + 1.6) * 0.045; return p + vec3(snoise(p*.8 + vec3(0., uTime*.12, 0.)), snoise(p*.8 + vec3(9., uTime*.12, 3.)), snoise(p*.8 + vec3(4., uTime*.12, 7.))) * k; }
          void main(){
            vec4 c0 = projectionMatrix*modelViewMatrix*vec4(sway(position), 1.);
            vec4 c1 = projectionMatrix*modelViewMatrix*vec4(sway(aOther), 1.);
            vec2 s0 = c0.xy/c0.w*uRes*.5, s1 = c1.xy/c1.w*uRes*.5;
            vec2 d = s1 - s0; d = length(d) > 1e-4 ? normalize(d) : vec2(1., 0.);
            vec2 nrm = vec2(-d.y, d.x);
            float w = aMeta.z * uPx * (1. + uPulse*.5) * (1. - .35*aMeta.w) * 2.1;
            gl_Position = c0;
            gl_Position.xy += nrm * aSide * w / (uRes*.5) * c0.w;
            vSide = aSide; vMeta = aMeta;
          }`,
        fragmentShader: `
          uniform vec3 uAccent; uniform float uGrow, uFade, uShow, uDim, uTime;
          varying float vSide; varying vec4 vMeta;
          void main(){
            float reveal = smoothstep(vMeta.y, vMeta.y + .1 + vMeta.w*.05, uGrow*1.35);
            float gone = 1. - smoothstep(vMeta.y*.7, vMeta.y*.7 + .45, uFade*1.2);
            float edge = pow(1. - abs(vSide), 1.6);
            float depthGlow = 1. - vMeta.x;
            vec3 col = mix(uAccent, vec3(1.), .25 + .45*depthGlow*depthGlow) * (.5 + 1.1*depthGlow);
            float ph = fract(uTime*.11 - vMeta.y*.85);
            float pls = smoothstep(0., .03, ph) * (1. - smoothstep(.03, .22, ph));
            col *= 1. + 2.6*pls;
            float pulse = .8 + .2*sin(uTime*1.3 + vMeta.y*30.);
            gl_FragColor = vec4(col*edge*reveal*gone*pulse*uShow*uDim, edge*reveal*gone*uShow);
          }`
      });
      const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false;
      g.add(mesh);
      /* sparks at the tips */
      const tips = segs.filter(s => s.d >= MAXD - 1);
      const tp = new Float32Array(tips.length * 3), tb = new Float32Array(tips.length);
      tips.forEach((s, i) => { tp.set([s.b.x, s.b.y, s.b.z], i * 3); tb[i] = s.birth; });
      const tg = new THREE.BufferGeometry();
      tg.setAttribute('position', new THREE.BufferAttribute(tp, 3));
      tg.setAttribute('aB', new THREE.BufferAttribute(tb, 1));
      const sparks = new THREE.Points(tg, new THREE.ShaderMaterial({
        uniforms: own(gl), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `uniform float uTime, uPx, uFade; attribute float aB; varying float vB; void main(){ vB = aB; vec3 pp = position + vec3(sin(aB*91.)*.5, -(.2 + fract(aB*7.)*.6), cos(aB*57.)*.5) * uFade * 1.3; vec4 mv = modelViewMatrix*vec4(pp,1.); gl_Position = projectionMatrix*mv; gl_PointSize = (7.+3.*sin(uTime*1.7+aB*40.))*uPx*(7./-mv.z); }`,
        fragmentShader: `uniform vec3 uAccent; uniform float uGrow, uFade, uShow, uDim, uTime; varying float vB;
          void main(){ vec2 c = gl_PointCoord*2.-1.; float d = dot(c,c); if(d>1.) discard;
            float reveal = smoothstep(vB, vB+.12, uGrow*1.35); float gone = 1.-smoothstep(.3, 1., uFade);
            float ph = fract(uTime*.11 - vB*.85); float fl = smoothstep(0.,.03,ph)*(1.-smoothstep(.03,.22,ph));
            gl_FragColor = vec4(mix(uAccent, vec3(1.), .5)*smoothstep(1.,0.,d)*reveal*gone*uShow*uDim*(.9 + 2.*fl), 1.); }`
      }));
      sparks.frustumCulled = false;
      g.add(sparks);
      /* leaves of light: thousands of tiny points along the outer twigs, in slightly different hues */
      const outer = segs.filter(s => s.d >= MAXD - 2), perSeg = mobile ? 2 : 4;
      const lp = new Float32Array(outer.length * perSeg * 3), lm = new Float32Array(outer.length * perSeg * 3);
      outer.forEach((s, i) => { for (let k = 0; k < perSeg; k++) {
        const t = .35 + rnd() * .65, j = (i * perSeg + k) * 3;
        lp.set([s.a.x + (s.b.x - s.a.x) * t + (rnd() - .5) * .08, s.a.y + (s.b.y - s.a.y) * t + (rnd() - .5) * .08, s.a.z + (s.b.z - s.a.z) * t + (rnd() - .5) * .08], j);
        lm.set([s.birth + rnd() * .06, rnd(), rnd()], j);
      } });
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.BufferAttribute(lp, 3)); lg.setAttribute('aM', new THREE.BufferAttribute(lm, 3));
      const leaves = new THREE.Points(lg, new THREE.ShaderMaterial({
        uniforms: own(gl), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `uniform float uTime, uPx, uFade; attribute vec3 aM; varying vec3 vM;
          void main(){ vM = aM; vec3 pp = position + vec3(sin(uTime*.6 + aM.y*40.)*.02, sin(uTime*.5 + aM.z*30.)*.02, 0.);
            pp += vec3(sin(aM.y*91.)*.6, -(.3 + aM.z*.9), cos(aM.z*57.)*.6) * uFade * 1.4 * aM.y;
            vec4 mv = modelViewMatrix*vec4(pp,1.); gl_Position = projectionMatrix*mv; gl_PointSize = (2.2 + 4.5*aM.z)*uPx*(7./-mv.z); }`,
        fragmentShader: `uniform vec3 uAccent; uniform float uGrow, uFade, uShow, uDim, uTime; varying vec3 vM;
          void main(){ vec2 c = gl_PointCoord*2.-1.; float d = dot(c,c); if(d>1.) discard;
            float reveal = smoothstep(vM.x, vM.x+.1, uGrow*1.35); float gone = 1.-smoothstep(.1, 1., uFade*(.6+vM.y*.8));
            vec3 hue = .5 + .5*cos(6.2832*(vM.y*.25 + vec3(0., .33, .67)));
            vec3 col = mix(uAccent, hue, .25 + .25*vM.z); col = mix(col, vec3(1.), .25*vM.z);
            float tw = .55 + .45*sin(uTime*(.8 + vM.y*2.) + vM.z*50.);
            gl_FragColor = vec4(col*smoothstep(1.,0.,d)*reveal*gone*tw*uShow*uDim*.75, 1.); }`
      }));
      leaves.frustumCulled = false;
      g.add(leaves);
      /* the ground: a pool of light with slow rings spreading from the roots */
      const ground = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), new THREE.ShaderMaterial({
        uniforms: own(gl), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
        vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.); }',
        fragmentShader: `uniform vec3 uAccent; uniform float uGrow, uFade, uShow, uDim, uTime; varying vec2 vUv;
          void main(){ float r = length(vUv-.5)*2.; float pool = exp(-r*r*7.);
            float ring = pow(max(0., sin(r*18. - uTime*.7)), 6.) * exp(-r*3.2) * .55;
            float a = pool*.34 + ring; float show = smoothstep(0., .25, uGrow) * (1. - smoothstep(.5, 1., uFade));
            gl_FragColor = vec4(uAccent*a*show*uShow*uDim, 1.); }`
      }));
      ground.rotation.x = -Math.PI / 2 + 0.28; ground.position.y = -1.55;
      g.add(ground);
      let phase = 0;
      forms.tree = {
        group: g, mats: [mat, sparks.material, leaves.material, ground.material], scale: 0.92, gl,
        restart() { phase = 0; },
        update(t, pulse, dt) {
          if (still) { gl.uGrow.value = 1; gl.uFade.value = 0; g.rotation.y = 0.2; return; }
          phase += dt;
          const P = 21;
          const k = phase % P;
          gl.uGrow.value = Math.min(1, k / 8);
          gl.uFade.value = k < 15 ? 0 : Math.min(1, (k - 15) / 5);
          g.rotation.y = Math.sin(t * 0.07) * 0.5;
        }
      };
    })();

    Object.entries(forms).forEach(([k, f]) => { f.name = k; f.group.visible = false; f.mix = 0; stage.add(f.group); });

    /* ── colours, views, responsiveness ── */
    const cur = { accent: [.68, .51, 1], base: [.5, .51, .54], bg: [0, 0, 0] }, tgt = { accent: cur.accent.slice(), base: cur.base.slice(), bg: cur.bg.slice() };
    const clear = new THREE.Color();
    function pushColors() {
      U.uAccent.value.set(...cur.accent); U.uBase.value.set(...cur.base); U.uBg.value.set(...cur.bg);
      clear.setRGB(...cur.bg); renderer.setClearColor(clear, 1);
      edgeMats.forEach(m => m.color.setRGB(cur.accent[0] * m.userData.k * 1.6, cur.accent[1] * m.userData.k * 1.6, cur.accent[2] * m.userData.k * 1.6));
    }
    function lerpColors(k) {
      let moving = false;
      ['accent', 'base', 'bg'].forEach(key => { for (let i = 0; i < 3; i++) { const d = tgt[key][i] - cur[key][i]; if (Math.abs(d) > 5e-4) { cur[key][i] += d * k; moving = true; } else cur[key][i] = tgt[key][i]; } });
      if (moving) pushColors();
    }
    pushColors();

    /* ── bloom + vignette + a whisper of chromatic fringe ── */
    const qScene = new THREE.Scene(), qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const qMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), null); qMesh.frustumCulled = false; qScene.add(qMesh);
    const QV = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }';
    const pm = (frag, u) => new THREE.ShaderMaterial({ uniforms: u, vertexShader: QV, fragmentShader: frag, depthTest: false, depthWrite: false });
    const bright = pm(`uniform sampler2D tDiffuse; varying vec2 vUv;
      void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(.26, .85, l), 1.); }`, { tDiffuse: { value: null } });
    const blur = pm(`uniform sampler2D tDiffuse; uniform vec2 uDir; varying vec2 vUv;
      void main(){ vec3 s = texture2D(tDiffuse, vUv).rgb * .227027;
        s += (texture2D(tDiffuse, vUv + uDir*1.3846).rgb + texture2D(tDiffuse, vUv - uDir*1.3846).rgb) * .3162162;
        s += (texture2D(tDiffuse, vUv + uDir*3.2308).rgb + texture2D(tDiffuse, vUv - uDir*3.2308).rgb) * .0702703;
        gl_FragColor = vec4(s, 1.); }`, { tDiffuse: { value: null }, uDir: { value: new THREE.Vector2() } });
    const comp = pm(`uniform sampler2D tBase, tB1, tB2; uniform float uStr; varying vec2 vUv;
      void main(){
        vec2 q = vUv - .5; float r = length(q);
        vec2 o = q * (.0015 + .0035*r*r);
        vec3 b = vec3(texture2D(tBase, vUv + o).r, texture2D(tBase, vUv).g, texture2D(tBase, vUv - o).b);
        vec3 g = texture2D(tB1, vUv).rgb * .55 + texture2D(tB2, vUv).rgb * .95;
        vec3 c = b + g * uStr;
        c *= mix(1., smoothstep(.95, .25, r), .5);
        gl_FragColor = vec4(c, 1.); }`, { tBase: { value: null }, tB1: { value: null }, tB2: { value: null }, uStr: { value: 1 } });
    let post = null, usePost = renderer.capabilities.isWebGL2 && !mobile;
    function mkRT(w, h, ms) {
      return new THREE.WebGLRenderTarget(Math.max(1, w | 0), Math.max(1, h | 0), { samples: ms ? 4 : 0, depthBuffer: !!ms, stencilBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
    }
    function buildPost() {
      if (post) Object.values(post).forEach(t => { if (t.dispose) t.dispose(); });
      post = null;
      if (!usePost) return;
      try {
        const sz = renderer.getDrawingBufferSize(new THREE.Vector2());
        post = { main: mkRT(sz.x, sz.y, true), a: mkRT(sz.x / 2, sz.y / 2), b: mkRT(sz.x / 2, sz.y / 2), c: mkRT(sz.x / 4, sz.y / 4), d: mkRT(sz.x / 4, sz.y / 4) };
        post.size = sz;
      } catch (e) { post = null; usePost = false; }
    }
    function pass(mat, target) { qMesh.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); }
    function blurPass(src, dst, w, h, dx, dy) { blur.uniforms.tDiffuse.value = src.texture; blur.uniforms.uDir.value.set(dx / w, dy / h); pass(blur, dst); }
    function renderPost() {
      renderer.setRenderTarget(post.main); renderer.render(scene, camera);
      const sz = post.size, hw = sz.x / 2, hh = sz.y / 2, qw = sz.x / 4, qh = sz.y / 4;
      bright.uniforms.tDiffuse.value = post.main.texture; pass(bright, post.a);
      blurPass(post.a, post.b, hw, hh, 1, 0); blurPass(post.b, post.a, hw, hh, 0, 1);
      blurPass(post.a, post.c, qw, qh, 1.4, 0); blurPass(post.c, post.d, qw, qh, 0, 1.4);
      blurPass(post.d, post.c, qw, qh, 2.2, 0); blurPass(post.c, post.d, qw, qh, 0, 2.2);
      comp.uniforms.tBase.value = post.main.texture; comp.uniforms.tB1.value = post.a.texture; comp.uniforms.tB2.value = post.d.texture;
      pass(comp, null);
    }

    let want = 'eclipse', view = 'today', dim = 1, dimT = 1, paused = false, raf = 0, pulse = 0, last = performance.now();
    let burstT = 1, holdUntil = 0, scrollK = 0, scrollS = 0, low = false, frames = 0, slow = 0, curShape = 'eclipse';
    const target = new THREE.Vector2(), mouse = new THREE.Vector2();
    const place = { x: 0, y: 0, s: 1 }, placeT = { x: 0, y: 0, s: 1 };
    let aspect = 1;

    function layout() {
      const portrait = aspect < 0.95;
      if (view === 'today') {
        if (portrait) { placeT.x = 0; placeT.y = 1.25; placeT.s = Math.min(0.62, aspect * 0.9); }
        else { placeT.x = Math.min(2.2, 0.55 + aspect * 0.62); placeT.y = 0.05; placeT.s = 1; }
        dimT = portrait ? 0.7 : 1;
      } else {
        placeT.x = portrait ? 0 : Math.min(3.1, 1.3 + aspect * 0.9); placeT.y = portrait ? 1.6 : 0.25; placeT.s = portrait ? 0.45 : 0.85;
        dimT = portrait ? 0.3 : 0.5;
      }
    }

    function low0() { return false; }
    function setLow(v) {
      low = v; dust.visible = !v; if (v) usePost = false;
      if (forms.shards && forms.shards.threads) forms.shards.threads.visible = !v;
      bg.setDrawRange(0, v ? Math.floor(NB * 0.4) : NB);
      resize();
    }

    function resize() {
      const w = window.innerWidth, h = window.innerHeight, dpr = low ? 1 : Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
      renderer.setPixelRatio(dpr); renderer.setSize(w, h, false);
      aspect = w / Math.max(h, 1);
      camera.aspect = aspect; camera.fov = aspect < 1 ? Math.min(60, 35 + (1 - aspect) * 45) : 35;
      camera.updateProjectionMatrix();
      U.uRes.value.set(w * dpr, h * dpr); U.uPx.value = dpr;
      buildPost();
      layout();
      if (still || paused) drawOnce();
    }
    window.addEventListener('resize', resize, { passive: true });

    if (!still) {
      const mv = (x, y) => target.set((x / window.innerWidth) * 2 - 1, -((y / window.innerHeight) * 2 - 1));
      window.addEventListener('pointermove', e => mv(e.clientX, e.clientY), { passive: true });
      window.addEventListener('touchmove', e => { if (e.touches[0]) mv(e.touches[0].clientX, e.touches[0].clientY); }, { passive: true });
    }

    let time = 0;
    function frame(dt, noRender) {
      time += dt;
      U.uTime.value = time;
      pulse *= Math.pow(0.18, dt); U.uPulse.value = pulse;
      lerpColors(1 - Math.exp(-dt * 6));
      mouse.lerp(target, 0.06);
      const e = 1 - Math.exp(-dt * 2.6);
      scrollS += (scrollK - scrollS) * (1 - Math.exp(-dt * 5));
      dim += (dimT * (view === 'today' ? 1 - 0.55 * scrollS : 1) - dim) * e; U.uDim.value = dim;
      if (burstT < 1) {
        burstT = Math.min(1, burstT + dt / 1.9);
        burst.material.uniforms.uBurst.value = burstT; burst.visible = burstT < 1;
      }
      if (!still && !paused && dt > 0) {
        frames++; if (dt > 0.034) slow++;
        if (frames === 150 && !low && slow > 60) setLow(true);
      }
      place.x += (placeT.x - place.x) * e; place.y += (placeT.y - place.y) * e; place.s += (placeT.s - place.s) * e;
      const breathe = 1 + Math.sin(time * 0.42) * 0.014;
      stage.position.set(place.x - scrollS * 0.5, place.y + scrollS * 1.1 + Math.sin(time * 0.31) * 0.03, -scrollS * 0.8);
      stage.rotation.set(mouse.y * 0.1 + scrollS * 0.25, mouse.x * 0.16 + scrollS * 0.7, 0);
      camera.position.set(mouse.x * 0.22, mouse.y * 0.12, CAM_Z);
      camera.lookAt(0, 0, 0);
      world.rotation.y = mouse.x * 0.03 + time * 0.0016; world.rotation.x = mouse.y * 0.015;
      for (const f of Object.values(forms)) {
        const goal = (f.name === want && time >= holdUntil) ? 1 : 0;
        f.mix += (goal - f.mix) * (1 - Math.exp(-dt * (goal ? 2.2 : 3.4)));
        if (f.mix < 0.004 && !goal) { f.mix = 0; f.group.visible = false; continue; }
        f.group.visible = true;
        const s = place.s * f.scale * breathe * (0.9 + 0.1 * f.mix) * (1 + pulse * 0.025);
        if (f.name === want) burst.material.uniforms.uShapeB.value.set(...SHAPE[f.name]).multiplyScalar(s);
        f.group.scale.setScalar(s);
        f.mats.forEach(m => { m.uniforms.uShow.value = f.mix; });
        if (f.edges) f.edges.forEach(m => { m.opacity = f.mix * dim; });
        f.update(time, pulse, dt);
      }
      if (noRender) return;
      if (post && usePost) renderPost(); else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
    }
    function drawOnce() { frame(0.016); }
    function loop(now) {
      raf = requestAnimationFrame(loop);
      if (paused) return;
      const dt = Math.min(0.05, (now - last) / 1000 || 0.016); last = now;
      frame(dt);
    }
    resize();
    forms.eclipse.mix = 1; forms.eclipse.group.visible = true;
    if (still) { for (let i = 0; i < 6; i++) frame(0.5); } else raf = requestAnimationFrame(loop);

    const api = {
      ok: true,
      setColors(fx, snap) {
        tgt.accent = fx.accent.slice(); tgt.base = fx.base.slice(); tgt.bg = fx.bg.slice();
        if (snap || still) { cur.accent = fx.accent.slice(); cur.base = fx.base.slice(); cur.bg = fx.bg.slice(); pushColors(); if (still) drawOnce(); }
      },
      setForm(name, snap) {
        if (!forms[name] || want === name) return;
        const prev = want; want = name;
        if (forms[name].restart) forms[name].restart();
        if (!snap && !still && !low0()) {
          const u = burst.material.uniforms;
          u.uShapeA.value.set(...SHAPE[prev]).multiplyScalar(place.s * (forms[prev].scale || 1));
          burstT = 0; burst.visible = true; holdUntil = time + 0.55;
        }
        if (snap || still) { Object.values(forms).forEach(f => { f.mix = f.name === name ? 1 : 0; f.group.visible = f.mix > 0; }); if (still) drawOnce(); }
      },
      setView(name) { view = name === 'today' ? 'today' : 'other'; layout(); if (still) { place.x = placeT.x; place.y = placeT.y; place.s = placeT.s; dim = dimT; drawOnce(); } },
      setScroll(k) { scrollK = Math.max(0, Math.min(1, k)); if (still) { scrollS = scrollK; drawOnce(); } },
      setLow(v) { setLow(v); },
      pulse() { if (!still) { pulse = 1; if (forms[want].restart) forms[want].restart(); } },
      pause() { paused = true; },
      resume() { paused = false; last = performance.now(); if (still) drawOnce(); },
      forms: FORMS,
      tick(sec) { const n = Math.ceil(sec / 0.05); for (let i = 0; i < n; i++) frame(0.05, i < n - 1); }
    };
    window.__wanderscene = api;
    return api;
  }

  window.WanderScene = { create, FORMS };
})();
