// HabVero: mozgás-ellenőrzés (13 animátor). node teszt/mozgas.mjs  (BASE=http://127.0.0.1:8791)
// Esetek: érintés (headless alapból: szoftveres GPU -> .touch), .rich (HW=1 csonk: a kapu valódi GPU-t lát, a 3D poszter marad),
// reduced-motion, középen újratöltés. Ellenőrzi: intro után minden látszik, végiggörgetés után nincs rejtett elem,
// nem fed semmi láthatatlan egy linket, a tortaforgó (rich, 1440) forog, a horgonyok a helyükre érnek.
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:8791';
const b = await chromium.launch({ args: ['--disable-webgl', '--disable-3d-apis'] });   // rich: GPU-csonk, WebGL nélkül
const bt = await chromium.launch();                                                    // touch: SwiftShader -> .touch + is-gpu-soft
let ok = true; const check = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) ok = false; };
const HW = () => {
  const gc = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (t, o) {
    if (t !== 'webgl' || this.id === 'hero3d') return gc.call(this, t, o);
    return { getExtension: (n) => (n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null), getParameter: () => 'Test GPU (hardware)' };
  };
};
// rejtett elemek a látható sávban (opacity / sormaszk / vonal)
const hiddenScan = () => {
  const out = [], vh = innerHeight;
  const atEnd = scrollY + vh >= document.documentElement.scrollHeight - 4;
  const inView = (el) => { if (!atEnd && el.closest('.ft')) return false; const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < vh * 0.8 && r.width > 0 && r.right > 0 && r.left < innerWidth; };
  const op = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
  document.querySelectorAll('.ln__i, [data-anim], .dc, .idx__name, .hero__poster, [data-fill], .tf__view, .map__lbl').forEach((el) => {
    if (!inView(el)) return;
    if (el.closest('.is-tt .tf__card')) return;
    if (el.classList.contains('hero__poster') && scrollY > innerHeight * 0.1) return;   // kilépéskor szándékosan halványul          // a forgó hátsó kártyái szándékosan halványak
    const tf = getComputedStyle(el).transform;
    if (op(el) < 0.99) out.push('opacity ' + (el.className || el.tagName));
    if (el.classList.contains('ln__i') && tf !== 'none') out.push('ln ' + el.textContent.slice(0, 20));
  });
  document.querySelectorAll('svg.pl path').forEach((p) => {
    if (!p.getAttribute('d') || getComputedStyle(p).visibility === 'hidden' || getComputedStyle(p).display === 'none') return;
    if (!inView(p)) return;
    if (p.dataset.seg === 'nozzle' && scrollY > 0) return;           // kilépéskor szándékosan visszahúzódik
    if (p.dataset.seg === 'seam' && document.documentElement.classList.contains('rich') && innerWidth >= 1100) return;   // asztalon scrub
    const cs = getComputedStyle(p);
    if (cs.transform !== 'none' && /matrix\(0,|matrix\(1, 0, 0, 0,/.test(cs.transform)) out.push('vonal scale0 ' + p.dataset.seg);
    if (parseFloat(cs.strokeDashoffset) > 0.5) out.push('vonal dash ' + p.dataset.seg);
  });
  if (document.querySelector('.wipe-cover') && inView(document.querySelector('.wipe-cover'))) out.push('wipe-cover');
  return out;
};
async function scrollThrough(p, step = 300) {
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  const bad = new Set();
  for (let y = 0; y < H; y += step) {
    await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(140);
  }
  // vissza felfelé lépésenként, megállva: minden látható elem kész?
  for (let y = H; y >= 0; y -= 450) {
    await p.evaluate((y) => scrollTo(0, y), y); await p.waitForTimeout(1500);
    (await p.evaluate(hiddenScan)).forEach((x) => bad.add(y + ':' + x));
  }
  return [...bad];
}
const cover = () => {
  const bad = [];
  const atEnd = scrollY + innerHeight >= document.documentElement.scrollHeight - 4;
  document.querySelectorAll(atEnd ? 'main a, .ft a' : 'main a').forEach((a) => {
    const r = a.getBoundingClientRect(); if (r.width < 2 || r.bottom < 70 || r.top > innerHeight - 2 || r.left < 0 || r.right > innerWidth) return;
    if (a.closest('.is-tt .tf__card')) return;
    const e = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (e && !a.contains(e) && !e.contains(a)) bad.push(a.textContent.trim().slice(0, 24) + ' <- ' + (e.className || e.tagName));
  });
  return bad;
};

for (const [nm, opt, init] of [
  ['touch 390', { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, HW],
  ['touch 1440 (szoftveres GPU)', { viewport: { width: 1440, height: 900 } }, null],
  ['rich 1440', { viewport: { width: 1440, height: 900 } }, HW],
  ['rich 1100', { viewport: { width: 1100, height: 800 } }, HW],
  ['rich 900', { viewport: { width: 900, height: 900 } }, HW],
].filter((c) => !process.env.CASE || c[0].startsWith(process.env.CASE))) {
  const ctx = await (init ? b : bt).newContext(opt); const p = await ctx.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  if (init) await p.addInitScript(init);
  await p.goto(BASE + '/', { waitUntil: 'load' });
  await p.waitForTimeout(600);
  const mode = await p.evaluate(() => document.documentElement.className);
  await p.waitForTimeout(4400);
  const st = await p.evaluate(() => ({ cls: document.documentElement.className, anims: document.getAnimations().filter((a) => a.playState === 'running').length }));
  check(/intro-done/.test(st.cls) && !/intro-on/.test(st.cls), `${nm}: intro kész (${mode.split(' ').filter((c) => /rich|touch|still|gpu/.test(c)).join(' ')})`);
  const h0 = await p.evaluate(hiddenScan);
  check(h0.length === 0, `${nm}: intro után minden látszik ${h0.join(', ')}`);
  if (/rich 1440/.test(nm)) {
    const tt = await p.evaluate(() => { const s = document.querySelector('[data-turntable]'); return { on: s.classList.contains('is-tt'), h: s.offsetHeight, top: s.offsetTop }; });
    check(tt.on && tt.h > 3000, `${nm}: tortaforgó bekapcsolva (magasság ${tt.h})`);
    await p.evaluate((t) => scrollTo(0, t.top + (t.h - innerHeight) * 0.4), tt); await p.waitForTimeout(1500);
    const cards = await p.evaluate(() => [...document.querySelectorAll('.tf__card')].map((c) => { const r = c.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), getComputedStyle(c).opacity]; }));
    console.log('      kártyák p=.4:', JSON.stringify(cards));
    const view = await p.evaluate(() => { const v = document.querySelector('.tf__view').getBoundingClientRect(); const fr = [...document.querySelectorAll('.tf__card')].filter((c) => +getComputedStyle(c).opacity > .9).map((c) => c.getBoundingClientRect()); return { vt: v.top, vb: v.bottom, t: Math.min(...fr.map((r) => r.top)), b: Math.max(...fr.map((r) => r.bottom)), h2b: document.querySelector('#h-alkotasok').getBoundingClientRect().bottom }; });
    check(view.t >= view.h2b - 2, `${nm}: a forgó nem lóg a címre (kártyák teteje ${Math.round(view.t)}, cím alja ${Math.round(view.h2b)})`);
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(400);
  }
  const bad = await scrollThrough(p);
  check(bad.length === 0, `${nm}: végiggörgetve nincs rejtett elem ${bad.slice(0, 6).join(' | ')}`);
  const cv = [];
  for (const f of [0.3, 0.6, 1]) { await p.evaluate((f) => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), f); await p.waitForTimeout(1500); cv.push(...(await p.evaluate(cover))); }
  check(cv.length === 0, `${nm}: nem takar semmi linket ${cv.join(' | ')}`);
  // horgonyok
  for (const id of ['kinalat', 'alkotasok', 'latogatas']) {
    if (/390/.test(nm)) break;
    await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(300);
    if (opt.viewport.width < 1100) { await p.click('[data-menu-toggle]'); await p.waitForTimeout(500); }
    await p.click(`.hd__menu a[href="#${id}"]`).catch((e) => console.log('      kattintás:', e.message.split('\n')[0]));
    await p.waitForTimeout(1800);
    const r = await p.evaluate((id) => { const s = document.getElementById(id); const h = s.querySelector('h2'); return { sec: Math.round(s.getBoundingClientRect().top), h2: Math.round(h.getBoundingClientRect().top), tt: s.classList.contains('is-tt') }; }, id);
    check(r.tt ? Math.abs(r.sec) < 4 : r.h2 > 60 && r.h2 < 220, `${nm}: #${id} horgony (szakasz ${r.sec}, cím ${r.h2})`);
  }
  // középen újratöltés
  await p.evaluate(() => scrollTo(0, document.getElementById('kartya').offsetTop - 200)); await p.waitForTimeout(500);
  await p.reload({ waitUntil: 'load' }); await p.waitForTimeout(3500);
  const rl = await p.evaluate(hiddenScan); const ry = await p.evaluate(() => scrollY);
  check(rl.length === 0 && ry > 500, `${nm}: középen újratöltve (y ${ry}) minden látszik ${rl.join(', ')}`);
  check(errs.length === 0, `${nm}: nincs JS hiba ${errs.join(' | ')}`);
  await ctx.close();
}
// reduced motion
{
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' }); const p = await ctx.newPage();
  await p.addInitScript(HW);
  await p.goto(BASE + '/', { waitUntil: 'load' }); await p.waitForTimeout(300);
  const r = await p.evaluate(() => ({ still: document.documentElement.classList.contains('still'), anims: document.getAnimations().length, ln: document.querySelectorAll('.ln').length }));
  const bad = await scrollThrough(p, 600);
  check(r.still && r.anims === 0 && r.ln === 0 && bad.length === 0, `reduced-motion: still, nincs animáció, nincs bontás, minden látszik ${bad.join(',')}`);
  await ctx.close();
}
await b.close(); await bt.close(); process.exit(ok ? 0 : 1);
