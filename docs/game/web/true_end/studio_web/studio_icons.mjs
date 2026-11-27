// 工作室的圖示按鈕（作者 2026-11-21：文字按鈕改成符合風格的圖示＋hover 效果＋tooltip，整體同一套設計語言）。
// 做法：各面板照舊用文字建按鈕（data-*、事件、測試選擇器都不動），這支模組照下面的登錄表把按鈕換成
//   <span class="sp-ic" data-icon="名稱"></span><span class="sp-icon-label">原文字或短字</span>
// 並加上 class sp-icon-btn（純圖示再加 sp-icon-only，圖示＋短字加 sp-with-label）、aria-label（原本沒有才補原文字）、data-tip（tooltip 文字）。
// 程式之後改按鈕文字（例如「切到夜晚」↔「切到白天」）會自動重套。
// 圖示檔在 icons/<A|B|C>/<名稱>.webp；用哪一套看 <html data-icon-style>（預設 A（作者 2026-11-21 選水彩），網址 ?icons=A|B|C 切換），對應規則在 studio_icons.css。
// 唱片架、耳機的黑膠唱盤（studio_album.mjs）作者 2026-11-21 改成水彩紙版，按鈕一樣套（.sa-btn）。明的電腦選單列、下拉選單、Dock、視窗紅綠燈本來就是作業系統的樣子，不在登錄表裡。

