// 工作室點晨的分頁「我來畫」：茶語在晨的畫板上自己畫，畫完按「讓晨看看」，晨看了說幾句、替畫取名。
// 規格：真結局/設計.md 2026-11-17、11-18 各條。畫存 Worker 的 R2（POST /look），展廳多一區「我畫的」。
// 這個檔只管畫板本身與顏色解鎖；聊天串、展廳、請晨畫圖接在 studio_features.mjs。

// 十二色（作者 2026-11-17 定）
export const DRAW_COLORS = [
  { id: 'black', name: '黑', hex: '#2b2a2e' }, { id: 'gray', name: '灰', hex: '#9a9aa0' }, { id: 'white', name: '白', hex: '#ffffff' },
  { id: 'red', name: '紅', hex: '#d8433b' }, { id: 'orange', name: '橙', hex: '#ee8a2f' }, { id: 'yellow', name: '黃', hex: '#f3cf3d' },
  { id: 'blue', name: '藍', hex: '#3566c9' }, { id: 'purple', name: '紫', hex: '#8a55b8' },
  { id: 'green', name: '綠', hex: '#4a9e5c' }, { id: 'pink', name: '粉紅', hex: '#f2a0b9' },
  { id: 'brown', name: '棕', hex: '#8b5a3c' }, { id: 'sky', name: '天藍', hex: '#7cc4ec' }
];

// 顏色解鎖表：哪個進度開哪些色。作者 2026-11-18 定「五階段」；之後要調，改這張表就好（一列一批）。
// 每一批的條件「有旗標用旗標、沒有才退回第幾天」：
//   need.flags：那一章島段做完的 Larch 變數（列幾個名字都可以）。工作室卡讀得到其中任何一個（值不管是不是空的）就照旗標判斷，
//               都讀不到（白板還沒讓工作室卡讀、或單獨開網頁）才看 need.day。
//   need.day：遊戲走到第幾天（含）之後。第三章朝霞丘在第 8 天、第四章海灘第 14 天、第五章月光岬第 17 天，各取隔天。
//   need.errand：晨的小委託的變數（值是 done 才算做完）。讀不到才看 need.plant（植物收集裡有小番茄苗 tomato；植物是跨週目保留的）。
//   line：這一批第一次出現在畫板上時，晨說的一句。
// 旗標的名字照 新版/build 登記的；組裝那條線讓工作室卡讀哪幾個，改這裡的名字就好。
export const DRAW_STAGES = [
  { id: 'start', colors: ['black', 'gray', 'white'], need: {}, line: '現在只有黑、灰、白。妳畫什麼，我都想看。' },
  { id: 'ch3', colors: ['red', 'orange', 'yellow', 'blue', 'purple'], need: { flags: ['ch3_done', 'chapter3_dawn_done'], day: 9 }, line: '這些顏色是妳找回來的。我還沒用，想讓妳先畫。' },
  { id: 'errand', colors: ['green', 'pink'], need: { flags: ['ch3_done', 'chapter3_dawn_done'], day: 9, errand: 'errand_chen', plant: 'tomato' }, line: '我用妳找來的顏色，調了兩個新的。綠色跟粉紅色，是調給妳的。' },
  { id: 'ch4', colors: ['sky'], need: { flags: ['ch4_done'], day: 15 }, line: '多了天藍色。我調的時候在想，妳會拿它畫什麼。' },
  { id: 'ch5', colors: ['brown'], need: { flags: ['ch5_done'], day: 18 }, line: '畫板多了棕色。下次畫我的時候，頭髮可以用這個。' }
];

export const LOOK_DAILY_LIMIT = 10;
export const CANVAS_W = 640, CANVAS_H = 480;   // 送給晨看的就是這個大小（Worker 只收 640 寬以內）
const PAPER = '#fffdf6';
const SIZES = [{ id: 'thin', name: '細', px: 3 }, { id: 'mid', name: '中', px: 8 }, { id: 'thick', name: '粗', px: 18 }];

