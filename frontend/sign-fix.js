/* BeamLab SVG symbol/sign repair. +moment is counter-clockwise; -moment is clockwise. */
(() => {
  const NS='http://www.w3.org/2000/svg';
  const num=v=>Number(v??0)||0;
  const make=(n,a={})=>{const e=document.createElementNS(NS,n);Object.entries(a).forEach(([k,v])=>e.setAttribute(k,String(v)));return e;};
  const kind=v=>String(v??'').trim().toLowerCase().replaceAll(' ','_').replaceAll('-','_');
  const geom=svg=>{const b=svg.querySelector('.beam-line');if(!b)return null;const w=svg.viewBox?.baseVal?.width||1100,L=Math.max(typeof totalLength==='function'?totalLength():1,1),pad=70;return{beamY:num(b.getAttribute('y1'))||105,xOf:p=>pad+Number(p)*(w-2*pad)/L};};
  const head=(x,y,tx,ty,s=9)=>{const l=Math.hypot(tx,ty)||1,ux=tx/l,uy=ty/l,px=-uy,py=ux;return `M ${x} ${y} L ${x-ux*s+px*s*.62} ${y-uy*s+py*s*.62} L ${x-ux*s-px*s*.62} ${y-uy*s-py*s*.62} Z`;};

  function supports(svg,g){
    svg.querySelector('.support-ground-surfaces')?.remove();
    const out=make('g',{class:'support-ground-surfaces'});
    (state.supports||[]).forEach(s=>{const t=kind(s.type);if(t!=='pin'&&t!=='roller')return;const x=g.xOf(s.position),y=g.beamY+(t==='roller'?37:29),h=t==='roller'?28:25;out.appendChild(make('line',{x1:x-h,y1:y,x2:x+h,y2:y,class:'support-ground-line'}));for(let q=x-h+3;q<=x+h-2;q+=8)out.appendChild(make('line',{x1:q,y1:y,x2:q-8,y2:y+10,class:'support-ground-hatch'}));});
    svg.appendChild(out);svg.querySelectorAll('.support-label').forEach(e=>e.setAttribute('y',g.beamY+61));svg.querySelectorAll('.position-label').forEach(e=>e.setAttribute('y',g.beamY+77));
  }

  function point(group,l,g){
    if(!group||!l)return;const x=g.xOf(l.position),y=g.beamY-4,v=num(l.value),a=num(l.angle),p=v>=0,t=a*Math.PI/180;let dx=-Math.sin(t),dy=Math.cos(t);if(!p){dx=-dx;dy=-dy;}const len=76,hx=p?x:x+dx*len,hy=p?y:y+dy*len,tx=p?hx-dx*len:x,ty=p?hy-dy*len:y;while(group.firstChild)group.removeChild(group.firstChild);group.appendChild(make('line',{x1:tx,y1:ty,x2:hx,y2:hy}));group.appendChild(make('path',{d:head(hx,hy,dx,dy),class:'point-arrow-head'}));const lab=make('text',{x:p?tx:hx,y:Math.min(ty,hy)-8,'text-anchor':'middle'});lab.textContent=`${v<0?'-':''}${fmt(Math.abs(v),3)} ${unitLabel('force')}${a?` @ ${Math.abs(a)}°`:''}`;group.appendChild(lab);
  }

  function moment(group,l,g){
    if(!group||!l)return;
    const x=g.xOf(l.position),y=g.beamY-4,r=42,positive=num(l.value)>=0;
    while(group.firstChild)group.removeChild(group.firstChild);

    /*
      Draw the sign convention explicitly on the LEFT side of the moment.
      In SVG screen coordinates, a counter-clockwise rotation travels
      downward on the left side. Therefore:
        +M : upper-left -> lower-left, arrowhead points DOWN
        -M : lower-left -> upper-left, arrowhead points UP
      Using this fixed short arc avoids the ambiguous long/short SVG arc
      interpretation that caused the previous sign reversal.
    */
    const startDeg=positive?225:135;
    const endDeg=positive?135:225;
    const sweep=positive?0:1;
    const rad=d=>d*Math.PI/180;
    const sx=x+r*Math.cos(rad(startDeg)),sy=y+r*Math.sin(rad(startDeg));
    const ex=x+r*Math.cos(rad(endDeg)),ey=y+r*Math.sin(rad(endDeg));
    group.appendChild(make('path',{d:`M ${sx} ${sy} A ${r} ${r} 0 0 ${sweep} ${ex} ${ey}`,class:'moment-arrow-arc',fill:'none'}));

    const dirY=positive?1:-1;
    group.appendChild(make('path',{d:head(ex,ey,0,dirY,10),class:'moment-arrow-head'}));

    const lab=make('text',{x,y:30,'text-anchor':'middle'});
    lab.textContent=`${num(l.value)<0?'-':''}${fmt(Math.abs(num(l.value)),3)} ${unitLabel('moment')}`;
    group.appendChild(lab);
  }

  function loads(svg,g){
    const pts=(state.loads||[]).filter(l=>{const t=kind(l.type);return t==='point'||t==='point_load';});
    svg.querySelectorAll('g.point-load').forEach((x,i)=>point(x,pts[i],g));
    const ms=(state.loads||[]).filter(l=>kind(l.type)==='moment');
    svg.querySelectorAll('g.moment-load').forEach((x,i)=>moment(x,ms[i],g));
  }

  function repair(){const c=document.querySelector('#beamCanvas'),svg=c?.querySelector('svg');if(!svg||typeof state==='undefined'||c?._beamSymbolRepairRunning)return;const g=geom(svg);if(!g)return;c._beamSymbolRepairRunning=true;try{supports(svg,g);loads(svg,g);}finally{c._beamSymbolRepairRunning=false;}}

  const st=document.createElement('style');st.textContent=`#beamCanvas .support-ground-surfaces{pointer-events:none}#beamCanvas .support-ground-line{stroke:currentColor;stroke-width:2;opacity:.95}#beamCanvas .support-ground-hatch{stroke:currentColor;stroke-width:1.4;opacity:.9}#beamCanvas .support-label,#beamCanvas .position-label{transform:none!important}#beamCanvas .point-arrow-head,#beamCanvas .moment-arrow-head{fill:currentColor;stroke:none}#beamCanvas .moment-arrow-arc{stroke:currentColor;stroke-width:2.6;stroke-linecap:round}`;document.head.appendChild(st);
  let busy=false;const schedule=()=>{if(busy)return;busy=true;requestAnimationFrame(()=>{busy=false;repair();});};
  function install(){const c=document.querySelector('#beamCanvas');if(!c||c._beamSymbolObserverInstalled)return;c._beamSymbolObserverInstalled=true;new MutationObserver(schedule).observe(c,{childList:true,subtree:true});repair();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();setTimeout(install,0);setTimeout(install,250);setTimeout(install,1000);
})();