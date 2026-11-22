// 真結局「直向天燈長畫」的演出（lantern.html）。規格：新版/劇本/真結局.md 225～233 行；座標：art/out/lantern/flat.json。
// 自己一支檔，不改 flat_engine.js：捲動、天燈、Larch 協定都寫在這裡；共用 paper.js（紙片白邊）、sfx.js（點天燈的紙聲）。
//   1 開場接 CG 真-02-6：四盞天燈停在四人頭頂上方一點點，輕輕浮著；收到 larch:init（或 2 秒沒收到）後開始上升。
//   2 上升約二十秒（緩入緩出）：路線照 flat.json 的 lanterns.keys（單調三次內插，不會繞回頭），四盞速度略不同、各自左右輕飄；
//     畫面跟著天燈群往上捲（先屋頂與鐘塔尖，再整片夜空），天燈群保持在畫面上方約 20%～40% 的位置。
//   3 點天燈：那盞轉 ±8 度回彈（系統減少動態時 ±3 度、飄動也縮小），路線不受影響，仍往上。
//   4 到頂只剩四個光點：停一秒，光點與畫面淡出，送 larch:set（trueEnding、trueEnding_lantern_step）與 larch:complete。
import { paperize } from './paper.js';
import { sfx } from './sfx.js';
import { fit, follow, apply } from './vscroll.js';   // 直向長畫共用的捲動（海底長畫也用）

const Q = new URLSearchParams(location.search);
const STILL = matchMedia('(prefers-reduced-motion: reduce)').matches || Q.get('still') === '1';
const RISE_S = Q.get('fast') === '1' ? 6 : 20;   // 上升全程（秒）
const HOLD_S = 1.0, FADE_S = 1.5;                  // 到頂停一下、淡出
const MOT = STILL ? 0.3 : 1;                       // 飄動幅度倍數
const WOB_DEG = STILL ? 3 : 8;                     // 點一下晃動的角度

// 劇本：明站在茶語後面一步。flat.json 的明只比其他人高 30 px、大小差不多，夾在茶語與詩的空隙裡，看起來像排成一排。
// 這裡照 lantern_plan.md 的站位（明被茶語與詩各擋住一點）：詩往茶語靠（x 1195→1135），明放在兩人之間的後面（x 1030），
// 腳底往後（畫面上方）48 px、縮成 0.92 倍；明與詩的天燈起點 x 跟著挪到各自頭頂。
const PEOPLE_FIX = { ming: { x: 1030, feet_y: 2763, scale: 0.92 }, shi: { x: 1135 } };
const LANTERN_START_X = { ming: 1030, shi: 1135 };
const DRAW_ORDER = ['ming', 'chen', 'tea', 'shi'];   // 明在後面，最先畫

const $ = id => document.getElementById(id);
const stage = $('stage'), art = $('art'), fade = $('fade'), hint = $('hint');
const inFrame = (() => { try { return window.parent !== window; } catch (e) { return true; } })();
const send = m => { if (inFrame) try { parent.postMessage(m, '*'); } catch (e) {} };

const S = window.lantern = { state: 'loading', u: 0, taps: 0, cam: {}, lanterns: [], people: [], inited: false, vars: {}, startedAt: null, topAt: null, doneAt: null, still: STILL, riseS: RISE_S };
const setState = s => { S.state = s; document.body.dataset.state = s; };

// ── Larch 協定 ──
let startAt;
addEventListener('message', e => {
  const d = e.data || {};
  if (d.type !== 'larch:init') return;
  S.vars = d.variables || {};
  S.inited = true;
  if (S.state === 'ready') startAt = Math.min(startAt, performance.now() + 600);
});
send({ type: 'larch:ready' });

