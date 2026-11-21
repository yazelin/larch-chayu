import { studioPointOpen } from './studio_unlock.mjs';
import { preparePanel } from './studio_panel.mjs';
import { CHORDS, CHORD_GROUPS, guitarFrequency } from './guitar_chords.mjs';
import { makeGuitarPractice } from './guitar_practice.mjs';
import { makeGuitarArranger } from './guitar_arranger.mjs';
// 工作室互動點（真結局/設計.md「工作室互動總表」，2026-11-11 作者同意；2026-11-17 作者：九個佔位面板逐個做成真的互動）。
// 第一批是劇情調查卡會點到的三個＋順手的吉他：圓鐘（10，倒數）、圓拱門（11，出門上島）、電子琴（6，可彈）、吉他（7，可彈）。
// 只接 window.STUDIO_FEATURES.handle 與 index.html 的面板，不動其他互動點。面板上的字只有介面標示，沒有新寫角色台詞（「詩接話」等台詞要先給作者看，還沒做）。
{
  const TRIAL_LAST_DAY = 30;   // 跟 studio_features.mjs 的試用期倒數同一個數字
  const query = new URLSearchParams(location.search);
  const game = () => (window.STUDIO_FEATURES && window.STUDIO_FEATURES.context()) || { chapter: 1, day: 1 };
  const panel = document.getElementById('panel'), panelTitle = document.getElementById('panel-title'), panelBody = document.getElementById('panel-body'), scrim = document.getElementById('scrim');
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const svg = (tag, attrs) => { const n = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; };

  const style = document.createElement('style');
  style.textContent = `
.sp-clock{display:flex;flex-direction:column;align-items:center;gap:10px;padding:6px 0 2px}
.sp-clock svg{width:min(230px,58vw);height:auto;filter:drop-shadow(0 3px 6px rgba(70,50,30,.28))}
.sp-window{min-width:74px;padding:4px 14px 3px;border:3px solid #8b6a45;border-radius:7px;background:#fffaf0;color:#4a3a30;font:700 30px/1.2 ui-monospace,Menlo,monospace;text-align:center;letter-spacing:.06em;box-shadow:inset 0 2px 5px rgba(70,50,30,.2)}
.sp-window.blank{color:#c9b9a2}
.sp-cap{margin:0;color:#6d5a4b;font-size:13px}
.sp-door{display:flex;flex-direction:column;align-items:center;gap:12px}
.sp-door-img{display:block;width:100%;height:auto}
.sp-go{appearance:none;border:2px solid #8b6a45;border-radius:999px;background:#f6e2b8;color:#4a3a30;font:inherit;font-weight:700;padding:8px 22px;cursor:pointer}
.sp-go:disabled{opacity:.55;cursor:default}
.sp-keys{position:relative;display:flex;justify-content:center;margin:8px auto 4px;width:min(400px,100%);height:150px;user-select:none;touch-action:none}
.sp-key{position:relative;flex:1 1 0;border:2px solid #6d5a4b;border-left-width:1px;border-right-width:1px;border-radius:0 0 7px 7px;background:linear-gradient(#fffdf8,#f1e7d6);cursor:pointer;padding:0;font:600 11px/1 inherit;color:#9a8478;display:flex;align-items:flex-end;justify-content:center;padding-bottom:7px}
.sp-key.black{position:absolute;top:0;z-index:2;width:8%;height:60%;flex:none;border-radius:0 0 5px 5px;background:linear-gradient(#5a4a40,#2f2622);color:#d8c9b6;border-color:#2f2622}
.sp-key.down{background:#f3cf8c}.sp-key.black.down{background:#8b6a45}`;
  document.head.appendChild(style);

  function openPanel(title, focus, design) {
    preparePanel(design, focus);
    panelTitle.textContent = title; panelBody.replaceChildren(); panel.classList.add('on'); panel.setAttribute('aria-hidden', 'false'); scrim.classList.add('on');
    panel.dataset.point = title; document.getElementById('panel-close').focus({ preventScroll: true });
  }

  // ── 聲音：電子琴與吉他都用瀏覽器合成，不另外帶音檔 ──
  let ctx = null;
  function audio() { if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); } if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  const played = [];   // 給測試看：彈過哪些音
  const pluckBuffers = new Map();
  function guitarSample(a, freq) {
    if (pluckBuffers.has(freq)) return pluckBuffers.get(freq);
    const rate = a.sampleRate;
    // Karplus–Strong：取相鄰樣本平均會多半個樣本的延遲，用播放速率補回音高。
    const period = Math.round(rate / freq - 0.5);
    const playbackRate = freq * (period + 0.5) / rate;
    const buffer = a.createBuffer(1, Math.ceil(2 * rate * playbackRate), rate);
    const samples = buffer.getChannelData(0);
    const pick = Math.round(period * 0.22);
    let mean = 0;
    for (let i = 0; i < period; i++) {
      const displacement = i < pick ? i / pick : (period - i) / (period - pick);
      samples[i] = 0.65 * displacement + 0.35 * (2 * Math.random() - 1);
      mean += samples[i] / period;
    }
    for (let i = 0; i < period; i++) samples[i] -= mean;
    const decay = Math.exp(-1.25 * period / rate);
    samples[period] = decay * (samples[0] + samples[period - 1]) / 2;
    for (let i = period + 1; i < samples.length; i++) {
      samples[i] = decay * (samples[i - period] + samples[i - period - 1]) / 2;
    }
    for (let i = 0; i < samples.length; i++) {
      const time = i / (rate * playbackRate);
      samples[i] *= Math.min(1, time / 0.002) * Math.exp(-2 * time) * Math.min(1, (2 - time) / 0.12);
    }
    const sample = { buffer, playbackRate };
    pluckBuffers.set(freq, sample);
    return sample;
  }
  function tone(freq, kind, delay = 0) {
    played.push(Math.round(freq * 10) / 10); const a = audio(); if (!a) return;
    const t = a.currentTime + delay, gain = a.createGain(); gain.connect(a.destination);
    if (kind === 'pluck') {
      const { buffer, playbackRate } = guitarSample(a, freq);
      const source = a.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.value = playbackRate;
      gain.gain.value = 0.28;
      source.connect(gain);
      source.start(t);
      return source;
    } else {
      const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = freq; const o2 = a.createOscillator(); o2.type = 'triangle'; o2.frequency.value = freq * 2.001;
      const g2 = a.createGain(); g2.gain.value = 0.18; o.connect(gain); o2.connect(g2); g2.connect(gain);
      gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(0.28, t + 0.012); gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
      o.start(t); o2.start(t); o.stop(t + 1.2); o2.stop(t + 1.2);
    }
  }
  function press(node, freq, kind) { tone(freq, kind); node.classList.remove('down'); void node.offsetWidth; node.classList.add('down'); setTimeout(() => node.classList.remove('down'), 260); }

  // ── 圓鐘（10）：鐘面＋底下的數字小窗（試用期還剩幾天；第 30 天之後小窗是空的） ──
  // 指針：第一章劇本寫她房間半夜十二點時工作室是下午三點，所以用裝置時間加十五小時。
  function openClock(focus) {
    openPanel('圓鐘', focus, 'clock');
    const wrap = el('div', 'sp-clock'); const s = svg('svg', { viewBox: '0 0 200 200', role: 'img', 'aria-label': '牆上的圓鐘' });
    s.append(svg('circle', { cx: 100, cy: 100, r: 94, fill: '#8b6a45' }), svg('circle', { cx: 100, cy: 100, r: 84, fill: '#fffaf0', stroke: '#d8c3a8', 'stroke-width': 3 }));
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, big = i % 3 === 0; s.append(svg('line', { x1: 100 + Math.sin(a) * (big ? 66 : 71), y1: 100 - Math.cos(a) * (big ? 66 : 71), x2: 100 + Math.sin(a) * 77, y2: 100 - Math.cos(a) * 77, stroke: '#6d5a4b', 'stroke-width': big ? 4 : 2, 'stroke-linecap': 'round' })); }
    const hour = svg('line', { x1: 100, y1: 100, x2: 100, y2: 56, stroke: '#4a3a30', 'stroke-width': 6, 'stroke-linecap': 'round' }), minute = svg('line', { x1: 100, y1: 100, x2: 100, y2: 34, stroke: '#4a3a30', 'stroke-width': 4, 'stroke-linecap': 'round' });
    s.append(hour, minute, svg('circle', { cx: 100, cy: 100, r: 6, fill: '#8b6a45' }));
    const tick = () => { const d = new Date(Date.now() + 15 * 3600 * 1000), m = d.getMinutes() + d.getSeconds() / 60, h = d.getHours() % 12 + m / 60; hour.setAttribute('transform', `rotate(${h * 30} 100 100)`); minute.setAttribute('transform', `rotate(${m * 6} 100 100)`); wrap.dataset.hour = String(Math.floor(h)); };
    tick(); const timer = setInterval(() => { if (!wrap.isConnected) { clearInterval(timer); return; } tick(); }, 1000);
    const day = Number(game().day) || 1, left = day <= TRIAL_LAST_DAY ? TRIAL_LAST_DAY + 1 - day : null;
    const win = el('div', 'sp-window' + (left === null ? ' blank' : ''), left === null ? '－－' : String(left)); win.dataset.left = left === null ? '' : String(left); win.setAttribute('aria-label', left === null ? '數字小窗是空的' : '數字小窗：' + left);
    const ticket = el('div', 'sp-clock-ticket');
    ticket.append(el('p', 'sp-cap', '第 ' + day + ' 天'), win,
      el('p', 'sp-cap', left === null ? '試用期已結束' : '試用期剩餘天數'));
    wrap.append(s, ticket); panelBody.append(wrap);
  }

  // ── 圓拱門（11）：第三章以後可以出門上島。嵌在 Larch 裡時，要白板那張卡有接「出門」的下一張卡才開放（網址帶 islandDoor=1），不然按了會把劇情卡結束掉 ──
  const inFrame = window.parent !== window;
  function openDoor(focus) {
    openPanel('圓拱門', focus, 'door');
    const g = game();
    const open = studioPointOpen(11, location.search, window.__studio?.variables || {}, inFrame);
    // 門的水彩插圖（作者 2026-11-21：換掉原本 CSS 畫的扁平門）；門還沒開放時圖淡一點、蓋一層紙色，下面照舊寫「門關著。」
    const wrap = el('div', 'sp-door');
    const img = el('img', 'sp-door-img'); img.src = open ? 'illust/door.webp' : 'illust/door_closed.webp'; img.width = 1200; img.height = 900; img.decoding = 'async';
    img.alt = open ? '圓拱木門半開著，門外是藍天、海和開滿花的小島' : '圓拱木門關著';
    const arch = el('div', 'sp-door-arch' + (open ? '' : ' closed')); arch.append(img);
    wrap.append(arch); wrap.dataset.open = open ? '1' : '0';
    if (!open) wrap.append(el('p', 'sp-cap', '門關著。'));
    else {
      const allowed = !inFrame || query.get('islandDoor') === '1';
      const go = el('button', 'sp-go', '出門到島上'); go.type = 'button'; go.disabled = !allowed; go.dataset.act = 'island';
      go.addEventListener('click', () => {
        if (inFrame) { parent.postMessage({ type: 'larch:complete', result: 'go_island', payload: { from: 'studio_door' } }, '*'); return; }
        const url = new URL('../map2d/side/web/island.html', location.href);
        for (const key of ['mock', 'debug']) if (query.has(key)) url.searchParams.set(key, query.get(key));
        url.searchParams.set('chapter', g.chapter); url.searchParams.set('day', g.day);
        url.searchParams.set('visit', '1');
        location.href = url.href;
      });
      wrap.append(go); if (!allowed) wrap.append(el('p', 'sp-cap', '現在先留在工作室。'));
    }
    panelBody.append(wrap);
  }

  // ── 電子琴（6）：一個八度加高音 Do，滑鼠、觸控或鍵盤 A S D F G H J K（黑鍵 W E T Y U）──
  const C4 = 261.63, NOTE = n => C4 * Math.pow(2, n / 12);
  const WHITE = [[0, 'Do', 'a'], [2, 'Re', 's'], [4, 'Mi', 'd'], [5, 'Fa', 'f'], [7, 'Sol', 'g'], [9, 'La', 'h'], [11, 'Si', 'j'], [12, 'Do', 'k']];
  const BLACK = [[1, 0, 'w'], [3, 1, 'e'], [6, 3, 't'], [8, 4, 'y'], [10, 5, 'u']];   // 半音、在第幾個白鍵右邊、鍵盤鍵
  let keyHandler = null;
  function bindKeys(map) {
    if (keyHandler) removeEventListener('keydown', keyHandler, true);
    keyHandler = e => { if (!panel.classList.contains('on') || !map.wrap.isConnected) { removeEventListener('keydown', keyHandler, true); keyHandler = null; return; } if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return; const hit = map.keys[e.key.toLowerCase()]; if (hit) { e.preventDefault(); e.stopPropagation(); hit(); } };
    addEventListener('keydown', keyHandler, true);
  }
  function openPiano(focus) {
    openPanel('電子琴', focus, 'piano');
    const wrap = el('div', 'sp-keys'); const keys = {};
    WHITE.forEach(([n, name, k]) => { const b = el('button', 'sp-key', name); b.type = 'button'; b.dataset.note = String(n); b.setAttribute('aria-label', name + '（鍵盤 ' + k.toUpperCase() + '）'); const hit = () => press(b, NOTE(n), 'key'); b.addEventListener('pointerdown', e => { e.preventDefault(); hit(); }); b.addEventListener('click', e => { if (e.detail === 0) hit(); }); keys[k] = hit; wrap.append(b); });
    BLACK.forEach(([n, after, k]) => { const b = el('button', 'sp-key black', k.toUpperCase()); b.type = 'button'; b.dataset.note = String(n); b.style.left = ((after + 1) * 12.5 - 4) + '%'; b.setAttribute('aria-label', '黑鍵（鍵盤 ' + k.toUpperCase() + '）'); const hit = () => press(b, NOTE(n), 'key'); b.addEventListener('pointerdown', e => { e.preventDefault(); hit(); }); b.addEventListener('click', e => { if (e.detail === 0) hit(); }); keys[k] = hit; wrap.append(b); });
    const instrument = el('div', 'sp-piano-case');
    const deck = el('div', 'sp-piano-deck');
    deck.append(el('span'), el('span', 'sp-piano-lamp'), el('span'));
    deck.setAttribute('aria-hidden', 'true');
    instrument.append(deck, wrap);
    panelBody.append(instrument, el('p', 'sp-cap', '白鍵：A S D F G H J K。黑鍵：W E T Y U。')); bindKeys({ wrap, keys });
  }

  // ── 吉他（7）：作者 2026-11-21 第二版：弦是直的（左低音 Mi → 右高音 Mi），四排鍵是第 1～4 格：
  //   1 2 3 4 5 6 ＝第 1 格、Q W E R T Y ＝第 2 格、A S D F G H ＝第 3 格、Z X C V B N ＝第 4 格。
  //   按鍵只壓弦，空白鍵刷弦。滑鼠與手機可點格子、琴枕的 × 或和弦卡。
  const STRINGS = [0, 1, 2, 3, 4, 5];
  const FRET_ROWS = ['123456', 'qwerty', 'asdfgh', 'zxcvbn'];
  let closeGuitar;
  function openGuitar(focus) {
    closeGuitar?.();
    openPanel('吉他', focus, 'guitar');
    const layout = el('div', 'sp-guitar-layout');
    const wrap = el('section', 'sp-guitar');
    wrap.setAttribute('aria-label', '指板與和弦');
    const neck = el('div', 'sp-neck');
    const keyHeld = STRINGS.map(() => new Set());
    const tapHeld = STRINGS.map(() => 0);
    // null 跟著指法，true 悶弦，false 打開指法原本悶掉的弦。
    const muteOverrides = STRINGS.map(() => null);
    const lines = [], cells = [], muteButtons = [], pickButtons = [];
    const cards = new Map();
    const automaticNotes = new Set();
    const flashes = new Set();
    const automaticFlashes = new Set();
    const feedback = el('output', 'sp-chord-feedback');
    const capoInput = document.createElement('input');
    capoInput.type = 'range'; capoInput.min = '0'; capoInput.max = '7'; capoInput.value = '0';
    const capoValue = el('output', '', '0');
    let capo = 0;
    function setCapo(value) {
      capo = value;
      capoInput.value = String(value);
      capoValue.textContent = value ? 'Capo ' + value : '0';
      renderName();
    }
    const capoLabel = el('label', 'sp-guitar-capo');
    capoLabel.append(el('span', '', '移調夾'), capoInput, capoValue);
    capoInput.addEventListener('input', () => setCapo(Number(capoInput.value)));

    let held, shape, muted, selected, feedbackTimer, lastStrum;
    function renderName() {
      if (lastStrum === undefined) return;
      feedback.textContent = lastStrum ? lastStrum + (capo ? '（Capo ' + capo + '）' : '') : '—';
    }
    function refresh() {
      held = tapHeld.map((fret, i) => Math.max(fret, ...keyHeld[i]));
      const fits = frets => held.every((fret, i) => frets[i] === 'x'
        ? muteOverrides[i] !== false
        : fret === Number(frets[i]) && muteOverrides[i] !== true);
      // 同樣的按格方式也可能有不同低音，例如 C 與 C/E。
      // 選卡時保留玩家的指法。打開原本悶掉的弦之後，以實際發聲的弦來比。
      shape = selected && fits(CHORDS[selected]) ? selected :
        Object.keys(CHORDS).find(name => fits(CHORDS[name]));
      muted = muteOverrides.map((override, i) => override ?? (CHORDS[shape]?.[i] === 'x'));
      muteButtons.forEach((button, i) => {
        button.setAttribute('aria-pressed', String(muted[i]));
        lines[i].classList.toggle('muted', muted[i]);
        pickButtons[i].disabled = muted[i];
      });
      cells.forEach((row, f) => row.forEach((cell, i) => {
        const on = held[i] === f + 1;
        cell.classList.toggle('on', on);
        if (!on) cell.classList.remove('down');
        cell.setAttribute('aria-pressed', String(on));
      }));
      for (const [name, card] of cards) card.setAttribute('aria-pressed', String(shape === name));
    }
    function ring(string, delay = 0, automatic = false) {
      if (muted[string]) return false;
      const fret = held[string];
      const source = tone(guitarFrequency(string, fret, capo), 'pluck', delay / 1000);
      if (automatic && source) {
        automaticNotes.add(source);
        source.onended = () => automaticNotes.delete(source);
      }
      const line = lines[string];
      const timer = setTimeout(() => {
        flashes.delete(timer);
        automaticFlashes.delete(timer);
        const dot = held[string] === fret && cells[fret - 1]?.[string];
        line.classList.remove('down');
        if (dot) dot.classList.remove('down');
        void line.offsetWidth;
        line.classList.add('down');
        if (dot) dot.classList.add('down');
      }, delay);
      flashes.add(timer);
      if (automatic) automaticFlashes.add(timer);
      return true;
    }
    function brush(strings, automatic) {
      let delay = 0;
      for (const string of strings) if (ring(string, delay, automatic)) delay += 22;
      return delay > 0;
    }
    function showStrum() {
      lastStrum = shape || '';
      renderName();
      feedback.classList.add('on');
      clearTimeout(feedbackTimer);
      feedbackTimer = setTimeout(() => feedback.classList.remove('on'), 1200);
    }
    function strum() {
      if (!brush(STRINGS, false)) return;
      showStrum();
      if (shape) window.STUDIO_FEATURES?.completeFreeInteraction('shi');
      practice.strum(shape);
    }
    function applyShape(name) {
      selected = name;
      Array.from(CHORDS[name]).forEach((fret, i) => {
        tapHeld[i] = fret === 'x' ? 0 : Number(fret);
        muteOverrides[i] = fret === 'x' ? true : null;
      });
      refresh();
    }
    function playChord(name, stroke) {
      for (const frets of keyHeld) frets.clear();
      applyShape(name);
      if (stroke === 'down') brush(STRINGS, true);
      else if (stroke === 'up') brush([...STRINGS].reverse(), true);
      else ring({ p: muted.indexOf(false), i: 3, m: 4, a: 5 }[stroke], 0, true);
      showStrum();
    }
    function stopNotes() {
      for (const source of automaticNotes) source.stop();
      automaticNotes.clear();
      for (const timer of automaticFlashes) {
        clearTimeout(timer);
        flashes.delete(timer);
      }
      automaticFlashes.clear();
    }
    const button = (className, label, action) => {
      const node = el('button', className, label);
      node.type = 'button';
      node.addEventListener('click', action);
      return node;
    };

    const strings = el('div', 'sp-vstrings');
    const grid = el('div', 'sp-frets');
    const picks = el('div', 'sp-picks');
    STRINGS.forEach(i => {
      const string = String(i + 1);
      const label = '第 ' + (6 - i) + ' 弦';
      const line = el('span', 'sp-vstring');
      line.dataset.string = string;
      line.style.setProperty('--w', (4.4 - i * 0.55) + 'px');
      lines.push(line);
      strings.append(line);

      const mute = button('sp-mute', label + '悶弦', () => {
        muteOverrides[i] = muted[i] ? (CHORDS[shape]?.[i] === 'x' ? false : null) : true;
        refresh();
      });
      mute.dataset.string = string;
      muteButtons.push(mute);
      grid.append(mute);

      const pick = button('sp-pick-string', '撥第 ' + (6 - i) + ' 弦', () => ring(i));
      pick.dataset.string = string;
      pickButtons.push(pick);
      picks.append(pick);
    });
    for (const [row, keys] of FRET_ROWS.entries()) {
      const f = row + 1;
      cells.push(STRINGS.map(i => {
        const k = keys[i].toUpperCase();
        const cell = el('button', 'sp-fret');
        cell.type = 'button';
        const fret = () => { tapHeld[i] = tapHeld[i] === f ? 0 : f; refresh(); };
        let touch = false;
        cell.addEventListener('pointerdown', e => {
          touch = e.pointerType === 'touch';
          if (touch || e.button > 0) return;
          e.preventDefault();
          fret();
        });
        cell.addEventListener('click', e => {
          if (touch || e.detail === 0) fret();
          touch = false;
        });
        cell.dataset.fret = String(f);
        cell.dataset.string = String(i + 1);
        cell.setAttribute('aria-label', '第 ' + (6 - i) + ' 弦第 ' + f + ' 格（鍵盤 ' + k + '）');
        cell.append(el('span', 'sp-k', k));
        grid.append(cell);
        return cell;
      }));
    }
    neck.append(strings, grid);
    const tools = el('div', 'sp-gtools');
    tools.append(
      button('sp-strum', '刷弦（空白鍵）', strum),
      button('sp-clear', '放開', () => {
        selected = null;
        tapHeld.fill(0);
        muteOverrides.fill(null);
        refresh();
      }),
      feedback,
    );
    const chords = el('div', 'sp-chords');
    chords.setAttribute('aria-label', '和弦指法');
    for (const [label, shapes] of CHORD_GROUPS) {
      const row = el('div', 'sp-chord-group');
      row.append(el('h3', '', label));
      const list = el('div', 'sp-chord-list');
      for (const [name, frets] of Object.entries(shapes)) {
        const card = button('sp-chord', '', () => {
          applyShape(name);
          arranger.chooseChord(name);
        });
        card.dataset.chord = name;
        card.draggable = true;
        card.addEventListener('dragstart', event => {
          event.dataTransfer.effectAllowed = 'copy';
          event.dataTransfer.setData('application/x-studio-guitar-chord', name);
        });
        card.setAttribute('aria-label', name + ' 和弦指法 ' + frets);
        card.append(el('b', '', name), el('kbd', '', frets));
        list.append(card);
        cards.set(name, card);
      }
      row.append(list);
      chords.append(row);
    }
    const practice = makeGuitarPractice({
      el, button, applyShape, setCapo, cards, playChord, stopNotes,
      beforePlay: () => { arranger.stop(); audio(); },
    });
    const arranger = makeGuitarArranger({
      el, button, playChord, stopNotes, storage: window.StudioDB,
      beforePlay: () => { practice.stop(); audio(); },
    });
    wrap.append(picks, neck, capoLabel, tools, practice.hint, chords,
      el('p', 'sp-cap', '點格子壓弦，點指板上方的撥片試音，點琴枕可悶弦。也能按住格上的鍵，再按空白鍵刷弦。'));
    layout.append(wrap, practice.panel, arranger.panel);
    panelBody.append(layout);
    refresh();

    const bindings = new Map(FRET_ROWS.flatMap((row, fret) =>
      Array.from(row, (key, string) => [key, [string, fret + 1]])));
    const events = new AbortController();
    const options = { capture: true, signal: events.signal };
    addEventListener('keydown', e => {
      if (e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, select, textarea')) return;
      const k = e.key.toLowerCase();
      if (k === ' ') {
        // 空白鍵仍可操作鍵盤焦點所在的按鈕。滑鼠選卡後可直接用空白鍵刷。
        if (e.target.matches?.('.sp-mute, button:focus-visible:not(#panel-close, .sp-strum)')) return;
        e.preventDefault(); e.stopPropagation(); if (!e.repeat) strum();
        return;
      }
      const hit = bindings.get(k);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      keyHeld[hit[0]].add(hit[1]);
      refresh();
    }, options);
    addEventListener('keyup', e => {
      const hit = bindings.get(e.key.toLowerCase());
      if (!hit) return;
      keyHeld[hit[0]].delete(hit[1]);
      refresh();
    }, options);
    addEventListener('blur', () => {
      for (const frets of keyHeld) frets.clear();
      refresh();
    }, { signal: events.signal });
    const observer = new MutationObserver(() => {
      if (!panel.classList.contains('on') || !layout.isConnected) closeGuitar();
    });
    observer.observe(panel, { attributes: true, attributeFilter: ['class'] });
    observer.observe(panelBody, { childList: true });
    closeGuitar = () => {
      events.abort();
      observer.disconnect();
      clearTimeout(feedbackTimer);
      for (const timer of flashes) clearTimeout(timer);
      practice.dispose();
      arranger.dispose();
      closeGuitar = null;
    };
  }

  const OPEN = { 10: openClock, 11: openDoor, 6: openPiano, 7: openGuitar };
  function hook() {
    const features = window.STUDIO_FEATURES;
    if (!features || features.__points) return !!features;
    const handle = features.handle; features.__points = true;
    features.handle = function (id, focus) { if (OPEN[id]) { OPEN[id](focus); return true; } return handle.call(features, id, focus); };
    return true;
  }
  window.STUDIO_POINTS = { ids: Object.keys(OPEN).map(Number), played, open: (id, focus) => { if (!OPEN[id]) return false; OPEN[id](focus || document.body); return true; } };
  (async function () { for (let i = 0; i < 60 && !hook(); i += 1) await new Promise(r => setTimeout(r, 50)); })();
}
