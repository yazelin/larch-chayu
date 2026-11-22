import { createJoystick } from './movement_input.mjs';
import { horizontalInteraction, hintBlocked, stepToward } from './walk_interaction.mjs';
// 朝霞丘橫向捲軸小樣：六層視差＋茶語左右走＋熱區。操作與橋接照 studio_web/index.html 的捲軸版（方向鍵或 A、D、點地面走過去、
// 手機搖桿、靠近熱區亮起、Enter 或點擊互動、larch:init／larch:ready、IndexedDB 記位置）；角色表共用 studio_core.mjs。
// 層用 canvas 畫（工作室是 DOM 一張長圖；這裡六層各自速度，canvas 比六個 div 省事），超出條帶的地方鏡射補。
// 網址參數：?x=0.5（起點 sw）、walk=1（自動往右走，截視差用）、hud=0（藏介面）、mock=1（不接 Larch）。
import { CHARACTERS } from '../../../studio_web/studio_core.mjs';
const Q = new URLSearchParams(location.search);
const scene = await (await fetch('../art/out/' + (new URLSearchParams(location.search).get('scene') || 'scene') + '.json')).json();
const [FW, FH] = scene.frame; const SW = FW; const SCENE_W = scene.width_sw * SW;
const PX_PER_M = 370 / 1.4;                    // 03 的畫架 1.4 公尺＝370 px
const WALK = 3.4 * PX_PER_M;                   // 工作室的 340 公分每秒
const NEARBY = 0.06 * SW;
const canvas = document.getElementById('stage'); const ctx = canvas.getContext('2d');
const nearBtn = document.getElementById('near'); const panel = document.getElementById('panel'); const scrim = document.getElementById('scrim'); const cg = document.getElementById('cg');
if (Q.get('hud') === '0') document.body.classList.add('nohud');

function load(src) { return new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error('載不到 ' + src)); im.src = src; }); }
const layers = await Promise.all(scene.layers.map(async l => ({ ...l, img: await load(l.src) })));
const hero = await load('../../../sprites/tea_side_3h_cut.webp'); const chen = await load('../../../sprites/chen_3h.webp');

const P = scene.points;
const state = { x: (Number(Q.get('x')) || P.enter_from_island.x) * SW, face: 1, walking: false, phase: 0 };
let keyDir = 0, pointerDir = 0, targetX = null, panelOpen = false, scale = 1, viewW = FW, viewH = FH, lastT = 0, larchVars = {};
const inFrame = window.parent !== window && Q.get('mock') !== '1';
if (Q.get('walk') === '1') keyDir = 1;

function resize() { viewH = innerHeight; viewW = innerWidth; scale = viewH / FH; canvas.width = Math.round(viewW * devicePixelRatio); canvas.height = Math.round(viewH * devicePixelRatio); canvas.style.width = viewW + 'px'; canvas.style.height = viewH + 'px'; }
addEventListener('resize', resize); resize();

function camX() { const vw = viewW / scale; return Math.max(0, Math.min(SCENE_W - vw, state.x - vw / 2)); }
function drawLayer(l, cam) {
  const off = cam * l.speed; const vw = viewW / scale; const w = l.img.width;
  // 條帶在畫面上的範圍：[-off, -off+w]；不夠的地方鏡射鋪
  for (let k = -1; k <= 2; k++) {
    const x0 = -off + k * w; if (x0 > vw || x0 + w < 0) continue;
    ctx.save(); ctx.translate(x0 * scale, 0);
    if (k % 2) { ctx.translate(w * scale, 0); ctx.scale(-1, 1); }
    ctx.drawImage(l.img, 0, 0, w * scale, FH * scale); ctx.restore();
  }
}
function drawPerson(img, xRef, hFrac, face, cam, bounce) {
  const h = hFrac * FH * scale, w = h * img.width / img.height; const sx = (xRef - cam) * scale, feet = scene.feet_y * FH * scale - bounce;
  ctx.save(); ctx.translate(sx, feet); if (face < 0) ctx.scale(-1, 1); ctx.drawImage(img, -w / 2, -h, w, h); ctx.restore();
}
function render() {
  const cam = camX(); ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); ctx.clearRect(0, 0, viewW, viewH);
  for (const l of layers) {
    if (l.key === 'L5') { drawPerson(chen, P.chen.x * SW, scene.chen_height, 1, cam, 0); drawPerson(hero, state.x, scene.hero_height, state.face, cam, state.walking ? Math.abs(Math.sin(state.phase)) * 5 * scale : 0); }
    drawLayer(l, cam);
  }
}
const HOT = { chen: { label: '跟晨說話', title: '晨', text: ['這次是我自己看到的。', '太陽從那邊出來的時候，整片花會先亮一秒。'], note: '正式版接劇本 4-1 那段對話。' },
              easel: { label: '看畫布', title: '畫架', text: ['畫布上只有一層淡淡的粉橘。'], note: '之後接「一種顏色」。' },
              bench_view: { label: '坐下看海', cg: true },
              exit_to_island: { label: '回全島', exit: true } };
