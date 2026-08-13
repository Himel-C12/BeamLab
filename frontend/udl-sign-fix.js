/* UDL sign + arrow-direction repair.
   Positive UDL intensity = downward arrows above the beam.
   Negative UDL intensity = upward arrows below the beam.
   Varying UDLs are handled point-by-point, including sign changes through zero.
*/
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const num = v => Number(String(v ?? '').replace(/,/g, '')) || 0;
  const fmtLocal = (v, n = 3) => Number(v).toFixed(n).replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
  const el = (name, attrs = {}) => {
    const e = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, String(v)));
    return e;
  };

  function getMeta(index) {
    const l = state?.loads?.[index];
    const row = document.querySelector(`#loadRows [data-load="${index}"]`)?.closest('tr');
    return {
      value: num(row?.querySelector('[data-field="value"]')?.value ?? l?.value),
      value2: num(row?.querySelector('[data-field="value2"]')?.value ?? l?.value2 ?? l?.value),
      to: num(row?.querySelector('[data-field="to"]')?.value ?? l?.to)
    };
  }

  function repairUDL(group, index, beamY) {
    const load = state?.loads?.[index];
    if (!load || kind(load.type) !== 'udl') return;
    const { value: q0, value2: q1, to } = getMeta(index);
    const original = group.querySelector('line');
    if (!original) return;
    const x0 = num(load.position);
    const x1 = to;
    const L = Math.max(totalLength(), 1);
    const vb = group.closest('svg')?.viewBox?.baseVal;
    const width = vb?.width || 1100, pad = 70, scale = (width - 2 * pad) / L;
    const sx = p => pad + p * scale;
    const X0 = sx(x0), X1 = sx(x1);
    if (!Number.isFinite(X0) || !Number.isFinite(X1)) return;

    while (group.firstChild) group.removeChild(group.firstChild);

    const topY = beamY - 78;
    const bottomY = beamY + 78;
    const amp = 62;
    const count = Math.max(8, Math.min(18, Math.ceil(Math.abs(X1 - X0) / 35)));

    const yFor = q => beamY - Math.sign(q) * Math.min(Math.abs(q) / Math.max(Math.abs(q0), Math.abs(q1), 1), 1) * amp;
    const envelope = [];
    for (let i = 0; i <= count; i++) {
      const t = i / count;
      const x = X0 + (X1 - X0) * t;
      const q = q0 + (q1 - q0) * t;
      envelope.push([x, yFor(q)]);
    }

    const line = el('line', { x1: X0, y1: envelope[0][1], x2: X1, y2: envelope[envelope.length - 1][1] });
    group.appendChild(line);

    const arrows = Math.max(7, Math.min(14, Math.round(Math.abs(X1 - X0) / 34) + 1));
    for (let i = 0; i < arrows; i++) {
      const t = arrows === 1 ? 0 : i / (arrows - 1);
      const x = X0 + (X1 - X0) * t;
      const q = q0 + (q1 - q0) * t;
      if (Math.abs(q) < 1e-9) continue;
      const y = yFor(q);
      const dir = q > 0 ? 1 : -1;
      const endY = beamY - dir * 4;
      group.appendChild(el('line', { x1: x, y1: y, x2: x, y2: endY }));
      const s = 5;
      group.appendChild(el('path', {
        d: dir > 0
          ? `M ${x-s} ${endY-9} L ${x} ${endY} L ${x+s} ${endY-9}`
          : `M ${x-s} ${endY+9} L ${x} ${endY} L ${x+s} ${endY+9}`
      }));
    }

    const signText = q0 < 0 || q1 < 0 ? '-' : '';
    const endText = Math.abs(q1);
    const startText = Math.abs(q0);
    const label = el('text', { x: (X0 + X1) / 2, y: Math.min(...envelope.map(p => p[1])) - 12, 'text-anchor': 'middle' });
    if (q0 >= 0 && q1 >= 0) {
      label.textContent = `${fmtLocal(startText)} → ${fmtLocal(endText)} ${unitLabel('force')}/${unitLabel('length')}`;
    } else if (q0 <= 0 && q1 <= 0) {
      label.textContent = `−${fmtLocal(startText)} → −${fmtLocal(endText)} ${unitLabel('force')}/${unitLabel('length')}`;
      label.setAttribute('y', Math.max(...envelope.map(p => p[1])) + 22);
    } else {
      label.textContent = `${q0 < 0 ? '−' : ''}${fmtLocal(startText)} → ${q1 < 0 ? '−' : ''}${fmtLocal(endText)} ${unitLabel('force')}/${unitLabel('length')}`;
    }
    group.appendChild(label);
  }

  function repair() {
    const canvas = document.querySelector('#beamCanvas');
    const svg = canvas?.querySelector('svg');
    if (!svg || typeof state === 'undefined' || canvas.dataset.udlSignRepairing === '1') return;
    canvas.dataset.udlSignRepairing = '1';
    try {
      const beam = svg.querySelector('.beam-line');
      const beamY = num(beam?.getAttribute('y1')) || 105;
      svg.querySelectorAll('g.udl-load').forEach((g, i) => repairUDL(g, i, beamY));
    } finally {
      canvas.dataset.udlSignRepairing = '0';
    }
  }

  function install() {
    const canvas = document.querySelector('#beamCanvas');
    if (!canvas || canvas.dataset.udlSignObserver) return;
    canvas.dataset.udlSignObserver = '1';
    new MutationObserver(() => requestAnimationFrame(repair)).observe(canvas, { childList: true, subtree: true });
    repair();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
  setTimeout(install, 0);
  setTimeout(install, 250);
  setTimeout(install, 1000);
})();
