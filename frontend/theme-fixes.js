(()=>{
  const updateThemeIcon=()=>{
    const b=document.querySelector('#themeBtn');
    if(!b)return;
    const dark=document.body.classList.contains('dark');
    b.textContent=dark?'☾':'☀';
    b.setAttribute('aria-label',dark?'Dark theme':'Light theme');
    b.setAttribute('title',dark?'Dark theme':'Light theme');
  };
  updateThemeIcon();
  document.querySelector('#themeBtn')?.addEventListener('click',()=>setTimeout(updateThemeIcon,0));
})();

/* BeamLab interaction + AFD fix. */
(()=>{
  const K=v=>String(v??'').trim().toLowerCase().replaceAll(' ','_').replaceAll('-','_');
  const num=v=>Number(v??0)||0;
  let panX=0,panY=0,drag=null;

  function applyPan(){
    const c=document.querySelector('#beamCanvas');if(!c)return;
    c.style.transformOrigin='0 0';
    c.style.transform=`translate(${panX}px,${panY}px) scale(${typeof zoom==='number'?zoom:1})`;
  }
  function installPan(){
    const vp=document.querySelector('#beamViewport');if(!vp||vp.dataset.panFix)return;
    vp.dataset.panFix='1';vp.style.overflow='hidden';vp.style.touchAction='none';
    vp.addEventListener('pointerdown',e=>{
      if(typeof viewMode==='undefined'||viewMode!=='pan')return;
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,px:panX,py:panY};
      vp.setPointerCapture?.(e.pointerId);vp.style.cursor='grabbing';e.preventDefault();
    });
    vp.addEventListener('pointermove',e=>{
      if(!drag||e.pointerId!==drag.id)return;
      panX=drag.px+e.clientX-drag.x;panY=drag.py+e.clientY-drag.y;applyPan();e.preventDefault();
    });
    const stop=e=>{if(!drag||(e.pointerId!=null&&e.pointerId!==drag.id))return;drag=null;vp.style.cursor=typeof viewMode!=='undefined'&&viewMode==='pan'?'grab':'default'};
    vp.addEventListener('pointerup',stop);vp.addEventListener('pointercancel',stop);vp.addEventListener('lostpointercapture',stop);
    document.addEventListener('click',e=>{if(e.target.closest('#resetView')){panX=0;panY=0;applyPan()}});
    applyPan();
  }

  function horizontalLoads(){
    return (state.loads||[]).filter(l=>{const t=K(l.type);return t==='point'||t==='point_load'}).map(l=>({x:num(l.position),fx:-num(l.value)*Math.sin(num(l.angle)*Math.PI/180)})).filter(l=>Math.abs(l.fx)>1e-10);
  }
  function afdData(){
    const L=totalLength();
    const loads=horizontalLoads();
    const xs=[0,L,...(state.supports||[]).map(s=>num(s.position)),...loads.map(l=>l.x)].filter(x=>x>=0&&x<=L).map(x=>Math.round(x*1e9)/1e9);
    const nodes=[...new Set(xs)].sort((a,b)=>a-b);
    if(nodes.length<2)return {error:'Beam length is not available.'};
    if(!loads.length)return {nodes,segments:nodes.slice(0,-1).map((x,i)=>({x0:x,x1:nodes[i+1],N:0}))};
    const restraints=(state.supports||[]).filter(s=>['pin','fixed'].includes(K(s.type))).map(s=>num(s.position));
    if(!restraints.length)return {error:'A horizontal load exists, but there is no pin/fixed horizontal restraint.'};
    const R=-loads.reduce((s,l)=>s+l.fx,0),r=restraints[0],segments=[];
    for(let i=0;i<nodes.length-1;i++){
      const mid=(nodes[i]+nodes[i+1])/2;let left=r<=mid+1e-9?R:0;
      loads.forEach(l=>{if(l.x<=mid+1e-9)left+=l.fx});
      segments.push({x0:nodes[i],x1:nodes[i+1],N:-left});
    }
    return {nodes,segments};
  }
  function renderAFD(){
    const host=document.querySelector('#afd');if(!host)return;host.hidden=false;
    const d=afdData();
    if(d.error){host.innerHTML=`<div class="empty">${d.error}</div>`;return}
    const seg=d.segments;if(!seg.length){host.innerHTML='<div class="empty">No axial-force data.</div>';return}
    const W=900,H=330,p={l:58,r:28,t:30,b:50},L=Math.max(totalLength(),1),samples=[];
    seg.forEach((s,i)=>{if(i){samples.push({x:s.x0,N:seg[i-1].N});samples.push({x:s.x0,N:s.N})}else samples.push({x:s.x0,N:s.N});samples.push({x:s.x1,N:s.N})});
    let lo=Math.min(0,...samples.map(s=>s.N)),hi=Math.max(0,...samples.map(s=>s.N));if(Math.abs(hi-lo)<1e-9){lo=-1;hi=1}else{const q=(hi-lo)*.08;lo-=q;hi+=q}
    const X=x=>p.l+x/L*(W-p.l-p.r),Y=y=>H-p.b-(y-lo)/(hi-lo)*(H-p.t-p.b),zero=Y(0);let grid='';
    for(let i=0;i<=4;i++){const y=lo+(hi-lo)*i/4;grid+=`<line x1="${p.l}" y1="${Y(y)}" x2="${W-p.r}" y2="${Y(y)}" class="chart-grid"/><text x="${p.l-9}" y="${Y(y)+4}" text-anchor="end" class="chart-label">${y.toFixed(2)}</text>`}
    for(let i=0;i<=4;i++){const x=L*i/4;grid+=`<line x1="${X(x)}" y1="${p.t}" x2="${X(x)}" y2="${H-p.b}" class="chart-grid"/><text x="${X(x)}" y="${H-p.b+25}" text-anchor="middle" class="chart-label">${x.toFixed(2)} ${unitLabel('pos')}</text>`}
    const path=samples.map((s,i)=>`${i?'L':'M'} ${X(s.x).toFixed(2)} ${Y(s.N).toFixed(2)}`).join(' ');
    const area=`M ${X(samples[0].x)} ${zero} L ${samples.map(s=>`${X(s.x)} ${Y(s.N)}`).join(' L ')} L ${X(samples.at(-1).x)} ${zero} Z`;
    const fxs=[...(state.supports||[]).map(s=>num(s.position)),...horizontalLoads().map(l=>l.x)];
    const features=showFeatures?[...new Set(fxs)].map(x=>`<line x1="${X(x)}" y1="${p.t}" x2="${X(x)}" y2="${H-p.b}" class="chart-feature"/>`).join(''):'';
    const max=samples.reduce((a,b)=>Math.abs(b.N)>Math.abs(a.N)?b:a,samples[0]);
    const value=showValues?`<circle cx="${X(max.x)}" cy="${Y(max.N)}" r="6" class="max-dot"/><text x="${X(max.x)+8}" y="${Y(max.N)-8}" class="max-label">Max |N|: ${Math.abs(max.N).toFixed(3)} kN</text>`:'';
    host.innerHTML=`<div class="chartWrap"><svg viewBox="0 0 ${W} ${H}" class="chart" aria-label="Axial Force Diagram"><g>${grid}${features}<path d="${area}" fill="currentColor" opacity=".10"/><path d="${path}" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linejoin="miter"/><line x1="${p.l}" y1="${zero}" x2="${W-p.r}" y2="${zero}" class="zero-line"/>${value}<text x="${p.l}" y="17" class="chart-title">Axial force N (kN) · + tension / − compression</text><text x="${W-p.r}" y="${H-8}" text-anchor="end" class="chart-title">Position (${unitLabel('pos')})</text></g></svg></div>`;
    const m=document.querySelector('#maxN');if(m)m.textContent=`${Math.abs(max.N).toFixed(3)} kN`;
    if(m?.nextElementSibling)m.nextElementSibling.textContent=max.N>=0?'Tension':'Compression';
  }
  function installAFD(){
    const host=document.querySelector('#afd');if(!host||host.dataset.afdFix)return;host.dataset.afdFix='1';
    host.hidden=false;host.className='chartBox';
    const block=document.createElement('section');block.className='diagramBlock';const title=document.createElement('h3');title.textContent='Axial Force Diagram (AFD)';
    host.parentNode.insertBefore(block,host);block.append(title,host);
    const status=document.querySelector('#status');if(status)new MutationObserver(()=>requestAnimationFrame(renderAFD)).observe(status,{childList:true,characterData:true,subtree:true});
    document.addEventListener('input',e=>{if(e.target.matches('[data-load],[data-support],[data-span]'))requestAnimationFrame(renderAFD)});
    document.addEventListener('change',e=>{if(e.target.matches('[data-load],[data-support],[data-span]'))requestAnimationFrame(renderAFD)});
    renderAFD();
  }
  const style=document.createElement('style');style.textContent='#beamCanvas{will-change:transform}.afdBlock{width:100%}.afdChartBox{min-height:330px}';document.head.appendChild(style);
  function boot(){installPan();installAFD();applyPan()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setTimeout(boot,250);setTimeout(boot,1000);
})();
