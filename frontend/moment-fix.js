/* BeamLab moment-sign visual fix
   Positive moment = CCW, negative moment = CW.
   The sign is preserved in the input/solver; this only fixes the beam graphic.
*/
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const make = (name, attrs = {}) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    return n;
  };
  const num = v => Number(v ?? 0) || 0;

  function arrowHead(cx, cy, r, positive) {
    // At the bottom of the circle, CCW points right and CW points left.
    const x = cx;
    const y = cy + r;
    const dir = positive ? 1 : -1;
    return make('path', {
      d: `M ${x + dir * 7} ${y} L ${x - dir * 7} ${y - 8} L ${x - dir * 5} ${y + 5} Z`,
      class: 'moment-arrow-head'
    });
  }

  function redrawMoment(group, index) {
    const row = document.querySelector(`#loadRows [data-load="${index}"]`)?.closest('tr');
    const value = num(row?.querySelector('[data-field="value"]')?.value);
    const oldPath = group.querySelector('path');
    const text = group.querySelector('text');
    if (!oldPath) return;

    const d = oldPath.getAttribute('d') || '';
    const match = d.match(/M\s*([-\d.]+)\s+([-\d.]+)\s+A\s*([-\d.]+)\s+([-\d.]+).*?([-\d.]+)\s+([-\d.]+)/);
    if (!match) return;

    const x = num(match[1]);
    const y = num(match[2]) + 10;
    const r = 20;
    const positive = value >= 0;

    while (group.firstChild) group.removeChild(group.firstChild);

    // Upper semicircle plus a short lower-side tangent gives a clean,
    // unmistakable CW/CCW engineering moment symbol.
    const startX = x - r;
    const endX = x + r;
    const arc = positive
      ? `M ${startX} ${y} A ${r} ${r} 0 1 1 ${endX} ${y}`
      : `M ${endX} ${y} A ${r} ${r} 0 1 1 ${startX} ${y}`;

    group.appendChild(make('path', {
      d: arc,
      class: 'moment-arrow-arc',
      fill: 'none'
    }));
    group.appendChild(arrowHead(x, y, r, positive));

    const label = make('text', {
      x,
      y: 30,
      'text-anchor': 'middle'
    });
    const magnitude = Math.abs(value).toFixed(2).replace(/\.00$/, '');
    label.textContent = `${value < 0 ? '-' : ''}${magnitude} ${typeof unitLabel === 'function' ? unitLabel('moment') : 'kN·m'}`;
    group.appendChild(label);
  }

  function repair() {
    const canvas = document.querySelector('#beamCanvas');
    if (!canvas || canvas.dataset.momentFixing === '1') return;
    const groups = canvas.querySelectorAll('.moment-load');
    if (!groups.length) return;
    canvas.dataset.momentFixing = '1';
    try { groups.forEach((g, i) => redrawMoment(g, i)); }
    finally { canvas.dataset.momentFixing = '0'; }
  }

  const style = document.createElement('style');
  style.textContent = `
    #beamCanvas .moment-arrow-arc { stroke: currentColor; stroke-width: 2.4; }
    #beamCanvas .moment-arrow-head { fill: currentColor; stroke: none; }
    #beamCanvas .moment-load text { font-weight: 600; }
  `;
  document.head.appendChild(style);

  function install() {
    const canvas = document.querySelector('#beamCanvas');
    if (!canvas || canvas.dataset.momentFixObserver) return;
    canvas.dataset.momentFixObserver = '1';
    const observer = new MutationObserver(repair);
    observer.observe(canvas, { childList: true, subtree: true });
    repair();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  setTimeout(install, 250);
  setTimeout(install, 1000);
})();
