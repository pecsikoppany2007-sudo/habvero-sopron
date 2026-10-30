// HabVero füst-teszt: konzolhibák, vízszintes túlcsordulás 320/390/768/1100/1440 px-en, minden oldalon.
// Futtatás: (cd site && python3 -m http.server 8765 &) ; node teszt/smoke.mjs [--shots DIR]
import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://127.0.0.1:8765';
const PAGES = ['/', '/de/', '/en/', '/impresszum/', '/adatkezeles/', '/de/impressum/', '/de/datenschutz/', '/en/legal-notice/', '/en/privacy/', '/404.html', '/de/404.html', '/en/404.html'];
const WIDTHS = [320, 390, 768, 1100, 1440];
const shotsDir = process.argv.includes('--shots') ? process.argv[process.argv.indexOf('--shots') + 1] : null;

const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
let fails = 0;
for (const w of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width: w, height: w < 700 ? 800 : 900 }, deviceScaleFactor: 1 });
  for (const p of PAGES) {
    const page = await ctx.newPage();
    const errs = [];
    page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
    page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
    page.on('requestfailed', (r) => errs.push('reqfail: ' + r.url()));
    page.on('response', (r) => { if (r.status() >= 400 && !r.url().endsWith('/favicon.ico')) errs.push(`${r.status()} ${r.url()}`); });
    await page.goto(BASE + p, { waitUntil: 'networkidle' });
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const de = document.documentElement;
      const wide = [...document.querySelectorAll('body *')].filter((el) => {
        if (el.closest('.tf__view, .hero__stage, .ft__mark, svg, .hd__nav')) return false;
        const b = el.getBoundingClientRect(); return b.width > 0 && (b.right > de.clientWidth + 1 || b.left < -1);
      }).slice(0, 4).map((el) => el.tagName + '.' + el.className.toString().slice(0, 30));
      const paths = [...document.querySelectorAll('svg.pl path[data-seg]')].filter((p) => !p.getAttribute('d') && p.dataset.seg !== 'rim').map((p) => p.closest('svg').dataset.line + ':' + p.dataset.seg);
      return { sw: de.scrollWidth, cw: de.clientWidth, wide, mode: de.className, paths };
    });
    const bad = r.sw > r.cw || errs.length || (p.match(/^\/(de\/|en\/)?$/) && r.paths.length);
    if (bad) fails++;
    console.log(`${bad ? 'FAIL' : 'ok  '} ${w} ${p} sw=${r.sw}/${r.cw} ${r.wide.join(' ')} ${r.paths.length ? 'emptyPaths=' + r.paths.join(',') : ''} ${errs.join(' | ')}`);
    if (shotsDir && ['/', '/impresszum/', '/404.html'].includes(p) && [390, 1440].includes(w)) {
      await page.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); } scrollTo(0, 0); });
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${shotsDir}/${w}${p.replace(/\//g, '_') || '_'}.png`, fullPage: true });
      await page.evaluate(() => scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(300);
      await page.screenshot({ path: `${shotsDir}/${w}${p.replace(/\//g, '_') || '_'}-end.png` });
    }
    await page.close();
  }
  await ctx.close();
}
await browser.close();
console.log(fails ? `\n${fails} hiba` : '\nminden rendben');
process.exit(fails ? 1 : 0);
