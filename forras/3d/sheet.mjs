import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const [,, url, prefix, w, h, steps, mobile] = process.argv;
const b = await chromium.launch({ args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
const ctx = await b.newContext({ viewport:{width:+w,height:+h}, deviceScaleFactor:1, isMobile:!!mobile, hasTouch:!!mobile });
await ctx.addInitScript({ path: process.env.CLOCK });
const p = await ctx.newPage();
p.on('pageerror', e=>console.log('pageerror:', e.message));
await p.goto(url); await p.waitForFunction(()=>window.mounted, null, {timeout:60000, polling:100});
let prev=0;
let idx=0; for (const s of steps.split('|')) { idx++;
  const i=s.indexOf(':'), kind=s.slice(0,i), val=s.slice(i+1);
  if (kind==='t') { await p.evaluate(ms=>window.__advance(ms), +val-prev); prev=+val; }
  if (kind==='scroll') { await p.evaluate(y=>{window.scrollTo(0,y);window.dispatchEvent(new Event('scroll'));}, +val); await p.evaluate(()=>window.__advance(1500)); }
  if (kind==='js') { await p.evaluate(val); await p.evaluate(()=>window.__advance(50)); }
  await p.screenshot({ path: `${prefix}-${idx}.png` });
}
console.log(JSON.stringify(await p.evaluate(()=>({stats:ctl&&ctl.stats(),p:ctl&&ctl.progress, ready:document.getElementById('hero3d').dataset.ready}))));
await b.close();
