/* BeamLab consolidated fixes.
   All formerly separate visual/precision/engineering patches live here.
   No MutationObservers, polling loops, or duplicate event handlers.
*/
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const EPS = 1e-9;
  const num = v => Number(String(v ?? '').replace(/,/g, '')) || 0;
  const el = (name, attrs = {}) => {
    const e = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
    return e;
  };
  const sign = v => Math.abs(Number(v)) < EPS ? 0 : (Number(v) > 0 ? 1 : -1);

  window.prepareAnalysisModel = function () { return clone(state); };

  window.supportSymbol = function(type, x, y) {
    if (type === 'internal_hinge') return `<g><circle cx="${x}" cy="${y}" r="11" class="hinge-ring"/><circle cx="${x}" cy="${y}" r="4" class="hinge-core"/></g>`;
    if (type === 'fixed') {
      const L = Math.max(typeof totalLength === 'function' ? totalLength() : 1, 1);
      const isRight = Math.abs(Number(x) - 1030) < 1e-6;
      const hatchDir = isRight ? 1 : -1;
      let hatch = '';
      for (let yy = y - 24; yy <= y + 24; yy += 12) hatch += `<line x1="${x}" y1="${yy}" x2="${x + hatchDir * 22}" y2="${yy - 8}"/>`;
      return `<g class="fixed-symbol"><line x1="${x}" y1="${y-30}" x2="${x}" y2="${y+30}"/>${hatch}</g>`;
    }
    const tri = `<path d="M ${x-18} ${y+20} L ${x} ${y-10} L ${x+18} ${y+20} Z" class="support-triangle"/>`;
    return type === 'roller' ? `${tri}<circle cx="${x-8}" cy="${y+25}" r="5" class="roller"/><circle cx="${x+8}" cy="${y+25}" r="5" class="roller"/>` : tri;
  };

  function beamGeometry(svg) {
    const beam = svg?.querySelector('.beam-line'), width = svg?.viewBox?.baseVal?.width || 1100;
    const L = Math.max(typeof totalLength === 'function' ? totalLength() : 1, 1), pad = 70;
    return { beamY: num(beam?.getAttribute('y1')) || 105, width, pad, L, X: p => pad + Number(p) * (width - 2 * pad) / L };
  }
  function arrowHead(x1,y1,x2,y2,size=8){const dx=x2-x1,dy=y2-y1,len=Math.hypot(dx,dy)||1,ux=dx/len,uy=dy/len,px=-uy,py=ux;return `M ${x2} ${y2} L ${x2-ux*size+px*size*.65} ${y2-uy*size+py*size*.65} L ${x2-ux*size-px*size*.65} ${y2-uy*size-py*size*.65} Z`;}

  function repairPointLoad(g, load, geom) {
    if (!g || !load) return;
    const x=geom.X(load.position), endpointY=geom.beamY-4, value=num(load.value), angle=num(load.angle), positive=value>=0, t=angle*Math.PI/180;
    let dx=-Math.sin(t),dy=Math.cos(t); if(!positive){dx=-dx;dy=-dy;}
    const len=76,hx=positive?x:x+dx*len,hy=positive?endpointY:endpointY+dy*len,tx=positive?hx-dx*len:x,ty=positive?hy-dy*len:endpointY;
    while(g.firstChild)g.removeChild(g.firstChild);g.appendChild(el('line',{x1:tx,y1:ty,x2:hx,y2:hy}));g.appendChild(el('path',{d:arrowHead(tx,ty,hx,hy),class:'point-arrow-head'}));
    const label=el('text',{x:positive?tx:hx,y:Math.min(ty,hy)-8,'text-anchor':'middle'});label.textContent=`${value<0?'-':''}${fmt(Math.abs(value),3)} ${unitLabel('force')}${angle?` @ ${Math.abs(angle)}°`:''}`;g.appendChild(label);
  }
  function repairMoment(g,load,geom){if(!g||!load)return;while(g.firstChild)g.removeChild(g.firstChild);const x=geom.X(load.position),positive=num(load.value)>=0;const icon=el('text',{x,y:geom.beamY-38,'text-anchor':'middle','dominant-baseline':'central','font-family':'Segoe UI Symbol, Arial Unicode MS, DejaVu Sans, sans-serif','font-size':'48','font-weight':'400',class:'moment-sign-symbol'});icon.textContent=positive?'↺':'↻';g.appendChild(icon);const label=el('text',{x,y:geom.beamY-78,'text-anchor':'middle',class:'moment-load-label'});label.textContent=`${num(load.value)<0?'-':''}${fmt(Math.abs(num(load.value)),3)} ${unitLabel('moment')}`;g.appendChild(label);}
  function repairUDL(g,load,geom){
    if(!g||!load||kind(load.type)!=='udl')return;const q0=num(load.value),q1=num(load.value2??load.value),x0=geom.X(load.position),x1=geom.X(load.to);while(g.firstChild)g.removeChild(g.firstChild);
    const amp=62,maxQ=Math.max(Math.abs(q0),Math.abs(q1),1),count=Math.max(8,Math.min(18,Math.ceil(Math.abs(x1-x0)/35))),yFor=q=>geom.beamY-Math.sign(q)*Math.min(Math.abs(q)/maxQ,1)*amp,envelope=[];
    for(let i=0;i<=count;i++){const t=i/count,x=x0+(x1-x0)*t,q=q0+(q1-q0)*t;envelope.push([x,yFor(q)]);}g.appendChild(el('line',{x1:x0,y1:envelope[0][1],x2:x1,y2:envelope.at(-1)[1]}));
    const arrows=Math.max(7,Math.min(14,Math.round(Math.abs(x1-x0)/34)+1));for(let i=0;i<arrows;i++){const t=arrows===1?0:i/(arrows-1),x=x0+(x1-x0)*t,q=q0+(q1-q0)*t;if(Math.abs(q)<EPS)continue;const dir=q>0?1:-1,y=yFor(q),endY=geom.beamY-dir*4;g.appendChild(el('line',{x1:x,y1:y,x2:x,y2:endY}));g.appendChild(el('path',{d:dir>0?`M ${x-5} ${endY-9} L ${x} ${endY} L ${x+5} ${endY-9}`:`M ${x-5} ${endY+9} L ${x} ${endY} L ${x+5} ${endY+9}`}));}
    const label=el('text',{x:(x0+x1)/2,y:q0<=0&&q1<=0?Math.max(...envelope.map(p=>p[1]))+22:Math.min(...envelope.map(p=>p[1]))-12,'text-anchor':'middle'}),a=Math.abs(q0),b=Math.abs(q1);label.textContent=q0>=0&&q1>=0?`${fmt(a,3)} → ${fmt(b,3)} ${unitLabel('force')}/${unitLabel('length')}`:q0<=0&&q1<=0?`−${fmt(a,3)} → −${fmt(b,3)} ${unitLabel('force')}/${unitLabel('length')}`:`${q0<0?'−':''}${fmt(a,3)} → ${q1<0?'−':''}${fmt(b,3)} ${unitLabel('force')}/${unitLabel('length')}`;g.appendChild(label);
  }
  function repairBeamVisuals(){
    const canvas=document.querySelector('#beamCanvas'),svg=canvas?.querySelector('svg');if(!svg)return;const geom=beamGeometry(svg);
    const points=(state.loads||[]).filter(l=>{const t=kind(l.type);return t==='point'||t==='point_load';}),udls=(state.loads||[]).filter(l=>kind(l.type)==='udl'),moments=(state.loads||[]).filter(l=>kind(l.type)==='moment');
    svg.querySelectorAll('g.point-load').forEach((g,i)=>repairPointLoad(g,points[i],geom));svg.querySelectorAll('g.udl-load').forEach((g,i)=>repairUDL(g,udls[i],geom));svg.querySelectorAll('g.moment-load').forEach((g,i)=>repairMoment(g,moments[i],geom));
    svg.querySelectorAll('.support-label').forEach(e=>e.setAttribute('y',geom.beamY+48));svg.querySelectorAll('.position-label').forEach(e=>e.setAttribute('y',geom.beamY+64));
    svg.querySelector('.detailed-dimensions')?.remove();if(!showDimensions)return;const positions=[0,geom.L];(state.supports||[]).forEach(s=>positions.push(Number(s.position)));(state.loads||[]).forEach(l=>{positions.push(Number(l.position));if(kind(l.type)==='udl')positions.push(Number(l.to));});
    const xs=[...new Set(positions.filter(Number.isFinite).filter(x=>x>=0&&x<=geom.L).map(x=>Math.round(x*1e9)/1e9))].sort((a,b)=>a-b);if(xs.length<2)return;const g=el('g',{class:'detailed-dimensions'}),y=geom.beamY+100;g.appendChild(el('line',{x1:geom.X(0),y1:y,x2:geom.X(geom.L),y2:y,class:'dimension-line'}));
    xs.forEach(p=>{const x=geom.X(p);g.appendChild(el('line',{x1:x,y1:y-6,x2:x,y2:y+6,class:'dimension-tick'}));const t=el('text',{x,y:y+25,'text-anchor':'middle',class:'dimension-point-label'});t.textContent=`${fmt(displayValue(p,'pos'),3)} ${unitLabel('pos')}`;g.appendChild(t);});
    const oy=y+45;g.appendChild(el('line',{x1:geom.X(0),y1:oy,x2:geom.X(geom.L),y2:oy,class:'dimension-overall-line'}));const t=el('text',{x:(geom.X(0)+geom.X(geom.L))/2,y:oy+20,'text-anchor':'middle',class:'dimension-text'});t.textContent=`${fmt(displayValue(geom.L,'length'),3)} ${unitLabel('length')}`;g.appendChild(t);svg.appendChild(g);
  }
  const originalRenderBeam=window.renderBeam;window.renderBeam=function(){originalRenderBeam();repairBeamVisuals();};

  window.attachChartInteraction=function(elm,data,type){
    const svg=elm.querySelector('svg'),tip=elm.querySelector('.chart-tooltip');if(!svg||!tip)return;
    const interpolate=x=>{if(x<=data[0].x)return data[0];if(x>=data.at(-1).x)return data.at(-1);let lo=0,hi=data.length-1;while(lo+1<hi){const m=(lo+hi)>>1;if(data[m].x<=x)lo=m;else hi=m;}const a=data[lo],b=data[hi],t=(x-a.x)/(b.x-a.x||1);return{x,y:a.y+(b.y-a.y)*t};};
    svg.addEventListener('mousemove',ev=>{const r=svg.getBoundingClientRect(),px=(ev.clientX-r.left)/r.width*900,pad={l:58,r:28},xmin=data[0].x,xmax=data.at(-1).x,xx=xmin+(px-pad.l)/(900-pad.l-pad.r)*(xmax-xmin),n=interpolate(Math.max(xmin,Math.min(xmax,xx)));tip.textContent=`x: ${fmt(displayValue(n.x,'pos'),3)} ${unitLabel('pos')} · ${fmt(displayChartY(n.y,type),4)} ${chartUnit(type)}`;tip.classList.remove('hidden');tip.style.left=`${Math.min(75,Math.max(2,(n.x-xmin)/(xmax-xmin||1)*100))}%`;tip.style.top='8px';});
    svg.addEventListener('mouseleave',()=>tip.classList.add('hidden'));svg.addEventListener('click',ev=>{const r=svg.getBoundingClientRect(),px=(ev.clientX-r.left)/r.width*900,pad={l:58,r:28},xmin=data[0].x,xmax=data.at(-1).x,xx=xmin+(px-pad.l)/(900-pad.l-pad.r)*(xmax-xmin);lastResult=lastResult||{};lastResult.poiX=Math.max(xmin,Math.min(xmax,xx));renderAllCharts();});
  };

  function uniqueByX(a){a.sort((p,q)=>p.x-q.x);return a.filter((p,i)=>i===0||Math.abs(p.x-a[i-1].x)>1e-7);}
  function zeros(data,exclude=[]){const out=[];for(let i=0;i<data.length-1;i++){const a=data[i],b=data[i+1],sa=sign(a.y),sb=sign(b.y);if(sa===0){if(i>0&&sb!==0&&sign(data[i-1].y)!==sb&&!exclude.some(x=>Math.abs(x-a.x)<1e-7))out.push({x:a.x,y:0});continue;}if(sb===0||sa===sb)continue;const t=-a.y/(b.y-a.y),x=a.x+(b.x-a.x)*t;if(!exclude.some(px=>Math.abs(px-x)<1e-7))out.push({x,y:0});}return uniqueByX(out);}
  function dangerous(sfd,jumps){const jumpXs=[],out=[];(jumps||[]).forEach(j=>{if(j.side!=='left')return;const r=(jumps||[]).find(k=>k.side==='right'&&Math.abs(k.x-j.x)<1e-8);if(!r)return;jumpXs.push(Number(j.x));if(sign(j.y)!==0&&sign(r.y)!==0&&sign(j.y)!==sign(r.y))out.push({x:Number(j.x),y:0});});out.push(...zeros(sfd,jumpXs));return uniqueByX(out);}
  function interpolate(data,x){if(x<=data[0].x)return data[0].y;if(x>=data.at(-1).x)return data.at(-1).y;let lo=0,hi=data.length-1;while(lo+1<hi){const m=(lo+hi)>>1;if(data[m].x<=x)lo=m;else hi=m;}const a=data[lo],b=data[hi],t=(x-a.x)/(b.x-a.x||1);return a.y+(b.y-a.y)*t;}
  function annotateChart(id,samples){
    const svg=document.querySelector(`#${id} svg.chartSvg`);if(!svg||!samples?.length)return;svg.querySelector('.engineering-points')?.remove();const data=samples.map(s=>({x:Number(s.x),y:Number(id==='sfd'?s.shear_kN:s.moment_kNm)})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));if(data.length<2)return;
    const W=900,H=330,pad={l:58,r:28,t:28,b:50},xmin=data[0].x,xmax=data.at(-1).x;let ymin=Math.min(...data.map(p=>p.y),0),ymax=Math.max(...data.map(p=>p.y),0);[ymin,ymax]=niceScale(ymin,ymax);const X=x=>pad.l+(x-xmin)/(xmax-xmin||1)*(W-pad.l-pad.r),Y=y=>H-pad.b-(y-ymin)/(ymax-ymin||1)*(H-pad.t-pad.b),zero=Y(0),g=el('g',{class:'engineering-points'});
    const line=(x,c)=>g.appendChild(el('line',{x1:X(x),y1:pad.t,x2:X(x),y2:H-pad.b,class:`eng-line ${c}`}));const label=(x,y,c,s)=>{const t=el('text',{x:X(x)+8,y,class:`eng-label ${c}`});t.textContent=s;g.appendChild(t);};
    if(id==='sfd')dangerous(samples.map(s=>({x:Number(s.x),y:Number(s.shear_kN)})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),lastResult?.diagrams?.jumps||[]).forEach((p,i)=>{line(p.x,'eng-danger');g.appendChild(el('circle',{cx:X(p.x),cy:zero,r:5,class:'eng-dot eng-danger'}));label(p.x,zero+(i%2?-16:18),'eng-danger',`Dangerous section: x = ${fmt(displayValue(p.x,'pos'),3)} ${unitLabel('pos')}`);});
    if(id==='bmd'){const sfd=samples.map(s=>({x:Number(s.x),y:Number(s.shear_kN)})).filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)),momentXs=(state.loads||[]).filter(l=>kind(l.type)==='moment').map(l=>Number(l.position));zeros(data,momentXs).forEach((p,i)=>{line(p.x,'eng-contra');g.appendChild(el('circle',{cx:X(p.x),cy:zero,r:5,class:'eng-dot eng-contra'}));label(p.x,zero+(i%2?-16:18),'eng-contra',`Contraflexure: x = ${fmt(displayValue(p.x,'pos'),3)} ${unitLabel('pos')}`);});dangerous(sfd,lastResult?.diagrams?.jumps||[]).forEach((p,i)=>{const m=interpolate(data,p.x),y=Y(m);line(p.x,'eng-danger');g.appendChild(el('circle',{cx:X(p.x),cy:y,r:5,class:'eng-dot eng-danger'}));label(p.x,y+(i%2?18:-10),'eng-danger',`At dangerous section: M = ${fmt(displayValue(m,'moment'),3)} ${unitLabel('moment')} (x = ${fmt(displayValue(p.x,'pos'),3)} ${unitLabel('pos')})`);});}
    if(g.childNodes.length)svg.appendChild(g);
  }
  const originalRenderChart=window.renderChart;window.renderChart=function(...args){originalRenderChart(...args);const id=args[0],samples=args[1];if(id==='sfd'||id==='bmd')annotateChart(id,samples);};

  const style=document.createElement('style');style.textContent=`#beamCanvas .point-arrow-head{fill:currentColor;stroke:none}#beamCanvas .moment-sign-symbol{font-size:48px!important;fill:currentColor;stroke:none;font-weight:400}#beamCanvas .moment-load-label{fill:currentColor}#beamCanvas .dimension-tick{stroke:currentColor;stroke-width:1.2;opacity:.8}#beamCanvas .dimension-point-label{font-size:11px}#beamCanvas .dimension-overall-line{stroke:currentColor;stroke-width:1;opacity:.65}.engineering-points{pointer-events:none}.eng-line{stroke-width:1.5;stroke-dasharray:6 4}.eng-dot{stroke:#fff;stroke-width:2}.eng-label{font-size:10px;font-weight:750;paint-order:stroke;stroke-width:3px;stroke-linejoin:round}.eng-danger{stroke:#ff6b6b;fill:#ff6b6b}.eng-label.eng-danger{fill:#ff9a9a;stroke:#0b1016}.eng-contra{stroke:#b69cff;fill:#b69cff}.eng-label.eng-contra{fill:#c8b8ff;stroke:#0b1016}`;document.head.appendChild(style);
})();
