// HabVero v3 mozgás (2026-11-02): rugós, játékos, de fegyelmezett.
// Szabályok: csak transform/opacity animál; egyetlen rAF ciklus, ami csak akkor fut, ha valami mozog;
// görgetéshez kötött mozgás csak .rich-en (egér + valódi GPU); érintésen időzített egyszeri mozgás; .still = kész állapot.

const R = document.documentElement;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
const RICH = R.classList.contains('rich');
const TOUCH = R.classList.contains('touch');
const STILL = !RICH && !TOUCH;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);

/* ---------- rugó-görbe CSS linear()-ként (minden 2024 utáni böngésző), különben cubic-bezier ---------- */
function spring(k, c) {
  let x = 0, v = 0, t = 0; const pts = [], dt = 1 / 240;
  while (t < 3) {
    for (let i = 0; i < 4; i++) { const a = -k * (x - 1) - c * v; v += a * dt; x += v * dt; t += dt; }
    pts.push(x);
    if (t > .3 && Math.abs(x - 1) < .002 && Math.abs(v) < .02) break;
  }
  const n = pts.length, step = Math.max(1, Math.round(n / 48));
  const out = ['0'];
  for (let i = step; i < n - 1; i += step) out.push(+pts[i].toFixed(4));
  out.push('1');
  return { e: `linear(${out.join(',')})`, d: Math.round(t * 1000) };
}
const LIN = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timing-function', 'linear(0, 1)');
const BOUNCY = LIN ? spring(190, 11) : { e: 'cubic-bezier(.34,1.56,.64,1)', d: 760 };
const SOFT = LIN ? spring(130, 17) : { e: 'cubic-bezier(.22,1.2,.36,1)', d: 820 };
const OUT = 'cubic-bezier(.16,1,.3,1)';

function anim(el, kf, o) {
  if (!el || !el.animate) return null;
  return el.animate(kf, Object.assign({ fill: 'backwards', easing: BOUNCY.e, duration: BOUNCY.d }, o));
}

/* ---------- egyetlen rAF ciklus ---------- */
const tasks = new Set();
let raf = 0, last = 0;
function kick() { if (!raf) raf = requestAnimationFrame(frame); }
function add(fn) { tasks.add(fn); kick(); }
function frame(t) {
  raf = 0;
  const dt = last ? Math.min(.05, (t - last) / 1000) : 1 / 60; last = t;
  for (const f of [...tasks]) if (!f(t, dt)) tasks.delete(f);
  if (tasks.size) raf = requestAnimationFrame(frame); else last = 0;
}

/* ---------- görgetés-állapot ---------- */
const S = { y: scrollY, v: 0, vh: innerHeight, vw: innerWidth, nav: 64 };
let lenis = null;
const scrollers = new Set();          // görgetéskor futó függvények
function onScrollTask(t, dt) {
  const y = lenis ? lenis.animatedScroll : scrollY;
  const inst = (y - S.y) / Math.max(dt, 1 / 120);
  S.v += (inst - S.v) * (1 - Math.exp(-dt / .12));
  S.y = y;
  let alive = Math.abs(S.v) > 4 || !!(lenis && lenis.isScrolling);
  for (const f of scrollers) if (f(dt)) alive = true;
  if (!alive) S.v = 0;
  return alive;
}
function scrollKick() { add(onScrollTask); }