// m：'icon' 純圖示（文字藏起來給讀屏），'label' 圖示＋短字（s 是畫面上的短字，沒寫就用原文字）。tip：tooltip 文字，沒寫就用原文字。
// aria-label：按鈕原本有的不動；沒有的補原文字（原文字是符號時用 aria）。
const RULES = [
  // 工作室地圖
  { sel: '#panel-close', i: 'close', m: 'icon', tip: '關閉' },
  { sel: '#panel-back', i: 'prev', m: 'label', tip: '返回工作室' },
  { sel: '#turn-left', i: 'prev', m: 'icon', tip: '轉身向左' },
  { sel: '#turn-right', i: 'next', m: 'icon', tip: '轉身向右' },
  { sel: '#table-entry', i: 'table', m: 'icon', tip: '長桌：四人群聊' },
  { sel: '#seat-entry', i: 'sketchbook', m: 'icon' },
  { sel: '#scroll-time-toggle, #time-toggle', t: '切到夜晚', i: 'moon', m: 'icon' },
  { sel: '#scroll-time-toggle, #time-toggle', t: '切到白天', i: 'sun', m: 'icon' },
  { sel: '#decor-toggle', i: 'decor', m: 'icon' },
  { sel: '.studio-embed-continue', t: '直接到長桌', i: 'table', m: 'label' },
  { sel: '.studio-embed-continue', t: '繼續', i: 'story', m: 'label', tip: '繼續劇情' },
  { sel: '.studio-embed-continue', t: '到長桌了', i: 'table', m: 'label' },
  { sel: '.studio-embed-continue', t: '已返回劇情', i: 'story', m: 'label' },
  // 放大檢視（照片牆、島地圖、望遠鏡、北面大窗）
  { t: '放大', i: 'zoom-in', m: 'icon' },
  { t: '縮小', i: 'zoom-out', m: 'icon' },
  { t: '還原', i: 'reset', m: 'icon' },
  { t: /^‹\s*回去$/, i: 'prev', m: 'icon', tip: '回去' },
  { t: /^‹?\s*上一章$/, i: 'prev', m: 'icon', tip: '上一章' },
  { t: /^下一章\s*›?$/, i: 'next', m: 'icon', tip: '下一章' },
  { t: /^‹?\s*上一頁$/, i: 'prev', m: 'icon', tip: '上一頁' },
  { t: /^下一頁\s*›?$/, i: 'next', m: 'icon', tip: '下一頁' },
  { t: '第一章', i: 'ch1', m: 'icon' }, { t: '第二章', i: 'ch2', m: 'icon' }, { t: '第三章', i: 'ch3', m: 'icon' },
  { t: '第四章', i: 'ch4', m: 'icon' }, { t: '第五章', i: 'ch5', m: 'icon' }, { t: '第六章', i: 'ch6', m: 'icon' }, { t: '第七章', i: 'ch7', m: 'icon' },
  { sel: '.sp2-btn', t: '回到照片牆', i: 'prev', m: 'label' },
  { sel: '.sp2-btn', t: '看完了', i: 'check', m: 'icon' },
  { sel: '.sp2-pin', t: '夾上牆', i: 'plus', m: 'label' },
  { sel: '.sp2-pin', t: '從牆上取下', i: 'clear', m: 'label' },
  { sel: '.sp2-btn', t: '自動夾最近六張', i: 'reset', m: 'label' },
  { sel: '.scope-area', t: '工作室小屋', i: 'home', m: 'label' },
  { sel: '.scope-area', t: '朝霞丘', i: 'sunrise', m: 'label' },
  { sel: '.scope-area', t: '海灘舞台', i: 'music', m: 'label' },
  { sel: '.scope-area', t: '月光岬', i: 'moon', m: 'label' },
  { sel: '.scope-area', t: '碼頭', i: 'water', m: 'label' },
  // 天色與時段：「白天／早上」「黃昏／天剛暗」只看圖分不清，留短字
  { sel: '.sp2-btn', t: '白天', i: 'sun', m: 'label' },
  { sel: '.sp2-btn', t: '早上', i: 'sunrise', m: 'label' },
  { sel: '.sp2-btn', t: '黃昏', i: 'sunset', m: 'label' },
  { sel: '.sp2-btn', t: '天亮前', i: 'predawn', m: 'label' },
  { sel: '.sp2-btn', t: '天剛暗', i: 'moon', m: 'label' },
  { sel: '.sp2-btn', t: '夜晚', i: 'moon', m: 'label' },
  { sel: '.sp2-btn', t: '素描本', i: 'sketchbook', m: 'icon' },
  { sel: '.sp2-btn', t: '冰紅茶', i: 'icetea', m: 'icon' },
  // 圓拱門、吉他
  { t: '出門到島上', i: 'door', m: 'label', s: '出門', tip: '出門到島上' },
  { t: /^刷弦/, i: 'pick', m: 'label', s: '刷弦' },
  { sel: '.sp-mute', i: 'clear', m: 'icon', tipFn: (_, node) => node.getAttribute('aria-label') },
  { sel: '.sp-chord', i: 'pick', m: 'prepend', tipFn: (_, node) => node.getAttribute('aria-label') },
  { sel: '.sp-pick-string', i: 'pick', m: 'icon' },
  { sel: '.sp-pace', i: 'hand', m: 'label' },
  { sel: '.sp-follow', i: 'music', m: 'label' },
  { sel: '.sp-play', t: '播放', i: 'play', m: 'icon' },
  { sel: '.sp-play', t: '暫停', i: 'pause', m: 'icon' },
  { sel: '.sp-restart', i: 'reset', m: 'icon' },
  { sel: '.sp-demo-solo', t: '示範', i: 'pick', m: 'label', tip: '單聽吉他示範' },
  { sel: '.sp-demo-backed', t: /^跟/, i: 'music', m: 'label' },
  { sel: '.sp-demo-solo, .sp-demo-backed', t: /^停止/, i: 'pause', m: 'label' },
  { sel: '.sp-arranger-bar', i: 'pick', m: 'prepend', tipFn: (_, node) => node.getAttribute('aria-label') },
  { sel: '.sp-arranger-pattern[data-pattern="down"]', i: 'pick', m: 'prepend', tip: '全下刷' },
  { sel: '.sp-arranger-pattern[data-pattern="mixed"]', i: 'music', m: 'prepend', tip: '下下上上下上' },
  { sel: '.sp-arranger-pattern[data-pattern="pima"]', i: 'hand', m: 'prepend', tip: '分解和弦 Pima' },
  { sel: '.sp-arranger-play', t: '播放編曲', i: 'play', m: 'label', s: '播放' },
  { sel: '.sp-arranger-play', t: '停止編曲', i: 'pause', m: 'label', s: '停止' },
  { sel: '.sp-arranger-add', i: 'plus', m: 'icon' },
  { sel: '.sp-arranger-remove', i: 'undo', m: 'icon' },
  { sel: '.sp-arranger-save', i: 'box', m: 'icon' },
  { sel: '.sp-arranger-clear', i: 'trash', m: 'icon' },
  { sel: '.sp-use-shape', i: 'pick', m: 'icon' },
  { sel: '.sp-progression', i: 'list', m: 'label', tipFn: text => '練習 ' + text },
  { sel: '.sp-clear', t: '放開', i: 'hand', m: 'label', tip: '放開（手指離開琴格）' },
  // 晨、詩的角落分頁：意思彼此接近（我來畫／請晨畫一張），留短字
  { sel: '.sf-tab', t: /^找(晨|詩|明)$/, i: 'chat', m: 'label' },
  { sel: '.sf-tab', t: '我來畫', i: 'pencil', m: 'label' },
  { sel: '.sf-tab', t: '請晨畫一張', i: 'easel', m: 'label' },
  { sel: '.sf-tab', t: '畫架展廳', i: 'frame', m: 'label' },
  { sel: '.sf-tab', t: '請詩做歌', i: 'music', m: 'label' },
  { sel: '.sf-tab', t: '詩做給妳的', i: 'music', m: 'label' },
  // 詩的黑膠唱盤（studio_album.mjs）
  { sel: '.sa-btn', t: '播放', i: 'play', m: 'icon' },
  { sel: '.sa-btn', t: '暫停', i: 'pause', m: 'icon' },
  { sel: '.sa-btn', t: '上一首', i: 'prev', m: 'icon', tip: '上一首（播超過 3 秒先回到開頭）' },
  { sel: '.sa-btn', t: '下一首', i: 'next', m: 'icon' },
  { sel: '.sa-btn', t: '靜音', i: 'music', m: 'icon' },
  { sel: '.sa-btn', t: '取消靜音', i: 'music', m: 'icon' },
  { sel: '.sa-go-create', t: '去請詩做歌', i: 'music', m: 'label', s: '請詩做歌' },
  // 聊天、作品
  { t: '送出', i: 'send', m: 'label' },
  { t: '想要更多次數', i: 'heartplus', m: 'label', s: '想要更多' },
  { t: '請晨開始畫', i: 'easel', m: 'label' },
  { t: '請詩開始做歌', i: 'music', m: 'label' },
  { t: '請晨也畫一張', i: 'easel', m: 'label' },
  { t: '讓晨看看', i: 'eye', m: 'label' },
  { t: '回到畫架展廳', i: 'prev', m: 'label', s: '回展廳' },
  { t: '回到和晨的聊天', i: 'prev', m: 'label', s: '回聊天' },
  { t: '回到收藏資料夾', i: 'prev', m: 'label', s: '回收藏' },
  // 畫圖工具
  { t: '橡皮擦', i: 'eraser', m: 'icon' },
  { sel: ':not(.cs-room *)', t: '復原', i: 'undo', m: 'icon', tip: '復原（收回上一筆）' },
  { sel: ':not(.cs-room *)', t: '清空', i: 'clear', m: 'icon', tip: '清空畫布' },
  // 明的電腦裡的按鈕（選單列與下拉選單不換，見檔頭）
  { sel: '.ming-exit', t: '回工作室', i: 'home', m: 'label' },
  { sel: '.ming-website-refresh', t: '重新整理', i: 'reset', m: 'icon' },
  { sel: '.ming-website-external', t: '在新分頁開啟', i: 'open', m: 'icon' },
  { t: '回明的電腦', i: 'monitor', m: 'label', s: '回電腦' },
  { t: '回到清單', i: 'list', m: 'icon' },
  { sel: ':not(.cs-room *)', t: '重做', i: 'reset', m: 'label', tip: '重做（請明重新做）' },
  { t: '刪掉', i: 'trash', m: 'label' },
  { t: '刪除', i: 'trash', m: 'icon' },
  { t: '請明做一個', i: 'gamepad', m: 'label' },
  { t: '打開', i: 'open', m: 'label' },
  { t: '重玩', i: 'play', m: 'icon' },
  { t: /^‹\s*劇情裡的檔案$/, i: 'prev', m: 'icon', tip: '回劇情裡的檔案', aria: '回劇情裡的檔案' },
  { t: '加入', i: 'plus', m: 'label' },
  { sel: ':not(.cs-record-cancel)', t: '取消', i: 'close', m: 'icon' },
  { t: '請明依劇情排一版', i: 'wand', m: 'label', s: '請明排一版' },
  { t: /^下載完整備份/, i: 'download', m: 'label', s: '下載備份', tip: '下載完整備份（.json 檔）' },
  { t: '套用設定 JSON', i: 'check', m: 'label', s: '套用設定' },
  { t: '請明幫忙調整', i: 'wand', m: 'label' },
  { t: '重新整理配對手機', i: 'reset', m: 'label', s: '重新整理' },
  { t: '現在同步手機資料', i: 'sync', m: 'label', s: '同步手機' },
  { t: '解除配對', i: 'unlink', m: 'label' },
  { t: '我知道了', i: 'check', m: 'label' },
  { sel: 'label.ming-backup-upload', i: 'upload', m: 'prepend', tip: '匯入備份（選一個 .json 檔）' },
  // 落地鏡旁的常駐位
  { sel: '.decor-action', t: '摸摸牠', i: 'paw', m: 'label' },
  { sel: '.decor-action', t: /^澆水/, i: 'water', m: 'label' },
  { sel: '.decor-action', t: '已經長大了', i: 'sprout', m: 'label' },
  { sel: '.decor-action', t: '收起來', i: 'box', m: 'label' },
  // 畫筆粗細：按鈕本身就畫了筆觸，只補 tooltip
  { sel: '.sf-draw-size', m: 'tip', tipFn: t => '筆刷：' + t }
];

