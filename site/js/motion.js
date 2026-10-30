// HabVero: mozgás (13 animátor, v1 2026-10-30). Terv: P/terv/dizajn.md 7., 9., 10., 11., 12.; leírás: P/terv/mozgas.md.
//
// Belépési pont: main.js betölti és meghívja: initMotion(HV)
//   HV.root       <html> (osztályok: rich | touch | still, is-gpu-soft, intro-on / no-intro, is-menu-open)
//   HV.lines      line.js állapot: { paths, hold, holdOpen }; 'hv:lines' esemény újraíráskor
//   HV.hero       a hero3d.js vezérlője (null = poszter); 'hv:hero-mounted', 'hv:hero-live', 'hv:hero-exit' (p), 'hv:hero-intro-done', 'hv:menu'
// Horgonyok: [data-anim=mark|lines|fade], [data-hero-*], [data-fill], section[data-flow] .flow-dim, [data-depth] .dc…,
//   [data-reveal-list/row/src], [data-turntable*], [data-wipe], [data-visit-photo], [data-magnet] .btn__t, [data-curtain]
//
// Szabályok (web-motion-lessons, web-3d-scroll-lessons, measure-flat-lesson):
//  - görgetéshez kötött (scrub) mozgás csak .rich-en (hover + finom mutató + valódi GPU) és >= 1100 px-en; érintésen időzített egyszeri
//  - csak transform/opacity; a vonalon dashoffset csak rövid, ívelt path-on, az egyenes varratok scaleX/scaleY-nal rajzolódnak
//  - pozíció mindig az offsetTop-láncból (a dőlt szakaszon belül sosem getBoundingClientRect)
//  - egy rAF-ciklus, csak ha valami mozog; minden WAAPI animáció a végén cancel(), a végállapot a CSS/inline
//  - rejtett állapot csak a hajtás alatti elemeken (vagy intro-on alatt), így középen újratöltve semmi nem marad láthatatlan

const EOUT = 'cubic-bezier(.16,1,.3,1)';      // --e-out (expo.out)
const EDRAW = 'cubic-bezier(.45,0,.55,1)';    // --e-draw (power2.inOut)
const EIN = 'cubic-bezier(.55,0,1,.45)';      // a csőrből induló vonal gyorsulva indul, a keret egyenletesen fut
const HIDE_LN = 'translateY(112%) rotate(2.5deg)';
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
const sstep = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const px = (v) => v.toFixed(2) + 'px';
function absTop(el) { let y = 0; while (el) { y += el.offsetTop; el = el.offsetParent; } return y; }

