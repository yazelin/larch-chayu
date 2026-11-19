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
.sp-door svg{width:min(190px,48vw);height:auto}
.sp-go{appearance:none;border:2px solid #8b6a45;border-radius:999px;background:#f6e2b8;color:#4a3a30;font:inherit;font-weight:700;padding:8px 22px;cursor:pointer}
.sp-go:disabled{opacity:.55;cursor:default}
.sp-keys{position:relative;display:flex;justify-content:center;margin:8px auto 4px;width:min(400px,100%);height:150px;user-select:none;touch-action:none}
.sp-key{position:relative;flex:1 1 0;border:2px solid #6d5a4b;border-left-width:1px;border-right-width:1px;border-radius:0 0 7px 7px;background:linear-gradient(#fffdf8,#f1e7d6);cursor:pointer;padding:0;font:600 11px/1 inherit;color:#9a8478;display:flex;align-items:flex-end;justify-content:center;padding-bottom:7px}
.sp-key.black{position:absolute;top:0;z-index:2;width:8%;height:60%;flex:none;border-radius:0 0 5px 5px;background:linear-gradient(#5a4a40,#2f2622);color:#d8c9b6;border-color:#2f2622}
.sp-key.down{background:#f3cf8c}.sp-key.black.down{background:#8b6a45}
.sp-strings{display:flex;flex-direction:column;gap:13px;margin:10px auto 4px;width:min(400px,100%);padding:16px 14px;border-radius:14px;background:linear-gradient(90deg,#b98a56,#d8ab73 55%,#b98a56);box-sizing:border-box;touch-action:none}
.sp-string{appearance:none;display:block;width:100%;height:16px;padding:0;border:0;background:linear-gradient(transparent 6px,#f4ead7 6px,#f4ead7 calc(6px + var(--w,2px)),transparent calc(6px + var(--w,2px)));cursor:pointer}
.sp-string.down{animation:sp-pluck .28s ease-out}
@keyframes sp-pluck{0%{transform:translateY(3px)}35%{transform:translateY(-3px)}70%{transform:translateY(1.5px)}100%{transform:none}}`;
  document.head.appendChild(style);

  function openPanel(title, focus) {
    if (window.__studio && window.__studio.panel) window.__studio.panel(true, focus);
    panelTitle.textContent = title; panelBody.replaceChildren(); panel.classList.add('on'); panel.setAttribute('aria-hidden', 'false'); scrim.classList.add('on');
    panel.dataset.point = title; document.getElementById('panel-close').focus({ preventScroll: true });
  }

  // ── 聲音：電子琴與吉他都用瀏覽器合成，不另外帶音檔 ──
  let ctx = null;
  function audio() { if (!ctx) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ctx = new C(); } if (ctx.state === 'suspended') ctx.resume(); return ctx; }
  const played = [];   // 給測試看：彈過哪些音
  function tone(freq, kind) {
    played.push(Math.round(freq * 10) / 10); const a = audio(); if (!a) return;
    const t = a.currentTime, gain = a.createGain(); gain.connect(a.destination);
    if (kind === 'pluck') {
      const o = a.createOscillator(); o.type = 'triangle'; o.frequency.value = freq; const o2 = a.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 2;
      const g2 = a.createGain(); g2.gain.value = 0.25; o.connect(gain); o2.connect(g2); g2.connect(gain);
      gain.gain.setValueAtTime(0.0001, t); gain.gain.exponentialRampToValueAtTime(0.32, t + 0.008); gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      o.start(t); o2.start(t); o.stop(t + 1.6); o2.stop(t + 1.6);
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
    openPanel('圓鐘', focus);
    const wrap = el('div', 'sp-clock'); const s = svg('svg', { viewBox: '0 0 200 200', role: 'img', 'aria-label': '牆上的圓鐘' });
    s.append(svg('circle', { cx: 100, cy: 100, r: 94, fill: '#8b6a45' }), svg('circle', { cx: 100, cy: 100, r: 84, fill: '#fffaf0', stroke: '#d8c3a8', 'stroke-width': 3 }));
    for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, big = i % 3 === 0; s.append(svg('line', { x1: 100 + Math.sin(a) * (big ? 66 : 71), y1: 100 - Math.cos(a) * (big ? 66 : 71), x2: 100 + Math.sin(a) * 77, y2: 100 - Math.cos(a) * 77, stroke: '#6d5a4b', 'stroke-width': big ? 4 : 2, 'stroke-linecap': 'round' })); }
    const hour = svg('line', { x1: 100, y1: 100, x2: 100, y2: 56, stroke: '#4a3a30', 'stroke-width': 6, 'stroke-linecap': 'round' }), minute = svg('line', { x1: 100, y1: 100, x2: 100, y2: 34, stroke: '#4a3a30', 'stroke-width': 4, 'stroke-linecap': 'round' });
    s.append(hour, minute, svg('circle', { cx: 100, cy: 100, r: 6, fill: '#8b6a45' }));
    const tick = () => { const d = new Date(Date.now() + 15 * 3600 * 1000), m = d.getMinutes() + d.getSeconds() / 60, h = d.getHours() % 12 + m / 60; hour.setAttribute('transform', `rotate(${h * 30} 100 100)`); minute.setAttribute('transform', `rotate(${m * 6} 100 100)`); wrap.dataset.hour = String(Math.floor(h)); };
    tick(); const timer = setInterval(() => { if (!wrap.isConnected) { clearInterval(timer); return; } tick(); }, 1000);
    const day = Number(game().day) || 1, left = day <= TRIAL_LAST_DAY ? TRIAL_LAST_DAY + 1 - day : null;
    const win = el('div', 'sp-window' + (left === null ? ' blank' : ''), left === null ? '－－' : String(left)); win.dataset.left = left === null ? '' : String(left); win.setAttribute('aria-label', left === null ? '數字小窗是空的' : '數字小窗：' + left);
    wrap.append(s, win, el('p', 'sp-cap', '第 ' + day + ' 天')); panelBody.append(wrap);
  }

  // ── 圓拱門（11）：第三章以後可以出門上島。嵌在 Larch 裡時，要白板那張卡有接「出門」的下一張卡才開放（網址帶 islandDoor=1），不然按了會把劇情卡結束掉 ──
  const inFrame = window.parent !== window;
  function openDoor(focus) {
    openPanel('圓拱門', focus);
    const g = game(), chapter = g.chapter === 'true' ? 99 : Number(g.chapter) || 1, open = chapter >= 3;
    const wrap = el('div', 'sp-door'); const s = svg('svg', { viewBox: '0 0 160 190', role: 'img', 'aria-label': open ? '圓拱木門，門縫透著外面的光' : '圓拱木門，關著' });
    s.append(svg('path', { d: 'M12 188V84a68 68 0 0 1 136 0v104z', fill: '#d8c3a8' }), svg('path', { d: 'M24 188V86a56 56 0 0 1 112 0v102z', fill: open ? '#fff3c9' : '#a9764a' }));
    if (open) s.append(svg('path', { d: 'M24 188V86a56 56 0 0 1 56-56v158z', fill: '#a9764a' }), svg('path', { d: 'M92 188V120q22-26 44-6v74z', fill: '#bfe3c0' }), svg('path', { d: 'M80 30a56 56 0 0 1 56 56v40q-24-18-44 0V96z', fill: '#bfe0f2' }));
    else for (const x of [52, 80, 108]) s.append(svg('line', { x1: x, y1: x === 80 ? 30 : 42, x2: x, y2: 188, stroke: '#8b6a45', 'stroke-width': 2 }));
    s.append(svg('circle', { cx: open ? 70 : 122, cy: 122, r: 5, fill: '#e2b23c', stroke: '#8b6a45', 'stroke-width': 1.5 }));
    wrap.append(s); wrap.dataset.open = open ? '1' : '0';
    if (!open) wrap.append(el('p', 'sp-cap', '門關著。'));
    else {
      const allowed = !inFrame || query.get('islandDoor') === '1';
      const go = el('button', 'sp-go', '出門到島上'); go.type = 'button'; go.disabled = !allowed; go.dataset.act = 'island';
      go.addEventListener('click', () => {
        if (inFrame) { parent.postMessage({ type: 'larch:complete', result: 'go_island', payload: { from: 'studio_door' } }, '*'); return; }
        location.href = '../map2d/side/web/island.html' + (query.get('mock') ? '?mock=1' : '');
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
    openPanel('電子琴', focus);
    const wrap = el('div', 'sp-keys'); const keys = {};
    WHITE.forEach(([n, name, k]) => { const b = el('button', 'sp-key', name); b.type = 'button'; b.dataset.note = String(n); b.setAttribute('aria-label', name + '（鍵盤 ' + k.toUpperCase() + '）'); const hit = () => press(b, NOTE(n), 'key'); b.addEventListener('pointerdown', e => { e.preventDefault(); hit(); }); keys[k] = hit; wrap.append(b); });
    BLACK.forEach(([n, after, k]) => { const b = el('button', 'sp-key black'); b.type = 'button'; b.dataset.note = String(n); b.style.left = ((after + 1) * 12.5 - 4) + '%'; b.setAttribute('aria-label', '黑鍵（鍵盤 ' + k.toUpperCase() + '）'); const hit = () => press(b, NOTE(n), 'key'); b.addEventListener('pointerdown', e => { e.preventDefault(); hit(); }); keys[k] = hit; wrap.append(b); });
    panelBody.append(wrap, el('p', 'sp-cap', '點琴鍵，或按鍵盤 A S D F G H J K。')); bindKeys({ wrap, keys });
  }

  // ── 吉他（7）：六條空弦（Mi La Re Sol Si Mi），點或滑過去就撥；鍵盤 1～6 ──
  const STRINGS = [82.41, 110, 146.83, 196, 246.94, 329.63];
  function openGuitar(focus) {
    openPanel('吉他', focus);
    const wrap = el('div', 'sp-strings'); const keys = {}; let dragging = false;
    STRINGS.forEach((f, i) => { const b = el('button', 'sp-string'); b.type = 'button'; b.dataset.string = String(i + 1); b.style.setProperty('--w', (4.2 - i * 0.5) + 'px'); b.setAttribute('aria-label', '第 ' + (6 - i) + ' 弦（鍵盤 ' + (i + 1) + '）'); const hit = () => press(b, f, 'pluck'); b.addEventListener('pointerdown', e => { e.preventDefault(); dragging = true; hit(); }); b.addEventListener('pointerenter', () => { if (dragging) hit(); }); keys[String(i + 1)] = hit; wrap.append(b); });
    addEventListener('pointerup', () => { dragging = false; }); wrap.addEventListener('pointerdown', e => { if (e.target.releasePointerCapture) try { e.target.releasePointerCapture(e.pointerId); } catch (_) {} });
    panelBody.append(wrap, el('p', 'sp-cap', '點弦或按住滑過去；鍵盤 1 到 6。')); bindKeys({ wrap, keys });
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
