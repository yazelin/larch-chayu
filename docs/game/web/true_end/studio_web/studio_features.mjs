import { renderDraw, taipeiDay, LOOK_DAILY_LIMIT } from './studio_draw.mjs';
import { headFor, CHARACTERS, DEFAULT_SETTINGS, mockRequest, mockPoll, parseGroupReply, readGameState, sanitizeProgress, sanitizeSettings, quotaMessage, QUOTA_DEFAULTS, TRIAL_LINES, DAILY_KINDS, isTrialLimit, isDailyLimit, quotaHelpLine, quotaHint, QUOTA_KINDS, QUOTA_UNKNOWN, QUOTA_RESET_NOTE } from './studio_core.mjs';

const $ = (selector, root) => (root || document).querySelector(selector);
const panel = $('#panel');
const panelTitle = $('#panel-title');
const panelBody = $('#panel-body');
const scrim = $('#scrim');
const closeButton = $('#panel-close');
const query = new URLSearchParams(location.search);
const mockMode = query.get('mock') === '1';
// larch:init 常比這支模組早到（index.html 先收）：有的話先用那一份，天數才不會停在預設的第 1 天
let larchVariables = (window.__studio && window.__studio.variables) || {};
let game = readGameState(location.search, larchVariables);
let returnFocus = null;
let ephemeralUrls = [];

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(label, action, className) {
  const node = el('button', 'sf-button' + (className ? ' ' + className : ''), label);
  node.type = 'button';
  if (action) node.addEventListener('click', action);
  return node;
}

function panelOpen(title, focus) {
  returnFocus = focus || document.activeElement;
  panelTitle.textContent = title;
  panel.classList.add('studio-feature-panel', 'on');
  panel.setAttribute('aria-hidden', 'false');
  scrim.classList.add('on');
  closeButton.focus({ preventScroll: true });
}

function closeFeature() {
  panel.classList.remove('sf-wide');
  if (!panel.classList.contains('studio-feature-panel')) return;
  panel.classList.remove('studio-feature-panel');
  if (returnFocus && returnFocus.focus) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
  ephemeralUrls.forEach(URL.revokeObjectURL);
  ephemeralUrls = [];
}

closeButton.addEventListener('click', closeFeature);
scrim.addEventListener('click', closeFeature);
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape') closeFeature();
});

function clearBody() {
  panel.classList.remove('sf-wide');
  ephemeralUrls.forEach(URL.revokeObjectURL);
  ephemeralUrls = [];
  panelBody.replaceChildren();
}

function contextLine(character) {
  // 玩家只看「第 N 天」；第幾章、好感值是製作時對狀態用的，只在網址帶 debug=1 時顯示（作者 2026-11-18）
  const line = el('p', 'sf-context', '第 ' + game.day + ' 天');
  if (query.get('debug') === '1') {
    line.append('・第 ' + game.chapter + ' 章');
    if (character && CHARACTERS[character]) line.append('・好感 ' + game.affinity[character]);
  }
  return line;
}

function addContext(container, character) {
  container.appendChild(contextLine(character));
}

function apiBase() {
  // 本機測試可以用 ?api=http://127.0.0.1:… 指到本機 Worker（只收本機網址）。
  const local = query.get('api');
  if (local && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(local)) return local;
  const meta = $('meta[name="studio-chat-api-base"]');
  return String(window.STUDIO_CHAT_API_BASE || (meta && meta.content) || '').replace(/\/+$/, '');
}

function larchMode() { return window.StudioDB && window.StudioDB.mode === 'larch'; }

// 身分（計劃 新版/_計劃_AI額度分級_2026-11-19.md）：Larch 劇情變數 paidFull 是 true（走過付費鎖後那張設定變數的卡）就是 owned，
// 其餘一律 trial；網站版（GitHub Pages）沒有這個變數，算試玩（作者 2026-11-19 定）。
// 假資料模式可以用網址 ?tier=trial／owned 切換，並在本機模擬兩種額度（測試用）。
function truthy(value) { return value === true || value === 1 || value === 'true' || value === '1'; }
const mockTierParam = mockMode && ['trial', 'owned'].includes(query.get('tier')) ? query.get('tier') : '';
function studioTier() {
  if (mockTierParam) return mockTierParam;
  return truthy(larchVariables.paidFull) ? 'owned' : 'trial';
}

// 假資料模式的額度（只有網址帶 tier 時才模擬；沒帶時照舊不限，舊的測試不受影響）。數字跟 Worker 預設同一份。
const MOCK_KINDS = { '/img': 'image', '/music': 'song', '/look': 'look', '/chat': 'chat' };
async function mockQuotaTake(path, payload) {
  const kind = MOCK_KINDS[path];
  if (!mockTierParam || !kind || (path === '/chat' && payload && payload.action)) return null;
  const tier = mockTierParam, rule = QUOTA_DEFAULTS[tier][kind];
  const key = 'mockQuota:' + tier + ':' + kind + ':' + (rule.scope === 'total' ? 'total' : taipeiDay());
  const used = Number(await StudioDB.get(key).catch(function () { return 0; })) || 0;
  if (used >= rule.limit) {
    const full = new Error('mock：次數用完。');
    full.code = tier === 'trial' ? { image: 'TRIAL_IMAGE_LIMIT', song: 'TRIAL_MUSIC_LIMIT', look: 'TRIAL_LOOK_LIMIT', chat: 'TRIAL_CHAT_LIMIT' }[kind] : { image: 'DAILY_IMAGE_LIMIT', song: 'DAILY_MUSIC_LIMIT', look: 'DAILY_LOOK_LIMIT', chat: 'DAILY_CHAT_LIMIT' }[kind];
    full.limit = rule.limit; full.scope = rule.scope; full.tier = tier;
    throw full;
  }
  await StudioDB.set(key, used + 1);
  return { limit: rule.limit, scope: rule.scope, remaining: rule.limit - used - 1, key: key };
}
async function mockQuotaStatus(kind) {
  const tier = mockTierParam, rule = QUOTA_DEFAULTS[tier][kind];
  const key = 'mockQuota:' + tier + ':' + kind + ':' + (rule.scope === 'total' ? 'total' : taipeiDay());
  const used = Number(await StudioDB.get(key).catch(function () { return 0; })) || 0;
  return { limit: rule.limit, scope: rule.scope, tier: tier, remaining: Math.max(0, rule.limit - used) };
}
async function mockQuotaGive(taken) { if (taken) await StudioDB.set(taken.key, Math.max(0, (Number(await StudioDB.get(taken.key).catch(function () { return 1; })) || 1) - 1)); }

async function callWorker(path, payload) {
  // 假資料模式記下最後一次請求，測試用來確認每個對話只帶自己的記憶摘要。
  if (mockMode) {
    window.STUDIO_LAST_REQUEST = { path: path, payload: payload };
    const taken = await mockQuotaTake(path, payload);
    const result = await mockRequest(path, payload);
    if (taken && path === '/look' && result.fallback) await mockQuotaGive(taken);   // 跟 Worker 一樣：晨沒看成就還回去
    return taken ? Object.assign({ limit: taken.limit, scope: taken.scope, remaining: taken.remaining + (path === '/look' && result.fallback ? 1 : 0) }, result) : result;
  }
  const url = apiBase() + path;
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(function () { return {}; });
  if (!response.ok) {
    const error = new Error(data.message || data.error || '工作室服務回應錯誤（' + response.status + '）');
    error.code = data.code || '';
    if (data.limit !== undefined) { error.limit = data.limit; error.scope = data.scope; error.tier = data.tier; }
    throw error;
  }
  return data;
}

// ── 額度用完 ──
// 試玩用完：那位角色講一句（TRIAL_LINES），不出現價格、不帶去付款頁。
// 已購買每天用完：原本的每日提示，旁邊一顆「想要更多次數」（月費還沒開，只記一筆意願；同一種只記一次）。
function trialLineBubble(code, speaker) {
  const line = TRIAL_LINES[code];
  const bubble = renderMessage({ role: 'assistant', speaker: speaker || line.speaker || 'shi', content: line.text });
  bubble.dataset.trialLimit = code;
  return bubble;
}
// ── 顯示次數：每次都問 Worker GET /quota（不佔額度）；讀不到（離線、假資料模式、舊版 Worker）回 null，畫面就不寫數字 ──
async function quotaSnapshot() {
  if (mockMode) return null;
  try {
    const response = await fetch(apiBase() + '/quota?player=' + encodeURIComponent(await playerId()) + '&tier=' + studioTier());
    const data = await response.json().catch(function () { return null; });
    if (!response.ok || !data || !data.quotas || !QUOTA_KINDS.every(function (kind) { return quotaHint(kind, data.quotas[kind]); })) return null;
    return data.quotas;
  } catch (error) { return null; }
}
// 介面上的小字（今天還能聊 12 句／還能畫 1 張）；refresh() 在打開、送出之後、作品做好或沒做成時各問一次
function quotaHintEl(kind) {
  const hint = el('p', 'sf-quota-hint');
  hint.dataset.quota = kind;
  hint.hidden = true;
  hint.refresh = async function () {
    const quotas = await quotaSnapshot();
    const text = quotas ? quotaHint(kind, quotas[kind]) : '';
    hint.textContent = text;
    hint.hidden = !text;
  };
  hint.refresh();
  return hint;
}

