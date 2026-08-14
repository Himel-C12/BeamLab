/* Keep fixed/encastre support hatching outside the beam.
   app.js draws the fixed symbol with hatching to the left by default.
   Mirror only fixed supports located at the right beam end.
*/
(() => {
  function fixFixedSupports() {
    const canvas = document.getElementById('beamCanvas');
    if (!canvas || typeof state === 'undefined') return;
    const groups = [...canvas.querySelectorAll('svg > g > .fixed-symbol')];
    if (!groups.length) return;

    const fixed = (state.supports || []).filter(s => String(s.type) === 'fixed');
    const L = typeof totalLength === 'function' ? totalLength() : 0;
    const pad = 70, width = 1100;
    const sx = (width - 2 * pad) / Math.max(L, 1);

    fixed.forEach((s, i) => {
      const g = groups[i];
      if (!g) return;
      const x = Number(s.position);
      const svgX = pad + x * sx;
      const isRightEnd = L > 0 && Math.abs(x - L) < 1e-8;
      g.setAttribute('transform', isRightEnd ? `translate(${2 * svgX},0) scale(-1,1)` : '');
    });
  }

  function boot() {
    const canvas = document.getElementById('beamCanvas');
    if (!canvas) return;
    const observer = new MutationObserver(() => requestAnimationFrame(fixFixedSupports));
    observer.observe(canvas, { childList: true, subtree: true });
    requestAnimationFrame(fixFixedSupports);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();