const panel = document.getElementById('panel');
const body = document.getElementById('panel-body');

export function preparePanel(design, focus) {
  window.__studio?.panel?.(true, focus);
  panel.inert = false;
  panel.classList.remove('sp2', 'decor-panel', 'studio-feature-panel', 'sf-wide');
  panel.dataset.design = design;
  delete panel.dataset.character;
  body.scrollTop = 0;
}

// 嵌入劇情時，「繼續」也是這次互動的一部分。
document.addEventListener('keydown', event => {
  if (event.key !== 'Tab') return;
  const help = document.querySelector('.sf-help-layer');
  const replay = document.querySelector('.sf-replay');
  const modal = panel.querySelector('dialog[open]');
  const dialog = help || replay || modal || (panel.classList.contains('on') ? panel : null);
  if (!dialog) return;
  const selector = 'button, a[href], input, select, textarea, iframe, [tabindex]';
  const candidates = [...dialog.querySelectorAll(selector)];
  if (!help && !replay && !modal) {
    const next = document.querySelector('.studio-embed-continue');
    if (next) candidates.push(next);
  }
  const stops = candidates.filter(node =>
    node.tabIndex >= 0 && !node.matches(':disabled') &&
    !node.closest('[inert], [hidden]') && node.getClientRects().length &&
    getComputedStyle(node).visibility !== 'hidden'
  );
  if (!stops.length) return;
  const index = stops.indexOf(document.activeElement);
  if (index < 0 || index === (event.shiftKey ? 0 : stops.length - 1)) {
    event.preventDefault();
    stops[event.shiftKey ? stops.length - 1 : 0].focus();
  }
});