function wantKey(kind) { return 'wantMore:' + kind; }
function wantMoreRow(code, limit, textless, scope) {
  const kind = DAILY_KINDS[code];
  const row = el('span', 'sf-limit');   // 會放進 <p class="sf-status">，所以用 span
  row.dataset.limit = code;
  if (!textless) row.appendChild(el('span', 'sf-limit-text', quotaMessage(code, '', limit, scope)));
  // 試玩玩家被 IP 那一份擋下時也會回每日的代碼；他還沒買，不放按鈕
  if (studioTier() !== 'owned') return row;
  const want = button('想要更多次數', null, 'sf-want');
  want.dataset.want = kind;
  // 只有每天的額度才說明天會恢復；總共的（之後改成一池時）用完不會恢復，不這樣講
  const thanks = el('span', 'sf-want-thanks', scope === 'total' ? '謝謝，我們記下來了。' : '謝謝，我們記下來了。次數明天會恢復。');
  thanks.hidden = true;
  async function done() { want.hidden = true; thanks.hidden = false; }
  StudioDB.get(wantKey(kind)).then(function (sent) { if (sent) done(); }).catch(function () {});
  want.addEventListener('click', async function () {
    if (want.disabled) return;
    want.disabled = true;
    try {
      if (!mockMode) await callWorker('/want', { playerId: await playerId(), kind: kind, tier: studioTier() });
      else window.STUDIO_LAST_WANT = { kind: kind, tier: studioTier() };
      await StudioDB.set(wantKey(kind), true).catch(function () {});
      done();
    } catch (error) { want.disabled = false; }
  });
  row.append(want, thanks);
  return row;
}

async function playerId() {
  let id = await StudioDB.get('anonymousPlayerId');
  if (id) currentPlayerId = id;
  if (!id) {
    id = window.crypto && crypto.randomUUID ? crypto.randomUUID() : 'p-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    await StudioDB.set('anonymousPlayerId', id);
    currentPlayerId = id;
  }
  return id;
}

// 長期記憶每個對話各一份（2026-11-16 作者定）：chatMemory:chen／ming／shi 跟一對一聊天走，
// chatMemory:group 跟長桌群聊走；跟晨說的事不會帶進明的請求。舊版共用的 chatMemory 遷移成群聊那份。
function memoryKey(conversation) { return 'chatMemory:' + (conversation || 'group'); }
function summaryCountKey(conversation) { return 'chatSummaryCount:' + (conversation || 'group'); }

const memoryMigration = (async function migrateSharedMemory() {
  try {
    const old = await StudioDB.get('chatMemory');
    if (old === undefined) return;
    if (!(await StudioDB.get(memoryKey('group')))) await StudioDB.set(memoryKey('group'), old);
    const group = await StudioDB.get('chat:group');
    if ((await StudioDB.get(summaryCountKey('group'))) === undefined) await StudioDB.set(summaryCountKey('group'), Array.isArray(group) ? group.length : 0);
    await StudioDB.remove('chatMemory');
    await StudioDB.remove('chatSummaryCount');
  } catch (error) { /* 沒有 IndexedDB 時略過 */ }
})();

async function workerContext(conversation) {
  await memoryMigration;
  return {
    day: game.day,
    chapter: game.chapter,
    plotSummary: game.summary,
    trialKnown: game.trialKnown,
    affection: game.affinity,
    playerId: await playerId(),
    tier: studioTier(),
    memory: await StudioDB.get(memoryKey(conversation)) || ''
  };
}

function actorAvatar(character, mood) {
  const img = el('img', 'sf-avatar');
  img.src = headFor(character, mood);   // 這句話的表情有圖就用那張，沒有就是平常的頭像
  if (mood) img.dataset.mood = mood;
  img.alt = character === 'user' ? '茶語' : CHARACTERS[character].name;
  return img;
}

// 「妳給晨看了一張畫」：聊天串裡不是一句話，是一行記事加縮圖（點縮圖看大圖）
function renderDrawingNote(message) {
  const row = el('div', 'sf-draw-note');
  row.dataset.draw = message.draw;
  row.appendChild(el('span', '', '妳給晨看了一張畫'));
  const thumb = el('img', 'sf-draw-thumb'); thumb.alt = '妳畫的畫'; thumb.hidden = true;
  row.appendChild(thumb);
  StudioDB.get('drawing:' + message.draw).then(function (work) {
    const src = work ? workSrc(work) : '';
    if (!src) return;
    thumb.src = src; thumb.hidden = false; thumb.alt = work.title || '妳畫的畫';
    thumb.addEventListener('click', function () { showImage(work, false); });
  }).catch(function () {});
  return row;
}

function renderMessage(message) {
  if (message.draw) return renderDrawingNote(message);
  const character = message.role === 'user' ? 'user' : (message.speaker || 'shi');
  const row = el('div', 'sf-message' + (message.role === 'user' ? ' me' : ''));
  row.appendChild(actorAvatar(character, message.mood));
  const body = el('div', 'sf-message-body');
  body.appendChild(el('span', 'sf-name', message.role === 'user' ? '茶語' : CHARACTERS[character].name));
  body.appendChild(el('div', 'sf-bubble', message.content));
  row.appendChild(body);
  return row;
}

function messageLine(message, group) {
  if (message.role === 'user') return { role: 'user', content: message.content };
  const who = CHARACTERS[message.speaker] ? CHARACTERS[message.speaker].name : '夥伴';
  return { role: 'assistant', content: group ? who + '：' + message.content : message.content };
}

function summaryTsKey(conversation) { return 'chatSummaryTs:' + (conversation || 'group'); }

async function summarizeIfNeeded(conversation) {
  // 只摘要這個對話自己的內容；從上次摘要之後多了十則才摘一次。用時間記號而不是則數，
  // 因為 Larch 模式只留最近 40 則，則數會停住。
  const sessionKey = 'chat:' + (conversation || 'group');
  const all = (await StudioDB.get(sessionKey)) || [];
  const doneTs = await StudioDB.get(summaryTsKey(conversation));
  let fresh;
  if (doneTs === undefined) fresh = all.slice(Number(await StudioDB.get(summaryCountKey(conversation))) || 0);
  else fresh = all.filter(function (item) { return item.ts > doneTs; });
  if (fresh.length < 10) return;
  const result = await callWorker('/summarize', Object.assign({}, await workerContext(conversation), {
    messages: all.slice(-60).map(function (item) { return { role: item.role, content: messageLine(item, conversation === 'group').content }; }),
    prevMemory: await StudioDB.get(memoryKey(conversation)) || ''
  }));
  if (!result.summary) throw new Error('摘要服務沒有回傳摘要');
  await StudioDB.set(memoryKey(conversation), String(result.summary).slice(0, 1200));
  await StudioDB.set(summaryTsKey(conversation), all[all.length - 1].ts);
  await StudioDB.remove(summaryCountKey(conversation));
}

async function renderChat(character, group, root) {
  const sessionKey = group ? 'chat:group' : 'chat:' + character;
  const history = await StudioDB.get(sessionKey) || [];
  const chat = el('div', 'sf-chat');
  const log = el('div', 'sf-chat-log');
  history.forEach(function (message) { log.appendChild(renderMessage(message)); });
  chat.appendChild(log);
  const composer = el('div', 'sf-composer');
  const input = el('textarea', 'sf-input sf-textarea');
  input.rows = 2;
  input.maxLength = 1200;
  input.placeholder = group ? '在長桌邊說點什麼……' : '跟' + CHARACTERS[character].name + '說點什麼……';
  const send = button('送出', null, 'primary');
  const status = el('div', 'sf-status');
  composer.append(input, send);
  const hint = quotaHintEl('chat');
  chat.append(composer, status, hint);
  root.appendChild(chat);
  log.scrollTop = log.scrollHeight;

  async function submit() {
    const content = input.value.trim();
    if (!content || send.disabled) return;
    input.value = '';
    send.disabled = true;
    status.textContent = '聽妳說……';
    const userMessage = { role: 'user', content: content, ts: Date.now() };
    history.push(userMessage);
    log.appendChild(renderMessage(userMessage));
    await StudioDB.set(sessionKey, history);
    try {
      const base = await workerContext(group ? 'group' : character);
      const payload = Object.assign({}, base, {
        mode: 'chat', character: character || 'group', group: !!group,
        messages: history.slice(-16).map(function (message) { return messageLine(message, group); })
      });
      const result = await callWorker('/chat', payload);
      const responses = group ? parseGroupReply(result.replies || result.reply || result.json) : null;
      const replyItems = group
        ? ['chen', 'ming', 'shi'].map(function (key) { return { speaker: key, content: responses[key], mood: result.moods && result.moods[key] }; })
        : [{ speaker: character, content: String(result.reply || result.text || ''), mood: result.mood }];
      if (replyItems.some(function (item) { return !item.content; })) throw new Error('聊天服務沒有回傳文字');
      replyItems.forEach(function (item, index) {
        const record = { role: 'assistant', speaker: item.speaker, content: item.content, ts: Date.now() + index };
        if (item.mood && item.mood !== 'neutral') record.mood = item.mood;
        history.push(record);
        log.appendChild(renderMessage(record));
      });
      await StudioDB.set(sessionKey, history);
      status.textContent = '';
      summarizeIfNeeded(group ? 'group' : character).catch(function () { status.textContent = '聊天已儲存；記憶摘要稍後再試。'; });
    } catch (error) {
      if (error.code === 'TRIAL_CHAT_LIMIT') { status.textContent = ''; log.appendChild(trialLineBubble(error.code, group ? 'ming' : character)); return; }
      if (isDailyLimit(error.code)) { status.replaceChildren(wantMoreRow(error.code, error.limit, false, error.scope)); return; }
      const fail = error.code ? quotaMessage(error.code, character) : '網路暫時沒有接通。等一下再試。';
      const speaker = group ? 'ming' : character;
      const record = { role: 'assistant', speaker: speaker, content: fail, ts: Date.now() };
      history.push(record);
      log.appendChild(renderMessage(record));
      await StudioDB.set(sessionKey, history);
      status.textContent = error.code ? '' : error.message;
    } finally {
      send.disabled = false;
      hint.refresh();
      log.scrollTop = log.scrollHeight;
      input.focus();
    }
  }
  send.addEventListener('click', submit);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); }
  });
}

