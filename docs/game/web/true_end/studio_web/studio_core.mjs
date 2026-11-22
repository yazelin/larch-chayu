import { storySummary, storyTime } from './story_time.mjs';

export const CHARACTERS = {
  // avatar：聊天用的頭像，只有頭（avatars/make_avatars.py 從定稿 Q 版裁的；整張全身圖塞進圓框會切到頭頂、帶到腰）
  chen: { name: '晨', avatar: './avatars/chen.webp', color: '#879a42' },
  ming: { name: '明', avatar: './avatars/ming.webp', color: '#405cae' },
  shi: { name: '詩', avatar: './avatars/shi.webp', color: '#9f3448' }
};
export const TEA_AVATAR = './avatars/tea.webp';
// 表情頭像（共用大頭照 canon/heads/<人>_<表情>_128.webp，說明在 canon/heads/README.md）。五種：neutral 平常、smile 笑、shy 害羞、surprised 驚訝、sad 難過。
// 這張表列「已經有圖」的人與表情（2026-11-18 作者同意樣張後量產）。沒列到的人用上面 avatars/ 那張從舊 Q 版裁的頭像。
// 林向晚只有平常一張，工作室用不到，不列。
const ALL_MOODS = ['neutral', 'smile', 'shy', 'surprised', 'sad'];
export const HEADS = { chen: ALL_MOODS, ming: ALL_MOODS, shi: ALL_MOODS, tea: ALL_MOODS };
export const MOOD_NAMES = ['neutral', 'smile', 'shy', 'surprised', 'sad'];
export function headFor(who, mood) {
  const key = who === 'user' ? 'tea' : who;
  const have = HEADS[key] || [];
  const pick = MOOD_NAMES.includes(mood) && have.includes(mood) ? mood : have.includes('neutral') ? 'neutral' : '';
  if (pick) return '../../canon/heads/' + key + '_' + pick + '_128_bg.webp';   // 有底色版：圓框裡不會透出面板底色
  return key === 'tea' ? TEA_AVATAR : (CHARACTERS[key] || CHARACTERS.shi).avatar;
}

