export const WALK_BLOCKED = '這裡過不去';

export function stepToward(from, to, step) {
  return Math.abs(to - from) <= step ? to : from + Math.sign(to - from) * step;
}

// 共用長畫的水平互動距離。目的地留在熱區邊緣附近，避免走進人物或物件。
export function horizontalInteraction({ position, bounds, available, interact, blocked, resetMovement }) {
  let pending = null;
  function near(h) {
    return (h.canReach?.() ?? true) && Math.abs(position() - center(h)) < reach(h);
  }
  function center(h) { return h.approachX?.() ?? (h.x + h.w / 2); }
  function reach(h) { return h.reach ?? (90 + h.w / 2); }
  function cancel() {
    pending = null;
    resetMovement?.();
  }
  function begin(h, input) {
    cancel();
    if (!available(h)) return;
    if (near(h)) interact(h, input);
    else pending = { hot: h, input };
  }
  function destination() {
    if (!pending) return null;
    const { hot: h, input } = pending;
    if (!available(h)) { cancel(); return null; }
    if (near(h)) { cancel(); interact(h, input); return null; }
    const x = position(), cx = center(h);
    const [left, right] = bounds();
    const inLayer = h.canReach?.() ?? true;
    const stop = h.approachStop?.() ?? (inLayer ? cx + Math.sign(x - cx) * reach(h) * 0.8 : cx);
    const target = Math.max(left, Math.min(right, stop));
    if (Math.abs(x - target) < 0.0001) { cancel(); blocked(); return null; }
    return target;
  }
  return { begin, cancel, destination, get active() { return pending !== null; } };
}

export function hintBlocked() {
  const hint = document.getElementById('hint');
  const original = hint.dataset.original || hint.textContent;
  hint.dataset.original = original;
  hint.textContent = WALK_BLOCKED;
  clearTimeout(hint.restore);
  hint.restore = setTimeout(() => { hint.textContent = original; }, 1800);
}