function setupTabs(tabs, render, initialId) {
  const nav = el('nav', 'sf-tabs');
  const content = el('div', 'sf-stack');
  let current = initialId || tabs[0].id;
  function choose(id) {
    current = id;
    panel.classList.toggle('sf-wide', id === 'draw');   // 畫板要大：桌機版這個分頁把面板放寬放高（studio_features.css）
    nav.querySelectorAll('button').forEach(function (tab) { tab.setAttribute('aria-selected', String(tab.dataset.tab === id)); });
    const view = el('div');
    content.replaceChildren(view);
    ephemeralUrls.forEach(URL.revokeObjectURL); ephemeralUrls = [];
    Promise.resolve(render(id, view)).catch(function (error) { view.replaceChildren(el('p', 'sf-status', error.message)); });
  }
  tabs.forEach(function (item) {
    const tab = button(item.label, function () { choose(item.id); }, 'sf-tab');
    tab.dataset.tab = item.id; tab.setAttribute('aria-selected', 'false'); nav.appendChild(tab);
  });
  panelBody.append(nav, content);
  choose(current);
}

function openCharacter(character, focus, initialTab, options) {
  const person = CHARACTERS[character];
  panelOpen(person.name + '的角落', focus);
  clearBody();
  addContext(panelBody, character);
  const tabs = character === 'chen'
    ? [{ id: 'chat', label: '找晨' }, { id: 'draw', label: '我來畫' }, { id: 'create', label: '請晨畫一張' }, { id: 'gallery', label: '畫架展廳' }]
    : [{ id: 'chat', label: '找詩' }, { id: 'create', label: '請詩做歌' }, { id: 'album', label: '唱片專輯' }];
  setupTabs(tabs, async function (tab, content) {
    if (tab === 'chat') { await renderChat(character, false, content); return; }
    if (tab === 'gallery') { await renderGallery(content); return; }
    if (tab === 'album') { await renderAlbum(content); return; }
    if (tab === 'draw') { await renderDrawTab(content); return; }
    const first = options; options = null;   // 帶進來的題目只用一次
    await renderCreation(character, content, first);
  }, initialTab || 'chat');
}

function openDirectChat(character, focus) {
  const person = CHARACTERS[character];
  if (!person) return false;
  panelOpen('和' + person.name + '聊天', focus);
  clearBody();
  addContext(panelBody, character);
  renderChat(character, false, panelBody).catch(function (error) {
    panelBody.appendChild(el('p', 'sf-status', error.message));
  });
  return true;
}

async function savedWorks(kind) {
  const entries = await StudioDB.entries();
  return entries.filter(function (entry) { return String(entry[0]).startsWith(kind + ':'); })
    .map(function (entry) { return entry[1]; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
}

// 作品的來源：網站版有 Blob 就用；Larch 版只存作品編號，從 Worker 的 /work 讀（R2，90 天沒打開會刪）。
function workSrc(work) {
  if (work.blob instanceof Blob) return objectUrl(work.blob);
  if (work.workUrl) return work.workUrl;
  if (work.workId && currentPlayerId) return apiBase() + '/work?id=' + encodeURIComponent(work.workId) + '&player=' + encodeURIComponent(currentPlayerId);
  return '';
}
let currentPlayerId = '';

function objectUrl(blob) {
  const url = URL.createObjectURL(blob);
  ephemeralUrls.push(url);
  return url;
}

async function blobFromResult(value, mimeType) {
  if (value instanceof Blob) return value;
  if (typeof value !== 'string' || !value) throw new Error('作品資料是空的');
  if (value.startsWith('data:')) {
    const response = await fetch(value);
    return response.blob();
  }
  const binary = atob(value.replace(/\s/g, ''));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType || 'application/octet-stream' });
}

// 畫圖、作曲都「先打後查」：送出後拿 jobId，存進 IndexedDB（job:<jobId>），每幾秒查一次。
// 關掉面板或重新整理也會接著查（頁面載入時 resumeJobs），做好收進畫架／唱片架並跳通知。
const JOB_POLL_MS = mockMode ? 600 : 4000;
const activeJobs = new Map();
const jobListeners = new Set();

async function callWorkerJob(path, jobId) {
  if (mockMode) return mockPoll(path, jobId);
  const response = await fetch(apiBase() + path + '?job=' + encodeURIComponent(jobId) + '&player=' + encodeURIComponent(await playerId()) + (larchMode() ? '&lite=1' : ''), { method: 'GET' });
  const data = await response.json().catch(function () { return {}; });
  if (!response.ok) {
    const error = new Error(data.message || data.error || '查進度失敗（' + response.status + '）');
    error.code = data.code || ''; error.status = response.status;
    throw error;
  }
  return data;
}

function toast(text) {
  let box = document.getElementById('sf-toasts');
  if (!box) { box = el('div', 'sf-toasts'); box.id = 'sf-toasts'; box.setAttribute('aria-live', 'polite'); document.body.appendChild(box); }
  const item = el('div', 'sf-toast', text);
  box.appendChild(item);
  setTimeout(function () { item.remove(); }, 8000);
}

async function saveWork(record, result) {
  const chen = record.kind === 'image';
  const field = chen ? (result.image || result.imageBase64 || result.data) : (result.audio || result.audioBase64 || result.data);
  const blob = field ? await blobFromResult(field, result.mimeType || result.contentType) : null;
  if (!blob && !result.workId) throw new Error('作品資料是空的');
  const id = 'work-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const work = {
    id: id, kind: record.kind, title: String(result.title || record.title || record.prompt).slice(0, 100),
    prompt: record.prompt, blob: larchMode() ? undefined : (blob || undefined), mimeType: (blob && blob.type) || result.mimeType || 'application/octet-stream',
    lyrics: String(result.lyrics || ''), createdAt: Date.now(), jobId: record.jobId || '', workId: result.workId || '', workUrl: result.workUrl || ''
  };
  await StudioDB.set((chen ? 'image:' : 'song:') + id, work);
  return work;
}

function notifyJob(event) { jobListeners.forEach(function (listener) { try { listener(event); } catch (error) { /* 面板已經換掉 */ } }); }

function pollJob(record) {
  if (activeJobs.has(record.jobId)) return activeJobs.get(record.jobId);
  const path = record.kind === 'image' ? '/img' : '/music';
  const who = record.kind === 'image' ? '晨' : '詩';
  const task = (async function () {
    let failures = 0;
    for (;;) {
      await new Promise(function (resolve) { setTimeout(resolve, JOB_POLL_MS); });
      let result;
      try { result = await callWorkerJob(path, record.jobId); failures = 0; }
      catch (error) {
        // Worker 找不到這個工作（紀錄已經清掉）：不會再做好了，當成沒做成，刪掉 job，重新整理也不再查。
        if (error.code === 'JOB_NOT_FOUND') {
          await StudioDB.remove('job:' + record.jobId);
          const lost = '這次沒有做成，可以再試一次。';
          toast(record.kind === 'image' ? '晨這張沒畫成：' + lost : '詩這首沒做成：' + lost);
          notifyJob({ record: record, state: 'error', message: lost });
          return;
        }
        // 網路或服務一時沒回應：保留 job，稍後再查；連續失敗很多次才放棄這一輪（重新整理還會再接）。
        failures += 1;
        if (failures >= 20) { notifyJob({ record: record, state: 'stalled', message: error.message }); return; }
        continue;
      }
      if (result.status === 'pending') continue;
      await StudioDB.remove('job:' + record.jobId);
      if (result.status === 'done') {
        try {
          const work = await saveWork(record, result);
          toast(record.kind === 'image' ? '晨畫好了：「' + work.title + '」，掛進畫架展廳了。' : '詩的歌做好了：「' + work.title + '」，收進唱片專輯了。');
          notifyJob({ record: record, state: 'done', work: work });
        } catch (error) {
          toast(who + '的作品存不下來：' + error.message);
          notifyJob({ record: record, state: 'error', message: error.message });
        }
        return;
      }
      const message = result.error || '沒有做成。';
      toast(record.kind === 'image' ? '晨這張沒畫成：' + message : '詩這首沒做成：' + message);
      notifyJob({ record: record, state: 'error', message: message });
      return;
    }
  })().finally(function () { activeJobs.delete(record.jobId); });
  activeJobs.set(record.jobId, task);
  return task;
}

async function pendingJobs(kind) {
  const entries = await StudioDB.entries();
  return entries.filter(function (entry) { return String(entry[0]).startsWith('job:') && entry[1] && (!kind || entry[1].kind === kind); })
    .map(function (entry) { return entry[1]; }).sort(function (a, b) { return a.createdAt - b.createdAt; });
}

async function resumeJobs() {
  try { (await pendingJobs()).forEach(pollJob); } catch (error) { /* 沒有 IndexedDB 時不續查 */ }
}

