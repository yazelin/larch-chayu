import { createIslandAffinity } from './island_affinity.mjs';
import { paperize } from './paper.js';
import { entranceAction, isNearEntrance, isWalkable, landingVariables,
  memoryUpdates, orbitCompletion, pointInPolygon, dolphinActionVisible, boatActionVisible, diveActionVisible,
  shouldShowMemory7, shouldRunLanding, islandTimeFromVars, islandMapFor } from './island_rules.mjs';
import { createZukan, openPanel, closePanel, panelOpen, TOTAL as ZK_TOTAL } from './zukan.js';
import { createPlants, openPlantPanel, plantPanelOpen, playScene, sceneOpen, TREE_LINES, TREE_CG, TOTAL as PL_TOTAL } from './plants.js';

const Q = new URLSearchParams(location.search);
const CFG = await PageLoading.json('./island_config.json');
const W = CFG.size[0], H = CFG.size[1];
const world = document.getElementById('map-area'), map = document.getElementById('map');
const personRoot = document.getElementById('person'), zones = document.getElementById('zones');
const vehicle = document.getElementById('vehicle'), whale = document.getElementById('whale');
const memoryRoot = document.getElementById('memory'), dialog = document.getElementById('dialog');
const paint = document.getElementById('paint'), clouds = document.getElementById('clouds'), cloudWrap = document.getElementById('cloudwrap');
// 底圖是四周延伸畫好的整張：#map-area 仍是原圖那一塊（座標 0～1），延伸圖往外多出 ext.left／top／right／bottom 個原圖寬高
const EXT = CFG.ext;
// 繞島時畫面頂端留給介面的高度（地名、進度先收起來）：桌機只有一條小提示，44px；
// 手機直式（寬 ≤700，island.html 的窄版）Larch 常駐介面的紙卡橫跨上緣大半（含日期紙卡高 112），提示列改排在下緣，上面留 122px 給紙卡
const orbitUiTop = () => innerWidth <= 700 ? 122 : 44;
const CAMERA_EASE = 5;     // 鏡頭跟拍的平滑（每秒趨近的倍率）
document.getElementById('dusk-matrix').setAttribute('values', CFG.duskGrade.matrix.join(' '));
const inFrame = window.parent !== window;
const BR = window.IslandBridge;   // 章與步、同一張卡裡換頁時的變數（island_bridge.js；規格 ../_島段步驟清單.md）
const FLAT_OF = { '3': 'dawn', '4': 'beach', '5': 'cape' }, DONE_FLAG = { '3': 'ch3_done', '4': 'c4_done', '5': 'c5_done' }, AREA_NAME = { dawn: '朝霞丘', beach: '海灘', cape: '月光岬' };
const C7_PEOPLE = [['晨', 'dawn', 'ch7DoneC', 'c7_chen'], ['詩', 'beach', 'ch7DoneS', 'c7_shi'], ['明', 'cape', 'ch7DoneM', 'c7_ming']];
const QUERY_VARIABLES = ['chapter', 'day', 'time', 'gifts', 'gift_chen', 'gift_shi', 'gift_ming', 'memories',
  'island_landed', 'island_dolphin_done', 'island_boat_trip', 'memory1', 'memory6', 'memory7', 'dive_seen', 'coral_dive', 'dive_done',
  'trueEnding_island_step', 'dawn_visited', 'beach_visited', 'cape_visited', 'creatures', 'zukan_complete', 'plants'];
function queryVariables() {
  return Object.fromEntries(QUERY_VARIABLES.filter(k => Q.has(k)).map(k => [k, Q.get(k)]));
}
const state = { x: CFG.start.x, y: CFG.start.y, face: 1, target: null, keyX: 0, keyY: 0, pointerDir: 0,
  stage: 1, time: '早上', vars: queryVariables(), orbit: null, landing: false, dialogOpen: false,
  passed: new Set(), buttons: new Map(), ready: false, initApplied: !inFrame, mapReady: false,
  mapLoaded: false, mapGeneration: 0, mapPromise: Promise.resolve(false), readyWaiters: [],
  lastFrame: 0, sway: window.WalkSway.create() };

const freeAffinity = createIslandAffinity(BR, Q, () => state.vars, () => ctx().chapter);

function placeArt() {
  // 延伸圖與雲層照設定換算成 #map-area 的百分比；原圖那一塊剛好落在 #map-area 上
  Object.assign(map.style, { left: `${-EXT.left * 100}%`, top: `${-EXT.top * 100}%`,
    width: `${(1 + EXT.left + EXT.right) * 100}%`, height: `${(1 + EXT.top + EXT.bottom) * 100}%` });
  const [x0, y0, x1, y1] = CFG.cloudLayer.box, bw = x1 - x0, bh = y1 - y0;
  Object.assign(cloudWrap.style, { left: `${x0 * 100}%`, top: `${y0 * 100}%`, width: `${bw * 100}%`, height: `${bh * 100}%` });
  // 雲層裡那份夕照罩層對齊 #shade（#map-area 每邊外擴 120%）
  Object.assign(cloudWrap.querySelector('.shade').style, { left: `${(-1.2 - x0) / bw * 100}%`, top: `${(-1.2 - y0) / bh * 100}%`,
    width: `${3.4 / bw * 100}%`, height: `${3.4 / bh * 100}%` });
}
placeArt();
// 鏡頭：point（原圖座標）放到畫面中央，但不讓畫面露出延伸圖外面（四邊各自夾住）。topRoom＝畫面上方留給介面的高度，
// 夾的時候往下讓一點，紙片在最上緣也不會壓到提示列。
function cameraFor(point, topRoom = 0) {
  const mapWidth = world.offsetWidth, mapHeight = world.offsetHeight;
  const want = { x: (0.5 - point.x) * mapWidth, y: (0.5 - point.y) * mapHeight + topRoom / 2 };
  const minX = innerWidth / 2 - mapWidth / 2 - EXT.right * mapWidth, maxX = mapWidth / 2 + EXT.left * mapWidth - innerWidth / 2;
  const minY = innerHeight / 2 - mapHeight / 2 - EXT.bottom * mapHeight, maxY = mapHeight / 2 + EXT.top * mapHeight - innerHeight / 2;
  return { x: Math.max(minX, Math.min(maxX, want.x)), y: Math.max(minY, Math.min(maxY, want.y)), mapWidth, mapHeight };
}
function setCamera(x, y) {
  world.style.setProperty('--camera-x', `${x}px`);
  world.style.setProperty('--camera-y', `${y}px`);
}
// 鏡頭平滑跟著目標走（出發、繞完回來都不會瞬間跳）；snap＝直接到位（測試、載入第一格）
function updateCamera(point, dt, snap = false, topRoom = 0) {
  const target = cameraFor(point, topRoom);
  if (snap || !state.cam || Q.has('fast')) state.cam = { x: target.x, y: target.y };
  else {
    const k = 1 - Math.exp(-CAMERA_EASE * dt);
    state.cam.x += (target.x - state.cam.x) * k; state.cam.y += (target.y - state.cam.y) * k;
  }
  setCamera(state.cam.x, state.cam.y);
  return target;
}

