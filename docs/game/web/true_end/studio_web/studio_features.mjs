import { TODO_ITEMS } from './studio_points2_data.mjs';
import { CHEN_ART, SKY_DIARY } from './studio_collection_data.mjs';
import { createFocus } from './studio_focus.mjs';
import { puzzleBadge, puzzleTime, readPuzzleBests, renderPuzzle } from './studio_puzzle.mjs';
import { decodeHudSeen } from './hud_seen.mjs';
import { HUD_SEEN_KEYS } from './hud_seen_keys.mjs';
import { preparePanel } from './studio_panel.mjs';
import { affinityChapter, AFFINITY_MAX, createFreeAffinity } from './free_affinity.mjs';
import { storyDayNote, storyTime, storyProduction } from './story_time.mjs';
import { computerAction, applySettingsPatch } from './computer_actions.mjs';
import { renderDraw, taipeiDay, LOOK_DAILY_LIMIT } from './studio_draw.mjs';
import { mountAlbum, unlockedIds, ALBUM_TRACKS, HEADPHONE_TRACKS } from './studio_album.mjs';
import { waitingIndicator, chatStages, lookStages, jobStages, CHARACTER_STAGE_COLORS } from './studio_wait.mjs';
import { headFor, CHARACTERS, DEFAULT_SETTINGS, mockRequest, mockPoll, parseGroupReply, readGameState, sanitizeProgress, sanitizeSettings, quotaMessage, QUOTA_DEFAULTS, TRIAL_LINES, DAILY_KINDS, isTrialLimit, isDailyLimit, quotaHelpLine, quotaHint, QUOTA_KINDS, QUOTA_UNKNOWN, QUOTA_RESET_NOTE } from './studio_core.mjs';

const $ = (selector, root) => (root || document).querySelector(selector);
const panel = $('#panel');
const panelTitle = $('#panel-title');
const panelBody = $('#panel-body');
const scrim = $('#scrim');
const closeButton = $('#panel-close');
const query = new URLSearchParams(location.search);
const mockMode = query.get('mock') === '1';
const focusEnabled = query.get('focus') === '1';
const puzzleEnabled = query.get('puzzle') === '1';
const coloringEnabled = query.get('coloring') === '1';
const phoneStoryKeys = ['ch2Msg', 'ch3SkyFirst', 'ch4Apology', 'ch4AssetsFirst', 'ch5PassFirst', 'ch7Route', 'trueEndMsg'];
const realChat = document.documentElement.classList.contains('studio-real-chat');
// larch:init 常比這支模組早到（index.html 先收）：有的話先用那一份，天數才不會停在預設的第 1 天
let larchVariables = (window.__studio && window.__studio.variables) || {};
let game = readGameState(location.search, larchVariables);
const freeAffinity = createFreeAffinity({
  embedded: window.parent !== window && (larchMode() || query.get('embed') === '1') && !mockMode,
  chapter: () => affinityChapter(game.day, query.get('chapter') || larchVariables.studioChapter || game.chapter),
  variables: () => ({ affC: game.affinity.chen, affM: game.affinity.ming, affS: game.affinity.shi, ...larchVariables }),
  write(changes) {
    Object.assign(larchVariables, changes);
    for (const [name, value] of Object.entries(changes)) window.parent.postMessage({ type: 'larch:set', name, value }, '*');
  },
  update(vars) {
    const { affC, affM, affS, freeAffC_ch, freeAffM_ch, freeAffS_ch } = vars;
    for (const [who, value] of Object.entries({ chen: affC, ming: affM, shi: affS })) {
      game.affinity[who] = Math.min(AFFINITY_MAX, Math.max(0, Number(value) || 0));
    }
    Object.assign(game, { freeAffC_ch: Number(freeAffC_ch) || 0, freeAffM_ch: Number(freeAffM_ch) || 0, freeAffS_ch: Number(freeAffS_ch) || 0 });
    window.STUDIO_GAME_STATE = game;
  },
  debug: query.get('debug') === '1'
});
let returnFocus = null;
let ephemeralUrls = [];
let mingComputerState = null;
const focusApp = focusEnabled ? createFocus({
  db: StudioDB, el, button, avatar: CHARACTERS.ming.avatar,
  desktop: () => mingComputerState?.desktop,
  volume: () => {
    if (query.get('noAudio') === '1' || studioBgm?.audio.muted) return 0;
    return studioBgm && !studioBgm.ducked ? studioBgm.audio.volume : BGM_VOLUME;
  }
}) : null;
const activeMingGameJobs = new Map();
const mingGameRoots = new Set();
const mingGameFrames = new Set();

function disposeMingComputer() {
  if (mingComputerState && mingComputerState.clockTimer) clearInterval(mingComputerState.clockTimer);
  if (mingComputerState && mingComputerState.documentPointerHandler) document.removeEventListener('pointerdown', mingComputerState.documentPointerHandler);
  if (mingComputerState && mingComputerState.resizeHandler) window.removeEventListener('resize', mingComputerState.resizeHandler);
  if (mingComputerState && mingComputerState.windows) mingComputerState.windows.forEach(function (node) { disposeMingGameFrames(node); });
  mingComputerState = null;
  focusApp?.desktopChanged();
  panel.classList.remove('ming-os-panel');
}

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

function panelOpen(title, focus, design, character) {
  disposeMingComputer();
  returnFocus = focus || document.activeElement;
  preparePanel(design, returnFocus);
  if (character) panel.dataset.character = character;
  panelTitle.textContent = title;
  panel.classList.add('studio-feature-panel', 'on');
  panel.setAttribute('aria-hidden', 'false');
  scrim.classList.add('on');
  (realChat ? panel : closeButton).focus({ preventScroll: true });
}

function discardPanelActivity() {
  if (puzzleEnabled) activePuzzle()?.puzzleDestroy?.();
  if (coloringEnabled) activeColoring()?.coloringDestroy?.();
}

function activePuzzle() {
  return panelBody.querySelector('.sf-puzzle')?.parentElement;
}

function activeColoring() {
  return panelBody.querySelector('.sf-coloring')?.parentElement;
}

function closeFeature() {
  if (realChat) return;
  discardPanelActivity();
  disposeMingComputer();
  panel.classList.remove('sf-wide');
  if (!panel.classList.contains('studio-feature-panel')) return;
  panel.classList.remove('studio-feature-panel');
  if (returnFocus && returnFocus.focus) returnFocus.focus({ preventScroll: true });
  returnFocus = null;
  ephemeralUrls.forEach(URL.revokeObjectURL);
  ephemeralUrls = [];
}

function exitMingComputer() {
  if (realChat) { openRealChat(returnFocus, 'ming'); return; }
  closeButton.click();
}

if (focusEnabled || puzzleEnabled || coloringEnabled) {
  $('#panel-back')?.addEventListener('click', closeFeature);
  $('#panel-back')?.addEventListener('click', event => {
    const returned = panel.dataset.design === 'coloring-play' ? activeColoring()?.coloringBack?.()
      : panel.dataset.design === 'puzzle-play' && activePuzzle()?.puzzleBack?.();
    if (!returned) return;
    event.stopImmediatePropagation();
  }, { capture: true });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || event.isComposing) return;
    const puzzle = panel.classList.contains('on') && activePuzzle();
    const coloring = panel.classList.contains('on') && activeColoring();
    if (!coloring?.coloringEscape?.() && !puzzle?.puzzleEscape?.() && !focusApp?.escape()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);
}

closeButton.addEventListener('click', closeFeature);
scrim.addEventListener('click', closeFeature);
document.addEventListener('keydown', function (event) {
  if (event.key === 'Escape' && !event.isComposing) closeFeature();
});

