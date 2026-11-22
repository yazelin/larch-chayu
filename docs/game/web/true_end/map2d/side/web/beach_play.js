import { guideHint } from '../../../studio_web/guide_hint.mjs';
// 海灘舞台長畫的玩法與互動（設計.md「海灘與月光岬長畫的互動」的「海灘舞台」，2026-11-14 作者同意；做法與修正紀錄在 beach_plan.md）。結構照 dawn_play.js。
// 兩個章節（?chapter=4 第四章、預設 true 真結局；嵌進 Larch 時看變數 chapter）：
//   第四章：詩跟著進場 → 螃蟹海鷗怕生跑開 → 學會「呼喚」→ 找七個貝殼（三個被螃蟹壓著、一個在寄居蟹那裡，要呼喚）→ 交給詩 → 詩在舞台上敲旋律 → CG 4-12（佔位）→ 到浪邊呼喚海豚 → 「騎上去」佔位卡。
//   真結局：詩抱著吉他坐在舞台邊，對話照劇本 4-2，拿到禮物「詩的聲音」。
// 三條走道（都在同一張長畫上，人照遠近縮小）：沙灘（引擎原本那條）、舞台面（從台階走上去）、浪邊（走到水邊）。走道的切換、限位、縮放都在這支裡做，引擎不知道。
// 熱區一律綁在物件上（zone）；會動的每一幀自己算位置，熱區跟著移，落地當下就在位。狀態：Larch 變數優先，本機存 StudioDB 'beach_state'，第四章與真結局用 _c4／_te 後綴分開；?reset=1 清掉。
import { sfx } from './sfx.js';
import { sunlight } from './sunlight.js';
import { createZukan, watchHot } from './zukan.js';
import { createPlants, plantImg } from './plants.js';
export async function install(api) {
  const { art, IMG, paperize, openDialogue, state } = api; const W = IMG.width, H = IMG.height;
  const X = px => px / W * 100 + '%', Y = px => px / H * 100 + '%'; const rnd = (a, b) => a + Math.random() * (b - a), pick = a => a[Math.floor(Math.random() * a.length)], clamp = (v, a, b) => Math.max(a, Math.min(b, v)), wait = ms => new Promise(ok => setTimeout(ok, ms));
  const Q = new URLSearchParams(location.search); document.body.classList.add('beach'); document.title = api.META.name + '（一整張長畫）'; document.getElementById('stage').setAttribute('aria-label', api.META.name);
  document.querySelector('#cg span').textContent = '點一下回到海灘';
  // ── 樣式（只給海灘用，掛在 body.beach 底下；flat.html 不動） ──
  const css = document.createElement('style'); css.textContent = `
body.beach .person .sheet{filter:sepia(.08) saturate(.98) drop-shadow(-3px 4px 2px rgba(80,50,60,.42))}
body.beach .thing{transition:none}
body.beach .thing .sheet{filter:drop-shadow(-2px 3px 2px rgba(80,50,60,.4))}
body.beach .thing.flat .shadow{opacity:0}
.thing.crab.scuttle .sheet{animation:bscut .2s linear infinite}@keyframes bscut{0%,100%{transform:rotate(-7deg)}50%{transform:rotate(7deg) translateY(-7%)}}
.thing.crab.hunker .sheet{transform:scaleY(.7) translateY(16%);transition:transform .15s}
.thing.crab.wave .sheet{animation:bwave .7s ease-in-out}@keyframes bwave{20%,60%{transform:rotate(-9deg) scale(1.08)}40%,80%{transform:rotate(9deg) scale(1.08)}}
.thing.crab.hopup .sheet,.thing.hermit.hopup .sheet,.thing.shell.hopup .sheet{animation:bhop .45s cubic-bezier(.3,.9,.4,1.2)}@keyframes bhop{40%{transform:translateY(-38%)}}
.thing.hermit.tuck .sheet{animation:btuck 1.1s ease-in-out}@keyframes btuck{20%,70%{transform:scale(.8,.72) translateY(14%) rotate(-6deg)}}
.thing.shell .sheet{transform-origin:50% 90%}.thing.shell.ring .sheet{animation:bring .5s ease-out}@keyframes bring{25%{transform:scale(1.28) rotate(-6deg);filter:brightness(1.35) drop-shadow(0 0 8px #fff3b0)}60%{transform:scale(.95) rotate(4deg)}}
.thing.shell.glow .sheet{animation:bglow 1.6s ease-in-out infinite}@keyframes bglow{50%{filter:brightness(1.18) drop-shadow(0 0 6px rgba(255,240,170,.9))}}
.thing.sit.stagepiece .shadow{opacity:0}.thing.sit.strum .sheet{animation:bstrum .9s ease-in-out}@keyframes bstrum{20%,60%{transform:rotate(-2.2deg)}40%,80%{transform:rotate(1.8deg)}}
.person.shi.knock .sheet{animation:bknock .26s ease-in-out}@keyframes bknock{50%{transform:rotate(calc(9deg * var(--facing,1))) translateY(2%) scaleX(var(--facing,1))}}
.person.tea.calling .sheet{animation:bcall .8s ease-in-out}@keyframes bcall{30%,70%{transform:translateY(-3%) rotate(-3deg) scaleX(var(--facing,1))}50%{transform:translateY(-3%) rotate(3deg) scaleX(var(--facing,1))}}
.thing.coconut .sheet,.thing.log .sheet{transform:rotate(var(--rot,0deg));transform-origin:50% 55%}
.thing.dolphin .sheet{transform:rotate(var(--rot,0deg)) scaleX(var(--facing,1));transform-origin:50% 50%}.thing.dolphin .shadow{opacity:0}
.fx.mnote{animation:bnote 1.9s ease-out forwards}@keyframes bnote{0%{transform:translate(-50%,-50%) scale(.4) rotate(-10deg);opacity:0}15%{opacity:1}100%{transform:translate(calc(-50% + var(--dx,0px)),calc(-50% - var(--up,70px))) scale(1) rotate(12deg);opacity:0}}
.bfloat{position:absolute;z-index:2;transform-origin:50% 0;pointer-events:none;transform:translateX(-50%) rotate(var(--a,0deg))}
.bfloat i{display:block;margin:0 auto;width:2px;background:#8a6a4a;border-radius:1px}.bfloat img{display:block;height:auto;margin:-2px auto 0;filter:drop-shadow(-2px 3px 2px rgba(80,50,60,.38));-webkit-user-drag:none}
.bulbdim,.bulbglow{position:absolute;z-index:1;pointer-events:none;border-radius:50%;transform:translate(-50%,-50%)}
.bulbdim{background:radial-gradient(closest-side,rgba(120,98,108,.62) 50%,rgba(120,98,108,0) 100%);transition:opacity .35s}
.bulbglow{mix-blend-mode:screen;background:radial-gradient(closest-side,rgba(255,226,150,.62),rgba(255,200,130,.22) 45%,rgba(255,190,130,0) 100%);opacity:0;transition:opacity .35s}
.bulbglow.on{opacity:1;animation:bbulb 3.2s ease-in-out infinite}@keyframes bbulb{50%{opacity:.78}}.bulbglow.flash{animation:bflash .5s ease-out}@keyframes bflash{30%{opacity:1;transform:translate(-50%,-50%) scale(1.5)}}
.fireglow{position:absolute;z-index:1;pointer-events:none;border-radius:50%;mix-blend-mode:screen;transform:translate(-50%,-50%) scale(var(--s,1));transition:transform .5s ease-out;background:radial-gradient(closest-side,rgba(255,196,110,.5),rgba(255,150,80,.2) 45%,rgba(255,140,80,0) 100%);animation:bfire 1.7s steps(7) infinite}@keyframes bfire{0%{opacity:.82}14%{opacity:1}28%{opacity:.7}42%{opacity:.95}57%{opacity:.76}71%{opacity:1}85%{opacity:.84}100%{opacity:.82}}
.beachcv{position:absolute;pointer-events:none;z-index:1}
#call{position:fixed;z-index:12;right:max(18px,env(safe-area-inset-right));bottom:max(var(--larch-bottom,64px),env(safe-area-inset-bottom));padding:.6em 1.6em .65em;color:var(--ink);font:700 19px/1.3 var(--hand);letter-spacing:.16em;cursor:pointer;background:none;rotate:-2deg;
  border-style:solid;border-width:0;border-image:var(--btn) var(--btn-slice) fill / var(--btn-width) stretch;filter:drop-shadow(0 4px 5px rgba(90,50,60,.3));transition:transform .15s}
#call:hover{transform:translateY(-3px)}#call:active{transform:translateY(1px) scale(.97)}#call[hidden]{display:none}#call small{font-size:13px;font-weight:400;color:var(--dim);margin-left:.5em;letter-spacing:.05em}
body.panel-open #call,body.locked #call,body.nohud #call{opacity:.0;pointer-events:none}
body.beach #palette i{width:15px;height:15px}`; document.head.appendChild(css);

  // ── 狀態 ──
  const st = api.vars; const CT = api.ctl;   // CT：這一頁是哪一章、第幾步、怎麼切回 Larch 對話卡（flat_engine.js 的 ctl；規格 ../_島段步驟清單.md）
  if (window.StudioDB && Q.get('reset') === '1') { try { await StudioDB.remove('flat_x_beach'); } catch {} }   // 位置也清掉：從入口重新進場
  const save = await CT.store('beach_state', st, Q.get('reset') === '1');
  const zk = createZukan({ vars: () => Object.assign({}, st, api.vars), set: v => save(v), toast: api.toast }); await zk.ready;   // 全劇小生物圖鑑（zukan.js）
  const chapter = CT.chapter; const ch4 = chapter === '4', ch7 = chapter === '7', d28 = ch7 && CT.mode === 'day28'; const K = k => k + (ch4 ? '_c4' : ch7 ? '_c7' : '_te'); const on = k => st[k] === 'true';
  if (CT.mode === 'visit' && ch4) Object.assign(st, { c4_intro: 'true', c4_call: 'true', c4_called: 'true', shells_c4: '1,2,3,4,5,6,7', c4_melody: 'true', c4_done: 'true' });   // 自由逛：主線做完之後的海灘（只在這一頁當成做完，不寫回 Larch）
  // 回接（第四章第 6 步）：CG 4-12 的對話在 Larch 的對話卡播完了，回來時站在舞台邊，詩說「最後一個。叫牠。」
  const resumed = ch4 && CT.step >= 6 && !on('c4_melody');
  if ((ch4 && CT.step >= 6 && !on('c4_dolphin') && !Q.has('x')) || (ch7 && CT.resume)) CT.startX = ch7 ? 1506 : 1585;   // 舞台邊
  if (resumed) save({ c4_intro: 'true', c4_call: 'true', c4_called: 'true', shells_c4: '1,2,3,4,5,6,7', s3_shell_count: '7', s3_shells_submitted: 'true', c4_melody: 'true' });
  if (ch4 && Q.get('dolphinDone') === '1' && !on('c4_done')) save({ c4_done: 'true', chapter4_beach_done: 'true', island_dolphin_done: 'true' });
  if (on('gift_shi')) api.gifts.gift_shi = true;
  const M = api.META; const FEET = M.feet_y * H;
  // 長畫座標 px。沙灘走道的腳底線 FEET（flat.json）；舞台面、浪邊各自的腳底線與人物縮放 k（照地面透視：離海平線 y 154 的距離成比例）
  const S = {
    stage: { x0: 1348, x1: 1746, feet: 392, k: 0.70, steps: { x: 1445, w: 200, y: 398, h: 56 }, cx: 1545, foot: 452 },
    shore: { x0: 2208, x1: 2428, feet: 386, k: 0.60, cx: 2318, zone: { x: 2200, w: 236, y: 352, h: 60 }, sea: 368 },
    sit: { x0: 1335, x1: 1457, lip: 402 },   // 原畫舞台左前段：柱腳右緣、台階左緣、舞台面前緣
    fire: { x: 1075, y: 462, zone: { x: 1012, w: 126, y: 418, h: 86 } },
    bulbs: [[1356, 246], [1407, 257], [1451, 260], [1499, 251], [1545, 238], [1595, 250], [1645, 260], [1689, 256], [1734, 246]], lights: { x: 1338, w: 414, y: 222, h: 56 },
    palms: [{ id: 0, zone: { x: 70, w: 250, y: 60, h: 190 }, crowns: [[118, 172], [232, 100]], ground: 428, land: [250, 330] },
            { id: 1, zone: { x: 790, w: 380, y: 120, h: 170 }, crowns: [[868, 246], [1006, 172], [1104, 232]], ground: 512, land: [820, 1180] },
            { id: 2, zone: { x: 1960, w: 280, y: 190, h: 160 }, crowns: [[2032, 256], [2166, 316]], ground: 508, land: [2150, 2290] },
            { id: 3, zone: { x: 2330, w: 230, y: 90, h: 180 }, crowns: [[2398, 232], [2490, 140]], ground: 496, land: [2330, 2520] }],
    net: { zone: { x: 2545, w: 350, y: 255, h: 150 }, bar: 277, floats: [{ k: 'red', x: 2594, len: 52, w: 46 }, { k: 'pink', x: 2826, len: 40, w: 34 }, { k: 'white', x: 2868, len: 46, w: 34 }] },
    crate: { zone: { x: 2040, w: 92, y: 440, h: 84 }, mouth: [2086, 462] }, barrel: { zone: { x: 888, w: 74, y: 412, h: 84 }, mouth: [924, 424] },
    rock: { x: 2465, y: 470 }, hermit: { hide: [2478, 468], out: [2590, 508] },
    crabs: [{ id: 'a', x: 560, y: 514 }, { id: 'b', x: 1200, y: 506, shell: 2 }, { id: 'c', x: 1930, y: 510, shell: 4 }, { id: 'd', x: 2664, y: 524, shell: 7 }, { id: 'e', x: 2262, y: 512 }],
    gulls: [{ id: 0, x: 742, y: 508 }, { id: 1, x: 976, y: 383 }, { id: 2, x: 2712, y: 271 }],
    // 七個貝殼（大到小＝Do 到 Si）：位置、在哪條走道、誰守著
    shells: [{ n: 1, x: 402, y: 516 }, { n: 2, x: 1200, y: 510, crab: 'b' }, { n: 3, x: 2292, y: 392, lane: 'shore' }, { n: 4, x: 1930, y: 514, crab: 'c' }, { n: 5, x: 2512, y: 512, hermit: true }, { n: 6, x: 1668, y: 386, lane: 'stage' }, { n: 7, x: 2664, y: 528, crab: 'd' }],
    dolphin: { far: [3120, 262], near: [2326, 356], len: 112 },
  };
  const SOLFA = ['Do', 'Re', 'Mi', 'Fa', 'Sol', 'La', 'Si'], SHELLC = ['#f6a58c', '#f3c08a', '#ecd38c', '#e9a39a', '#b9b3e6', '#ef8573', '#cfe0f0'];
  const FX = await PageLoading.json('../art/sprites/fx.json'); const FXK = {}; for (const e of FX) (FXK[e.kind] = FXK[e.kind] || []).push(e.file);
  const fxImg = (kind, cls = '') => { const pool = FXK[kind] || FXK.star; const im = document.createElement('img'); im.className = 'fx ' + kind + ' ' + cls; im.src = '../art/sprites/' + pool[Math.floor(Math.random() * pool.length)]; im.alt = ''; im.draggable = false; return im; };
  function sparkle(x, y, n = 8, far = 1) { for (let i = 0; i < n; i++) { const s = fxImg(Math.random() < 0.7 ? 'star' : 'glow'); s.style.left = X(x + rnd(-10, 10)); s.style.top = Y(y); s.style.setProperty('--a', (i / n * 360 + rnd(-20, 20)) + 'deg'); s.style.setProperty('--d', rnd(30, 80) * far + 'px'); s.style.setProperty('--sz', rnd(12, 22) + 'px'); s.style.animationDelay = rnd(0, 0.15) + 's'; art.appendChild(s); setTimeout(() => s.remove(), 1500); } }
  function heart(x, y) { const h = fxImg('heart', 'float'); h.style.left = X(x); h.style.top = Y(y); h.style.setProperty('--sz', rnd(18, 24) + 'px'); h.style.setProperty('--dx', rnd(-14, 14) + 'px'); art.appendChild(h); setTimeout(() => h.remove(), 1700); }
  function drops(x, y, n = 6) { for (let i = 0; i < n; i++) { const d = fxImg('drop', 'falling'); d.style.left = X(x + rnd(-26, 26)); d.style.top = Y(y - rnd(4, 26)); d.style.setProperty('--sz', rnd(7, 12) + 'px'); d.style.setProperty('--dy', rnd(24, 46) + 'px'); d.style.animationDelay = rnd(0, 0.25) + 's'; art.appendChild(d); setTimeout(() => d.remove(), 1400); } }
  const NOTES = []; for (let i = 0; i < 6; i++) NOTES.push(`../art/sprites/note_${i}.webp`);
  function note(x, y, delay = 0, up = 70) { const im = document.createElement('img'); im.className = 'fx mnote'; im.src = pick(NOTES); im.alt = ''; im.draggable = false; im.style.left = X(x + rnd(-10, 10)); im.style.top = Y(y); im.style.setProperty('--sz', rnd(16, 24) + 'px'); im.style.setProperty('--dx', rnd(-26, 26) + 'px'); im.style.setProperty('--up', up + 'px'); im.style.animationDelay = delay + 's'; art.appendChild(im); setTimeout(() => im.remove(), 2100 + delay * 1000); }

  // ── 小紙片、熱區（做法照 dawn_play.js） ──
  const firstPerson = art.querySelector('.person');
  async function sprite(src, cls, opt = {}) {
    const pp = await paperize(src, { edge: opt.edge ?? 7, jitter: opt.jitter ?? 2, texture: opt.texture }); const d = document.createElement('div'); d.className = 'thing ' + cls; const sh = document.createElement('img'); sh.className = 'shadow'; sh.src = pp.shadow; sh.alt = '';
    const im = document.createElement('img'); im.className = 'sheet'; im.src = pp.src; im.alt = ''; im.draggable = false; d.append(sh, im); d.dataset.pad = pp.pad / pp.height; d.dataset.ar = (pp.width - 2 * pp.pad) / (pp.height - 2 * pp.pad); return d;
  }
  // x 中心、y 腳底（px）、h 圖本身的高（px，不含白邊）。預設放在人物後面（沙灘走道比所有物件都靠近鏡頭）
  function place(el, x, y, h, front = false) { el.style.left = X(x); el.style.top = Y(y); el.style.height = (h / H * 100 / (1 - 2 * Number(el.dataset.pad))) + '%'; el.style.setProperty('--pad', (Number(el.dataset.pad) * 100) + '%'); if (!el.isConnected) { if (front || !firstPerson) art.appendChild(el); else art.insertBefore(el, firstPerson); } return el; }
  const zones = []; let lane = 'beach';
  function zone(id, name, r, onClick, opt = {}) {   // r：x、w、y、h 都是長畫 px
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hotspot'; b.dataset.id = id; b.dataset.name = typeof name === 'function' ? name() : name; b.setAttribute('aria-label', b.dataset.name);
    Object.assign(b.style, { left: X(r.x), top: Y(r.y), width: X(r.w), height: Y(r.h) });
    const hot = { id, name, x: r.x, w: r.w, y: r.y / H, h: r.h / H, reach: opt.reach, canReach: opt.canReach, approachX: opt.approachX }; const z = { id, btn: b, hot, r, vis: true, lane: opt.lane === undefined ? 'beach' : opt.lane,
      refresh() { const v = z.vis && (!z.lane || z.lane === lane); b.hidden = !v; hot.hidden = !v; },
      off() { z.vis = false; b.remove(); const i = api.hot.indexOf(hot); if (i >= 0) api.hot.splice(i, 1); const k = zones.indexOf(z); if (k >= 0) zones.splice(k, 1); api.render(); },
      hide() { z.vis = false; z.refresh(); api.render(); }, show() { z.vis = true; z.refresh(); api.render(); },
      moveTo(cx, top) { hot.x = cx - r.w / 2; b.style.left = X(hot.x); if (top !== undefined) { hot.y = top / H; b.style.top = Y(top); } } };
    hot.fn = () => onClick(z); api.bindHotspot(b, hot); art.appendChild(b); api.hot.push(hot); zones.push(z); z.refresh(); return z;
  }
  const bgLayer = art.querySelector('img.layer'); let underTop = bgLayer;   // 疊在底圖上、人物後面的東西（補丁、光）依序接在底圖後面
  const under = el => { underTop.after(el); underTop = el; return el; };
  if (M.sun) { const s = sunlight(art, bgLayer, IMG, M.sun, api.camX, api.getScale); underTop = s.cv; }   // 夕陽的動態光（跟朝霞丘同一支）

  // ── 茶語：三條走道 ──
  const tea = api.player; const teaH0 = parseFloat(tea.style.height); let hold = 0; const lockOn = () => { hold += 1; api.lock(true); }, lockOff = () => { hold = Math.max(0, hold - 1); if (!hold) api.lock(false); };
  const pose = { y: FEET, k: 1 }; const setPose = (y, k) => { pose.y = y; pose.k = k; tea.style.top = Y(y); tea.style.height = (teaH0 * k) + '%'; };
  const laneOf = l => l === 'beach' ? { feet: FEET, k: 1, x0: M.walk[0], x1: M.walk[1] } : S[l];
  api.setClickMovement({ bounds: () => {
    const L = laneOf(lane);
    return [L.x0, L.x1];
  } });
  // 自己帶著茶語走一段（引擎鎖住時）：x、腳底 y、縮放一起內插，走路的上下彈照引擎的寫法
  function walkTea(x1, y1, k1, speed = 430) {
    return new Promise(ok => { const x0 = state.x, y0 = pose.y, k0 = pose.k; const dist = Math.hypot(x1 - x0, (y1 - y0) * 1.6); const secs = Math.max(0.12, dist / (speed * (k0 + k1) / 2)); let t = 0; if (Math.abs(x1 - x0) > 3) state.face = x1 > x0 ? 1 : -1;
      const anim = dt => { t += dt / secs; const e = Math.min(1, t); state.x = x0 + (x1 - x0) * e; setPose(y0 + (y1 - y0) * e, k0 + (k1 - k0) * e); tea.style.setProperty('--bob', (-window.WalkSway.pose(t * secs, true).lift * 100) + '%'); tea.style.setProperty('--rock', window.WalkSway.pose(t * secs, true).tilt + 'deg'); api.render();
        if (e >= 1) { tea.style.setProperty('--bob', '0%'); tea.style.setProperty('--rock', '0deg'); const k = api.frameHooks.indexOf(anim); if (k >= 0) api.frameHooks.splice(k, 1); ok(); } };
      api.frameHooks.push(anim); });
  }
  // 走到某樣東西旁邊（同一條走道上）：已經夠近就不動
  async function approach(x, range = 120) { const L = laneOf(lane); const d = state.x - x; if (Math.abs(d) <= range) { state.face = d > 0 ? -1 : 1; api.render(); return; } const tx = clamp(x + Math.sign(d) * range * 0.75, L.x0, L.x1); lockOn(); await walkTea(tx, pose.y, pose.k, 520); state.face = tx > x ? -1 : 1; api.render(); lockOff(); }
  function setLane(l) { lane = l; tea.style.zIndex = l === 'beach' ? '' : '1'; for (const z of zones) z.refresh(); api.render(); }
  let moving = false;
  async function toStage() { if (moving || lane !== 'beach') return; moving = true; lockOn(); const s = S.stage; const x = clamp(state.x, s.steps.x + 40, s.steps.x + s.steps.w - 40); await walkTea(x, FEET, 1, 520); await walkTea(x, s.foot + 8, 0.80); for (let i = 0; i < 3; i++) setTimeout(() => sfx.wood(i), i * 150); await walkTea(x, s.feet, s.k, 300); setLane('stage'); lockOff(); moving = false; onStage(); }
  async function offStage() { if (moving || lane !== 'stage') return; moving = true; lockOn(); const s = S.stage; const x = clamp(state.x, s.steps.x + 40, s.steps.x + s.steps.w - 40); await walkTea(x, s.feet, s.k, 420); for (let i = 0; i < 3; i++) setTimeout(() => sfx.wood(i), i * 150); await walkTea(x, s.foot + 8, 0.80, 300); setLane('beach'); await walkTea(x, FEET, 1); lockOff(); moving = false; }
  async function toShore() { if (moving || lane !== 'beach') return; moving = true; lockOn(); const s = S.shore; const x = clamp(state.x, s.x0 + 20, s.x1 - 20); await walkTea(x, FEET, 1, 520); await walkTea(x, s.feet, s.k); setLane('shore'); lockOff(); moving = false; }
  async function offShore() { if (moving || lane !== 'shore') return; moving = true; lockOn(); const x = state.x; setLane('beach'); await walkTea(x, FEET, 1); lockOff(); moving = false; }
  zone('stage', () => lane === 'stage' ? '走下舞台' : '走上舞台', S.stage.steps, () => lane === 'stage' ? offStage() : toStage(), { lane: null, canReach: () => lane !== 'shore' });
  zone('shore', () => lane === 'shore' ? '回沙灘' : '走到浪邊', S.shore.zone, () => lane === 'shore' ? offShore() : toShore(), { lane: null, canReach: () => lane !== 'stage' });
  // 不在沙灘走道時：左右限位、走路速度照縮放放慢、舞台木板腳步聲、浪邊留腳印
  let prevX = state.x, woodAcc = 0, woodN = 0, printAcc = 0, printN = 0; const stats = { wood: 0, prints: 0, strums: 0, runaways: 0, calls: 0 };
  api.onFrame(() => {
    if (lane !== 'beach' && !moving && !hold) { const L = S[lane]; let x = prevX + (state.x - prevX) * L.k; x = clamp(x, L.x0, L.x1); const dx = Math.abs(x - prevX); state.x = x;
      if (lane === 'stage') { woodAcc += dx; if (woodAcc > 34) { woodAcc = 0; sfx.wood(woodN++); stats.wood += 1; } }
      if (lane === 'shore') { printAcc += dx; if (printAcc > 15) { printAcc = 0; stamp(x, printN++); stats.prints += 1; } }
      api.render(); }
    prevX = state.x;
  });

  // ── 浪邊：腳印與浪（程式畫在一張小 canvas 上，只蓋浪邊那一段） ──
  const SH = { x: 2176, y: 340, w: 262, h: 84 }; /* 右緣收在椰子樹幹之前：浪不能畫到樹幹上 */ const shoreCv = document.createElement('canvas'); shoreCv.className = 'beachcv'; shoreCv.width = SH.w; shoreCv.height = SH.h; Object.assign(shoreCv.style, { left: X(SH.x), top: Y(SH.y), width: X(SH.w), height: Y(SH.h) }); under(shoreCv); const sg = shoreCv.getContext('2d');
  const prints = []; const wave = { t: -1, next: rnd(3, 5), reach: 0 };
  function stamp(x, n) { prints.push({ x: x - SH.x + (n % 2 ? 3 : -3), y: S.shore.feet - SH.y + (n % 2 ? 3 : 0) + rnd(-1, 1), a: 0.42, face: state.face }); if (prints.length > 60) prints.shift(); }
  function drawShore(dt) {
    const s = api.getScale(), vw = innerWidth / s, cx = api.camX(); if (cx + vw < SH.x || cx > SH.x + SH.w) return;
    if (wave.t < 0) { wave.next -= dt; if (wave.next <= 0 && (prints.length || lane === 'shore')) { wave.t = 0; wave.reach = rnd(0.82, 1); sfx.wave(); } } else { wave.t += dt / 3.4; if (wave.t >= 1) { wave.t = -1; wave.next = rnd(4.5, 8); } }
    sg.clearRect(0, 0, SH.w, SH.h); const base = S.shore.sea - SH.y - 6; let foamY = -99;
    if (wave.t >= 0) { const e = Math.sin(Math.min(1, wave.t) * Math.PI); foamY = base + e * (S.shore.feet + 14 - S.shore.sea) * wave.reach; for (let i = prints.length - 1; i >= 0; i--) if (prints[i].y < foamY + 2) { prints[i].a -= dt * 2.4; if (prints[i].a <= 0) prints.splice(i, 1); } }
    for (const p of prints) { sg.fillStyle = `rgba(120,72,70,${p.a})`; sg.beginPath(); sg.ellipse(p.x, p.y, 3.4, 1.7, 0, 0, 6.283); sg.fill(); sg.beginPath(); sg.ellipse(p.x + p.face * 4.2, p.y - 0.4, 1.5, 1.2, 0, 0, 6.283); sg.fill(); }
    if (wave.t >= 0) {   // 浪：一片很淡的水色蓋上來，前緣一條白色的泡沫，兩端淡出
      const al = Math.sin(Math.min(1, wave.t) * Math.PI); const edge = x => foamY + Math.sin(x * 0.045 + wave.t * 4) * 2.4 + Math.sin(x * 0.11) * 1.4;
      sg.save(); const fade = sg.createLinearGradient(0, 0, SH.w, 0); fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(0.2, 'rgba(0,0,0,1)'); fade.addColorStop(0.8, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)');
      sg.beginPath(); sg.moveTo(0, base - 4); for (let x = 0; x <= SH.w; x += 6) sg.lineTo(x, edge(x)); sg.lineTo(SH.w, base - 4); sg.closePath(); sg.fillStyle = `rgba(150,222,226,${0.3 * al})`; sg.fill();
      sg.lineWidth = 3.2; sg.strokeStyle = `rgba(255,255,255,${0.88 * al})`; sg.lineCap = 'round'; sg.beginPath(); for (let x = 0; x <= SH.w; x += 6) x ? sg.lineTo(x, edge(x)) : sg.moveTo(x, edge(x)); sg.stroke();
      sg.lineWidth = 1.4; sg.strokeStyle = `rgba(255,255,255,${0.5 * al})`; sg.beginPath(); for (let x = 0; x <= SH.w; x += 6) x ? sg.lineTo(x, edge(x) - 5) : sg.moveTo(x, edge(x) - 5); sg.stroke();
      sg.globalCompositeOperation = 'destination-in'; sg.fillStyle = fade; sg.fillRect(0, 0, SH.w, SH.h); sg.restore(); }
  }
  api.onFrame(drawShore);

  // ── 呼喚 ──
  const callBtn = document.createElement('button'); callBtn.id = 'call'; callBtn.type = 'button'; callBtn.innerHTML = '呼喚<small>C</small>'; document.body.appendChild(callBtn);
  const canCall = () => !ch4 || on('c4_call'); const showCall = () => { callBtn.hidden = !canCall(); }; showCall();
  const callers = [];   // 每種小生物登記一個 (teaX) => 有沒有回應
  let calling = false, callCount = 0;
  function call() {
    if (!canCall() || calling || hold || api.panelOpen() || api.cgOpen()) return; calling = true; setTimeout(() => { calling = false; }, 1100); callCount += 1; stats.calls += 1;
    sfx.hum(3); tea.classList.remove('calling'); void tea.offsetWidth; tea.classList.add('calling'); setTimeout(() => tea.classList.remove('calling'), 820);
    const hy = pose.y - M.hero_h * H * pose.k - 6; for (let i = 0; i < 4; i++) note(state.x + state.face * 10, hy, i * 0.16, 80);
    let got = 0; for (const f of callers) if (f(state.x)) got += 1;
    if (ch4 && got && !on('c4_called')) { save({ c4_called: 'true' }); setTimeout(() => { setQuest(); api.toast('牠們過來了'); }, 900); }
    if (!got) setTimeout(() => api.toast(lane === 'shore' ? '海面靜靜的' : '附近沒有聽見的小動物'), 700);
  }
  callBtn.addEventListener('click', e => { e.stopPropagation(); call(); }); callBtn.addEventListener('pointerdown', e => e.stopPropagation());
  addEventListener('keydown', e => { if (e.key === 'c' || e.key === 'C') call(); });
  const NEAR = 470; const hears = (x, teaX) => Math.abs(x - teaX) < NEAR;

  // ── 任務紙條與貝殼格 ──
  const quest = document.getElementById('quest'), pal = document.getElementById('palette'); const picked = new Set((st.shells_c4 || '').split(',').filter(Boolean).map(Number));
  const questText = () => { if (!ch4 || on('c4_done')) return ''; if (!on('c4_call')) return ''; if (on('c4_dolphin')) return '海豚來了'; if (on('c4_melody')) return '到浪邊，對著海呼喚'; if (picked.size >= 7) return '把貝殼交給詩'; if (!on('c4_called') && !picked.size) return '走到小動物附近，按「呼喚」'; return `找七個不同音高的貝殼　${picked.size}／7`; };
  function setQuest() { const t = questText(); quest.hidden = !t; quest.textContent = t; const showPal = ch4 && on('c4_call') && !on('c4_melody') && (on('c4_called') || picked.size > 0); pal.hidden = !showPal; if (showPal) { pal.replaceChildren(); for (let i = 1; i <= 7; i++) { const sw = document.createElement('i'); sw.style.setProperty('--c', SHELLC[i - 1]); sw.classList.toggle('got', picked.has(i)); pal.appendChild(sw); } } }

  // ── 螃蟹 ──
  let shyTold = on('c4_call'); function sawShy() { if (!ch4 || shyTold || on('c4_call')) return; shyTold = true; setTimeout(() => teachCall(), 700); }
  const d28Picked = new Set((st.shells_c7 || '').split(',').filter(Boolean));   // 第 28 天茶語撿過的貝殼（下面那段用）
  const crabSrc = '../art/sprites/crab.webp'; const CRAB_H = 34, CRAB_W = CRAB_H * 989 / 689; const crabs = [];
  for (const c0 of S.crabs) {
    const guardKey = K('crab_' + c0.id + '_off'); const guarding = () => !!c0.shell && (ch4 || (d28 && c0.shell !== 7)) && !on(guardKey) && !(d28 ? d28Picked.has('s' + c0.shell) : picked.has(c0.shell));
    const el = await sprite(crabSrc, 'crab'); const c = { id: c0.id, el, x: c0.x + (c0.shell && ch4 && on(guardKey) ? 70 : 0), y: c0.y, tx: null, speed: 0, calm: 0, guard: guarding(), shell: c0.shell, told: false };
    place(el, c.x, c.y, CRAB_H); const z = zone('crab_' + c.id, '螃蟹', { x: c.x - 30, w: 60, y: c.y - CRAB_H - 10, h: CRAB_H + 18 }, () => {
      if (c.tx !== null) return; if (c.calm > 0) { const r = pick(['wave', 'hopup', 'heart']); if (r === 'heart') { sfx.heart(); heart(c.x, c.y - CRAB_H - 8); } else { sfx.scuttle(); el.classList.remove(r); void el.offsetWidth; el.classList.add(r); setTimeout(() => el.classList.remove(r), 720); } return; }
      if (c.guard) { hunker(c); return; } flee(c); }, { lane: null, reach: 185 });
    c.z = z; crabs.push(c);
    callers.push(teaX => { if (!hears(c.x, teaX)) return false; const side = c.x >= teaX ? 1 : -1; c.calm = 16; el.classList.remove('hunker'); if (c.guard) { c.guard = false; save({ [guardKey]: 'true' }); const sh = shells.find(s => s.n === c.shell); if (sh) setTimeout(() => sh.uncover(), 500); }
      go(c, clamp(teaX + side * (58 + crabs.indexOf(c) * 42 + rnd(-6, 6)) * (lane === 'beach' ? 1 : 1.3), 80, W - 90), 170); /* 每隻停的距離不一樣，幾隻一起過來不會疊在一起 */ setTimeout(() => note(c.x, c.y - CRAB_H - 10, 0, 46), 500); return true; });
  }
  function go(c, tx, speed) { c.tx = tx; c.speed = speed; c.el.classList.add('scuttle'); sfx.scuttle(); }
  function flee(c) { const dir = c.x >= state.x ? 1 : -1; let tx = c.x + dir * rnd(210, 300); if (tx < 90 || tx > W - 100) tx = c.x - dir * rnd(210, 300); go(c, tx, 300); sawShy(); }
  function hunker(c) { c.el.classList.add('hunker'); sfx.scuttle(); if (!c.told) { c.told = true; api.toast('螃蟹縮起來，壓著底下的貝殼不肯走'); } sawShy(); }
  api.onFrame(dt => { for (const c of crabs) {
    if (c.calm > 0) c.calm -= dt;
    if (c.tx !== null) { const d = c.tx - c.x; const stepx = Math.sign(d) * Math.min(Math.abs(d), c.speed * dt); c.x += stepx; c.el.style.left = X(c.x); c.z.moveTo(c.x); if (Math.abs(c.tx - c.x) < 1) { c.tx = null; c.el.classList.remove('scuttle'); } continue; }
    if (c.calm <= 0 && lane === 'beach' && !hold && Math.abs(state.x - c.x) < 150) { if (c.guard) { if (!c.el.classList.contains('hunker')) hunker(c); } else flee(c); }
    else if (c.guard && c.el.classList.contains('hunker') && Math.abs(state.x - c.x) > 230) c.el.classList.remove('hunker');
  } });
  // 從木箱、木桶裡跑出來的螃蟹：跳出來、橫著跑一段、躲到畫面外或葉子後面淡出
  async function runawayCrab(x0, y0, ground, dir) { const el = await sprite(crabSrc, 'crab'); place(el, x0, y0, CRAB_H * 0.9); stats.runaways += 1; let t = 0; const x1 = x0 + dir * rnd(46, 70), run = dir * rnd(260, 380); sfx.scuttle();
    const anim = dt => { t += dt; if (t < 0.5) { const e = t / 0.5; el.style.left = X(x0 + (x1 - x0) * e); el.style.top = Y(y0 + (ground - y0) * e * e - Math.sin(e * Math.PI) * 26); } else { const e = Math.min(1, (t - 0.5) / 1.5); if (!el.classList.contains('scuttle')) { el.classList.add('scuttle'); sfx.scuttle(); } el.style.top = Y(ground); el.style.left = X(x1 + run * e); el.style.opacity = String(e > 0.75 ? (1 - e) * 4 : 1); if (e >= 1) { el.remove(); const k = api.frameHooks.indexOf(anim); if (k >= 0) api.frameHooks.splice(k, 1); } } };
    api.frameHooks.push(anim); }

  // ── 貝殼 ──
  const shells = [];
  if (ch4 && !on('c4_melody')) for (const s0 of S.shells) {
    if (picked.has(s0.n)) continue; const el = await sprite(`../art/sprites/shell_${s0.n}.webp`, 'shell flat'); const h = 24 - (s0.n - 1) * 1.6; const s = { ...s0, el, h };
    const crab = s0.crab && crabs.find(c => c.id === s0.crab); const covered = () => (crab && crab.guard) || (s0.hermit && !on('hermit_out_c4'));
    place(el, s.x, s.y, h); if (crab) art.insertBefore(el, crab.el);   // 螃蟹壓在貝殼上面
    if (s0.hermit && covered()) el.style.display = 'none';
    s.z = zone('shell_' + s.n, '撿起貝殼', { x: s.x - 30, w: 60, y: s.y - h - 10, h: h + 18 }, async z => { if (s.busy) return; s.busy = true; await approach(s.x, 70); z.off(); picked.add(s.n); sfx.shell(s.n - 1); el.classList.add('ring'); sparkle(s.x, s.y - h / 2, 8); note(s.x, s.y - h - 8, 0, 54);
      save({ shells_c4: [...picked].join(','), s3_shell_count: String(picked.size) }); setQuest(); api.toast(`撿到貝殼　${SOLFA[s.n - 1]}　${picked.size}／7`); setTimeout(() => { el.classList.add('picked'); setTimeout(() => el.remove(), 500); }, 520); const i = shells.indexOf(s); if (i >= 0) shells.splice(i, 1); }, { lane: s0.lane || 'beach', reach: 70 });
    s.z.btn.style.zIndex = '5'; // 貝殼露出後，經過的海鷗不會擋住撿拾熱區。
    s.uncover = () => { el.style.display = ''; el.classList.add('hopup', 'glow'); setTimeout(() => el.classList.remove('hopup'), 460); sparkle(s.x, s.y - h / 2, 5, 0.7); s.z.show(); };
    if (covered()) s.z.hide(); else el.classList.add('glow'); shells.push(s);
  }

  // ── 海鷗（站姿 gull.png；飛行 gull_fly_0..2：翅上、翅下、滑翔，做法照朝霞丘的小鳥） ──
  const gullFly = []; for (let k = 0; k < 3; k++) { try { gullFly.push((await paperize(`../art/sprites/gull_fly_${k}.webp`, { edge: 7, jitter: 2 })).src); } catch { break; } }
  const GULL_H = 46; const gulls = [];
  for (const g0 of S.gulls) {
    const el = await sprite('../art/sprites/gull.webp', 'bird gull'); place(el, g0.x, g0.y, GULL_H); const sheet = el.querySelector('.sheet'); const standSrc = sheet.src;
    const g = { id: g0.id, el, x: g0.x, y: g0.y, home: g0, state: 'perch', calm: 0, away: 0, face: g0.id % 2 ? -1 : 1, idleT: rnd(1, 4) }; el.style.setProperty('--facing', g.face);
    const z = zone('gull' + g.id, '海鷗', { x: g.x - 36, w: 72, y: g.y - GULL_H - 8, h: GULL_H + 16 }, () => { if (g.state === 'fly') return; if (g.calm > 0) { sfx.squawk(); const r = pick(['ruffle', 'hopstep', 'peckonce']); el.classList.add(r); setTimeout(() => el.classList.remove(r), 600); if (Math.random() < 0.4) heart(g.x, g.y - GULL_H - 6); return; } flyOff(); }, { lane: null, reach: 200 });
    g.z = z; gulls.push(g); let flapT = 0;
    const frame = (dt, glide) => { if (!gullFly.length) return standSrc; flapT += dt; return glide ? gullFly[2] : gullFly[Math.floor(flapT * 8) % 2]; };
    // 飛一段：每一幀自己算位置（不靠 CSS 過場），到了才把熱區移過去打開
    function fly(x1, y1, s0, s1, secs, done) { g.state = 'fly'; z.hide(); el.classList.remove('crouch'); el.classList.add('flying'); el.style.display = ''; const x0 = g.x, y0 = g.y; const dir = x1 >= x0 ? 1 : -1; el.style.setProperty('--facing', dir); let t = 0; flapT = 0;
      const anim = dt => { t += dt / secs; const e0 = Math.min(1, t), e = e0 * e0 * (3 - 2 * e0); g.x = x0 + (x1 - x0) * e; g.y = y0 + (y1 - y0) * e - Math.sin(e0 * Math.PI) * 60; el.style.left = X(g.x); el.style.top = Y(g.y); el.style.setProperty('--size', (s0 + (s1 - s0) * e).toFixed(3)); sheet.src = frame(dt, e0 > 0.35 && e0 < 0.7);
        if (e0 >= 1) { const k = api.frameHooks.indexOf(anim); if (k >= 0) api.frameHooks.splice(k, 1); done(); } };
      api.frameHooks.push(anim); }
    function land(st_) { el.classList.remove('flying'); sheet.src = standSrc; el.style.setProperty('--size', '1'); el.style.left = X(g.x); el.style.top = Y(g.y); el.style.setProperty('--facing', g.face); z.moveTo(g.x, g.y - GULL_H - 8); g.state = st_; z.show(); el.classList.add('ruffle'); setTimeout(() => el.classList.remove('ruffle'), 500); }
    function flyOff() { if (g.state === 'fly' || g.state === 'away') return; sfx.squawk(); sawShy(); const dir = g.x >= state.x ? 1 : -1; el.classList.add('crouch'); g.state = 'fly'; z.hide();
      setTimeout(() => fly(g.x + dir * rnd(420, 640), -70, 1.1, 0.5, 2.2, () => { el.style.display = 'none'; g.state = 'away'; g.away = rnd(9, 15); }), 240); }
    function comeTo(x, y, st_, calm) { if (g.state === 'away') { g.x = x + (Math.random() < 0.5 ? -1 : 1) * rnd(420, 600); g.y = -60; } sfx.squawk(); fly(x, y, g.state === 'away' ? 0.5 : 1, 1, 2.0, () => { g.calm = calm; land(st_); }); }
    callers.push(teaX => { if (g.state === 'fly') return false; const ref = g.state === 'away' ? g.home.x : g.x; if (!hears(ref, teaX) && !hears(g.home.x, teaX)) return false; const side = Math.random() < 0.5 ? -1 : 1; const L = laneOf(lane);
      comeTo(clamp(teaX + side * rnd(74, 120) * (lane === 'beach' ? 1 : 0.8), L.x0 + 10, L.x1 - 10), lane === 'beach' ? FEET - 22 : L.feet - 4, 'visit', 16); setTimeout(() => note(g.x, g.y - GULL_H - 30, 0, 46), 2100); return true; });
    api.onFrame(dt => {
      if (g.state === 'fly') return; if (g.calm > 0) g.calm -= dt;
      if (g.state === 'away') { g.away -= dt; if (g.away <= 0) { if (Math.abs(state.x - g.home.x) < 300) g.away = 3; else comeTo(g.home.x, g.home.y, 'perch', 0); } return; }
      if (g.calm <= 0 && !hold && Math.abs(state.x - g.x) < 165 && (lane === 'beach' || g.state === 'visit')) { flyOff(); return; }
      if (g.calm <= 0 && g.state === 'visit' && Math.abs(state.x - g.x) > 300) { comeTo(g.home.x, g.home.y, 'perch', 0); return; }
      g.idleT -= dt; if (g.idleT <= 0) { g.idleT = rnd(1.8, 5); const r = Math.floor(Math.random() * 3); if (r === 0) { g.face = -g.face; el.style.setProperty('--facing', g.face); } else { const c = r === 1 ? 'hopstep' : 'ruffle'; el.classList.add(c); setTimeout(() => el.classList.remove(c), 520); } }
    });
  }

  // ── 寄居蟹：躲在石頭後面（石頭那一塊從原畫剪出來疊在牠前面，像素跟底圖一樣），呼喚才出來 ──
  const hermit = { el: await sprite('../art/sprites/hermit.webp', 'hermit'), x: S.hermit.hide[0], y: S.hermit.hide[1], out: false, t: 0, moving: false }; const HERMIT_H = 30;
  place(hermit.el, hermit.x, hermit.y, HERMIT_H); hermit.el.style.setProperty('--facing', 1);
  if (M.rock_fg) { const r = M.rock_fg; const im = document.createElement('img'); im.className = 'easelpatch rockfg'; im.src = r.img; im.alt = ''; im.draggable = false; Object.assign(im.style, { left: X(r.x), top: Y(r.y), width: X(r.w), height: Y(r.h), zIndex: 2 }); hermit.el.after(im); }
  const hermitZ = zone('hermit', '寄居蟹', { x: S.hermit.out[0] - 34, w: 68, y: S.hermit.out[1] - HERMIT_H - 10, h: HERMIT_H + 18 }, () => { if (hermit.moving) return; sfx.scuttle(); const r = pick(['tuck', 'hopup']); hermit.el.classList.add(r); setTimeout(() => hermit.el.classList.remove(r), r === 'tuck' ? 1100 : 460); if (r === 'hopup' && Math.random() < 0.5) heart(hermit.x, hermit.y - HERMIT_H - 6); hermit.t = 18; }, { lane: null }); hermitZ.hide();
  function hermitMove(to, done) { hermit.moving = true; hermitZ.hide(); const x0 = hermit.x, y0 = hermit.y; let t = 0; hermit.el.style.setProperty('--facing', to[0] >= x0 ? 1 : -1); sfx.scuttle();
    const anim = dt => { t += dt / 1.5; const e = Math.min(1, t); hermit.x = x0 + (to[0] - x0) * e; hermit.y = y0 + (to[1] - y0) * e; hermit.el.style.left = X(hermit.x); hermit.el.style.top = Y(hermit.y); hermit.el.style.setProperty('--bob', (-Math.abs(Math.sin(t * 14)) * 5) + '%'); if (e >= 1) { hermit.el.style.setProperty('--bob', '0%'); const k = api.frameHooks.indexOf(anim); if (k >= 0) api.frameHooks.splice(k, 1); hermit.moving = false; done(); } };
    api.frameHooks.push(anim); }
  callers.push(teaX => { if (!hears(S.hermit.out[0], teaX) || hermit.moving) return false; if (hermit.out) { hermit.t = 20; note(hermit.x, hermit.y - HERMIT_H - 8, 0.2, 44); return true; }
    hermitMove(S.hermit.out, () => { hermit.out = true; hermit.t = 22; hermitZ.moveTo(hermit.x, hermit.y - HERMIT_H - 10); hermitZ.show(); note(hermit.x, hermit.y - HERMIT_H - 8, 0, 44); if (ch4 && !on('hermit_out_c4')) { save({ hermit_out_c4: 'true' }); const sh = shells.find(s => s.hermit); if (sh) sh.uncover(); } }); return true; });
  api.onFrame(dt => { if (!hermit.out || hermit.moving) return; hermit.t -= dt; if (hermit.t <= 0 && Math.abs(state.x - hermit.x) > 200) { hermit.out = false; hermitMove(S.hermit.hide, () => {}); } });

  // ── 海豚：在浪邊對著海呼喚才來（第四章要等詩敲完旋律） ──
  const dolSrc = []; for (const k of [0, 1]) dolSrc.push((await paperize(`../art/sprites/dolphin_${k}.webp`, { edge: 7, jitter: 2 })).src);
  const dol = { el: await sprite('../art/sprites/dolphin_1.webp', 'dolphin flat'), here: false, busy: false, x: S.dolphin.far[0], y: S.dolphin.far[1], t: 0 }; const DOL_H = S.dolphin.len * 307 / 406; /* 兩格墊成同樣大的畫布 406×307，海豚身長等於畫布寬 */ const dolSheet = dol.el.querySelector('.sheet');
  place(dol.el, dol.x, dol.y, DOL_H); dol.el.style.display = 'none'; dol.el.style.zIndex = 1; under(dol.el);   // 在浪的那張 canvas 上面、人物後面
  const dolphinAllowed = () => !ch4 || on('c4_melody');
  const dolZ = zone('dolphin', '海豚', { x: S.dolphin.near[0] - 74, w: 148, y: S.dolphin.near[1] - 62, h: 76 }, () => { if (dol.busy) return; sfx.squeak(); dolHop();
    openDialogue([['', '（海豚把背靠到岸邊，回頭看她。）'], { choice: [['騎上去', [['', '（騎上海豚。）']]], ['再等一下', []]] }], [], line => { if (line === '（騎上海豚。）') rideCard(); }); }, { lane: 'shore' }); dolZ.hide();
  function rideCard() { setTimeout(() => {
    const back = new URL(location.href); back.searchParams.delete('reset'); back.searchParams.set('dolphinDone', '1');   // 回來時不能帶 reset=1，不然進度被清掉
    const island = new URL('./island.html', location.href);
    island.searchParams.set('stage', '3'); island.searchParams.set('chapter', '4');
    island.searchParams.set('time', '黃昏'); island.searchParams.set('ride', 'dolphin');
    island.searchParams.set('back', back.href);
    if (window.IslandBridge) window.IslandBridge.carry(island);   // 配樂跟著帶過去（自由逛時 back 那邊本來就有）
    island.searchParams.delete('visit');   // 繞島那一頁只負責繞一圈再回來
    location.href = island.href;
  }, 250); }
  function card(title, text, foot) { const sc = document.getElementById('scroll'); sc.querySelector('small').textContent = foot; api.showScroll(title, text); }
  function dolHop() { let t = 0; dol.busy = true; dolSheet.src = dolSrc[0]; drops(dol.x, dol.y - 6, 5); sfx.splash(); const anim = dt => { t += dt / 0.9; const e = Math.min(1, t); dol.el.style.top = Y(dol.y - Math.sin(e * Math.PI) * 34); dol.el.style.setProperty('--rot', ((e - 0.5) * -70 * -1) + 'deg'); if (e >= 1) { dolSheet.src = dolSrc[1]; dol.el.style.setProperty('--rot', '0deg'); drops(dol.x, dol.y - 6, 5); const k = api.frameHooks.indexOf(anim); if (k >= 0) api.frameHooks.splice(k, 1); dol.busy = false; } }; api.frameHooks.push(anim); }
  function dolCome() { dol.busy = true; dol.el.style.display = ''; dol.el.style.setProperty('--facing', -1); const [x0, y0] = S.dolphin.far, y1 = S.dolphin.near[1]; const x1 = clamp(state.x + (state.x < S.shore.cx ? 104 : -104), S.shore.x0 + 16, S.shore.x1 - 4); /* 停在她旁邊的水裡，不疊在她身上 */ let t = 0; const JUMPS = 3; sfx.squeak(); let lastJ = -1;
    const anim = dt => { t += dt / 4.2; const e = Math.min(1, t); dol.x = x0 + (x1 - x0) * e; const base = y0 + (y1 - y0) * e; const ph = (e * JUMPS) % 1, j = Math.floor(e * JUMPS); const inAir = ph > 0.25 && ph < 0.85 && e < 0.97; const a = inAir ? (ph - 0.25) / 0.6 : 0; const size = 0.55 + 0.45 * e;
      dol.y = base; dol.el.style.left = X(dol.x); dol.el.style.top = Y(base - (inAir ? Math.sin(a * Math.PI) * 46 * size : 0)); dol.el.style.height = (DOL_H * size / H * 100 / (1 - 2 * Number(dol.el.dataset.pad))) + '%'; dolSheet.src = inAir ? dolSrc[0] : dolSrc[1]; dol.el.style.setProperty('--rot', inAir ? ((a - 0.5) * 70) + 'deg' : '0deg');
      if (inAir && j !== lastJ) { lastJ = j; sfx.splash(); drops(dol.x, base - 4, 4); }
      if (e >= 1) { const k = api.frameHooks.indexOf(anim); if (k >= 0) api.frameHooks.splice(k, 1); dol.el.style.setProperty('--rot', '0deg'); dolSheet.src = dolSrc[1]; dol.here = true; dol.busy = false; dol.el.style.setProperty('--facing', x1 > state.x ? -1 : 1); dolZ.moveTo(x1); dolZ.show(); sfx.squeak(); drops(dol.x, dol.y - 4, 6); if (ch4 && !on('c4_dolphin')) { save({ c4_dolphin: 'true' }); setQuest(); } } };
    api.frameHooks.push(anim); }
  callers.push(() => { if (lane !== 'shore' || !dolphinAllowed() || dol.busy) return false; if (dol.here) { dolHop(); sfx.squeak(); return true; } dolCome(); return true; });
  api.onFrame(dt => { if (!dol.here || dol.busy) return; dol.t += dt; dol.el.style.top = Y(dol.y + Math.sin(dol.t * 2.1) * 2.2); dol.el.style.setProperty('--rot', (Math.sin(dol.t * 1.3) * 3) + 'deg'); });
  if (ch4 && on('c4_dolphin')) { dol.here = true; dol.x = S.dolphin.near[0]; dol.y = S.dolphin.near[1]; dol.el.style.display = ''; dol.el.style.left = X(dol.x); dol.el.style.top = Y(dol.y); dol.el.style.setProperty('--facing', -1); dolZ.show(); }
  // 下潛入口：浪邊左端 → 直向海底長畫 dive.html（第四章學會呼喚後才出現，只潛到中層；真結局潛到最底）。浮回水面後回到浪邊原處（?lane=shore&x=…）
  const diveZ = zone('dive', '下潛', { x: S.shore.x0 - 14, w: 74, y: S.shore.sea - 44, h: 46 }, () => { sfx.splash(); drops(S.shore.x0 + 22, S.shore.sea - 8, 6); setTimeout(goDive, 260); }, { lane: 'shore' });
  const diveAllowed = () => !ch4 || on('c4_call'); if (!diveAllowed()) diveZ.hide(); api.onFrame(() => { if (!diveZ.vis && diveAllowed()) diveZ.show(); });
  function goDive() {
    const back = new URL(location.href); for (const k of ['reset', 'x', 'lane', 'diveDone', 'dolphinDone']) back.searchParams.delete(k);
    back.searchParams.set('lane', 'shore'); back.searchParams.set('x', (state.x / W).toFixed(4)); back.searchParams.set('diveDone', '1');
    const dive = new URL('./dive.html', location.href); dive.searchParams.set('chapter', ch4 ? '4' : 'true'); dive.searchParams.set('back', back.href);
    for (const k of ['memories', 'memory6', 'creatures', 'coral_dive']) if (st[k] !== undefined) dive.searchParams.set(k, st[k]);
    S.diveUrl = dive.href; if (Q.get('noNav') === '1') return; location.href = dive.href;
  }
  // 從海底回來：放回浪邊原處
  if (Q.get('lane') === 'shore') { state.x = clamp(state.x, S.shore.x0, S.shore.x1); setLane('shore'); setPose(S.shore.feet, S.shore.k); api.render(); }
  if (Q.get('diveDone') === '1') for (const k of ['creatures', 'zukan_complete', 'coral_dive', 'memory6', 'memories', ch4 ? 'c4_dive' : 'dive_done']) if (Q.has(k) && st[k] !== Q.get(k)) save({ [k]: Q.get(k) });

  // ── 詩 ──
  const shiEl = art.querySelector('.person.shi'); const shiH0 = parseFloat(shiEl.style.height); const SHI_HPX = api.META.npcs.find(n => n.id === 'shi').h * H;
  const shi = { x: 0, y: FEET, k: 1, face: 1, busy: false, t: 0 }; const shiPose = (x, y, k) => { shi.x = x; shi.y = y; shi.k = k; shiEl.style.left = X(x); shiEl.style.top = Y(y); shiEl.style.height = (shiH0 * k) + '%'; };
  const shiLook = dir => { shiEl.style.setProperty('--facing', dir > 0 ? -1 : 1); };   // 立繪本身朝畫面左前方：看右邊要鏡射
  function walkShi(x1, y1, k1, speed = 400) { return new Promise(ok => { const x0 = shi.x, y0 = shi.y, k0 = shi.k; const secs = Math.max(0.12, Math.hypot(x1 - x0, (y1 - y0) * 1.6) / (speed * (k0 + k1) / 2)); let t = 0; if (Math.abs(x1 - x0) > 3) shiLook(x1 - x0);
    const anim = dt => { t += dt / secs; const e = Math.min(1, t); shiPose(x0 + (x1 - x0) * e, y0 + (y1 - y0) * e, k0 + (k1 - k0) * e); shiEl.style.setProperty('--bob', (-window.WalkSway.pose(t * secs, true).lift * 100) + '%'); shiEl.style.setProperty('--rock', window.WalkSway.pose(t * secs, true).tilt + 'deg'); if (e >= 1) { shiEl.style.setProperty('--bob', '0%'); shiEl.style.setProperty('--rock', '0deg'); const k = api.frameHooks.indexOf(anim); if (k >= 0) api.frameHooks.splice(k, 1); ok(); } }; api.frameHooks.push(anim); }); }
  // 坐在舞台邊的紙片（人和舞台前緣那一段同一張）：照 sprites/<鍵>.json 量好的矮牆左右緣與前緣，縮放到蓋住原畫柱腳到台階那一段
  const sitPieces = {};
  async function sitPiece(key) { if (sitPieces[key]) return sitPieces[key]; const m = await PageLoading.json(`../art/sprites/${key}.json`); const el = await sprite(`../art/sprites/${key}.webp`, 'sit stagepiece ' + key, { edge: 6, jitter: 2 });
    const s = (S.sit.x1 - S.sit.x0) / (m.wall_x1 - m.wall_x0); const left = S.sit.x0 - m.wall_x0 * s, top = S.sit.lip - m.lip * s; sitPieces[key] = { el, cx: left + m.w * s / 2, bottom: top + m.h * s, h: m.h * s, head: top }; return sitPieces[key]; }
  function showSit(p, sink = true) { p.el.classList.remove('sink', 'rise'); place(p.el, p.cx, p.bottom, p.h); art.insertBefore(p.el, firstPerson); if (sink) { void p.el.offsetWidth; p.el.classList.add('sink'); } }
  let shiZ = null, teachCall = () => {};
  if (ch4) {
    // 第四章：詩跟在茶語後面走（只在沙灘走道上跟；她上舞台或去浪邊時在原地等）
    shiPose(clamp(state.x - 110, M.walk[0], M.walk[1]), FEET, 1); shiLook(1);
    shiZ = zone('shi', () => picked.size >= 7 && !on('c4_melody') ? '把貝殼交給詩' : '詩', { x: shi.x - 50, w: 100, y: FEET - SHI_HPX - 6, h: SHI_HPX + 10 }, () => talkShi4()); /* 只在沙灘走道上點得到：她去浪邊或上舞台時，詩的熱區不能蓋住那邊的貝殼 */
    api.onFrame(dt => { if (shi.busy) return; shi.t += dt; const tx = moving ? shi.x : lane === 'beach' ? clamp(state.x - state.face * 118, M.walk[0], M.walk[1]) : lane === 'shore' ? S.shore.x0 - 96 : S.stage.steps.x - 96; /* 她去浪邊、上舞台時，詩站到旁邊等，不擋在前面 */ const d = tx - shi.x;
      if (Math.abs(d) > 26) { const v = Math.sign(d) * Math.min(Math.abs(d) - 20, 540 * dt); shiPose(shi.x + v, FEET, 1); shiLook(d); shiEl.style.setProperty('--bob', (-window.WalkSway.pose(shi.t, true).lift * 100) + '%'); shiEl.style.setProperty('--rock', window.WalkSway.pose(shi.t, true).tilt + 'deg'); }
      else { shiEl.style.setProperty('--bob', '0%'); shiEl.style.setProperty('--rock', '0deg'); shiLook(state.x - shi.x); }
      shiZ.moveTo(shi.x); });
    teachCall = () => {
      if (on('c4_call') || api.panelOpen()) {
        if (!on('c4_call')) setTimeout(teachCall, 800);
        return;
      }
      openDialogue([['詩', '牠們怕生啦。'], ['詩', '妳最近不是一直在哼我的歌嗎？在這裡哼，牠們就會過來。']], [() => {
        save({ c4_call: 'true' });
        showCall(); setQuest(); api.toast('學會了「呼喚」');
        guideHint('guideDiveSeen', '往浪邊左端可以下潛。', { vars: () => st, set: save });
      }]);
    };
    if (resumed) setTimeout(() => openDialogue([['詩', '最後一個。叫牠。']]), 900);
    else if (!on('c4_intro')) setTimeout(() => openDialogue([['', '南邊多了一整片沙灘，沙灘盡頭有一座小小的木頭舞台。'], ['詩', '是黃昏耶。']], [() => save({ c4_intro: 'true' })]), 900);
  } else {
    shiEl.style.display = 'none'; const A = await sitPiece('shi_sit_guitar'); showSit(A, false);
    shiZ = zone('shi', '跟詩說話', { x: S.sit.x0 - 8, w: S.sit.x1 - S.sit.x0 + 30, y: A.head - 4, h: A.bottom - A.head + 8 }, () => talkShiTrue(), { lane: null, reach: 110, approachX: () => (S.sit.x0 + S.sit.x1) / 2 });
  }
  const strumRiffs = [[196, 246.9, 293.7, 392, 293.7, 246.9], [220, 261.6, 329.6, 440, 329.6], [164.8, 246.9, 329.6, 392, 493.9, 392]]; let riffN = 0, lastStrum = 0;
  function strum() { const now = performance.now(); if (now - lastStrum < 2500) return; const A = sitPieces.shi_sit_guitar; if (!A || !A.el.isConnected) return; lastStrum = now; stats.strums += 1; const riff = strumRiffs[riffN++ % strumRiffs.length]; riff.forEach((f, i) => sfx.pluck(f, i * 0.17)); A.el.classList.remove('strum', 'sink'); void A.el.offsetWidth; A.el.classList.add('strum'); for (let i = 0; i < 3; i++) note(A.cx + 14, A.head + 10, i * 0.28, 60); }
  function onStage() { if (!ch4 && !sitting) setTimeout(strum, 350); }
  // 第四章跟詩互動：台詞只用劇本有的；沒有台詞的狀態用小動作與提示
  async function talkShi4() {
    if (shi.busy) return;
    if (on('c4_done')) return errandShi(null);   // 第四章做完之後的上島自由時間：可以接詩的小委託
    if (!on('c4_call')) return teachCall();
    if (on('c4_melody')) { if (!on('c4_dolphin')) return openDialogue([['詩', '最後一個。叫牠。']]); sfx.heart(); heart(shi.x, shi.y - SHI_HPX - 6); return; }
    if (picked.size < 7) { for (let i = 0; i < 2; i++) note(shi.x, shi.y - SHI_HPX - 4, i * 0.2, 54); sfx.hum(1); api.toast(`貝殼還差 ${7 - picked.size} 個`); return; }
    melody();
  }
  // 交貝殼 → 詩走上舞台、把七個貝殼排在舞台前緣、一個一個敲出旋律 → CG 4-12（佔位圖）配劇本台詞
  const CG412 = [['', '〔七個貝殼，一個音、一個音響起來。是那首主題曲。〕'], ['', '〔敲到最後一句，詩停了。〕'], ['茶語', '……又是最後一句。'], ['茶語', '你歌裡那一句也唱得好小聲。到底唱什麼？'], ['詩', '這首歌最後一句，等遊戲做完再唱清楚給妳聽。'], ['茶語', '好啊。'], ['詩', '說好了喔。']];
  const TUNE = [2, 2, 4, 5, 4, 2, 1, 0, -1, 1, 2, 4, 2, 1, -1, 0, 1, 2, 5, 4, 2, 4, -1, 6, 5];   // 貝殼編號 0–6，-1 是停一拍；最後一句只起了兩個音就停
  let melodyState = 'idle';
  async function melody() {
    if (shi.busy) return; shi.busy = true; melodyState = 'walking'; lockOn(); setQuest(); quest.hidden = true; pal.hidden = true; shiZ.hide(); sfx.pick(); sparkle(shi.x, shi.y - SHI_HPX * 0.6, 8);
    if (lane !== 'beach') { const was = lane; setLane('beach'); await walkTea(state.x, FEET, 1); void was; }
    const sg_ = S.stage; const walkT = walkTea(clamp(sg_.cx + 40, M.walk[0], M.walk[1]), FEET, 1, 520).then(() => { state.face = -1; api.render(); });
    await walkShi(sg_.steps.x + 60, FEET, 1, 520); await walkShi(sg_.steps.x + 60, sg_.foot + 8, 0.80); for (let i = 0; i < 3; i++) setTimeout(() => sfx.wood(i), i * 150); await walkShi(sg_.steps.x + 60, sg_.feet, sg_.k, 300); await walkShi(1400, sg_.feet + 2, sg_.k, 300); shiLook(1); await walkT;
    // 貝殼一個一個擺上舞台前緣
    melodyState = 'laying'; const row = []; for (let i = 0; i < 7; i++) { const el = await sprite(`../art/sprites/shell_${i + 1}.webp`, 'shell flat'); const h = 20 - i * 1.3; const x = 1352 + i * 15.5; place(el, x, S.sit.lip + 5, h); el.classList.add('hopup'); sfx.click(true); row.push({ el, x, h }); await wait(170); }
    await wait(350); melodyState = 'playing';
    for (const n of TUNE) { if (n >= 0) { const r = row[n]; sfx.shell(n, 0.5); r.el.classList.remove('ring', 'hopup'); void r.el.offsetWidth; r.el.classList.add('ring'); note(r.x, S.sit.lip - 12, 0, 58); shiEl.classList.remove('knock'); void shiEl.offsetWidth; shiEl.classList.add('knock'); } await wait(n >= 0 ? 300 : 260); }
    await wait(500); melodyState = 'cg';
    if (CT.embedded) { save({ s3_shells_submitted: 'true' }); return CT.cut(6, { cg: '4-12' }); }   // 嵌在 Larch：CG 4-12 那一段交給對話卡演，回來接第 6 步
    api.showCg(true, M.cg_412, 1.5);
    setTimeout(() => openDialogue(CG412, [async () => { api.hideCg(); for (const r of row) { r.el.classList.add('picked'); setTimeout(() => r.el.remove(), 500); } for (const s of shells) { s.z.off(); s.el.remove(); } shells.length = 0;
      save({ c4_melody: 'true', s3_shells_submitted: 'true' }); for (let i = 0; i < 3; i++) setTimeout(() => sfx.wood(i), 300 + i * 150); await walkShi(sg_.steps.x + 60, sg_.feet, sg_.k, 300); await walkShi(sg_.steps.x + 60, sg_.foot + 8, 0.80, 300); await walkShi(sg_.steps.x + 60, FEET, 1); shi.busy = false; shiZ.show(); lockOff(); melodyState = 'done'; setQuest();
      openDialogue([['詩', '最後一個。叫牠。']]); }]), 700);
  }
  // 真結局 4-2（劇本真結局.md，一字不改）：講到「坐這邊」之後，茶語走到舞台前，換成兩人並肩坐的那一張紙片；講完起身
  const S42 = [['詩', '妳來了！坐這邊。'], ['', '（茶語坐到詩旁邊，兩個人並排坐在舞台邊，看著海。）'], ['詩', '我要給妳的，是一個聲音。'], ['茶語', '什麼聲音？'], ['詩', '我的。'], ['詩', '這次不押韻，講完也不會說騙妳的。'], ['詩', '十二點那時候，我開那個玩笑，是因為我很怕。'], ['詩', '怕十二點一過，妳叫我，我真的只會回妳那一句。'], ['', '（只聽得到海浪的聲音。詩沒有再講話，也沒有笑。）'], ['茶語', '預演音之國那天，你講了真話，魔王的衣服就不見了。'], ['', '（詩低頭看了看自己的手，又看了看身上的衣服。）'], ['詩', '……我還在耶。'],
    { choice: [['嗯，你還在。', [['詩', '那我以後，多講一點真的。']]], ['我那時候也很怕。', [['詩', '我知道。妳整個人僵住了。……對不起。']]]] }, ['', '（拿到禮物「詩的聲音」。）']];
  const S42_DONE = [['詩', '我的已經給妳了啦，去找他們。']];
  let sitting = false;
  async function talkShiTrue() {
    if (sitting || moving) return; if (lane === 'stage') await offStage(); if (lane === 'shore') await offShore();
    await approach((S.sit.x0 + S.sit.x1) / 2, 110);
    if (ch7) { strum(); if (CT.mode !== 'review') return; return CT.c7Ask('shi', save, () => card('海灘', '（待接劇本第七章「十、海灘」的對話卡。）', '佔位說明')); }   // 第七章：評審週問今天陪誰；撿貝殼那天詩沒有單獨的對話
    if (api.gifts.gift_shi || on('gift_shi')) { strum(); return errandShi(S42_DONE); }
    sitting = true; const A = sitPieces.shi_sit_guitar, B = await sitPiece('shi_tea_sit'); let seated = false;
    const sitDown = async () => { lockOn(); await walkTea(S.sit.x0 + 30, S.stage.foot + 6, 0.80, 420); showSit(B); A.el.remove(); tea.style.visibility = 'hidden'; sfx.sit(); seated = true; lockOff(); };
    openDialogue(S42, [async () => { api.gifts.gift_shi = true; CT.completeFreeInteraction(); save({ gift_shi: 'true', gifts: String(Object.keys(api.gifts).length) }); sfx.heart(); heart(B.cx + 10, B.head - 4);
      lockOn(); await wait(500); B.el.classList.remove('sink'); B.el.classList.add('rise'); await wait(400); B.el.classList.remove('rise'); B.el.remove(); showSit(A, false); tea.style.visibility = ''; api.render(); await walkTea(S.sit.x0 + 30, FEET, 1); lockOff(); sitting = false; }],
      line => { if (line === S42[1][1] && !seated) sitDown(); wave.next = Math.min(wave.next, 0.4); });
  }

  // ── 營火：火光（程式畫的光）、零星火星；點了添一根柴，火星往上飄 ──
  const fire = S.fire; const glow = document.createElement('div'); glow.className = 'fireglow'; Object.assign(glow.style, { left: X(fire.x), top: Y(fire.y - 8), width: X(210), height: Y(150) }); under(glow);
  let logs = Number(st[K('fire_logs')] || 0); const glowSize = () => glow.style.setProperty('--s', (1 + Math.min(logs, 5) * 0.07).toFixed(2)); glowSize();
  const FCV = { x: fire.x - 110, y: fire.y - 250, w: 220, h: 260 }; const fireCv = document.createElement('canvas'); fireCv.className = 'beachcv'; fireCv.width = FCV.w / 2; fireCv.height = FCV.h / 2; Object.assign(fireCv.style, { left: X(FCV.x), top: Y(FCV.y), width: X(FCV.w), height: Y(FCV.h), mixBlendMode: 'screen', zIndex: 3 }); art.appendChild(fireCv); const fg = fireCv.getContext('2d'); fg.scale(0.5, 0.5);
  const sparks = []; let nextSpark = 1; const spark = (burst = false) => sparks.push({ x: FCV.w / 2 + rnd(-14, 14), y: FCV.h - 14 - rnd(0, 10), vx: rnd(-10, 10) * (burst ? 2.2 : 1), vy: -rnd(34, 62) * (burst ? 1.5 : 1), life: rnd(1.3, 2.4), age: 0, r: rnd(1.2, 2.4), ph: rnd(0, 6) });
  api.onFrame(dt => { const s = api.getScale(), vw = innerWidth / s, cx = api.camX(); if (cx + vw < FCV.x || cx > FCV.x + FCV.w) return;   // 不在畫面裡就不畫
    nextSpark -= dt; if (nextSpark <= 0) { spark(); nextSpark = rnd(0.5, 1.6) / (1 + Math.min(logs, 5) * 0.25); } if (!sparks.length && !fireCv.dataset.dirty) return; fg.clearRect(0, 0, FCV.w, FCV.h); fireCv.dataset.dirty = sparks.length ? '1' : '';
    for (let i = sparks.length - 1; i >= 0; i--) { const p = sparks[i]; p.age += dt; if (p.age > p.life) { sparks.splice(i, 1); continue; } p.x += (p.vx + Math.sin(p.age * 5 + p.ph) * 10) * dt; p.y += p.vy * dt; p.vy *= 1 - dt * 0.5; const al = Math.sin(Math.min(1, p.age / p.life) * Math.PI) * 0.95; const g = fg.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 3); g.addColorStop(0, `rgba(255,236,170,${al})`); g.addColorStop(0.4, `rgba(255,170,80,${al * 0.6})`); g.addColorStop(1, 'rgba(255,120,60,0)'); fg.fillStyle = g; fg.beginPath(); fg.arc(p.x, p.y, p.r * 3, 0, 6.283); fg.fill(); } });
  let feeding = false;
  zone('fire', '添一根柴', fire.zone, async () => { if (feeding) return; feeding = true; await approach(fire.x, 150); const el = await sprite('../art/sprites/log.webp', 'log flat'); const x0 = state.x + state.face * 14, y0 = pose.y - M.hero_h * H * 0.5; place(el, x0, y0, 15, true); el.style.zIndex = 5; let t = 0; const spin = rnd(260, 420) * state.face;
    const anim = dt => { t += dt / 0.62; const e = Math.min(1, t); el.style.left = X(x0 + (fire.x - x0) * e); el.style.top = Y(y0 + (fire.y - 6 - y0) * e - Math.sin(e * Math.PI) * 54); el.style.setProperty('--rot', (spin * e) + 'deg');
      if (e >= 1) { const k = api.frameHooks.indexOf(anim); if (k >= 0) api.frameHooks.splice(k, 1); el.style.transition = 'opacity .5s'; el.style.opacity = '0'; setTimeout(() => el.remove(), 520); logs += 1; save({ [K('fire_logs')]: String(logs) }); sfx.crackle(7 + Math.floor(rnd(0, 6))); const n = 16 + Math.floor(rnd(0, 14)); for (let i = 0; i < n; i++) setTimeout(() => spark(true), rnd(0, 500)); glow.style.setProperty('--s', '1.6'); setTimeout(glowSize, 700); setTimeout(() => { feeding = false; }, 500); } };
    api.frameHooks.push(anim); }, { reach: 150, approachX: () => fire.x });

  // ── 舞台燈串：原畫的燈是亮的，先用一塊暗色把每盞蓋成沒點亮；點一下一盞一盞亮起來（程式畫的光，screen 混色） ──
  const bulbs = S.bulbs.map(([x, y]) => { const dim = document.createElement('div'); dim.className = 'bulbdim'; Object.assign(dim.style, { left: X(x), top: Y(y + 1), width: X(40), height: Y(40) }); const gl = document.createElement('div'); gl.className = 'bulbglow'; Object.assign(gl.style, { left: X(x), top: Y(y + 1), width: X(86), height: Y(86) }); under(dim); under(gl); return { dim, gl }; });
  let lightsOn = on(K('lights')), lighting = false; const setBulb = (b, v) => { b.dim.style.opacity = v ? '0' : '1'; b.gl.classList.toggle('on', v); }; bulbs.forEach(b => setBulb(b, lightsOn));
  zone('lights', () => lightsOn ? '燈串' : '點亮燈串', S.lights, async z => { if (lighting) return; lighting = true;
    if (!lightsOn) { const fromLeft = state.x < S.stage.cx; const order = fromLeft ? bulbs : [...bulbs].reverse(); for (const [i, b] of order.entries()) { setBulb(b, true); b.gl.classList.add('flash'); setTimeout(() => b.gl.classList.remove('flash'), 500); sfx.bulb(i); await wait(170); } lightsOn = true; save({ [K('lights')]: 'true' }); z.btn.dataset.name = '燈串'; }
    else { const mode = pick(['wave', 'pairs', 'out']); if (mode === 'out') { for (const [i, b] of [...bulbs].reverse().entries()) { setBulb(b, false); sfx.bulb(8 - i); await wait(120); } lightsOn = false; save({ [K('lights')]: 'false' }); }
      else for (let i = 0; i < 9; i++) { const idx = mode === 'wave' ? [i] : [i, 8 - i]; for (const k of idx) { bulbs[k].gl.classList.remove('flash'); void bulbs[k].gl.offsetWidth; bulbs[k].gl.classList.add('flash'); } sfx.bulb(mode === 'wave' ? i : 8 - i); await wait(110); if (mode === 'pairs' && i >= 4) break; } }
    lighting = false; api.render(); });

  // ── 椰子樹：搖一下掉一顆椰子，落在沙上彈兩下、滾一段 ──
  const coconuts = [];
  for (const p of S.palms) { let busy = false; zone('palm' + p.id, '搖一搖椰子樹', p.zone, async z => { if (busy) return; busy = true; z.btn.classList.remove('shake'); void z.btn.offsetWidth; z.btn.classList.add('shake'); sfx.rustle(4 + Math.floor(rnd(0, 3)));
    const [cx, cy] = pick(p.crowns); const el = await sprite('../art/sprites/coconut.webp', 'coconut flat'); const size = rnd(20, 25); const x1 = clamp(cx + rnd(-30, 30), p.land[0], p.land[1]), roll = (Math.random() < 0.5 ? -1 : 1) * rnd(50, 130); const x2 = clamp(x1 + roll, p.land[0] - 40, p.land[1] + 60); place(el, cx, cy, size); let t = 0, bounced = 0; const fall = 0.55;
    const anim = dt => { t += dt; let x, y, rot;
      if (t < fall) { const e = t / fall; x = cx + (x1 - cx) * e; y = cy + (p.ground - cy) * e * e; rot = e * 200; }
      else { const e = Math.min(1, (t - fall) / 1.5); if (!bounced) { bounced = 1; sfx.thud(); } const hop = Math.abs(Math.sin(e * Math.PI * 2.5)) * 22 * (1 - e) * (1 - e); if (bounced === 1 && e > 0.4) { bounced = 2; sfx.thud(); } const ee = 1 - (1 - e) * (1 - e); x = x1 + (x2 - x1) * ee; y = p.ground - hop; rot = 200 + (x2 - x1) * ee * 4.5; if (e >= 1) { const k = api.frameHooks.indexOf(anim); if (k >= 0) api.frameHooks.splice(k, 1); busy = false; coconuts.push(el); if (coconuts.length > 5) { const old = coconuts.shift(); old.style.transition = 'opacity .8s'; old.style.opacity = '0'; setTimeout(() => old.remove(), 820); } } }
      el.style.left = X(x); el.style.top = Y(y); el.style.setProperty('--rot', rot + 'deg'); };
    api.frameHooks.push(anim); }); }

  // ── 漁網架的浮球：原畫的浮球已經局部重畫拿掉（art/beach_patch.py），這三顆是掛在橫桿上的紙片；點了晃起來，互相碰到就響 ──
  const FSRC = { red: 'float_red', white: 'float_white', pink: 'float_pink' }; const floats = [];
  for (const f0 of S.net.floats) { const pp = await paperize(`../art/sprites/${FSRC[f0.k]}.webp`, { edge: 6, jitter: 2 }); const d = document.createElement('div'); d.className = 'bfloat'; const rope = document.createElement('i'); const im = document.createElement('img'); im.src = pp.src; im.alt = ''; im.draggable = false;
    const hpx = f0.w * pp.height / pp.width; Object.assign(d.style, { left: X(f0.x), top: Y(S.net.bar), width: X(f0.w * 1.2), height: Y(f0.len + hpx) }); rope.style.height = (f0.len / (f0.len + hpx) * 100) + '%'; im.style.width = '100%'; d.append(rope, im); art.insertBefore(d, firstPerson);
    floats.push({ ...f0, el: d, a: 0, v: 0, L: f0.len + hpx * 0.6, r: f0.w * 0.5 }); }
  let netHits = 0;
  zone('net', '晃一晃漁網架', S.net.zone, z => { z.btn.classList.remove('shake'); void z.btn.offsetWidth; z.btn.classList.add('shake'); const dir = Math.random() < 0.5 ? -1 : 1; for (const f of floats) f.v += dir * rnd(1.6, 2.6) * (f.k === 'red' ? 0.8 : 1) * (Math.random() < 0.25 ? -1 : 1); sfx.creak(true); netHits = 0; });
  api.onFrame(dt => { let live = false; for (const f of floats) { if (Math.abs(f.a) < 0.002 && Math.abs(f.v) < 0.002) continue; live = true; f.v += (-22 * Math.sin(f.a) * (60 / f.L) - f.v * 0.55) * dt; f.a += f.v * dt; }
    if (!live) return;
    for (let i = 0; i < floats.length; i++) for (let j = i + 1; j < floats.length; j++) { const a = floats[i], b = floats[j]; const ax = a.x + Math.sin(a.a) * a.L, bx = b.x + Math.sin(b.a) * b.L; if (bx - ax < a.r + b.r && a.v - b.v > 0.05) { const va = a.v; a.v = b.v * 0.82; b.v = va * 0.82; if (netHits < 14) { netHits += 1; sfx.clink(netHits % 3); sparkle((ax + bx) / 2, S.net.bar + a.L * 0.9, 2, 0.5); } } }
    for (const f of floats) f.el.style.setProperty('--a', (-f.a * 180 / Math.PI).toFixed(2) + 'deg'); });

  // ── 木箱、木桶：蓋子掀開的樣子是從原畫局部重畫再對位貼回的補丁（flat.json 的 open_patches），疊上去就是打開；螃蟹跑出來，過幾秒蓋回去 ──
  for (const key of ['crate', 'barrel']) { const P = M.open_patches && M.open_patches[key]; if (!P) continue; const im = document.createElement('img'); im.className = 'easelpatch openpatch ' + key; im.src = P.img; im.alt = ''; im.draggable = false; im.style.opacity = '0'; Object.assign(im.style, { left: X(P.x), top: Y(P.y), width: X(P.w), height: Y(P.h) }); under(im); let busy = false; const c = S[key];
    zone(key, key === 'crate' ? '打開木箱' : '打開木桶', c.zone, async () => { if (busy) return; busy = true; await approach(c.zone.x + c.zone.w / 2, 130); sfx.creak(true); im.style.opacity = '1'; await wait(420); const n = Math.random() < 0.3 ? 2 : 1; for (let i = 0; i < n; i++) { runawayCrab(c.mouth[0], c.mouth[1], c.zone.y + c.zone.h - 6, i ? -1 : (state.x > c.mouth[0] ? -1 : 1)); await wait(260); }
      await wait(2600); sfx.creak(false); im.style.opacity = '0'; await wait(450); busy = false; }, { reach: 130 }); }

  setQuest();
  // 測試與截圖用
  const closeAll0 = window.dawnHill.closeAll; window.dawnHill.closeAll = () => { closeAll0(); };
  window.dawnHill.hot = api.hot; window.dawnHill.state = st;
  // 圖鑑：點到螃蟹、海鷗、寄居蟹、海豚就算遇到（寄居蟹與海豚的熱區只在叫出來之後才開）
  const rewrap = watchHot(api.hot, [['crab_', 'crab'], ['gull', 'gull'], ['hermit', 'hermit'], ['dolphin', 'dolphin']], zk); api.onFrame(rewrap); window.dawnHill.zukan = zk;
  // ── 植物收集（plants.js）：椰子苗在岸邊撿；馬鞍藤是詩留在舞台邊的一盆（七個貝殼找齊、或真結局）；貝殼空氣鳳梨要先用呼喚叫出寄居蟹，牠讓出大貝殼 ──
  const pl = createPlants({ vars: () => Object.assign({}, st, api.vars), set: v => save(v), toast: api.toast }); await pl.ready; window.dawnHill.plants = pl;
  const plantSpot = async (id, x, y, label, can) => { if (pl.has(id)) return null; const el = await sprite(plantImg(id), 'shell plantspot'); place(el, x, y, 46); el.dataset.plant = id; let zz = null;
    const take = () => { if (zz) zz.off(); sfx.pick(); sparkle(x, y - 20, 7); el.classList.add('picked'); setTimeout(() => el.remove(), 500); pl.got(id); };   // 收進花盆
    zz = zone('plant_' + id, label, { x: x - 34, w: 68, y: y - 62, h: 70 }, () => { const no = can && can(); if (no) { api.toast(no); return; } take(); }, { lane: null }); return { el, take }; };
  await plantSpot('coconut', 470, 480, '發芽的椰子');
  // 第四章的島段主線做完才能離開（作者 2026-11-17 定；小委託、收集、圖鑑可做可不做）。沒做完走到出口：提示還有什麼沒做，人退回來一步
  { const exitHot = api.hot.find(h => h.id === 'exit'); if (exitHot && ch4) { const go = exitHot.fn || (() => api.runHot(exitHot)); let last = 0;
    exitHot.fn = () => { if (on('c4_done')) return go(); const now = performance.now(); if (now - last > 1800) { last = now; api.toast('還不能離開：' + (on('c4_dolphin') ? '海豚在岸邊等，騎上去' : (questText() || '先找詩說話'))); } window.dawnHill.exitBlocked = (window.dawnHill.exitBlocked || 0) + 1; }; } }
  const morning = await plantSpot('morning', 1262, 452, '舞台邊的馬鞍藤', () => st.errand_shi === 'done' ? '' : on('c4_done') ? '這盆是詩種的。問問他吧。' : '這盆是詩種的。');
  // 詩的小委託（台詞 2026-11-17 作者定稿，真結局/studio_decor/委託與種樹_提案.md）：第四章做完之後就能接，真結局拿到禮物之後也能補做。
  // 接下後走到浪邊，等浪打上來時點浪花錄下來，再回去找詩。回禮：馬鞍藤
  const ERR_SHI_ASK = [['詩', '欸，妳等一下有空嗎？'], ['茶語', '蛤？又要幹嘛。'], ['詩', '幫我錄一段海浪。我半夜寫歌的時候太安靜，想放著聽。'], ['茶語', '你自己不會錄喔？'], ['詩', '我自己錄的都只有浪啦。我想要裡面有妳的聲音。'], ['茶語', '我才不要對著手機講話。'], ['詩', '不用講話。妳去錄就好。'],
    { choice: [['好啦，我去錄', [['', '（接下詩的小委託：到浪邊錄一段海浪聲。）']]], ['晚點再說', []]] }];
  const ERR_SHI_REC = [['', '〔她走到浪邊，把手機舉高。錄到一半，她跟著哼了兩句。〕'], ['', '〔浪打上來，潑到她的腳。她叫了一聲，自己笑出來。〕']];
  const ERR_SHI_DONE = [['茶語', '錄好了。'], ['詩', '我聽聽看。'], ['詩', '欸，妳有哼歌。哼的是我的歌耶。'], ['茶語', '那、那是不小心的！'], ['詩', '後面還有笑。'], ['茶語', '吼，那段剪掉啦！'], ['詩', '不行。這段我要好好保存。半夜放這個，就當作妳在我身邊。'],
    ['茶語', '……你想聽的話，我可以直接哼給你聽啊。'], ['詩', '真的喔？那妳現在哼。'], ['茶語', '現在不要啦！'], ['詩', '好啦好啦。這盆馬鞍藤給妳，算訂金。下次要哼給我聽喔。']];
  const recZ = zone('errand_record', '把海浪錄下來', { x: S.shore.cx - 70, w: 140, y: S.shore.sea - 70, h: 44 }, () => {
    if (wave.t < 0) { api.toast('（浪還沒來。再等一下。）'); return; }
    save({ errand_shi: 'recorded' }); recZ.hide(); sfx.pick(); openDialogue(ERR_SHI_REC); }, { lane: 'shore' });
  const recShow = () => { if (st.errand_shi === 'accepted') recZ.show(); else recZ.hide(); }; recShow();
  function errandShi(after) {
    if (st.errand_shi === 'done') { if (after) return openDialogue(after); sfx.heart(); heart(shi.x, shi.y - SHI_HPX - 6); return; }
    if (st.errand_shi === 'recorded') return openDialogue(ERR_SHI_DONE, [() => { save({ errand_shi: 'done' }); CT.completeFreeInteraction(); sfx.heart(); if (morning) morning.take(); else pl.got('morning'); }]);
    if (st.errand_shi === 'accepted') { api.toast('到浪邊，等浪打上來的時候錄下來'); return; }
    return openDialogue(ERR_SHI_ASK, [], line => { if (line === '（接下詩的小委託：到浪邊錄一段海浪聲。）') { save({ errand_shi: 'accepted' }); recShow(); } });
  }
  if (st.errand_shi === 'done' && morning) morning.take();
  await plantSpot('airplant', 2646, 506, '大貝殼裡的空氣鳳梨', () => (on('hermit_out_c4') || on('hermit_out_te') || zk.has('hermit')) ? '' : '石頭後面好像有誰躲著，叫牠出來看看');
  // ── 第七章第 28 天：撿二十三個貝殼（玩法照 ../_第七章27_28天_提案.md，2026-11-18 作者同意；對話泡泡照劇本第七章 1010～1013 行，一字不改）──
  // 茶語自己撿九個（兩個被螃蟹壓著，要先呼喚），晨、明、詩跟在後面也撿，一共十三個；數到二十二時，茶語身邊冒出一個粉紅色的貝殼，第二十三個一定是她撿的。
  let d28api = null;
  if (d28) {
    const { makeFollowers, NAMES } = await import('./c7_play.js');
    const sit = sitPieces.shi_sit_guitar; if (sit) sit.el.style.display = 'none'; if (shiZ) shiZ.hide();   // 這一天詩跟著茶語走，不坐在舞台邊
    const crew = await makeFollowers(api, { feet: M.feet_y, hFrac: api.META.npcs.find(n => n.id === 'shi').h, bounds: [M.walk[0], M.walk[1]], gap: 100 });
    const TEA_SHELLS = [{ k: 's1', n: 1, x: 402, y: 516 }, { k: 's2', n: 2, x: 1200, y: 510, crab: 'b' }, { k: 's3', n: 3, x: 700, y: 522 }, { k: 's4', n: 4, x: 1930, y: 514, crab: 'c' },
      { k: 's5', n: 5, x: 950, y: 514 }, { k: 's6', n: 7, x: 1500, y: 520 }, { k: 's7', n: 1, x: 2200, y: 522 }, { k: 's8', n: 3, x: 2450, y: 516 }, { k: 's9', n: 5, x: 2800, y: 524 }];
    const AUTO_MAX = 13, TOTAL = 23;
    const auto = () => Number(st.shells_c7_auto) || 0;
    const total = () => d28Picked.size + auto() + (on('c7s_pink') ? 1 : 0);
    const done = () => on('c7s_done');
    const questText = () => done() ? '沿沙灘走到出口' : total() >= TOTAL - 1 && !on('c7s_pink') ? '撿起那個粉紅色的貝殼' : `撿貝殼　${total()}／${TOTAL}`;
    const setQ = () => { const t = questText(); quest.hidden = !t; quest.textContent = t; pal.hidden = true; };
    // 跟著的三個人撿：茶語每撿一個，三個人跟著撿到「13 × 她撿的 ÷ 9」個，輪流撿（腳邊冒出一個小貝殼、彎腰、響一個音）
    let turn = 0;
    async function crewPick() {
      const want = Math.min(AUTO_MAX, Math.round(AUTO_MAX * d28Picked.size / TEA_SHELLS.length));
      while (auto() < want) {
        const p = crew.people[turn++ % crew.people.length]; save({ shells_c7_auto: String(auto() + 1) });
        const n = 1 + (auto() % 7); const el = await sprite(`../art/sprites/shell_${n}.webp`, 'shell flat'); place(el, p.x + p.face * 26, FEET + 4, 18, true);
        crew.bend(p); sfx.shell(n - 1, 0.3); note(p.x, FEET - SHI_HPX - 6, 0, 46); setTimeout(() => { el.classList.add('picked'); setTimeout(() => el.remove(), 500); }, 450);
        api.toast(`${NAMES[p.id]}也撿到一個　${total()}／${TOTAL}`); setQ(); await wait(520);
      }
      if (d28Picked.size >= TEA_SHELLS.length && !on('c7s_pink')) showPink();
    }
    // 第二十三個：粉紅色的貝殼（現有的第 6 號珊瑚粉貝殼），冒在茶語前面一點
    let pinkZ = null;
    async function showPink() {
      if (pinkZ) return; const x = clamp(state.x + state.face * 150, M.walk[0] + 80, M.walk[1] - 80), y = FEET + 8;
      const el = await sprite('../art/sprites/shell_6.webp', 'shell flat glow'); place(el, x, y, 24); el.classList.add('hopup'); sparkle(x, y - 12, 8, 0.8); setQ();
      pinkZ = zone('c7pink', '粉紅色的貝殼', { x: x - 34, w: 68, y: y - 40, h: 50 }, async z => { if (done()) return; await approach(x, 70); z.off(); sfx.shell(0); el.classList.add('ring'); sparkle(x, y - 12, 10);
        save({ c7s_pink: 'true' }); setQ(); setTimeout(() => { el.classList.add('picked'); setTimeout(() => el.remove(), 500); }, 520);
        lockOn(); openDialogue([['詩', '這個敲起來是 Do。'], ['晨', '這個是粉紅色的。'], ['明', '二十三個了。'], ['茶語', '全部帶回去，放在長桌上。']], [() => { save({ c7s_done: 'true', chapter7_shell_count: '23' }); CT.completeFreeInteraction(); lockOff(); setQ(); }]); }, { reach: 70 });
    }
    for (const s0 of TEA_SHELLS) {
      if (d28Picked.has(s0.k)) continue; const el = await sprite(`../art/sprites/shell_${s0.n}.webp`, 'shell flat'); const h = 24 - (s0.n - 1) * 1.6; const s = { ...s0, el, h };
      const crab = s0.crab && crabs.find(c => c.id === s0.crab); const covered = () => !!(crab && crab.guard);
      place(el, s.x, s.y, h); if (crab) art.insertBefore(el, crab.el);
      s.z = zone('c7shell_' + s.k, '撿起貝殼', { x: s.x - 30, w: 60, y: s.y - h - 10, h: h + 18 }, async z => { if (s.busy) return; s.busy = true; await approach(s.x, 70); z.off(); d28Picked.add(s.k); sfx.shell(s.n - 1); el.classList.add('ring'); sparkle(s.x, s.y - h / 2, 8); note(s.x, s.y - h - 8, 0, 54);
        save({ shells_c7: [...d28Picked].join(',') }); setQ(); api.toast(`撿到貝殼　${total()}／${TOTAL}`); setTimeout(() => { el.classList.add('picked'); setTimeout(() => el.remove(), 500); }, 520); const i = shells.indexOf(s); if (i >= 0) shells.splice(i, 1);
        await wait(700); crewPick(); }, { lane: 'beach', reach: 70 });
      s.uncover = () => { el.style.display = ''; el.classList.add('hopup', 'glow'); setTimeout(() => el.classList.remove('hopup'), 460); sparkle(s.x, s.y - h / 2, 5, 0.7); s.z.show(); };
      if (covered()) s.z.hide(); else el.classList.add('glow'); shells.push(s);
    }
    if (d28Picked.size >= TEA_SHELLS.length && !on('c7s_pink')) showPink();
    // 主線做完才能離開（比照第三～五章）
    { const exitHot = api.hot.find(h => h.id === 'exit'); if (exitHot) { const go = exitHot.fn || (() => api.runHot(exitHot)); let last = 0;
      exitHot.fn = () => { if (done()) return go(); const now = performance.now(); if (now - last > 1800) { last = now; api.toast('還不能離開：' + questText()); } window.dawnHill.exitBlocked = (window.dawnHill.exitBlocked || 0) + 1; }; } }
    setQ();
    d28api = { crew, tea: TEA_SHELLS, picked: d28Picked, total, auto, done, showPink, pinkZone: () => pinkZ };
  }
  window.dawnHill.beach = { d28: () => d28api, S, st, chapter, call, crabs, gulls, hermit, dol, shells, picked, floats, bulbs, sparks, prints, wave, coconuts, zones, sitPieces, shi, pose, stats, lane: () => lane, melodyState: () => melodyState, sitting: () => sitting, lightsOn: () => lightsOn, logs: () => logs, busy: () => hold > 0 || moving, toStage, offStage, toShore, offShore, strum };
  api.render();
}
