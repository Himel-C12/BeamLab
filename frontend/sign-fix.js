/* BeamLab visual sign + support graphics fix
   Point-load labels preserve the entered sign.
   Moment convention: +M = CCW, -M = CW.
   Pin and Roller supports receive ground/surface lines with diagonal hatching.
*/
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const make = (name, attrs = {}) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const num = v => Number(v ?? 0) || 0;

  function drawSupportSurfaces(svg) {
    if (!svg || typeof state === 'undefined') return;
    svg.querySelector('.support-ground-surfaces')?.remove();
    const beam = svg.querySelector('.beam-line');
    if (!beam) return;
    const width = svg.viewBox?.baseVal?.width || 1100;
    const pad = 70;
    const beamY = num(beam.getAttribute('y1')) || 105;
    const L = typeof totalLength === 'function' ? Math.max(totalLength(), 1) : 1;
    const xOf = p => pad + Number(p) * (width - 2 * pad) / L;
    const g = make('g', { class: 'support-ground-surfaces' });

    (state.supports || []).forEach(s => {
      const type = String(s.type || '').toLowerCase();
      if (type !== 'pin' && type !== 'roller') return;
      const x = xOf(s.position);
      const y = beamY + (type === 'roller' ? 37 : 29);
      const half = type === 'roller' ? 28 : 25;
      g.appendChild(make('line', { x1:x-half, y1:y, x2:x+half, y2:y, class:'support-ground-line' }));
      for (let hx=x-half+3; hx<=x+half-2; hx+=8) {
        g.appendChild(make('line', { x1:hx, y1:y, x2:hx-7, y2:y+10, class:'support-ground-hatch' }));
      }
    });
    svg.appendChild(g);
  }

  function redrawMoment(group, index) {
    const row = document.querySelector(`#loadRows [data-load="${index}"]`)?.closest('tr');
    const value = num(row?.querySelector('[data-field="value"]')?.value);
    const oldPath = group.querySelector('path');
    if (!oldPath) return;
    const match = (oldPath.getAttribute('d') || '').match(/M\s*([-\d.]+)\s+([-\d.]+)/);
    if (!match) return;

    const x = num(match[1]);
    const y = num(match[2]) + 10;
    const r = 20;
    const positive = value >= 0;
    while (group.firstChild) group.removeChild(group.firstChild);

    // Positive moment is counter-clockwise; negative moment is clockwise.
    const startX = x - r, endX = x + r;
    const arc = positive
      ? `M ${startX} ${y} A ${r} ${r} 0 1 1 ${endX} ${y}`
      : `M ${endX} ${y} A ${r} ${r} 0 1 1 ${startX} ${y}`;
    group.appendChild(make('path', { d:arc, class:'moment-arrow-arc', fill:'none' }));

    const dir = positive ? 1 : -1;
    group.appendChild(make('path', {
      d:`M ${x + dir*7} ${y+r} L ${x - dir*7} ${y+r-8} L ${x - dir*5} ${y+r+5} Z`,
      class:'moment-arrow-head'
    }));

    const label = make('text', { x, y:30, 'text-anchor':'middle' });
    const magnitude = Math.abs(value).toFixed(2).replace(/\.00$/,'');
    label.textContent = `${value < 0 ? '-' : ''}${magnitude} ${unitLabel('moment')}`;
    group.appendChild(label);
  }

  function repairMoments(svg) {
    if (!svg || typeof state === 'undefined') return;
    const moments = (state.loads || []).filter(l => kind(l.type) === 'moment');
    svg.querySelectorAll('g.moment-load').forEach((g, i) => {
      if (moments[i]) redrawMoment(g, i);
    });
  }

  const style = document.createElement('style');
  style.textContent = `
    #beamCanvas .support-ground-surfaces { pointer-events:none; }
    #beamCanvas .support-ground-line { stroke:currentColor; stroke-width:2; opacity:.9; }
    #beamCanvas .support-ground-hatch { stroke:currentColor; stroke-width:1.4; opacity:.82; }
    #beamCanvas .moment-arrow-arc { stroke:currentColor; stroke-width:2.4; }
    #beamCanvas .moment-arrow-head { fill:currentColor; stroke:none; }
    #beamCanvas .moment-load text { font-weight:600; }
  `;
  document.head.appendChild(style);

  const originalRenderBeam = window.renderBeam;
  if (typeof originalRenderBeam !== 'function') return;

  window.renderBeam = function() {
    originalRenderBeam();
    const svg = document.querySelector('#beamCanvas svg');
    if (!svg || typeof state === 'undefined') return;

    const pointLoads = (state.loads || []).filter(l => {
      const t = kind(l.type);
      return t === 'point' || t === 'point_load';
    });
    svg.querySelectorAll('g.point-load text').forEach((text, i) => {
      const load = pointLoads[i];
      if (!load) return;
      const angle = Number(load.angle || 0);
      const sign = Number(load.value) < 0 ? '-' : '';
      text.textContent = `${sign}${fmt(Math.abs(displayValue(load.value, 'force')))} ${unitLabel('force')}${angle ? ` @ ${Math.abs(angle)}°` : ''}`;
    });

    drawSupportSurfaces(svg);
    repairMoments(svg);
  };
})();
