(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const el = (name, attrs = {}) => {
    const node = document.createElementNS(NS, name);
    for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
    return node;
  };

  function drawSupportSurfaces() {
    const canvas = document.querySelector('#beamCanvas');
    const svg = canvas?.querySelector('svg');
    if (!svg || typeof state === 'undefined') return;

    const old = svg.querySelector('.support-ground-surfaces');
    if (old) old.remove();

    const beam = svg.querySelector('.beam-line');
    if (!beam) return;

    const vb = svg.viewBox?.baseVal;
    const width = vb?.width || 1100;
    const pad = 70;
    const beamY = Number(beam.getAttribute('y1')) || 105;
    const length = typeof totalLength === 'function' ? Math.max(totalLength(), 1) : 1;
    const xOf = p => pad + Number(p) * (width - 2 * pad) / length;
    const group = el('g', { class: 'support-ground-surfaces' });

    (state.supports || []).forEach(support => {
      const type = String(support.type || '').toLowerCase();
      if (type !== 'pin' && type !== 'roller') return;

      const x = xOf(support.position);
      const y = beamY + (type === 'roller' ? 37 : 29);
      const half = type === 'roller' ? 28 : 25;

      group.appendChild(el('line', {
        x1: x - half, y1: y, x2: x + half, y2: y,
        class: 'support-ground-line'
      }));

      for (let hx = x - half + 3; hx <= x + half - 2; hx += 8) {
        group.appendChild(el('line', {
          x1: hx, y1: y, x2: hx - 7, y2: y + 10,
          class: 'support-ground-hatch'
        }));
      }
    });

    svg.appendChild(group);
  }

  const style = document.createElement('style');
  style.textContent = `
    #beamCanvas .support-ground-surfaces { pointer-events:none; }
    #beamCanvas .support-ground-line { stroke:currentColor; stroke-width:2; opacity:.9; }
    #beamCanvas .support-ground-hatch { stroke:currentColor; stroke-width:1.4; opacity:.82; }
  `;
  document.head.appendChild(style);

  function install() {
    const canvas = document.querySelector('#beamCanvas');
    if (!canvas || canvas.dataset.supportSurfaceObserver) return;
    canvas.dataset.supportSurfaceObserver = '1';
    const observer = new MutationObserver(() => {
      if (canvas.dataset.supportSurfaceDrawing === '1') return;
      canvas.dataset.supportSurfaceDrawing = '1';
      try { drawSupportSurfaces(); } finally { canvas.dataset.supportSurfaceDrawing = '0'; }
    });
    observer.observe(canvas, { childList: true, subtree: true });
    drawSupportSurfaces();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  setTimeout(install, 250);
  setTimeout(install, 1000);
})();
