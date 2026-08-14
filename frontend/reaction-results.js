/* Reaction result presentation.
   Keeps solver signs unchanged and translates signed reactions into
   engineering direction labels for the Results table.
*/
(() => {
  const verticalText = value => {
    const v = Number(value);
    if (!Number.isFinite(v) || Math.abs(v) < 1e-12) return `0 ${unitLabel('force')}`;
    return `${fmt(displayValue(Math.abs(v), 'force'), 3)} ${unitLabel('force')} (${v > 0 ? 'upwards' : 'downwards'})`;
  };

  const momentText = value => {
    const v = Number(value);
    if (!Number.isFinite(v) || Math.abs(v) < 1e-12) return `0 ${unitLabel('moment')}`;
    return `${fmt(displayValue(Math.abs(v), 'moment'), 3)} ${unitLabel('moment')} (${v > 0 ? 'CCW' : 'CW'})`;
  };

  function formatReactionTable() {
    const table = document.querySelector('#reactions table');
    if (!table) return;
    [...table.tBodies].forEach(tbody => {
      [...tbody.rows].forEach(row => {
        const cells = row.cells;
        if (cells.length < 5) return;
        const vertical = Number(cells[3].dataset.siValue ?? cells[3].textContent);
        const moment = Number(cells[4].dataset.siValue ?? cells[4].textContent);
        if (Number.isFinite(vertical)) cells[3].textContent = verticalText(vertical);
        if (Number.isFinite(moment)) cells[4].textContent = momentText(moment);
      });
    });
  }

  const originalShowResults = window.showResults;
  if (typeof originalShowResults !== 'function') return;

  window.showResults = function(result) {
    originalShowResults(result);
    const table = document.querySelector('#reactions table');
    if (!table) return;

    const reactions = result?.reactions || [];
    [...table.tBodies[0]?.rows || []].forEach((row, i) => {
      const reaction = reactions[i];
      if (!reaction) return;
      row.cells[3].dataset.siValue = reaction.vertical_kN;
      row.cells[4].dataset.siValue = reaction.moment_kNm;
    });
    formatReactionTable();
  };
})();