// ── 我來畫（studio_draw.mjs）：畫板的進度、額度、送給晨看、收進展廳與聊天串 ──
async function drawProgress() {
  const plants = new Set(String(larchVariables.plants || query.get('plants') || '').split(',').filter(Boolean));
  try { const seen = await StudioDB.get('plants_seen'); if (Array.isArray(seen)) seen.forEach(function (id) { plants.add(id); }); } catch (error) { /* 沒有就只看變數 */ }
  // 島段完成旗標、小委託：Larch 有帶進來就用（測試可以從網址帶同名參數）；沒帶的話畫板退回看第幾天與植物
  const vars = {};
  ['ch3_done', 'chapter3_dawn_done', 'ch4_done', 'ch5_done', 'errand_chen'].forEach(function (name) {
    if (larchVariables[name] !== undefined) vars[name] = larchVariables[name]; else if (query.has(name)) vars[name] = query.get(name);
  });
  return { day: game.day, plants: plants, vars: vars, all: query.get('unlock') === 'all' };
}
// 假資料模式的額度記在本機（真的額度在 Worker 的 D1）
async function mockLookCount() {
  const today = taipeiDay();
  let count = null;
  try { count = await StudioDB.get('lookCount'); } catch (error) { /* 當成 0 */ }
  return count && count.day === today ? count : { day: today, n: 0 };
}
// 還能給晨看幾次：{ remaining, limit, scope（day／total）, tier }；問不到回 null。
async function lookRemaining() {
  if (mockMode && mockTierParam) return mockQuotaStatus('look');
  if (mockMode) return { remaining: LOOK_DAILY_LIMIT - (await mockLookCount()).n, limit: LOOK_DAILY_LIMIT, scope: 'day', tier: studioTier() };
  const response = await fetch(apiBase() + '/look?player=' + encodeURIComponent(await playerId()) + '&tier=' + studioTier());
  const data = await response.json().catch(function () { return {}; });
  return response.ok && typeof data.remaining === 'number' ? { remaining: data.remaining, limit: data.limit, scope: data.scope || 'day', tier: studioTier() } : null;
}
function chenBubble(text, mood) {
  return renderMessage({ role: 'assistant', speaker: 'chen', content: text, mood: mood });
}
async function lookAtDrawing(dataUrl) {
  const base = await workerContext('chen');
  const history = await StudioDB.get('chat:chen') || [];
  let mockCount = null;
  if (mockMode && !mockTierParam) {
    mockCount = await mockLookCount();
    if (mockCount.n >= LOOK_DAILY_LIMIT) { const full = new Error('今天給晨看畫的次數已用完。'); full.code = 'DAILY_LOOK_LIMIT'; full.limit = LOOK_DAILY_LIMIT; throw full; }
  }
  const result = await callWorker('/look', Object.assign({}, base, {
    character: 'chen', image: dataUrl,
    messages: history.slice(-6).map(function (message) { return messageLine(message, false); })
  }));
  const reply = String(result.reply || '');
  if (!reply) throw new Error('晨那邊沒有回話。');
  const legacyMock = mockMode && !mockTierParam;
  if (result.fallback) return { reply: reply, fallback: true, remaining: legacyMock ? LOOK_DAILY_LIMIT - mockCount.n : result.remaining, limit: legacyMock ? LOOK_DAILY_LIMIT : result.limit, scope: legacyMock ? 'day' : result.scope };
  if (legacyMock) { mockCount.n += 1; await StudioDB.set('lookCount', mockCount); }
  await countDrawingShown();
  const title = String(result.title || '還沒有名字的畫').slice(0, 40);
  const id = 'work-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  const blob = larchMode() ? undefined : await blobFromResult(dataUrl, 'image/jpeg');
  const work = { id: id, kind: 'drawing', title: title, prompt: '晨：' + reply, blob: blob, mimeType: 'image/jpeg', createdAt: Date.now(), workId: result.workId || '', workUrl: result.workUrl || '' };
  const keep = result.saved !== false && !!(blob || work.workId);   // Larch 版沒有本機檔，要 Worker 存成功才收進展廳
  if (keep) await StudioDB.set('drawing:' + id, work);
  // 進晨的聊天串：一則「妳給晨看了一張畫」（附縮圖）＋晨的回應；之後聊天與記憶摘要都讀得到
  const now = Date.now();
  history.push({ role: 'user', content: '（茶語給晨看了一張自己畫的畫。晨替這張畫取名〈' + title + '〉。）', ts: now, draw: id });
  history.push(Object.assign({ role: 'assistant', speaker: 'chen', content: reply, ts: now + 1 }, result.mood && result.mood !== 'neutral' ? { mood: result.mood } : {}));
  await StudioDB.set('chat:chen', history);
  summarizeIfNeeded('chen').catch(function () {});
  return { reply: reply, title: title, mood: result.mood, work: keep ? work : null, remaining: legacyMock ? LOOK_DAILY_LIMIT - mockCount.n : result.remaining, limit: legacyMock ? LOOK_DAILY_LIMIT : result.limit, scope: legacyMock ? 'day' : result.scope };
}
// 第 29 天起長桌上多一排貝殼（劇本第七章：第 28 天四個人在海灘撿了二十三個，「全部帶回去，放在長桌上」）。
// 側面捲軸沒有畫長桌，貝殼排在長桌群聊面板最上面；挑七個代表，粉紅色那個（第 23 個、茶語撿的）在中間。用島上的貝殼紙片
const SHELL_ROW = [3, 1, 5, 6, 2, 7, 4];   // 6＝珊瑚粉，第 28 天的第 23 個
function shellRow(root) {
  if (!(game.day >= 29)) return;
  const row = el('div', 'sf-shell-row'); row.setAttribute('aria-label', '長桌上，花瓶旁邊一排貝殼'); row.dataset.shells = String(SHELL_ROW.length);
  SHELL_ROW.forEach(function (n, i) { const img = el('img', 'sf-shell' + (n === 6 ? ' pink' : '')); img.src = '../map2d/side/art/sprites/shell_' + n + '.png'; img.alt = ''; img.style.setProperty('--tilt', ((i % 3) - 1) * 6 + 'deg'); row.appendChild(img); });
  root.appendChild(row);
}

// 給晨看了幾張畫（跨週目累計，片尾「這一輪」讀）：Larch 變數 drawings_shown（數字、跨週目保留，工作室卡可讀可寫）。
// 只算晨真的看到、有回話的那幾張（AI 沒回應的預設句不算）。網站版沒有 Larch，記在本機。
async function countDrawingShown() {
  const now = (Number(larchVariables.drawings_shown) || Number(await StudioDB.get('drawingsShown').catch(function () { return 0; })) || 0) + 1;
  larchVariables.drawings_shown = now;
  if (larchMode()) { try { window.parent.postMessage({ type: 'larch:set', name: 'drawings_shown', value: now }, '*'); } catch (error) { /* 外殼不在 */ } }
  else await StudioDB.set('drawingsShown', now).catch(function () {});
  return now;
}

async function renderDrawTab(root) {
  await renderDraw(root, {
    el: el, button: button, db: StudioDB, progress: drawProgress, remaining: lookRemaining, look: lookAtDrawing, chenBubble: chenBubble,
    // 額度用完：試玩是晨講那一句；已購買是每日提示＋「想要更多次數」
    limitView: function (error, options) { return isTrialLimit(error.code) ? trialLineBubble(error.code) : wantMoreRow(error.code, error.limit, options && options.textless, error.scope); },
    // 請晨也畫一張：把她的畫當題目，接現有的請晨畫圖流程
    askChen: function (answer) {
      // Worker 存到那張畫（有 workId）時把它當參考圖，晨畫一張「回應」它的畫；沒存到（假資料、R2 存失敗）退回文字題目
      const stored = answer.work && answer.work.workId;
      openCharacter('chen', returnFocus, 'create', { autoStart: true,
        replyTo: stored || '', replyNote: answer.reply,
        prefill: stored ? '回給〈' + answer.title + '〉的畫' : '回給〈' + answer.title + '〉的畫。茶語先畫了一張給晨看，晨看了說：「' + answer.reply + '」請晨畫一張回應它的畫，不要重畫一次。' });
    }
  });
}

async function renderCreation(character, root, options) {
  const chen = character === 'chen';
  const kind = chen ? 'image' : 'song';
  const description = el('p', 'sf-context', chen ? '告訴晨想畫什麼；畫好會通知妳，收進畫架與明的收藏。可以先關掉這裡去做別的事。' : '告訴詩想做什麼歌；做好會通知妳，收進唱片架與明的收藏。可以先關掉這裡去做別的事。');
  const prompt = el('textarea', 'sf-textarea');
  prompt.maxLength = 800;
  prompt.placeholder = chen ? '例如：窗邊花瓶裡的波斯菊。' : '例如：一首適合雨天回家路上的慢歌。';
  const create = button(chen ? '請晨開始畫' : '請詩開始做歌', null, 'primary');
  const status = el('p', 'sf-status');
  const waiting = el('ul', 'sf-jobs');
  const result = el('div', 'sf-stack');
  const hint = quotaHintEl(kind);
  root.append(description, prompt, create, hint, status, waiting, result);

  async function drawWaiting() {
    const jobs = await pendingJobs(kind);
    waiting.replaceChildren();
    jobs.forEach(function (job) { waiting.appendChild(el('li', 'sf-job', (chen ? '還在畫：' : '還在做：') + job.prompt)); });
  }
  function listener(event) {
    if (!root.isConnected) { jobListeners.delete(listener); return; }
    if (event.record.kind !== kind) return;
    drawWaiting();
    hint.refresh();   // 沒做成時 Worker 會把那一格還回去
    if (event.state === 'done') {
      status.textContent = chen ? '畫收進晨的畫架了，也放進明的收藏資料夾。' : '歌收進唱片專輯了，也放進明的收藏資料夾。';
      const preview = chen ? el('img', 'sf-art') : el('audio', 'sf-audio');
      if (chen) preview.alt = event.work.title; else preview.controls = true;
      preview.src = workSrc(event.work);
      result.replaceChildren(preview);
    } else if (event.state === 'error') {
      status.textContent = (chen ? '晨這張沒畫成：' : '詩這首沒做成：') + event.message;
    }
  }
  jobListeners.add(listener);
  await drawWaiting();

  create.addEventListener('click', async function () {
    const idea = prompt.value.trim();
    if (!idea || create.disabled) return;
    create.disabled = true;
    status.textContent = chen ? '交給晨了……' : '交給詩了……';
    try {
      const base = await workerContext(character);
      // 「請晨也畫一張」帶進來的參考圖編號只用在第一次送出（之後她自己改題目再送，就是一般的請晨畫圖）
      const reply = options && options.replyTo ? { replyTo: options.replyTo, replyNote: String(options.replyNote || '').slice(0, 300) } : {};
      if (options) { options.replyTo = ''; }
      const response = await callWorker(chen ? '/img' : '/music', Object.assign({}, base, { prompt: idea, character: character }, reply));
      const record = { jobId: response.jobId, kind: kind, prompt: idea, title: response.title || idea, character: character, createdAt: Date.now() };
      if (!response.jobId) {
        // 上游直接回作品（舊介面）：照舊存。
        listener({ record: record, state: 'done', work: await saveWork(record, response) });
        return;
      }
      await StudioDB.set('job:' + response.jobId, record);
      prompt.value = '';
      status.textContent = chen ? '晨開始畫了。畫好會通知妳，可以先去做別的事。' : '詩開始做歌了。做好會通知妳，可以先去做別的事。';
      await drawWaiting();
      pollJob(record);
    } catch (error) {
      if (isTrialLimit(error.code)) { status.textContent = ''; result.replaceChildren(trialLineBubble(error.code)); }
      else if (isDailyLimit(error.code)) { status.replaceChildren(wantMoreRow(error.code, error.limit, false, error.scope)); }
      else status.textContent = error.code ? quotaMessage(error.code, character) : error.message;
    } finally { create.disabled = false; hint.refresh(); }
  });
  if (options && options.prefill) { prompt.value = String(options.prefill).slice(0, 800); if (options.autoStart) create.click(); }
}

