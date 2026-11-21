// 小紙人走路的晃動：工作室與島上（全島大地圖、朝霞丘／海灘／月光岬長畫）共用這一組數值。
// 走一步上下輕彈一下、身體前後微傾；停下來就收回不晃；開了「減少動態效果」（prefers-reduced-motion）完全不晃。
// 作者 2026-11-21 試玩：島上走路沒有前後抖、工作室抖得太大太快 → 幅度約減三分之一、週期拉長 1.4 倍，島上用同一組。
//   原本（工作室）：一個步伐週期 0.34 秒、上彈 5px（1920×1080 時茶語身高 633px，約 0.79%）、前後傾 1.4 度
//   現在：週期 0.476 秒、上彈身高的 0.526%（1080p 約 3.3px）、前後傾 0.93 度
// 用法：m = WalkSway.create()；每一幀 WalkSway.step(m, dt, moving)（照時間推進）或 WalkSway.advance(m, 走了幾個週期, dt, moving)（照距離推進），
// 再把 m.lift（身高的比例，往上為正）、m.tilt（度）套到紙人上。只要算某個時刻的姿勢就用 WalkSway.pose(秒數, moving)。
(function (global) {
  'use strict';
  var reduce = global.matchMedia ? global.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  // 作者 2026-11-21 第二次：幅度大一點才可愛、要看得到上下彈，但步伐與搖擺放慢一點 → 週期 0.6 秒、上彈身高 1.1%（1080p 約 7px）、前後傾 1.6 度
  var WALK = { cycle: 0.6, lift: 0.011, tilt: 1.6, settle: 9 };
  function create() { return { phase: 0, lift: 0, tilt: 0 }; }
  function advance(m, cycles, dt, moving) {
    if (moving && cycles > 0) m.phase += Math.PI * 2 * cycles;
    var on = moving && !reduce.matches;
    var targetLift = on ? Math.abs(Math.sin(m.phase)) * WALK.lift : 0;
    var targetTilt = on ? Math.sin(m.phase * 2) * WALK.tilt : 0;
    var k = on ? 1 : 1 - Math.exp(-Math.max(0, dt) * WALK.settle);   // 停下來時半拍內收回，不會一下子跳回原位
    m.lift += (targetLift - m.lift) * k;
    m.tilt += (targetTilt - m.tilt) * k;
    if (!on && Math.abs(m.lift) < 1e-5 && Math.abs(m.tilt) < 1e-3) { m.lift = 0; m.tilt = 0; }
    return m;
  }
  function step(m, dt, moving) { return advance(m, dt / WALK.cycle, dt, moving); }
  function pose(seconds, moving) {
    if (!moving || reduce.matches) return { lift: 0, tilt: 0 };
    var phase = Math.PI * 2 * seconds / WALK.cycle;
    return { lift: Math.abs(Math.sin(phase)) * WALK.lift, tilt: Math.sin(phase * 2) * WALK.tilt };
  }
  // 長畫的紙人用 CSS 變數 --bob（紙片高的百分比，負的往上）與 --rock（度）
  function css(el, p) { el.style.setProperty('--bob', (-p.lift * 100).toFixed(3) + '%'); el.style.setProperty('--rock', p.tilt.toFixed(3) + 'deg'); }
  global.WalkSway = { WALK: WALK, create: create, advance: advance, step: step, pose: pose, css: css, reduced: function () { return reduce.matches; } };
})(window);
