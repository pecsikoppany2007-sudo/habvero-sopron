// HabVero: a habzsák-vonal útvonala (dizajn.md 7.). Szakaszonként egy SVG, viewBox = a szakasz pixelmérete,
// a path pixelben, átméretezéskor újraírva. Itt csak a KÉSZ, álló vonal készül; a rajzolást (pathLength/dashoffset,
// scrub vagy időzített) a 13-as animátor teszi rá: minden path-ra `pathLength="1"` kerül, és a `hv:lines` esemény
// jelzi, ha az útvonalak újraíródtak.
//
// Mérés: offsetTop/offsetLeft lánc a szakaszig, sosem getBoundingClientRect (a szakaszok később dőlnek: measure-flat-lesson).

const R2 = (n) => Math.round(n * 2) / 2;          // fél pixelre: éles 1 px-es vonal
const f = (n) => (Math.round(n * 10) / 10).toString();

function rel(el, sec) {
  let x = 0, y = 0, n = el;
  while (n && n !== sec) { x += n.offsetLeft; y += n.offsetTop; n = n.offsetParent; }
  return { x, y, w: el.offsetWidth, h: el.offsetHeight };
}

// habrozetta spirál (dizajn.md 4.3), a tetején indul (ide fut be a vonal)
function rosette(cx, cy, R, n = 220) {
  let d = '';
  for (let i = 0; i <= n; i++) {
    const t = i / n, th = t * 2.5 * 2 * Math.PI;
    const r = R * (1 - 0.8 * t) * (0.82 + 0.18 * Math.cos(8 * th));
    d += ` L${f(cx + r * Math.cos(th - Math.PI / 2))} ${f(cy + r * Math.sin(th - Math.PI / 2))}`;
  }
  return d;
}

function margins(sec) {
  const w = sec.querySelector('.wrap') || sec;
  const r = rel(w, sec);
  const cs = getComputedStyle(w);
  const pl = parseFloat(cs.paddingLeft) || 0, pr = parseFloat(cs.paddingRight) || 0;
  return { l: R2(r.x + pl), r: R2(r.x + r.w - pr) };
}

const state = {
  nozzle: null,          // {x,y} a hero-szakasz koordinátáiban (a 3D modul jelenti)
  paths: {},             // név -> {svg, segs:{seg: path}}
};

const builders = {
  hero(sec, W, H) {
    const photo = sec.querySelector('[data-hero-photo] .slot');
    if (!photo) return {};
    const p = rel(photo, sec), o = 10;
    const tl = { x: R2(p.x - o), y: R2(p.y - o) }, br = { x: R2(p.x + p.w + o), y: R2(p.y + p.h + o) };
    // széles: a fotó a jobb félen, a vonal a csőrből le a keret bal ALSÓ sarkába, onnan körbe (BL > TL > TR > BR > BL);
    // keskeny: a keret bal felső sarkába, onnan körbe
    const wide = innerWidth >= 1100;
    state.heroTL = wide ? { x: tl.x, y: br.y } : tl;
    const frame = wide ? `M${tl.x} ${br.y} V${tl.y} H${br.x} V${br.y} H${tl.x}` : `M${tl.x} ${tl.y} H${br.x} V${br.y} H${tl.x} Z`;
    return { nozzle: nozzlePath(state.nozzle || posterNozzle(sec), state.heroTL), frame, drop: `M${tl.x} ${br.y} V${R2(H)}` };
  },
  kinalat(sec, W, H) {
    const m = margins(sec), out = { seam: `M${m.l} 0.5 H${m.r}` };
    sec.querySelectorAll('.idx__row').forEach((row) => {
      const r = rel(row, sec), y = R2(r.y + r.h) - 0.5;
      out['row:' + row.dataset.row] = `M${m.l} ${y} H${m.r}`;
    });
    return out;
  },
  alkotasok(sec, W, H) {
    const m = margins(sec), view = sec.querySelector('[data-turntable-view]');
    const out = { seam: `M${m.l} 0.5 H${m.r}` };
    if (view) { const v = rel(view, sec); out.strip = `M${m.l} ${R2(v.y + v.h) - 0.5} H${m.r}`; }
    out.rim = '';   // 13-as: a tortaforgó ellipszise
    return out;
  },
  kartya(sec, W, H) {
    const m = margins(sec);
    return { seam: `M${m.l} 0.5 H${m.r}` };
  },
  latogatas(sec, W, H) {
    const m = margins(sec), out = { seam: `M${m.l} 0.5 H${m.r}` };
    const im = sec.querySelector('[data-visit-photo] .dc__img');
    if (im) {
      // a varratból (keskenyen a szöveg alól) le a bolt-fotó kerete fölé, ott habrozettában áll meg
      const p = rel(im, sec), R = 12, cx = R2(p.x + p.w / 2), cy = p.y - 10 - 10 - R;
      const txt = sec.querySelector('.visit__txt');
      const y0 = innerWidth >= 1100 || !txt ? 0.5 : R2(rel(txt, sec).y + txt.offsetHeight) + 8.5;
      out.map = cy - R - y0 > 8 ? `M${cx} ${y0} V${f(cy - R)}` + rosette(cx, cy, R, 160) : `M${cx} ${f(cy - R)}` + rosette(cx, cy, R, 160);
    }
    return out;
  },
  footer(sec, W, H) {
    const cx = R2(W / 2), R = 32, cy = 72 + R;
    return { foot: `M${cx} 0 V${cy - R}` + rosette(cx, cy, R, 400) };
  },
};