if (Q.get('debug') === '1') document.body.classList.add('debug');

function post(message) { if (inFrame && !(BR && BR.done && message.type === 'larch:set')) window.parent.postMessage(message, '*'); }
function updateReady() {
  state.ready = state.initApplied && state.mapReady;
  document.body.dataset.ready = state.ready && !PageLoading.loading ? '1' : '0';
  if (state.ready) {
    for (const resolve of state.readyWaiters.splice(0)) resolve();
  }
}
function waitUntilReady() {
  if (state.ready) return Promise.resolve();
  return new Promise(resolve => state.readyWaiters.push(resolve));
}
function loadMap(src) {
  const generation = ++state.mapGeneration;
  state.mapReady = false;
  updateReady();
  let decoded;
  if (typeof map.decode === 'function') {
    map.src = src;
    decoded = PageLoading.image(map);
  } else {
    decoded = new Promise((resolve, reject) => {
      map.addEventListener('load', resolve, { once: true });
      map.addEventListener('error', () => reject(new Error(`地圖載入失敗：${src}`)), { once: true });
      map.src = src;
    });
  }
  state.mapPromise = decoded.then(() => {
    if (generation === state.mapGeneration) {
      state.mapReady = true;
      updateReady();
    }
    return generation === state.mapGeneration;
  }, error => {
    if (generation === state.mapGeneration) {
      state.mapReady = false;
      console.error(error);
      updateReady();
    }
    return false;
  });
  return state.mapPromise;
}
function setVars(values) {
  Object.assign(state.vars, values);
  if (!inFrame) {
    const url = new URL(location.href);
    for (const [key, value] of Object.entries(values)) url.searchParams.set(key, String(value));
    history.replaceState(null, '', url);
  }
  if (BR) BR.note(values);
  post({ type: 'larch:set', variables: values });
}
// 嵌在 Larch 時這張卡現在的章、模式、步（步驟變數在 state.vars 裡）
function ctx() { return BR ? BR.context(state.vars) : { chapter: String(Q.get('chapter') || 'true'), mode: 'main', step: 1, stepVar: null }; }
function c7Done(row) { const c = ctx(); return truth(state.vars[row[2]]) || state.vars[row[3]] === 'true' || (c.step >= 4 && state.vars.island_next_scene === row[1]); }
// 嵌在 Larch 時走到家門口：這一章該做的做完了才送完成（回工作室、接下一張卡）。回傳還差什麼；空字串＝可以回家
function homeBlocked() {
  const c = ctx();
  if (c.mode === 'visit') return '';   // 自由逛：隨時可以回家
  if (c.chapter === '7' && c.mode === 'review') return c.step >= 4 ? '' : '今天還沒有陪誰';
  if (c.chapter === 'true') { const n = Math.max(Number(state.vars.gifts) || 0, ['gift_chen', 'gift_shi', 'gift_ming'].filter(k => truth(state.vars[k])).length); return n >= 3 ? '' : `三樣禮物還差 ${3 - n} 樣`; }
  if (DONE_FLAG[c.chapter]) return truth(state.vars[DONE_FLAG[c.chapter]]) ? '' : `先去${AREA_NAME[FLAT_OF[c.chapter]]}`;
  return '';
}
function goHome() {
  const no = homeBlocked(); if (no) { toast('還不能回家：' + no); return; }
  const c = ctx();
  if (c.chapter === '7' && c.mode === 'review') BR.setStep(c.stepVar, 1);   // 三天共用同一張卡：明天從第 1 步開始
  else if (c.chapter === 'true') BR.setStep(c.stepVar, 7);
  complete('go_home', { scene: 'home' });
}
function complete(result, payload = {}) {
  const p = Object.assign({ stage: state.stage }, payload);
  if (inFrame && BR) BR.complete(result, p); else post({ type: 'larch:complete', result, payload: p });   // 經過橋接：先存完再送完成
}
function truth(v) { return v === true || v === 1 || v === '1' || v === 'true'; }
function stageFromVars(vars) {
  if (Q.has('stage')) return Math.max(1, Math.min(5, Number(Q.get('stage')) || 1));
  if (vars.islandStage) return Math.max(1, Math.min(5, Number(vars.islandStage) || 1));
  const c = String(vars.chapter ?? Q.get('chapter') ?? '1').toLowerCase();
  if (c === 'true' || c === 'trueending' || c === '真結局') return 5;
  const n = Number(c);
  if (n >= 7) return 4;
  if (n >= 5) return 4;
  if (n === 4) return 3;
  if (n === 3) return 2;
  return 1;
}
function applyVariables(vars = {}) {
  state.vars = Object.assign({}, state.vars, vars);
  const nextStage = stageFromVars(state.vars);
  const nextTime = islandTimeFromVars(state.vars, nextStage, Q);
  const changed = nextStage !== state.stage || nextTime !== state.time;
  state.stage = nextStage;
  state.time = nextTime;
  if (changed || !state.mapLoaded) {
    const src = new URL(islandMapFor(state.stage, state.time, CFG.maps), location.href).href;
    state.mapLoaded = true;
    loadMap(src);
    world.classList.toggle('dusk', state.time === '黃昏' && state.stage !== 5);
    world.classList.toggle('night', state.time === '月夜');
    world.classList.toggle('dark', state.time === '天黑');
    world.classList.toggle('dawn', state.time === '清晨');
    paint.style.filter = clouds.style.filter = state.time === '清晨' ? 'brightness(.92) saturate(.86)' : '';
    // 雲層：真結局黃昏、天剛暗用各自的雲；其餘用白天的雲，再套跟底圖一樣的濾鏡
    const cloudKey = state.stage === 5 && state.time === '黃昏' ? 'dusk' : state.stage === 5 && state.time === '天剛暗' ? 'night' : 'day';
    clouds.src = new URL(CFG.cloudLayer.maps[cloudKey], location.href).href;
    cloudWrap.style.webkitMaskImage = cloudWrap.style.maskImage = `url("${clouds.src}")`;
    world.style.setProperty('--dusk-saturate', String(CFG.duskGrade.saturate[state.stage] ?? 1.1));
    world.style.setProperty('--dusk-contrast', String(CFG.duskGrade.contrast));
    document.getElementById('label').textContent = `繪本小島　第 ${state.stage} 階段・${state.time}`;
    updateEntrances();
    updateMemory();
  }
  document.getElementById('progress').textContent = state.stage === 5
    ? `禮物 ${Number(state.vars.gifts || 0)}／3　回憶 ${Number(state.vars.memories || 0)}／7`
    : `第 ${state.stage} 階段`;
  // 晚到的 larch:init（存檔裡已撿過）不會換階段，上面不會重畫；這裡每次都把已撿過的回憶捲軸拿掉（作者 2026-11-22：碼頭旁的卷撿過還在、點不起來）
  if (truth(state.vars.memory1)) document.getElementById('memory1-scroll')?.remove();
  if (truth(state.vars.memory7)) document.getElementById('memory7-scroll')?.remove();
  updateZukanBtn();
  updateNote();
  updateActions();
  return state.mapPromise;
}

