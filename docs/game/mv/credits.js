/* 片尾網頁。資料 CREDITS 在 credits.html 的 credits-data 區塊（credits_data.py 寫進來的）。
   一長條內容（片名 → 名單與花絮圖交錯 → 製作數字 → 結語）往上捲；配樂每走一秒畫面就捲一段（整首播完剛好捲到底），
   所以音樂卡住畫面就跟著停，換配樂也不用改捲動速度。捲到結語停在畫面中間，停 hold 秒、淡出 fade 秒，送 larch:complete。
   可以自己拉（照作者的「片尾字卷」插件）：滾輪（deltaY×0.7）、按住拖曳或手指上下滑（位移×1.1）直接改畫面位置，有上下界；
   拖的時候自動捲暫停，放開後從那個位置繼續。拉動只改畫面，音樂照播不跳；往回拉可以回看。拉到底等同播完（音樂在停住與淡出時收掉）。
   往回拉過、音樂先播完時，畫面照原本的速度繼續捲到底。第一次看也可以拉，這不是「略過」鈕。
   Larch 協定：載入送 larch:ready → 收 larch:init（變數 creditsSeen 為真就一開始顯示「略過」）
   → 第一次播完先送 {type:'larch:set', name:'creditsSeen', value:true}（Larch 只收一次一個變數的格式）→ 再送 larch:complete。
   父層是 Larch 的小遊戲卡（沙盒 iframe），來源會是 'null'，所以一律用 '*' 送。
   網址參數：embed=1（嵌進遊戲：播完不出現「再看一次」）、fast=1（測試用：配樂十六倍速）、still=1（不做淡入）。
   測試用狀態放在 window.__credits。 */
