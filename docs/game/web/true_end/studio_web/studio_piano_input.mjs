const TAP_LENGTH = .09;

export function bindPianoInput(wrap, keys, byNote, band, play) {
  const events = new AbortController();
  const options = { signal: events.signal };
  const capture = { ...options, capture: true };
  const pointers = new Map();
  const heldKeys = new Map();
  const highlights = new Map();

  function start(note, node) {
    const noteOff = play(note);
    highlights.set(node, (highlights.get(node) ?? 0) + 1);
    node.classList.add('down');
    return (delay = 0, letDecay = false) => {
      noteOff?.(delay, letDecay);
      const count = highlights.get(node) - 1;
      if (count) highlights.set(node, count);
      else {
        highlights.delete(node);
        node.classList.remove('down');
      }
    };
  }

  function endPointer(id, letDecay = false) {
    const pointer = pointers.get(id);
    if (!pointer) return;
    pointers.delete(id);
    pointer.release(0, letDecay);
    if (wrap.hasPointerCapture(id)) wrap.releasePointerCapture(id);
  }

  function slideTo(pointer, id, x, y, bounds) {
    const dx = x - pointer.x, dy = y - pointer.y;
    // A fast move can cross several keys between events, including black keys.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 2));
    for (let step = 1; step <= steps; step++) {
      const px = pointer.x + dx * step / steps;
      const py = pointer.y + dy * step / steps;
      const inside = px >= bounds.left && px < bounds.right && py >= bounds.top && py < bounds.bottom;
      const node = inside && document.elementFromPoint(px, py)?.closest('.sp-key');
      if (!node || !wrap.contains(node)) {
        endPointer(id, true);
        return false;
      }
      if (node === pointer.node) continue;
      pointer.release(0, true);
      pointer.node = node;
      pointer.release = start(Number(node.dataset.note), node);
    }
    pointer.x = x;
    pointer.y = y;
    return true;
  }

  wrap.addEventListener('pointerdown', event => {
    const node = event.target.closest('.sp-key');
    if (!node || event.button !== 0 || pointers.has(event.pointerId)) return;
    const id = event.pointerId;
    event.preventDefault();
    wrap.setPointerCapture(id);
    pointers.set(id, {
      node, x: event.clientX, y: event.clientY, release: start(Number(node.dataset.note), node),
    });
  }, options);
  wrap.addEventListener('pointermove', event => {
    const id = event.pointerId;
    const pointer = pointers.get(id);
    if (!pointer) return;
    const bounds = wrap.getBoundingClientRect();
    for (const point of event.getCoalescedEvents?.() ?? []) {
      if (!slideTo(pointer, id, point.clientX, point.clientY, bounds)) return;
    }
    slideTo(pointer, id, event.clientX, event.clientY, bounds);
  }, options);
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    wrap.addEventListener(type, event => endPointer(event.pointerId), options);
  }
  wrap.addEventListener('click', event => {
    const node = event.target.closest('.sp-key');
    if (event.detail === 0 && node) start(Number(node.dataset.note), node)(TAP_LENGTH);
  }, options);

  const keyId = event => event.code || event.key.toLowerCase();
  window.addEventListener('keydown', event => {
    if (!wrap.isConnected || !wrap.closest('#panel.on')) return;
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey ||
        event.target.closest?.('input, select, textarea, [contenteditable], dialog') ||
        wrap.closest('[hidden]') || band.handleKey(event)) return;
    const id = keyId(event);
    const letter = /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : event.key.toLowerCase();
    const base = keys[letter];
    if (base === undefined || heldKeys.has(id)) return;
    event.preventDefault();
    event.stopPropagation();
    const note = base + Number(event.shiftKey);
    heldKeys.set(id, start(note, byNote.get(note) || wrap));
  }, capture);
  window.addEventListener('keyup', event => {
    const id = keyId(event);
    const release = heldKeys.get(id);
    if (!release) return;
    heldKeys.delete(id);
    release();
  }, capture);

  function releaseAll() {
    for (const id of pointers.keys()) endPointer(id);
    for (const release of heldKeys.values()) release();
    heldKeys.clear();
    band.releaseNotes();
  }
  window.addEventListener('blur', releaseAll, options);
  window.addEventListener('pagehide', releaseAll, options);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) releaseAll();
  }, options);

  return () => {
    events.abort();
    releaseAll();
  };
}

export function bindPianoRange(scroller, wrap, el) {
  const label = '拖這裡換音域';
  const range = el('div', 'sp-piano-range');
  const track = el('div', 'sp-piano-range-track');
  const visible = el('span', 'sp-piano-range-visible');
  range.hidden = true;
  range.tabIndex = 0;
  range.setAttribute('role', 'slider');
  range.setAttribute('aria-label', label);
  range.setAttribute('aria-valuemin', '0');
  range.setAttribute('aria-valuemax', '100');
  for (const key of wrap.children) {
    const miniature = el('span', 'sp-piano-range-key');
    if (key.classList.contains('black')) {
      miniature.classList.add('black');
      miniature.style.left = key.style.left;
      miniature.style.width = key.style.width;
    }
    track.append(miniature);
  }
  track.setAttribute('aria-hidden', 'true');
  track.append(visible);
  range.append(el('span', 'sp-piano-range-label', label), track);
  scroller.before(range);

  function sync() {
    const { scrollWidth, clientWidth, scrollLeft } = scroller;
    const overflow = scrollWidth - clientWidth;
    range.hidden = overflow <= 0;
    if (range.hidden) return;
    visible.style.left = `${scrollLeft / scrollWidth * 100}%`;
    visible.style.width = `${clientWidth / scrollWidth * 100}%`;
    range.setAttribute('aria-valuenow', String(Math.round(scrollLeft / overflow * 100)));
  }

  let drag;
  function move(event) {
    const bounds = track.getBoundingClientRect();
    scroller.scrollLeft = (event.clientX - bounds.left - drag.offset) / bounds.width * scroller.scrollWidth;
    sync();
  }
  range.addEventListener('pointerdown', event => {
    if (event.button !== 0 || drag) return;
    const frame = visible.getBoundingClientRect();
    const x = event.clientX;
    const offset = x >= frame.left && x <= frame.right ? x - frame.left : frame.width / 2;
    event.preventDefault();
    range.focus({ preventScroll: true });
    range.setPointerCapture(event.pointerId);
    drag = { id: event.pointerId, offset };
    move(event);
  });
  range.addEventListener('pointermove', event => {
    if (drag?.id === event.pointerId) move(event);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    range.addEventListener(type, event => {
      if (drag?.id === event.pointerId) drag = undefined;
    });
  }
  range.addEventListener('keydown', event => {
    const step = scroller.clientWidth / 5;
    const positions = {
      ArrowLeft: scroller.scrollLeft - step, ArrowRight: scroller.scrollLeft + step,
      ArrowDown: scroller.scrollLeft - step, ArrowUp: scroller.scrollLeft + step,
      Home: 0, End: scroller.scrollWidth,
    };
    if (!Object.hasOwn(positions, event.key)) return;
    event.preventDefault();
    scroller.scrollLeft = positions[event.key];
    sync();
  });
  scroller.addEventListener('scroll', sync);
  const resize = new ResizeObserver(sync);
  resize.observe(scroller);
  resize.observe(wrap);
  sync();
  return () => {
    resize.disconnect();
    scroller.removeEventListener('scroll', sync);
  };
}
