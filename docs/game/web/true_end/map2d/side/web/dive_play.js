// 海灘「下潛」直向海底長畫的玩法（dive.html）。規格：真結局/設計.md「3D 玩法的繪本版演法」第 3 項；劇本 第四章.md 691、694 行、真結局.md 156 行；做法與紀錄 dive_plan.md。
// 自己一支檔，不改 flat_engine.js；捲動跟天燈長畫共用 vscroll.js，音效用 sfx.js 既有的聲音（不新增）。
//   按住往下潛、放開慢慢浮回水面（越深浮得越快一點），左右可小幅移動；沒有氧氣條、不會失敗。
//   小魚群（淺層）：點了散開再聚回來；按「呼喚」附近的魚群游到她身邊。
//   水母（中層）：點了發光。第四章只潛到這一層。
//   真結局才到最底：海龜（點了游過來讓她搭一段）、灰珊瑚（靠近按「上色」塗回顏色）、回憶捲軸第 6 張（靠近撿起，第六章　茶語）。
//   點過的生物收進全劇的小生物圖鑑（zukan.js，變數 creatures；第一版的 dive_seen 讀的時候併進去）。浮回水面停一下就上岸，回到進來的地方（?back=）。
// 狀態：Larch 變數優先（larch:init），本機存 StudioDB 'dive_state'；?reset=1 清掉。
import { stepToward, WALK_BLOCKED } from './walk_interaction.mjs';
import { sfx } from './sfx.js';
import { fit, follow, apply } from './vscroll.js';
import { createZukan } from './zukan.js';

const Q = new URLSearchParams(location.search);
const STILL = matchMedia('(prefers-reduced-motion: reduce)').matches || Q.get('still') === '1';
const FAST = Q.get('fast') === '1' ? 4 : 1;
const $ = id => document.getElementById(id);
const stage = $('stage'), art = $('art'), bg = $('bg'), fade = $('fade'), hint = $('hint'), callBtn = $('call'), upBtn = $('up'), toastEl = $('toast'), dialog = $('dialog');
const inFrame = (() => { try { return window.parent !== window; } catch (e) { return true; } })();
const send = m => { if (inFrame) try { parent.postMessage(m, '*'); } catch (e) {} };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v)), rnd = (a, b) => a + Math.random() * (b - a), truth = v => v === true || v === 1 || v === '1' || v === 'true';
const play = (name, ...a) => { try { sfx[name](...a); } catch (e) {} };
const loadImg = src => PageLoading.preload(src);

// 紙片圖檔（全部是模型畫好白紙邊的紙片，照全島大地圖的鯨魚、小船的做法直接用，不再加一圈白邊）
const IMG = {
  swim: '../art/sprites/dv_tea_swim.webp', float: '../art/sprites/dv_tea_float.webp', turtle: '../art/sprites/dv_turtle.webp', coral: '../art/sprites/dv_coral.webp', scroll: '../art/sprites/scroll.webp',
  fish: ['../art/sprites/dv_fish_0.webp', '../art/sprites/dv_fish_1.webp', '../art/sprites/dv_fish_2.webp'], jelly: ['../art/sprites/dv_jelly_0.webp', '../art/sprites/dv_jelly_1.webp'],
  notes: ['../art/sprites/note_0.webp', '../art/sprites/note_1.webp', '../art/sprites/note_2.webp', '../art/sprites/note_3.webp', '../art/sprites/note_4.webp', '../art/sprites/note_5.webp'],
};
const MEMORY6 = { title: '第六章　茶語', text: '對，我就是喜歡待在這裡。' };   // 真結局.md 157 行，原文

const S = window.dive = { state: 'loading', x: 0, y: 0, vy: 0, held: false, riding: false, cam: {}, maxDepth: 0, chapter: 'true', ch4: false, limitY: 0,
  seen: [], coral: false, memory6: false, events: { scatter: 0, glow: 0, call: 0, ride: 0, paint: 0, pick: 0, limit: 0 }, vars: {}, writes: {}, inited: false, doneAt: null, still: STILL };
const setState = s => { S.state = s; document.body.dataset.state = s; };
send({ type: 'larch:ready' });

// ── 狀態：Larch 變數 → 網址參數 → 本機 ──
const vars = {}, fromUrl = {};
for (const k of ['chapter', 'memories', 'memory6', 'creatures', 'dive_seen', 'coral_dive']) if (Q.has(k)) fromUrl[k] = Q.get(k);
Object.assign(vars, fromUrl);
const local = {};
async function loadLocal() {
  if (!window.StudioDB) return;
  try { if (Q.get('reset') === '1') { await StudioDB.remove('dive_state'); return; } const v = await StudioDB.get('dive_state'); if (v) Object.assign(local, v); } catch (e) {}
}
function setVars(v) {
  Object.assign(vars, v); Object.assign(S.writes, v); if (window.IslandBridge) window.IslandBridge.note(v); send({ type: 'larch:set', variables: v });
  Object.assign(local, v); if (window.StudioDB) StudioDB.set('dive_state', Object.assign({}, local)).catch(() => {});
}
const get = k => vars[k] ?? local[k];

