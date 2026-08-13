/* BeamLab precision hover fix: use the rendered curve itself, not the solver's sample spacing. */
(() => {
  const parseNum = s => {
    const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  };
  function pointsFromPath(path) {
    const d = path?.getAttribute('d') || '', pts = [];
    const re = /([ML])\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;
    let m; while ((m = re.exec(d))) pts.push({x:Number(m[2]), y:Number(m[3])});
    return pts;
  }
  function interp(points, x) {
    if (!points.length) return null;
    if (x <= points[0].x) return points[0];
    if (x >= points[points.length-1].x) return points[points.length-1];
    let lo=0, hi=points.length-1;
    while (lo+1<hi) { const mid=(lo+hi)>>1; if(points[mid].x<=x) lo=mid; else hi=mid; }
    const a=points[lo], b=points[hi], t=(x-a.x)/(b.x-a.x || 1);
    return {x, y:a.y+(b.y-a.y)*t};
  }
  function install(wrap) {
    if (wrap.dataset.precisionHover==='1') return;
    const svg=wrap.querySelector('svg.chartSvg'), tip=wrap.querySelector('.chart-tooltip');
    if(!svg || !tip) return;
    const curve=svg.querySelector('path[class*="chart-line"]');
    if(!curve) return;
    const pts=pointsFromPath(curve); if(pts.length<2) return;
    const yGrid=[...svg.querySelectorAll('line.chart-grid')].filter(l=>l.getAttribute('x1')===l.getAttribute('x2'));
    const labels=[...svg.querySelectorAll('text.chart-label')];
    const xLabels=labels.filter(t=>Number(t.getAttribute('y'))>250);
    const yLabels=labels.filter(t=>Number(t.getAttribute('x'))<58);
    const xmin=parseNum(xLabels[0]?.textContent), xmax=parseNum(xLabels[xLabels.length-1]?.textContent);
    const ymin=parseNum(yLabels[yLabels.length-1]?.textContent), ymax=parseNum(yLabels[0]?.textContent);
    wrap.dataset.precisionHover='1';
    svg.addEventListener('mousemove',ev=>{
      const r=svg.getBoundingClientRect(), px=(ev.clientX-r.left)/r.width*900, p=interp(pts,px); if(!p)return;
      const x0=pts[0].x,x1=pts[pts.length-1].x;
      const xVal=Number.isFinite(xmin)&&Number.isFinite(xmax)?xmin+(p.x-x0)/(x1-x0||1)*(xmax-xmin):p.x;
      const topY=Number(yGrid[0]?.getAttribute('y1')),botY=Number(yGrid[yGrid.length-1]?.getAttribute('y1'));
      const yVal=Number.isFinite(ymin)&&Number.isFinite(ymax)?ymin+(botY-p.y)/(botY-topY||1)*(ymax-ymin):p.y;
      const type=svg.dataset.chart;
      const yUnit=type==='bmd'?'kN·m':type==='sfd'?'kN':type==='deflection'?'mm':'rad';
      const xUnit=xLabels[0]?.textContent.match(/[a-zA-Z]+/)?.[0]||'m';
      tip.textContent=`x: ${xVal.toFixed(2)} ${xUnit} · ${yVal.toFixed(4)} ${yUnit}`;
      tip.classList.remove('hidden');
      const pct=(p.x-x0)/(x1-x0||1)*100; tip.style.left=`${Math.min(75,Math.max(2,pct))}%`; tip.style.top='8px';
    },{passive:true});
    svg.addEventListener('mouseleave',()=>tip.classList.add('hidden'));
  }
  const scan=()=>document.querySelectorAll('.chartWrap').forEach(install);
  new MutationObserver(scan).observe(document.body,{childList:true,subtree:true});
  setTimeout(scan,300); setTimeout(scan,1000);
})();