async function makePaperPerson(src, edge = 8) {
  try {
    const p = await paperize(src, { edge, jitter: 2, texture: 0.07 });
    const img = document.createElement('img'); img.className = 'paper-person'; img.src = p.src; img.alt = '';
    img.style.height = '10%'; personRoot.append(img); return img;
  } catch (err) { console.error('紙人素材載入失敗', err); return null; }
}
const [tea, shi] = await Promise.all([makePaperPerson(CFG.sprites.tea), makePaperPerson(CFG.sprites.shi, 7)]);
if (shi) { shi.style.display = 'none'; shi.style.height = '8%'; }
if (tea) { tea.style.zIndex = '2'; }

function walkable(p) { return isWalkable(p, state.stage, CFG); }
function distance(a, b) { return Math.hypot((a.x - b.x) * W, (a.y - b.y) * H); }
function entrances() { return CFG.entrances.filter(e => e.stage <= state.stage); }
function updateEntrances() {
  zones.replaceChildren(); state.buttons.clear();
  for (const e of entrances()) {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'entrance';
    b.dataset.id = e.id; b.dataset.name = e.name; b.setAttribute('aria-label', e.name);
    b.style.left = `${e.x * 100}%`; b.style.top = `${e.y * 100}%`;
    b.addEventListener('pointerdown', ev => ev.stopPropagation());
    b.addEventListener('click', ev => { ev.stopPropagation(); interact(e.id); });
    zones.append(b); state.buttons.set(e.id, b);
  }
  if (state.stage === 5) {
    const m = CFG.memory1;
    if (!truth(state.vars.memory1)) {
      const scroll = document.createElement('img'); scroll.className = 'memory'; scroll.src = CFG.sprites.scroll;
      scroll.alt = '第一章回憶捲軸'; scroll.id = 'memory1-scroll'; scroll.style.left = `${m.x * 100}%`; scroll.style.top = `${m.y * 100}%`;
      scroll.addEventListener('pointerdown', ev => ev.stopPropagation());
      scroll.addEventListener('click', ev => { ev.stopPropagation(); collectMemory1(); });
      memoryRoot.append(scroll);
    }
    if (shouldShowMemory7(state.stage, state.vars)) addMemory7();
  }
  updateActions();
}
function addMemory7() {
  if (document.getElementById('memory7-scroll') || truth(state.vars.memory7)) return;
  const m = CFG.memory7;
  const scroll = document.createElement('img'); scroll.className = 'memory'; scroll.src = CFG.sprites.scroll;
  scroll.alt = '第七章回憶捲軸'; scroll.id = 'memory7-scroll'; scroll.style.left = `${m.x * 100}%`; scroll.style.top = `${m.y * 100}%`;
  scroll.addEventListener('pointerdown', ev => ev.stopPropagation());
  scroll.addEventListener('click', ev => { ev.stopPropagation(); collectMemory7(); });
  memoryRoot.append(scroll);
}
function updateMemory() {
  const old = document.getElementById('memory1-scroll');
  if (old) old.remove();
  const old7 = document.getElementById('memory7-scroll');
  if (old7) old7.remove();
  if (zones.children.length) updateEntrances();
}
function updateActions() {
  const beach = CFG.entrances.find(entrance => entrance.id === 'beach');
  const dock = CFG.entrances.find(entrance => entrance.id === 'dock');
  const chapter = state.vars.chapter ?? Q.get('chapter') ?? '4';
  const dBtn = document.getElementById('dolphin');
  const bBtn = document.getElementById('boat');
  if (!dBtn || !bBtn) return;  // 頁面被外層換掉內容時（例如測試把整頁換成轉接框）不要拋錯
  dBtn.hidden = !dolphinActionVisible({ stage: state.stage, chapter, position: state, beach,
    alreadyRidden: state.vars.island_dolphin_done, width: W, height: H });
  bBtn.hidden = !boatActionVisible({ stage: state.stage, position: state, dock,
    alreadyRidden: state.vars.island_boat_trip, width: W, height: H });
  const vBtn = document.getElementById('dive');
  if (vBtn) vBtn.hidden = !!state.orbit || !diveActionVisible({ stage: state.stage, position: state, dock, width: W, height: H });
}
function updateNearby() {
  let nearest = null;
  for (const e of entrances()) {
    const d = distance(state, e);
    const b = state.buttons.get(e.id);
    const close = d <= e.radius * H + 18;
    b?.classList.toggle('nearby', close);
    if (close && (!nearest || d < nearest.d)) nearest = { id: e.id, d };
  }
  if (state.stage === 5 && !truth(state.vars.memory1)) {
    const d = distance(state, CFG.memory1);
    if (d < 86 && (!nearest || d < nearest.d)) nearest = { id: 'memory1', d };
  }
  if (shouldShowMemory7(state.stage, state.vars)) {
    const d = distance(state, CFG.memory7);
    if (d < 86 && (!nearest || d < nearest.d)) nearest = { id: 'memory7', d };
  }
  if (tea) tea.style.filter = state.orbit ? 'drop-shadow(0 3px 4px #40324688)' : 'drop-shadow(0 3px 3px #40324688)';
  updateActions();
  return nearest?.id || null;
}
function renderPerson() {
  if (tea) {
    tea.style.left = `${state.x * 100}%`; tea.style.top = `${state.y * 100}%`;
    // 走路晃動（studio_web/walk_sway.js，跟工作室同一組）：腳底為軸，上彈＋前後傾；停下來收回
    const sw = state.sway, lift = sw.lift * (tea.offsetHeight || 0);
    tea.style.transform = `translate(-50%,-100%) translateY(${(-lift).toFixed(2)}px) rotate(${(sw.tilt * state.face).toFixed(2)}deg) scaleX(${state.face})`;
    tea.style.display = state.landing || state.orbit ? 'none' : 'block';
  }
  if (shi) shi.style.display = 'none';
}
// 紙片大小：設定檔 orbitPaper 的高（原圖高的比例）與寬高比，換成 #map-area 的百分比；繞島全程固定
function paperBox(kind) {
  const paper = CFG.orbitPaper[kind];
  return { width: paper.height * paper.aspect * H / W, height: paper.height };
}
// 鯨魚：三張動作紙片輪流（噴水 → 水霧 → 翹尾巴潛下去 → 不見一下），寬度以噴水那張的鯨魚身體為準
const WHALE_STEPS = [[0, 1.6], [1, 1.0], [2, 1.4], [-1, 1.6]];
let whaleImgs = [];
function buildWhale() {
  const w = CFG.whale, base = CFG.sprites.whale[1].width;
  Object.assign(whale.style, { left: `${(w.x - w.width / 2) * 100}%`, top: `${w.y * 100}%`,
    width: `${w.width * 100}%`, height: '0' });
  whale.replaceChildren(...CFG.sprites.whale.map((frame, i) => {
    const img = document.createElement('img'); img.src = frame.src; img.alt = '';
    img.style.width = `${frame.width / base * 100}%`; img.dataset.step = String(i); return img;
  }));
  whaleImgs = [...whale.children];
}
function renderWhale(now) {
  const on = state.orbit?.kind === 'boat' && !state.landing;
  whale.classList.toggle('on', on);
  if (!on) return;
  const cycle = WHALE_STEPS.reduce((a, [, d]) => a + d, 0);
  let t = ((now / 1000) % cycle), step = -1;
  for (const [i, d] of WHALE_STEPS) { if (t < d) { step = i; break; } t -= d; }
  whaleImgs.forEach((img, i) => img.classList.toggle('on', i === step));
}
function renderVehicle() {
  const ride = state.orbit;
  if (!ride) { vehicle.classList.remove('on'); vehicle.dataset.kind = ''; return; }
  vehicle.style.left = `${state.x * 100}%`; vehicle.style.top = `${state.y * 100}%`;
  vehicle.style.transform = `translate(-50%,-55%) scaleX(${ride.face})`;
  const box = paperBox(ride.kind);
  vehicle.style.width = `${box.width * 100}%`;
  vehicle.style.height = `${box.height * 100}%`;
  if (vehicle.dataset.kind !== ride.kind) {
    vehicle.dataset.kind = ride.kind;
    vehicle.innerHTML = ride.kind === 'dolphin'
      ? `<img class="vehicle-art" src="${CFG.sprites.dolphinRide}" alt="茶語和詩坐在海豚上">`
      : `<img class="vehicle-art" src="${CFG.sprites.boat}" alt="茶語划著小船">`;
  }
  vehicle.classList.add('on');
}
// 鏡頭看哪裡：平常就是紙片；小船經過鯨魚附近時往鯨魚那邊偏，偏移量限制在小船仍整張留在畫面內（直式手機畫面窄，不偏就看不到整隻鯨魚）
function lookAt() {
  const p = { x: state.x, y: state.y };
  if (state.orbit?.kind !== 'boat' || state.landing) return p;
  const mw = world.offsetWidth, mh = world.offsetHeight, box = paperBox('boat');
  const dx = (CFG.whale.x - p.x) * mw, dy = (CFG.whale.y - CFG.whale.width * W / H * 0.5 - p.y) * mh;   // 鯨魚身體中心（含水柱一半）
  const near = Math.max(0, Math.min(1, 1 - (Math.hypot(dx / mw * W, dy / mh * H) - 320) / 380));
  if (!near) return p;
  const maxX = Math.max(0, innerWidth / 2 - box.width * mw / 2 - 16), maxY = Math.max(0, (innerHeight - orbitUiTop()) / 2 - box.height * mh / 2 - 16);
  const sx = Math.max(-maxX, Math.min(maxX, dx * 0.6 * near)), sy = Math.max(-maxY, Math.min(maxY, dy * 0.6 * near));
  return { x: p.x + sx / mw, y: p.y + sy / mh };
}
function render(dt = 0, snap = false) {
  document.body.classList.toggle('orbiting', !!state.orbit && !state.landing);
  if (state.orbit || state.landing || state.landingWalk) updateCamera(lookAt(), dt, snap, state.orbit && !state.landing ? orbitUiTop() : 0);
  else updateCamera({ x: 0.5, y: 0.5 }, dt, snap);
  renderPerson(); renderVehicle();
  const near = updateNearby();
  for (const m of document.querySelectorAll('.memory')) {
    const id = m.id === 'memory7-scroll' ? 'memory7' : 'memory1';
    const pos = id === 'memory7' ? CFG.memory7 : CFG.memory1;
    m.classList.toggle('nearby', distance(state, pos) < 82);
  }
}

