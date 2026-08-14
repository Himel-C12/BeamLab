// Apply the requested simply-supported default after the main app initializes.
// This keeps the solver untouched and uses the app's existing UI/event handlers.
(function applySimplySupportedDefault(){
  const run = () => {
    const spanLength = document.querySelector('[data-span="0"][data-field="length"]');
    if (spanLength) {
      spanLength.value = '8';
      spanLength.dispatchEvent(new Event('input', {bubbles:true}));
    }

    const supportType = document.querySelector('[data-support="0"][data-field="type"]');
    if (supportType) {
      supportType.value = 'pin';
      supportType.dispatchEvent(new Event('change', {bubbles:true}));
    }

    const supportPosition = document.querySelector('[data-support="0"][data-field="position"]');
    if (supportPosition) {
      supportPosition.value = '0';
      supportPosition.dispatchEvent(new Event('input', {bubbles:true}));
    }

    document.querySelector('[data-remove-load="0"]')?.click();
    document.querySelector('[data-add-load="point"]')?.click();

    const loadValue = document.querySelector('[data-load="0"][data-field="value"]');
    const loadPosition = document.querySelector('[data-load="0"][data-field="position"]');
    if (loadValue) {
      loadValue.value = '10';
      loadValue.dispatchEvent(new Event('input', {bubbles:true}));
    }
    if (loadPosition) {
      loadPosition.value = '4';
      loadPosition.dispatchEvent(new Event('input', {bubbles:true}));
    }

    document.querySelector('[data-add-load="point"]')?.closest('.actions');
    const addSupport = document.querySelector('#addSupport');
    addSupport?.click();

    const supports = [...document.querySelectorAll('[data-support][data-field="type"]')];
    const positions = [...document.querySelectorAll('[data-support][data-field="position"]')];
    if (supports[1]) {
      supports[1].value = 'roller';
      supports[1].dispatchEvent(new Event('change', {bubbles:true}));
    }
    if (positions[1]) {
      positions[1].value = '8';
      positions[1].dispatchEvent(new Event('input', {bubbles:true}));
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(run, 0));
  else setTimeout(run, 0);
})();
