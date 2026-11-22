import { createJoystick } from './movement_input.mjs';
import { horizontalInteraction, stepToward, WALK_BLOCKED } from './walk_interaction.mjs';
import { createIslandAffinity } from './island_affinity.mjs';
// 「一整張長畫」（作者 2026-11-13 定調：分層可以、不要視差，像故事插畫繪本，人物可以走動）：
// 底圖 art/out/<scene>/flat.jpg（中心框＋接力外延拼成一張）＋可有可無的前景遮擋 fg.png（同一張剪、同速度）。鏡頭跟著人水平捲、兩端夾住。
// 設定全部來自 art/out/<scene>/flat.json（flat.py 寫的：寬度、中心框位置、熱區、人物站位、腳底線、出口在哪一邊、CG）。
// 操作與橋接照 studio_web：方向鍵或 A、D、點地面走過去、手機搖桿、靠近熱區亮起、Enter 或點擊互動、larch:init／ready、IndexedDB 記位置。
// 網址參數：?scene=dawn|cape|beach、x=0.5（起點，長圖寬的比例）、walk=1|-1（自動走）、hud=0、mock=1。
import { CHARACTERS } from '../../../studio_web/studio_core.mjs';
import { paperize } from './paper.js';
const Q = new URLSearchParams(location.search); const SCENE = Q.get('scene') || 'dawn';
const META = await PageLoading.json(`../art/out/${SCENE}/flat.json`);
try {   // 紙感介面的九宮格（art/cut_ui.py 量的）：素材照原比例，顯示寬度＝原圖的 0.45 倍
  const UI = await PageLoading.json('../art/ui/ui.json'); const R = document.documentElement.style, K = 0.45;
  const set = (k, v) => { const s = UI[v]; if (!s) return; R.setProperty(`--${k}-slice`, s.slice.join(' ')); R.setProperty(`--${k}-width`, s.slice.map(n => (n * K).toFixed(0) + 'px').join(' ')); R.setProperty(`--${k}-bx`, ((s.slice[1] + s.slice[3]) * K).toFixed(0) + 'px'); R.setProperty(`--${k}-by`, ((s.slice[0] + s.slice[2]) * K).toFixed(0) + 'px'); };
  set('panel', 'ui_panel'); set('tag', 'ui_tag'); set('btn', 'ui_btn'); set('frame', 'ui_frame');
  // 紙框例外：九宮格切在透明開口的邊上（ui.json 的切法比開口寬，左右會多切進開口、上下會把開口邊的金線切掉，只剩轉角兩小段）。
  // 開口量自 ui_frame 的透明度：x 156 到 1083、y 139 到 660（原圖 1263×800）；test_frame.mjs 會拿素材重量一次比對。
  const F = UI.ui_frame, O = { l: 156, t: 139, r: 1084, b: 661 };
  if (F) { const sl = [O.t, F.w - O.r, F.h - O.b, O.l]; R.setProperty('--frame-slice', sl.join(' ')); R.setProperty('--frame-width', sl.map(n => (n * K).toFixed(2) + 'px').join(' ')); R.setProperty('--frame-bx', ((sl[1] + sl[3]) * K).toFixed(2) + 'px'); R.setProperty('--frame-by', ((sl[0] + sl[2]) * K).toFixed(2) + 'px'); R.setProperty('--frame-over', (8 * K).toFixed(2) + 'px'); }   // --frame-over：圖往紙邊底下多伸的量（素材 8 px）
} catch {}
const IMG = { width: META.width, height: META.height };
// 只顯示長畫高度的一段（flat.json 的 view：top 從哪裡開始、h 佔多高，都是長畫高的比例）。海灘的人照真實比例很小，鏡頭拉近到舞台那一帶；沒設就是整張（朝霞丘）。?view=full 看整張
const VIEW = Q.get('view') === 'full' ? { top: 0, h: 1 } : Object.assign({ top: 0, h: 1 }, META.view);
const FEET = META.feet_y, HERO_H = META.hero_h, NEARBY = 90;
const PX_PER_M = 370 / 1.4, WALK = 2.2 * PX_PER_M;    // 2.2 公尺每秒＝約 580 px/s，跟工作室畫面上的速度一樣
const WALK_X = META.walk;
const TEA = { still: '../../../sprites/tea_side_3h_cut.webp' };   // 長畫的茶語紙人：三頭身原圖 674×1439（跟晨、明、詩的 3h 紙人同一套）。fad982b 換成 81×160 的 tea_walk.png 是因為原圖沒進版控、乾淨的 checkout 找不到；縮小圖放大後糊、白邊（paperize 的 14 px）相對變粗，2026-11-16 原圖進版控後換回
const stage = document.getElementById('stage'), art = document.getElementById('art'), panel = document.getElementById('panel'), scrim = document.getElementById('scrim'), cg = document.getElementById('cg');
if (Q.get('hud') === '0') document.body.classList.add('nohud');
if (META.night) document.body.classList.add('night');
document.getElementById('label').textContent = META.name;
const inFrame = window.parent !== window && Q.get('mock') !== '1';
const startX = Q.has('x') ? Number(Q.get('x')) * IMG.width : (META.exit === 'right' ? IMG.width - 140 : 140);
const state = { x: startX, face: META.exit === 'right' ? -1 : 1 };
const gifts = {};   // 這次拿到的禮物（gift_chen…）；嵌進 Larch 時也寫回變數
let keyDir = Number(Q.get('walk')) || 0, pointerDir = 0, targetX = null, panelOpen = false, lastT = 0, scale = 1, larchVars = {}, player, hotEls = [], walkT = 0, flip = { from: 1, t: 1 }, sway = window.WalkSway.create();

