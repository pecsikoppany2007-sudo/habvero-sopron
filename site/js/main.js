// HabVero: alap működés (12 fejlesztő). Mozgás nincs itt: az a js/motion.js-ben (13 animátor).
// Gyökér-jelzők a <html>-en (a <head> inline scriptje teszi): rich | touch | still, is-gpu-soft,
// intro-on / intro-started / no-intro, is-menu-open. Komponens-osztály sosem egyezik ezekkel.
import { initLines, relayout, setNozzle, lineState } from './line.js?v=4';

const root = document.documentElement;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
let i18n = {};
try { i18n = JSON.parse(($('#i18n') || {}).textContent || '{}'); } catch (e) { /* üres szótár */ }

const HV = (window.HV = { root, lines: lineState, relayout, setNozzle, hero: null, i18n });

/* ---------- Budapest idő (EU nyári időszámítás szabállyal; az Intl timeZone lassú telefonon) ---------- */
function lastSundayUTC(y, m) { const d = new Date(Date.UTC(y, m + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d; }
export function budapestNow(now = new Date()) {
  const y = now.getUTCFullYear();
  const off = now >= lastSundayUTC(y, 2) && now < lastSundayUTC(y, 9) ? 2 : 1;
  const b = new Date(now.getTime() + off * 3600e3);
  return { dow: b.getUTCDay(), min: b.getUTCHours() * 60 + b.getUTCMinutes(), sec: b.getUTCSeconds() };
}
export function openState({ dow, min }) {
  if (dow >= 1 && dow <= 5) {
    if (min < 540) return ['closed_today', false];
    if (min < 1020) return ['open_now_17', true];
    return ['closed_tomorrow', false];          // pénteken is: szombaton 9-kor nyit
  }
  if (dow === 6) {
    if (min < 540) return ['closed_today', false];
    if (min < 720) return ['open_now_12', true];
    return ['closed_monday', false];
  }
  return ['closed_monday', false];
}

function tickOpen() {
  const now = budapestNow();
  const [key, open] = openState(now);
  $$('[data-open]').forEach((el) => {
    const t = el.querySelector('[data-open-text]');
    if (t && i18n[key] && t.textContent !== i18n[key]) t.textContent = i18n[key];
    el.classList.toggle('is-open', open);
    el.hidden = !i18n[key];
  });
  $$('[data-hours] tr[data-day]').forEach((tr) => {
    const today = Number(tr.dataset.day) === now.dow;
    tr.classList.toggle('is-today', today);
    const lbl = tr.querySelector('.hours__today'); if (lbl) lbl.hidden = !today;
  });
  clearTimeout(tickOpen.t);
  tickOpen.t = setTimeout(tickOpen, (60 - now.sec) * 1000 + 50);
}

/* ---------- menü (telefon/tablet fólia) ---------- */
function initMenu() {
  const btn = $('[data-menu-toggle]'), nav = $('[data-menu]');
  if (!btn || !nav) return;
  const lOpen = btn.querySelector('[data-menu-l="open"]'), lClose = btn.querySelector('[data-menu-l="close"]');
  const set = (open, focus = true) => {
    root.classList.toggle('is-menu-open', open);
    btn.setAttribute('aria-expanded', String(open));
    lOpen.hidden = open; lClose.hidden = !open;
    if (open && focus) { const a = nav.querySelector('a'); a && a.focus({ preventScroll: true }); }
    if (!open && focus) btn.focus({ preventScroll: true });
    document.dispatchEvent(new CustomEvent('hv:menu', { detail: { open } }));
  };
  btn.addEventListener('click', () => set(!root.classList.contains('is-menu-open')));
  nav.addEventListener('click', (e) => { if (e.target.closest('a') && root.classList.contains('is-menu-open')) set(false, false); });
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.classList.contains('is-menu-open')) set(false); });
  matchMedia('(min-width: 1100px)').addEventListener('change', (m) => { if (m.matches && root.classList.contains('is-menu-open')) set(false, false); });
}

/* ---------- fejléc alsó vonala görgetés után ---------- */
function initHeader() {
  const hd = $('[data-hd]'); if (!hd) return;
  let raf = 0;
  const upd = () => { raf = 0; hd.classList.toggle('is-scrolled', scrollY > 8); };
  addEventListener('scroll', () => { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
  upd();
}

/* ---------- 3D hero (14 3D specialista: js/hero3d.js) ---------- */
function initHero() {
  const canvas = $('#hero3d');
  if (!canvas) return;
  const stage = canvas.closest('[data-hero-stage]');
  if (root.classList.contains('still')) { canvas.remove(); return; }
  const live = () => { stage && stage.classList.add('is-live'); document.dispatchEvent(new CustomEvent('hv:hero-live')); };
  if (canvas.hasAttribute('data-ready')) live();
  new MutationObserver((m, o) => { if (canvas.hasAttribute('data-ready')) { live(); o.disconnect(); } })
    .observe(canvas, { attributes: true, attributeFilter: ['data-ready'] });
  canvas.addEventListener('hero3d:ready', live, { once: true });

  const start = async () => {
    try {
      const m = await import('./hero3d.js?v=4');
      if (typeof m.mountHero !== 'function') throw new Error('mountHero hiányzik');
      HV.hero = await m.mountHero(canvas, {
        onNozzle: (x, y) => setNozzle(x, y, canvas),
        // 13 animátor: a szómárka és a #line-nozzle visszahúzása ezekre szinkronizál
        onExit: (p) => { HV.heroExit = p; document.dispatchEvent(new CustomEvent('hv:hero-exit', { detail: p })); },
        onIntroDone: () => document.dispatchEvent(new CustomEvent('hv:hero-intro-done')),
      });
      if (!HV.hero) { root.classList.add('is-hero-fallback'); canvas.hidden = true; return; }   // kapu: poszter marad
      document.dispatchEvent(new CustomEvent('hv:hero-mounted', { detail: HV.hero }));
    } catch (err) {
      // tartalék: a poszter marad, a vonal a poszter csőréből indul
      root.classList.add('is-hero-fallback');
      canvas.hidden = true;
      console.warn('[hero3d] poszter marad:', err && err.message);
    }
  };
  const poster = $('.hero__poster');
  const go = () => ('requestIdleCallback' in window ? requestIdleCallback(start, { timeout: 1500 }) : setTimeout(start, 200));
  if (poster && poster.decode) poster.decode().then(go, go); else go();
}

/* ---------- indulás ---------- */
initMenu();
initHeader();
tickOpen();
initLines();
initHero();
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickOpen(); });

// 13 animátor: a motion.js `initMotion(HV)`-t exportál; ha még üres, semmi nem történik.
import('./motion.js?v=4').then((m) => m.initMotion && m.initMotion(HV)).catch((err) => console.warn('[motion]', err && err.message));
