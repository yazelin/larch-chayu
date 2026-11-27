import { CHORDS } from './guitar_chords.mjs';
import { GUITAR_PATTERNS as PATTERNS, guitarRhythm } from './guitar_rhythm.mjs';

const SAVE_KEY = 'guitarArrangement';
const MIN_BARS = 8;
const MAX_BARS = 16;
export function makeGuitarArranger({ el, button, playChord, stopNotes, beforePlay, storage }) {
  const panel = el('section', 'sp-arranger');
  const title = el('h2', '', '編曲盒');
  title.id = 'sp-arranger-title';
  panel.setAttribute('aria-labelledby', title.id);
  let bars = Array(MIN_BARS).fill('');
  let selected = -1, active = -1, timer = null, disposed = false;
  const barButtons = [];
  const grid = el('div', 'sp-arranger-bars');
  const editor = el('div', 'sp-arranger-editor');
  const picker = el('select', 'sp-arranger-chords');
  picker.setAttribute('aria-label', '小節和弦');
  for (const name of ['', ...Object.keys(CHORDS)]) {
    const option = el('option', '', name || '休止');
    option.value = name;
    picker.append(option);
  }
  picker.addEventListener('change', () => assign(selected, picker.value));
  const guide = el('p', 'sp-cap');
  editor.append(guide, picker);

  const settings = el('div', 'sp-arranger-settings');
  const meter = el('select', 'sp-arranger-meter');
  for (const beats of [4, 3]) {
    const option = el('option', '', beats + '/4');
    option.value = String(beats);
    meter.append(option);
  }
  const meterLabel = el('label', '', '拍號');
  meterLabel.append(meter);
  const bpm = el('input');
  Object.assign(bpm, { type: 'range', min: '60', max: '140', value: '100' });
  const bpmValue = el('output', '', '100');
  const bpmLabel = el('label', 'sp-arranger-bpm');
  bpmLabel.append(el('span', '', 'BPM'), bpm, bpmValue);
  bpm.addEventListener('input', () => { bpmValue.value = bpm.value; status.textContent = ''; });
  meter.addEventListener('change', () => {
    renderPatternMarks();
    changeRhythm();
  });

  let pattern = 'down';
  const patterns = el('div', 'sp-arranger-patterns');
  patterns.setAttribute('role', 'group');
  patterns.setAttribute('aria-label', '刷法');
  const patternButtons = Object.entries(PATTERNS).map(([key, { label, marks }]) => {
    const node = button('sp-arranger-pattern', '', () => {
      selectPattern(key);
      changeRhythm();
    });
    node.dataset.pattern = key;
    node.setAttribute('aria-label', label);
    node.append(el('span', 'sp-arranger-marks', marks));
    patterns.append(node);
    return node;
  });
  function selectPattern(key) {
    pattern = key;
    for (const node of patternButtons) node.setAttribute('aria-pressed', String(node.dataset.pattern === key));
  }
  selectPattern(pattern);
  settings.append(meterLabel, bpmLabel, patterns);

  const controls = el('div', 'sp-arranger-controls');
  const play = button('sp-arranger-play', '播放編曲', () => timer === null ? start() : stop());
  const add = button('sp-arranger-add', '新增小節', () => resize(bars.length + 1));
  const remove = button('sp-arranger-remove', '移除最後一小節', () => resize(bars.length - 1));
  const save = button('sp-arranger-save', '儲存編曲', saveArrangement);
  const clear = button('sp-arranger-clear', '清空所有小節', () => {
    stop();
    bars.fill('');
    status.textContent = '已清空小節';
    render();
  });
  const status = el('p', 'sp-arranger-status');
  status.setAttribute('role', 'status');
  controls.append(play, add, remove, save, clear, status);
  panel.append(title, settings, grid, editor, controls);

  function setActive(index) {
    barButtons[active]?.removeAttribute('aria-current');
    barButtons[index]?.setAttribute('aria-current', 'true');
    active = index;
  }

  function render() {
    while (barButtons.length > bars.length) barButtons.pop().remove();
    for (const [i, name] of bars.entries()) {
      if (!barButtons[i]) {
        const slot = button('sp-arranger-bar', '', () => {
          selected = selected === i ? -1 : i;
          render();
        });
        slot.addEventListener('dragover', event => {
          if (event.dataTransfer.types.includes('application/x-studio-guitar-chord')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
          }
        });
        slot.addEventListener('drop', event => {
          const chord = event.dataTransfer.getData('application/x-studio-guitar-chord');
          if (!Object.hasOwn(CHORDS, chord)) return;
          event.preventDefault();
          selected = i;
          assign(i, chord);
        });
        barButtons.push(slot);
        grid.append(slot);
      }
      const node = barButtons[i];
      const label = '第 ' + (i + 1) + ' 小節，' + (name || '休止');
      if (node.getAttribute('aria-label') !== label) {
        node.setAttribute('aria-label', label);
        node.replaceChildren(el('span', 'sp-arranger-number', String(i + 1)), el('b', '', name || '—'));
      }
      node.setAttribute('aria-pressed', String(selected === i));
    }
    guide.textContent = selected < 0 ? '選一格後點和弦卡，或把和弦卡拖到小節。' : '第 ' + (selected + 1) + ' 小節';
    picker.hidden = selected < 0;
    picker.value = bars[selected] || '';
    add.disabled = bars.length >= MAX_BARS;
    remove.disabled = bars.length <= MIN_BARS;
    play.disabled = !bars.some(Boolean);
  }

  function renderPatternMarks() {
    const waltz = meter.value === '3';
    patternButtons[0].querySelector('.sp-arranger-marks').textContent = waltz ? '↓ ↓ ↓' : PATTERNS.down.marks;
    patternButtons[1].querySelector('.sp-arranger-marks').textContent = waltz ? '↓↓↑↑↓↑' : PATTERNS.mixed.marks;
  }

  function assign(index, name) {
    if (index < 0) return;
    bars[index] = name;
    if (!bars.some(Boolean)) stop();
    status.textContent = '';
    render();
  }

  function resize(length) {
    stop();
    bars = Array.from({ length }, (_, i) => bars[i] || '');
    if (selected >= length) selected = -1;
    status.textContent = '';
    render();
  }

  async function saveArrangement() {
    save.disabled = true;
    try {
      await storage.set(SAVE_KEY, { bars: [...bars], beats: Number(meter.value), bpm: Number(bpm.value), pattern });
      status.textContent = '已儲存編曲';
    } catch {
      status.textContent = '無法儲存編曲';
    } finally {
      save.disabled = false;
    }
  }

  async function restore() {
    try {
      const saved = await storage.get(SAVE_KEY);
      if (disposed || !saved) return;
      if (Array.isArray(saved.bars) && saved.bars.length >= MIN_BARS && saved.bars.length <= MAX_BARS) {
        bars = Array.from(saved.bars, name => Object.hasOwn(CHORDS, name) ? name : '');
      }
      if ([3, 4].includes(saved.beats)) meter.value = saved.beats;
      if (Number.isInteger(saved.bpm) && saved.bpm >= 60 && saved.bpm <= 140) bpmValue.value = bpm.value = saved.bpm;
      if (Object.hasOwn(PATTERNS, saved.pattern)) selectPattern(saved.pattern);
      renderPatternMarks();
      render();
    } catch {
      status.textContent = '無法讀取編曲';
    } finally {
      panel.inert = false;
    }
  }

  function stop() {
    if (timer === null) return;
    clearTimeout(timer);
    timer = null;
    stopNotes();
    setActive(-1);
    play.textContent = '播放編曲';
  }

  function changeRhythm() {
    status.textContent = '';
    if (timer !== null) {
      const bar = active;
      stop();
      start(bar);
    }
  }

  function start(firstBar = 0) {
    beforePlay();
    const beats = Number(meter.value);
    const { subdivision, strokes } = guitarRhythm(pattern, beats);
    const steps = beats * subdivision;
    let nextAt = performance.now();
    let step = 0;
    play.textContent = '停止編曲';
    function tick() {
      const interval = 60000 / (Number(bpm.value) * subdivision);
      // 從預定的拍點往後排，計時器偶爾晚到也不會讓後面的拍子一起變慢。
      const skipped = Math.max(0, Math.floor((performance.now() - nextAt) / interval));
      step += skipped;
      nextAt += (skipped + 1) * interval;
      const offset = step % steps;
      const bar = (firstBar + Math.floor(step / steps)) % bars.length;
      if (active !== bar) setActive(bar);
      const stroke = strokes[offset];
      if (bars[bar] && stroke) playChord(bars[bar], stroke);
      step++;
      timer = setTimeout(tick, Math.max(0, nextAt - performance.now()));
    }
    tick();
  }

  render();
  panel.inert = true;
  restore();
  return {
    panel,
    stop,
    chooseChord: name => assign(selected, name),
    dispose() { disposed = true; stop(); },
  };
}