// ── 載入 ──
let D, W, H, L, cam = { s: 1, Vw: 1536, Vh: 864, vx: 0, vy: 0, cx: null, cy: null };
const tea = { el: null, swim: null, float: null, h: 210, face: 1, ang: 0, pose: 'float' };
const schools = [], jellies = []; let turtle = null, coral = null, scroll = null, raysCv, raysG;
async function boot() {
  D = await PageLoading.json('../art/out/dive/flat.json'); W = D.width; H = D.height; L = D.layers;
  Object.assign(bg.style, { width: W + 'px', height: H + 'px' }); Object.assign(art.style, { width: W + 'px', height: H + 'px' });
  await Promise.all([PageLoading.image(bg), PageLoading.track('下潛存檔', loadLocal())]);
  await new Promise(ok => { if (S.inited || !inFrame) return ok(); const t = setTimeout(ok, 700); addEventListener('message', function on(e) { if ((e.data || {}).type === 'larch:init') { clearTimeout(t); ok(); } }); });
  S.chapter = String(get('chapter') || 'true'); S.ch4 = S.chapter === '4';
  S.limitY = S.ch4 ? L.mid_limit : L.floor_tea;
  zk = createZukan({ vars: () => Object.assign({}, local, vars), set: setVars, toast }); await zk.ready; S.seen = DIVE_KINDS.filter(k => zk.has(k)); S.coral = truth(get('coral_dive')); S.memory6 = truth(get('memory6'));
  // 光：水面下幾道黃昏的斜光，畫在一張小 canvas 上慢慢晃（只蓋上面那一段）
  raysCv = $('rays'); raysCv.width = W / 4; raysCv.height = L.rays_h / 4; Object.assign(raysCv.style, { width: W + 'px', height: L.rays_h + 'px' }); raysG = raysCv.getContext('2d');
  const sprites = [IMG.swim, IMG.float, ...IMG.fish, ...IMG.jelly, ...IMG.notes];
  if (!S.ch4) sprites.push(IMG.turtle, IMG.coral, ...(!S.memory6 ? [IMG.scroll] : []));
  // 先並行讀圖，組裝時沿用同一批 decode 結果。
  PageLoading.prepare('海底精靈圖', Promise.allSettled(sprites.map(loadImg)));
  // 茶語
  const [sw, fl] = await Promise.all([loadImg(IMG.swim), loadImg(IMG.float)]);
  tea.el = mk('tea'); tea.swim = addImg(tea.el, IMG.swim); tea.float = addImg(tea.el, IMG.float);
  tea.dims = { swim: [sw.width, sw.height], float: [fl.width, fl.height] };
  S.x = L.start_x; S.y = L.surface + L.rest;
  // 小魚群（淺層）
  for (const [i, c] of L.schools.entries()) {
    const sc = { i, kind: c.kind, cx: c.x, cy: c.y, home: [c.x, c.y], dir: c.dir || 1, rx: 150, ry: 70, len: c.len, fish: [], spread: 1, scatterT: 99, from: [0, 0], callT: 0, target: null, sway: rnd(0, 6) };
    const im = await loadImg(IMG.fish[c.kind]);
    for (let k = 0; k < c.n; k++) {
      const a = (k / c.n) * Math.PI * 2 + rnd(-0.3, 0.3), r = Math.sqrt(rnd(0.15, 1));
      const f = { ox: Math.cos(a) * r, oy: Math.sin(a) * r, ph: rnd(0, 6.28), sz: c.len * rnd(0.82, 1.1), el: mk('fish') };
      addImg(f.el, IMG.fish[c.kind]); f.w = f.sz; f.h = f.sz * im.height / im.width; size(f.el, f.w, f.h); sc.fish.push(f);
    }
    schools.push(sc);
  }
  // 水母（中層）
  for (const [i, j] of L.jellies.entries()) {
    const im = await loadImg(IMG.jelly[j.kind]); const el = mk('jelly'); const halo = document.createElement('i'); halo.className = 'halo'; el.append(halo); addImg(el, IMG.jelly[j.kind]);
    const h = j.h, w = h * im.width / im.height; size(el, w, h);
    jellies.push({ i, el, x: j.x, y: j.y, bx: j.x, by: j.y, w, h, ph: rnd(0, 6.28), glowT: -99, drift: rnd(-1, 1) });
  }
  // 真結局：海龜、灰珊瑚、捲軸
  if (!S.ch4) {
    const ti = await loadImg(IMG.turtle); const el = mk('turtle'); addImg(el, IMG.turtle); const w = L.turtle.w, h = w * ti.height / ti.width; size(el, w, h);
    turtle = { el, w, h, x: L.turtle.x0, y: L.turtle.y, dir: 1, mode: 'roam', t: 0, path: null };
    const ci = await loadImg(IMG.coral); const cel = mk('coral'); const gray = addImg(cel, IMG.coral); gray.className = 'gray'; const col = addImg(cel, IMG.coral); col.className = 'color';
    const cw = L.coral.w, ch = cw * ci.height / ci.width; size(cel, cw, ch);
    coral = { el: cel, col, x: L.coral.x, y: L.coral.y, w: cw, h: ch, r: S.coral ? 140 : 0, tag: tag('上色', () => paintCoral()) };
    cel.style.setProperty('--r', coral.r + '%');
    if (!S.memory6) {
      const si = await loadImg(IMG.scroll); const sel = mk('scroll'); const halo = document.createElement('i'); halo.className = 'halo'; sel.append(halo); addImg(sel, IMG.scroll);
      const sw2 = L.scroll.w, sh2 = sw2 * si.height / si.width; size(sel, sw2, sh2);
      scroll = { el: sel, x: L.scroll.x, y: L.scroll.y, w: sw2, h: sh2, tag: tag('撿起捲軸', () => pickScroll()) };
    }
  }
  art.append(tea.el);   // 茶語畫在最上面
  layout(); addEventListener('resize', layout);
  if (matchMedia('(pointer: coarse)').matches) hint.textContent = '按住下潛，放開上浮。點珊瑚或捲軸就會游過去';   // 手機沒有方向鍵
  follow(cam, W, H, S.x - cam.Vw / 2, S.y - cam.Vh * 0.42, 0);
  render(performance.now() / 1000);
  PageLoading.shown.then(() => {
    bindInput();
    setState('ready');
    play('splash');
    setTimeout(() => hint.classList.add('off'), 7000);
    last = performance.now(); requestAnimationFrame(frame);
  });
}
function mk(cls) { const d = document.createElement('div'); d.className = 'sp ' + cls; art.append(d); return d; }
function addImg(el, src) { const im = new Image(); im.src = src; im.alt = ''; im.draggable = false; el.append(im); return im; }
function size(el, w, h) { el.style.width = w + 'px'; el.style.height = h + 'px'; }
function place(el, x, y, w, h, extra = '') { el.style.transform = `translate3d(${(x - w / 2).toFixed(1)}px,${(y - h / 2).toFixed(1)}px,0)${extra}`; }
function tag(text, fn) { const b = document.createElement('button'); b.type = 'button'; b.className = 'tag'; b.textContent = text; b.hidden = true; b.addEventListener('pointerdown', e => { e.stopPropagation(); }); b.addEventListener('click', e => { e.stopPropagation(); swimTarget = null; fn(); }); art.append(b); return b; }
function layout() { fit(cam, W, H, stage.clientWidth || innerWidth, stage.clientHeight || innerHeight, 900); }
function toast(t) { toastEl.textContent = t; toastEl.classList.add('on'); clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.classList.remove('on'), 2200); }
function showScroll(title, text) { swimTarget = null; $('dialog-title').textContent = title; $('dialog-text').textContent = text; dialog.classList.add('on'); S.dialog = true; S.held = false; }
function closeScroll() { dialog.classList.remove('on'); S.dialog = false; }
dialog.addEventListener('click', closeScroll);
function note(x, y) { const im = new Image(); im.className = 'note'; im.src = IMG.notes[Math.floor(Math.random() * IMG.notes.length)]; im.alt = ''; im.style.left = x + 'px'; im.style.top = y + 'px'; im.style.setProperty('--dx', rnd(-30, 30) + 'px'); art.append(im); setTimeout(() => im.remove(), 2000); }
function bubble(x, y, r = rnd(6, 13)) { if (STILL) return; const b = document.createElement('i'); b.className = 'bub'; Object.assign(b.style, { left: (x - r) + 'px', top: (y - r) + 'px', width: 2 * r + 'px', height: 2 * r + 'px' }); b.style.setProperty('--dx', rnd(-24, 24) + 'px'); b.style.setProperty('--dy', -rnd(120, 220) + 'px'); b.style.setProperty('--t', rnd(1.6, 2.6) + 's'); art.append(b); setTimeout(() => b.remove(), 2700); }
const depth01 = y => clamp((y - L.surface) / (H - L.surface), 0, 1);
function tint(el, y) {   // 越深越藍、越暗一點；剛入水帶一點黃昏的暖色
  const d = depth01(y), warm = Math.max(0, 0.12 * (1 - d * 3)); el.style.setProperty('--tint', `brightness(${(1.04 - 0.24 * d).toFixed(3)}) saturate(${(1.02 - 0.18 * d).toFixed(3)}) sepia(${warm.toFixed(3)}) hue-rotate(${(-6 * d).toFixed(1)}deg)`);
}
const DIVE_KINDS = ['fish', 'jelly', 'turtle']; let zk = null;
function saw(kind) { if (!zk) return; zk.saw(kind); S.seen = DIVE_KINDS.filter(k => zk.has(k)); S.zk = zk.list(); }   // 只在第一次遇到時跳一句提示（zukan.js 裡）

