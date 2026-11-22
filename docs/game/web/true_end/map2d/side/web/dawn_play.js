// 朝霞丘長畫的互動（設計.md「朝霞丘長畫的互動」，2026-11-13 作者同意；同日作者補的標準：每個互動要有立即回饋、起承轉合、音效、紙感特效、狀態正確、可重複的要有變化）。
// 兩個章節（?chapter=3 第三章、預設 true 真結局；嵌進 Larch 時看變數 chapter）：
//   第三章：進場整片花田、兔子、蝴蝶是灰的（canvas 降飽和）；撿五色顏料花，每撿一朵對應那一排花從灰滲回原色（像水彩滲開）；
//           五朵齊了跟晨說話 → 晨在畫布上一筆一筆畫出山丘 → CG 3-15（台詞照劇本第三章，一字不改）→ 全彩，寫變數。
//   真結局：島已經是彩色；晨照 4-1；灰兔身後藏回憶第 3 張捲軸（劇本真結局第 5 步）。
// 熱區一律綁在物件上（zone）：物件跑走、撿走、飛走時熱區從 DOM 與 api.hot 一起移除；會動的物件熱區跟著移。
// 狀態：Larch 變數（larch:init）優先，本機存 StudioDB 'dawn_state'；?reset=1 清掉。
import { createPetals } from './petals.js';
import { sfx } from './sfx.js';
import { sunlight } from './sunlight.js';
import { createZukan, watchHot } from './zukan.js';
import { createPlants, plantImg } from './plants.js';
export async function install(api) {
  const { art, IMG, paperize, openDialogue } = api; const X = px => px / IMG.width * 100 + '%'; const rnd = (a, b) => a + Math.random() * (b - a);
  if (api.META.sun) sunlight(art, art.querySelector('img.layer'), IMG, api.META.sun, api.camX, api.getScale);   // 太陽的動態光：底圖之後、人物之前
  const Q = new URLSearchParams(location.search);
  // ── 狀態 ──
  const st = api.vars; const CT = api.ctl;   // CT：這一頁是哪一章、第幾步、怎麼切回 Larch 對話卡（flat_engine.js 的 ctl；規格 ../_島段步驟清單.md）
  const save = await CT.store('dawn_state', st, Q.get('reset') === '1');
  const zk = createZukan({ vars: () => Object.assign({}, st, api.vars), set: v => save(v), toast: api.toast }); await zk.ready;   // 全劇小生物圖鑑（zukan.js）
  const chapter = CT.chapter; const ch3 = chapter === '3', ch7 = chapter === '7', te = !ch3 && !ch7; const K = k => k + (ch3 ? '_c3' : ch7 ? '_c7' : '_te');   // 兔、蝶、花的狀態照章節分開
  if (CT.mode === 'visit' && ch3) Object.assign(st, { ch3_intro: 'true', ch3_done: 'true' });   // 自由逛：主線做完之後的朝霞丘（只在這一頁當成做完，不寫回 Larch）
  // 回接（第三章第 6 步）：CG 3-15 的對話在 Larch 的對話卡播完了，回來時站在畫架旁，整片都有顏色
  const resumed = ch3 && CT.step >= 6 && st.ch3_done !== 'true';
  if (resumed) save({ ch3_intro: 'true', flowers_picked_c3: 'red,orange,yellow,blue,purple', s2_flower_count: '5', palette_c3: 'pink,orange,yellow,white,cherry', painted_c3: 'pink,white,yellow,orange,cherry',
    rabbit_colored_c3: 'true', bf_colored_c3: 'true', s2_flowers_submitted: 'true', ch3_done: 'true', chapter3_dawn_done: 'true' });
  if ((ch3 && CT.step >= 6 && !Q.has('x')) || (ch7 && CT.resume)) CT.startX = 1630;   // 晨的左邊一步
  if (st.gift_chen === 'true') api.gifts.gift_chen = true;
  const picked = new Set((st[K('flowers_picked')] || '').split(',').filter(Boolean));
  const S = {   // 長圖座標 px（03 在 1536–3072）
    cherry: [{ x: 120, w: 560, y: 0.02, h: 0.40 }, { x: 760, w: 520, y: 0.04, h: 0.40 }, { x: 1560, w: 640, y: 0.0, h: 0.40 }],
    tulips: { x: 2320, w: 1200, y: 0.45, h: 0.30 }, mailbox: { x: 1945, w: 60, y: 0.33, h: 0.10 }, pot: { x: 1756, w: 70, y: 0.62, h: 0.18 },
    easelCanvas: { x: 1836, w: 190, y: 0.475, h: 0.16 },
    rabbit: { x: 3380, feet: 0.80, h: 0.085, aside: 3640 }, scroll: { x: 3395, feet: 0.805, h: 0.045 },
    birds: [{ x: 2160, feet: 0.405, h: 0.045, face: -1 }, { x: 1997, feet: 0.362, h: 0.038, face: 1 }, { x: 2760, feet: 0.86, h: 0.07, face: 1, ground: true }],
    bfArea: { x: 2380, w: 1100, y: 0.42, h: 0.22 },
    flowers: [['red', 520, 0.86, 'pink'], ['orange', 1120, 0.90, 'orange'], ['yellow', 2440, 0.86, 'yellow'], ['blue', 3120, 0.88, 'white'], ['purple', 3760, 0.84, 'cherry']], blueBig: { x: 2900, feet: 0.72 },
  };
  const FX = await PageLoading.json('../art/sprites/fx.json'); const FXK = {}; for (const e of FX) (FXK[e.kind] = FXK[e.kind] || []).push(e.file);   // 照名稱（kind）拿圖，不照編號：star 星光、glow 光點、heart 愛心、drop 水滴
  const fxImg = (kind, cls = '') => { const pool = FXK[kind] || FXK.star; const im = document.createElement('img'); im.className = 'fx ' + kind + ' ' + cls; im.src = '../art/sprites/' + pool[Math.floor(Math.random() * pool.length)]; im.alt = ''; im.draggable = false; return im; };
  function sparkle(x, y, n = 10) { for (let i = 0; i < n; i++) { const s = fxImg(Math.random() < 0.7 ? 'star' : 'glow'); s.style.left = X(x + rnd(-30, 30)); s.style.top = (y * 100) + '%'; s.style.setProperty('--a', (i / n * 360 + rnd(-20, 20)) + 'deg'); s.style.setProperty('--d', rnd(60, 150) + 'px'); s.style.setProperty('--sz', rnd(18, 34) + 'px'); s.style.animationDelay = rnd(0, 0.15) + 's'; art.appendChild(s); setTimeout(() => s.remove(), 1500); } }
  function heart(x, y) { const h = fxImg('heart', 'float'); h.style.left = X(x); h.style.top = (y * 100) + '%'; h.style.setProperty('--sz', rnd(26, 34) + 'px'); h.style.setProperty('--dx', rnd(-18, 18) + 'px'); art.appendChild(h); setTimeout(() => h.remove(), 1700); }

  // ── 小紙片 ──
  async function sprite(src, cls, { gray = false } = {}) {
    const pp = await paperize(src, { edge: 9, jitter: 3, gray });
    const d = document.createElement('div'); d.className = 'thing ' + cls; const sh = document.createElement('img'); sh.className = 'shadow'; sh.src = pp.shadow; sh.alt = '';
    const im = document.createElement('img'); im.className = 'sheet'; im.src = pp.src; im.alt = ''; im.draggable = false; d.append(sh, im); d.dataset.pad = pp.pad / pp.height; return d;
  }
  function place(el, x, feet, h) { el.style.left = X(x); el.style.top = (feet * 100) + '%'; el.style.height = (h * 100 / (1 - 2 * Number(el.dataset.pad))) + '%'; el.style.setProperty('--pad', (Number(el.dataset.pad) * 100) + '%'); art.appendChild(el); return el; }
  // 熱區綁在物件上
  function zone(id, name, r, onClick) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hotspot'; b.dataset.id = id; b.dataset.name = typeof name === 'function' ? name() : name; b.setAttribute('aria-label', b.dataset.name);
    Object.assign(b.style, { left: X(r.x), top: r.y * 100 + '%', width: X(r.w), height: r.h * 100 + '%' });
    const hot = { id, name, x: r.x, w: r.w, y: r.y, h: r.h }; const z = { btn: b, hot, r,
      off() { b.remove(); const i = api.hot.indexOf(hot); if (i >= 0) api.hot.splice(i, 1); api.render(); },
      hide() { b.hidden = true; hot.hidden = true; api.render(); }, show() { b.hidden = false; hot.hidden = false; api.render(); },
      moveTo(cx, y) { hot.x = cx - r.w / 2; b.style.left = X(hot.x); if (y !== undefined) { hot.y = y; b.style.top = y * 100 + '%'; } } };
    hot.fn = point => onClick(z, point);
    api.bindHotspot(b, hot); art.appendChild(b); api.hot.push(hot); return z;
  }

  let gray = null, paintAt = () => false;   // 第三章的灰層，下面才建；熱區名牌用函式讀
  // ── 落花瓣 ──
  const petals = createPetals({ stage: document.getElementById('stage'), IMG, camX: api.camX, getScale: api.getScale, canopies: S.cherry }); await petals.ready; api.onFrame(dt => { petals.step(dt); petals.draw(); });
  for (const [i, r] of S.cherry.entries()) zone('cherry' + i, () => gray && gray.on && !gray.painted.has('cherry') ? '上色' : '搖一搖櫻花樹', r, z => { if (gray && gray.on && !gray.painted.has('cherry') && paintAt(r.x + r.w / 2, r.y + r.h * 0.5)) return; z.btn.classList.remove('shake'); void z.btn.offsetWidth; z.btn.classList.add('shake'); petals.rain(r, 10 + Math.floor(rnd(0, 8)), rnd(2.4, 3.6)); sfx.rustle(4 + Math.floor(rnd(0, 3))); });
  zone('tulips', () => gray && gray.on ? '上色' : '摸摸鬱金香', S.tulips, (z, point) => { if (gray && gray.on && paintAt(point?.x ?? api.state.x, point?.y ?? S.tulips.y + S.tulips.h * 0.55)) return; const sw = document.createElement('div'); sw.className = 'sway'; const seg = rnd(0.15, 0.7); Object.assign(sw.style, { left: X(S.tulips.x + S.tulips.w * seg), top: S.tulips.y * 100 + '%', width: X(S.tulips.w * 0.3), height: S.tulips.h * 100 + '%' }); art.appendChild(sw); setTimeout(() => sw.remove(), 900); petals.rain({ x: S.tulips.x + S.tulips.w * seg, w: S.tulips.w * 0.3, y: S.tulips.y + 0.02, h: S.tulips.h * 0.5 }, 4 + Math.floor(rnd(0, 4)), 1.2, 'tulip'); sfx.rustle(2 + Math.floor(rnd(0, 2))); });

  // ── 第三章：灰色的花田（作者 2026-11-13 改：撿到哪一色就能塗哪一色）──
  //   灰層：花田帶（幾何多邊形、邊緣羽化，整片均勻灰）＋櫻花樹冠（顏色遮罩）。五色遮罩（粉、白、黃、橘、櫻）只用來決定點下去塗哪一色。
  //   撿顏料花→調色盤多一色；走到同色那排按「上色」→ 從點的位置像水彩滲開塗回原色；沒那個顏色→紙條提示。五色都撿到、五排都塗完→交給晨→畫完→整層移除。
  gray = { on: ch3 && st.ch3_done !== 'true', masks: {}, cv: null, painted: new Set((st.painted_c3 || '').split(',').filter(Boolean)), W: 0, H: 0 };
  const palette = new Set((st.palette_c3 || '').split(',').filter(Boolean)); const COLOR_OF = { red: 'pink', orange: 'orange', yellow: 'yellow', blue: 'white', purple: 'cherry' }; const KEYS5 = ['pink', 'white', 'yellow', 'orange', 'cherry'];
  if (gray.on) await buildGray();
  async function buildGray() {
    // 遮罩由 art/gray_masks.py 預先做好（走進原畫的外框法：生圖把櫻花樹冠、花田塗綠，只拿綠色當遮罩、像素用原畫的；花田內再照原畫顏色分五排）
    const W = IMG.width, H = IMG.height; gray.W = W; gray.H = H; const mk = () => { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; };
    const load = src => PageLoading.preload(src, 'anonymous').catch(() => null);
    const [bg, fieldM, ...masks] = await Promise.all([
      load('../art/out/dawn/flat.webp'), load('../art/out/dawn/gray_field.webp'),
      ...KEYS5.map(k => load(`../art/out/dawn/gray_${k}.webp`)),
    ]);
    const ms = Object.fromEntries(KEYS5.map((key, i) => [key, masks[i]]));
    if (!bg || !fieldM || KEYS5.some(k => !ms[k])) { gray.on = false; return; }
    const toMask = img => { const c = mk(); const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, W, H); const d = ctx.getImageData(0, 0, W, H); const px = d.data; for (let i = 0; i < px.length; i += 4) { px[i + 3] = px[i]; px[i] = px[i + 1] = px[i + 2] = 0; } ctx.putImageData(d, 0, 0); return c; };   // 灰階圖 → alpha
    for (const k of KEYS5) gray.masks[k] = toMask(ms[k]);
    const all = mk(); { const c = all.getContext('2d'); c.drawImage(toMask(fieldM), 0, 0); c.drawImage(gray.masks.cherry, 0, 0); }
    // 灰層＝原畫去色（稍微提亮）∩ 遮罩
    const over = mk(); { const c = over.getContext('2d'); c.drawImage(bg, 0, 0, W, H); const d = c.getImageData(0, 0, W, H); const px = d.data; for (let i = 0; i < px.length; i += 4) { const g = Math.round((0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) * 0.9 + 22); px[i] = px[i + 1] = px[i + 2] = g; px[i + 3] = 240; } c.putImageData(d, 0, 0); c.globalCompositeOperation = 'destination-in'; c.drawImage(all, 0, 0); c.globalCompositeOperation = 'source-over'; }
    gray.cv = over; over.className = 'layer grayfield'; Object.assign(over.style, { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 1 }); art.insertBefore(over, art.children[1]);
    // 前景遮擋層（右下那叢鬱金香、三葉草）用同一份遮罩灰
    const fgEl = document.getElementById('fg'); const fgImg = fgEl && await load(fgEl.src);
    if (fgImg) { const fo = mk(); const c = fo.getContext('2d'); c.drawImage(fgImg, 0, 0, W, H); const d = c.getImageData(0, 0, W, H); const px = d.data; for (let i = 0; i < px.length; i += 4) { if (!px[i + 3]) continue; const g = Math.round((0.3 * px[i] + 0.59 * px[i + 1] + 0.11 * px[i + 2]) * 0.9 + 22); px[i] = px[i + 1] = px[i + 2] = g; } c.putImageData(d, 0, 0); c.globalCompositeOperation = 'destination-in'; c.drawImage(all, 0, 0); c.globalCompositeOperation = 'source-over'; fo.className = 'layer grayfield'; Object.assign(fo.style, { position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 3 }); fgEl.after(fo); gray.fg = fo; }
    petals.setGray(!gray.painted.has('cherry'));
    for (const k of gray.painted) reveal(k, true);
  }
  function colorAt(x, y) {   // 站的位置附近（±200 px、±12% 高）哪一色的灰花最多：還沒塗的優先；回 {key, cx, cy}
    const score = {}; const pos = {};
    for (const k of KEYS5) { if (gray.painted.has(k)) continue; const ctx = gray.masks[k].getContext('2d'); let best = 0, bx = x, by = y * gray.H; for (let dx = -200; dx <= 200; dx += 40) for (let dy = -0.12; dy <= 0.12; dy += 0.03) { const px_ = Math.round(x + dx), py = Math.round((y + dy) * gray.H); if (px_ < 0 || py < 0 || px_ >= gray.W || py >= gray.H) continue; const v = ctx.getImageData(px_, py, 1, 1).data[3]; score[k] = (score[k] || 0) + v; if (v > best) { best = v; bx = px_; by = py; } } pos[k] = [bx, by]; }
    const keys = Object.keys(score).filter(k => score[k] > 600).sort((a, b) => score[b] - score[a]); if (!keys.length) return null;
    const inPal = keys.find(k => palette.has(k)); const key = inPal || keys[0]; return { key, cx: pos[key][0], cy: pos[key][1] };
  }
  function reveal(key, instant = false, cx, cy) {
    if (!gray.on || !gray.masks[key]) return; const m = gray.masks[key]; const ctxs = [gray.cv, gray.fg].filter(Boolean).map(c => c.getContext('2d'));
    if (key === 'cherry') petals.setGray(false);
    if (instant) { for (const ctx of ctxs) { ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(m, 0, 0); ctx.globalCompositeOperation = 'source-over'; } return; }
    const Rmax = 1600; let t = 0; sfx.bleed(); const tmp = document.createElement('canvas'); tmp.width = gray.W; tmp.height = gray.H; const tc = tmp.getContext('2d');
    const anim = dt => { t += dt / 3.0; const e = Math.min(1, t); const r = Rmax * (e * e * (3 - 2 * e)) + 10;
      tc.globalCompositeOperation = 'source-over'; tc.clearRect(0, 0, tmp.width, tmp.height); const g = tc.createRadialGradient(cx, cy, Math.max(0, r - 260), cx, cy, r); g.addColorStop(0, 'rgba(0,0,0,1)'); g.addColorStop(1, 'rgba(0,0,0,0)'); tc.fillStyle = g; tc.fillRect(0, 0, tmp.width, tmp.height);
      tc.globalCompositeOperation = 'destination-in'; tc.drawImage(m, 0, 0); for (const ctx of ctxs) { ctx.globalCompositeOperation = 'destination-out'; ctx.globalAlpha = 0.25; ctx.drawImage(tmp, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; }
      if (t >= 1.3) { for (const ctx of ctxs) { ctx.globalCompositeOperation = 'destination-out'; ctx.drawImage(m, 0, 0); ctx.globalCompositeOperation = 'source-over'; } const k = api.frameHooks.indexOf(anim); if (k >= 0) api.frameHooks.splice(k, 1); } };
    api.frameHooks.push(anim);
  }
  function removeGray() { if (!gray.cv) return; petals.setGray(false); for (const c of [gray.cv, gray.fg].filter(Boolean)) { c.style.transition = 'opacity 1.2s'; c.style.opacity = '0'; setTimeout(() => c.remove(), 1300); } gray.cv = null; gray.fg = null; gray.on = false; }
  // 調色盤（紙感小色票）：撿到的顏色亮起
  const pal = document.getElementById('palette'); const COL = { pink: '#f3a1c0', white: '#fbf7f2', yellow: '#f9df7a', orange: '#f7a46a', cherry: '#ec8fb3' };
  const drawPalette = () => { if (!ch3 || st.ch3_done === 'true') { pal.hidden = true; return; } pal.hidden = false; pal.replaceChildren(); for (const k of KEYS5) { const sw = document.createElement('i'); sw.style.setProperty('--c', COL[k]); sw.classList.toggle('got', palette.has(k)); sw.classList.toggle('done', gray.painted.has(k)); pal.appendChild(sw); } };
  drawPalette();
  paintAt = function (x, y) {   // 在花田或櫻花上按「上色」
    const hit = colorAt(x, y); if (!hit) return false; const k = hit.key;
    if (!palette.has(k)) { api.toast('還沒找到這個顏色的顏料花'); sfx.paper(); return true; }
    sfx.sparkle(); sparkle(hit.cx, hit.cy / gray.H, 8); reveal(k, false, hit.cx, hit.cy); gray.painted.add(k); save({ painted_c3: [...gray.painted].join(',') }); drawPalette(); setQuest(questText()); return true;
  };

  // ── 任務紙條 ──
  const quest = document.getElementById('quest'); const setQuest = text => { if (!text) { quest.hidden = true; return; } quest.hidden = false; quest.textContent = text; };
  const allDone = () => picked.size >= 5 && gray.painted.size >= 5;
  const questText = () => !ch3 || st.ch3_done === 'true' ? '' : allDone() ? '把顏料花交給晨' : picked.size >= 5 ? `把花田塗回原色　${gray.painted.size}／5` : `找五種顏色的顏料花　${picked.size}／5`; setQuest(questText());
  // 第三章的島段主線做完才能離開（作者 2026-11-17 定；小委託、收集、圖鑑可做可不做）。沒做完走到出口：提示還有什麼沒做，人退回來一步
  { const exitHot = api.hot.find(h => h.id === 'exit'); if (exitHot && ch3) { const go = exitHot.fn || (() => api.runHot(exitHot)); let last = 0;
    exitHot.fn = () => { if (st.ch3_done === 'true') return go(); const now = performance.now(); if (now - last > 1800) { last = now; api.toast('還不能離開：' + (questText() || '先找晨說話')); } window.dawnHill.exitBlocked = (window.dawnHill.exitBlocked || 0) + 1; }; } }
  if (ch3 && st.ch3_intro !== 'true') { setTimeout(() => openDialogue([['', '坡上的花、兔子、蝴蝶都是灰的。'], ['晨', '這邊跟色之國一樣，都是灰的。'], ['晨', '昨天在色之國，妳碰到灰色的地方，顏色就回來了。這裡也可以。']], [() => save({ ch3_intro: 'true' })]), 900); }

  // ── 信箱 ──
  let note = null;
  zone('mailbox', '看信箱', S.mailbox, () => { if (note) { sfx.click(false); note.classList.add('out'); const n = note; note = null; setTimeout(() => n.remove(), 350); return; } sfx.click(true); note = document.createElement('div'); note.className = 'note'; note.style.left = X(S.mailbox.x - 60); note.style.top = (S.mailbox.y - 0.16) * 100 + '%'; note.innerHTML = '<b>茶語</b><b>晨</b><b>明</b><b>詩</b>'; art.appendChild(note); const n = note; const close = () => { if (note !== n) return; note = null; sfx.click(false); n.classList.add('out'); setTimeout(() => n.remove(), 350); }; n.addEventListener('click', close); setTimeout(close, 5000); });
  // ── 盆栽 ──
  const potEl = await sprite('../art/sprites/pot.webp', 'pot'); place(potEl, S.pot.x + S.pot.w / 2, 0.79, 0.17); let watered = Number(st.pot_watered || 0); let watering = false;
  const growPot = () => { potEl.style.opacity = watered ? '1' : '0'; potEl.style.setProperty('--grow', (1 + Math.min(watered, 4) * 0.12).toFixed(2)); }; growPot();
  zone('pot', '澆水', S.pot, () => { if (watering) return; watering = true; sfx.water(); api.player.classList.add('pouring'); const can = { remove() { api.player.classList.remove('pouring'); } };
    for (let i = 0; i < 7; i++) { const d = fxImg('drop', 'falling'); d.style.left = X(S.pot.x + 40 + rnd(0, 30)); d.style.top = (S.pot.y * 100) + '%'; d.style.setProperty('--sz', rnd(10, 16) + 'px'); d.style.setProperty('--dy', rnd(50, 90) + 'px'); d.style.animationDelay = rnd(0.15, 0.7) + 's'; art.appendChild(d); setTimeout(() => d.remove(), 1600); }
    setTimeout(() => { can.remove(); watered += 1; save({ pot_watered: String(watered) }); growPot(); potEl.classList.add('pop'); sparkle(S.pot.x + S.pot.w / 2, S.pot.y + 0.05, 5); setTimeout(() => { potEl.classList.remove('pop'); watering = false; }, 600); }, 950); });

  // ── 晨（紙片）與長椅 ──
  const chenEl = art.querySelector('.person.chen'); const chenHome = api.META.npcs.find(n => n.id === 'chen').x;
  const bench = api.hot.find(h => h.id === 'bench'); let wind = null, benchPick = null;
  // 坐下用的紙片：人和長凳畫在同一張紙上（two＝茶語與晨、one＝只有茶語）。x 是紙片中心、feet 是紙片底緣、h 是紙片高（都由 art/bench_sit_fit.py 對著原畫長凳量出來）
  const SITPIECE = { two: { x: 2248.5, feet: 0.833, h: 0.3357 }, one: { x: 2248.7, feet: 0.8252, h: 0.3329 } };
  const sitImgs = {}; for (const k of ['two', 'one']) { try { sitImgs[k] = await sprite(`../art/sprites/bench_sit_${k}.webp`, 'sit bench ' + k); } catch { sitImgs[k] = null; } }
  bench.fn = () => { if (!sitting) sit(); };
  const walkTo = (el, fromX, toX, secs) => new Promise(ok => { let t = 0; el.classList.add('walking'); el.style.setProperty('--facing', toX > fromX ? 1 : -1); const anim = dt => { t += dt / secs; const e = Math.min(1, t); el.style.left = X(fromX + (toX - fromX) * e); window.WalkSway.css(el, window.WalkSway.pose(t * secs, e < 1)); if (e >= 1) { el.classList.remove('walking'); window.WalkSway.css(el, window.WalkSway.pose(0, false)); const k = api.frameHooks.indexOf(anim); if (k >= 0) api.frameHooks.splice(k, 1); ok(); } }; api.frameHooks.push(anim); });
  // 坐下流程（作者 2026-11-13 定案：只有一個「坐下」）：茶語走到椅前、晨照劇情條件走過來，站姿藏起來，換上「人和長凳畫在一起」的那一張紙片，疊在原畫長凳的位置把它蓋住（作者同日：坐下時人要和椅子一起畫才完整）、
  // 往下一沉、鏡頭推一點；坐穩 2 秒觀景 CG 淡入；點一下或按鍵 CG 淡出、仍坐著；再點一下起身，晨走回畫架。坐下進行中忽略重複點擊。
  let sitting = false, standNow = null;
  async function sit() {
    if (sitting) return; sitting = true;
    const bx = bench.x + bench.w * 0.5; api.lock(true); const chenComes = !ch3 || st.ch3_done === 'true';
    await walkTo(api.player, api.state.x, bx - 60, Math.abs(bx - 60 - api.state.x) / 420 + 0.1); api.state.x = bx - 60;
    if (chenComes) await walkTo(chenEl, chenHome, bx + 60, Math.abs(bx + 60 - chenHome) / 380 + 0.1);
    const parts = [];
    const put = (el, x, y, h) => { if (!el) return null; el.classList.remove('sink', 'rise'); el.style.opacity = ''; const e = place(el, x, y, h); void e.offsetWidth; e.classList.add('sink'); parts.push(e); return e; };
    const pk = chenComes ? 'two' : 'one', sp = SITPIECE[pk]; put(sitImgs[pk], sp.x, sp.feet, sp.h);
    api.player.style.visibility = 'hidden'; if (chenComes) chenEl.style.visibility = 'hidden'; sfx.sit();
    api.setCamShift(140); document.body.classList.add('sitting'); api.render();
    // 原本這裡還有「風的線條」（整片長畫蓋一層白色細斜線、一直往右捲）與另開一個 Web Audio 做的風聲；作者 2026-11-21 試玩：斜紋像下雨、配樂被打斷。
    // 兩樣都拿掉：坐下時畫面只有原畫與坐姿紙片，聲音只有坐下那一下的布料聲（sfx.sit，共用 sfx.js 那一個音訊環境），配樂照常往下播。
    wind = { on: true };   // 坐著的旗標（stand 用）
    let phase = 'settling'; const cgTimer = setTimeout(() => { if (wind) { phase = 'cg'; api.showCg(false, chenComes ? api.META.cg : (api.META.cg_one || api.META.cg)); } }, 2000);
    const justClosed = () => Date.now() - Number(document.getElementById('cg').dataset.closedAt || 0) < 300;   // 引擎自己的按鍵處理可能先把 CG 關了，同一下不能再當成起身
    const onKey = e => { if (!wind) return; if (phase === 'settling') return; if (phase === 'cg' || justClosed()) { if (api.cgOpen()) api.hideCg(); phase = 'sit'; return; } stand(); };
    const stand = async () => { if (!wind) return; if (chenComes && phase === 'sit') CT.completeFreeInteraction(); wind = null; standNow = null; clearTimeout(cgTimer); removeEventListener('keydown', onKey); art.removeEventListener('pointerdown', onKey);
      for (const e of parts) { e.classList.remove('sink'); e.classList.add('rise'); } document.body.classList.remove('sitting'); api.setCamShift(0);
      setTimeout(async () => { for (const e of parts) { e.classList.remove('rise'); e.remove(); } api.player.style.visibility = ''; if (chenComes) chenEl.style.visibility = ''; api.render(); if (chenComes) await walkTo(chenEl, bx + 60, chenHome, Math.abs(chenHome - bx - 60) / 380 + 0.1); chenEl.style.setProperty('--facing', 1); api.lock(false); sitting = false; }, 420); };
    api.onCgClosed(() => { if (wind && phase === 'cg') phase = 'sit'; }); standNow = stand;
    setTimeout(() => { phase = phase === 'settling' ? 'sit' : phase; addEventListener('keydown', onKey); art.addEventListener('pointerdown', onKey); }, 2300);
  }
  window.dawnHill.sitState = () => ({ sitting, parts: [...art.querySelectorAll('.thing.sit')].map(e => ({ cls: e.className, vis: getComputedStyle(e.querySelector('.sheet')).opacity, inDom: e.isConnected })), piece: (() => { const e = art.querySelector('.thing.sit.bench'); return e ? (e.classList.contains('two') ? 'two' : 'one') : null; })(), leftovers: art.querySelectorAll('.benchfront, .thing.sit.tea, .thing.sit.chen').length, playerHidden: api.player.style.visibility === 'hidden', chenHidden: chenEl.style.visibility === 'hidden', cg: api.cgOpen() });

  // ── 兔子（照章節：灰 → 上色 → 跳到旁邊，之後點牠有小反應）與回憶捲軸（真結局） ──
  const rabbitColoredNow = () => st[K('rabbit_colored')] === 'true'; const rabbitColored = rabbitColoredNow(); let rabX = Number(st[K('rabbit_x')]) || (rabbitColored ? S.rabbit.aside : S.rabbit.x);
  const rabC = await sprite('../art/sprites/rabbit.webp', 'rabbit'); place(rabC, rabX, S.rabbit.feet, S.rabbit.h); rabC.style.setProperty('--facing', 1); rabC.classList.add('idle');
  const reactions = ['hop', 'look', 'heart']; let lastReact = -1;
  const rabZone = zone('rabbit', () => rabbitColoredNow() ? '兔子' : '上色', { x: rabX - 70, w: 140, y: S.rabbit.feet - .10, h: .11 }, z => { if (!rabbitColoredNow()) return paintRabbit(z); let i; do { i = Math.floor(Math.random() * reactions.length); } while (i === lastReact); lastReact = i; const r = reactions[i];
    if (r === 'hop') { sfx.boing(); rabC.classList.remove('hopx'); void rabC.offsetWidth; rabC.classList.add('hopx'); }
    if (r === 'look') { const f = api.state.x < rabX ? -1 : 1; rabC.style.setProperty('--facing', f); rabC.classList.add('look', 'eartwitch'); setTimeout(() => { rabC.classList.remove('look', 'eartwitch'); rabC.style.setProperty('--facing', 1); }, 1400); }
    if (r === 'heart') { sfx.heart(); heart(rabX + 10, S.rabbit.feet - S.rabbit.h - 0.02); } });
  let rabG = null;
  if (!rabbitColored) { rabC.style.display = 'none'; rabG = await sprite('../art/sprites/rabbit.webp', 'rabbit', { gray: true }); place(rabG, rabX, S.rabbit.feet, S.rabbit.h); rabG.classList.add('idle'); }
  function paintRabbit(z) {
    sfx.sparkle(); sparkle(rabX, S.rabbit.feet - .04, 12); rabG.classList.add('fade'); z.hide();
    setTimeout(() => { rabG.remove(); rabC.style.display = ''; rabC.classList.add('pop'); save({ [K('rabbit_colored')]: 'true' });
      // 跳三下到旁邊的草地
      let hop = 0; const x0 = rabX, x1 = S.rabbit.aside; const per = 0.5; let t = 0; sfx.boing(); rabC.style.transition = 'none';   // 每幀自己算位置：.thing 的 left 1.4s 過場會讓牠落後，熱區開了紙片還在滑
      const anim = dt => { t += dt; const e = Math.min(1, t / (per * 3)); const x = x0 + (x1 - x0) * e; const ph = (t % per) / per; rabX = x; rabC.style.left = X(x); rabC.style.setProperty('--bob', (-Math.sin(ph * Math.PI) * 34) + '%'); if (Math.floor(t / per) > hop) { hop = Math.floor(t / per); if (hop < 3) sfx.boing(); }
        if (e >= 1) { rabC.style.setProperty('--bob', '0%'); void rabC.offsetWidth; rabC.style.transition = ''; const k = api.frameHooks.indexOf(anim); if (k >= 0) api.frameHooks.splice(k, 1); rabX = x1; save({ [K('rabbit_x')]: String(x1) }); z.moveTo(x1); z.btn.dataset.name = '兔子'; z.show(); if (scrollZ) scrollZ.show(); } };
      api.frameHooks.push(anim); }, 380);
  }
  let scrollZ = null;
  if (te && st.memory3 !== 'true') {
    const scroll = await sprite('../art/sprites/scroll.webp', 'scroll'); place(scroll, S.scroll.x, S.scroll.feet, S.scroll.h);
    scrollZ = zone('scroll', '撿起捲軸', { x: S.scroll.x - 50, w: 100, y: S.scroll.feet - .06, h: .07 }, z => { z.off(); sfx.pick(); scroll.classList.add('picked'); sparkle(S.scroll.x, S.scroll.feet - .03, 6); setTimeout(() => scroll.remove(), 500); save({ memory3: 'true', memories: String(Number(st.memories || 0) + 1) }); setTimeout(() => { sfx.paper(); api.showScroll('第三章　彩色大魔王（晨）', '妳是第一個把顏色帶進來的人。'); }, 350); });
    if (!rabbitColored) scrollZ.hide();   // 兔子還擋著
  }

  // ── 蝴蝶 ──
  const bfColored = !ch3 || st[K('bf_colored')] === 'true';
  const bfC = await sprite('../art/sprites/butterfly.webp', 'butterfly'); const bfG = bfColored ? null : await sprite('../art/sprites/butterfly.webp', 'butterfly', { gray: true });
  const bf = { x: S.bfArea.x + S.bfArea.w * 0.3, y: S.bfArea.y + 0.1, tx: 0, ty: 0, t: 0, rest: 0, el: bfG || bfC, colored: bfColored };
  for (const b of [bfC, bfG]) if (b) { place(b, bf.x, bf.y, 0.06); b.style.display = 'none'; } bf.el.style.display = '';
  const newTarget = () => { bf.tx = rnd(S.bfArea.x, S.bfArea.x + S.bfArea.w); bf.ty = rnd(S.bfArea.y, S.bfArea.y + S.bfArea.h); }; newTarget();
  const BW = 0.06 * IMG.height * (571 / 500) * 1.5, BH = 0.06 * IMG.height * 1.5;   // 蝴蝶圖外接框放大 1.5 倍，熱區每幀跟著牠
  const bfZ = zone('butterfly', () => bf.colored ? '蝴蝶' : '上色', { x: bf.x - BW / 2, w: BW, y: bf.y - BH / IMG.height * 0.75, h: BH / IMG.height }, z => {
    if (!bf.colored) { z.btn.dataset.name = '蝴蝶'; sfx.sparkle(); sparkle(bf.x, bf.y, 10); bfG.classList.add('fade'); setTimeout(() => { bfG.remove(); bfC.style.display = ''; bfC.classList.add('pop'); bf.el = bfC; bf.colored = true; save({ [K('bf_colored')]: 'true' }); }, 380); return; }
    bf.rest = rnd(1.5, 2.5); sfx.rustle(1);   // 彩色的：點了停一下收翅
  });
  let bfSlow = 1; art.addEventListener('pointermove', e => { const r = bfZ.btn.getBoundingClientRect(); const dd = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2)); bfSlow = dd < 140 ? 0.35 : 1; });   // 滑鼠靠近放慢
  api.onFrame(dt => {
    const b = bf; b.t += dt;
    if (b.rest > 0) { b.rest -= dt; b.el.classList.add('landed'); if (b.rest <= 0) { b.el.classList.remove('landed'); newTarget(); } bfZ.moveTo(b.x, b.y - BH / IMG.height * 0.75); return; }
    const dx = b.tx - b.x, dy = (b.ty - b.y) * IMG.height; const dist = Math.hypot(dx, dy);
    if (dist < 12) { if (Math.random() < 0.35) b.rest = rnd(2, 4); else newTarget(); return; }
    const sp = 55 * bfSlow; b.x += dx / dist * sp * dt + Math.sin(b.t * 5) * 14 * dt * bfSlow; b.y += (dy / dist * sp * dt + Math.cos(b.t * 3.3) * 22 * dt * bfSlow) / IMG.height;
    b.el.style.left = X(b.x); b.el.style.top = (b.y * 100) + '%'; b.el.style.setProperty('--facing', dx >= 0 ? 1 : -1); bfZ.moveTo(b.x, b.y - BH / IMG.height * 0.75);
  });

  // ── 小鳥三隻（飛行用 art/sprites/bird_fly_0..2：翅膀上、翅膀下、滑翔；拍翅每秒約 9 次，遠了偶爾滑翔；往左飛鏡射；降落用拍翅格，落地換回站姿收翅） ──
  const birdFly = []; for (let k = 0; k < 3; k++) { try { birdFly.push((await paperize(`../art/sprites/bird_fly_${k}.webp`, { edge: 9, jitter: 3 })).src); } catch { break; } }
  for (const [i, bd] of S.birds.entries()) {
    const el = await sprite('../art/sprites/bird.webp', 'bird'); place(el, bd.x, bd.feet, bd.h); el.style.setProperty('--facing', bd.face); const sheet = el.querySelector('.sheet'); const standSrc = sheet.src;
    const z = zone('bird' + i, '小鳥', { x: bd.x - 40, w: 80, y: bd.feet - bd.h - .02, h: bd.h + .03 }, () => fly());
    let idleT = rnd(1, 4), flying = false, face = bd.face, last = -1;
    const idle = () => { let r; do { r = Math.floor(Math.random() * (bd.ground ? 4 : 3)); } while (r === last); last = r; if (r === 0) { face = -face; el.style.setProperty('--facing', face); } else if (r === 1) { el.classList.add('hopstep'); setTimeout(() => el.classList.remove('hopstep'), 420); } else if (r === 2) { el.classList.add('ruffle'); setTimeout(() => el.classList.remove('ruffle'), 500); } else { el.classList.add('peckonce'); setTimeout(() => el.classList.remove('peckonce'), 600); } };
    api.onFrame(dt => { if (flying) return; idleT -= dt; if (idleT <= 0) { idle(); idleT = rnd(1.5, 5); } });
    // 飛行格：t 進度、far 離停點多遠（0–1）；拍翅 9 Hz，遠的時候 35% 機率滑翔一段
    let flapT = 0, glideUntil = 0;
    const frameFor = (dt, far) => { if (!birdFly.length) return standSrc; flapT += dt; if (far > 0.45 && flapT > glideUntil && Math.random() < dt * 0.9) glideUntil = flapT + rnd(0.4, 0.9); if (flapT < glideUntil) return birdFly[2]; return birdFly[Math.floor(flapT * 9) % 2]; };
    function fly() {
      if (flying) return; flying = true; z.hide(); el.classList.add('crouch'); sfx.chirp();
      setTimeout(() => {
        el.classList.remove('crouch'); el.classList.add('flying'); const dir = Math.random() < 0.5 ? -1 : 1; el.style.setProperty('--facing', dir); const x0 = bd.x, y0 = bd.feet, x1 = bd.x + dir * rnd(500, 800), y1 = -0.15; let t = 0; flapT = 0; glideUntil = 0;
        const anim = dt => { t += dt / 2.6; if (t >= 1) { el.style.display = 'none'; const k = api.frameHooks.indexOf(anim); if (k >= 0) api.frameHooks.splice(k, 1); setTimeout(back, rnd(6000, 11000)); return; }
          const e = t * t * (3 - 2 * t); const x = x0 + (x1 - x0) * e, y = y0 + (y1 - y0) * (1 - Math.pow(1 - t, 2)) + Math.sin(t * 9) * 0.012; el.style.left = X(x); el.style.top = (y * 100) + '%'; el.style.setProperty('--size', (1.15 - 0.7 * e).toFixed(3)); sheet.src = frameFor(dt, e); };
        api.frameHooks.push(anim);
        function back() { el.style.display = ''; el.style.setProperty('--facing', -dir); let t2 = 0; flapT = 0; glideUntil = 0; sfx.chirp();
          const anim2 = dt => { t2 += dt / 2.8; if (t2 >= 1) { el.classList.remove('flying'); sheet.src = standSrc; el.style.left = X(bd.x); el.style.top = (bd.feet * 100) + '%'; el.style.setProperty('--size', '1'); el.style.setProperty('--facing', face); el.classList.add('ruffle'); setTimeout(() => el.classList.remove('ruffle'), 500); const k = api.frameHooks.indexOf(anim2); if (k >= 0) api.frameHooks.splice(k, 1); flying = false; z.show(); return; }
            const e = t2 * t2 * (3 - 2 * t2); const x = x1 + (x0 - x1) * e, y = y1 + (y0 - y1) * Math.pow(t2, 1.6) + Math.sin(t2 * 9) * 0.012; el.style.left = X(x); el.style.top = (y * 100) + '%'; el.style.setProperty('--size', (0.45 + 0.7 * e).toFixed(3)); sheet.src = t2 > 0.85 ? birdFly[Math.floor(flapT * 9) % 2] || standSrc : frameFor(dt, 1 - e); if (t2 > 0.85) flapT += dt; };
          api.frameHooks.push(anim2); }
      }, 300);
    }
  }

  // ── 顏料花（第三章）：撿一朵，那一色的花從灰滲回來 ──
  if (ch3 && st.ch3_done !== 'true') for (const [c, x, feet, fieldKey] of S.flowers) {
    if (picked.has(c)) continue;
    const f = await sprite(`../art/sprites/flower_${c}.webp`, 'flower'); place(f, x, feet, 0.07); f.classList.add('bloom');
    zone('flower_' + c, '撿起顏料花', { x: x - 40, w: 80, y: feet - .08, h: .09 }, z => { z.off(); sfx.pick(); picked.add(c); f.classList.add('picked'); sparkle(x, feet - .04, 7); setTimeout(() => f.remove(), 500); palette.add(COLOR_OF[c]); save({ [K('flowers_picked')]: [...picked].join(','), s2_flower_count: String(picked.size), palette_c3: [...palette].join(',') }); drawPalette(); setQuest(questText()); api.toast(`拿到顏色　${picked.size}／5`); });
  }
  // ── 晨的小委託（真結局，拿到禮物後） ──
  const big = await sprite('../art/sprites/flower_blue_big.webp', 'flower big'); place(big, S.blueBig.x, S.blueBig.feet, 0.09); big.classList.add('bloom'); big.style.display = 'none';
  const showBig = () => { big.style.display = ''; big.classList.add('pop'); zone('bluebig', '摘下藍色的花', { x: S.blueBig.x - 50, w: 100, y: S.blueBig.feet - .10, h: .11 }, z => { z.off(); sfx.pick(); save({ errand_chen: 'found' }); big.classList.add('picked'); sparkle(S.blueBig.x, S.blueBig.feet - .05, 7); setTimeout(() => big.remove(), 500); api.toast('拿到藍色的花'); }); };
  if (st.errand_chen === 'accepted') showBig();
  // ── 畫布：晨把五個顏色畫進畫裡（第三章） ──
  // 畫架上的畫（作者 2026-11-13：「畫架是晨正在畫的」「把畫架跟圖一起重畫，然後再貼回來」）：畫和畫架一起局部重畫，貼回來的補丁 easel_painted.png（art/easel_paste.py 產，位置在 flat.json 的 easel，長圖 px）
  // 疊在原畫同位置、人物後面。第三章演完前不疊（畫布是原畫的空白）；演完後與真結局一進場就疊。點畫架放大看：演完前是鉛筆稿，之後是完成版，用看圖的紙框。
  const EASEL = api.META.easel, EASEL_IMG = { sketch: '../art/out/dawn/easel_sketch.webp', painting: '../art/out/dawn/easel_painting.webp' }, EASEL_PX = [1249, 1191], EASEL_EDGE = 18, EASEL_AR = (EASEL_PX[0] - 2 * EASEL_EDGE) / (EASEL_PX[1] - 2 * EASEL_EDGE), EASEL_TRIM = [EASEL_EDGE / EASEL_PX[1], EASEL_EDGE / EASEL_PX[0], EASEL_EDGE / EASEL_PX[1], EASEL_EDGE / EASEL_PX[0]];   // 兩張畫的圖檔四邊各有一圈畫紙留白（量到 12 到 17 px），放大時藏到紙框底下
   let easelEl = null;
  const easelPainted = () => !ch3 || st.ch3_done === 'true'; const easelView = () => easelPainted() ? EASEL_IMG.painting : EASEL_IMG.sketch;
  function easelPatch(hidden) {
    if (easelEl) return easelEl; const im = document.createElement('img'); im.className = 'easelpatch'; im.src = EASEL.patch; im.alt = ''; im.draggable = false; if (hidden) im.style.opacity = '0';
    Object.assign(im.style, { left: X(EASEL.x), top: (EASEL.y / IMG.height * 100) + '%', width: X(EASEL.w), height: (EASEL.h / IMG.height * 100) + '%' });
    (gray && gray.cv ? gray.cv : art.querySelector('img.layer')).after(im); easelEl = im; return im;   // 緊接在背景（與灰層）之後、人物之前
  }
  if (easelPainted()) easelPatch(false);
  const easelHot = api.hot.find(h => h.id === 'easel'); if (easelHot) easelHot.fn = () => api.showCg(false, easelView(), EASEL_AR, EASEL_TRIM);   // 觀景 CG 只留給長凳
  async function paintCanvas() {   // 晨作畫：九筆，畫跟著一筆一筆顯出來（節奏與原本一樣：第一筆等 0.3 秒，之後每筆 0.42 秒）
    const im = easelPatch(true); const strokes = 9;
    for (let i = 0; i < strokes; i++) { await new Promise(ok => setTimeout(ok, i ? 420 : 300)); sfx.brush(); chenEl.classList.add('paintstroke'); setTimeout(() => chenEl.classList.remove('paintstroke'), 380); im.style.opacity = ((i + 1) / strokes).toFixed(2); }
    im.style.opacity = ''; return im;
  }
  window.dawnHill.paintCanvas = paintCanvas; window.dawnHill.easelState = () => ({ patch: !!(easelEl && easelEl.isConnected), patchOpacity: easelEl ? getComputedStyle(easelEl).opacity : null, view: easelView().split('/').pop(), cgSrc: (document.getElementById('cg-img').getAttribute('src') || '').split('/').pop(), cg: api.cgOpen() });
  const chen = api.hot.find(h => h.id === 'chen'); const chenFn = chen.fn || (() => api.runHot(chen));
  const CG315 = [['晨', '這五個顏色，都是妳找來的。我把它們畫進去了。'], ['', '〔畫裡是這座山丘。坡上的每一朵花，都有了顏色。〕'], ['', '〔她看著那張畫，又轉頭看晨。昨天預演的時候，整座城都變回黃昏的顏色，只有他的披風還是灰的。〕'], ['茶語', '……那你自己的顏色呢？'], ['晨', '……我還沒找到。'], ['', '〔晨把畫筆放下，看著東邊的海。〕'], ['晨', '等遊戲做完，我有一件事想跟妳說。'], ['茶語', '什麼事？'], ['晨', '做完再跟妳說。'], ['茶語', '……好啊。']];
  let justDone = resumed;   // 剛看完 CG 3-15 的這一趟不提小委託（兩個人才說好「做完再跟妳說」）；下次再上朝霞丘才提
  chen.fn = async () => {
    if (ch3) {
      if (st.ch3_done === 'true') { const rest = [['', '〔晨把畫筆放下，看著東邊的海。〕']]; return justDone ? openDialogue(rest) : errandChen(rest); }   // 第三章做完之後的上島自由時間：可以接晨的小委託
      if (!allDone()) return openDialogue([['晨', '昨天在色之國，妳碰到灰色的地方，顏色就回來了。這裡也可以。']]);
      api.lock(true); setQuest(''); CT.completeFreeInteraction(); await paintCanvas();
      if (CT.embedded) { save({ s2_flowers_submitted: 'true' }); await new Promise(ok => setTimeout(ok, 500)); return CT.cut(6, { cg: '3-15' }); }   // 嵌在 Larch：CG 3-15 那一段交給對話卡演，回來接第 6 步
      setTimeout(() => { api.showCg(true, EASEL_IMG.painting, EASEL_AR, EASEL_TRIM); setTimeout(() => openDialogue(CG315, [() => { api.hideCg(); removeGray(); pal.hidden = true; if (rabG) paintRabbit(rabZone); if (bfG && bfG.isConnected) bfZ.hot.fn(); justDone = true; save({ ch3_done: 'true', s2_flowers_submitted: 'true', chapter3_dawn_done: 'true' }); api.lock(false); }]), 700); }, 600); return;
    }
    if (ch7) { if (CT.mode !== 'review') return; return CT.c7Ask('chen', save, () => api.showScroll('朝霞丘', '（待接劇本第七章「九、朝霞丘」的對話卡與 CG 7-11、7-12。）')); }   // 第七章：評審週問今天陪誰；種花那天晨沒有單獨的對話
    const got = api.gifts.gift_chen || st.gift_chen === 'true';
    if (!got) { chenFn(); const hook = setInterval(() => { if (api.gifts.gift_chen) { clearInterval(hook); save({ gift_chen: 'true' }); } }, 500); setTimeout(() => clearInterval(hook), 120000); return; }
    return errandChen(chen.done);
  };
  // 晨的小委託（台詞 2026-11-17 作者定稿，真結局/studio_decor/委託與種樹_提案.md）：第三章做完之後的上島自由時間就能接，真結局拿到禮物之後也能補做。回禮：小番茄苗
  const ERR_CHEN_ASK = [['晨', '我想畫一朵藍色的花。'], ['茶語', '花田那邊不是很多？'], ['晨', '有喔。可是我想畫妳摘的那一朵。'], ['茶語', '蛤？為什麼要我摘？'], ['晨', '妳摘給我的，我會記得比較久。'],
    { choice: [['好啦，我去摘', [['', '（接下晨的小委託：摘一朵藍色的花。）']]], ['晚點再說', []]] }];
  const ERR_CHEN_DONE = [['茶語', '給你。我覺得這朵最漂亮。'], ['晨', '所以看到它，才想到妳。'], ['茶語', '你……'], ['晨', '這盆小番茄苗給妳。是我種的。等它變紅，妳再拿來給我看。我想畫它。'], ['茶語', '蛤？畫番茄喔？不是畫我喔？'], ['晨', '嗯。這樣妳就會多來找我一次。'], ['茶語', '……你想見我，可以直接講啦。真的不是畫我？'], ['晨', '……我想見妳。……現在就想畫妳。'], ['茶語', '我現在就在這裡啊。'], ['', '〔晨笑了。〕']];
  function errandChen(after) {
    if (st.errand_chen === 'done') return openDialogue(after);
    if (st.errand_chen === 'found') return openDialogue(ERR_CHEN_DONE, [() => { save({ errand_chen: 'done' }); CT.completeFreeInteraction(); sfx.heart(); heart(chenHome, 0.36); }]);
    if (st.errand_chen === 'accepted') { api.toast('花田裡有一朵特別大的藍色的花'); return; }
    return openDialogue(ERR_CHEN_ASK, [], line => { if (line === '（接下晨的小委託：摘一朵藍色的花。）') { save({ errand_chen: 'accepted' }); showBig(); } });
  }
  const closeAll0 = window.dawnHill.closeAll; window.dawnHill.closeAll = () => { closeAll0(); if (standNow) standNow(); };   // 測試用：關掉一切也要起身
  window.dawnHill.fxDemo = kind => { const x = api.state.x, y = S.rabbit.feet - 0.25; if (kind === 'heart') { for (let i = 0; i < 3; i++) setTimeout(() => heart(x + rnd(-30, 30), y), i * 120); return; } if (kind === 'drop') { for (let i = 0; i < 7; i++) { const d = fxImg('drop', 'falling'); d.style.left = X(x + rnd(-30, 30)); d.style.top = (y * 100) + '%'; d.style.setProperty('--sz', rnd(10, 16) + 'px'); d.style.setProperty('--dy', rnd(50, 90) + 'px'); art.appendChild(d); setTimeout(() => d.remove(), 1500); } return; } for (let i = 0; i < 10; i++) { const s = fxImg(kind); s.style.left = X(x + rnd(-30, 30)); s.style.top = (y * 100) + '%'; s.style.setProperty('--a', (i * 36 + rnd(-20, 20)) + 'deg'); s.style.setProperty('--d', rnd(60, 150) + 'px'); s.style.setProperty('--sz', rnd(14, 26) + 'px'); art.appendChild(s); setTimeout(() => s.remove(), 1200); } };   // 截圖用：每種特效各放一次
  // ── 小屋門口的貓（設計.md 118 行「中央工作室門口睡覺的貓（摸了會跟著走一小段）」；劇本真結局 59、71 行「貓睡在朝霞丘長畫左端的小屋門口」）──
  // 平常睡在門口左邊的草地上（遠處，小小的）；摸了醒來，沿小路走到她旁邊（照遠近慢慢變大），跟著她走一小段（7 秒），坐下來睡一會兒（12 秒），再走回門口睡
  const CAT = { door: { x: 1912, feet: 0.397, h: 0.04 }, near: { feet: 0.80, h: 0.08 } };
  const catSleep = await sprite('../art/sprites/zk_cat_sleep.webp', 'cat sleep'), catWalk = await sprite('../art/sprites/zk_cat_walk.webp', 'cat walk');
  for (const el of [catSleep, catWalk]) { el.style.transition = 'none'; art.insertBefore(el, api.player); }
  const cat = { mode: 'sleep', x: CAT.door.x, feet: CAT.door.feet, h: CAT.door.h, t: 0, face: 1, pets: 0 };
  const catDraw = () => { const walking = cat.mode === 'come' || cat.mode === 'follow' || cat.mode === 'home'; const el = walking ? catWalk : catSleep, other = walking ? catSleep : catWalk;
    other.style.display = 'none'; el.style.display = ''; el.style.left = X(cat.x); el.style.top = (cat.feet * 100) + '%'; el.style.height = (cat.h * 100 / (1 - 2 * Number(el.dataset.pad))) + '%'; el.style.setProperty('--pad', (Number(el.dataset.pad) * 100) + '%');
    el.querySelector('.sheet').style.transform = `scaleX(${cat.face})` + (walking ? ` translateY(${(-Math.abs(Math.sin(cat.t * 10)) * 4).toFixed(1)}%)` : '');
    const zw = Math.max(64, cat.h * IMG.height * 1.8); catZ.r.w = zw; catZ.hot.w = zw; catZ.btn.style.width = X(zw); catZ.hot.h = cat.h + 0.03; catZ.btn.style.height = (catZ.hot.h * 100) + '%'; catZ.moveTo(cat.x, cat.feet - cat.h - 0.02); };   // 熱區跟著貓走、照遠近變大
  const catZ = zone('cat', '摸摸貓', { x: CAT.door.x - 32, w: 64, y: CAT.door.feet - CAT.door.h - 0.02, h: CAT.door.h + 0.03 }, () => {
    cat.pets += 1; sfx.heart(); heart(cat.x, cat.feet - cat.h - 0.02); zk.saw('cat');
    if (cat.mode === 'sleep' || cat.mode === 'nap') { cat.mode = 'come'; cat.t = 0; cat.from = { x: cat.x, feet: cat.feet, h: cat.h }; }
  });
  api.onFrame(dt => { cat.t += dt; const tx = api.state.x - (api.state.face || 1) * 150;
    if (cat.mode === 'come' || cat.mode === 'home') { const to = cat.mode === 'come' ? { x: tx, feet: CAT.near.feet, h: CAT.near.h } : CAT.door; const k = Math.min(1, cat.t / 2.6), e = k * k * (3 - 2 * k);
      const nx = cat.from.x + (to.x - cat.from.x) * e; if (Math.abs(nx - cat.x) > 0.3) cat.face = nx > cat.x ? 1 : -1; cat.x = nx; cat.feet = cat.from.feet + (to.feet - cat.from.feet) * e; cat.h = cat.from.h + (to.h - cat.from.h) * e;
      if (k >= 1) { if (cat.mode === 'come') { cat.mode = 'follow'; cat.t = 0; } else { cat.mode = 'sleep'; cat.face = 1; } } }
    else if (cat.mode === 'follow') { const d = tx - cat.x, v = Math.sign(d) * Math.min(Math.abs(d), 300 * dt); if (Math.abs(d) > 4) { cat.face = d > 0 ? 1 : -1; cat.x += v; } if (cat.t > 7) { cat.mode = 'nap'; cat.t = 0; } }
    else if (cat.mode === 'nap' && cat.t > 12 && Math.abs(api.state.x - cat.x) > 160) { cat.mode = 'home'; cat.t = 0; cat.from = { x: cat.x, feet: cat.feet, h: cat.h }; }
    catDraw(); });
  catDraw();
  window.dawnHill.cat = cat;
  // 圖鑑：兔子、蝴蝶要是彩色的才算遇到（第三章灰的時候要先上色）；小鳥點了就算
  const rewrap = watchHot(api.hot, [['rabbit', 'rabbit', () => rabbitColoredNow()], ['butterfly', 'butterfly', () => bf.colored], ['bird', 'bird']], zk); api.onFrame(rewrap);
  window.dawnHill.zukan = zk;
  // ── 植物收集（plants.js；方案 真結局/studio_decor_plan.md 第三節）：鬱金香撿球根、櫻花小苗要先把顏色找回來、五色顏料花是晨回送、小番茄苗是晨的小委託回禮 ──
  const pl = createPlants({ vars: () => Object.assign({}, st, api.vars), set: v => save(v), toast: api.toast }); await pl.ready; window.dawnHill.plants = pl;
  const plantSpot = async (id, x, feet, label, can) => { if (pl.has(id)) return null; const el = await sprite(plantImg(id), 'flower plantspot'); place(el, x, feet, 0.06); el.dataset.plant = id;
    const zz = zone('plant_' + id, label, { x: x - 40, w: 80, y: feet - .08, h: .09 }, z => { const no = can && can(); if (no) { api.toast(no); sfx.paper(); return; } take(); }); function take() { if (zz) zz.off(); sfx.pick(); sparkle(x, feet - .04, 7); el.classList.add('picked'); setTimeout(() => el.remove(), 500); pl.got(id); } return { el, take }; };
  await plantSpot('tulip', 2610, 0.80, '撿起鬱金香的球根');
  await plantSpot('sakura', 960, 0.60, '櫻花樹下的小苗', () => ch3 && st.ch3_done !== 'true' ? '小苗還是灰的，先把顏色找回來' : '');
  // 五色顏料花：第三章把花交給晨之後（之後再來也算）
  // 晨的小委託回禮：小番茄苗放在畫架旁（作者 2026-11-18：三個人的盆栽都放在他們身邊的東西旁，像詩的馬鞍藤放舞台邊）。委託做完才拿得走
  const tomato = await plantSpot('tomato', 2086, 0.815, '畫架旁的小番茄苗', () => st.errand_chen === 'done' ? '' : st.ch3_done === 'true' ? '這盆是晨種的。問問他吧。' : '這盆是晨種的。');
  const plantGifts = () => { if (st.ch3_done === 'true' || !ch3) pl.got('paint'); if (st.errand_chen === 'done' && !pl.has('tomato')) setTimeout(() => { if (pl.has('tomato')) return; if (tomato && tomato.el.isConnected) tomato.take(); else pl.got('tomato'); }, 1200); };
  plantGifts(); setInterval(plantGifts, 1500);
  // ── 第七章第 27 天：種花（玩法照 ../_第七章27_28天_提案.md，2026-11-18 作者同意；對話泡泡照劇本第七章 904～908 行，一字不改）──
  if (ch7 && CT.mode === 'day27') {
    const { makeFollowers, tintPetals } = await import('./c7_play.js');
    if (chenEl) chenEl.style.display = 'none';   // 這一天晨跟著茶語走，不在畫架旁
    for (const h of api.hot) if (h.id === 'chen') { h.hidden = true; const b = art.querySelector('.hotspot[data-id="chen"]'); if (b) b.hidden = true; }
    const crew = await makeFollowers(api, { feet: api.META.feet_y, hFrac: api.META.npcs.find(n => n.id === 'chen').h, bounds: [60, 3878], gap: 150 });   // 朝霞丘的人畫得比海灘大，間距也放大
    // 三排土壟、四袋種子都放在坡下那片空草地（櫻花樹與畫架之間）；每排四株，第一排淡紫、第二排白、第三排粉紅（作者 2026-11-18：照提案建議）
    const ROWS = [{ x: 560, color: '#c8a6e8', name: '淡紫' }, { x: 840, color: null, name: '白' }, { x: 1180, color: '#f3a3c2', name: '粉紅' }];
    const ROW_FEET = 0.745, FL_H = 0.06, OFFS = [-78, -26, 26, 78];
    const seeds = await sprite('../art/sprites/c7_seeds.webp', 'c7seeds'); place(seeds, 360, 0.775, 0.075);
    const rowState = i => st['c7g_' + (i + 1)] || '';
    const doneRows = () => ROWS.filter((r, i) => rowState(i) === 'colored' || rowState(i) === 'called').length;
    const allDone = () => st.c7g_done === 'true';
    const questText = () => allDone() ? '往左走到出口' : rowState(2) === 'colored' ? '按「呼喚」，叫蝴蝶過來' : `種花　${doneRows()}／3 排`;
    const flowerSrc = {}; for (const r of ROWS) flowerSrc[r.name] = await tintPetals('../art/sprites/c7_flower.webp', r.color);
    const rows = [];
    for (const [i, r] of ROWS.entries()) {
      const soil = await sprite('../art/sprites/c7_soil.webp', 'c7soil'); place(soil, r.x, ROW_FEET + 0.012, 0.05);
      const row = { ...r, i, gray: [], color: [] };
      row.addFlowers = async (instant) => { for (const [k, dx] of OFFS.entries()) {
        const g = await sprite(flowerSrc[r.name], 'flower c7flower', { gray: true }); place(g, r.x + dx, ROW_FEET, FL_H);
        const c = await sprite(flowerSrc[r.name], 'flower c7flower colored'); place(c, r.x + dx, ROW_FEET, FL_H); c.style.opacity = '0';
        row.gray.push(g); row.color.push(c);
        if (!instant) { g.classList.add('pop'); sfx.pick(); sparkle(r.x + dx, ROW_FEET - 0.03, 4); await new Promise(ok => setTimeout(ok, 420)); } } };
      row.colorUp = (instant) => { row.color.forEach((c, k) => { c.style.transition = instant ? '' : `opacity 1.4s ease ${k * 0.25}s`; c.style.opacity = '1'; }); row.gray.forEach((g, k) => { g.style.transition = instant ? '' : `opacity 1.4s ease ${k * 0.25}s`; g.style.opacity = '0'; });
        if (!instant) { sfx.bleed(); setTimeout(() => sfx.sparkle(), 600); for (const dx of OFFS) sparkle(r.x + dx, ROW_FEET - 0.04, 4); } };
      if (rowState(i)) { await row.addFlowers(true); if (rowState(i) !== 'planted') row.colorUp(true); }
      row.z = zone('c7row' + (i + 1), () => { const s0 = rowState(i); return !s0 ? '種花' : s0 === 'planted' ? '上色' : i === 2 && s0 === 'colored' ? '呼喚' : '新種的花'; },
        { x: r.x - 120, w: 240, y: ROW_FEET - 0.14, h: 0.16 }, () => act(row));
      rows.push(row);
    }
    let busy = false;
    const refresh = () => { setQuest(questText()); for (const row of rows) { row.z.btn.dataset.name = row.z.hot.name(); } api.render(); };
    async function finish() {
      api.lock(true);
      openDialogue([['詩', '明年這裡會整片都是吧？'], ['晨', '……嗯。']], [() => { setTimeout(() => { save({ c7g_done: 'true' }); CT.completeFreeInteraction(); api.lock(false); refresh(); }, 2000); }]);   // 沒有人接下去，停兩秒
    }
    async function act(row) {
      if (busy || api.cgOpen()) return; const s0 = rowState(row.i);
      if (!s0) {   // 種花
        busy = true; api.lock(true); await row.addFlowers(false); save({ ['c7g_' + (row.i + 1)]: 'planted' }); api.lock(false); refresh();
        if (row.i === 0) openDialogue([['晨', '這一排要什麼顏色？'], ['茶語', '淡紫色。'], ['晨', '嗯。我就知道。']], [() => { busy = false; }]);
        else if (row.i === 1) { const m = crew.get('ming'); crew.walkTo(m, row.x - 20).then(() => crew.bend(m)).then(() => crew.release(m));
          openDialogue([['明', '一株隔三十公分。'], ['詩', '種花還要量喔？'], ['明', '不量的話，開了會擠在一起。']], [() => { busy = false; }]); }
        else busy = false;
        return;
      }
      if (s0 === 'planted') {   // 上色
        busy = true; row.colorUp(false); save({ ['c7g_' + (row.i + 1)]: 'colored' }); setTimeout(() => { refresh(); busy = false;
          if (row.i === 2) openDialogue([['詩', '那我負責叫蝴蝶過來。']]); else if (doneRows() === 3 && rowState(2) === 'called' && !allDone()) finish(); }, 900);
        return;
      }
      if (row.i === 2 && s0 === 'colored') {   // 呼喚：蝴蝶飛來停在花上
        busy = true; sfx.hum && sfx.hum(3); const shi = crew.get('shi'); crew.bend(shi);
        const bf = await sprite('../art/sprites/butterfly.webp', 'butterfly c7bf'); const tx = row.x + OFFS[2], ty = ROW_FEET - FL_H * 0.92; place(bf, row.x + 700, 0.25, 0.04);
        let t = 0; const from = [row.x + 700, 0.25]; const fly = dt => { t += dt / 2.2; const e = Math.min(1, t), k = e * e * (3 - 2 * e);
          bf.style.left = X(from[0] + (tx - from[0]) * k); bf.style.top = ((from[1] + (ty - from[1]) * k - Math.sin(e * Math.PI * 3) * 0.03) * 100) + '%';
          if (e >= 1) { const j = api.frameHooks.indexOf(fly); if (j >= 0) api.frameHooks.splice(j, 1); bf.classList.add('landed'); sparkle(tx, ty, 6); } };
        api.frameHooks.push(fly);
        save({ c7g_3: 'called' }); setTimeout(() => { busy = false; refresh(); if (doneRows() === 3) finish(); }, 2400);
        return;
      }
    }
    if (rowState(2) === 'called') { const bf = await sprite('../art/sprites/butterfly.webp', 'butterfly c7bf landed'); place(bf, rows[2].x + OFFS[2], ROW_FEET - FL_H * 0.92, 0.04); }
    // 主線做完才能離開（比照第三～五章）
    { const exitHot = api.hot.find(h => h.id === 'exit'); if (exitHot) { const go = exitHot.fn || (() => api.runHot(exitHot)); let last = 0;
      exitHot.fn = () => { if (allDone()) return go(); const now = performance.now(); if (now - last > 1800) { last = now; api.toast('還不能離開：' + questText()); } window.dawnHill.exitBlocked = (window.dawnHill.exitBlocked || 0) + 1; }; } }
    refresh();
    window.dawnHill.c7 = { rows, crew, act: i => act(rows[i]), state: () => ROWS.map((r, i) => rowState(i)), done: allDone };
  }
  // ── 真結局：第 27 天四個人種的三排花，已經開了（淡紫、白、粉紅；跟第 27 天同一塊空地、同一張土壟與小花素材）──
  if (te) {
    const { tintPetals } = await import('./c7_play.js');
    const ROWS = [{ x: 560, color: '#c8a6e8' }, { x: 840, color: null }, { x: 1180, color: '#f3a3c2' }], ROW_FEET = 0.745;
    const OFFS = [-96, -60, -24, 12, 48, 84];   // 開花之後長密了：每排六株，比剛種下時高一點
    for (const r of ROWS) {
      const src = await tintPetals('../art/sprites/c7_flower.webp', r.color);
      const soil = await sprite('../art/sprites/c7_soil.webp', 'c7soil'); place(soil, r.x, ROW_FEET + 0.012, 0.05);
      for (const [k, dx] of OFFS.entries()) { const f = await sprite(src, 'flower c7flower colored c7bloom'); place(f, r.x + dx, ROW_FEET + (k % 2 ? 0.006 : 0), 0.075 + (k % 3) * 0.006); }
    }
    const bf = await sprite('../art/sprites/butterfly.webp', 'butterfly c7bf landed'); place(bf, ROWS[2].x + 12, ROW_FEET - 0.085, 0.04);
    window.dawnHill.c7bloom = () => document.querySelectorAll('.thing.c7bloom').length;
  }
  window.dawnHill.petals = petals; window.dawnHill.hot = api.hot; window.dawnHill.state = st; window.dawnHill.reveal = reveal; window.dawnHill.gray = gray;
  api.render();
}
