/* Engineering critical-point annotations. No document-wide observer: app.js owns rendering. */
(() => {
  const W=900,H=330,pad={l:58,r:28,t:28,b:50},EPS=1e-9;
  const sign=v=>Math.abs(v)<EPS?0:v>0?1:-1;
  const unique=a=>{a.sort((p,q)=>p.x-q.x);return a.filter((p,i)=>!i||Math.abs(p.x-a[i-1].x)>1e-7)};
  const interp=(d,x)=>{if(!d.length)return 0;if(x<=d[0].x)return d[0].y;if(x>=d[d.length-1].x)return d[d.length-1].y;let lo=0,hi=d.length-1;while(lo+1<hi){const m=(lo+hi)>>1;if(d[m].x<=x)lo=m;else hi=m}const a=d[lo],b=d[hi],t=(x-a.x)/(b.x-a.x||1);return a.y+(b.y-a.y)*t};
  function dangerous(d,jumps){
    const out=[];
    for(const j of jumps||[]){if(j.side!=='left')continue;const r=(jumps||[]).find(k=>k.side==='right'&&Math.abs(Number(k.x)-Number(j.x))<1e-8);if(r&&sign(Number(j.shear_kN))&&sign(Number(r.shear_kN))!==sign(Number(j.shear_kN)))out.push({x:Number(j.x),y:0})}
    const jumpXs=new Set((jumps||[]).map(j=>Number(j.x).toFixed(8)));
    for(let i=0;i<d.length-1;i++){const a=d[i],b=d[i+1];if(jumpXs.has(Number(b.x).toFixed(8)))continue;const sa=sign(a.y),sb=sign(b.y);if(sa&&sb&&sa!==sb){const t=-a.y/(b.y-a.y);out.push({x:a.x+(b.x-a.x)*t,y:0})}}
    return unique(out);
  }
  function crossings(d){const out=[];for(let i=0;i<d.length-1;i++){const a=d[i],b=d[i+1],sa=sign(a.y),sb=sign(b.y);if(sa&&sb&&sa!==sb){const t=-a.y/(b.y-a.y);out.push({x:a.x+(b.x-a.x)*t,y:0})}}return unique(out)}
  function scale(d){let xmin=Math.min(...d.map(p=>p.x)),xmax=Math.max(...d.map(p=>p.x)),ymin=Math.min(...d.map(p=>p.y),0),ymax=Math.max(...d.map(p=>p.y),0),span=ymax-ymin;if(!isFinite(span)||span===0){const s=Math.max(1,Math.abs(ymax)||1);ymin-=s/2;ymax+=s/2}else{ymin-=span*.08;ymax+=span*.08}return{x:x=>pad.l+(x-xmin)/(xmax-xmin||1)*(W-pad.l-pad.r),y:y=>H-pad.b-(y-ymin)/(ymax-ymin)*(H-pad.t-pad.b)}}
  function addStyle(){if(document.getElementById('eng-point-style'))return;const s=document.createElement('style');s.id='eng-point-style';s.textContent='.eng-line{stroke-width:1.4;stroke-dasharray:6 4;pointer-events:none}.eng-dot{stroke:#fff;stroke-width:2;pointer-events:none}.eng-label{font-size:10px;font-weight:750;paint-order:stroke;stroke-width:3px;stroke-linejoin:round;pointer-events:none}.eng-danger{stroke:#ff6b6b;fill:#ff6b6b}.eng-label.eng-danger{fill:#ff9a9a;stroke:#0b1016}.eng-contra{stroke:#b69cff;fill:#b69cff}.eng-label.eng-contra{fill:#c8b8ff;stroke:#0b1016}body:not(.dark) .eng-label.eng-danger{fill:#dc2626;stroke:#fff}body:not(.dark) .eng-label.eng-contra{fill:#7c3aed;stroke:#fff}';document.head.appendChild(s)}
  function annotate(id){
    if(typeof lastResult==='undefined'||!lastResult?.diagrams?.samples?.length)return;
    const svg=document.querySelector(`#${id} svg.chartSvg`);if(!svg)return;svg.querySelector('.engineering-points')?.remove();
    const samples=lastResult.diagrams.samples,d=samples.map(s=>({x:Number(s.x),y:Number(id==='sfd'?s.shear_kN:s.moment_kNm)})).filter(p=>isFinite(p.x)&&isFinite(p.y));if(d.length<2)return;
    const sc=scale(d),zero=sc.y(0);let html='';
    if(id==='sfd') dangerous(d,lastResult.diagrams.jumps||[]).forEach((p,i)=>{const x=sc.x(p.x);html+=`<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${H-pad.b}" class="eng-line eng-danger"/><circle cx="${x}" cy="${zero}" r="5" class="eng-dot eng-danger"/><text x="${x+8}" y="${zero+(i%2?-16:18)}" class="eng-label eng-danger">Dangerous section: x = ${fmt(displayValue(p.x,'pos'),3)} ${unitLabel('pos')}</text>`});
    else {
      const momentXs=new Set((typeof state!=='undefined'?state.loads:[]).filter(l=>String(l.type||'').trim().toLowerCase().replaceAll(' ','_').replaceAll('-','_')==='moment').map(l=>Number(l.position).toFixed(8));
      crossings(d).filter(p=>!momentXs.has(Number(p.x).toFixed(8))).forEach((p,i)=>{const x=sc.x(p.x);html+=`<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${H-pad.b}" class="eng-line eng-contra"/><circle cx="${x}" cy="${zero}" r="5" class="eng-dot eng-contra"/><text x="${x+8}" y="${zero+(i%2?-16:18)}" class="eng-label eng-contra">Contraflexure: x = ${fmt(displayValue(p.x,'pos'),3)} ${unitLabel('pos')}</text>`});
      const sd=samples.map(s=>({x:Number(s.x),y:Number(s.shear_kN)})).filter(p=>isFinite(p.x)&&isFinite(p.y));
      dangerous(sd,lastResult.diagrams.jumps||[]).forEach((p,i)=>{const m=interp(d,p.x),x=sc.x(p.x),y=sc.y(m);html+=`<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${H-pad.b}" class="eng-line eng-danger"/><circle cx="${x}" cy="${y}" r="5" class="eng-dot eng-danger"/><text x="${x+8}" y="${y+(i%2?18:-10)}" class="eng-label eng-danger">At dangerous section: M = ${fmt(displayValue(m,'moment'),3)} ${unitLabel('moment')} (x = ${fmt(displayValue(p.x,'pos'),3)} ${unitLabel('pos')})</text>`});
    }
    if(html){const g=document.createElementNS('http://www.w3.org/2000/svg','g');g.classList.add('engineering-points');g.innerHTML=html;svg.appendChild(g)}
  }
  function scan(){addStyle();annotate('sfd');annotate('bmd')}
  const old=renderAllCharts;renderAllCharts=function(){old();requestAnimationFrame(scan)};
  requestAnimationFrame(scan);
})();