// ── 操作 ──
let swimTarget = null;
let keyX = 0, keyDown = false, pointerHeld = false, steerX = null, last = 0, surfT = 0;
function artPt(e) { return { x: cam.vx + e.clientX / cam.s, y: cam.vy + e.clientY / cam.s }; }
function bindInput() {
  addEventListener('pointerdown', e => {
    if (e.isPrimary && e.button === 0) swimTarget = null;
  }, true);
  stage.addEventListener('pointerdown', e => {
    if (!e.isPrimary || e.button !== 0 || S.state !== 'ready' || S.dialog) return;
    const p = artPt(e); if (tapCreature(p)) return;
    pointerHeld = true; steerX = p.x; try { stage.setPointerCapture(e.pointerId); } catch (err) {}
  });
  stage.addEventListener('pointermove', e => { if (pointerHeld) steerX = artPt(e).x; });
  const up = () => { pointerHeld = false; steerX = null; };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up); stage.addEventListener('lostpointercapture', up);
  addEventListener('keydown', e => {
    if (S.dialog) { if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') { e.preventDefault(); closeScroll(); } return; }
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'W', 's', 'S', 'a', 'A', 'd', 'D', ' '].includes(e.key)) swimTarget = null;
    if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); keyDown = true; }
    if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); keyX = -1; }
    if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); keyX = 1; }
    if (e.key === 'c' || e.key === 'C') call();
    if (e.key === 'Enter') { e.preventDefault(); interactNear(); }
  });
  addEventListener('keyup', e => {
    if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') keyDown = false;
    if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && keyX < 0) keyX = 0;
    if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && keyX > 0) keyX = 0;
  });
  addEventListener('blur', () => { keyDown = pointerHeld = false; keyX = 0; swimTarget = null; });
  for (const b of [callBtn, upBtn]) b.addEventListener('pointerdown', e => e.stopPropagation());
  callBtn.addEventListener('click', () => { swimTarget = null; call(); }); upBtn.addEventListener('click', () => finish('up'));
}
function hitWhat(p) {   // 點到哪一個生物（或捲軸、珊瑚）；回 [種類, 物件]，沒點到回 null
  if (turtle && turtle.mode === 'roam' && Math.abs(p.x - turtle.x) < turtle.w * 0.5 && Math.abs(p.y - turtle.y) < turtle.h * 0.5) return ['turtle', turtle];
  for (const j of jellies) if (Math.hypot((p.x - j.x) / (j.w * 0.55), (p.y - j.y) / (j.h * 0.55)) < 1) return ['jelly', j];
  for (const sc of schools) if (Math.hypot((p.x - sc.cx) / (sc.rx * sc.spread + 50), (p.y - sc.cy) / (sc.ry * sc.spread + 40)) < 1) return ['fish', sc];
  if (scroll && Math.abs(p.x - scroll.x) < scroll.w * 0.6 && Math.abs(p.y - (scroll.y - scroll.h / 2)) < scroll.h * 1.2) return ['scroll', scroll];
  if (coral && Math.abs(p.x - coral.x) < coral.w * 0.5 && Math.abs(p.y - (coral.y - coral.h / 2)) < coral.h * 0.5) return ['coral', coral];
  return null;
}
function tapCreature(p) {
  const h = hitWhat(p); if (!h) return false; const [k, o] = h;
  if (k === 'turtle') turtleCome(); else if (k === 'jelly') glowJelly(o); else if (k === 'fish') scatter(o, p); else approachObject(k, o, p);
  return true;
}
S.hitAt = (sx, sy) => !!hitWhat({ x: cam.vx + sx / cam.s, y: cam.vy + sy / cam.s });   // 測試用：畫面座標那一點有沒有東西
S.tapAt = (x, y) => tapCreature({ x, y });