// ── 數學 ──
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const easeInOut = x => 0.5 - 0.5 * Math.cos(Math.PI * clamp(x, 0, 1));
function monotone(xs, ys) {   // Fritsch–Carlson 單調三次內插：路線不會超過關鍵點、不會往回走
  const n = xs.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (d[i] === 0) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
  return x => { x = clamp(x, xs[0], xs[n - 1]); let i = 0; while (i < n - 2 && x > xs[i + 1]) i++; const h = xs[i + 1] - xs[i], t = (x - xs[i]) / h, t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1]; };
}
// 紙片白邊要讀像素；放在沒有 CORS 的 opaque origin 框裡讀不到時，退回原圖（少了白邊，但照樣能播）
async function paperOr(src, im, opt) { try { return await paperize(src, opt); } catch (e) { console.warn('紙片白邊失敗，用原圖', e); return { src, shadow: '', pad: 0, width: im.width, height: im.height }; } }
const loadImg = src => PageLoading.preload(src);

function glowSprite() {   // 天燈外圍的暖光暈：程式畫的徑向漸層（暖黃→橘→透明）
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const r = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  r.addColorStop(0, 'rgba(255,226,170,0.95)'); r.addColorStop(0.18, 'rgba(255,196,110,0.62)'); r.addColorStop(0.45, 'rgba(255,150,70,0.22)'); r.addColorStop(0.75, 'rgba(240,120,60,0.06)'); r.addColorStop(1, 'rgba(240,120,60,0)');
  g.fillStyle = r; g.fillRect(0, 0, 256, 256); return c.toDataURL('image/png');
}

// ── 載入 ──
let data, W, H, people = [], lts = [], routes = [];
const H0 = 110;   // 天燈紙片的基準高度（長畫 px）；之後用 scale 變大小
async function boot() {
  data = await PageLoading.json('../art/out/lantern/flat.json');
  W = data.width; H = data.height;
  await PageLoading.image($('bg'));
  const byId = Object.fromEntries(data.people.map(p => [p.id, p]));
  const glow = glowSprite();
  // 四人背影紙人
  const pp = await Promise.all(DRAW_ORDER.map(async id => { const p = byId[id]; const fx = PEOPLE_FIX[id] || {}; const src = await loadImg(p.img); return { ...p, x: fx.x ?? p.x, feet_y: fx.feet_y ?? p.feet_y, h: Math.round(p.h * (fx.scale ?? 1)), srcW: src.width, srcH: src.height, paper: await paperOr(p.img, src, { edge: 16, jitter: 4 }) }; }));
  for (const p of pp) {
    const k = p.h / p.srcH, el = document.createElement('div'); el.className = 'person'; el.dataset.id = p.id;
    const w = p.paper.width * k, hh = p.paper.height * k;
    Object.assign(el.style, { left: (p.x - w / 2) + 'px', top: (p.feet_y - (p.srcH + p.paper.pad) * k) + 'px', width: w + 'px', height: hh + 'px' });
    const sh = new Image(); sh.className = 'shadow'; if (p.paper.shadow) sh.src = p.paper.shadow; else sh.hidden = true; sh.alt = ''; Object.assign(sh.style, { top: ((p.srcH + p.paper.pad - 22) * k) + 'px', height: (40 * k) + 'px' });
    const im = new Image(); im.className = 'sheet'; im.src = p.paper.src; im.alt = '';
    el.append(sh, im); art.append(el);
    people.push({ id: p.id, x: p.x, feet_y: p.feet_y, h: p.h, left: p.x - p.srcW * k / 2, right: p.x + p.srcW * k / 2, top: p.feet_y - p.h, el });
  }
  // 四盞天燈（左到右＝order：晨、茶語、明、詩）
  const L = data.lanterns, keys = L.keys, ts = keys.map(k => k.t);
  PageLoading.prepare('天燈圖', Promise.all(Object.values(L.imgs).map(loadImg)));
  const speed = [-0.03, 0.02, -0.012, 0.035];      // 四盞速度略不同（頭尾仍對齊關鍵點）
  const period = [3.4, 3.9, 3.1, 3.7], phase = [0.3, 2.1, 4.0, 5.2];
  for (let i = 0; i < L.order.length; i++) {
    const id = L.order[i], src = await loadImg(L.imgs[id]), paper = await paperOr(L.imgs[id], src, { edge: 9, jitter: 2, texture: 0.05 });
    const k = H0 / src.height, pw = paper.width * k, ph = paper.height * k, G = H0 * 3.4;
    const el = document.createElement('div'); el.className = 'lantern'; el.dataset.id = id;
    const gl = new Image(); gl.className = 'glow'; gl.src = glow; gl.alt = ''; Object.assign(gl.style, { width: G + 'px', height: G + 'px', marginLeft: (-G / 2) + 'px', marginTop: (-G / 2) + 'px' });
    const im = new Image(); im.className = 'paper'; im.src = paper.src; im.alt = ''; Object.assign(im.style, { width: pw + 'px', height: ph + 'px', marginLeft: (-pw / 2) + 'px', marginTop: (-ph / 2) + 'px' });
    el.append(gl, im); art.append(el);
    routes.push({ x: monotone(ts, keys.map(k => (k.t === 0 && LANTERN_START_X[id]) ? LANTERN_START_X[id] : k.pos[i][0])), y: monotone(ts, keys.map(k => k.pos[i][1])), h: monotone(ts, keys.map(k => k.h)) });
    lts.push({ id, i, el, gl, im, speed: speed[i], period: period[i], phase: phase[i], wobT: -99, taps: 0, x: 0, y: 0, h: H0, ang: 0, op: 1 });
  }
  S.people = people.map(({ el, ...p }) => p);
  layout(); addEventListener('resize', layout);
  stage.addEventListener('pointerdown', onTap);
  last = performance.now();
  PageLoading.shown.then(() => {
    startAt = performance.now() + (S.inited ? 600 : 2000);
    setState('ready');
  });
  requestAnimationFrame(frame);
}

