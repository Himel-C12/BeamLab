/* BeamLab interaction + AFD
   Fixes the Pan tool and renders the Axial Force Diagram from the current
   beam loads/supports without touching the existing SFD/BMD solver output.
*/
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const num = v => Number(v ?? 0) || 0;
  const K = v => String(v ?? '').trim().toLowerCase().replaceAll(' ', '_').replaceAll('-', '_');
  const make = (name, attrs = {}) => {
    const e = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k,v]) => e.setAttribute(k, String(v)));
    return e;
  };

  /* ---------------- Pan ---------------- */
  let panX = 0, panY = 0, drag = null;
  function applyPan() {
    const canvas = document.querySelector('#beamCanvas');
    if (!canvas) return;
    canvas.style.transformOrigin = '0 0';
    canvas.style.transform = `translate(${panX}px, ${panY}px) scale(${typeof zoom === 'number' ? zoom : 1})`;
  }
  function resetPan() { panX = 0; panY = 0; applyPan(); }
  function installPan() {
    const vp = document.querySelector('#beamViewport');
    if (!vp || vp.dataset.panFixed) return;
    vp.dataset.panFixed = '1';
    vp.style.overflow = 'hidden';
    vp.addEventListener('pointerdown', e => {
      if (typeof viewMode === 'undefined' || viewMode !== 'pan') return;
      drag = { id:e.pointerId, x:e.clientX, y:e.clientY, px:panX, py:panY };
      vp.setPointerCapture?.(e.pointerId);
      vp.style.cursor = 'grabbing';
      e.preventDefault();
    });
    vp.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      panX = drag.px + e.clientX - drag.x;
      panY = drag.py + e.clientY - drag.y;
      applyPan();
      e.preventDefault();
    });
    const stop = e => {
      if (!drag || (e.pointerId != null && e.pointerId !== drag.id)) return;
      drag = null;
      vp.style.cursor = (typeof viewMode !== 'undefined' && viewMode === 'pan') ? 'grab' : 'default';
    };
    vp.addEventListener('pointerup', stop);
    vp.addEventListener('pointercancel', stop);
    vp.addEventListener('lostpointercapture', stop);
    document.addEventListener('click', e => { if (e.target.closest('#resetView')) resetPan(); });
    document.addEventListener('click', e => {
      const b = e.target.closest('[data-view="pan"]');
      if (b) { setTimeout(() => { vp.style.cursor = 'grab'; }, 0); }
    });
    applyPan();
  }

  /* ---------------- Axial force ---------------- */
  function horizontalComponents() {
    return (state.loads || []).filter(l => {
      const t = K(l.type); return t === 'point' || t === 'point_load';
    }).map(l => {
      const P = num(l.value), a = num(l.angle) * Math.PI / 180;
      // BeamLab convention: angle is measured from the downward vertical.
      // + angle points down-left, so the horizontal component is -P sin(a).
      return { x:num(l.position), fx:-P * Math.sin(a) };
    }).filter(l => Math.abs(l.fx) > 1e-10);
  }
  function restrainedXs() {
    return (state.supports || []).filter(s => {
      const t = K(s.type); return t === 'pin' || t === 'fixed';
    }).map(s => num(s.position));
  }
  function axialSeries() {
    const loads = horizontalComponents();
    const L = totalLength();
    const xs = [0, L, ...(state.supports || []).map(s=>num(s.position)), ...loads.map(l=>l.x)]
      .filter(x=>x>=-1e-9 && x<=L+1e-9)
      .map(x=>Math.max(0,Math.min(L,x)));
    const nodes = [...new Set(xs.map(x=>Math.round(x*1e9)/1e9))].sort((a,b)=>a-b);
    if (nodes.length < 2) return {nodes,segments:[],error:'Beam length is not available.'};
    const restraints = restrainedXs();
    if (!loads.length) return {nodes,segments:nodes.slice(0,-1).map((x,i)=>({x0:x,x1:nodes[i+1],N:0})),note:'No horizontal load component is present, so N = 0 throughout.'};
    if (!restraints.length) return {nodes,segments:[],error:'A horizontal load exists, but the beam has no pin/fixed horizontal restraint.'};

    // For the common statically determinate beam (one horizontal restraint),
    // the restraint reaction is the negative sum of applied horizontal loads.
    // If several horizontal restraints exist, use the first restraint as the
    // reference reaction and report the force series from global equilibrium.
    const R = -loads.reduce((s,l)=>s+l.fx,0);
    const r = restraints[0];
    const segments = [];
    for (let i=0;i<nodes.length-1;i++) {
      const mid=(nodes[i]+nodes[i+1])/2;
      let N = 0;
      // Internal force on the left cut face. Positive N = tension.
      if (r <= mid + 1e-9) N += R;
      loads.forEach(l => { if (l.x <= mid + 1e-9) N += l.fx; });
      // Sign convention: positive accumulated force to the left corresponds
      // to compression on the right cut; invert so +N is tension.
      N = -N;
      segments.push({x0:nodes[i],x1:nodes[i+1],N});
    }
    return {nodes,segments};
  }

  function renderAFD() {
    const host = document.querySelector('#afd');
    if (!host) return;
    host.hidden = false;
    host.className = 'chartBox afdChartBox';
    const result = axialSeries();
    if (result.error) {
      host.innerHTML = `<div class="empty">${result.error}</div>`;
      return;
    }
    if (!result.segments.length) { host.innerHTML='<div class="empty">No axial-force data.</div>'; return; }
    const W=900,H=330,p={l:58,r:28,t:30,b:50},L=Math.max(totalLength(),1);
    const samples=[];
    result.segments.forEach((s,i)=>{
      if(i===0) samples.push({x:s.x0,N:s.N});
      else { samples.push({x:s.x0,N:result.segments[i-1].N}); samples.push({x:s.x0,N:s.N}); }
      samples.push({x:s.x1,N:s.N});
    });
    let ymin=Math.min(0,...samples.map(s=>s.N)), ymax=Math.max(0,...samples.map(s=>s.N));
    if (Math.abs(ymax-ymin)<1e-9) { ymin=-1; ymax=1; } else { const d=(ymax-ymin)*.08; ymin-=d; ymax+=d; }
    const X=x=>p.l+x/L*(W-p.l-p.r), Y=y=>H-p.b-(y-ymin)/(ymax-ymin)*(H-p.t-p.b), zero=Y(0);
    let grid='';
    for(let i=0;i<=4;i++){const y=ymin+(ymax-ymin)*i/4;grid+=`<line x1="${p.l}" y1="${Y(y)}" x2="${W-p.r}" y2="${Y(y)}" class="chart-grid"/><text x="${p.l-9}" y="${Y(y)+4}" text-anchor="end" class="chart-label">${y.toFixed(2)}</text>`;}
    for(let i=0;i<=4;i++){const x=L*i/4;grid+=`<line x1="${X(x)}" y1="${p.t}" x2="${X(x)}" y2="${H-p.b}" class="chart-grid"/><text x="${X(x)}" y="${H-p.b+25}" text-anchor="middle" class="chart-label">${x.toFixed(2)} ${unitLabel('pos')}</text>`;}
    const path=samples.map((s,i)=>`${i?'L':'M'} ${X(s.x).toFixed(2)} ${Y(s.N).toFixed(2)}`).join(' ');
    const area=`M ${X(samples[0].x)} ${zero} L ${samples.map(s=>`${X(s.x)} ${Y(s.N)}`).join(' L ')} L ${X(samples.at(-1).x)} ${zero} Z`;
    const features=(state.supports||[]).map(s=>num(s.position)).concat(horizontalComponents().map(l=>l.x));
    const fl=showFeatures?[...new Set(features)].map(x=>`<line x1="${X(x)}" y1="${p.t}" x2="${X(x)}" y2="${H-p.b}" class="chart-feature"/>`).join(''):'';
    const max=samples.reduce((a,b)=>Math.abs(b.N)>Math.abs(a.N)?b:a,samples[0]);
    const value=showValues?`<circle cx="${X(max.x)}" cy="${Y(max.N)}" r="6" class="max-dot"/><text x="${X(max.x)+8}" y="${Y(max.N)-8}" class="max-label">Max |N|: ${Math.abs(max.N).toFixed(3)} kN</text>`:'';
    host.innerHTML=`<div class="chartWrap"><svg viewBox="0 0 ${W} ${H}" class="chart" aria-label="Axial Force Diagram"><g>${grid}${fl}<path d="${area}" fill="currentColor" opacity=".10"/><path d="${path}" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linejoin="miter"/><line x1="${p.l}" y1="${zero}" x2="${W-p.r}" y2="${zero}" class="zero-line"/>${value}<text x="${p.l}" y="17" class="chart-title">Axial force N (kN) · + tension / − compression</text><text x="${W-p.r}" y="${H-8}" text-anchor="end" class="chart-title">Position (${unitLabel('pos')})</text></g></svg></div>`;
    const metric=document.querySelector('#maxN'); if(metric) metric.textContent=`${Math.abs(max.N).toFixed(3)} kN`;
    const small=metric?.nextElementSibling; if(small) small.textContent=max.N>=0?'Tension':'Compression';
  }

  function installAFD() {
    const host=document.querySelector('#afd'); if(!host || host.dataset.afdInstalled) return;
    host.dataset.afdInstalled='1';
    const block=document.createElement('section'); block.className='diagramBlock afdBlock';
    const title=document.createElement('h3'); title.textContent='Axial Force Diagram (AFD)';
    host.parentNode.insertBefore(block,host); block.appendChild(title); block.appendChild(host);
    const status=document.querySelector('#status');
    if(status) new MutationObserver(()=>requestAnimationFrame(renderAFD)).observe(status,{childList:true,characterData:true,subtree:true});
    document.addEventListener('input',e=>{if(e.target.matches('[data-load],[data-support],[data-span]')) requestAnimationFrame(renderAFD);});
    document.addEventListener('change',e=>{if(e.target.matches('[data-load],[data-support],[data-span]')) requestAnimationFrame(renderAFD);});
    renderAFD();
  }
  const css=document.createElement('style');
  css.textContent=`#beamViewport{touch-action:none}#beamCanvas{will-change:transform}.afdBlock{width:100%}.afdChartBox{min-height:330px}.afdChartBox .chart{color:#7c5cff}.afdChartBox .zero-line{stroke:currentColor;stroke-width:1.5}`;
  document.head.appendChild(css);
  function boot(){installPan();installAFD();applyPan();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
  setTimeout(boot,250); setTimeout(boot,1000);
  window.__beamLabRenderAFD=renderAFD;
})();