// ── 生物的反應 ──
function approachObject(kind, object, p) {
  if ((kind === 'coral' && S.coral) || S.riding) return;
  const reach = L[kind].reach;
  const interact = kind === 'scroll' ? pickScroll : () => paintCoral(p);
  if (Math.hypot(S.x - object.x, S.y - object.y) <= reach) return interact();
  swimTarget = {
    object, reach, interact,
    x: clamp(object.x, ...L.x_range),
    y: clamp(object.y, L.surface + L.rest, S.limitY),
  };
}
function finishApproach() {
  const target = swimTarget;
  if (!target) return;
  const { object, reach, x, y, interact } = target;
  if (Math.hypot(S.x - object.x, S.y - object.y) <= reach) {
    swimTarget = null;
    interact();
  } else if (S.x === x && S.y === y) {
    swimTarget = null;
    toast(WALK_BLOCKED);
  }
}
function scatter(sc, p) { sc.scatterT = 0; sc.from = [p ? p.x : sc.cx, p ? p.y : sc.cy]; S.events.scatter++; play('splash'); saw('fish'); }
function glowJelly(j) { j.glowT = performance.now() / 1000; j.el.classList.add('glow'); clearTimeout(j._t); j._t = setTimeout(() => j.el.classList.remove('glow'), 3200); S.events.glow++; play('twinkle'); saw('jelly'); }
function call() {
  if (S.state !== 'ready' || S.dialog) return; S.events.call++; play('hum', 3);
  for (let k = 0; k < 3; k++) setTimeout(() => note(S.x + rnd(-30, 30), S.y - tea.h * 0.6), k * 260);
  let came = 0;
  for (const sc of schools) if (Math.hypot(sc.cx - S.x, sc.cy - S.y) < 640) { sc.callT = 7; const side = sc.cx < S.x ? -1 : 1; sc.callOff = [side * (150 + 50 * came), -40 + 60 * came]; sc.target = true; came++; setTimeout(() => note(sc.cx, sc.cy - 40), 500); }   // 游到她身邊（她游走了也跟著）
  if (came) saw('fish'); else toast('附近沒有魚群');
  S.lastCall = came;
}
function turtleCome() {
  if (!turtle || turtle.mode !== 'roam' || S.riding) return; turtle.mode = 'come'; turtle.t = 0; S.events.ride++; play('squeak'); saw('turtle');
  turtle.from = [turtle.x, turtle.y];
}
function paintCoral(p) {
  if (!coral || S.coral) return;
  if (Math.hypot(S.x - coral.x, S.y - coral.y) > L.coral.reach) { toast('游到珊瑚旁邊再上色'); return; }
  S.coral = true; S.events.paint++; play('sparkle'); setVars({ coral_dive: 'true' });
  const mx = p ? clamp((p.x - (coral.x - coral.w / 2)) / coral.w * 100, 0, 100) : 50, my = p ? clamp((p.y - (coral.y - coral.h / 2)) / coral.h * 100, 0, 100) : 70;
  coral.el.style.setProperty('--mx', mx + '%'); coral.el.style.setProperty('--my', my + '%');
  const t0 = performance.now(); const step = now => { const k = clamp((now - t0) / (1400 / FAST), 0, 1); coral.r = 140 * k * k * (3 - 2 * k); coral.el.style.setProperty('--r', coral.r.toFixed(1) + '%'); if (k < 1) requestAnimationFrame(step); };
  requestAnimationFrame(step); coral.tag.hidden = true;
}
function pickScroll() {
  if (!scroll || S.memory6) return;
  if (Math.hypot(S.x - scroll.x, S.y - scroll.y) > L.scroll.reach) { toast('再靠近一點'); return; }
  S.memory6 = true; S.events.pick++; play('pick');
  const n = (Number(get('memories')) || 0) + 1; setVars({ memory6: 'true', memories: String(n) });
  scroll.el.remove(); scroll.tag.remove(); scroll = null; S.held = false; pointerHeld = keyDown = false;
  showScroll(MEMORY6.title, MEMORY6.text);
}
function interactNear() {
  if (scroll && Math.hypot(S.x - scroll.x, S.y - scroll.y) <= L.scroll.reach) return pickScroll();
  if (coral && !S.coral && Math.hypot(S.x - coral.x, S.y - coral.y) <= L.coral.reach) return paintCoral();
}