// progress：{ day, plants:Set, vars:{Larch 變數}, all }。回傳已經開的那幾批。
const has = function (vars, name) { return vars[name] !== undefined && vars[name] !== null; };
const truthy = function (value) { return value === true || value === 1 || value === '1' || value === 'true' || value === 'done'; };
export function stageOpen(stage, progress) {
  if (progress.all) return true;
  const need = stage.need || {}, vars = progress.vars || {};
  const known = (need.flags || []).filter(function (name) { return has(vars, name); });
  if (known.length) { if (!known.some(function (name) { return truthy(vars[name]); })) return false; }
  else if (need.day && !(progress.day >= need.day)) return false;
  if (need.errand && has(vars, need.errand)) { if (vars[need.errand] !== 'done') return false; }
  else if (need.plant && !(progress.plants && progress.plants.has(need.plant))) return false;
  return true;
}
export function unlockedStages(progress, stages) {
  return (stages || DRAW_STAGES).filter(function (stage) { return stageOpen(stage, progress); });
}
export function unlockedColors(progress, stages) {
  const open = new Set();
  unlockedStages(progress, stages).forEach(function (stage) { stage.colors.forEach(function (id) { open.add(id); }); });
  return open;
}
export function taipeiDay() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const v = Object.fromEntries(parts.map(function (p) { return [p.type, p.value]; }));
  return v.year + '-' + v.month + '-' + v.day;
}