function empty(container, text) { container.appendChild(el('p', 'sf-empty', text)); }

async function showImage(work, fromFavorites) {
  clearBody();
  panelTitle.textContent = work.title;
  const back = button(fromFavorites ? '回到收藏資料夾' : '回到畫架展廳', function () {
    if (fromFavorites) openMingComputer(returnFocus, 'favorites');
    else openCharacter('chen', returnFocus, 'gallery');
  });
  const image = el('img', 'sf-hero-img'); image.alt = work.title; image.src = workSrc(work);
  const note = el('p', 'sf-context', work.prompt || (work.kind === 'drawing' ? '妳畫的，名字是晨取的。' : '晨的畫作'));
  panelBody.append(back, image, note);
}

// 小生物圖鑑收齊（變數 zukan_complete，或同網域島頁存的 StudioDB zukan_seen 滿 13 種）後，展廳多掛一幅 CG 真-圖鑑（新版/cg/art/真結局/真-圖鑑.jpg）
const ZUKAN_CG = { id: 'cg-zukan', title: '四個人在島上', src: '../../../cg/true_end/true_end_cg_014.webp', note: '晨：十三種都找到了。這張畫的是那天的我們。' };
async function zukanComplete() {
  if (String(larchVariables.zukan_complete) === 'true' || query.get('zukan_complete') === 'true') return true;
  try { const seen = await StudioDB.get('zukan_seen'); return Array.isArray(seen) && new Set(seen).size >= 13; } catch (error) { return false; }
}
function showCg(cg) {
  clearBody();
  panelTitle.textContent = cg.title;
  const back = button('回到畫架展廳', function () { openCharacter('chen', returnFocus, 'gallery'); });
  const image = el('img', 'sf-hero-img'); image.alt = cg.title; image.src = cg.src;
  panelBody.append(back, image, el('p', 'sf-context', cg.note));
}

async function renderGallery(root) {
  await playerId().catch(function () {});   // Larch 版的作品網址要帶玩家編號
  const works = await savedWorks('image');
  const drawings = await savedWorks('drawing');
  const zukan = await zukanComplete();
  if (!works.length && !zukan && !drawings.length) { empty(root, '畫架還是空的。可以先和晨聊幾句，或請他畫一張。'); return; }
  if (drawings.length) root.appendChild(el('h3', 'sf-section', '晨畫的'));
  if (drawings.length && !works.length && !zukan) empty(root, '晨的畫還沒有掛上來。');
  const grid = el('div', 'sf-grid');
  if (zukan) {
    const card = el('article', 'sf-card sf-card-cg'); card.dataset.cg = ZUKAN_CG.id;
    const image = el('img', 'sf-cover'); image.src = ZUKAN_CG.src; image.alt = ZUKAN_CG.title;
    image.addEventListener('click', function () { showCg(ZUKAN_CG); });
    card.append(image, el('h3', '', ZUKAN_CG.title), el('p', '', ZUKAN_CG.note));
    grid.appendChild(card);
  }
  works.forEach(function (work) {
    const card = el('article', 'sf-card');
    const image = el('img', 'sf-cover'); image.src = workSrc(work); image.alt = work.title;
    image.addEventListener('click', function () { showImage(work); });
    card.append(image, el('h3', '', work.title), el('p', '', '晨：嗯。這張我收好了。'));
    grid.appendChild(card);
  });
  root.appendChild(grid);
  if (!drawings.length) return;
  // 我畫的：茶語自己在畫板上畫、給晨看過的畫；畫名是晨取的
  root.appendChild(el('h3', 'sf-section', '我畫的'));
  const mine = el('div', 'sf-grid'); mine.dataset.section = 'mine';
  drawings.forEach(function (work) {
    const card = el('article', 'sf-card sf-card-mine');
    const image = el('img', 'sf-cover'); image.src = workSrc(work); image.alt = work.title;
    image.addEventListener('click', function () { showImage(work); });
    card.append(image, el('h3', '', work.title), el('p', '', '晨：這張是妳畫的。我掛在這裡了。'));
    mine.appendChild(card);
  });
  root.appendChild(mine);
}

async function renderAlbum(root) {
  await playerId().catch(function () {});   // Larch 版的作品網址要帶玩家編號
  const works = await savedWorks('song');
  if (!works.length) { empty(root, '唱片架還沒有新歌。可以先和詩聊幾句，或請他做一首歌。'); return; }
  const grid = el('div', 'sf-grid');
  works.forEach(function (work) {
    const card = el('article', 'sf-card');
    card.appendChild(el('h3', '', work.title));
    if (work.lyrics) card.appendChild(el('p', '', work.lyrics));
    const audio = el('audio', 'sf-audio'); audio.controls = true; audio.src = workSrc(work); card.appendChild(audio);
    grid.appendChild(card);
  });
  root.appendChild(grid);
}

function addComputerWidgetList(container, settings) {
  const widgets = el('div', 'sf-widgets');
  const info = {
    progress: ['進度表', '第 ' + game.day + ' 天・三國製作中'],
    favorites: ['收藏', '晨的畫與詩的歌'],
    calendar: ['行事曆', '今天第 ' + game.day + ' 天'],
    notes: ['便利貼', '明：早點睡。']
  };
  Object.keys(settings.widgets).forEach(function (key) {
    const item = settings.widgets[key];
    if (!item.enabled) return;
    const card = el('div', 'sf-widget pos-' + item.position);
    card.append(el('b', '', info[key][0]), el('span', '', info[key][1]));
    widgets.appendChild(card);
  });
  container.appendChild(widgets);
}

// 試用期第 30 天到期：第 1 天剩 30 天（字卡「試用期剩 N 天」同一套算法）；過了第 30 天就不再倒數。
const TRIAL_LAST_DAY = 30;
function trialDaysLeft() { return game.day <= TRIAL_LAST_DAY ? TRIAL_LAST_DAY + 1 - game.day : null; }

function osBar() {
  // 作業系統「明」的上方列：右上角日期，旁邊的小圖示寫剩幾天（新版/設計.md「倒數出現的地方」）。
  const bar = el('div', 'sf-os-bar');
  bar.append(el('b', 'sf-os-name', '明'), el('span', 'sf-os-date', '第 ' + game.day + ' 天'));
  const left = trialDaysLeft();
  if (left !== null) {
    const badge = el('span', 'sf-os-countdown', String(left));
    badge.title = '剩 ' + left + ' 天';
    badge.setAttribute('aria-label', '剩 ' + left + ' 天');
    bar.appendChild(badge);
  }
  return bar;
}

async function openMingComputer(focus, initialTab) {
  panelOpen('明的電腦', focus);
  clearBody();
  addContext(panelBody, 'ming');
  panelBody.appendChild(osBar());
  const tabs = [
    { id: 'chat', label: '和明說話' }, { id: 'progress', label: '進度表' }, { id: 'calendar', label: '月曆' },
    { id: 'games', label: '小遊戲' }, { id: 'favorites', label: '收藏' }, { id: 'files', label: '劇情裡的檔案' }, { id: 'backup', label: '我的資料備份' }, { id: 'settings', label: '畫面設定' }, { id: 'help', label: '說明' }
  ];
  setupTabs(tabs, async function (tab, root) {
    if (tab === 'chat') { await renderChat('ming', false, root); return; }
    if (tab === 'progress') { await renderProgress(root); return; }
    if (tab === 'calendar') { renderCalendar(root); return; }
    if (tab === 'games') { renderGames(root); return; }
    if (tab === 'favorites') { await renderFavorites(root); return; }
    if (tab === 'files') { await renderStoryFiles(root); return; }
    if (tab === 'help') { renderHelp(root); return; }
    if (tab === 'backup') { await renderBackup(root); return; }
    await renderSettings(root);
  }, initialTab || 'progress');
}

function renderCalendar(root) {
  const calendar = el('div', 'sf-calendar');
  for (let day = 1; day <= TRIAL_LAST_DAY; day += 1) {
    const cell = el('div', 'sf-cal-day', String(day));
    if (day < game.day) cell.classList.add('past');
    if (day === game.day) { cell.classList.add('today'); cell.setAttribute('aria-current', 'date'); }
    if (day === TRIAL_LAST_DAY) cell.classList.add('circled');
    calendar.appendChild(cell);
  }
  const left = trialDaysLeft();
  const note = el('p', 'sf-calendar-note', left === null ? '第 30 天的圈還在，旁邊的數字不見了。' : '第 30 天圈起來了，旁邊寫著 ' + left + '。');
  root.append(calendar, note);
}

