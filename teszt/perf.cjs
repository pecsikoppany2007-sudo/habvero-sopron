// Átvéve a Gyógygödör v5 teszt/perf.js-ből (13 animátor). Használat: PERF_HW=1 [PERF_ONLY=gép] node teszt/perf.cjs [url]
// Akadásmérés Chrome-tracerrel, egyedül futtatva (a Moa-oldalról átvéve). Használat: NODE_PATH=$(npm root -g) node teszt/perf.js [alap-url]
// Három gép: asztali (nincs lassítás), iPhone 13 (4x CPU-lassítás), olcsó Android 360x640 (6x CPU-lassítás).
// Mért szakaszok: betöltés + nyitó animáció, végiggörgetés érintéses gesztussal (telefonon) vagy görgővel (gépen).
// Kimenet: eldobott képkockák aránya a trace PipelineReporter eseményeiből, hosszú feladatok, layout/style/script idő,
// LCP, CLS. A headless Chromium szoftveres raszterrel fut, ezért a szám szigorúbb, mint egy valódi telefonon.
const { chromium, devices } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8791/';

const CONFS = [
  ['gép', { viewport: { width: 1440, height: 900 }, locale: 'hu-HU' }, 1],
  ['Mac Retina', { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2, locale: 'hu-HU' }, 1],
  ['iPhone 13 (4x)', { ...devices['iPhone 13'], locale: 'hu-HU' }, 4],
  ['olcsó Android (6x)', { viewport: { width: 360, height: 640 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'hu-HU',
    userAgent: 'Mozilla/5.0 (Linux; Android 11; moto g(9) play) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36' }, 6],
];

function frameStats(events, t0, t1) {
  // PipelineReporter: egy-egy képkocka sorsa (megjelent, részben, eldobva, nem kellett frissíteni)
  const st = {}; const when = [];
  for (const e of events) {
    if (e.name !== 'PipelineReporter' || e.ph !== 'b') continue;
    if (e.ts < t0 || e.ts > t1) continue;
    const fr = e.args && (e.args.frame_reporter || e.args.chrome_frame_reporter) || {};
    const s = fr.state || 'ismeretlen';
    st[s] = (st[s] || 0) + 1;
    if (s === 'STATE_DROPPED') when.push(Math.round((e.ts - t0) / 1000));
    if (fr.has_missing_content) st.miss = (st.miss || 0) + 1;
  }
  const dropped = st.STATE_DROPPED || 0;
  const shown = (st.STATE_PRESENTED_ALL || 0) + (st.STATE_PRESENTED_PARTIAL || 0);
  let rast = 0; for (const e of events) if (e.name === 'RasterTask' && e.ph === 'X' && e.ts >= t0 && e.ts <= t1) rast += e.dur || 0;
  return { miss: st.miss || 0, rast: Math.round(rast / 1000), when, dropped, shown, partial: st.STATE_PRESENTED_PARTIAL || 0, pct: shown + dropped ? (100 * dropped / (shown + dropped)).toFixed(1) : '0.0' };
}

(async () => {
  // PERF_GL=1: szoftveres (swiftshader) GL-lel, ekkor az egész oldal kompozitálása is emulált GPU-n megy, ami sokkal lassabb a valódinál
  // PERF_NOGL=1: WebGL nélkül (a nyitókép tartalék változata), így látszik, mennyi a vászon nélküli rész költsége
  // PERF_HW=1: WebGL nélkül fut (így a kompozitor nem esik a szoftveres GL visszaolvasás csapdájába), de az oldal
  // grafikus chipet lát, tehát a 3D billenés és a folyosó is megy; a nyitókép WebGL-vászna ilyenkor nem indul
  const b = await chromium.launch(process.env.PERF_GL ? { args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
    : process.env.PERF_NOGL || process.env.PERF_HW ? { args: ['--disable-webgl', '--disable-3d-apis'] } : {});
  // PERF_ONLY=gép csak egy gépen mér; PERF_CSS='...' kísérleti CSS-t tesz az oldalba (összehasonlításhoz)
  for (const [nm, opt, rate] of CONFS.filter(c => !process.env.PERF_ONLY || c[0].startsWith(process.env.PERF_ONLY))) {
    const ctx = await b.newContext(opt);
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await p.addInitScript(() => {
      window.__lt = []; window.__cls = 0; window.__lcp = 0; window.__raf = [];
      new PerformanceObserver(l => l.getEntries().forEach(e => __lt.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true });
      new PerformanceObserver(l => l.getEntries().forEach(e => { if (!e.hadRecentInput) __cls += e.value; })).observe({ type: 'layout-shift', buffered: true });
      new PerformanceObserver(l => l.getEntries().forEach(e => { __lcp = e.startTime; })).observe({ type: 'largest-contentful-paint', buffered: true });
      (function f(t) {
        __raf.push(t);
        if (!window.__io && document.documentElement && document.documentElement.classList.contains('intro-on')) { window.__io = performance.now(); performance.mark('intro-on'); }
        if (!window.__ir && document.documentElement && /intro-(run|done)/.test(document.documentElement.className)) { window.__ir = performance.now(); performance.mark('intro-run'); }
        requestAnimationFrame(f);
      })(0);
    });
    if (process.env.PERF_HW) await p.addInitScript(() => {
      const gc = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, o) {
        if (t !== 'webgl' || this.id === 'hero3d') return gc.call(this, t, o);
        return { getExtension: n => n === 'WEBGL_debug_renderer_info' ? { UNMASKED_RENDERER_WEBGL: 0x9246 } : null, getParameter: () => 'Test GPU (hardware)' };
      };
    });
    if (process.env.PERF_CSS) await p.addInitScript(css => document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st); }), process.env.PERF_CSS);
    if (process.env.PERF_JS) await p.addInitScript(process.env.PERF_JS);
    const cdp = await ctx.newCDPSession(p);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await cdp.send('Performance.enable');

    const events = [];
    cdp.on('Tracing.dataCollected', d => events.push(...d.value));
    const done = new Promise(r => cdp.once('Tracing.tracingComplete', r));
    await cdp.send('Tracing.start', { transferMode: 'ReportEvents',
      traceConfig: { includedCategories: ['devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'benchmark', 'cc', 'viz', 'disabled-by-default-cc.debug', 'blink.user_timing'] } });

    // 1) betöltés és nyitó animáció
    const tLoad0 = await p.evaluate(() => 0).catch(() => 0);
    await p.goto(base, { waitUntil: 'load' });
    await p.evaluate(() => performance.mark('intro-start'));
    await p.waitForTimeout(rate > 1 ? 5000 : 3500);
    const intro = await p.evaluate(() => {
      const r = __raf.filter(t => t > 0); const gaps = [];
      for (let i = 1; i < r.length; i++) gaps.push(r[i] - r[i - 1]);
      const io = window.__io || 0, big = [];
      for (let i = 1; i < r.length; i++) if (r[i] - r[i - 1] > 34) big.push(Math.round(r[i - 1] - io) + '+' + Math.round(r[i] - r[i - 1]));
      return { big: big.join(' '), io: Math.round(io), ir: Math.round((window.__ir || 0) - io), n: gaps.length, slow: gaps.filter(g => g > 34).length, max: Math.round(Math.max(...gaps)), lcp: Math.round(__lcp), cls: __cls.toFixed(3), cls0: __cls,
               introDone: document.documentElement.className };
    });
    await p.evaluate(() => { performance.mark('scroll-start'); __raf.length = 0; __lt.length = 0; });
    const m0 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));

    // 2) végiggörgetés: telefonon valódi érintéses gesztus (Input.synthesizeScrollGesture), gépen görgő
    const H = await p.evaluate(() => document.documentElement.scrollHeight - innerHeight);
    const vh = opt.viewport.height; let scrolledTo = -1;
    if (opt.hasTouch) {
      // ujjal húzás: a Input.synthesizeScrollGesture érintéssel headlessben nem görget, ezért nyers érintésesemények
      const cx = Math.round(opt.viewport.width / 2);
      const swipe = async (from, dist) => {
        const steps = Math.max(4, Math.round(Math.abs(dist) / 26));
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: from }] });
        for (let i = 1; i <= steps; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx, y: Math.round(from + dist * i / steps) }] }); await p.waitForTimeout(16); }
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      };
      let y = 0, stuck = 0;
      while (y < H - 5 && stuck < 3) {
        await swipe(Math.round(vh * 0.8), -Math.round(vh * 0.6));
        await p.waitForTimeout(140);
        const ny = await p.evaluate(() => scrollY); stuck = ny <= y + 2 ? stuck + 1 : 0; y = ny;
      }
      // irányváltás: vissza fel két húzás, majd le egy
      await swipe(Math.round(vh * 0.2), Math.round(vh * 0.6)); await swipe(Math.round(vh * 0.2), Math.round(vh * 0.6));
      await swipe(Math.round(vh * 0.8), -Math.round(vh * 0.6));
      scrolledTo = y;
    } else {
      await p.mouse.move(700, 450);
      for (let y = 0; y < H; y += 100) { await p.mouse.wheel(0, 100); await p.waitForTimeout(16); }
      await p.waitForTimeout(400);
      for (let i = 0; i < 20; i++) { await p.mouse.wheel(0, -100); await p.waitForTimeout(16); }
    }
    await p.waitForTimeout(600);
    const m1 = Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map(x => [x.name, x.value]));
    const scroll = await p.evaluate(() => {
      const r = __raf; const gaps = [];
      for (let i = 1; i < r.length; i++) gaps.push(r[i] - r[i - 1]);
      return { n: gaps.length, slow: gaps.filter(g => g > 34).length, max: Math.round(Math.max(...gaps)), lt: __lt.length, ltMax: Math.round(Math.max(0, ...__lt.map(x => x[1]))), cls: __cls };
    });
    await p.evaluate(() => performance.mark('scroll-end'));
    await cdp.send('Tracing.end'); await done;

    const mark = n => (events.find(e => e.name === n && e.cat && e.cat.includes('blink.user_timing')) || {}).ts;
    const nav0 = Math.min(...events.filter(e => e.name === 'PipelineReporter').map(e => e.ts));
    const io = mark('intro-on');
    const fLoad = frameStats(events, nav0, io || nav0);
    const fIntro = frameStats(events, io || nav0, mark('scroll-start') || Infinity);
    const fRun = frameStats(events, mark('intro-run') || io || nav0, mark('scroll-start') || Infinity);
    const fScroll = frameStats(events, mark('scroll-start') || 0, mark('scroll-end') || Infinity);
    const per = k => ((m1[k] - m0[k]) * 1000 / Math.max(1, scroll.n)).toFixed(2);
    console.log(`\n${nm}`);
    console.log(`  betöltés a nyitásig: eldobott ${fLoad.dropped}/${fLoad.dropped + fLoad.shown}; nyitó animáció: eldobott képkocka ${fIntro.dropped}/${fIntro.dropped + fIntro.shown} (${fIntro.pct}%), rAF >34 ms: ${intro.slow}/${intro.n}, leghosszabb ${intro.max} ms, LCP ${intro.lcp} ms, CLS ${intro.cls}, nyitás kész: ${intro.introDone}`);
    if (fIntro.dropped) console.log(`    eldobott képkockák a nyitás kezdetétől (ms): ${fIntro.when.join(' ')}`);
    console.log(`    az animáció ${intro.ir} ms-mal az első kép után indult; onnantól eldobott ${fRun.dropped}/${fRun.dropped + fRun.shown} (${fRun.pct}%)${fRun.dropped ? ' itt: ' + fRun.when.join(' ') : ''}`);
    console.log(`    nyitás indult ${intro.io} ms-nál; hosszú rAF-szünetek (kezdet a nyitáshoz képest + hossz): ${intro.big || 'nincs'}`);
    console.log(`  görgetés${scrolledTo >= 0 ? ' (' + scrolledTo + '/' + H + ' px)' : ''}: eldobott képkocka ${fScroll.dropped}/${fScroll.dropped + fScroll.shown} (${fScroll.pct}%), hiányzó tartalom ${fScroll.miss}, raszter ${fScroll.rast} ms, rAF >34 ms: ${scroll.slow}/${scroll.n}, leghosszabb ${scroll.max} ms, hosszú feladat ${scroll.lt} (max ${scroll.ltMax} ms)`);
    console.log(`  fő szál képkockánként: script ${per('ScriptDuration')} ms, layout ${per('LayoutDuration')} ms, style ${per('RecalcStyleDuration')} ms; CLS a végén ${scroll.cls.toFixed(3)}`);
    if (errs.length) console.log('  hibák:', errs.join(' | '));
    await ctx.close();
  }
  await b.close();
})();
