import { horizontalInteraction, hintBlocked, stepToward } from './walk_interaction.mjs';
// 朝霞丘「工作室模式」：一個畫面＝一張完整的畫（不拆層、不捲動），畫等比縮放置中（studio_web 轉身版的 fitArt），
// 角色在畫面內左右走，走到邊緣（或按 ‹ ›）快速平移加淡入切到相鄰那張（studio_web 的 turn）。
// 三個畫面：左＝櫻花林與進場小路（wide_left 完整版）、中＝03 原圖、右＝梯田到海（wide_right 完整版）。
// 操作與橋接照 studio_web：方向鍵或 A、D、點地面走過去、手機按住左右半邊、靠近熱區亮起、Enter 或點擊互動、larch:init／ready、IndexedDB 記位置。
// 網址參數：?scene=left|center|right、x=0.5、hud=0、mock=1。
import { CHARACTERS } from '../../../studio_web/studio_core.mjs';
const Q = new URLSearchParams(location.search);
const FRAME = { width: 1536, height: 1024 };
const FEET = 0.80, HERO_H = 0.41, CHEN_H = 0.46;      // 2026-11-13 比例試配：三頭身真實比例 41%，晨 46%
const PX_PER_M = 370 / 1.4, WALK = 3.4 * PX_PER_M;     // 03 的畫架 1.4 公尺＝370 px；走路 340 公分每秒（工作室）
const NEARBY = 0.06;
// 熱區 x 用畫面寬的比例。左右兩張是從外延圖裁的（左：切掉右 12%；右：切掉左 7%），座標已換算。
const SCENES = [
  { key: 'left', name: '朝霞丘・櫻花林', image: '../art/out/scene_left.webp', walk: [0.05, 0.97], chen: 0.76,
    hotspots: [{ id: 'exit', name: '回全島', x: 0.00, y: 0.55, w: 0.08, h: 0.40 }, { id: 'chen', name: '跟晨說話', x: 0.70, y: 0.42, w: 0.11, h: 0.40 }, { id: 'easel', name: '看畫布', x: 0.79, y: 0.47, w: 0.15, h: 0.34 }] },
  { key: 'center', name: '朝霞丘', image: '../art/out/scene_03.webp', fg: '../art/out/fg_03.webp', walk: [0.03, 0.97], chen: 0.14,
    hotspots: [{ id: 'chen', name: '跟晨說話', x: 0.08, y: 0.40, w: 0.11, h: 0.41 }, { id: 'easel', name: '看畫布', x: 0.19, y: 0.43, w: 0.15, h: 0.37 }, { id: 'bench', name: '坐下看海', x: 0.37, y: 0.68, w: 0.20, h: 0.14 }] },
  { key: 'right', name: '朝霞丘・海邊', image: '../art/out/scene_right.webp', walk: [0.03, 0.95], chen: null, hotspots: [] },
];
const TALK = { chen: { title: '晨', text: ['這次是我自己看到的。', '太陽從那邊出來的時候，整片花會先亮一秒。'], note: '正式版接劇本 4-1 那段對話。' },
               easel: { title: '畫架', text: ['畫布上只有一層淡淡的粉橘。'], note: '之後接「一種顏色」。' } };
const stage = document.getElementById('stage'), panel = document.getElementById('panel'), scrim = document.getElementById('scrim'), cg = document.getElementById('cg'), label = document.getElementById('label');
if (Q.get('hud') === '0') document.body.classList.add('nohud');
const inFrame = window.parent !== window && Q.get('mock') !== '1';
const state = { scene: Q.get('scene') || 'left', x: Number(Q.get('x')) || 0.12, face: 1 };
let active = null, player = null, keyDir = 0, pointerDir = 0, targetX = null, busy = false, panelOpen = false, lastT = 0, larchVars = {};

