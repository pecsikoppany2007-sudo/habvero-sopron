/*
 * HabVero hero: the logo's crossed whisk + piping bag as a procedural three.js object.
 * Spec: terv/dizajn.md section 8 (and 7 for intro/exit timings). Notes: terv/3d.md.
 *
 *   import { mountHero } from './hero3d.js';
 *   const ctl = await mountHero(canvas, { onNozzle({x, y}) {...} });   // null = gated out, keep the poster
 *
 * onNozzle gets the nozzle tip every rendered frame, in CSS px relative to the CANVAS top-left
 * ({x, y, vx, vy}: vx/vy = viewport px). A callback declared with two parameters, (x, y) => …,
 * is called as onNozzle(x, y) instead.
 *
 * Options (all optional):
 *   onNozzle(pt)      see above
 *   onExit(p)         smoothed hero-exit progress 0..1 every frame (sync the word mark / #line-nozzle)
 *   onIntroDone()     3D intro finished
 *   poster            the poster <img>; default: .hero__poster next to the canvas. The 3D view is framed
 *                     to land exactly on the poster as the CSS draws it (object-fit / object-position).
 *   hero              element for pointer, click and scroll progress; default canvas.closest('section')
 *   mode              'rich' | 'touch'; default from <html> class (.rich/.touch), else from media queries
 *   intro             true | false | 'auto' (default: play when <html> has .intro-on)
 *   scroll            true (default): module computes exit progress itself; false: call ctl.setExit(p)
 *   force             skip the GPU gate (headless tests only); float: false freezes the idle float
 *
 * Contract with the page: on the first rendered frame the canvas gets data-ready="1" and a
 * 'hero3d:ready' event; the page's CSS fades the canvas in / the poster out. During the intro the
 * poster is hidden inline (opacity 0). During the exit the canvas opacity is set inline (p .65-.95).
 */
import {
  WebGLRenderer, Scene, PerspectiveCamera, Group, Mesh, Vector2, Vector3, Box3,
  LatheGeometry, CylinderGeometry, TorusGeometry, TubeGeometry, PlaneGeometry,
  CatmullRomCurve3, MeshPhysicalMaterial, MeshBasicMaterial, CanvasTexture,
  HemisphereLight, DirectionalLight, PMREMGenerator, Raycaster, Color,
  SRGBColorSpace, ACESFilmicToneMapping, DoubleSide, MathUtils,
} from './vendor/three.module.min.js';
import { RoomEnvironment, mergeGeometries, mergeVertices, SimplexNoise } from './vendor/three-addons.min.js';

/* ---------- framing (shared by the canvas and the rendered poster) ---------- */
const CAM_POS = new Vector3(0, 0.15, 7.2);
// The poster is a square. Inside it the rest-pose object is 64 % of the height, centred
// horizontally, its centre at 44 % from the top (room below for the contact shadow).
const FRAME_FOV = 31.6;          // vertical fov of the poster square (deg), from the rest-pose bbox
const FRAME_SHIFT_Y = 0.08;      // object centre moved up (fraction of the square)
const FRAME_SHIFT_X = -0.045;    // and left: the 3/4 pose leans right
/** Nozzle tip in the rest pose, as fractions of the square poster image (x, y). */
export const POSTER_NOZZLE = { x: 0.383, y: 0.712 };

const REST = { rx: 0.10, ry: -0.30 };

/* ---------- gate ---------- */
const SOFT_GPU = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;
export function probe() {
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return { ok: false, reason: 'reduced-motion' };
    if (navigator.connection && navigator.connection.saveData) return { ok: false, reason: 'save-data' };
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return { ok: false, reason: 'no-webgl2' };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    const lose = gl.getExtension('WEBGL_lose_context');
    if (lose) lose.loseContext();
    if (SOFT_GPU.test(name)) return { ok: false, reason: 'software-gpu', renderer: name };
    return { ok: true, renderer: name };
  } catch (e) {
    return { ok: false, reason: 'error' };
  }
}

