/* BeamLab visual + calculation fixes */
(() => {
  // Keep the true linearly-varying UDL model for the Python solver.
  window.prepareAnalysisModel = function () {
    return clone(state);
  };

  const NS = 'http://www.w3.org/2000/svg';
  const num = v => Number(String(v ?? '').replace(/,/g, '')) || 0;
  const fmtLocal = (v, n = 2) => Number(v).toFixed(n).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');

  function svgEl(name, attrs = {}) {
    const el = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    return el;
  }

  function getLoadInputs() {
    return [...document.querySelectorAll('#loadRows [data-load][data-field="value"]')];
  }

  function getLoadMeta(index) {
    const row = document.querySelector(`#loadRows [data-load="${index}"]`)?.closest('tr');
    if (!row) return { value: 0, angle: 0 };
    const value = num(row.querySelector('[data-field="value"]')?.value);
    const angle = num(row.querySelector('[data-field="angle"]')?.value);
    return { value, angle };
  }

  function arrowPath(x1, y1, x2, y2, size = 7) {
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
    return `M ${x2} ${y2} L ${x2 - ux * size + px * size * .65} ${y2 - uy * size + py * size * .65} L ${x2 - ux * size - px * size * .65} ${y2 - uy * size - py * size * .65} Z`;
  }

  function arcPath(cx, cy, r, startDeg, endDeg) {
    const a = d => d * Math.PI / 180;
    const x1 = cx + r * Math.cos(a(startDeg)), y1 = cy + r * Math.sin(a(startDeg));
    const x2 = cx + r * Math.cos(a(endDeg)), y2 = cy + r * Math.sin(a(endDeg));
    const large = Math.abs(endDeg - startDeg) > 180 ? 1 : 0;
    const sweep = endDeg > startDeg ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`;
  }

  function fixPointLoad(group, index, beamY) {
    const meta = getLoadMeta(index);
    const value = meta.value;
    const angle = meta.angle;
    const beamLine = group.querySelector('line');
    if (!beamLine) return;
    const x = num(beamLine.getAttribute('x1'));
    const endpointY = beamY - 4;
    const positive = value >= 0;
    const theta = angle * Math.PI / 180;

    // Engineering convention used by the reference:
    // +P points downward, with +angle measured counter-clockwise
    // from the downward vertical (therefore +25° points down-left).
    let dx = -Math.sin(theta), dy = Math.cos(theta);
    if (!positive) { dx = -dx; dy = -dy; }

    const len = 76;
    const headX = positive ? x : x + dx * len;
    const headY = positive ? endpointY : endpointY + dy * len;
    const tailX = positive ? headX - dx * len : x;
    const tailY = positive ? headY - dy * len : endpointY;

    const children = [...group.children];
    children.forEach(c => c.remove());

    const line = svgEl('line', { x1: tailX, y1: tailY, x2: headX, y2: headY });
    const head = svgEl('path', { d: arrowPath(tailX, tailY, headX, headY), class: 'point-arrow-head' });
    group.append(line, head);

    const label = svgEl('text', {
      x: positive ? tailX : headX,
      y: Math.min(tailY, headY) - 8,
      'text-anchor': 'middle'
    });
    label.textContent = `${value < 0 ? '-' : ''}${fmtLocal(Math.abs(value), 3)} ${unitLabel('force')}${angle ? ` @ ${Math.abs(angle)}°` : ''}`;
    group.appendChild(label);

    if (Math.abs(angle) > 0.001) {
      // Dashed vertical reference from the application point and a small
      // angle arc, matching the conventional angular-force sketch.
      const ref = svgEl('line', {
        x1: x, y1: endpointY - 2, x2: x, y2: endpointY - 48,
        class: 'force-angle-reference'
      });
      const arcCx = x, arcCy = endpointY - 4, r = 27;
      const signedAngle = positive ? angle : angle + 180;
      const start = -90;
      const end = start + signedAngle;
      const arc = svgEl('path', { d: arcPath(arcCx, arcCy, r, start, end), class: 'force-angle-arc' });
      const angleText = svgEl('text', {
        x: x + (angle >= 0 ? -32 : 32),
        y: endpointY - 36,
        'text-anchor': 'middle',
        class: 'force-angle-text'
      });
      angleText.textContent = `${Math.abs(angle).toFixed(2)}°`;
      group.append(ref, arc, angleText);
    }
  }

  function fixMomentLoad(group, index) {
    const row = document.querySelector(`#loadRows [data-load="${index}"]`)?.closest('tr');
    const value = num(row?.querySelector('[data-field="value"]')?.value);
    const text = group.querySelector('text');
    if (text) text.textContent = `${value < 0 ? '-' : ''}${fmtLocal(Math.abs(value), 3)} ${unitLabel('moment')}`;
  }

  function addDetailedDimensions(svg, width, height, pad, beamY, totalLength) {
    const old = svg.querySelector('.detailed-dimensions');
    if (old) old.remove();

    const positions = [0, totalLength];
    (state.supports || []).forEach(s => positions.push(Number(s.position)));
    (state.loads || []).forEach(l => {
      const t = kind(l.type);
      positions.push(Number(l.position));
      if (t === 'udl') positions.push(Number(l.to));
    });
    const xs = [...new Set(positions.filter(Number.isFinite).filter(x => x >= 0 && x <= totalLength).map(x => Math.round(x * 1e9) / 1e9))].sort((a,b) => a-b);
    if (xs.length < 2) return;

    const xOf = p => pad + p * (width - 2 * pad) / Math.max(totalLength, 1);
    const g = svgEl('g', { class: 'detailed-dimensions' });
    const y = beamY + 100;
    const labelY = y + 25;

    g.appendChild(svgEl('line', { x1: xOf(0), y1: y, x2: xOf(totalLength), y2: y, class: 'dimension-line' }));
    xs.forEach(p => {
      const x = xOf(p);
      g.appendChild(svgEl('line', { x1: x, y1: y - 6, x2: x, y2: y + 6, class: 'dimension-tick' }));
      const t = svgEl('text', { x, y: labelY, 'text-anchor': 'middle', class: 'dimension-point-label' });
      t.textContent = `${fmtLocal(displayValue(p, 'pos'), 3)} ${unitLabel('pos')}`;
      g.appendChild(t);
    });

    // Keep a clean overall dimension below the individual position marks.
    const overallY = y + 45;
    g.appendChild(svgEl('line', { x1: xOf(0), y1: overallY, x2: xOf(totalLength), y2: overallY, class: 'dimension-overall-line' }));
    const overall = svgEl('text', { x: (xOf(0) + xOf(totalLength)) / 2, y: overallY + 20, 'text-anchor': 'middle', class: 'dimension-text' });
    overall.textContent = `${fmtLocal(displayValue(totalLength, 'length'), 3)} ${unitLabel('length')}`;
    g.appendChild(overall);
    svg.appendChild(g);
  }

  function repairBeamVisuals() {
    const canvas = document.querySelector('#beamCanvas');
    const svg = canvas?.querySelector('svg');
    if (!svg || canvas.dataset.visualRepairing === '1') return;
    canvas.dataset.visualRepairing = '1';

    try {
      const beamLine = svg.querySelector('.beam-line');
      const beamY = beamLine ? num(beamLine.getAttribute('y1')) : 105;
      svg.querySelectorAll('.point-load').forEach((g, i) => fixPointLoad(g, i, beamY));
      svg.querySelectorAll('.moment-load').forEach((g, i) => fixMomentLoad(g, i));

      const vb = svg.viewBox?.baseVal;
      const width = vb?.width || 1100;
      const height = vb?.height || 270;
      const pad = 70;
      addDetailedDimensions(svg, width, height, pad, beamY, totalLength());
    } finally {
      canvas.dataset.visualRepairing = '0';
      canvas.dataset.visualRepaired = '1';
    }
  }

  function installVisualRepair() {
    const canvas = document.querySelector('#beamCanvas');
    if (!canvas || canvas.dataset.visualRepairObserver) return;
    canvas.dataset.visualRepairObserver = '1';
    const observer = new MutationObserver(() => {
      if (canvas.dataset.visualRepairing === '1') return;
      repairBeamVisuals();
    });
    observer.observe(canvas, { childList: true, subtree: true });
    repairBeamVisuals();
  }

  const style = document.createElement('style');
  style.textContent = `
    #beamCanvas .point-arrow-head { fill: currentColor; stroke: none; }
    #beamCanvas .force-angle-reference { stroke: currentColor; stroke-width: 1.5; stroke-dasharray: 4 4; opacity: .55; }
    #beamCanvas .force-angle-arc { fill: none; stroke: currentColor; stroke-width: 1.5; opacity: .9; }
    #beamCanvas .force-angle-text { font-size: 12px; }
    #beamCanvas .detailed-dimensions { pointer-events: none; }
    #beamCanvas .dimension-tick { stroke: currentColor; stroke-width: 1.2; opacity: .8; }
    #beamCanvas .dimension-point-label { font-size: 11px; }
    #beamCanvas .dimension-overall-line { stroke: currentColor; stroke-width: 1; opacity: .65; }
  `;
  document.head.appendChild(style);

  const boot = () => installVisualRepair();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setTimeout(installVisualRepair, 250);
  setTimeout(installVisualRepair, 1000);
})();