(function () {
  const Q = new URLSearchParams(location.search);
  const EMBED = Q.get('embed') === '1';
  const FAST = Q.get('fast') === '1';
  const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches || Q.get('still') === '1';
  const $ = id => document.getElementById(id);
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; };
  const C = JSON.parse($('credits-data').textContent);
  if (EMBED) document.body.classList.add('embed');
  if (reduced) document.body.classList.add('reduce');

  // record=1：把「這一輪」那一段打開（作者還沒決定要不要，資料裡預設關）。直接開頁面預覽時，變數從網址帶：?record=1&ch7Route=ALL&plants=a,b,c
  const RECORD_ON = Q.get('record') === '1';
  const state = window.__credits = { phase: 'intro', inited: false, seen: false, started: 0, completes: 0, sets: [], progress: 0, y: 0, endY: 0, behindSeen: [], dragging: false, moved: 0 };
  const truthy = v => v === true || v === 1 || v === '1' || v === 'true';
  const post = m => { try { if (window.parent !== window) parent.postMessage(m, '*'); else window.postMessage(m, '*'); } catch (_) {} };
  addEventListener('message', e => {
    const d = e.data || {};
    if (d.type !== 'larch:init') return;
    state.inited = true;
    state.vars = d.variables || {};
    state.seen = truthy(state.vars[C.seen_var]);
    fillRecords();
    if (state.seen && state.phase !== 'done') $('skip').hidden = false;   // 看過了：從開場紙卡就能略過
  });
  post({ type: 'larch:ready' });

  /* ── 排內容 ── */
  const roll = $('roll');
  // 片名只在「．」後面換行，不把一個詞拆成兩行
  const titleInto = h => { C.title.split(/(?<=．)/).forEach(seg => h.append(el('span', 'seg', seg))); return h; };
  titleInto($('introTitle')); $('introSub').textContent = C.subtitle;
  const head = el('header', 'head'); head.append(titleInto(el('h1')), el('p', '', C.subtitle)); roll.append(head);
  // 「這一輪」：照玩家這一輪的變數排。資料裡 enabled 是 false、或變數都還沒有值時，整段不出現。
  const records = [];
  function recordLines(c) {
    const v = state.vars || {}, out = [];
    for (const it of c.items || []) {
      const raw = v[it.var];
      if (raw === undefined || raw === null || raw === '') continue;
      if (it.count) { const n = String(raw).split(',').filter(Boolean).length; out.push([it.label, n + ' ' + it.unit + (it.of ? '／' + it.of : '')]); }
      else if (it.map) { if (it.map[raw]) out.push([it.label, it.map[raw]]); }
      else if (it.number) { const n = Number(raw) || 0; if (n > 0) out.push([it.label, n + ' ' + it.unit]); }
      else out.push([it.label, String(raw)]);
    }
    return out;
  }
  function fillRecords() {
    for (const [s, c] of records) {
      const lines = c.enabled || RECORD_ON ? recordLines(c) : [];
      s.hidden = !lines.length; s.querySelectorAll('.row').forEach(n => n.remove());
      for (const [a, b] of lines) s.append(row(a, b));
    }
    measure(); place(state.progress);
  }
  function row(a, b) { const p = el('p', 'row'); p.append(el('span', 'k', a), el('span', 'v', b)); return p; }
  function section(c) {
    const s = el('section', 'sec'); s.dataset.kind = c.kind || 'names'; s.append(el('h2', '', c.role));
    if (c.kind === 'cast') {
      const ul = el('ul', 'cast');
      for (const person of c.people) {
        const li = el('li', person.avatar ? '' : 'plain');
        if (person.avatar) { const im = new Image(); im.alt = ''; im.src = person.avatar; li.append(im); }
        const t = el('div'); t.append(el('b', '', person.name)); if (person.line) t.append(el('span', '', person.line)); li.append(t); ul.append(li);
      }
      s.append(ul);
    } else if (c.kind === 'rows') { for (const [a, b] of c.rows) s.append(row(a, b)); }
    else if (c.kind === 'record') { s.hidden = true; records.push([s, c]); }
    for (const name of c.names || []) {
      const p = el('p', 'name');
      if (name == null) { p.append(el('span', 'todo', '待填：' + (c.todo || c.role))); s.dataset.todo = '1'; } else p.textContent = name;
      s.append(p);
    }
    if (c.note) s.append(el('p', 'note', c.note));
    return s;
  }
  function numbers() {
    const s = el('section', 'sec'); s.append(el('h2', '', '這部作品裡有'));
    const ul = el('ul', 'nums');
    for (const n of C.numbers) {
      const li = el('li'); li.dataset.key = n.key; li.dataset.value = n.value;
      const b = el('b', '', Number(n.value).toLocaleString('en-US')); b.append(el('i', '', n.unit));
      li.append(b, el('span', '', n.label)); ul.append(li);
    }
    s.append(ul); return s;
  }
  const shots = [];
  function shot(b) {
    const f = el('figure', 'shot'); f.dataset.n = b.n;
    const pic = el('div', 'pic');
    const empty = () => { f.classList.add('empty'); pic.replaceChildren(el('b', '', String(b.n).padStart(2, '0')), el('small', '', '圖還沒放')); };
    if (b.exists) { const im = new Image(); im.alt = ''; im.onerror = empty; im.src = b.src; pic.append(im); } else empty();
    f.append(pic, el('figcaption', '', b.caption)); shots.push(f); return f;
  }
  // 名單一段、花絮兩張，交錯排；製作數字放在中間。段數不夠時剩下的花絮接在後面。
  const blocks = C.credits.map(section); { const at = C.credits.findIndex(c => c.role === '幕後'); blocks.splice(at < 0 ? Math.min(3, blocks.length) : at + 1, 0, numbers()); }   // 製作數字接在「幕後」後面
  const pairs = []; for (let i = 0; i < C.behind.length; i += 2) { const p = el('div', 'pair'); C.behind.slice(i, i + 2).forEach(b => p.append(shot(b))); pairs.push(p); }
  for (let i = 0; i < Math.max(blocks.length, pairs.length); i++) { if (pairs[i]) roll.append(pairs[i]); if (blocks[i]) roll.append(blocks[i]); }
  if (window.parent === window && RECORD_ON) { state.vars = Object.fromEntries(Q); }
  const tail = el('footer', 'tail'); tail.append(el('p', '', C.closing)); roll.append(tail);
  function measure() {   // 結語停在畫面正中間時 .roll 要往上移多少
    const t = tail.firstChild.getBoundingClientRect(), r = roll.getBoundingClientRect();
    state.endY = Math.max(0, t.top + t.height / 2 - r.top - innerHeight / 2);
  }

  /* ── 配樂與捲動 ── */
  const au = new Audio(); au.preload = 'auto'; au.src = C.music.src;
  Object.defineProperty(state, 'au', { value: au, enumerable: false });
  const total = () => C.scroll_seconds || au.duration || 0;   // 捲完要幾秒：沒指定就是整首配樂
  function place(p) {
    state.progress = p; state.y = state.endY * p;
    roll.style.transform = `translate3d(0,${-state.y.toFixed(1)}px,0)`;
    const vh = innerHeight;
    for (const f of shots) {   // 記下哪幾張花絮整張進過畫面（測試用）
      const n = +f.dataset.n; if (state.behindSeen.includes(n)) continue;
      const r = f.getBoundingClientRect(); if (r.top >= 0 && r.bottom <= vh) state.behindSeen.push(n);
    }
  }
  measure(); place(0); fillRecords();
  addEventListener('resize', () => { measure(); place(state.progress); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { measure(); place(state.progress); });

  let endTimer = 0, fadeFrom = 0, lastAudio = 0, lastTick = 0, dragY = null;
  function frame(now) {
    const dt = lastTick ? (now - lastTick) / 1000 : 0; lastTick = now;
    if (state.phase === 'play') {
      const d = total();
      // 這一格配樂走了幾秒；配樂播完之後（往回拉過才會遇到）照時鐘算，倍速照配樂的
      const step = au.ended ? dt * (au.playbackRate || 1) : Math.max(0, au.currentTime - lastAudio);
      lastAudio = au.currentTime;
      if (d && dragY === null) place(Math.min(1, state.progress + step / d));
      if (state.progress >= 1) stopAndHold();
    } else if ((state.phase === 'hold' || state.phase === 'fade') && !au.paused) {   // 指定的秒數比配樂短：收尾時把音量慢慢收掉
      const k = 1 - Math.min(1, (performance.now() - fadeFrom) / ((C.hold + C.fade) * 1000)); au.volume = Math.max(0, k);
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ── 播放、略過、結束 ── */
  function finish(how) {
    if (state.phase === 'done') return;
    state.phase = 'done'; state.completes++; state.how = how; state.tDone = performance.now();
    au.pause(); $('skip').hidden = true;
    if (!state.seen) {   // 第一次看完（或第一次就按到略過）：記下來，下次一開始就能略過
      const m = { type: 'larch:set', name: C.seen_var, value: true }; state.sets.push(m); post(m); state.seen = true;
    }
    window.__done = { result: C.result, payload: {} };
    post({ type: 'larch:complete', result: C.result, payload: {} });
    if (!EMBED) $('again').hidden = false;
  }
  function stopAndHold() {   // 捲到底：停在結語，hold 秒後淡出
    if (state.phase !== 'play') return;
    state.phase = 'hold'; state.tStop = fadeFrom = performance.now(); place(1);
    endTimer = setTimeout(() => {
      state.phase = 'fade'; $('black').classList.add('on');
      endTimer = setTimeout(() => finish('ended'), C.fade * 1000);
    }, C.hold * 1000);
  }
  /* ── 自己拉：滾輪、拖曳、手指滑 ── */
  const stage = document.querySelector('.stage');
  function nudge(px) {   // 往上捲 px（負的是往回）
    if (state.phase !== 'play' || !state.endY) return;
    const y = Math.max(0, Math.min(state.endY, state.y + px));
    state.moved += Math.abs(y - state.y);
    place(y / state.endY);
  }
  stage.addEventListener('wheel', e => nudge(e.deltaY * 0.7), { passive: true });
  stage.addEventListener('pointerdown', e => {
    if (state.phase !== 'play') return;
    dragY = e.clientY; state.dragging = true; stage.classList.add('drag');
    try { stage.setPointerCapture(e.pointerId); } catch (_) {}
  });
  stage.addEventListener('pointermove', e => { if (dragY === null) return; nudge((dragY - e.clientY) * 1.1); dragY = e.clientY; });
  const drop = () => { dragY = null; state.dragging = false; stage.classList.remove('drag'); };
  stage.addEventListener('pointerup', drop); stage.addEventListener('pointercancel', drop);

  function start() {
    au.currentTime = 0; au.volume = 1; lastAudio = 0; place(0); state.moved = 0;
    return au.play().then(() => {
      if (FAST) au.playbackRate = 16;
      state.phase = 'play'; state.started++;
      $('intro').classList.add('gone');
    });
  }
  $('go').onclick = () => { start().catch(() => { $('msg').textContent = '聲音載入不了，請再按一次'; }); };
  $('skip').onclick = () => {
    if (state.phase === 'done' || state.phase === 'skip') return;
    clearTimeout(endTimer); au.pause(); state.phase = 'skip';
    $('intro').classList.add('gone'); $('black').classList.add('on');
    setTimeout(() => finish('skip'), reduced ? 0 : 600);
  };
  $('again').onclick = () => {
    $('again').hidden = true; $('black').classList.remove('on'); state.behindSeen = []; place(0);
    start().then(() => { if (state.seen) $('skip').hidden = false; }).catch(() => { $('again').hidden = false; });
  };
  // 配樂播完：畫面已經到底就收尾；被往回拉過還沒到底的，frame() 會照原本的速度繼續捲
  au.onended = () => { if (state.progress >= 1) stopAndHold(); };
  addEventListener('keydown', e => {
    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); if (state.phase === 'intro') $('go').click(); }
    else if (['Backspace', 'BrowserBack'].includes(e.key) || (e.altKey && e.key.startsWith('Arrow'))) e.preventDefault();   // 按鍵不能把畫面帶離這頁
  });
})();