/* ---------- small math ---------- */
const clamp01 = (t) => (t < 0 ? 0 : t > 1 ? 1 : t);
const expoOut = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
const p3Out = (t) => 1 - Math.pow(1 - t, 3);
const p2InOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const smoothstep = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const damp = (cur, target, dt, tau) => cur + (target - cur) * (1 - Math.exp(-dt / tau));
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------- geometry helpers ---------- */
function profile(pts, n) {
  if (!n || n <= pts.length) return pts.map(([r, y]) => new Vector2(r, y));
  const c = new CatmullRomCurve3(pts.map(([r, y]) => new Vector3(r, y, 0)), false, 'centripetal');
  return c.getSpacedPoints(n - 1).map((v) => new Vector2(Math.max(0, v.x), v.y));
}
// Apply f(r, theta, x, y, z) -> [r', dy] in place to a lathe-like geometry, then weld + normals.
function displace(geo, f) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const r = Math.hypot(x, z), th = Math.atan2(x, z);
    const out = f(r, th, x, y, z);
    const r2 = out[0];
    p.setXYZ(i, Math.sin(th) * r2 + (out[2] || 0), y + (out[1] || 0), Math.cos(th) * r2);
  }
  return weld(geo);
}
function weld(geo) {
  geo.deleteAttribute('uv');
  geo.deleteAttribute('normal');
  const g = mergeVertices(geo, 1e-5);
  g.computeVertexNormals();
  return g;
}

/* ---------- materials (8.7) ---------- */
function makeMaterials(envTex) {
  const m = (o) => new MeshPhysicalMaterial(o);
  return {
    cream: m({ color: '#F2E8DC', roughness: 0.72, metalness: 0, sheen: 0.5, sheenColor: new Color('#FFF6EC'), sheenRoughness: 0.8 }),
    wire: m({ color: '#EFE5D8', roughness: 0.55, metalness: 0 }),
    dollop: m({ color: '#FAF3E9', roughness: 0.92, metalness: 0, sheen: 0.6, sheenColor: new Color('#FFFFFF') }),
    bag: m({ color: '#E3B3AE', roughness: 0.70, metalness: 0, sheen: 0.5, sheenColor: new Color('#F6D9D4'), sheenRoughness: 0.7, side: DoubleSide }),
    fan: m({ color: '#FBF6F0', roughness: 0.80, metalness: 0, sheen: 0.3, side: DoubleSide }),
    metal: m({ color: '#D8C6AE', roughness: 0.38, metalness: 0.85, envMap: envTex, envMapIntensity: 0.8, side: DoubleSide }),
  };
}

