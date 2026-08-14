/* BeamLab engineering-point calculations.
   Kept separate from chart rendering so SFD/BMD remain clean and responsive.
*/
(() => {
  const EPS = 1e-9;
  const JUMP_EPS = 1e-7;
  const num = v => Number(v);
  const sign = v => Math.abs(num(v)) < EPS ? 0 : (num(v) > 0 ? 1 : -1);

  function uniqueByX(points) {
    points.sort((a,b) => a.x - b.x);
    return points.filter((p,i) => i === 0 || Math.abs(p.x - points[i-1].x) > JUMP_EPS);
  }

  function zeroCrossings(data, excluded = []) {
    const out = [];
    if (!data?.length) return out;

    for (let i = 0; i < data.length - 1; i++) {
      const a = data[i], b = data[i + 1];
      const sa = sign(a.y), sb = sign(b.y);

      // Never interpolate through a discontinuity. The shear has a jump there,
      // so a zero crossing must be decided from the two one-sided values.
      if (excluded.some(x => Math.abs(x - a.x) < JUMP_EPS || Math.abs(x - b.x) < JUMP_EPS)) continue;

      // A zero plateau is not a sign change. In particular, a support at the
      // end of a zero-shear region must not create a fake dangerous section at
      // the last sampled point before the support.
      if (sa === 0 || sb === 0) continue;
      if (sa === sb) continue;

      const t = -a.y / (b.y - a.y);
      const x = a.x + (b.x - a.x) * t;
      if (!excluded.some(px => Math.abs(px - x) < JUMP_EPS)) out.push({x, y:0});
    }
    return uniqueByX(out);
  }

  function dangerousSections(sfd, jumps = []) {
    const out = [];
    const jumpXs = uniqueByX(jumps.map(j => ({x:num(j.x)}))).map(p => p.x);

    // A concentrated action can make V jump directly from + to - or - to +.
    // That is a genuine extremum of the BMD and therefore a dangerous section.
    for (const j of jumps) {
      if (j.side !== 'left') continue;
      const r = jumps.find(k => k.side === 'right' && Math.abs(num(k.x) - num(j.x)) < JUMP_EPS);
      if (!r) continue;
      const left = sign(j.shear_kN ?? j.y);
      const right = sign(r.shear_kN ?? r.y);
      if (left !== 0 && right !== 0 && left !== right) {
        out.push({x:num(j.x), y:0});
      }
    }

    // For continuous portions of the beam, V = dM/dx. A dangerous section is
    // therefore an interior point where V changes sign. Do not interpolate
    // across supports or point-load jumps, and do not treat a zero-shear
    // plateau as a sign change.
    out.push(...zeroCrossings(sfd, jumpXs));
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
