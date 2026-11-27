import { BAND_STYLES } from './band_engine.mjs';
import { createComposerEngine } from './composer_engine.mjs';
import { COMPOSER_EXAMPLES } from './composer_examples.mjs';
import {
  appendBar, BASS_MAX, BASS_MIN, CHORD_NAMES, CHORD_VOICES, chordSuggestions, clampInt, clearBar,
  clearTracks, deleteBar, deleteLastBar, deserializeSong, duplicateBar, insertBar, KEY_NAMES, MAX_BARS, MELODY_MAX, MIN_BARS,
  normalizeSong, PATTERNS, ROOT_NAMES, serializeSong, stepsPerBar, TRACK_NAMES, DRUM_ROWS,
} from './composer_model.mjs';
import { DEFAULT_TITLE, TITLE_LIMIT, createComposerStore } from './composer_store.mjs';
import { makeComposerScore, pitchName, TRACK_LABELS } from './composer_score.mjs';
import { PIANO_VOICES } from './piano_voices.mjs';
import { bindPianoInput, bindPianoRange } from './studio_piano_input.mjs';
import { makePianoKeyboard } from './studio_piano_keyboard.mjs';

const PATTERN_LABELS = { down: '全下刷', mixed: '下下上上下上', pima: '分解和弦 Pima' };
const TAB_LABELS = { arrange: '編曲', guitar: '吉他自由彈', practice: '範例曲練習' };
const BAR_EDITS = [
  ['在後面插入空白小節', (song, bar) => insertBar(song, bar + 1), 'add'],
  ['複製這一小節', duplicateBar, 'add'],
  ['清空這一小節', clearBar, 'clear'],
  ['刪除這一小節', deleteBar, 'delete'],
];

const UNTITLED = '未命名';
const HISTORY_LIMIT = 50;
const voicing = voice => PIANO_VOICES[voice] || '吉他';