export function initMotion(HV) {
  const root = (HV && HV.root) || document.documentElement;
  const rich = root.classList.contains('rich');
  const touch = root.classList.contains('touch');
  if ((!rich && !touch) || !Element.prototype.animate) {
    root.classList.remove('intro-on'); root.classList.add('no-intro');
    return;
  }
  const lines = (HV && HV.lines) || {};
  let vw = innerWidth, vh = innerHeight;
  const wide = () => vw >= 1100;
  const scrubOn = () => rich && wide();

  /* ---------------- közös: animáció, vonalrajz, belépés-figyelő ---------------- */
  function play(el, kf, o) {
    const a = el.animate(kf, Object.assign({ fill: 'both', easing: EOUT }, o));
    a.finished.then(() => a.cancel(), () => {});
    return a;
  }
  const below = (el) => absTop(el) > scrollY + vh * 0.84;
  const pathLen = (p) => { try { return p.getTotalLength(); } catch (e) { return 0; } };
  const drawDur = (p, min = 280, max = 1600) => clamp(pathLen(p) * 0.7, min, max);   // --d-line-per-100px 70 ms

  // egyenes szakasz: scaleX/scaleY (nincs dasharray hosszú path-on); ívelt, rövid: pathLength=1 + dashoffset
  function lineHide(p, mode) {
    if (!p) return;
    if (mode === 'dash') { p.style.strokeDasharray = '1 1.02'; p.style.strokeDashoffset = '1.01'; return; }
    p.style.transformBox = 'fill-box';
    p.style.transformOrigin = mode === 'y' ? '50% 0' : '0 50%';
    p.style.transform = mode === 'y' ? 'scaleY(0)' : 'scaleX(0)';
  }
  function lineDraw(p, mode, o = {}) {
    if (!p) return null;
    const dur = o.duration || drawDur(p);
    let a;
    if (mode === 'dash') {
      a = play(p, [{ strokeDashoffset: 1.01 }, { strokeDashoffset: 0 }], { duration: dur, delay: o.delay || 0, easing: o.easing || EDRAW });
      p.style.strokeDashoffset = '0';
      if (!o.keepDash) a.finished.then(() => { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; }, () => {});
    } else {
      const from = mode === 'y' ? 'scaleY(0)' : 'scaleX(0)';
      a = play(p, [{ transform: from }, { transform: 'none' }], { duration: dur, delay: o.delay || 0, easing: o.easing || EDRAW });
      p.style.transform = '';
    }
    return a;
  }
  const seg = (line, key) => $(`svg.pl[data-line="${line}"] path[data-seg="${key}"]`);

  const jobs = new Map();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => {
    es.forEach((e) => {
      if (!e.isIntersecting) return;
      const fns = jobs.get(e.target); if (!fns) return;
      jobs.delete(e.target); io.unobserve(e.target);
      fns.forEach((f) => f());
    });
  }, { rootMargin: '0px 0px -16% 0px' }) : null;
  function when(el, fn) {
    if (!io) { fn(); return; }
    const l = jobs.get(el); if (l) l.push(fn); else { jobs.set(el, [fn]); io.observe(el); }
  }
  // egyszerre belépők lépcsőzése (pl. Kínálat sorok 120 ms)
  const stagger = {};
  function slot(group, step) {
    const now = performance.now(), s = stagger[group] || { t: 0 };
    const at = Math.max(now, s.t + step); stagger[group] = { t: at };
    return at - now;
  }

  /* ---------------- sormaszkos címek (10.1) ---------------- */
  const LN = $$('[data-anim="lines"]').map((el) => ({ el, txt: null, lines: [], split: false, state: 'idle', anims: [] }));
  function splitOne(o) {
    const el = o.el;
    if (o.txt === null) {
      if (el.children.length) return false;
      o.txt = el.textContent.replace(/[ \n\t]+/g, ' ').trim();     // csak sima szóköz: a/az utáni nbsp marad
    }
    el.textContent = '';
    const words = o.txt.split(' ').filter(Boolean);
    const spans = words.map((w, i) => {
      const s = document.createElement('span'); s.textContent = w; el.appendChild(s);
      if (i < words.length - 1) el.appendChild(document.createTextNode(' '));
      return s;
    });
    if (spans.some((s) => s.getClientRects().length > 1)) { el.textContent = o.txt; o.lines = []; o.split = false; return false; }   // elválasztott szó
    const groups = []; let top = null;
    spans.forEach((s) => { const t = s.offsetTop; if (top === null || Math.abs(t - top) > 4) { groups.push([]); top = t; } groups[groups.length - 1].push(s.textContent); });
    el.textContent = '';
    const sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = o.txt; el.appendChild(sr);
    o.lines = groups.map((g) => {
      const ln = document.createElement('span'); ln.className = 'ln'; ln.setAttribute('aria-hidden', 'true');
      const inner = document.createElement('span'); inner.className = 'ln__i'; inner.textContent = g.join(' ');
      ln.appendChild(inner); el.appendChild(ln);
      return inner;
    });
    o.split = true;
    return true;
  }
  const lnTargets = (o) => (o.split ? o.lines : [o.el]);
  function lnHide(o) {
    o.state = 'pending';
    if (o.split) o.lines.forEach((l) => { l.style.transform = HIDE_LN; });
    else { o.el.style.opacity = '0'; o.el.style.transform = 'translate3d(0,24px,0)'; }
  }
  function lnReveal(o, delay = 0, k = 1) {
    o.state = 'anim';
    o.anims = lnTargets(o).map((l, i) => {
      const a = o.split
        ? play(l, [{ transform: HIDE_LN }, { transform: 'none' }], { duration: 900 * k, delay: delay + i * 70 * k })
        : play(l, [{ opacity: 0, transform: 'translate3d(0,24px,0)' }, { opacity: 1, transform: 'none' }], { duration: 900 * k, delay });
      l.style.transform = ''; l.style.opacity = '';
      return a;
    });
    Promise.allSettled(o.anims.map((a) => a.finished)).then(() => { if (o.state === 'anim') o.state = 'done'; });
    return o.anims;
  }
  let splitReady = false;
  function resplit() {
    if (!splitReady) return;
    LN.forEach((o) => {
      if (!introDone && hero && hero.contains(o.el)) return;   // az intro alatt a hero címeihez nem nyúlunk
      if (o.txt === null && o.el.children.length) return;
      if (o.state === 'anim') { o.anims.forEach((a) => a.cancel()); o.state = 'done'; }
      o.el.style.opacity = ''; o.el.style.transform = '';
      splitOne(o);
      if (o.state === 'pending') lnHide(o);
    });
  }

  /* ---------------- hero: intro (7.) és kilépés ---------------- */
  const hero = $('[data-hero-stage]') ? $('#top') || $('[data-hero-stage]').closest('section') : null;
  const mk = hero && $('[data-anim="mark"]', hero);
  const obj = hero && $('[data-hero-obj]', hero);
  const poster = hero && $('.hero__poster', hero);
  const segN = seg('hero', 'nozzle'), segF = seg('hero', 'frame'), segD = seg('hero', 'drop');
  let tMount = 0, introDone = false;
  document.addEventListener('hv:hero-mounted', () => { tMount = performance.now(); });
  const H = { p: 0, last: -1, film: null, top: 0, h: 1 };

  function holdNozzle() { lines.hold = touch && introDone && H.last <= 0; }
  function applyHeroP(p) {
    if (Math.abs(p - H.last) < 1e-4) return;
    H.last = p;
    if (mk) mk.style.transform = p > 0 ? `translate3d(0,${px(-0.18 * vh * p)},0)` : '';
    if (introDone && segN) segN.style.strokeDashoffset = (1.01 * clamp(p / 0.85)).toFixed(4);   // vissza a csőrbe
    if (obj && !(HV && HV.hero)) {
      obj.style.transform = p > 0 ? `translate3d(0,${px(-0.14 * vh * p)},0) scale(${(1 - 0.3 * p).toFixed(4)})` : '';
      obj.style.opacity = p > 0 ? (1 - sstep(0.65, 0.95, p)).toFixed(3) : '';
    }
    holdNozzle();
  }
  document.addEventListener('hv:hero-exit', (e) => {
    if (obj && (obj.style.transform || obj.style.opacity)) { obj.style.transform = ''; obj.style.opacity = ''; }
    applyHeroP(+e.detail || 0);
  });

  function endIntro() {
    root.classList.remove('intro-on', 'intro-run');
    root.classList.add('intro-done');
    if (mk) mk.classList.remove('is-clip');
    const fig = hero && $('[data-hero-photo]', hero); if (fig) fig.classList.remove('is-filling');
    if (segN) { segN.style.strokeDasharray = '1 1.02'; if (!segN.style.strokeDashoffset) segN.style.strokeDashoffset = '0'; }
    introDone = true; H.last = -1; applyHeroP(H.p); holdNozzle();
  }

  async function runIntro(fontsP) {
    if (!hero || !root.classList.contains('intro-on')) { endIntro(); return; }
    root.classList.add('intro-started');
    let skipped = false;
    const onEarly = () => { if (scrollY > 40) skipped = true; };
    addEventListener('scroll', onEarly, { passive: true });
    const cap = Math.max(300, 2600 - performance.now());
    const dec = poster && poster.decode ? poster.decode().catch(() => {}) : null;
    const settled = new Promise((res) => {
      const chk = () => (HV.hero || root.classList.contains('is-hero-fallback') || !$('#hero3d') || skipped ? res() : setTimeout(chk, 40));
      chk();
    });
    await Promise.race([Promise.all([fontsP, dec, settled]), sleep(cap)]);
    removeEventListener('scroll', onEarly);
    if (skipped || scrollY > 40 || !root.classList.contains('intro-on')) { endIntro(); return; }

    const k = rich ? 1 : 0.75;                       // érintésen rövidebb (teljes intro 2,8 s)
    const mode3d = !!(HV && HV.hero) && poster && poster.style.opacity === '0';
    const off = mode3d && tMount ? clamp(performance.now() - tMount, 0, 2000) : 0;
    const A = [];
    const add = (a) => { if (a) A.push(a); return a; };

    // 1) óriás szómárka betűnként a maszk alól (0–900)
    if (mk) {
      mk.classList.add('is-clip');
      $$('.mk__l', mk).forEach((l, i) => add(play(l, [{ transform: 'translateY(105%)' }, { transform: 'none' }], { duration: 760 * k, delay: i * 45 * k })));
    }
    // 2) poszter (ha nincs élő 3D): összeáll a helyén (150–1550)
    if (!mode3d && obj) add(play(obj, [{ opacity: 0, transform: 'translate3d(0,3%,0) scale(.96)' }, { opacity: 1, transform: 'none' }], { duration: 1400 * k, delay: 150 * k }));
    // 3) a vonal kifut a csőrből (2000–3400): S-ív, keret körbe, le a szakasz aljára
    const lineAt = Math.max(1000 * k, 2000 * k - off);
    if (segN && segF) {
      lineHide(segN, 'dash'); lineHide(segF, 'dash'); lineHide(segD, 'y');
      const lN = pathLen(segN), lF = pathLen(segF), lD = segD ? pathLen(segD) : 0, tot = Math.max(1, lN + lF + lD);
      const T = 1400 * k, dN = Math.max(220, T * lN / tot), dF = Math.max(500, T * lF / tot), dD = Math.max(160, T * lD / tot);
      add(lineDraw(segN, 'dash', { delay: lineAt, duration: dN, easing: EIN, keepDash: true }));
      add(lineDraw(segF, 'dash', { delay: lineAt + dN, duration: dF, easing: 'linear' }));
      if (segD) add(lineDraw(segD, 'y', { delay: lineAt + dN + dF, duration: dD, easing: 'cubic-bezier(0,0,.4,1)' }));
    }
    // 4) H1, bevezető, cím sor, gombok (2200–3100, 80 ms lépcső)
    let td = 2200 * k;
    $$('[data-anim="lines"]', hero).forEach((el) => {
      const o = LN.find((x) => x.el === el); if (!o) return;
      lnTargets(o).forEach((l) => {
        add(o.split ? play(l, [{ transform: HIDE_LN }, { transform: 'none' }], { duration: 900 * k, delay: td })
          : play(l, [{ opacity: 0, transform: 'translate3d(0,24px,0)' }, { opacity: 1, transform: 'none' }], { duration: 900 * k, delay: td }));
        td += 80 * k;
      });
      o.state = 'done';
    });
    $$('[data-anim="fade"]', hero).forEach((el) => {
      add(play(el, [{ opacity: 0, transform: 'translate3d(0,16px,0)' }, { opacity: 1, transform: 'none' }], { duration: 900 * k, delay: td }));
      td += 80 * k;
    });
    // 5) a fotó alulról "megtelik" a keretben (3000–3800): doboz fel, kép ellenirányban (csak transform)
    const fig = $('[data-hero-photo]', hero), fill = fig && $('[data-fill]', fig), fimg = fill && $('img', fill);
    if (fill) {
      fig.classList.add('is-filling');
      add(play(fill, [{ transform: 'translate3d(0,100%,0)' }, { transform: 'none' }], { duration: 800 * k, delay: 3000 * k }));
      if (fimg) add(play(fimg, [{ transform: 'translate3d(0,-100%,0) scale(1.08)' }, { transform: 'none' }], { duration: 800 * k, delay: 3000 * k }));
    }
    // a rejtett állapotot innentől az animációk tartják (fill: both)
    root.classList.remove('intro-on');
    root.classList.add('intro-run');

    // görgetés / billentyű: az intro siet (kihagyható)
    const hurry = () => { A.forEach((a) => { try { a.updatePlaybackRate(6); } catch (e) { a.playbackRate = 6; } }); off2(); };
    const evs = ['wheel', 'touchmove', 'keydown', 'scroll'];
    const off2 = () => evs.forEach((ev) => removeEventListener(ev, hurry));
    evs.forEach((ev) => addEventListener(ev, hurry, { passive: true }));
    await Promise.allSettled(A.map((a) => a.finished));
    off2();
    endIntro();
  }

  /* ---------------- tortaréteg-átmenet (9.1) ---------------- */
  const FL = $$('section[data-flow]').map((el) => ({
    el, dim: $('.flow-dim', el), seam: $('svg.pl path[data-seg="seam"]', el), wipe: el.hasAttribute('data-wipe'),
    leave: !!el.nextElementSibling, top: 0, h: 0, e: 1, x: 0, cur: '', scrub: false,
  }));
  function flowApply(o) {
    let tf = '', org = '', d = 0;
    const seen = o.top < scrollY + vh && o.top + o.h > scrollY;
    if (seen && o.leave && o.x > 0.0005) {
      tf = `perspective(1400px) rotateX(${(7 * o.x).toFixed(3)}deg) scale(${(1 - 0.05 * o.x).toFixed(4)})`; org = '50% 100%'; d = o.x;
    } else if (seen && o.e < 0.9995) {
      const u = 1 - o.e;
      tf = `perspective(1400px) translate3d(0,${px(0.06 * vh * u)},0) rotateX(${(-10 * u).toFixed(3)}deg) scale(${(1 - 0.06 * u).toFixed(4)})`; org = '50% 0';
    }
    const key = tf + d.toFixed(3);
    if (key !== o.cur) {
      o.cur = key; o.el.style.transformOrigin = org; o.el.style.transform = tf;
      if (o.dim) o.dim.style.opacity = d ? d.toFixed(3) : '';
    }
    if (o.seam && !o.wipe) {
      const s = clamp(o.e / 0.98);
      const st = s >= 1 ? '' : `scaleX(${s.toFixed(4)})`;
      if (o.seam.style.transform !== st) { o.seam.style.transformBox = 'fill-box'; o.seam.style.transformOrigin = '0 50%'; o.seam.style.transform = st; }
    }
  }
  function flowSet() {
    const on = scrubOn();
    FL.forEach((o) => {
      if (on === o.scrub) return;
      o.scrub = on;
      o.el.style.willChange = on ? 'transform' : '';
      o.el.style.opacity = '';
      if (!on) { o.el.style.transform = ''; o.el.style.transformOrigin = ''; if (o.dim) o.dim.style.opacity = ''; if (o.seam && !o.wipe) o.seam.style.transform = ''; o.cur = ''; }
      else { o.cur = '_'; }
    });
  }
  // érintésen / keskenyen: belépéskor egyszer kiegyenesedik, a varrat időzítve rajzolódik
  function flowOnce(o) {
    if (o.scrub || !below(o.el)) return;
    o.el.style.transformOrigin = '50% 0';
    o.el.style.transform = 'perspective(1400px) translate3d(0,48px,0) rotateX(-8deg)';
    o.el.style.opacity = '0';
    if (o.seam && !o.wipe) lineHide(o.seam, 'x');
    when(o.el, () => {
      if (o.scrub) return;
      play(o.el, [{ opacity: 0, transform: 'perspective(1400px) translate3d(0,48px,0) rotateX(-8deg)' }, { opacity: 1, transform: 'none' }], { duration: 900 });
      o.el.style.transform = ''; o.el.style.opacity = '';
      if (o.seam && !o.wipe) lineDraw(o.seam, 'x', { delay: 150, duration: 900 });
    });
  }

  /* ---------------- Kártya-sáv: törlés balról ---------------- */
  function wipeSetup(sec) {
    const s = $('svg.pl path[data-seg="seam"]', sec);
    if (!below(sec)) return;
    const cover = document.createElement('div'); cover.className = 'wipe-cover'; cover.setAttribute('aria-hidden', 'true');
    sec.insertBefore(cover, sec.firstChild);
    lineHide(s, 'x');
    when(sec, () => {
      const a = play(cover, [{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: 900 });
      a.finished.then(() => cover.remove(), () => cover.remove());
      cover.style.transform = 'scaleX(0)';
      lineDraw(s, 'x', { duration: 900, easing: EOUT });
    });
  }

  /* ---------------- mélység-kártyák (5.) ---------------- */
  const DC = $$('[data-depth]').map((el) => ({
    el, card: $('.dc__card', el), img: $('.dc__img > img', el), frame: $$('.dc__frame i', el),
    ring: !!el.closest('[data-turntable-ring]'), wipe: !!el.closest('[data-wipe]'),
    top: 0, h: 0, rx: 0, ry: 0, tx: 0, ty: 0, z: 0, tz: 0, mx: 0, my: 0, par: 0, on: false, cur: '',
  }));
  const FR = (i) => (i.classList.contains('t') || i.classList.contains('b') ? 'scaleX(0)' : 'scaleY(0)');
  const frameOrder = (list) => ['t', 'r', 'b', 'l'].map((c) => list.find((i) => i.classList.contains(c))).filter(Boolean);
  function dcOnce(o) {
    if (!below(o.el) || (o.ring && TT.on)) return;
    o.el.style.opacity = '0';
    o.el.style.transform = 'perspective(900px) translate3d(0,40px,0) rotateX(12deg)';
    o.frame.forEach((i) => { i.style.transform = FR(i); });
    when(o.el, () => {
      const d = (o.wipe ? 300 : 0) + slot('dc', 90);
      play(o.el, [{ opacity: 0, transform: 'perspective(900px) translate3d(0,40px,0) rotateX(12deg)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: d });
      o.el.style.opacity = ''; o.el.style.transform = '';
      frameOrder(o.frame).forEach((i, n) => {
        play(i, [{ transform: FR(i) }, { transform: 'none' }], { duration: 180, delay: d + 650 + n * 180, easing: 'linear' });
        i.style.transform = '';
      });
    });
  }
  function dcRender(o, k, y) {
    let moving = false;
    const dz = o.tz - o.z, dx = o.tx - o.rx, dy = o.ty - o.ry;
    if (Math.abs(dx) > 0.01 || Math.abs(dy) > 0.01 || Math.abs(dz) > 0.01) { o.rx += dx * k; o.ry += dy * k; o.z += dz * k; moving = true; }
    else { o.rx = o.tx; o.ry = o.ty; o.z = o.tz; }
    const ct = (o.rx || o.ry || o.z) ? `rotateX(${o.rx.toFixed(2)}deg) rotateY(${o.ry.toFixed(2)}deg) translateZ(${o.z.toFixed(2)}px)` : '';
    if (o.img) {
      const lim = 0.05 * o.h;
      const c = (o.top + o.h / 2 - (y + vh / 2)) / vh;
      const ix = clamp(-o.ry / 7 * 10, -lim, lim), iy = clamp(-c * 0.03 * o.h + o.rx / 7 * 10, -lim, lim);
      const it = `translate3d(${px(ix)},${px(iy)},0) scale(1.1)`;
      if (it !== o.icur) { o.icur = it; o.img.style.transform = it; }
    }
    if (ct !== o.cur) { o.cur = ct; o.card.style.transform = ct; }
    if (!moving && !o.on && o.card.style.willChange) o.card.style.willChange = '';
    return moving;
  }

  /* ---------------- tortaforgó (9.2) ---------------- */
  const ttSec = $('section[data-turntable]');
  const TT = {
    on: false, sec: ttSec, view: ttSec && $('[data-turntable-view]', ttSec), ring: ttSec && $('[data-turntable-ring]', ttSec),
    cards: ttSec ? $$('.tf__card', ttSec) : [], q: 0, top: 0, range: 1, cur: '', W: 0, H: 0, R: 0, cw: 0, dy: [], hh: [], yf: 0,
    rim: null, mk: null, veils: [],
  };
  const DYV = [-2, 3, -1.5, 2, -3, 1];    // magasság-eltolás vh-ban (nem egyforma rács)
  const P = 1600, PHI = (-6 * Math.PI) / 180, C6 = Math.cos(PHI), S6 = Math.sin(PHI);
  function ttProj(x, y, z, cy = TT.cy) {
    const y2 = y * C6 - z * S6, z2 = y * S6 + z * C6, f = P / (P - z2);
    const ox = TT.W / 2, oy = 0.32 * TT.H;
    return [ox + (TT.W / 2 + x - ox) * f, oy + (cy + y2 - oy) * f];
  }
  function ttMeasure() {
    if (!TT.on) return;
    TT.W = TT.view.clientWidth; TT.H = TT.view.clientHeight;
    TT.R = clamp(0.34 * vw, 420, 560);
    const ratio = TT.cards.map((c) => (c.classList.contains('tf__card--sq') ? 1 : 1.25));
    const M = 14, c0 = TT.H / 2;
    let cw = Math.min(340, 0.22 * vw), shift = 0;
    for (; cw >= 180; cw -= 4) {
      // minden kártyának elöl (szemben) be kell férnie, a perem első pontjával együtt; a gyűrű közepe függőlegesen eltolható
      const hh = ratio.map((r) => r * cw), dy = DYV.map((v) => (v * vh) / 100);
      const yf = Math.max(...hh.map((h, i) => dy[i] + h / 2)) + 26;
      const T = Math.min(...hh.map((h, i) => ttProj(0, dy[i] - h / 2, TT.R, c0)[1]));
      const B = Math.max(ttProj(0, yf, TT.R * 1.05, c0)[1] + 4, ...hh.map((h, i) => ttProj(0, dy[i] + h / 2, TT.R, c0)[1]));
      shift = (TT.H / 2 - (T + B) / 2) / (P / (P - TT.R));
      if (B - T <= TT.H - 2 * M) break;
    }
    TT.cy = c0 + shift;
    TT.ring.style.top = TT.cy.toFixed(1) + 'px';
    TT.cw = cw; TT.hh = ratio.map((r) => r * cw); TT.dy = DYV.map((v) => (v * vh) / 100);
    TT.yf = Math.max(...TT.hh.map((h, i) => TT.dy[i] + h / 2)) + 26;
    TT.sec.style.setProperty('--cw', cw.toFixed(1) + 'px');
    // a forgó pereme: vetített kör a kártyák alatt (egyszer írva, nem képkockánként)
    let d = '';
    for (let i = 0; i <= 96; i++) {
      const t = (i / 96) * 2 * Math.PI, [x, y] = ttProj(TT.R * 1.05 * Math.sin(t), TT.yf, TT.R * 1.05 * Math.cos(t));
      d += (i ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
    }
    TT.rim.setAttribute('viewBox', `0 0 ${TT.W} ${TT.H}`);
    TT.rim.firstChild.setAttribute('d', d + 'Z');
    TT.top = absTop(TT.sec); TT.range = Math.max(1, TT.sec.offsetHeight - vh);
    TT.cur = '';
  }
  function ttRender(q) {
    const key = q.toFixed(4); if (key === TT.cur) return; TT.cur = key;
    const th = -q * 300;
    TT.cards.forEach((c, i) => {
      const a = i * 60 + th, cs = Math.cos((a * Math.PI) / 180);
      c.style.transform = `rotateY(${a.toFixed(3)}deg) translateZ(${TT.R.toFixed(1)}px) translate(-50%,-50%) translateY(${px(TT.dy[i])})`;
      const op = clamp((cs + 0.25) / 0.2);
      c.style.opacity = op < 1 ? op.toFixed(3) : '';
      c.style.pointerEvents = op < 0.5 ? 'none' : '';
      const v = TT.veils[i]; if (v) v.style.opacity = (0.55 * (1 - cs) / 2).toFixed(3);
    });
    const t = (th * Math.PI) / 180, [x, y] = ttProj(TT.R * 1.05 * Math.sin(t), TT.yf, TT.R * 1.05 * Math.cos(t));
    TT.mk.style.transform = `translate3d(${px(x)},${px(y)},0)`;
    TT.mk.style.opacity = (0.4 + 0.6 * (1 + Math.cos(t)) / 2).toFixed(3);
  }
  function ttToggle() {
    if (!TT.sec || !TT.view || !TT.ring) return;
    const want = scrubOn();
    if (want === TT.on) { if (TT.on) ttMeasure(); return; }
    TT.on = want;
    if (want) {
      TT.sec.classList.add('is-tt');
      const ns = 'http://www.w3.org/2000/svg';
      TT.rim = document.createElementNS(ns, 'svg'); TT.rim.setAttribute('class', 'tf__rim'); TT.rim.setAttribute('aria-hidden', 'true');
      TT.rim.appendChild(document.createElementNS(ns, 'path'));
      TT.mk = document.createElementNS(ns, 'svg'); TT.mk.setAttribute('class', 'tf__mk'); TT.mk.setAttribute('viewBox', '-8.5 -8.5 17 17'); TT.mk.setAttribute('aria-hidden', 'true');
      const rp = document.createElementNS(ns, 'path'); rp.setAttribute('d', rosette(8)); TT.mk.appendChild(rp);
      TT.view.insertBefore(TT.mk, TT.ring); TT.view.insertBefore(TT.rim, TT.mk);
      TT.veils = TT.cards.map((c) => {
        const host = $('.dc__card', c) || $('.tf__cta', c) || c;
        const v = document.createElement('i'); v.className = 'tf__veil'; v.setAttribute('aria-hidden', 'true'); host.appendChild(v); return v;
      });
      // a gyűrű kártyái nem mélység-kártyák: a függő felfedést levesszük róluk
      TT.cards.forEach((c) => { const d = $('[data-depth]', c); if (d) { d.style.opacity = ''; d.style.transform = ''; $$('.dc__frame i', d).forEach((i) => { i.style.transform = ''; }); jobs.delete(d); io && io.unobserve(d); } });
      ttMeasure(); TT.q = clamp((scrollY - TT.top) / TT.range); ttRender(TT.q);
      if (below(TT.view)) {
        TT.view.style.opacity = '0';
        when(TT.view, () => {
          play(TT.view, [{ opacity: 0, transform: 'translate3d(0,6vh,0)' }, { opacity: 1, transform: 'none' }], { duration: 1100 });
          TT.view.style.opacity = '';
          play(TT.rim, [{ opacity: 0, transform: 'scaleX(.3)' }, { opacity: 1, transform: 'none' }], { duration: 1200, delay: 300 });
        });
      }
    } else {
      TT.sec.classList.remove('is-tt', 'is-turning'); TT.turning = false; TT.sec.style.removeProperty('--cw'); TT.ring.style.top = '';
      TT.cards.forEach((c) => { c.style.transform = ''; c.style.opacity = ''; c.style.pointerEvents = ''; });
      TT.veils.forEach((v) => v.remove()); TT.veils = [];
      if (TT.rim) TT.rim.remove(); if (TT.mk) TT.mk.remove(); TT.rim = TT.mk = null;
      TT.view.style.opacity = '';
    }
  }
  function rosette(R, n = 120) {
    let d = '';
    for (let i = 0; i <= n; i++) {
      const t = i / n, th = t * 2.5 * 2 * Math.PI, r = R * (1 - 0.8 * t) * (0.82 + 0.18 * Math.cos(8 * th));
      d += (i ? 'L' : 'M') + (r * Math.cos(th - Math.PI / 2)).toFixed(2) + ' ' + (r * Math.sin(th - Math.PI / 2)).toFixed(2);
    }
    return d;
  }

  /* ---------------- Kínálat hover-kép (10.5) ---------------- */
  const RV = { el: null, img: null, on: false, x: 0, y: 0, tx: 0, ty: 0, r: 0, w: 0, h: 0 };
  function rvSetup() {
    const list = $('[data-reveal-list]'); if (!rich || !list) return;
    const rows = $$('[data-reveal-row][data-reveal-src]', list); if (!rows.length) return;
    RV.el = document.createElement('div'); RV.el.className = 'hv-rev'; RV.el.setAttribute('aria-hidden', 'true');
    RV.el.innerHTML = '<div class="hv-rev__i"><img alt="" decoding="async"></div>';
    RV.img = $('img', RV.el); document.body.appendChild(RV.el);
    const place = (e) => { RV.w = 0.22 * vw; RV.h = RV.w * 1.25; RV.tx = Math.min(e.clientX + 32, vw - RV.w - 12); RV.ty = clamp(e.clientY - RV.h - 24, 72, vh - RV.h - 12); };
    rows.forEach((row) => {
      row.addEventListener('pointerenter', (e) => {
        if (e.pointerType !== 'mouse' || !wide()) return;
        const src = row.dataset.revealSrc; if (RV.img.getAttribute('src') !== src) RV.img.src = src;
        place(e); if (!RV.on) { RV.x = RV.tx; RV.y = RV.ty; RV.r = 0; }
        RV.on = true; RV.el.classList.add('on'); kick();
      });
      row.addEventListener('pointermove', (e) => { if (RV.on) { place(e); kick(); } }, { passive: true });
      row.addEventListener('pointerleave', rvOff);
    });
    list.addEventListener('pointerleave', rvOff);
  }
  function rvOff() { if (RV.on) { RV.on = false; RV.el.classList.remove('on'); } }

  /* ---------------- mágneses gombok (10.2) ---------------- */
  const MG = rich ? $$('[data-magnet]').map((el) => ({ el, t: $('.btn__t', el), x: 0, y: 0, tx: 0, ty: 0, cur: '' })) : [];
  function onPointer(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    let any = false;
    MG.forEach((m) => {
      const r = m.el.getBoundingClientRect();
      if (r.bottom < -60 || r.top > vh + 60) { if (m.tx || m.ty) { m.tx = m.ty = 0; any = true; } return; }
      const cx = r.left + r.width / 2 - m.x, cy = r.top + r.height / 2 - m.y, dx = e.clientX - cx, dy = e.clientY - cy;
      const near = Math.abs(dx) < r.width / 2 + 40 && Math.abs(dy) < r.height / 2 + 40;
      const tx = near ? dx * 0.3 : 0, ty = near ? dy * 0.3 : 0;
      if (tx !== m.tx || ty !== m.ty) { m.tx = tx; m.ty = ty; any = true; }
    });
    if (any) kick();
  }
  function mgRender(m, dt) {
    const back = !m.tx && !m.ty, k = 1 - Math.exp(-dt / (back ? 150 : 90));   // vissza ~600 ms
    const dx = m.tx - m.x, dy = m.ty - m.y;
    let moving = true;
    if (Math.abs(dx) > 0.05 || Math.abs(dy) > 0.05) { m.x += dx * k; m.y += dy * k; } else { m.x = m.tx; m.y = m.ty; moving = false; }
    const tf = m.x || m.y ? `translate3d(${px(m.x)},${px(m.y)},0)` : '';
    if (tf !== m.cur) {
      m.cur = tf; m.el.style.transform = tf; m.el.style.willChange = tf ? 'transform' : '';
      if (m.t) m.t.style.transform = tf ? `translate3d(${px(clamp(m.x * 0.5, -6, 6))},${px(clamp(m.y * 0.5, -4, 4))},0)` : '';
    }
    return moving;
  }

  /* ---------------- Látogatás: térkép-rajz, lábléc: rozetta ---------------- */
  // Látogatás: a vonal a varratból a fotó fölé fut és rozettában áll meg (a fotó maga mélység-kártya)
  function visitLine() {
    const sec = $('#latogatas'), path = seg('latogatas', 'map');
    if (!sec || !path || !below(sec)) return;
    lineHide(path, 'dash');
    when(sec, () => lineDraw(path, 'dash', { delay: 300, duration: clamp(pathLen(path) * 0.7, 900, 1800) }));
  }
  const FT = { el: $('[data-curtain]'), path: seg('footer', 'foot'), pending: false };
  const mainEl = $('main');
  function ftSetup() {
    if (!FT.el || !FT.path || !mainEl) return;
    if (scrollY + vh - (absTop(mainEl) + mainEl.offsetHeight) > 40) return;
    FT.pending = true; lineHide(FT.path, 'dash');
  }
  let ftFar = null;
  function ftCheck() {
    if (FT.el && mainEl) {
      const far = scrollY + vh < absTop(mainEl) + mainEl.offsetHeight - 40;
      if (far !== ftFar) { ftFar = far; FT.el.classList.toggle('ft-far', far); }
    }
    if (!FT.pending) return;
    if (scrollY + vh - (absTop(mainEl) + mainEl.offsetHeight) > Math.min(180, FT.el.offsetHeight * 0.3)) {
      FT.pending = false; lineDraw(FT.path, 'dash', { duration: 1500, easing: EDRAW });
    }
  }

  /* ---------------- menüfólia (telefon/tablet) ---------------- */
  document.addEventListener('hv:menu', (e) => {
    if (!e.detail || !e.detail.open || wide()) return;
    $$('.hd__menu a').forEach((a, i) => play(a, [{ transform: 'translateY(110%) rotate(2.5deg)' }, { transform: 'none' }], { duration: 700, delay: 60 + i * 70 }));
    $$('.hd__nav .lang, .hd__nav .open').forEach((el) => play(el, [{ opacity: 0 }, { opacity: 1 }], { duration: 400, delay: 300, easing: EDRAW }));
  });

  /* ---------------- egy közös képkocka-ciklus ---------------- */
  let raf = 0, last = 0, lastY = -1;
  function kick() { if (!raf) raf = requestAnimationFrame(tick); }
  function tick(t) {
    raf = 0;
    const dt = last ? Math.min(64, t - last) : 16.7; last = t;
    const k = 1 - Math.exp(-dt / 110), y = scrollY, yChanged = y !== lastY;
    lastY = y;
    let moving = false;

    // hero kilépés, ha nincs élő 3D (a 3D-t a hv:hero-exit viszi)
    if (hero && introDone && !(HV && HV.hero)) {
      if (rich) {
        const tp = clamp((y - H.top) / Math.max(1, H.h - 0.35 * vh));
        if (Math.abs(tp - H.p) > 1e-4) { H.p += (tp - H.p) * k; moving = true; } else H.p = tp;
      } else if (H.film) {
        const f = clamp((t - H.film.t) / H.film.d), e = f < 0.5 ? 2 * f * f : 1 - Math.pow(-2 * f + 2, 2) / 2;
        H.p = H.film.from + (H.film.to - H.film.from) * e;
        if (f >= 1) H.film = null; else moving = true;
      }
      applyHeroP(H.p);
    }
    // tortaréteg (asztal, scrub)
    if (scrubOn()) FL.forEach((o) => {
      const te = clamp((y + vh - o.top) / (0.65 * vh)), tx = clamp((y + 0.7 * vh - (o.top + o.h)) / (0.7 * vh));
      if (Math.abs(te - o.e) > 5e-4) { o.e += (te - o.e) * k; moving = true; } else o.e = te;
      if (Math.abs(tx - o.x) > 5e-4) { o.x += (tx - o.x) * k; moving = true; } else o.x = tx;
      flowApply(o);
    });
    // tortaforgó
    if (TT.on && y + vh > TT.top - 200 && y < TT.top + TT.range + vh + 200) {
      const tq = clamp((y - TT.top) / TT.range);
      const turning = Math.abs(tq - TT.q) > 2e-4;
      if (turning) { TT.q += (tq - TT.q) * k; moving = true; } else TT.q = tq;
      if (turning !== TT.turning) { TT.turning = turning; TT.sec.classList.toggle('is-turning', turning); }   // nyugalomban újra-raszterez: éles szöveg
      ttRender(TT.q);
    }
    // mélység-kártyák: egér-dőlés + belső parallax (csak .rich)
    if (rich) {
      const kc = 1 - Math.exp(-dt / 120);
      DC.forEach((o) => {
        if (o.ring && TT.on) return;
        if (!o.on && !o.cur && !yChanged && !o.dirty) return;
        if (o.top > y + vh + 200 || o.top + o.h < y - 200) return;
        o.dirty = false;
        if (dcRender(o, kc, y)) moving = true;
      });
    }
    // hover-kép
    if (RV.el && (RV.on || RV.el.classList.contains('on'))) {
      const kr = 1 - Math.pow(1 - 0.14, dt / 16.7), ox = RV.x;
      RV.x += (RV.tx - RV.x) * kr; RV.y += (RV.ty - RV.y) * kr;
      RV.r += (clamp((RV.tx - RV.x) * 0.04, -6, 6) - RV.r) * kr;
      if (Math.abs(RV.tx - RV.x) > 0.3 || Math.abs(RV.ty - RV.y) > 0.3 || Math.abs(RV.r) > 0.05 || Math.abs(RV.x - ox) > 0.05) moving = true;
      RV.el.style.transform = `translate3d(${px(RV.x)},${px(RV.y)},0) rotate(${RV.r.toFixed(2)}deg)`;
    }
    MG.forEach((m) => { if (mgRender(m, dt)) moving = true; });

    if (moving) kick(); else last = 0;
  }

  function onScroll() {
    rvOff();
    ftCheck();
    if (hero && introDone && !(HV && HV.hero) && touch) {
      const y = scrollY, end = H.film ? H.film.to : H.p;
      if (y > 0.15 * vh && end < 1) H.film = { t: performance.now(), d: 1100, from: H.p, to: 1 };
      else if (y < 40 && end > 0) H.film = { t: performance.now(), d: 800, from: H.p, to: 0 };
    }
    kick();
  }

  /* ---------------- mérés ---------------- */
  function measure() {
    vw = innerWidth; vh = innerHeight;
    flowSet();
    ttToggle();
    FL.forEach((o) => { o.top = absTop(o.el); o.h = o.el.offsetHeight; o.cur = '_'; });
    DC.forEach((o) => { o.top = absTop(o.el); o.h = o.el.offsetHeight; o.dirty = true; o.icur = ''; });
    if (hero) { H.top = absTop(hero); H.h = hero.offsetHeight; }
    ftCheck();
    kick();
  }

  /* ---------------- indulás ---------------- */
  const fontsP = document.fonts
    ? Promise.race([Promise.all([
      document.fonts.load('200 120px "Noto Serif Display"'), document.fonts.load('300 40px "Noto Serif Display"'),
      document.fonts.load('400 16px "Hanken Grotesk"'), document.fonts.load('500 13px "Hanken Grotesk"')]).catch(() => {}), sleep(2600)])
    : Promise.resolve();
  if (segN) { segN.style.strokeDasharray = '1 1.02'; }

  // a hero a betűk után bomlik sorokra és indul; a többi elem rejtett állapota is a betűk után (a hajtás alatt, nem látszik)
  fontsP.then(() => {
    LN.forEach(splitOne);
    splitReady = true;
    measure();
    // függő (hajtás alatti) felfedések
    LN.forEach((o) => {
      if (hero && hero.contains(o.el)) return;
      if (!below(o.el)) { o.state = 'done'; return; }
      lnHide(o);
      when(o.el, () => lnReveal(o));
    });
    if (!scrubOn()) FL.forEach(flowOnce);
    $$('section[data-wipe]').forEach(wipeSetup);
    DC.forEach(dcOnce);
    // Kínálat: sor-aláhúzás + név, 120 ms lépcső
    $$('.idx__row').forEach((row) => {
      const p = $(`svg.pl[data-line="kinalat"] path[data-seg="row"][data-row="${row.dataset.row}"]`), nm = $('.idx__name', row);
      if (!below(row)) return;
      lineHide(p, 'x'); if (nm) { nm.style.opacity = '0'; nm.style.transform = 'translate3d(0,28px,0)'; }
      when(row, () => {
        const d = slot('row', 120);
        if (nm) { play(nm, [{ opacity: 0, transform: 'translate3d(0,28px,0)' }, { opacity: 1, transform: 'none' }], { duration: 900, delay: d }); nm.style.opacity = ''; nm.style.transform = ''; }
        lineDraw(p, 'x', { delay: d + 80, duration: 900 });
      });
    });
    // Alkotások: varrat (nincs tortaréteg-átmenete) + egyenes vonal a szalag alatt
    if (TT.sec) {
      const sm = $('svg.pl path[data-seg="seam"]', TT.sec), sp = $('svg.pl path[data-seg="strip"]', TT.sec);
      if (below(TT.sec)) { lineHide(sm, 'x'); when(TT.sec, () => lineDraw(sm, 'x', { duration: 900 })); }
      if (TT.view && !TT.on && below(TT.view)) { lineHide(sp, 'x'); when(TT.view, () => lineDraw(sp, 'x', { delay: 300, duration: 900 })); }
    }
    visitLine();
    ftSetup();
    rvSetup();
    if (rich) DC.forEach((o) => {
      o.el.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'mouse' || (o.ring && TT.on)) return; o.on = true; o.tz = 12; o.el.classList.add('is-hover'); o.card.style.willChange = 'transform'; kick(); });
      o.el.addEventListener('pointermove', (e) => {
        if (!o.on) return;
        const r = o.el.getBoundingClientRect(), nx = clamp((e.clientX - r.left) / r.width, 0, 1) * 2 - 1, ny = clamp((e.clientY - r.top) / r.height, 0, 1) * 2 - 1;
        o.ty = nx * 7; o.tx = -ny * 7; kick();
      }, { passive: true });
      o.el.addEventListener('pointerleave', () => { o.on = false; o.tx = o.ty = o.tz = 0; o.el.classList.remove('is-hover'); kick(); });
    });
    if (MG.length) document.addEventListener('pointermove', onPointer, { passive: true });
    addEventListener('scroll', onScroll, { passive: true });
    kick();
  });
  runIntro(fontsP).catch((err) => { console.warn('[motion] intro', err && err.message); endIntro(); });
  // biztonsági háló: ha valami elakadna, 6 s után semmi nem marad rejtve
  setTimeout(() => { if (root.classList.contains('intro-on')) endIntro(); }, 6000);

  // átméretezés: csak szélességváltásra vagy 160 px feletti magasságváltásra (web-motion-lessons)
  let mw = innerWidth, mh = innerHeight;
  addEventListener('resize', () => {
    const w = innerWidth, h = innerHeight;
    if (w === mw && Math.abs(h - mh) < 160) return;
    const wc = w !== mw; mw = w; mh = h;
    lines.holdOpen = performance.now() + 800;
    if (wc) resplit();
    measure();
  });
  document.addEventListener('hv:lines', () => { if (TT.on) ttMeasure(); measure(); });
  addEventListener('load', measure);
  if (document.fonts) document.fonts.addEventListener('loadingdone', () => { resplit(); measure(); });
}