// ── 鏡頭：寬度撐滿畫面（最寬看整條 1536 寬）；直式手機把可見寬度收到 900 左右，讓四人與天燈夠大 ──
const cam = { s: 1, Vw: 1536, Vh: 864, vx: 0, vy: 0, cx: null, cy: null };
function layout() { fit(cam, W, H, stage.clientWidth || innerWidth, stage.clientHeight || innerHeight, 900); }
const PEOPLE_CX = 980;   // 四人中心（開場畫面左右置中在這裡）

// ── 每一格 ──
let last = 0, riseT = 0, topT = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now; const t = now / 1000;
  if (S.state === 'ready' && now >= startAt) { setState('rising'); S.startedAt = now; hint.classList.add('on'); setTimeout(() => hint.classList.remove('on'), 5200); }
  if (S.state === 'rising') { riseT += dt; if (riseT >= RISE_S) { riseT = RISE_S; setState('top'); S.topAt = now; } }
  if (S.state === 'top' || S.state === 'fading') { topT += dt; }
  if (S.state === 'top' && topT >= HOLD_S) { setState('fading'); fade.classList.add('out'); fade.style.opacity = '1'; }
  if (S.state === 'fading' && topT >= HOLD_S + FADE_S) finish(now);
  const u = easeInOut(riseT / RISE_S); S.u = u;

  // 天燈位置
  let gx = 0, gy = 0;
  for (const L of lts) {
    const ui = clamp(u + L.speed * Math.sin(Math.PI * u), 0, 1);
    const h = routes[L.i].h(ui), size = h / H0;
    const w = 2 * Math.PI * t / L.period + L.phase;
    const sway = (5 + 11 * size) * MOT * Math.sin(w);
    const bob = 3.5 * MOT * Math.sin(2 * Math.PI * t / 2.3 + L.phase * 1.7);
    L.x = routes[L.i].x(ui) + sway; L.y = routes[L.i].y(ui) + bob; L.h = h;
    const tilt = -2.5 * MOT * Math.cos(w);
    const dtw = t - L.wobT, wob = dtw < 3 ? WOB_DEG * Math.exp(-dtw / 0.45) * Math.sin(2 * Math.PI * dtw / 0.6) : 0;
    L.ang = tilt + wob;
    const fl = STILL ? 0.94 + 0.03 * Math.sin(t * 2.1 + L.phase) : 0.86 + 0.07 * Math.sin(t * 7.3 + L.phase) + 0.05 * Math.sin(t * 12.7 + L.phase * 2) + 0.02 * Math.sin(t * 23.1 + L.phase * 3);
    const gk = 1 + (1 - size) * 1.1;   // 越高越小，但光暈相對大一點，最後還看得出是光點
    L.op = S.state === 'fading' ? clamp(1 - (topT - HOLD_S) / (FADE_S * 0.8), 0, 1) : 1;
    L.el.style.transform = `translate3d(${L.x}px,${L.y}px,0) scale(${size})`; L.el.style.opacity = L.op;
    L.gl.style.transform = `scale(${gk * (0.97 + 0.06 * fl)})`; L.gl.style.opacity = (0.75 * fl).toFixed(3);
    L.im.style.transform = `rotate(${L.ang}deg)`;
    gx += L.x / lts.length; gy += L.y / lts.length;
  }

  // 鏡頭跟著天燈群：開場先停在最底一屏（四人與天燈都在），天燈群往上後保持在畫面上方 20%～40%
  const f = 0.2 + 0.2 * smooth(0, 0.35, u);
  const tyy = clamp(gy - f * cam.Vh, 0, H - cam.Vh);
  let txx = PEOPLE_CX + (gx - PEOPLE_CX) * smooth(0.05, 0.5, u) - cam.Vw / 2;
  { // 直式手機可見寬度只有 900 左右：四盞散得最開時（升過屋頂那段）也要整盞留在畫面內，左右各留一點邊
    let lo = Infinity, hi = -Infinity; for (const L of lts) { const half = L.h * 0.5 + 40; lo = Math.min(lo, L.x - half); hi = Math.max(hi, L.x + half); }
    if (hi - lo <= cam.Vw) txx = clamp(txx, hi - cam.Vw, lo);
  }
  follow(cam, W, H, txx, tyy, dt, 5); apply(art, cam);
  S.cam = { s: cam.s, Vw: cam.Vw, Vh: cam.Vh, vx: cam.vx, vy: cam.vy };
  S.lanterns = lts.map(L => ({ id: L.id, x: L.x, y: L.y, h: L.h, ang: L.ang, taps: L.taps, op: L.op }));
  if (S.state !== 'done') requestAnimationFrame(frame);
}

