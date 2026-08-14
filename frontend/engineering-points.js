/* Engineering critical-point annotations. */
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const EPS = 1e-9;
  const XEPS = 1e-7;

  const sgn = v => Math.abs(Number(v)) < EPS ? 0 : (Number(v) > 0 ? 1 : -1);
  const sameX = (a,b) => Math.abs(Number(a)-Number(b)) < XEPS;

  function unique(points) {
    points.sort((a,b) => a.x-b.x);
    return points.filter((p,i) => !i || !sameX(p.x, points[i-1].x));
  }

  function interpolate(data,x) {
    if (!data.length) return 0;
    if (x <= data[0].x) return data[0].y;
    if (x >= data[data.length-1].x) return data[data.length-1].y;
    let lo=0, hi=data.length-1;
    while (lo+1<hi) {
      const m=(lo+hi)>>1;
      if (data[m].x<=x) lo=m; else hi=m;
    }
    const a=data[lo], b=data[hi], t=(x-a.x)/((b.x-a.x)||1);
    return a.y+(b.y-a.y)*t;
  }

  function crossings(data, excluded=[]) {
    const out=[];
    for(let i=0;i<data.length-1;i++) {
      const a=data[i], b=data[i+1], sa=sgn(a.y), sb=sgn(b.y);
      if(sa===0) {
        if(i>0 && sb!==0 && sgn(data[i-1].y)!==sb && !excluded.some(x=>sameX(x,a.x))) out.push({x:a.x,y:0});
      } else if(sb!==0 && sa!==sb) {
        const t=-a.y/(b.y-a.y);
        const x=a.x+(b.x-a.x)*t;
        if(!excluded.some(px=>sameX(px,x))) out.push({x,y:0});
      }
    }
    return unique(out);
  }

  function dangerous(sfd,jumps) {
    const out=[], excluded=[];
    for(const j of jumps||[]) {
      if(j.side!=='left') continue;
      const r=(jumps||[]).find(k=>k.side==='right' && sameX(k.x,j.x));
      if(!r) continue;
      const left=Number(j.shear_kN), right=Number(r.shear_kN);
      excluded.push(Number(j.x));
      if(sgn(left)!==0 && sgn(right)!==0 && sgn(left)!==sgn(right)) out.push({x:Number(j.x),y:0});
    }
    out.push(...crossings(sfd,excluded));
    return unique(out);
  }

  function chartScale(data) {
    const W=900,H=330,p={l:58,r:28,t:28,b:50};
    const xmin=Math.min(...data.map(d=>d.x)), xmax=Math.max(...data.map(d=>d.x));
    let ymin=Math.min(...data.map(d=>d.y),0), ymax=Math.max(...data.map(d=>d.y),0);
    let span=ymax-ymin;
    if(!Number.isFinite(span)||span===0){span=Math.max(1,Math.abs(ymax)||1);ymin-=span/2;ymax+=span/2;}
    else {ymin-=span*.08;ymax+=span*.08;}
    return {
      W,H,p,
      X:x=>p.l+(x-xmin)/(xmax-xmin||1)*(W-p.l-p.r),
      Y:y=>H-p.b-(y-ymin)/(ymax-ymin||1)*(H-p.t-p.b),
      zero:H-p.b-(0-ymin)/(ymax-ymin||1)*(H-p.t-p.b)
    };
  }

  function addStyle() {
    if(document.getElementById('engineering-point-style')) return;
    const s=document.createElement('style');
    s.id='engineering-point-style';
    s.textContent=`
      .engineering-points{pointer-events:none}
      .engineering-points .ep-line{stroke-width:1.5;stroke-dasharray:6 4}
      .engineering-points .ep-dot{stroke:#fff;stroke-width:2}
      .engineering-points .ep-label{font-size:11px;font-weight:700;paint-order:stroke;stroke-width:3px;stroke-linejoin:round}
      .engineering-points .danger{stroke:#ef4444;fill:#ef4444}
      .engineering-points .danger.ep-label{fill:#dc2626;stroke:#fff}
      body.dark .engineering-points .danger.ep-label{fill:#ff9a9a;stroke:#0b1016}
      .engineering-points .contra{stroke:#8b5cf6;fill:#8b5cf6}
      .engineering-points .contra.ep-label{fill:#7c3aed;stroke:#fff}
      body.dark .engineering-points .contra.ep-label{fill:#c8b8ff;stroke:#0b1016}
    `;
    document.head.appendChild(s);
  }

  function line(svg,x,cls,scale) {
    const e=document.createElementNS(NS,'line');
    e.setAttribute('x1',x);e.setAttribute('x2',x);
    e.setAttribute('y1',scale.p.t);e.setAttribute('y2',scale.H-scale.p.b);
    e.setAttribute('class',`ep-line ${cls}`);svg.appendChild(e);
  }

  function label(svg,x,y,cls,value) {
    const e=document.createElementNS(NS,'text');
    e.setAttribute('x',x);e.setAttribute('y',y);e.setAttribute('class',`ep-label ${cls}`);e.textContent=value;svg.appendChild(e);
  }

  function dot(svg,x,y,cls) {
    const e=document.createElementNS(NS,'circle');
    e.setAttribute('cx',x);e.setAttribute('cy',y);e.setAttribute('r',5);e.setAttribute('class',`ep-dot ${cls}`);svg.appendChild(e);
  }

  function annotateSFD() {
    const svg=document.querySelector('#sfd svg.chartSvg');
    if(!svg || typeof lastResult==='undefined' || !lastResult?.diagrams?.samples?.length) return;
    svg.querySelector('.engineering-points')?.remove();
    const samples=lastResult.diagrams.samples;
    const data=samples.map(s=>({x:Number(s.x),y:Number(s.shear_kN)})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
    if(data.length<2) return;
    const scale=chartScale(data), points=dangerous(data,lastResult.diagrams.jumps||[]);
    if(!points.length) return;
    const g=document.createElementNS(NS,'g');g.setAttribute('class','engineering-points');svg.appendChild(g);
    points.forEach((p,i)=>{
      const x=scale.X(p.x), y=scale.zero;
      line(g,x,'danger',scale);dot(g,x,y,'danger');
      label(g,x+8,y+(i%2?-16:18),'danger',`Dangerous section: x = ${fmt(displayValue(p.x,'pos'),3)} ${unitLabel('pos')}`);
    });
  }

  function annotateBMD() {
    const svg=document.querySelector('#bmd svg.chartSvg');
    if(!svg || typeof lastResult==='undefined' || !lastResult?.diagrams?.samples?.length) return;
    svg.querySelector('.engineering-points')?.remove();
    const samples=lastResult.diagrams.samples;
    const bmd=samples.map(s=>({x:Number(s.x),y:Number(s.moment_kNm)})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
    const sfd=samples.map(s=>({x:Number(s.x),y:Number(s.shear_kN)})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
    if(bmd.length<2||sfd.length<2) return;
    const scale=chartScale(bmd), g=document.createElementNS(NS,'g');g.setAttribute('class','engineering-points');svg.appendChild(g);

    const momentLoads=(typeof state!=='undefined'?state.loads:[]).filter(l=>kind(l.type)==='moment').map(l=>Number(l.position));
    crossings(bmd,momentLoads).forEach((p,i)=>{
      const x=scale.X(p.x), y=scale.zero;
      line(g,x,'contra',scale);dot(g,x,y,'contra');
      label(g,x+8,y+(i%2?-16:18),'contra',`Contraflexure: x = ${fmt(displayValue(p.x,'pos'),3)} ${unitLabel('pos')}`);
    });

    dangerous(sfd,lastResult.diagrams.jumps||[]).forEach((p,i)=>{
      const x=scale.X(p.x), m=interpolate(bmd,p.x), y=scale.Y(m);
      line(g,x,'danger',scale);dot(g,x,y,'danger');
      label(g,x+8,y+(i%2?18:-10),'danger',`At dangerous section: M = ${fmt(displayValue(m,'moment'),3)} ${unitLabel('moment')} (x = ${fmt(displayValue(p.x,'pos'),3)} ${unitLabel('pos')})`);
    });
  }

  function scan(){
    addStyle();
    annotateSFD();
    annotateBMD();
  }

  function boot(){
    scan();
    const hosts=['sfd','bmd'].map(id=>document.getElementById(id)).filter(Boolean);
    const observer=new MutationObserver(()=>requestAnimationFrame(scan));
    hosts.forEach(host=>observer.observe(host,{childList:true,subtree:true}));
    // Fallback for redraws performed outside the DOM observer and for print/report rendering.
    setInterval(scan,500);
    window.addEventListener('beforeprint',()=>{scan();setTimeout(scan,50);});
  }

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();