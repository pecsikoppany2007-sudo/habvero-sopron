(()=>{let t=1000;const q=[];const realNow=performance.now.bind(performance);
performance.now=()=>t;window.requestAnimationFrame=f=>{q.push(f);return q.length};window.cancelAnimationFrame=()=>{};
window.__advance=ms=>{const end=t+ms;while(t<end-1e-6){t=Math.min(end,t+16.667);const fs=q.splice(0);fs.forEach(f=>f(t));}};})();
