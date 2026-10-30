// HabVero: menü, nyitva-jelző logika, reduced-motion (still) állapot.
import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://127.0.0.1:8765';
const b = await chromium.launch();
let ok = true; const check = (c, m) => { console.log((c ? 'ok   ' : 'FAIL ') + m); if (!c) ok = false; };

const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const errs = []; p.on('pageerror', (e) => errs.push(e.message));
await p.goto(BASE + '/de/', { waitUntil: 'networkidle' });
await p.click('[data-menu-toggle]');
check(await p.evaluate(() => document.documentElement.classList.contains('is-menu-open') && getComputedStyle(document.getElementById('menu')).visibility === 'visible'), 'menü nyílik');
check((await p.textContent('[data-menu-toggle]')).includes('Schließen'), 'menügomb felirat DE');
await p.keyboard.press('Escape');
check(await p.evaluate(() => !document.documentElement.classList.contains('is-menu-open')), 'Esc zár');
const cases = await p.evaluate(async () => {
  const m = await import('/js/main.js?v=4');
  const at = (iso) => m.openState(m.budapestNow(new Date(iso)));
  return {
    fri1630: at('2026-10-30T15:30:00Z')[0],   // CET: 16:30 péntek
    fri1700: at('2026-10-30T16:00:00Z')[0],   // 17:00 péntek
    sat1130: at('2026-10-31T10:30:00Z')[0],
    sat1200: at('2026-10-31T11:00:00Z')[0],
    sun: at('2026-11-01T10:00:00Z')[0],
    mon0830: at('2026-11-02T07:30:00Z')[0],
    summer0859: at('2026-07-01T06:59:00Z')[0], // CEST 8:59
    summer0900: at('2026-07-01T07:00:00Z')[0],
  };
});
check(JSON.stringify(cases) === JSON.stringify({ fri1630: 'open_now_17', fri1700: 'closed_tomorrow', sat1130: 'open_now_12', sat1200: 'closed_monday', sun: 'closed_monday', mon0830: 'closed_today', summer0859: 'closed_today', summer0900: 'open_now_17' }), 'nyitva-logika ' + JSON.stringify(cases));
check(await p.evaluate(() => document.querySelectorAll('[data-hours] tr.is-today').length === 1), 'mai sor kiemelve');
const still = await b.newPage({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await still.goto(BASE + '/', { waitUntil: 'networkidle' });
check(await still.evaluate(() => document.documentElement.classList.contains('still') && !document.getElementById('hero3d') && document.querySelector('[data-seg=nozzle]').getAttribute('d').length > 10), 'still: nincs canvas, poszter + kész vonal');
check(errs.length === 0, 'nincs JS hiba ' + errs.join('|'));
await b.close(); process.exit(ok ? 0 : 1);
