/* 第六章生日歌 MV。資料 MV 由 build_birthday_mv.py 注入（分鏡、歌詞時間）。畫面邏輯照《餘燼》site/mv.js：
   一鏡一張、兩層交叉淡化、每鏡自己的推鏡方向；歌詞一次一句、兩層交替淡入；留白那一鏡不上字。
   本作另加：每鏡有重點位置 focus（手機直式只看得到中間一條，裁切與推鏡都以這點為準）與基本放大 zoom；
   音檔是整首（唱完最後一句「明年　我再唱給妳聽」、吉他收尾）；聲音一停，推鏡跟著停住，畫面停在詩、字幕停在最後一句 hold 秒，再淡出 fade 秒，送 larch:complete。
   Larch 協定：載入送 larch:ready → 收 larch:init（只存起來）→ 播完送 larch:complete（result MV.result）。
   父層是 Larch 的小遊戲卡（沙盒 iframe），來源會是 'null'，所以一律用 '*' 送。
   網址參數：embed=1（嵌進遊戲：沒有任何連結，右下「略過」）。測試用狀態放在 window.__mv。 */
(function () {
  const Q = new URLSearchParams(location.search);
  const EMBED = Q.get('embed') === '1';
  const reduced = matchMedia('(prefers-reduced-motion:reduce)').matches || Q.get('still') === '1';
  const $ = id => document.getElementById(id);
  if (EMBED) document.body.classList.add('embed');
  if (reduced) document.body.classList.add('reduce');

  const LARCH = { inited: false, v: {} };
  const post = m => { try { if (window.parent !== window) parent.postMessage(m, '*'); else window.postMessage(m, '*'); } catch (_) {} };
  addEventListener('message', e => { const d = e.data || {}; if (d.type === 'larch:init') { LARCH.inited = true; LARCH.v = d.variables || {}; state.inited = true; } });
  const state = window.__mv = { phase: 'intro', inited: false, shot: -1, line: -1, shots: [], lines: [], completes: 0, started: 0 };
  post({ type: 'larch:ready' });

  const au = new Audio(); au.preload = 'auto'; au.src = MV.audio;
  Object.defineProperty(state, 'au', { value: au, enumerable: false });   // 測試用：框模式下跳到尾段
  MV.shots.forEach(s => { const im = new Image(); im.src = s.img; });

  /* ── 畫面：一鏡一張，交叉淡化，推鏡方向照分鏡表；以 focus 為中心縮放 ── */
  const MOVES = {
    in: [[0, 1.0], [0, 1.1]], out: [[0, 1.1], [0, 1.0]],
    left: [[2.5, 1.07], [-2.5, 1.07]], right: [[-2.5, 1.07], [2.5, 1.07]],
  };
  const tf = (s, k) => { const [x, z] = MOVES[s.move][k]; return `translateX(${x}%) scale(${(z * s.zoom).toFixed(3)})`; };
  let shot = -1, front = 'fA';
  function showShot(i, t) {
    if (i === shot) return; shot = i;
    const s = MV.shots[i], nxt = front === 'fA' ? 'fB' : 'fA', n = $(nxt), f = $(front);
    n.style.backgroundImage = `url("${s.img}")`;
    n.style.backgroundPosition = `${s.focus[0]}% ${s.focus[1]}%`;
    n.style.transformOrigin = `${s.focus[0]}% ${s.focus[1]}%`;
    n.getAnimations().forEach(a => a.cancel());
    const last = i === MV.shots.length - 1;
    const len = (s.t1 - s.t0 + (last ? MV.hold + MV.fade : 2)) * 1000;   // 最後一鏡推得慢，聲音停時凍結在半路
    if (!reduced) n.animate([{ transform: tf(s, 0) }, { transform: tf(s, 1) }], { duration: len, easing: 'linear', fill: 'forwards' });
    else n.style.transform = `scale(${(1.02 * s.zoom).toFixed(3)})`;
    n.classList.add('on'); f.classList.remove('on'); front = nxt;
    document.body.dataset.shot = s.cg;
    state.shot = i; state.shots.push({ i, cg: s.cg, t: +t.toFixed(3) });
  }
  /* ── 歌詞：一次一句，兩層交替淡入；留白那一鏡不上字 ── */
  let lyr = -2, lfront = 'lA';
  function showLine(text) {
    const nxt = lfront === 'lA' ? 'lB' : 'lA';
    $(lfront).classList.remove('on');
    if (text) { $(nxt).textContent = text; $(nxt).classList.add('on'); lfront = nxt; }
  }
  function frame() {
    const t = state.phase === 'play' ? au.currentTime : MV.dur;
    let i = 0; while (i + 1 < MV.shots.length && MV.shots[i + 1].t0 <= t) i++;
    showShot(i, t);
    let k = -1; while (k + 1 < MV.lines.length && MV.lines[k + 1].t <= t) k++;
    const key = MV.shots[i].blank ? -1 : k;
    if (key !== lyr) {
      lyr = key; showLine(key >= 0 ? MV.lines[key].text : '');
      document.body.dataset.line = key; state.line = key;
      if (key >= 0) state.lines.push({ k: key, t: +t.toFixed(3), text: MV.lines[key].text });
    }
  }
  function tick() { if (state.phase === 'play') frame(); requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
  showShot(0, 0);

  /* ── 播放、略過、結束 ── */
  let endTimer = 0;
  function finish(how) {
    if (state.phase === 'done') return;
    state.phase = 'done'; state.completes++; state.how = how; state.tDone = performance.now();
    $('skip').hidden = true;
    window.__done = { result: MV.result, payload: {} };
    post({ type: 'larch:complete', result: MV.result, payload: {} });
    if (!EMBED) $('again').hidden = false;
  }
  function stopAndHold() {   // 聲音停了：推鏡停住，畫面停在詩，字幕留著，hold 秒後淡出
    if (state.phase !== 'play') return;
    state.phase = 'hold'; state.stoppedAt = +au.currentTime.toFixed(3); state.tStop = performance.now();
    frame();
    document.getAnimations().forEach(a => { if (a.effect && a.effect.target && a.effect.target.closest && a.effect.target.closest('.film')) a.pause(); });
    endTimer = setTimeout(() => {
      state.phase = 'fade'; $('black').classList.add('on');
      endTimer = setTimeout(() => finish('ended'), MV.fade * 1000);
    }, MV.hold * 1000);
  }
  $('go').onclick = () => {
    au.currentTime = 0;
    au.play().then(() => {
      state.phase = 'play'; state.started++;
      $('intro').classList.add('gone');
      if (EMBED) $('skip').hidden = false;
    }).catch(() => { $('msg').textContent = '聲音載入不了，請再按一次'; });
  };
  $('skip').onclick = () => { au.pause(); clearTimeout(endTimer); state.phase = 'fade'; $('black').classList.add('on'); setTimeout(() => finish('skip'), 600); };
  $('again').onclick = () => {
    $('again').hidden = true; $('black').classList.remove('on'); state.shots = []; state.lines = [];
    shot = -1; lyr = -2; showLine(''); showShot(0, 0); au.currentTime = 0;
    au.play().then(() => { state.phase = 'play'; state.started++; });
  };
  au.onended = stopAndHold;
  addEventListener('keydown', e => {
    if (e.code === 'Space' || e.key === 'Enter') { e.preventDefault(); if (state.phase === 'intro') $('go').click(); }
    else if (['Backspace', 'BrowserBack'].includes(e.key) || (e.altKey && e.key.startsWith('Arrow'))) e.preventDefault();   // 按鍵不能把畫面帶離這頁
  });
})();