// 小遊戲重玩：劇情玩過的章節才打開，連到小遊戲的獨立頁（不在 Larch 裡也能玩，不寫回變數）。
// 路徑寫成完整的相對路徑字串，Pages 匯出（新版/build/export_pages.py）才收得到、也會改寫成匯出後的位置。
const MINIGAMES = [
  { name: '敲鎖', href: '../../../minigames/ui/minigame_challenge.html', chapter: 1, note: '第一章，敲三下鎖報名創作者挑戰。' },
  { name: '拉線', href: '../../../minigames/ui/minigame_link.html', chapter: 1, note: '第一章，每一張卡、每一條線自己拉。' },
  { name: '打了又刪', href: '../../../minigames/message.html', chapter: 2, note: '第二章，第一次傳訊息給他們。' },
  { name: '上色', href: '../../../minigames/coloring.html', chapter: 3, note: '第三章，色之國。' },
  { name: '說唱對決', href: '../../../minigames/rap_battle.html', chapter: 4, note: '第四章，音之國。' },
  { name: '齒輪', href: '../../../minigames/gears.html', chapter: 5, note: '第五章，時之國。' },
  { name: '好感三角', href: '../../../minigames/triangle.html', chapter: 7, note: '第七章，最後一幕。' }
];
function renderGames(root) {
  const list = el('div', 'sf-stack');
  MINIGAMES.forEach(function (entry) {
    const open = game.chapter >= entry.chapter;
    const row = el('article', 'sf-card sf-game' + (open ? '' : ' locked'));
    row.append(el('h3', '', entry.name), el('p', '', open ? entry.note : '第 ' + entry.chapter + ' 章玩過之後才能重玩。'));
    if (open) {
      const link = el('a', 'sf-button', '重玩');
      link.href = new URL(entry.href, location.href).href;
      link.target = '_blank'; link.rel = 'noopener';
      row.appendChild(link);
    }
    list.appendChild(row);
  });
  root.append(el('p', 'sf-context', '重玩只是玩，不會改劇情裡的選擇。'), list);
}

// 劇情裡的檔案（2026-11-16 作者同意的預設，見 真結局/設計.md）：
// 試用條款第一章起可讀、三人不反應、續訂後換續訂版；三國資料夾；「第 30 天」第六章（第 19 天）前打不開；
// 三份「給茶語」照結局打開（個人線讀過的那兩份，第 31 天起）；晨線通關後多一個「備」資料夾（CG 晨線-07）。
// 條款文字只用劇本寫過的事（第一章小字、第六章續訂頁與客服回信、夥伴結局續訂），作者 2026-11-16 看過照用。
const TRIAL_TERMS = {
  title: '人形介面　試用條款',
  items: [
    '試用期 30 天，自以此門號啟用人形介面當日起算。',
    '每個帳號限試用一次。',
    '試用期無法延長。',
    '到期後未續訂，人形介面期間的對話與記憶將不會保留。',
    '對話紀錄可由使用者自行匯出保存。',
    '續訂方案：每一位一年 30,000 元。',
    '可先下訂，費用於月底收取。'
  ]
};
const RENEWED_TERMS = {
  title: '人形介面　續訂條款',
  items: [
    '續訂期一年，自試用期結束起算。',
    '每一位分開續訂。',
    '每一位一年 30,000 元，費用於月底收取。',
    '續訂期間，人形介面的對話與記憶繼續保留。',
    '對話紀錄可由使用者自行匯出保存。'
  ]
};
const LETTERS = {
  chen: { name: '晨', kind: 'text', lines: ['茶語：', '在朝霞丘說，等遊戲做完要跟妳說的，是這件事。', '我喜歡妳。', '第一天看到妳，我就想畫妳。後來每次多畫一版，多出來的那張，常常是妳。', '妳不用回我。我只是想讓妳知道。', '晨'] },
  ming: { name: '明', kind: 'text', lines: ['茶語：', '等遊戲做完要跟妳說的，是這句。', '我喜歡妳。', '這句我想了很久，一直沒有改。', '明'] },
  shi: { name: '詩', kind: 'audio', lines: ['（錄音檔。一把吉他，然後是詩的聲音，是那首主題曲。唱到最後一句，聲音又變得很小，聽不清楚。）', '「……對不起，最後一句我還是唱不清楚。」', '「謝謝妳每一首都聽完。」'] }
};
const ROUTE_PARTNER = { C: 'chen', M: 'ming', S: 'shi' };
const BEI_CG = '../../../cg/morning/morning_cg_010.webp';

function storyRoute() {
  const value = String(larchVariables.ch7Route || query.get('ch7Route') || '').toUpperCase();
  return ['C', 'M', 'S', 'ALL'].includes(value) ? value : '';
}

async function beiUnlocked() {
  // 晨線通關（第 34 天以後的晨線）時記下來，之後回到工作室也一直開著。
  if (storyRoute() === 'C' && game.day >= 34) { await StudioDB.set('storyUnlock:bei', true); return true; }
  return (await StudioDB.get('storyUnlock:bei')) === true;
}

function fileRow(name, note, open) {
  const row = el('article', 'sf-card sf-file' + (open ? '' : ' locked'));
  row.append(el('h3', '', name), el('p', '', note));
  return row;
}

function showStoryFile(title, build) {
  clearBody();
  panelTitle.textContent = title;
  panelBody.appendChild(button('回到劇情裡的檔案', function () { openMingComputer(returnFocus, 'files'); }));
  const body = el('div', 'sf-doc');
  build(body);
  panelBody.appendChild(body);
}

async function renderStoryFiles(root) {
  const list = el('div', 'sf-stack');
  const renewed = game.day > TRIAL_LAST_DAY;
  const terms = renewed ? RENEWED_TERMS : TRIAL_TERMS;
  const termsRow = fileRow(renewed ? '續訂條款.txt' : '試用條款.txt', renewed ? '續訂之後換成這一份。' : '「人形介面　試用中」底下那行小字的完整版。', true);
  termsRow.dataset.file = 'terms';
  termsRow.appendChild(button('打開', function () {
    showStoryFile(terms.title, function (body) {
      const ol = el('ol', 'sf-terms');
      terms.items.forEach(function (item) { ol.appendChild(el('li', '', item)); });
      body.append(el('h3', '', terms.title), ol);
    });
  }));
  list.appendChild(termsRow);

  [['色之國', 3], ['音之國', 4], ['時之國', 5]].forEach(function (pair) {
    const open = game.chapter >= pair[1];
    const row = fileRow(pair[0], open ? '晨的圖、詩的曲子、明的小遊戲，都在裡面。' : '還是空的。', open);
    row.dataset.file = 'kingdom';
    list.appendChild(row);
  });

  const day30Open = game.day >= 19;
  const day30 = fileRow('第 30 天', day30Open ? '裡面有三個資料夾：晨、明、詩。' : '打不開。', day30Open);
  day30.dataset.file = 'day30';
  if (day30Open) {
    const route = storyRoute();
    const inner = el('div', 'sf-stack sf-subfiles');
    [['chen', '一張畫：從窗外看進工作室，四個人站在北面大窗後面，鬧成一團。'], ['ming', '一張進度表：最後一格寫著「交接給茶語」。'], ['shi', '一個錄音檔：一首她沒有聽過的歌。']].forEach(function (pair) {
      const key = pair[0];
      const letter = LETTERS[key];
      const readable = game.day > TRIAL_LAST_DAY && ROUTE_PARTNER[route] && ROUTE_PARTNER[route] !== key;
      const sub = el('div', 'sf-subfile');
      sub.dataset.letter = key;
      sub.append(el('b', '', letter.name), el('span', '', pair[1]));
      const letterRow = el('div', 'sf-row');
      letterRow.appendChild(el('span', 'sf-letter-name', '「給茶語」'));
      if (readable) {
        letterRow.appendChild(button('打開', function () {
          showStoryFile(letter.name + '的「給茶語」', function (body) {
            letter.lines.forEach(function (line) { body.appendChild(el('p', letter.kind === 'audio' ? 'sf-doc-audio' : '', line)); });
          });
        }));
      } else {
        letterRow.appendChild(el('span', 'sf-letter-closed', '還沒有打開過。'));
      }
      sub.appendChild(letterRow);
      inner.appendChild(sub);
    });
    day30.appendChild(inner);
  }
  list.appendChild(day30);

  if (await beiUnlocked()) {
    const bei = fileRow('備', '一格一格很淡的鉛筆畫。', true);
    bei.dataset.file = 'bei';
    bei.appendChild(button('打開', function () {
      showStoryFile('備', function (body) {
        const image = el('img', 'sf-hero-img'); image.alt = '「備」資料夾'; image.src = BEI_CG;
        body.appendChild(image);
      });
    }));
    list.appendChild(bei);
  }
  root.append(el('p', 'sf-context', '四個人共用的資料夾。'), list);
}

function statusSelect(value) {
  const select = el('select', 'sf-select sf-table-input');
  [['planned', '待開始'], ['doing', '進行中'], ['done', '完成'], ['late', '落後']].forEach(function (option) {
    const item = el('option', '', option[1]); item.value = option[0]; item.selected = option[0] === value; select.appendChild(item);
  });
  return select;
}

