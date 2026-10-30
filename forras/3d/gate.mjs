import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
for (const args of [['--disable-webgl','--disable-3d-apis'], ['--use-angle=swiftshader','--enable-unsafe-swiftshader']]) {
  const b = await chromium.launch({ args });
  const p = await b.newPage();
  await p.goto('http://localhost:8765/site/img/hero-poster-900.webp');
  const r = await p.evaluate(async()=>{ const m=await import('/site/js/hero3d.js'); const c=document.createElement('canvas'); document.body.append(c);
    return { probe: m.probe(), mounted: (await m.mountHero(c,{})) !== null }; });
  console.log(args[0], JSON.stringify(r)); await b.close();
}