async function person(src, hFrac, cls, face) {
  // 小紙人：白邊、紙紋、紙片影子都在 paperize 裡做；高度 hFrac 是原立繪的高，白邊另外多出來。?paper=0 關掉（對照用）
  const pp = Q.get('paper') === '0' ? await plainSprite(src) : await paperize(src); const d = document.createElement('div'); d.className = 'person ' + cls; d.style.top = (FEET * 100) + '%'; d.style.setProperty('--facing', face);
  const hOrig = hFrac * IMG.height, s = hOrig / (pp.height - pp.pad * 2); d.style.height = (pp.height * s / IMG.height * 100) + '%'; d.style.setProperty('--pad', (pp.pad * s / IMG.height * 100) + '%');
  const sh = document.createElement('img'); sh.className = 'shadow'; sh.src = pp.shadow; sh.alt = ''; sh.draggable = false;
  const im = document.createElement('img'); im.className = 'sheet'; im.src = pp.src; im.alt = ''; im.draggable = false; d.append(sh, im); return d;
}
async function build() {
  const bg = document.createElement('img'); bg.className = 'layer'; bg.src = `../art/out/${SCENE}/flat.webp`; bg.alt = META.name; bg.draggable = false; art.appendChild(bg);
  for (const n of META.npcs) { const p = await person(n.img, n.h, 'npc ' + n.id, n.face); p.style.left = (n.x / IMG.width * 100) + '%'; art.appendChild(p); }
  player = await person(TEA.still, HERO_H, 'tea', state.face); art.appendChild(player);
  if (META.fg) { const fg = document.createElement('img'); fg.id = 'fg'; fg.className = 'layer'; fg.src = `../art/out/${SCENE}/fg.webp`; fg.alt = ''; fg.draggable = false; art.appendChild(fg); }
  for (const h of META.hot) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hotspot'; b.dataset.id = h.id; b.dataset.name = h.name; b.setAttribute('aria-label', h.name);
    Object.assign(b.style, { left: h.x / IMG.width * 100 + '%', top: h.y * 100 + '%', width: h.w / IMG.width * 100 + '%', height: h.h * 100 + '%' });
    bindHotspot(b, h); art.appendChild(b); hotEls.push(b);
  }
}
async function plainSprite(src) { const im = await PageLoading.preload(src); document.body.classList.add('flatpaper'); return { src, shadow: 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', pad: 0, width: im.width, height: im.height }; }
function resize() { scale = innerHeight / (IMG.height * VIEW.h); art.style.width = (IMG.width * scale) + 'px'; art.style.height = (100 / VIEW.h) + '%'; art.style.top = (-VIEW.top / VIEW.h * 100) + '%'; render(); }
function camX() { const vw = innerWidth / scale; return Math.max(0, Math.min(IMG.width - vw, state.x + camShift - vw / 2)); }
function render() {
  art.style.transform = `translateX(${-camX() * scale}px)`;
  player.style.left = (state.x / IMG.width * 100) + '%';
  // 紙片翻面：轉向時 scaleX 從舊方向壓到 0 再張開到新方向（0.22 秒）；走路晃動跟工作室同一組（studio_web/walk_sway.js），停下來不晃
  const f = flip.t < 1 ? (flip.t < 0.5 ? flip.from * (1 - flip.t * 2) : state.face * ((flip.t - 0.5) * 2)) : state.face;
  player.style.setProperty('--facing', f.toFixed(3)); window.WalkSway.css(player, sway);
  const n = nearest(); for (const b of art.querySelectorAll('.hotspot')) { b.classList.toggle('nearby', b.dataset.id === n); const h = META.hot.find(x => x.id === b.dataset.id); if (h && typeof h.name === 'function') b.dataset.name = h.name(); }
}
const cgClosedHooks = [];
// ar：圖要露出來那一塊的寬÷高，紙框開口跟著這個比例開；trim：圖檔四邊要藏到紙邊底下的留白（上右下左，各佔圖高、圖寬的比例）
function showCg(under = false, src, ar = 1.5, trim = [0, 0, 0, 0]) { cancelClickWalk(); document.getElementById('cg-img').src = src || META.cg; cg.style.setProperty('--cg-ar', String(ar)); ['t', 'r', 'b', 'l'].forEach((k, n) => cg.style.setProperty('--cg-trim-' + k, String(trim[n] || 0))); cg.classList.toggle('under', under);
  cg.style.display = 'block'; requestAnimationFrame(() => requestAnimationFrame(() => cg.classList.add('on'))); sfxPaper(); }
function hideCg() { if (cg.style.display !== 'block') return; cg.classList.remove('on'); cg.dataset.closedAt = String(Date.now()); setTimeout(() => { cg.style.display = 'none'; cg.classList.remove('under'); }, 600); for (const f of cgClosedHooks) f(); }
function cgOpen() { return cg.style.display === 'block' && cg.classList.contains('on'); }
function onCgClosed(f) { cgClosedHooks.push(f); }
let camShift = 0, camShiftTarget = 0, locked = false;
function setCamShift(px) { camShiftTarget = px; }
function lock(v) { locked = v; document.body.classList.toggle('locked', v); if (v) { keyDir = pointerDir = 0; cancelClickWalk(); } }
let sfxPaper = () => {}; PageLoading.prepare('sfx.js', import('./sfx.js').then(m => { sfxPaper = () => m.sfx.paper(); }));
function showScroll(who, text) { cancelClickWalk(); const sc = document.getElementById('scroll'); sc.querySelector('b').textContent = who; sc.querySelector('p').textContent = text; sc.style.display = 'block'; sc.classList.remove('open'); void sc.offsetWidth; sc.classList.add('open'); }
function toast(text) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = text; document.body.appendChild(t); setTimeout(() => t.classList.add('on'), 20); setTimeout(() => { t.classList.remove('on'); setTimeout(() => t.remove(), 400); }, 1800); }
const BR = window.IslandBridge;
const freeAffinity = createIslandAffinity(BR, Q, () => larchVars, () => ctl.chapter);
const scenePerson = { dawn: 'chen', cape: 'ming', beach: 'shi' }[SCENE];
// 場景內的道具、動畫和關卡暫存由 ctl.store 寫到 islandSave，換白板時才需要獨立的劇情變數。
const LOCAL_SCENE_KEYS = new Set([
  'c4_call', 'c4_called', 'c4_dolphin', 'c4_done', 'c4_intro', 'c4_melody', 'chapter4_beach_done',
  'hermit_out_c4', 'hermit_out_c7', 'hermit_out_te', 's3_shell_count', 's3_shells_submitted', 'shells_c4',
  'c5_cg', 'c5_done', 'c5_intro', 'c5_stopped', 'c5_taught', 'chapter5_cape_done', 'clock_dir',
  'gears_c5', 's4_gear_count', 's4_gears_submitted', 'lantern_c5', 'lantern_c7', 'lantern_te', 'te_flipped', 'te_stopped', 'te_talk',
  'c7_chen', 'c7_ming', 'c7_shi', 'accompanied_chen', 'accompanied_ming', 'accompanied_shi',
  'c7g_1', 'c7g_2', 'c7g_3', 'c7g_done', 'c7s_done', 'c7s_pink', 'shells_c7', 'shells_c7_auto'
]);
function larchSet(vars) {
  Object.assign(larchVars, vars);
  if (inFrame) {
    BR.note(vars);
    const story = Object.fromEntries(Object.entries(vars).filter(([key]) => !LOCAL_SCENE_KEYS.has(key)));
    if (Object.keys(story).length) BR.set(story);
  }
}
function nearest() { let best = null; for (const h of META.hot) { if (h.hidden) continue; const d = Math.abs(h.x + h.w / 2 - state.x); if (d < NEARBY + h.w / 2 && (!best || d < best.d)) best = { id: h.id, d }; } return best && best.id; }
// 對話：照劇本一句句推進（點對話框或 Enter），{choice} 出選項泡泡，選完接共通句。拿過禮物後再講就是 done 那幾句
const dlg = { steps: [], i: 0, after: [], onLine: null };
function openDialogue(steps, after, onLine) { sfxPaper(); dlg.steps = steps.slice(); dlg.i = 0; dlg.after = after || []; dlg.onLine = onLine || null; panel.classList.add('on'); scrim.classList.add('on'); document.body.classList.add('panel-open'); panelOpen = true; keyDir = pointerDir = 0; cancelClickWalk(); showStep(); }
function showStep() {
  const ch = document.getElementById('choices'); ch.replaceChildren(); panel.classList.remove('choosing');
  if (dlg.i >= dlg.steps.length) { closePanel(); for (const f of dlg.after) f(); return; }
  const st = dlg.steps[dlg.i];
  if (st.choice) {   // 選項：選項前最後一句連同名牌留在框裡（像寶箱怪的選項卡），選項排在下面
    panel.classList.add('choosing');
    for (const [label, lines] of st.choice) { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; b.addEventListener('click', ev => { ev.stopPropagation(); dlg.steps.splice(dlg.i, 1, ...lines); showStep(); }); ch.appendChild(b); }
    return;
  }
  const [who, text] = st; document.getElementById('panel-title').textContent = who; document.getElementById('panel-text').textContent = text; panel.classList.toggle('narration', !who); dlg.i += 1;
  if (dlg.onLine) dlg.onLine(text);
}
function advance() { if (!panelOpen || panel.classList.contains('choosing')) return; showStep(); }
panel.addEventListener('click', advance);
function closePanel() { panel.classList.remove('on', 'choosing'); scrim.classList.remove('on'); document.body.classList.remove('panel-open'); panelOpen = false; }
function interact(id, point) { const h = META.hot.find(x => x.id === id); if (!h) return; if (h.fn) return h.fn(point); return runHot(h); }
let clickMovement = { bounds: () => WALK_X };
const clickWalk = horizontalInteraction({
  position: () => state.x,
  bounds: () => clickMovement.bounds(),
  available: h => !locked && !panelOpen && !PageLoading.loading && !h?.hidden &&
    META.hot.includes(h) && (clickMovement.available?.() ?? true),
  interact: (h, point) => interact(h.id, point),
  blocked: () => toast(WALK_BLOCKED),
  resetMovement: () => clickMovement.cancel?.(),
});
function cancelClickWalk() {
  clickWalk.cancel();
  targetX = null;
}
const joystick = createJoystick({
  enabled: () => !PageLoading.loading && !panelOpen && !locked && cg.style.display !== 'block' && document.getElementById('scroll').style.display !== 'block',
  onStart: () => { cancelClickWalk(); keyDir = pointerDir = 0; },
  onTouch: touch => {
    const move = touch ? '左右拖動搖桿，也可以點地面或物件走過去' : '方向鍵移動，點地面或物件走過去';
    document.getElementById('hint').textContent = SCENE === 'cape' && !touch ? move + '。按 T 停下時間' : move;
  },
});
function manualDirection() { return joystick.active ? joystick.x : keyDir || pointerDir; }
addEventListener('blur', () => { keyDir = pointerDir = 0; });

function bindHotspot(button, hot) {
  button.addEventListener('pointerdown', e => { e.stopPropagation(); });
  button.addEventListener('click', e => {
    e.stopPropagation();
    cancelClickWalk();
    if (e.detail === 0) return interact(hot.id);
    keyDir = pointerDir = 0; joystick.release();
    clickWalk.begin(hot, { x: camX() + e.clientX / scale, y: VIEW.top + VIEW.h * e.clientY / innerHeight });
  });
}
function returnToIsland() {
  const back = Q.get('back');
  if (!back) return false;
  const url = new URL(back, location.href);
  if (inFrame) larchSet({ [SCENE + '_visited']: 'true' });
  url.searchParams.set('island_next_scene', 'island'); url.searchParams.set('from', SCENE);
  for (const [name, owned] of Object.entries(gifts)) if (owned) url.searchParams.set(name, 'true');
  const count = ['gift_chen', 'gift_shi', 'gift_ming']
    .filter(name => url.searchParams.get(name) === 'true').length;
  if (count) url.searchParams.set('gifts', String(count));
  location.href = url.href;
  return true;
}
// 整段做完要寫回 Larch 的值（新版/build/build.py 的 _island_write_values；正式網頁沒有人代寫，所以走到出口時自己寫）。
// 鍵＝章:模式:場景。主線沒做完時各場景自己擋出口，走得到這裡就是做完了。chapter 不寫（會讓後面的卡讀到舊的章）
const DONE_WRITES = {
  '3:main:dawn': { ch3_done: 'true', chapter3_dawn_done: 'true', ability_color: 'true' },
  '4:main:beach': { ch4_done: 'true', ability_call: 'true' },
  '5:main:cape': { ch5_done: 'true', ability_time: 'true', trialKnown: 'true' },
  '7:day27:dawn': { chapter7_garden_done: 'true' },
  '7:day28:beach': { chapter7_shells_done: 'true', chapter7_shell_count: '23' },
};
function runHot(h) {
  const id = h.id;
  if (h.cg) { showCg(); return; }
  if (id === 'exit') {
    const done = DONE_WRITES[`${ctl.chapter}:${ctl.mode}:${SCENE}`]; if (inFrame && done) larchSet(done);
    if (returnToIsland()) return;
    if (inFrame) { larchSet({ [SCENE + '_visited']: 'true' }); BR.complete('return_island', { scene: SCENE }); }
    else openDialogue([['', '（回全島：嵌進 Larch 時會回到全島地圖的入口外一格。）']]);
    return;
  }
  if (h.script) {
    const got = h.gift && (larchVars[h.gift] === 'true' || gifts[h.gift]);
    if (got && h.done) openDialogue(h.done);
    else openDialogue(h.script, h.gift ? [() => { if (!got && h.gift === 'gift_chen') ctl.completeFreeInteraction(); gifts[h.gift] = true; if (inFrame) larchSet({ [h.gift]: 'true', gifts: String(Object.keys(gifts).length) }); }] : []);
  }
}
scrim.addEventListener('click', advance); cg.addEventListener('click', () => { if (!cg.classList.contains('under')) hideCg(); }); document.getElementById('scroll').addEventListener('click', e => { e.currentTarget.style.display = 'none'; });
function step(dt) {
  camShift += (camShiftTarget - camShift) * Math.min(1, dt * 2.2); if (Math.abs(camShiftTarget - camShift) > 0.5) render();
  if (PageLoading.loading || locked) { player.classList.remove('walking'); window.WalkSway.step(sway, dt, false); render(); return; }
  const approaching = clickWalk.active;
  const destination = clickWalk.destination();
  if (destination !== null && clickMovement.move) clickMovement.move(destination);
  if (locked || panelOpen) { player.classList.remove('walking'); return; }
  const target = approaching ? (clickMovement.move ? null : destination) : targetX;
  let dir = manualDirection();
  if (target !== null) dir = Math.sign(target - state.x);
  if (!approaching && targetX !== null && Math.abs(targetX - state.x) < 0.01) { targetX = null; dir = manualDirection(); }
  const walking = !!dir && !panelOpen; player.classList.toggle('walking', walking); walkT += dt; if (flip.t < 1) flip.t = Math.min(1, flip.t + dt / 0.22);
  if (!walking) window.WalkSway.step(sway, dt, false);
  if (walking) {
    const face = Math.sign(dir);
    if (face !== state.face) { flip = { from: state.face, t: 0 }; state.face = face; }
    const x0 = state.x;
    const next = target === null ? state.x + dir * WALK * dt : stepToward(state.x, target, WALK * dt);
    state.x = Math.max(WALK_X[0], Math.min(WALK_X[1], next)); window.WalkSway.step(sway, dt, state.x !== x0);
    const atExit = META.exit === 'right' ? (state.x >= WALK_X[1] - 1 && dir > 0) : (state.x <= WALK_X[0] + 1 && dir < 0);
    if (atExit && !approaching) { keyDir = pointerDir = 0; joystick.release(); targetX = null; interact('exit'); }
  }
  render();
}
const frameHooks = [];
function frame(t) { const dt = Math.min((t - lastT) / 1000, .05); lastT = t; joystick.update(); step(dt); for (const f of frameHooks) f(dt); requestAnimationFrame(frame); }
addEventListener('keydown', e => {
  if (panelOpen) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); advance(); } return; }
  if (cg.style.display === 'block' && !cg.classList.contains('under')) { if (!cg.classList.contains('on')) return; hideCg(); return; }
  const scEl = document.getElementById('scroll'); if (scEl.style.display === 'block') { scEl.style.display = 'none'; return; }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); cancelClickWalk(); joystick.release(); keyDir = -1; }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); cancelClickWalk(); joystick.release(); keyDir = 1; }
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (locked) return; const k = nearest(); if (k) { cancelClickWalk(); interact(k); } }
});
addEventListener('keyup', e => { if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && keyDir < 0) keyDir = 0; if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && keyDir > 0) keyDir = 0; });
addEventListener('pointerdown', () => { if (clickWalk.active) cancelClickWalk(); }, true);
addEventListener('keydown', e => {
  if (clickWalk.active && ['arrowup', 'arrowdown', 'w', 's'].includes(e.key.toLowerCase())) cancelClickWalk();
}, true);
let down = null;
stage.addEventListener('pointerdown', e => {
  if (!e.isPrimary || e.button !== 0) return;
  cancelClickWalk();
  if (down) clearTimeout(down.timer);
  down = { id: e.pointerId, x: e.clientX, y: e.clientY, held: false };
  if (e.pointerType === 'mouse') down.timer = setTimeout(() => { if (down) { down.held = true; pointerDir = e.clientX < innerWidth / 2 ? -1 : 1; targetX = null; } }, 180); });