/* ---------- the object (8.3 - 8.5) ---------- */
function buildObject(M) {
  const noise = new SimplexNoise({ random: mulberry32(20221012) });

  // Whisk: outer group carries the pose, inner group spins on its own axis ("kis keverés").
  const whisk = new Group(); whisk.name = 'whisk';
  const whiskSpin = new Group(); whisk.add(whiskSpin);

  const handle = new LatheGeometry(profile([[0, 0], [0.06, 0.004], [0.078, 0.03], [0.085, 0.08], [0.085, 0.96], [0.075, 1.04], [0.06, 1.08], [0.05, 1.10]], 16), 40);
  whiskSpin.add(new Mesh(weld(handle), M.cream));

  const ring = new CylinderGeometry(0.052, 0.052, 0.10, 32);
  ring.translate(0, 1.10, 0);
  whiskSpin.add(new Mesh(ring, M.metal));

  const loop = [[-0.03, 1.12], [-0.12, 1.40], [-0.25, 1.85], [-0.33, 2.35], [-0.31, 2.70], [-0.19, 2.93], [0, 3.00], [0.19, 2.93], [0.31, 2.70], [0.33, 2.35], [0.25, 1.85], [0.12, 1.40], [0.03, 1.12]];
  const tubes = [];
  for (let i = 0; i < 6; i++) {
    const phi = (i * 30 * Math.PI) / 180, c = Math.cos(phi), s = Math.sin(phi);
    const curve = new CatmullRomCurve3(loop.map(([u, y]) => new Vector3(u * c, y, u * s)), false, 'centripetal');
    tubes.push(new TubeGeometry(curve, 80, 0.011, 6, false));
  }
  whiskSpin.add(new Mesh(mergeGeometries(tubes), M.wire));

  // Dollop: pivot at its bottom point so the intro can "press" it on.
  const DOL_C = new Vector3(-0.02, 2.66, 0);
  let dol = new LatheGeometry(profile([[0, -0.40], [0.30, -0.36], [0.40, -0.20], [0.42, 0], [0.36, 0.18], [0.24, 0.32], [0.12, 0.42], [0.04, 0.52], [0, 0.56]], 48), 64);
  dol = displace(dol, (r, th, x, y, z) => {
    let r2 = r * (1 + 0.07 * Math.sin(8 * th + 6 * y)) * (1 + 0.03 * noise.noise3d(3 * x, 3 * y, 3 * z));
    const dx = y > 0.25 ? -0.35 * (y - 0.25) * (y - 0.25) : 0;
    return [r2, 0, dx];
  });
  dol.translate(0, 0.40, 0);                 // bottom point at the pivot
  const dollop = new Group();
  dollop.position.set(DOL_C.x, DOL_C.y - 0.40, DOL_C.z);
  dollop.add(new Mesh(dol, M.dollop));
  whiskSpin.add(dollop);

  // Piping bag, local y 0 = nozzle tip.
  const bag = new Group(); bag.name = 'bag';
  const noz = new CylinderGeometry(0.095, 0.035, 0.27, 16, 1, true);
  {
    const p = noz.attributes.position;          // row 0 = top (r .095), row 1 = bottom (r .035)
    for (let x = 0; x <= 16; x++) {
      const i = 17 + x;
      if (x % 2 === 1) { const k = 0.022 / 0.035; p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k); }
    }
    noz.translate(0, 0.135, 0);
    noz.computeVertexNormals();
  }
  bag.add(new Mesh(noz, M.metal));

  let body = new LatheGeometry(profile([[0.085, 0.22], [0.12, 0.40], [0.20, 0.75], [0.28, 1.10], [0.34, 1.42], [0.36, 1.62], [0.33, 1.78], [0.24, 1.88], [0.13, 1.94], [0.07, 1.97]], 48), 72);
  body = displace(body, (r, th, x, y) => {
    const a = smoothstep(1.45, 1.97, y) * 0.16;
    return [r * (1 + a * Math.sin(10 * th)) * (1 + 0.012 * Math.sin(5 * th + 2 * y))];
  });
  const bodyMesh = new Mesh(body, M.bag);
  bag.add(bodyMesh);

  const t1 = new TorusGeometry(0.075, 0.022, 10, 40); t1.rotateX(Math.PI / 2); t1.translate(0, 1.98, 0);
  const t2 = new TorusGeometry(0.075, 0.022, 10, 40); t2.rotateX(Math.PI / 2 + (8 * Math.PI) / 180); t2.translate(0, 2.025, 0);
  let fan = new LatheGeometry(profile([[0.07, 2.02], [0.10, 2.20], [0.18, 2.45], [0.27, 2.68], [0.30, 2.80]], 16), 56);
  fan = displace(fan, (r, th, x, y) => [r * (1 + 0.32 * Math.sin(7 * th)), 0.06 * Math.sin(7 * th + 1.3) * smoothstep(2.52, 2.74, y)]);
  fan.scale(1, 1, 0.5);
  [t1, t2].forEach((g) => g.deleteAttribute('uv'));
  bag.add(new Mesh(mergeGeometries([t1, t2, fan]), M.fan));

  // Pose (8.5)
  whisk.rotation.z = 0.768; whisk.position.set(0.764, -0.791, 0.22);
  bag.rotation.z = -0.628; bag.position.set(-0.635, -0.874, -0.18);
  const assembly = new Group();
  assembly.add(whisk, bag);
  const center = new Box3().setFromObject(assembly).getCenter(new Vector3());
  assembly.position.copy(center).multiplyScalar(-1);

  const group = new Group(); group.name = 'habvero';
  group.add(assembly);
  return {
    group, whisk, whiskSpin, bag, bodyMesh, dollop,
    whiskPos: whisk.position.clone(), bagPos: bag.position.clone(),
    whiskAxis: new Vector3(-Math.sin(0.768), Math.cos(0.768), 0),
    bagAxis: new Vector3(Math.sin(0.628), Math.cos(0.628), 0),
  };
}

