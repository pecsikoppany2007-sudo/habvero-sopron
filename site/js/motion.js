// HabVero v2 (2026-11-02): minden mozgás. Csak transform és opacity animál; egy rAF-ciklus, ami csak mozgás közben fut.
// Kapuk (a <head> teszi): rich = egér + valódi GPU (görgetéshez kötött jelenetek), touch = időzített egyszeri mozgások,
// still = semmi nem mozog. Rejtett állapot csak a hajtás alatti elemeken (vagy intro-on alatt).
// Mérés: offsetTop-lánc, sosem dőlt szakaszon belül (measure-flat-lesson).

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const seg = (p, a, b) => clamp((p - a) / (b - a));
const eio = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const eo = (t) => 1 - Math.pow(1 - t, 3);
const EASE = 'cubic-bezier(.16,1,.3,1)';
function absTop(el) { let y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; }
function rnd(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }   // determinisztikus

export function initMotion(HV) {
  const root = HV.root;
  const $ = (s, c = document) => c.querySelector(s);
  const $$ = (s, c = document) => [...c.querySelectorAll(s)];
  const rich = root.classList.contains('rich'), still = root.classList.contains('still');
  const desk = () => innerWidth >= 1100;
  let vw = innerWidth, vh = innerHeight;

  function play(el, kf, o = {}) { return el.animate(kf, { fill: 'both', easing: EASE, ...o }); }
  // egyszeri felfedés: a végén töröljük az animációt és az inline rejtést
  function reveal(el, kf, o = {}) {
    const a = play(el, kf, o);
    a.onfinish = () => { el.style.opacity = ''; el.style.transform = ''; a.cancel(); };
    return a;
  }
  const below = (el) => absTop(el) > scrollY + vh * 0.92;
  function when(el, fn, margin = '0px 0px -16% 0px') {
    const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); fn(); } }, { rootMargin: margin });
    io.observe(el);
  }

  /* ---------------- sormaszkos címek ---------------- */
  const LN = [];
  function split(o) {
    const el = o.el;
    const words = o.text.split(/[ \n\t]+/).filter(Boolean);
    el.textContent = '';
    const spans = words.map((w, i) => { const s = document.createElement('span'); s.textContent = w + (i < words.length - 1 ? ' ' : ''); el.appendChild(s); return s; });
    const lines = []; let top = null;
    spans.forEach((s) => { const t = s.offsetTop; if (top === null || Math.abs(t - top) > 4) { lines.push([]); top = t; } lines[lines.length - 1].push(s.textContent); });
    el.textContent = '';
    o.inner = lines.map((ws) => {
      const ln = document.createElement('span'); ln.className = 'ln';
      const i = document.createElement('span'); i.className = 'ln__i'; i.textContent = ws.join('');
      ln.appendChild(i); el.appendChild(ln); return i;
    });
  }
  function lnSetup() {
    $$('[data-anim="lines"]').forEach((el) => {
      const text = el.textContent.trim();
      el.setAttribute('aria-label', text);
      const o = { el, text, done: false };
      LN.push(o); split(o);
      o.inner.forEach((i) => i.setAttribute('aria-hidden', 'true'));
      const inHero = !!el.closest('.hero');
      if (still) { o.done = true; return; }
      if (inHero) { if (root.classList.contains('intro-on')) o.hidden = true; else o.done = true; return; }
      if (below(el)) { o.hidden = true; o.inner.forEach((i) => { i.style.transform = 'translateY(112%) rotate(2.5deg)'; }); when(el, () => lnReveal(o)); }
      else o.done = true;
    });
  }
  function lnReveal(o, delay = 0, k = 1) {
    if (o.done) return; o.done = true;
    o.inner.forEach((i, n) => reveal(i, [{ transform: 'translateY(112%) rotate(2.5deg)' }, { transform: 'none' }], { duration: 1050 * k, delay: delay + n * 90 * k }));
  }
  function lnResplit() {
    LN.forEach((o) => { split(o); o.inner.forEach((i) => i.setAttribute('aria-hidden', 'true')); if (!o.done) o.inner.forEach((i) => { i.style.transform = 'translateY(112%) rotate(2.5deg)'; }); });
  }

  /* ---------------- 1 nyitókép: mozaik-intro, robbanás görgetésre ---------------- */
  const hero = $('.hero'), stage = $('[data-hero-stage]'), mz = $('[data-mosaic]'), photo = $('[data-hero-photo]');
  const heroImg = $('[data-hero-img]'), shade = $('.hero__shade'), body = $('.hero__body');
  const MZ = { tiles: [], built: false, exploding: false };
  let introDone = false;

  function atlasUrl() { return `/img/mozaik-${vw >= 700 ? 200 : 120}.webp?v=5`; }
  function loadImg(src) { return new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; }); }

  function buildMosaic(atlas) {
    mz.textContent = '';
    const W = stage.clientWidth, H = stage.clientHeight;
    const cols = W >= 1100 ? Math.max(7, Math.round(W / 175)) : W >= 700 ? 6 : W >= 500 ? 4 : 3;   // telefonon kevesebb, nagyobb csempe (a 3D lapok száma számít)
    const s = W / cols, rows = Math.ceil(H / s), oy = (H - rows * s) / 2;
    const nw = heroImg.naturalWidth || 2048, nh = heroImg.naturalHeight || 1152;
    const k = Math.max(W / nw, H / nh), dw = nw * k, dh = nh * k, ox = (W - dw) / 2, oyI = (H - dh) / 2;
    const src = heroImg.currentSrc || heroImg.src;
    const frag = document.createDocumentFragment();
    MZ.tiles = []; MZ.s = s; MZ.cols = cols; MZ.rows = rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const n = r * cols + c, x = c * s, y = oy + r * s;
      const t = document.createElement('div'); t.className = 'mz__t';
      t.style.width = t.style.height = `${s + 0.6}px`;
      const a = document.createElement('i'); a.className = 'mz__f mz__f--a';
      const cell = (n * 17 + 5) % 40, ac = cell % 8, ar = Math.floor(cell / 8), as = s + 0.6;
      a.style.backgroundImage = `url("${atlas}")`; a.style.backgroundSize = `${as * 8}px ${as * 5}px`; a.style.backgroundPosition = `${-ac * as}px ${-ar * as}px`;
      const b = document.createElement('i'); b.className = 'mz__f mz__f--b';
      b.style.backgroundImage = `url("${src}")`; b.style.backgroundSize = `${dw}px ${dh}px`; b.style.backgroundPosition = `${ox - x}px ${oyI - y}px`;
      t.append(a, b); frag.appendChild(t);
      const cx = (c + 0.5) / cols - 0.5, cy = (r + 0.5) / rows - 0.5;
      MZ.tiles.push({ el: t, x, y, c, r, cx, cy, d: Math.hypot(cx, cy) / 0.71, q: rnd(n), q2: rnd(n + 99), q3: rnd(n + 517) });
    }
    mz.appendChild(frag); MZ.built = true;
  }
  const tileRest = (t) => `translate3d(${t.x}px,${t.y}px,0) rotateY(180deg)`;

  async function intro() {
    if (!hero || !stage || !heroImg) { endIntro(); return; }
    if (!root.classList.contains('intro-on') || scrollY > 40) { endIntro(); return; }
    root.classList.add('intro-started'); clearTimeout(window.__hvIntroFallback);
    const k = rich ? 1 : 0.82;
    // számláló: a valódi betöltés (fontok, nagy fotó, atlasz) állása
    const cnt = $('[data-count]'); let shown = 0, target = 0, t0 = performance.now();
    const steps = [
      document.fonts ? Promise.all([document.fonts.load('200 64px "Noto Serif Display"'), document.fonts.load('500 13px "Hanken Grotesk"')]).catch(() => 0) : Promise.resolve(),
      heroImg.decode ? heroImg.decode().catch(() => 0) : Promise.resolve(),
      loadImg(atlasUrl()),
    ];
    steps.forEach((p) => p.then(() => { target += 100 / steps.length; }));
    let counting = true;
    const tickCount = () => {
      if (!counting) return;
      const minT = clamp((performance.now() - t0) / 900);         // legalább 0,9 s alatt fut fel
      shown += (Math.min(target, minT * 100) - shown) * 0.18;
      if (cnt) cnt.textContent = String(Math.round(shown)).padStart(3, '0');
      requestAnimationFrame(tickCount);
    };
    requestAnimationFrame(tickCount);
    const [, , atlas] = await Promise.all(steps);
    await new Promise((r) => { const w = () => (shown > 99.4 ? r() : requestAnimationFrame(w)); w(); });
    counting = false; if (cnt) cnt.textContent = '100';
    if (!atlas || scrollY > 40) { endIntro(); return; }
    buildMosaic(atlas.src);
    void mz.offsetWidth;
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    root.classList.add('intro-run');
    const anims = []; const A = (a) => { anims.push(a); return a; };
    A(play($('.hero__count'), [{ opacity: 1 }, { opacity: 0 }], { duration: 400 * k, delay: 200 }));

    const W = stage.clientWidth, H = stage.clientHeight;
    const FLY = 1150 * k, FLIP = 760 * k, T_FLIP = 1700 * k, WAVE = 38 * k;
    let endAt = 0;
    MZ.tiles.forEach((t) => {
      const dx = (t.q - 0.5) * W * 1.1, dy = (t.q2 - 0.5) * H * 1.2, z = -900 - t.q3 * 1700;
      const from = `translate3d(${t.x + dx}px,${t.y + dy}px,${z}px) rotateX(${(t.q2 - 0.5) * 110}deg) rotateY(${(t.q - 0.5) * 120}deg) rotateZ(${(t.q3 - 0.5) * 70}deg)`;
      const land = `translate3d(${t.x}px,${t.y}px,0) rotateY(0deg)`;
      const dl = t.q3 * 520 * k;
      A(play(t.el, [{ transform: from, opacity: 0 }, { opacity: 1, offset: 0.3 }, { transform: land, opacity: 1 }], { duration: FLY, delay: dl, fill: 'backwards' }));
      const fd = T_FLIP + (t.c + t.r) * WAVE;
      A(play(t.el, [{ transform: land }, { transform: `translate3d(${t.x}px,${t.y}px,${60}px) rotateY(90deg)`, offset: 0.5 }, { transform: tileRest(t) }],
        { duration: FLIP, delay: fd, easing: 'cubic-bezier(.65,0,.35,1)', fill: 'forwards' }));
      endAt = Math.max(endAt, fd + FLIP);
    });
    // a repülés és az átfordulás között a csempe a landolt helyén marad
    MZ.tiles.forEach((t) => { t.el.style.transform = `translate3d(${t.x}px,${t.y}px,0)`; });

    // kép kész: a valódi fotó alá, a mozaik eltűnik; árnyék, szómárka, cím, gombok, fejléc
    const T2 = endAt - 120 * k;
    A(play(photo, [{ opacity: 0 }, { opacity: 1 }], { duration: 10, delay: T2 }));
    A(play(shade, [{ opacity: 0 }, { opacity: 1 }], { duration: 900 * k, delay: T2 - 200 * k, easing: 'ease-out' }));
    // a szómárka betűi élesedve jönnek (asztali); érintésen szűrő nélkül, csak emelkedve (a blur festése drága)
    const blur = rich ? [{ filter: 'blur(14px)' }, { filter: 'blur(0)' }] : [{}, {}];
    $$('.mk__l', hero).forEach((l, i) => A(play(l, [{ opacity: 0, transform: 'translateY(18%)', ...blur[0] }, { opacity: 1, transform: 'none', ...blur[1] }],
      { duration: 1100 * k, delay: T2 - 100 * k + i * 70 * k })));
    const h1 = LN.find((o) => o.el.closest('.hero'));
    if (h1) { h1.inner.forEach((i) => { i.style.transform = 'translateY(112%) rotate(2.5deg)'; }); h1.el.style.opacity = 1; }
    setTimeout(() => h1 && lnReveal(h1, 0, k), T2 + 200 * k);
    $$('.hero [data-anim="fade"]').forEach((el, i) => A(play(el, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 900 * k, delay: T2 + 450 * k + i * 110 * k })));
    [$('.hd'), $('.edge'), $('.sx')].filter(Boolean).forEach((el) => A(play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 700 * k, delay: T2 + 500 * k })));

    const hurry = () => anims.forEach((a) => { try { a.updatePlaybackRate(5); } catch (e) { /* kész */ } });
    addEventListener('wheel', hurry, { passive: true, once: true }); addEventListener('touchmove', hurry, { passive: true, once: true }); addEventListener('keydown', hurry, { once: true });
    const last = anims.reduce((m, a) => Math.max(m, (a.effect.getTiming().delay || 0) + a.effect.getTiming().duration), 0);
    await Promise.race([Promise.all(anims.map((a) => a.finished.catch(() => 0))), new Promise((r) => setTimeout(r, last + 2500))]);
    if (h1) h1.el.style.opacity = '';
    endIntro(anims);
  }

  function endIntro(anims) {
    if (introDone) return; introDone = true;
    clearTimeout(window.__hvIntroFallback);
    root.classList.remove('intro-on', 'intro-run'); root.classList.add('intro-started', 'intro-done', 'no-intro');
    (anims || []).forEach((a) => { try { a.cancel(); } catch (e) { /* */ } });
    LN.filter((o) => o.el.closest('.hero')).forEach((o) => { o.done = true; o.inner.forEach((i) => { i.getAnimations().forEach((a) => a.cancel()); i.style.transform = ''; }); });
    if (mz) { MZ.tiles.forEach((t) => { t.el.style.transform = tileRest(t); }); mz.classList.add('is-off'); }
    heroSetup();
  }

  // asztali rich: a hero 2 képernyő magas, a stage tűzve; görgetésre a csempék a néző felé repülnek és visszafordulnak termékfotóvá
  function heroSetup() {
    if (!hero || !rich || !desk() || !mz) return;
    hero.classList.add('is-pin');
    if (!MZ.built) { const go = () => { buildMosaic(atlasUrl()); MZ.tiles.forEach((t) => { t.el.style.transform = tileRest(t); }); mz.classList.add('is-off'); measure(); kick(); }; if (heroImg.complete) go(); else heroImg.addEventListener('load', go, { once: true }); }
    measure(); kick();
  }
  function heroRender(y) {
    if (!hero || !hero.classList.contains('is-pin') || !MZ.built) return;
    const p = clamp(y / Math.max(1, M.heroH - vh));
    const on = p > 0.002;
    if (on !== MZ.exploding) {
      MZ.exploding = on; mz.classList.toggle('is-off', !on);
      photo.style.opacity = on ? '0' : ''; shade.style.opacity = on ? '0' : '';
      MZ.tiles.forEach((t) => { t.el.style.willChange = on ? 'transform,opacity' : ''; });
    }
    body.style.opacity = String(1 - seg(p, 0.02, 0.35));
    body.style.transform = `translate3d(0,${-p * 120}px,0)`;
    if (!on) return;
    MZ.tiles.forEach((t) => {
      const a = 0.04 + (1 - t.d) * 0.22 + t.q * 0.12;           // a közép indul először
      const q = eio(seg(p, a, a + 0.62));
      const z = q * (700 + t.q3 * 600);
      const x = t.x + t.cx * q * vw * (0.9 + t.q2 * 0.8), yy = t.y + t.cy * q * vh * (1 + t.q * 0.9);
      t.el.style.transform = `translate3d(${x}px,${yy}px,${z}px) rotateX(${(t.q2 - 0.5) * 140 * q}deg) rotateY(${180 - 180 * q}deg) rotateZ(${(t.q - 0.5) * 60 * q}deg)`;
      t.el.style.opacity = String(1 - seg(q, 0.72, 1));
    });
  }

  /* ---------------- 2 márka-futószalag (asztali: a görgetés sebességére gyorsul/fordul) ---------------- */
  const mq = $('[data-mq-track]'); let mqA = null, mqV = 1;
  function mqSetup() {
    if (!mq || still) return;
    mqA = mq.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-50%)' }], { duration: 36000, iterations: Infinity });
    new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? mqA.play() : mqA.pause()))).observe(mq);
  }

  /* ---------------- 3 szavanként kigyulladó bekezdés ---------------- */
  const W3 = { words: [], el: $('[data-words]') };
  function wordsSetup() {
    const el = W3.el; if (!el || still) return;
    const text = el.textContent.trim(); el.setAttribute('aria-label', text); el.textContent = '';
    W3.words = text.split(/[ \n\t]+/).map((w, i, a) => { const s = document.createElement('span'); s.className = 'w'; s.setAttribute('aria-hidden', 'true'); s.textContent = w + (i < a.length - 1 ? ' ' : ''); el.appendChild(s); return s; });
    if (rich) { W3.scrub = true; W3.words.forEach((s) => { s.style.opacity = '.16'; }); return; }
    if (!below(el)) return;
    W3.words.forEach((s) => { s.style.opacity = '.16'; });
    when(el, () => W3.words.forEach((s, i) => reveal(s, [{ opacity: 0.16 }, { opacity: 1 }], { duration: 600, delay: i * 55, easing: 'ease-out' })));
  }
  function wordsRender(y) {
    if (!W3.scrub || !W3.words.length) return;
    const top = M.words - y, p = seg(top, vh * 0.82, vh * 0.32);
    const n = W3.words.length, f = p * (n + 2);
    W3.words.forEach((s, i) => { const o = 0.16 + 0.84 * clamp(f - i); if (s._o !== o) { s._o = o; s.style.opacity = o.toFixed(3); } });
  }

  /* ---------------- 4 vízszintes kínálat ---------------- */
  const hz = $('[data-hz]'), hzTrack = $('[data-hz-track]'), hzBar = $('[data-hz-bar]');
  const HZ = { on: false, dist: 0, pars: [] };
  function hzSetup() {
    if (!hz) return;
    const want = rich && desk();
    if (want !== HZ.on) {
      HZ.on = want; hz.classList.toggle('is-hz', want);
      if (!want) { hzTrack.style.transform = ''; $$('[data-par]', hz).forEach((p) => { p.style.transform = ''; }); }
      if (want) $$('img', hz).forEach((i) => { i.loading = 'eager'; });
    }
    if (HZ.on) { HZ.dist = Math.max(0, hzTrack.scrollWidth - vw); hz.style.setProperty('--hz-dist', `${HZ.dist}px`); HZ.pars = $$('.hz__panel', hz).map((p) => ({ p, par: $('[data-par]', p) })); }
  }
  function hzRender(y) {
    if (!HZ.on) return;
    const p = clamp((y - M.hz) / Math.max(1, HZ.dist));
    const x = -p * HZ.dist;
    hzTrack.style.transform = `translate3d(${x.toFixed(1)}px,0,0)`;
    if (hzBar) hzBar.style.transform = `scaleX(${p.toFixed(4)})`;
    HZ.pars.forEach((o) => { const c = o.p.offsetLeft + x + o.p.offsetWidth * 0.3 - vw / 2; o.par.style.transform = `translate3d(${(-c * 0.06).toFixed(1)}px,0,0)`; });
  }
  // nem tűzött módban a képek alulról, a keretükön belül csúsznak be
  function tileInSetup() {
    if (still) return;
    $$('[data-tile-in]').forEach((f, i) => {
      if (HZ.on || !below(f)) return;
      const im = f.querySelector('[data-par]') || f.querySelector('img');
      im.style.transform = 'translateY(102%)';
      when(f, () => reveal(im, [{ transform: 'translateY(102%) scale(1.2)' }, { transform: 'none' }], { duration: 1200, delay: (i % 4) * 90 }));
    });
  }

  /* ---------------- 5 tortagyűrű ---------------- */
  const rg = $('[data-ring]'), ring = $('[data-ring-el]');
  const RG = { mode: '', w: $$('.rg__w', rg || document) };
  let rgA = null;
  function ringSetup() {
    if (!rg || still) return;
    const mode = rich && desk() ? 'pin' : 'auto';
    if (mode === RG.mode) return;
    RG.mode = mode;
    rg.classList.add('is-ring3d'); rg.classList.toggle('is-ringpin', mode === 'pin');
    if (rgA) { rgA.cancel(); rgA = null; }
    RG.w.forEach((w) => { w.style.transform = ''; });
    if (mode === 'auto') {
      rgA = ring.animate([{ transform: 'rotateX(-7deg) rotateY(0deg)' }, { transform: 'rotateX(-7deg) rotateY(-360deg)' }], { duration: 42000, iterations: Infinity });
      new IntersectionObserver((es) => es.forEach((e) => rgA && (e.isIntersecting ? rgA.play() : rgA.pause()))).observe(rg);
    }
  }
  function ringRender(y) {
    if (RG.mode !== 'pin') return;
    const p = clamp((y - M.rg) / Math.max(1, M.rgH - vh));
    ring.style.transform = `rotateX(-7deg) rotateY(${(-p * 300 + 8).toFixed(2)}deg)`;
    if (RG.w[0]) RG.w[0].style.transform = `translate3d(${(-p * 14 + 4).toFixed(2)}vw,0,0)`;
    if (RG.w[1]) RG.w[1].style.transform = `translate3d(${(p * 14 - 4).toFixed(2)}vw,0,0)`;
  }

  /* ---------------- 6 kártya-sáv: négyzet-csempék nyílnak átlósan ---------------- */
  const kt = $('[data-kt]'), ktTiles = $('[data-kt-tiles]'), ktCard = $('.kt__card');
  function ktSetup() {
    if (!kt || still || !below(kt)) return;
    const w = kt.clientWidth, h = kt.clientHeight;
    const cols = Math.max(5, Math.round(w / (w >= 1100 ? 96 : 64))), s = w / cols, rows = Math.ceil(h / s);
    ktTiles.style.gridTemplateColumns = `repeat(${cols}, ${s + 0.5}px)`; ktTiles.style.gridAutoRows = `${s + 0.5}px`;
    const frag = document.createDocumentFragment(), ts = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const i = document.createElement('i'); frag.appendChild(i); ts.push([i, c, r]); }
    ktTiles.appendChild(frag);
    when(kt, () => {
      let last = null;
      ts.forEach(([i, c, r]) => { last = play(i, [{ transform: 'scale(1.01) rotate(0deg)' }, { transform: 'scale(0) rotate(45deg)' }], { duration: 640, delay: (c + r) * 28 + rnd(c * 31 + r) * 80, easing: 'cubic-bezier(.65,0,.35,1)' }); });
      if (last) last.finished.then(() => { ktTiles.classList.add('is-done'); ktTiles.textContent = ''; });
    }, '0px 0px -30% 0px');
  }

  /* ---------------- 7 látogatás: pixeles képfelfedés ---------------- */
  function pixSetup() {
    const fig = $('[data-pix]'); if (!fig || still || !below(fig)) return;
    const img = $('img', fig), cv = $('canvas', fig), ctx = cv.getContext('2d');
    img.loading = 'eager';
    const small = document.createElement('canvas'), sctx = small.getContext('2d');
    const draw = (cols) => {
      const W = fig.clientWidth, H = fig.clientHeight; if (!W || !H) return;
      if (cv.width !== Math.round(W)) { cv.width = Math.round(W); cv.height = Math.round(H); }
      ctx.imageSmoothingEnabled = false;
      if (!img.complete || !img.naturalWidth) { ctx.fillStyle = '#EFE6DC'; ctx.fillRect(0, 0, cv.width, cv.height); return; }
      const rows = Math.max(1, Math.round(cols * H / W));
      small.width = cols; small.height = rows;
      const k = Math.max(W / img.naturalWidth, H / img.naturalHeight), sw = W / k, sh = H / k;
      sctx.drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, cols, rows);
      ctx.drawImage(small, 0, 0, cols, rows, 0, 0, cv.width, cv.height);
    };
    cv.style.opacity = '1'; draw(5);
    img.addEventListener('load', () => draw(5), { once: true });
    when(fig, () => {
      const steps = [5, 9, 16, 30, 56, 110]; let i = 0;
      const next = () => {
        if (i < steps.length) { draw(steps[i++]); setTimeout(next, 130); return; }
        const a = cv.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, fill: 'forwards' });
        a.finished.then(() => { cv.style.opacity = '0'; a.cancel(); cv.width = cv.height = 0; });
      };
      const go = () => setTimeout(next, 60);
      if (img.complete) go(); else img.addEventListener('load', go, { once: true });
    });
  }

  /* ---------------- szakaszok dőlése (asztali rich) ---------------- */
  const FLOW = $$('[data-flow]').map((el) => ({ el, dim: $('.flow-dim', el) }));
  function flowRender(y) {
    if (!rich || !desk()) return;
    FLOW.forEach((o) => {
      const top = o.top - y, bot = top + o.h;
      const e = Math.pow(clamp(top / vh), 1.5), l = Math.pow(clamp(1 - bot / vh), 1.5);
      const enter = e >= l;
      const v = enter ? e : l;
      const tf = v < 0.001 ? 'none' : `perspective(1400px) rotateX(${(enter ? -12 * e : 9 * l).toFixed(3)}deg) scale(${(1 - (enter ? 0.08 : 0.07) * v).toFixed(4)})`;
      if (tf !== o.tf) { o.tf = tf; o.el.style.transform = tf; o.el.style.transformOrigin = enter ? '50% 0' : '50% 100%'; if (o.dim) o.dim.style.opacity = (0.75 * v).toFixed(3); }
    });
  }
  // fotók függőleges parallaxa a bekezdés mellett
  const PARY = $$('[data-par-y]').map((el) => ({ el, f: parseFloat(el.dataset.parY) }));
  function paryRender(y) {
    if (!rich || !desk()) return;
    PARY.forEach((o) => { const c = o.top + o.h / 2 - y - vh / 2; o.el.style.transform = `translate3d(0,${(c * o.f).toFixed(1)}px,0)`; });
  }

  /* ---------------- szakasz-index (bal szél) ---------------- */
  const SX = $('.sx') ? { el: $('.sx'), hid: null } : null;
  function sxSetup() {
    const links = $$('[data-sx]'); if (!links.length) return;
    const map = new Map(links.map((a) => [a.dataset.sx, a]));
    links.forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); const t = document.getElementById(a.dataset.sx); if (t) scrollTo({ top: absTop(t) - (a.dataset.sx === 'top' ? 0 : 64), behavior: 'smooth' }); }));
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { links.forEach((l) => l.classList.remove('is-on')); const a = map.get(e.target.id); a && a.classList.add('is-on'); } }), { rootMargin: '-45% 0px -54% 0px' });
    links.forEach((a) => { const s = document.getElementById(a.dataset.sx); s && io.observe(s); });
  }

  /* ---------------- gombok: gördülő betűk, mágnes; négyzet kurzor ---------------- */
  const HOME = !!$('.pg--home');
  function rollSetup() {
    if (!rich || !HOME) return;
    $$('.btn__t').forEach((t) => {
      const a = t.closest('a'); const txt = t.textContent;
      if (a && !a.getAttribute('aria-label')) a.setAttribute('aria-label', txt);
      t.textContent = ''; t.classList.add('is-roll');
      [...txt].forEach((ch, i) => { const s = document.createElement('span'); s.className = 'r'; s.style.setProperty('--i', i); s.textContent = ch; s.setAttribute('aria-hidden', 'true'); t.appendChild(s); });
    });
  }
  const PT = { x: -100, y: -100, cx: -100, cy: -100, on: false };
  let cur = null; const MAG = [];
  function cursorSetup() {
    if (!rich || !HOME) return;
    cur = document.createElement('div'); cur.className = 'cur'; cur.innerHTML = '<i></i>'; document.body.appendChild(cur);
    $$('[data-magnet]').forEach((el) => MAG.push({ el, x: 0, y: 0, tx: 0, ty: 0 }));
    addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      PT.x = e.clientX; PT.y = e.clientY;
      if (!PT.on) { PT.on = true; PT.cx = PT.x; PT.cy = PT.y; cur.classList.add('on'); }
      const over = e.target.closest && e.target.closest('a,button,[data-tilt]');
      cur.classList.toggle('is-link', !!over);
      MAG.forEach((m) => {
        const r = m.el.getBoundingClientRect(), pad = 40;
        const inside = PT.x > r.left - pad && PT.x < r.right + pad && PT.y > r.top - pad && PT.y < r.bottom + pad;
        m.tx = inside ? (PT.x - (r.left + r.width / 2)) * 0.3 : 0; m.ty = inside ? (PT.y - (r.top + r.height / 2)) * 0.3 : 0;
      });
      kick();
    }, { passive: true });
    document.addEventListener('pointerleave', () => { PT.on = false; cur.classList.remove('on'); MAG.forEach((m) => { m.tx = m.ty = 0; }); kick(); });
  }
  // kártya: egérrel dől
  const TILT = { rx: 0, ry: 0, tx: 0, ty: 0 };
  function tiltSetup() {
    if (!rich || !kt || !ktCard) return;
    kt.addEventListener('pointermove', (e) => { const r = kt.getBoundingClientRect(); TILT.ty = ((e.clientX - r.left) / r.width - 0.5) * 14; TILT.tx = -((e.clientY - r.top) / r.height - 0.5) * 10; kick(); });
    kt.addEventListener('pointerleave', () => { TILT.tx = TILT.ty = 0; kick(); });
  }

  /* ---------------- lábléc: a szómárka betűi felemelkednek ---------------- */
  const FT = { letters: $$('.ft__mark span'), done: true };
  function ftSetup() {
    if (still || !FT.letters.length || !$('.pg--home')) return;
    FT.done = false; FT.letters.forEach((l) => { l.style.transform = 'translateY(100%)'; });
  }
  function ftCheck(y) {
    if (FT.done) return;
    if (y + vh > M.mainBot - 60) {
      FT.done = true;
      FT.letters.forEach((l, i) => reveal(l, [{ transform: 'translateY(100%)' }, { transform: 'none' }], { duration: 1300, delay: 120 + i * 70 }));
    }
  }

  /* ---------------- mérés ---------------- */
  const M = { heroH: 0, hz: 0, rg: 0, rgH: 0, words: 0, mainBot: 0 };
  function measure() {
    vw = innerWidth; vh = innerHeight;
    // laposan mérünk: a dőlt szakaszok transzformja nem számít az offsetTop-ba, a sticky sem
    if (hero) M.heroH = hero.offsetHeight;
    hzSetup();
    if (hz) M.hz = absTop(hz);
    if (rg) { M.rg = absTop(rg); M.rgH = rg.offsetHeight; }
    if (W3.el) M.words = absTop(W3.el);
    FLOW.forEach((o) => { o.top = absTop(o.el); o.h = o.el.offsetHeight; });
    PARY.forEach((o) => { o.top = absTop(o.el); o.h = o.el.offsetHeight; });
    const main = $('#main'); if (main) M.mainBot = absTop(main) + main.offsetHeight;
  }

  /* ---------------- egy közös képkocka-ciklus ---------------- */
  let raf = 0, last = 0, sy = scrollY, vel = 0;
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(tick); } }
  function tick(t) {
    raf = 0;
    const dt = Math.min(64, t - last || 16); last = t;
    const y = scrollY, k = 1 - Math.exp(-dt / 110);
    const prev = sy; sy += (y - sy) * k; if (Math.abs(y - sy) < 0.4) sy = y;
    vel += ((sy - prev) / dt - vel) * 0.2;
    let moving = sy !== y || Math.abs(vel) > 0.002;
    if (introDone) heroRender(sy);
    if (SX && (y < vh * 0.7) !== SX.hid) { SX.hid = y < vh * 0.7; SX.el.classList.toggle('is-hidden', SX.hid); }
    wordsRender(sy); hzRender(sy); ringRender(sy); flowRender(sy); paryRender(sy); ftCheck(y);
    if (mqA && rich) { const r = 1 + clamp(vel * 1.6, -5, 5); mqV += (r - mqV) * 0.08; if (Math.abs(mqV - mqA.playbackRate) > 0.01) mqA.playbackRate = mqV; if (Math.abs(mqV - 1) > 0.02) moving = true; }
    if (cur && PT.on) {
      PT.cx += (PT.x - PT.cx) * (1 - Math.exp(-dt / 70)); PT.cy += (PT.y - PT.cy) * (1 - Math.exp(-dt / 70));
      cur.style.transform = `translate3d(${PT.cx.toFixed(1)}px,${PT.cy.toFixed(1)}px,0)`;
      if (Math.abs(PT.x - PT.cx) + Math.abs(PT.y - PT.cy) > 0.3) moving = true;
    }
    MAG.forEach((m) => {
      const kk = 1 - Math.exp(-dt / 120); m.x += (m.tx - m.x) * kk; m.y += (m.ty - m.y) * kk;
      if (Math.abs(m.tx - m.x) + Math.abs(m.ty - m.y) > 0.1) moving = true; else { m.x = m.tx; m.y = m.ty; }
      m.el.style.transform = m.x || m.y ? `translate3d(${m.x.toFixed(2)}px,${m.y.toFixed(2)}px,0)` : '';
    });
    if (ktCard && rich) {
      const kk = 1 - Math.exp(-dt / 140); TILT.rx += (TILT.tx - TILT.rx) * kk; TILT.ry += (TILT.ty - TILT.ry) * kk;
      if (Math.abs(TILT.tx - TILT.rx) + Math.abs(TILT.ty - TILT.ry) > 0.02) moving = true;
      ktCard.style.transform = `rotateX(${TILT.rx.toFixed(2)}deg) rotateY(${TILT.ry.toFixed(2)}deg)`;
    }
    if (moving) kick();
  }
  addEventListener('scroll', kick, { passive: true });
  let lastW = vw, lastH = vh, rt = 0;
  addEventListener('resize', () => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      const wch = innerWidth !== lastW, big = Math.abs(innerHeight - lastH) > 160;
      if (!wch && !big) return;
      lastW = innerWidth; lastH = innerHeight; vw = innerWidth; vh = innerHeight;
      if (wch) lnResplit();
      ringSetup();
      if (introDone && hero && rich) {
        hero.classList.toggle('is-pin', desk());
        if (desk() && MZ.built) { buildMosaic(atlasUrl()); MZ.tiles.forEach((t) => { t.el.style.transform = tileRest(t); }); MZ.exploding = false; mz.classList.add('is-off'); photo.style.opacity = shade.style.opacity = ''; }
        else if (!desk()) { photo.style.opacity = shade.style.opacity = body.style.opacity = body.style.transform = ''; mz.classList.add('is-off'); }
        if (desk() && !MZ.built) heroSetup();
      }
      measure(); kick();
    }, 150);
  });

  /* ---------------- indulás ---------------- */
  lnSetup(); mqSetup(); wordsSetup(); hzSetup(); tileInSetup(); ringSetup(); ktSetup(); pixSetup(); sxSetup();
  rollSetup(); cursorSetup(); tiltSetup(); ftSetup();
  measure(); kick();
  if (document.fonts) document.fonts.ready.then(() => { lnResplit(); measure(); kick(); });
  addEventListener('load', () => { measure(); kick(); });
  if (still || !hero) endIntro();
  else intro().catch((err) => { console.warn('[motion] intro', err && err.message); endIntro(); });
  setTimeout(() => { if (!introDone) endIntro(); }, 9000);
}
