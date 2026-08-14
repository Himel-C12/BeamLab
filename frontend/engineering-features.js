/* BeamLab engineering-point calculations.
   Kept separate from chart rendering so SFD/BMD remain clean and responsive.
*/
(() => {
  const EPS = 1e-9;
  const num = v => Number(v);
  const sign = v => Math.abs(num(v)) < EPS ? 0 : (num(v) > 0 ? 1 : -1);

  function uniqueByX(points) {
    points.sort((a,b) => a.x - b.x);
    return points.filter((p,i) => i === 0 || Math.abs(p.x - points[i-1].x) > 1e-7);
  }

  function zeroCrossings(data, excluded = []) {
    const out = [];
    for (let i = 0; i < data.length - 1; i++) {
      const a = data[i], b = data[i+1];
      const sa = sign(a.y), sb = sign(b.y);
      if (sa === 0) {
        if (i > 0 && sb !== 0 && sign(data[i-1].y) !== sb &&
            !excluded.some(x => Math.abs(x - a.x) < 1e-7)) {
          out.push({x:a.x, y:0});
        }
        continue;
      }
      if (sb === 0 || sa === sb) continue;
      const t = -a.y / (b.y - a.y);
      const x = a.x + (b.x - a.x) * t;
      if (!excluded.some(px => Math.abs(px - x) < 1e-7)) out.push({x, y:0});
    }
    return uniqueByX(out);
  }

  function dangerousSections(sfd, jumps = []) {
    const out = [], excluded = [];
    for (const j of jumps) {
      if (j.side !== 'left') continue;
      const r = jumps.find(k => k.side === 'right' && Math.abs(k.x - j.x) < 1e-8);
      if (!r) continue;
      excluded.push(num(j.x));
      if (sign(j.y) !== 0 && sign(r.y) !== 0 && sign(j.y) !== sign(r.y)) {
        out.push({x:num(j.x), y:0});
      }
    }
    out.push(...zeroCrossings(sfd, excluded));
    return uniqueByX(out);
  }

  function interpolate(data, x) {
    if (!data.length) return null;
    if (x <= data[0].x) return data[0].y;
    if (x >= data[data.length-1].x) return data[data.length-1].y;
    let lo = 0, hi = data.length - 1;
    while (lo + 1 < hi) {
      const m = (lo + hi) >> 1;
      if (data[m].x <= x) lo = m; else hi = m;
    }
    const a = data[lo], b = data[hi];
    const t = (x - a.x) / (b.x - a.x || 1);
    return a.y + (b.y - a.y) * t;
  }

  window.beamEngineering = { dangerousSections, zeroCrossings, interpolate };
})();
