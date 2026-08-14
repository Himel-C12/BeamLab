/* Engineering critical-point annotations.
   Uses the chart's own scales so annotations land exactly on the rendered SFD/BMD.
*/
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const EPS = 1e-9;
  const XEPS = 1e-7;

  const sign = v => Math.abs(Number(v)) < EPS ? 0 : (Number(v) > 0 ? 1 : -1);
  const sameX = (a, b) => Math.abs(Number(a) - Number(b)) < XEPS;
  const unique = points => {
    points.sort((a, b) => a.x - b.x);
    return points.filter((p, i) => i === 0 || !sameX(p.x, points[i - 1].x));
  };

  function interpolate(data, x) {
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
  }

  function zeroCrossings(data, excludeXs = []) {
    const out = [];
    for (let i = 0; i < data.length - 1; i++) {
      const a = data[i], b = data[i + 1];
      const sa = sign(a.y), sb = sign(b.y);
      if (sa === 0) {
        if (i > 0 && sign(data[i - 1].y) !== 0 && sign(data[i - 1].y) !== sb) {
          out.push({ x: a.x, y: 0 });
        }
        continue;
      }
      if (sb === 0 || sa === sb) continue;
      const t = -a.y / (b.y - a.y);
      const x = a.x + (b.x - a.x) * t;
      if (!excludeXs.some(px => sameX(px, x))) out.push({ x, y: 0 });
    }
    return unique(out);
  }

  function dangerousSections(sfd, jumps) {
    const out = [];
    const jumpXs = [];

    for (const j of jumps || []) {
      if (j.side !== 'left') continue;
      const r = (jumps || []).find(k => k.side === 'right' && sameX(k.x, j.x));
      if (!r) continue;
      jumpXs.push(Number(j.x));
      const left = Number(j.shear_kN);
      const right = Number(r.shear_kN);
      if (sign(left) && sign(right) && sign(left) !== sign(right)) {
        out.push({ x: Number(j.x), y: 0 });
      }
    }

    // At non-jump locations, a dangerous section occurs where V changes
    // sign, i.e. where dM/dx = V passes through zero.
    const crossings = zeroCrossings(sfd, jumpXs);
    out.push(...crossings);
    return unique(out);
  }

  function chartInfo(svg) {
    const grid = [...svg.querySelectorAll('.chart-grid')];
    const horizontal = grid.filter(line => line.getAttribute('x1') === line.getAttribute('x2'));
    const vertical = grid.filter(line => line.getAttribute('y1') === line.getAttribute('y2'));
    const left = Number(svg.getAttribute('data-x-min'));
    const right = Number(svg.getAttribute('data-x-max'));
    const yMin = Number(svg.getAttribute('data-y-min'));
    const yMax = Number(svg.getAttribute('data-y-max'));

    // renderChart below this file does not expose scale metadata, so recover
    // it from the rendered grid and labels when metadata is absent.
    const padL = 58, padR = 28, padT = 28, padB = 50, W = 900, H = 330;
    const xs = vertical.map(l => Number(l.getAttribute('x1'))).filter(Number.isFinite);
    const ys = horizontal.map(l => Number(l.getAttribute('y1'))).filter(Number.isFinite);
    return {
      X: x => padL + (x - (Number.isFinite(left) ? left : 0)) / ((Number.isFinite(right) ? right : (lastResult?.diagrams?.samples?.at(-1)?.x ?? 1)) - (Number.isFinite(left) ? left : 0) || 1) * (W - padL - padR),
      Y: (y, data) => {
        const ymin = Math.min(...data.map(p => p.y), 0);
        const ymax = Math.max(...data.map(p => p.y), 0);
        const span = ymax - ymin;
        const lo = span ? ymin - span * 0.08 : -1;
        const hi = span ? ymax + span * 0.08 : 1;
        return H - padB - (y - lo) / (hi - lo) * (H - padT - padB);
      },
      W, H, padL, padR, padT, padB
    };
  }

  function addStyle() {
    if (document.getElementById('eng-point-style')) return;
    const s = document.createElement('style');
    s.id = 'eng-point-style';
    s.textContent = `
      .engineering-points { pointer-events:none; }
      .eng-line { stroke-width:1.4; stroke-dasharray:6 4; pointer-events:none; }
      .eng-dot { stroke:#fff; stroke-width:2; pointer-events:none; }
      .eng-label { font-size:10px; font-weight:750; paint-order:stroke; stroke-width:3px; stroke-linejoin:round; pointer-events:none; }
      .eng-danger { stroke:#ff6b6b; fill:#ff6b6b; }
      .eng-label.eng-danger { fill:#ff9a9a; stroke:#0b1016; }
      .eng-contra { stroke:#b69cff; fill:#b69cff; }
      .eng-label.eng-contra { fill:#c8b8ff; stroke:#0b1016; }
      body:not(.dark) .eng-label.eng-danger { fill:#dc2626; stroke:#fff; }
      body:not(.dark) .eng-label.eng-contra { fill:#7c3aed; stroke:#fff; }
    `;
    document.head.appendChild(s);
  }

  function makeSvgText(x, y, className, text) {
    const t = document.createElementNS(NS, 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('class', `eng-label ${className}`);
    t.textContent = text;
    return t;
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

    const scale = chartInfo(svg);
    const group = document.createElementNS(NS, 'g');
    group.setAttribute('class', 'engineering-points');

    if (id === 'sfd') {
      const points = dangerousSections(
        data,
        lastResult.diagrams.jumps || []
      );

      points.forEach((p, i) => {
        const x = scale.X(p.x);
        const zero = scale.Y(0, data);
        group.appendChild(Object.assign(document.createElementNS(NS, 'line'), {
          className: 'eng-line'
        }));
        const line = group.lastChild;
        line.setAttribute('x1', x); line.setAttribute('x2', x);
        line.setAttribute('y1', scale.padT); line.setAttribute('y2', scale.H - scale.padB);
        line.setAttribute('class', 'eng-line eng-danger');

        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', x); dot.setAttribute('cy', zero); dot.setAttribute('r', 5);
        dot.setAttribute('class', 'eng-dot eng-danger');
        group.appendChild(dot);

        group.appendChild(makeSvgText(
          x + 8,
          zero + (i % 2 ? -16 : 18),
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
        const zero = scale.Y(0, data);

        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', x); line.setAttribute('x2', x);
        line.setAttribute('y1', scale.padT); line.setAttribute('y2', scale.H - scale.padB);
        line.setAttribute('class', 'eng-line eng-contra');
        group.appendChild(line);

        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', x); dot.setAttribute('cy', zero); dot.setAttribute('r', 5);
        dot.setAttribute('class', 'eng-dot eng-contra');
        group.appendChild(dot);

        group.appendChild(makeSvgText(
          x + 8,
          zero + (i % 2 ? -16 : 18),
          'eng-contra',
          `Contraflexure: x = ${fmt(displayValue(p.x, 'pos'), 3)} ${unitLabel('pos')}`
        ));
      });

      const sfd = samples.map(s => ({ x: Number(s.x), y: Number(s.shear_kN) }))
        .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
      const dangerous = dangerousSections(sfd, lastResult.diagrams.jumps || []);
      const momentData = data;
      dangerous.forEach((p, i) => {
        const x = scale.X(p.x);
        const m = interpolate(momentData, p.x);
        const y = scale.Y(m, momentData);

        const line = document.createElementNS(NS, 'line');
        line.setAttribute('x1', x); line.setAttribute('x2', x);
        line.setAttribute('y1', scale.padT); line.setAttribute('y2', scale.H - scale.padB);
        line.setAttribute('class', 'eng-line eng-danger');
        group.appendChild(line);

        const dot = document.createElementNS(NS, 'circle');
        dot.setAttribute('cx', x); dot.setAttribute('cy', y); dot.setAttribute('r', 5);
        dot.setAttribute('class', 'eng-dot eng-danger');
        group.appendChild(dot);

        group.appendChild(makeSvgText(
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
    addStyle();
    annotate('sfd');
    annotate('bmd');
  }

  // app.js exposes renderAllCharts in the current build. Re-wrap it so the
  // annotations always follow a fresh chart render without observing the DOM.
  if (typeof renderAllCharts === 'function' && !renderAllCharts.__engineeringWrapped) {
    const original = renderAllCharts;
    const wrapped = function(...args) {
      const result = original.apply(this, args);
      requestAnimationFrame(scan);
      return result;
    };
    wrapped.__engineeringWrapped = true;
    renderAllCharts = wrapped;
    window.renderAllCharts = wrapped;
  }

  requestAnimationFrame(scan);
})();
