/* BeamLab calculation fixes */
(() => {
  // The Python solver now supports a true linearly varying UDL directly.
  // Do not approximate it by dozens of tiny uniform loads: that approximation
  // was the source of the visible reaction/SFD error (e.g. 11.675 instead of
  // the exact 11.6667 kN reaction in a 0→10 kN/m triangular load).
  window.prepareAnalysisModel = function () {
    return clone(state);
  };
})();