// deps：{ el, button, progress(), db, look(dataUrl) → {reply,title,work,fallback,remaining,limit,scope}, remaining() → {remaining,limit,scope,tier}（舊介面回數字）或 null,
//         askChen(work, reply), chenBubble(text), limitView(error) → 額度用完時放進結果區的元素（試玩是晨講的那一句；已購買是每日提示＋想要更多次數） }
export async function renderDraw(root, deps) {
  const el = deps.el, button = deps.button;
  const progress = await deps.progress();
  const open = unlockedColors(progress);
  const wrap = el('div', 'sf-draw');

  // 新開的顏色：第一次打開畫板時晨說一句
  let seen = [];
  try { const saved = await deps.db.get('drawStageSeen'); if (Array.isArray(saved)) seen = saved; } catch (error) { /* 讀不到就當沒看過 */ }
  const fresh = unlockedStages(progress).filter(function (stage) { return !seen.includes(stage.id); });
  if (fresh.length) {
    const latest = fresh[fresh.length - 1];
    const hello = deps.chenBubble(latest.line); hello.dataset.drawStage = latest.id; wrap.appendChild(hello);
    try { await deps.db.set('drawStageSeen', seen.concat(fresh.map(function (stage) { return stage.id; }))); } catch (error) { /* 存不下下次再說一次 */ }
  }

  const canvas = el('canvas', 'sf-draw-canvas'); canvas.width = CANVAS_W; canvas.height = CANVAS_H;
  canvas.setAttribute('aria-label', '晨的畫板');
  canvas.setAttribute('aria-describedby', 'draw-keyboard-help');
  canvas.tabIndex = 0;
  const book = el('div', 'sf-draw-book');
  const cursor = el('span', 'sf-brush-cursor');
  cursor.setAttribute('aria-hidden', 'true');
  const sheet = el('div', 'sf-draw-sheet');
  sheet.append(canvas, cursor);
  book.appendChild(sheet);
  const keyboardHelp = el('p', 'sf-draw-keyboard', '用鍵盤畫圖：方向鍵移動筆尖。按空白鍵落筆，再按一次收筆。');
  keyboardHelp.id = 'draw-keyboard-help';
  const ctx = canvas.getContext('2d');
  const strokes = [];   // { color, px, points:[[x,y]…] }；復原＝拿掉最後一筆再整張重畫
  let color = 'black', size = SIZES[1], erasing = false, current = null;
  function drawStroke(stroke) {
    ctx.strokeStyle = stroke.color; ctx.fillStyle = stroke.color; ctx.lineWidth = stroke.px; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    const p = stroke.points;
    if (p.length === 1) { ctx.beginPath(); ctx.arc(p[0][0], p[0][1], stroke.px / 2, 0, Math.PI * 2); ctx.fill(); return; }
    ctx.beginPath(); ctx.moveTo(p[0][0], p[0][1]);
    for (let i = 1; i < p.length; i += 1) ctx.lineTo(p[i][0], p[i][1]);
    ctx.stroke();
  }
  function redraw() { ctx.fillStyle = PAPER; ctx.fillRect(0, 0, CANVAS_W, CANVAS_H); strokes.forEach(drawStroke); refresh(); }
  function point(event) { const r = canvas.getBoundingClientRect(); return [Math.round((event.clientX - r.left) / r.width * CANVAS_W * 10) / 10, Math.round((event.clientY - r.top) / r.height * CANVAS_H * 10) / 10]; }
  function newStroke(start) {
    return { color: erasing ? PAPER : DRAW_COLORS.find(c => c.id === color).hex, px: erasing ? size.px * 2 : size.px, points: [start] };
  }
  canvas.addEventListener('pointerdown', function (event) {
    if (event.button > 0) return;
    event.preventDefault(); try { canvas.setPointerCapture(event.pointerId); } catch (error) { /* 合成事件沒有指標可抓 */ }
    lift();
    current = newStroke(point(event));
    strokes.push(current); drawStroke(current); refresh();
  });
  canvas.addEventListener('pointermove', function (event) {
    if (!current) return; event.preventDefault();
    const p = point(event), last = current.points[current.points.length - 1];
    if (Math.hypot(p[0] - last[0], p[1] - last[1]) < 1) return;
    current.points.push(p);
    ctx.strokeStyle = current.color; ctx.lineWidth = current.px; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke();
  });
  const brushPoint = [CANVAS_W / 2, CANVAS_H / 2];
  function positionBrush() {
    cursor.style.left = (brushPoint[0] / CANVAS_W * 100) + '%';
    cursor.style.top = (brushPoint[1] / CANVAS_H * 100) + '%';
  }
  positionBrush();
  canvas.addEventListener('keydown', function (event) {
    const offset = { ArrowLeft: [-8, 0], ArrowRight: [8, 0], ArrowUp: [0, -8], ArrowDown: [0, 8] }[event.key];
    if (!offset && event.key !== ' ') return;
    event.preventDefault();
    if (offset) {
      brushPoint[0] = Math.max(0, Math.min(CANVAS_W - 1, brushPoint[0] + offset[0]));
      brushPoint[1] = Math.max(0, Math.min(CANVAS_H - 1, brushPoint[1] + offset[1]));
      if (current) { current.points.push(brushPoint.slice()); redraw(); }
      positionBrush();
    } else if (!event.repeat) {
      if (current) lift();
      else {
        current = newStroke(brushPoint.slice());
        strokes.push(current); drawStroke(current); refresh();
      }
      sheet.classList.toggle('pen-down', !!current);
    }
  });
  function lift() {
    if (current && current.color !== PAPER) deps.onStroke?.();
    current = null;
    sheet.classList.remove('pen-down');
  }
  canvas.addEventListener('blur', lift);
  canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', lift); canvas.addEventListener('pointerleave', function (event) { if (event.pointerType === 'mouse' && event.buttons === 0) lift(); });

  // 顏色
  const palette = el('div', 'sf-draw-palette'); palette.setAttribute('role', 'radiogroup'); palette.setAttribute('aria-label', '顏色');
  DRAW_COLORS.forEach(function (c) {
    const sw = el('button', 'sf-draw-swatch'); sw.type = 'button'; sw.dataset.color = c.id; sw.style.setProperty('--c', c.hex);
    sw.setAttribute('role', 'radio');
    if (open.has(c.id)) { sw.title = c.name; sw.setAttribute('aria-label', c.name); sw.addEventListener('click', function () { color = c.id; erasing = false; refresh(); }); }
    else { sw.disabled = true; sw.classList.add('locked'); sw.title = '這個顏色還沒找回來'; sw.setAttribute('aria-label', c.name + '（還沒找回來）'); }
    palette.appendChild(sw);
  });
  // 粗細、橡皮擦、復原、清空
  const tools = el('div', 'sf-draw-tools');
  const sizeButtons = SIZES.map(function (s) { const b = button(s.name, function () { size = s; refresh(); }, 'sf-draw-size'); b.dataset.size = s.id; b.style.setProperty('--brush-size', s.px + 'px'); tools.appendChild(b); return b; });
  const eraser = button('橡皮擦', function () { erasing = !erasing; refresh(); }, 'sf-draw-tool'); eraser.dataset.tool = 'eraser';
  const undo = button('復原', function () { strokes.pop(); redraw(); }, 'sf-draw-tool'); undo.dataset.tool = 'undo';
  const clear = button('清空', function () { strokes.length = 0; redraw(); }, 'sf-draw-tool'); clear.dataset.tool = 'clear';
  tools.append(eraser, undo, clear);

  const show = button('讓晨看看', null, 'primary'); show.dataset.draw = 'look';
  const left = el('span', 'sf-draw-left');
  const actions = el('div', 'sf-draw-actions'); actions.append(show, left);
  const status = el('p', 'sf-status');
  const result = el('div', 'sf-stack sf-draw-result');
  let remaining = null;
  let quota = { limit: LOOK_DAILY_LIMIT, scope: 'day', tier: '' };   // Worker 回的上限與範圍（day＝每天、total＝試玩總共）
  function quotaFrom(value) {
    if (typeof value === 'number') return value;
    if (!value || typeof value.remaining !== 'number') return null;
    if (typeof value.limit === 'number') quota.limit = value.limit;
    if (value.scope) quota.scope = value.scope;
    if (value.tier) quota.tier = value.tier;
    return value.remaining;
  }
  function leftText() {
    if (remaining === null) return '';
    if (quota.scope === 'total') return remaining > 0 ? '還能給晨看 ' + remaining + ' 次' : '';   // 總共的用完時由晨講（試玩）或放用完的提示（limitView）
    return remaining > 0 ? '今天還能給晨看 ' + remaining + ' 次' : '今天已經給晨看了 ' + quota.limit + ' 張，明天再給他看。';
  }
  // 用完了：試玩（總共）由晨講那一句；已購買是用完的提示＋想要更多次數（每天或總共照 Worker 回的 scope）
  function usedUp() {
    const trial = quota.tier ? quota.tier === 'trial' : quota.scope === 'total';
    return { code: trial ? 'TRIAL_LOOK_LIMIT' : 'DAILY_LOOK_LIMIT', limit: quota.limit, scope: quota.scope };
  }
  function showLimit(error, append) {
    if (!deps.limitView) return;
    const view = deps.limitView(error, { textless: error.code === 'DAILY_LOOK_LIMIT' && quota.scope !== 'total' });   // 每日的那句已經寫在按鈕旁邊
    view.dataset.drawLimit = error.code;
    if (append) result.appendChild(view); else result.replaceChildren(view);
  }
  function refresh() {
    palette.querySelectorAll('button').forEach(function (b) { b.setAttribute('aria-checked', String(!erasing && b.dataset.color === color)); });
    sizeButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.size === size.id)); });
    eraser.setAttribute('aria-pressed', String(erasing));
    undo.disabled = clear.disabled = !strokes.length;
    left.textContent = leftText();
    show.disabled = remaining === 0 || show.dataset.busy === '1';
  }
  redraw();
  deps.remaining().then(function (value) {
    const n = quotaFrom(value);
    if (typeof n !== 'number') return;
    remaining = n; refresh();
    // 打開畫板時次數就用完了：試玩（總共）由晨先講那一句；已購買（每天）在每日提示旁邊放「想要更多次數」
    if (n === 0) showLimit(usedUp(), false);
  }).catch(function () {});

  function appendAnswer(answer) {
    result.appendChild(deps.chenBubble(answer.reply, answer.mood));
    if (!answer.fallback) {
      if (answer.title) { const name = el('p', 'sf-draw-title', '晨幫這張畫取的名字：〈' + answer.title + '〉'); result.appendChild(name); }
      if (answer.work) result.appendChild(el('p', 'sf-context', '這張畫和晨的回覆都留在聊天裡。'));
      const again = button('請晨也畫一張', function () { deps.askChen(answer); }); again.dataset.draw = 'ask-chen';
      result.appendChild(again);
    }
  }
  // 看圖要將近一分鐘（2026-11-21 實測 59 秒）：分四段顯示（studio_wait.mjs 的 lookStages），第二段起附「可以先關掉」小字
  function showWait(startedAt) {
    const wait = deps.waiting({ stages: deps.lookStages(), color: '#879a42', startedAt: startedAt });
    wait.el.dataset.drawWait = '1';
    status.replaceChildren(wait.el);
    return wait;
  }
  // 關掉畫板再打開：晨還在看，就接著顯示進度；看完把晨的回應放進來
  if (deps.pendingLook) deps.pendingLook().then(function (pending) {
    if (!pending || !root.isConnected) return;
    show.dataset.busy = '1'; refresh();
    const wait = showWait(pending.startedAt);
    deps.onLookEnd(root, function (answer) {
      wait.stop(); status.replaceChildren(); show.dataset.busy = '0';
      if (answer && answer.reply) { if (typeof answer.remaining === 'number') remaining = answer.remaining; appendAnswer(answer); }
      else status.textContent = '晨這次沒看成，等一下再給晨看一次。';
      refresh();
    });
  }).catch(function () {});

  show.addEventListener('click', async function () {
    if (show.disabled) return;
    if (!strokes.length) { status.textContent = '先畫點什麼，再給晨看。'; return; }
    show.dataset.busy = '1'; refresh(); result.replaceChildren();
    const wait = showWait(Date.now());
    try {
      const answer = await deps.look(canvas.toDataURL('image/jpeg', 0.85));
      if (typeof answer.remaining === 'number') { remaining = answer.remaining; quotaFrom(answer); }
      wait.stop(); status.replaceChildren();
      appendAnswer(answer);
      if (remaining === 0) showLimit(usedUp(), true);
    } catch (error) {
      wait.stop(); status.replaceChildren();
      if (error.code === 'DAILY_LOOK_LIMIT' || error.code === 'TRIAL_LOOK_LIMIT') {
        remaining = 0;
        if (typeof error.limit === 'number') quota.limit = error.limit;
        if (error.scope) quota.scope = error.scope; else if (error.code === 'TRIAL_LOOK_LIMIT') quota.scope = 'total';
        showLimit(error, false);
      }
      else status.textContent = error.code ? '晨那邊暫時接不上，等一下再試。' : (error.message || '網路暫時沒有接通。等一下再試。');
    } finally { show.dataset.busy = '0'; refresh(); }
  });

  const surface = el('div', 'sf-draw-surface');
  surface.append(book, keyboardHelp);
  const tray = el('aside', 'sf-draw-tray');
  tray.append(el('h2', 'sf-section', '顏料與畫筆'), palette, tools, actions, status);
  wrap.append(surface, tray, result);
  root.appendChild(wrap);
  // 測試用：直接畫一筆、看目前狀態
  root.drawApi = { canvas: canvas, strokes: strokes, stroke: function (points, c) { strokes.push({ color: (DRAW_COLORS.find(function (x) { return x.id === c; }) || DRAW_COLORS[0]).hex, px: size.px, points: points }); redraw(); }, open: [...open] };
}