const hotspots = Object.keys(HOT).map(id => ({ id, x: P[id].x * SW, w: 0, reach: NEARBY }));
const clickWalk = horizontalInteraction({
  position: () => state.x,
  bounds: () => scene.walk_x.map(x => x * SW),
  available: h => !panelOpen && hotspots.includes(h),
  interact: h => interact(h.id),
  blocked: hintBlocked,
});
function cancelClickWalk() {
  clickWalk.cancel();
  targetX = null;
}
function nearest() {
  let best = null;
  for (const [k, pt] of Object.entries(P)) { if (!HOT[k]) continue; const d = Math.abs(pt.x * SW - state.x); if (d < NEARBY && (!best || d < best.d)) best = { k, d }; }
  return best && best.k;
}
function interact(k) {
  const h = HOT[k]; if (!h) return;
  cancelClickWalk();
  if (h.cg) { document.getElementById('cg-img').src = '../../../garden/concept/03_dawn_hill.webp'; cg.style.display = 'block'; return; }
  if (h.exit) { if (inFrame) { parent.postMessage({ type: 'larch:set', variables: { dawn_visited: 'true' } }, '*'); parent.postMessage({ type: 'larch:complete' }, '*'); } else openPanel('回全島', ['（嵌進 Larch 時這裡會回到全島地圖的 (36,9)。）']); return; }
  openPanel(h.title, h.text, h.note);
}
function openPanel(title, lines, note) {
  document.getElementById('panel-title').textContent = title; const body = document.getElementById('panel-body'); body.replaceChildren();
  for (const t of lines) { const p = document.createElement('p'); p.textContent = t; body.appendChild(p); }
  if (note) { const p = document.createElement('p'); p.style.opacity = '.7'; p.textContent = note; body.appendChild(p); }
  panel.classList.add('on'); scrim.classList.add('on'); panelOpen = true; keyDir = pointerDir = 0; targetX = null;
}
function closePanel() { panel.classList.remove('on'); scrim.classList.remove('on'); panelOpen = false; }
document.getElementById('panel-close').addEventListener('click', closePanel); scrim.addEventListener('click', closePanel);
cg.addEventListener('click', () => { cg.style.display = 'none'; });
nearBtn.addEventListener('click', () => interact(nearest()));

const joystick = createJoystick({
  enabled: () => !panelOpen && cg.style.display !== 'block',
  onStart: () => { cancelClickWalk(); keyDir = pointerDir = 0; },
  onTouch: touch => { document.getElementById('hint').textContent = (touch
      ? '左右拖動搖桿，也可以點地面、入口或物件走過去'
      : '方向鍵或 A、D 移動，也可以點地面、入口或物件走過去'); },
});
function manualDirection() { return joystick.active ? joystick.x : keyDir || pointerDir; }
addEventListener('blur', () => { keyDir = pointerDir = 0; });

