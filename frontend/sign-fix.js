/* BeamLab load-label sign fix
   Input values are magnitudes; the arrow already communicates the downward direction.
   Keep the numerical sign convention in the solver unchanged. */
(()=>{
  const originalRenderBeam = window.renderBeam;
  if (typeof originalRenderBeam !== 'function') return;

  window.renderBeam = function(){
    originalRenderBeam();
    const svg = document.querySelector('#beamCanvas svg');
    if (!svg || typeof state === 'undefined') return;

    const pointLoads = (state.loads || []).filter(l => {
      const t = kind(l.type);
      return t === 'point' || t === 'point_load';
    });

    svg.querySelectorAll('g.point-load text').forEach((text, i) => {
      const load = pointLoads[i];
      if (!load) return;
      const angle = Number(load.angle || 0);
      text.textContent = `${fmt(Math.abs(displayValue(load.value, 'force')))} ${unitLabel('force')}${angle ? ` @ ${angle}°` : ''}`;
    });
  };
})();
