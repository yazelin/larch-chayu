const directions = new Map([
  ['arrowleft', [-1, 0]], ['a', [-1, 0]], ['arrowright', [1, 0]], ['d', [1, 0]],
  ['arrowup', [0, -1]], ['w', [0, -1]], ['arrowdown', [0, 1]], ['s', [0, 1]],
]);

export function movementKeys() {
  const held = new Set();
  const clear = () => held.clear();
  addEventListener('blur', clear);
  addEventListener('keyup', e => held.delete(e.key.toLowerCase()));
  return {
    clear,
    press(e) {
      const key = e.key.toLowerCase();
      if (!directions.has(key)) return false;
      e.preventDefault();
      held.add(key);
      return true;
    },
    vector() {
      let left = false, right = false, up = false, down = false;
      for (const key of held) {
        const [x, y] = directions.get(key);
        left ||= x < 0;
        right ||= x > 0;
        up ||= y < 0;
        down ||= y > 0;
      }
      const x = Number(right) - Number(left), y = Number(down) - Number(up);
      const length = Math.hypot(x, y) || 1;
      return { x: x / length, y: y / length };
    },
  };
}

export function createJoystick({ enabled, onStart, onTouch }) {
  const base = document.createElement('div');
  base.className = 'movement-joystick';
  base.setAttribute('role', 'group');
  base.setAttribute('aria-label', '移動搖桿');
  const knob = document.createElement('span');
  knob.className = 'movement-joystick-knob';
  base.append(knob);
  document.body.append(base);

  const coarse = matchMedia('(pointer: coarse)');
  let touched = false, pointer = null;
  const stick = {
    x: 0, y: 0,
    get touch() { return coarse.matches || touched; },
    get active() { return pointer !== null; },
    release() {
      const id = pointer;
      pointer = null;
      if (id !== null && base.hasPointerCapture(id)) base.releasePointerCapture(id);
      stick.x = stick.y = 0;
      knob.style.transform = '';
    },
    update() {
      const hidden = !stick.touch || !enabled();
      if (base.hidden !== hidden) base.hidden = hidden;
      if (hidden && stick.active) stick.release();
    },
  };
  function updateDevice() {
    document.body.classList.toggle('touch-movement', stick.touch);
    onTouch?.(stick.touch);
    stick.update();
  }
  function steer(e) {
    const rect = base.getBoundingClientRect();
    const radius = (rect.width - knob.offsetWidth) / 2;
    const dx = e.clientX - (rect.left + rect.width / 2);
    const dy = e.clientY - (rect.top + rect.height / 2);
    const length = Math.hypot(dx, dy);
    const deadZone = radius * 0.12;
    const strength = Math.min(1, Math.max(0, (length - deadZone) / (radius - deadZone)));
    stick.x = length ? dx / length * strength : 0;
    stick.y = length ? dy / length * strength : 0;
    knob.style.transform = `translate(${stick.x * radius}px,${stick.y * radius}px)`;
  }
  addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' && !touched) { touched = true; updateDevice(); }
  }, true);
  coarse.addEventListener('change', updateDevice);
  base.addEventListener('pointerdown', e => {
    if (e.button !== 0 || stick.active || !enabled()) return;
    e.preventDefault();
    e.stopPropagation();
    pointer = e.pointerId;
    base.setPointerCapture(pointer);
    onStart();
    steer(e);
  });
  base.addEventListener('pointermove', e => { if (e.pointerId === pointer) steer(e); });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    base.addEventListener(event, e => {
      if (e.pointerId === pointer) stick.release();
    });
  }
  base.addEventListener('click', e => e.stopPropagation());
  base.addEventListener('contextmenu', e => e.preventDefault());
  addEventListener('blur', stick.release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stick.release(); });
  updateDevice();
  return stick;
}