const sceneByKey = k => SCENES.find(s => s.key === k) || SCENES[1];
const indexOf = k => SCENES.findIndex(s => s.key === k);
const clickWalk = horizontalInteraction({
  position: () => state.x,
  bounds: () => sceneByKey(state.scene).walk,
  available: h => !busy && !panelOpen && sceneByKey(state.scene).hotspots.includes(h),
  interact: h => interact(h.id),
  blocked: hintBlocked,
});
function fitArt() {
  const s = Math.min(innerWidth / FRAME.width, innerHeight / FRAME.height), w = FRAME.width * s, h = FRAME.height * s;
  return { left: (innerWidth - w) / 2, top: (innerHeight - h) / 2, width: w, height: h };
}
function person(src, hFrac, cls) {
  const d = document.createElement('div'); d.className = 'person ' + cls; d.style.height = (hFrac * 100) + '%';
  const im = document.createElement('img'); im.src = src; im.alt = ''; im.draggable = false; d.appendChild(im); return d;
}
function buildLayer(sc) {
  const layer = document.createElement('div'); layer.className = 'scene-layer'; layer.dataset.scene = sc.key;
  const art = document.createElement('div'); art.className = 'art';
  const img = document.createElement('img'); img.className = 'art-image'; img.src = sc.image; img.alt = sc.name; img.draggable = false; art.appendChild(img);
  if (sc.chen !== null) { const c = person('../../../sprites/chen_3h.webp', CHEN_H, 'chen'); c.style.left = (sc.chen * 100) + '%'; c.style.top = (FEET * 100) + '%'; c.style.setProperty('--facing', 1); art.appendChild(c); }
  const p = person('../../../sprites/tea_side_3h_cut.webp', HERO_H, 'tea'); art.appendChild(p);
  if (sc.fg) { const f = document.createElement('img'); f.className = 'fg-image'; f.src = sc.fg; f.alt = ''; f.draggable = false; art.appendChild(f); }   // 前景遮擋：只擋、不動
  for (const h of sc.hotspots) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hotspot'; b.dataset.id = h.id; b.dataset.name = h.name; b.setAttribute('aria-label', h.name);
    Object.assign(b.style, { left: h.x * 100 + '%', top: h.y * 100 + '%', width: h.w * 100 + '%', height: h.h * 100 + '%' });
    b.addEventListener('click', e => { e.stopPropagation();
      cancelClickWalk();
      if (e.detail === 0) return interact(h.id);
      keyDir = pointerDir = 0;
      h.reach = NEARBY + h.w / 2;
      clickWalk.begin(h); }); b.addEventListener('pointerdown', e => e.stopPropagation()); art.appendChild(b);
  }
  art.addEventListener('pointerdown', onDown); art.addEventListener('pointerup', onUp); art.addEventListener('pointercancel', onUp); art.addEventListener('pointermove', onMove);
  layer.appendChild(art); layoutArt(layer); return layer;
}
function layoutArt(layer) { const r = fitArt(); const art = layer.querySelector('.art'); Object.assign(art.style, { left: r.left + 'px', top: r.top + 'px', width: r.width + 'px', height: r.height + 'px' }); }
function renderPlayer() {
  if (!player) return; player.style.left = (state.x * 100) + '%'; player.style.top = (FEET * 100) + '%'; player.style.setProperty('--facing', state.face);
}
function show(key, x, face) {
  state.scene = key; state.x = x; state.face = face; targetX = null;
  const layer = buildLayer(sceneByKey(key)); stage.replaceChildren(layer); active = layer; player = layer.querySelector('.person.tea'); renderPlayer(); syncUi();
}
function turn(dir) {
  if (busy) return; const i = indexOf(state.scene), ni = i + dir; if (ni < 0 || ni >= SCENES.length) return;
  busy = true; keyDir = pointerDir = 0; cancelClickWalk(); const next = SCENES[ni]; const old = active;
  const incoming = buildLayer(next); incoming.classList.add('entering'); incoming.style.setProperty('--enter-from', dir > 0 ? '100%' : '-100%'); stage.appendChild(incoming);
  state.scene = next.key; state.x = dir > 0 ? next.walk[0] + 0.02 : next.walk[1] - 0.02; state.face = dir; player = incoming.querySelector('.person.tea'); renderPlayer();
  requestAnimationFrame(() => requestAnimationFrame(() => { old.classList.add('leaving', dir > 0 ? 'to-left' : 'to-right'); incoming.classList.add('arrived'); }));
  setTimeout(() => { old.remove(); incoming.classList.remove('entering', 'arrived'); active = incoming; busy = false; syncUi(); save(); }, 450);
}
function cancelClickWalk() {
  clickWalk.cancel();
  targetX = null;
}
function nearest() {
  const sc = sceneByKey(state.scene); let best = null;
  for (const h of sc.hotspots) { const cx = h.x + h.w / 2, d = Math.abs(cx - state.x); if (d < NEARBY + h.w / 2 && (!best || d < best.d)) best = { id: h.id, d }; }
  return best && best.id;
}
function syncUi() {
  label.textContent = sceneByKey(state.scene).name; const i = indexOf(state.scene);
  document.getElementById('turn-left').hidden = i === 0; document.getElementById('turn-right').hidden = i === SCENES.length - 1;
  const n = nearest(); for (const b of active.querySelectorAll('.hotspot')) b.classList.toggle('nearby', b.dataset.id === n);
}
function openPanel(title, lines, note) {
  document.getElementById('panel-title').textContent = title; const body = document.getElementById('panel-body'); body.replaceChildren();
  for (const t of lines) { const p = document.createElement('p'); p.textContent = t; body.appendChild(p); }
  if (note) { const p = document.createElement('p'); p.style.opacity = '.7'; p.textContent = note; body.appendChild(p); }
  panel.classList.add('on'); scrim.classList.add('on'); panelOpen = true; keyDir = pointerDir = 0; targetX = null;
}
function closePanel() { panel.classList.remove('on'); scrim.classList.remove('on'); panelOpen = false; }
function interact(id) {
  cancelClickWalk();
  if (id === 'bench') { document.getElementById('cg-img').src = '../../../garden/concept/03_dawn_hill.webp'; cg.style.display = 'block'; return; }
  if (id === 'exit') { if (inFrame) { parent.postMessage({ type: 'larch:set', variables: { dawn_visited: 'true' } }, '*'); parent.postMessage({ type: 'larch:complete' }, '*'); } else openPanel('回全島', ['（嵌進 Larch 時這裡會回到全島地圖的 (36,9)。）']); return; }
  const t = TALK[id]; if (t) openPanel(t.title, t.text, t.note);
}
document.getElementById('panel-close').addEventListener('click', closePanel); scrim.addEventListener('click', closePanel); cg.addEventListener('click', () => { cg.style.display = 'none'; });
document.getElementById('turn-left').addEventListener('click', () => turn(-1)); document.getElementById('turn-right').addEventListener('click', () => turn(1));