function clearBody() {
  discardPanelActivity();
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
const MOCK_KINDS = { '/img': 'image', '/music': 'song', '/look': 'look', '/chat': 'chat', '/game': 'game' };
async function mockQuotaTake(path, payload) {
  const kind = MOCK_KINDS[path];
  if (!mockTierParam || !kind || (path === '/chat' && payload && payload.action)) return null;
  const tier = mockTierParam, rule = QUOTA_DEFAULTS[tier][kind];
  const key = 'mockQuota:' + tier + ':' + kind + ':' + (rule.scope === 'total' ? 'total' : taipeiDay());
  const used = Number(await StudioDB.get(key).catch(function () { return 0; })) || 0;
  if (used >= rule.limit) {
    const full = new Error('mock：次數用完。');
    full.code = tier === 'trial' ? { image: 'TRIAL_IMAGE_LIMIT', song: 'TRIAL_MUSIC_LIMIT', look: 'TRIAL_LOOK_LIMIT', chat: 'TRIAL_CHAT_LIMIT', game: 'TRIAL_GAME_LIMIT' }[kind] : { image: 'DAILY_IMAGE_LIMIT', song: 'DAILY_MUSIC_LIMIT', look: 'DAILY_LOOK_LIMIT', chat: 'DAILY_CHAT_LIMIT', game: 'DAILY_GAME_LIMIT' }[kind];
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

// 「等 AI 回應」的進度：送出時記一筆（StudioDB wait:<key>＝{kind, character, startedAt}），回覆存好後清掉。
// 關掉面板再打開時，還在等（這一頁的 promise 還活著、而且不到 2 分鐘）就接著顯示；頁面重新整理過或超過 2 分鐘的舊紀錄清掉，不永遠轉圈。
const WAIT_MAX_MS = 120000;
const liveWaits = new Map();
const slowJobs = new Set();   // 查進度連續失敗中的 job（等待提示換成「網路有點慢」）
const waitListeners = new Set();
async function beginWait(key, kind, character) {
  const record = { kind: kind, character: character || '', startedAt: Date.now() };
  liveWaits.set(key, record);
  await StudioDB.set('wait:' + key, record).catch(function () {});
}
async function endWait(key, payload) {
  liveWaits.delete(key);
  await StudioDB.remove('wait:' + key).catch(function () {});
  waitListeners.forEach(function (listener) { try { listener(key, payload, true); } catch (error) { /* 面板已經換掉 */ } });
}
function waitProgress(key) { waitListeners.forEach(function (listener) { try { listener(key, undefined, false); } catch (error) { /* 面板已經換掉 */ } }); }
async function getWait(key) {
  const record = await StudioDB.get('wait:' + key).catch(function () { return null; });
  if (!record) return null;
  if (!liveWaits.has(key) || !(Date.now() - Number(record.startedAt) < WAIT_MAX_MS)) { await StudioDB.remove('wait:' + key).catch(function () {}); return null; }
  return record;
}
// handler(ended, payload)：等待結束時呼叫一次；every 為真時，中途有進展（群聊一則一則出現）也呼叫
function onWaitEnd(root, key, handler, every) {
  const listener = function (endedKey, payload, ended) {
    if (!root.isConnected) { waitListeners.delete(listener); return; }
    if (endedKey !== key || (!ended && !every)) return;
    if (ended) waitListeners.delete(listener);
    handler(payload, ended);
  };
  waitListeners.add(listener);
}
window.STUDIO_WAIT = { liveWaits: liveWaits, getWait: getWait, slowJobs: slowJobs };

async function callWorker(path, payload) {
  // 假資料模式記下最後一次請求，測試用來確認每個對話只帶自己的記憶摘要。
  if (mockMode) {
    const delay = Number(query.get('mockDelay')) || 0;   // 測試用：讓假回覆慢一點，才看得到分段
    if (delay && (path === '/chat' || path === '/look')) await new Promise(function (done) { setTimeout(done, delay); });
    window.STUDIO_LAST_REQUEST = { path: path, payload: payload };
    const taken = await mockQuotaTake(path, payload);
    const result = await mockRequest(path, payload);
    if (taken && path === '/look' && result.fallback) await mockQuotaGive(taken);   // 跟 Worker 一樣：晨沒看成就還回去
    return taken ? Object.assign({ limit: taken.limit, scope: taken.scope, remaining: taken.remaining + (path === '/look' && result.fallback ? 1 : 0), quotaKey: taken.key }, result) : result;
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
  if (mockMode) {
    if (!mockTierParam) return null;
    const entries = await Promise.all(QUOTA_KINDS.map(async function (kind) { return [kind, await mockQuotaStatus(kind)]; }));
    return Object.fromEntries(entries);
  }
  try {
    const response = await fetch(apiBase() + '/quota?player=' + encodeURIComponent(await playerId()) + '&tier=' + studioTier());
    const data = await response.json().catch(function () { return null; });
    const quotas = data && (data.quotas || data);
    if (!response.ok || !quotas || !QUOTA_KINDS.every(function (kind) { return quotaHint(kind, quotas[kind]); })) return null;
    return quotas;
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

async function workerContext(conversation, scene = game) {
  await memoryMigration;
  const context = {
    day: scene.day,
    chapter: scene.chapter,
    plotSummary: scene.summary,
    trialKnown: scene.trialKnown,
    affection: scene.affinity,
    playerId: await playerId(),
    tier: studioTier(),
    memory: await StudioDB.get(memoryKey(conversation)) || ''
  };
  if (conversation === 'ming' || conversation === 'group') {
    const flags = { ...Object.fromEntries(query), ...larchVariables };
    const progress = await readProgress(scene);
    const personal = await StudioDB.get('progressUserTasks').catch(() => []);
    const tasks = progress.days.concat(Array.isArray(personal) ? personal : []);
    context.productionProgress = {
      ...storyProduction(scene.day, scene.chapter, flags, scene.trialKnown),
      replayGames: replayGames(scene).map(entry => entry.name),
      todayTasks: tasks.filter(item => Number(item?.day) === scene.day).map(item => ({
        task: item.task || item.title, status: item.status
      })).filter(item => item.task && item.task !== '待安排')
    };
  }
  return context;
}

// 配對共用 HUD 存在遊戲存檔的憑證；只把遊戲狀態白名單欄位送到 Worker。
let phoneSyncTimer = 0;
let phoneSyncBusy = false;
let phoneSyncRevision = 0;
let lastPhoneSync = '';
async function phonePairAuth() {
  let saveId = '', saveSecret = '';
  if (larchMode()) {
    saveId = String(larchVariables.hudPairSaveId || '');
    saveSecret = String(larchVariables.hudPairSaveSecret || '');
  } else {
    saveId = String(await StudioDB.get('phonePairSaveId').catch(function () { return ''; }) || '');
    saveSecret = String(await StudioDB.get('phonePairSaveSecret').catch(function () { return ''; }) || '');
  }
  if (!saveId || !saveSecret) return null;
  return { saveId: saveId, saveSecret: saveSecret, playerId: String(larchVariables.studioPlayerId || await playerId()) };
}
function phoneRequest(path, body) {
  return fetch(apiBase() + path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store' }).then(async function (response) {
    const data = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(data.message || data.error || '作品伺服器回應錯誤（' + response.status + '）');
    return data;
  });
}
function phoneConversation(list) {
  return (Array.isArray(list) ? list : []).slice(-40).map(function (message) {
    return { r: message.role === 'user' ? 'u' : 'a', c: String(message.content || '').slice(0, 600), t: Number(message.ts) || Date.now(), s: message.speaker, m: message.mood, d: message.draw, ...storyTime(message.day, message.chapter) };
  });
}
async function phoneSnapshot() {
  const entries = await StudioDB.entries();
  const saved = new Map(entries);
  const chats = {};
  ['chen', 'ming', 'shi', 'group'].forEach(function (who) { chats[who] = phoneConversation(saved.get('chat:' + who)); });
  const works = entries.filter(function (entry) { return /^(image|song|drawing):/.test(String(entry[0])); }).map(function (entry) {
    const item = entry[1] || {};
    return { workId: String(item.workId || item.jobId || ''), kind: item.kind === 'song' ? 'song' : item.kind === 'drawing' ? 'drawing' : 'image', title: String(item.title || ''), createdAt: Number(item.createdAt) || 0 };
  }).filter(function (item) { return item.workId; }).slice(-300);
  const progress = sanitizeProgress(saved.get('progressTable') || { days: [] });
  const personal = Array.isArray(saved.get('progressUserTasks')) ? saved.get('progressUserTasks') : [];
  const todos = progress.days.filter(function (item) { return item.task && item.task !== '待安排'; }).map(function (item) {
    return { title: item.task, day: item.day, done: item.status === 'done', fixed: true, status: item.status };
  }).concat(personal.map(function (item) { return { title: String(item.title || ''), day: Number(item.day) || game.day, done: item.status === 'done', fixed: false, status: item.status || 'planned' }; })).slice(0, 80);
  const route = String(larchVariables.ch7Route || '').toUpperCase();
  const ended = game.trialEnded;
  return {
    playerId: String(larchVariables.studioPlayerId || await playerId()), day: game.day, chapter: game.chapter,
    trialKnown: game.trialKnown, tier: studioTier(), affection: game.affinity, plotSummary: game.summary,
    works: works, chats: chats, progress: progress, todos: todos,
    newContent: { chen: false, ming: false, shi: false },
    subscriptions: { chen: ended && (route === 'ALL' || route === 'C'), ming: ended && (route === 'ALL' || route === 'M'), shi: ended && (route === 'ALL' || route === 'S') },
    collections: { zukan: truthy(larchVariables.zukan_complete) ? ['complete'] : [], plants: String(larchVariables.plants || '').split(',').filter(Boolean) }
  };
}
function schedulePhoneSync(delay) {
  if (mockMode) return;
  phoneSyncRevision += 1;
  clearTimeout(phoneSyncTimer);
  phoneSyncTimer = setTimeout(function () { syncPhoneSnapshot(phoneSyncRevision); }, delay === undefined ? 1800 : delay);
}
async function syncPhoneSnapshot(revision) {
  if (phoneSyncBusy) return;
  phoneSyncBusy = true;
  try {
    const auth = await phonePairAuth();
    if (!auth) return;
    const data = await phoneSnapshot();
    const signature = JSON.stringify(data);
    if (signature === lastPhoneSync) return;
    await phoneRequest('/sync/push', Object.assign({}, auth, { data: data }));
    lastPhoneSync = signature;
  } catch (error) {
    // 手機同步不應阻斷工作室；明的電腦設定會顯示手動同步結果。
    console.warn('手機資料同步失敗：' + error.message);
  } finally {
    phoneSyncBusy = false;
    if (revision !== phoneSyncRevision) schedulePhoneSync(800);
  }
}
async function loadPhoneDevices() {
  const auth = await phonePairAuth();
  if (!auth) return { devices: [], max: 5, unavailable: true };
  return phoneRequest('/pair/devices', auth);
}
async function revokePhoneDevice(deviceId) {
  const auth = await phonePairAuth();
  if (!auth) throw new Error('找不到這份遊戲存檔的配對資料，請先在遊戲手機設定裡產生配對碼。');
  return phoneRequest('/pair/revoke', Object.assign({}, auth, { deviceId: deviceId }));
}
window.addEventListener('studio:db-change', function () { schedulePhoneSync(); });
setTimeout(function () { schedulePhoneSync(5000); }, 5000);

function actorAvatar(character, mood) {
  const img = el('img', 'sf-avatar');
  img.src = headFor(character, mood);   // 這句話的表情有圖就用那張，沒有就是平常的頭像
  if (mood) img.dataset.mood = mood;
  img.alt = character === 'user' ? '茶語' : CHARACTERS[character].name;
  return img;
}

// 「妳給晨看了一張畫」會在聊天串裡顯示成記事與縮圖；點縮圖可看大圖。
function renderDrawingNote(message) {
  const row = el('div', 'sf-draw-note');
  row.dataset.draw = message.draw;
  row.appendChild(el('span', '', '妳給晨看了一張畫'));
  const thumb = el('img', 'sf-draw-thumb'); thumb.alt = '妳畫的畫';
  const open = pictureButton(thumb, function () { showImage(work, 'chat'); });
  let work;
  open.hidden = true;
  row.appendChild(open);
  StudioDB.get('drawing:' + message.draw).then(function (saved) {
    work = saved;
    const src = work ? workSrc(work) : '';
    if (!src) return;
    thumb.src = src; thumb.alt = work.title || '妳畫的畫';
    open.hidden = false;
  }).catch(function () {});
  return row;
}

function renderMessage(message) {
  if (message.draw) return renderDrawingNote(message);
  const character = message.role === 'user' ? 'user' : (message.speaker || 'shi');
  const row = el('div', 'sf-message' + (message.role === 'user' ? ' me' : ''));
  row.dataset.speaker = character === 'user' ? 'tea' : character;
  row.appendChild(actorAvatar(character, message.mood));
  const body = el('div', 'sf-message-body');
  body.appendChild(el('span', 'sf-name', message.role === 'user' ? '茶語' : CHARACTERS[character].name));
  body.appendChild(el('div', 'sf-bubble', message.content));
  row.appendChild(body);
  return row;
}

function messageLine(message, group) {
  const who = CHARACTERS[message.speaker] ? CHARACTERS[message.speaker].name : '夥伴';
  return {
    role: message.role,
    content: group && message.role === 'assistant' ? who + '：' + message.content : message.content,
    ...storyTime(message.day, message.chapter)
  };
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
    messages: fresh.slice(-60).map(function (item) { return messageLine(item, conversation === 'group'); }),
    prevMemory: await StudioDB.get(memoryKey(conversation)) || ''
  }));
  if (!result.summary) throw new Error('摘要服務沒有回傳摘要');
  await StudioDB.set(memoryKey(conversation), String(result.summary).slice(0, 1200));
  await StudioDB.set(summaryTsKey(conversation), all[all.length - 1].ts);
  await StudioDB.remove(summaryCountKey(conversation));
}

// 群聊每則出現前「在打字」停多久：1 秒起，字多的略久，最多 2 秒
function typingDelay(text) { return Math.min(2000, 1000 + String(text || '').length * 25); }

async function renderChat(character, group, root) {
  const sessionKey = group ? 'chat:group' : 'chat:' + character;
  const history = await StudioDB.get(sessionKey) || [];
  const chat = el('div', 'sf-chat');
  chat.dataset.conversation = group ? 'group' : character;
  const masthead = el('header', 'sf-chat-masthead');
  const faces = el('div', 'sf-chat-faces');
  (group ? ['chen', 'ming', 'shi', 'user'] : [character]).forEach(function (who) { faces.appendChild(actorAvatar(who)); });
  masthead.append(faces, el('h2', '', group ? '茶語、晨、明、詩' : CHARACTERS[character].name));
  chat.appendChild(masthead);
  const log = el('div', 'sf-chat-log');
  function renderHistory(messages) {
    log.replaceChildren();
    if (!messages.length) log.appendChild(el('p', 'sf-chat-empty', '從一則訊息開始。'));
    messages.forEach(function (message) { log.appendChild(renderMessage(message)); });
  }
  renderHistory(history);
  log.setAttribute('role', 'log');
  log.setAttribute('aria-label', '聊天紀錄');
  log.tabIndex = 0;
  chat.appendChild(log);
  const composer = el('div', 'sf-composer');
  const input = el('textarea', 'sf-input sf-textarea');
  input.setAttribute('aria-label', '訊息');
  input.rows = 2;
  input.maxLength = 1200;
  if (!group) input.placeholder = '跟' + CHARACTERS[character].name + '說點什麼……';
  else if (!realChat) input.placeholder = '在長桌邊說點什麼……';
  const send = button('送出', null, 'primary');
  const status = el('div', 'sf-status');
  composer.append(input, send);
  const hint = quotaHintEl('chat');
  chat.append(composer, status, hint);
  root.appendChild(chat);
  log.scrollTop = log.scrollHeight;
  const waitKey = 'chat:' + (group ? 'group' : character);
  const speakerName = group ? '大家' : CHARACTERS[character].name;
  const waitColor = group ? CHARACTER_STAGE_COLORS.group : CHARACTERS[character].color;
  function showWait(startedAt) {
    const wait = waitingIndicator({ stages: chatStages(speakerName), color: waitColor, startedAt: startedAt });
    log.appendChild(wait.el); log.scrollTop = log.scrollHeight;
    return wait;
  }
  // 關掉再打開：這個對話還在等 AI，就從已過的秒數接著顯示（群聊已經到的幾則直接顯示，不重播）；回覆都到了換成內容
  function typingFor(speaker) {
    return waitingIndicator({ stages: [{ at: 0, label: CHARACTERS[speaker].name + '在打字' }], color: CHARACTERS[speaker].color, startedAt: Date.now() });
  }
  const pendingWait = await getWait(waitKey);
  if (pendingWait) {
    send.disabled = true;
    let shown = null;
    const sync = async function () {
      const fresh = await StudioDB.get(sessionKey) || [];
      history.splice(0, history.length, ...fresh);
      renderHistory(history);
      if (shown) shown.stop();
      shown = null;
      const live = liveWaits.get(waitKey);
      if (live) {
        shown = live.typing ? typingFor(live.typing) : showWait(live.startedAt);
        if (live.typing) log.appendChild(shown.el);
      } else send.disabled = false;
      log.scrollTop = log.scrollHeight;
    };
    await sync();   // 還在等就補上提示（已到的訊息直接顯示、不重播；正在打字的那位接著打字）
    onWaitEnd(root, waitKey, function () { sync(); }, true);
  }

  async function submit() {
    const content = input.value.trim();
    if (!content || send.disabled) return;
    input.value = '';
    send.disabled = true;
    status.textContent = '';
    const scene = game;
    const mingDirect = !group && character === 'ming';
    const phoneStory = Object.fromEntries(phoneStoryKeys.map(key => [key, larchVariables[key]]));
    const timing = storyTime(scene.day, scene.chapter);
    const userMessage = { role: 'user', content: content, ts: Date.now(), ...timing };
    history.push(userMessage);
    log.querySelector('.sf-chat-empty')?.remove();
    log.appendChild(renderMessage(userMessage));
    await StudioDB.set(sessionKey, history);
    await beginWait(waitKey, 'chat', group ? 'group' : character);
    const wait = showWait(liveWaits.get(waitKey).startedAt);
    let typingEl = null;
    try {
      const base = await workerContext(group ? 'group' : character, scene);
      const payload = Object.assign({}, base, {
        mode: 'chat', character: character || 'group', group: !!group, phoneStory: phoneStory,
        messages: history.slice(-16).map(function (message) { return messageLine(message, group); })
      });
      if (mingDirect) payload.computer = {
        panels: availableComputerPanels(scene),
        settings: sanitizeSettings(await StudioDB.get('computerSettings').catch(() => null))
      };
      const result = await callWorker('/chat', payload);
      const responses = group ? parseGroupReply(result.replies || result.reply || result.json) : null;
      const replyItems = group
        ? responses.map(function (item) { return { speaker: item.speaker, content: item.content, mood: item.mood || (result.moods && result.moods[item.speaker]) }; })
        : [{ speaker: character, content: String(result.reply || result.text || ''), mood: result.mood }];
      if (replyItems.some(function (item) { return !item.content; })) throw new Error('聊天服務沒有回傳文字');
      wait.stop(); wait.el.remove();
      for (let index = 0; index < replyItems.length; index++) {
        const item = replyItems[index];
        if (group) {
          // 像真的群組：一則一則出現，每則前先顯示「〈名字〉在打字」，停 1～2 秒（依長度）；進度記在 liveWaits，關掉再開看得到已到的與正在打字的那位
          liveWaits.get(waitKey).typing = item.speaker; waitProgress(waitKey);
          typingEl = typingFor(item.speaker); log.appendChild(typingEl.el); log.scrollTop = log.scrollHeight;
          await new Promise(function (done) { setTimeout(done, typingDelay(item.content)); });
          typingEl.stop(); typingEl.el.remove(); typingEl = null;
          liveWaits.get(waitKey).typing = '';
        }
        const record = { role: 'assistant', speaker: item.speaker, content: item.content, ts: Date.now() + index, ...timing };
        if (item.mood && item.mood !== 'neutral') record.mood = item.mood;
        history.push(record);
        log.appendChild(renderMessage(record));
        if (group) { await StudioDB.set(sessionKey, history); waitProgress(waitKey); }
      }
      await StudioDB.set(sessionKey, history);
      status.textContent = '';
      if (mingDirect && result.action) {
        await runComputerChatAction(result.action, chat, scene).catch(function (error) {
          status.textContent = error.message;
        });
      }
      summarizeIfNeeded(group ? 'group' : character).catch(function () { status.textContent = '聊天已儲存；記憶摘要稍後再試。'; });
    } catch (error) {
      if (error.code === 'TRIAL_CHAT_LIMIT') { status.textContent = ''; log.appendChild(trialLineBubble(error.code, group ? 'ming' : character)); return; }
      if (isDailyLimit(error.code)) { status.replaceChildren(wantMoreRow(error.code, error.limit, false, error.scope)); return; }
      const fail = error.code ? quotaMessage(error.code, character) : '網路暫時沒有接通。等一下再試。';
      const speaker = group ? 'ming' : character;
      const record = { role: 'assistant', speaker: speaker, content: fail, ts: Date.now(), ...timing };
      history.push(record);
      log.appendChild(renderMessage(record));
      await StudioDB.set(sessionKey, history);
      status.textContent = error.code ? '' : error.message;
    } finally {
      wait.stop(); wait.el.remove(); if (typingEl) { typingEl.stop(); typingEl.el.remove(); }
      await endWait(waitKey);
      send.disabled = false;
      hint.refresh();
      log.scrollTop = log.scrollHeight;
      if (input.isConnected && panel.classList.contains('on') && !input.closest('[hidden], .ming-app-window.inactive')) input.focus();
    }
  }
  send.addEventListener('click', submit);
  input.addEventListener('keydown', function (event) {
    if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) { event.preventDefault(); submit(); }
  });
}

function setupTabs(tabs, render, initialId, label = '工作室活動', navClass = 'sf-tabs') {
  const nav = el('nav', navClass);
  nav.setAttribute('aria-label', label);
  const content = el('div', 'sf-stack');
  let current = initialId || tabs[0].id;
  function choose(id) {
    discardPanelActivity();
    current = id;
    panel.dataset.design = id;
    panelBody.scrollTop = 0;
    content.scrollTop = 0;
    panel.classList.toggle('sf-wide', id === 'draw');
    nav.querySelectorAll('button').forEach(function (tab) { tab.setAttribute('aria-selected', String(tab.dataset.tab === id)); });
    const view = el('div');
    content.replaceChildren(view);
    ephemeralUrls.forEach(URL.revokeObjectURL); ephemeralUrls = [];
    return Promise.resolve(render(id, view)).catch(function (error) { view.replaceChildren(el('p', 'sf-status', error.message)); });
  }
  tabs.forEach(function (item) {
    const tab = button(item.label, function () { choose(item.id); }, 'sf-tab');
    tab.dataset.tab = item.id; tab.setAttribute('aria-selected', 'false'); nav.appendChild(tab);
  });
  panelBody.append(nav, content);
  return choose(current);
}

function openRealChat(focus, initialTab = 'group') {
  panelOpen('開放聊天', focus, 'group');
  clearBody();
  addContext(panelBody);
  const tabs = [{ id: 'group', label: '群聊' }, ...['chen', 'ming', 'shi'].map(id => ({ id, label: CHARACTERS[id].name }))];
  ensureHelpSeen();
  return setupTabs(tabs, (id, content) => {
    const group = id === 'group';
    panel.dataset.design = group ? 'group' : 'chat';
    if (group) delete panel.dataset.character;
    else panel.dataset.character = id;
    return renderChat(group ? null : id, group, content);
  }, initialTab, '聊天對象');
}

function openCharacter(character, focus, initialTab, options) {
  const person = CHARACTERS[character];
  panelOpen(person.name + '的角落', focus, initialTab || 'chat', character);
  clearBody();
  addContext(panelBody, character);
  const tabs = character === 'chen'
    ? [{ id: 'chat', label: '找晨' }, { id: 'draw', label: '我來畫' }, { id: 'create', label: '請晨畫一張' }, { id: 'gallery', label: '畫架展廳' },
      ...(puzzleEnabled ? [{ id: 'puzzle', label: '拼圖' }] : []),
      ...(coloringEnabled ? [{ id: 'coloring', label: '著色本' }] : [])]
    : [{ id: 'chat', label: '找詩' }, { id: 'create', label: '請詩做歌' }, { id: 'album', label: '詩做給妳的' }];
  setupTabs(tabs, async function (tab, content) {
    panelTitle.textContent = tab === 'gallery' ? '晨的畫架' : tabs.find(item => item.id === tab).label;
    if (tab === 'chat') { await renderChat(character, false, content); return; }
    if (tab === 'gallery') { await renderGallery(content); return; }
    if (tab === 'puzzle') {
      const initial = options?.puzzleImage;
      options = null;
      await renderPuzzleTab(content, initial);
      return;
    }
    if (tab === 'album') { await renderAlbum(content); return; }
    if (tab === 'draw') { await renderDraw(content, drawingDeps()); return; }
    if (tab === 'coloring') {
      const { renderColoring } = await import('./studio_coloring.mjs');
      if (!content.isConnected || !panel.classList.contains('on')) return;
      await renderColoring(content, {
        ...drawingDeps(), avatar: CHARACTERS.chen.avatar, seen: seenStoryCGs(),
        all: query.get('unlock') === 'all', saveDrawing,
        openGallery: () => openCharacter('chen', returnFocus, 'gallery')
      });
      return;
    }
    const first = options; options = null;   // 帶進來的題目只用一次
    await renderCreation(character, content, first);
  }, initialTab || 'chat', '工作室活動', character === 'chen' ? 'sf-tabs sf-chen-tabs' : 'sf-tabs');
}

function openDirectChat(character, focus) {
  const person = CHARACTERS[character];
  if (!person) return false;
  panelOpen('和' + person.name + '聊天', focus, 'chat', character);
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

async function saveDrawing(image, title) {
  const result = await callWorker('/drawing/save', { playerId: await playerId(), image, title });
  if (!result.saved || !result.workId) throw new Error('展廳暫時存放失敗，請稍後再試。');
  await StudioDB.set('drawing:' + result.workId, {
    id: result.workId, kind: 'drawing', character: 'tea', title: result.title,
    createdAt: Date.now(), workId: result.workId, workUrl: result.workUrl
  });
}

// 有本機 Blob 的作品直接用；其餘從 Worker 的 /work 讀（R2，90 天沒打開會刪）。
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
// 關掉面板或重新整理也會接著查（頁面載入時 resumeJobs），做好收進畫架／耳機並跳通知。
// 查進度失敗（.11 忙時 GET 回 UPSTREAM_ERROR、網路斷）時不放棄：間隔 4 → 8 → 15 → 30 秒，上限 30 秒，一直查到 done／error／JOB_NOT_FOUND。
// 第一次失敗發一次 'slow' 事件（on: true），恢復正常再發一次（on: false）；等待提示的小字據此換掉。測試可用網址 pollScale=0.01 把間隔縮短。
const POLL_SCALE = Number(query.get('pollScale')) || 1;
const BACKOFF_MS = [4000, 8000, 15000, 30000];
function pollDelay(failures, baseMs) { return failures > 0 ? Math.round(BACKOFF_MS[Math.min(failures, BACKOFF_MS.length) - 1] * POLL_SCALE) : Math.round(baseMs * POLL_SCALE); }
function slowText(name) { return '網路有點慢，' + name + '還在做，會繼續確認'; }

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
    id: id, kind: record.kind, character: chen ? 'chen' : 'shi', title: String(result.title || record.title || record.prompt).slice(0, 100),
    prompt: record.prompt, note: String(result.note || record.note || '').slice(0, 160), blob: larchMode() ? undefined : (blob || undefined), mimeType: (blob && blob.type) || result.mimeType || 'application/octet-stream',
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
      await new Promise(function (resolve) { setTimeout(resolve, pollDelay(failures, JOB_POLL_MS)); });
      let result;
      try {
        result = await callWorkerJob(path, record.jobId);
        if (failures > 0) { failures = 0; slowJobs.delete(record.jobId); notifyJob({ record: record, state: 'slow', on: false }); }
      }
      catch (error) {
        // Worker 找不到這個工作（紀錄已經清掉）：不會再做好了，當成沒做成，刪掉 job，重新整理也不再查。
        if (error.code === 'JOB_NOT_FOUND') {
          await StudioDB.remove('job:' + record.jobId);
          const lost = '這次沒有做成，可以再試一次。';
          toast(record.kind === 'image' ? '晨這張沒畫成：' + lost : '詩這首沒做成：' + lost);
          notifyJob({ record: record, state: 'error', message: lost });
          return;
        }
        // 網路或服務一時沒回應：保留 job，間隔拉長繼續查（作曲最久可能 10 分鐘），不放棄。
        failures += 1;
        if (failures === 1) { slowJobs.add(record.jobId); notifyJob({ record: record, state: 'slow', on: true }); }
        continue;
      }
      if (result.status === 'pending') continue;
      slowJobs.delete(record.jobId);
      await StudioDB.remove('job:' + record.jobId);
      if (result.status === 'done') {
        try {
          const work = await saveWork(record, result);
          if (record.kind === 'image') freeAffinity.award('chen');
          toast(record.kind === 'image' ? '晨畫好了：「' + work.title + '」，掛進畫架展廳了。' : '詩的歌做好了：「' + work.title + '」，收進詩的耳機了。');
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

const MING_GAMES_KEY = 'mingGames';
const MING_GAME_SAVES_KEY = 'mingGameSaves';
const MING_GAME_NOTICE_KEY = 'mingGameNotice';
const MING_GAME_JOB_PREFIX = 'mingGameJob:';
const MING_GAME_MOCK_PREFIX = 'mingGameMock:';
const MING_GAME_POLL_MS = mockMode ? 600 : 4000;
const MING_GAME_INDEX_LIMIT = larchMode() ? 5 : 60;
const MING_GAME_SAVES_LIMIT = larchMode() ? 800 : 100000;
const MING_GAME_PALETTE = { night: '#1b2747', blue: '#45628f', sky: '#8aa2ea', paper: '#f4f1ea', brass: '#c9954a', brassLight: '#f3d999', chen: '#c8d45a', shi: '#cf5a6c', lilac: '#c7b2ea', ink: '#1f1c26' };

function safeMingGameIndex(items) {
  return (Array.isArray(items) ? items : []).filter(function (item) {
    return item && typeof item.id === 'string' && item.id.length <= 80 && typeof item.name === 'string';
  }).slice(-MING_GAME_INDEX_LIMIT).map(function (item) {
    return {
      id: item.id,
      name: String(item.name || '明做的小遊戲').slice(0, 20),
      line: String(item.line || '').slice(0, 200),
      prompt: String(item.prompt || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200),
      createdAt: Number(item.createdAt) || Date.now()
    };
  });
}

async function getMingGameIndex() {
  return safeMingGameIndex(await StudioDB.get(MING_GAMES_KEY).catch(function () { return []; }));
}

async function putMingGameIndex(item) {
  const list = (await getMingGameIndex()).filter(function (current) { return current.id !== item.id; });
  list.push({ id: item.id, name: item.name, line: item.line, prompt: item.prompt, createdAt: item.createdAt });
  await StudioDB.set(MING_GAMES_KEY, safeMingGameIndex(list));
}

function withMingGameRequest(html, prompt) {
  const text = String(prompt || '').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 200)
    .replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const meta = '<meta name="ming-request" content="' + text + '">';
  const source = String(html || '');
  if (/<head\b[^>]*>/i.test(source)) return source.replace(/<head\b[^>]*>/i, function (head) { return head + meta; });
  return source.replace(/<!doctype\s+html[^>]*>/i, function (doctype) { return doctype + meta; });
}

function gameRequestFromHtml(html) {
  try {
    const documentNode = new DOMParser().parseFromString(String(html || ''), 'text/html');
    return String(documentNode.querySelector('meta[name="ming-request"]')?.content || '').slice(0, 200);
  } catch (error) { return ''; }
}

async function mingGamePrompt(item) {
  if (item && item.prompt) return String(item.prompt).slice(0, 200);
  let html = '';
  try {
    if (mockMode) html = await StudioDB.get(MING_GAME_MOCK_PREFIX + item.id);
    else {
      const player = await playerId();
      const response = await fetch(apiBase() + '/work?id=' + encodeURIComponent(item.id) + '&player=' + encodeURIComponent(player));
      if (response.ok) html = await response.text();
    }
  } catch (error) { /* 清單仍可看；讀不到時不帶回舊內容 */ }
  return gameRequestFromHtml(html);
}

async function getMingGameSaves() {
  const value = await StudioDB.get(MING_GAME_SAVES_KEY).catch(function () { return {}; });
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

async function saveMingGameState(id, data) {
  let encoded;
  try { encoded = JSON.stringify(data === undefined ? null : data); } catch (error) { return; }
  if (encoded.length > 4000) return;
  const saves = await getMingGameSaves();
  saves[id] = JSON.parse(encoded);
  let keys = Object.keys(saves);
  while (JSON.stringify(saves).length > MING_GAME_SAVES_LIMIT && keys.length > 1) {
    delete saves[keys.shift()];
  }
  if (JSON.stringify(saves).length <= MING_GAME_SAVES_LIMIT) await StudioDB.set(MING_GAME_SAVES_KEY, saves);
}

async function flushMingGameSave(frame) {
  if (!frame || !frame._mingGameSaveTimer) return;
  clearTimeout(frame._mingGameSaveTimer);
  frame._mingGameSaveTimer = 0;
  const pending = frame._mingGamePendingSave;
  frame._mingGamePendingSave = undefined;
  if (pending !== undefined) await saveMingGameState(frame.dataset.mingGame, pending);
}

async function pendingMingGameJobs() {
  const entries = await StudioDB.entries();
  return entries.filter(function (entry) { return String(entry[0]).startsWith(MING_GAME_JOB_PREFIX) && entry[1] && entry[1].jobId; })
    .map(function (entry) { return entry[1]; }).sort(function (a, b) { return a.createdAt - b.createdAt; });
}

async function updateMingGameNotice(state) {
  const hasNotice = !!(await StudioDB.get(MING_GAME_NOTICE_KEY).catch(function () { return false; }));
  const target = state || mingComputerState;
  if (!target) return;
  const label = target.menubar.querySelector('[data-game-notice]');
  if (label) label.hidden = !hasNotice;
  const dockItem = target.dock.querySelector('[data-osapp="games"]');
  if (dockItem) {
    dockItem.classList.toggle('has-game-notice', hasNotice);
    dockItem.setAttribute('aria-label', hasNotice ? '小遊戲做好了，打開明做的小遊戲' : '打開小遊戲');
  }
}

async function finishMingGameJob(record, result) {
  const id = String(result.workId || record.jobId);
  const item = {
    id: id,
    name: String(result.title || '明做的小遊戲').slice(0, 20),
    line: String(result.line || '嗯。妳說想玩，我就做了。').slice(0, 40),
    prompt: String(record.prompt || '').slice(0, 200),
    createdAt: Number(record.createdAt) || Date.now()
  };
  if (mockMode && typeof result.html === 'string') await StudioDB.set(MING_GAME_MOCK_PREFIX + id, withMingGameRequest(result.html, record.prompt));
  await putMingGameIndex(item);
  await StudioDB.remove(MING_GAME_JOB_PREFIX + record.jobId);
  await StudioDB.set(MING_GAME_NOTICE_KEY, true);
  toast('明做好一款小遊戲：「' + item.name + '」。');
  if (mingComputerState) showMingToast(mingComputerState, '明做好了：「' + item.name + '」。');
  await updateMingGameNotice();
  refreshMingGameRoots();
}

function pollMingGameJob(record) {
  if (activeMingGameJobs.has(record.jobId)) return activeMingGameJobs.get(record.jobId);
  const task = (async function () {
    let failures = 0;
    for (;;) {
      await new Promise(function (resolve) { setTimeout(resolve, pollDelay(failures, MING_GAME_POLL_MS)); });
      let result;
      try {
        result = await callWorkerJob('/game', record.jobId);
        if (failures > 0) { failures = 0; slowJobs.delete(record.jobId); refreshMingGameRoots(); }
      }
      catch (error) {
        if (error.code === 'JOB_NOT_FOUND') {
          slowJobs.delete(record.jobId);
          await StudioDB.remove(MING_GAME_JOB_PREFIX + record.jobId);
          toast('小遊戲這次沒有做成，可以再試一次。');
          await refreshMingGameRoots(); await refreshMingGameQuota();
          return;
        }
        // 不放棄：間隔拉長繼續查，卡片上的小字換成「網路有點慢」
        failures += 1;
        if (failures === 1) { slowJobs.add(record.jobId); refreshMingGameRoots(); }
        continue;
      }
      if (result.status === 'pending') continue;
      slowJobs.delete(record.jobId);
      if (result.status === 'done') {
        await finishMingGameJob(record, result);
        return;
      }
      if (mockMode && record.quotaKey) {
        const used = Number(await StudioDB.get(record.quotaKey).catch(function () { return 0; })) || 0;
        await StudioDB.set(record.quotaKey, Math.max(0, used - 1)).catch(function () {});
      }
      await StudioDB.remove(MING_GAME_JOB_PREFIX + record.jobId);
      toast('這個我做不出來，換個題目。');
      await refreshMingGameRoots();
      await refreshMingGameQuota();
      return;
    }
  })().finally(function () { activeMingGameJobs.delete(record.jobId); });
  activeMingGameJobs.set(record.jobId, task);
  return task;
}

async function resumeMingGameJobs() {
  try { (await pendingMingGameJobs()).forEach(pollMingGameJob); } catch (error) { /* 下次打開再接 */ }
}

async function refreshMingGameQuota() {
  const quotas = await quotaSnapshot();
  let quota = quotas && (quotas.game || (quotas.quotas && quotas.quotas.game));
  // mock 與 Worker 都用 game；額度總表漏欄時，直接讀本機 mock 的遊戲額度作保底。
  if (!quota && mockMode && mockTierParam) quota = await mockQuotaStatus('game').catch(function () { return null; });
  const remaining = quota && Number(quota.remaining);
  document.querySelectorAll('[data-ming-game-quota]').forEach(function (node) {
    if (!quota || !Number.isFinite(remaining) || !quotaHint('game', quota)) {
      node.textContent = QUOTA_UNKNOWN;
      return;
    }
    const hint = quotaHint('game', Object.assign({}, quota, { remaining: remaining }));
    const exhaustedNote = remaining <= 0
      ? (quota.scope === 'day' ? (studioTier() === 'trial' ? '（明天再來，完整版每天可請明做 3 款。）' : '（明天再來。）') : '')
      : '';
    node.textContent = hint + exhaustedNote;
  });
  document.querySelectorAll('[data-ming-game-submit]').forEach(function (node) { node.disabled = !!(quota && Number.isFinite(remaining) && remaining <= 0); });
}

function disposeMingGameFrames(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('iframe[data-ming-game]').forEach(function (frame) {
    flushMingGameSave(frame).catch(function () {});
    if (frame._mingGameMessage) window.removeEventListener('message', frame._mingGameMessage);
    if (frame.dataset.objectUrl) URL.revokeObjectURL(frame.dataset.objectUrl);
    try { frame.src = 'about:blank'; } catch (error) { /* 已離開文件 */ }
    frame.remove();
    mingGameFrames.delete(frame);
  });
}

function gameBridgeHelper() {
  var host = window.parent, info = null, callbacks = [], domReady = document.readyState !== 'loading', started = false;
  function tell(type, extra) { var data = { type: type }; if (extra) Object.keys(extra).forEach(function (key) { data[key] = extra[key]; }); try { host.postMessage(data, '*'); } catch (error) {} }
  function run() {
    if (started || !info || !domReady || !callbacks.length) return;
    started = true;
    try { callbacks.forEach(function (callback) { callback(info); }); tell('ming:started'); }
    catch (error) { tell('ming:error', { message: String(error && error.message || error).slice(0, 180) }); }
  }
  window.addEventListener('message', function (event) {
    if (event.source !== host || !event.data || event.data.type !== 'ming:init' || info) return;
    info = event.data.info || {}; run();
  });
  window.addEventListener('error', function (event) { tell('ming:error', { message: String(event.message || '程式錯誤').slice(0, 180) }); });
  window.addEventListener('unhandledrejection', function (event) { tell('ming:error', { message: String(event.reason && event.reason.message || event.reason || '程式錯誤').slice(0, 180) }); });
  document.addEventListener('DOMContentLoaded', function () { domReady = true; run(); });
  window.addEventListener('load', function () { domReady = true; run(); if (!callbacks.length) tell('ming:noinit'); });
  var memory = {};
  var store = { getItem: function (key) { return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null; }, setItem: function (key, value) { memory[key] = String(value); }, removeItem: function (key) { delete memory[key]; }, clear: function () { memory = {}; }, key: function (index) { return Object.keys(memory)[index] || null; } };
  Object.defineProperty(store, 'length', { get: function () { return Object.keys(memory).length; } });
  ['localStorage', 'sessionStorage'].forEach(function (key) { try { Object.defineProperty(window, key, { configurable: true, get: function () { return store; } }); } catch (error) {} });
  window.ming = {
    onInit: function (callback) { if (typeof callback !== 'function') return; if (started) callback(info); else { callbacks.push(callback); run(); } },
    save: function (data) { try { tell('ming:save', { data: JSON.parse(JSON.stringify(data === undefined ? null : data)) }); } catch (error) {} },
    score: function (score, result) { tell('ming:score', { score: Number(score), result: result === 'win' || result === 'lose' ? result : null }); },
    image: function (id) { var asset = info && info.assets && info.assets[id]; return asset && asset.kind === 'image' ? asset.url : ''; },
    play: function (id) { var asset = info && info.assets && info.assets[id]; if (!asset || asset.kind !== 'sound') return; try { var audio = new Audio(asset.url), promise = audio.play(); if (promise && promise.catch) promise.catch(function () {}); } catch (error) {} }
  };
  tell('ming:ready');
}

function gameDocument(source) {
  const body = String(source || '').replace(/^\uFEFF?\s*<!doctype[^>]*>/i, '');
  const policy = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; base-uri 'none'; form-action 'none'; frame-src 'none'; connect-src 'none'; object-src 'none'; worker-src 'none'";
  return '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' + policy + '"><script>(' + gameBridgeHelper.toString() + ')();</script>' + body;
}

async function openMingGame(root, item) {
  disposeMingGameFrames(root);
  const detail = el('section', 'ming-game-detail');
  const heading = el('div', 'ming-game-detail-head');
  heading.append(el('h2', '', item.name), el('span', 'ming-game-trial-tag', '明試做的，可能會怪怪的'));
  heading.appendChild(el('p', 'ming-game-request', '明說：「' + item.line + '」'));
  const status = el('p', 'ming-game-status', '明做的小遊戲，正在打開……');
  const frameHost = el('div', 'ming-game-frame-host');
  const controls = el('div', 'ming-game-controls');
  const back = button('回到清單', function () { renderMingGames(root, 'done', ''); });
  const redo = button('重做', async function () { renderMingGames(root, 'done', await mingGamePrompt(item)); });
  const remove = button('刪掉', function () { deleteMingGame(root, item); }, 'danger');
  controls.append(back, redo, remove);
  detail.append(heading, status, frameHost, controls);
  root.replaceChildren(detail);
  let html;
  try {
    if (mockMode) html = await StudioDB.get(MING_GAME_MOCK_PREFIX + item.id);
    else {
      const player = await playerId();
      const response = await fetch(apiBase() + '/work?id=' + encodeURIComponent(item.id) + '&player=' + encodeURIComponent(player));
      if (!response.ok) throw new Error(response.status === 404 ? '這款小遊戲可能超過 90 天沒有打開，已經清掉了。' : '小遊戲暫時載不到。等一下再試。');
      html = await response.text();
    }
    if (!html) throw new Error('找不到小遊戲內容。');
  } catch (error) {
    status.textContent = error.message || '小遊戲暫時載不到。';
    return;
  }
  const request = gameRequestFromHtml(html);
  if (request) detail.insertBefore(el('p', 'ming-game-player-request', '妳跟明說：「' + request + '」'), status);
  status.textContent = '小遊戲正在啟動……';
  const frame = el('iframe', 'ming-game-frame');
  frame.dataset.mingGame = item.id;
  frame.style.pointerEvents = 'none';
  frame.setAttribute('sandbox', 'allow-scripts');
  frame.setAttribute('title', item.name);
  frameHost.appendChild(frame);
  const objectUrl = URL.createObjectURL(new Blob([gameDocument(html)], { type: 'text/html;charset=utf-8' }));
  frame.dataset.objectUrl = objectUrl;
  mingGameFrames.add(frame);
  const onMessage = async function (event) {
    if (event.source !== frame.contentWindow || !event.data || typeof event.data.type !== 'string') return;
    if (event.data.type === 'ming:ready') {
      const saves = await getMingGameSaves();
      const assets = {};
      (window.MING_GAME_ASSETS || []).forEach(function (asset) { assets[asset.id] = { kind: asset.kind, name: asset.name, url: asset.url }; });
      const info = { names: { player: '茶語', chen: '晨', ming: '明', shi: '詩' }, day: game.day, palette: MING_GAME_PALETTE, assets: assets, save: saves[item.id] === undefined ? null : saves[item.id] };
      try { frame.contentWindow.postMessage({ type: 'ming:init', info: info }, '*'); } catch (error) { status.textContent = '小遊戲啟動失敗。'; }
    } else if (event.data.type === 'ming:save') {
      frame._mingGamePendingSave = event.data.data;
      if (frame._mingGameSaveTimer) clearTimeout(frame._mingGameSaveTimer);
      frame._mingGameSaveTimer = setTimeout(function () { flushMingGameSave(frame).catch(function () {}); }, 800);
    } else if (event.data.type === 'ming:score') {
      const score = Number(event.data.score);
      if (event.data.result === 'win' || event.data.result === 'lose') freeAffinity.award('ming');
      status.textContent = event.data.result === 'win' ? '過關了。' : Number.isFinite(score) ? '分數：' + score : '明試做的，可能會怪怪的。';
    } else if (event.data.type === 'ming:started' || event.data.type === 'ming:noinit') {
      frame.dataset.mingStarted = 'true';
      frame.style.pointerEvents = 'auto';
      status.textContent = '明試做的，可能會怪怪的。';
    } else if (event.data.type === 'ming:error') {
      status.textContent = '小遊戲執行時碰到問題。妳可以按重做。';
    }
  };
  frame._mingGameMessage = onMessage;
  window.addEventListener('message', onMessage);
  frame.src = objectUrl;
}

async function deleteMingGame(root, item) {
  const status = root.querySelector('.ming-game-status');
  if (status) status.textContent = '正在刪掉……';
  try {
    if (!mockMode) {
      const player = await playerId();
      const response = await fetch(apiBase() + '/work?id=' + encodeURIComponent(item.id) + '&player=' + encodeURIComponent(player), { method: 'DELETE' });
      const data = await response.json().catch(function () { return {}; });
      if (!response.ok) throw new Error(data.message || '刪不掉，等一下再試。');
    } else await StudioDB.remove(MING_GAME_MOCK_PREFIX + item.id);
    const saves = await getMingGameSaves();
    delete saves[item.id];
    await StudioDB.set(MING_GAME_SAVES_KEY, saves);
    await StudioDB.set(MING_GAMES_KEY, (await getMingGameIndex()).filter(function (current) { return current.id !== item.id; }));
    renderMingGames(root, 'done', '');
  } catch (error) {
    if (status) status.textContent = error.message || '刪不掉，等一下再試。';
  }
}

function refreshMingGameRoots() {
  mingGameRoots.forEach(function (root) {
    if (!root.isConnected) { mingGameRoots.delete(root); return; }
    if (root.querySelector('.ming-game-detail')) return;
    if (typeof root._refreshMingGames === 'function') root._refreshMingGames();
  });
}

async function renderMingGames(root, filter, initialPrompt) {
  filter = filter || root.dataset.gameFilter || 'done';
  root.dataset.gameFilter = filter;
  mingGameRoots.add(root);
  root._refreshMingGames = function () { renderMingGames(root, root.dataset.gameFilter, ''); };
  disposeMingGameFrames(root);
  const shell = el('div', 'ming-games-app');
  const form = el('form', 'ming-game-form');
  form.append(el('h3', 'ming-empty-app', '請明做新遊戲'));
  form.appendChild(el('p', 'sf-context', '說一句妳想玩什麼。明會先自由發揮，檢查沒過再用固定玩法試一次。'));
  const input = el('textarea', 'ming-game-prompt');
  input.maxLength = 200; input.rows = 2; input.placeholder = '例如：做一個月亮主題、可以收集星星的小遊戲';
  if (initialPrompt) input.value = String(initialPrompt).slice(0, 200);
  input.setAttribute('aria-label', '告訴明想做什麼小遊戲');
  const frameworkLabel = el('label', 'ming-game-framework-label', '玩法框架');
  const framework = el('select', 'ming-game-framework'); framework.setAttribute('aria-label', '玩法框架');
  [['auto', '由明自由發揮'], ['three-gears', '三齒輪保底'], ['memory-pairs', '翻牌保底']].forEach(function (entry) { const option = el('option', '', entry[1]); option.value = entry[0]; framework.appendChild(option); });
  frameworkLabel.appendChild(framework);
  const submit = button('請明做一個', null, 'primary'); submit.type = 'submit'; submit.dataset.mingGameSubmit = '';
  const quota = el('p', 'sf-quota-hint', QUOTA_UNKNOWN); quota.dataset.mingGameQuota = '';
  const status = el('p', 'ming-game-form-status'); status.setAttribute('aria-live', 'polite');
  form.append(input, frameworkLabel, submit, quota, status);
  const listHeading = el('h3', 'ming-games-list-heading', filter === 'pending' ? '明試做的' : '明做的');
  const list = el('div', 'ming-games-list');
  shell.append(form, listHeading, list);
  root.replaceChildren(shell);
  const draw = async function () {
    if (!root.isConnected) return;
    const items = await getMingGameIndex();
    const jobs = await pendingMingGameJobs();
    list.replaceChildren();
    if (filter === 'pending') {
      if (!jobs.length) list.appendChild(el('div', 'ming-empty-panel', '目前沒有等著明完成的小遊戲。'));
      jobs.slice().reverse().forEach(function (record) {
        const card = el('article', 'sf-card ming-game-card pending');
        const gameWait = waitingIndicator({ stages: jobStages('game'), color: CHARACTERS.ming.color, startedAt: record.createdAt });
        if (slowJobs.has(record.jobId)) gameWait.setNote(slowText('明'));
        card.append(el('h4', '', '明正在做'), el('p', '', '妳跟明說：「' + String(record.prompt || '').slice(0, 200) + '」'), el('p', 'ming-game-pending-note', '可以關掉這個視窗；做好時會在 Dock 和選單列通知妳。'), gameWait.el);
        list.appendChild(card);
      });
      return;
    }
    if (!items.length) list.appendChild(el('div', 'ming-empty-panel', '明做的小遊戲會收在這裡。'));
    items.slice().reverse().forEach(function (item) {
      const card = el('article', 'sf-card ming-game-card');
      card.dataset.gameId = item.id;
      const details = el('div', 'ming-game-card-copy');
      details.append(el('h4', '', item.name), el('span', 'ming-game-trial-tag', '明試做的，可能會怪怪的'), el('p', '', '明說：「' + item.line + '」'));
      const actions = el('div', 'ming-game-card-actions');
      actions.append(button('打開', function () { openMingGame(root, item); }, 'primary'), button('重做', async function () { renderMingGames(root, 'done', await mingGamePrompt(item)); }), button('刪掉', function () { deleteMingGame(root, item); }, 'danger'));
      card.append(details, actions);
      list.appendChild(card);
    });
  };
  root._refreshMingGames = draw;
  if (!root._mingGameFilterHandler) {
    root._mingGameFilterHandler = function (event) {
      const next = event.detail === 'pending' ? 'pending' : 'done';
      renderMingGames(root, next, '');
    };
    root.addEventListener('ming-game-filter', root._mingGameFilterHandler);
  }
  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    const prompt = input.value.trim();
    if (!prompt || submit.disabled) return;
    submit.disabled = true;
    status.textContent = '明收到了。正在做小遊戲……';
    try {
      const result = await callWorker('/game', { playerId: await playerId(), tier: studioTier(), day: game.day, prompt: prompt, framework: framework.value });
      const record = { jobId: result.jobId, prompt: prompt, quotaKey: result.quotaKey || '', framework: framework.value, createdAt: Date.now() };
      await StudioDB.set(MING_GAME_JOB_PREFIX + record.jobId, record);
      status.textContent = '明正在做。可以關掉這個視窗；做好時會在選單列或 Dock 通知妳。';
      input.value = '';
      await refreshMingGameQuota();
      await draw();
      pollMingGameJob(record);
    } catch (error) {
      const message = error.code === 'TRIAL_GAME_LIMIT' ? (TRIAL_LINES[error.code] || {}).text : isDailyLimit(error.code) ? quotaMessage(error.code, 'ming', error.limit, error.scope) : error.message;
      status.textContent = message || '明那邊暫時接不上，等一下再試。';
      await refreshMingGameQuota();
    } finally {
      await refreshMingGameQuota();
    }
  });
  await draw();
  await refreshMingGameQuota();
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
let lookingAtDrawing = false;
async function lookAtDrawing(dataUrl) {
  if (lookingAtDrawing) {
    const busy = new Error('晨還在看上一張畫。');
    throw busy;
  }
  lookingAtDrawing = true;
  try {
    const base = await workerContext('chen');
    const history = await StudioDB.get('chat:chen') || [];
    let mockCount = null;
    if (mockMode && !mockTierParam) {
      mockCount = await mockLookCount();
      if (mockCount.n >= LOOK_DAILY_LIMIT) { const full = new Error('今天給晨看畫的次數已用完。'); full.code = 'DAILY_LOOK_LIMIT'; full.limit = LOOK_DAILY_LIMIT; throw full; }
    }
    await beginWait('look:chen', 'look', 'chen');
    let answer = null;
    try { answer = await lookAtDrawingInner(base, history, dataUrl, mockCount); return answer; }
    finally { await endWait('look:chen', answer); }
  } finally { lookingAtDrawing = false; }
}
async function lookAtDrawingInner(base, history, dataUrl, mockCount) {
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
  const work = { id: id, kind: 'drawing', character: 'tea', title: title, prompt: '晨：' + reply, blob: blob, mimeType: 'image/jpeg', createdAt: Date.now(), workId: result.workId || '', workUrl: result.workUrl || '' };
  const keep = result.saved !== false && !!(blob || work.workId);   // Larch 版沒有本機檔，要 Worker 存成功才收進展廳
  if (keep) await StudioDB.set('drawing:' + id, work);
  // 進晨的聊天串：一則「妳給晨看了一張畫」（附縮圖）＋晨的回應；之後聊天與記憶摘要都讀得到
  const now = Date.now();
  const timing = storyTime(base.day, base.chapter);
  const savedHistory = await StudioDB.get('chat:chen') || [];
  savedHistory.push({ role: 'user', content: '（茶語給晨看了一張自己畫的畫。晨替這張畫取名〈' + title + '〉。）', ts: now, draw: id, ...timing });
  savedHistory.push(Object.assign({ role: 'assistant', speaker: 'chen', content: reply, ts: now + 1, ...timing }, result.mood && result.mood !== 'neutral' ? { mood: result.mood } : {}));
  await StudioDB.set('chat:chen', savedHistory);
  summarizeIfNeeded('chen').catch(function () {});
  return { reply: reply, title: title, mood: result.mood, work: keep ? work : null, remaining: legacyMock ? LOOK_DAILY_LIMIT - mockCount.n : result.remaining, limit: legacyMock ? LOOK_DAILY_LIMIT : result.limit, scope: legacyMock ? 'day' : result.scope };
}
// 第 29 天起長桌上多一排貝殼（劇本第七章：第 28 天四個人在海灘撿了二十三個，「全部帶回去，放在長桌上」）。
// 側面捲軸沒有畫長桌，貝殼排在長桌群聊面板最上面；挑七個代表，粉紅色那個（第 23 個、茶語撿的）在中間。用島上的貝殼紙片
const SHELL_ROW = [3, 1, 5, 6, 2, 7, 4];   // 6＝珊瑚粉，第 28 天的第 23 個
function shellRow(root) {
  if (!(game.day >= 29)) return;
  const row = el('div', 'sf-shell-row'); row.setAttribute('aria-label', '長桌上，花瓶旁邊一排貝殼'); row.dataset.shells = String(SHELL_ROW.length);
  SHELL_ROW.forEach(function (n, i) { const img = el('img', 'sf-shell' + (n === 6 ? ' pink' : '')); img.src = '../map2d/side/art/sprites/shell_' + n + '.webp'; img.alt = ''; img.style.setProperty('--tilt', ((i % 3) - 1) * 6 + 'deg'); row.appendChild(img); });
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

function drawingDeps() {
  return {
    onStroke: () => freeAffinity.award('chen'),
    el: el, button: button, db: StudioDB, progress: drawProgress, waiting: waitingIndicator, lookStages: lookStages, pendingLook: function () { return getWait('look:chen'); }, onLookEnd: function (root, handler) { onWaitEnd(root, 'look:chen', function (answer) { handler(answer); }); }, remaining: lookRemaining, look: lookAtDrawing, chenBubble: chenBubble,
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
  };
}

async function renderCreation(character, root, options) {
  const chen = character === 'chen';
  const kind = chen ? 'image' : 'song';
  const description = el('p', 'sf-context', chen ? '畫好會通知妳，作品會收進畫架與明的收藏。等待時可以先離開。' : '歌做好會通知妳，作品會收進詩的耳機與明的收藏。等待時可以先離開。');
  const prompt = el('textarea', 'sf-textarea');
  prompt.maxLength = 800;
  prompt.placeholder = chen ? '例如：窗邊花瓶裡的波斯菊。' : '例如：一首適合雨天回家路上的慢歌。';
  const create = button(chen ? '請晨開始畫' : '請詩開始做歌', null, 'primary');
  const status = el('p', 'sf-status');
  const waiting = el('ul', 'sf-jobs');
  const result = el('div', 'sf-stack');
  const hint = quotaHintEl(kind);
  const request = el('section', 'sf-creation');
  const field = el('label', 'sf-creation-label', chen ? '想請晨畫什麼？' : '想請詩做什麼樣的歌？');
  field.appendChild(prompt);
  request.append(field, description, create, hint);
  status.setAttribute('role', 'status');
  root.append(request, status, waiting, result);

  async function drawWaiting() {
    const jobs = await pendingJobs(kind);
    waiting.replaceChildren();
    jobs.forEach(function (job) {
      const item = el('li', 'sf-job', (chen ? '還在畫：' : '還在做：') + job.prompt);
      const jobWait = waitingIndicator({ stages: jobStages(kind), color: CHARACTERS[character].color, startedAt: job.createdAt });
      if (slowJobs.has(job.jobId)) jobWait.setNote(slowText(CHARACTERS[character].name));
      item.appendChild(jobWait.el);   // 照送出時間算起，重新打開從對應那一段接著
      waiting.appendChild(item);
    });
  }
  function listener(event) {
    if (!root.isConnected) { jobListeners.delete(listener); return; }
    if (event.record.kind !== kind) return;
    drawWaiting();
    if (event.state === 'slow') return;
    hint.refresh();   // 沒做成時 Worker 會把那一格還回去
    if (event.state === 'done') {
      status.textContent = chen ? '畫收進晨的畫架了，也放進明的收藏資料夾。' : '歌收進詩的耳機了，也放進明的收藏資料夾。';
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
      const note = options?.replyNote?.slice(0, 160) || '';
      if (options) { options.replyTo = ''; options.replyNote = ''; }
      const response = await callWorker(chen ? '/img' : '/music', Object.assign({}, base, { prompt: idea, character: character }, reply));
      const record = { jobId: response.jobId, kind: kind, prompt: idea, title: response.title || idea, character: character, note, createdAt: Date.now() };
      if (!response.jobId) {
        // 上游直接回作品（舊介面）：照舊存。
        const work = await saveWork(record, response);
        if (chen) freeAffinity.award('chen');
        listener({ record: record, state: 'done', work });
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

function pictureButton(image, open) {
  const trigger = button('', open, 'sf-picture-open');
  trigger.appendChild(image);
  return trigger;
}

function showImage(work, from = 'gallery', noteText = work.prompt || work.title, puzzle = null) {
  disposeMingComputer();
  clearBody();
  panel.dataset.design = 'art';
  panelTitle.textContent = work.title;
  const backLabel = { favorites: '回到收藏資料夾', chat: '回到和晨的聊天', gallery: '回到畫架展廳' };
  const back = button(backLabel[from], function () {
    if (from === 'favorites') openMingComputer(returnFocus, 'favorites');
    else openCharacter('chen', returnFocus, from);
  });
  const image = el('img', 'sf-hero-img');
  image.alt = work.title;
  image.src = work.blob instanceof Blob ? workSrc(work) : work.src || workSrc(work);
  const actions = el('div', 'sf-image-actions');
  actions.append(back);
  if (puzzle) {
    actions.append(button('拼成拼圖', () => openChenPuzzle(work.id), 'sf-cg-puzzle'));
    if (puzzle.best) actions.append(puzzleBadge(el, puzzle.best));
  }
  panelBody.append(actions, image);
  if (noteText) panelBody.append(el('p', 'sf-context', noteText));
  back.focus({ preventScroll: true });
}

function puzzleImageId(work) {
  if (work.puzzleId) return 'art:' + work.puzzleId;
  const id = work.workId || work.id;
  if (typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) return '';
  return (work.kind === 'drawing' ? 'drawing:' : 'image:') + id;
}

function openChenPuzzle(id) {
  openCharacter('chen', returnFocus, 'puzzle', { puzzleImage: id });
}

function seenStoryCGs() {
  return decodeHudSeen(larchVariables.hudSeen ?? query.get('hudSeen'), HUD_SEEN_KEYS)?.keys;
}

async function unlockedPuzzleCGs() {
  const { STUDIO_PUZZLE_CGS } = await import('./studio_puzzle_cgs.mjs');
  const seen = seenStoryCGs();
  const all = query.get('unlock') === 'all';   // 預覽頁用：全部 CG 都能拼
  return STUDIO_PUZZLE_CGS.filter(([id]) => all || seen?.has(id))
    .map(([id, title, src]) => ({ id: 'cg:' + id, title: title || id, src }));
}

function galleryArt() {
  const story = studioStory();
  const chapter = story.trueEnd ? 99 : game.chapter;
  return CHEN_ART.filter(work => chapter >= work.chapter && (story.trueEnd || !work.day || game.day >= work.day));
}

function chenImage(work) {
  return work.kind === 'image' && (!work.character || work.character === 'chen');
}

async function renderPuzzleTab(root, initialId) {
  await playerId().catch(() => {});
  const [images, drawings, cgs] = await Promise.all([savedWorks('image'), savedWorks('drawing'), unlockedPuzzleCGs()]);
  if (!root.isConnected) return;
  const source = work => ({ id: puzzleImageId(work), title: work.title, src: work.src || workSrc(work) });
  const ready = work => work.id && work.src;
  const sources = [
    ['晨畫的', [...images.filter(chenImage), ...galleryArt()].map(source).filter(ready)],
    ['我來畫', drawings.filter(work => work.kind === 'drawing').map(source).filter(ready)],
    ['劇情 CG', cgs]
  ];
  const initial = sources.flatMap(([, items]) => items).find(item => item.id === initialId);
  renderPuzzle(root, { el, button, avatar: CHARACTERS.chen.avatar, db: StudioDB, sources, initial });
}

async function renderGallery(root) {
  await playerId().catch(function () {});   // Larch 版的作品網址要帶玩家編號
  const [images, drawings, conversation, bests] = await Promise.all([
    savedWorks('image'), savedWorks('drawing'), StudioDB.get('chat:chen'),
    puzzleEnabled ? readPuzzleBests(StudioDB) : null
  ]);
  if (!root.isConnected) return;
  // 舊的 image:* 都是晨接到委託後畫的。舊的 drawing:* 是茶語給晨看的原畫。
  const works = images.filter(chenImage)
    .concat(drawings.filter(work => work.kind === 'drawing' && (work.character === 'chen' || ((puzzleEnabled || coloringEnabled) && work.character === 'tea'))))
    .sort((a, b) => b.createdAt - a.createdAt);
  const replies = new Map();
  (conversation || []).forEach((message, index, messages) => {
    const reply = messages[index + 1];
    if (message.draw && reply?.speaker === 'chen' && reply.role === 'assistant') replies.set(message.draw, reply.content);
  });
  const cards = works.map(work => ({
    ...work,
    src: workSrc(work),
    note: work.note || replies.get(work.replyTo) || (work.kind === 'drawing' && /^晨[：:]/.test(work.prompt || '') ? work.prompt : '')
  })).filter(work => work.src).concat(galleryArt());
  if (!cards.length) { empty(root, '畫架上還沒有作品。可以請晨畫一張。'); return; }
  const grid = el('div', 'sf-grid');
  const own = coloringEnabled ? el('div', 'sf-grid') : grid;
  cards.forEach(function (work) {
    const card = el('article', 'sf-card');
    card.dataset.artist = 'chen';
    if (work.id) card.dataset.work = work.id;
    const image = el('img', 'sf-cover'); image.src = work.src; image.alt = work.title;
    const trigger = pictureButton(image, function () { showImage(work, 'gallery', work.note || work.title); });
    trigger.setAttribute('aria-label', '放大' + work.title);
    card.append(trigger, el('h3', '', work.title));
    if (work.note) card.append(el('p', '', work.note));
    if (puzzleEnabled) {
      const id = puzzleImageId(work);
      if (id) {
        const best = bests.get(id);
        if (best) {
          trigger.classList.add('sf-puzzle-badged');
          trigger.append(puzzleBadge(el, best));
          card.append(el('small', 'sf-puzzle-best', '已拼好・' + best[1] + ' 片最快 ' + puzzleTime(best[2])));
        }
        card.append(button('拼成拼圖', () => openChenPuzzle(id)));
      }
    }
    const isOwn = work.kind === 'drawing' && work.character === 'tea';
    (isOwn ? own : grid).appendChild(card);
  });
  if (grid.childElementCount) root.appendChild(grid);
  if (coloringEnabled && own.childElementCount) {
    const section = el('section', 'sf-coloring-gallery');
    section.append(el('h2', 'sf-section', '我畫的'), own);
    root.appendChild(section);
  }
}

// 耳機播詩的試唱和委託作品，沿用唱片架的播放控制和歌詞。
async function renderAlbum(root) {
  await playerId().catch(function () {});   // Larch 版的作品網址要帶玩家編號
  const works = await savedWorks('song');
  const items = works.map(function (work) {
    const lyrics = String(work.lyrics || '').split('\n').map(function (line) { return line.trim(); }).filter(function (line) { return line && !/^\[[^\]]*\]$/.test(line); });
    return { id: work.id, title: work.title || '詩的歌', mp3: workSrc(work), lyrics: lyrics.length ? lyrics : null, prompt: work.prompt || '', group: '妳請詩做的歌',
      when: work.createdAt ? new Date(work.createdAt).toLocaleDateString('zh-TW', { month: 'long', day: 'numeric' }) + '做好' : '', duration: 0 };
  });
  // 〈今天好無聊〉兩個版本一開始就在（作者 2026-11-21），排在妳請詩做的作品前面；還沒請詩做歌時，曲目底下提示去哪裡請
  const all = HEADPHONE_TRACKS.map(function (track) { return Object.assign({}, track); }).concat(items);
  let note = null;
  if (!items.length) {
    note = el('div', 'sa-empty');
    note.append(el('p', 'sf-empty', '還沒有妳請詩做的歌。到「請詩做歌」寫下想聽什麼樣的歌，做好會收在這裡。'));
    const go = el('div', 'sa-empty-go');
    go.appendChild(button('去請詩做歌', function () { const tab = panelBody.querySelector('.sf-tab[data-tab="create"]'); if (tab) tab.click(); }, 'sa-go-create'));
    note.appendChild(go);
  }
  mountAlbum(root, { mode: 'mine', items: all, listNote: note, onListen: () => freeAffinity.award('shi') });
}

// 唱片架（5）＝劇情裡聽過的歌（作者 2026-11-21）。解鎖看常駐介面記的 hudSeen（Larch 變數；測試可從網址帶 hudSeen=s0,s4），
// 沒有 hudSeen（網站版）時看第幾天；生日歌看第六章 CG 6-19 的鍵或第 20 天之後；最後一格只有夥伴結局那張卡（album_player）打開過才解鎖。
// 解鎖過的記在 albumSeen（Larch 版是跨週目的 studioMisc），重玩也還在。網址 unlock=all 全開、不寫回。
async function albumUnlocks() {
  let saved = [], final = false;
  try { const value = await StudioDB.get('albumSeen'); if (Array.isArray(value)) saved = value; } catch (error) { /* 當成沒有 */ }
  try { final = await StudioDB.get('albumFinal') === true; } catch (error) { /* 當成沒有 */ }
  const all = query.get('unlock') === 'all';
  const hudSeen = larchVariables.hudSeen !== undefined ? larchVariables.hudSeen : (query.has('hudSeen') ? query.get('hudSeen') : undefined);
  const ids = unlockedIds({ all: all, hudSeen: hudSeen, day: game.day, final: final, saved: saved });
  if (!all) {
    const added = [...ids].filter(function (id) { return !saved.includes(id); });
    if (added.length) { try { await StudioDB.set('albumSeen', saved.concat(added)); } catch (error) { /* 存不下下次再算 */ } }
  }
  return ids;
}

async function openShelf(focus, options) {
  panelOpen('詩的唱片架', focus, 'shelf', 'shi');
  clearBody();
  const ids = await albumUnlocks();
  const items = ALBUM_TRACKS.map(function (track) { return Object.assign({}, track, { locked: !ids.has(track.id), final: !!(track.unlock && track.unlock.final) }); });
  mountAlbum(panelBody, { mode: 'story', items: items, startId: options && options.startId, autoplay: !!(options && options.autoplay), onListen: options?.autoplay ? undefined : () => freeAffinity.award('shi') });
}

// 夥伴結局「專輯播放器：最後一格「？」解鎖」那張卡（studio_embed.mjs 的 album_player）：記下解鎖、打開唱片架、放最後一首
async function openAlbumFinal(focus) {
  try { await StudioDB.set('albumFinal', true); } catch (error) { /* 存不下這次照樣開 */ }
  await openShelf(focus, { startId: 'shi-full', autoplay: true });
  return true;
}

function addComputerWidgetList(container, settings) {
  const widgets = el('div', 'sf-widgets');
  const info = {
    progress: ['進度表', '顯示目前存下的進度項目。'],
    favorites: ['收藏', '顯示目前存下的作品。'],
    calendar: ['行事曆', '今天第 ' + game.day + ' 天'],
    notes: ['便利貼', '目前沒有便利貼資料。']
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
function trialDaysLeft() { return game.trialEnded ? null : TRIAL_LAST_DAY + 1 - game.day; }
function trialStatus() { return game.trialEnded ? (storyRoute() ? '已續訂' : '試用期已結束') : ''; }
function trialLine() { return trialStatus() || '試用期剩 ' + trialDaysLeft() + ' 天'; }

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

async function openMingComputer(focus, initialTab, showChat = false) {
  panelOpen('明的電腦', focus, 'computer');
  clearBody();
  const pending = el('div');
  panelBody.appendChild(pending);
  const savedSettings = await StudioDB.get('computerSettings').catch(function () { return null; });
  if (!pending.isConnected || !panel.classList.contains('on')) return;
  pending.remove();
  panel.classList.add('ming-os-panel');
  const settings = sanitizeSettings(savedSettings || DEFAULT_SETTINGS);
  const shell = el('div', 'ming-computer-shell' + (focusEnabled ? ' ming-group1' : ''));
  const stage = el('div', 'ming-os-stage');
  const room = el('img', 'imac-room');
  room.src = '../../../cg/ch2/ch2_cg_004.webp';
  room.alt = '';
  const imac = el('div', 'imac');
  const bezel = el('div', 'imac-bezel');
  const camera = el('span', 'imac-cam');
  const screen = el('div', 'imac-screen');
  const desktop = el('div', 'mac');
  const wallpaper = el('img', 'wp');
  wallpaper.alt = '月光岬的鐘塔夜景';
  const menubar = el('header', 'menubar');
  const icons = el('div', 'ming-desktop-icons');
  const widgets = el('div', 'ming-desktop-widgets');
  const windowLayer = el('div', 'ming-window-layer');
  const dock = el('nav', 'mdock ming-dock');
  dock.setAttribute('aria-label', '明的電腦 Dock');
  const chin = el('div', 'imac-chin');
  const logo = mingLogoNode('logo');
  const stand = el('div', 'imac-neck');
  chin.appendChild(logo);
  desktop.append(wallpaper, menubar, icons, widgets, windowLayer, dock);
  screen.appendChild(desktop);
  bezel.append(camera, screen);
  imac.append(bezel, chin);
  stage.append(room, imac, stand);
  // 視窗比 1280×720 寬或高時，電腦等比例放大，剩下的邊用同一張模糊的工作室背景鋪滿（作者 2026-11-21：不要黑邊）
  const roomFill = el('img', 'imac-room-fill');
  roomFill.src = room.src; roomFill.alt = '';
  shell.append(roomFill, stage);
  panelBody.appendChild(shell);

  const state = {
    shell: shell, stage: stage, room: room, wallpaper: wallpaper, screen: screen,
    menubar: menubar, desktop: desktop, icons: icons, widgets: widgets,
    windowLayer: windowLayer, dock: dock, windows: new Map(),
    settings: settings, active: '', zIndex: 10, quotaPopover: null, clockTimer: 0, mobileActive: ''
  };
  state.resizeHandler = function () { updateMingStageScale(state); syncMingDockApps(state); updateMingDockScrollHint(state); };
  window.addEventListener('resize', state.resizeHandler, { passive: true });
  updateMingStageScale(state);
  updateMingWallpaper(state, savedSettings ? settings.wallpaper : 'moonlight');
  mingComputerState = state;
  buildMingMenu(state);
  buildMingDesktop(state);
  buildMingDock(state);
  focusApp?.desktopChanged();
  updateMingDockScrollHint(state);
  updateMingClock(state);
  updateMingGameNotice(state).catch(function () {});
  state.clockTimer = window.setInterval(function () { updateMingClock(state); }, 15000);
  renderMingDesktopWidgets(state).catch(function () {});
  resumeMingGameJobs();
  if (showChat) openMingApp(state, 'chat');
  if (initialTab) openMingApp(state, initialTab);
  else if (!$('.sf-help-layer')) shell.querySelector('.ming-exit').focus({ preventScroll: true });
}

function updateMingStageScale(state) {
  if (!state || !state.stage) return;
  const compact = window.matchMedia('(max-width: 600px), (orientation: portrait)').matches;
  const scale = compact ? 1 : Math.min(window.innerWidth / 1280, window.innerHeight / 720);
  state.stage.style.setProperty('--ming-scale', String(Math.max(.01, scale)));
}

const MING_WALLPAPERS = {
  moonlight: '../../../cg/ch5/ch5_cg_019.webp',
  north: '../../新版/canon_new/studio/flat/N.webp',
  east: '../../新版/canon_new/studio/flat/E.webp',
  south: '../../新版/canon_new/studio/flat/S.webp',
  west: '../../新版/canon_new/studio/flat/W.webp'
};

function updateMingWallpaper(state, key) {
  state.wallpaper.src = MING_WALLPAPERS[key] || MING_WALLPAPERS.moonlight;
  state.desktop.style.setProperty('--ming-accent', state.settings.themeColor);
}

const MING_APPS = [
  { id: 'chat', label: '和明說話', icon: 'message' },
  { id: 'progress', label: '進度表', icon: 'todo' },
  ...(focusEnabled ? [{ id: 'focus', label: '陪讀計時器', icon: 'focus' }] : []),
  { id: 'calendar', label: '月曆', icon: 'calendar' },
  { id: 'games', label: '請明做新遊戲', icon: 'games' },
  { id: 'timeline', label: '時光記錄', icon: 'timeline' },
  { id: 'favorites', label: '收藏', icon: 'files' },
  { id: 'phone', label: '我的手機', icon: 'phone' },
  { id: 'settings', label: '設定', icon: 'settings' },
  { id: 'website', label: '作品網站', icon: 'globe', postgame: true },
  { id: 'files', label: '劇情裡的檔案', icon: 'files', secondary: true },
  { id: 'backup', label: '我的資料備份', icon: 'save', secondary: true },
  { id: 'story-games', label: '重玩故事關卡', icon: 'games', secondary: true },
  { id: 'help', label: '說明', icon: 'info', secondary: true }
];

function mingAppAvailable(app) { return !app.postgame || game.clearedTrue || game.day > 30; }
function mingApp(id) { return MING_APPS.find(function (app) { return app.id === id && mingAppAvailable(app); }); }

const COMPUTER_APPS = { progress: 'progress', replay: 'story-games', newgame: 'games' };

function availableComputerPanels(scene) {
  return Object.keys(COMPUTER_APPS).filter(key => mingApp(COMPUTER_APPS[key])
    && (key !== 'replay' || replayGames(scene).length > 0));
}

async function runComputerChatAction(value, root, scene) {
  const action = computerAction(value);
  if (!action || game.day !== scene.day || game.chapter !== scene.chapter) return;
  if (action.type === 'settings') {
    const current = sanitizeSettings(await StudioDB.get('computerSettings'));
    await saveSettings(applySettingsPatch(current, action.settings));
    if (!mingComputerState && panel.classList.contains('on') && root.isConnected) await openMingComputer(returnFocus, 'chat');
    return;
  }
  if (!panel.classList.contains('on') || !root.isConnected || !availableComputerPanels(game).includes(action.panel)) return;
  const id = COMPUTER_APPS[action.panel];
  if (mingComputerState) openMingApp(mingComputerState, id);
  else await openMingComputer(returnFocus, id, true);
}

let mingLogoSequence = 0;
// 月蝕幾何照新版/canon_new/props/ming_os_logo.svg 描繪成 inline SVG。
function mingLogoNode(className) {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  const maskId = 'ming-os-logo-mask-' + (++mingLogoSequence);
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '1.5 1.5 17 17');
  svg.setAttribute('aria-hidden', 'true');
  const defs = document.createElementNS(ns, 'defs');
  const mask = document.createElementNS(ns, 'mask'); mask.setAttribute('id', maskId);
  const rect = document.createElementNS(ns, 'rect'); rect.setAttribute('width', '20'); rect.setAttribute('height', '20'); rect.setAttribute('fill', '#fff');
  const cutout = document.createElementNS(ns, 'circle'); cutout.setAttribute('cx', '12.828'); cutout.setAttribute('cy', '7.172'); cutout.setAttribute('r', '4.8'); cutout.setAttribute('fill', '#000');
  mask.append(rect, cutout); defs.appendChild(mask);
  const moon = document.createElementNS(ns, 'circle'); moon.setAttribute('cx', '10'); moon.setAttribute('cy', '10'); moon.setAttribute('r', '8'); moon.setAttribute('fill', '#fff'); moon.setAttribute('mask', 'url(#' + maskId + ')');
  const glow = document.createElementNS(ns, 'circle'); glow.setAttribute('cx', '12.828'); glow.setAttribute('cy', '7.172'); glow.setAttribute('r', '4'); glow.setAttribute('fill', '#fff'); glow.setAttribute('fill-opacity', '.45');
  svg.append(defs, moon, glow);
  return svg;
}

function mingIconGradient(id, first, last) {
  return '<linearGradient id="' + id + 'bg" x1="0" y1="0" x2="0" y2="1"><stop stop-color="' + first + '"/><stop offset="1" stop-color="' + last + '"/></linearGradient>';
}
function mingIconGloss(id) {
  return '<linearGradient id="' + id + 'gl" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".38"/><stop offset=".45" stop-color="#fff" stop-opacity=".04"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".06"/></linearGradient>';
}
function mingIconShadow(id, color, opacity) {
  return '<filter id="' + id + 'sh" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="2.2" stdDeviation="2.2" flood-color="' + color + '" flood-opacity="' + opacity + '"/></filter>';
}
function mingGearPath(cx, cy, outer, inner, teeth, toothWidth) {
  let path = '';
  for (let index = 0; index < teeth; index += 1) {
    const angle = index * 2 * Math.PI / teeth, half = Math.PI / teeth;
    [[inner, angle - half * .95], [outer, angle - half * toothWidth], [outer, angle + half * toothWidth], [inner, angle + half * .95]].forEach(function (point, offset) {
      path += (index || offset ? 'L' : 'M') + (cx + Math.cos(point[1]) * point[0]).toFixed(2) + ' ' + (cy + Math.sin(point[1]) * point[0]).toFixed(2);
    });
  }
  return path + 'Z';
}
function mingIconShape(kind, id) {
  const gloss = mingIconGloss(id);
  if (kind === 'globe') return '<defs>' + mingIconGradient(id, '#eee3cd', '#c8ceb1') + mingIconShadow(id, '#35575a', .26) + '</defs>' +
    '<rect width="100" height="100" fill="url(#' + id + 'bg)"/>' +
    '<path d="M20 36Q33 10 63 17Q91 22 89 54Q84 84 54 88Q23 83 16 60Q12 47 20 36Z" fill="#75a7aa" opacity=".52"/>' +
    '<path d="M25 29Q42 13 65 22Q86 31 82 57Q78 81 52 83Q23 81 18 56Q15 42 25 29Z" fill="#558d94" filter="url(#' + id + 'sh)"/>' +
    '<path d="M27 37Q46 25 68 34M25 65Q51 76 75 64" fill="none" stroke="#87b8b0" stroke-width="8" opacity=".6" stroke-linecap="round"/>' +
    '<g fill="none" stroke="#fff2d9" stroke-width="3" stroke-linecap="round"><circle cx="50" cy="51" r="28"/><ellipse cx="50" cy="51" rx="12" ry="28"/><path d="M23 51h54M28 36q22 10 44 0M28 66q22-10 44 0"/></g>';
  if (kind === 'message') return '<defs>' + mingIconGradient(id, '#c4b8f6', '#7b84e0') + gloss + mingIconShadow(id, '#3b2f8a', .3) + '<linearGradient id="' + id + 'w" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#e9eafe"/></linearGradient></defs><rect width="100" height="100" fill="url(#' + id + 'bg)"/><g filter="url(#' + id + 'sh)"><ellipse cx="50" cy="47" rx="32" ry="26.5" fill="url(#' + id + 'w)"/><path d="M26 60c-1 8-5 13-10 16 9 1 17-2 23-8z" fill="url(#' + id + 'w)"/></g><rect width="100" height="100" fill="url(#' + id + 'gl)"/>';
  if (kind === 'focus') return '<defs>' + mingIconGradient(id, '#b6cafd', '#617bbf') + '</defs><rect width="100" height="100" fill="url(#' + id + 'bg)"/><g stroke="#fff" stroke-width="5" stroke-linecap="round" fill="none"><circle cx="50" cy="54" r="26"/><path d="M43 17h14m-7 0v11m0 13v13l11 7"/></g>';
  if (kind === 'todo') {
    let rows = '';
    [['#97bd56', true], ['#45628f', true], ['#9a536a', false]].forEach(function (row, index) {
      const y = 29 + index * 21;
      rows += row[1] ? '<circle cx="27" cy="' + y + '" r="7.5" fill="' + row[0] + '"/><path d="M23.5 ' + y + 'l2.6 2.6 5-5.2" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' : '<circle cx="27" cy="' + y + '" r="6.5" fill="none" stroke="' + row[0] + '" stroke-width="2.6"/>';
      rows += '<rect x="41" y="' + (y - 3) + '" width="' + (index === 2 ? 26 : 38) + '" height="6" rx="3" fill="#cfcad8"/>';
    });
    return '<defs>' + mingIconGradient(id, '#fff', '#f4f1f6') + '</defs><rect width="100" height="100" fill="url(#' + id + 'bg)"/>' + rows;
  }
  if (kind === 'games') return '<defs>' + mingIconGradient(id, '#6d8cc8', '#22355f') + gloss + mingIconShadow(id, '#0a1430', .45) + '<linearGradient id="' + id + 'br" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f6dc9c"/><stop offset="1" stop-color="#b98536"/></linearGradient><linearGradient id="' + id + 'w" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff"/><stop offset="1" stop-color="#dde4f4"/></linearGradient></defs><rect width="100" height="100" fill="url(#' + id + 'bg)"/><path d="' + mingGearPath(73, 27, 17, 13, 10, .45) + '" fill="url(#' + id + 'br)"/><circle cx="73" cy="27" r="5.5" fill="#2b406e"/><g filter="url(#' + id + 'sh)"><path d="M31 40h38c10 0 16 8 18 19l2 11c1 8-7 12-13 6l-7-7H31l-7 7c-6 6-14 2-13-6l2-11c2-11 8-19 18-19z" fill="url(#' + id + 'w)"/></g><path d="M29 50v14M22 57h14" stroke="#34507c" stroke-width="5" stroke-linecap="round"/><circle cx="66" cy="52" r="4.2" fill="#97bd56"/><circle cx="74" cy="60" r="4.2" fill="#9a536a"/><rect width="100" height="100" fill="url(#' + id + 'gl)"/>';
  if (kind === 'timeline') return '<defs>' + mingIconGradient(id, '#f9dfb2', '#e09a5e') + gloss + mingIconShadow(id, '#7a3e10', .3) + '</defs><rect width="100" height="100" fill="url(#' + id + 'bg)"/><g filter="url(#' + id + 'sh)"><rect x="27" y="17" width="46" height="7" rx="3.5" fill="#fff"/><rect x="27" y="76" width="46" height="7" rx="3.5" fill="#fff"/><path d="M33 24c0 14 12 19 12 26S33 62 33 76h34c0-14-12-19-12-26s12-12 12-26z" fill="#fff" opacity=".92"/></g><path d="M40 32h20c-2 6-8 9-10 13-2-4-8-7-10-13z" fill="#e8a25e"/><path d="M38 72c2-7 8-10 12-14 4 4 10 7 12 14z" fill="#e8a25e"/><rect width="100" height="100" fill="url(#' + id + 'gl)"/>';
  if (kind === 'files') return '<defs>' + mingIconGradient(id, '#fff', '#eef1f8') + '<linearGradient id="' + id + 'f" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#a7c3f2"/><stop offset="1" stop-color="#6e93d8"/></linearGradient>' + mingIconShadow(id, '#2a4a90', .25) + '</defs><rect width="100" height="100" fill="url(#' + id + 'bg)"/><path d="M18 30a5 5 0 0 1 5-5h17l6 6h31a5 5 0 0 1 5 5v6H18z" fill="#7c9fe0"/><path d="M18 38h64v32a5 5 0 0 1-5 5H23a5 5 0 0 1-5-5z" fill="url(#' + id + 'f)" filter="url(#' + id + 'sh)"/><rect x="18" y="38" width="64" height="2.5" fill="#fff" opacity=".4"/>';
  if (kind === 'phone') return '<defs>' + mingIconGradient(id, '#efe9fa', '#bba9e2') + gloss + mingIconShadow(id, '#43307a', .35) + '<linearGradient id="' + id + 's" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#f0c6dc"/><stop offset=".5" stop-color="#b9b0ee"/><stop offset="1" stop-color="#8b9be6"/></linearGradient></defs><rect width="100" height="100" fill="url(#' + id + 'bg)"/><g filter="url(#' + id + 'sh)"><rect x="32" y="14" width="36" height="72" rx="9" fill="#a99ad1"/><rect x="34.5" y="16.5" width="31" height="67" rx="7" fill="#1b1722"/><rect x="36" y="18" width="28" height="64" rx="6" fill="url(#' + id + 's)"/><rect x="45" y="21" width="10" height="3.2" rx="1.6" fill="#1b1722"/></g><rect width="100" height="100" fill="url(#' + id + 'gl)"/>';
  if (kind === 'settings') return '<defs>' + mingIconGradient(id, '#ebe8f1', '#9a94aa') + '<linearGradient id="' + id + 'd" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#77728a"/><stop offset="1" stop-color="#34303d"/></linearGradient><linearGradient id="' + id + 'l" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fbfaff"/><stop offset="1" stop-color="#a39db3"/></linearGradient><linearGradient id="' + id + 'bv" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".75"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient><radialGradient id="' + id + 'pl" cx=".5" cy=".35" r=".7"><stop stop-color="#f4f2f8"/><stop offset="1" stop-color="#b3adc2"/></radialGradient>' + mingIconShadow(id, '#2a2433', .45) + '<filter id="' + id + 'in" x="-20%" y="-20%" width="140%" height="140%"><feDropShadow dx="0" dy="1.2" stdDeviation="1.1" flood-color="#000" flood-opacity=".45"/></filter></defs><rect width="100" height="100" fill="url(#' + id + 'bg)"/><ellipse cx="50" cy="22" rx="40" ry="20" fill="#fff" opacity=".25"/><g filter="url(#' + id + 'sh)"><path d="' + mingGearPath(50, 50, 41, 35, 30, .42) + '" fill="url(#' + id + 'd)"/></g><circle cx="50" cy="50" r="33.5" fill="none" stroke="url(#' + id + 'bv)" stroke-width="1.6"/><circle cx="50" cy="50" r="31" fill="url(#' + id + 'pl)"/><circle cx="50" cy="50" r="27" fill="url(#' + id + 'd)"/><circle cx="50" cy="50" r="27" fill="none" stroke="#000" stroke-opacity=".3" stroke-width="1.2"/><g filter="url(#' + id + 'in)"><path d="' + mingGearPath(50, 50, 23, 19, 14, .45) + '" fill="url(#' + id + 'l)"/></g><circle cx="50" cy="50" r="14.5" fill="url(#' + id + 'd)"/><g stroke="url(#' + id + 'l)" stroke-width="4.2" stroke-linecap="round"><path d="M50 38v24M39.6 44l20.8 12M39.6 56l20.8-12"/></g><circle cx="50" cy="50" r="6.5" fill="url(#' + id + 'l)" filter="url(#' + id + 'in)"/><circle cx="48.3" cy="48.2" r="2" fill="#fff" opacity=".8"/>';
  if (kind === 'save') return '<defs>' + mingIconGradient(id, '#fff', '#f1f3f8') + mingIconShadow(id, '#344666', .24) + '<linearGradient id="' + id + 'f" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#899bb9"/><stop offset="1" stop-color="#526586"/></linearGradient></defs><rect width="100" height="100" fill="url(#' + id + 'bg)"/><g filter="url(#' + id + 'sh)"><path d="M24 19h42l12 12v47H22V21a2 2 0 0 1 2-2z" fill="url(#' + id + 'f)"/><path d="M34 20v18h29V20" fill="#e7eaf1"/><rect x="33" y="49" width="38" height="27" rx="3" fill="#fff"/><path d="M40 57h24M40 64h20" stroke="#91a0b9" stroke-width="3" stroke-linecap="round"/></g>';
  if (kind === 'info') return '<defs>' + mingIconGradient(id, '#d8e0ea', '#8598ad') + mingIconShadow(id, '#30425b', .25) + '</defs><rect width="100" height="100" fill="url(#' + id + 'bg)"/><circle cx="50" cy="50" r="31" fill="#fff"/><circle cx="50" cy="31" r="4" fill="#65778e"/><rect x="46" y="40" width="8" height="30" rx="4" fill="#65778e"/>';
  return '<defs>' + mingIconGradient(id, '#bcd4f2', '#f3d9b8') + gloss + mingIconShadow(id, '#5a3410', .3) + '<linearGradient id="' + id + 'w" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#fffaf0"/><stop offset="1" stop-color="#eadcc6"/></linearGradient></defs><rect width="100" height="100" fill="url(#' + id + 'bg)"/><path d="M0 78c20-6 40-6 60-2s30 2 40-2v26H0z" fill="#8fb3d9" opacity=".7"/><g filter="url(#' + id + 'sh)"><path d="M24 50h52v32H24z" fill="url(#' + id + 'w)"/><path d="M18 52 50 24l32 28z" fill="#9a536a"/><path d="M18 52 50 24l32 28" fill="none" stroke="#7a3a50" stroke-width="2.5" stroke-linejoin="round"/></g><rect x="30" y="58" width="22" height="14" rx="2" fill="#ffd27a"/><path d="M41 58v14M30 65h22" stroke="#c99445" stroke-width="1.6"/><path d="M58 82V66a6 6 0 0 1 12 0v16z" fill="#7a4b2e"/><circle cx="67" cy="74" r="1.4" fill="#f3d27a"/><rect x="62" y="30" width="6" height="12" fill="#9a536a"/><rect width="100" height="100" fill="url(#' + id + 'gl)"/>';
}

function mingIcon(id, size) {
  const app = mingApp(id) || { icon: 'door' };
  const dimension = size || 52;
  const icon = el('span', 'ico' + (app.icon === 'calendar' ? ' ico-cal' : ''));
  icon.style.width = dimension + 'px';
  icon.style.height = dimension + 'px';
  icon.setAttribute('aria-hidden', 'true');
  if (app.icon === 'calendar') {
    icon.style.fontSize = dimension / 100 + 'px';
    icon.append(el('b', game.trialEnded ? 'ended' : '', trialStatus() || '試用期'), el('i', '', String(game.day)));
    return icon;
  }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 100 100');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = mingIconShape(app.icon, 'ming-icon-' + (++mingLogoSequence));
  icon.appendChild(svg);
  return icon;
}

function mingLaunchButton(app, className) {
  const item = el('button', 'ming-launch' + (className ? ' ' + className : ''));
  item.type = 'button';
  item.dataset.osapp = app.id;
  item.setAttribute('aria-label', '打開' + app.label);
  item.append(mingIcon(app.id), el('span', 'ming-launch-label', app.label));
  return item;
}

function updateMingClock(state) {
  if (mingComputerState !== state) return;
  const clock = state.menubar.querySelector('[data-os-clock]');
  const date = state.menubar.querySelector('[data-os-date]');
  const tier = state.menubar.querySelector('[data-os-tier]');
  if (clock) clock.textContent = new Date().toLocaleTimeString('zh-TW', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Taipei' });
  if (date) {
    const left = trialDaysLeft();
    date.textContent = '第 ' + game.day + ' 天｜' + (trialStatus() || '剩 ' + left + ' 天');
  }
  if (tier) {
    const label = studioTier() === 'owned' ? '完整版' : '試玩';
    tier.textContent = label;
    tier.setAttribute('aria-label', label + '，查看額度');
  }
}

function buildMingMenu(state) {
  const mark = mingLogoNode('logo');
  const current = el('button', 'm app', '桌面');
  current.type = 'button'; current.dataset.osMenu = 'ming';
  current.dataset.osCurrent = '';
  const menu = el('div', 'ming-menu-items');
  [['檔案', 'file'], ['編輯', 'edit'], ['顯示', 'view'], ['視窗', 'window'], ['說明', 'help']].forEach(function (pair) {
    const item = el('button', 'm', pair[0]);
    item.type = 'button'; item.dataset.osMenu = pair[1]; menu.appendChild(item);
  });
  const status = el('div', 'rt');
  status.innerHTML = '<svg width="17" height="12" viewBox="0 0 17 12" aria-hidden="true"><path d="M1 4.5C5.3.8 11.7.8 16 4.5L8.5 11z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M4.2 7.2c2.5-2 6.1-2 8.6 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><svg width="18" height="16" viewBox="0 0 18 16" aria-hidden="true"><rect x=".8" y="1" width="16.4" height="6" rx="3" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="13.6" cy="4" r="1.7" fill="currentColor"/><rect x=".8" y="9" width="16.4" height="6" rx="3" fill="currentColor"/><circle cx="4.4" cy="12" r="1.7" fill="#5a6080"/></svg>';
  const date = el('span', 'os-status'); date.dataset.osDate = '';
  const clock = el('time', 'os-status'); clock.dataset.osClock = '';
  const tier = el('button', 'os-tier'); tier.type = 'button'; tier.dataset.osTier = '';
  tier.addEventListener('click', function () { toggleMingQuota(state, tier); });
  const gameNotice = el('span', 'os-game-notice', '小遊戲做好了'); gameNotice.dataset.gameNotice = ''; gameNotice.hidden = true;
  const exit = button('回工作室', exitMingComputer, 'ming-exit');
  status.append(date, clock, gameNotice, tier, exit);
  state.menubar.append(mark, current, menu, status);
  current.addEventListener('click', function () { showMingMenu(state, 'ming', current); });
  menu.addEventListener('click', function (event) {
    const target = event.target.closest('[data-os-menu]');
    if (!target) return;
    showMingMenu(state, target.dataset.osMenu, target);
  });
  state.documentPointerHandler = function (event) {
    if (mingComputerState !== state || event.target.closest('.menubar') || event.target.closest('.menu-popover') || event.target.closest('.quota-popover')) return;
    state.desktop.querySelectorAll('.menu-popover,.quota-popover').forEach(function (node) { node.remove(); });
    state.quotaPopover = null;
  };
  document.addEventListener('pointerdown', state.documentPointerHandler);
}

function showMingMenu(state, name, anchor) {
  state.desktop.querySelectorAll('.menu-popover,.quota-popover').forEach(function (node) { node.remove(); });
  state.quotaPopover = null;
  const popup = el('div', 'menu-popover ming-menu-popover');
  const addAction = function (label, action, disabled) {
    const item = el('button', 'menu-option', label);
    item.type = 'button'; item.disabled = !!disabled;
    item.addEventListener('click', function () { popup.remove(); action(); });
    popup.appendChild(item);
  };
  const open = function (id) { openMingApp(state, id); };
  if (name === 'file') {
    addAction('和明說話', function () { open('chat'); });
    addAction('進度表', function () { open('progress'); });
    if (focusEnabled) addAction('陪讀計時器', () => open('focus'));
    addAction('月曆', function () { open('calendar'); });
    addAction('我的手機', function () { open('phone'); });
    addAction('設定', function () { open('settings'); });
    const website = mingApp('website');
    if (website) addAction(website.label, function () { open(website.id); });
    popup.appendChild(el('span', 'menu-separator'));
    addAction('劇情裡的檔案', function () { open('files'); });
    addAction('我的資料備份', function () { open('backup'); });
    addAction('請明做新遊戲', function () { open('games'); });
    addAction('重玩故事關卡', function () { open('story-games'); });
    addAction('明的電腦說明', function () { open('help'); });
    addAction('回工作室', exitMingComputer);
  } else if (name === 'edit') {
    addAction('復原', function () {}, true); addAction('拷貝', function () {}, true); addAction('貼上', function () {}, true);
  } else if (name === 'view') {
    addAction('放大／還原目前視窗', function () { toggleMingZoom(state); }, !state.active);
    addAction('顯示桌面', function () { showMingDesktop(state); });
  } else if (name === 'window') {
    const opened = Array.from(state.windows.keys());
    if (!opened.length) addAction('目前沒有開啟的視窗', function () {}, true);
    opened.forEach(function (id) { const app = mingApp(id); if (app) addAction(app.label, function () { open(id); }); });
  } else if (name === 'help') {
    addAction('明的電腦說明', function () { open('help'); });
    addAction('查看使用額度', function () { toggleMingQuota(state, state.menubar.querySelector('[data-os-tier]')); });
  } else {
    addAction('查看使用額度', function () { toggleMingQuota(state, state.menubar.querySelector('[data-os-tier]')); });
    addAction('關於明的電腦', function () { showMingToast(state, '工作室裡明自己用的系統。'); });
  }
  popup.style.left = Math.max(4, Math.min(anchor.offsetLeft, state.desktop.clientWidth - 240)) + 'px';
  popup.style.top = state.menubar.offsetHeight + 'px';
  state.desktop.appendChild(popup);
  popup.querySelector('button:enabled')?.focus();
}

async function toggleMingQuota(state, anchor) {
  if (state.quotaPopover) { state.quotaPopover.remove(); state.quotaPopover = null; return; }
  state.desktop.querySelectorAll('.menu-popover').forEach(function (node) { node.remove(); });
  const popup = el('section', 'quota-popover ming-quota-popover');
  popup.setAttribute('aria-label', '使用額度');
  popup.append(el('h2', '', (studioTier() === 'owned' ? '完整版' : '試玩') + '額度'));
  const list = el('ul', 'quota-list ming-quota-list');
  list.appendChild(el('li', '', '正在讀取額度……'));
  popup.appendChild(list);
  const rect = anchor.getBoundingClientRect();
  const desktopRect = state.desktop.getBoundingClientRect();
  popup.style.right = Math.max(8, desktopRect.right - rect.right) + 'px';
  popup.style.top = '36px';
  state.desktop.appendChild(popup);
  state.quotaPopover = popup;
  const quotas = await quotaSnapshot();
  if (state.quotaPopover !== popup) return;
  list.replaceChildren();
  if (!quotas) {
    list.appendChild(el('li', '', '目前讀不到額度資料。'));
    return;
  }
  QUOTA_KINDS.forEach(function (kind) { list.appendChild(el('li', '', quotaHelpLine(kind, quotas[kind]))); });
  if (QUOTA_KINDS.some(function (kind) { return quotas[kind].scope === 'day'; })) popup.appendChild(el('p', 'quota-reset', QUOTA_RESET_NOTE));
}

function showMingToast(state, message) {
  const toast = el('div', 'ming-toast', message);
  state.desktop.appendChild(toast);
  window.setTimeout(function () { toast.remove(); }, 2200);
}

function buildMingDesktop(state) {
  buildMingWidgets(state);
  state.widgets.addEventListener('click', function (event) {
    const item = event.target.closest('[data-osapp]');
    if (item) openMingApp(state, item.dataset.osapp);
  });
}

function buildMingWidgets(state) {
  state.widgets.replaceChildren();
  const enabled = state.settings.widgets;
  if (enabled.progress.enabled) {
    const progress = el('button', 'mwidget mw-prog mwidget-button ming-progress-widget pos-' + enabled.progress.position);
    progress.type = 'button'; progress.dataset.osapp = 'progress'; progress.setAttribute('aria-label', '打開明的進度表');
    const ring = el('span', 'ring');
    const circumference = 2 * Math.PI * 33;
    const percent = Math.max(0, Math.min(TRIAL_LAST_DAY, game.day)) / TRIAL_LAST_DAY;
    ring.innerHTML = '<svg viewBox="0 0 78 78" width="70" height="70" aria-hidden="true"><circle cx="39" cy="39" r="33" fill="none" stroke="rgba(255,255,255,.18)" stroke-width="8"/><circle cx="39" cy="39" r="33" fill="none" stroke="#f3d999" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (circumference * percent).toFixed(1) + ' ' + circumference.toFixed(1) + '" transform="rotate(-90 39 39)"/></svg>';
    const ringLabel = el('b');
    ringLabel.append(el('span', '', String(game.day)));
    if (!game.trialEnded) ringLabel.append(el('small', '', '／30 天'));
    ring.appendChild(ringLabel);
    const copy = el('span', 'tx'); copy.append(el('b', '', '明的進度表'), el('small', 'ming-progress-task', '讀取進度表……'));
    progress.append(ring, copy);
    state.widgets.appendChild(progress);
  }
  if (enabled.favorites.enabled) {
    const favorites = el('button', 'mwidget mw-favorites mwidget-button ming-favorites-widget pos-' + enabled.favorites.position);
    favorites.type = 'button'; favorites.dataset.osapp = 'favorites'; favorites.setAttribute('aria-label', '打開收藏');
    favorites.append(el('span', 'ming-widget-eyebrow', '收藏'), el('b', 'ming-favorites-count', '讀取收藏……'), el('small', '', '晨的畫與詩的歌會放在這裡'));
    state.widgets.appendChild(favorites);
  }
  if (enabled.calendar.enabled) {
    const calendar = el('button', 'mwidget mw-cal mwidget-button ming-calendar-widget pos-' + enabled.calendar.position);
    calendar.type = 'button'; calendar.dataset.osapp = 'calendar'; calendar.setAttribute('aria-label', '打開試用期月曆');
    const heading = el('div', 'hd'); heading.append(el('span', '', trialStatus() || '試用期'), el('b', '', game.trialEnded ? '第 ' + game.day + ' 天' : '30 天'));
    const days = el('div', 'g');
    for (let day = 1; day <= TRIAL_LAST_DAY; day += 1) {
      const cell = el('span', (day === game.day ? 'today' : '') + (day < game.day ? ' dim' : '') + (day === 23 ? ' circ' : ''), String(day));
      if (day === 23) cell.innerHTML += '<svg viewBox="0 0 24 22" aria-hidden="true"><path d="M12 2c6-.3 10.4 3.4 10.2 9.2-.2 5.8-5 9.6-10.6 9.4C6 20.4 1.6 16.3 1.9 10.8 2.2 5.6 6.4 2.3 11.3 2c1.3-.1 2.4.2 3.4.6" fill="none" stroke="#9fb7ff" stroke-width="1.5" stroke-linecap="round"/></svg>';
      days.appendChild(cell);
    }
    calendar.append(heading, days);
    state.widgets.appendChild(calendar);
  }
  if (enabled.notes.enabled) {
    const notes = el('div', 'mwidget mw-notes pos-' + enabled.notes.position);
    notes.append(el('span', 'ming-widget-eyebrow', '便利貼'), el('b', '', '目前沒有便利貼資料。'));
    state.widgets.appendChild(notes);
  }
}

async function renderMingDesktopWidgets(state) {
  const progressWidget = state.widgets.querySelector('.ming-progress-widget');
  const { days } = await readProgress();
  const saved = days.find(item => item.day === game.day);
  if (progressWidget) {
    const hasTask = saved && saved.task && saved.task !== '待安排';
    progressWidget.querySelector('.ming-progress-task').textContent = trialStatus() || (hasTask ? saved.task : '今天尚無進度資料');
  }
  const favoritesWidget = state.widgets.querySelector('.ming-favorites-widget');
  if (favoritesWidget) {
    await playerId().catch(function () {});
    const works = await Promise.all([savedWorks('image'), savedWorks('song')]);
    const count = works[0].length + works[1].length;
    favoritesWidget.querySelector('.ming-favorites-count').textContent = count ? count + ' 項收藏' : '收藏資料夾還是空的';
  }
  const calendar = state.widgets.querySelector('.ming-calendar-widget');
  if (calendar) calendar.setAttribute('aria-label', '第 ' + game.day + ' 天・' + (trialStatus() || '試用期 30 天，第 23 天為截止日'));
}

function buildMingDock(state) {
  const compact = window.matchMedia('(max-width: 600px), (orientation: portrait)').matches;
  MING_APPS.forEach(function (app) {
    if (!mingAppAvailable(app) || (app.secondary && !compact)) return;
    state.dock.appendChild(createMingDockItem(app));
  });
  const separator = el('span', 'sep');
  state.dock.appendChild(separator);
  const exit = el('button', 'di home');
  exit.type = 'button'; exit.dataset.osExit = ''; exit.title = '回工作室'; exit.setAttribute('aria-label', '回工作室，關閉明的電腦');
  exit.appendChild(mingIcon('home'));
  exit.append(el('span', 'tip', '回工作室'), el('i', 'run'));
  state.dock.appendChild(exit);
  state.dock.addEventListener('click', function (event) {
    const item = event.target.closest('[data-osapp]');
    if (item) { openMingApp(state, item.dataset.osapp); return; }
    if (event.target.closest('[data-os-exit]')) exitMingComputer();
  });
  state.dock.addEventListener('scroll', function () { updateMingDockScrollHint(state); }, { passive: true });
}

function updateMingDockScrollHint(state) {
  if (!state || !state.dock) return;
  const dock = state.dock;
  const overflowing = dock.scrollWidth > dock.clientWidth + 1;
  const atEnd = dock.scrollLeft + dock.clientWidth >= dock.scrollWidth - 1;
  dock.classList.toggle('has-scroll-overflow', overflowing);
  dock.classList.toggle('at-scroll-end', !overflowing || atEnd);
}

function createMingDockItem(app) {
  const item = el('button', 'di');
  item.type = 'button'; item.dataset.osapp = app.id; item.title = app.label;
  item.setAttribute('aria-label', '打開' + app.label);
  item.appendChild(mingIcon(app.id));
  item.append(el('span', 'tip', app.label), el('i', 'run'));
  return item;
}

function syncMingDockApps(state) {
  const compact = window.matchMedia('(max-width: 600px), (orientation: portrait)').matches;
  let changed = false;
  MING_APPS.forEach(function (app, index) {
    const existing = state.dock.querySelector('[data-osapp="' + app.id + '"]');
    const visible = mingAppAvailable(app) && (!app.secondary || compact);
    if (visible && !existing) {
      const item = createMingDockItem(app);
      if (state.windows.has(app.id)) item.classList.add('running');
      if (state.active === app.id) item.classList.add('active');
      const next = MING_APPS.slice(index + 1).find(function (other) { return state.dock.querySelector('[data-osapp="' + other.id + '"]'); });
      state.dock.insertBefore(item, next ? state.dock.querySelector('[data-osapp="' + next.id + '"]') : state.dock.querySelector('.sep'));
      changed = true;
    } else if (!visible && existing) {
      existing.remove();
      changed = true;
    }
  });
  if (changed) updateMingGameNotice(state).catch(function () {});
}

function showMingDesktop(state) {
  state.active = '';
  state.mobileActive = '';
  state.desktop.classList.remove('app-active');
  state.windowLayer.querySelectorAll('.ming-app-window').forEach(function (windowNode) { windowNode.hidden = true; });
  const current = state.menubar.querySelector('[data-os-current]');
  if (current) current.textContent = '桌面';
  state.dock.querySelectorAll('.di').forEach(function (item) { item.classList.remove('active'); });
}

function focusMingWindow(state, id) {
  const node = state.windows.get(id);
  if (!node) return;
  state.active = id;
  state.desktop.classList.add('app-active');
  state.windows.forEach(function (item, key) { item.classList.toggle('inactive', key !== id); });
  node.hidden = false;
  node.style.zIndex = String(++state.zIndex);
  const app = mingApp(id);
  const current = state.menubar.querySelector('[data-os-current]');
  if (current) current.textContent = app ? app.label : '桌面';
  state.dock.querySelectorAll('.di').forEach(function (item) { item.classList.toggle('active', item.dataset.osapp === id); });
}

function closeMingWindow(state, id) {
  const node = state.windows.get(id);
  if (node) {
    disposeMingGameFrames(node);
    const content = node.querySelector('.ming-window-content');
    if (content) {
      mingGameRoots.delete(content);
      if (content._mingGameFilterHandler) content.removeEventListener('ming-game-filter', content._mingGameFilterHandler);
    }
    node.remove();
  }
  state.windows.delete(id);
  const dockItem = state.dock.querySelector('[data-osapp="' + id + '"]');
  if (dockItem) dockItem.classList.remove('active', 'running');
  if (state.active === id) showMingDesktop(state);
}

function toggleMingZoom(state) {
  const node = state.windows.get(state.active);
  if (node) node.classList.toggle('zoomed');
}

const MING_WINDOWS = {
  chat: { x: 716, y: 118, w: 420, h: 450 },
  progress: { x: 90, y: 62, w: 600, h: 500 },
  focus: { x: 345, y: 92, w: 470, h: 420 },
  calendar: { x: 300, y: 80, w: 520, h: 430 },
  games: { x: 135, y: 44, w: 1010, h: 584 },
  timeline: { x: 160, y: 52, w: 860, h: 560 },
  favorites: { x: 360, y: 120, w: 460, h: 360 },
  phone: { x: 150, y: 40, w: 880, h: 600 },
  settings: { x: 400, y: 110, w: 470, h: 420 },
  website: { x: 135, y: 44, w: 1010, h: 584 },
  files: { x: 160, y: 52, w: 860, h: 560 },
  backup: { x: 260, y: 94, w: 720, h: 460 },
  'story-games': { x: 135, y: 44, w: 1010, h: 584 },
  help: { x: 245, y: 64, w: 790, h: 560 }
};

function mingSidebarButton(label, key, active, color, icon) {
  const buttonNode = el('button', active ? 'on' : '');
  buttonNode.type = 'button';
  if (key) buttonNode.dataset.sidebarAction = key;
  const action = String(key || '').split(':').pop();
  const icons = {
    today: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
    day: '<path d="M5 4h14M5 20h14M7 4c0 5 5 5 5 8s-5 3-5 8m10-16c0 5-5 5-5 8s5 3 5 8"/>',
    all: '<path d="M3 5h8v15a3 3 0 0 0-3-3H3zM21 5h-8v15a3 3 0 0 1 3-3h5z"/>',
    planned: '<path d="m4 6 2 2 3-3M12 7h8M4 13l2 2 3-3m3 2h8M4 20h16"/>',
    personal: '<circle cx="12" cy="8" r="3"/><path d="M5 20c.7-3.3 3.1-5 7-5s6.3 1.7 7 5"/>',
    phone: '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M10 6h4m-2 12h.01"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="m19 13 2 1-2 4-2-1a8 8 0 0 1-2 1l-.3 2h-4L10 18a8 8 0 0 1-2-1l-2 1-2-4 2-1v-2l-2-1 2-4 2 1a8 8 0 0 1 2-1l.3-2h4L14 6a8 8 0 0 1 2 1l2-1 2 4-2 1z"/>',
    games: '<path d="M7 9h10c2 0 3 1 4 4l1 4c.5 2-1 3-3 1l-3-2H8l-3 2c-2 2-3.5 1-3-1l1-4c1-3 2-4 4-4zM7 12v4m-2-2h4"/><circle cx="16" cy="13" r=".7"/><circle cx="18" cy="15" r=".7"/>',
    color: '<path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 1.2-3.6 1.6 1.6 0 0 1 1-2.9H18a3 3 0 0 0 3-3c0-4.7-4-8.5-9-8.5z"/><circle cx="7.5" cy="11" r=".7"/><circle cx="10" cy="7" r=".7"/><circle cx="15" cy="8" r=".7"/>',
    image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8" cy="9" r="1.5"/><path d="m4 17 5-5 3 3 3-4 5 6"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    song: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    time: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
    terms: '<path d="M5 3h10l4 4v14H5zM15 3v5h4M8 12h8M8 16h8"/>',
    day30: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/>',
    bei: '<path d="M4 5h6l2 2h8v12H4z"/>'
  };
  const path = icon || icons[action] || icons.games;
  if (path) {
    const square = el('span', 'sq'); square.style.setProperty('--c', color || '#45628f');
    square.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">' + path + '</svg>';
    buttonNode.appendChild(square);
  }
  buttonNode.appendChild(el('span', '', label));
  return buttonNode;
}

function buildMingWindowSidebar(id) {
  if (!['progress', 'phone', 'games', 'timeline', 'favorites', 'files', 'story-games'].includes(id)) return null;
  const side = el('aside', 'side');
  const group = function (label) { side.appendChild(el('div', 'sh', label)); };
  if (id === 'progress') {
    group('清單');
    side.append(mingSidebarButton('今天', 'progress:today', !game.trialEnded, '#45628f'), mingSidebarButton('第 ' + game.day + ' 天', 'progress:day', false, '#e09a5e'), mingSidebarButton('全部', 'progress:all', false, '#8a7fb8'));
    group('分類');
    side.append(mingSidebarButton('明排的項目', 'progress:planned', game.trialEnded, '#97bd56'), mingSidebarButton('自己加的', 'progress:personal', false, '#9a536a'));
  } else if (id === 'phone') {
    side.append(el('div', '', ''));
    side.append(mingSidebarButton('我的手機', '', true, '#8a7fb8', '<rect x="7" y="3" width="10" height="18" rx="2"/><path d="M10 6h4m-2 12h.01"/>'), mingSidebarButton('休息提醒', 'open:settings', false, '#e09a5e'));
  } else if (id === 'games') {
    group('清單');
    side.append(mingSidebarButton('明做的', 'games:done', true, '#45628f'), mingSidebarButton('明試做的', 'games:pending', false, '#e09a5e'), mingSidebarButton('重玩故事關卡', 'open:story-games', false, '#8a7fb8'));
  } else if (id === 'timeline') {
    group('每天的記錄');
    const lastDay = Math.min(game.day, TRIAL_LAST_DAY);
    for (let day = lastDay; day >= 1; day -= 1) {
      side.append(mingSidebarButton('第 ' + day + ' 天', 'timeline:' + day, day === lastDay, '#e09a5e',
        '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>'));
    }
  } else if (id === 'favorites') {
    group('收藏');
    side.append(mingSidebarButton('全部項目', 'favorites:all', true, '#8a7fb8'), mingSidebarButton('畫作', 'favorites:image', false, '#97bd56'), mingSidebarButton('歌曲', 'favorites:song', false, '#9a536a'));
  } else if (id === 'files') {
    group('故事檔案');
    side.append(mingSidebarButton('全部項目', 'files:all', true, '#8a7fb8'), mingSidebarButton('人形介面條款', 'files:terms', false, '#45628f'), mingSidebarButton('色之國', 'files:color', false, '#97bd56'), mingSidebarButton('音之國', 'files:music', false, '#9a536a'), mingSidebarButton('時之國', 'files:time', false, '#e09a5e'), mingSidebarButton('第 30 天', 'files:day30', false, '#8a7fb8'));
  } else if (id === 'story-games') {
    group('劇情裡的小遊戲');
    MINIGAMES.forEach(function (entry) { side.appendChild(mingSidebarButton(entry.name, 'games:' + entry.name, false, '#45628f')); });
  }
  return side;
}

function openMingApp(state, id, options) {
  if (mingComputerState !== state) return;
  if (id === 'games') {
    StudioDB.remove(MING_GAME_NOTICE_KEY).then(function () { return updateMingGameNotice(state); }).catch(function () {});
  }
  const app = mingApp(id);
  if (!app) return;
  let win = state.windows.get(id);
  if (win) { focusMingWindow(state, id); win.querySelector('h4').focus({ preventScroll: true }); return; }
  const geometry = MING_WINDOWS[id] || MING_WINDOWS.help;
  const sidebar = buildMingWindowSidebar(id);
  win = el('section', 'win ming-app-window' + (sidebar ? ' has-side' : ''));
  win.dataset.mingWindow = id;
  win.dataset.app = app.label;
  win.setAttribute('aria-label', app.label);
  const header = el('header', 'wbar ming-window-titlebar');
  const controls = el('span', 'lights');
  [['close', '關閉視窗'], ['mini', '縮到 Dock／返回桌面'], ['zoom', '放大／還原視窗']].forEach(function (spec) {
    const control = el('button', 'window-control ' + spec[0]);
    control.type = 'button'; control.dataset.windowAction = spec[0]; control.setAttribute('aria-label', spec[1]);
    controls.appendChild(control);
  });
  const title = el('h4', '', app.label);
  title.tabIndex = -1;
  title.appendChild(el('small', 'ming-window-day', '第 ' + game.day + ' 天'));
  const tools = el('span', 'tools');
  const search = el('label', 'wsearch');
  const searchInput = el('input'); searchInput.type = 'search'; searchInput.tabIndex = -1; searchInput.placeholder = '搜尋'; searchInput.setAttribute('aria-label', '在這個視窗裡搜尋');
  const searchButton = el('button', 'tb ic'); searchButton.type = 'button'; searchButton.dataset.windowSearch = ''; searchButton.setAttribute('aria-label', '搜尋'); searchButton.innerHTML = '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>';
  search.append(searchInput, searchButton);
  if (id !== 'website' && id !== 'focus') tools.appendChild(search);
  if (id === 'progress') {
    const add = el('button', 'tb ic', '+'); add.type = 'button'; add.dataset.progressAddToggle = ''; add.setAttribute('aria-label', '新增待辦'); tools.appendChild(add);
  }
  header.append(controls, title, tools);
  const body = el('div', 'wsplit');
  if (sidebar) body.appendChild(sidebar);
  const main = el('div', 'main');
  const content = el('div', 'ming-window-content');
  main.appendChild(content);
  body.appendChild(main);
  win.append(header, body);
  win.style.left = geometry.x + 'px';
  win.style.top = geometry.y + 'px';
  win.style.width = geometry.w + 'px';
  win.style.height = geometry.h + 'px';
  win.style.zIndex = String(++state.zIndex);
  state.windowLayer.appendChild(win);
  state.windows.set(id, win);
  const dockItem = state.dock.querySelector('[data-osapp="' + id + '"]');
  if (dockItem) dockItem.classList.add('running');
  if (id === 'progress' && !window.matchMedia('(max-width: 600px), (orientation: portrait)').matches && !(options && options.skipCompanion) && !state.windows.has('chat')) openMingApp(state, 'chat', { skipCompanion: true });
  header.addEventListener('pointerdown', function (event) {
    if (event.pointerType !== 'mouse' || event.target.closest('button') || win.classList.contains('zoomed')) return;
    const rect = win.getBoundingClientRect(), startX = event.clientX, startY = event.clientY;
    const baseLeft = rect.left - state.windowLayer.getBoundingClientRect().left;
    const baseTop = rect.top - state.windowLayer.getBoundingClientRect().top;
    header.setPointerCapture(event.pointerId);
    const move = function (moveEvent) {
      const x = Math.max(0, Math.min(1280 - geometry.w, baseLeft + (moveEvent.clientX - startX) / (Number(state.stage.style.getPropertyValue('--ming-scale')) || 1)));
      const y = Math.max(0, Math.min(638 - geometry.h, baseTop + (moveEvent.clientY - startY) / (Number(state.stage.style.getPropertyValue('--ming-scale')) || 1)));
      win.style.left = x + 'px'; win.style.top = y + 'px';
    };
    const end = function () {
      header.removeEventListener('pointermove', move); header.removeEventListener('pointerup', end); header.removeEventListener('pointercancel', end);
      try { header.releasePointerCapture(event.pointerId); } catch (error) { /* capture may already be gone */ }
    };
    header.addEventListener('pointermove', move); header.addEventListener('pointerup', end); header.addEventListener('pointercancel', end);
  });
  controls.addEventListener('click', function (event) {
    const action = event.target.closest('[data-window-action]');
    if (!action) return;
    if (action.dataset.windowAction === 'close' || action.dataset.windowAction === 'mini') {
      if (action.dataset.windowAction === 'close') closeMingWindow(state, id);
      else { win.hidden = true; if (state.active === id) showMingDesktop(state); }
      (state.dock.querySelector('[data-osapp="' + id + '"]') || state.menubar.querySelector('.ming-exit')).focus();
    }
    else { focusMingWindow(state, id); toggleMingZoom(state); }
  });
  win.addEventListener('pointerdown', function () { focusMingWindow(state, id); });
  searchButton.addEventListener('click', function () {
    search.classList.toggle('open');
    const searching = search.classList.contains('open');
    searchInput.tabIndex = searching ? 0 : -1;
    if (searching) searchInput.focus();
    else { searchInput.value = ''; searchInput.dispatchEvent(new Event('input', { bubbles: true })); }
  });
  searchInput.addEventListener('input', function () {
    const needle = searchInput.value.trim().toLocaleLowerCase();
    content.querySelectorAll('.sf-card,.ming-progress-row,.sf-message,.ming-timeline-entry').forEach(function (row) {
      row.hidden = !!needle && !row.textContent.toLocaleLowerCase().includes(needle);
    });
  });
  if (sidebar) sidebar.addEventListener('click', function (event) {
    const action = event.target.closest('[data-sidebar-action]');
    if (!action) return;
    const key = action.dataset.sidebarAction;
    if (key.startsWith('open:')) { openMingApp(state, key.slice(5)); return; }
    sidebar.querySelectorAll('button').forEach(function (buttonNode) { buttonNode.classList.toggle('on', buttonNode === action); });
    if (id === 'progress') content.dispatchEvent(new CustomEvent('ming-progress-filter', { detail: key.slice(9) }));
    if (id === 'timeline') {
      const entry = content.querySelector('.ming-timeline-entry[data-day="' + Number(key.slice(9)) + '"]');
      if (entry) { entry.open = true; entry.scrollIntoView({ block: 'nearest' }); }
    }
    if (id === 'favorites') content.dispatchEvent(new CustomEvent('ming-favorites-filter', { detail: key.slice(10) }));
    if (id === 'games' && key.startsWith('games:')) content.dispatchEvent(new CustomEvent('ming-game-filter', { detail: key.slice(6) }));
    if (id === 'files') {
      const filter = key.slice(6);
      content.querySelectorAll('[data-file]').forEach(function (row) { row.hidden = filter !== 'all' && row.dataset.file !== filter; });
    }
    if (id === 'story-games' && key.startsWith('games:')) {
      const target = content.querySelector('[data-game-name="' + CSS.escape(key.slice(6)) + '"]');
      if (target) target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  });
  const addToggle = tools.querySelector('[data-progress-add-toggle]');
  if (addToggle) addToggle.addEventListener('click', function () { content.dispatchEvent(new Event('ming-progress-add', { bubbles: true })); });
  focusMingWindow(state, id);
  title.focus({ preventScroll: true });
  renderMingApp(id, content).catch(function (error) { content.replaceChildren(el('p', 'sf-status', error.message)); });
}

async function renderMingApp(id, root) {
  if (id === 'website') { renderMingWebsite(root); return; }
  if (id === 'focus') { await focusApp.render(root); return; }
  addContext(root, id === 'chat' ? 'ming' : undefined);
  if (id === 'chat') { await renderChat('ming', false, root); return; }
  if (id === 'progress') { await renderProgress(root); return; }
  if (id === 'calendar') { await renderCalendar(root); return; }
  if (id === 'games') {
    await renderMingGames(root);
    await StudioDB.remove(MING_GAME_NOTICE_KEY).catch(function () {});
    await updateMingGameNotice();
    return;
  }
  if (id === 'timeline') {
    await renderTimeline(root);
    return;
  }
  if (id === 'favorites') { await renderFavorites(root); return; }
  if (id === 'phone') {
    root.append(el('h2', 'ming-timeline-day', '我的手機'), el('p', 'sf-context', '把真實手機連到這份作品，就能在手機上看相簿、聽歌、聊天。'), el('div', 'ming-empty-panel', '目前沒有已配對的手機資料。'));
    return;
  }
  if (id === 'settings') { await renderSettings(root); return; }
  if (id === 'files') { await renderStoryFiles(root); return; }
  if (id === 'backup') { await renderBackup(root); return; }
  if (id === 'help') { renderHelp(root); return; }
  if (id === 'story-games') { renderGames(root); return; }
}

const MING_WEBSITE_URL = 'https://yazelin.github.io/larch-chayu/';
const MING_WEBSITE_NAME = '夜後明月．晨前朝霞．慕詩客';

function renderMingWebsite(root) {
  root.classList.add('ming-website');
  const toolbar = el('div', 'ming-website-toolbar');
  const frame = el('iframe', 'ming-website-frame');
  frame.title = MING_WEBSITE_NAME;
  // 跨來源的 iframe 被擋時，瀏覽器也可能送出 load，因此保留新分頁的提示。
  const sandboxed = window.parent !== window && window.origin === 'null';
  const fallback = sandboxed ? '，請複製下方網址，在瀏覽器開啟。' : '，可以在新分頁開啟。';
  const hint = '如果網站沒有顯示' + fallback;
  const status = el('p', 'ming-website-status', hint);
  status.setAttribute('role', 'status');
  let timeout;
  function loadSite() {
    clearTimeout(timeout);
    status.textContent = '正在載入網站…';
    frame.src = MING_WEBSITE_URL;
    timeout = window.setTimeout(function () {
      if (frame.isConnected) status.textContent = '網站載入時間較長' + fallback;
    }, 12000);
  }
  frame.addEventListener('load', function () {
    clearTimeout(timeout);
    status.textContent = hint;
  });
  frame.addEventListener('error', function () {
    clearTimeout(timeout);
    status.textContent = '網站載入失敗' + fallback;
  });
  const refresh = button('重新整理', loadSite, 'ming-website-refresh');
  const external = el('a', 'sf-button ming-website-external', '在新分頁開啟');
  external.href = MING_WEBSITE_URL;
  external.target = '_blank';
  external.rel = 'noopener noreferrer';
  toolbar.append(el('strong', '', MING_WEBSITE_NAME), refresh, external);
  root.append(toolbar, frame, status);
  if (sandboxed) {
    // Larch 的 allow-scripts 沙盒會限制新分頁，保留可手動複製的網址。
    root.appendChild(el('div', 'ming-website-status', MING_WEBSITE_URL));
  }
  loadSite();
}

async function renderTimeline(root) {
  const progress = await readProgress();
  const personal = await StudioDB.get('progressUserTasks').catch(() => []);
  const lastDay = Math.min(game.day, TRIAL_LAST_DAY);
  const doneTasks = progress.days.concat(Array.isArray(personal) ? personal : [])
    .filter(item => item.status === 'done' && item.task !== '待安排');
  root.append(el('h2', 'ming-timeline-day', '時光記錄'), el('p', 'ming-trial-line', '第 ' + game.day + ' 天・' + trialLine()));
  for (let day = lastDay; day >= 1; day -= 1) {
    const entry = el('details', 'ming-timeline-entry');
    entry.dataset.day = String(day);
    entry.open = day === lastDay;
    entry.appendChild(el('summary', '', '第 ' + day + ' 天'));
    const summary = storyDayNote(day, game.trialKnown);
    if (summary) entry.appendChild(el('p', '', summary));
    const photo = SKY_DIARY.find(item => item.day === day);
    if (photo) {
      const [x, y, width, height] = photo.box;
      const sky = el('div', 'ming-timeline-sky');
      sky.setAttribute('role', 'img');
      sky.setAttribute('aria-label', '第 ' + day + ' 天的天空');
      sky.style.aspectRatio = String(width * 1024 / (height * 683));
      sky.style.backgroundImage = 'url("' + photo.src + '")';
      sky.style.backgroundSize = 100 / width + '% ' + 100 / height + '%';
      sky.style.backgroundPosition = 100 * x / (1 - width) + '% ' + 100 * y / (1 - height) + '%';
      entry.appendChild(sky);
    }
    const done = doneTasks.filter(item => item.day === day);
    if (done.length) {
      const list = el('ul', 'ming-timeline-tasks');
      done.forEach(item => list.appendChild(el('li', '', item.title || item.task)));
      entry.appendChild(list);
    }
    if (!summary && !photo && !done.length) entry.appendChild(el('p', '', '這天沒有留下記錄。'));
    root.appendChild(entry);
  }
}

async function renderCalendar(root) {
  const saved = await readProgress();
  const heading = el('h2', 'mh', '月曆');
  const summary = el('p', '', '第 ' + game.day + ' 天・' + trialLine());
  const calendar = el('div', 'mcal');
  const note = el('p', 'mcal-note');
  function updateNote(day) {
    const tasks = saved.days.filter(item => item.day === day && item.task !== '待安排');
    const event = day === 23 ? '截止日' : day === 30 ? '試用期公布日' : '';
    const task = tasks.map(item => item.task).join('、') || '這一天尚無進度資料。';
    note.textContent = '第 ' + day + ' 天' + (event ? '・' + event : '') + '：' + task;
  }
  for (let day = 1; day <= TRIAL_LAST_DAY; day += 1) {
    const cell = el('button', (day < game.day ? 'past' : '') + (day === game.day ? ' today selected' : '') + (day === 23 ? ' deadline' : ''), '');
    cell.type = 'button'; cell.dataset.mday = String(day);
    cell.appendChild(el('b', '', String(day)));
    if (day === 23) cell.appendChild(el('small', '', '截止日'));
    else if (day === 30) cell.appendChild(el('small', '', '公布'));
    if (day === game.day) cell.setAttribute('aria-current', 'date');
    cell.addEventListener('click', function () {
      calendar.querySelectorAll('button').forEach(function (buttonNode) { buttonNode.classList.toggle('selected', buttonNode === cell); });
      updateNote(day);
    });
    calendar.appendChild(cell);
  }
  updateNote(game.day);
  root.append(heading, summary, calendar, note);
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
function replayGames(scene) {
  return MINIGAMES.filter(entry => scene.chapter >= entry.chapter);
}

function openReplay(entry) {
  const old = document.querySelector('.sf-replay'); if (old) old.remove();
  const layer = el('div', 'sf-replay');
  layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-label', '重玩：' + entry.name);
  const frame = document.createElement('iframe');
  frame.src = new URL(entry.href, location.href).href + (entry.href.includes('?') ? '&' : '?') + 'replay=1';
  frame.title = entry.name; frame.allow = 'autoplay';
  const previousFocus = document.activeElement;
  const back = button('回明的電腦', function () {
    layer.remove();
    document.removeEventListener('keydown', onKey, true);
    previousFocus?.focus({ preventScroll: true });
  }, 'sf-replay-back');
  function onKey(event) {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    back.click();
  }
  document.addEventListener('keydown', onKey, true);
  layer.append(frame, back);
  document.body.appendChild(layer);
  back.focus();
}

function renderGames(root) {
  const list = el('div', 'sf-stack');
  const playable = replayGames(game);
  MINIGAMES.forEach(function (entry) {
    const open = playable.includes(entry);
    const row = el('article', 'sf-card sf-game' + (open ? '' : ' locked'));
    row.dataset.gameName = entry.name;
    row.append(el('h3', '', entry.name), el('p', '', open ? entry.note : '第 ' + entry.chapter + ' 章玩過之後才能重玩。'));
    if (open) {
      // 在工作室裡開全螢幕重玩（Larch 沙盒擋另開分頁，作者 2026-11-21：點重玩沒反應）
      const play = button('重玩', function () { openReplay(entry); }, 'sf-button');
      row.appendChild(play);
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

function showStoryFile(root, title, build) {
  root.replaceChildren();
  const back = button('‹　劇情裡的檔案', function () {
    renderStoryFiles(root).catch(function (error) { root.replaceChildren(el('p', 'sf-status', error.message)); });
  });
  back.classList.add('ming-file-back');
  const body = el('article', 'sf-doc ming-file-document');
  body.appendChild(el('h2', 'mh', title));
  build(body);
  root.append(back, body);
}

async function renderStoryFiles(root) {
  const list = el('div', 'sf-stack');
  const renewed = game.day > TRIAL_LAST_DAY;
  const terms = renewed ? RENEWED_TERMS : TRIAL_TERMS;
  const termsRow = fileRow(renewed ? '續訂條款.txt' : '試用條款.txt', renewed ? '續訂之後換成這一份。' : '「人形介面　試用中」底下那行小字的完整版。', true);
  termsRow.dataset.file = 'terms';
  termsRow.appendChild(button('打開', function () {
    showStoryFile(root, terms.title, function (body) {
      const ol = el('ol', 'sf-terms');
      terms.items.forEach(function (item) { ol.appendChild(el('li', '', item)); });
      body.append(el('h3', '', terms.title), ol);
    });
  }));
  list.appendChild(termsRow);

  [['色之國', 3, 'color'], ['音之國', 4, 'music'], ['時之國', 5, 'time']].forEach(function (pair) {
    const open = game.chapter >= pair[1];
    const row = fileRow(pair[0], open ? '晨的圖、詩的曲子、明的小遊戲，都在裡面。' : '還是空的。', open);
    row.dataset.file = pair[2];
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
          showStoryFile(root, letter.name + '的「給茶語」', function (body) {
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
      showStoryFile(root, '備', function (body) {
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

async function readProgress(scene = game) {
  const saved = await StudioDB.get('progressTable').catch(() => null);
  const progress = sanitizeProgress(saved);
  if (progress.days.some(item => item.task !== '待安排')) return progress;
  const overrides = await StudioDB.get('progressStoryOverrides').catch(() => null) || {};
  const days = TODO_ITEMS.filter(item => (item.show || 3) <= scene.day && item.d <= scene.day + 3).map(item => {
    const late = item.red && scene.day >= item.red[0] && scene.day <= item.red[1];
    const done = (scene.trialEnded && item.d >= 30) || scene.day > (item.red ? item.red[1] : item.d);
    const status = done ? 'done' : late ? 'late' : 'planned';
    return { day: item.d, task: item.t, status, ...overrides[item.id], id: item.id };
  });
  return { ...progress, days, story: true, overrides };
}

async function renderProgress(root) {
  let progress = await readProgress();
  let personal = await StudioDB.get('progressUserTasks').catch(function () { return []; });
  if (!Array.isArray(personal)) personal = [];
  let filter = game.trialEnded ? 'planned' : 'today';
  const heading = el('h2', 'mh', '今天');
  const count = el('p', 'ming-progress-count');
  const list = el('div', 'ming-progress-list');
  const addForm = el('form', 'ming-progress-add'); addForm.hidden = true;
  const addInput = el('input'); addInput.maxLength = 80; addInput.placeholder = '新增自己的待辦'; addInput.setAttribute('aria-label', '新增自己的待辦');
  const addSave = button('加入', null, 'primary'); addSave.type = 'submit';
  const addCancel = button('取消', null); addCancel.type = 'button';
  addForm.append(addInput, addSave, addCancel);
  const ask = button('請明依劇情排一版', null, 'primary');
  const status = el('p', 'sf-status');
  root.append(heading, count);
  if (focusApp) await focusApp.renderHistory(root);
  root.append(list, addForm, el('div', 'sf-row'), ask, status);
  const rowContainer = root.querySelector('.sf-row');
  rowContainer.appendChild(el('span', 'sf-context', '明排的項目可以標記進度；自己新增的項目可以刪除。'));

  function statusLabel(value) {
    return ({ planned: '待開始', doing: '進行中', done: '完成', late: '落後' })[value] || '待開始';
  }
  async function saveProgress(hasTask, item, change) {
    if (item && progress.story) {
      progress.overrides[item.id] = { ...progress.overrides[item.id], ...change };
      await StudioDB.set('progressStoryOverrides', progress.overrides);
    } else {
      await StudioDB.set('progressTable', progress);
    }
    if (hasTask) freeAffinity.award('ming');
  }
  function savePersonal() { return StudioDB.set('progressUserTasks', personal); }
  function makeProgressRow(item, index) {
    const row = el('div', 'ming-progress-row' + (item.status === 'done' ? ' done' : ''));
    const toggle = el('button', 'cb'); toggle.type = 'button'; toggle.setAttribute('aria-label', item.status === 'done' ? '取消完成' : '標記完成');
    const body = el('span', 'task-body');
    const title = el('input', 'task-title'); title.value = item.task === '待安排' ? '' : item.task; title.placeholder = '尚未安排'; title.maxLength = 120; title.setAttribute('aria-label', '第 ' + item.day + ' 天的進度項目');
    const meta = el('small', 'task-meta', (item.task === '待安排' ? '尚未安排' : '明排的') + '・第 ' + item.day + ' 天');
    body.append(title, meta);
    const select = statusSelect(item.status); select.setAttribute('aria-label', '第 ' + item.day + ' 天的進度');
    toggle.addEventListener('click', function () {
      item.status = item.status === 'done' ? 'planned' : 'done';
      saveProgress(item.task !== '待安排', item, { status: item.status }).then(draw);
    });
    title.addEventListener('change', function () { item.task = title.value.trim().slice(0, 120) || '待安排'; saveProgress(item.task !== '待安排', item, { task: item.task }).then(draw); });
    select.addEventListener('change', function () { item.status = select.value; saveProgress(item.task !== '待安排', item, { status: item.status }).then(draw); });
    row.append(toggle, body, select);
    row.dataset.day = String(item.day);
    row.dataset.kind = 'planned';
    row.dataset.index = String(index);
    return row;
  }
  function makePersonalRow(item, index) {
    const row = el('div', 'ming-progress-row' + (item.status === 'done' ? ' done' : ''));
    const toggle = el('button', 'cb'); toggle.type = 'button'; toggle.setAttribute('aria-label', item.status === 'done' ? '取消完成' : '標記完成');
    const body = el('span', 'task-body'); body.append(el('span', 'task-title', item.title), el('small', 'task-meta', '自己加的・第 ' + item.day + ' 天'));
    const remove = button('刪除', function () { personal.splice(index, 1); savePersonal().then(draw); }, 'danger delete-task');
    toggle.addEventListener('click', function () { item.status = item.status === 'done' ? 'planned' : 'done'; savePersonal().then(draw); });
    row.append(toggle, body, remove);
    row.dataset.day = String(item.day);
    row.dataset.kind = 'personal';
    return row;
  }
  function draw() {
    list.replaceChildren();
    const planned = progress.days.map(function (item, index) { return { item: item, index: index }; }).filter(function (entry) {
      const hasTask = entry.item.task && entry.item.task !== '待安排';
      return filter === 'all' || (hasTask && (filter === 'planned' || entry.item.day === game.day));
    });
    const custom = personal.map(function (item, index) { return { item: item, index: index }; }).filter(function (entry) {
      return filter === 'all' || filter === 'personal' || entry.item.day === game.day;
    });
    if (filter === 'planned') custom.length = 0;
    if (filter === 'personal') planned.length = 0;
    planned.forEach(function (entry) { list.appendChild(makeProgressRow(entry.item, entry.index)); });
    custom.forEach(function (entry) { list.appendChild(makePersonalRow(entry.item, entry.index)); });
    const actualPlanned = planned.filter(function (entry) { return entry.item.task !== '待安排'; });
    const done = actualPlanned.concat(custom).filter(function (entry) { return entry.item.status === 'done'; }).length;
    const total = actualPlanned.length + custom.length;
    count.textContent = total ? (done === total ? '全部做完了' : '完成 ' + done + ' 項，還有 ' + (total - done) + ' 項') : filter === 'all' ? '三十天還沒有已排定的進度。' : '目前沒有進度項目';
    heading.textContent = filter === 'all' ? '全部' : filter === 'planned' ? '明排的項目' : filter === 'personal' ? '自己加的' : filter === 'day' ? '第 ' + game.day + ' 天' : '今天';
    if (!total && filter !== 'all') list.appendChild(el('div', 'ming-empty-panel', filter === 'planned' ? '目前沒有明排的項目。' : filter === 'personal' ? '目前沒有自己新增的項目。' : '今天還沒有排入進度。'));
  }
  draw();
  root.addEventListener('ming-progress-filter', function (event) { filter = event.detail || 'today'; draw(); });
  root.addEventListener('ming-progress-add', function () { addForm.hidden = !addForm.hidden; if (!addForm.hidden) addInput.focus(); });
  addCancel.addEventListener('click', function () { addInput.value = ''; addForm.hidden = true; });
  addForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    const title = addInput.value.trim();
    if (!title) return;
    personal.push({ id: 'task-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7), title: title.slice(0, 80), day: game.day, status: 'planned', createdAt: Date.now() });
    await savePersonal(); freeAffinity.award('ming'); addInput.value = ''; addForm.hidden = true; filter = 'today'; draw();
  });
  ask.addEventListener('click', async function () {
    ask.disabled = true; status.textContent = '明正在整理進度……';
    try {
      const result = await callWorker('/chat', Object.assign({}, await workerContext('ming'), { action: 'progress_table', progress: progress.story ? sanitizeProgress(progress) : progress }));
      progress = sanitizeProgress(result.json || result.progress || JSON.parse(result.reply));
      await saveProgress(progress.days.some(item => item.task !== '待安排')); draw(); status.textContent = '進度表已更新。';
    } catch (error) { status.textContent = error.message; }
    finally { ask.disabled = false; }
  });
}

async function renderFavorites(root) {
  await playerId().catch(function () {});   // Larch 版的作品網址要帶玩家編號
  const [images, songs, cgs, bests] = await Promise.all([
    savedWorks('image'), savedWorks('song'),
    puzzleEnabled ? unlockedPuzzleCGs() : [],
    puzzleEnabled ? readPuzzleBests(StudioDB) : new Map()
  ]);
  if (!root.isConnected) return;
  let filter = 'all';
  function draw() {
    root.replaceChildren();
    const works = images.concat(songs).filter(function (work) { return filter === 'all' || work.kind === filter; }).sort(function (a, b) { return b.createdAt - a.createdAt; });
    if (!works.length && !(cgs.length && filter !== 'song')) { empty(root, images.length || songs.length ? '這個分類目前沒有項目。' : '收藏資料夾還是空的。晨的畫和詩的歌會自動放進來。'); return; }
    const grid = el('div', 'sf-grid');
    works.forEach(function (work) {
      const card = el('article', 'sf-card'); card.appendChild(el('h3', '', work.title));
      if (work.kind === 'image') {
        const image = el('img', 'sf-cover'); image.src = workSrc(work); image.alt = work.title;
        card.appendChild(pictureButton(image, function () { showImage(work, 'favorites'); }));
      } else {
        const audio = el('audio', 'sf-audio'); audio.controls = true; audio.src = workSrc(work); card.appendChild(audio);
      }
      grid.appendChild(card);
    });
    if (grid.childElementCount) root.appendChild(grid);
    if (cgs.length && filter !== 'song') {
      const section = el('section', 'sf-puzzle-images');
      section.append(el('h3', '', '劇情 CG'));
      const thumbnails = el('div', 'ming-cg-grid');
      for (const cg of cgs) {
        const best = bests.get(cg.id);
        const image = el('img', 'sf-cover');
        image.loading = 'lazy';
        image.decoding = 'async';
        image.alt = '';
        image.src = cg.src;
        const trigger = pictureButton(image, () => showImage(cg, 'favorites', '', { best }));
        trigger.setAttribute('aria-label', '放大' + cg.title);
        if (best) {
          trigger.classList.add('sf-puzzle-badged');
          trigger.append(puzzleBadge(el, best));
        }
        const card = el('article', 'sf-card ming-cg-card');
        const title = el('h3', '', cg.title);
        trigger.append(title);
        card.append(trigger);
        thumbnails.append(card);
      }
      section.append(thumbnails);
      root.append(section);
    }
  }
  root.addEventListener('ming-favorites-filter', function (event) { filter = event.detail || 'all'; draw(); });
  draw();
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
  const upload = el('label', 'sf-label ming-backup-upload', '匯入備份');
  upload.appendChild(importInput);
  root.append(exportButton, upload, status);
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
  const form = el('div', 'sf-stack ming-settings-form');
  const widgetControls = {};
  const wallpaper = el('select', 'sf-select'); wallpaper.setAttribute('aria-label', '桌布');
  [['moonlight', '月光岬的鐘塔'], ['north', '北牆空景'], ['east', '東牆空景'], ['south', '南牆空景'], ['west', '西牆空景']].forEach(function (pair) { const option = el('option', '', pair[1]); option.value = pair[0]; option.selected = settings.wallpaper === pair[0]; wallpaper.appendChild(option); });
  const color = el('select', 'sf-select'); color.setAttribute('aria-label', '主題色');
  [['#eadfda', '暖紙白'], ['#e8d9b8', '淺金'], ['#d8dfed', '霧藍'], ['#d9e2c2', '淡黃綠'], ['#eed7dc', '淡酒紅'], ['#f3ead9', '奶油色']].forEach(function (pair) { const option = el('option', '', pair[1]); option.value = pair[0]; option.selected = settings.themeColor === pair[0]; color.appendChild(option); });
  form.append(labelField('桌布', wallpaper), labelField('主題色', color));
  const widgetRows = el('div', 'sf-stack ming-settings-widgets');
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
  root.addEventListener('ming-settings-saved', function (event) {
    settings = sanitizeSettings(event.detail);
    refresh();
  });
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
  const phonePanel = el('section', 'sf-stack ming-settings-phone');
  const phoneStatus = el('p', 'sf-status', '配對的手機與遊戲存檔連動；伺服器只收遊戲內容，不收 email 或個人資料。');
  const phoneDevices = el('div', 'sf-stack');
  const phoneActions = el('div', 'sf-row');
  const refreshPhones = button('重新整理配對手機', function () { renderPhoneDevices(); });
  const syncPhone = button('現在同步手機資料', async function () {
    syncPhone.disabled = true; phoneStatus.textContent = '正在同步遊戲資料⋯';
    try {
      const auth = await phonePairAuth();
      if (!auth) { phoneStatus.textContent = '尚未建立配對資料。請先在遊戲手機設定產生配對碼，再回來管理手機。'; return; }
      const data = await phoneSnapshot();
      await phoneRequest('/sync/push', Object.assign({}, auth, { data: data }));
      lastPhoneSync = JSON.stringify(data); phoneStatus.textContent = '遊戲資料已同步。';
    } catch (error) { phoneStatus.textContent = error.message; }
    finally { syncPhone.disabled = false; }
  }, 'primary');
  phoneActions.append(refreshPhones, syncPhone);
  phonePanel.append(el('h3', '', '已配對的手機'), el('p', 'sf-context', '解除後，該手機的鑰匙會立即失效。同步包含工作室聊天、已存到伺服器的作品、好感、天數與進度表。'), phoneActions, phoneDevices, phoneStatus);
  form.append(phonePanel);
  root.append(screen, form);
  renderPhoneDevices();

  async function renderPhoneDevices() {
    refreshPhones.disabled = true;
    try {
      const result = await loadPhoneDevices();
      phoneDevices.replaceChildren();
      if (result.unavailable) phoneDevices.appendChild(el('p', 'sf-status', '尚未建立配對資料。請先在遊戲手機設定產生配對碼。'));
      else if (!result.devices.length) phoneDevices.appendChild(el('p', 'sf-status', '目前沒有已配對的手機。'));
      else result.devices.forEach(function (device) {
        const row = el('div', 'sf-row');
        const details = el('span', 'sf-context', (device.label || '手機') + '・配對於 ' + new Date(device.pairedAt).toLocaleString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }));
        const revoke = button('解除配對', async function () {
          if (!confirm('要解除 ' + (device.label || '這支手機') + ' 的配對嗎？解除後鑰匙會立即失效。')) return;
          revoke.disabled = true; phoneStatus.textContent = '正在解除配對⋯';
          try { await revokePhoneDevice(device.deviceId); phoneStatus.textContent = '手機已解除配對。'; await renderPhoneDevices(); }
          catch (error) { phoneStatus.textContent = error.message; revoke.disabled = false; }
        });
        row.append(details, revoke); phoneDevices.appendChild(row);
      });
      if (!result.unavailable) phoneStatus.textContent = '最多可配 ' + (Number(result.max) || 5) + ' 支手機。';
    } catch (error) { phoneDevices.replaceChildren(el('p', 'sf-status', error.message)); phoneStatus.textContent = '讀取配對清單失敗。'; }
    finally { refreshPhones.disabled = false; }
  }

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
  if (mingComputerState) {
    mingComputerState.settings = safe;
    updateMingWallpaper(mingComputerState, safe.wallpaper);
    buildMingWidgets(mingComputerState);
    renderMingDesktopWidgets(mingComputerState).catch(function () {});
    mingComputerState.windows.get('settings')?.querySelector('.ming-window-content')
      ?.dispatchEvent(new CustomEvent('ming-settings-saved', { detail: safe }));
  }
  return safe;
}

window.addEventListener('message', function (event) {
  if (event.source !== window.parent) return;
  const data = event.data || {};
  if (data.type !== 'larch:init') return;
  const websiteWasAvailable = Boolean(mingApp('website'));
  larchVariables = data.variables || {};
  game = readGameState(location.search, larchVariables);
  freeAffinity.refresh();
  window.STUDIO_POINTS2?.refresh();
  schedulePhoneSync(1200);
  if (mingComputerState) {
    const websiteAvailable = Boolean(mingApp('website'));
    if (websiteWasAvailable !== websiteAvailable) {
      if (!websiteAvailable) closeMingWindow(mingComputerState, 'website');
      mingComputerState.desktop.querySelector('.ming-menu-popover')?.remove();
      syncMingDockApps(mingComputerState);
      updateMingDockScrollHint(mingComputerState);
    }
    updateMingClock(mingComputerState);
    renderMingDesktopWidgets(mingComputerState).catch(function () {});
    mingComputerState.windowLayer.querySelectorAll('.ming-window-day').forEach(function (node) { node.textContent = '第 ' + game.day + ' 天'; });
  }
});

// 工作室背景音樂（做法 A）：Larch 的 miniGame 不能控制播放器配樂，所以進工作室前 Larch 配樂先淡出，
// 改由這一頁循環播放進卡時那首（網址參數 bgm=，由 新版/build/build.py 帶入；沒有就不放）。
// 瀏覽器要第一次互動後才准出聲；詩的歌（唱片架、耳機的錄音機、做好的試聽）一開始播，背景音樂淡出，歌停了再淡回。
const BGM_VOLUME = 0.55;
const BGM_FADE_MS = 700;
const studioBgm = (function () {
  const src = query.get('bgm');
  if (!src || !/^(https?:|\.{0,2}\/)/.test(src)) return null;
  const audio = new Audio();
  audio.src = src; audio.loop = true; audio.preload = 'auto'; audio.volume = BGM_VOLUME;
  // holds：面板自己發聲、不是 <audio> 的（吉他用 Web Audio 撥弦），打開期間要配樂讓開，用 hold(名字, true／false) 登記。
  const state = { audio: audio, unlocked: false, ducked: false, fadeTimer: null, holds: new Set() };
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
    if (!state.ducked || songsPlaying() || state.holds.size) return;
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
  state.hold = function (key, on) {
    if (on) { state.holds.add(key); duck(); return; }
    state.holds.delete(key);
    setTimeout(restore, 50);
  };
  start();
  return state;
})();

// 工作室 AI 功能的說明卡（作者 2026-11-16）：第一次打開聊天、畫架、唱片架、明的電腦時跳一次，
// 關閉時把 helpSeen 寫進 Larch 的 studioMisc 或網站版的 IndexedDB，之後在明的電腦「說明」重看。
function helpItems() {
  return [
    '晨、明、詩在工作室裡說的話、畫的圖、做的歌，都是 AI 當場做出來的，可能會說錯，也可能跟劇情對不上。',
    // 次數那一條（data-quota-help）：先寫「次數有上限」，問到 Worker GET /quota 再換成即時的上限、範圍與剩餘（renderHelp）。
    QUOTA_UNKNOWN,
    '妳畫的圖會傳給 AI 看，請不要畫個人資料。',
    '畫、歌和明做的小遊戲存在伺服器上，超過 90 天沒打開就會刪掉。想留著的話，在圖片或播放器上按右鍵（手機是長按）另存；小遊戲可以在明的電腦裡重做或刪掉。',
    larchMode()
      ? '聊天紀錄和他們記得的事，會跟 Larch 的存檔一起保存，重新開始遊戲也還在。'
      : '聊天紀錄和他們記得的事，都存在這台裝置的瀏覽器裡。要換裝置的話，用明的電腦裡的「我的資料備份」帶過去。',
    '網站版的工作室和 Larch 裡的工作室，紀錄不互通。',
    '請不要在聊天裡寫真實姓名、電話、地址這類個人資料。'
  ];
}

function renderHelp(root) {
  const list = el('ul', 'sf-help-list');
  const topics = ['角色與作品', '使用次數', '傳畫給晨', '保留作品', '聊天存檔', '網站與 Larch', '個人資料'];
  helpItems().forEach(function (item, index) {
    const li = el('li');
    const detail = el('div', '', item);
    li.append(el('strong', '', topics[index]), detail);
    if (item === QUOTA_UNKNOWN) { detail.dataset.quotaHelp = 'pending'; fillQuotaHelp(detail); }
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
    const previousFocus = document.activeElement;
    const layer = el('div', 'sf-help-layer');
    layer.setAttribute('role', 'dialog'); layer.setAttribute('aria-modal', 'true'); layer.setAttribute('aria-label', '工作室的 AI 功能');
    const card = el('div', 'sf-help-card');
    renderHelp(card);
    function dismiss() {
      layer.remove(); helpShowing = null; resolve();
      if (previousFocus?.isConnected && previousFocus.getClientRects().length) previousFocus.focus({ preventScroll: true });
      else if (panel.classList.contains('on') && !panel.contains(document.activeElement)) panel.focus({ preventScroll: true });
    }
    async function acknowledge() {
      if (ok.disabled) return;
      ok.disabled = true;
      try { await StudioDB.set('helpSeen', true); } catch (error) { /* 存不下下次再跳 */ }
      dismiss();
    }
    const ok = button('我知道了', acknowledge, 'primary');
    layer.addEventListener('keydown', function (event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      acknowledge();
    });
    ok.dataset.help = 'ok';
    card.appendChild(ok);
    layer.appendChild(card);
    document.body.appendChild(layer);
    ok.focus({ preventScroll: true });
  });
  return helpShowing;
}

function studioStory() {
  const value = name => query.get(name) ?? larchVariables[name];
  const chapter = String(query.get('chapter') || larchVariables.studioChapter || larchVariables.chapter || game.chapter);
  const trueEnd = ['true', 'trueending', '真結局'].includes(chapter.toLowerCase());
  return { day: game.day, chapter: trueEnd ? 99 : game.chapter, trueEnd,
    oneYear: trueEnd && truthy(value('oneYear')), timeOfDay: value('timeOfDay') || value('time') || '', value };
}

freeAffinity.refresh();
resumeJobs();
window.STUDIO_FEATURES = {
  ...(focusApp ? { leaveFocus: focusApp.leave } : {}),
  handle: function (id, focus) {
    if (id === 5) { openShelf(focus); return true; }
    if (id === 16) { openCharacter('shi', focus, 'album'); ensureHelpSeen(); return true; }
    if (id === 8) { openCharacter('chen', focus, 'gallery'); ensureHelpSeen(); return true; }
    if (id === 12) { openMingComputer(focus); ensureHelpSeen(); return true; }
    if (id === 13) {
      panelOpen('長桌・四人群聊', focus, 'group');
      clearBody();
      addContext(panelBody);
      shellRow(panelBody);
      renderChat(null, true, panelBody);
      ensureHelpSeen();
      return true;
    }
    return false;
  },
  openChat: openRealChat,
  person: function (character, focus) { const opened = openDirectChat(character, focus); if (opened) ensureHelpSeen(); return opened; },
  help: ensureHelpSeen,
  context: function () { return game; },
  story: studioStory,
  completeFreeInteraction: freeAffinity.award,
  tier: studioTier,
  mock: mockMode,
  backup: exportBackup,
  pendingJobs: pendingJobs,
  bgm: studioBgm,
  albumFinal: function (focus) { openAlbumFinal(focus || document.body); return true; },
  albumUnlocks: albumUnlocks
};