// ── 每一格 ──
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; const t = now / 1000;
  if (S.state === 'ready') step(dt, t);
  render(t);
  if (S.state !== 'done') requestAnimationFrame(frame);
}
function step(dt, t) {
  if (S.dialog) { S.vy = 0; follow(cam, W, H, S.x - cam.Vw / 2, S.y - cam.Vh * 0.42, dt, 4); return; }   // 展開捲軸時停在原地
  const held = !S.riding && (swimTarget ? swimTarget.y > S.y : pointerHeld || keyDown); S.held = held;
  // 上下：按住往下潛（加速到 330 px／秒），放開慢慢浮上來（110 px／秒起，越深越快一點）
  if (!S.riding) {
    const want = held ? 330 * FAST : -(110 + 0.06 * (S.y - L.surface)) * FAST;
    S.vy += (want - S.vy) * (1 - Math.exp(-dt * (held ? 2.4 : 1.6)));
    const y0 = S.y;
    S.y += S.vy * dt;
    if (swimTarget && (swimTarget.y - y0) * (swimTarget.y - S.y) <= 0) {
      S.y = swimTarget.y; S.vy = 0;
    }
    const top = L.surface + L.rest;
    if (S.y < top) { S.y = top; S.vy = Math.max(0, S.vy); }
    if (S.y > S.limitY) { S.y = S.limitY; S.vy = Math.min(0, S.vy); if (S.ch4 && held && !S.limitShown) { S.limitShown = true; S.events.limit++; toast('這次只潛到這裡'); } }
    if (S.ch4 && S.y < S.limitY - 260) S.limitShown = false;
    // 左右：鍵盤，或按住時往手指那邊游
    let vx = swimTarget ? clamp((swimTarget.x - S.x) * 3, -260, 260) : keyX * 260;
    if (pointerHeld && steerX !== null && Math.abs(steerX - S.x) > 36) vx = Math.sign(steerX - S.x) * Math.min(260, Math.abs(steerX - S.x) * 2.2);
    if (swimTarget) {
      const step = Math.max(1, Math.abs(vx)) * dt * FAST;
      S.x = stepToward(S.x, swimTarget.x, step);
      finishApproach();
    } else S.x = clamp(S.x + vx * dt * FAST, ...L.x_range);
    if (Math.abs(vx) > 20) tea.face = vx > 0 ? 1 : -1;
    S.vx = vx;
  }
  S.maxDepth = Math.max(S.maxDepth, S.y - L.surface);
  // 浮回水面：潛下去過之後，回到水面放開停 1.2 秒就上岸
  const atTop = S.y <= L.surface + L.rest + 2;
  upBtn.hidden = !atTop;
  if (atTop && S.maxDepth > 320 && !held && !S.dialog && !swimTarget) { surfT += dt; if (surfT > 1.2) finish('surfaced'); } else surfT = 0;
  // 氣泡
  if ((held || Math.abs(S.vy) > 80) && Math.random() < dt * 5) bubble(S.x + tea.face * 40, S.y - tea.h * 0.35);
  // 魚群
  for (const sc of schools) {
    sc.scatterT += dt;
    const st = sc.scatterT;   // 散開 0.45 秒、2.75 秒慢慢聚回來
    sc.spread = st < 0.45 ? 1 + 2.6 * (st / 0.45) : st < 3.2 ? 1 + 2.6 * (1 - (st - 0.45) / 2.75) ** 2 : 1;
    if (sc.callT > 0 && sc.target) { sc.callT -= dt; const tx = clamp(S.x + sc.callOff[0], 160, W - 160), ty = S.y + sc.callOff[1]; const k = 1 - Math.exp(-dt * 1.6); const nx = sc.cx + (tx - sc.cx) * k; sc.vx = (nx - sc.cx) / dt; sc.cx = nx; sc.cy += (ty - sc.cy) * k; if (sc.callT <= 0) { sc.target = null; sc.home[1] = clamp(sc.cy, 420, 1500); } }
    else { const v = 46 * sc.dir; sc.cx += v * dt; sc.vx = v; sc.cy += (sc.home[1] + Math.sin(t * 0.4 + sc.sway) * 40 - sc.cy) * (1 - Math.exp(-dt * 0.8)); if (sc.cx > W - 230) sc.dir = -1; if (sc.cx < 230) sc.dir = 1; }
    sc.face = Math.abs(sc.vx) > 4 ? Math.sign(sc.vx) : sc.face || 1;
  }
  // 水母：慢慢上下、輕輕左右
  for (const j of jellies) { j.x = j.bx + Math.sin(t * 0.25 + j.ph) * 60 * (STILL ? 0.3 : 1); j.y = j.by + Math.sin(t * 0.6 + j.ph) * 26 * (STILL ? 0.3 : 1); }
  // 海龜：平常在海底上面來回游；點了游過來讓她搭一段（5 秒），再放她下來
  if (turtle) turtleStep(dt, t);
  // 靠近才出現的名牌
  if (scroll) { const near = Math.hypot(S.x - scroll.x, S.y - scroll.y) <= L.scroll.reach; scroll.tag.hidden = !near; }
  if (coral) { const near = !S.coral && Math.hypot(S.x - coral.x, S.y - coral.y) <= L.coral.reach; coral.tag.hidden = !near; }
  // 鏡頭：茶語保持在畫面上方約 42% 的高度（往下潛時看得到下面），左右跟著她
  follow(cam, W, H, S.x - cam.Vw / 2, S.y - cam.Vh * 0.42, dt, 4);
}
function turtleStep(dt, t) {
  const T = turtle, R = L.turtle;
  if (T.mode === 'roam') { T.x += 70 * T.dir * dt; if (T.x > R.x1) T.dir = -1; if (T.x < R.x0) T.dir = 1; T.y = R.y + Math.sin(t * 0.7) * 14; T.face = T.dir; }
  else if (T.mode === 'come') {   // 游到她下面（她的腳下一點點）
    T.t += dt * FAST; const tx = clamp(S.x, R.x0, R.x1), ty = clamp(S.y + tea.h * 0.45, R.y - 700, R.y + 60); const k = 1 - Math.exp(-dt * 2.2 * FAST);
    T.face = tx > T.x ? 1 : -1; T.x += (tx - T.x) * k; T.y += (ty - T.y) * k;
    if (Math.hypot(tx - T.x, ty - T.y) < 12 || T.t > 3) { T.mode = 'ride'; T.t = 0; S.riding = true; swimTarget = null; S.vy = 0; pointerHeld = keyDown = false; T.rx0 = T.x; T.dir = T.x < W / 2 ? 1 : -1; play('splash'); }
  } else if (T.mode === 'ride') {   // 載著她游一段：往一邊游過去、繞回來，沿路冒泡
    T.t += dt * FAST; const k = clamp(T.t / 5, 0, 1), e = 0.5 - 0.5 * Math.cos(Math.PI * 2 * k);
    T.x = clamp(T.rx0 + T.dir * 420 * e, R.x0 - 120, R.x1 + 120); T.face = k < 0.5 ? T.dir : -T.dir; T.y = Math.min(T.y, R.y) + Math.sin(t * 2) * 0.6;
    S.x = T.x; S.y = T.y - T.h * 0.42; tea.face = T.face;
    if (Math.random() < dt * 4) bubble(T.x - T.face * T.w * 0.4, T.y);
    if (k >= 1) { T.mode = 'roam'; S.riding = false; S.vy = -40; S.x = clamp(S.x, L.x_range[0], L.x_range[1]); toast('海龜把她放下來了'); }
  }
}
function render(t) {
  // 茶語：往下潛用游泳那張，其他用浮著那張；搭海龜時趴在龜殼上
  const pose = S.riding ? 'swim' : S.vy > 70 ? 'swim' : 'float'; tea.pose = pose;
  const [iw, ih] = tea.dims[pose]; const hh = pose === 'swim' ? L.tea_h * 0.78 : L.tea_h; const ww = hh * iw / ih;
  tea.swim.style.display = pose === 'swim' ? '' : 'none'; tea.float.style.display = pose === 'float' ? '' : 'none';
  size(tea.el, ww, hh); tea.h = hh;
  const sway = STILL ? 0 : Math.sin(t * 1.7) * 3;
  const ang = S.riding ? -26 : pose === 'swim' ? 12 + sway : sway * 0.8 + clamp(-S.vy * 0.02, -4, 4);
  const bob = S.riding || STILL ? 0 : Math.sin(t * 1.3) * 5;
  place(tea.el, S.x, S.y + bob, ww, hh, ` scaleX(${tea.face}) rotate(${ang.toFixed(2)}deg)`); tint(tea.el, S.y);
  for (const sc of schools) for (const f of sc.fish) {
    const wob = STILL ? 0 : Math.sin(t * 2.2 + f.ph);
    let x = sc.cx + f.ox * sc.rx * sc.spread + wob * 10, y = sc.cy + f.oy * sc.ry * sc.spread + Math.cos(t * 1.7 + f.ph) * 7;
    if (sc.spread > 1.05) { const dx = x - sc.from[0], dy = y - sc.from[1], d = Math.hypot(dx, dy) || 1; x += dx / d * (sc.spread - 1) * 40; y += dy / d * (sc.spread - 1) * 30; }
    const face = sc.spread > 1.4 ? (f.ox >= 0 ? 1 : -1) : sc.face;
    place(f.el, x, y, f.w, f.h, ` scaleX(${face}) rotate(${(wob * 4).toFixed(1)}deg)`); tint(f.el, y); f.x = x; f.y = y;
  }
  for (const j of jellies) { const p = STILL ? 1 : 1 + Math.sin(t * 2.4 + j.ph) * 0.045; place(j.el, j.x, j.y, j.w, j.h, ` scale(${(2 - p).toFixed(3)},${p.toFixed(3)})`); tint(j.el, j.y); }
  if (turtle) { place(turtle.el, turtle.x, turtle.y, turtle.w, turtle.h, ` scaleX(${turtle.face || 1}) rotate(${(Math.sin(t * 1.1) * 2).toFixed(1)}deg)`); tint(turtle.el, turtle.y); }
  if (coral) { place(coral.el, coral.x, coral.y - coral.h / 2, coral.w, coral.h); tint(coral.el, coral.y); coral.tag.style.left = coral.x + 'px'; coral.tag.style.top = (coral.y - coral.h - 10) + 'px'; }
  if (scroll) { const fl = STILL ? 0 : Math.sin(t * 2) * 6; place(scroll.el, scroll.x, scroll.y - scroll.h / 2 + fl, scroll.w, scroll.h, ` rotate(${(Math.sin(t * 1.4) * 3).toFixed(1)}deg)`); tint(scroll.el, scroll.y); scroll.tag.style.left = scroll.x + 'px'; scroll.tag.style.top = (scroll.y - scroll.h - 30) + 'px'; }
  drawRays(t);
  apply(art, cam);
  S.cam = { s: cam.s, Vw: cam.Vw, Vh: cam.Vh, vx: cam.vx, vy: cam.vy };
  S.tea = { x: S.x, y: S.y, w: ww, h: hh, pose, face: tea.face };
  S.schools = schools.map(sc => ({ cx: sc.cx, cy: sc.cy, spread: sc.spread, called: sc.callT > 0, fish: sc.fish.map(f => [f.x, f.y]) }));
  S.jellies = jellies.map(j => ({ x: j.x, y: j.y, w: j.w, h: j.h, glow: j.el.classList.contains('glow') }));
  S.turtle = turtle && { x: turtle.x, y: turtle.y, w: turtle.w, h: turtle.h, mode: turtle.mode };
  S.coralR = coral ? coral.r : null; S.scroll = scroll && { x: scroll.x, y: scroll.y };
}
function drawRays(t) {   // 三道慢慢晃的暖色斜光（從右上方照下來），蓋在水面下那一段；在畫面外就不畫
  if (!raysG) return; const vis = cam.vy < L.rays_h; raysCv.style.display = vis ? '' : 'none'; if (!vis) return;
  const g = raysG, w = raysCv.width, h = raysCv.height; g.clearRect(0, 0, w, h);
  const top = (L.surface + 10) / 4;
  for (let k = 0; k < 3; k++) {
    const x0 = w * (0.62 + 0.09 * k) + (STILL ? 0 : Math.sin(t * 0.35 + k * 1.9) * 10), a = 0.10 + (STILL ? 0 : 0.05 * Math.sin(t * 0.8 + k * 2.3));
    const gr = g.createLinearGradient(0, top, 0, h); gr.addColorStop(0, `rgba(255,214,140,${a})`); gr.addColorStop(1, 'rgba(255,214,140,0)');
    g.fillStyle = gr; g.beginPath(); g.moveTo(x0, top); g.lineTo(x0 + 18, top); g.lineTo(x0 - h * 0.55 + 30, h); g.lineTo(x0 - h * 0.55 - 26, h); g.closePath(); g.fill();
  }
}

