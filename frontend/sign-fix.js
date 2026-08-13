/* BeamLab final beam-symbol repair.
   This file deliberately patches the rendered SVG instead of replacing renderBeam,
   because renderBeam is a lexical function inside app.js.

   Conventions:
   - Point force: + value = downward; - value = upward.
   - Positive angle is measured from the downward vertical toward the left.
   - + moment = counter-clockwise; - moment = clockwise.
   - Pin and roller get a visible ground/surface with diagonal hatching.
*/
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const num = v => Number(v ?? 0) || 0;
  const make = (name, attrs = {}) => {
    const el = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, String(v)));
    return el;
  };
  const kindLocal = v => String(v ?? '').trim().toLowerCase().replaceAll(' ', '_').replaceAll('-', '_');

  function geometry(svg) {
    const beam = svg.querySelector('.beam-line');
    if (!beam) return null;
    const vb = svg.viewBox?.baseVal;
    const width = vb?.width || 1100;
    const beamY = num(beam.getAttribute('y1')) || 105;
    const pad = 70;
    const L = Math.max(typeof totalLength === 'function' ? totalLength() : 1, 1);
    const xOf = p => pad + Number(p) * (width - 2 * pad) / L;
    return { width, beamY, pad, L, xOf };
  }

  function drawSupportGround(svg, g, x, y, half) {
    g.appendChild(make('line', {
      x1: x - half, y1: y, x2: x + half, y2: y,
      class: 'support-ground-line'
    }));
    for (let hx = x - half + 3; hx <= x + half - 2; hx += 8) {
      g.appendChild(make('line', {
        x1: hx, y1: y, x2: hx - 8, y2: y + 10,
        class: 'support-ground-hatch'
      }));
    }
  }

  function repairSupportGraphics(svg, geo) {
    svg.querySelector('.support-ground-surfaces')?.remove();
    const g = make('g', { class: 'support-ground-surfaces' });

    (state.supports || []).forEach(s => {
      const type = kindLocal(s.type);
      if (type !== 'pin' && type !== 'roller') return;
      const x = geo.xOf(s.position);
      drawSupportGround(svg, g, x, geo.beamY + (type === 'roller' ? 37 : 29), type === 'roller' ? 28 : 25);
    });
    svg.appendChild(g);

    // Keep titles safely below the support graphics. The position text follows it.
    svg.querySelectorAll('.support-label').forEach((text, i) => {
      text.setAttribute('y', geo.beamY + 61);
      const s = state.supports?.[i];
      if (s?.type === 'internal_hinge') text.setAttribute('y', geo.beamY + 61);
    });
    svg.querySelectorAll('.position-label').forEach(text => text.setAttribute('y', geo.beamY + 77));
  }

  function arrowHeadPath(x, y, tx, ty, size = 9) {
    const len = Math.hypot(tx, ty) || 1;
    const ux = tx / len, uy = ty / len;
    const px = -uy, py = ux;
    return `M ${x} ${y} L ${x - ux * size + px * size * .62} ${y - uy * size + py * size * .62} L ${x - ux * size - px * size * .62} ${y - uy * size - py * size * .62} Z`;
  }

  function repairPointLoad(group, load, geo) {
    if (!group || !load) return;
    const x = geo.xOf(load.position);
    const beamY = geo.beamY;
    const value = num(load.value);
    const angle = num(load.angle);
    const positive = value >= 0;
    const theta = angle * Math.PI / 180;

    // +angle: down-left from the vertical. Negative force reverses the whole vector.
    let dx = -Math.sin(theta), dy = Math.cos(theta);
    if (!positive) { dx = -dx; dy = -dy; }

    const len = 76;
    const headX = positive ? x : x + dx * len;
    const headY = positive ? beamY - 4 : beamY - 4 + dy * len;
    const tailX = positive ? headX - dx * len : x;
    const tailY = positive ? headY - dy * len : beamY - 4;

    while (group.firstChild) group.removeChild(group.firstChild);
    group.appendChild(make('line', { x1: tailX, y1: tailY, x2: headX, y2: headY }));
    group.appendChild(make('path', {
      d: arrowHeadPath(headX, headY, dx, dy),
      class: 'point-arrow-head'
    }));

    const label = make('text', {
      x: positive ? tailX : headX,
      y: Math.min(tailY, headY) - 8,
      'text-anchor': 'middle'
    });
    label.textContent = `${value < 0 ? '-' : ''}${fmt(Math.abs(value), 3)} ${unitLabel('force')}${angle ? ` @ ${Math.abs(angle)}°` : ''}`;
    group.appendChild(label);

    if (Math.abs(angle) > 1e-9) {
      group.appendChild(make('line', {
        x1: x, y1: beamY - 2, x2: x, y2: beamY - 48,
        class: 'force-angle-reference'
      }));
      const signedAngle = positive ? angle : angle + 180;
      const r = 27;
      const a = d => d * Math.PI / 180;
      const x1 = x + r * Math.cos(a(-90));
      const y1 = beamY - 4 + r * Math.sin(a(-90));
      const x2 = x + r * Math.cos(a(-90 + signedAngle));
      const y2 = beamY - 4 + r * Math.sin(a(-90 + signedAngle));
      const large = Math.abs(signedAngle) > 180 ? 1 : 0;
      const sweep = signedAngle >= 0 ? 1 : 0;
      group.appendChild(make('path', {
        d: `M ${x1} ${y1} A ${r} ${r} 0 ${large} ${sweep} ${x2} ${y2}`,
        class: 'force-angle-arc'
      }));
      const angleText = make('text', {
        x: x + (angle >= 0 ? -32 : 32),
        y: beamY - 36,
        'text-anchor': 'middle',
        class: 'force-angle-text'
      });
      angleText.textContent = `${Math.abs(angle).toFixed(2)}°`;
      group.appendChild(angleText);
    }
  }

  function repairMoment(group, load, geo) {
    if (!group || !load) return;
    const x = geo.xOf(load.position);
    const y = geo.beamY - 4;
    const r = 22;
    const positive = num(load.value) >= 0;

    while (group.firstChild) group.removeChild(group.firstChild);

    // Both symbols finish at the lower-left of the circle so the arrowhead is
    // visually integrated. +M travels counter-clockwise; -M travels clockwise.
    const startDeg = positive ? 45 : 225;
    const endDeg = 135;
    const sweep = positive ? 0 : 1;
    const a = d => d * Math.PI / 180;
    const sx = x + r * Math.cos(a(startDeg));
    const sy = y + r * Math.sin(a(startDeg));
    const ex = x + r * Math.cos(a(endDeg));
    const ey = y + r * Math.sin(a(endDeg));

    group.appendChild(make('path', {
      d: `M ${sx} ${sy} A ${r} ${r} 0 1 ${sweep} ${ex} ${ey}`,
      class: 'moment-arrow-arc',
      fill: 'none'
    }));

    // Tangent at the lower-left end. CCW points down-right; CW points up-left.
    const tx = positive ? 1 : -1;
    const ty = positive ? 1 : -1;
    group.appendChild(make('path', {
      d: arrowHeadPath(ex, ey, tx, ty, 10),
      class: 'moment-arrow-head'
    }));

    const label = make('text', { x, y: 30, 'text-anchor': 'middle' });
    label.textContent = `${num(load.value) < 0 ? '-' : ''}${fmt(Math.abs(num(load.value)), 3)} ${unitLabel('moment')}`;
    group.appendChild(label);
  }

  function repairLoads(svg, geo) {
    const pointLoads = (state.loads || []).filter(l => {
      const t = kindLocal(l.type);
      return t === 'point' || t === 'point_load';
    });
    svg.querySelectorAll('g.point-load').forEach((g, i) => repairPointLoad(g, pointLoads[i], geo));

    const moments = (state.loads || []).filter(l => kindLocal(l.type) === 'moment');
    svg.querySelectorAll('g.moment-load').forEach((g, i) => repairMoment(g, moments[i], geo));
  }

  function repair() {
    const canvas = document.querySelector('#beamCanvas');
    const svg = canvas?.querySelector('svg');
    if (!svg || typeof state === 'undefined') return;
    const geo = geometry(svg);
    if (!geo) return;

    if (canvas._beamSymbolRepairRunning) return;
    canvas._beamSymbolRepairRunning = true;
    try {
      repairSupportGraphics(svg, geo);
      repairLoads(svg, geo);
    } finally {
      canvas._beamSymbolRepairRunning = false;
    }
  }

  const style = document.createElement('style');
  style.textContent = `
    #beamCanvas .support-ground-surfaces { pointer-events:none; }
    #beamCanvas .support-ground-line { stroke:currentColor; stroke-width:2; opacity:.95; }
    #beamCanvas .support-ground-hatch { stroke:currentColor; stroke-width:1.4; opacity:.9; }
    #beamCanvas .support-label { transform:none !important; }
    #beamCanvas .position-label { transform:none !important; }
    #beamCanvas .point-arrow-head { fill:currentColor; stroke:none; }
    #beamCanvas .force-angle-reference { stroke:currentColor; stroke-width:1.5; stroke-dasharray:4 4; opacity:.55; }
    #beamCanvas .force-angle-arc { fill:none; stroke:currentColor; stroke-width:1.5; opacity:.9; }
    #beamCanvas .force-angle-text { font-size:12px; }
    #beamCanvas .moment-arrow-arc { stroke:currentColor; stroke-width:2.6; stroke-linecap:round; }
    #beamCanvas .moment-arrow-head { fill:currentColor; stroke:none; }
    #beamCanvas .moment-load text { font-weight:600; }
  `;
  document.head.appendChild(style);

  let scheduled = false;
  const scheduleRepair = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      repair();
    });
  };

  function install() {
    const canvas = document.querySelector('#beamCanvas');
    if (!canvas || canvas._beamSymbolObserverInstalled) return;
    canvas._beamSymbolObserverInstalled = true;
    const observer = new MutationObserver(scheduleRepair);
    observer.observe(canvas, { childList: true, subtree: true });
    repair();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  setTimeout(install, 0);
  setTimeout(install, 250);
  setTimeout(install, 1000);
})();