export function mountComposer({ host, panel, el, audio, mountGuitar, onClose, onReturn }) {
  const store = createComposerStore(window.StudioDB);
  const events = new AbortController();
  const eventOptions = { signal: events.signal };
  const root = el('div', 'cs-room');
  const arrange = el('section', 'cs-arrange');
  arrange.dataset.track = 'drums';
  const score = el('div', 'cs-score');
  score.tabIndex = 0;
  score.setAttribute('role', 'region');
  score.setAttribute('aria-label', '小節時間軸，可左右捲動');
  const tabs = el('nav', 'cs-tabs');
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', '編曲室分頁');
  const trackTabs = el('nav', 'cs-track-tabs');
  trackTabs.setAttribute('aria-label', '切換音軌');
  const heading = el('div', 'cs-heading');
  const toolbar = el('div', 'cs-toolbar');
  const status = el('div', 'cs-status');
  const location = el('output', 'cs-position');
  const count = el('span', 'cs-count');
  const message = el('output', 'cs-message');
  message.setAttribute('role', 'status');
  status.append(message, location, count);
  const popup = el('div', 'cs-menu');
  popup.setAttribute('popover', 'manual');
  popup.setAttribute('role', 'group');
  const dialog = el('dialog', 'cs-dialog');
  dialog.setAttribute('aria-labelledby', 'cs-dialog-title');
  let song = normalizeSong(), title = UNTITLED, draft = {}, slots = [], storageReady = false;
  let cursor = 0, loop = null, recording, context, engine, guitar;
  const undoStack = [], redoStack = [];
  const savedSlots = new Map();
  let tab = 'arrange', anchor, busy = false, counting = 0, allowClose = false, returning = false;
  let resetPiano = () => {};

  function button(label, action, className = '') {
    const node = el('button', className, label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  function select(label, options, change) {
    const node = el('select');
    node.setAttribute('aria-label', label);
    for (const [value, text] of options) {
      const option = el('option', '', text);
      option.value = value;
      node.append(option);
    }
    node.addEventListener('change', () => change(node.value));
    return node;
  }

  function field(label, control) {
    const node = el('label', 'cs-field');
    node.append(el('span', '', label), control);
    return node;
  }

  function group(...children) {
    const node = el('div', 'cs-tools');
    node.append(...children);
    return node;
  }

  const signature = () => JSON.stringify([title, serializeSong(song)]);
  const dirty = () => (draft.slot ? savedSlots.get(draft.slot) : draft.saved) !== signature();

  function serializeScore() {
    // Mixer and voice controls are live. Keep them independent of score edits.
    const { bass, chords } = song.tracks;
    return serializeSong({ ...song, tracks: { bass: { mode: bass.mode }, chords: { pattern: chords.pattern } } });
  }

  function snapshot() {
    return { packed: serializeScore(), title, draft, cursor, loop, tracks: structuredClone(song.tracks) };
  }

  function remember(before, structure = false) {
    if (before.draft !== draft || before.title !== title || before.packed !== serializeScore()) {
      undoStack.push({ state: before, structure });
      if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
      redoStack.length = 0;
    }
    transportState();
  }

  function editSong(change, structure = false) {
    const before = snapshot();
    change();
    remember(before, structure);
  }

  function restoreHistory(from, to) {
    if (recording || busy && storageReady || !from.length) return;
    const { state, structure } = from.pop();
    to.push({ state: snapshot(), structure });
    stop();
    resetPiano();
    closeMenu(true);
    const value = deserializeSong(state.packed);
    const tracks = draft === state.draft ? song.tracks : state.tracks;
    for (const name of TRACK_NAMES) {
      const { volume, mute, solo, voice } = tracks[name];
      Object.assign(value.tracks[name], { volume, mute, solo });
      if (voice) value.tracks[name].voice = voice;
    }
    draft = state.draft;
    title = titleInput.value = state.title;
    cursor = state.cursor;
    grid.select(null);
    setSong(value, { structure });
    if (structure) setLoop(state.loop);
  }
  function announce(text) {
    if (message.textContent !== text) message.textContent = text;
  }

  const titleInput = el('input', 'cs-song-title');
  titleInput.type = 'text';
  titleInput.maxLength = TITLE_LIMIT;
  titleInput.setAttribute('aria-label', '曲名');
  titleInput.value = title;
  function commitTitle() {
    if (titleInput.value === title) return;
    editSong(() => { title = titleInput.value = titleInput.value.trim() || UNTITLED; });
  }
  titleInput.addEventListener('change', commitTitle);

  function showTab(name) {
    if (tab !== name) {
      stop();
      resetPiano();
      closeMenu();
      if (name !== 'arrange') {
        guitar ??= mountGuitar(panels[name], true);
        panels[name].append(guitar.layout);
      }
      guitar?.show(name);
      tab = name;
    }
    Object.entries(panels).forEach(([id, node]) => {
      node.hidden = id !== tab;
      tabButtons[id].setAttribute('aria-selected', String(id === tab));
      tabButtons[id].tabIndex = id === tab ? 0 : -1;
    });
    titleInput.hidden = trackTabs.hidden = tab !== 'arrange';
  }

  const panels = { arrange, guitar: el('section'), practice: el('section') };
  const tabButtons = Object.fromEntries(Object.entries(TAB_LABELS).map(([name, label]) => {
    const node = button(label, () => showTab(name));
    node.id = 'cs-tab-' + name;
    node.setAttribute('role', 'tab');
    node.setAttribute('aria-controls', 'cs-panel-' + name);
    panels[name].id = 'cs-panel-' + name;
    panels[name].setAttribute('role', 'tabpanel');
    panels[name].setAttribute('aria-labelledby', node.id);
    tabs.append(node);
    return [name, node];
  }));
  tabs.addEventListener('keydown', event => {
    const names = Object.keys(panels);
    const index = names.indexOf(tab);
    const target = { ArrowLeft: (index + 2) % 3, ArrowRight: (index + 1) % 3, Home: 0, End: 2 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    showTab(names[target]);
    tabButtons[names[target]].focus();
  });
  let centeredKeyboard = false;
  for (const name of TRACK_NAMES) {
    const node = button(TRACK_LABELS[name], () => {
      if (arrange.dataset.track !== name) resetPiano();
      arrange.dataset.track = name;
      if (name === 'melody' && !centeredKeyboard && scroller.scrollWidth > scroller.clientWidth) {
        scroller.scrollLeft = wrap.querySelector('[data-octave="中音"]').offsetLeft - 8;
        centeredKeyboard = true;
      }
      for (const item of trackTabs.children) item.setAttribute('aria-pressed', String(item === node));
    });
    node.setAttribute('aria-pressed', String(name === arrange.dataset.track));
    trackTabs.append(node);
  }

  const playButton = button('▶ 播放', () => play(), 'cs-primary');
  const stopButton = button('■ 停止', stop);
  const clearLoop = button('取消循環', () => setLoop(null));
  clearLoop.hidden = true;
  const clearRange = button('清空這段', () => confirmClear(loop));
  clearRange.hidden = true;
  const plus = button('＋小節', () => replaceSong(appendBar(song), true));
  const minus = button('－小節', () => confirmDelete(song.bars.length - 1, deleteLastBar));
  const tempo = el('input', 'cs-tempo');
  tempo.type = 'number';
  tempo.min = '60';
  tempo.max = '160';
  tempo.setAttribute('aria-label', '速度（BPM）');
  tempo.addEventListener('change', () => editSong(() => {
    song.bpm = clampInt(tempo.value, 60, 160, song.bpm);
    tempo.value = song.bpm;
    engine?.setTempo(song.bpm);
  }));
  const meter = select('拍號', [[4, '4/4'], [3, '3/4']], beats => {
    replaceSong(normalizeSong({ ...song, beats }), Number(beats) !== song.beats);
  });
  const key = select('調性', KEY_NAMES.map(name => [name, name]), value => editSong(() => {
    song.key = value;
    grid.render(song, 'bass');
  }));
  const saveButton = button('存檔 ▾', event => showSlots('save', event.currentTarget));
  const loadButton = button('讀檔 ▾', event => showSlots('load', event.currentTarget));
  for (const node of [saveButton, loadButton]) node.setAttribute('aria-expanded', 'false');
  const files = group(saveButton, loadButton);
  files.classList.add('cs-files');
  const newButton = button('新曲', requestNew);
  const undoButton = button('復原', () => restoreHistory(undoStack, redoStack));
  const redoButton = button('重做', () => restoreHistory(redoStack, undoStack));
  undoButton.setAttribute('aria-keyshortcuts', 'Control+Z Meta+Z');
  redoButton.setAttribute('aria-keyshortcuts', 'Control+Shift+Z Meta+Shift+Z Control+Y');
  const historyTools = group(newButton, undoButton, redoButton);
  historyTools.classList.add('cs-history');
  const more = button('⋯更多', () => openMenu(more, [newButton, undoButton, redoButton].map(control => {
    const item = button(control.textContent, () => { closeMenu(true); control.click(); });
    item.disabled = control.disabled;
    return item;
  }), '更多編輯操作'), 'cs-toolbar-more');
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-haspopup', 'true');
  toolbar.append(group(playButton, stopButton, clearLoop), group(plus, minus),
    group(field('速度', tempo), field('拍號', meter), field('調性', key)), historyTools, files, more, clearRange);

  const trackControls = Object.fromEntries(TRACK_NAMES.map(name => {
    const label = TRACK_LABELS[name];
    const volume = el('input');
    volume.type = 'range';
    volume.min = '0';
    volume.max = '100';
    volume.setAttribute('aria-label', label + '音量');
    volume.addEventListener('input', () => mix({ volume: Number(volume.value) }));
    const mute = button('靜音', () => mix({ mute: !song.tracks[name].mute }));
    const solo = button('獨奏', () => mix({ solo: !song.tracks[name].solo }));
    mute.setAttribute('aria-label', label + '靜音');
    solo.setAttribute('aria-label', label + '獨奏');
    const heading = el('h2', '', label);
    const controls = el('div', 'cs-track-controls');
    const clear = button('清空', () => confirmClear({ startBar: 0, endBar: song.bars.length - 1 }, name));
    clear.setAttribute('aria-label', `清空${label}軌`);
    const trackHeading = group(heading, clear);
    trackHeading.classList.add('cs-track-heading');
    const mixer = group(field('音量', volume), mute, solo);
    mixer.classList.add('cs-mixer');
    let choose, pattern;
    if (name === 'drums') {
      choose = select('套用預設節奏', [['', '套用預設節奏'], ...BAND_STYLES.map(style => [style.id, style.label])], id => {
        if (id) applyDrums(BAND_STYLES.find(style => style.id === id));
        choose.value = '';
      });
    } else if (name === 'bass') {
      choose = select('貝斯模式', [['auto', '跟著和弦自動走'], ['manual', '手動']], value => editSong(() => {
        song.tracks.bass.mode = value;
        grid.render(song, 'bass');
      }));
    } else {
      choose = select(label + '音色', CHORD_VOICES.map(voice => [voice, voicing(voice)]), value => {
        song.tracks[name].voice = value;
      });
      if (name === 'chords') {
        pattern = select('和弦預設刷法', PATTERNS.map(value => [value, PATTERN_LABELS[value]]), value => editSong(() => {
          song.tracks.chords.pattern = value;
          grid.render(song, 'chords');
        }));
      }
    }
    controls.append(trackHeading, mixer, choose);
    if (pattern) controls.append(field('預設刷法', pattern));
    function refresh() {
      const track = song.tracks[name];
      volume.value = track.volume;
      mute.setAttribute('aria-pressed', String(track.mute));
      solo.setAttribute('aria-pressed', String(track.solo));
      if (name !== 'drums') choose.value = track.mode || track.voice;
      if (pattern) pattern.value = track.pattern;
    }
    function mix(patch) {
      Object.assign(song.tracks[name], patch);
      if (!recording || name !== 'melody') engine?.setTrackMix(name, patch);
      refresh();
    }
    return [name, { controls, refresh, clear }];
  }));

  const grid = makeComposerScore(score,
    Object.fromEntries(TRACK_NAMES.map(name => [name, trackControls[name].controls])),
    { edit, loop: setLoop, resize: resizeNote, move: moveNote, preview: previewPitch, canEdit: () => !recording });
  const { instrument, scroller, wrap, keys, byNote } = makePianoKeyboard(el);
  wrap.setAttribute('aria-label', '旋律鍵盤');
  instrument.id = 'cs-piano';
  const shortScreen = matchMedia('(max-height: 800px)');
  const toggleKeys = button('顯示琴鍵', () => showKeys(instrument.hidden), 'cs-keyboard-toggle');
  toggleKeys.setAttribute('aria-controls', instrument.id);
  function showKeys(visible) {
    if (!visible && !instrument.hidden) resetPiano();
    instrument.hidden = !visible;
    toggleKeys.textContent = visible ? '收起琴鍵' : '顯示琴鍵';
    toggleKeys.setAttribute('aria-expanded', String(visible));
  }
  function resetKeyboardLayout() {
    toggleKeys.hidden = !shortScreen.matches;
    showKeys(!shortScreen.matches || !!recording || stepInput.getAttribute('aria-pressed') === 'true');
  }
  const stepInput = button('點輸入', () => {
    const active = stepInput.getAttribute('aria-pressed') !== 'true';
    stepInput.setAttribute('aria-pressed', String(active));
    grid.showInputCursor(active);
    if (active) showKeys(true);
  });
  stepInput.setAttribute('aria-pressed', 'false');
  shortScreen.addEventListener('change', resetKeyboardLayout, eventOptions);
  resetKeyboardLayout();
  const rec = button('錄音', record, 'cs-record');
  const recordMode = select('錄音方式', [['append', '疊加'], ['replace', '錄音前清空這幾小節']], () => {});
  const keyboard = el('div', 'cs-keyboard');
  const keyboardTools = group(el('strong', '', '旋律鍵盤'), toggleKeys, stepInput, rec, recordMode);
  keyboard.append(keyboardTools, instrument);
  heading.append(tabs, titleInput);
  arrange.append(toolbar, trackTabs, score, keyboard, status);
  root.append(heading, ...Object.values(panels), popup, dialog);
  const shortLandscape = matchMedia('(orientation: landscape) and (max-height: 510px) and (min-width: 621px)');
  function placeTrackTabs() {
    if (shortLandscape.matches) titleInput.before(trackTabs);
    else score.before(trackTabs);
  }
  shortLandscape.addEventListener('change', placeTrackTabs, eventOptions);
  placeTrackTabs();
  host.append(root);
  const recordingLocks = [...toolbar.querySelectorAll('select, .cs-tempo'),
    ...score.querySelectorAll('select'), ...TRACK_NAMES.map(name => trackControls[name].clear),
    titleInput, newButton, clearRange, recordMode, stepInput];
  const releaseRange = bindPianoRange(scroller, wrap, el);
  const pianoAdapter = { handleKey: () => false, releaseNotes: () => engine?.releasePreview() };
  let releaseKeys = bindPianoInput(wrap, keys, byNote, pianoAdapter, pianoNote);
  resetPiano = () => {
    releaseKeys();
    releaseKeys = bindPianoInput(wrap, keys, byNote, pianoAdapter, pianoNote);
  };

  function setLoop(value) {
    if (recording) { grid.setLoop(loop); return; }
    const wasPlaying = engine?.running;
    loop = value;
    grid.setLoop(loop);
    clearLoop.hidden = !loop;
    clearRange.hidden = !loop;
    if (loop) announce(`循環第 ${loop.startBar + 1}～${loop.endBar + 1} 小節`);
    else announce('');
    if (wasPlaying) play(loop?.startBar ?? engine.getPosition()?.bar);
  }

  function moveCursor(bar, step, options) {
    cursor = Math.min(song.bars.length * stepsPerBar(song.beats) - 1, bar * stepsPerBar(song.beats) + step);
    grid.setCursor(cursor, options);
  }

  function refresh() {
    count.textContent = `共 ${song.bars.length} 小節（${MIN_BARS}～${MAX_BARS}）`;
    tempo.value = song.bpm;
    meter.value = song.beats;
    key.value = song.key;
    TRACK_NAMES.forEach(name => trackControls[name].refresh());
    transportState();
  }

  function setSong(value, { structure = false } = {}) {
    if (structure) {
      stop();
      setLoop(null);
      cursor = Math.min(cursor, value.bars.length * stepsPerBar(value.beats) - 1);
      grid.select(null);
    }
    song = value;
    grid.render(song);
    grid.setCursor(cursor);
    refresh();
  }

  function replaceSong(value, structure = false) {
    editSong(() => setSong(value, { structure }), structure);
  }

  function applyDrums(style) {
    editSong(() => {
      const range = loop || { startBar: 0, endBar: song.bars.length - 1 };
      for (let bar = range.startBar; bar <= range.endBar; bar++) {
        const steps = stepsPerBar(song.beats);
        for (const row of DRUM_ROWS) {
          song.bars[bar].drums[row] = Array.from({ length: steps }, (_, step) =>
            !!(style.drums[row]?.[step] || (row === 'closedHat' && style.drums.openHat?.[step])));
        }
      }
      grid.render(song, 'drums');
    });
  }

  function setNote(bar, step, pitch, length) {
    const notes = song.bars[bar].melody;
    const at = notes.findIndex(note => note.start === step && note.pitch === pitch);
    if (length === 0 && at >= 0) notes.splice(at, 1);
    else if (length > 0) {
      if (at < 0) notes.push({ start: step, pitch, length });
      else notes[at].length = length;
    }
  }

  function resizeNote({ bar, step, pitch }, length) {
    if (recording) return;
    editSong(() => {
      setNote(bar, step, pitch, length);
      grid.render(song, 'melody');
    });
  }

  function moveNote(track, from, to) {
    if (recording) return;
    closeMenu();
    editSong(() => {
      if (track === 'melody') {
        setNote(from.bar, from.step, from.pitch, 0);
        setNote(to.bar, to.step, to.pitch, to.length);
        grid.select(to);
      } else {
        song.bars[from.bar].bass[from.step] = null;
        song.bars[to.bar].bass[to.step] = to.pitch;
      }
      grid.render(song, track);
    });
  }

  function previewPitch(track, pitch) {
    const player = ensureEngine();
    if (track === 'bass') player?.previewBass(pitch, song.bpm);
    else player?.previewNote(pitch, song.tracks.melody.voice)(.13);
  }

  function edit(action, { bar, step, pitch, drum, node }) {
    if (recording) return;
    switch (action) {
      case 'from':
        if (loop && (bar < loop.startBar || bar > loop.endBar)) {
          stop();
          setLoop(null);
        }
        play(bar);
        break;
      case 'more':
        openBarMenu(node, bar);
        break;
      case 'drum': {
        const hits = song.bars[bar].drums[drum];
        editSong(() => {
          hits[step] = !hits[step];
          node.setAttribute('aria-pressed', String(hits[step]));
        });
        break;
      }
      case 'bass':
        openBassMenu(node, bar, step);
        break;
      case 'chord':
        openChord(bar);
        break;
      case 'cursor':
        moveCursor(bar, step);
        break;
      case 'add-note':
        moveCursor(bar, step);
        grid.select({ bar, step, pitch });
        resizeNote({ bar, step, pitch }, 1);
        previewPitch('melody', pitch);
        break;
      case 'note':
        grid.select(null);
        resizeNote({ bar, step, pitch }, 0);
        break;
    }
  }

  function confirmDelete(bar, remove = deleteBar) {
    openDialog(`刪除第 ${bar + 1} 小節？`, [], [
      button('取消', closeDialog),
      button('刪除', () => {
        closeDialog();
        replaceSong(remove(song, bar), true);
      }, 'cs-danger'),
    ]);
  }

  function confirmClear(range, track) {
    if (!range || recording) return;
    const { startBar, endBar } = range;
    const count = endBar - startBar + 1;
    const checks = new Map();
    const confirm = button('清空', () => {
      const tracks = track ? [track] : TRACK_NAMES.filter(name => checks.get(name).checked);
      closeDialog();
      grid.select(null);
      replaceSong(clearTracks(song, range, tracks));
    }, 'cs-danger');
    const body = track ? [] : TRACK_NAMES.map(name => {
      const input = el('input');
      input.type = 'checkbox';
      input.checked = true;
      input.addEventListener('change', () => {
        confirm.disabled = !TRACK_NAMES.some(name => checks.get(name).checked);
      });
      checks.set(name, input);
      return field(TRACK_LABELS[name], input);
    });
    const label = track ? `清空${TRACK_LABELS[track]}軌的 ${count} 個小節？`
      : `清空第 ${startBar + 1}～${endBar + 1} 小節？`;
    openDialog(label, body, [button('取消', closeDialog), confirm]);
  }

  function closeMenu(restoreFocus = false) {
    if (!anchor) return;
    const previous = anchor;
    anchor = null;
    popup.hidePopover();
    previous.setAttribute('aria-expanded', 'false');
    if (restoreFocus && previous.isConnected) previous.focus({ preventScroll: true });
  }

  function openMenu(node, options, label) {
    const previous = anchor;
    closeMenu();
    if (previous === node) return;
    anchor = node;
    popup.setAttribute('aria-label', label);
    popup.replaceChildren(...options);
    node.setAttribute('aria-expanded', 'true');
    popup.showPopover();
    popup.querySelector('button:enabled')?.focus({ preventScroll: true });
    const box = node.getBoundingClientRect(), size = popup.getBoundingClientRect();
    popup.style.left = Math.max(8, Math.min(box.left, innerWidth - size.width - 8)) + 'px';
    popup.style.top = (box.bottom + size.height + 12 <= innerHeight ? box.bottom + 4
      : Math.max(8, box.top - size.height - 4)) + 'px';
  }

  function openBarMenu(node, bar) {
    const options = BAR_EDITS.map(([label, apply, type]) => {
      const item = button(label, () => {
        closeMenu(true);
        if (type === 'delete') confirmDelete(bar, apply);
        else {
          grid.select(null);
          replaceSong(apply(song, bar), type === 'add');
        }
      }, type === 'delete' ? 'cs-danger' : '');
      item.disabled = type === 'add' && song.bars.length >= MAX_BARS ||
        type === 'delete' && song.bars.length <= MIN_BARS;
      return item;
    });
    openMenu(node, options, `第 ${bar + 1} 小節選單`);
  }

  function openBassMenu(node, bar, step) {
    const choices = [null, ...Array.from({ length: BASS_MAX - BASS_MIN + 1 }, (_, index) => BASS_MIN + index)];
    const picker = el('div', 'cs-bass-options');
    for (const pitch of choices) {
      const item = button(pitch === null ? '休止' : pitchName(pitch), () => editSong(() => {
        song.bars[bar].bass[step] = pitch;
        node.textContent = pitch === null ? '·' : pitchName(pitch);
        node.classList.toggle('filled', pitch !== null);
        node.setAttribute('aria-label', `第 ${bar + 1} 小節貝斯第 ${step + 1} 格 ${node.textContent}`);
        closeMenu(true);
      }));
      item.setAttribute('aria-pressed', String(song.bars[bar].bass[step] === pitch));
      picker.append(item);
    }
    openMenu(node, [picker], '選擇貝斯音高');
  }

  function openDialog(label, body, buttons) {
    closeMenu();
    resetPiano();
    const heading = el('h2', '', label);
    heading.id = 'cs-dialog-title';
    const footer = group(...buttons);
    footer.classList.add('cs-dialog-actions');
    dialog.replaceChildren(heading, ...body, footer);
    if (!dialog.open) dialog.showModal();
    else (body[0]?.querySelector('input, select, button') || buttons[0]).focus();
  }

  function closeDialog() { dialog.close(); }

  function openChord(bar) {
    const current = song.bars[bar];
    const options = el('div', 'cs-chord-options');
    const suggested = chordSuggestions(song.key);
    let chord = current.chord;
    const all = el('details', 'cs-chord-all');
    const summary = el('summary', '', '全部和弦');
    const selected = el('span', 'cs-chord-selected');
    summary.append(selected);
    const pick = select('全部和弦', [['', '空白']], chooseChord);
    for (const root of ROOT_NAMES) {
      const group = el('optgroup');
      group.label = root;
      for (const name of CHORD_NAMES.filter(name => name.match(/^[A-G][#b]?/)?.[0] === root)) {
        const option = el('option', '', name);
        option.value = name;
        group.append(option);
      }
      pick.append(group);
    }
    all.append(summary, pick);
    function chooseChord(value) {
      chord = value;
      pick.value = value;
      selected.textContent = value && !suggested.includes(value) ? value : '';
      for (const node of options.children) node.setAttribute('aria-pressed', String(node.dataset.chord === value));
    }
    for (const name of ['', ...suggested]) {
      const choice = button(name || '空白', () => chooseChord(name));
      choice.dataset.chord = name;
      options.append(choice);
    }
    chooseChord(chord);
    const pattern = select('這一小節的刷法',
      [['', '跟預設'], ...PATTERNS.map(value => [value, PATTERN_LABELS[value]])], () => {});
    pattern.value = current.pattern || '';
    const apply = el('input');
    apply.type = 'checkbox';
    openDialog(`第 ${bar + 1} 小節和弦（${song.key} 調）`, [
      el('h3', 'cs-section-title', '這個調常用的和弦'), options, all,
      field('這一小節的刷法', pattern), field('套用到後面所有小節', apply),
    ], [button('取消', closeDialog), button('套用', () => editSong(() => {
      for (let index = bar; index < (apply.checked ? song.bars.length : bar + 1); index++) {
        Object.assign(song.bars[index], { chord, pattern: pattern.value || null });
      }
      closeDialog();
      grid.render(song, 'chords');
      score.querySelector(`[data-act="chord"][data-bar="${bar}"]`).focus({ preventScroll: true });
    }), 'cs-primary')]);
  }

  function slotLabel(slot) {
    return `第 ${slot.slot} 格　${slot.occupied ? slot.title || '無法讀取' : '空白'}`;
  }

  async function storageAction(work) {
    if (busy) return;
    busy = true;
    try { await work(); }
    catch { announce('存檔或讀檔失敗，請再試一次'); }
    finally { busy = false; }
  }

  function showSlots(mode, node) {
    commitTitle();
    const items = slots.map(slot => {
      const item = button(slotLabel(slot), () => {
        closeMenu(true);
        if (mode === 'save') askName(slot);
        else requestLoad(() => store.load(slot.slot), `已讀取第 ${slot.slot} 格`, slot.slot);
      });
      item.disabled = mode === 'load' && !slot.title;
      return item;
    });
    if (mode === 'load') {
      const examples = el('section', 'cs-example-menu');
      const label = el('h3', 'cs-section-title', '範例曲');
      label.id = 'cs-example-heading';
      examples.setAttribute('aria-labelledby', label.id);
      examples.append(label);
      for (const { song, description } of COMPOSER_EXAMPLES) {
        const item = button(song.title, () => {
          closeMenu(true);
          requestLoad(() => song, `已讀取範例曲「${song.title}」`);
        });
        const note = el('span', 'cs-example-description', description);
        note.id = `cs-example-note-${examples.childElementCount}`;
        item.append(note);
        item.setAttribute('aria-label', song.title);
        item.setAttribute('aria-describedby', note.id);
        examples.append(item);
      }
      items.push(examples);
    }
    openMenu(node, items, mode === 'save' ? '存檔格' : '讀檔格');
  }

  function askName(slot, onSaved) {
    const name = el('input');
    name.maxLength = TITLE_LIMIT;
    name.value = title;
    name.setAttribute('aria-label', '存檔曲名');
    const save = button('存檔', () => storageAction(async () => {
      save.disabled = true;
      stop();
      const nextTitle = name.value.trim() || UNTITLED;
      try {
        await store.save(slot.slot, { ...song, title: nextTitle });
        editSong(() => { title = titleInput.value = nextTitle; });
        savedSlots.set(slot.slot, signature());
        draft.slot = slot.slot;
        slots = await store.list();
        closeDialog();
        announce(`已存到第 ${slot.slot} 格`);
        onSaved?.();
      } finally {
        save.disabled = false;
      }
    }), 'cs-primary');
    name.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) save.click();
    });
    const label = slot.occupied ? `覆寫第 ${slot.slot} 格？` : `存到第 ${slot.slot} 格`;
    openDialog(label, [field('曲名', name)], [button('取消', closeDialog), save]);
    name.focus();
    name.select();
  }

  function requestLoad(readSong, announcement, slot) {
    const load = () => storageAction(async () => {
      heading.inert = arrange.inert = true;
      try {
        const stored = await readSong();
        if (!stored) { announce('這個存檔無法讀取'); return; }
        undoStack.length = redoStack.length = 0;
        title = titleInput.value = stored.title || DEFAULT_TITLE;
        cursor = 0;
        setSong(normalizeSong(stored), { structure: true });
        if (slot) {
          savedSlots.set(slot, signature());
          draft = { slot };
        } else draft = { saved: signature() };
        score.scrollLeft = 0;
        closeDialog();
        announce(announcement);
      } finally {
        heading.inert = arrange.inert = false;
      }
    });
    if (!dirty()) load();
    else openDialog('讀檔並放棄目前的修改？', [], [
      button('取消', closeDialog), button('讀檔', load, 'cs-primary'),
    ]);
  }

  function onPosition(position) {
    grid.setPosition(position, true);
    const text = position ? `第 ${position.bar + 1} 小節 · 第 ${position.beat + 1} 拍` : '已停止';
    if (location.textContent !== text) location.textContent = text;
    location.dataset.bar = position?.bar ?? '';
    location.dataset.step = position?.step ?? '';
    if (!position) finishRecording();
    transportState();
  }

  function ensureEngine() {
    context = audio();
    if (!context) { announce('這個瀏覽器無法播放聲音'); return null; }
    engine ??= createComposerEngine(context, { onPosition });
    return engine;
  }

  function transportState() {
    const playing = !!engine?.running;
    playButton.setAttribute('aria-pressed', String(playing && !recording));
    playButton.disabled = !!recording;
    stopButton.disabled = !playing;
    rec.disabled = !!recording;
    rec.setAttribute('aria-pressed', String(!!recording));
    undoButton.disabled = !undoStack.length || !!recording;
    redoButton.disabled = !redoStack.length || !!recording;
    more.disabled = !!recording;
    for (const node of recordingLocks) node.disabled = !!recording;
    plus.disabled = song.bars.length >= MAX_BARS || !!recording;
    minus.disabled = song.bars.length <= MIN_BARS || !!recording;
    clearLoop.disabled = !!recording;
    saveButton.disabled = loadButton.disabled = !storageReady || !!recording;
  }

  function play(fromBar = loop?.startBar ?? 0) {
    if (!ensureEngine()) return;
    engine.play(song, { fromBar, loop });
    transportState();
  }

  function stop() { engine?.stop(); }

  function showCountIn() {
    if (!recording) return;
    const beats = Math.ceil((recording.start - context.currentTime) / (60 / song.bpm));
    announce(beats > 0 ? `預備 · ${Math.max(1, song.beats - beats + 1)} / ${song.beats}` : '錄音中');
    if (beats > 0) counting = requestAnimationFrame(showCountIn);
    else startTake(recording);
  }

  function record() {
    if (!ensureEngine()) return;
    stop();
    closeMenu();
    resetPiano();
    showKeys(true);
    const range = loop || { startBar: Math.floor(cursor / stepsPerBar(song.beats)), endBar: song.bars.length - 1 };
    const backing = normalizeSong(song);
    backing.tracks.melody.mute = true;
    backing.tracks.melody.solo = false;
    recording = { ...range, before: snapshot(), replace: recordMode.value === 'replace', started: false, notes: [] };
    recording.start = engine.play(backing, { fromBar: range.startBar, endBar: range.endBar, countIn: true });
    recording.end = recording.start + (range.endBar - range.startBar + 1) * song.beats * 60 / song.bpm;
    // Start the destructive edit on the first recorded beat, so stopping during the count-in keeps the take.
    showCountIn();
    transportState();
  }

  function startTake(take) {
    if (take.started) return;
    take.started = true;
    if (take.replace) {
      for (let bar = take.startBar; bar <= take.endBar; bar++) song.bars[bar].melody = [];
      grid.render(song, 'melody');
    }
  }

  function finishRecording() {
    if (!recording) return;
    const take = recording;
    recording = null;
    cancelAnimationFrame(counting);
    if (context.currentTime >= take.start) startTake(take);
    for (const endNote of take.notes) endNote(0, false, true);
    if (take.started) remember(take.before);
    announce(take.started ? '錄音結束' : '已取消錄音');
  }

  function pianoNote(note) {
    const pitch = Math.min(MELODY_MAX, 60 + note);
    const monitor = ensureEngine()?.previewNote(pitch, song.tracks.melody.voice);
    const take = recording;
    const at = context?.currentTime;
    if (take && at >= take.start && at < take.end) {
      startTake(take);
      const steps = stepsPerBar(song.beats), duration = 15 / song.bpm;
      const index = Math.min((take.endBar - take.startBar + 1) * steps - 1, Math.round((at - take.start) / duration));
      const bar = take.startBar + Math.floor(index / steps), step = index % steps;
      const originalLength = song.bars[bar].melody.find(note => note.start === step && note.pitch === pitch)?.length || 1;
      setNote(bar, step, pitch, originalLength);
      grid.render(song, 'melody');
      const end = (delay = 0, letDecay = false, finishing = false) => {
        if (!finishing) monitor?.(delay, letDecay);
        if (!take.notes.includes(end)) return;
        const endStep = Math.round((context.currentTime + delay - take.start) / duration);
        const lastLength = song.bars[bar].melody.find(note => note.start === step && note.pitch === pitch)?.length || 1;
        setNote(bar, step, pitch, Math.min(steps - step, Math.max(lastLength, endStep - index)));
        if (!finishing) take.notes.splice(take.notes.indexOf(end), 1);
        grid.render(song, 'melody');
      };
      take.notes.push(end);
      return end;
    }
    if (!take && stepInput.getAttribute('aria-pressed') === 'true') {
      const steps = stepsPerBar(song.beats);
      const bar = Math.floor(cursor / steps), step = cursor % steps;
      const length = song.bars[bar].melody.find(note => note.start === step && note.pitch === pitch)?.length || 1;
      editSong(() => {
        setNote(bar, step, pitch, length);
        grid.render(song, 'melody');
        moveCursor(bar, step + 1, { follow: true, pitch });
      });
    }
    return monitor;
  }

  function finishClose() {
    allowClose = true;
    onClose();
  }

  function requestNew() {
    if (recording || busy && storageReady) return;
    stop();
    commitTitle();
    const createNew = () => {
      editSong(() => {
        draft = {};
        title = titleInput.value = UNTITLED;
        cursor = 0;
        setSong(normalizeSong(), { structure: true });
        draft.saved = signature();
        score.scrollLeft = 0;
      }, true);
      announce('已建立新曲');
    };
    if (dirty()) askSaveChanges(createNew);
    else createNew();
  }

  function beforeClose(event) {
    if (allowClose) { returning = true; return; }
    if (dialog.open || busy && storageReady) { event.preventDefault(); return; }
    const escape = event.detail?.key === 'Escape';
    if (escape && grid.cancelNoteDrag()) {
      event.detail.preventDefault();
      event.preventDefault();
      return;
    }
    // Escape can open the save prompt. Suppress the native cancellation of that new dialog.
    if (escape) event.detail.preventDefault();
    if (anchor) {
      closeMenu(true);
      if (escape) { event.preventDefault(); return; }
    }
    stop();
    commitTitle();
    if (!dirty()) { returning = true; return; }
    event.preventDefault();
    askSaveChanges(finishClose);
  }

  function askSaveChanges(proceed) {
    const save = button('存檔', () => {
      const slot = slots.find(item => item.slot === draft.slot);
      if (slot) askName(slot, proceed);
      else {
        const list = el('div', 'cs-exit-slots');
        list.append(...slots.map(item => button(slotLabel(item), () => askName(item, proceed))));
        openDialog('選擇存檔格', [list], [button('取消', closeDialog)]);
      }
    }, 'cs-primary');
    save.disabled = !storageReady;
    openDialog('編曲還有未存檔的修改', [], [
      button('取消', closeDialog),
      button('不存', () => { closeDialog(); proceed(); }, 'cs-danger'),
      save,
    ]);
  }

  panel.addEventListener('studio:before-close', beforeClose, eventOptions);
  document.addEventListener('pointerdown', event => {
    if (anchor && !popup.contains(event.target) && !anchor.contains(event.target)) closeMenu();
  }, eventOptions);
  window.addEventListener('resize', () => closeMenu(), eventOptions);
  score.addEventListener('scroll', () => closeMenu(), eventOptions);
  window.addEventListener('keydown', event => {
    if (tab !== 'arrange' || dialog.open || recording || event.defaultPrevented || event.isComposing ||
        event.target.closest?.('input[type="text"], input[type="number"], textarea, [contenteditable]')) return;
    if (event.ctrlKey || event.metaKey) {
      if (event.altKey) return;
      const key = event.key.toLowerCase();
      if (key !== 'z' && key !== 'y') return;
      event.preventDefault();
      if (key === 'y' || event.shiftKey) restoreHistory(redoStack, undoStack);
      else restoreHistory(undoStack, redoStack);
      return;
    }
    if (event.target.closest?.('input, select')) return;
    const note = grid.selected();
    if (note && ['Delete', 'Backspace'].includes(event.key)) {
      event.preventDefault();
      grid.select(null);
      resizeNote(note, 0);
    }
  }, eventOptions);

  draft.saved = signature();
  showTab('arrange');
  setSong(song);
  announce('正在讀取存檔');
  location.textContent = '已停止';
  saveButton.disabled = loadButton.disabled = true;
  storageAction(async () => {
    const imported = await store.migrateLegacy();
    slots = await store.list();
    storageReady = true;
    transportState();
    announce(imported ? '舊編曲盒已轉入第 1 格' : '');
  });
  window.STUDIO_FEATURES?.bgm?.hold?.('composer', true);
  const watch = new MutationObserver(() => {
    if (panel.classList.contains('on') && root.isConnected) return;
    watch.disconnect();
    events.abort();
    closeMenu();
    closeDialog();
    cancelAnimationFrame(counting);
    releaseRange();
    releaseKeys();
    grid.dispose();
    guitar?.dispose();
    engine?.dispose();
    window.STUDIO_FEATURES?.bgm?.hold?.('composer', false);
    root.remove();
    if (returning) onReturn?.();
  });
  watch.observe(panel, { attributes: true, attributeFilter: ['class'] });
  watch.observe(host, { childList: true });
}
