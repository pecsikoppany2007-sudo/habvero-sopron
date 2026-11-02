// HabVero v2 ellenőrzés: szélességek (320–1920), menü-horgonyok, elementFromPoint a linkeken (3D módban is), középen újratöltés,
// konzolhibák és 4xx, mindhárom nyelv. Használat: node teszt/ellenorzes-v2.cjs [alap-url]
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://localhost:8811';
const FAKE = () => { for (const C of [WebGLRenderingContext, WebGL2RenderingContext]) { const g = C.prototype.getParameter; C.prototype.getParameter = function (x) { return x === 0x9246 ? 'ANGLE (Apple, M1)' : g.call(this, x); }; } };
(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const bad = [];
  for (const lang of ['/', '/de/', '/en/']) {
    for (const [w, h, touch] of [[320, 640, 1], [390, 844, 1], [768, 1024, 1], [1100, 800, 0], [1280, 800, 0], [1440, 900, 0], [1920, 1080, 0]]) {
      const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: !!touch, isMobile: !!touch });
      const p = await ctx.newPage(); await p.addInitScript(FAKE);
      p.on('pageerror', (e) => bad.push(`${lang} ${w} pageerror ${e.message}`));
      p.on('console', (m) => { if (m.type() === 'error') bad.push(`${lang} ${w} console ${m.text()}`); });
      p.on('response', (r) => { if (r.status() >= 400) bad.push(`${lang} ${w} ${r.status()} ${r.url()}`); });
      await p.goto(base + lang); await p.waitForTimeout(6500);
      const r = await p.evaluate(async () => {
        const out = { cls: document.documentElement.className, sw: document.documentElement.scrollWidth, w: innerWidth, anchors: [], covered: [], hidden: [] };
        const links = [...document.querySelectorAll('.hd__menu a')];
        for (const a of links) {
          const id = a.getAttribute('href').split('#')[1], t = document.getElementById(id);
          t.scrollIntoView(); await new Promise((r) => setTimeout(r, 900));
          const hd = t.querySelector('h2') || t; const rc = hd.getBoundingClientRect();
          out.anchors.push(`${id}:${Math.round(rc.top)}`);
        }
        // minden tartalmi link: görgessünk oda, és nézzük, mi van fölötte
        const all = [...document.querySelectorAll('main a, footer a')].filter((a) => a.offsetParent && !a.closest('.sx'));
        for (const a of all) {
          a.scrollIntoView({ block: 'center' }); await new Promise((r) => setTimeout(r, 350));
          const rc = a.getBoundingClientRect(); if (rc.width < 2 || rc.bottom < 0 || rc.top > innerHeight) continue;
          const el = document.elementFromPoint(rc.left + rc.width / 2, rc.top + rc.height / 2);
          if (!el || !(a === el || a.contains(el))) out.covered.push(`${a.textContent.trim().slice(0, 24)}→${el ? el.className || el.tagName : 'null'}`);
        }
        // láthatatlanul maradt elemek (a görgetés végére minden fedje fel magát)
        scrollTo(0, document.documentElement.scrollHeight); await new Promise((r) => setTimeout(r, 1500));
        for (const el of document.querySelectorAll('main h2, main h3, main p, main img, .ln__i')) {
          const cs = getComputedStyle(el); if (cs.opacity === '0' || /matrix\(1, 0, 0, 1, 0, [1-9]/.test(cs.transform) && el.classList.contains('ln__i')) out.hidden.push(el.tagName + '.' + el.className);
        }
        return out;
      });
      const anchorsBad = r.anchors.filter((s) => { const v = +s.split(':')[1]; return v < 40 || v > h * 0.5; });
      console.log(lang, w, r.cls.split(' ')[0], r.sw > r.w ? `SZÉLES ${r.sw}` : 'ok', 'horgony', anchorsBad.length ? anchorsBad.join(' ') : 'ok', 'fedett', r.covered.length ? r.covered.slice(0, 4).join(' | ') : 0, 'rejtett', r.hidden.length ? r.hidden.slice(0, 3).join(' ') : 0);
      // középen újratöltés
      if (w === 390 || w === 1440) {
        await p.evaluate(() => scrollTo(0, document.documentElement.scrollHeight * 0.45)); await p.reload(); await p.waitForTimeout(3000);
        const hid = await p.evaluate(() => [...document.querySelectorAll('main h2, main p, main img')].filter((el) => { const r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && getComputedStyle(el).opacity === '0'; }).length);
        console.log('   újratöltés középen, láthatatlan a képen:', hid);
      }
      await ctx.close();
    }
  }
  // jogi oldalak és 404
  const p = await b.newPage();
  for (const u of ['/impresszum/', '/adatkezeles/', '/de/impressum/', '/en/privacy/', '/404.html']) { await p.goto(base + u); await p.waitForTimeout(800); }
  console.log('hibák:', bad.length ? [...new Set(bad)].slice(0, 12) : 0);
  await b.close();
})();
