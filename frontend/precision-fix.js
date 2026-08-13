/* BeamLab precision hover fix.
   The solver samples diagrams at finite intervals, but hover inspection must be
   continuous. This handler interpolates between rendered curve points and runs
   in the capture phase so app.js's old nearest-point handler cannot overwrite it.
*/
(() => {
  const parseNum = s => {
    const m = String(s ?? '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    return m ? Number(m[0]) : NaN;
  };

  function pointsFromPath(path) {
    const d = path?.getAttribute('d') || '';
    const pts = [];
    const re = /([ML])\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)/g;
    let m;
    while ((m = re.exec(d))) pts.push({ x: Number(m[2]), y: Number(m[3]) });
    return pts;
  }

  function interpolate(points, x) {
    if (!points.length) return null;
    if (x <= points[0].x) return { x, y: points[0].y };
    if (x >= points[points.length - 1].x) return { x, y: points[points.length - 1].y };
    let lo = 0, hi = points.length - 1;
    while (lo + 1 < hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid].x <= x) lo = mid;
      else hi = mid;
    }
    const a = points[lo], b = points[hi];
    const t = (x - a.x) / (b.x - a.x || 1);
    return { x, y: a.y + (b.y - a.y) * t };
  }

  function install(wrap) {
    if (wrap.dataset.precisionHover === '2') return;

    const svg = wrap.querySelector('svg.chartSvg');
    const tip = wrap.querySelector('.chart-tooltip');
    const curve = svg?.querySelector('path[class*="chart-line"]');
    if (!svg || !tip || !curve) return;

    const pts = pointsFromPath(curve);
    if (pts.length < 2) return;

    const labels = [...svg.querySelectorAll('text.chart-label')];
    const xLabels = labels.filter(t => Number(t.getAttribute('y')) > 250);
    const yLabels = labels.filter(t => Number(t.getAttribute('x')) < 58);
    const xmin = parseNum(xLabels[0]?.textContent);
    const xmax = parseNum(xLabels[xLabels.length - 1]?.textContent);
    const ymin = parseNum(yLabels[yLabels.length - 1]?.textContent);
    const ymax = parseNum(yLabels[0]?.textContent);

    wrap.dataset.precisionHover = '2';

    const onMove = ev => {
      const r = svg.getBoundingClientRect();
      if (!r.width) return;

      // Convert the real mouse coordinate into SVG viewBox coordinates.
      const px = (ev.clientX - r.left) / r.width * 900;
      const p = interpolate(pts, px);
      if (!p) return;

      const x0 = pts[0].x;
      const x1 = pts[pts.length - 1].x;
      const xVal = Number.isFinite(xmin) && Number.isFinite(xmax)
        ? xmin + (p.x - x0) / (x1 - x0 || 1) * (xmax - xmin)
        : p.x;

      const yGrid = [...svg.querySelectorAll('line.chart-grid')]
        .filter(l => l.getAttribute('x1') === l.getAttribute('x2'));
      const topY = Number(yGrid[0]?.getAttribute('y1'));
      const botY = Number(yGrid[yGrid.length - 1]?.getAttribute('y1'));
      const yVal = Number.isFinite(ymin) && Number.isFinite(ymax) && Number.isFinite(topY) && Number.isFinite(botY)
        ? ymin + (botY - p.y) / (botY - topY || 1) * (ymax - ymin)
        : p.y;

      const type = svg.dataset.chart;
      const yUnit = type === 'bmd' ? 'kN·m' : type === 'sfd' ? 'kN' : type === 'deflection' ? 'mm' : 'rad';
      const xUnit = xLabels[0]?.textContent.match(/[a-zA-Z]+/)?.[0] || 'm';

      tip.textContent = `x: ${xVal.toFixed(2)} ${xUnit} · y: ${yVal.toFixed(4)} ${yUnit}`;
      tip.classList.remove('hidden');
      const pct = (p.x - x0) / (x1 - x0 || 1) * 100;
      tip.style.left = `${Math.min(75, Math.max(2, pct))}%`;
      tip.style.top = '8px';

      // Prevent the old nearestPoint() mousemove handler in app.js from
      // replacing our continuous value with a sampled 0.25-unit value.
      ev.stopImmediatePropagation();
    };

    svg.addEventListener('mousemove', onMove, { capture: true, passive: true });
    svg.addEventListener('mouseleave', () => tip.classList.add('hidden'), { passive: true });
  }

  const scan = () => document.querySelectorAll('.chartWrap').forEach(install);
  const observer = new MutationObserver(scan);
  observer.observe(document.body, { childList: true, subtree: true });
  setTimeout(scan, 0);
  setTimeout(scan, 300);
  setTimeout(scan, 1000);
})();
