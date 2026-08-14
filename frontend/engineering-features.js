/* BeamLab engineering annotations: isolated from the solver and model UI. */
(() => {
  const EPS = 1e-9;
  const NS = 'http://www.w3.org/2000/svg';

  const num = v => Number(v);
  const sign = v => Math.abs(num(v)) < EPS ? 0 : (num(v) > 0 ? 1 : -1);
  const uniqueByX = points => {
    points.sort((a,b) => a.x - b.x);
    return points.filter((p,i) => i === 0 || Math.abs(p.x - points[i-1].x) > 1e-7);
  };

  function zeroCrossings(data, excluded = []) {
    const out = [];
    for (let i = 0; i < data.length - 1; i++) {
      const a = data[i], b = data[i+1];
      const sa = sign(a.y), sb = sign(b.y);
      if (sa === 0) {
        if (i > 0 && sb !== 0 && sign(data[i-1].y) !== sb &&
            !excluded.some(x => Math.abs(x - a.x) < 1e-7)) {
          out.push({x:a.x, y:0});
        }
        continue;
      }
      if (sb === 0 || sa === sb) continue;
      const t = -a.y / (b.y - a.y);
      const x = a.x + (b.x - a.x) * t;
      if (!excluded.some(px => Math.abs(px - x) < 1e-7)) out.push({x, y:0});
    }
    return uniqueByX(out);
  }

  function dangerousSections(sfd, jumps = []) {
    const out = [], excluded = [];
    for (const j of jumps) {
      if (j.side !== 'left') continue;
      const r = jumps.find(k => k.side === 'right' && Math.abs(k.x - j.x) < 1e-8);
      if (!r) continue;
      excluded.push(num(j.x));
      if (sign(j.y) !== 0 && sign(r.y) !== 0 && sign(j.y) !== sign(r.y)) {
        out.push({x:num(j.x), y:0});
      }
    }
    out.push(...zeroCrossings(sfd, excluded));
    return uniqueByX(out);
  }

  function interpolate(data, x) {
    if (!data.length) return null;
    if (x <= data[0].x) return data[0].y;
    if (x >= data[data.length-1].x) return data[data.length-1].y;
    let lo = 0, hi = data.length - 1;
    while (lo + 1 < hi) {
      const m = (lo + hi) >> 1;
      if (data[m].x <= x) lo = m; else hi = m;
    }
    const a = data[lo], b = data[hi];
    const t = (x - a.x) / (b.x - a.x || 1);
    return a.y + (b.y - a.y) * t;
  }

  function annotate(id, samples) {
    const svg = document.querySelector(`#${id} svg.chartSvg`);
    if (!svg || !samples?.length) return;
    svg.querySelector('.engineering-points')?.remove();
    svg.querySelector('.engineering-points-safe')?.remove();

    const data = samples.map(s => ({
      x:num(s.x), y:num(id === 'sfd' ? s.shear_kN : s.moment_kNm)
    })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (data.length < 2) return;

    const W=900,H=330,pad={l:58,r:28,t:28,b:50};
    const xmin=data[0].x, xmax=data[data.length-1].x;
    let ymin=Math.min(...data.map(p=>p.y),0), ymax=Math.max(...data.map(p=>p.y),0);
    const scale=typeof niceScale==='function' ? niceScale(ymin,ymax) : [ymin,ymax];
    ymin=scale[0]; ymax=scale[1];
    const X=x=>pad.l+(x-xmin)/(xmax-xmin||1)*(W-pad.l-pad.r);
    const Y=y=>H-pad.b-(y-ymin)/(ymax-ymin||1)*(H-pad.t-pad.b);
    const zero=Y(0);
    const g=document.createElementNS(NS,'g');
    g.setAttribute('class','engineering-points-safe');

    const addLine=(x, cls) => {
      const e=document.createElementNS(NS,'line');
      e.setAttribute('x1',X(x)); e.setAttribute('x2',X(x));
      e.setAttribute('y1',pad.t); e.setAttribute('y2',H-pad.b);
      e.setAttribute('class',`eng-line ${cls}`); g.appendChild(e);
    };
    const addCircle=(x,y,cls) => {
      const e=document.createElementNS(NS,'circle');
      e.setAttribute('cx',X(x)); e.setAttribute('cy',Y(y)); e.setAttribute('r','5');
      e.setAttribute('class',`eng-dot ${cls}`); g.appendChild(e);
    };
    const addLabel=(x,y,cls,text,offset=8) => {
      const e=document.createElementNS(NS,'text');
      e.setAttribute('x',X(x)+offset); e.setAttribute('y',y);
      e.setAttribute('class',`eng-label ${cls}`); e.textContent=text; g.appendChild(e);
    };

    const jumps = lastResult?.diagrams?.jumps || [];
    if (id === 'sfd') {
      dangerousSections(data, jumps).forEach((p,i) => {
        addLine(p.x,'eng-danger'); addCircle(p.x,0,'eng-danger');
        addLabel(p.x,zero+(i%2 ? -16 : 18),'eng-danger',
          `Dangerous section: x = ${fmt(displayValue(p.x,'pos'),3)} ${unitLabel('pos')}`);
      });
    }

    if (id === 'bmd') {
      const sfd=samples.map(s=>({x:num(s.x),y:num(s.shear_kN)}))
        .filter(p=>Number.isFinite(p.x)&&Number.isFinite(p.y));
      const momentXs=(state.loads||[]).filter(l=>kind(l.type)==='moment').map(l=>num(l.position));
      const nonCF=[0,totalLength(),...(state.supports||[]).map(s=>num(s.position)),...momentXs];
      const cf=zeroCrossings(data,nonCF);
      cf.forEach((p,i)=>{
        addLine(p.x,'eng-contra'); addCircle(p.x,0,'eng-contra');
        addLabel(p.x,zero+(i%2 ? -16 : 18),'eng-contra',
          `Contraflexure: x = ${fmt(displayValue(p.x,'pos'),3)} ${unitLabel('pos')}`);
      });
      dangerousSections(sfd,jumps).forEach((p,i)=>{
        const m=interpolate(data,p.x); if (m == null) return;
        addLine(p.x,'eng-danger'); addCircle(p.x,m,'eng-danger');
        addLabel(p.x,Y(m)+(i%2 ? 18 : -10),'eng-danger',
          `At dangerous section: M = ${fmt(displayValue(m,'moment'),3)} ${unitLabel('moment')} (x = ${fmt(displayValue(p.x,'pos'),3)} ${unitLabel('pos')})`);
      });
    }

    if (g.childNodes.length) svg.appendChild(g);
  }

  const originalRenderChart = window.renderChart;
  if (typeof originalRenderChart !== 'function') return;
  window.renderChart = function(...args) {
    originalRenderChart.apply(this,args);
    if (args[0] === 'sfd' || args[0] === 'bmd') annotate(args[0],args[1]);
  };

  const style=document.createElement('style');
  style.textContent=`
    .engineering-points-safe{pointer-events:none}
    .eng-line{stroke-width:1.5;stroke-dasharray:6 4}
    .eng-dot{stroke:#fff;stroke-width:2}
    .eng-label{font-size:10px;font-weight:750;paint-order:stroke;stroke-width:3px;stroke-linejoin:round}
    .eng-danger{stroke:#ff6b6b;fill:#ff6b6b}
    .eng-label.eng-danger{fill:#ff9a9a;stroke:#0b1016}
    .eng-contra{stroke:#b69cff;fill:#b69cff}
    .eng-label.eng-contra{fill:#c8b8ff;stroke:#0b1016}
  `;
  document.head.appendChild(style);
})();
