// 島的各頁（flat、island、dive、lantern）跟 Larch 之間的共用小工具。要排在 studio_storage.js 前面載入。
// 規格：真結局/map2d/side/_島段步驟清單.md。
//   1. 島頁的雜項存檔改寫 islandSave0／1，不碰工作室的 studioMisc0／1（換裝、常駐位在那裡）。
//   2. 同一張卡裡換頁（全島地圖 ↔ 長畫）時，轉接殼重送的 larch:init 是進卡當時的舊值；
//      這張卡裡改過的變數記在 window.name（沙盒裡沒有別的地方能放），換頁後蓋回去。
//   3. 章與步：網址 chapter／step 優先，沒有就看 init 裡帶了哪個步驟變數。
(function () {
  'use strict';
  window.STUDIO_DB_SCOPE = 'island';
  var TAG = 'island-overlay:';
  var Q = new URLSearchParams(location.search);
  var inFrame = false;
  try { inFrame = window.parent !== window; } catch (error) { inFrame = true; }
  var embedded = inFrame && Q.get('mock') !== '1';
  function readName() {
    try {
      var name = window.name || '';
      if (name.indexOf(TAG) !== 0) return {};
      var value = JSON.parse(name.slice(TAG.length));
      return value && typeof value === 'object' ? value : {};
    } catch (error) { return {}; }
  }
  var overlay = readName();
  function note(vars) {
    Object.keys(vars || {}).forEach(function (key) { overlay[key] = vars[key]; });
    try { window.name = TAG + JSON.stringify(overlay); } catch (error) { /* 放不進去就只留在這一頁 */ }
  }
  function post(message) { if (embedded) { try { window.parent.postMessage(message, '*'); } catch (error) { /* 外殼不在 */ } } }
  // 每張島卡只讀自己的那一個步驟變數（新版/build/build.py 的 _step_variable）
  var STEP_VARS = [
    ['chapter3_dawn_step', '3', 'main'], ['chapter4_beach_step', '4', 'main'], ['chapter5_cape_step', '5', 'main'],
    ['chapter7_review_step', '7', 'review'], ['chapter7_day27_step', '7', 'day27'], ['chapter7_day28_step', '7', 'day28'],
    ['trueEnding_island_step', 'true', 'main']
  ];
  function has(vars, name) { return vars && vars[name] !== undefined && vars[name] !== null && vars[name] !== ''; }
  // 回傳 { chapter, stepVar, mode, step }
  function context(vars) {
    var chapter = Q.get('chapter');
    // 自由逛（圓拱門「出門到島上」，網址帶 visit=1）：不跑主線、不寫步驟變數與完成值
    if (Q.get('visit') === '1') return { chapter: String(chapter || 'true'), stepVar: null, mode: 'visit', step: 1 };
    var found = null;
    for (var index = 0; index < STEP_VARS.length; index += 1) {
      var row = STEP_VARS[index];
      if (!has(vars, row[0])) continue;
      if (chapter && String(chapter) !== row[1]) continue;
      found = row; break;
    }
    if (!chapter) chapter = found ? found[1] : (has(vars, 'chapter') ? String(vars.chapter) : 'true');
    var mode = Q.get('c7') || (found ? found[2] : (String(chapter) === '7' ? 'review' : 'main'));
    var stepVar = found ? found[0] : null;
    if (!stepVar) {
      stepVar = ({ '3': 'chapter3_dawn_step', '4': 'chapter4_beach_step', '5': 'chapter5_cape_step', 'true': 'trueEnding_island_step' })[String(chapter)] ||
        (String(chapter) === '7' ? ({ review: 'chapter7_review_step', day27: 'chapter7_day27_step', day28: 'chapter7_day28_step' })[mode] : null);
    }
    var step = Number(stepVar && has(vars, stepVar) ? vars[stepVar] : Q.get('step')) || 1;
    return { chapter: String(chapter), stepVar: stepVar, mode: mode, step: step };
  }
  // 配樂：網址帶 bgm=<音檔網址> 時島頁自己循環播（比照工作室頁）。出門逛島那張卡進來時 Larch 的配樂是停的，白板把曲子的網址帶進來。
  // 瀏覽器要等第一次互動才准出聲；同一張卡裡換頁（全島地圖 ↔ 長畫）時接著上一頁播到的秒數，不從頭來。
  var BGM_VOLUME = 0.5;
  var bgm = (function () {
    var src = Q.get('bgm');
    if (!src || !/^(https?:|\.{0,2}\/)/.test(src)) return null;
    var audio = new Audio();
    audio.src = src; audio.loop = true; audio.preload = 'auto'; audio.volume = BGM_VOLUME;
    var state = { audio: audio, playing: false, src: src };
    var resumeAt = overlay.__bgm_src === src ? Number(overlay.__bgm_t) || 0 : 0;
    function start() {
      if (state.playing) return;
      if (resumeAt > 0) { try { audio.currentTime = resumeAt; } catch (error) { /* 還沒載到那裡就從頭 */ } }
      audio.play().then(function () { state.playing = true; }, function () { /* 還沒互動，等下一次 */ });
    }
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (type) {
      document.addEventListener(type, function () { if (!state.playing) start(); }, { capture: true, passive: true });
    });
    setInterval(function () { if (state.playing) { overlay.__bgm_src = src; overlay.__bgm_t = Math.round(audio.currentTime * 10) / 10; try { window.name = TAG + JSON.stringify(overlay); } catch (error) { /* 記不下來就從頭 */ } } }, 1000);
    start();
    return state;
  })();
  var flushers = [], completing = false, completed = false;
  // 「__」開頭的是這個檔自己記的事（配樂播到哪），不算劇情變數
  function publicOverlay() { var out = {}; Object.keys(overlay).forEach(function (key) { if (key.indexOf('__') !== 0) out[key] = overlay[key]; }); return out; }
  window.IslandBridge = {
    bgm: bgm,
    // 換到島的另一頁時要跟著帶的網址參數（自由逛、配樂）
    carry: function (url) { ['bgm', 'visit'].forEach(function (key) { if (Q.has(key) && !url.searchParams.has(key)) url.searchParams.set(key, Q.get(key)); }); return url; },
    embedded: embedded,
    overlay: function () { return publicOverlay(); },
    merge: function (initVars) { return Object.assign({}, initVars || {}, publicOverlay()); },
    note: note,
    context: context,
    // 一般變數：整包送，轉接殼照登記的型別代拆
    set: function (vars) { note(vars); if (!completed) post({ type: 'larch:set', variables: vars }); },
    // 步驟變數：數字，一次一個
    setStep: function (name, value) {
      if (!name) return;
      var bag = {}; bag[name] = Number(value); note(bag);
      if (!completed) post({ type: 'larch:set', name: name, value: Number(value) });
    },
    // 送完成：先跑各頁登記的「最後存一次」（站位、進度），等存檔都送出去，再送完成；送完之後這一頁不再寫任何變數。
    // （Larch 收到完成就換卡，之後才到的 larch:set 會被丟掉；2026-11-18 實播：月光岬的定時存站位在完成之後又寫了 islandSave0）
    beforeComplete: function (fn) { flushers.push(fn); },
    get done() { return completed; },
    complete: function (result, payload) {
      if (completed || completing) return; completing = true;
      Promise.all(flushers.map(function (fn) { try { return Promise.resolve(fn()).catch(function () {}); } catch (error) { return null; } }))
        .then(function () { return new Promise(function (ok) { setTimeout(ok, 30); }); })
        .then(function () { completed = true; post({ type: 'larch:complete', result: result, payload: payload || {} }); });
    },
    // 切回對話卡前把畫面淡成紙色，免得 Larch 換卡前那一瞬間看到人還站著
    fadeOut: function () {
      var cover = document.createElement('div'); cover.id = 'cut-cover';
      cover.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#f6efe0;opacity:0;transition:opacity .45s ease;pointer-events:auto';
      document.body.appendChild(cover); requestAnimationFrame(function () { requestAnimationFrame(function () { cover.style.opacity = '1'; }); });
    }
  };
})();
