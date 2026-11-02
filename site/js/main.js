// HabVero: alap működés (12 fejlesztő). Mozgás nincs itt: az a js/motion.js-ben (13 animátor).
// Gyökér-jelzők a <html>-en (a <head> inline scriptje teszi): rich | touch | still, is-gpu-soft,
// intro-on / intro-started / no-intro, is-menu-open. Komponens-osztály sosem egyezik ezekkel.

const root = document.documentElement;
const $ = (s, c = document) => c.querySelector(s);
const $$ = (s, c = document) => [...c.querySelectorAll(s)];
let i18n = {};
try { i18n = JSON.parse(($('#i18n') || {}).textContent || '{}'); } catch (e) { /* üres szótár */ }

const HV = (window.HV = { root, i18n });

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

/* ---------- élő óra a jobb szélen (Budapest idő, másodpercenként, csak ha látszik) ---------- */
function initClock() {
  const el = $('[data-clock]'); if (!el || !matchMedia('(min-width: 1100px)').matches) return;
  const p = (n) => String(n).padStart(2, '0');
  const run = () => {
    const { min, sec } = budapestNow();
    el.textContent = `${p(Math.floor(min / 60))}:${p(min % 60)}:${p(sec)}`;
    initClock.t = setTimeout(run, 1000 - (Date.now() % 1000) + 5);
  };
  run();
}

/* ---------- indulás ---------- */
initMenu();
initHeader();
tickOpen();
initClock();
document.addEventListener('visibilitychange', () => { if (!document.hidden) tickOpen(); });

// 13 animátor: a motion.js `initMotion(HV)`-t exportál; ha még üres, semmi nem történik.
import('./motion.js?v=5').then((m) => m.initMotion && m.initMotion(HV)).catch((err) => console.warn('[motion]', err && err.message));
