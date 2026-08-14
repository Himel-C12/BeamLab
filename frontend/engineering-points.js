/* BeamLab engineering critical-point annotations.
   Shows SFD zero-crossings (dangerous sections), BMD contraflexure points,
   and the BMD value at every SFD dangerous section. */
(() => {
  const W = 900, H = 330, pad = {l:58, r:28, t:28, b:50};
  const EPS = 1e-9;

  function sign(v) {
    if (Math.abs(v) < EPS) return 0;
    return v > 0 ? 1 : -1;
  }

  function unique(points) {
    const out = [];
    points.sort((a,b) => a.x - b.x);
    for (const p of points) {
      if (!out.length || Math.abs(out[out.length-1].x - p.x) > 1e-7) out.push(p);
    }
    return out;
  }

  function interpolate(data, x) {
    if (!data.length) return 0;
    if (x <= data[0].x) return data[0].y;
    if (x >= data[data.length-1].x) return data[data.length-1].y;
    let lo = 0, hi = data.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (data[mid].x <= x) lo = mid; else hi = mid;
    }
    const a = data[lo], b = data[hi];
    const t = (x - a.x) / (b.x - a.x || 1);
    return a.y + (b.y - a.y) * t;
  }

  function zeroCrossings(data) {
    const out = [];
    for (let i = 0; i < data.length - 1; i++) {
      const a = data[i], b = data[i+1], sa = sign(a.y), sb = sign(b.y);
      if (sa && sb && sa !== sb) {
        const t = -a.y / (b.y - a.y);
        out.push({x:a.x + (b.x-a.x)*t, y:0});
      }
    }
    for (let i = 1; i < data.length - 1; i++) {
      if (sign(data[i].y) === 0 && sign(data[i-1].y) * sign(data[i+1].y) < 0) {
        out.push({x:data[i].x, y:0});
      }
    }
    return unique(out);
  }

  function sfdDangerous(data, jumps) {
    const out = [];
    // A point load/support reaction can make the SFD jump directly from + to -
    // (or vice versa), so detect that at the actual jump location.
    for (const j of jumps || []) {
      if (j.side !== 'left') continue;
      const r = (jumps || []).find(k => Math.abs(Number(k.x)-Number(j.x)) < 1e-8 && k.side === 'right');
      if (!r) continue;
      const vl = Number(j.shear_kN), vr = Number(r.shear_kN);
      if (sign(vl) && sign(vr) && sign(vl) !== sign(vr)) out.push({x:Number(j.x), y:0});
    }

    // Continuous zero crossings inside loaded spans.
    const jumpXs = new Set((jumps || []).map(j => Number(j.x).toFixed(8)));
    for (let i = 0; i < data.length - 1; i++) {
      const a = data[i], b = data[i+1];
      if (jumpXs.has(Number(b.x).toFixed(8)) && sign(a.y) !== sign(b.y)) continue;
      const sa = sign(a.y), sb = sign(b.y);
      if (sa && sb && sa !== sb) {
        const t = -a.y / (b.y-a.y);
        out.push({x:a.x+(b.x-a.x)*t, y:0});
      }
    }
    return unique(out);
  }

  function momentContraflexure(data) {
    const out = zeroCrossings(data);
    // A concentrated applied moment creates a jump in BMD. A sign change
    // across that jump is not a contraflexure point, so exclude those x's.
    const momentXs = new Set((window.state?.loads || []).filter(l => {
      const t = String(l.type || '').trim().toLowerCase().replaceAll(' ','_').replaceAll('-','_');
      return t === 'moment';
    }).map(l => Number(l.position).toFixed(8)));
    return out.filter(p => !momentXs.has(Number(p.x).toFixed(8)));
  }

  function scale(data) {
    let xmin = Math.min(...data.map(d=>d.x)), xmax = Math.max(...data.map(d=>d.x));
    let ymin = Math.min(...data.map(d=>d.y),0), ymax = Math.max(...data.map(d=>d.y),0);
    const span = ymax-ymin;
    if (!isFinite(span) || span === 0) {
      const s = Math.max(1, Math.abs(ymax)||1);
      ymin -= s/2; ymax += s/2;
    } else {
      const p = span*.08; ymin -= p; ymax += p;
    }
    const X = x => pad.l + (x-xmin)/(xmax-xmin||1)*(W-pad.l-pad.r);
    const Y = y => H-pad.b-(y-ymin)/(ymax-ymin)*(H-pad.t-pad.b);
    return {X,Y,xmin,xmax,ymin,ymax};
  }

  function svgText(x,y,text,cls,anchor='start') {
    return `<text x="${x.toFixed(2)}" y="${y.toFixed(2)}" text-anchor="${anchor}" class="engineering-point-label ${cls}">${text}</text>`;
  }

  function annotate(id) {
    if (!window.lastResult?.diagrams?.samples?.length) return;
    const svg = document.querySelector(`#${id} svg.chartSvg`);
    if (!svg) return;
    svg.querySelector('.engineering-points')?.remove();

    const samples = window.lastResult.diagrams.samples;
    const data = id === 'sfd'
      ? samples.map(s=>({x:Number(s.x),y:Number(s.shear_kN)}))
      : samples.map(s=>({x:Number(s.x),y:Number(s.moment_kNm)}));
    const clean = data.filter(p=>isFinite(p.x)&&isFinite(p.y));
    if (clean.length < 2) return;
    const {X,Y} = scale(clean);
    const zeroY = Y(0);
    let html = '';

    if (id === 'sfd') {
      const points = sfdDangerous(clean, window.lastResult.diagrams.jumps || []);
      points.forEach((p,i) => {
        const x = X(p.x), y = zeroY;
        const side = i % 2 ? 1 : -1;
        html += `<line x1="${x.toFixed(2)}" y1="${pad.t}" x2="${x.toFixed(2)}" y2="${H-pad.b}" class="engineering-point-line engineering-danger"/>`;
        html += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="6" class="engineering-point engineering-danger"/>`;
        html += svgText(x+9, y+side*18, `Dangerous section: x = ${fmt(displayValue(p.x,'pos'),3)} ${unitLabel('pos')}`, 'engineering-danger', 'start');
      });
    }

    if (id === 'bmd') {
      const contra = momentContraflexure(clean);
      contra.forEach((p,i) => {
        const x = X(p.x), y = zeroY;
        const side = i % 2 ? 1 : -1;
        html += `<line x1="${x.toFixed(2)}" y1="${pad.t}" x2="${x.toFixed(2)}" y2="${H-pad.b}" class="engineering-point-line engineering-contra"/>`;
        html += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="6" class="engineering-point engineering-contra"/>`;
        html += svgText(x+9, y+side*18, `Contraflexure: x = ${fmt(displayValue(p.x,'pos'),3)} ${unitLabel('pos')}`, 'engineering-contra', 'start');
      });

      const sfd = samples.map(s=>({x:Number(s.x),y:Number(s.shear_kN)})).filter(p=>isFinite(p.x)&&isFinite(p.y));
      const dangerous = sfdDangerous(sfd, window.lastResult.diagrams.jumps || []);
      dangerous.forEach((p,i) => {
        const m = interpolate(clean, p.x), x = X(p.x), y = Y(m);
        const side = i % 2 ? -1 : 1;
        html += `<line x1="${x.toFixed(2)}" y1="${pad.t}" x2="${x.toFixed(2)}" y2="${H-pad.b}" class="engineering-point-line engineering-danger"/>`;
        html += `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="5" class="engineering-point engineering-danger"/>`;
        html += svgText(x+9, y+side*20, `At SFD dangerous section: M = ${fmt(displayValue(m,'moment'),3)} ${unitLabel('moment')}  (x = ${fmt(displayValue(p.x,'pos'),3)} ${unitLabel('pos')})`, 'engineering-danger', 'start');
      });
    }

    if (!html) return;
    const g = document.createElementNS('http://www.w3.org/2000/svg','g');
    g.setAttribute('class','engineering-points');
    g.innerHTML = html;
    svg.appendChild(g);
  }

  function installStyles() {
    if (document.getElementById('engineering-point-styles')) return;
    const style = document.createElement('style');
    style.id = 'engineering-point-styles';
    style.textContent = `
      .engineering-point-line{stroke-width:1.4;stroke-dasharray:6 4;pointer-events:none}
      .engineering-point{stroke:#fff;stroke-width:2;pointer-events:none}
      .engineering-point-label{font-size:10px;font-weight:750;paint-order:stroke;stroke:#fff;stroke-width:3px;stroke-linejoin:round;pointer-events:none}
      .engineering-danger{stroke:#ef4444;fill:#ef4444;color:#dc2626}
      .engineering-point-label.engineering-danger{fill:#dc2626}
      .engineering-contra{stroke:#8b5cf6;fill:#8b5cf6;color:#7c3aed}
      .engineering-point-label.engineering-contra{fill:#7c3aed}
      body.dark .engineering-point{stroke:#111820}
      body.dark .engineering-point-label{stroke:#0b1016}
      body.dark .engineering-danger{stroke:#ff6b6b;fill:#ff6b6b}
      body.dark .engineering-point-label.engineering-danger{fill:#ff9a9a}
      body.dark .engineering-contra{stroke:#b69cff;fill:#b69cff}
      body.dark .engineering-point-label.engineering-contra{fill:#c8b8ff}
    `;
    document.head.appendChild(style);
  }

  function scan() {
    installStyles();
    annotate('sfd');
    annotate('bmd');
  }

  new MutationObserver(() => setTimeout(scan, 0)).observe(document.body,{childList:true,subtree:true});
  setTimeout(scan,500);
  setTimeout(scan,1500);
})();