/* ---------- címek szétbontása szóra és betűre (a felolvasó a rejtett egész szöveget kapja) ---------- */
function split(el) {
  if (el.dataset.split) return $$('.c', el);
  el.dataset.split = '1';
  const label = el.textContent.replace(/\s+/g, ' ').trim();
  const sr = document.createElement('span'); sr.className = 'sr'; sr.textContent = label;
  const vis = document.createElement('span'); vis.setAttribute('aria-hidden', 'true');
  const walk = (node, into) => {
    for (const n of [...node.childNodes]) {
      if (n.nodeType === 3) {
        for (const part of n.textContent.split(/([ \n\t]+)/)) {
          if (!part) continue;
          if (/^[ \n\t]+$/.test(part)) { into.appendChild(document.createTextNode(' ')); continue; }
          const w = document.createElement('span'); w.className = 'w';
          for (const ch of Array.from(part)) { const c = document.createElement('span'); c.className = 'c'; c.textContent = ch; w.appendChild(c); }
          into.appendChild(w);
        }
      } else if (n.nodeType === 1) {
        const cl = n.cloneNode(false); walk(n, cl); into.appendChild(cl);
      }
    }
  };
  walk(el, vis);
  el.textContent = ''; el.append(sr, vis);
  return $$('.c', vis);
}
function popLetters(el, delay = 0, gap = 26) {
  const cs = split(el);
  cs.forEach((c, i) => anim(c, [
    { transform: `translateY(.55em) scale(.2) rotate(${rnd(-24, 24).toFixed(1)}deg)`, opacity: 0 },
    { transform: 'none', opacity: 1 }], { delay: delay + i * gap }));
}
function rise(el, delay = 0, dist = 34) {
  anim(el, [{ transform: `translateY(${dist}px)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { delay, easing: SOFT.e, duration: SOFT.d });
}
function popIn(el, delay = 0, rot = 0) {
  anim(el, [{ transform: `scale(0) rotate(${rot}deg)`, opacity: 0 }, { transform: 'none', opacity: 1 }], { delay });
}

/* ---------- belépők: csak a hajtás alatti elemek rejtve, belépéskor egyszer játszanak ---------- */
const enter = new Map();
let io = null;
function onEnter(el, fn, margin) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  if (r.top < S.vh * .92 && r.bottom > 0) { fn(true); return; }   // már látszik (pl. középről újratöltve)
  if (r.bottom <= 0) return;                                       // fölöttünk van: kész állapot
  enter.set(el, fn);
  el.classList.add('is-pre');
  if (!io) io = new IntersectionObserver((es) => {
    for (const e of es) if (e.isIntersecting) {
      const f = enter.get(e.target); enter.delete(e.target); io.unobserve(e.target);
      e.target.classList.remove('is-pre'); f && f(false);
    }
  }, { rootMargin: margin || '0px 0px -14% 0px' });
  io.observe(el);
}
// gyors ugrás (horgony, Home/End) után a fölöttünk maradt, soha nem látott elemek azonnal kész állapotba kerülnek
let passT = 0;
function passCheck() {
  if (!enter.size || passT) return;
  passT = setTimeout(() => {
    passT = 0;
    for (const [el] of enter) {
      if (el.getBoundingClientRect().bottom < 0) { enter.delete(el); io && io.unobserve(el); el.classList.remove('is-pre'); }
    }
  }, 120);
}

/* ================================================================ függöny intro + hero */
let sprinkleBurst = null;
function hero() {
  const h1 = $('.hero__h1');
  const curtain = $('[data-curtain-intro]');
  if (!h1) { if (curtain) curtain.hidden = true; return; }
  const intro = R.classList.contains('intro-on') && curtain && !STILL;
  const items = $$('.hero [data-rise]');
  const stk = $$('.hero .stk');
  const arch = $('.hero .arch'), badge = $('.badge');
  const base = intro ? 1080 : 80;

  if (intro) {
    R.classList.add('intro-started'); clearTimeout(window.__hvIntroFallback);
    curtain.classList.add('is-run');
    R.classList.remove('intro-on');
    $$('.ch', curtain).forEach((c, i) => anim(c, [
      { transform: `translateY(60%) scale(.2) rotate(${i % 2 ? 14 : -14}deg)`, opacity: 0 },
      { transform: 'none', opacity: 1 }], { delay: 60 + i * 62 }));
    anim($('.curtain__mk', curtain), [{ transform: 'none' }, { transform: 'scale(1.06) translateY(-4%)' }],
      { delay: 860, duration: 300, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
    const up = curtain.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(calc(-100% - 140px))' }],
      { delay: 1000, duration: 980, easing: 'cubic-bezier(.76,0,.24,1)', fill: 'forwards' });
    anim($('.drip', curtain), [{ transform: 'scaleY(1)' }, { transform: 'scaleY(2.1)', offset: .45 }, { transform: 'scaleY(.6)' }],
      { delay: 1000, duration: 980, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' });
    up.onfinish = () => { curtain.hidden = true; curtain.classList.remove('is-run'); };
    anim($('.hd'), [{ transform: 'translateY(-110%)' }, { transform: 'none' }], { delay: base + 300, easing: SOFT.e, duration: SOFT.d });
    setTimeout(() => sprinkleBurst && sprinkleBurst(), 1250);
  } else {
    if (curtain) curtain.hidden = true;
    if (STILL || location.hash || scrollY > 40) return;            // ugrásnál és állóképnél nincs belépő
  }
  popLetters(h1, base, 34);
  items.forEach((el, i) => rise(el, base + 380 + i * 110));
  if (arch) anim(arch, [{ transform: 'translateY(40px) scale(.86) rotate(-5deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { delay: base + 140, easing: SOFT.e, duration: SOFT.d });
  stk.forEach((s, i) => popIn(s, base + 520 + i * 120, i % 2 ? 30 : -30));
  if (badge) popIn(badge, base + 700, -90);
}

/* ---------- színes cukorszórás a hero mögött (canvas 2D, csak ha látszik) ---------- */
function sprinkles() {
  const cv = $('[data-sprinkles]'); if (!cv || !cv.getContext) return;
  const ctx = cv.getContext('2d');
  const COLS = ['#F7B7C8', '#E0668A', '#FFD86B', '#8FD6B4', '#BBA3EE', '#8EC3F5'];
  const N = RICH ? 64 : 30;
  let W = 0, H = 0, dpr = 1, vis = true, mx = -999, my = -999;
  const P = [];
  const size = () => {
    W = cv.clientWidth; H = cv.clientHeight; dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
  };
  size();
  for (let i = 0; i < N; i++) P.push({
    x: rnd(0, W), y: rnd(0, H), vx: 0, vy: 0, a: rnd(0, 6.28), va: rnd(-1, 1),
    l: rnd(9, 17), c: i % COLS.length, dot: Math.random() < .22, fall: rnd(10, 26), ph: rnd(0, 6.28),
  });
  const draw = () => {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.lineCap = 'round'; ctx.lineWidth = 5;
    for (let c = 0; c < COLS.length; c++) {
      ctx.strokeStyle = ctx.fillStyle = COLS[c];
      ctx.beginPath();
      for (const p of P) {
        if (p.c !== c || p.dot) continue;
        const dx = Math.cos(p.a) * p.l / 2, dy = Math.sin(p.a) * p.l / 2;
        ctx.moveTo(p.x - dx, p.y - dy); ctx.lineTo(p.x + dx, p.y + dy);
      }
      ctx.stroke();
      ctx.beginPath();
      for (const p of P) if (p.c === c && p.dot) { ctx.moveTo(p.x + 4, p.y); ctx.arc(p.x, p.y, 4, 0, 6.283); }
      ctx.fill();
    }
  };
  if (STILL) { draw(); return; }
  let tt = 0;
  const step = (t, dt) => {
    if (!vis || document.hidden) return false;
    tt += dt;
    const fr = Math.exp(-dt * 1.6);
    for (const p of P) {
      if (RICH && mx > -900) {
        const dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy;
        if (d2 < 16000) { const d = Math.sqrt(d2) || 1, f = (1 - d / 126) * 900 * dt; p.vx += dx / d * f; p.vy += dy / d * f; p.va += f * .02; }
      }
      p.vx *= fr; p.vy *= fr; p.va = p.va * Math.exp(-dt * .4) + (Math.sign(p.va) || 1) * .02 * dt;
      p.x += (p.vx + Math.sin(tt * .8 + p.ph) * 6) * dt;
      p.y += (p.vy + p.fall) * dt;
      p.a += p.va * dt;
      if (p.y > H + 20) { p.y = -20; p.x = rnd(0, W); p.vx = p.vy = 0; }
      if (p.x < -30) p.x = W + 20; else if (p.x > W + 30) p.x = -20;
    }
    draw();
    return true;
  };
  sprinkleBurst = () => {
    const cx = W * (W > 1000 ? .7 : .5), cy = H * .42;
    for (const p of P) { p.x = cx + rnd(-30, 30); p.y = cy + rnd(-30, 30); const a = rnd(0, 6.28), s = rnd(260, 900); p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s - 120; p.va = rnd(-8, 8); }
    add(step);
  };
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; if (vis) add(step); }).observe(cv);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && vis) add(step); });
  if (RICH) {
    const host = cv.parentElement;
    host.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; }, { passive: true });
    host.addEventListener('pointerleave', () => { mx = my = -999; });
  }
  let lw = innerWidth;
  addEventListener('resize', () => { if (Math.abs(innerWidth - lw) > 2 || Math.abs(cv.clientHeight - H) > 160) { lw = innerWidth; size(); draw(); } });
  draw();
}

/* ---------- matricák: egér- és görgetés-parallax (csak .rich) ---------- */
function stickerParallax() {
  if (!RICH) return;
  const els = $$('.stk[data-depth]').map((el) => ({ el, d: +el.dataset.depth || .5, top: 0, x: 0, y: 0, inHero: !!el.closest('.hero') }));
  let mx = 0, my = 0;
  const measure = () => { for (const s of els) { let t = 0, n = s.el; while (n) { t += n.offsetTop; n = n.offsetParent; } s.top = t + s.el.offsetHeight / 2; } };
  measure(); addEventListener('load', measure); addEventListener('hv:measure', measure);
  const upd = (dt) => {
    let alive = false;
    const k = 1 - Math.exp(-dt / .14);
    for (const s of els) {
      const rel = s.top - S.y - S.vh / 2;
      if (rel < -S.vh * 1.4 || rel > S.vh * 1.4) continue;
      const tx = s.inHero ? mx * s.d * 22 : 0;
      const ty = (s.inHero ? my * s.d * 16 : 0) - rel * s.d * .09;
      s.x += (tx - s.x) * k; s.y += (ty - s.y) * k;
      if (Math.abs(tx - s.x) + Math.abs(ty - s.y) > .2) alive = true;
      s.el.style.transform = `translate3d(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px,0)`;
    }
    return alive;
  };
  scrollers.add(upd);
  addEventListener('pointermove', (e) => { if (S.y > S.vh * 1.2 || e.pointerType !== 'mouse') return; mx = e.clientX / S.vw * 2 - 1; my = e.clientY / S.vh * 2 - 1; scrollKick(); }, { passive: true });
}

/* ---------- keresztbe tett márka-szalagok: görgetés-sebességre gyorsulnak (csak .rich; érintésen CSS) ---------- */
function tapes() {
  if (!RICH) return;
  const tr = $$('[data-tape]').map((el) => ({ el, dir: +el.dataset.tape, x: 0, w: 0 }));
  if (!tr.length) return;
  const measure = () => tr.forEach((t) => { t.w = t.el.firstElementChild.offsetWidth; });
  measure(); addEventListener('load', measure); addEventListener('hv:measure', measure);
  let vis = false, boost = 0, dir = 1;
  const step = (t, dt) => {
    if (!vis) return false;
    if (Math.abs(S.v) > 30) dir = S.v < 0 ? -1 : 1;
    const target = Math.min(Math.abs(S.v) * .35, 900);
    boost += (target - boost) * (1 - Math.exp(-dt / .25));
    for (const t2 of tr) {
      t2.x -= t2.dir * dir * (46 + boost) * dt;
      if (t2.w) { t2.x %= t2.w; if (t2.x > 0) t2.x -= t2.w; }
      t2.el.style.transform = `translate3d(${t2.x.toFixed(2)}px,0,0)`;
    }
    return true;
  };
  new IntersectionObserver(([e]) => { vis = e.isIntersecting; if (vis) add(step); }).observe($('[data-tapes]'));
}

/* ---------- befőttesüveg: a kategória-címkék beleesnek (matter.js, lustán töltve) ---------- */
function loadScript(src) {
  return new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.async = true; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
}
function jar() {
  const jarEl = $('[data-jar]'); if (!jarEl || STILL) return;
  const pills = $$('[data-pill]', jarEl);
  let M = null, started = false, want = false;
  const unhide = () => pills.forEach((p) => p.classList.remove('is-wait'));
  pills.forEach((p) => p.classList.add('is-wait'));                  // üres üveg, amíg a címkék be nem esnek
  const pre = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return; pre.disconnect();
    loadScript('/js/vendor/matter.min.js?v=6').then(() => { M = window.Matter; if (!M) unhide(); else if (want) start(); }).catch(unhide);
  }, { rootMargin: '700px 0px' });
  pre.observe(jarEl);
  const go = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return; go.disconnect(); want = true; if (M) start();
  }, { threshold: .3 });
  go.observe(jarEl);

  let engine, bodies = [], vis = true, drag = false, dropping = false, acc = 0, mouse = null, mc = null;
  const st = { isStatic: true, friction: .5, restitution: .2 };
  function hookMouse() {
    if (!mouse) return;
    mc = M.MouseConstraint.create(engine, { mouse, constraint: { stiffness: .18, damping: .1, render: { visible: false } } });
    M.Composite.add(engine.world, mc);
    M.Events.on(mc, 'startdrag', () => { drag = true; add(step); });
    M.Events.on(mc, 'enddrag', () => { drag = false; add(step); });
  }
  function build(animated) {
    const { Engine, Bodies, Composite } = M;
    jarEl.classList.remove('is-phys');
    pills.forEach((p) => { p.style.transform = ''; });
    const dims = pills.map((p) => [p.offsetWidth, p.offsetHeight]);
    const W = jarEl.clientWidth, H = jarEl.clientHeight;
    jarEl.classList.add('is-phys');
    engine = Engine.create({ enableSleeping: true });
    engine.gravity.y = 1.15;
    Composite.add(engine.world, [
      Bodies.rectangle(W / 2, H + 30, W * 2, 60, st),
      Bodies.rectangle(-30, H / 2 - H, 60, H * 4, st),
      Bodies.rectangle(W + 30, H / 2 - H, 60, H * 4, st),
      Bodies.rectangle(14, H - 14, 120, 40, Object.assign({ angle: Math.PI / 4 }, st)),
      Bodies.rectangle(W - 14, H - 14, 120, 40, Object.assign({ angle: -Math.PI / 4 }, st)),
    ]);
    bodies = pills.map((p, i) => {
      const [w, h] = dims[i];
      const x = clamp(rnd(w / 2 + 8, W - w / 2 - 8), w / 2, W - w / 2);
      const y = animated ? -h - 10 : H - 60 - (i % 6) * (h + 4) - Math.floor(i / 6) * 8;
      const b = Bodies.rectangle(x, y, w, h, { chamfer: { radius: h / 2 - 1 }, restitution: .38, friction: .35, frictionAir: .014, density: .0018, angle: rnd(-.5, .5) });
      b.plugin = { el: p, w, h };
      return b;
    });
    const lid = () => Composite.add(engine.world, Bodies.rectangle(W / 2, -34, W * 2, 60, st));   // fedő: a dobott címke bent marad
    if (animated) {
      dropping = true;
      jarEl.classList.add('is-open');
      pills.forEach((p) => p.classList.add('is-wait'));
      bodies.forEach((b, i) => setTimeout(() => {
        Composite.add(engine.world, b); b.plugin.el.classList.remove('is-wait'); add(step);
        if (i === bodies.length - 1) setTimeout(() => { jarEl.classList.remove('is-open'); dropping = false; lid(); }, 900);
      }, 260 + i * 130));
    } else { Composite.add(engine.world, bodies); lid(); }
    hookMouse();
    render(); add(step);
  }
  function render() {
    for (const b of bodies) {
      const { el, w, h } = b.plugin;
      el.style.transform = `translate3d(${(b.position.x - w / 2).toFixed(1)}px,${(b.position.y - h / 2).toFixed(1)}px,0) rotate(${b.angle.toFixed(3)}rad)`;
    }
  }
  function step(t, dt) {
    if (!vis && !drag) return false;
    acc += dt;
    let n = 0;
    while (acc > 1 / 60 && n < 4) { M.Engine.update(engine, 1000 / 60); acc -= 1 / 60; n++; }
    if (n === 4) acc = 0;
    render();
    const live = engine.world.bodies;
    return drag || dropping || bodies.some((b) => !b.isSleeping && live.includes(b));
  }
  function start() {
    if (started) return; started = true;
    if (RICH) {
      mouse = M.Mouse.create(jarEl);
      for (const [ev, fn] of [['mousemove', mouse.mousemove], ['mousedown', mouse.mousedown], ['mouseup', mouse.mouseup], ['wheel', mouse.mousewheel],
        ['touchmove', mouse.mousemove], ['touchstart', mouse.mousedown], ['touchend', mouse.mouseup]]) jarEl.removeEventListener(ev, fn);
      jarEl.addEventListener('mousedown', (e) => { mouse.mousedown(e); add(step); });
      addEventListener('mousemove', (e) => { if (drag || (e.target.closest && e.target.closest('[data-jar]'))) mouse.mousemove(e); }, { passive: true });
      addEventListener('mouseup', (e) => mouse.mouseup(e));
    }
    build(true);
    new IntersectionObserver(([e]) => { vis = e.isIntersecting; if (vis) add(step); }).observe(jarEl);
    // koppintás / kattintás egy címkére: felpattan
    jarEl.addEventListener('click', (e) => {
      const p = e.target.closest('[data-pill]'); if (!p) return;
      const b = bodies.find((x) => x.plugin.el === p); if (!b) return;
      M.Sleeping.set(b, false);
      M.Body.setVelocity(b, { x: rnd(-5, 5), y: rnd(-15, -11) });
      M.Body.setAngularVelocity(b, rnd(-.25, .25));
      add(step);
    });
    let lw = innerWidth;
    addEventListener('resize', () => {
      if (Math.abs(innerWidth - lw) < 3) return; lw = innerWidth;
      M.Engine.clear(engine); M.Composite.clear(engine.world, false);
      dropping = false; jarEl.classList.remove('is-open'); pills.forEach((p) => p.classList.remove('is-wait'));
      build(false);
    });
  }
}

/* ---------- kínálat: egymásra csúszó kártyák, az előző hátrébb lép (csak .rich, ha sticky) ---------- */
function stack() {
  const cards = $$('[data-kc]'); if (!cards.length) return;
  cards.forEach((li) => {
    const inn = $('.kc__in', li);
    const sh = document.createElement('i'); sh.className = 'kc__shade'; sh.setAttribute('aria-hidden', 'true'); inn.appendChild(sh);
    onEnter(inn, (now) => {
      if (now) return;
      rise(inn, 0, 70);
      $$('.kc__th', li).forEach((t, i) => popIn(t, 260 + i * 110, i % 2 ? 12 : -12));
      const s = $('.kc__stk', li); if (s) popIn(s, 420, 40);
      const img = $('.kc__main img', li); if (img) anim(img, [{ transform: 'scale(1.18)' }, { transform: 'none' }], { duration: 1400, easing: OUT });
    }, '0px 0px -8% 0px');
  });
  if (!RICH) return;
  const ol = cards[0].parentElement;
  const st = cards.map((li) => ({ li, inn: $('.kc__in', li), sh: $('.kc__shade', li), a: 0, b: 1, p: 0 }));
  let on = false;
  const measure = () => {
    on = getComputedStyle(cards[0]).position === 'sticky';
    if (!on) { st.forEach((s) => { s.inn.style.transform = ''; s.sh.style.opacity = ''; s.p = 0; }); return; }
    let top = 0, n = ol; while (n) { top += n.offsetTop; n = n.offsetParent; }
    let acc = top;
    const nat = cards.map((li) => { const t = acc; acc += li.offsetHeight; return t; });
    st.forEach((s, i) => {
      if (i === st.length - 1) return;
      const stickyTop = S.nav + 22 + (i + 1) * 18;
      s.b = nat[i + 1] - stickyTop; s.a = s.b - S.vh * .75;
    });
  };
  measure(); addEventListener('load', measure); addEventListener('hv:measure', measure);
  scrollers.add((dt) => {
    if (!on) return false;
    let alive = false;
    st.forEach((s, i) => {
      if (i === st.length - 1) return;
      const target = clamp((S.y - s.a) / (s.b - s.a), 0, 1);
      s.p += (target - s.p) * (1 - Math.exp(-dt / .11));
      if (Math.abs(target - s.p) > .001) alive = true;
      s.inn.style.transform = `translateY(${(-s.p * 14).toFixed(2)}px) scale(${(1 - s.p * .07).toFixed(4)})`;
      s.sh.style.opacity = (s.p * .16).toFixed(3);
    });
    return alive;
  });
}

/* ---------- polaroidok: leesnek az asztalra; asztali gépen dobálhatók, érintésen koppintásra megbillennek ---------- */
function pile() {
  const ul = $('[data-pile]'); if (!ul) return;
  const pols = $$('[data-pol]', ul);
  onEnter(ul, (now) => {
    if (now) return;
    pols.forEach((p, i) => anim(p, [
      { transform: `translateY(-160px) rotate(${rnd(-24, 24).toFixed(1)}deg) scale(1.15)`, opacity: 0 },
      { transform: 'none', opacity: 1 }], { delay: 120 + i * 120, easing: SOFT.e, duration: SOFT.d }));
  }, '0px 0px -20% 0px');
  if (STILL) return;
  const wiggle = (p) => anim(p, [{ transform: 'none' }, { transform: 'rotate(-7deg) scale(1.05)' }, { transform: 'rotate(5deg) scale(1.03)' }, { transform: 'none' }],
    { duration: 520, easing: 'ease-out', fill: 'none', composite: 'add' });
  let z = 10;
  const canDrag = () => RICH && innerWidth >= 900;
  pols.forEach((p) => {
    const s = { x: 0, y: 0, vx: 0, vy: 0, r: 0, down: false, moved: false, px: 0, py: 0, t: 0 };
    p.addEventListener('pointerdown', (e) => {
      if (e.target.closest('a') || !canDrag() || e.pointerType !== 'mouse') return;
      s.down = true; s.moved = false; s.px = e.clientX; s.py = e.clientY; s.t = performance.now(); s.vx = s.vy = 0;
      p.setPointerCapture(e.pointerId); p.style.zIndex = ++z; p.classList.add('is-drag');
      e.preventDefault();
    });
    p.addEventListener('pointermove', (e) => {
      if (!s.down) return;
      const now = performance.now(), dt = Math.max(1, now - s.t) / 1000;
      const dx = e.clientX - s.px, dy = e.clientY - s.py;
      if (Math.abs(dx) + Math.abs(dy) > 3) s.moved = true;
      s.x += dx; s.y += dy; s.vx = s.vx * .5 + dx / dt * .5; s.vy = s.vy * .5 + dy / dt * .5; s.px = e.clientX; s.py = e.clientY; s.t = now;
      s.r = clamp(s.vx * .01, -14, 14);
      p.style.transform = `translate3d(${s.x}px,${s.y}px,0) rotate(${s.r.toFixed(2)}deg) scale(1.04)`;
    });
    const up = () => {
      if (!s.down) return; s.down = false; p.classList.remove('is-drag');
      if (!s.moved) { wiggle(p); return; }
      if (performance.now() - s.t > 90) s.vx = s.vy = 0;
      const bw = ul.clientWidth, bh = ul.clientHeight, ox = p.offsetLeft, oy = p.offsetTop, pw = p.offsetWidth, ph = p.offsetHeight;
      add((t, dt) => {
        const f = Math.exp(-dt * 4.2);
        s.vx *= f; s.vy *= f;
        s.x += s.vx * dt; s.y += s.vy * dt;
        const minx = -ox - pw * .3, maxx = bw - ox - pw * .7, miny = -oy - ph * .2, maxy = bh - oy - ph * .7;
        if (s.x < minx) { s.x = minx; s.vx = Math.abs(s.vx) * .5; } if (s.x > maxx) { s.x = maxx; s.vx = -Math.abs(s.vx) * .5; }
        if (s.y < miny) { s.y = miny; s.vy = Math.abs(s.vy) * .5; } if (s.y > maxy) { s.y = maxy; s.vy = -Math.abs(s.vy) * .5; }
        s.r += (s.vx * .006 - s.r) * (1 - Math.exp(-dt / .2));
        p.style.transform = `translate3d(${s.x.toFixed(1)}px,${s.y.toFixed(1)}px,0) rotate(${s.r.toFixed(2)}deg)`;
        return Math.abs(s.vx) + Math.abs(s.vy) > 6 || Math.abs(s.r) > .05;
      });
    };
    p.addEventListener('pointerup', up); p.addEventListener('pointercancel', up);
    p.addEventListener('click', (e) => { if (e.target.closest('a') || canDrag()) return; wiggle(p); });
  });
  matchMedia('(min-width: 900px)').addEventListener('change', () => pols.forEach((p) => { p.style.transform = ''; }));
}

/* ---------- törzsvásárlói kártya: pecsétek egyenként; kattintásra új pecsét, tíznél ünneplés ---------- */
function card() {
  const c = $('[data-lcard]'); if (!c) return;
  const st = $$('.lc__st', c);
  let n = 7;
  const stamp = (el, delay) => anim(el, [
    { transform: 'scale(2.2) rotate(-40deg)', opacity: 0 }, { transform: 'scale(.86)', opacity: 1, offset: .55 }, { transform: 'none', opacity: 1 }],
    { delay, duration: 620, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  onEnter(c, (now) => {
    if (now) return;
    anim(c, [{ transform: 'translateY(90px) rotate(-16deg) scale(.9)', opacity: 0 }, { transform: 'none', opacity: 1 }], { easing: SOFT.e, duration: SOFT.d });
    st.slice(0, n).forEach((s, i) => stamp(s, 520 + i * 140));
  }, '0px 0px -18% 0px');
  if (STILL) return;
  c.addEventListener('click', () => {
    if (n > 10) return;
    if (n < 10) { const s = st[n]; s.style.opacity = '1'; stamp(s, 0); n++; }
    if (n === 10) {
      n = 11;
      setTimeout(() => {
        anim(c, [{ transform: 'none' }, { transform: 'rotate(4deg) scale(1.06)' }, { transform: 'rotate(-3deg)' }, { transform: 'none' }], { duration: 700, easing: 'ease-out', fill: 'none', composite: 'add' });
        confetti(c);
        st.forEach((s, i) => {
          const a = s.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0) rotate(90deg)' }], { delay: 900 + i * 40, duration: 260, easing: 'ease-in', fill: 'forwards' });
          a.onfinish = () => { s.style.opacity = '0'; a.cancel(); };
        });
        setTimeout(() => { n = 0; }, 1500);
      }, 380);
    }
  });
  if (RICH) {
    const host = c.parentElement; let tx = 0, ty = 0, x = 0, y = 0, lift = 0, tl = 0;
    const tilt = (t, dt) => {
      const k = 1 - Math.exp(-dt / .12); x += (tx - x) * k; y += (ty - y) * k; lift += (tl - lift) * k;
      c.style.transform = `perspective(900px) rotateY(${(x * 12).toFixed(2)}deg) rotateX(${(-y * 10).toFixed(2)}deg) translateY(${(-lift * 8).toFixed(1)}px)`;
      return Math.abs(tx - x) + Math.abs(ty - y) + Math.abs(tl - lift) > .002;
    };
    host.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse') return; const r = c.getBoundingClientRect(); tx = clamp(((e.clientX - r.left) / r.width - .5) * 2, -1, 1); ty = clamp(((e.clientY - r.top) / r.height - .5) * 2, -1, 1); tl = 1; add(tilt); });
    host.addEventListener('pointerleave', () => { tx = ty = tl = 0; add(tilt); });
  }
}
function confetti(host) {
  const r = host.getBoundingClientRect();
  const cols = ['#E0668A', '#FFD86B', '#8FD6B4', '#BBA3EE', '#8EC3F5', '#fff'];
  for (let i = 0; i < 26; i++) {
    const d = document.createElement('i');
    d.style.cssText = `position:fixed;left:${r.left + r.width / 2}px;top:${r.top + r.height / 2}px;width:${i % 3 ? 14 : 9}px;height:${i % 3 ? 6 : 9}px;border-radius:9px;background:${cols[i % cols.length]};z-index:95;pointer-events:none;border:1.5px solid #4A2A2A`;
    document.body.appendChild(d);
    const a = rnd(0, 6.28), s = rnd(120, 300);
    d.animate([{ transform: 'translate(0,0) rotate(0)', opacity: 1 },
      { transform: `translate(${Math.cos(a) * s}px,${Math.sin(a) * s - 80}px) rotate(${rnd(-360, 360)}deg)`, opacity: 1, offset: .6 },
      { transform: `translate(${Math.cos(a) * s * 1.1}px,${Math.sin(a) * s + 120}px) rotate(${rnd(-540, 540)}deg)`, opacity: 0 }],
      { duration: rnd(900, 1300), easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => d.remove();
  }
}

/* ---------- látogatás: kártya, sorok, maci ---------- */
function visit() {
  const card = $('.visit__card'); if (!card) return;
  onEnter(card, (now) => {
    if (now) return;
    rise(card, 0, 80);
    $$('.hours tr', card).forEach((tr, i) => anim(tr, [{ transform: 'translateX(-26px)', opacity: 0 }, { transform: 'none', opacity: 1 }], { delay: 300 + i * 70, easing: SOFT.e, duration: SOFT.d }));
    const im = $('.visit__img', card); if (im) anim(im, [{ transform: 'scale(.8) rotate(6deg)', opacity: 0 }, { transform: 'none', opacity: 1 }], { delay: 200 });
    const s = $('.visit__stk', card); if (s) popIn(s, 650, -40);
  }, '0px 0px -10% 0px');
}

/* ---------- általános belépők: [data-pop] címek betűnként, [data-rise] szövegek ---------- */
function reveals() {
  $$('[data-pop]').forEach((h) => {
    if (h.closest('.hero')) return;
    split(h);
    onEnter(h, (now) => { if (!now) popLetters(h, 0, h.classList.contains('kc__name') ? 30 : 24); });
  });
  $$('[data-rise]').forEach((el) => { if (!el.closest('.hero')) onEnter(el, (now) => { if (!now) rise(el, 120); }); });
  const mk = $('.ft__mark');
  if (mk) onEnter(mk, (now) => { if (!now) $$('span', mk).forEach((s, i) => anim(s, [{ transform: 'translateY(70%) rotate(-10deg)' }, { transform: 'none' }], { delay: i * 60 })); }, '0px');
}

/* ---------- habzsák kurzor (csak .rich): a csőr hegye pontosan az egér, a zsák lendül, kattintásra habrózsa ---------- */
function cursor() {
  if (!RICH) return;
  const pb = document.createElement('div');
  pb.className = 'pb is-off'; pb.setAttribute('aria-hidden', 'true');
  pb.innerHTML = `<svg class="pb__bag" viewBox="0 0 64 64" fill="none" stroke="#4A2A2A" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">
<g transform="translate(4 4) rotate(-45)">
<path d="M-9 15c-7 7-10 16-8 26 2 9 8 13 17 13s15-4 17-13c2-10-1-19-8-26z" fill="#F7B7C8"/>
<path d="M-11 25c-2 6-1 12 2 17" stroke="#fff" stroke-width="3" opacity=".85"/>
<path d="M-7 53c2 4 5 6 7 6s5-2 7-6" fill="#FFF6EE"/>
<rect x="-8" y="11" width="16" height="5" rx="2" fill="#4A2A2A"/>
<path d="M0 0l-6 11h12z" fill="#E9DCCB"/><path d="M-2 4v6M2 4v6"/>
</g></svg>`;
  document.body.appendChild(pb);
  R.classList.add('has-cur');
  const bag = pb.firstElementChild;
  let x = -100, y = -100, lx = -100, vx = 0, ang = 0;
  const step = (t, dt) => {
    const inst = (x - lx) / Math.max(dt, 1 / 120); lx = x;
    vx += (inst - vx) * (1 - Math.exp(-dt / .08));
    const tang = clamp(vx * .028, -28, 28);
    ang += (tang - ang) * (1 - Math.exp(-dt / .16));
    pb.style.transform = `translate3d(${x}px,${y}px,0)`;
    bag.style.rotate = `${ang.toFixed(2)}deg`;
    return Math.abs(tang) + Math.abs(ang) > .15;
  };
  addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY; pb.classList.remove('is-off'); add(step);
  }, { passive: true });
  document.addEventListener('pointerover', (e) => {
    const hit = e.target.closest && e.target.closest('a,button,[data-pill],[data-pol],[data-lcard]');
    pb.classList.toggle('is-hover', !!hit);
  });
  document.documentElement.addEventListener('mouseleave', () => pb.classList.add('is-off'));
  addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') pb.classList.add('is-down'); });
  addEventListener('pointerup', (e) => {
    if (e.pointerType !== 'mouse') return;
    pb.classList.remove('is-down');
    dollop(e.clientX, e.clientY);
  });
}
function dollop(x, y) {
  const d = document.createElement('div'); d.className = 'pop'; d.style.left = x + 'px'; d.style.top = y + 'px';
  d.innerHTML = '<svg viewBox="-22 -22 44 44"><path d="M0-16C5-16 6-11 10-12S17-7 14-3 17 6 12 9 6 17 0 14-9 17-12 9-18 2-14-3-15-12-10-12-5-16 0-16Z" fill="#FFF6EE" stroke="#4A2A2A" stroke-width="2" stroke-linejoin="round"/><path d="M0-8c4 0 7 3 7 7s-3 6-7 6-5-2-5-5 2-4 4-4" fill="none" stroke="#E0668A" stroke-width="2" stroke-linecap="round"/></svg>';
  document.body.appendChild(d);
  d.animate([{ transform: 'scale(0) rotate(-60deg)', opacity: 1 }, { transform: 'scale(1) rotate(0)', opacity: 1, offset: .35 }, { transform: 'scale(.9) translateY(10px)', opacity: 0 }],
    { duration: 900, easing: 'cubic-bezier(.3,1.3,.5,1)' }).onfinish = () => d.remove();
}

/* ---------- lassabb, puha görgetés asztali gépen (Lenis, csak .rich) ---------- */
function smooth() {
  if (!RICH) return;
  loadScript('/js/vendor/lenis.min.js?v=6').then(() => {
    const L = globalThis.Lenis; if (!L) return;
    lenis = new L({ lerp: .075, wheelMultiplier: .85, smoothWheel: true, autoRaf: false });
    const lt = (t) => { lenis.raf(t); return !!lenis.isScrolling || Math.abs(lenis.targetScroll - lenis.animatedScroll) > .5; };
    addEventListener('wheel', () => { add(lt); scrollKick(); }, { passive: true });
    lenis.on('scroll', scrollKick);
    document.addEventListener('click', (e) => {
      const a = e.target.closest && e.target.closest('a[href*="#"]'); if (!a || e.defaultPrevented) return;
      const u = new URL(a.href, location.href);
      if (u.pathname !== location.pathname || !u.hash) return;
      const el = document.getElementById(decodeURIComponent(u.hash.slice(1))); if (!el) return;
      e.preventDefault();
      lenis.scrollTo(el, { offset: -(S.nav + 20), duration: 1.4 });
      history.replaceState(null, '', u.hash);
      add(lt);
    });
    document.addEventListener('hv:menu', (e) => { if (e.detail.open) lenis.stop(); else lenis.start(); });
  }).catch(() => {});
}

/* ================================================================ indulás */
export function initMotion() {
  S.nav = parseFloat(getComputedStyle(R).getPropertyValue('--nav-h')) || 64;
  sprinkles();
  hero();
  if (STILL) return;
  reveals();
  tapes();
  jar();
  stack();
  pile();
  card();
  visit();
  stickerParallax();
  cursor();
  smooth();
  addEventListener('scroll', () => { scrollKick(); passCheck(); }, { passive: true });
  let lw = innerWidth, lh = innerHeight;
  addEventListener('resize', () => {
    S.vw = innerWidth;
    if (Math.abs(innerWidth - lw) > 2 || Math.abs(innerHeight - lh) > 160) { lw = innerWidth; lh = innerHeight; S.vh = innerHeight; dispatchEvent(new Event('hv:measure')); scrollKick(); }
  });
  if (document.fonts) document.fonts.ready.then(() => dispatchEvent(new Event('hv:measure')));
  scrollKick();
}