const STYLES = ['A', 'B', 'C'];
const root = document.documentElement;
(function pickStyle() {
  const asked = String(new URLSearchParams(location.search).get('icons') || '').toUpperCase();
  if (STYLES.includes(asked)) root.dataset.iconStyle = asked;
  else if (!STYLES.includes(root.dataset.iconStyle)) root.dataset.iconStyle = 'A';
})();

function ruleFor(node, text) {
  for (const r of RULES) {
    if (r.sel && !node.matches(r.sel)) continue;
    if (r.t !== undefined && !(r.t instanceof RegExp ? r.t.test(text) : r.t === text)) continue;
    if (!r.sel && r.t === undefined) continue;
    return r;
  }
  return null;
}

// restore：還原成原本的文字；程式自己換了新文字、新文字沒有對應圖示時不還原，只拿掉樣式。
function undecorate(node, restore = true) {
  if (!node.classList.contains('sp-icon-btn') && !node.dataset.spMode) return;
  if (node.dataset.spMode === 'prepend') node.querySelector(':scope > .sp-ic')?.remove();
  else if (restore && node.dataset.spText !== undefined && node.querySelector(':scope > .sp-ic')) node.textContent = node.dataset.spText;
  node.classList.remove('sp-icon-btn', 'sp-icon-only', 'sp-with-label');
  if (node.dataset.spAria) node.removeAttribute('aria-label');
  ['spText', 'spAria', 'spMode', 'tip', 'icon'].forEach(k => delete node.dataset[k]);
}