stage.addEventListener('pointermove', e => { if (down?.id === e.pointerId && down.held) pointerDir = e.clientX < innerWidth / 2 ? -1 : 1; });
function up(e) {
  if (down?.id !== e.pointerId) return; clearTimeout(down.timer); const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  if (e.type === 'pointerup' && !down.held && moved < 14 && !panelOpen && e.clientY >= (FEET - 0.12 - VIEW.top) / VIEW.h * innerHeight) {
    const [left, right] = clickMovement.bounds();
    targetX = Math.max(left, Math.min(right, camX() + e.clientX / scale));
  }
  down = null; pointerDir = 0;
}
stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
addEventListener('resize', resize);
// larch:init：變數放進同一個物件（各場景拿的是這個物件），同一張卡裡換頁前寫過的值蓋回去；場景要等它到了才裝
let sceneAssembled = false;
let initArrived; const initWait = new Promise(ok => { initArrived = ok; });
addEventListener('message', e => { const d = e.data || {}; if (d.type === 'larch:init') { Object.assign(larchVars, BR.merge(d.variables || {})); initArrived(); if (sceneAssembled) freeAffinity.refresh(); } });
if (inFrame) parent.postMessage({ type: 'larch:ready' }, '*');
// 這一頁是哪一章、第幾步（island_bridge.js；規格在 ../_島段步驟清單.md）。cut()：做到要切回 Larch 對話卡的那一步
const C7_KEYS = ['chen', 'shi', 'ming'];
const C7 = { chen: { name: '晨', scene: 'dawn', done: 'ch7DoneC', later: '好。明天再來找我。我在這裡畫畫。', doneLine: '去吧。他們在等妳。' },
  shi: { name: '詩', scene: 'beach', done: 'ch7DoneS', later: '欸～今天不是我喔？好啦，明天再來找我。', doneLine: '我已經被妳陪過了啦，去找他們。' },
  ming: { name: '明', scene: 'cape', done: 'ch7DoneM', later: '嗯。明天再來找我。', doneLine: '我這邊陪過了。去吧。' } };
