/* BeamLab clean visual overrides */
(()=>{
  const originalRenderBeam = window.renderBeam;
  const originalRenderInputs = window.renderInputs;

  // Unit toggle: change labels only. Never mutate displayed numeric values.
  if (typeof window.factor === 'function') window.factor = ()=>1;
  if (typeof window.displayValue === 'function') window.displayValue = v=>Number(v);
  if (typeof window.siValue === 'function') window.siValue = v=>Number(v);
  if (typeof window.displayChartY === 'function') window.displayChartY = y=>Number(y);

  const labels={SI:{length:'m',force:'kN',moment:'kN·m',deflection:'mm',E:'GPa',I:'mm⁴',pos:'m'},imperial:{length:'ft',force:'kip',moment:'kip·ft',deflection:'in',E:'ksi',I:'in⁴',pos:'ft'}};
  if (typeof unitLabel === 'function') {
    window.unitLabel = type => (labels[typeof unit !== 'undefined' ? unit : 'SI']||labels.SI)[type] || '';
  }

  function addMomentMarkers(svg){
    if (!svg || svg.querySelector('#beam-moment-arrow')) return;
    const defs=document.createElementNS('http://www.w3.org/2000/svg','defs');
    defs.innerHTML=`<marker id="beam-moment-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="strokeWidth"><path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker>`;
    svg.prepend(defs);
  }

  function rebuildLoads(svg){
    if (!svg || typeof state === 'undefined') return;
    const width=1100,pad=70,beamY=105,L=Math.max(totalLength(),1),sx=(width-2*pad)/L;
    const X=p=>pad+Number(p)*sx;
    addMomentMarkers(svg);
    const NS='http://www.w3.org/2000/svg';
    [...svg.querySelectorAll('g.moment-load')].forEach(g=>g.remove());
    [...svg.querySelectorAll('g.udl-load')].forEach(g=>g.remove());
    state.loads.forEach(l=>{
      const t=kind(l.type),x=X(l.position);
      if(t==='moment'){
        const g=document.createElementNS(NS,'g');g.setAttribute('class','moment-load');
        const path=document.createElementNS(NS,'path');
        const positive=Number(l.value)>=0;
        path.setAttribute('d',positive?`M ${x+14} ${beamY-10} A 18 18 0 1 0 ${x-5} ${beamY-17}`:`M ${x-5} ${beamY-17} A 18 18 0 1 0 ${x+14} ${beamY-10}`);
        path.setAttribute('marker-end','url(#beam-moment-arrow)');
        path.style.color='#ff9b45';
        g.appendChild(path);
        const text=document.createElementNS(NS,'text');text.setAttribute('x',x);text.setAttribute('y',30);text.setAttribute('text-anchor','middle');text.textContent=`${fmt(Math.abs(Number(l.value)),3)} ${unitLabel('moment')}`;g.appendChild(text);
        svg.appendChild(g);
      }
      if(t==='udl'){
        const x2=X(l.to),v1=Number(l.value||0),v2=Number(l.value2??l.value??0),max=Math.max(Math.abs(v1),Math.abs(v2),1),h=52;
        const y1=beamY-6-h*Math.abs(v1)/max,y2=beamY-6-h*Math.abs(v2)/max;
        const g=document.createElementNS(NS,'g');g.setAttribute('class','udl-load');
        const top=document.createElementNS(NS,'line');top.setAttribute('x1',x);top.setAttribute('y1',y1);top.setAttribute('x2',x2);top.setAttribute('y2',y2);g.appendChild(top);
        const label=document.createElementNS(NS,'text');label.setAttribute('x',(x+x2)/2);label.setAttribute('y',Math.min(y1,y2)-10);label.setAttribute('text-anchor','middle');label.textContent=`−${fmt(Math.abs(v1),3)}${Math.abs(v1-v2)>1e-9?` → −${fmt(Math.abs(v2),3)}`:''} ${unitLabel('force')}/${unitLabel('length')}`;g.appendChild(label);
        const count=Math.max(2,Math.min(18,Math.round((x2-x)/38)+1));
        for(let i=0;i<count;i++){
          const q=count===1?0:i/(count-1),xx=x+(x2-x)*q,yy=y1+(y2-y1)*q;
          if(Math.abs(yy-(beamY-6))<1) continue;
          const line=document.createElementNS(NS,'line');line.setAttribute('x1',xx);line.setAttribute('y1',yy);line.setAttribute('x2',xx);line.setAttribute('y2',beamY-5);g.appendChild(line);
          const p=document.createElementNS(NS,'path');p.setAttribute('d',`M ${xx-4} ${beamY-12} L ${xx} ${beamY-4} L ${xx+4} ${beamY-12}`);g.appendChild(p);
        }
        svg.appendChild(g);
      }
    });
  }

  window.renderBeam=function(){
    originalRenderBeam();
    const svg=document.querySelector('#beamCanvas svg');
    if(!svg) return;
    const groups=[...svg.querySelectorAll('g')].filter(g=>g.querySelector(':scope > text.support-label'));
    groups.forEach((g,i)=>{if(state?.supports?.[i]?.type==='fixed')g.querySelector(':scope > circle.node')?.remove();});
    rebuildLoads(svg);
  };

  window.renderInputs=function(){
    originalRenderInputs();
    const currentLabels=labels[typeof unit !== 'undefined' ? unit : 'SI'];
    document.querySelectorAll('[data-unit-label]').forEach(el=>{const type=el.dataset.unitLabel;if(currentLabels[type])el.textContent=currentLabels[type]});
    (state?.loads||[]).forEach((l,i)=>{
      if(kind(l.type)!=='moment') return;
      const input=document.querySelector(`input[data-load="${i}"][data-field="value"]`);
      if(input) input.value=numberInput(l.value,'moment');
    });
  };

  window.renderChart=function(id,samples,key,label,type,features=[],jumps=[]){
    const el=document.querySelector('#'+id); if(!el||!samples?.length){if(el)el.innerHTML='<div class="empty">No data.</div>';return;}
    const raw=samples.map(s=>({x:Number(s.x),y:Number(s[key])})).filter(p=>isFinite(p.x)&&isFinite(p.y));
    let data=[];
    if(type==='sfd' && jumps?.length){
      const by={};jumps.forEach(j=>(by[j.x]??=[]).push(j));
      raw.forEach(p=>{
        const js=by[p.x]||[];
        const left=js.find(j=>j.side==='left'),right=js.find(j=>j.side==='right');
        if(left&&right){const a=Number(left[key]??left.shear_kN),b=Number(right[key]??right.shear_kN);data.push({x:p.x,y:a});if(Math.abs(a-b)>1e-10)data.push({x:p.x,y:b});}
        else data.push(p);
      });
      data=data.filter((p,i,a)=>i===0||p.x!==a[i-1].x||Math.abs(p.y-a[i-1].y)>1e-10);
    }else data=raw;
    if(!data.length)return;
    const W=900,H=330,p={l:58,r:28,t:28,b:50};let xmin=Math.min(...data.map(d=>d.x)),xmax=Math.max(...data.map(d=>d.x)),ymin=Math.min(0,...data.map(d=>d.y)),ymax=Math.max(0,...data.map(d=>d.y));if(ymin===ymax){ymin-=1;ymax+=1}else{const s=(ymax-ymin)*.08;ymin-=s;ymax+=s}
    const X=x=>p.l+(x-xmin)/(xmax-xmin||1)*(W-p.l-p.r),Y=y=>H-p.b-(y-ymin)/(ymax-ymin)*(H-p.t-p.b),zero=Y(0),colors={sfd:'#3b82f6',bmd:'#20c9a6',deflection:'#f59e0b',rotation:'#e879f9'},color=colors[type]||colors.sfd;
    let grid='';for(let i=0;i<=4;i++){const y=ymin+(ymax-ymin)*i/4;grid+=`<line x1="${p.l}" y1="${Y(y)}" x2="${W-p.r}" y2="${Y(y)}" class="chart-grid"/><text x="${p.l-9}" y="${Y(y)+4}" text-anchor="end" class="chart-label">${fmt(y,type==='rotation'?4:3)}</text>`}for(let i=0;i<=4;i++){const x=xmin+(xmax-xmin)*i/4;grid+=`<line x1="${X(x)}" y1="${p.t}" x2="${X(x)}" y2="${H-p.b}" class="chart-grid"/><text x="${X(x)}" y="${H-p.b+25}" text-anchor="middle" class="chart-label">${fmt(x,2)}</text>`}
    const path=data.map((d,i)=>`${i?'L':'M'} ${X(d.x).toFixed(2)} ${Y(d.y).toFixed(2)}`).join(' '),area=`M ${X(data[0].x)} ${zero} L ${data.map(d=>`${X(d.x)} ${Y(d.y)}`).join(' L ')} L ${X(data.at(-1).x)} ${zero} Z`;
    const fxs=[...new Set(features.map(f=>Number(f.x)).filter(isFinite))],fl=showFeatures?fxs.map(x=>`<line x1="${X(x)}" y1="${p.t}" x2="${X(x)}" y2="${H-p.b}" class="chart-feature"/>`).join(''):'',marks=showFeatures?features.filter(f=>f.support).map(f=>`<path d="M ${X(f.x)-7} ${zero+5} L ${X(f.x)} ${zero-7} L ${X(f.x)+7} ${zero+5} Z" class="chart-support"/>`).join(''):'';
    const max=data.reduce((a,b)=>Math.abs(b.y)>Math.abs(a.y)?b:a,data[0]),values=showValues?`<circle cx="${X(max.x)}" cy="${Y(max.y)}" r="6" class="max-dot"/><text x="${X(max.x)+8}" y="${Y(max.y)-8}" class="max-label">Max: ${fmt(max.y,type==='rotation'?4:3)}</text>`:'';
    el.innerHTML=`<div class="chartWrap"><svg viewBox="0 0 ${W} ${H}" class="chart"><g>${grid}${fl}<path d="${area}" fill="${color}" opacity=".12"/><path d="${path}" fill="none" stroke="${color}" stroke-width="2.8" stroke-linejoin="miter" stroke-linecap="butt"/>${marks}${values}<line x1="${p.l}" y1="${zero}" x2="${W-p.r}" y2="${zero}" class="zero-line"/></g><g class="hoverLayer"><line class="hoverV" x1="0" x2="0" y1="${p.t}" y2="${H-p.b}"/><line class="hoverH" x1="${p.l}" x2="${W-p.r}" y1="0" y2="0"/><circle class="hoverPoint" cx="0" cy="0" r="5"/><rect class="hoverBox" x="0" y="0" width="170" height="48" rx="8"/><text class="hoverText" x="0" y="0"/></g><text x="${p.l}" y="17" class="chart-title">${label}</text><text x="${W-p.r}" y="${H-8}" text-anchor="end" class="chart-title">Position (${unitLabel('pos')})</text></svg></div>`;
    const svg=el.querySelector('svg'),vl=el.querySelector('.hoverV'),hl=el.querySelector('.hoverH'),pt=el.querySelector('.hoverPoint'),box=el.querySelector('.hoverBox'),txt=el.querySelector('.hoverText');
    const nearest=x=>data.reduce((a,b)=>Math.abs(b.x-x)<Math.abs(a.x-x)?b:a,data[0]);
    svg.addEventListener('pointermove',ev=>{const r=svg.getBoundingClientRect(),mx=(ev.clientX-r.left)/r.width*W,x=xmin+(mx-p.l)/(W-p.l-p.r)*(xmax-xmin);if(x<xmin||x>xmax)return;const q=nearest(x),px=X(q.x),py=Y(q.y),bx=Math.min(W-180,Math.max(p.l,px+12)),by=Math.max(p.t,py-62);vl.setAttribute('x1',px);vl.setAttribute('x2',px);hl.setAttribute('y1',py);hl.setAttribute('y2',py);pt.setAttribute('cx',px);pt.setAttribute('cy',py);box.setAttribute('x',bx);box.setAttribute('y',by);txt.setAttribute('x',bx+12);txt.setAttribute('y',by+19);txt.textContent=`x: ${fmt(q.x,3)} ${unitLabel('pos')} · y: ${fmt(q.y,type==='rotation'?5:3)}`;[vl,hl,pt,box,txt].forEach(e=>e.style.opacity='1')});
    svg.addEventListener('pointerleave',()=>[vl,hl,pt,box,txt].forEach(e=>e.style.opacity='0'));
  };

  const rerender=()=>{try{render()}catch(e){console.warn('BeamLab rerender:',e)}};
  document.addEventListener('click',ev=>{
    if(ev.target.closest('[data-unit]')) setTimeout(rerender,0);
    if(ev.target.closest('#themeBtn')) setTimeout(rerender,0);
  });
})();
