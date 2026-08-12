const statusEl = document.querySelector('#status');
const beamCanvas = document.querySelector('#beamCanvas');
const supportRows = document.querySelector('#supportRows');
const loadRows = document.querySelector('#loadRows');
const resultEl = document.querySelector('#result');

const state = {
  length: 10,
  supports: [
    { id: 1, type: 'pin', position: 0 },
    { id: 2, type: 'roller', position: 10 },
  ],
  loads: [],
};

function renderInputs() {
  supportRows.innerHTML = state.supports.map((s, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>
        <select data-support-id="${s.id}">
          <option value="pin" ${s.type === 'pin' ? 'selected' : ''}>Pin</option>
          <option value="roller" ${s.type === 'roller' ? 'selected' : ''}>Roller</option>
          <option value="fixed" ${s.type === 'fixed' ? 'selected' : ''}>Fixed</option>
          <option value="internal-hinge" ${s.type === 'internal-hinge' ? 'selected' : ''}>Internal Hinge</option>
        </select>
      </td>
      <td><input type="number" step="any" data-support-position="${s.id}" value="${s.position}"></td>
    </tr>`).join('');

  loadRows.innerHTML = state.loads.map((l, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>Point</td>
      <td><input type="number" step="any" data-load-value="${l.id}" value="${l.value}"></td>
      <td><input type="number" step="any" data-load-position="${l.id}" value="${l.position}"></td>
    </tr>`).join('');

  document.querySelectorAll('[data-support-id]').forEach((el) => {
    el.addEventListener('change', () => {
      const support = state.supports.find((s) => s.id === Number(el.dataset.supportId));
      support.type = el.value;
      render();
    });
  });

  document.querySelectorAll('[data-support-position]').forEach((el) => {
    el.addEventListener('change', () => {
      const support = state.supports.find((s) => s.id === Number(el.dataset.supportPosition));
      support.position = Number(el.value);
      render();
    });
  });

  document.querySelectorAll('[data-load-value]').forEach((el) => {
    el.addEventListener('change', () => {
      const load = state.loads.find((l) => l.id === Number(el.dataset.loadValue));
      load.value = Number(el.value);
    });
  });

  document.querySelectorAll('[data-load-position]').forEach((el) => {
    el.addEventListener('change', () => {
      const load = state.loads.find((l) => l.id === Number(el.dataset.loadPosition));
      load.position = Number(el.value);
      render();
    });
  });
}

function supportSymbol(type, x, y) {
  if (type === 'internal-hinge') {
    return `
      <g class="internal-hinge" aria-label="Internal hinge">
        <circle cx="${x}" cy="${y}" r="11" class="hinge-ring" />
        <circle cx="${x}" cy="${y}" r="5" class="hinge-core" />
      </g>`;
  }

  if (type === 'fixed') {
    return `
      <g class="fixed-symbol">
        <line x1="${x - 14}" y1="${y - 25}" x2="${x - 14}" y2="${y + 25}" />
        <line x1="${x - 14}" y1="${y - 20}" x2="${x - 30}" y2="${y - 10}" />
        <line x1="${x - 14}" y1="${y - 8}" x2="${x - 30}" y2="${y + 2}" />
        <line x1="${x - 14}" y1="${y + 4}" x2="${x - 30}" y2="${y + 14}" />
      </g>`;
  }

  const triangle = `<path d="M ${x - 18} ${y + 18} L ${x} ${y - 10} L ${x + 18} ${y + 18} Z" class="support-triangle" />`;
  if (type === 'roller') {
    return `${triangle}
      <circle cx="${x - 8}" cy="${y + 25}" r="5" class="roller" />
      <circle cx="${x + 8}" cy="${y + 25}" r="5" class="roller" />`;
  }
  return triangle;
}

function renderBeam() {
  const width = 900;
  const height = 240;
  const pad = 60;
  const beamY = 95;
  const scale = (width - 2 * pad) / state.length;
  const x = (position) => pad + position * scale;

  const hingeCount = state.supports.filter((s) => s.type === 'internal-hinge').length;
  const supportMarkup = state.supports.map((s, i) => {
    const xx = x(s.position);
    const symbol = supportSymbol(s.type, xx, beamY);
    const label = s.type === 'internal-hinge' ? `H${hingeCount === 1 ? '' : ` ${i + 1}`} · Internal Hinge` : `${s.type}`;
    return `<g class="support">
      ${symbol}
      <text x="${xx}" y="${beamY + 48}" text-anchor="middle" class="support-label">${label}</text>
      <text x="${xx}" y="${beamY + 64}" text-anchor="middle" class="position-label">@ ${s.position} m</text>
    </g>`;
  }).join('');

  const loadMarkup = state.loads.map((l) => {
    const xx = x(l.position);
    return `<g class="point-load">
      <line x1="${xx}" y1="28" x2="${xx}" y2="${beamY - 8}" class="load-line" />
      <polygon points="${xx - 6},${beamY - 18} ${xx + 6},${beamY - 18} ${xx},${beamY - 4}" class="load-arrow" />
      <text x="${xx}" y="20" text-anchor="middle">${l.value} kN</text>
    </g>`;
  }).join('');

  beamCanvas.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Beam model">
      ${loadMarkup}
      <line x1="${pad}" y1="${beamY}" x2="${width - pad}" y2="${beamY}" class="beam-line" />
      ${supportMarkup}
      <line x1="${pad}" y1="${beamY + 95}" x2="${width - pad}" y2="${beamY + 95}" class="dimension-line" />
      <text x="${width / 2}" y="${beamY + 120}" text-anchor="middle" class="dimension-text">${state.length} m</text>
    </svg>`;
}

function render() {
  renderInputs();
  renderBeam();
}

document.querySelector('#addSupport').addEventListener('click', () => {
  state.supports.push({ id: Date.now(), type: 'internal-hinge', position: state.length / 2 });
  render();
});

document.querySelector('#addPoint').addEventListener('click', () => {
  state.loads.push({ id: Date.now(), value: -10, position: state.length / 2 });
  render();
});

document.querySelector('#solve').addEventListener('click', async () => {
  statusEl.textContent = 'Solving…';
  try {
    const response = await fetch('/api/solve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(state),
    });
    const data = await response.json();
    resultEl.textContent = JSON.stringify(data, null, 2);
    statusEl.textContent = response.ok ? 'Solved' : 'Error';
  } catch (error) {
    resultEl.textContent = error instanceof Error ? error.message : String(error);
    statusEl.textContent = 'Error';
  }
});

render();