const ctl = { embedded: inFrame, resume: Q.get('resume') === '1', startX: null, chapter: 'true', mode: 'main', step: 1, stepVar: null,
  cut(returnStep, payload = {}) { lock(true); BR.setStep(ctl.stepVar, returnStep); BR.fadeOut(); window.dawnHill.cut = { returnStep, payload }; setTimeout(() => BR.complete('to_dialogue', Object.assign({ scene: SCENE, returnStep }, payload)), 520); },
  setStep(n) { BR.setStep(ctl.stepVar, n); },
  completeFreeInteraction() { if (scenePerson && !BR.done) freeAffinity.award(scenePerson); },
  truth: v => v === true || v === 1 || v === '1' || v === 'true',
  // 第七章評審週（第 24～26 天）：這一位陪過了沒（前幾天陪的看 ch7DoneC／M／S，今天陪的看回接步驟與 island_next_scene）
  c7Done(key) { return ctl.truth(larchVars[C7[key].done]) || larchVars['c7_' + key] === 'true' || (ctl.step >= 4 && larchVars.island_next_scene === C7[key].scene); },
  // 走到那個人面前：陪過了只講一句；還沒就出「今天陪你／明天再來」（台詞照劇本第七章，一字不改）。選今天陪你 → 切回對話卡，回接第 4 步
  c7Ask(key, save, standalone) { const c = C7[key];
    if (ctl.c7Done(key)) return openDialogue([[c.name, c.doneLine]]);
    if (C7_KEYS.some(k => k !== key && ctl.step >= 4 && larchVars.island_next_scene === C7[k].scene)) return openDialogue([[c.name, c.later]]);   // 今天已經陪了別人
    document.getElementById('panel-title').textContent = ''; document.getElementById('panel-text').textContent = '';
    const pick = `（今天陪${c.name}。）`;
    openDialogue([{ choice: [['今天陪你', [['', pick]]], ['明天再來', [[c.name, c.later]]]] }], [], line => { if (line !== pick) return;
      if (!inFrame) { if (standalone) standalone(); return; }
      save({ ['c7_' + key]: 'true', island_next_scene: c.scene }); ctl.cut(4, { person: key }); }); },
  c7Note() { if (ctl.chapter !== '7' || ctl.mode !== 'review') return; let el = document.getElementById('c7note'); if (!el) { el = document.createElement('div'); el.id = 'c7note'; document.body.appendChild(el); }
    el.textContent = C7_KEYS.map(k => C7[k].name + (ctl.c7Done(k) ? ' ✓' : '')).join('　'); },
  // 各場景的存檔：只記這一頁自己寫過的鍵（整包變數都存會把 islandSave 塞滿）。讀回來時，init 沒給或給空值的才用存的
  async store(key, st, reset) { const mine = {};
    if (window.StudioDB) { try { if (reset) await StudioDB.remove(key); else { const saved = await StudioDB.get(key); if (saved) for (const k in saved) { mine[k] = saved[k]; if (st[k] === undefined || st[k] === null || st[k] === '') st[k] = saved[k]; } } } catch {} }
    return vars => { Object.assign(st, vars); Object.assign(mine, vars); larchSet(vars); if (window.StudioDB) StudioDB.set(key, Object.assign({}, mine)).catch(() => {}); }; } };