function toast(text) {
  if (state.orbit && !state.landing) {   // 繞島時畫面上方只留一條小提示，經過入口等提示換進那一條，不另外冒泡泡壓到紙片
    const hint = document.getElementById('hint'); clearTimeout(hint._timer);
    hint.textContent = text; hint._timer = setTimeout(() => { if (state.orbit) hint.textContent = state.orbit.hint; }, 1900); return;
  }
  let el = document.querySelector('.toast');
  if (!el) { el = document.createElement('div'); el.className = 'toast'; document.body.append(el); }
  el.textContent = text; el.classList.add('on');
  clearTimeout(el._timer); el._timer = setTimeout(() => el.classList.remove('on'), 1900);
}
function showScroll(title, text) {
  document.getElementById('dialog-title').textContent = title;
  document.getElementById('dialog-text').textContent = text;
  dialog.classList.add('on'); state.dialogOpen = true;
}
function closeScroll() { dialog.classList.remove('on'); state.dialogOpen = false; }
dialog.addEventListener('click', closeScroll);
dialog.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') closeScroll(); });
function collectMemory1() {
  if (!state.ready) return false;
  if (distance(state, CFG.memory1) > 86) { toast('再靠近一點'); return; }
  if (truth(state.vars.memory1)) { document.getElementById('memory1-scroll')?.remove(); return; }
  const updates = memoryUpdates(state.vars, 'memory1');
  const memories = Number(updates.memories);
  setVars(updates);
  document.getElementById('memory1-scroll')?.remove();
  document.getElementById('progress').textContent = `禮物 ${Number(state.vars.gifts || 0)}／3　回憶 ${memories}／7`;
  showScroll(CFG.memory1.speaker, CFG.memory1.text);
}
function collectMemory7() {
  if (!state.ready) return false;
  const p = CFG.memory7;
  if (distance(state, p) > 86) { toast('再靠近一點'); return; }
  if (truth(state.vars.memory7)) { document.getElementById('memory7-scroll')?.remove(); return; }
  const updates = memoryUpdates(state.vars, 'memory7');
  const memories = Number(updates.memories);
  setVars(updates);
  document.getElementById('memory7-scroll')?.remove();
  document.getElementById('progress').textContent = `禮物 ${Number(state.vars.gifts || 0)}／3　回憶 ${memories}／7`;
  showScroll('第七章', '彩色守護者（晨）、時間守護者（明）、說唱守護者（詩）「我留下來，是因為妳。」');
}

