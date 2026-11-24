// 詩的黑膠唱盤（作者 2026-11-21 選草圖 A，草圖在 mockup_album/）：唱片架（互動點 5，劇情裡聽過的歌）與耳機（16，詩做給妳的歌）共用。
// 唱片轉、唱臂隨進度、唱盤外一圈頻譜、歌詞逐句亮（點歌詞跳到那一句）、播放／暫停／上下首／拖進度／音量；減少動態時唱片不轉、頻譜不畫。
// 沒有歌詞的歌（作者 2026-11-21：請詩做的歌都沒有歌詞，唱片架也有五首器樂）：右欄換成「這首歌的小卡」，
// 引用框底下是跟著音樂跳的水彩五線譜（分析器或合成起伏，同一份 levels），再來是章節／做好日期、長度、已播百分比；減少動態時只畫一張靜止的。
// 播放時：工作室頁自己的配樂（網址 bgm=）由 studio_features.mjs 的 studioBgm 聽 <audio> 的 play／pause 自動淡出淡回（所以音檔元素要放在頁面裡）；
// 嵌在 Larch 時另送 larch:hud:music（pause:true／false），寫法照 新版/hud/src/_apps.js 的 holdBgm：停下 400 毫秒後還沒接著播才放回故事配樂。
import { ALBUM_TRACKS, HUD_SONG_ORDER, HEADPHONE_TRACKS } from './studio_album_data.mjs';
import { decodeHudSeen } from './hud_seen.mjs';
import { HUD_SEEN_KEYS } from './hud_seen_keys.mjs';

