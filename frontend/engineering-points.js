/* Engineering critical-point annotations.
   Hooks directly to the rendered chart containers so annotations survive
   every chart redraw. Detection uses the same sample data and scale as app.js.
*/
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const EPS = 1e-9;
  const XEPS = 1e-7;
  let busy = false;

  const sign = v => Math.abs(Number(v)) < EPS ? 0 : (Number(v) > 0 ? 1 : -1);
  const sameX = (a, b) => Math.abs(Number(a) - Number(b)) < XEPS;
  const unique = points => {
    points.sort((a, b) => a.x - b.x);
    return points.filter((p, i) => i === 0 || !sameX(p.x, points[i - 1].x));
  };

  const interpolate = (data, x) => {
    if (!data.length) return 0;
    if (x <= data[0].x) return data[0].y;
    if (x >= data[data.length - 1].x) return data[data.length - 1].y;
    let lo = 0, hi = data.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (data[mid].x <= x) lo = mid;
      else hi = mid;
    }
    const a = data[lo], b = data[hi];
    const t = (x - a.x) / ((b.x - a.x) || 1);
    return a.y + (b.y - a.y) * t;
  };

  function zeroCrossings(data, excluded = []) {
    const out = [];
    for (let i = 0; i < data.length - 1; i++) {
      const a = data[i], b = data[i + 1];
      const sa = sign(a.y), sb = sign(b.y);
      if (sa === 0) {
        if (i > 0 && sb !== 0 && sign(data[i - 1].y) !== sb &&
            !excluded.some(x => sameX(x, a.x))) out.push({ x: a.x, y: 0 });
        continue;
      }
      if (sb === 0 || sa === sb) continue;
      const t = -a.y / (b.y - a.y);
      const x = a.x + (b.x - a.x) * t;
      if (!excluded.some(px => sameX(px, x))) out.push({ x, y: 0 });
    }
    return unique(out);
  }

  function dangerousSections(sfd, jumps) {
    const jumpXs = [];
    const out = [];

    for (const j of jumps || []) {
      if (j.side !== 'left') continue;
      const r = (jumps || []).find(k => k.side === 'right' && sameX(k.x, j.x));
      if (!r) continue;
      jumpXs.push(Number(j.x));
      const left = Number(j.shear_kN);
      const right = Number(r.shear_kN);
      // A point load can make V jump directly from + to - or - to +.
      if (sign(left) && sign(right) && sign(left) !== sign(right)) {
        out.push({ x: Number(j.x), y: 0 });
      }
    }

    // Between concentrated actions, V = dM/dx. Therefore a V sign change
    // identifies the exact location of a maximum/minimum BMD.
    out.push(...zeroCrossings(sfd, jumpXs));
    return unique(out);
  }

  function scales(data) {
    const W = 900, H = 330, pad = { l: 58, r: 28, t: 28, b: 50 };
    const xmin = Math.min(...data.map(p => p.x));
    const xmax = Math.max(...data.map(p => p.x));
    let ymin = Math.min(...data.map(p => p.y), 0);
    let ymax = Math.max(...data.map(p => p.y), 0);
    let span = ymax - ymin;
    if (!Number.isFinite(span) || span === 0) {
      span = Math.max(1, Math.abs(ymax) || 1);
      ymin -= span / 2;
      ymax += span / 2;
    } else {
      ymin -= span * 0.08;
      ymax += span * 0.08;
    }
    return {
      W, H, pad,
      X: x => pad.l + (x - xmin) / (xmax - xmin || 1) * (W - pad.l - pad.r),
      Y: y => H - pad.b - (y - ymin) / (ymax - ymin || 1) * (H - pad.t - pad.b),
      zero: H - pad.b - (0 - ymin) / (ymax - ymin || 1) * (H - pad.t - pad.b)
    };
  }

  function addStyle() {
    if (document.getElementById('eng-point-style')) return;
    const style = document.createElement('style');
    style.id = 'eng-point-style';
    style.textContent = `
      .engineering-points { pointer-events:none; }
      .eng-line { stroke-width:1.5; stroke-dasharray:6 4; }
      .eng-dot { stroke:#fff; stroke-width:2; }
      .eng-label { font-size:10px; font-weight:750; paint-order:stroke; stroke-width:3px; stroke-linejoin:round; }
      .eng-danger { stroke:#ff6b6b; fill:#ff6b6b; }
      .eng-label.eng-danger { fill:#ff9a9a; stroke:#0b1016; }
      .eng-contra { stroke:#b69cff; fill:#b69cff; }
      .eng-label.eng-contra { fill:#c8b8ff; stroke:#0b1016; }
      body:not(.dark) .eng-label.eng-danger { fill:#dc2626; stroke:#fff; }
      body:not(.dark) .eng-label.eng-contra { fill:#7c3aed; stroke:#fff; }
    `;
    document.head.appendChild(style);
  }

  function text(x, y, cls, value) {
    const el = document.createElementNS(NS, 'text');
    el.setAttribute('x', x);
    el.setAttribute('y', y);
    el.setAttribute('class', `eng-label ${cls}`);
    el.textContent = value;
    return el;
  }

  function line(x, cls, scale) {
    const el = document.createElementNS(NS, 'line');
    el.setAttribute('x1', x);
    el.setAttribute('x2', x);
    el.setAttribute('y1', scale.pad.t);
    el.setAttribute('y2', scale.H - scale.pad.b);
    el.setAttribute('class', `eng-line ${cls}`);
    return el;
  }

  function annotate(id) {
    if (typeof lastResult === 'undefined' || !lastResult?.diagrams?.samples?.length) return;
    const svg = document.querySelector(`#${id} svg.chartSvg`);
    if (!svg) return;

    svg.querySelector('.engineering-points')?.remove();

    const samples = lastResult.diagrams.samples;
    const data = samples.map(s => ({
      x: Number(s.x),
      y: Number(id === 'sfd' ? s.shear_kN : s.moment_kNm)
    })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (data.length < 2) return;

    const scale = scales(data);
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('class', 'engineering-points');

    if (id === 'sfd') {
      dangerousSections(data, lastResult.diagrams.jumps || []).forEach((p, i) => {
        const x = scale.X(p.x);
        group.appendChild(line(x, 'eng-danger', scale));
        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', scale.zero);
        dot.setAttribute('r', 5);
        dot.setAttribute('class', 'eng-dot eng-danger');
        group.appendChild(dot);
        group.appendChild(text(
          x + 8,
          scale.zero + (i % 2 ? -16 : 18),
          'eng-danger',
          `Dangerous section: x = ${fmt(displayValue(p.x, 'pos'), 3)} ${unitLabel('pos')}`
        ));
      });
    } else {
      const momentXs = (typeof state !== 'undefined' ? state.loads : [])
        .filter(l => kind(l.type) === 'moment')
        .map(l => Number(l.position));

      zeroCrossings(data, momentXs).forEach((p, i) => {
        const x = scale.X(p.x);
        group.appendChild(line(x, 'eng-contra', scale));
        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', scale.zero);
        dot.setAttribute('r', 5);
        dot.setAttribute('class', 'eng-dot eng-contra');
        group.appendChild(dot);
        group.appendChild(text(
          x + 8,
          scale.zero + (i % 2 ? -16 : 18),
          'eng-contra',
          `Contraflexure: x = ${fmt(displayValue(p.x, 'pos'), 3)} ${unitLabel('pos')}`
        ));
      });

      const sfd = samples.map(s => ({
        x: Number(s.x), y: Number(s.shear_kN)
      })).filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));

      dangerousSections(sfd, lastResult.diagrams.jumps || []).forEach((p, i) => {
        const x = scale.X(p.x);
        const m = interpolate(data, p.x);
        const y = scale.Y(m);
        group.appendChild(line(x, 'eng-danger', scale));
        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
        dot.setAttribute('r', 5);
        dot.setAttribute('class', 'eng-dot eng-danger');
        group.appendChild(dot);
        group.appendChild(text(
          x + 8,
          y + (i % 2 ? 18 : -10),
          'eng-danger',
          `At dangerous section: M = ${fmt(displayValue(m, 'moment'), 3)} ${unitLabel('moment')} (x = ${fmt(displayValue(p.x, 'pos'), 3)} ${unitLabel('pos')})`
        ));
      });
    }

    if (group.childNodes.length) svg.appendChild(group);
  }

  function scan() {
    if (busy) return;
    busy = true;
    try {
      addStyle();
      annotate('sfd');
      annotate('bmd');
    } finally {
      busy = false;
    }
  }

  function observeChart(id) {
    const host = document.getElementById(id);
    if (!host || host.dataset.engineeringObserver) return;
    host.dataset.engineeringObserver = '1';
    const observer = new MutationObserver(records => {
      const meaningful = records.some(r => {
        const nodes = [...r.addedNodes, ...r.removedNodes];
        return nodes.some(n => !(n.nodeType === 1 && n.classList.contains('engineering-points')));
      });
      if (meaningful) requestAnimationFrame(scan);
    });
    observer.observe(host, { childList: true, subtree: true });
  }

  function boot() {
    addStyle();
    observeChart('sfd');
    observeChart('bmd');
    requestAnimationFrame(scan);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();