function decorate(node) {
  const mode = node.dataset.spMode;
  if (mode === 'tip') return;
  if (mode && node.querySelector(':scope > .sp-ic')) return;   // 已經套過，內容也還在
  const text = mode === 'prepend' ? node.textContent.trim() : node.textContent.replace(/\s+/g, ' ').trim();
  const rule = ruleFor(node, text);
  if (!rule) { if (mode) undecorate(node, false); return; }
  const tip = rule.tipFn ? rule.tipFn(text, node) : (rule.tip || text);
  node.dataset.tip = tip;
  node.dataset.spMode = rule.m;
  if (rule.m === 'tip') return;
  if (!node.hasAttribute('aria-label') || node.dataset.spAria) { node.setAttribute('aria-label', rule.aria || text); node.dataset.spAria = '1'; }
  node.dataset.icon = rule.i;
  const ic = document.createElement('span');
  ic.className = 'sp-ic'; ic.dataset.icon = rule.i; ic.setAttribute('aria-hidden', 'true');
  node.classList.add('sp-icon-btn');
  node.classList.toggle('sp-icon-only', rule.m === 'icon');
  node.classList.toggle('sp-with-label', rule.m !== 'icon');
  if (rule.m === 'prepend') { node.prepend(ic); return; }
  node.dataset.spText = text;
  const label = document.createElement('span');
  label.className = 'sp-icon-label';
  label.textContent = rule.m === 'icon' ? text : (rule.s || text);
  node.replaceChildren(ic, label);
}

const CANDIDATE = 'button, label.ming-backup-upload, a.ming-website-external';
function scan(scope) {
  if (scope.nodeType !== 1) return;
  if (scope.matches(CANDIDATE)) decorate(scope);
  scope.querySelectorAll(CANDIDATE).forEach(decorate);
}

