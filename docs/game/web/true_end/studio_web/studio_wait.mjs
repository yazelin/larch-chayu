// 等 AI 回應的共用提示：分段文字＋一點一點跳的點點（或寫字的筆）。
// 用法：const w = waitingIndicator({ stages: [{ at: 0, label: '晨在想' }, { at: 5, label: '晨在回', write: true, note: '小字' }], color: '#879a42', startedAt: Date.now() });
//   w.el 放進頁面；w.stop() 停掉計時。startedAt 是過去的時間時，直接從對應那一段開始（關掉再打開用）。
//   stages[].at 是開始的秒數；write: true 用寫字的筆；note 是這段起顯示的小字（後面的段落沿用，除非另外寫）。
//   元素離開頁面後會自己停。減少動畫（prefers-reduced-motion）時點點變成靜態的「…」。
export const CHARACTER_STAGE_COLORS = { chen: '#58642e', ming: '#304b6f', shi: '#7d3b50', group: '#704934' };

export function stageIndex(stages, elapsedSec) {
  let index = 0;
  stages.forEach(function (stage, i) { if (elapsedSec >= stage.at) index = i; });
  return index;
}

export function waitingIndicator(options) {
  const stages = options.stages;
  const startedAt = Number(options.startedAt) || Date.now();
  const root = document.createElement('div');
  root.className = 'sf-wait';
  root.setAttribute('role', 'status');
  root.setAttribute('aria-live', 'polite');
  if (options.color) root.style.setProperty('--wait-color', options.color);
  const line = document.createElement('div'); line.className = 'sf-wait-line';
  const label = document.createElement('span'); label.className = 'sf-wait-label';
  const marks = document.createElement('span'); marks.className = 'sf-wait-marks';
  const note = document.createElement('div'); note.className = 'sf-wait-note';
  const track = document.createElement('div'); track.className = 'sf-wait-track';
  track.setAttribute('aria-hidden', 'true');
  marks.setAttribute('aria-hidden', 'true');
  const segments = stages.length > 1 ? stages.map(function () {
    const segment = document.createElement('span');
    track.appendChild(segment);
    return segment;
  }) : [];
  line.append(label, marks);
  root.append(line, track, note);
  let override = null, current = -1, timer = 0, stopped = false, wasConnected = false;

  function marksFor(write) {
    marks.replaceChildren();
    if (write) {
      const pen = document.createElement('span'); pen.className = 'sf-wait-write';
      pen.innerHTML = '<span class="sf-wait-ink"></span><svg class="sf-wait-pen" viewBox="0 0 24 24" aria-hidden="true"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
      marks.appendChild(pen);
    } else {
      const dots = document.createElement('span'); dots.className = 'sf-wait-dots'; dots.innerHTML = '<i></i><i></i><i></i>';
      marks.appendChild(dots);
    }
    const still = document.createElement('span'); still.className = 'sf-wait-still'; still.textContent = '…';   // 減少動畫時只顯示這個
    marks.appendChild(still);
  }
  function tick() {
    if (stopped) return;
    if (root.isConnected) wasConnected = true; else if (wasConnected) { stop(); return; }
    const index = stageIndex(stages, (Date.now() - startedAt) / 1000);
    if (index === current) return;
    current = index;
    const stage = stages[index];
    label.textContent = stage.label;
    root.dataset.stage = String(index);
    segments.forEach(function (segment, i) {
      segment.dataset.state = i < index ? 'complete' : i === index ? 'current' : 'upcoming';
    });
    marksFor(!!stage.write);
    let text = '';
    for (let i = 0; i <= index; i++) if (stages[i].note !== undefined) text = stages[i].note;
    note.textContent = override || text;
    note.hidden = !(override || text);
  }
  // 臨時換掉小字（例如「網路有點慢，…還在做，會繼續確認」）；傳 null 還原
  function setNote(text) { override = text || null; note.textContent = override || (current >= 0 ? (function () { let t = ''; for (let i = 0; i <= current; i++) if (stages[i].note !== undefined) t = stages[i].note; return t; })() : ''); note.hidden = !note.textContent; }
  function stop() { stopped = true; if (timer) clearInterval(timer); timer = 0; }
  tick();
  timer = setInterval(tick, 250);
  return { el: root, stop: stop, setNote: setNote };
}

// 各處的分段（秒數是估的：看圖實測約 60 秒；歌 2～4 分鐘；圖與遊戲沒有量測，先照 15～40 秒的節奏抓）
export function chatStages(name) { return [{ at: 0, label: name + '在想' }, { at: 5, label: name + '在回', write: true }]; }
export function lookStages() {
  return [{ at: 0, label: '晨拿起妳的畫' }, { at: 8, label: '晨在仔細看', note: '可以先關掉，看完會放進和晨的聊天。' },
    { at: 25, label: '晨在想要怎麼說' }, { at: 45, label: '晨在寫回應', write: true }];
}
export function jobStages(kind) {
  if (kind === 'song') return [{ at: 0, label: '詩在寫旋律' }, { at: 40, label: '詩在錄音' }, { at: 120, label: '詩在混音', write: true }];
  if (kind === 'game') return [{ at: 0, label: '明在寫程式' }, { at: 40, label: '明在測試' }, { at: 80, label: '明在包好', write: true }];
  return [{ at: 0, label: '晨在打草稿' }, { at: 30, label: '晨在上色' }, { at: 70, label: '晨在收尾', write: true }];
}