function step(dt) {
  if (busy || !player) return;
  const approaching = clickWalk.active;
  const target = approaching ? clickWalk.destination() : targetX;
  const dir = target === null ? keyDir || pointerDir : Math.sign(target - state.x);
  if (!approaching && targetX === state.x) targetX = null;
  const walking = !!dir && !panelOpen; player.classList.toggle('walking', walking);
  if (walking) {
    state.face = dir; state.x = target === null ? state.x + dir * WALK * dt / FRAME.width : stepToward(state.x, target, WALK * dt / FRAME.width); const [a, b] = sceneByKey(state.scene).walk;
    if (state.x < a) { state.x = a; if (indexOf(state.scene) > 0) { turn(-1); return; } }
    if (state.x > b) { state.x = b; if (indexOf(state.scene) < SCENES.length - 1) { turn(1); return; } }
    renderPlayer(); syncUi();
  }
}
function frame(t) { const dt = Math.min((t - lastT) / 1000, .05); lastT = t; step(dt); requestAnimationFrame(frame); }

addEventListener('keydown', e => {
  if (panelOpen) { if (e.key === 'Escape' || e.key === 'Enter') closePanel(); return; }
  if (cg.style.display === 'block') { cg.style.display = 'none'; return; }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); cancelClickWalk(); keyDir = -1; }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); cancelClickWalk(); keyDir = 1; }
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const k = nearest(); if (k) interact(k); }
});
addEventListener('keyup', e => { if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && keyDir < 0) keyDir = 0; if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && keyDir > 0) keyDir = 0; });
let down = null;
function onDown(e) { cancelClickWalk(); if (down) clearTimeout(down.timer); down = { x: e.clientX, y: e.clientY, held: false }; down.timer = setTimeout(() => { if (down) { down.held = true; pointerDir = e.clientX < innerWidth / 2 ? -1 : 1; targetX = null; } }, 180); }
function onMove(e) { if (down && down.held) pointerDir = e.clientX < innerWidth / 2 ? -1 : 1; }
addEventListener('pointerdown', () => { if (clickWalk.active) cancelClickWalk(); }, true);
addEventListener('keydown', e => {
  if (clickWalk.active && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) cancelClickWalk();
}, true);
function onUp(e) {
  if (!down) return; clearTimeout(down.timer); const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  if (e.type === 'pointerup' && !down.held && moved < 14 && !panelOpen) { const r = fitArt(); const xr = (e.clientX - r.left) / r.width, yr = (e.clientY - r.top) / r.height; if (yr >= FEET - 0.12 && xr >= 0 && xr <= 1) targetX = xr; }
  down = null; pointerDir = 0;
}
addEventListener('resize', () => { if (active) layoutArt(active); });
addEventListener('message', e => { const d = e.data || {}; if (d.type === 'larch:init') larchVars = d.variables || {}; });
if (inFrame) parent.postMessage({ type: 'larch:ready' }, '*');
function save() { if (window.StudioDB) StudioDB.set('dawn_hill_scene', { scene: state.scene, x: state.x }).catch(() => {}); }
async function start() {
  if (window.StudioDB && !Q.has('x') && !Q.has('scene')) { try { const v = await StudioDB.get('dawn_hill_scene'); if (v && sceneByKey(v.scene).key === v.scene && Number.isFinite(v.x)) { state.scene = v.scene; state.x = v.x; } } catch {} }
  show(state.scene, state.x, state.face); setInterval(save, 2000); requestAnimationFrame(frame);
}
start();
window.dawnHill = { get state() { return { ...state }; }, turn, interact, characters: CHARACTERS };