// ── 點天燈：晃一下，仍往上 ──
function onTap(e) {
  if (S.state === 'loading' || S.state === 'done') return;
  const ax = cam.vx + e.clientX / cam.s, ay = cam.vy + e.clientY / cam.s;
  let best = null, bd = Infinity;
  for (const L of lts) { const r = Math.max(L.h * 0.75, 26 / cam.s), d = Math.hypot(ax - L.x, ay - L.y); if (d < r && d < bd) { best = L; bd = d; } }
  if (!best) return;
  best.wobT = performance.now() / 1000; best.taps++; S.taps++;
  try { sfx.paper(); } catch (err) {}
}
S.tap = i => { const L = lts[i]; if (!L) return; L.wobT = performance.now() / 1000; L.taps++; S.taps++; };

// ── 完成：寫回變數、送完成 ──
function finish(now) {
  if (S.state === 'done') return;
  setState('done'); S.doneAt = now;
  const cfg = window.LARCH_EMBED_CONFIG || {};
  const writes = Object.assign({ trueEnding: true }, cfg.completionWrites || {});
  const step = Number.isFinite(Number(cfg.completionStep)) && cfg.completionStep !== null ? Number(cfg.completionStep) : 4;   // 劇本三步走完＝第 4 步
  writes[cfg.stepVariable || 'trueEnding_lantern_step'] = step;
  S.writes = writes;
  send({ type: 'larch:set', variables: writes });
  send({ type: 'larch:complete', result: 'lanternsUp', payload: { taps: S.taps, writes } });
  window.__done = { result: 'lanternsUp', writes };
}

PageLoading.track('天燈場景組裝', boot()).then(() => PageLoading.finish()).catch(err => { console.error(err); setState('error'); S.error = String(err && err.message || err); fade.style.opacity = '0'; });
