import { preparePanel } from './studio_panel.mjs';
import { taipeiWindowTime } from './story_time.mjs';
import { TODO_ITEMS } from './studio_points2_data.mjs';
import { CHEN_ART, GROUP_PHOTO, MUSICAL_TICKET, SKY_DIARY } from './studio_collection_data.mjs';
import { islandTimeFromVars } from '../map2d/side/web/island_rules.mjs';

{
  const panel = document.getElementById('panel'), panelTitle = document.getElementById('panel-title'), panelBody = document.getElementById('panel-body'), scrim = document.getElementById('scrim');
  const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
  const btn = (text, cls, fn, label) => { const b = el('button', 'sp2-btn' + (cls ? ' ' + cls : ''), text); b.type = 'button'; if (label) b.setAttribute('aria-label', label); if (fn) b.addEventListener('click', fn); return b; };
  const PIN_KEY = 'skyDiaryPins';
  const PIN_LIMIT = 6;
  let savedPins;
  let pinsRevision = 0;

  const style = document.createElement('style');
  style.textContent = `
#panel.sp2{width:min(860px,calc(100vw - 32px));max-height:min(92vh,900px)}
#panel.sp2 #panel-close{width:44px;height:44px}
#panel.sp2 #panel-body{padding:14px 16px 18px}
.sp2-btn{appearance:none;min-width:44px;min-height:44px;padding:0 16px;border:1px solid #d8c4ab;border-radius:22px;background:#fffdf8;color:#382c2b;font:inherit;font-weight:700;cursor:pointer}
.sp2-btn[aria-pressed="true"],.sp2-btn[aria-selected="true"]{background:#885d45;border-color:#885d45;color:#fffaf2}
.sp2-btn:disabled{opacity:.45;cursor:default}
.sp2-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:0 0 10px}
.sp2-row.center{justify-content:center}
.sp2-cap{margin:6px 0;color:#6d5a4b;font-size:13px;line-height:1.6}
.sp2-empty{margin:16px 0;padding:22px 14px;border:2px dashed #cdb89c;border-radius:12px;color:#8a7766;text-align:center;font-size:14px}
.sp2-vp{position:relative;overflow:hidden;width:100%;aspect-ratio:3/2;max-height:62vh;border-radius:12px;background:#e9e1d3;touch-action:none;cursor:grab;user-select:none;-webkit-user-select:none;outline-offset:2px}
.sp2-vp.dragging{cursor:grabbing}
.sp2-vp-art{position:absolute;left:0;top:0;transform-origin:0 0;pointer-events:none}
.sp2-vp-art img{position:absolute;inset:0;width:100%;height:100%;max-width:none}
.sp2-vp-art .sp2-gray{mask-mode:luminance;mask-size:100% 100%;filter:grayscale(1) brightness(.92)}
.sp2-scope-tube[data-tone="night"] .sp2-vp-art::after,.sp2-scope-tube[data-tone="dusk"] .sp2-vp-art::after,.sp2-scope-tube[data-tone="day"] .sp2-vp-art::after{content:"";position:absolute;inset:0;pointer-events:none}
.sp2-scope-tube[data-tone="night"] .sp2-vp-art::after{background:#08194080;mix-blend-mode:multiply}
.sp2-scope-tube[data-tone="dusk"] .sp2-vp-art::after,.sp2-sunset::after{background:linear-gradient(#e3947166,transparent);mix-blend-mode:multiply}
.sp2-sunset::after{content:"";position:absolute;inset:0}
.sp2-scope-tube[data-tone="day"] .sp2-vp-art::after{background:#dfe9ff42;mix-blend-mode:screen}
.sp2-vp-art .sp2-flower{inset:auto;width:auto}
.sp2-vp.circle{width:min(100%,420px,60vh);aspect-ratio:1;margin:0 auto;border-radius:50%;border:10px solid #8b6a45;box-shadow:inset 0 0 28px rgba(0,0,0,.45),0 6px 16px rgba(70,50,30,.35);background:#10202e;box-sizing:border-box}
.sp2-crop{display:block;position:relative;overflow:hidden;width:100%;background:#dfd6c6}
.sp2-crop img{position:absolute;max-width:none;pointer-events:none}
.sp2-window .sp2-crop{max-width:none;margin:auto;border:7px solid #a88262;border-radius:4px;box-shadow:0 4px 12px #50301942}
.sp2-window[data-sky="predawn"] img{filter:brightness(.72) saturate(.78) hue-rotate(12deg)}
.sp2-window[data-sky="morning"] img{filter:brightness(1.08) saturate(.77) sepia(.12)}
.sp2-window[data-sky="dusk"] img{filter:brightness(.86) sepia(.48) saturate(1.32) hue-rotate(-15deg)}
body[data-window-time] .wall-piece[data-wall="north"] .ring-image{filter:none}
body[data-window-time="night"] .wall-piece[data-wall="north"] .ring-image{filter:brightness(.62) saturate(.76)}
body[data-window-time] .night-window{opacity:0}
body[data-window-time="predawn"] .night-window{background:#6e79ab;opacity:.56}
body[data-window-time="morning"] .night-window{background:#f5d6ac;opacity:.26}
body[data-window-time="dusk"] .night-window{background:#ce805e;opacity:.52}
body[data-window-time="night"] .night-window{opacity:.82}
.sp2-slots{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px 12px}
.sp2-slot{min-width:0;display:grid;gap:7px;align-content:start}
.sp2-slot button{white-space:normal}
.sp2-polaroid{appearance:none;display:block;width:100%;padding:7px 7px 5px;border:0;background:#fffdf8;box-shadow:0 3px 8px #46321e4d;color:#4a3a30;font:inherit;text-align:center;cursor:zoom-in;min-height:44px}
.sp2-polaroid .sp2-date{display:block;margin-top:5px;font-size:13px}
.sp2-memory{display:flex;align-items:center;gap:18px;margin-bottom:12px}
.sp2-memory .sp2-polaroid{width:min(30%,150px)}
.sp2-group{display:block;position:relative}
.sp2-group .sp2-date{position:absolute;left:10%;right:10%;bottom:4%;margin:0;color:#574337}
.sp2-photo-large{width:min(100%,560px);margin:0 auto}
.room-photo-wall{position:absolute;z-index:1;pointer-events:none;container-type:inline-size}
.room-sky-pins{width:66%;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px 7%;padding-top:5%;margin-left:5%;align-items:start}
.room-photo-wall.has-memory .room-sky-pins{width:55%}
.room-photo{position:relative;padding:7% 7% 21%;background:#fffdf5;box-shadow:1px 2px 3px #513b3299;transform:rotate(var(--rot,0deg))}
.room-photo::after{content:"";position:absolute;width:14%;height:25%;top:-10%;left:45%;border-radius:1px;background:#b08557;box-shadow:1px 1px 1px #4e3a29a0}
.room-memories{position:absolute;top:-10%;right:3%;width:29%;display:grid;gap:8px}
.room-group-photo{transform:rotate(5deg);box-shadow:1px 2px 4px #45332399}
.room-group-photo .sp2-date{font-size:2.8cqw}
.room-group-photo::after{content:"";position:absolute;top:-6%;left:46%;width:12%;height:16%;background:#b08557;border-radius:1px}
.sp2-ticket{display:block;position:relative}
.room-ticket{transform:rotate(-6deg);box-shadow:1px 2px 4px #45332399}
.room-ticket::after{content:"";position:absolute;top:-14%;left:46%;width:10%;height:30%;background:#b08557;border-radius:1px}
.sp2-area-status{margin-inline-start:.6em;color:#6d5a4b;font-size:13px}
.sp2-cork{padding:14px;border-radius:12px;border:6px solid #a9764a;background:#cf9f67;background-image:radial-gradient(rgba(120,80,40,.28) 1.2px,transparent 1.4px),radial-gradient(rgba(255,235,200,.25) 1px,transparent 1.2px);background-size:9px 9px,13px 13px;min-height:160px}
.sp2-notes{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px 12px}
.sp2-note{position:relative;padding:12px 8px 8px;min-height:96px;background:#fff2a8;color:#4a3a30;box-shadow:2px 3px 6px rgba(70,40,10,.3);transform:rotate(var(--rot,0deg));font-size:14px;line-height:1.45;overflow-wrap:anywhere}
.sp2-note::before{content:"";position:absolute;left:50%;top:-5px;width:12px;height:12px;margin-left:-6px;border-radius:50%;background:#d24a3a;box-shadow:0 1px 2px rgba(0,0,0,.4)}
.sp2-note.who-C{background:#d9efb4}.sp2-note.who-S{background:#ffd3d8}.sp2-note.who-A{background:#cfe3f7}.sp2-note.special{background:#fff7c2}
.sp2-note small{display:block;margin-top:6px;font-size:11px;color:#6d5a4b}
.sp2-note.done b{text-decoration:line-through;opacity:.6}
.sp2-note.red{outline:3px solid #d24a3a}
.sp2-tag{display:inline-block;margin-right:4px;padding:0 6px;border-radius:9px;background:rgba(255,255,255,.65);font-size:11px}
.sp2-book{display:grid;gap:8px}
.sp2-page{display:block;width:100%;padding:0;border:0;background:transparent;cursor:zoom-in}
.sp2-page img{display:block;width:100%;max-height:56vh;object-fit:contain;border-radius:10px;background:#f4ead8}
.sp2-tea img{display:block;margin:0 auto;max-width:100%;max-height:56vh;border-radius:10px;background:#f4ead8}
.wall-map-mount{position:absolute;pointer-events:none}
.wall-map-frame{position:absolute;left:5%;top:14%;width:90%;aspect-ratio:3/2;box-sizing:border-box;padding:6%;background:#fbf4e4;border:3px solid #b98a58;border-radius:2px;box-shadow:1px 2px 5px rgba(80,50,30,.4);pointer-events:none}
.wall-map-frame img{display:block;width:100%;height:100%;object-fit:cover;border:1px solid rgba(110,80,50,.5)}
.wall-map-frame::before,.wall-map-frame::after{content:"";position:absolute;top:-6px;width:7px;height:7px;border-radius:50%;background:#d7b24a;box-shadow:0 1px 1px rgba(0,0,0,.4)}
.wall-map-frame::before{left:10%}.wall-map-frame::after{right:10%}
@media(max-width:600px){
  #panel.sp2{width:100%;max-height:90vh}
  #panel.sp2 #panel-body{padding:12px 12px 18px}
  .sp2-slots{grid-template-columns:repeat(2,minmax(0,1fr))}
  .sp2-notes{grid-template-columns:repeat(2,minmax(0,1fr))}
  .sp2-vp{max-height:52vh}
}`;
  document.head.appendChild(style);
  new MutationObserver(() => { if (!panel.classList.contains('on') && panel.classList.contains('sp2')) panel.classList.remove('sp2'); }).observe(panel, { attributes: true, attributeFilter: ['class'] });

  function openPanel(title, focus, design) {
    preparePanel(design, focus);
    panel.classList.remove('studio-feature-panel', 'decor-panel', 'sf-wide');
    panelTitle.textContent = title; panelBody.replaceChildren(); panel.classList.add('on', 'sp2'); panel.setAttribute('aria-hidden', 'false'); scrim.classList.add('on');
    panel.dataset.point = title; document.getElementById('panel-close').focus({ preventScroll: true });
  }

  const progress = () => window.STUDIO_FEATURES.story();
  const truth = value => ['true', '1'].includes(String(value));
  const stageOf = p => {
    const supplied = Number(p.value('islandStage'));
    if (supplied >= 1 && supplied <= 5) return Math.floor(supplied);
    if (p.trueEnd) return 5;
    if (p.chapter <= 1) return 0;
    return AREAS.slice(1, 4).reduce((stage, area) =>
      p.chapter > area.stage + 1 || p.day > area.firstDay || truth(p.value(area.done)) || truth(p.value(area.visited))
        ? area.stage : stage, 1);
  };
  const AREAS = [
    { id: 'home', name: '工作室小屋', stage: 1 },
    { id: 'dawn', name: '朝霞丘', stage: 2, visited: 'dawn_visited', done: 'ch3_done', firstDay: 8 },
    { id: 'beach', name: '海灘舞台', stage: 3, visited: 'beach_visited', done: 'ch4_done', firstDay: 14 },
    { id: 'cape', name: '月光岬', stage: 4, visited: 'cape_visited', done: 'ch5_done', firstDay: 17 },
    { id: 'dock', name: '碼頭', stage: 5, visited: 'island_landed' }
  ];
  const MAPS = [null, '../map2d/art/out/island_s1.webp', '../map2d/art/out/island_s2.webp',
    '../map2d/art/out/island_s3.webp', '../map2d/art/out/island_s4.webp', '../map2d/art/out/island_s5.webp'];
  const MAP_SRC = stage => MAPS[stage];
  const MAP_S5 = { day: MAP_SRC(5), dusk: '../map2d/art/out/island_s5_dusk.webp', night: '../map2d/art/out/island_s5_night.webp' };
  const TIME = {
    day: 'day', 白天: 'day', 中午: 'day', 下午: 'day',
    morning: 'morning', 早上: 'morning',
    predawn: 'predawn', 清晨: 'predawn', 天亮前: 'predawn',
    dusk: 'dusk', 黃昏: 'dusk', 傍晚: 'dusk',
    night: 'night', 晚上: 'night', 深夜: 'night', 月夜: 'night', 天剛暗: 'night'
  };
  const defaultWindowTime = { 5: 'dusk', 6: 'morning', 7: 'night', 8: 'morning', 12: 'night',
    13: 'dusk', 14: 'night', 15: 'night', 17: 'morning', 18: 'predawn', 20: 'dusk', 30: 'dusk' };
  const usesRealTime = p => p.day > 30 && !p.timeOfDay;
  const actualTime = p => TIME[p.timeOfDay] || (usesRealTime(p) ? taipeiWindowTime() :
    defaultWindowTime[p.day] || (p.day >= 21 ? 'night' : 'day'));
  const islandTime = (p, stage) => TIME[p.timeOfDay] || (p.oneYear ? 'night' : TIME[islandTimeFromVars({
    chapter: p.chapter, day: p.day, gift_chen: p.value('gift_chen'), gift_ming: p.value('gift_ming'),
    gift_shi: p.value('gift_shi'), trueEnding_island_step: p.value('trueEnding_island_step')
  }, stage)]);
  const hasVisited = (area, p) => area.id === 'home' || truth(p.value(area.visited)) ||
    truth(p.value(area.done)) || p.day > (area.firstDay ?? Infinity);
  const availableAreas = stage => AREAS.filter(area => area.stage <= stage);

  // ── 可放大、拖曳、雙指縮放的看圖框 ──
  function viewer(src, alt, o = {}) {
    const root = el('div', 'sp2-vp' + (o.circle ? ' circle' : '')); root.tabIndex = 0; root.setAttribute('role', 'img'); root.setAttribute('aria-label', alt);
    const art = el('div', 'sp2-vp-art');
    const img = el('img'); img.alt = alt; img.draggable = false; art.append(img); root.append(art);
    const st = { s: 1, x: 0, y: 0, fit: 1, ready: false };
    const MAX = o.max || 4, pointers = new Map(); let lastDist = 0;
    const clampXY = () => {
      const cw = root.clientWidth, ch = root.clientHeight, k = st.fit * st.s, w = img.naturalWidth * k, h = img.naturalHeight * k;
      st.x = w <= cw ? (cw - w) / 2 : Math.min(0, Math.max(cw - w, st.x)); st.y = h <= ch ? (ch - h) / 2 : Math.min(0, Math.max(ch - h, st.y));
    };
    const draw = () => { clampXY(); art.style.transform = `translate(${st.x}px,${st.y}px) scale(${st.fit * st.s})`; root.dataset.zoom = st.s.toFixed(2); root.dataset.x = String(Math.round(st.x)); root.dataset.y = String(Math.round(st.y)); };
    const zoomAt = (factor, cx, cy) => { const ns = Math.min(MAX, Math.max(1, st.s * factor)); const r = ns / st.s; st.x = cx - (cx - st.x) * r; st.y = cy - (cy - st.y) * r; st.s = ns; draw(); };
    const layout = () => {
      if (!img.naturalWidth || !root.clientWidth) return;
      const cw = root.clientWidth, ch = root.clientHeight;
      st.fit = (o.circle ? Math.max : Math.min)(cw / img.naturalWidth, ch / img.naturalHeight);
      art.style.width = img.naturalWidth + 'px'; art.style.height = img.naturalHeight + 'px';
      if (!st.ready) {
        st.ready = true;
        if (o.focus) { st.s = o.focus.z; const k = st.fit * st.s; st.x = cw / 2 - o.focus.x * img.naturalWidth * k; st.y = ch / 2 - o.focus.y * img.naturalHeight * k; }
      }
      draw();
    };
    img.addEventListener('load', layout); img.src = src;
    if (window.ResizeObserver) new ResizeObserver(layout).observe(root);
    root.addEventListener('pointerdown', e => { root.setPointerCapture(e.pointerId); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); root.classList.add('dragging'); lastDist = 0; });
    root.addEventListener('pointermove', e => {
      const prev = pointers.get(e.pointerId); if (!prev) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), rect = root.getBoundingClientRect();
        if (lastDist) zoomAt(d / lastDist, (a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top); lastDist = d;
      } else { st.x += e.clientX - prev.x; st.y += e.clientY - prev.y; draw(); }
    });
    const end = e => { pointers.delete(e.pointerId); lastDist = 0; if (!pointers.size) root.classList.remove('dragging'); };
    root.addEventListener('pointerup', end); root.addEventListener('pointercancel', end); root.addEventListener('lostpointercapture', end);
    root.addEventListener('wheel', e => { e.preventDefault(); const r = root.getBoundingClientRect(); zoomAt(e.deltaY < 0 ? 1.25 : 0.8, e.clientX - r.left, e.clientY - r.top); }, { passive: false });
    const reset = () => {
      st.s = o.focus?.z || 1;
      const k = st.fit * st.s;
      st.x = root.clientWidth / 2 - (o.focus?.x ?? .5) * img.naturalWidth * k;
      st.y = root.clientHeight / 2 - (o.focus?.y ?? .5) * img.naturalHeight * k;
      draw();
      if (o.circle) { focusDial.value = '50'; adjustFocus(); }
    };
    root.addEventListener('keydown', e => {
      const step = 40; let hit = true;
      if (e.key === '+' || e.key === '=') zoomAt(1.4, root.clientWidth / 2, root.clientHeight / 2);
      else if (e.key === '-') zoomAt(1 / 1.4, root.clientWidth / 2, root.clientHeight / 2);
      else if (e.key === '0') reset();
      else if (e.key === 'ArrowLeft') { st.x += step; draw(); } else if (e.key === 'ArrowRight') { st.x -= step; draw(); }
      else if (e.key === 'ArrowUp') { st.y += step; draw(); } else if (e.key === 'ArrowDown') { st.y -= step; draw(); } else hit = false;
      if (hit) { e.preventDefault(); e.stopPropagation(); }
    });
    const center = () => [root.clientWidth / 2, root.clientHeight / 2];
    const bar = el('div', 'sp2-row center');
    bar.append(
      btn('放大', 'zin', () => zoomAt(1.5, ...center()), '放大'),
      btn('縮小', 'zout', () => zoomAt(1 / 1.5, ...center()), '縮小'),
      btn('還原', 'zreset', reset, '還原'));
    const focusDial = el('input', 'sp2-focus-dial');
    const adjustFocus = () => {
      const distance = Number(focusDial.value) - 50;
      art.style.filter = `blur(${Math.abs(distance) / 16}px)`;
      focusDial.setAttribute('aria-valuetext', distance === 0 ? '清晰' : distance < 0 ? '偏近' : '偏遠');
    };
    if (o.circle) {
      const label = el('label', 'sp2-focus', '調焦');
      focusDial.type = 'range'; focusDial.min = '0'; focusDial.max = '100'; focusDial.value = '50';
      focusDial.addEventListener('input', adjustFocus);
      label.append(focusDial);
      bar.append(label);
      adjustFocus();
    }
    return { root, bar, art };
  }
  // 點小圖放大看整張：換掉面板內容，附「回去」鈕
  function zoomView(title, src, alt, caption, back) {
    panelTitle.textContent = title; panelBody.replaceChildren();
    const v = viewer(src, alt);
    const top = el('div', 'sp2-row');
    const backButton = btn('‹ 回去', 'back', back, '回去');
    top.append(backButton);
    panelBody.append(top, v.root, v.bar);
    if (caption) panelBody.append(el('p', 'sp2-cap', caption));
    backButton.focus({ preventScroll: true });
  }

  function crop(src, alt, box, ratio = 1.5) {
    const [x, y, w, h] = box;
    const frame = el('span', 'sp2-crop');
    frame.style.aspectRatio = String(w * ratio / h);
    const img = el('img'); img.alt = alt; img.src = src; img.draggable = false;
    img.style.width = 100 / w + '%'; img.style.height = 100 / h + '%';
    img.style.left = -x / w * 100 + '%'; img.style.top = -y / h * 100 + '%';
    frame.append(img);
    return frame;
  }

  // 北窗用工作室的日夜窗景，通關後再依台灣時間調整天色。
  const SEA_VIEW = {
    day: '../../新版/canon_new/studio/A_window.webp',
    night: '../../新版/canon_new/studio/A_night_window.webp'
  };
  const SEA_LABEL = { predawn: '清晨', morning: '早上', day: '白天', dusk: '傍晚', night: '夜晚' };
  function studioNight() {
    try { if (window.__studio && window.__studio.state && window.__studio.state.night) return true; } catch (error) { /* 當成白天 */ }
    return document.body.classList.contains('is-night');
  }
  function openWindow(focus) {
    openPanel('北窗的海與天', focus, 'window');
    const p = progress();
    const sky = usesRealTime(p) ? actualTime(p) : (studioNight() ? 'night' : 'day');
    const file = SEA_VIEW[sky === 'night' ? 'night' : 'day'];
    const label = SEA_LABEL[sky];
    const view = el('div', 'sp2-window'); view.dataset.sky = sky;
    view.append(crop(file, '北窗外的' + label + '與海面', [.42, .03, .38, .30]));
    panelBody.append(view, el('p', 'sp2-cap', label + '的海面。'));
  }

  const DAWN_MASKS = {
    field: '../map2d/side/art/out/dawn/gray_field.webp',
    pink: '../map2d/side/art/out/dawn/gray_pink.webp',
    white: '../map2d/side/art/out/dawn/gray_white.webp',
    yellow: '../map2d/side/art/out/dawn/gray_yellow.webp',
    orange: '../map2d/side/art/out/dawn/gray_orange.webp',
    cherry: '../map2d/side/art/out/dawn/gray_cherry.webp'
  };
  function scopeView(area, p, time) {
    const night = time === 'night' || time === 'predawn';
    const late = time === 'dusk';
    const painted = p.chapter > 3 || truth(p.value('ch3_done'));
    const afterPlanting = p.day > 27 || (p.day === 27 && night);
    if (area.id === 'dawn') {
      const flowers = p.trueEnd ? 'bloom' : afterPlanting ? 'planted' : '';
      const sunrise = time === 'predawn' && painted && !flowers;
      const daylight = (time === 'day' || time === 'morning') && painted && !flowers;
      const src = sunrise ? '../../新版/canon_new/island_v2/HILL-A_sunrise.webp' :
        daylight ? '../../新版/canon_new/island_v2/HILL-A_morning.webp' : '../map2d/side/art/out/dawn/flat.webp';
      const restored = String(p.value('painted_c3') || '').split(',').filter(Boolean);
      const gray = painted ? [] : restored.length ? Object.keys(DAWN_MASKS)
        .filter(key => key !== 'field' && !restored.includes(key)) : ['field', 'cherry'];
      const tone = night && !sunrise ? 'night' : late ? 'dusk' : time === 'day' && !daylight ? 'day' : '';
      return { src, tone, gray, flowers };
    }
    if (area.id === 'beach') return night || late ?
      { src: '../map2d/side/art/out/beach/flat.webp', tone: night ? 'night' : '' } :
      { src: '../../新版/canon_new/island_v2/BEACH-A_afternoon.webp' };
    if (area.id === 'cape') return { src: night ? '../map2d/side/art/out/cape/flat.webp' : '../../新版/canon_new/island_v2/CAPE-A_afternoon.webp', tone: late ? 'dusk' : '' };
    if (area.id === 'dock') return { src: '../../新版/canon_new/island_v2/DOCK-A_dusk.webp', tone: night ? 'night' : late ? '' : 'day' };
    return { src: '../map2d/side/art/ref/long_house_ref.webp', tone: night ? 'night' : late ? 'dusk' : '' };
  }

  function scopeLayers(art, scene) {
    for (const mask of scene.gray || []) {
      const gray = el('img', 'sp2-gray'); gray.alt = ''; gray.src = scene.src;
      gray.style.maskImage = 'url("' + new URL(DAWN_MASKS[mask], location.href).href + '")';
      art.append(gray);
    }
    if (!scene.flowers) return;
    const blooming = scene.flowers === 'bloom';
    [560, 840, 1180].forEach((x, row) => {
      const soil = el('img', 'sp2-flower'); soil.alt = ''; soil.src = '../map2d/side/art/sprites/c7_soil.webp';
      soil.style.left = (x - 106) / 4178 * 100 + '%'; soil.style.top = '73.8%';
      soil.style.width = '5.1%'; soil.style.height = '3.1%'; art.append(soil);
      const offsets = blooming ? [-96, -60, -24, 12, 48, 84] : [-78, -26, 26, 78];
      offsets.forEach(dx => {
        const flower = el('img', 'sp2-flower'); flower.alt = ''; flower.src = '../map2d/side/art/sprites/c7_flower.webp';
        flower.style.left = (x + dx) / 4178 * 100 + '%';
        flower.style.top = blooming ? '66.6%' : '71%'; flower.style.height = blooming ? '8%' : '3.6%';
        flower.style.filter = ['hue-rotate(34deg)', 'saturate(.2) brightness(1.12)', 'none'][row];
        art.append(flower);
      });
    });
  }

  function openScope(focus) {
    openPanel('望遠鏡裡的島', focus, 'scope');
    const p = progress(), stage = stageOf(p), areas = availableAreas(stage);
    if (!areas.length) { panelBody.append(el('p', 'sp2-empty', '現在只看得到海。')); return; }
    const time = islandTime(p, stage);
    const wrap = el('div', 'sp2-scope'); wrap.dataset.stage = String(stage);
    const holder = el('div', 'sp2-scope-tube');
    const row = el('div', 'sp2-row center'); row.setAttribute('role', 'group'); row.setAttribute('aria-label', '開放的島區');
    const draw = area => {
      const scene = scopeView(area, p, time);
      const v = viewer(scene.src, '望遠鏡裡的' + area.name, {
        circle: true, max: 5, focus: { x: area.id === 'dawn' && scene.flowers ? .21 : .5, y: .5, z: 1 }
      });
      holder.dataset.area = area.id; holder.dataset.tone = scene.tone || '';
      holder.dataset.flowers = scene.flowers || '';
      scopeLayers(v.art, scene);
      holder.replaceChildren(v.root, v.bar);
      row.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.area === area.id)));
    };
    for (const area of areas) {
      const pick = btn(area.name, 'scope-area', () => draw(area)); pick.dataset.area = area.id; row.append(pick);
    }
    wrap.append(row, holder, el('p', 'sp2-cap', '往左或往右拖，也可以用方向鍵移動鏡頭。'));
    panelBody.append(wrap); draw(areas[0]);
  }

  function openMap(focus) {
    openPanel('晨的島地圖', focus, 'map');
    const p = progress(), stage = stageOf(p);
    if (!stage) { panelBody.append(el('p', 'sp2-empty', '地圖上還沒有島。')); return; }
    const v = viewer(MAP_SRC(stage), '晨畫的小島平面圖', { max: 5 });
    const list = el('ul', 'sp2-areas');
    for (const area of availableAreas(stage)) {
      const visited = hasVisited(area, p);
      const item = el('li', '', area.name);
      item.dataset.area = area.id; item.dataset.visited = String(visited);
      item.append(el('small', 'sp2-area-status', visited ? '去過了' : '已開放'));
      list.append(item);
    }
    panelBody.append(v.root, v.bar, el('h2', 'sp2-heading', '島上開放的地方'), list);
    const done = btn('看完了', '', () => {
      const image = v.art.querySelector('img');
      if (image.complete && image.naturalWidth) {
        window.STUDIO_FEATURES.completeFreeInteraction('chen');
        done.disabled = true;
      }
    });
    panelBody.append(done);
    panelBody.dataset.stage = String(stage);
  }

  const diaryAt = p => SKY_DIARY.filter(photo => photo.day <= (p.trueEnd ? 30 : p.day));
  const photoDay = p => p.trueEnd || p.day > 27 || (p.day === 27 && actualTime(p) === 'night');
  const dateLabel = day => '第 ' + day + ' 天';

  function pinsAt(p) {
    const days = diaryAt(p).map(photo => photo.day);
    return savedPins === undefined ? days.slice(-PIN_LIMIT) : savedPins.filter(day => days.includes(day));
  }

  function polaroid(photo) {
    if (photo === MUSICAL_TICKET) {
      const card = el('span', 'sp2-ticket');
      card.append(crop(photo.src, '音樂劇票根', photo.box, photo.ratio));
      return card;
    }
    const group = photo === GROUP_PHOTO;
    const date = dateLabel(photo.day);
    const card = el('span', group ? 'sp2-group' : 'sp2-sky');
    const picture = crop(photo.src, group ? '第一張四人合照' : date + '的天空', photo.box);
    card.append(picture, el('span', 'sp2-date', date));
    return card;
  }

  async function openWall(focus) {
    openPanel('照片牆', focus, 'wall');
    const opening = el('span'); panelBody.append(opening);
    await pinsReady;
    if (!opening.isConnected || !panel.classList.contains('on')) return;
    opening.remove();
    const p = progress(), photos = diaryAt(p);
    function large(photo, key) {
      panelBody.replaceChildren();
      const back = btn('回到照片牆', 'back', () => {
        openWall(focus).then(() => panelBody.querySelector('[data-photo="' + key + '"]')?.focus());
      });
      const card = polaroid(photo);
      card.classList.add('sp2-photo-large');
      panelBody.append(back, card);
      back.focus({ preventScroll: true });
    }
    function preview(photo, key) {
      const button = el('button', 'sp2-polaroid');
      button.type = 'button'; button.dataset.photo = key;
      const name = photo === GROUP_PHOTO ? '第一張四人合照' :
        photo === MUSICAL_TICKET ? '音樂劇票根' : dateLabel(photo.day) + '的天空';
      button.setAttribute('aria-label', '放大' + name);
      button.append(polaroid(photo));
      button.addEventListener('click', () => large(photo, key));
      return button;
    }
    if (photoDay(p)) {
      const memories = el('div', 'sp2-memory');
      memories.append(preview(GROUP_PHOTO, 'group'));
      if (p.oneYear) memories.append(preview(MUSICAL_TICKET, 'ticket'));
      panelBody.append(el('h2', 'sp2-heading', '回憶'), memories);
    }
    panelBody.append(el('h2', 'sp2-heading', '天空日記'));
    if (!photos.length) { panelBody.append(el('p', 'sp2-empty', '牆上掛著兩幅小風景畫。')); return; }
    if (p.day === 5 && !p.trueEnd) {
      const first = preview(photos[0], '5');
      first.classList.add('sp2-photo-large');
      panelBody.append(first, el('p', 'sp2-cap', '今天拍的夕陽。明天就可以把照片夾上牆。'));
      return;
    }
    const count = el('p', 'sp2-cap'); count.setAttribute('role', 'status');
    const grid = el('div', 'sp2-slots');
    const controls = [];
    const sync = () => {
      const pins = pinsAt(p);
      count.textContent = '已夾 ' + pins.length + '／' + PIN_LIMIT + ' 張。';
      for (const [photo, control] of controls) {
        const pinned = pins.includes(photo.day);
        control.setAttribute('aria-pressed', String(pinned));
        control.textContent = pinned ? '從牆上取下' : '夾上牆';
        control.setAttribute('aria-label', control.textContent + '第 ' + photo.day + ' 天的照片');
        control.disabled = !pinned && pins.length >= PIN_LIMIT;
      }
    };
    function savePins(selection) {
      savedPins = selection;
      pinsRevision += 1;
      ensurePhotos(); sync();
      window.StudioDB.set(PIN_KEY, selection ?? null).catch(() => {
        if (count.isConnected) count.textContent = '這次選的照片沒有存下來。';
      });
    }
    for (const photo of photos) {
      const slot = el('div', 'sp2-slot');
      const control = btn('', 'sp2-pin', () => {
        const selected = pinsAt(p);
        if (selected.includes(photo.day)) savePins((savedPins ?? selected).filter(day => day !== photo.day));
        else if (selected.length < PIN_LIMIT) savePins((savedPins ?? selected).concat(photo.day).slice(-PIN_LIMIT));
      });
      control.dataset.day = String(photo.day); controls.push([photo, control]);
      slot.append(preview(photo, String(photo.day)), control); grid.append(slot);
    }
    const automatic = btn('自動夾最近六張', '', () => savePins(undefined));
    panelBody.append(automatic, count, grid); sync();
  }

  function ensurePhotos() {
    const p = progress();
    const pins = p.day >= 6 || p.trueEnd ? pinsAt(p) : [];
    const group = photoDay(p);
    for (const hit of document.querySelectorAll('.hotspot[data-id="2"]')) {
      let mount = hit.previousElementSibling;
      if (!mount?.classList.contains('room-photo-wall')) mount = null;
      if (!pins.length && !group) { mount?.remove(); continue; }
      if (!mount) {
        mount = el('span', 'room-photo-wall'); mount.style.cssText = hit.style.cssText;
        mount.setAttribute('aria-hidden', 'true'); hit.before(mount);
      }
      const signature = [pins.join(','), group, p.oneYear].join('|');
      if (mount.dataset.photos === signature) continue;
      mount.dataset.photos = signature;
      mount.classList.toggle('has-memory', group);
      mount.replaceChildren();
      const sky = el('span', 'room-sky-pins');
      for (const photo of SKY_DIARY.filter(item => pins.includes(item.day))) {
        const item = el('span', 'room-photo'); item.dataset.day = String(photo.day);
        item.style.setProperty('--rot', [-6, 4, -2, 3, -4, 5][sky.childElementCount] + 'deg');
        item.append(crop(photo.src, '', photo.box)); sky.append(item);
      }
      mount.append(sky);
      if (group) {
        const memories = el('span', 'room-memories');
        const photo = polaroid(GROUP_PHOTO);
        photo.classList.add('room-group-photo');
        memories.append(photo);
        if (p.oneYear) {
          const ticket = polaroid(MUSICAL_TICKET);
          ticket.classList.add('room-ticket');
          memories.append(ticket);
        }
        mount.append(memories);
      }
    }
  }

  let pinsReady;
  function refresh() { redrawRoom(); return pinsReady = readPins(); }
  async function readPins() {
    const revision = ++pinsRevision;
    const value = await window.StudioDB.get(PIN_KEY).catch(() => undefined);
    if (revision !== pinsRevision) return;
    savedPins = Array.isArray(value) ? [...new Set(value)].filter(day => Number.isInteger(day) && day >= 5 && day <= 30).slice(-PIN_LIMIT) : undefined;
    redrawRoom();
  }

  // ── 明的軟木板：明的進度表項目（新版/hud/tables/todo.json）＋兩張劇本裡寫明的便利貼 ──
  const WHO = { C: '晨', M: '明', S: '詩', A: '大家' };
  const PER_PAGE = 8;
  function openCork(focus) {
    openPanel('明的軟木板', focus, 'cork');
    const pr = progress(), day = pr.chapter === 99 ? 99 : pr.day;
    const items = TODO_ITEMS.filter(i => (i.show || 3) <= day && i.d <= day + 3);   // 照 HUD 規則：第 3 天晚上開始排表，只看到今天往後三天
    const notes = [];
    if (pr.chapter >= 3) notes.push({ special: true, text: '「報告。」', sub: '貼在明的視窗角落，旁邊畫了小笑臉', tag: '明' });   // 新版/劇本/第二章.md:751、753（CG 2-17）
    if (pr.trueEnd) notes.push({ special: true, text: '「三個人各自準備了一樣東西給妳。」', sub: '長桌上壓著的便利貼，角落畫著小笑臉', tag: '長桌' });   // 新版/劇本/真結局.md:82
    items.forEach(i => {
      const red = i.red && day >= i.red[0] && day <= i.red[1], doneDay = i.red ? i.red[1] : i.d, done = day > doneDay;
      notes.push({ text: i.t, sub: '第 ' + i.d + ' 天', tag: WHO[i.who] || '', who: i.who, red, done });   // 項目文字與出處：todo.json 每列的 src
    });
    if (!notes.length) {
      const e = el('p', 'sp2-empty', '板上還沒有貼東西。'); e.dataset.empty = '1';
      const cork = el('div', 'sp2-cork'); cork.append(e); panelBody.append(cork);
      return;
    }
    let page = 0; const pages = Math.ceil(notes.length / PER_PAGE); const cork = el('div', 'sp2-cork'); const grid = el('div', 'sp2-notes'); cork.append(grid);
    const label = el('span', 'sp2-cap'); const prev = btn('‹ 上一頁', 'prev', () => { page -= 1; draw(); }, '上一頁'), next = btn('下一頁 ›', 'next', () => { page += 1; draw(); }, '下一頁');
    let finished = false;
    const done = btn('看完了', '', () => {
      window.STUDIO_FEATURES?.completeFreeInteraction('ming');
      finished = true;
      done.disabled = true;
    });
    const draw = () => {
      grid.replaceChildren();
      notes.slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE).forEach((n, i) => {
        const d = el('div', 'sp2-note' + (n.special ? ' special' : ' who-' + n.who) + (n.done ? ' done' : '') + (n.red ? ' red' : '')); d.style.setProperty('--rot', ((i % 4) - 1.5) * 1.3 + 'deg');
        d.append(el('b', '', n.text)); const s = el('small', ''); if (n.tag) s.append(el('span', 'sp2-tag', n.tag)); s.append(n.sub + (n.done ? '・完成' : n.red ? '・落後' : '')); d.append(s); grid.append(d);
      });
      label.textContent = '第 ' + (page + 1) + ' / ' + pages + ' 頁'; prev.disabled = page <= 0; next.disabled = page >= pages - 1;
      done.disabled = finished || page !== pages - 1;
    };
    const nav = el('div', 'sp2-row center'); nav.append(prev, label, next, done);
    panelBody.append(el('p', 'sp2-cap', '板上貼著今天到三天後的進度。劃掉的是已完成的項目，畫紅框的是進度落後的項目。'), cork, nav); draw();
  }

  // ── 她的位子：晨的素描本（先是素描本本身，之後翻到走過的章節留下的畫）、桌上的冰紅茶 ──
  function openSeat(focus, startPage = 0) {
    openPanel('她的位子', focus, 'seat');
    const pr = progress(); const tabs = el('div', 'sp2-row'); tabs.setAttribute('role', 'tablist'); const stage = el('div');
    let tab = 'book', page = startPage;
    const focusBookNav = name => (stage.querySelector('.' + name + ':enabled') || stage.querySelector('.sp2-page'))?.focus();
    const pages = [{ title: '素描本', src: '../../新版/canon_new/props/sketchbook.webp', note: '封面、攤開的一頁、側面。' }]
      .concat(CHEN_ART.slice(0, 3).filter(work => pr.chapter >= work.chapter && (!work.day || pr.day >= work.day))
        .map(work => ({ ...work, note: work.title })));
    const draw = () => {
      tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
      stage.replaceChildren();
      if (tab === 'tea') {
        const w = el('div', 'sp2-tea'); const img = el('img'); img.alt = '桌上的冰紅茶'; img.src = '../../canon/refs/prop_tea.webp'; w.append(img); stage.append(w, el('p', 'sp2-cap', '紅椅前，桌上的冰紅茶。')); return;
      }
      const pg = pages[page]; const book = el('div', 'sp2-book'); book.dataset.page = String(page);
      const a = el('button', 'sp2-page'); a.type = 'button'; a.setAttribute('aria-label', pg.title + '，點一下放大'); const img = el('img'); img.alt = pg.title; img.src = pg.src; a.append(img);
      a.addEventListener('click', () => zoomView(pg.title, pg.src, pg.title, pg.note, () => { openSeat(focus, page); panelBody.querySelector('.sp2-page').focus(); }));
      const prev = btn('‹ 上一頁', 'prev', () => { page -= 1; draw(); focusBookNav('prev'); }, '上一頁'), next = btn('下一頁 ›', 'next', () => { page += 1; draw(); focusBookNav('next'); }, '下一頁');
      prev.disabled = page <= 0; next.disabled = page >= pages.length - 1;
      const nav = el('div', 'sp2-row center'); nav.append(prev, el('span', 'sp2-cap', '第 ' + (page + 1) + ' / ' + pages.length + ' 頁'), next);
      book.append(a, nav, el('p', 'sp2-cap', pg.note + (pages.length === 1 ? '　後面的頁還是空白。' : ''))); stage.append(book);
    };
    [['book', '素描本'], ['tea', '冰紅茶']].forEach(([k, n]) => { const b = btn(n, 'tab', () => { tab = k; draw(); }); b.dataset.tab = k; b.setAttribute('role', 'tab'); tabs.append(b); });
    panelBody.append(tabs, stage); draw();
  }

  // ── 西牆南端留白處的小地圖框：照章節階段縮小的島地圖，像掛在牆上的畫；熱區 9 的按鈕本身就是點它開面板 ──
  // 畫框疊在牆面圖上，與熱區分開；第二章掛上後，第三章首次上島前仍能看到畫框。
  function ensureFrames() {
    const stage = stageOf(progress());
    document.querySelectorAll('.hotspot[data-id="9"]').forEach(b => {
      let mount = b.previousElementSibling;
      if (!mount?.classList.contains('wall-map-mount')) mount = null;
      if (!stage) { mount?.remove(); return; }
      const time = islandTime(progress(), stage);
      const src = stage === 5 ? MAP_S5[time] || MAP_S5.day : MAP_SRC(stage);
      if (!mount) {
        mount = el('span', 'wall-map-mount'); mount.style.cssText = b.style.cssText;
        const frame = el('span', 'wall-map-frame');
        const image = el('img'); image.alt = ''; image.draggable = false;
        frame.append(image); mount.append(frame); b.before(mount);
      }
      const f = mount.firstElementChild;
      const i = f.querySelector('img'); if (i.getAttribute('src') !== src) i.src = src; f.dataset.stage = String(stage);
    });
  }
  function updateRoomWindow() {
    const p = progress();
    if (usesRealTime(p)) document.body.dataset.windowTime = actualTime(p);
    else delete document.body.dataset.windowTime;
  }
  function redrawRoom() { updateRoomWindow(); ensureFrames(); ensurePhotos(); }
  const roomObserver = new MutationObserver(() => {
    if (window.STUDIO_FEATURES) redrawRoom();
  });
  for (const id of ['ring-track', 'stage']) {
    const room = document.getElementById(id);
    if (room) roomObserver.observe(room, { childList: true });
  }

  const OPEN = { 2: openWall, 3: openCork, 4: openScope, 9: openMap, 14: openSeat, 15: openWindow };
  function hook() {
    const features = window.STUDIO_FEATURES;
    if (!features || features.__points2) return !!features;
    const handle = features.handle; features.__points2 = true;
    features.handle = function (id, focus) { if (OPEN[id]) { OPEN[id](focus); return true; } return handle.call(features, id, focus); };
    return true;
  }
  window.STUDIO_POINTS2 = { frames: redrawRoom, refresh, ids: Object.keys(OPEN).map(Number), stage: () => stageOf(progress()) };
  (async function () {
    for (let i = 0; i < 400 && !hook(); i += 1) await new Promise(r => setTimeout(r, 50));
    if (hook()) {
      await refresh();
      if (usesRealTime(progress())) setInterval(updateRoomWindow, 60_000);
    }
  })();
}