function numberOr(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function readGameState(search, variables) {
  const query = new URLSearchParams(search || '');
  const vars = variables || {};
  const dayKeys = ['day', 'currentDay', 'gameDay', 'storyDay', 'dayNumber', 'current_day'];
  let day = null;
  for (const key of dayKeys) {
    if (vars[key] !== undefined && Number.isFinite(Number(vars[key]))) { day = Number(vars[key]); break; }
  }
  if (day === null) day = numberOr(query.get('day'), 1);
  day = Math.max(1, Math.min(99, Math.floor(day)));

  let affinity = {
    chen: numberOr(vars.affC, numberOr(query.get('affC'), NaN)),
    ming: numberOr(vars.affM, numberOr(query.get('affM'), NaN)),
    shi: numberOr(vars.affS, numberOr(query.get('affS'), NaN))
  };
  const packedAff = query.get('aff');
  if (packedAff !== null) {
    const parts = packedAff.split(',').map(Number);
    if (parts.length === 3 && parts.every(Number.isFinite)) affinity = { chen: parts[0], ming: parts[1], shi: parts[2] };
    else if (Number.isFinite(Number(packedAff))) affinity = { chen: Number(packedAff), ming: Number(packedAff), shi: Number(packedAff) };
  }
  Object.keys(affinity).forEach(function (key) { affinity[key] = Number.isFinite(affinity[key]) ? Math.max(0, Math.min(12, affinity[key])) : 0; });

  const flagKeys = ['trialKnown', 'trialRevealed', 'ch5TrialRevealed', 'knowsTrial'];
  const explicitTrialKnowledge = flagKeys.some(function (key) {
    return vars[key] === true || vars[key] === 1 || vars[key] === 'true' || vars[key] === '1';
  });
  const trialKnown = day >= 18 || (day >= 17 && explicitTrialKnowledge) || query.get('trial') === '1';
  const summary = storySummary(day, trialKnown);
  const { chapter } = storyTime(day, vars.studioChapter || query.get('chapter'));
  const rawSeat = String(vars.seat !== undefined ? vars.seat : (query.get('seat') || ''));
  const seat = ['a', 'b', 'c'].includes(rawSeat) ? rawSeat : '';
  const clearedTrue = [true, 1, 'true', '1'].includes(vars.clearedTrue ?? query.get('clearedTrue'));
  const trialEnded = day > 30 || [true, 1, 'true', '1'].includes(vars.trialEnded ?? query.get('trialEnded'));
  return { day, chapter, seat, affinity, trialKnown, trialEnded, summary, clearedTrue };
}

// 群聊回覆 → 有順序的 [{speaker, content, mood}]（1～3 人）。新格式 {replies:[{speaker,text}]}（或直接是陣列），
// 舊格式（物件 chen／ming／shi）照 晨、明、詩 讀。speaker 只認 chen／ming／shi（也認中文名），重複與空字串濾掉。
export function parseGroupReply(value) {
  let parsed = value;
  if (typeof value === 'string') {
    const trimmed = value.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try { parsed = JSON.parse(trimmed); }
    catch (error) {
      const first = trimmed.search(/[\[{]/);
      const last = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
      if (first < 0 || last <= first) throw new Error('群聊回覆不是有效 JSON');
      parsed = JSON.parse(trimmed.slice(first, last + 1));
    }
  }
  const nameKey = { 晨: 'chen', 明: 'ming', 詩: 'shi' };
  const out = [], seen = new Set();
  const add = function (speaker, text, mood) {
    const key = CHARACTERS[speaker] ? speaker : nameKey[speaker];
    if (!key || seen.has(key) || typeof text !== 'string' || !text.trim()) return;
    seen.add(key); out.push({ speaker: key, content: text.trim().slice(0, 600), mood: typeof mood === 'string' ? mood : '' });
  };
  const list = Array.isArray(parsed) ? parsed : parsed && Array.isArray(parsed.replies) ? parsed.replies : null;
  if (list) list.forEach(function (item) { if (item) add(String(item.speaker || ''), item.text !== undefined ? item.text : item.content, item.mood); });
  else if (parsed && typeof parsed === 'object') {
    const source = parsed.replies && typeof parsed.replies === 'object' ? parsed.replies : parsed;
    ['chen', 'ming', 'shi'].forEach(function (key) { add(key, source[key] || source[CHARACTERS[key].name], ''); });
  }
  if (!out.length) throw new Error('群聊回覆沒有任何一個人的話');
  return out;
}

export function sanitizeProgress(value) {
  const source = value && Array.isArray(value.days) ? value.days : [];
  const byDay = new Map();
  source.forEach(function (item) {
    const day = Math.floor(Number(item && item.day));
    if (day < 1 || day > 30 || !Number.isFinite(day)) return;
    const status = ['done', 'doing', 'planned', 'late'].includes(item.status) ? item.status : 'planned';
    byDay.set(day, { day: day, task: String(item.task || '待安排').slice(0, 120), status: status });
  });
  return {
    title: String(value && value.title || '製作進度表').slice(0, 80),
    days: Array.from({ length: 30 }, function (_, index) {
      return byDay.get(index + 1) || { day: index + 1, task: '待安排', status: 'planned' };
    }),
    updatedAt: Date.now()
  };
}

export const DEFAULT_SETTINGS = {
  wallpaper: 'moonlight', themeColor: '#eadfda',
  widgets: {
    progress: { enabled: true, position: 'right' },
    favorites: { enabled: false, position: 'right' },
    calendar: { enabled: true, position: 'right' },
    notes: { enabled: false, position: 'right' }
  }
};

const WALLPAPERS = ['moonlight', 'north', 'east', 'south', 'west'];
const COLORS = ['#eadfda', '#e8d9b8', '#d8dfed', '#d9e2c2', '#eed7dc', '#f3ead9'];
const POSITIONS = ['left', 'right', 'top', 'bottom'];

export function sanitizeSettings(value) {
  const input = value && typeof value === 'object' ? value : {};
  const sourceWidgets = input.widgets && typeof input.widgets === 'object' ? input.widgets : {};
  const widgets = {};
  Object.keys(DEFAULT_SETTINGS.widgets).forEach(function (key) {
    const source = sourceWidgets[key] && typeof sourceWidgets[key] === 'object' ? sourceWidgets[key] : {};
    widgets[key] = {
      enabled: source.enabled === undefined ? DEFAULT_SETTINGS.widgets[key].enabled : source.enabled === true,
      position: POSITIONS.includes(source.position) ? source.position : DEFAULT_SETTINGS.widgets[key].position
    };
  });
  return {
    wallpaper: WALLPAPERS.includes(input.wallpaper) ? input.wallpaper : DEFAULT_SETTINGS.wallpaper,
    themeColor: COLORS.includes(String(input.themeColor).toLowerCase()) ? String(input.themeColor).toLowerCase() : DEFAULT_SETTINGS.themeColor,
    widgets: widgets
  };
}

function fakeWav() {
  const sampleRate = 8000;
  const sampleCount = sampleRate;
  const buffer = new ArrayBuffer(44 + sampleCount * 2);
  const view = new DataView(buffer);
  function writeText(offset, text) { for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i)); }
  writeText(0, 'RIFF'); view.setUint32(4, 36 + sampleCount * 2, true); writeText(8, 'WAVE');
  writeText(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeText(36, 'data'); view.setUint32(40, sampleCount * 2, true);
  for (let i = 0; i < sampleCount; i += 1) {
    const fade = Math.min(1, i / 300, (sampleCount - i) / 500);
    const sample = Math.sin(2 * Math.PI * (330 + 110 * Math.sin(i / sampleRate * 4)) * i / sampleRate) * fade * 0.18;
    view.setInt16(44 + i * 2, Math.round(sample * 32767), true);
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

function fakeImage() {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="720" height="480"><defs><linearGradient id="g"><stop stop-color="#d9e2c2"/><stop offset="1" stop-color="#eadfda"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="540" cy="105" r="45" fill="#f3dba6"/><path d="M0 360 Q170 210 360 360T720 320V480H0" fill="#9aa879"/><text x="36" y="440" font-size="25" fill="#382c2b">晨的 mock 畫作</text></svg>';
  return new Blob([svg], { type: 'image/svg+xml' });
}

// 假資料模式下「請明幫忙調整」：照請求裡的字眼改白名單設定，讓不接 AI 也看得到效果。
function mockComputerSettings(current, request) {
  const settings = JSON.parse(JSON.stringify(sanitizeSettings(current)));
  const text = String(request || '');
  const widgetNames = { progress: ['進度表'], favorites: ['收藏'], calendar: ['行事曆', '月曆'], notes: ['便利貼'] };
  const positions = [['left', /左/], ['right', /右/], ['top', /上/], ['bottom', /下/]];
  text.split(/[，,。；;、\n]/).forEach(function (part) {
    Object.keys(widgetNames).forEach(function (key) {
      if (!widgetNames[key].some(function (name) { return part.includes(name); })) return;
      if (/關掉|關閉|拿掉|隱藏|不要/.test(part)) settings.widgets[key].enabled = false;
      else settings.widgets[key].enabled = true;
      const place = positions.find(function (pair) { return pair[1].test(part.replace(/上面|下面/g, function (word) { return word[0]; })); });
      if (place && /放|移|擺|到|在/.test(part)) settings.widgets[key].position = place[0];
    });
  });
  const colors = { 暖紙白: '#eadfda', 淺金: '#e8d9b8', 霧藍: '#d8dfed', 淡黃綠: '#d9e2c2', 淡酒紅: '#eed7dc', 奶油色: '#f3ead9' };
  Object.keys(colors).forEach(function (name) { if (text.includes(name)) settings.themeColor = colors[name]; });
  const walls = { 北牆: 'north', 東牆: 'east', 南牆: 'south', 西牆: 'west' };
  Object.keys(walls).forEach(function (name) { if (text.includes(name)) settings.wallpaper = walls[name]; });
  return sanitizeSettings(settings);
}

export async function mockRequest(path, payload) {
  const body = payload || {};
  if (path === '/summarize') {
    const byDay = new Map();
    for (const message of (body.messages || []).slice(-4)) {
      const { day } = storyTime(message.day, message.chapter);
      const lines = byDay.get(day) || [];
      lines.push(String(message.content || '').slice(0, 70));
      byDay.set(day, lines);
    }
    const latest = Array.from(byDay, function ([day, lines]) {
      return (day === null ? '日期未知' : '第 ' + day + ' 天') + '：最近聊到 ' + lines.join('；');
    });
    return { summary: [body.prevMemory, ...latest].filter(Boolean).join('\n').slice(0, 500) || '日期未知：玩家正在工作室和三人聊天。' };
  }
  // 假資料模式也走先打後查：jobId 記著幾點做好、要不要失敗（題目含「失敗」），重新整理後照樣查得到。
  if (path === '/music' || path === '/img') {
    const kind = path === '/img' ? 'img' : 'song';
    const fail = /失敗/.test(String(body.prompt || '')) ? 'f' : 'k';
    return { jobId: 'mock-' + kind + '-' + (Date.now() + MOCK_JOB_MS) + '-' + fail + '-' + Math.random().toString(36).slice(2, 8), status: 'pending', title: String(body.prompt || '').slice(0, 100) };
  }
  if (path === '/game') {
    const fail = /失敗/.test(String(body.prompt || '')) ? 'f' : 'k';
    return { jobId: 'mock-game-' + (Date.now() + MOCK_JOB_MS) + '-' + fail + '-' + Math.random().toString(36).slice(2, 8), status: 'pending' };
  }
  // 讓晨看看玩家的畫：假資料回一句固定的反應與畫名；網址帶 lookFail=1 時模擬 AI 沒回應（晨的預設句、畫不收）。
  if (path === '/look') {
    if (typeof location !== 'undefined' && new URLSearchParams(location.search).get('lookFail') === '1') return { reply: '……嗯。我這邊看不太清楚。等一下再給我看一次，好嗎？', fallback: true, saved: false };
    return { reply: 'mock｜嗯。黑色的線畫得很用力。……中間那一團是什麼？', title: 'mock｜中間那一團', mood: 'shy', saved: true };
  }
  if (path === '/chat' && body.action === 'progress_table') {
    return { json: sanitizeProgress({ title: 'mock｜製作進度表', days: [
      { day: 1, task: '整理工作室與企劃', status: 'done' }, { day: 5, task: '完成色之國初稿', status: 'doing' },
      { day: 12, task: '完成音之國主題曲', status: 'planned' }, { day: 23, task: '送出參賽作品', status: 'planned' }
    ] }) };
  }
  if (path === '/chat' && body.action === 'computer_settings') return { json: mockComputerSettings(body.settings || DEFAULT_SETTINGS, body.request) };
  if (path === '/chat' && body.group) {
    // 假資料：隨機 1～3 人、順序不同（網址帶 groupAll=1 時固定晨、明、詩三人都回，給舊測試用）
    const lines = {
      chen: ['嗯。大家都在，妳想先從哪一段說？', '我剛好也在想這件事。', '……這個我想一下再說。'],
      ming: ['先把妳現在最在意的事說完，我們再一起排。', '收到。我先記下來。', '這件事可以排進今天。'],
      shi: ['欸，長桌群聊開張。我先聽著。', '哈，晨又不說話了。', '我覺得可以先唱一段再說。']
    };
    const all = typeof location !== 'undefined' && new URLSearchParams(location.search).get('groupAll') === '1';
    const order = ['chen', 'ming', 'shi'];
    if (!all) for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
    const count = all ? 3 : Math.random() < 1 / 3 ? 1 + Math.floor(Math.random() * 2) : 3;
    return { replies: order.slice(0, count).map(function (key, i) { return { speaker: key, text: all ? lines[key][0] : lines[key][(i + Math.floor(Math.random() * 3)) % 3], mood: '' }; }) };
  }
  const character = body.character || 'shi';
  const replies = {
    chen: '嗯。有喔，我把妳剛才說的記下來了。',
    ming: '……嗯，收到。我陪妳一起看。',
    shi: '欸，妳說，我有在聽。'
  };
  const last = (body.messages || []).slice(-1)[0];
  if (last && /是不是.{0,4}(AI|人工智慧)|你是(不是)?(AI|人工智慧)/i.test(String(last.content || ''))) return { reply: '我是人形介面啊。' };
  return { reply: replies[character] || replies.shi, mood: character === 'chen' ? 'smile' : 'neutral' };
}

export const MOCK_JOB_MS = 2500;

export async function mockPoll(path, jobId) {
  const match = /^mock-(img|song|game)-(\d+)-([fk])-/.exec(String(jobId || ''));
  if (!match) return { status: 'error', error: '找不到這個工作。' };
  if (Date.now() < Number(match[2])) return { status: 'pending' };
  if (match[3] === 'f') return { status: 'error', error: 'mock：做到一半失敗了。' };
  if (match[1] === 'game') return {
    status: 'done', workId: jobId, title: '月光拾星', line: '嗯。妳說想收集星星，我就做了。', fallback: false,
    html: '<!doctype html><html lang="zh-Hant"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>月光拾星</title><meta name="ming-line" content="嗯。妳說想收集星星，我就做了。"><meta name="ming-kind" content="game"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;font-family:system-ui,sans-serif;background:#1b2747;color:#f4f1ea}body{display:grid;place-items:center}main{text-align:center}button{min-width:100px;min-height:56px;border:0;border-radius:16px;background:#f3d999;color:#1b2747;font-size:22px;cursor:pointer;touch-action:manipulation;user-select:none;-webkit-tap-highlight-color:transparent}</style></head><body><main><h1>月光拾星</h1><p>點亮一顆星星。</p><button id="star">點亮</button><p id="score">0 顆</p><script>ming.onInit(function(){var n=0,b=document.getElementById("star"),lastInput=null;function collect(){n++;b.textContent="亮了";document.getElementById("score").textContent=n+" 顆";ming.play("pop");ming.save({stars:n});ming.score(n);}function activate(event){if(event.type==="pointerup"&&event.button!==undefined&&event.button!==0)return;var now=performance.now();if(lastInput&&lastInput.type!==event.type&&now-lastInput.at<250)return;lastInput={type:event.type,at:now};collect();}b.addEventListener("pointerup",activate);b.addEventListener("touchend",activate,{passive:true});b.addEventListener("click",activate);});</script></main></body></html>'
  };
  if (match[1] === 'img') return { status: 'done', title: 'mock｜窗邊的花', image: fakeImage(), mimeType: 'image/svg+xml' };
  return { status: 'done', title: 'mock｜窗邊的旋律', lyrics: '', audio: fakeWav(), mimeType: 'audio/wav' };
}

// 額度分級（作者 2026-11-19 定，計劃 新版/_計劃_AI額度分級_2026-11-19.md）：跟 Worker 的 DEFAULT_TIERS 同一份數字。
// 真的額度在 Worker（wrangler.toml 的 QUOTA_TIERS、MAX_DAILY_*）；前端只在假資料模式模擬，以及 Worker 沒回上限時拿來顯示。
export const QUOTA_DEFAULTS = {
  trial: { chat: { limit: 20, scope: 'day' }, image: { limit: 1, scope: 'total' }, song: { limit: 1, scope: 'total' }, look: { limit: 3, scope: 'total' }, game: { limit: 1, scope: 'day' } },
  owned: { chat: { limit: 100, scope: 'day' }, image: { limit: 3, scope: 'day' }, song: { limit: 1, scope: 'day' }, look: { limit: 5, scope: 'day' }, game: { limit: 3, scope: 'day' } }
};

// 試玩用完：那位角色講一句（作者 2026-11-19 定的四句，台詞一字不改）。聊天是正在聊的那位講。
export const TRIAL_LINES = {
  TRIAL_IMAGE_LIMIT: { speaker: 'chen', kind: 'image', text: '試玩只能畫這一張。想要我再畫，要完整版才行。' },
  TRIAL_MUSIC_LIMIT: { speaker: 'shi', kind: 'song', text: '試玩的歌只有這一首。要我再寫新的，得等完整版喔。' },
  TRIAL_LOOK_LIMIT: { speaker: 'chen', kind: 'look', text: '試玩能看的次數用完了。完整版的話，妳畫幾張我都看。' },
  TRIAL_CHAT_LIMIT: { speaker: '', kind: 'chat', text: '今天試玩能聊的就到這裡。明天再來，或是有完整版，我們就能多聊一點。' },
  TRIAL_GAME_LIMIT: { speaker: 'ming', kind: 'game', text: '今天試玩只能請我做一款小遊戲。完整版的話，我每天可以多做幾款。' }
};
export const DAILY_KINDS = { DAILY_IMAGE_LIMIT: 'image', DAILY_MUSIC_LIMIT: 'song', DAILY_CHAT_LIMIT: 'chat', DAILY_LOOK_LIMIT: 'look', DAILY_GAME_LIMIT: 'game' };
export function isTrialLimit(code) { return Object.prototype.hasOwnProperty.call(TRIAL_LINES, code); }
export function isDailyLimit(code) { return Object.prototype.hasOwnProperty.call(DAILY_KINDS, code); }

// 已購買（或 IP 那一份）用完的提示：數字照 Worker 回的上限（沒回就用已購買的預設）。
// scope 是 day（每天）時是原本的每日句子；是 total（總共，之後改成一池時）就不說明天、不說會恢復。
// 試玩用完的代碼回那位角色的那一句（畫面上由那位角色講出來，見 TRIAL_LINES）。
export function quotaMessage(code, character, limit, scope) {
  if (isTrialLimit(code)) return TRIAL_LINES[code].text;
  const n = function (kind) { const value = Number(limit); return Number.isFinite(value) && value > 0 ? value : QUOTA_DEFAULTS.owned[kind].limit; };
  const total = scope === 'total';
  if (code === 'DAILY_IMAGE_LIMIT') return total ? '能畫的 ' + n('image') + ' 張已經畫完了。' : '今天的 ' + n('image') + ' 張已經畫完了，明天再請晨畫。';
  if (code === 'DAILY_MUSIC_LIMIT') return total ? '能做的 ' + n('song') + ' 首歌已經做完了。' : '今天的 ' + n('song') + ' 首歌已經做完了，明天再請詩做。';
  if (code === 'DAILY_CHAT_LIMIT') return total ? '能聊的 ' + n('chat') + ' 句已經聊完了。' : '今天的 ' + n('chat') + ' 句已經聊完了，明天再來聊。';
  if (code === 'DAILY_LOOK_LIMIT') return total ? '能給晨看的 ' + n('look') + ' 次已經用完了。' : '今天已經給晨看了 ' + n('look') + ' 張，明天再給他看。';
  if (code === 'DAILY_GAME_LIMIT') return total ? '能請明做的 ' + n('game') + ' 款小遊戲已經做完了。' : '今天能請明做的 ' + n('game') + ' 款小遊戲已經做完了，明天再來。';
  return '今天先到這裡，明天再來。';
}

// 顯示次數（作者 2026-11-19：「不寫次數人家怎麼知道一天幾次？」）。數字一律照 Worker GET /quota 回的，文字照 scope 自動變：
// 之後 Worker 改成總共一池時畫面不用改。讀不到 /quota 時不顯示數字（QUOTA_UNKNOWN）。
export const QUOTA_LABELS = {
  chat: { name: '聊天', unit: '句', verb: '聊' },
  image: { name: '畫圖', unit: '張', verb: '畫' },
  song: { name: '作曲', unit: '首歌', verb: '做' },
  look: { name: '給晨看畫', unit: '次', verb: '給晨看' },
  game: { name: '做小遊戲', unit: '款', verb: '請明做' }
};
export const QUOTA_KINDS = ['chat', 'image', 'song', 'look', 'game'];
export const QUOTA_UNKNOWN = '次數有上限，用完時會跟妳說。';
export const QUOTA_RESET_NOTE = '標「每天」的，每天台灣時間半夜十二點重新算。';
function validQuota(q) { return q && Number.isFinite(Number(q.limit)) && Number.isFinite(Number(q.remaining)) && (q.scope === 'day' || q.scope === 'total'); }
// 說明卡的一行：「聊天：每天 20 句，今天還剩 12 句」「畫圖：總共 1 張，還剩 0 張」
export function quotaHelpLine(kind, q) {
  if (!validQuota(q)) return '';
  const label = QUOTA_LABELS[kind], unit = kind === 'song' ? '首' : label.unit;
  return q.scope === 'day'
    ? label.name + '：每天 ' + q.limit + ' ' + unit + '，今天還剩 ' + q.remaining + ' ' + unit
    : label.name + '：總共 ' + q.limit + ' ' + unit + '，還剩 ' + q.remaining + ' ' + unit;
}
// 介面上的小字：「今天還能聊 12 句」「還能畫 1 張」「今天還能做 1 首歌」「還能給晨看 3 次」
export function quotaHint(kind, q) {
  if (!validQuota(q)) return '';
  const label = QUOTA_LABELS[kind];
  return (q.scope === 'day' ? '今天還能' : '還能') + label.verb + ' ' + q.remaining + ' ' + label.unit;
}