function step(dt) {
  const approaching = clickWalk.active;
  const target = approaching ? clickWalk.destination() : targetX;
  const dir = target === null ? manualDirection() : Math.sign(target - state.x);
  if (!approaching && targetX === state.x) targetX = null;
  state.walking = !!dir && !panelOpen;
  if (state.walking) {
    state.face = Math.sign(dir); state.x = target === null ? state.x + dir * WALK * dt : stepToward(state.x, target, WALK * dt); state.phase += dt * 11;
    const [a, b] = scene.walk_x; state.x = Math.max(a * SW, Math.min(b * SW, state.x));
    if (!approaching && state.x <= P.exit_to_island.x * SW + 1 && dir < 0) { keyDir = pointerDir = 0; joystick.release(); targetX = null; interact('exit_to_island'); }
  }
  const k = nearest(); nearBtn.style.display = k && !panelOpen ? 'block' : 'none'; if (k) nearBtn.textContent = HOT[k].label;
}
function frame(t) { const dt = Math.min((t - lastT) / 1000, .05); lastT = t; joystick.update(); step(dt); render(); requestAnimationFrame(frame); }
requestAnimationFrame(frame);

addEventListener('keydown', e => {
  if (panelOpen) { if (e.key === 'Escape' || e.key === 'Enter') closePanel(); return; }
  if (cg.style.display === 'block') { cg.style.display = 'none'; return; }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); cancelClickWalk(); joystick.release(); keyDir = -1; }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); cancelClickWalk(); joystick.release(); keyDir = 1; }
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const k = nearest(); if (k) interact(k); }
});
addEventListener('keyup', e => { if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && keyDir < 0) keyDir = 0; if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && keyDir > 0) keyDir = 0; });
let down = null;
addEventListener('pointerdown', () => { if (clickWalk.active) cancelClickWalk(); }, true);
addEventListener('keydown', e => {
  if (clickWalk.active && ['arrowup', 'arrowdown', 'w', 's'].includes(e.key.toLowerCase())) cancelClickWalk();
}, true);
canvas.addEventListener('pointerdown', e => {
  if (!e.isPrimary || e.button !== 0) return;
  cancelClickWalk();
  if (down) clearTimeout(down.timer);
  down = { id: e.pointerId, x: e.clientX, y: e.clientY, held: false };
  if (e.pointerType === 'mouse') down.timer = setTimeout(() => {
    down.held = true; pointerDir = e.clientX < viewW / 2 ? -1 : 1; targetX = null;
  }, 180);
});
canvas.addEventListener('pointermove', e => { if (down?.id === e.pointerId && down.held) pointerDir = e.clientX < viewW / 2 ? -1 : 1; });
function up(e) {
  if (down?.id !== e.pointerId) return; clearTimeout(down.timer); const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
  if (e.type === 'pointerup' && !down.held && moved < 14 && !panelOpen) {
    const xRef = camX() + e.clientX / scale;
    const yRef = e.clientY / (FH * scale);
    const hit = yRef >= scene.feet_y - scene.chen_height && yRef <= scene.feet_y + 0.04 &&
      hotspots.reduce((best, h) => Math.abs(h.x - xRef) < Math.min(NEARBY, best ? Math.abs(best.x - xRef) : Infinity) ? h : best, null);
    if (hit) { keyDir = pointerDir = 0; clickWalk.begin(hit); }
    else if (yRef >= scene.feet_y - 0.1) targetX = Math.max(scene.walk_x[0] * SW, Math.min(scene.walk_x[1] * SW, xRef));   // 點地面走過去
  }
  down = null; pointerDir = 0;
}
canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);

// Larch 橋接（照工作室）
addEventListener('message', e => { const d = e.data || {}; if (d.type === 'larch:init') larchVars = d.variables || {}; });
if (inFrame) parent.postMessage({ type: 'larch:ready' }, '*');
// 位置記在 IndexedDB（跟工作室同一個 StudioDB）
if (window.StudioDB && !Q.has('x')) { StudioDB.get('dawn_hill_x').then(v => { if (Number.isFinite(v)) state.x = v; }).catch(() => {}); setInterval(() => StudioDB.set('dawn_hill_x', state.x).catch(() => {}), 2000); }
window.dawnHill = { get x() { return state.x / SW; }, set x(v) { state.x = v * SW; cancelClickWalk(); }, characters: CHARACTERS, interact };