async function renderProgress(root) {
  let progress = sanitizeProgress(await StudioDB.get('progressTable') || { days: [] });
  const tools = el('div', 'sf-row');
  const ask = button('請明依劇情排一版', null, 'primary');
  tools.appendChild(ask);
  root.appendChild(tools);
  const status = el('p', 'sf-status'); root.appendChild(status);
  const list = el('div', 'sf-stack'); root.appendChild(list);
  function draw() {
    list.replaceChildren();
    progress.days.forEach(function (item, index) {
      const row = el('div', 'sf-progress');
      row.appendChild(el('span', 'sf-day', '第 ' + item.day + ' 天'));
      const task = el('input', 'sf-input sf-table-input'); task.value = item.task; task.maxLength = 120; task.setAttribute('aria-label', '第 ' + item.day + ' 天的工作');
      const state = statusSelect(item.status); state.setAttribute('aria-label', '第 ' + item.day + ' 天的進度');
      task.addEventListener('change', function () { progress.days[index].task = task.value.slice(0, 120); StudioDB.set('progressTable', progress); });
      state.addEventListener('change', function () { progress.days[index].status = state.value; StudioDB.set('progressTable', progress); });
      row.append(task, state); list.appendChild(row);
    });
  }
  draw();
  ask.addEventListener('click', async function () {
    ask.disabled = true; status.textContent = '明正在整理進度……';
    try {
      const result = await callWorker('/chat', Object.assign({}, await workerContext('ming'), { action: 'progress_table', progress: progress }));
      progress = sanitizeProgress(result.json || result.progress || JSON.parse(result.reply));
      await StudioDB.set('progressTable', progress); draw(); status.textContent = '進度表已更新。';
    } catch (error) { status.textContent = error.message; }
    finally { ask.disabled = false; }
  });
}

async function renderFavorites(root) {
  await playerId().catch(function () {});   // Larch 版的作品網址要帶玩家編號
  const images = await savedWorks('image');
  const songs = await savedWorks('song');
  if (!images.length && !songs.length) { empty(root, '收藏資料夾還是空的。晨的畫和詩的歌會自動放進來。'); return; }
  const grid = el('div', 'sf-grid');
  images.concat(songs).sort(function (a, b) { return b.createdAt - a.createdAt; }).forEach(function (work) {
    const card = el('article', 'sf-card'); card.appendChild(el('h3', '', work.title));
    if (work.kind === 'image') {
      const image = el('img', 'sf-cover'); image.src = workSrc(work); image.alt = work.title;
      image.addEventListener('click', function () { showImage(work, true); }); card.appendChild(image);
    } else {
      const audio = el('audio', 'sf-audio'); audio.controls = true; audio.src = workSrc(work); card.appendChild(audio);
    }
    grid.appendChild(card);
  });
  root.appendChild(grid);
}

async function renderBackup(root) {
  root.appendChild(el('p', 'sf-context', '聊天、記憶摘要、歌曲、畫作、進度表、畫面設定與工作室位置都會一起匯出。'));
  const last = await StudioDB.get('lastBackupAt');
  const lastLine = el('p', 'sf-backup-last', last ? '上次備份：' + new Date(last).toLocaleString('zh-TW', { hour12: false }) : '還沒備份過。換手機、換電腦，或 Safari 很久沒開時資料可能被清掉，記得先下載一份。');
  root.appendChild(lastLine);
  const exportButton = button('下載完整備份 .json', async function () {
    await exportBackup();
    lastLine.textContent = '上次備份：' + new Date(await StudioDB.get('lastBackupAt')).toLocaleString('zh-TW', { hour12: false });
  }, 'primary');
  const importInput = el('input', 'sf-input'); importInput.type = 'file'; importInput.accept = 'application/json,.json';
  const status = el('p', 'sf-status');
  root.append(exportButton, el('label', 'sf-label', '匯入備份'), importInput, status);
  importInput.addEventListener('change', async function () {
    const file = importInput.files && importInput.files[0];
    if (!file) return;
    try {
      const backup = JSON.parse(await file.text());
      if (!backup || backup.format !== 'larch-studio-backup-v1' || !Array.isArray(backup.entries)) throw new Error('備份格式不正確');
      const entries = await Promise.all(backup.entries.map(async function (entry) { return [entry[0], await decodeBackupValue(entry[1])]; }));
      await StudioDB.replaceAll(entries);
      status.textContent = '備份已匯入。重新整理後會載入全部資料。';
    } catch (error) { status.textContent = '匯入失敗：' + error.message; }
  });
}

async function encodeBackupValue(value) {
  if (value instanceof Blob) {
    const bytes = new Uint8Array(await value.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode.apply(null, bytes.subarray(offset, offset + 0x8000));
    return { __studioBlob: true, type: value.type, base64: btoa(binary) };
  }
  if (Array.isArray(value)) return Promise.all(value.map(encodeBackupValue));
  if (value && typeof value === 'object') {
    const pairs = await Promise.all(Object.keys(value).map(async function (key) { return [key, await encodeBackupValue(value[key])]; }));
    return Object.fromEntries(pairs);
  }
  return value;
}

async function decodeBackupValue(value) {
  if (value && value.__studioBlob === true && typeof value.base64 === 'string') {
    const binary = atob(value.base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: value.type || 'application/octet-stream' });
  }
  if (Array.isArray(value)) return Promise.all(value.map(decodeBackupValue));
  if (value && typeof value === 'object') {
    const pairs = await Promise.all(Object.keys(value).map(async function (key) { return [key, await decodeBackupValue(value[key])]; }));
    return Object.fromEntries(pairs);
  }
  return value;
}

async function exportBackup() {
  const entries = await StudioDB.entries();
  const encoded = await Promise.all(entries.map(async function (entry) { return [entry[0], await encodeBackupValue(entry[1])]; }));
  const backup = { format: 'larch-studio-backup-v1', createdAt: new Date().toISOString(), entries: encoded };
  const file = new Blob([JSON.stringify(backup)], { type: 'application/json' });
  const url = URL.createObjectURL(file);
  const link = el('a'); link.href = url; link.download = '工作室備份-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(link); link.click(); link.remove(); setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  await StudioDB.set('lastBackupAt', Date.now());
}

function wallpaperClass(key) { return 'wp-' + key; }

async function renderSettings(root) {
  let settings = sanitizeSettings(await StudioDB.get('computerSettings') || DEFAULT_SETTINGS);
  const screen = el('section', 'sf-computer ' + wallpaperClass(settings.wallpaper));
  screen.style.setProperty('--computer-accent', settings.themeColor);
  screen.append(el('h3', '', '桌面預覽'), el('p', 'sf-context', '只套用明的桌面、色彩與小工具配置。'));
  const widgetPreview = el('div'); addComputerWidgetList(widgetPreview, settings); screen.appendChild(widgetPreview);
  const form = el('div', 'sf-stack');
  const widgetControls = {};
  const wallpaper = el('select', 'sf-select'); wallpaper.setAttribute('aria-label', '桌布');
  [['north', '北牆空景'], ['east', '東牆空景'], ['south', '南牆空景'], ['west', '西牆空景']].forEach(function (pair) { const option = el('option', '', pair[1]); option.value = pair[0]; option.selected = settings.wallpaper === pair[0]; wallpaper.appendChild(option); });
  const color = el('select', 'sf-select'); color.setAttribute('aria-label', '主題色');
  [['#eadfda', '暖紙白'], ['#e8d9b8', '淺金'], ['#d8dfed', '霧藍'], ['#d9e2c2', '淡黃綠'], ['#eed7dc', '淡酒紅'], ['#f3ead9', '奶油色']].forEach(function (pair) { const option = el('option', '', pair[1]); option.value = pair[0]; option.selected = settings.themeColor === pair[0]; color.appendChild(option); });
  form.append(labelField('桌布', wallpaper), labelField('主題色', color));
  const widgetRows = el('div', 'sf-stack');
  Object.keys(settings.widgets).forEach(function (key) {
    const names = { progress: '進度表', favorites: '收藏', calendar: '行事曆', notes: '便利貼' };
    const row = el('div', 'sf-row');
    const check = el('input'); check.type = 'checkbox'; check.checked = settings.widgets[key].enabled; check.setAttribute('aria-label', names[key]);
    const label = el('label', 'sf-row', names[key]); label.prepend(check);
    const position = el('select', 'sf-select'); position.setAttribute('aria-label', names[key] + '位置');
    [['left', '左側'], ['right', '右側'], ['top', '上方'], ['bottom', '下方']].forEach(function (pair) { const option = el('option', '', pair[1]); option.value = pair[0]; option.selected = settings.widgets[key].position === pair[0]; position.appendChild(option); });
    widgetControls[key] = { check: check, position: position };
    function changed() { settings.widgets[key].enabled = check.checked; settings.widgets[key].position = position.value; refresh(); autosave(); }
    check.addEventListener('change', changed); position.addEventListener('change', changed); row.append(label, position); widgetRows.appendChild(row);
  });
  form.appendChild(el('h3', '', '小工具')); form.appendChild(widgetRows);
  const json = el('textarea', 'sf-textarea'); json.value = JSON.stringify(settings, null, 2); json.setAttribute('aria-label', '明的電腦畫面設定 JSON');
  const jsonLabel = el('label', 'sf-label', '設定 JSON'); jsonLabel.appendChild(json); form.appendChild(jsonLabel);
  const status = el('p', 'sf-status');
  const controls = el('div', 'sf-row');
  const apply = button('套用設定 JSON', async function () {
    try { settings = sanitizeSettings(JSON.parse(json.value)); await saveSettings(settings); status.textContent = '畫面設定已套用。'; refresh(); }
    catch (error) { status.textContent = 'JSON 格式錯誤：' + error.message; }
  }, 'primary');
  const askMing = button('請明幫忙調整', async function () {
    const request = promptInput.value.trim(); if (!request) { status.textContent = '先寫下想調整的地方。'; return; }
    askMing.disabled = true; status.textContent = '明正在整理白名單設定……';
    try {
      const result = await callWorker('/chat', Object.assign({}, await workerContext('ming'), { action: 'computer_settings', settings: settings, request: request }));
      const value = result.json || JSON.parse(result.reply);
      settings = sanitizeSettings(value); await saveSettings(settings); status.textContent = '明的設定已套用。'; refresh();
    } catch (error) { status.textContent = error.message; }
    finally { askMing.disabled = false; }
  });
  controls.append(apply, askMing);
  const promptInput = el('input', 'sf-input'); promptInput.placeholder = '例如：把進度表放左邊，關掉便利貼。';
  form.append(promptInput, controls, status);
  root.append(screen, form);

  function refresh() {
    settings = sanitizeSettings(settings);
    wallpaper.value = settings.wallpaper;
    color.value = settings.themeColor;
    Object.keys(widgetControls).forEach(function (key) {
      widgetControls[key].check.checked = settings.widgets[key].enabled;
      widgetControls[key].position.value = settings.widgets[key].position;
    });
    screen.className = 'sf-computer ' + wallpaperClass(settings.wallpaper);
    screen.style.setProperty('--computer-accent', settings.themeColor);
    screen.replaceChildren(el('h3', '', '桌面預覽'), el('p', 'sf-context', '只套用明的桌面、色彩與小工具配置。'));
    addComputerWidgetList(screen, settings);
    json.value = JSON.stringify(settings, null, 2);
  }
  // 改桌布、主題色、小工具就直接存，不用再按「套用」。
  function autosave() {
    saveSettings(settings).then(function () { status.textContent = '已存好。'; }, function (error) { status.textContent = error.message; });
  }
  wallpaper.addEventListener('change', function () { settings.wallpaper = wallpaper.value; refresh(); autosave(); });
  color.addEventListener('change', function () { settings.themeColor = color.value; refresh(); autosave(); });
}

