import { autoBassBar, BASS_MAX, BASS_MIN, DRUM_ROWS, MELODY_MAX, MELODY_MIN, TRACK_NAMES, stepsPerBar } from './composer_model.mjs';

export const TRACK_LABELS = { drums: '鼓', bass: '貝斯', chords: '和弦', melody: '旋律' };
const DRUM_LABELS = ['Kick', 'Snare', 'Hat', 'Clap'];
const PITCH_NAMES = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']; // speak-tw-ok
export const pitchName = pitch => PITCH_NAMES[pitch % 12] + (Math.floor(pitch / 12) - 1);
const MARKS = { down: '↓↓↓↓', mixed: '↓↓↑↑↓↑', pima: 'Pima' };
const DRAG_THRESHOLD = 4;
const TOUCH_HOLD = 300;
const BASS_PITCH_STEP = 16;
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const PITCHES = Array.from({ length: MELODY_MAX - MELODY_MIN + 1 }, (_, index) => MELODY_MAX - index);

function element(tag, name) {
  const node = document.createElement(tag);
  node.className = name;
  return node;
}

function control(name, label, data = {}, text = '') {
  const button = element('button', name);
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.textContent = text;
  Object.assign(button.dataset, data);
  return button;
}

export function makeComposerScore(host, controls, actions) {
  const content = element('div', 'cs-score-content');
  const tracks = Object.fromEntries(TRACK_NAMES.map(name => {
    const row = element('section', 'cs-track cs-' + name);
    row.dataset.track = name;
    row.setAttribute('aria-label', TRACK_LABELS[name] + '軌');
    const side = element('div', 'cs-side');
    side.append(controls[name]);
    const timeline = element('div', 'cs-measures');
    row.append(side, timeline);
    return [name, { row, side, timeline }];
  }));
  const drumLabels = element('div', 'cs-drum-labels');
  for (const label of DRUM_LABELS) {
    const row = element('span', '');
    row.textContent = label;
    drumLabels.append(row);
  }
  tracks.drums.side.append(drumLabels);
  const ruler = element('div', 'cs-track cs-ruler');
  const rulerTitle = element('div', 'cs-side');
  rulerTitle.textContent = '小節';
  const bars = element('div', 'cs-measures');
  ruler.append(rulerTitle, bars);

  const roll = tracks.melody;
  roll.timeline.classList.add('cs-input-timeline');
  roll.timeline.hidden = true;
  const scroll = element('div', 'cs-roll-scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', '鋼琴捲簾音高，可上下捲動');
  const rollRows = element('div', 'cs-roll-rows');
  const pitchControls = element('div', 'cs-pitch-controls');
  const pitchUp = control('', '捲簾往高音捲動', {}, '↑');
  const pitchDown = control('', '捲簾往低音捲動', {}, '↓');
  pitchUp.onclick = () => { scroll.scrollTop -= 120; };
  pitchDown.onclick = () => { scroll.scrollTop += 120; };
  pitchControls.append(pitchUp, pitchDown);
  roll.side.append(pitchControls);
  scroll.append(rollRows);
  const melodyBody = element('section', 'cs-melody-body');
  melodyBody.dataset.track = 'melody';
  melodyBody.append(roll.row, scroll);

  const ghost = element('span', 'cs-note-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  const dragLabel = element('span', 'cs-note-drag-label');
  dragLabel.hidden = true;
  host.append(dragLabel);
  const playhead = element('span', 'cs-playhead');
  playhead.hidden = true;
  content.append(ruler, tracks.drums.row, tracks.bass.row, tracks.chords.row, melodyBody, playhead);
  host.append(content);
  let song, loop, cursor = 0, position, selected, drag, noteDrag, suppressClick = false, rangeScroll = 0;
  let steps = 16;

  const barWidth = () => bars.firstElementChild?.getBoundingClientRect().width || 1;
  const sideWidth = () => rulerTitle.getBoundingClientRect().width;
  const scoreX = step => sideWidth() + step * barWidth() / steps;

  function setLoop(value) {
    loop = value;
    for (const cell of bars.children) {
      const index = Number(cell.dataset.bar);
      cell.classList.toggle('loop', !!loop && index >= loop.startBar && index <= loop.endBar);
    }
  }

  function renderRuler() {
    bars.replaceChildren(...song.bars.map((_, bar) => {
      const cell = element('div', 'cs-measure');
      cell.dataset.bar = bar;
      const number = control('cs-bar-number', '從第 ' + (bar + 1) + ' 小節播放，拖曳選取循環範圍',
        { bar, act: 'from' }, String(bar + 1).padStart(2, '0'));
      const more = control('cs-bar-more', '第 ' + (bar + 1) + ' 小節選單', { bar, act: 'more' }, '⋯');
      more.setAttribute('aria-haspopup', 'menu');
      more.setAttribute('aria-expanded', 'false');
      cell.append(number, more);
      return cell;
    }));
    setLoop(loop);
  }

  function measures(parent, makeCells) {
    parent.replaceChildren(...song.bars.map((bar, index) => {
      const cell = element('div', 'cs-measure');
      makeCells(cell, bar, index);
      return cell;
    }));
  }

  function renderDrums() {
    measures(tracks.drums.timeline, (cell, bar, index) => {
      for (const [row, name] of DRUM_ROWS.entries()) {
        const line = element('div', 'cs-steps');
        line.append(...bar.drums[name].map((on, step) => {
          const hit = control('cs-hit', `第 ${index + 1} 小節 ${DRUM_LABELS[row]} 第 ${step + 1} 格`,
            { act: 'drum', bar: index, step, drum: name });
          hit.setAttribute('aria-pressed', String(on));
          return hit;
        }));
        cell.append(line);
      }
    });
  }

  function renderBass() {
    const auto = song.tracks.bass.mode === 'auto';
    measures(tracks.bass.timeline, (cell, bar, index) => {
      const next = song.bars[index === loop?.endBar ? loop.startBar : index + 1];
      const notes = auto ? autoBassBar(bar.chord, next?.chord, song.key, song.beats) : bar.bass;
      const line = element('div', 'cs-steps');
      line.append(...notes.map((pitch, step) => {
        const text = pitch === null ? '·' : pitchName(pitch);
        const label = `第 ${index + 1} 小節貝斯第 ${step + 1} 格 ${text}`;
        if (auto) {
          const note = element('span', pitch === null ? 'cs-bass-note' : 'cs-bass-note auto');
          note.textContent = text;
          note.title = label;
          return note;
        }
        const note = control('cs-bass-note manual', label, { act: 'bass', bar: index, step }, text);
        note.classList.toggle('filled', pitch !== null);
        note.setAttribute('aria-haspopup', 'menu');
        note.setAttribute('aria-expanded', 'false');
        return note;
      }));
      cell.append(line);
    });
  }

  function renderChords() {
    measures(tracks.chords.timeline, (cell, bar, index) => {
      const pick = control('cs-chord-pick', `第 ${index + 1} 小節和弦 ${bar.chord || '空白'}`,
        { act: 'chord', bar: index }, (bar.chord || '—') + ' ▾');
      pick.setAttribute('aria-haspopup', 'dialog');
      if (bar.pattern && bar.pattern !== song.tracks.chords.pattern) {
        const mark = element('small', 'cs-strum-mark');
        mark.textContent = MARKS[bar.pattern];
        pick.append(mark);
      }
      cell.append(pick);
    });
  }

  function renderMelody() {
    measures(roll.timeline, (cell, _, bar) => {
      cell.classList.add('cs-steps');
      for (let step = 0; step < steps; step++) {
        const inputPosition = `輸入位置：第 ${bar + 1} 小節第 ${step + 1} 格`;
        const target = control('cs-cursor-cell', inputPosition, { act: 'cursor', bar, step });
        target.title = inputPosition;
        cell.append(target);
      }
    });
    const byPitch = new Map(PITCHES.map(pitch => [pitch, song.bars.map(() => [])]));
    song.bars.forEach((bar, index) => {
      for (const note of bar.melody) byPitch.get(note.pitch)[index].push(note);
    });
    rollRows.replaceChildren(...PITCHES.map(pitch => {
      const row = element('div', 'cs-pitch-row');
      const name = pitchName(pitch);
      row.classList.toggle('sharp', name.includes('♯')); // speak-tw-ok
      row.classList.toggle('octave', pitch % 12 === 0);
      const label = element('span', 'cs-side');
      label.textContent = name;
      row.append(label);
      const timeline = element('div', 'cs-measures');
      measures(timeline, (cell, _, bar) => {
        cell.classList.add('cs-pitch-line');
        Object.assign(cell.dataset, { act: 'add-note', bar, pitch });
        for (const note of byPitch.get(pitch)[bar]) {
          const button = control('cs-pitch-note', `第 ${bar + 1} 小節 ${name} 第 ${note.start + 1} 格，長度 ${note.length}`,
            { act: 'note', bar, step: note.start, pitch, length: note.length }, name);
          button.style.setProperty('--step', note.start);
          button.style.setProperty('--length', note.length);
          const edge = element('span', 'cs-note-edge');
          edge.title = '拖曳調整長度';
          button.append(edge);
          if (selected?.bar === bar && selected.step === note.start && selected.pitch === pitch) button.classList.add('selected');
          cell.append(button);
        }
      });
      row.append(timeline);
      return row;
    }));
    setCursor(cursor);
  }

  function reveal(x) {
    const { scrollLeft, clientWidth } = host;
    if (x >= scrollLeft + sideWidth() && x < scrollLeft + clientWidth - 8) return;
    host.scrollLeft = x - sideWidth();
  }

  function setPosition(value, follow = false) {
    position = value;
    playhead.hidden = !value;
    if (!value) return;
    const x = scoreX(value.bar * steps + value.step);
    playhead.style.left = x + 'px';
    if (follow) reveal(x);
  }

  function setCursor(value, { follow = false, pitch } = {}) {
    cursor = value;
    const cells = roll.timeline.querySelectorAll('.cs-cursor-cell');
    roll.timeline.querySelector('[aria-current]')?.removeAttribute('aria-current');
    cells[cursor]?.setAttribute('aria-current', 'step');
    if (follow) reveal(scoreX(cursor));
    if (pitch !== undefined && scroll.clientHeight) {
      const offset = rollRows.children[MELODY_MAX - pitch].offsetTop;
      const height = rollRows.firstElementChild.offsetHeight;
      if (offset < scroll.scrollTop || offset + height > scroll.scrollTop + scroll.clientHeight) {
        scroll.scrollTop = offset - (scroll.clientHeight - height) / 2;
      }
    }
  }

  function select(note, node) {
    selected = note;
    rollRows.querySelector('.selected')?.classList.remove('selected');
    node?.classList.add('selected');
  }

  function noteAt(node) {
    return { bar: Number(node.dataset.bar), step: Number(node.dataset.step), pitch: Number(node.dataset.pitch) };
  }

  host.addEventListener('focusin', event => {
    const note = event.target.closest('.cs-pitch-note');
    if (note) select(noteAt(note), note);
  });

  host.addEventListener('click', event => {
    if (suppressClick) return;
    const node = event.target.closest('[data-act]');
    if (!node) return;
    const { act, drum } = node.dataset;
    const { bar, pitch } = noteAt(node);
    let step = Number(node.dataset.step);
    if (act === 'add-note') {
      const box = node.getBoundingClientRect();
      step = Math.max(0, Math.min(steps - 1, Math.floor((event.clientX - box.left) / box.width * steps)));
    }
    actions.edit(act, { bar, step, pitch, drum, node });
  });

  function barAt(x) {
    const place = (x - bars.getBoundingClientRect().left) / barWidth();
    return Math.min(song.bars.length - 1, Math.max(0, Math.floor(place)));
  }

  function extendRange(x) {
    const end = barAt(x);
    setLoop({ startBar: Math.min(drag.bar, end), endBar: Math.max(drag.bar, end) });
    return end;
  }

  function scrollRange() {
    if (!drag?.moved) return;
    const bounds = host.getBoundingClientRect();
    const left = bounds.left + sideWidth() + 24;
    const right = bounds.right - 24;
    const direction = drag.x < left ? -1 : Number(drag.x > right);
    if (direction) {
      host.scrollLeft += direction * 16;
      extendRange(drag.x);
    }
    rangeScroll = requestAnimationFrame(scrollRange);
  }

  function previewNoteDrag(current) {
    const { source, track, resize, length, startX, startY, x, y } = current;
    const stepWidth = barWidth() / steps;
    const dx = x - startX - (bars.getBoundingClientRect().left - current.originX);
    const shift = Math.round(dx / stepWidth);
    let bar = source.bar, step = source.step, pitch = source.pitch, duration = length;
    if (resize) {
      duration = clamp(length + shift, 1, steps - step);
    } else {
      const absolute = clamp(bar * steps + step + shift, 0, song.bars.length * steps - 1);
      bar = Math.floor(absolute / steps);
      // The score stores each melody note within one bar. Keep its duration on moves.
      step = Math.min(absolute % steps, steps - length);
      if (track === 'melody') {
        const dy = y - startY - (rollRows.getBoundingClientRect().top - current.originY);
        const rowHeight = rollRows.firstElementChild.getBoundingClientRect().height;
        pitch = clamp(pitch - Math.round(dy / rowHeight), MELODY_MIN, MELODY_MAX);
      } else {
        pitch = clamp(pitch - Math.round((y - startY) / BASS_PITCH_STEP), BASS_MIN, BASS_MAX);
      }
    }
    if (pitch !== (current.target?.pitch ?? source.pitch)) actions.preview(track, pitch);
    const sameSlot = bar === source.bar && step === source.step;
    const blocked = track === 'bass'
      ? !sameSlot && song.bars[bar].bass[step] !== null
      : !(sameSlot && pitch === source.pitch) && song.bars[bar].melody.some(note => note.start === step && note.pitch === pitch);
    const target = { bar, step, pitch, length: duration, blocked };
    if (Object.keys(target).some(key => target[key] !== current.target?.[key])) {
      current.target = target;
      const cell = track === 'bass' ? tracks.bass.timeline.children[bar].firstElementChild.children[step]
        : rollRows.children[MELODY_MAX - pitch].lastElementChild.children[bar];
      cell.append(ghost);
      ghost.style.setProperty('--step', step);
      ghost.style.setProperty('--length', duration);
      ghost.classList.toggle('blocked', blocked);
      ghost.textContent = pitchName(pitch);
      dragLabel.textContent = `${pitchName(pitch)} · 第 ${bar + 1} 小節第 ${step + 1} 格` +
        (resize ? ` · 長度 ${duration}` : '') + (blocked ? ' · 已有音符' : '');
    }
    const bounds = host.getBoundingClientRect();
    dragLabel.style.left = clamp(x + 12, bounds.left, bounds.right - dragLabel.offsetWidth) + 'px';
    dragLabel.style.top = clamp(y - 32, bounds.top, bounds.bottom - dragLabel.offsetHeight) + 'px';
  }

  function scrollNoteDrag(current) {
    const bounds = host.getBoundingClientRect();
    const direction = (value, low, high) => value < low + 20 ? -1 : Number(value > high - 20);
    const { x, y } = current;
    const left = host.scrollLeft;
    const top = scroll.scrollTop;
    if (Math.abs(x - current.startX) > DRAG_THRESHOLD) {
      host.scrollLeft += 8 * direction(x, bounds.left + sideWidth(), bounds.right);
    }
    if (current.track === 'melody' && !current.resize && Math.abs(y - current.startY) > DRAG_THRESHOLD) {
      const rows = scroll.getBoundingClientRect();
      scroll.scrollTop += 4 * direction(y, Math.max(rows.top, bounds.top), Math.min(rows.bottom, bounds.bottom));
    }
    if (left !== host.scrollLeft || top !== scroll.scrollTop) previewNoteDrag(current);
    current.frame = requestAnimationFrame(() => scrollNoteDrag(current));
  }

  function activateNoteDrag(current) {
    current.active = true;
    current.node.classList.add('drag-source');
    dragLabel.hidden = false;
    previewNoteDrag(current);
  }

  function cancelNoteDrag() {
    if (!noteDrag || noteDrag.canceled) return false;
    clearTimeout(noteDrag.timer);
    cancelAnimationFrame(noteDrag.frame);
    noteDrag.active = false;
    noteDrag.canceled = true;
    noteDrag.node.classList.remove('drag-source');
    ghost.remove();
    dragLabel.hidden = true;
    return true;
  }

  host.addEventListener('pointerdown', event => {
    if (!event.isPrimary || event.button !== 0 || drag || noteDrag) return;
    const node = event.target.closest('.cs-pitch-note, .cs-bass-note.filled');
    if (node && actions.canEdit()) {
      const track = node.dataset.act === 'bass' ? 'bass' : 'melody';
      const source = noteAt(node);
      if (track === 'bass') source.pitch = song.bars[source.bar].bass[source.step];
      const { clientX: x, clientY: y, pointerId: id } = event;
      const touch = event.pointerType === 'touch';
      noteDrag = {
        node, track, source, touch, id, x, y, startX: x, startY: y,
        resize: !!event.target.closest('.cs-note-edge'), length: Number(node.dataset.length) || 1,
        originX: bars.getBoundingClientRect().left, originY: rollRows.getBoundingClientRect().top,
      };
      host.setPointerCapture(id);
      if (track === 'melody') select(source, node);
      if (touch) {
        const current = noteDrag;
        current.timer = setTimeout(() => activateNoteDrag(current), TOUCH_HOLD);
      }
      return;
    }
    const number = event.target.closest('[data-act="from"]');
    if (number) drag = { id: event.pointerId, x: event.clientX, startX: event.clientX, bar: Number(number.dataset.bar), previous: loop };
  });

  host.addEventListener('pointermove', event => {
    if (noteDrag?.id === event.pointerId) {
      const current = noteDrag;
      if (current.canceled) return;
      current.x = event.clientX;
      current.y = event.clientY;
      const moved = Math.hypot(current.x - current.startX, current.y - current.startY) > DRAG_THRESHOLD;
      if (!current.active) {
        if (!moved) return;
        if (current.touch) { cancelNoteDrag(); return; }
        activateNoteDrag(current);
      }
      if (!current.frame && moved) current.frame = requestAnimationFrame(() => scrollNoteDrag(current));
      previewNoteDrag(current);
      return;
    }
    if (drag?.id !== event.pointerId) return;
    drag.x = event.clientX;
    if (!drag.moved && Math.abs(drag.x - drag.startX) < 7) return;
    if (!drag.moved) {
      drag.moved = true;
      host.setPointerCapture(event.pointerId);
      rangeScroll = requestAnimationFrame(scrollRange);
    }
    extendRange(drag.x);
  });

  function endGesture(event) {
    const canceled = event.type !== 'pointerup';
    if (noteDrag?.id === event.pointerId) {
      const { active, canceled: aborted, node, source, track, target, length, resize } = noteDrag;
      cancelNoteDrag();
      noteDrag = null;
      if (!canceled && !aborted) {
        if (!active) actions.edit(node.dataset.act, { ...source, node });
        else if (resize && target.length !== length) actions.resize(source, target.length);
        else if (!resize && !target.blocked &&
            (source.bar !== target.bar || source.step !== target.step || source.pitch !== target.pitch)) {
          actions.move(track, source, target);
        }
      }
    } else if (drag?.id === event.pointerId) {
      const current = drag;
      cancelAnimationFrame(rangeScroll);
      drag = null;
      if (!current.moved) return;
      if (canceled) setLoop(current.previous);
      else actions.loop(loop);
    } else return;
    // A completed drag can still produce a click on the capture target.
    suppressClick = true;
    setTimeout(() => { suppressClick = false; }, 0);
  }

  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) host.addEventListener(type, endGesture);
  // Preserve native panning until a touch has been held on a note.
  host.addEventListener('touchmove', event => {
    if (noteDrag?.touch && noteDrag.active && event.cancelable) event.preventDefault();
  }, { passive: false });
  host.addEventListener('contextmenu', event => {
    if (noteDrag?.touch && !noteDrag.canceled) event.preventDefault();
  });
  host.addEventListener('pointerleave', () => { if (drag && !drag.moved) drag = null; });

  host.addEventListener('scroll', () => {
    rollRows.style.setProperty('--score-scroll', host.scrollLeft + 'px');
  });
  const observer = new ResizeObserver(() => setPosition(position));
  observer.observe(host);
  const initialPitch = new ResizeObserver(() => {
    if (!scroll.clientHeight) return;
    const center = rollRows.children[MELODY_MAX - 67];
    if (center) scroll.scrollTop = center.offsetTop - scroll.clientHeight / 2;
    initialPitch.disconnect();
  });
  initialPitch.observe(scroll);

  return {
    render(value, track) {
      if (!track || noteDrag?.track === track || track === 'chords' && noteDrag?.track === 'bass') cancelNoteDrag();
      song = value;
      steps = stepsPerBar(song.beats);
      content.style.setProperty('--steps', steps);
      content.style.setProperty('--bars', song.bars.length);
      if (!track) renderRuler();
      if (!track || track === 'drums') renderDrums();
      if (!track || track === 'bass' || track === 'chords') renderBass();
      if (!track || track === 'chords') renderChords();
      if (!track || track === 'melody') renderMelody();
      setPosition(position);
    },
    setPosition, setCursor, select, selected: () => selected,
    showInputCursor(active) {
      roll.timeline.hidden = !active;
    },
    setLoop(value) {
      setLoop(value);
      if (song?.tracks.bass.mode === 'auto') renderBass();
    },
    cancelNoteDrag,
    dispose() {
      cancelNoteDrag();
      observer.disconnect();
      initialPitch.disconnect();
      cancelAnimationFrame(rangeScroll);
    },
  };
}
