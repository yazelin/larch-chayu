// 月光岬長畫的玩法與互動（設計.md「海灘與月光岬長畫的互動」的「月光岬」，2026-11-14 作者同意；做法與修正紀錄在 cape_plan.md）。結構照 beach_play.js。
// 三個章節（?chapter=5 第五章、?chapter=7 第七章陪明、預設 true 真結局；嵌進 Larch 時看變數 chapter）：
//   第五章：明跟著進場 → 走到岩壁下，明教「停下時間」→ 到浪邊停一次 → 三個齒輪（礁石縫、鳥叼著、卡在浮空石上）→ 停下時間跳浮空石上平台 → 交給明 → CG 5-14（佔位）→ 指針逆時針 → 跳回岩壁下、走到出口。
//   真結局：明在平台上，指針逆時針；照劇本 4-3：對話 → 停下時間 → 點鐘面把最後那個齒輪拿下來翻面裝回 → 指針順時針 → 拿到禮物「明的一分鐘」。
//   第七章：走到明面前出現「今天陪你／明天再來」。
// 沿石板路走進畫裡：路線是 flat.json 的 route（折線，每個節點有 x、y 與茶語在那裡的身高），這支自己照路線擺茶語的位置與大小，引擎只管左右鍵與鏡頭的左右。
// 熱區一律綁在物件上（zone）；會動的每一幀自己算位置，熱區跟著移。狀態：Larch 變數優先，本機存 StudioDB 'cape_state'，章節用 _c5／_te／_c7 後綴分開；?reset=1 清掉。
import { sfx } from './sfx.js';
import { createZukan, watchHot } from './zukan.js';
import { createPlants, plantImg } from './plants.js';
export async function install(api) {
  const { art, IMG, paperize, openDialogue, state } = api; const W = IMG.width, H = IMG.height; const M = api.META;
  const X = px => px / W * 100 + '%', Y = px => px / H * 100 + '%';
  const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)], clamp = (v, a, b) => Math.max(a, Math.min(b, v)), wait = ms => new Promise(ok => setTimeout(ok, ms));
  const smooth = t => t * t * (3 - 2 * t), lerp = (a, b, t) => a + (b - a) * t;
  const Q = new URLSearchParams(location.search); document.body.classList.add('cape'); document.title = M.name + '（一整張長畫）'; document.getElementById('stage').setAttribute('aria-label', M.name);
  document.querySelector('#cg span').textContent = '點一下回到月光岬';
  document.getElementById('hint').textContent = '方向鍵或 A、D 沿石板路走・點地面走過去・T 停下時間';

  // ── 樣式（只給月光岬用，掛在 body.cape 底下；flat.html 不動） ──
  const css = document.createElement('style'); css.textContent = `
body.cape .person .sheet{filter:saturate(.96) brightness(.97) drop-shadow(calc(var(--k,1) * -6px) calc(var(--k,1) * 7px) calc(var(--k,1) * 4px) rgba(20,24,60,.5))}
body.cape .thing{transition:none}
body.cape .thing .sheet{filter:drop-shadow(-2px 3px 2px rgba(20,24,60,.45))}
body.cape .thing.flat .shadow{opacity:0}
body.cape .thing.spin .sheet{transform:rotate(var(--rot,0deg));transform-origin:50% 50%}
body.cape .thing.gear.glow .sheet{animation:cgglow 1.6s ease-in-out infinite}@keyframes cgglow{50%{filter:brightness(1.25) drop-shadow(0 0 6px rgba(255,226,150,.95))}}
body.cape .thing.nbird .sheet{transform:scaleX(var(--facing,1)) rotate(var(--rot,0deg));transform-origin:50% 60%}body.cape .thing.nbird .shadow{opacity:0}
body.cape .thing.turtle .sheet{transform:scaleX(var(--facing,1)) rotate(var(--rot,0deg)) translateY(var(--bob,0%));transform-origin:50% 70%;clip-path:inset(0 0 var(--dip,26%) 0)}body.cape .thing.turtle .shadow{opacity:0}
.cfloat{position:absolute;z-index:2;pointer-events:none;display:block;max-width:none;filter:drop-shadow(0 0 5px rgba(150,180,255,.55)) drop-shadow(-2px 3px 2px rgba(20,24,60,.4));-webkit-user-drag:none}
.person.tea.landed .sheet{animation:cland .22s ease-out}@keyframes cland{40%{transform:scale(1.08,.9) scaleX(var(--facing,1))}}
.person.tea.casting .sheet{animation:ccast .7s ease-in-out}@keyframes ccast{30%,70%{transform:translateY(-2%) rotate(calc(-4deg * var(--facing,1))) scaleX(var(--facing,1))}}
.person.ming.nod .sheet{animation:cnod .5s ease-in-out}@keyframes cnod{50%{transform:translateY(2%) rotate(2deg) scaleX(var(--facing,1))}}
.clockhands{position:absolute;z-index:1;width:0;height:0;pointer-events:none}
.clockhands i{position:absolute;left:0;bottom:0;display:block;transform-origin:50% 100%;border-radius:45% 45% 20% 20%;background:#3f2c27;box-shadow:0 0 0 .5px rgba(255,240,205,.9),-.6px .8px 1px rgba(60,30,20,.5)}
.clockhands b{position:absolute;display:block;border-radius:50%;background:#3f2c27;box-shadow:0 0 0 .5px rgba(255,240,205,.9)}
.cglow{position:absolute;z-index:1;pointer-events:none;border-radius:50%;mix-blend-mode:screen;transform:translate(-50%,-50%) scale(var(--s,1));transition:opacity .5s,transform .5s}
.cglow.warm{background:radial-gradient(closest-side,rgba(255,214,140,.5),rgba(255,190,120,.18) 50%,rgba(255,180,110,0) 100%);animation:cwarm 4.6s ease-in-out infinite}@keyframes cwarm{50%{opacity:.72}}
.cglow.moon{background:radial-gradient(closest-side,rgba(226,232,255,.36),rgba(190,205,255,.14) 45%,rgba(170,190,255,0) 100%);animation:cmoon 8s ease-in-out infinite}@keyframes cmoon{50%{opacity:calc(var(--o,1) * .8)}}
.cglow.lamp{background:radial-gradient(closest-side,rgba(255,206,120,.55),rgba(255,180,90,.2) 45%,rgba(255,170,80,0) 100%);animation:clamp 1.9s steps(6) infinite}@keyframes clamp{0%{opacity:.86}20%{opacity:1}40%{opacity:.8}60%{opacity:.96}80%{opacity:.84}100%{opacity:.86}}
.cglow.lamp.off{opacity:0!important;animation:none}
.cglow.shroom{background:radial-gradient(closest-side,rgba(255,236,170,.6),rgba(255,214,130,.22) 45%,rgba(255,210,120,0) 100%);opacity:.25;animation:cshroom 5s ease-in-out infinite}@keyframes cshroom{50%{opacity:.4}}
.cglow.shroom.lit{opacity:1;animation:cshlit 1.4s ease-in-out infinite}@keyframes cshlit{50%{opacity:.8;transform:translate(-50%,-50%) scale(1.12)}}
.cglow.shroom.flare{animation:cflare .6s ease-out}@keyframes cflare{30%{opacity:1;transform:translate(-50%,-50%) scale(1.9)}}
body.frozen .cglow,body.frozen .thing.gear .sheet{animation-play-state:paused}
.cglow.errandflick{background:radial-gradient(closest-side,rgba(16,20,52,.92),rgba(16,20,52,.7) 55%,rgba(16,20,52,0) 100%);animation:eflick 1.1s steps(1) infinite;mix-blend-mode:normal}
@keyframes eflick{0%{opacity:0}18%{opacity:1}26%{opacity:0}41%{opacity:1}47%{opacity:0}63%{opacity:.85}82%{opacity:0}90%{opacity:1}100%{opacity:0}}
body.frozen .cglow.errandflick{animation:none;opacity:0}
.capecv{position:absolute;pointer-events:none;z-index:1}
#ffcv{position:absolute;inset:0;width:100%;height:100%;z-index:5;pointer-events:none;mix-blend-mode:screen}
.overpatch{position:absolute;z-index:1;pointer-events:none;display:block;max-width:none;opacity:0;transition:opacity var(--fade,.5s) ease}
.ccloud{position:absolute;z-index:1;pointer-events:none}
#freezetint{position:absolute;inset:0;z-index:9;pointer-events:none;background:#4a73cf;mix-blend-mode:color;opacity:0;transition:opacity .45s ease}
#freezedim{position:absolute;inset:0;z-index:9;pointer-events:none;background:radial-gradient(ellipse at 50% 45%,rgba(20,40,110,0) 40%,rgba(14,26,80,.42) 100%);opacity:0;transition:opacity .45s ease}
body.frozen #freezetint{opacity:.9}body.frozen #freezedim{opacity:1}
#stoptime{position:fixed;z-index:12;right:max(18px,env(safe-area-inset-right));bottom:max(22px,env(safe-area-inset-bottom));padding:.6em 1.6em .65em;color:var(--ink);font:700 19px/1.3 var(--hand);letter-spacing:.16em;cursor:pointer;background:none;rotate:-2deg;
  border-style:solid;border-width:0;border-image:var(--btn) var(--btn-slice) fill / var(--btn-width) stretch;filter:drop-shadow(0 4px 5px rgba(20,24,60,.4));transition:transform .15s}
#stoptime:hover{transform:translateY(-3px)}#stoptime:active{transform:translateY(1px) scale(.97)}#stoptime[hidden]{display:none}#stoptime small{font-size:13px;font-weight:400;color:var(--dim);margin-left:.5em;letter-spacing:.05em}
#stoptime u{position:absolute;left:18%;right:18%;bottom:.32em;height:3px;border-radius:2px;background:rgba(90,65,80,.18);overflow:hidden;text-decoration:none;opacity:0}
#stoptime u::after{content:"";position:absolute;inset:0;background:#6f8fe0;transform-origin:0 50%;transform:scaleX(var(--left,0))}
body.frozen #stoptime u{opacity:1}
body.panel-open #stoptime,body.locked #stoptime,body.nohud #stoptime{opacity:0;pointer-events:none}
#gearcard{position:fixed;inset:0;z-index:26;display:none;background:rgba(14,22,60,.45);cursor:pointer}
#gearcard .card{position:absolute;left:50%;top:46%;width:min(520px,calc(100vw - 48px));padding:40px 50px 34px;color:var(--ink);text-align:center;transform:translate(-50%,-50%) rotate(-1.2deg);
  border-style:solid;border-width:0;border-image:var(--panel) var(--panel-slice) fill / var(--panel-width) stretch;filter:drop-shadow(0 12px 18px rgba(0,0,0,.35));animation:drop .35s cubic-bezier(.25,1.35,.45,1)}
#gearcard img{display:block;width:150px;height:auto;margin:6px auto 14px;transition:transform .6s cubic-bezier(.4,1.3,.5,1);filter:drop-shadow(-3px 5px 3px rgba(60,40,60,.4))}
#gearcard img.flipped{transform:scaleX(-1) rotate(30deg)}#gearcard img.back{transform:scaleX(-1) rotate(30deg) scale(.2) translateY(-300px);opacity:0;transition:transform .5s ease-in,opacity .5s}
#gearcard p{margin:0;font:700 18px/1.6 var(--hand);letter-spacing:.1em}
body.cape #palette i{width:15px;height:15px}`; document.head.appendChild(css);

  // ── 狀態 ──
  const st = api.vars; const CT = api.ctl;   // CT：這一頁是哪一章、第幾步、怎麼切回 Larch 對話卡（flat_engine.js 的 ctl；規格 ../_島段步驟清單.md）
  const chapter = CT.chapter; const ch5 = chapter === '5', ch7 = chapter === '7', te = !ch5 && !ch7; const SUF = ch5 ? '_c5' : ch7 ? '_c7' : '_te'; const K = k => k + SUF; const on = k => st[k] === 'true';
  const POSKEY = 'cape_pos' + SUF; let savedPos = null;
  if (window.StudioDB) { try {
    if (Q.get('reset') === '1') { await StudioDB.remove('flat_x_cape'); for (const s of ['_c5', '_c7', '_te']) await StudioDB.remove('cape_pos' + s); }
    else savedPos = await StudioDB.get(POSKEY);
  } catch {} }
  const save = await CT.store('cape_state', st, Q.get('reset') === '1');
  if (CT.mode === 'visit' && ch5) Object.assign(st, { c5_intro: 'true', c5_taught: 'true', c5_stopped: 'true', gears_c5: 'a,b,c', c5_cg: 'true', c5_done: 'true' });   // 自由逛：主線做完之後的月光岬（只在這一頁當成做完，不寫回 Larch）
  // 回接（第五章第 6 步）：CG 5-14～5-16 的對話在 Larch 的對話卡播完了，回來時站在鐘塔平台，指針逆時針轉。第七章評審週回接也站在平台上
  const resumed = ch5 && CT.step >= 6 && !on('c5_cg');
  if (resumed) save({ c5_intro: 'true', c5_taught: 'true', c5_stopped: 'true', gears_c5: 'a,b,c', s4_gears_submitted: 'true', c5_cg: 'true' });
  const onPlat = (ch5 && CT.step >= 6 && !on('c5_done') && !Q.has('x')) || (ch7 && CT.resume);
  if (onPlat) savedPos = { mode: 'plat', x: 0 };
  const zk = createZukan({ vars: () => Object.assign({}, st, api.vars), set: v => save(v), toast: api.toast }); await zk.ready;   // 全劇小生物圖鑑（zukan.js）
  if (on('gift_ming')) api.gifts.gift_ming = true;

  const FX = await (await fetch('../art/sprites/fx.json')).json(); const FXK = {}; for (const e of FX) (FXK[e.kind] = FXK[e.kind] || []).push(e.file);
  const fxImg = (kind, cls = '') => { const pool = FXK[kind] || FXK.star; const im = document.createElement('img'); im.className = 'fx ' + kind + ' ' + cls; im.src = '../art/sprites/' + pool[Math.floor(Math.random() * pool.length)]; im.alt = ''; im.draggable = false; return im; };
  function sparkle(x, y, n = 8, far = 1) { for (let i = 0; i < n; i++) { const s = fxImg(Math.random() < 0.7 ? 'star' : 'glow'); s.style.left = X(x + rnd(-6, 6)); s.style.top = Y(y); s.style.setProperty('--a', (i / n * 360 + rnd(-20, 20)) + 'deg'); s.style.setProperty('--d', rnd(24, 60) * far + 'px'); s.style.setProperty('--sz', rnd(10, 18) + 'px'); s.style.animationDelay = rnd(0, 0.15) + 's'; art.appendChild(s); setTimeout(() => s.remove(), 1500); } }
  function heart(x, y) { const h = fxImg('heart', 'float'); h.style.left = X(x); h.style.top = Y(y); h.style.setProperty('--sz', rnd(14, 20) + 'px'); h.style.setProperty('--dx', rnd(-12, 12) + 'px'); art.appendChild(h); setTimeout(() => h.remove(), 1700); }
  function drops(x, y, n = 5) { for (let i = 0; i < n; i++) { const d = fxImg('drop', 'falling'); d.style.left = X(x + rnd(-14, 14)); d.style.top = Y(y - rnd(2, 14)); d.style.setProperty('--sz', rnd(5, 9) + 'px'); d.style.setProperty('--dy', rnd(14, 28) + 'px'); d.style.animationDelay = rnd(0, 0.25) + 's'; art.appendChild(d); setTimeout(() => d.remove(), 1400); } }

  // ── 小紙片、熱區（做法照 beach_play.js） ──
  const firstPerson = art.querySelector('.person'); const bgLayer = art.querySelector('img.layer');
  let underTop = bgLayer; const under = el => { underTop.after(el); underTop = el; return el; };   /* 疊在底圖上、人物後面的東西依序接在底圖後面 */
  async function sprite(src, cls, opt = {}) {
    const pp = await paperize(src, { edge: opt.edge ?? 6, jitter: opt.jitter ?? 2, texture: opt.texture }); const d = document.createElement('div'); d.className = 'thing ' + cls;
    const sh = document.createElement('img'); sh.className = 'shadow'; sh.src = pp.shadow; sh.alt = '';
    const im = document.createElement('img'); im.className = 'sheet'; im.src = pp.src; im.alt = ''; im.draggable = false; d.append(sh, im);
    d.dataset.pad = pp.pad / pp.height; d.dataset.ar = (pp.width - 2 * pp.pad) / (pp.height - 2 * pp.pad); return d;
  }
  // x 中心、y 底（px）、h 圖本身的高（px，不含白邊）
  function place(el, x, y, h, front = false) {
    el.style.left = X(x); el.style.top = Y(y); el.style.height = (h / H * 100 / (1 - 2 * Number(el.dataset.pad))) + '%'; el.style.setProperty('--pad', (Number(el.dataset.pad) * 100) + '%');
    if (!el.isConnected) { if (front) art.appendChild(el); else art.insertBefore(el, firstPerson); } return el;
  }
  const zones = [];
  function zone(id, name, r, onClick, opt = {}) {   /* r：x、w、y、h 都是長畫 px；opt.when 回 false 時整個收起來 */
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hotspot'; b.dataset.id = id; b.dataset.name = typeof name === 'function' ? name() : name; b.setAttribute('aria-label', b.dataset.name);
    Object.assign(b.style, { left: X(r.x), top: Y(r.y), width: X(r.w), height: Y(r.h) });
    const hot = { id, name, x: r.x, w: r.w, y: r.y / H, h: r.h / H };
    const z = { id, btn: b, hot, r, vis: true, when: opt.when || null,
      refresh() { const v = z.vis && (!z.when || !!z.when()); if (b.hidden !== !v) { b.hidden = !v; hot.hidden = !v; } },
      off() { z.vis = false; b.remove(); const i = api.hot.indexOf(hot); if (i >= 0) api.hot.splice(i, 1); const k = zones.indexOf(z); if (k >= 0) zones.splice(k, 1); },
      hide() { z.vis = false; z.refresh(); }, show() { z.vis = true; z.refresh(); },
      moveTo(cx, top) { hot.x = cx - r.w / 2; b.style.left = X(hot.x); if (top !== undefined) { hot.y = top / H; b.style.top = Y(top); } } };
    hot.fn = () => onClick(z); b.addEventListener('click', e => { e.stopPropagation(); hot.fn(); }); b.addEventListener('pointerdown', e => e.stopPropagation());
    art.appendChild(b); api.hot.push(hot); zones.push(z); z.refresh(); return z;
  }
  const refreshZones = () => { for (const z of zones) z.refresh(); };
  let lastToast = ''; let lastToastAt = 0;
  const tip = text => { const now = performance.now(); if (text === lastToast && now - lastToastAt < 1600) return; lastToast = text; lastToastAt = now; stats.tips.push(text); api.toast(text); };
  const stats = { tips: [], jumps: 0, sinks: 0, freezes: 0, cones: 0, leaves: 0, scatter: 0, gather: 0, clouds: 0, blooms: 0, shrooms: 0, turtle: 0, bird: 0, flyLooks: 0 };

  // ── 路線：沿石板路走進畫裡 ──
  const R = M.route; const SEG = [0]; for (let i = 1; i < R.length; i++) SEG.push(SEG[i - 1] + Math.hypot(R[i].x - R[i - 1].x, R[i].y - R[i - 1].y)); const TOTAL = SEG[SEG.length - 1];
  const S_FOOT = SEG[M.route_foot], S_SHORE = SEG[M.route_shore]; const BASE_H = M.hero_h * H;
  function posAt(s) { s = clamp(s, 0, TOTAL); let i = 1; while (i < R.length - 1 && SEG[i] < s) i++; const t = (s - SEG[i - 1]) / (SEG[i] - SEG[i - 1]); const a = R[i - 1], b = R[i]; return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), h: lerp(a.h, b.h, t) }; }
  function sOfX(x) { x = clamp(x, R[R.length - 1].x, R[0].x); let i = 1; while (i < R.length - 1 && R[i].x > x) i++; const a = R[i - 1], b = R[i]; return lerp(SEG[i - 1], SEG[i], (a.x - x) / (a.x - b.x)); }
  const PL = M.platform; const FE = M.float_ends; const KP = PL.h / BASE_H;   /* 平台與浮空石上的人物縮放 */
  const tea = api.player; const teaH0 = parseFloat(tea.style.height);
  const pose = { x: state.x, y: R[0].y, k: 1 };
  function setPose(x, y, k) { pose.x = x; pose.y = y; pose.k = k; state.x = x; tea.style.top = Y(y); tea.style.height = (teaH0 * k) + '%'; tea.style.setProperty('--k', k.toFixed(3)); }
  const me = { mode: 'route', s: 90, stone: 0, target: null, busy: false, idle: 0, moving: false };
  let hold = 0; const lockOn = () => { hold += 1; api.lock(true); }, lockOff = () => { hold = Math.max(0, hold - 1); if (!hold) api.lock(false); };
  if (Q.has('x') && !onPlat) me.s = sOfX(Number(Q.get('x')) * W);
  else if (savedPos && savedPos.mode === 'plat') { me.mode = 'plat'; }
  else if (savedPos && Number.isFinite(savedPos.s)) me.s = clamp(savedPos.s, 0, TOTAL);
  if (me.mode === 'plat') setPose(clamp(onPlat ? PL.x0 + 14 : (savedPos.x || PL.land[0]), PL.x0, PL.x1), PL.y, KP); else { const p = posAt(me.s); setPose(p.x, p.y, p.h / BASE_H); }
  const savePos = () => { if (!window.StudioDB || (window.IslandBridge && window.IslandBridge.done)) return null; return StudioDB.set(POSKEY, me.mode === 'plat' ? { mode: 'plat', x: pose.x } : { mode: 'route', s: me.mode === 'route' ? me.s : S_FOOT }).catch(() => {}); };
  setInterval(savePos, 1500); if (window.IslandBridge) window.IslandBridge.beforeComplete(savePos);
  const walkAnim = (el, t, on_) => window.WalkSway.css(el, window.WalkSway.pose(t, on_));   // 走路晃動跟工作室同一組（studio_web/walk_sway.js），停下來不晃
  let walkClock = 0, prevX = state.x, firstFrame = true;
  const speedK = h => clamp(h / BASE_H, 0.22, 1);
  // 每一幀：引擎已經照按鍵把 state.x 往左或往右推了一步，這裡只拿「往哪邊、推多少」，換成沿路線前進的距離，再把 state.x 放回路線上
  api.onFrame(dt => {
    walkClock += dt;
    if (firstFrame) { firstFrame = false; prevX = pose.x; state.x = pose.x; }   /* 引擎載入時會把 state.x 換成它自己記的位置，位置以這支記的為準 */
    let dxE = state.x - prevX; let walking = false;
    if (me.busy || hold) { state.x = pose.x; prevX = pose.x; return; }
    if (me.mode === 'route') {
      if (Math.abs(dxE) > 90) { me.s = sOfX(state.x); me.target = null; dxE = 0; }   /* 測試直接搬人 */
      const p0 = posAt(me.s); const k = speedK(p0.h);
      if (dxE) { me.target = null; me.s = clamp(me.s - dxE * k, 0, TOTAL); walking = true; }
      else if (me.target !== null) { const d = me.target - me.s; const stepS = 580 * k * dt; if (Math.abs(d) <= stepS) { me.s = me.target; me.target = null; } else { me.s += Math.sign(d) * stepS; state.face = d > 0 ? -1 : 1; walking = true; } }
      const p = posAt(me.s); setPose(p.x, p.y, p.h / BASE_H);
    } else if (me.mode === 'plat') {
      if (Math.abs(dxE) > 90) dxE = 0;
      let x = pose.x;
      if (dxE) { me.target = null; x = clamp(x + dxE * KP, PL.x0, PL.x1); walking = x !== pose.x; }
      else if (me.target !== null) { const d = me.target - x; const stepX = 580 * KP * dt; if (Math.abs(d) <= stepX) { x = me.target; me.target = null; } else { x += Math.sign(d) * stepX; state.face = d > 0 ? 1 : -1; walking = true; } }
      setPose(x, PL.y, KP);
    } else { const f = floats[me.stone - 1]; setPose(f.cx, f.cy, KP); }
    me.moving = walking; me.idle = walking ? 0 : me.idle + dt; prevX = pose.x;
    api.render(); walkAnim(tea, walkClock, walking);
  });
  // 劇情帶著走一段（沿路線）
  function walkS(sTo, mul = 1) { return new Promise(ok => { sTo = clamp(sTo, 0, TOTAL); me.busy = true; let t = 0;
    const anim = dt => { t += dt; const d = sTo - me.s; const k = speedK(posAt(me.s).h); const stepS = 580 * k * dt * mul; if (Math.abs(d) > 2) state.face = d > 0 ? -1 : 1;
      if (Math.abs(d) <= stepS) me.s = sTo; else me.s += Math.sign(d) * stepS; const p = posAt(me.s); setPose(p.x, p.y, p.h / BASE_H); prevX = pose.x; api.render(); walkAnim(tea, t, me.s !== sTo);
      if (me.s === sTo) { const i = api.frameHooks.indexOf(anim); if (i >= 0) api.frameHooks.splice(i, 1); me.busy = false; me.target = null; ok(); } };
    api.frameHooks.push(anim); }); }
  function walkP(xTo) { return new Promise(ok => { xTo = clamp(xTo, PL.x0, PL.x1); me.busy = true; let t = 0;
    const anim = dt => { t += dt; const d = xTo - pose.x; const stepX = 520 * KP * dt; if (Math.abs(d) > 1) state.face = d > 0 ? 1 : -1; const x = Math.abs(d) <= stepX ? xTo : pose.x + Math.sign(d) * stepX; setPose(x, PL.y, KP); prevX = x; api.render(); walkAnim(tea, t, x !== xTo);
      if (x === xTo) { const i = api.frameHooks.indexOf(anim); if (i >= 0) api.frameHooks.splice(i, 1); me.busy = false; me.target = null; ok(); } };
    api.frameHooks.push(anim); }); }
  // 走到路線上某個 x 附近（只在路線上）：已經夠近就不動
  async function approach(x, range = 140) { if (me.mode !== 'route') return me.mode === 'plat' ? false : false; const d = pose.x - x; if (Math.abs(d) <= range) { if (Math.abs(d) > 20) state.face = d > 0 ? -1 : 1; api.render(); return true; }
    const tx = clamp(x + Math.sign(d) * range * 0.7, R[R.length - 1].x, R[0].x); await walkS(sOfX(tx)); state.face = pose.x > x ? -1 : 1; api.render(); return true; }
  // 點地面走過去：引擎的那一套只會左右平走（flat.json 把 feet_y 設在畫面外讓它不啟動），這裡照路線走
  const stageEl = document.getElementById('stage'); let pd = null;
  stageEl.addEventListener('pointerdown', e => { pd = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  stageEl.addEventListener('pointerup', e => {
    if (!pd) return; const moved = Math.hypot(e.clientX - pd.x, e.clientY - pd.y), held = performance.now() - pd.t; pd = null;
    if (moved > 14 || held > 180 || api.panelOpen() || api.isLocked() || me.busy) return;
    const sc = api.getScale(); const px = api.camX() + e.clientX / sc, py = (e.clientY / innerHeight * api.VIEW.h + api.VIEW.top) * H;
    if (me.mode === 'route') { const s = sOfX(px); const p = posAt(s); if (py > p.y - p.h * 1.15 - 30 && py < p.y + 200) me.target = s; }
    else if (me.mode === 'plat') { if (py > PL.y - 110 && py < PL.y + 60 && px > PL.x0 - 60 && px < PL.x1 + 40) me.target = clamp(px, PL.x0, PL.x1); }
  });

  // ── 鏡頭：出口那一段看整張，越往鐘塔走越拉近；上了浮空石與平台再往上移 ──
  const V = M.views; const fullView = Q.get('view') === 'full';
  function viewTarget() { if (me.mode !== 'route') return V.up; const t = smooth(clamp((V.zoom_from - pose.x) / (V.zoom_from - V.zoom_to), 0, 1)); return { top: lerp(V.road.top, V.tower.top, t), h: lerp(V.road.h, V.tower.h, t) }; }
  let viewOverride = null;
  if (!fullView) { const v0 = viewTarget(); api.VIEW.top = v0.top; api.VIEW.h = v0.h; dispatchEvent(new Event('resize'));
    api.onFrame(dt => { const v = viewOverride || viewTarget(); const r = Math.min(1, dt * 2.6); const top = api.VIEW.top + (v.top - api.VIEW.top) * r, h = api.VIEW.h + (v.h - api.VIEW.h) * r;
      if (Math.abs(top - api.VIEW.top) > 0.0002 || Math.abs(h - api.VIEW.h) > 0.0002) { api.VIEW.top = top; api.VIEW.h = h; dispatchEvent(new Event('resize')); }
      api.setCamShift(viewOverride ? (viewOverride.shift || 0) : me.mode === 'route' ? 0 : -110); }); }

  // ── 停下時間 ──
  const tint = document.createElement('div'); tint.id = 'freezetint'; const dim = document.createElement('div'); dim.id = 'freezedim'; stageEl.append(tint, dim);
  const stopBtn = document.createElement('button'); stopBtn.id = 'stoptime'; stopBtn.type = 'button'; stopBtn.innerHTML = '停下時間<small>T</small><u></u>'; document.body.appendChild(stopBtn);
  const FREEZE_SECS = 5.2; const tm = { frozen: false, left: 0, hold: 0, t: 0, cool: 0, f: 1 };   /* t：世界的時間，停住時不走；f：浮空石飄動的份量（停住時收到 0） */
  const canFreeze = () => !ch5 || on('c5_taught'); const showStop = () => { stopBtn.hidden = !canFreeze(); }; showStop();
  const thawHooks = [], freezeHooks = [];
  function freeze() {
    if (!canFreeze() || tm.frozen || tm.cool > 0 || hold || api.panelOpen() || api.cgOpen() || me.busy) return false;
    tm.frozen = true; tm.left = FREEZE_SECS; document.body.classList.add('frozen'); sfx.freeze(); stats.freezes += 1;
    tea.classList.remove('casting'); void tea.offsetWidth; tea.classList.add('casting'); setTimeout(() => tea.classList.remove('casting'), 720);
    for (const f of freezeHooks) f(); refreshZones(); return true;
  }
  function thaw() { if (!tm.frozen) return; tm.frozen = false; tm.left = 0; tm.cool = 0.8; document.body.classList.remove('frozen'); sfx.unfreeze(); for (const f of thawHooks) f(); refreshZones(); }
  stopBtn.addEventListener('click', e => { e.stopPropagation(); freeze(); }); stopBtn.addEventListener('pointerdown', e => e.stopPropagation());
  api.onFrame(dt => {
    if (tm.cool > 0) tm.cool -= dt;
    if (tm.frozen) { if (!(tm.hold > 0 && tm.left < 0.7)) tm.left -= dt; stopBtn.style.setProperty('--left', clamp(tm.left / FREEZE_SECS, 0, 1).toFixed(3)); if (tm.left <= 0) thaw(); }
    else tm.t += dt;
    tm.f = clamp(tm.f + (tm.frozen ? -dt / 0.22 : dt / 0.6), 0, 1);
  });
  const wdt = dt => tm.frozen ? 0 : dt;   /* 世界的 dt：停住時是 0 */

  // ── 月光、鐘面與塔窗的暖光（程式畫的光，screen 混色） ──
  const glowAt = (cls, x, y, w, h = w) => { const d = document.createElement('div'); d.className = 'cglow ' + cls; Object.assign(d.style, { left: X(x), top: Y(y), width: X(w), height: Y(h) }); under(d); return d; };
  const MOON = M.moon; const moonGlow = glowAt('moon', MOON.x, MOON.y, 330);
  // 海面的月光：一條細碎的亮點，畫在月亮正下方那一段的小 canvas 上（半解析度，不在畫面裡就不畫）
  const SEA = { x: MOON.x - 110, y: MOON.horizon, w: 220, h: MOON.band_bottom - MOON.horizon }; const seaCv = document.createElement('canvas'); seaCv.className = 'capecv'; seaCv.width = SEA.w / 2; seaCv.height = SEA.h / 2;
  Object.assign(seaCv.style, { left: X(SEA.x), top: Y(SEA.y), width: X(SEA.w), height: Y(SEA.h), mixBlendMode: 'screen' }); under(seaCv); const sg = seaCv.getContext('2d'); sg.scale(0.5, 0.5);
  const glints = []; let nextGlint = 0; let moonDim = 0;   /* moonDim 0 到 1：雲遮住月亮多少 */
  const inView = (x0, x1) => { const s = api.getScale(), vw = innerWidth / s, cx = api.camX(); return !(cx + vw < x0 || cx > x1); };
  api.onFrame(dt0 => { const dt = wdt(dt0); if (!inView(SEA.x, SEA.x + SEA.w)) return;
    nextGlint -= dt; if (nextGlint <= 0 && glints.length < 16) { const y = rnd(6, SEA.h - 4); const half = 18 + y / SEA.h * 62; glints.push({ x: SEA.w / 2 + rnd(-half, half), y, w: rnd(5, 14) * (0.6 + y / SEA.h), h: rnd(1.4, 2.6), life: rnd(1.6, 3.6), age: 0, a: rnd(0.3, 0.6) }); nextGlint = rnd(0.12, 0.4); }
    sg.clearRect(0, 0, SEA.w, SEA.h);
    for (let i = glints.length - 1; i >= 0; i--) { const q = glints[i]; q.age += dt; if (q.age > q.life) { glints.splice(i, 1); continue; } const al = q.a * Math.sin(q.age / q.life * Math.PI) * (1 - moonDim * 0.85); sg.fillStyle = `rgba(226,234,255,${al})`; sg.beginPath(); sg.ellipse(q.x, q.y, q.w, q.h, 0, 0, 6.283); sg.fill(); }
    if (moonDim > 0.01) { sg.fillStyle = `rgba(0,0,0,${moonDim * 0.001})`; sg.fillRect(0, 0, 1, 1); } });
  // 雲遮月的時候，原畫上那條畫好的月光也要暗下來：蓋一塊跟海同色的暗塊（普通混色）
  const seaShade = document.createElement('div'); seaShade.className = 'capecv'; Object.assign(seaShade.style, { left: X(SEA.x - 20), top: Y(SEA.y + 2), width: X(SEA.w + 40), height: Y(SEA.h), background: 'radial-gradient(ellipse at 50% 40%,rgba(28,44,120,.62),rgba(28,44,120,.4) 55%,rgba(28,44,120,0) 78%)', opacity: '0' }); seaCv.before(seaShade);
  const CL = M.clock; glowAt('warm', CL.cx, CL.cy, 120, 150); glowAt('warm', 588, 421, 60); glowAt('warm', 668, 421, 60).style.animationDelay = '-2s'; glowAt('warm', 621, 333, 46).style.animationDelay = '-1s';

  // ── 鐘塔指針：兩根程式畫的紙片，整組橫向壓成 squash 倍再轉（鐘面是直的橢圓）。stop 停住、ccw 逆時針、cw 順時針 ──
  const hands = document.createElement('div'); hands.className = 'clockhands'; Object.assign(hands.style, { left: X(CL.cx), top: Y(CL.cy) });
  const hWrap = document.createElement('div'); hWrap.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0'; hands.appendChild(hWrap);
  const mkHand = (len, wd) => { const pivot = document.createElement('div'); pivot.style.cssText = 'position:absolute;left:0;top:0;width:0;height:0'; const i = document.createElement('i'); pivot.appendChild(i); hWrap.appendChild(pivot); return { pivot, i, len, wd }; };
  const handL = mkHand(CL.hand_long, 2.6), handS = mkHand(CL.hand_short, 3.4); const hub = document.createElement('b'); hWrap.appendChild(hub); under(hands);
  function sizeHands() { const s = api.getScale(); hWrap.style.transform = `scaleX(${CL.squash})`; for (const h of [handL, handS]) { Object.assign(h.i.style, { width: (h.wd * s) + 'px', height: (h.len * s) + 'px', left: (-h.wd * s / 2) + 'px' }); } const r = 2.4 * s; Object.assign(hub.style, { width: (2 * r) + 'px', height: (2 * r) + 'px', left: (-r) + 'px', top: (-r) + 'px' }); }
  const clock = { dir: 'stop', a: 62, rate: 0, turns: 0 };   /* a：分針的角度（度，順時針為正）；時針是它的十二分之一再加一個固定的偏移 */
  const RATE = { stop: 0, ccw: -42, cw: 30 };
  function clockDir() { if (ch5) return on('c5_cg') ? 'ccw' : 'stop'; if (te) return on('gift_ming') || on('te_flipped') ? 'cw' : 'ccw'; return 'ccw'; }
  clock.dir = clockDir(); clock.rate = RATE[clock.dir];
  function setClock(dir) { clock.dir = dir; save({ clock_dir: dir }); }
  let lastScale = 0;
  api.onFrame(dt0 => { const dt = wdt(dt0); const s = api.getScale(); if (s !== lastScale) { lastScale = s; sizeHands(); }
    clock.rate += (RATE[clock.dir] - clock.rate) * Math.min(1, dt * 2.5); clock.a += clock.rate * dt; clock.turns += clock.rate * dt / 360;
    handL.pivot.style.transform = `rotate(${clock.a.toFixed(2)}deg)`; handS.pivot.style.transform = `rotate(${(clock.a / 12 + 305).toFixed(2)}deg)`; });

  // ── 浪：礁石邊一道一道打上來（程式畫在一張小 canvas 上），浪退的時候礁石縫露出來 ──
  const WV = { x: 40, y: 650, w: 330, h: 150 }; const waveCv = document.createElement('canvas'); waveCv.className = 'capecv'; waveCv.width = WV.w; waveCv.height = WV.h; Object.assign(waveCv.style, { left: X(WV.x), top: Y(WV.y), width: X(WV.w), height: Y(WV.h) }); under(waveCv); const wg = waveCv.getContext('2d');
  const wave = { level: 0, period: 3.8, n: 0 }; const REEF = { x: 190, y: 736 }; const GEAR_A = { x: 204, y: 730 };   /* 小礁石的腳邊；齒輪卡在它右下的縫 */
  const waveLevel = t => { const ph = (t / wave.period) % 1; return Math.pow(Math.sin(ph * Math.PI), 2); };
  const turtle = { x: 96, y: 786, dir: 1, t: 0, up: 0, el: null };
  function drawWave() {
    wave.level = waveLevel(tm.t); const n = Math.floor(tm.t / wave.period); if (n !== wave.n) { wave.n = n; if (pose.x < 900 && !tm.frozen) sfx.wave(); }
    if (!inView(WV.x, WV.x + WV.w)) return; wg.clearRect(0, 0, WV.w, WV.h); wg.filter = 'blur(2.2px)'; const L = wave.level; const ox = WV.x, oy = WV.y;
    const ring = (cx, cy, rx, ry, al, lw) => { wg.lineWidth = lw * 2.2; wg.lineCap = 'round'; wg.setLineDash([26, 7, 12, 5, 34, 9]); wg.lineDashOffset = -tm.t * 6; wg.strokeStyle = `rgba(240,246,255,${al * 0.62})`; wg.beginPath(); for (let a = 0; a <= 6.3; a += 0.25) { const wob = 1 + Math.sin(a * 5 + tm.t * 2.2) * 0.06; const x = cx - ox + Math.cos(a) * rx * wob, y = cy - oy + Math.sin(a) * ry * wob; a ? wg.lineTo(x, y) : wg.moveTo(x, y); } wg.stroke(); };
    // 浪上來：小礁石腳邊一片水色漫上來蓋住石縫，外面兩圈泡沫往外推；岩壁腳下濺起水花
    if (L > 0.02) { const g = wg.createRadialGradient(REEF.x - ox + 6, REEF.y - oy, 2, REEF.x - ox + 6, REEF.y - oy, 46); g.addColorStop(0, `rgba(70,110,200,${0.85 * L})`); g.addColorStop(0.6, `rgba(60,96,190,${0.55 * L})`); g.addColorStop(1, 'rgba(50,80,170,0)'); wg.fillStyle = g; wg.beginPath(); wg.ellipse(REEF.x - ox + 6, REEF.y - oy, 48, 16 + 8 * L, 0, 0, 6.283); wg.fill(); }
    ring(REEF.x + 4, REEF.y - 2, 30 + 16 * L, 8 + 6 * L, 0.2 + 0.6 * L, 2.4); ring(REEF.x + 4, REEF.y, 46 + 22 * L, 12 + 8 * L, 0.5 * L, 1.4);
    ring(262, 752, 24 + 12 * L, 7 + 5 * L, 0.15 + 0.55 * L, 2.2); ring(130, 668, 52 + 10 * L, 9 + 3 * L, 0.12 + 0.3 * L, 1.6);
    if (L > 0.55) { const k = (L - 0.55) / 0.45; for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.2; const d = 10 + 26 * k + (i % 3) * 5; wg.fillStyle = `rgba(245,250,255,${0.75 * k})`; wg.beginPath(); wg.arc(258 - ox + Math.cos(a) * d * 0.9, 748 - oy + Math.sin(a) * d, 1.6 + (i % 2), 0, 6.283); wg.fill(); } }
    // 海龜的水線
    ring(turtle.x, turtle.y - 7, 30, 5, 0.42, 1.5);
  }
  api.onFrame(drawWave);

  // ── 浮空石 ──
  const floats = M.floats.map(f0 => ({ ...f0, cx: f0.x, cy: f0.y, sink: 0, sx: 0, el: null }));
  for (const f of [...floats].reverse()) { const im = document.createElement('img'); im.className = 'cfloat'; im.src = f.img; im.alt = ''; im.draggable = false; Object.assign(im.style, { width: X(f.w), height: Y(f.h) }); art.insertBefore(im, firstPerson); f.el = im; }
  const bobOf = f => f.bob * Math.sin(6.2832 * (tm.t / f.period + f.phase)) + (f.wob || 0) * Math.sin(6.2832 * tm.t / (f.wob_period || 1));
  function placeFloats() { for (const f of floats) { f.cx = f.x + f.sx; f.cy = f.y + tm.f * bobOf(f) * (f.sink ? Math.max(0, 1 - f.sink / 20) : 1) + f.sink; f.el.style.left = X(f.cx - f.ax * f.w); f.el.style.top = Y(f.cy - f.ay * f.h); } }
  placeFloats(); api.frameHooks.unshift(() => placeFloats());   /* 排在最前面：這一幀站在石頭上的人、石頭上的齒輪都用這一幀的位置 */
  const GROUND = { x: FE.ground[0], y: R[M.route_foot].y }; const TOP = { x: PL.land[0], y: PL.y };
  // 一段跳：沿小拋物線從現在的位置落到 to()（落點每一幀重算，石頭在動也對得上）
  function hopTo(to, secs = 0.3, arc = 24) { return new Promise(ok => { const x0 = pose.x, y0 = pose.y; let t = 0; const p1 = to(); if (Math.abs(p1.x - x0) > 2) state.face = p1.x > x0 ? 1 : -1; sfx.hop(); stats.jumps += 1;
    const anim = dt => { t += dt / secs; const e = Math.min(1, t); const p = to(); setPose(lerp(x0, p.x, e), lerp(y0, p.y, e) - Math.sin(e * Math.PI) * arc, KP); prevX = pose.x; api.render(); tea.style.setProperty('--rock', (Math.sin(e * Math.PI) * -8 * state.face) + 'deg');
      if (e >= 1) { const i = api.frameHooks.indexOf(anim); if (i >= 0) api.frameHooks.splice(i, 1); tea.style.setProperty('--rock', '0deg'); tea.classList.remove('landed'); void tea.offsetWidth; tea.classList.add('landed'); ok(); } };
    api.frameHooks.push(anim); }); }
  const stoneTop = i => () => ({ x: floats[i - 1].cx, y: floats[i - 1].cy });
  let sinkTold = false;
  // 沒停時間踩上去，或停下時間的五秒到了：石頭往下沉，把她輕輕放回岩壁下，再飄回原位
  async function sinkDown() { const f = floats[me.stone - 1]; me.busy = true; stats.sinks += 1; sfx.sinking(); if (!sinkTold) { sinkTold = true; tip('浮空石往下沉，把她輕輕放回地面'); }
    const dy = (GROUND.y - 4) - f.y, dx = (GROUND.x - 26) - f.x; const secs = clamp(Math.hypot(dx, dy) / 120, 0.5, 2.4);
    await new Promise(ok => { let t = 0; const anim = dt => { t += dt / secs; const e = smooth(Math.min(1, t)); f.sink = Math.max(0.01, dy * e); f.sx = dx * e; placeFloats(); setPose(f.cx, f.cy, KP); prevX = pose.x; api.render(); if (t >= 1) { const i = api.frameHooks.indexOf(anim); if (i >= 0) api.frameHooks.splice(i, 1); ok(); } }; api.frameHooks.push(anim); });
    await hopTo(() => GROUND, 0.24, 10); me.mode = 'route'; me.s = S_FOOT; me.stone = 0; me.busy = false; refreshZones(); onArrive();
    let t = 0; const back = dt => { t += dt / 1.1; const e = 1 - smooth(Math.min(1, t)); f.sink = dy * e; f.sx = dx * e; if (t >= 1) { f.sink = 0; f.sx = 0; const i = api.frameHooks.indexOf(back); if (i >= 0) api.frameHooks.splice(i, 1); } }; api.frameHooks.push(back);
  }
  let queued = 0;
  async function jump(dir) {   /* dir 1 往平台、-1 往岩壁下 */
    if (me.busy) { if (me.mode === 'stone') queued = dir; return; } if (hold || api.panelOpen() || api.cgOpen()) return;
    if (me.mode === 'route') { if (dir < 0) return; me.busy = true; me.target = null; if (Math.abs(me.s - S_FOOT) > 3) { me.busy = false; await walkS(S_FOOT); me.busy = true; } me.mode = 'stone'; me.stone = 1; await hopTo(stoneTop(1)); landOn(); return; }
    if (me.mode === 'plat') { if (dir > 0) return; me.busy = true; me.target = null; if (Math.abs(pose.x - TOP.x) > 3) { me.busy = false; await walkP(TOP.x); me.busy = true; } me.mode = 'stone'; me.stone = 5; await hopTo(stoneTop(5)); landOn(); return; }
    const next = me.stone + dir; me.busy = true;
    if (next > 5) { await hopTo(() => TOP, 0.3, 20); me.mode = 'plat'; me.stone = 0; me.busy = false; sfx.wood(0); if (CT.mode === 'visit') CT.completeFreeInteraction(); refreshZones(); onArrive(); return; }
    if (next < 1) { await hopTo(() => GROUND, 0.3, 16); me.mode = 'route'; me.s = S_FOOT; me.stone = 0; me.busy = false; refreshZones(); onArrive(); return; }
    me.stone = next; await hopTo(stoneTop(next)); landOn();
  }
  function landOn() { sfx.stone(me.stone - 1); sparkle(pose.x, pose.y + 6, 3, 0.5); refreshZones();
    if (!tm.frozen) { queued = 0; sinkDown(); return; }
    me.busy = false; if (queued) { const d = queued; queued = 0; jump(d); } }
  thawHooks.push(() => { if (me.mode === 'stone' && !me.busy) sinkDown(); else if (me.mode === 'stone') { const chk = () => { if (me.mode !== 'stone') return; if (me.busy) { setTimeout(chk, 60); return; } if (!tm.frozen) sinkDown(); }; setTimeout(chk, 60); } });
  const nextSpot = dir => { if (me.mode === 'route') return floats[0]; if (me.mode === 'plat') return floats[4]; const n = me.stone + dir; if (n > 5) return { cx: TOP.x, cy: TOP.y - 20 }; if (n < 1) return { cx: GROUND.x, cy: GROUND.y - 20 }; return floats[n - 1]; };
  const zUp = zone('jump_up', () => me.mode === 'route' ? '跳上浮空石' : '往上跳', { x: 0, w: 62, y: 0, h: 64 }, () => jump(1), { when: () => me.mode !== 'plat' });
  const zDown = zone('jump_down', () => me.mode === 'plat' ? '跳下浮空石' : '往下跳', { x: 0, w: 62, y: 0, h: 64 }, () => jump(-1), { when: () => me.mode !== 'route' });
  api.onFrame(() => { const u = nextSpot(1), d = nextSpot(-1); zUp.moveTo(u.cx, u.cy - 40); zDown.moveTo(d.cx, d.cy - 40); });
  addEventListener('keydown', e => {
    if (api.panelOpen() || api.cgOpen() || document.getElementById('gearcard')?.style.display === 'block') return; const k = e.key;
    if (k === 't' || k === 'T') { freeze(); return; }
    const up = k === 'ArrowUp' || k === 'w' || k === 'W', down = k === 'ArrowDown' || k === 's' || k === 'S', left = k === 'ArrowLeft' || k === 'a' || k === 'A', right = k === 'ArrowRight' || k === 'd' || k === 'D', act = k === 'Enter' || k === ' ';
    if (me.mode === 'stone') { if (!(up || down || left || right || act)) return; e.preventDefault(); e.stopImmediatePropagation();
      if (act && me.stone === GEAR_STONE && gearOn('c') && !me.busy) { takeGear('c'); return; } jump(up || left || act ? 1 : -1); return; }
    if (me.mode === 'route' && up && Math.abs(me.s - S_FOOT) < 60) { e.preventDefault(); jump(1); }
    if (me.mode === 'plat' && down) { e.preventDefault(); jump(-1); }
  }, true);

  // ── 任務紙條與齒輪格 ──
  const quest = document.getElementById('quest'), pal = document.getElementById('palette');
  const got = new Set((st.gears_c5 || '').split(',').filter(Boolean)); const GEAR_STONE = 3;
  const gearOn = id => ch5 && on('c5_stopped') && !got.has(id) && !on('c5_cg');
  function questText() {
    if (ch5) { if (on('c5_done')) return ''; if (on('c5_cg')) return '跳回岩壁下，沿石板路回出口'; if (!on('c5_taught')) return ''; if (!on('c5_stopped')) return '走到浪邊，按「停下時間」'; if (got.size >= 3) return '把齒輪交給明'; return `齒輪${got.size}/3`; }
    if (te) { if (on('gift_ming')) return ''; if (!on('te_talk')) return ''; if (!on('te_stopped')) return '用「停下時間」讓指針停住。'; if (!on('te_flipped')) return '鐘塔那天最後裝上去的齒輪，拿下來翻面再裝回去。'; return ''; }
    return '';
  }
  function setQuest() { const t = questText(); quest.hidden = !t; quest.textContent = t; const showPal = ch5 && on('c5_stopped') && !on('c5_cg'); pal.hidden = !showPal;
    if (showPal) { pal.replaceChildren(); for (const id of ['a', 'b', 'c']) { const sw = document.createElement('i'); sw.style.setProperty('--c', '#e9b84e'); sw.classList.toggle('got', got.has(id)); pal.appendChild(sw); } } }

  // ── 三個齒輪（第五章）：a 浪退才露出的礁石縫、b 鳥叼著飛、c 卡在第三塊浮空石上 ──
  const gearEls = {};
  async function flyGear(src, x0, y0, to, secs = 0.6, size = 18, endSize = 12) { const el = await sprite(src, 'gear flat spin', { edge: 4, jitter: 1 }); place(el, x0, y0, size, true); el.style.zIndex = 6; let t = 0; const spin = rnd(300, 480);
    return new Promise(ok => { const anim = dt => { t += dt / secs; const e = Math.min(1, t); const p = to(); el.style.left = X(lerp(x0, p.x, e)); el.style.top = Y(lerp(y0, p.y, e) - Math.sin(e * Math.PI) * 46); el.style.setProperty('--rot', (spin * e) + 'deg'); el.style.height = (lerp(size, endSize, e) / H * 100 / (1 - 2 * Number(el.dataset.pad))) + '%';
      if (e >= 1) { const i = api.frameHooks.indexOf(anim); if (i >= 0) api.frameHooks.splice(i, 1); el.remove(); ok(); } }; api.frameHooks.push(anim); }); }
  const GEAR_SRC = { a: '../art/sprites/gear_1.png', b: '../art/sprites/gear_3.png', c: '../art/sprites/gear_2.png' };
  async function takeGear(id) {
    if (got.has(id)) return; got.add(id); save({ gears_c5: [...got].join(','), s4_gear_count: String(got.size) }); sfx.gear(); sfx.pick();
    const el = gearEls[id]; let x0 = pose.x, y0 = pose.y - 40; if (el) { x0 = el._x; y0 = el._y; el.remove(); delete gearEls[id]; } if (id === 'b') { x0 = bird.x + bird.face * 18; y0 = bird.y - 8; bird.gear = false; }
    sparkle(x0, y0 - 6, 8); refreshZones(); setQuest(); tip(`拿到齒輪　${got.size}/3`);
    await flyGear(GEAR_SRC[id], x0, y0, () => ({ x: pose.x, y: pose.y - BASE_H * pose.k * 0.55 }), 0.7, 20, 12); sparkle(pose.x, pose.y - BASE_H * pose.k * 0.6, 5, 0.6);
  }
  if (ch5 && !on('c5_cg')) {
    if (!got.has('a')) { const el = await sprite(GEAR_SRC.a, 'gear flat glow', { edge: 4, jitter: 1 }); place(el, GEAR_A.x, GEAR_A.y, 17); el._x = GEAR_A.x; el._y = GEAR_A.y; el.style.zIndex = 1; waveCv.before(el); gearEls.a = el; }
    if (!got.has('c')) { const el = await sprite(GEAR_SRC.c, 'gear flat glow', { edge: 4, jitter: 1 }); const f = floats[GEAR_STONE - 1]; place(el, f.cx + 9, f.cy + 1, 15); gearEls.c = el; }
  }
  const nearShore = () => me.mode === 'route' && me.s >= S_SHORE - 70;
  const zGearA = zone('gear_a', '礁石縫裡的齒輪', { x: GEAR_A.x - 26, w: 52, y: GEAR_A.y - 34, h: 46 }, async () => {
    if (me.busy) return; if (!nearShore()) { tip('走到浪邊才拿得到'); if (me.mode === 'route') me.target = S_SHORE; return; }
    if (!tm.frozen) { tip(wave.level < 0.3 ? '浪一下子又蓋上來。趁浪退的時候按「停下時間」' : '浪蓋著。等浪退下去，再按「停下時間」'); return; }
    if (wave.level >= 0.3) { tip('停住了，可是浪還蓋著。等浪退下去再停一次'); return; } takeGear('a'); }, { when: () => gearOn('a') });
  const zGearC = zone('gear_c', '浮空石上的齒輪', { x: 0, w: 44, y: 0, h: 40 }, () => { if (me.busy) return; if (me.mode !== 'stone' || me.stone !== GEAR_STONE) { tip('要跳到那一塊浮空石上才拿得到'); return; } takeGear('c'); }, { when: () => gearOn('c') });
  api.onFrame(() => { if (gearEls.a) gearEls.a.style.opacity = clamp(1 - (wave.level - 0.2) / 0.25, 0, 1).toFixed(2);
    if (gearEls.c) { const f = floats[GEAR_STONE - 1]; const el = gearEls.c; el._x = f.cx + 9; el._y = f.cy + 1; el.style.left = X(el._x); el.style.top = Y(el._y); zGearC.moveTo(el._x, el._y - 30); } });

  // ── 叼齒輪的小鳥：在鐘塔右邊的坡上繞著飛，飛得很快；停下時間才定在半空 ──
  const birdSrc = []; for (let i = 0; i < 4; i++) birdSrc.push((await paperize(`../art/sprites/nbird_${i}.png`, { edge: 5, jitter: 2 })).src);
  const bird = { el: await sprite('../art/sprites/nbird_0.png', 'nbird flat', { edge: 5, jitter: 2 }), x: 1080, y: 430, face: 1, a: rnd(0, 6), gear: ch5 && !got.has('b') && !on('c5_cg'), flap: 0, look: 0 }; const BIRD_H = 40; const birdSheet = bird.el.querySelector('.sheet');
  place(bird.el, bird.x, bird.y, BIRD_H, true); bird.el.style.zIndex = 3;
  const birdAt = a => ({ x: 1090 + 330 * Math.sin(a), y: 418 + 62 * Math.sin(2 * a + 0.6) + 14 * Math.sin(3.7 * a) });
  const zBird = zone('bird', () => bird.gear && on('c5_stopped') ? '鳥嘴邊的齒輪' : '小鳥', { x: 0, w: 70, y: 0, h: 60 }, () => {
    if (me.busy) return; stats.bird += 1;
    if (!tm.frozen) { sfx.chirp(); tip(bird.gear && gearOn('b') ? '牠飛得太快，抓不到。先按「停下時間」' : '牠飛得太快了'); return; }
    if (bird.gear && gearOn('b')) { takeGear('b'); return; } sfx.chirp(); heart(bird.x, bird.y - BIRD_H - 4); bird.look = 1; });
  api.onFrame(dt0 => { const dt = wdt(dt0); bird.a += dt * 1.45; const p = birdAt(bird.a), q = birdAt(bird.a + 0.02); bird.x = p.x; bird.y = p.y; bird.face = q.x >= p.x ? 1 : -1; bird.flap += dt * 9;
    bird.el.style.left = X(bird.x); bird.el.style.top = Y(bird.y + BIRD_H / 2); bird.el.style.setProperty('--facing', bird.face); bird.el.style.setProperty('--rot', (clamp((q.y - p.y) * 9, -22, 22) * bird.face) + 'deg');
    const fr = (Math.floor(bird.flap) % 2) + (bird.gear ? 0 : 2); if (birdSheet.dataset.fr !== String(fr)) { birdSheet.dataset.fr = String(fr); birdSheet.src = birdSrc[fr]; }
    zBird.moveTo(bird.x + (bird.gear ? bird.face * 12 : 0), bird.y - BIRD_H / 2 - 8); });

  // ── 明 ──
  const mingEl = art.querySelector('.person.ming'); const mingH0 = parseFloat(mingEl.style.height); const MING_BASE = M.npcs.find(n => n.id === 'ming').h * H;
  const ming = { x: PL.ming[0], y: PL.ming[1], k: KP, where: 'plat', s: 0, busy: false, t: 0 };
  const mingPose = (x, y, k) => { ming.x = x; ming.y = y; ming.k = k; mingEl.style.left = X(x); mingEl.style.top = Y(y); mingEl.style.height = (mingH0 * k) + '%'; mingEl.style.setProperty('--k', k.toFixed(3)); };
  const mingLook = dir => mingEl.style.setProperty('--facing', dir > 0 ? -1 : 1);   /* 立繪本身朝畫面左前方：看右邊要鏡射 */
  const mingHpx = () => MING_BASE * ming.k;
  function mingHop(to, secs = 0.26) { return new Promise(ok => { const x0 = ming.x, y0 = ming.y; let t = 0; mingLook(to().x - x0); const anim = dt => { t += dt / secs; const e = Math.min(1, t); const p = to(); mingPose(lerp(x0, p.x, e), lerp(y0, p.y, e) - Math.sin(e * Math.PI) * 22, KP); if (e >= 1) { const i = api.frameHooks.indexOf(anim); if (i >= 0) api.frameHooks.splice(i, 1); ok(); } }; api.frameHooks.push(anim); }); }
  // 明跟著上下平台：一塊一塊跳，這段時間停下的時間不會到期
  async function mingClimb(up) { if (ming.busy) return; ming.busy = true; tm.hold += 1; const order = up ? [1, 2, 3, 4, 5] : [5, 4, 3, 2, 1];
    if (up) { const p = posAt(S_FOOT - 30); mingPose(p.x, p.y, KP); }
    for (const i of order) { await mingHop(stoneTop(i)); sfx.stone(i - 1); }
    if (up) { await mingHop(() => ({ x: TOP.x - 10, y: TOP.y })); ming.where = 'plat'; await mingWalk(PL.ming[0], PL.ming[1]); mingLook(1); }
    else { await mingHop(() => ({ x: GROUND.x + 34, y: GROUND.y + 2 })); ming.where = 'route'; ming.s = S_FOOT - 36; }
    tm.hold -= 1; ming.busy = false; refreshZones(); }
  function mingWalk(x1, y1) { return new Promise(ok => { const x0 = ming.x, y0 = ming.y; const secs = Math.max(0.15, Math.hypot(x1 - x0, y1 - y0) / (520 * KP)); let t = 0; if (Math.abs(x1 - x0) > 2) mingLook(x1 - x0);
    const anim = dt => { t += dt / secs; const e = Math.min(1, t); mingPose(lerp(x0, x1, e), lerp(y0, y1, e), KP); walkAnim(mingEl, t * secs, e < 1); if (e >= 1) { const i = api.frameHooks.indexOf(anim); if (i >= 0) api.frameHooks.splice(i, 1); ok(); } }; api.frameHooks.push(anim); }); }
  if (ch5) {
    ming.where = me.mode === 'plat' ? 'plat' : 'route'; ming.s = clamp(me.s + (me.s < 120 ? 110 : -90), 0, TOTAL);
    if (ming.where === 'plat') { mingPose(PL.ming[0], PL.ming[1], KP); mingLook(1); } else { const p = posAt(ming.s); mingPose(p.x, p.y, p.h / BASE_H); }
    // 在路上：跟在茶語後面（她往鐘塔走時他在靠出口那一側，往回走時反過來）；她上浮空石時在岩壁下等
    api.onFrame(dt => { if (ming.busy || ming.where !== 'route') return; ming.t += dt; const hT = posAt(me.s).h; const gap = 40 + hT * 0.34;
      let target = me.mode === 'route' ? me.s + state.face * gap : S_FOOT - 36; if (target < 0) target = me.s + gap; if (target > TOTAL - 4) target = me.s - gap; const d = target - ming.s; const k = speedK(posAt(ming.s).h); let moving = false;
      if (Math.abs(d) > 10) { ming.s += Math.sign(d) * Math.min(Math.abs(d) - 6, 600 * k * dt); moving = true; mingLook(d > 0 ? -1 : 1); } else mingLook(pose.x - ming.x);
      const p = posAt(ming.s); mingPose(p.x, p.y + 1, p.h / BASE_H); walkAnim(mingEl, ming.t, moving); });
  } else { mingPose(PL.ming[0], PL.ming[1], KP); mingLook(1); }
  const zMing = zone('ming', () => ch5 ? (got.size >= 3 && !on('c5_cg') ? '把齒輪交給明' : '明') : '跟明說話', { x: 0, w: 60, y: 0, h: 100 }, () => talkMing(), { when: () => !ming.busy });
  api.onFrame(() => { const h = mingHpx(); const w = Math.max(40, h * 0.5); zMing.r.w = w; zMing.hot.w = w; zMing.btn.style.width = X(w); zMing.btn.style.height = Y(h + 8); zMing.hot.h = (h + 8) / H; zMing.moveTo(ming.x, ming.y - h - 4); });
  // 到了一個地方（岩壁下、平台）之後要接的事
  function onArrive() {
    if (ch5 && me.mode === 'plat' && ming.where === 'route') mingClimb(true);
    if (ch5 && me.mode === 'route' && ming.where === 'plat') mingClimb(false);
  }
  const CG514 = [['', '〔鐘塔底下，兩個人坐在石頭平台的邊上。月亮就掛在海的上面。〕'], ['', '〔她手上拿著最後一個齒輪。〕'], ['明', '等遊戲做完，我有話跟妳說。'], ['茶語', '好啊。'],
    ['茶語', '（晨在朝霞丘也說過，等遊戲做完，有一件事要跟我說。）'], ['茶語', '（詩在海灘說，等遊戲做完，再把最後一句唱清楚。）'], ['茶語', '（三個人，都要等遊戲做完。）'], ['', '〔她站起來，走到鐘面底下。〕'],
    ['明', '裝上齒輪以後，時鐘就會開始轉動。'], ['', '〔她把齒輪放進去，轉了一下。齒輪咬住了。〕'], ['', '〔鐘塔裡傳出很重的一聲。〕'], ['', '〔鐘面上的指針動了。〕'], ['', '〔往左邊走。〕'], ['茶語', '……怎麼倒著轉？']];
  let giveState = 'idle'; let mingGearEl = null;
  async function give() {
    if (giveState !== 'idle') return; giveState = 'handing'; lockOn(); quest.hidden = true; pal.hidden = true; if (tm.frozen) thaw();
    await walkP(PL.x0 + 14); state.face = -1; api.render(); mingLook(1);
    for (const id of ['a', 'b', 'c']) { sfx.gear(); await flyGear(GEAR_SRC[id], pose.x - 8, pose.y - BASE_H * KP * 0.55, () => ({ x: ming.x + 8, y: ming.y - mingHpx() * 0.5 }), 0.45, 12, 10); }
    // 明把前兩個裝上去：換成「舉著齒輪」那一張（人和齒輪同一張紙片），齒輪的光往上到鐘面
    giveState = 'fitting'; if (!mingGearEl) { const pp = await paperize('../art/sprites/ming_gear.png'); mingGearEl = document.createElement('div'); mingGearEl.className = 'person npc ming_gear'; const sh = document.createElement('img'); sh.className = 'shadow'; sh.src = pp.shadow; sh.alt = ''; const im = document.createElement('img'); im.className = 'sheet'; im.src = pp.src; im.alt = ''; mingGearEl.append(sh, im); mingGearEl._pp = pp; }
    const pp = mingGearEl._pp; const hpx = mingHpx() * 1.02; const sc = hpx / (pp.height - pp.pad * 2); Object.assign(mingGearEl.style, { left: X(ming.x - 2), top: Y(ming.y), height: (pp.height * sc / H * 100) + '%' }); mingGearEl.style.setProperty('--pad', (pp.pad * sc / H * 100) + '%'); mingGearEl.style.setProperty('--k', KP.toFixed(3));
    for (let n = 0; n < 2; n++) { mingEl.style.visibility = 'hidden'; mingEl.after(mingGearEl); await wait(850); sfx.ratchet(4);
      const hx = ming.x - hpx * 0.2, hy = ming.y - hpx * 0.93; sparkle(hx, hy, 4, 0.5); mingGearEl.remove(); mingEl.style.visibility = ''; mingLook(-1);
      await flyGear(GEAR_SRC[n ? 'c' : 'a'], hx, hy, () => ({ x: CL.cx, y: CL.cy + 8 }), 0.7, 10, 8); sfx.gear(); sparkle(CL.cx, CL.cy, 6, 0.6); await wait(260); }
    mingLook(1); await wait(200); sfx.pick(); await flyGear(GEAR_SRC.b, ming.x + 8, ming.y - mingHpx() * 0.5, () => ({ x: pose.x - 6, y: pose.y - BASE_H * KP * 0.5 }), 0.5, 10, 12);
    giveState = 'cg'; CT.completeFreeInteraction(); await wait(300);
    if (CT.embedded) { save({ s4_gears_submitted: 'true' }); return CT.cut(6, { cg: '5-14' }); }   // 嵌在 Larch：CG 5-14～5-16 那一段交給對話卡演，回來接第 6 步
    api.showCg(true, M.cg_514, 1.5);
    setTimeout(() => openDialogue(CG514, [() => { api.hideCg(); save({ c5_cg: 'true', s4_gears_submitted: 'true' }); giveState = 'done'; lockOff(); setQuest(); refreshZones(); }],
      line => { if (line === CG514[9][1]) sfx.ratchet(6); if (line === CG514[10][1]) sfx.bong(); if (line === CG514[11][1]) { setClock('ccw'); sfx.tick(true); } }), 700);
  }
  // 真結局 4-3（劇本 真結局.md，一字不改）
  const S43_A = [['明', '來了。'], ['茶語', '它怎麼還在倒著轉？'], ['明', '這座島是妳的專案，我改不了。'], ['明', '要妳來裝。']];
  const S43_B = [['明', '我要給妳的，是一分鐘。'], ['茶語', '一分鐘？'], ['明', '之前，我一直想讓一分鐘久一點。因為後面的分鐘不多了。'], ['明', '現在不用讓它久了。這一分鐘走完，後面還有。'], ['', '（鏡頭拉近鐘面。分針往右邊走了一格。）'], ['明', '嗯。這次時鐘是順時針走了。'],
    { choice: [['再看一分鐘。', [['明', '好。'], ['', '（兩個人坐在鐘塔底下，分針又往右走了一格。）']]], ['走吧。', [['明', '嗯。']]]] }, ['', '（拿到禮物「明的一分鐘」。）']];
  const S43_DONE = [['明', '我這邊給過了。去吧。']];
  const card = (title, text, foot) => { const sc = document.getElementById('scroll'); sc.querySelector('small').textContent = foot; api.showScroll(title, text); };
  let talking = false;
  async function talkMing() {
    if (me.busy || talking || ming.busy) return;
    if (ch5) {
      if (on('c5_done')) { if (me.mode !== 'plat') { tip('明在鐘塔平台上。走到岩壁下按「停下時間」，一塊一塊跳上去'); return; } return errandMing(null); }   /* 第五章做完之後的上島自由時間：可以接明的小委託 */
      if (!on('c5_taught')) { mingNod(); return; }
      if (on('c5_cg')) { mingNod(); return; }   /* 兩個人一路都沒有說話 */
      if (got.size < 3) { mingNod(); tip(`齒輪還差 ${3 - got.size} 個`); return; }
      if (me.mode !== 'plat' || ming.where !== 'plat') { tip('帶著齒輪跳上鐘塔平台，再交給明'); return; }
      return give();
    }
    if (me.mode !== 'plat') { tip('明在鐘塔平台上。走到岩壁下按「停下時間」，一塊一塊跳上去'); if (me.mode === 'route') me.target = S_FOOT; return; }
    talking = true; lockOn(); await walkP(PL.x0 + 12); state.face = -1; api.render(); lockOff(); talking = false;
    if (ch7) return CT.c7Ask('ming', save, () => setTimeout(() => { card('第 31 天', '（待接劇本第七章「十一、第 31 天」的對話卡與 CG 7-14。）', '佔位說明'); save({ c7_ming: 'true', accompanied_ming: 'true' }); }, 250));
    if (api.gifts.gift_ming || on('gift_ming')) return errandMing(S43_DONE);
    if (on('te_flipped')) return giftTalk();
    if (!on('te_talk')) return openDialogue(S43_A, [() => { save({ te_talk: 'true' }); setQuest(); }]);
    mingNod(); tip(on('te_stopped') ? '停下時間，再點鐘面' : '按「停下時間」讓指針停住');
  }
  function mingNod() { mingEl.classList.remove('nod'); void mingEl.offsetWidth; mingEl.classList.add('nod'); setTimeout(() => mingEl.classList.remove('nod'), 520); }
  function giftTalk() { openDialogue(S43_B, [() => { api.gifts.gift_ming = true; CT.completeFreeInteraction(); save({ gift_ming: 'true', gifts: String(Object.keys(api.gifts).length) }); viewOverride = null; sfx.heart(); heart(ming.x + 10, ming.y - mingHpx() - 4); setQuest(); }],
    line => { if (line === S43_B[4][1]) { viewOverride = { top: 0.1, h: 0.4, shift: -70 }; clock.a += 6; sfx.tick(); } if (line === S43_B[5][1]) viewOverride = null; if (line.startsWith('（兩個人坐在鐘塔底下')) { clock.a += 6; sfx.tick(); } }); }
  // 真結局：停下時間 → 點鐘面，把最後那個齒輪拿下來、翻面、裝回去
  const gc = document.createElement('div'); gc.id = 'gearcard'; gc.innerHTML = '<div class="card"><img alt="" src="../art/sprites/gear_3.png"><p></p></div>'; document.body.appendChild(gc); const gcImg = gc.querySelector('img'), gcP = gc.querySelector('p'); let gcStep = 0;
  function openGearCard() { gcStep = 1; tm.hold += 1; gcImg.className = ''; gcP.textContent = '點一下齒輪，翻面'; gc.style.display = 'block'; sfx.gear(); }
  gc.addEventListener('click', async e => { e.stopPropagation(); if (gcStep === 1) { gcStep = 2; gcImg.classList.add('flipped'); sfx.paper(); gcP.textContent = '再點一下，裝回去'; return; }
    if (gcStep === 2) { gcStep = 3; gcImg.classList.add('back'); sfx.ratchet(6); await wait(520); gc.style.display = 'none'; gcStep = 0; save({ te_flipped: 'true' }); tm.hold -= 1; sparkle(CL.cx, CL.cy, 8, 0.7); setQuest(); thaw(); } });
  addEventListener('keydown', e => { if (gc.style.display === 'block' && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.stopImmediatePropagation(); gc.click(); } }, true);
  if (te) {
    freezeHooks.push(() => { if (on('te_talk') && !on('te_stopped') && me.mode === 'plat') { save({ te_stopped: 'true' }); setQuest(); } });
    thawHooks.push(() => { if (on('te_flipped') && clock.dir !== 'cw') { sfx.bong(); setClock('cw'); setTimeout(() => { if (!api.panelOpen() && !on('gift_ming')) giftTalk(); }, 900); } });
  }
  zone('clock', '鐘面', { x: CL.cx - 34, w: 68, y: CL.cy - 40, h: 80 }, () => {
    if (te && on('te_talk') && !on('te_flipped') && me.mode === 'plat') { if (!tm.frozen) { tip('指針還在轉。先按「停下時間」'); return; } if (gcStep === 0) openGearCard(); return; }
    sfx.tick(clock.dir === 'ccw'); tip(clock.dir === 'stop' ? '指針停著' : clock.dir === 'ccw' ? '指針往左邊走' : '指針往右邊走'); });

  // ── 第五章的劇情觸發 ──
  if (ch5) {
    if (!on('c5_intro')) setTimeout(() => openDialogue([['茶語', '是晚上耶。……有月亮。'], ['明', '嗯。']], [() => save({ c5_intro: 'true' })]), 900);
    let teaching = false;
    api.onFrame(() => { if (teaching || on('c5_taught') || me.mode !== 'route' || me.s < S_FOOT - 170 || api.panelOpen() || !on('c5_intro')) return; teaching = true; me.target = null; dropLeaf(930, 380, 905, 668);
      setTimeout(() => openDialogue([['明', '這裡的時間，妳可以讓它停一下。']], [() => { save({ c5_taught: 'true' }); showStop(); setQuest(); tip('學會了「停下時間」'); }]), 600); });
    freezeHooks.push(() => { if (!on('c5_stopped') && nearShore()) { save({ c5_stopped: 'true' }); setTimeout(() => { setQuest(); refreshZones(); tip('整張畫都停住了'); }, 500); } else if (!on('c5_stopped')) setTimeout(() => tip('到浪邊再停一次，看浪停在半空'), 600); });
    /* 第五章的島段主線做完才能離開（作者 2026-11-17 定）：還沒把齒輪交給明就走到出口，提示還有什麼沒做 */
    let exitTip = 0; const exitHot = api.hot.find(h => h.id === 'exit'); if (exitHot) exitHot.fn = () => { if (!on('c5_cg')) { const now = performance.now(); if (now - exitTip > 1800) { exitTip = now; tip('還不能離開：' + (questText() || '先到鐘塔下找明')); } window.dawnHill.exitBlocked = (window.dawnHill.exitBlocked || 0) + 1; return; } if (!on('c5_done')) { save({ c5_done: 'true', chapter5_cape_done: 'true' }); setQuest(); } return api.runHot(exitHot); };
  }

  // ── 落葉：松樹上偶爾掉一片，S 形飄到地上（紙片）；停下時間時定在半空 ──
  const leaves = []; const LEAF_FROM = [[930, 380, 905, 668], [1150, 300, 1120, 600], [1500, 250, 1540, 620], [1900, 200, 1860, 790], [2180, 160, 2120, 800], [860, 420, 800, 690]];
  async function dropLeaf(x0, y0, x1, y1) { const el = await sprite(`../art/sprites/leaf_${Math.random() < 0.5 ? 0 : 1}.png`, 'leaf flat spin', { edge: 3, jitter: 1 }); const size = clamp((y1 - 400) / 30, 9, 20); place(el, x0, y0, size, true); el.style.zIndex = 3; leaves.push({ el, x0, y0, x1, y1, t: 0, secs: rnd(5, 8), ph: rnd(0, 6), sw: rnd(18, 40) }); stats.leaves += 1; }
  let nextLeaf = rnd(2, 5);
  api.onFrame(dt0 => { const dt = wdt(dt0); nextLeaf -= dt; if (nextLeaf <= 0 && leaves.length < 5) { nextLeaf = rnd(3.5, 7); dropLeaf(...pick(LEAF_FROM)); }
    for (let i = leaves.length - 1; i >= 0; i--) { const l = leaves[i]; l.t += dt / l.secs; const e = Math.min(1, l.t); l.x = lerp(l.x0, l.x1, e) + Math.sin(e * 9 + l.ph) * l.sw * (1 - e * 0.5); l.y = lerp(l.y0, l.y1, e * e * 0.4 + e * 0.6);
      l.el.style.left = X(l.x); l.el.style.top = Y(l.y); l.el.style.setProperty('--rot', (Math.sin(e * 9 + l.ph) * 50 + e * 200) + 'deg'); if (e > 0.9) l.el.style.opacity = String((1 - e) * 10); if (e >= 1) { l.el.remove(); leaves.splice(i, 1); } } });

  // ── 海龜：在左下的礁石邊慢慢游，點了抬頭 ──
  const turSrc = []; for (const k of [0, 1]) turSrc.push((await paperize(`../art/sprites/turtle_${k}.png`, { edge: 5, jitter: 2 })).src);
  turtle.el = await sprite('../art/sprites/turtle_0.png', 'turtle flat', { edge: 5, jitter: 2 }); const TUR_H = 30; const turSheet = turtle.el.querySelector('.sheet'); place(turtle.el, turtle.x, turtle.y, TUR_H); under(turtle.el); turtle.el.style.zIndex = 1;
  const zTurtle = zone('turtle', '海龜', { x: turtle.x - 34, w: 68, y: turtle.y - TUR_H - 12, h: TUR_H + 18 }, () => { stats.turtle += 1; sfx.splash(); turtle.up = 2.6; turSheet.src = turSrc[1]; turtle.el.style.setProperty('--dip', '8%'); drops(turtle.x, turtle.y - 10, 4); setTimeout(() => heart(turtle.x + turtle.dir * 14, turtle.y - TUR_H - 6), 350); });
  api.onFrame(dt0 => { const dt = wdt(dt0); turtle.t += dt;
    if (turtle.up > 0) { turtle.up -= dt; if (turtle.up <= 0) { turSheet.src = turSrc[0]; turtle.el.style.setProperty('--dip', '26%'); } }
    else { turtle.x += turtle.dir * 9 * dt; if (turtle.x > 150) turtle.dir = -1; if (turtle.x < 52) turtle.dir = 1; }
    turtle.el.style.left = X(turtle.x); turtle.el.style.setProperty('--facing', turtle.dir); turtle.el.style.setProperty('--bob', (Math.sin(turtle.t * 1.8) * 3) + '%'); turtle.el.style.setProperty('--rot', (Math.sin(turtle.t * 1.1) * 3) + 'deg'); zTurtle.moveTo(turtle.x); });

  // ── 螢火蟲：程式畫的光點。走過去會散開，停著不動會聚到她身邊；飛很快的幾隻平常只看得到一道光，停下時間才看得清楚 ──
  const ffCv = document.createElement('canvas'); ffCv.id = 'ffcv'; ffCv.width = W / 2; ffCv.height = H / 2; art.appendChild(ffCv); const fg = ffCv.getContext('2d'); fg.scale(0.5, 0.5);
  const FF_HOME = [[905, 690], [960, 610], [1010, 560], [1120, 640], [1180, 520], [1260, 600], [1330, 560], [1400, 500], [1480, 590], [1560, 520], [1640, 600], [1720, 560], [1790, 640], [1860, 700], [1930, 620], [2000, 760], [2090, 560], [2200, 660], [2250, 520], [820, 620], [700, 690], [560, 680], [470, 700], [1420, 700], [1700, 800], [2140, 850]];
  const flies = FF_HOME.map(([x, y], i) => ({ hx: x, hy: y, x, y, vx: 0, vy: 0, ph: rnd(0, 6), r: rnd(1.6, 2.6), mode: 'home', i }));
  const fast = [0, 1, 2].map(i => ({ a: rnd(0, 6), cx: [1250, 1750, 1020][i], cy: [560, 620, 590][i], rx: [210, 170, 90][i], ry: [70, 90, 46][i], w: [3.1, 2.6, 3.6][i], x: 0, y: 0, px: 0, py: 0 }));
  let ffLast = null; const flyState = { gathered: 0, scattered: 0 };
  api.onFrame(dt0 => { const dt = wdt(dt0); const teaY = pose.y - BASE_H * pose.k * 0.5; const calm = me.idle > 2.2 && me.mode !== 'stone'; let gathered = 0, scattered = 0;
    for (const f of flies) { const dx = f.x - pose.x, dy = f.y - teaY, d = Math.hypot(dx, dy) || 1; const reach = 150 + BASE_H * pose.k * 0.6; let tx = f.hx + Math.sin(tm.t * 0.5 + f.ph) * 16, ty = f.hy + Math.cos(tm.t * 0.4 + f.ph * 1.3) * 10;
      if (calm && Math.hypot(f.hx - pose.x, f.hy - teaY) < 430) { const ang = f.ph + tm.t * 0.5; const rr = 24 + BASE_H * pose.k * 0.35 + (f.i % 3) * 8; tx = pose.x + Math.cos(ang) * rr; ty = teaY + Math.sin(ang) * rr * 0.55; f.mode = 'gather'; if (Math.hypot(f.x - tx, f.y - ty) < 30) gathered += 1; }
      else if (me.moving && d < reach) { tx = f.x + dx / d * 150; ty = f.y + dy / d * 110 - 30; if (f.mode !== 'scatter') { f.mode = 'scatter'; stats.scatter += 1; if (Math.random() < 0.3) sfx.twinkle(); } scattered += 1; }
      else if (f.mode !== 'home' && !calm) f.mode = 'home';
      const acc = f.mode === 'scatter' ? 9 : 2.2; f.vx += ((tx - f.x) * acc - f.vx * 3.2) * dt; f.vy += ((ty - f.y) * acc - f.vy * 3.2) * dt; f.x += f.vx * dt; f.y += f.vy * dt; }
    flyState.gathered = gathered; flyState.scattered = scattered; if (gathered >= 3) stats.gather = Math.max(stats.gather, gathered);
    for (const f of fast) { f.px = f.x; f.py = f.y; f.a += f.w * dt; f.x = f.cx + Math.cos(f.a) * f.rx + Math.sin(f.a * 2.3) * 30; f.y = f.cy + Math.sin(f.a * 1.7) * f.ry; }
    const s = api.getScale(), vw = innerWidth / s, cx = api.camX(); const x0 = cx - 40, x1 = cx + vw + 40; if (ffLast) fg.clearRect(ffLast[0], 0, ffLast[1] - ffLast[0], H); fg.clearRect(x0, 0, x1 - x0, H); ffLast = [x0, x1];
    for (const f of flies) { if (f.x < x0 || f.x > x1) continue; const al = 0.55 + 0.45 * Math.sin(tm.t * 2.4 + f.ph * 3); const g = fg.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 5); g.addColorStop(0, `rgba(255,244,170,${al})`); g.addColorStop(0.3, `rgba(255,224,120,${al * 0.5})`); g.addColorStop(1, 'rgba(255,210,90,0)'); fg.fillStyle = g; fg.beginPath(); fg.arc(f.x, f.y, f.r * 5, 0, 6.283); fg.fill(); }
    for (const f of fast) { if (f.x < x0 || f.x > x1) continue;
      if (!tm.frozen) { const dx = f.x - f.px, dy = f.y - f.py; fg.strokeStyle = 'rgba(255,236,150,.5)'; fg.lineWidth = 2; fg.lineCap = 'round'; fg.beginPath(); fg.moveTo(f.x - dx * 2.5, f.y - dy * 2.5); fg.lineTo(f.x, f.y); fg.stroke(); }
      else { /* 定住：看得清楚的一隻：兩片半透明的翅膀、深色的身體、尾巴一顆亮光 */ fg.fillStyle = 'rgba(214,228,255,.62)'; fg.beginPath(); fg.ellipse(f.x - 6, f.y - 7, 9, 4, -0.6, 0, 6.283); fg.fill(); fg.beginPath(); fg.ellipse(f.x + 6, f.y - 7, 9, 4, 0.6, 0, 6.283); fg.fill();
        fg.fillStyle = 'rgba(120,96,84,.95)'; fg.beginPath(); fg.ellipse(f.x, f.y - 2, 3.4, 6, 0, 0, 6.283); fg.fill(); const g = fg.createRadialGradient(f.x, f.y + 6, 0, f.x, f.y + 6, 16); g.addColorStop(0, 'rgba(255,250,190,1)'); g.addColorStop(0.3, 'rgba(255,230,120,.6)'); g.addColorStop(1, 'rgba(255,210,90,0)'); fg.fillStyle = g; fg.beginPath(); fg.arc(f.x, f.y + 6, 16, 0, 6.283); fg.fill(); } } });
  const zFly = fast.map((f, i) => zone('firefly' + i, '螢火蟲', { x: 0, w: 56, y: 0, h: 56 }, () => { if (!tm.frozen) { tip('一道光閃過去，看不清楚。停下時間再看'); return; } stats.flyLooks += 1; zk.saw('firefly'); sfx.twinkle(); sparkle(f.x, f.y, 5, 0.5); tip('看清楚了：一隻螢火蟲，尾巴亮著'); }));
  for (const z of [...zFly, zBird, zTurtle]) z.btn.style.zIndex = '3';   /* 會到處飛的排在固定熱區的下面：飛過浮空石、明、鐘面前面時不搶點擊 */
  api.onFrame(() => { fast.forEach((f, i) => zFly[i].moveTo(f.x, f.y - 28)); });

  // ── 發光蘑菇：點了一朵接一朵亮起來 ──
  const SHROOMS = [[968, 490], [1190, 360], [1355, 550], [1405, 345], [1705, 488], [1900, 363]]; let shroomBusy = false;
  const shroomGlow = SHROOMS.map(([x, y]) => glowAt('shroom', x, y - 6, 110, 96));
  SHROOMS.forEach(([x, y], i) => zone('shroom' + i, '發光蘑菇', { x: x - 38, w: 76, y: y - 44, h: 62 }, async () => { if (shroomBusy) return; shroomBusy = true; stats.shrooms += 1;
    const order = SHROOMS.map((p, k) => k).sort((a, b) => Math.abs(SHROOMS[a][0] - x) - Math.abs(SHROOMS[b][0] - x));
    for (const [n, k] of order.entries()) { const g = shroomGlow[k]; g.classList.add('lit', 'flare'); setTimeout(() => g.classList.remove('flare'), 600); sfx.shroom(n); sparkle(SHROOMS[k][0], SHROOMS[k][1] - 18, 3, 0.5); await wait(260); }
    await wait(5200); for (const k of [...order].reverse()) { shroomGlow[k].classList.remove('lit'); await wait(160); } shroomBusy = false; }));

  // ── 提燈：原畫的燈是亮的。吹熄＝疊上「熄掉」的補丁（從原畫局部重畫再對位的）；亮著時多一圈會晃的暖光 ──
  const OP = M.over_patches || {}; const patchImg = (p, fade) => { const im = document.createElement('img'); im.className = 'overpatch'; im.src = p.img; im.alt = ''; im.draggable = false; im.style.setProperty('--fade', fade); Object.assign(im.style, { left: X(p.x), top: Y(p.y), width: X(p.w), height: Y(p.h) }); under(im); return im; };
  const LAN = { x: 2048, y: 628 }; let lanternOn = st[K('lantern')] !== 'false'; let lanternBusy = false;
  const lanOff = OP.lantern_off ? patchImg(OP.lantern_off, '.45s') : null; const lanGlow = glowAt('lamp', LAN.x, LAN.y, 330, 300);
  const setLantern = v => { lanternOn = v; if (lanOff) lanOff.style.opacity = v ? '0' : '1'; lanGlow.classList.toggle('off', !v); }; setLantern(lanternOn);
  zone('lantern', () => lanternOn ? '吹熄提燈' : '點亮提燈', { x: 1996, w: 104, y: 520, h: 190 }, async z => { if (lanternBusy || me.busy) return; lanternBusy = true; if (me.mode === 'route') await approach(LAN.x - 40, 260);
    if (lanternOn) { sfx.blow(); setLantern(false); } else { sfx.ignite(); setLantern(true); lanGlow.style.setProperty('--s', '1.5'); setTimeout(() => lanGlow.style.setProperty('--s', '1'), 450); sparkle(LAN.x, LAN.y, 5, 0.6); }
    save({ [K('lantern')]: String(lanternOn) }); z.btn.dataset.name = lanternOn ? '吹熄提燈' : '點亮提燈'; await wait(500); lanternBusy = false; });

  // ── 路牌：明貼的便利貼（紙片），角落畫著小笑臉；便利貼上的字用介面顯示 ──
  const sticky = await sprite('../art/sprites/sticky.png', 'sticky flat spin', { edge: 3, jitter: 1 }); place(sticky, 2196, 512, 30); sticky.style.setProperty('--rot', '5deg'); let signN = 0;
  zone('sign', '路牌', { x: 2062, w: 180, y: 452, h: 92 }, async () => { if (me.busy) return; if (me.mode === 'route') await approach(2150, 300); signN += 1; sfx.paper(); sticky.style.setProperty('--rot', (signN % 2 ? -4 : 6) + 'deg');
    card('路牌', '（箭頭指向西邊的鐘塔。牌子上貼著一張便利貼，角落畫著一個小笑臉。）', '便利貼'); });

  // ── 夜裡的鬱金香：花是闔著的，點了慢慢打開、又闔上（打開的樣子是從原畫局部重畫再對位的補丁，慢慢淡入淡出） ──
  const tulipOpen = OP.tulip_open ? patchImg(OP.tulip_open, '1.7s') : null; let tulipBusy = false; const tulip = { open: false };
  zone('tulips', '夜裡的鬱金香', { x: 1606, w: 196, y: 780, h: 146 }, async () => { if (tulipBusy || !tulipOpen) return; tulipBusy = true; stats.blooms += 1; sfx.bloom(true); tulipOpen.style.opacity = '1'; tulip.open = true; setTimeout(() => sparkle(1700, 840, 4, 0.8), 900);
    await wait(1700 + 2600); sfx.bloom(false); tulipOpen.style.opacity = '0'; await wait(1750); tulip.open = false; tulipBusy = false; });

  // ── 松樹：搖一下掉松果 ──
  const PINES = [{ id: 0, zone: { x: 2120, w: 184, y: 0, h: 330 }, from: [[2180, 150], [2250, 90]], ground: 742, land: [2140, 2260], size: 26 }, { id: 1, zone: { x: 1740, w: 140, y: 60, h: 250 }, from: [[1800, 170], [1850, 120]], ground: 386, land: [1770, 1880], size: 13 }]; const cones = [];
  for (const p of PINES) { let busy = false; zone('pine' + p.id, '搖一搖松樹', p.zone, async z => { if (busy) return; busy = true; z.btn.classList.remove('shake'); void z.btn.offsetWidth; z.btn.classList.add('shake'); sfx.rustle(5); if (Math.random() < 0.6) dropLeaf(p.from[0][0] - 30, p.from[0][1], p.land[0] - 40, p.ground + 10);
    const [cx, cy] = pick(p.from); const el = await sprite('../art/sprites/pinecone.png', 'cone flat spin', { edge: 3, jitter: 1 }); const x1 = clamp(cx + rnd(-30, 30), p.land[0], p.land[1]), x2 = clamp(x1 + (Math.random() < 0.5 ? -1 : 1) * rnd(20, 70), p.land[0] - 20, p.land[1] + 20); place(el, cx, cy, p.size); let t = 0, hit = 0; const fall = 0.6; stats.cones += 1;
    const anim = dt0 => { const dt = wdt(dt0); t += dt; let x, y, rot;
      if (t < fall) { const e = t / fall; x = lerp(cx, x1, e); y = lerp(cy, p.ground, e * e); rot = e * 240; }
      else { const e = Math.min(1, (t - fall) / 1.2); if (!hit) { hit = 1; sfx.cone(); } if (hit === 1 && e > 0.42) { hit = 2; sfx.cone(); } const hop = Math.abs(Math.sin(e * Math.PI * 2.5)) * p.size * 0.8 * (1 - e) * (1 - e); const ee = 1 - (1 - e) * (1 - e); x = lerp(x1, x2, ee); y = p.ground - hop; rot = 240 + (x2 - x1) * ee * 5;
        if (e >= 1) { const i = api.frameHooks.indexOf(anim); if (i >= 0) api.frameHooks.splice(i, 1); busy = false; cones.push(el); if (cones.length > 4) { const old = cones.shift(); old.style.transition = 'opacity .8s'; old.style.opacity = '0'; setTimeout(() => old.remove(), 820); } } }
      el.style.left = X(x); el.style.top = Y(y); el.style.setProperty('--rot', rot + 'deg'); };
    api.frameHooks.push(anim); }); }

  // ── 月亮：點了有一片雲慢慢飄過去，海面的月光跟著暗一下 ──
  const cloudCv = document.createElement('canvas'); cloudCv.className = 'ccloud'; cloudCv.width = 320; cloudCv.height = 130; const CLOUD = { w: 250, h: 100, y: MOON.y - 46 }; Object.assign(cloudCv.style, { top: Y(CLOUD.y), width: X(CLOUD.w), height: Y(CLOUD.h), left: X(-CLOUD.w), opacity: '0' }); under(cloudCv);
  { const g = cloudCv.getContext('2d'); g.filter = 'blur(7px)'; const blobs = [[70, 78, 54, 26], [120, 60, 60, 34], [178, 70, 62, 30], [236, 80, 50, 22], [150, 88, 110, 22]]; for (const [x, y, rx, ry] of blobs) { g.fillStyle = 'rgba(52,66,128,.96)'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 6.283); g.fill(); }
    g.filter = 'blur(5px)'; for (const [x, y, rx, ry] of blobs.slice(0, 4)) { g.fillStyle = 'rgba(132,150,214,.5)'; g.beginPath(); g.ellipse(x - 4, y - ry * 0.55, rx * 0.7, ry * 0.3, 0, 0, 6.283); g.fill(); } }
  const cloud = { on: false, t: 0 };
  zone('moon', '月亮', { x: MOON.x - 58, w: 116, y: MOON.y - 58, h: 116 }, () => { if (cloud.on) return; cloud.on = true; cloud.t = 0; stats.clouds += 1; sfx.cloud(); });
  api.onFrame(dt0 => { if (!cloud.on) return; const dt = wdt(dt0); cloud.t += dt / 9; const e = Math.min(1, cloud.t); const x = lerp(MOON.x - 330, MOON.x + 190, e); cloudCv.style.left = X(x); cloudCv.style.opacity = String(clamp(Math.min(e, 1 - e) * 8, 0, 1));
    const c = x + CLOUD.w / 2; moonDim = clamp(1 - Math.abs(c - MOON.x) / 120, 0, 1); moonGlow.style.setProperty('--o', (1 - moonDim * 0.8).toFixed(2)); moonGlow.style.opacity = (1 - moonDim * 0.8).toFixed(2); seaShade.style.opacity = moonDim.toFixed(2);
    if (e >= 1) { cloud.on = false; moonDim = 0; moonGlow.style.opacity = ''; seaShade.style.opacity = '0'; cloudCv.style.opacity = '0'; } });

  setQuest(); refreshZones(); api.onFrame(() => { refreshZones(); });
  // 測試與截圖用
  window.dawnHill.hot = api.hot; window.dawnHill.state = st;
  // 圖鑑：小鳥、海龜點了就算；螢火蟲要在停下時間時點飛很快的那幾隻（上面 firefly 熱區裡記）
  const rewrap = watchHot(api.hot, [['bird', 'bird'], ['turtle', 'turtle']], zk); api.onFrame(rewrap); window.dawnHill.zukan = zk;
  // ── 植物收集（plants.js）：苔球在鐘塔石縫撿；小松樹盆景是明留在松樹下的一盆（三個齒輪找齊、或第五章以後）；月見草只開一下，要停下時間才摘得到 ──
  const pl = createPlants({ vars: () => Object.assign({}, st, api.vars), set: v => save(v), toast: tip }); await pl.ready; window.dawnHill.plants = pl;
  const plantSpot = async (id, x, y, label, can, size) => { if (pl.has(id)) return null; const el = await sprite(plantImg(id), 'cone plantspot'); place(el, x, y, size || 46); el.dataset.plant = id; let zz = null;
    const take = () => { if (zz) zz.off(); sfx.pick(); sparkle(x, y - 20, 7); el.classList.add('picked'); setTimeout(() => el.remove(), 500); pl.got(id); };   /* 收進花盆 */
    const zs = (size || 46) / 46; zz = zone('plant_' + id, label, { x: x - 34 * zs, w: 68 * zs, y: y - 62 * zs, h: 70 * zs }, () => { const no = can && can(); if (no) { tip(no); return; } take(); }); return { el, take }; };
  await plantSpot('moss', 742, 566, '石縫裡的苔球');
  // 明的小委託回禮：小松樹放在鐘塔門口、明站的位置旁邊（作者 2026-11-18：盆栽放在他們身邊的東西旁）。平台上的人很小，盆栽也跟著縮
  const pine = await plantSpot('pine', 568, 508, '鐘塔門口的小松樹', () => '這盆是明種的。', 27);
  /* 明的小委託（台詞 2026-11-17 作者定稿，真結局/studio_decor/委託與種樹_提案.md）：第五章做完之後就能接，真結局拿到禮物之後也能補做。
     鐘塔門口右邊那盞燈一直閃；直接點看不清楚，停下時間時點才看得出燈芯歪了。回禮：小松樹盆景 */
  const ERR_MING_ASK = [['明', '鐘塔門口右邊那盞燈，一直閃。'], ['茶語', '所以咧？'], ['明', '幫我看一下。妳每次都從那邊跳下來，太暗會絆到。'], ['茶語', '你怎麼知道我都走那邊？'], ['明', '我每次都有看到。'], ['茶語', '你都在偷偷觀察我喔？'], ['明', '「關心」。'],
    { choice: [['我去看', [['', '（接下明的小委託：看看鐘塔門口右邊那盞燈。）']]], ['晚點再說', []]] }];
  const ERR_MING_DONE = [['茶語', '修好了。只是燈芯歪了。'], ['明', '嗯。亮了。'], ['茶語', '就這樣？沒有獎勵喔？'], ['明', '有。這盆小松樹給妳。放在書桌上妳看得到的地方。'], ['茶語', '為什麼？'], ['明', '把它當我的小分身，陪妳。'], ['茶語', '你幹嘛突然……'], ['明', '真心話。']];
  const LAMPFIX = { x: 664, y: 420 }; const flick = document.createElement('i'); flick.className = 'cglow errandflick'; Object.assign(flick.style, { position: 'absolute', left: X(LAMPFIX.x), top: Y(LAMPFIX.y + 4), width: X(46), height: Y(64), pointerEvents: 'none', display: 'none' });   /* 一塊暗影蓋在燈上忽明忽暗；停下時間時燈亮著不閃 */ art.appendChild(flick);
  const lampZ = zone('errand_lamp', '門口右邊的燈', { x: LAMPFIX.x - 26, w: 52, y: LAMPFIX.y - 34, h: 64 }, () => {
    if (!tm.frozen) return openDialogue([['茶語（心聲）', '燈閃得太快，看不出哪裡壞了。']]);
    save({ errand_ming: 'fixed' }); lampShow(); sfx.pick(); openDialogue([['', '〔時間停住，燈不閃了。燈芯歪了，她伸手把它弄正。〕']]); }, { when: () => st.errand_ming === 'accepted' });
  const lampShow = () => { flick.style.display = st.errand_ming === 'accepted' ? '' : 'none'; refreshZones(); }; lampShow();
  function errandMing(after) {
    if (st.errand_ming === 'done') { if (after) return openDialogue(after); mingNod(); return; }
    if (st.errand_ming === 'fixed') return openDialogue(ERR_MING_DONE, [() => { save({ errand_ming: 'done' }); CT.completeFreeInteraction(); sfx.heart(); if (pine) pine.take(); else pl.got('pine'); }]);
    if (st.errand_ming === 'accepted') { tip('鐘塔門口右邊那盞燈。停下時間再看看'); return; }
    return openDialogue(ERR_MING_ASK, [], line => { if (line === '（接下明的小委託：看看鐘塔門口右邊那盞燈。）') { save({ errand_ming: 'accepted' }); lampShow(); } });
  }
  if (st.errand_ming === 'done' && pine) pine.take();
  await plantSpot('primrose', 1262, 668, '月見草', () => tm.frozen ? '' : '花一下就合起來了。停下時間再摘摘看');
  window.dawnHill.cape = { st, chapter, me, pose, tm, clock, floats, wave, bird, turtle, ming, flies, fast, flyState, leaves, cones, glints, cloud, tulip, stats, zones, got, S_FOOT, S_SHORE, TOTAL, posAt, sOfX,
    freeze, thaw, jump, lanternOn: () => lanternOn, giveState: () => giveState, gearCard: () => gcStep, moonDim: () => moonDim, busy: () => hold > 0 || me.busy || ming.busy,
    goto(s) { me.mode = 'route'; me.s = clamp(s, 0, TOTAL); me.target = null; const p = posAt(me.s); setPose(p.x, p.y, p.h / BASE_H); prevX = pose.x; api.render(); refreshZones(); },
    walkTo(s) { me.target = clamp(s, 0, TOTAL); } };
  api.render();
}