function labelField(label, control) {
  const wrapper = el('label', 'sf-label', label); wrapper.appendChild(control); return wrapper;
}

async function saveSettings(value) {
  const safe = sanitizeSettings(value);
  await StudioDB.set('computerSettings', safe);
  return safe;
}

window.addEventListener('message', function (event) {
  if (event.source !== window.parent) return;
  const data = event.data || {};
  if (data.type !== 'larch:init') return;
  larchVariables = data.variables || {};
  game = readGameState(location.search, larchVariables);
  window.STUDIO_GAME_STATE = game;
});

// 工作室背景音樂（做法 A）：Larch 的 miniGame 不能控制播放器配樂，所以進工作室前 Larch 配樂先淡出，
// 改由這一頁循環播放進卡時那首（網址參數 bgm=，由 新版/build/build.py 帶入；沒有就不放）。
// 瀏覽器要第一次互動後才准出聲；詩的歌（唱片架、耳機、做好的試聽）一開始播，背景音樂淡出，歌停了再淡回。
const BGM_VOLUME = 0.55;
const BGM_FADE_MS = 700;
const studioBgm = (function () {
  const src = query.get('bgm');
  if (!src || !/^(https?:|\.{0,2}\/)/.test(src)) return null;
  const audio = new Audio();
  audio.src = src; audio.loop = true; audio.preload = 'auto'; audio.volume = BGM_VOLUME;
  const state = { audio: audio, unlocked: false, ducked: false, fadeTimer: null };
  function fadeTo(target, done) {
    clearInterval(state.fadeTimer);
    const start = audio.volume;
    const began = performance.now();
    state.fadeTimer = setInterval(function () {
      const t = Math.min(1, (performance.now() - began) / BGM_FADE_MS);
      audio.volume = Math.max(0, Math.min(1, start + (target - start) * t));
      if (t >= 1) { clearInterval(state.fadeTimer); if (done) done(); }
    }, 40);
  }
  function songsPlaying() {
    return [...document.querySelectorAll('audio')].some(function (node) { return node !== audio && !node.paused && !node.ended; });
  }
  function start() {
    if (state.ducked) return;
    audio.play().then(function () { state.unlocked = true; }, function () { /* 還沒互動，等下一次 */ });
  }
  function duck() {
    if (state.ducked) return;
    state.ducked = true;
    fadeTo(0, function () { if (state.ducked) audio.pause(); });
  }
  function restore() {
    if (!state.ducked || songsPlaying()) return;
    state.ducked = false;
    if (!state.unlocked) return;
    audio.volume = 0;
    audio.play().then(function () { fadeTo(BGM_VOLUME); }, function () {});
  }
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (type) {
    document.addEventListener(type, function () { if (!state.unlocked) start(); }, { capture: true, passive: true });
  });
  document.addEventListener('play', function (event) { if (event.target !== audio && event.target instanceof HTMLMediaElement) duck(); }, true);
  ['pause', 'ended', 'emptied'].forEach(function (type) {
    document.addEventListener(type, function (event) {
      if (event.target !== audio && event.target instanceof HTMLMediaElement) setTimeout(restore, 50);
    }, true);
  });
  // 歌所在的面板關掉時，元素被拿掉不一定送 pause，補查一次。
  new MutationObserver(function () { if (state.ducked) setTimeout(restore, 50); }).observe(document.body, { childList: true, subtree: true });
  start();
  return state;
})();

// 工作室 AI 功能的說明卡（作者 2026-11-16）：第一次打開聊天、畫架、唱片架、明的電腦時跳一次，
// 按「我知道了」才關；看過記在 helpSeen（Larch 版是跨週目的 studioMisc，網站版是 IndexedDB），之後在明的電腦「說明」重看。
function helpItems() {
  return [
    '晨、明、詩在工作室裡說的話、畫的圖、做的歌，都是 AI 當場做出來的，可能會說錯，也可能跟劇情對不上。',
    // 次數那一條（data-quota-help）：先寫「次數有上限」，問到 Worker GET /quota 再換成即時的上限、範圍與剩餘（renderHelp）。
    QUOTA_UNKNOWN,
    '妳畫的圖會傳給 AI 看，請不要畫個人資料。',
    '畫和歌存在伺服器上，超過 90 天沒打開就會刪掉。想留著的話，在圖片或播放器上按右鍵（手機是長按）另存。',
    larchMode()
      ? '聊天紀錄和他們記得的事，會跟 Larch 的存檔一起保存，重新開始遊戲也還在。'
      : '聊天紀錄和他們記得的事，都存在這台裝置的瀏覽器裡。要換裝置的話，用明的電腦裡的「我的資料備份」帶過去。',
    '網站版的工作室和 Larch 裡的工作室，紀錄不互通。',
    '請不要在聊天裡寫真實姓名、電話、地址這類個人資料。'
  ];
}

function renderHelp(root) {
  const list = el('ol', 'sf-help-list');
  helpItems().forEach(function (item) {
    const li = el('li', '', item);
    if (item === QUOTA_UNKNOWN) { li.dataset.quotaHelp = 'pending'; fillQuotaHelp(li); }
    list.appendChild(li);
  });
  root.append(el('h3', 'sf-help-title', '工作室的 AI 功能'), list);
}
// 說明卡的次數：每一種一行（聊天：每天 20 句，今天還剩 12 句），有「每天」的補一句重新算的時間。讀不到就留「次數有上限」，不寫錯的數字。
async function fillQuotaHelp(li) {
  const quotas = await quotaSnapshot();
  if (!quotas) { li.dataset.quotaHelp = 'unknown'; return; }
  const lines = el('ul', 'sf-quota-lines');
  QUOTA_KINDS.forEach(function (kind) { const row = el('li', '', quotaHelpLine(kind, quotas[kind])); row.dataset.quota = kind; lines.appendChild(row); });
  li.replaceChildren(el('span', '', '這一份存檔現在的次數：'), lines);
  if (QUOTA_KINDS.some(function (kind) { return quotas[kind].scope === 'day'; })) li.appendChild(el('span', 'sf-quota-reset', QUOTA_RESET_NOTE));
  li.dataset.quotaHelp = 'live';
}

let helpShowing = null;
async function ensureHelpSeen() {
  try { if (await StudioDB.get('helpSeen') === true) return; } catch (error) { /* 讀不到就照樣顯示 */ }
  if (helpShowing) return helpShowing;
  helpShowing = new Promise(function (resolve) {
    const layer = el('div', 'sf-help-layer');
    layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-modal', 'true'); layer.setAttribute('aria-label', '工作室的 AI 功能');
    const card = el('div', 'sf-help-card');
    renderHelp(card);
    const ok = button('我知道了', async function () {
      try { await StudioDB.set('helpSeen', true); } catch (error) { /* 存不下下次再跳 */ }
      layer.remove(); helpShowing = null; resolve();
    }, 'primary');
    ok.dataset.help = 'ok';
    card.appendChild(ok);
    layer.appendChild(card);
    document.body.appendChild(layer);
    ok.focus({ preventScroll: true });
  });
  return helpShowing;
}

window.STUDIO_GAME_STATE = game;
resumeJobs();
window.STUDIO_FEATURES = {
  handle: function (id, focus) {
    if (id === 5 || id === 16) { openCharacter('shi', focus, 'album'); ensureHelpSeen(); return true; }
    if (id === 8) { openCharacter('chen', focus, 'gallery'); ensureHelpSeen(); return true; }
    if (id === 12) { openMingComputer(focus, 'progress'); ensureHelpSeen(); return true; }
    if (id === 13) {
      panelOpen('長桌・四人群聊', focus); clearBody(); addContext(panelBody); shellRow(panelBody); renderChat(null, true, panelBody); ensureHelpSeen(); return true;
    }
    return false;
  },
  person: function (character, focus) { const opened = openDirectChat(character, focus); if (opened) ensureHelpSeen(); return opened; },
  help: ensureHelpSeen,
  context: function () { return game; },
  tier: studioTier,
  mock: mockMode,
  backup: exportBackup,
  pendingJobs: pendingJobs,
  bgm: studioBgm
};