async function start() {
  await build();
  if (inFrame) await Promise.race([initWait, new Promise(ok => setTimeout(ok, 2500))]);
  Object.assign(ctl, BR.context(inFrame ? larchVars : Object.assign({}, larchVars, Object.fromEntries(Q))));
  freeAffinity.refresh();
  if (SCENE === 'dawn') { try { const m = await PageLoading.track('dawn_play.js', import('./dawn_play.js')); await m.install({ art, IMG, META, state, paperize, openDialogue, hot: META.hot, larchSet, vars: larchVars, gifts, player, render, ctl, showCg, hideCg, cgOpen, onCgClosed, showScroll, toast, runHot, camX, getScale: () => scale, onFrame: f => frameHooks.push(f), frameHooks, setCamShift, bindHotspot, lock }); } catch (e) { console.error('dawn_play', e); } }
  if (SCENE === 'beach') { try { const m = await PageLoading.track('beach_play.js', import('./beach_play.js')); await m.install({ art, IMG, META, VIEW, state, paperize, openDialogue, hot: META.hot, larchSet, vars: larchVars, gifts, player, render, ctl, showCg, hideCg, cgOpen, onCgClosed, showScroll, toast, runHot, camX, getScale: () => scale, onFrame: f => frameHooks.push(f), frameHooks, setCamShift, bindHotspot, lock, isLocked: () => locked, panelOpen: () => panelOpen, setClickMovement: movement => { clickMovement = movement; }, cancelClickWalk }); } catch (e) { console.error('beach_play', e); } }
  if (SCENE === 'cape') { try { const m = await PageLoading.track('cape_play.js', import('./cape_play.js')); await m.install({ art, IMG, META, VIEW, state, paperize, openDialogue, hot: META.hot, larchSet, vars: larchVars, gifts, player, render, ctl, showCg, hideCg, cgOpen, onCgClosed, showScroll, toast, runHot, camX, getScale: () => scale, onFrame: f => frameHooks.push(f), frameHooks, setCamShift, bindHotspot, lock, isLocked: () => locked, panelOpen: () => panelOpen, setClickMovement: movement => { clickMovement = movement; }, cancelClickWalk }); } catch (e) { console.error('cape_play', e); } }
  sceneAssembled = true;
  PageLoading.shown.then(() => { document.body.dataset.ready = '1'; });
  if (window.StudioDB && !Q.has('x')) { try { const v = await StudioDB.get('flat_x_' + SCENE); if (Number.isFinite(v)) state.x = v; } catch {} }
  if (ctl.startX !== null) { state.x = ctl.startX; ctl.startX = null; }   // 回接：站回那個人旁邊
  ctl.c7Note();
  const savePos = () => window.StudioDB ? StudioDB.set('flat_x_' + SCENE, state.x).catch(() => {}) : null;
  resize(); setInterval(() => { if (!BR.done) savePos(); }, 2000); BR.beforeComplete(savePos); requestAnimationFrame(frame);
}
const sceneReady = start();
PageLoading.track(`長畫組裝：${SCENE}`, sceneReady).then(() => PageLoading.finish()).catch(console.error);
window.dawnHill = { ctl, get x() { return state.x / IMG.width; }, set x(v) { state.x = v * IMG.width; cancelClickWalk(); render(); }, interact, runHot, gifts, characters: CHARACTERS,
  closeAll() { closePanel(); hideCg(); document.getElementById('scroll').style.display = 'none'; lock(false); } };