export { ALBUM_TRACKS, HUD_SONG_ORDER, HEADPHONE_TRACKS };

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const fmt = t => { t = Math.max(0, Math.floor(t || 0)); return Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
function btn(text, cls, onClick) { const b = el('button', cls, text); b.type = 'button'; if (onClick) b.addEventListener('click', onClick); return b; }

// ── 解鎖 ──
// ctx：{ all（網址 unlock=all）, hudSeen（字串；undefined＝沒有常駐介面資料，例如網站版）, day, final（夥伴結局那張卡打開過）, saved（以前解鎖過的 id 陣列） }
// 規則：hud 鍵在 hudSeen 裡；沒有 hudSeen 時看「第幾天之後」（day 欄位，當天還沒聽到所以要過了那一天）；
// 生日歌看 MV 卡的解鎖鍵；舊存檔也可用第六章生日歌後那張 CG，或過了第 20 天；最後一格只看夥伴結局。以前解鎖過的（saved）一直算。
export function unlockedIds(ctx) {
  const out = new Set(Array.isArray(ctx.saved) ? ctx.saved : []);
  const seen = ctx.hudSeen == null ? null : (decodeHudSeen(ctx.hudSeen, HUD_SEEN_KEYS)?.keys ?? new Set());
  const day = Number(ctx.day) || 0;
  ALBUM_TRACKS.forEach(t => {
    const u = t.unlock || {};
    if (ctx.all) { out.add(t.id); return; }
    if (u.final) { if (ctx.final) out.add(t.id); return; }
    if (u.birthday) {
      if (day > u.day || (seen && [u.hud, u.birthday, u.birthdayLegacy].some(key => seen.has(key)))) out.add(t.id);
      return;
    }
    if (seen) { if (u.hud && seen.has(u.hud)) out.add(t.id); return; }
    if (u.day !== undefined && day > u.day) out.add(t.id);
  });
  return out;
}

// ── 播放器 ──
// opts：{ mode: 'story'|'mine', items: [{ id, title, chapter, mp3, cover, quote, lrc, lyrics, note, duration, locked, final, prompt }], heading, emptyNode, startId, autoplay }
export function mountAlbum(root, opts) {
  const mode = opts.mode;
  const demo = mode === 'mine';
  const items = opts.items;
  const wrap = el('div', 'sa sa-' + mode);
  wrap.dataset.album = mode;
  root.appendChild(wrap);
  if (opts.heading) wrap.appendChild(el('h2', 'sa-heading', opts.heading));
  if (!items.length) { if (opts.emptyNode) wrap.appendChild(opts.emptyNode); return { items, destroy() {} }; }

  // 版面：曲目（左）／唱盤＋控制（中）／詩寫下的話＋歌詞（右）；窄畫面唱盤在上，曲目與歌詞用分頁切
  const grid = el('div', 'sa-grid');
  const listCard = el('section', 'sa-card sa-listcard'); listCard.setAttribute('aria-label', '曲目');
  const list = el('div', 'sa-list'); list.setAttribute('role', 'list');
  const foot = el('p', 'sa-foot');
  listCard.append(list);
  if (opts.listNote) listCard.appendChild(opts.listNote);   // 曲目底下的小提示（耳機：還沒請詩做歌時，告訴妳去哪裡請）
  listCard.appendChild(foot);
  const stage = el('section', 'sa-stage'); stage.setAttribute('aria-label', demo ? '錄音機' : '唱盤');
  const side = el('section', 'sa-card sa-side'); side.setAttribute('aria-label', '歌詞');
  const tabs = el('div', 'sa-tabs'); tabs.setAttribute('role', 'tablist');
  const tabList = btn('曲目', 'sa-tab', () => showTab('list')); const tabLy = btn('歌詞', 'sa-tab', () => showTab('ly'));
  [tabList, tabLy].forEach(t => t.setAttribute('role', 'tab')); tabList.dataset.tab = 'list'; tabLy.dataset.tab = 'ly';
  tabs.append(tabList, tabLy);

  // 唱盤
  const deck = el('div', 'sa-deck');
  const platter = el('div', 'sa-platter');
  const canvas = el('canvas', 'sa-spectrum'); canvas.width = 640; canvas.height = 640; canvas.setAttribute('aria-hidden', 'true');
  const record = el('div', 'sa-record');
  const label = el('div', 'sa-label blank'); label.textContent = '詩';
  record.appendChild(label); platter.append(canvas, record);
  const arm = el('div', 'sa-arm'); arm.appendChild(el('i')); arm.setAttribute('aria-hidden', 'true');
  if (demo) {
    deck.classList.add('sa-recorder');
    const tape = el('div', 'sa-tape');
    const reels = el('div', 'sa-reels');
    reels.append(el('i'), el('i'));
    tape.append(el('div', 'sa-tape-paper'), reels, el('div', 'sa-tape-foot'));
    deck.append(tape);
  } else {
    deck.append(platter, arm);
  }
  deck.setAttribute('aria-hidden', 'true');
  const meta = el('div', 'sa-meta');
  const mChapter = el('div', 'sa-chapter'); const mTitle = el('h3', 'sa-title'); const mSub = el('p', 'sa-sub');
  meta.append(mChapter, mTitle, mSub);
  const ctl = el('div', 'sa-ctl');
  const seekRow = el('div', 'sa-seekrow');
  const cur = el('span', 'sa-cur', '0:00'); const dur = el('span', 'sa-dur', '0:00');
  const seek = el('input', 'sa-seek'); seek.type = 'range'; seek.min = '0'; seek.max = '100'; seek.step = '0.1'; seek.value = '0'; seek.setAttribute('aria-label', '播放位置');
  seekRow.append(cur, seek, dur);
  const trans = el('div', 'sa-trans');
  const bPrev = btn('上一首', 'sa-btn sa-prev', () => prev());
  const bToggle = btn('播放', 'sa-btn sa-toggle', () => toggle());
  const bNext = btn('下一首', 'sa-btn sa-next', () => next());
  trans.append(bPrev, bToggle, bNext);
  const volRow = el('div', 'sa-volrow');
  const bMute = btn('靜音', 'sa-btn sa-mute', () => { muted = !muted; applyVol(); });
  const vol = el('input', 'sa-vol'); vol.type = 'range'; vol.min = '0'; vol.max = '100'; vol.value = '80'; vol.setAttribute('aria-label', '音量');
  volRow.append(bMute, vol);
  const status = el('p', 'sa-status'); status.setAttribute('role', 'status');
  ctl.append(seekRow, trans, volRow, status);
  stage.append(deck, meta, ctl);

  const quoteBox = el('div', 'sa-quote');
  const lyrics = el('div', 'sa-lyrics'); lyrics.setAttribute('role', 'region'); lyrics.setAttribute('aria-label', '歌詞');
  // 這首歌的小卡（沒有歌詞時取代歌詞區）
  const cardBox = el('div', 'sa-songcard'); cardBox.hidden = true;
  const vizBox = el('div', 'sa-vizbox');
  const viz = el('canvas', 'sa-viz'); viz.setAttribute('aria-hidden', 'true');
  const vizNote = el('p', 'sa-viz-note');
  vizBox.append(viz, vizNote);
  const info = el('dl', 'sa-info');
  const infoCell = () => { const d = el('div', 'sa-info-cell'); const k = el('dt'); const v = el('dd'); d.append(k, v); info.appendChild(d); return { d, k, v }; };
  const iWhen = infoCell(), iLen = infoCell(), iPct = infoCell();
  iLen.k.textContent = '長度'; iPct.k.textContent = '已播';
  cardBox.append(vizBox, info);
  side.append(quoteBox, lyrics, cardBox);
  const host = el('div', 'sa-audio-host'); host.hidden = true;
  grid.append(listCard, stage, side);
  wrap.append(tabs, grid, host);

  // ── 狀態 ──
  let current = -1, playing = false, loading = false, audio = null, volume = 0.8, muted = false, err = '', dragging = false, destroyed = false;
  let actx = null, analyser = null, buf = null, analyserReal = false;
  const sources = new WeakMap();
  const isLocked = i => !items[i] || !!items[i].locked;
  const playable = () => items.map((_, i) => i).filter(i => !isLocked(i));

  // 故事配樂：嵌在 Larch 裡才送（照 HUD 的 holdBgm）
  let bgmHeld = false, bgmTimer = 0;
  const framed = window.parent !== window;
  function holdBgm(on) {
    if (!framed) return;
    clearTimeout(bgmTimer);
    if (on) { if (!bgmHeld) { bgmHeld = true; try { window.parent.postMessage({ type: 'larch:hud:music', pause: true }, '*'); } catch (e) { /* 外殼不在 */ } } return; }
    bgmTimer = setTimeout(() => { if (bgmHeld && !(audio && !audio.paused)) { bgmHeld = false; try { window.parent.postMessage({ type: 'larch:hud:music', pause: false }, '*'); } catch (e) { /* 外殼不在 */ } } }, 400);
  }

  function sameOrigin(src) { try { const u = new URL(src, location.href); return u.protocol === 'blob:' || u.origin === location.origin; } catch (e) { return false; } }
  // 頻譜：同源（或 blob）才接 Web Audio 分析器；跨網域的音檔（Larch 版作品從 Worker 讀）接了會沒聲音，改用合成的起伏。
  // 嵌在 Larch 裡（小遊戲卡 iframe 沒把 autoplay 交下來）時 AudioContext 可能一直停著，音檔一接進去就整個沒聲音（作者 2026-11-21 回報），
  // 所以：音檔先直接播；頁面允許 autoplay、而且 AudioContext 確定在跑（running）才接分析器，否則就用合成的起伏。
  function webAudioAllowed() {
    // 2026-11-24 平板回報唱片架、耳機播不出聲：Safari 沒有 featurePolicy 擋不到，接進 Web Audio 後遇到靜音鍵或 iframe 裡 AudioContext 被暫停就整個沒聲音。
    // 頻譜改成一律用合成的起伏，音檔永遠直接播。
    return false;
    try { const fp = document.featurePolicy || document.permissionsPolicy; if (fp && typeof fp.allowsFeature === 'function' && !fp.allowsFeature('autoplay')) return false; } catch (e) { /* 舊瀏覽器沒有這個 */ }
    return true;
  }
  function connect(a, src) {
    analyserReal = false;
    if (!sameOrigin(src) || !webAudioAllowed()) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      if (!actx) { actx = new AC(); analyser = actx.createAnalyser(); analyser.fftSize = 256; analyser.smoothingTimeConstant = 0.78; analyser.connect(actx.destination); buf = new Uint8Array(analyser.frequencyBinCount); }
      const hook = () => {
        if (destroyed || a !== audio || sources.has(a) || !actx || actx.state !== 'running') return;
        try { const s = actx.createMediaElementSource(a); s.connect(analyser); sources.set(a, s); analyserReal = true; } catch (e) { analyserReal = false; }
      };
      if (actx.state === 'running') hook(); else actx.resume().then(hook, () => {});
    } catch (e) { analyserReal = false; }
  }
  function levels(n) {
    const out = new Array(n).fill(0); if (!playing || !audio) return out;
    let real = false;
    if (analyserReal && analyser) {
      analyser.getByteFrequencyData(buf); let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i];
      if (s > 0) { real = true; for (let i = 0; i < n; i++) { const a = Math.floor(Math.pow(i / n, 1.5) * buf.length * 0.75), b = Math.max(a + 1, Math.floor(Math.pow((i + 1) / n, 1.5) * buf.length * 0.75)); let m = 0; for (let k = a; k < b; k++) m = Math.max(m, buf[k]); out[i] = m / 255; } }
    }
    if (!real) { const t = audio.currentTime; for (let i = 0; i < n; i++) out[i] = Math.min(1, 0.22 + 0.5 * Math.abs(Math.sin(t * 2.4 + i * 0.55) * Math.sin(t * 1.1 + i * 0.23)) * (1 - i / n * 0.5)); }
    return out;
  }

  function newAudio(src) {
    if (audio) { audio.pause(); audio.removeAttribute('src'); try { audio.load(); } catch (e) { /* 舊的 */ } audio.remove(); }
    loading = false;
    const a = el('audio'); a.preload = 'auto'; a.src = src; host.appendChild(a); audio = a; analyserReal = false;
    applyVol();
    a.addEventListener('play', () => { playing = true; err = ''; state(); if (a.readyState < 3) { loading = true; status.textContent = '載入中…'; } });
    a.addEventListener('playing', () => { holdBgm(true); if (loading) { loading = false; state(); } });
    a.addEventListener('waiting', () => { if (a !== audio || a.paused) return; loading = true; status.textContent = '載入中…'; });
    a.addEventListener('pause', () => { if (a !== audio) return; playing = false; loading = false; state(); holdBgm(false); });
    a.addEventListener('ended', () => finished(a));
    // 資料裡有 end（音檔尾巴是補上的靜音）：播到 end 就當作播完
    a.addEventListener('timeupdate', () => { if (a !== audio) return; checkListening(a); const e = endAt(); if (e && a.currentTime >= e && !a.paused) { a.pause(); finished(a); return; } paint(); syncLyrics(); });
    a.addEventListener('loadedmetadata', () => { if (a === audio) paint(); });
    a.addEventListener('error', () => { if (a !== audio) return; loading = false; err = '這首暫時播不出來，等一下再試。'; playing = false; state(); holdBgm(false); });
    return a;
  }
  function endAt() { const it = items[current]; return it && it.end > 0 ? it.end : 0; }
  function checkListening(a, finishedTrack = false) {
    if (!opts.onListen || a._freeAffListen) return;
    const end = endAt() || a.duration;
    let heard = 0;
    for (let i = 0; i < a.played.length; i += 1) {
      heard += Math.max(0, Math.min(a.played.end(i), end || Infinity) - a.played.start(i));
    }
    if (heard > 60 || (finishedTrack && end > 0 && heard >= end - 0.25 && heard > 0)) {
      a._freeAffListen = true;
      opts.onListen();
    }
  }
  function finished(a) {
    if (a !== audio) return; checkListening(a, true); holdBgm(false);
    const p = playable(), k = p.indexOf(current);
    if (k >= 0 && k < p.length - 1) select(p[k + 1], true); else { playing = false; state(); paint(); }
  }
  function applyVol() {
    if (audio) { audio.volume = volume; audio.muted = muted || volume === 0; }
    vol.value = String(muted ? 0 : Math.round(volume * 100)); vol.style.setProperty('--p', vol.value + '%');
    setText(bMute, muted ? '取消靜音' : '靜音'); bMute.classList.toggle('is-muted', muted);
  }

  function select(i, play) {
    if (isLocked(i)) { lockedNudge(i); return false; }
    const it = items[i]; err = '';
    if (current !== i || !audio) { current = i; newAudio(it.mp3); change(); }
    if (play) doPlay();
    return true;
  }
  function doPlay() {
    if (current < 0) { const p = playable(); if (!p.length) return; select(p[0], true); return; }
    // 已經接進分析器的音檔要等 AudioContext 跑起來才有聲音；還沒接的先直接播，播起來再看能不能接
    if (sources.has(audio) && actx && actx.state === 'suspended') actx.resume().catch(() => {});
    const a = audio;
    if (endAt() && a.currentTime >= endAt() - 0.05) { try { a.currentTime = 0; } catch (e) { /* 還沒載入 */ } }   // 停在 end 再按播放：從頭
    const pr = a.play();
    if (pr && pr.then) pr.then(() => { if (a === audio && !sources.has(a)) connect(a, a.src); }, e => { if (e && e.name === 'AbortError') return; playing = false; if (!(e && e.name === 'NotAllowedError')) err = '這首暫時播不出來，等一下再試。'; state(); });
    else if (!sources.has(a)) connect(a, a.src);
  }
  // 載入中再按一次不要變成暫停（玩家以為沒反應會再點）
  function toggle() { if (!audio || audio.paused) doPlay(); else if (!loading) audio.pause(); }
  function step(d) { const p = playable(); if (!p.length) return; let k = p.indexOf(current); k = k < 0 ? 0 : (k + d + p.length) % p.length; select(p[k], true); }
  function next() { step(1); }
  function prev() { if (audio && audio.currentTime > 3) { audio.currentTime = 0; paint(); return; } step(-1); }
  function duration() { const e = endAt(); if (e) return e; return audio && isFinite(audio.duration) && audio.duration > 0 ? audio.duration : (items[current] ? items[current].duration : 0) || 0; }
  function seekTo(t) { if (!audio) return; try { audio.currentTime = Math.max(0, Math.min(t, duration())); } catch (e) { /* 還沒載入 */ } paint(); syncLyrics(true); }

  // ── 畫面 ──
  function lockedNudge(i) {
    const row = list.querySelector('[data-i="' + i + '"]');
    if (row) { row.classList.remove('nudge'); void row.offsetWidth; row.classList.add('nudge'); }
    status.textContent = '這一格還沒解鎖，劇情裡會聽到。';
  }
  // 按鈕文字有變才換（studio_icons.mjs 會照新文字重套圖示；同樣的字不要動，免得圖示閃一下）
  function setText(node, text) { if ((node.dataset.spText !== undefined ? node.dataset.spText : node.textContent) !== text) node.textContent = text; }
  function renderList() {
    const focused = list.contains(document.activeElement) ? document.activeElement.dataset.i : null;
    list.replaceChildren();
    let last = '';
    const order = items.map((_, i) => i).filter(i => !isLocked(i)).concat(items.map((_, i) => i).filter(i => isLocked(i)));
    order.forEach(i => {
      const it = items[i];
      if (isLocked(i)) {
        if (last !== '?') { list.appendChild(el('h4', 'sa-group', '還沒聽到的歌')); last = '?'; }
        const row = btn('', 'sa-row lock', () => lockedNudge(i)); row.dataset.i = String(i); row.setAttribute('aria-label', '還沒聽到的歌'); row.setAttribute('role', 'listitem');
        const no = el('span', 'sa-no', '？'); const tt = el('span', 'sa-tt'); tt.append(el('b', '', '還沒聽到'), el('small', '', '劇情裡會聽到'));
        row.append(no, tt, el('span', 'sa-t')); list.appendChild(row); return;
      }
      const grp = mode === 'story' ? it.chapter : it.group;
      if (grp && grp !== last) { list.appendChild(el('h4', 'sa-group', grp)); last = grp; }
      const on = i === current;
      const row = btn('', 'sa-row' + (on ? ' on' : ''), () => { if (i === current) toggle(); else select(i, true); });
      row.dataset.i = String(i); row.dataset.id = it.id; row.setAttribute('role', 'listitem');
      row.setAttribute('aria-label', (on && playing ? '暫停 ' : '播放 ') + it.title); if (on) row.setAttribute('aria-current', 'true');
      const no = el('span', 'sa-no');
      if (on && playing) { const eq = el('span', 'sa-eq'); eq.append(el('i'), el('i'), el('i')); no.appendChild(eq); }
      else if (it.cover) { const im = el('img'); im.src = it.cover; im.alt = ''; im.loading = 'lazy'; no.appendChild(im); }
      else no.textContent = '詩';
      const tt = el('span', 'sa-tt');
      const kind = it.lrc ? '動態歌詞' : it.lyrics && it.lyrics.length ? '有歌詞' : mode === 'story' ? '器樂' : '';
      tt.append(el('b', '', it.title), el('small', '', mode === 'story' ? kind : (it.when || (it.artist ? it.artist + (kind ? '・' + kind : '') : kind))));
      row.append(no, tt, el('span', 'sa-t', it.duration ? fmt(it.duration) : ''));
      list.appendChild(row);
    });
    if (focused !== null) { const again = list.querySelector('[data-i="' + focused + '"]'); if (again) again.focus({ preventScroll: true }); }
    const open = items.filter(it => !it.locked).length;
    foot.textContent = mode === 'story' ? '已收 ' + open + ' / ' + items.length + ' 首' : '共 ' + items.length + ' 首';
  }
  function renderMeta() {
    const it = items[current];
    if (!it) {
      mChapter.textContent = demo ? '詩做給妳的' : '詩的唱片架';
      mTitle.textContent = demo ? '選一首歌' : '選一張唱片';
      mSub.textContent = demo ? '點曲目就能聽。' : '點曲目，唱臂會放下來。';
      label.className = 'sa-label blank'; label.replaceChildren(document.createTextNode('詩'));
    } else {
      mChapter.textContent = demo ? '詩做給妳的' : it.chapter; mTitle.textContent = it.title; mSub.textContent = mode === 'story' ? '' : (it.when || (it.artist ? '作者：' + it.artist : ''));
      if (it.cover) { label.className = 'sa-label'; const im = el('img'); im.src = it.cover; im.alt = ''; label.replaceChildren(im); }
      else { label.className = 'sa-label blank'; label.replaceChildren(document.createTextNode('詩')); }
    }
    quoteBox.replaceChildren();
    if (it && it.quote && it.quote.text) {
      quoteBox.append(el('h4', '', it.quote.who === '詩' || /（S）$/.test(it.quote.who) ? '詩寫下的話' : '那一天'),
        el('p', 'sa-qtext', '「' + it.quote.text + '」'), el('p', 'sa-qsrc', it.quote.who + '・' + it.quote.chapter));
      quoteBox.hidden = false;
    } else if (it && it.about) {
      quoteBox.append(el('h4', '', '這首歌'), el('p', 'sa-qtext', it.about), el('p', 'sa-qsrc', '作者：' + (it.artist || '詩')));
      quoteBox.hidden = false;
    } else if (it && it.prompt) {
      quoteBox.append(el('h4', '', '妳請詩做的'), el('p', 'sa-qtext', it.prompt));
      quoteBox.hidden = false;
    } else if (!it) {
      quoteBox.append(el('p', 'sa-qtext sa-qhint', mode === 'story' ? '選一首歌，會看到那天劇裡的一句話。' : '選一首歌，會看到妳當時請詩做的題目。'));
      quoteBox.hidden = false;
    } else quoteBox.hidden = true;
  }
  let lines = [], lastLine = -2;
  function showCard(on) {
    cardBox.hidden = !on; lyrics.hidden = on;
    wrap.dataset.side = on ? 'card' : 'lyrics';
    side.setAttribute('aria-label', on ? '這首歌' : '歌詞');
    setText(tabLy, on ? '這首歌' : '歌詞');
    if (on) { sizeViz(); drawViz(true); }
  }
  function buildCard(it) {
    if (!it) {
      vizNote.textContent = '點一首歌，五線譜會跟著音樂動。'; info.hidden = true; return;
    }
    info.hidden = false;
    vizNote.textContent = mode === 'story' ? (it.note || '器樂') : '';
    if (mode === 'story') { iWhen.k.textContent = '章節'; iWhen.v.textContent = it.chapter || '—'; }
    else if (it.when) { iWhen.k.textContent = '做好'; iWhen.v.textContent = String(it.when).replace(/做好$/, ''); }
    else { iWhen.k.textContent = '作者'; iWhen.v.textContent = it.artist || '詩'; }
  }
  function buildLyrics() {
    const it = items[current]; lyrics.replaceChildren(); lines = []; lastLine = -2; lyrics.scrollTop = 0;
    if (!it) { delete lyrics.dataset.type; buildCard(null); showCard(true); return; }
    const type = it.lrc && it.lrc.length ? 'lrc' : it.lyrics && it.lyrics.length ? 'text' : 'none';
    lyrics.dataset.type = type;
    if (type === 'none') { buildCard(it); showCard(true); return; }
    showCard(false);
    const arr = type === 'lrc' ? it.lrc.map(l => l.text) : it.lyrics;
    arr.forEach((text, i) => {
      const line = type === 'lrc' ? btn(text, 'sa-ly', () => { seekTo(it.lrc[i].t); if (!playing) doPlay(); }) : el('p', 'sa-ly static', text);
      if (type === 'lrc') { line.dataset.t = String(it.lrc[i].t); line.setAttribute('aria-label', '從這一句開始：' + text); }
      lyrics.appendChild(line); lines.push(line);
    });
    if (it.note) lyrics.appendChild(el('p', 'sa-ly-note', it.note));
  }
  function activeLine(it, t) { if (!it || !it.lrc) return -1; let k = -1; for (let i = 0; i < it.lrc.length; i++) { if (it.lrc[i].t <= t + 0.15) k = i; else break; } return k; }
  function syncLyrics(force) {
    const it = items[current]; if (!it || !it.lrc || !audio) return;
    const k = activeLine(it, audio.currentTime); if (k === lastLine && !force) return; lastLine = k;
    lines.forEach((n, i) => { n.classList.toggle('on', i === k); n.classList.toggle('past', i < k); if (i === k) n.setAttribute('aria-current', 'true'); else n.removeAttribute('aria-current'); });
    if (k >= 0 && lines[k] && lyrics.clientHeight) {
      const n = lines[k]; const top = n.offsetTop - lyrics.clientHeight / 2 + n.offsetHeight / 2;
      lyrics.scrollTo({ top: Math.max(0, top), behavior: reduced() ? 'auto' : 'smooth' });
    }
  }
  function paint() {
    const d = duration(), t0 = audio ? audio.currentTime || 0 : 0, t = d ? Math.min(t0, d) : t0;
    if (!dragging) { seek.max = String(d || 100); seek.value = String(t); seek.style.setProperty('--p', d ? (t / d * 100) + '%' : '0%'); seek.setAttribute('aria-valuetext', fmt(t) + ' / ' + fmt(d)); cur.textContent = fmt(t); }
    dur.textContent = fmt(d);
    deck.style.setProperty('--ang', d ? (t / d * 18).toFixed(2) : '0');
    iLen.v.textContent = d ? fmt(d) : '—';
    iPct.v.textContent = d ? Math.min(100, Math.round(t / d * 100)) + '%' : '0%';
    iPct.d.style.setProperty('--p', d ? Math.min(100, t / d * 100).toFixed(1) + '%' : '0%');
  }
  function state() {
    deck.classList.toggle('playing', playing);
    wrap.classList.toggle('is-playing', playing);
    setText(bToggle, playing ? '暫停' : '播放');
    status.textContent = err || (loading && playing ? '載入中…' : '');
    renderList();
  }
  function change() { renderList(); renderMeta(); buildLyrics(); paint(); state(); }

  // 進度條：拖的時候只動數字，放開才跳
  seek.addEventListener('pointerdown', () => { dragging = true; });
  seek.addEventListener('input', () => { dragging = true; seek.style.setProperty('--p', (seek.value / (Number(seek.max) || 1) * 100) + '%'); cur.textContent = fmt(seek.value); });
  seek.addEventListener('change', () => { dragging = false; seekTo(Number(seek.value)); });
  const pointerUp = () => setTimeout(() => { dragging = false; }, 0);
  window.addEventListener('pointerup', pointerUp);
  vol.addEventListener('input', () => { volume = Number(vol.value) / 100; muted = volume === 0; applyVol(); });

  // 窄畫面分頁
  let tab = 'list';
  function showTab(t) {
    tab = t;
    tabList.setAttribute('aria-selected', String(t === 'list')); tabLy.setAttribute('aria-selected', String(t === 'ly'));
    wrap.dataset.tab = t;
  }
  showTab('list');

  // 小卡的水彩五線譜：底下一排水彩筆觸跟著音量長高，每一欄頂端一顆音符，聲音大時填滿酒紅色（亮起來）
  const vg = viz.getContext('2d');
  let vw = 0, vh = 0, vdpr = 1;
  const sm = [], avg = [];
  // 每一欄固定的小偏移，筆觸才不會整齊得像圖表
  const jitter = i => { const x = Math.sin(i * 12.9898 + 4.1) * 43758.5453; return x - Math.floor(x); };
  function sizeViz() {
    const r = viz.getBoundingClientRect(); if (!r.width || !r.height) return false;
    vdpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.round(r.width * vdpr), h = Math.round(r.height * vdpr);
    if (viz.width !== w || viz.height !== h) { viz.width = w; viz.height = h; }
    vw = r.width; vh = r.height; return true;
  }
  function drawViz(still) {
    if (cardBox.hidden || !vw) return;
    const N = Math.max(12, Math.min(28, Math.floor(vw / 20)));
    // 低音放中間、越高的音越往兩邊，左右對稱像一道聲波；每一欄跟自己最近的平均比，節拍來的時候才看得出起伏
    const half = Math.ceil(N / 2), raw = still ? new Array(half).fill(0) : levels(half);
    for (let i = 0; i < N; i++) {
      const li = raw[Math.min(half - 1, Math.floor(Math.abs(i - (N - 1) / 2)))];
      avg[i] = avg[i] === undefined ? li : avg[i] + (li - avg[i]) * 0.05;
      const lively = Math.max(0, Math.min(1, 0.4 + (li - avg[i]) * 3.4));
      const rest = 0.1 + jitter(i) * 0.12;
      const target = playing && !still ? Math.max(rest, li * 0.35 + lively * 0.65) : rest;
      if (sm[i] === undefined || still) sm[i] = target; else sm[i] += (target - sm[i]) * (target > sm[i] ? 0.45 : 0.12);
    }
    vg.setTransform(vdpr, 0, 0, vdpr, 0, 0); vg.clearRect(0, 0, vw, vh);
    const padX = 14, base = vh - 10, top = 12, span = base - top;
    const gap = Math.max(4, Math.min(26, span * 0.085));       // 五線譜線距
    const staffTop = top + span * 0.06 + gap;
    const colW = (vw - padX * 2) / N, barW = colW * 0.62;
    // 水彩筆觸（兩層：外圈淡淡暈開、裡面一層較濃，頂端積一點顏料）
    for (let i = 0; i < N; i++) {
      const v = sm[i], x = padX + colW * i + (colW - barW) / 2, h = Math.max(6, v * span * 0.62), y = base - h;
      const grad = vg.createLinearGradient(0, y, 0, base);
      grad.addColorStop(0, 'rgba(184,104,126,' + (0.42 + v * 0.3).toFixed(2) + ')'); grad.addColorStop(1, 'rgba(231,195,203,0.12)');
      vg.fillStyle = 'rgba(214,150,166,0.16)';
      vg.beginPath(); vg.roundRect(x - 3, y - 4 + jitter(i + 7) * 3, barW + 6, h + 4, barW / 2); vg.fill();
      vg.fillStyle = grad;
      vg.beginPath(); vg.roundRect(x, y, barW, h, [barW / 2, barW / 2, 3, 3]); vg.fill();
      vg.fillStyle = 'rgba(125,59,80,' + (0.18 + v * 0.3).toFixed(2) + ')';
      vg.beginPath(); vg.ellipse(x + barW / 2, y + 3, barW / 2.2, 2.4, 0, 0, Math.PI * 2); vg.fill();
    }
    // 手繪五線譜（線稍微彎一點）
    vg.strokeStyle = 'rgba(111,86,80,0.32)'; vg.lineWidth = 1.1;
    for (let k = 0; k < 5; k++) {
      const yy = staffTop + gap * k; vg.beginPath();
      for (let x = padX - 4; x <= vw - padX + 4; x += 12) { const yo = yy + Math.sin(x * 0.021 + k * 1.7) * 1.1; if (x === padX - 4) vg.moveTo(x, yo); else vg.lineTo(x, yo); }
      vg.stroke();
    }
    // 音符：高度跟著聲音在譜上跳，聲音大時亮起來
    for (let i = 0; i < N; i++) {
      const v = sm[i], cx = padX + colW * i + colW / 2;
      const cy = staffTop + gap * 4.5 - Math.min(1, v) * gap * 5 + (jitter(i + 3) - 0.5) * gap * 0.5;
      const lit = v > 0.5 && playing && !still, r = Math.min(gap * 0.5, colW * 0.32);
      vg.save(); vg.translate(cx, cy); vg.rotate(-0.35);
      vg.beginPath(); vg.ellipse(0, 0, r * 1.25, r * 0.88, 0, 0, Math.PI * 2);
      if (lit) { vg.fillStyle = 'rgba(125,59,80,' + (0.6 + Math.min(0.4, (v - 0.5))).toFixed(2) + ')'; vg.shadowColor = 'rgba(242,195,207,0.9)'; vg.shadowBlur = 10; vg.fill(); }
      else { vg.fillStyle = 'rgba(255,248,236,0.85)'; vg.fill(); vg.strokeStyle = 'rgba(125,59,80,0.45)'; vg.lineWidth = 1.3; vg.stroke(); }
      vg.restore();
      vg.strokeStyle = lit ? 'rgba(125,59,80,0.8)' : 'rgba(125,59,80,0.35)'; vg.lineWidth = 1.3;
      vg.beginPath(); vg.moveTo(cx + r * 1.1, cy - 1); vg.lineTo(cx + r * 1.1, cy - gap * 2.6); vg.stroke();
    }
  }
  const vizResize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { if (sizeViz()) drawViz(reduced()); }) : null;
  if (vizResize) vizResize.observe(vizBox);

  // 頻譜與唱盤光暈（減少動態時不跑）
  const g = demo ? null : canvas.getContext('2d');
  let raf = 0, lastTs = 0;
  function draw(ts) {
    raf = 0;
    if (destroyed || !wrap.isConnected) return;
    if (ts - lastTs > 30) {
      lastTs = ts;
      const L = levels(64), bass = (L[0] + L[1] + L[2]) / 3;
      deck.style.setProperty('--bass', bass.toFixed(3));
      if (g) g.clearRect(0, 0, 640, 640);
      if (g && playing) {
        g.save(); g.translate(320, 320);
        for (let i = 0; i < 64; i++) {
          const a = i / 64 * Math.PI * 2 - Math.PI / 2, h = 6 + L[i] * 54, R = 250;
          g.strokeStyle = 'rgba(' + Math.round(125 + L[i] * 60) + ',' + Math.round(59 + L[i] * 30) + ',' + Math.round(80 + L[i] * 20) + ',' + (0.3 + L[i] * 0.5).toFixed(2) + ')';
          g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.moveTo(Math.cos(a) * R, Math.sin(a) * R); g.lineTo(Math.cos(a) * (R + h), Math.sin(a) * (R + h)); g.stroke();
        }
        g.restore();
      }
      drawViz(false);
    }
    if (!reduced()) raf = requestAnimationFrame(draw);
  }
  if (!reduced()) raf = requestAnimationFrame(draw);

  // 面板關掉（或換成別的內容）就停：關閉鈕、Esc、點旁邊都會拿掉 #panel 的 on
  const panel = document.getElementById('panel');
  const watch = new MutationObserver(() => {
    if (!wrap.isConnected) { destroy(); return; }
    if (panel && !panel.classList.contains('on') && audio && !audio.paused) audio.pause();
  });
  if (panel) watch.observe(panel, { attributes: true, attributeFilter: ['class'] });
  watch.observe(root.ownerDocument.body, { childList: true, subtree: true });

  function destroy() {
    if (destroyed) return; destroyed = true;
    watch.disconnect(); window.removeEventListener('pointerup', pointerUp); if (vizResize) vizResize.disconnect();
    if (raf) cancelAnimationFrame(raf);
    if (audio) { audio.pause(); audio.removeAttribute('src'); try { audio.load(); } catch (e) { /* 已拿掉 */ } audio.remove(); }
    playing = false; holdBgm(false);
    if (actx) actx.close().catch(() => {});
  }

  change();
  if (opts.startId) { const i = items.findIndex(it => it.id === opts.startId); if (i >= 0 && !isLocked(i)) select(i, !!opts.autoplay); }

  const api = {
    items, wrap,
    get current() { return current; }, get playing() { return playing; }, get audio() { return audio; },
    get spectrum() { return analyserReal ? 'analyser' : 'synth'; }, get bgmHeld() { return bgmHeld; },
    get audioContextState() { return actx ? actx.state : 'none'; },
    select, toggle, next, prev, seek: seekTo, destroy, showTab
  };
  wrap.__album = api;
  window.STUDIO_ALBUM = api;
  return api;
}