function nozzlePath(n, tl) {
  if (!n || !tl) return '';
  if (innerWidth >= 1100) {
    // egy lágy S-ív le-jobbra a keret bal alsó sarkáig
    const dy = tl.y - n.y;
    return `M${f(n.x)} ${f(n.y)} C${f(n.x)} ${f(n.y + dy * 0.62)} ${f(tl.x)} ${f(tl.y - dy * 0.62)} ${f(tl.x)} ${f(tl.y)}`;
  }
  // keskeny: a keret bal élének vonalában fut le, nem keresztezi a szöveget
  const ky = Math.min(n.y + 90, tl.y);
  return `M${f(n.x)} ${f(n.y)} C${f(n.x)} ${f(n.y + 60)} ${f(tl.x)} ${f(ky - 50)} ${f(tl.x)} ${f(ky)} L${f(tl.x)} ${f(tl.y)}`;
}

function posterNozzle(sec) {
  const img = sec.querySelector('.hero__poster');
  const box = sec.querySelector('[data-hero-obj]');
  if (!img || !box) return null;
  const [fx, fy] = (img.dataset.nozzle || '0.383,0.712').split(',').map(Number);
  const b = rel(box, sec);
  // a poszter object-fit: contain a dobozban (négyzetes doboz, négyzetes poszter: nincs margó)
  const iw = img.naturalWidth || 1, ih = img.naturalHeight || 1, s = Math.min(b.w / iw, b.h / ih);
  const ox = (b.w - iw * s) / 2, oy = (b.h - ih * s) / 2;
  return { x: b.x + ox + fx * iw * s, y: b.y + oy + fy * ih * s };
}

function layout(svg) {
  const sec = svg.parentElement, name = svg.dataset.line, build = builders[name];
  if (!build) return;
  const W = sec.offsetWidth, H = sec.offsetHeight;
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const d = build(sec, W, H);
  const segs = {};
  svg.querySelectorAll('path[data-seg]').forEach((p) => {
    const key = p.dataset.row ? `${p.dataset.seg}:${p.dataset.row}` : p.dataset.seg;
    if (d[key] !== undefined) p.setAttribute('d', d[key]);
    if (!p.hasAttribute('pathLength')) p.setAttribute('pathLength', '1');
    segs[key] = p;
  });
  state.paths[name] = { svg, sec, segs };
}

let queued = new Set(), raf = 0;
function flush() {
  raf = 0;
  const done = [...queued]; queued.clear();
  done.forEach(layout);
  document.dispatchEvent(new CustomEvent('hv:lines', { detail: { names: done.map((s) => s.dataset.line) } }));
}
function queue(svg) { queued.add(svg); if (!raf) raf = requestAnimationFrame(flush); }

export function initLines() {
  const svgs = [...document.querySelectorAll('svg.pl[data-line]')];
  const ro = new ResizeObserver((entries) => {
    entries.forEach((e) => { const s = e.target.querySelector(':scope > svg.pl[data-line]'); if (s) queue(s); });
  });
  svgs.forEach((s) => { ro.observe(s.parentElement); queue(s); });
  // a hero-fotó és a poszter betöltése után újramérés
  document.querySelectorAll('.hero__poster, [data-hero-photo] img').forEach((im) => {
    if (!im.complete) im.addEventListener('load', () => relayout('hero'), { once: true });
  });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => svgs.forEach(queue));
  return state;
}

export function relayout(name) {
  document.querySelectorAll(name ? `svg.pl[data-line="${name}"]` : 'svg.pl[data-line]').forEach(queue);
}

// a 3D modul onNozzle(x, y) hívása: x, y CSS px a canvas bal felső sarkához képest
let canvasOff = null;
export function setNozzle(x, y, canvas) {
  const sec = document.getElementById('top');
  if (!sec || !canvas) return;
  // 13 animátor: pihenőben (érintésen) a csőrpont rögzítve, így a lebegés nem írja át képkockánként a path-t;
  // átméretezés után holdOpen-ig újra elfogadjuk (motion.js)
  if (state.hold && performance.now() > (state.holdOpen || 0)) return;
  if (!canvasOff) { canvasOff = rel(canvas, sec); addEventListener('resize', () => { canvasOff = null; }, { once: true }); }
  const c = canvasOff;
  const nx = c.x + x, ny = c.y + y;
  if (state.nozzle && Math.abs(state.nozzle.x - nx) < 0.25 && Math.abs(state.nozzle.y - ny) < 0.25) return;
  state.nozzle = { x: nx, y: ny };
  const p = state.paths.hero;
  if (p && p.segs.nozzle && state.heroTL) {
    // csak az első szakaszt írjuk újra, mérés nélkül (képkockánként olcsó)
    p.segs.nozzle.setAttribute('d', nozzlePath(state.nozzle, state.heroTL));
  } else relayout('hero');
}

export { state as lineState };