function makeShadow() {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(62,53,50,0.22)');
  grd.addColorStop(0.45, 'rgba(62,53,50,0.12)');
  grd.addColorStop(1, 'rgba(62,53,50,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  const tex = new CanvasTexture(c); tex.colorSpace = SRGBColorSpace;
  const geo = new PlaneGeometry(3.2, 1.1); geo.rotateX(-Math.PI / 2);
  const mesh = new Mesh(geo, new MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }));
  mesh.position.y = -1.75; mesh.renderOrder = -1;
  return mesh;
}

/* ---------- layout: where the poster image is drawn inside the canvas ---------- */
function docOffset(el) {
  let x = 0, y = 0;
  for (let e = el; e; e = e.offsetParent) { x += e.offsetLeft; y += e.offsetTop; }
  return { x, y };
}
function posPart(v, free) {
  v = v.trim();
  if (v.endsWith('%')) return free * (parseFloat(v) / 100);
  if (v.endsWith('px')) return parseFloat(v);
  if (v === 'left' || v === 'top') return 0;
  if (v === 'right' || v === 'bottom') return free;
  return free / 2;
}
function frameRect(canvas, poster, W, H) {
  if (!poster || !poster.offsetWidth) {
    const s = Math.min(W, H);
    return { x: (W - s) / 2, y: (H - s) / 2, s };
  }
  const cs = getComputedStyle(poster);
  const bw = poster.offsetWidth, bh = poster.offsetHeight;
  const nat = poster.naturalWidth || 1600;
  let s;
  switch (cs.objectFit) {
    case 'cover': s = Math.max(bw, bh); break;
    case 'none': s = nat; break;
    case 'scale-down': s = Math.min(nat, bw, bh); break;
    case 'fill': s = Math.min(bw, bh); break;
    default: s = Math.min(bw, bh);
  }
  const pos = (cs.objectPosition || '50% 50%').split(/\s+/);
  const ox = posPart(pos[0] || '50%', bw - s), oy = posPart(pos[1] || '50%', bh - s);
  const a = docOffset(poster), b = docOffset(canvas);
  return { x: a.x - b.x + poster.clientLeft + ox, y: a.y - b.y + poster.clientTop + oy, s };
}