function navigateFlat(scene, area, extra = {}) {
  const url = new URL('./flat.html', location.href);
  url.searchParams.set('scene', scene);
  url.searchParams.set('islandArea', area);
  const back = new URL(location.href); for (const k of ['from', 'at', 'ride', 'arrival', 'diveDone']) back.searchParams.delete(k);
  url.searchParams.set('back', back.href);
  for (const [k, v] of Object.entries(extra)) url.searchParams.set(k, v);
  // 自由逛時各區是那一章主線做完之後的樣子（朝霞丘第三章、海灘第四章、月光岬第五章），可以接小委託
  const chapter = ctx().mode === 'visit' ? ({ dawn: '3', beach: '4', cape: '5' })[scene] : (Q.get('chapter') || state.vars.chapter);
  if (chapter) url.searchParams.set('chapter', chapter);
  if (ctx().mode === 'visit') {
    url.searchParams.set('visit', '1');
    url.searchParams.set('visitChapter', ctx().chapter);
  }
  if (state.time) url.searchParams.set('time', state.time);
  for (const key of QUERY_VARIABLES) {
    if (state.vars[key] !== undefined) url.searchParams.set(key, String(state.vars[key]));
  }
  if (chapter) url.searchParams.set('chapter', chapter);   // 上面那圈會把變數裡的 chapter 蓋上來；以這裡算的為準
  BR.carry(url);
  location.href = url.href;
}
function navigateHome() {
  const url = new URL('../../../studio_web/index.html', location.href);
  url.searchParams.set('fromIsland', location.href);
  url.searchParams.set('chapter', Q.get('chapter') || ctx().chapter);
  const day = state.vars.day ?? Q.get('day');
  if (day) url.searchParams.set('day', day);
  for (const key of ['mock', 'debug']) if (Q.has(key)) url.searchParams.set(key, Q.get(key));
  location.href = url.href;
}
function enterArea(id) {
  const e = CFG.entrances.find(x => x.id === id);
  // 嵌在 Larch 時進入口不送完成：長畫在同一張卡裡換頁，做完該做的事、走到家門口才送（2026-11-18；以前一進入口這張卡就結束）
  const action = entranceAction(e, state.stage, false);
  if (!action) return false;
  if (!isNearEntrance(state, e, W, H)) { toast('走近入口後再互動'); return false; }
  const destination = action.scene;
  if (!inFrame) setVars(action.variables);   // 嵌在 Larch 時 island_next_scene 只在選了「今天陪你」才寫（長畫那邊寫）
  if (action.kind === 'flat') {
    navigateFlat(action.scene, action.area);
  } else if (action.kind === 'home') {
    if (inFrame) goHome(); else navigateHome();
  } else if (action.kind === 'dock') {
    showScroll('北邊碼頭', '靠近小船，按「坐船繞島看鯨魚」出海。');
  } else {
    toast(`入口：${e.name}`);
  }
  return true;
}
function interact(id) {
  if (!state.ready || state.dialogOpen || state.orbit || state.landing || state.landingWalk) return false;
  if (id === 'memory1') return collectMemory1();
  if (id === 'memory7') return collectMemory7();
  return enterArea(id);
}

function polyline(points) {
  const lengths = []; let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const len = Math.hypot((b[0] - a[0]) * W, (b[1] - a[1]) * H);
    lengths.push(len); total += len;
  }
  return { points, lengths, total };
}
function pointAlong(line, d) {
  d = Math.max(0, Math.min(line.total, d));
  for (let i = 0; i < line.lengths.length; i++) {
    const len = line.lengths[i];
    if (d <= len || i === line.lengths.length - 1) {
      const a = line.points[i], b = line.points[i + 1], t = len ? Math.min(1, d / len) : 0;
      return { x: a[0] + (b[0] - a[0]) * t, y: a[1] + (b[1] - a[1]) * t };
    }
    d -= len;
  }
  return { x: line.points[0][0], y: line.points[0][1] };
}
function nearestAlong(line, point) {
  let best = { d: Infinity, along: 0 }, along = 0;
  for (let i = 0; i < line.lengths.length; i++) {
    const a = line.points[i], b = line.points[i + 1];
    const ax = a[0] * W, ay = a[1] * H, dx = (b[0] - a[0]) * W, dy = (b[1] - a[1]) * H, len2 = dx * dx + dy * dy;
    const px = point.x * W, py = point.y * H;
    const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (len2 || 1)));
    const d = Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
    if (d < best.d) best = { d, along: along + line.lengths[i] * t };
    along += line.lengths[i];
  }
  return best.along;
}
// 每種載具一趟三段：出發段（碼頭／海灘 → 環線）、繞環線一整圈、出發段倒回去。環線是貼著島、不碰島與小島的閉合海路
// （真結局/map2d/side/art/island_ext_build.py route 用紙片剪影算的）；雲在紙片上面一層，紙片從雲底下經過。
const TRIPS = Object.fromEntries(Object.keys(CFG.orbit).map(kind => {
  const loop = polyline(CFG.orbit[kind]), leg = polyline(CFG.orbitLeg[kind]);
  const join = CFG.orbitLeg[kind].at(-1);
  return [kind, { loop, leg, joinAlong: nearestAlong(loop, { x: join[0], y: join[1] }), total: leg.total * 2 + loop.total }];
}));
// 一趟的第 s px 在哪裡，以及在環線的第幾成（不在環線上時是 null）
function tripPoint(kind, s) {
  const T = TRIPS[kind];
  if (s < T.leg.total) return { ...pointAlong(T.leg, s), loop: null };
  if (s < T.leg.total + T.loop.total) {
    const along = (T.joinAlong + s - T.leg.total) % T.loop.total;
    return { ...pointAlong(T.loop, along), loop: along / T.loop.total };
  }
  return { ...pointAlong(T.leg, T.total - s), loop: null };
}
function routePoint(fraction, kind = 'dolphin') { return pointAlong(TRIPS[kind].loop, fraction * TRIPS[kind].loop.total); }
function faceAt(kind, s) {
  const a = tripPoint(kind, Math.max(0, s - 6)), b = tripPoint(kind, Math.min(TRIPS[kind].total, s + 6));
  return Math.abs(b.x - a.x) * W > 0.5 ? (b.x > a.x ? 1 : -1) : null;
}
function startOrbit(kind) {
  if (!state.ready || state.orbit || state.landing || state.landingWalk) return false;
  if (kind === 'dolphin' && state.stage !== 3) { toast('第四章的海豚繞島'); return false; }
  if (kind === 'boat' && state.stage !== 5) { toast('碼頭還沒有開放'); return false; }
  if (kind === 'dolphin' && !inFrame) {
    const back = Q.get('back');
    state.returnAfterOrbit = back || null;
  }
  // 茶語站的位置（回來後放回這裡）；載具從出發段的起點出發：小船停在碼頭邊，海豚在海灘前的水裡
  const start = { x: state.x, y: state.y };
  const T = TRIPS[kind];
  state.orbit = { kind, s: 0, lastLoop: null, face: faceAt(kind, 0) || 1, start,
    speed: T.total / (Q.has('fast') ? 3.2 : 32) };
  const p = tripPoint(kind, 0); state.x = p.x; state.y = p.y;
  state.passed = new Set(); state.keyX = state.keyY = state.pointerDir = 0; state.target = null;
  state.orbit.hint = document.getElementById('hint').textContent = kind === 'dolphin' ? '茶語和詩坐上海豚，沿海繞島一圈' : '小船沿海繞島，遠處鯨魚正在噴水';
  renderVehicle(); toast(kind === 'dolphin' ? '出發繞島' : '小船離開碼頭');
  return true;
}
function crossPasses(previous, current) {
  if (previous === null || current === null) return;
  const wrapped = current < previous;
  for (const pass of CFG.orbitPasses[state.orbit.kind]) {
    if (state.passed.has(pass.id)) continue;
    const crossed = wrapped ? pass.at > previous || pass.at <= current : pass.at > previous && pass.at <= current;
    if (!crossed) continue;
    const entrance = CFG.entrances.find(e => e.id === pass.id);
    if (entrance && entrance.stage <= state.stage) {
      state.passed.add(pass.id);
      const b = state.buttons.get(pass.id);
      if (b) {
        b.classList.add('passing');
        setTimeout(() => b.classList.remove('passing'), 900);
      }
      toast(`${entrance.name}掠過海面`);
    }
  }
}
function finishOrbit() {
  const ride = state.orbit; if (!ride) return;
  // 一整圈的環線一定經過每個入口；用測試捷徑跳過時也補齊
  for (const pass of CFG.orbitPasses[ride.kind]) {
    const e = CFG.entrances.find(x => x.id === pass.id);
    if (e && e.stage <= state.stage) state.passed.add(pass.id);
  }
  state.x = ride.start.x; state.y = ride.start.y; state.orbit = null;
  vehicle.classList.remove('on'); clearTimeout(document.getElementById('hint')._timer);
  document.getElementById('hint').textContent = '方向鍵移動，點地走近；靠近入口後按互動';
  const completion = orbitCompletion(ride.kind, [...state.passed]);
  setVars(completion.variables);
  if (ride.kind === 'boat') addMemory7();
  else if (ride.kind === 'dolphin') freeAffinity.award('shi');
  zk.saw(ride.kind === 'boat' ? 'whale' : 'dolphin'); updateZukanBtn();   // 坐船繞島看到遠海的鯨魚；騎海豚繞島也算遇到海豚
  // 嵌在 Larch 時繞完不送完成（這張卡還沒演完：海豚要回海灘、小船回碼頭繼續逛）
  if (!inFrame) complete(completion.result, completion.payload);
  toast(ride.kind === 'dolphin' ? '繞完一圈，回到海灘' : '繞完一圈，小船回到碼頭');
  render();
  const back = state.returnAfterOrbit || Q.get('back');
  if (back) setTimeout(() => { location.href = back; }, 700);
  else if (!inFrame && ride.kind === 'dolphin' && Q.get('stay') !== '1') {
    setTimeout(() => navigateFlat('beach', 'beach'), 700);
  }
}