// ── 上岸：回到進來的地方 ──
function finish(reason) {
  if (S.state === 'done' || S.state === 'leaving') return;
  swimTarget = null; setState('leaving'); S.reason = reason; play('splash');
  const done = S.ch4 ? { c4_dive: 'true' } : { dive_done: 'true' }; setVars(done);
  const creatures = zk.list().join(',');
  if (creatures) setVars({ creatures });
  const payload = { reason, creatures, seen: S.seen.slice(), memory6: S.memory6, coral: S.coral, writes: Object.assign({}, S.writes) };
  if (!Q.get('back')) { if (window.IslandBridge) window.IslandBridge.complete('surfaced', payload); else send({ type: 'larch:complete', result: 'surfaced', payload }); }   // 從全島或海灘換頁進來的（有 back）：浮上來是回那一頁，這張卡還沒演完，不送完成
  window.__done = { result: 'surfaced', payload };
  fade.style.opacity = '1';
  setTimeout(() => {
    setState('done'); S.doneAt = performance.now();
    const back = Q.get('back');
    if (back && Q.get('stay') !== '1') {
      const u = new URL(back, location.href);
      for (const [k, v] of Object.entries(S.writes)) if (['memory6', 'memories', 'creatures', 'zukan_complete', 'coral_dive', 'dive_done', 'c4_dive'].includes(k)) u.searchParams.set(k, v);
      u.searchParams.set('diveDone', '1'); S.backTo = u.href; location.href = u.href;
    }
  }, 1000);
}

addEventListener('message', e => { const d = e.data || {}; if (d.type === 'larch:init') { S.inited = true; S.vars = d.variables || {}; const received = window.IslandBridge ? window.IslandBridge.merge(S.vars) : S.vars;
  const creatures = [...new Set([received.creatures, fromUrl.creatures, S.writes.creatures].flatMap(value => String(value || '').split(',')).filter(Boolean))].join(',');
  Object.assign(vars, received, fromUrl, S.writes, { creatures });
  if (zk) S.seen = DIVE_KINDS.filter(k => zk.has(k)); } });
PageLoading.track('海底場景組裝', boot()).then(() => PageLoading.finish()).catch(err => { console.error(err); setState('error'); S.error = String(err && err.message || err); fade.style.opacity = '0'; });