/* ---------- mount ---------- */
export async function mountHero(canvas, opts = {}) {
  const html = document.documentElement;
  if (!opts.force) {
    if (html.classList.contains('still')) return null;
    if (!probe().ok) return null;
  }
  const mode = opts.mode || (html.classList.contains('rich') ? 'rich' : html.classList.contains('touch') ? 'touch'
    : matchMedia('(hover: hover) and (pointer: fine)').matches ? 'rich' : 'touch');
  const rich = mode === 'rich';
  const poster = opts.poster === undefined ? (canvas.parentElement && canvas.parentElement.querySelector('.hero__poster')) : opts.poster;
  const hero = opts.hero || canvas.closest('section, header') || canvas.parentElement;
  const wantIntro = opts.intro === undefined || opts.intro === 'auto' ? html.classList.contains('intro-on') : !!opts.intro;
  const autoScroll = opts.scroll !== false;
  const rest = opts.rest || REST;               // test hook: {rx, ry} for the logo overlay
  const nozzleCb = typeof opts.onNozzle === 'function' ? opts.onNozzle : null;

  const renderer = new WebGLRenderer({
    canvas, alpha: true, antialias: rich, premultipliedAlpha: true,
    preserveDrawingBuffer: !!opts.preserveDrawingBuffer, powerPreference: 'default',
  });
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const maxDpr = opts.dpr || (rich ? 1.75 : 1.5);
  let dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
  renderer.setPixelRatio(dpr);

  const scene = new Scene();
  const pmrem = new PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = envTex;
  scene.environmentIntensity = 0.35;
  scene.add(new HemisphereLight('#FFF8F0', '#E8D5CC', 0.9));
  const key = new DirectionalLight('#FFF3E6', 2.2); key.position.set(4, 6, 5); scene.add(key);
  const rim = new DirectionalLight('#F2C9C4', 1.2); rim.position.set(-5, 2, -4); scene.add(rim);

  const M = makeMaterials(envTex);
  const O = buildObject(M);
  scene.add(O.group);
  const shadow = makeShadow();
  scene.add(shadow);

  const camera = new PerspectiveCamera(FRAME_FOV, 1, 0.5, 40);
  camera.position.copy(CAM_POS);
  camera.lookAt(0, 0, 0);

  /* --- sizing --- */
  let W = 1, H = 1;
  function layout() {
    W = Math.max(1, canvas.clientWidth); H = Math.max(1, canvas.clientHeight);
    renderer.setSize(W, H, false);
    const f = frameRect(canvas, poster, W, H);
    // The square f is the poster image; the camera's "full image" is that square.
    camera.aspect = 1;
    camera.setViewOffset(f.s, f.s, -f.x - FRAME_SHIFT_X * f.s, -f.y + FRAME_SHIFT_Y * f.s, W, H);
    camera.updateProjectionMatrix();
    dirty = true; kick();
  }

  /* --- state --- */
  const st = {
    t0: 0, introT: wantIntro ? 0 : Infinity, introPlaying: false,
    mx: 0, my: 0, tmx: 0, tmy: 0,
    p: 0, pTarget: 0, film: null,
    floatT: 0, stirStart: -1e9, stirAngle: 0,
    visible: true,
  };
  const T = rich ? 1 : 1100 / 1400;           // touch: shorter intro
  let dirty = true, raf = 0, last = 0, destroyed = false, readyDone = false, introResolve = null;

  function applyIntro(t) {
    // t in ms since intro start (Infinity = finished)
    const kW = expoOut(clamp01((t - 150 * T) / (1400 * T)));
    const kB = expoOut(clamp01((t - 270 * T) / (1400 * T)));
    const kD = p3Out(clamp01((t - 1400 * T) / (600 * T)));
    const sq = t - 1900 * T;
    let squeeze = 0;
    if (sq > 0 && sq < 320 * T) squeeze = sq < 160 * T ? p2InOut(sq / (160 * T)) : 1 - p2InOut((sq - 160 * T) / (160 * T));
    return {
      whiskOff: 1.4 * (1 - kW), bagOff: 1.4 * (1 - kB),
      ry: -1.10 + 0.80 * kW,
      dolS: t < 1400 * T ? 0 : 0.35 + 0.65 * kD, dolR: 0.6 * (1 - kD),
      squeeze,
      done: t >= 2220 * T,
    };
  }

  const tmpV = new Vector3();
  function pose(now, dt) {
    let I = applyIntro(st.introT === Infinity ? Infinity : now - st.introT);
    if (st.introPlaying && I.done) {
      st.introPlaying = false; st.introT = Infinity; st.floatT = 0;
      if (opts.onIntroDone) opts.onIntroDone();
      if (introResolve) { introResolve(); introResolve = null; }
    }
    // pointer smoothing (rich only)
    st.mx = damp(st.mx, st.tmx, dt, 120); st.my = damp(st.my, st.tmy, dt, 120);
    // exit progress
    if (st.film) {
      const k = clamp01((now - st.film.t) / st.film.d);
      st.p = st.film.from + (st.film.to - st.film.from) * p2InOut(k);
      if (k >= 1) st.film = null;
    } else {
      st.p = damp(st.p, st.pTarget, dt, 110);
      if (Math.abs(st.p - st.pTarget) < 1e-4) st.p = st.pTarget;
    }
    const p = st.p;
    // float only after the intro
    const floating = !st.introPlaying && opts.float !== false;
    if (floating) st.floatT += dt;
    const ft = st.floatT / 1000;
    const fy = floating ? 0.035 * Math.sin((2 * Math.PI * ft) / 6) : 0;
    const fr = floating ? 0.08 * Math.sin((2 * Math.PI * ft) / 9) : 0;

    const g = O.group;
    g.rotation.y = (st.introPlaying ? I.ry : rest.ry) + 0.35 * st.mx + fr + 2.4 * p;
    g.rotation.x = rest.rx - 0.18 * st.my;
    g.position.y = fy + 0.9 * p;
    g.scale.setScalar(1 - 0.3 * p);

    O.whisk.position.copy(O.whiskPos).addScaledVector(O.whiskAxis, (st.introPlaying ? I.whiskOff : 0) + 0.5 * p);
    O.bag.position.copy(O.bagPos).addScaledVector(O.bagAxis, (st.introPlaying ? I.bagOff : 0) - 0.4 * p);
    O.whisk.rotation.y = 0.06 * st.mx;
    O.bag.rotation.y = -0.06 * st.mx;

    const ds = st.introPlaying ? I.dolS : 1;
    O.dollop.visible = ds > 0;
    O.dollop.scale.setScalar(Math.max(ds, 1e-3));
    O.dollop.rotation.y = st.introPlaying ? I.dolR : 0;
    const sq = st.introPlaying ? I.squeeze : 0;
    O.bodyMesh.scale.set(1 - 0.035 * sq, 1 + 0.01 * sq, 1 - 0.035 * sq);

    // stir: one turn of the whisk around its own axis, 900 ms expo.out
    const sk = clamp01((now - st.stirStart) / 900);
    O.whiskSpin.rotation.y = sk < 1 ? 2 * Math.PI * expoOut(sk) : 0;

    // contact shadow follows float (up = smaller, fainter) and exit
    const up = fy / 0.035;
    const ss = (1 - 0.06 * up) * (1 - 0.3 * p);
    shadow.scale.set(ss, 1, ss);
    shadow.material.opacity = (1 - 0.12 * up) * (1 - p);

    // canvas opacity during exit only (the page's CSS owns the fade-in)
    const op = 1 - smoothstep(0.65, 0.95, p);
    canvas.style.opacity = p > 0 ? String(op) : '';
    canvas.style.transition = p > 0 ? 'none' : '';      // a CSS opacity transition would lag the scrub

    const moving = st.introPlaying || sk < 1 || st.film || Math.abs(st.mx - st.tmx) > 1e-3 || Math.abs(st.my - st.tmy) > 1e-3
      || st.p !== st.pTarget || (floating && st.visible && p < 1);
    return moving;
  }

  function emitNozzle() {
    if (!nozzleCb) return;
    O.bag.updateWorldMatrix(true, false);
    tmpV.set(0, -0.005, 0);
    O.bag.localToWorld(tmpV).project(camera);
    const x = ((tmpV.x + 1) / 2) * W, y = ((1 - tmpV.y) / 2) * H;
    const r = canvas.getBoundingClientRect();
    if (nozzleCb.length >= 2) nozzleCb(x, y);
    else nozzleCb({ x, y, vx: r.left + x, vy: r.top + y });
  }

  // adaptive DPR: if the steady loop runs under ~50 fps, step the pixel ratio down (not below 1)
  let fAcc = 0, fN = 0;
  function budget(dt) {
    if (dt <= 0 || dt > 200) return;
    fAcc += dt; fN++;
    if (fN >= 90) {
      if (fAcc / fN > 20 && dpr > 1) { dpr = Math.max(1, dpr - 0.25); renderer.setPixelRatio(dpr); renderer.setSize(W, H, false); }
      fAcc = 0; fN = 0;
    }
  }

  function frame(now) {
    raf = 0;
    if (destroyed) return;
    const dt = last ? Math.min(now - last, 100) : 16.7;
    last = now;
    const moving = pose(now, dt);
    renderer.render(scene, camera);
    emitNozzle();
    if (opts.onExit) opts.onExit(st.p);
    if (!readyDone) {
      readyDone = true;
      canvas.dataset.ready = '1';
      canvas.dispatchEvent(new CustomEvent('hero3d:ready', { bubbles: true }));
    } else if (moving && !st.introPlaying) budget(dt);
    dirty = false;
    if (moving && !document.hidden) kick(); else last = 0;
  }
  function kick() { if (!raf && !destroyed) raf = requestAnimationFrame(frame); }

  /* --- intro --- */
  function playIntro() {
    if (poster) poster.style.opacity = '0';
    st.introPlaying = true;
    st.introT = performance.now();
    last = 0; kick();
    return new Promise((res) => { introResolve = res; });
  }

  /* --- events --- */
  const off = [];
  const on = (el, ev, fn, o) => { el.addEventListener(ev, fn, o); off.push(() => el.removeEventListener(ev, fn, o)); };

  if (rich && hero) {
    on(hero, 'pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      const r = hero.getBoundingClientRect();
      st.tmx = MathUtils.clamp(((e.clientX - r.left) / r.width) * 2 - 1, -1, 1);
      st.tmy = MathUtils.clamp(((e.clientY - r.top) / r.height) * 2 - 1, -1, 1);
      kick();
    }, { passive: true });
    on(hero, 'pointerleave', () => { st.tmx = 0; st.tmy = 0; kick(); }, { passive: true });
  }
  const ray = new Raycaster(); const ndc = new Vector2();
  if (hero) on(hero, 'click', (e) => {
    if (e.target.closest && e.target.closest('a, button, input, select, textarea, label')) return;
    const now = performance.now();
    if (now - st.stirStart < 1200 || st.introPlaying) return;
    const r = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    if (ray.intersectObject(O.group, true).length) { st.stirStart = now; kick(); }
  });

  // exit progress from scroll (offset chain, never measured inside a transformed box)
  let heroTop = 0, heroH = 1;
  function measureHero() { if (!hero) return; heroTop = docOffset(hero).y; heroH = hero.offsetHeight; }
  function onScroll() {
    const vh = window.innerHeight, y = window.scrollY;
    if (rich) {
      st.pTarget = clamp01((y - heroTop) / Math.max(1, heroH - 0.35 * vh));
    } else {
      const atEnd = st.film ? st.film.to : st.p;
      if (y > 0.15 * vh && atEnd < 1) st.film = { t: performance.now(), d: 1100, from: st.p, to: 1 };
      else if (y < 40 && atEnd > 0) st.film = { t: performance.now(), d: 800, from: st.p, to: 0 };
      st.pTarget = st.film ? st.film.to : st.p;
    }
    kick();
  }
  if (autoScroll) on(window, 'scroll', onScroll, { passive: true });

  const ro = new ResizeObserver(() => { layout(); measureHero(); if (autoScroll) onScroll(); });
  ro.observe(canvas);
  if (poster) ro.observe(poster);
  off.push(() => ro.disconnect());
  if (poster && !poster.complete) on(poster, 'load', layout);

  if (hero && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => { st.visible = es[es.length - 1].isIntersecting; if (st.visible) kick(); });
    io.observe(hero);
    off.push(() => io.disconnect());
  }
  on(document, 'visibilitychange', () => { if (!document.hidden) { last = 0; kick(); } });

  on(canvas, 'webglcontextlost', (e) => {
    e.preventDefault();
    destroyed = true;
    if (raf) cancelAnimationFrame(raf);
    delete canvas.dataset.ready;
    canvas.style.opacity = '0';
    if (poster) poster.style.opacity = '';
    if (opts.onFail) opts.onFail('context-lost');
  });

  /* --- start --- */
  layout(); measureHero(); if (autoScroll) onScroll();
  st.p = st.pTarget; st.film = null;
  // compile shaders before the first visible frame
  if (renderer.compileAsync) { try { await renderer.compileAsync(scene, camera); } catch (e) { /* fall through */ } }
  if (destroyed) return null;
  if (wantIntro && st.p === 0) playIntro(); else kick();

  const ctl = {
    mode,
    get progress() { return st.p; },
    playIntro,
    setExit(p, immediate) { st.film = null; st.pTarget = clamp01(p); if (immediate) st.p = st.pTarget; kick(); },
    stir() { st.stirStart = performance.now(); kick(); },
    nozzle() { emitNozzle(); },
    layout,
    render() { pose(performance.now(), 0); renderer.render(scene, camera); },
    stats() { return { triangles: renderer.info.render.triangles, calls: renderer.info.render.calls, dpr }; },
    destroy() {
      destroyed = true; if (raf) cancelAnimationFrame(raf);
      off.forEach((f) => f());
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      Object.values(M).forEach((m) => m.dispose());
      shadow.material.map.dispose(); shadow.material.dispose(); envTex.dispose();
      renderer.dispose();
    },
  };
  return ctl;
}