function setPosition(p) {
  if (!state.ready || !p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return false;
  if (!walkable(p)) return false;
  state.x = p.x; state.y = p.y; state.target = null; render(); return true;
}
function moveTarget(p) {
  if (!state.ready) return false;
  if (!walkable(p)) { toast('沿島上的草地走'); return false; }
  state.target = { x: p.x, y: p.y }; return true;
}
function moveFrame(dt) {
  if (state.dialogOpen || state.orbit || state.landing) return;
  let dx = 0, dy = 0;
  if (state.target) {
    const ax = (state.target.x - state.x) * W, ay = (state.target.y - state.y) * H;
    const d = Math.hypot(ax, ay);
    if (d < 4) state.target = null;
    else { dx = ax / d; dy = ay / d; }
  } else {
    dx = state.keyX || state.pointerDir;
    dy = state.keyY;
  }
  const directionLength = Math.hypot(dx, dy);
  if (directionLength) { dx /= directionLength; dy /= directionLength; }
  const speed = Number(Q.get('speed')) || 390;
  if (dx || dy) {
    const next = { x: state.x + dx * speed * dt / W, y: state.y + dy * speed * dt / H };
    if (walkable(next)) { state.x = next.x; state.y = next.y; }
    else if (dx && walkable({ x: next.x, y: state.y })) state.x = next.x;
    else if (dy && walkable({ x: state.x, y: next.y })) state.y = next.y;
    state.face = dx < 0 ? -1 : dx > 0 ? 1 : state.face;
  }
}
function orbitFrame(dt) {
  const ride = state.orbit; if (!ride || ride.frozen) return;
  const T = TRIPS[ride.kind];
  ride.s = Math.min(T.total, ride.s + ride.speed * dt);
  const p = tripPoint(ride.kind, ride.s);
  crossPasses(ride.lastLoop, p.loop); ride.lastLoop = p.loop;
  state.x = p.x; state.y = p.y;
  ride.face = faceAt(ride.kind, ride.s) || ride.face;
  if (ride.s >= T.total) finishOrbit();
}
// 真結局上岸：小船從北邊海上開進來，沿出發段倒著開到碼頭邊，茶語再從碼頭走上岸
function landingAnimation() {
  if (ctx().mode === 'visit' || !shouldRunLanding(state.stage, state.vars, Q.get('arrival'))) return;
  state.landing = true;
  const leg = CFG.orbitLeg.boat, path = polyline([CFG.landing.from, ...[...leg].reverse()]);
  const dock = CFG.landing.dock, shore = CFG.landing.shore;
  const ship = { kind: 'boat', face: 1, start: { x: dock[0], y: dock[1] } };
  state.orbit = ship;
  const duration = Q.has('fast') ? 1.3 : 6;
  let t = 0;
  const place = e => { const p = pointAlong(path, path.total * e); state.x = p.x; state.y = p.y;
    const q = pointAlong(path, Math.min(path.total, path.total * e + 6)); if (Math.abs(q.x - p.x) * W > 0.5) ship.face = q.x > p.x ? 1 : -1; };
  place(0); renderVehicle();
  const go = dt => {
    t += dt / duration; const e = Math.min(1, t), smooth = 1 - (1 - e) * (1 - e);   // 進港放慢
    place(smooth);
    if (e >= 1) {
      state.orbit = null; vehicle.classList.remove('on'); state.x = dock[0]; state.y = dock[1]; state.landing = false;
      const from = { x: dock[0], y: dock[1] }, to = { x: shore[0], y: shore[1] }; let walkT = 0;
      const walk = d => { walkT += d / 1.1; const q = Math.min(1, walkT); state.x = from.x + (to.x - from.x) * q; state.y = from.y + (to.y - from.y) * q;
        if (q >= 1) { state.landing = false; setVars(landingVariables()); toast('茶語上岸了'); render(); return true; } return false; };
      state.landingWalk = walk; return true;
    }
    return false;
  };
  state.landingTick = go;
}

function frame(now) {
  const dt = Math.min((now - state.lastFrame) / 1000 || 0, 0.05); state.lastFrame = now;
  if (!state.ready) {
    requestAnimationFrame(frame);
    return;
  }
  if (PageLoading.loading) { render(0); requestAnimationFrame(frame); return; }
  const walkFrom = { x: state.x, y: state.y };
  if (state.landingTick) {
    if (state.landingTick(dt)) {
      state.landingTick = null;
    }
  } else if (state.landingWalk) {
    if (state.landingWalk(dt)) state.landingWalk = null;
  } else if (state.orbit) orbitFrame(dt);
  else moveFrame(dt);
  window.WalkSway.step(state.sway, dt, !state.orbit && (state.x !== walkFrom.x || state.y !== walkFrom.y));
  render(dt); renderWhale(now); requestAnimationFrame(frame);
}

function pointFromEvent(e) {
  const r = world.getBoundingClientRect();
  return { x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
    y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)) };
}
world.addEventListener('pointerdown', e => {
  if (e.target.closest('.entrance,.memory,.action,.move')) return;
  state.pointer = { x: e.clientX, y: e.clientY, held: false };
  state.pointer.timer = setTimeout(() => { if (state.pointer) { state.pointer.held = true; state.pointerDir = e.clientX < innerWidth / 2 ? -1 : 1; state.target = null; } }, 190);
});
world.addEventListener('pointermove', e => { if (state.pointer?.held) state.pointerDir = e.clientX < innerWidth / 2 ? -1 : 1; });
function pointerUp(e) {
  if (!state.pointer) return;
  clearTimeout(state.pointer.timer);
  const moved = Math.hypot(e.clientX - state.pointer.x, e.clientY - state.pointer.y);
  if (!state.pointer.held && moved < 14) moveTarget(pointFromEvent(e));
  state.pointer = null; state.pointerDir = 0;
}
world.addEventListener('pointerup', pointerUp); world.addEventListener('pointercancel', pointerUp);
for (const b of document.querySelectorAll('.move')) {
  const dir = Number(b.dataset.dir);
  b.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); b.setPointerCapture(e.pointerId); state.pointerDir = dir; });
  b.addEventListener('pointerup', e => { e.preventDefault(); state.pointerDir = 0; });
  b.addEventListener('pointercancel', () => { state.pointerDir = 0; });
  b.addEventListener('lostpointercapture', () => { state.pointerDir = 0; });
}
addEventListener('keydown', e => {
  if (panelOpen() || plantPanelOpen() || sceneOpen()) return;   // 圖鑑、植物一覽打開時不走路（Esc 由 zukan.js 收起）
  if (state.dialogOpen) { if (e.key === 'Enter' || e.key === ' ') closeScroll(); return; }
  if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') { e.preventDefault(); state.target = null; state.keyX = -1; }
  if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { e.preventDefault(); state.target = null; state.keyX = 1; }
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') { e.preventDefault(); state.target = null; state.keyY = -1; }
  if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') { e.preventDefault(); state.target = null; state.keyY = 1; }
  if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); const id = updateNearby(); if (id) interact(id); }
});
addEventListener('keyup', e => {
  if ((e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') && state.keyX < 0) state.keyX = 0;
  if ((e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') && state.keyX > 0) state.keyX = 0;
  if ((e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') && state.keyY < 0) state.keyY = 0;
  if ((e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') && state.keyY > 0) state.keyY = 0;
});
document.getElementById('dolphin').addEventListener('click', () => startOrbit('dolphin'));
document.getElementById('boat').addEventListener('click', () => startOrbit('boat'));
document.getElementById('dive').addEventListener('click', () => startDive());
// 全劇小生物圖鑑（zukan.js）：右上「圖鑑 n／13」打開；變數 creatures（第一版海底的 dive_seen 讀的時候併進來）
const zk = createZukan({ vars: () => state.vars, set: setVars, toast: t => setTimeout(() => toast(t), 2000) });   // 繞島回來的那句提示先講完，再講收進圖鑑
function updateZukanBtn() { const b = document.getElementById('zukan'); if (b) b.textContent = `圖鑑 ${zk.count}／${ZK_TOTAL}`; }
zk.ready.then(updateZukanBtn);
document.getElementById('zukan').addEventListener('click', e => { e.stopPropagation(); if (!state.ready || state.orbit) return; state.keyX = state.keyY = state.pointerDir = 0; state.target = null; openPanel(zk, { onClose: updateZukanBtn }); });
document.getElementById('zukan').addEventListener('pointerdown', e => e.stopPropagation());
// 植物收集（plants.js）：右上「植物 n／11」開一覽；真結局三樣禮物都拿到之後，多一顆「一起種小樹」（碼頭，四個人一起種的小樹）
const pl = createPlants({ vars: () => state.vars, set: setVars, toast: t => setTimeout(() => toast(t), 600) }); window.__plants = pl;
function updatePlantBtn() { const b = document.getElementById('plants'); if (b) b.textContent = `植物 ${pl.count}／${PL_TOTAL}`; const t = document.getElementById('plant-tree'); if (t) t.hidden = !(state.stage === 5 && Number(state.vars.gifts || 0) >= 3 && !pl.has('olive')); }
pl.ready.then(updatePlantBtn); setInterval(updatePlantBtn, 1500);
document.getElementById('plants').addEventListener('click', e => { e.stopPropagation(); if (!state.ready || state.orbit) return; state.keyX = state.keyY = state.pointerDir = 0; state.target = null; openPlantPanel(pl, { onClose: updatePlantBtn }); });
document.getElementById('plant-tree').addEventListener('click', e => { e.stopPropagation(); if (!state.ready || state.orbit) return; state.keyX = state.keyY = state.pointerDir = 0; state.target = null; playScene(TREE_LINES, { cg: TREE_CG, onDone: () => { pl.got('olive'); updatePlantBtn(); } }); });
for (const id of ['plants', 'plant-tree']) document.getElementById(id).addEventListener('pointerdown', e => e.stopPropagation());
// 真結局：從碼頭水邊下潛 → dive.html（潛到最底）；浮回水面後回到碼頭（?at=dock）。回來時 dive.html 把 memory6、memories 等寫在網址上
function startDive() {
  if (!state.ready || state.orbit || state.landing || state.landingWalk || state.stage !== 5) return false;
  const back = new URL(location.href); back.searchParams.set('at', 'dock'); back.searchParams.set('arrival', '0');
  const url = new URL('./dive.html', location.href); url.searchParams.set('chapter', 'true'); url.searchParams.set('back', back.href);
  for (const k of ['memories', 'memory6', 'creatures', 'coral_dive']) if (state.vars[k] !== undefined) url.searchParams.set(k, String(state.vars[k]));
  state.diveUrl = url.href; if (Q.get('noNav') === '1') return true;
  location.href = url.href; return true;
}
if (Q.get('at') === 'dock') waitUntilReady().then(() => { const p = { x: CFG.landing.shore[0], y: CFG.landing.shore[1] }; state.x = p.x; state.y = p.y; state.target = null; render(0, true);
  if (Q.get('diveDone') === '1') { const got = ['memory6', 'memories', 'creatures', 'zukan_complete', 'coral_dive', 'dive_done'].filter(k => Q.has(k)); if (got.length) setVars(Object.fromEntries(got.map(k => [k, state.vars[k] ?? Q.get(k)]))); zk.refresh(); render(); } });
addEventListener('message', event => {
  const data = event.data || {};
  if (data.type === 'larch:init') {
    // 新舊順序：進卡當時的 init ＜ 這張卡裡寫過的（window.name）＜ 換頁帶回來的網址參數（下潛、長畫回來時最新）
    const fromUrl = queryVariables(); for (const k of ['chapter', 'day', 'time']) delete fromUrl[k];
    if (fromUrl.creatures !== undefined) {
      const existing = BR.merge(data.variables || {}).creatures;
      fromUrl.creatures = [...new Set([existing, fromUrl.creatures].flatMap(value => String(value || '').split(',')).filter(Boolean))].join(',');
    }
    BR.note(fromUrl);
    const vars = BR.merge(data.variables || {});
    if (Q.has('chapter')) vars.chapter = Q.get('chapter');   // Larch 的 chapter 變數預設是 true、不代表現在第幾章；以網址為準（新版/build/_島段切卡規格.md）
    let c = BR.context(vars); const fresh = !Q.has('ride') && !Q.has('from') && !Q.has('at');
    // 第七章評審週陪完回來：天黑了；陪晨那天是隔天清晨
    if (c.chapter === '7' && c.mode === 'review' && c.step >= 4 && !Q.has('time')) vars.time = vars.island_next_scene === 'dawn' ? '清晨' : '天黑';
    // 真結局三樣禮物拿齊：步驟變數進到第 6 步（回家），大地圖換成天剛暗
    if (c.chapter === 'true' && c.step < 6 && ['gift_chen', 'gift_shi', 'gift_ming'].every(k => truth(vars[k]))) { BR.setStep(c.stepVar, 6); vars[c.stepVar] = 6; c = BR.context(vars); }
    applyVariables(vars);
    freeAffinity.refresh();
    // 回接：對話卡播完，直接回到剛才那張長畫（不先停在全島地圖）
    const backTo = c.chapter === '7' && c.mode === 'review' ? (c.step >= 4 && AREA_NAME[vars.island_next_scene] ? vars.island_next_scene : null)
      : FLAT_OF[c.chapter] && c.step >= 6 && !truth(vars[DONE_FLAG[c.chapter]]) ? FLAT_OF[c.chapter] : null;
    if (fresh && backTo && !state.initialized) { state.initialized = true; navigateFlat(backTo, backTo, { resume: '1' }); return; }
    placeFrom(); updateNote();
    state.initApplied = true;
    updateReady();
    if (!state.initialized) { state.initialized = true; landingAnimation(); }
  }
});

// 從長畫回來：站在那一區入口外一步（往家的方向）
function placeFrom() {
  const e = CFG.entrances.find(x => x.scene === Q.get('from')); if (!e || state.placedFrom) return; state.placedFrom = true;
  let p = { x: e.x, y: e.y };
  for (const k of [0.16, 0.1, 0.05]) { const q = { x: e.x + (CFG.start.x - e.x) * k, y: e.y + (CFG.start.y - e.y) * k }; if (walkable(q)) { p = q; break; } }
  state.x = p.x; state.y = p.y; state.target = null; state.face = CFG.start.x >= e.x ? 1 : -1; render(0, true);
}
// 第七章評審週：右上紙條列三個人，陪過的打勾
function updateNote() {
  const c = ctx(); if (c.chapter !== '7' || c.mode !== 'review') return;
  document.getElementById('progress').textContent = C7_PEOPLE.map(row => row[0] + (c7Done(row) ? ' ✓' : '')).join('　');
}
state.stage = stageFromVars({ chapter: Q.get('chapter') || 1 });
applyVariables(queryVariables());
freeAffinity.refresh();
if (inFrame) post({ type: 'larch:ready' });
if (!inFrame) setTimeout(() => {
  placeFrom(); updateNote();
  if (!state.initialized) { state.initialized = true; landingAnimation(); }
}, 50);
if (Q.get('ride') === 'dolphin') waitUntilReady().then(() => startOrbit('dolphin'));
if (Q.get('ride') === 'boat') waitUntilReady().then(() => startOrbit('boat'));
buildWhale(); render(0, true); requestAnimationFrame(frame);
PageLoading.prepare('地圖與進場資料', Promise.all([waitUntilReady(), zk.ready, pl.ready]));
PageLoading.shown.then(updateReady);
PageLoading.finish();

window.islandMap = {
  config: CFG,
  get state() { return { stage: state.stage, time: state.time, x: state.x, y: state.y,
    vars: Object.assign({}, state.vars), orbit: state.orbit?.kind || null,
    passed: [...state.passed], openEntrances: entrances().map(e => e.id), nearby: updateNearby(), landing: state.landing,
    ready: this.ready, mapReady: state.mapReady, initApplied: state.initApplied }; },
  get ready() { return state.ready && !PageLoading.loading; },
  async whenReady() { await PageLoading.shown; await waitUntilReady(); },
  setPosition, moveTo(p) { return moveTarget(p); }, interact,
  startOrbit, routePoint,
  trips: TRIPS,
  // 測試用：把紙片停在一趟的某個位置（phase＝trip 整趟、leg 出發段、loop 環線、back 回程；fraction 是那一段的比例），鏡頭直接到位，
  // 回傳紙片、鯨魚、延伸圖與畫面的實際外框
  orbitPreviewForTest(kind, fraction, phase = 'loop') {
    if (!state.orbit && !startOrbit(kind)) return null;
    const ride = state.orbit, T = TRIPS[ride.kind]; ride.frozen = true;
    ride.s = phase === 'trip' ? T.total * fraction : phase === 'leg' ? T.leg.total * fraction
      : phase === 'back' ? T.leg.total + T.loop.total + T.leg.total * fraction
      : T.leg.total + ((fraction * T.loop.total - T.joinAlong) % T.loop.total + T.loop.total) % T.loop.total;
    const p = tripPoint(ride.kind, ride.s); state.x = p.x; state.y = p.y;
    ride.face = faceAt(ride.kind, ride.s) || ride.face;
    render(0, true); renderWhale(0);
    const box = element => { const r = element.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    return { vehicle: box(vehicle), whale: whale.classList.contains('on') ? box(whale.querySelector('img.on') || whale) : null,
      map: box(world), art: box(map), camera: world.style.getPropertyValue('--camera-x') + ',' + world.style.getPropertyValue('--camera-y'),
      viewport: { width: innerWidth, height: innerHeight }, x: p.x, y: p.y, face: ride.face, hint: box(document.getElementById('hint')) };
  },
  routeIsAtSea(kind) { return CFG.orbit[kind].every(p => !pointInPolygon({ x: p[0], y: p[1] }, CFG.landOutline)); },
  collectMemory1, collectMemory7, startDive, zukan: () => zk, openZukan: () => openPanel(zk, { onClose: updateZukanBtn }), closeZukan: closePanel,
  finishOrbitForTest() { if (!state.orbit) return false; finishOrbit(); return true; },
  closeScroll
};
updateReady();