const observer = new MutationObserver(records => {
  const todo = new Set();
  for (const r of records) {
    if (r.type === 'attributes') { if (r.target.id === 'panel') todo.add(r.target); continue; }
    const host = (r.target.nodeType === 1 ? r.target : r.target.parentElement)?.closest(CANDIDATE);
    if (host) todo.add(host);
    r.addedNodes.forEach(n => { if (n.nodeType === 1) todo.add(n); });
  }
  todo.forEach(n => { if (n.isConnected) scan(n); });
});

// ── tooltip：紙卡風小提示，滑鼠停留、鍵盤焦點、觸控長按 ──
let tip = null, tipFor = null, hideTimer = 0, longTimer = 0, swallowClick = false;
function tipEl() {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'sp-tip'; tip.setAttribute('role', 'tooltip'); tip.id = 'sp-tip'; tip.hidden = true;
    document.body.appendChild(tip);
  }
  return tip;
}
function showTip(node, ms) {
  const text = node.dataset.tip;
  if (!text) return;
  clearTimeout(hideTimer);
  const t = tipEl();
  t.textContent = text; t.hidden = false; tipFor = node;
  t.classList.remove('below', 'on');
  const r = node.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight;
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight;
  let top = r.top - h - 10;
  if (top < 6) { top = Math.min(r.bottom + 10, vh - h - 6); t.classList.add('below'); }
  const cx = r.left + r.width / 2;
  const left = Math.max(6, Math.min(vw - w - 6, cx - w / 2));
  t.style.left = left + 'px'; t.style.top = top + 'px';
  t.style.setProperty('--arrow-x', Math.max(10, Math.min(w - 10, cx - left)) + 'px');
  requestAnimationFrame(() => t.classList.add('on'));
  if (ms) hideTimer = setTimeout(hideTip, ms);
}
function hideTip() { if (tip) { tip.classList.remove('on'); tip.hidden = true; } tipFor = null; }

function tipTarget(event) { return event.target.closest?.('[data-tip]') || null; }

function start() {
  scan(document.body);
  observer.observe(document.body, { subtree: true, childList: true, characterData: true });
  const panel = document.getElementById('panel');
  if (panel) observer.observe(panel, { attributes: true, attributeFilter: ['data-design'] });
  document.addEventListener('pointerover', e => { if (e.pointerType === 'mouse') { const n = tipTarget(e); if (n) showTip(n); } });
  document.addEventListener('pointerout', e => { if (e.pointerType === 'mouse' && tipFor && !tipFor.contains(e.relatedTarget)) hideTip(); });
  // 鍵盤焦點才跳提示；開面板時程式把焦點放到關閉鈕，那時不跳
  let keyboard = false;
  document.addEventListener('keydown', e => { if (e.key === 'Tab' || e.key.startsWith('Arrow')) keyboard = true; }, true);
  document.addEventListener('pointerdown', () => { keyboard = false; }, true);
  document.addEventListener('focusin', e => { const n = tipTarget(e); if (n && keyboard) showTip(n); else hideTip(); });
  document.addEventListener('focusout', () => hideTip());
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && tipFor) hideTip(); });
  document.addEventListener('scroll', () => { if (tipFor && !tipFor.matches(':hover')) hideTip(); }, true);
  document.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') { hideTip(); return; }
    const n = tipTarget(e); if (!n) return;
    clearTimeout(longTimer);
    longTimer = setTimeout(() => { swallowClick = true; showTip(n, 1800); }, 480);
  });
  const cancel = () => clearTimeout(longTimer);
  document.addEventListener('pointerup', cancel); document.addEventListener('pointercancel', cancel); document.addEventListener('pointermove', e => { if (e.pointerType !== 'mouse' && (Math.abs(e.movementX) + Math.abs(e.movementY) > 6)) cancel(); });
  // 長按只是看提示，放開時不要順便按下去
  document.addEventListener('click', e => { if (swallowClick) { swallowClick = false; e.preventDefault(); e.stopPropagation(); } }, true);
  document.addEventListener('contextmenu', e => { if (e.target.closest?.('.sp-icon-btn')) e.preventDefault(); });
}
if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);

window.STUDIO_ICONS = {
  styles: STYLES,
  rules: RULES,
  get style() { return root.dataset.iconStyle; },
  setStyle(s) { if (STYLES.includes(s)) root.dataset.iconStyle = s; },
  scan: () => scan(document.body),
  show: n => showTip(n),
  hide: hideTip
};
