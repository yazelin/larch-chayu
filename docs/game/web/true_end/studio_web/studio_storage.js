(function () {
  'use strict';
  // 工作室的儲存：網站版用 IndexedDB；放在 Larch 的小遊戲卡裡（sandbox iframe、opaque origin，IndexedDB 一碰就丟
  // SecurityError）改用「Larch 模式」：經外殼（新版/build/build.py 的 iframe_shell）用 larch:set 寫 persistent 劇情變數，
  // 跨週目保留；只跟這張卡有關的暫存（站位）用 Larch 的 larch.storage（每卡 10 萬字、跟一般存檔走）。
  // 兩邊都不能用時（沒有外殼的 sandbox）退到記憶體，至少不壞。介面一樣：get／set／remove／entries／replaceAll。
  var DB_NAME = 'larch-studio-ai-v1';
  var STORE_NAME = 'kv';

  function indexedDbUsable() {
    try {
      if (window.origin === 'null') return false;
      if (!window.indexedDB) return false;
      return true;
    } catch (error) { return false; }
  }

  // ── IndexedDB（網站版） ──
  function idbBackend() {
    var dbPromise;
    function openDb() {
      if (!dbPromise) {
        dbPromise = new Promise(function (resolve, reject) {
          var request;
          try { request = indexedDB.open(DB_NAME, 1); }
          catch (error) { reject(error); return; }
          request.onupgradeneeded = function () {
            if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME);
          };
          request.onsuccess = function () { resolve(request.result); };
          request.onerror = function () { reject(request.error || new Error('無法開啟 IndexedDB')); };
        });
      }
      return dbPromise;
    }
    function requestResult(request) {
      return new Promise(function (resolve, reject) {
        request.onsuccess = function () { resolve(request.result); };
        request.onerror = function () { reject(request.error || new Error('IndexedDB 操作失敗')); };
      });
    }
    return {
      mode: 'indexeddb',
      ready: Promise.resolve(),
      get: async function (key) { var db = await openDb(); return requestResult(db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(key)); },
      set: async function (key, value) { var db = await openDb(); return requestResult(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(value, key)); },
      remove: async function (key) { var db = await openDb(); return requestResult(db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(key)); },
      entries: async function () {
        var db = await openDb();
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE_NAME, 'readonly');
          var keysRequest = tx.objectStore(STORE_NAME).getAllKeys();
          var valuesRequest = tx.objectStore(STORE_NAME).getAll();
          tx.oncomplete = function () { resolve(keysRequest.result.map(function (key, index) { return [key, valuesRequest.result[index]]; })); };
          tx.onerror = function () { reject(tx.error || new Error('無法讀取 IndexedDB')); };
        });
      },
      replaceAll: async function (items) {
        var db = await openDb();
        return new Promise(function (resolve, reject) {
          var tx = db.transaction(STORE_NAME, 'readwrite');
          var store = tx.objectStore(STORE_NAME);
          store.clear();
          items.forEach(function (item) { store.put(item[1], item[0]); });
          tx.oncomplete = function () { resolve(); };
          tx.onerror = function () { reject(tx.error || new Error('無法匯入 IndexedDB')); };
          tx.onabort = function () { reject(tx.error || new Error('匯入已取消')); };
        });
      }
    };
  }

  // ── Larch 模式：persistent 劇情變數＋每卡暫存 ──
  // 容量（Larch 技術支援 Obelisk 2026-11-16 答覆，esc-9725bc74，version 15f8764a）：
  //   跨週目紀錄每個值只留前 2000 字（超過直接截掉），最多 200 個變數；雲端存檔每格約 1.75 MB。
  //   所以每個 persistent 變數都切在 1900 字以內：一個邏輯欄位拆成幾格（SHARDS），寫的時候先把內容收到容量內。
  //   這份名單要跟 新版/build/build.py 的 STUDIO_SAVE_SHARDS 一致（tests/run.py 會比對）。
  var SHARD_CHARS = 1900;
  var SHARDS = { studioPlayerId: 1, studioMemC: 1, studioMemM: 1, studioMemS: 1, studioMemG: 1,
    studioChatC: 5, studioChatM: 5, studioChatS: 5, studioChatG: 5,
    studioWorks: 4, studioProgress: 2, studioSettings: 1, studioMisc: 2 };
  // 島的各頁（真結局/map2d/side/web/island_bridge.js 會設 STUDIO_DB_SCOPE='island'）雜項另外寫 islandSave0／1，
  // 不碰 studioMisc：島卡沒有登記 studioMisc，只寫不讀會把工作室存的換裝、常駐位蓋掉。islandSave 跟著存檔走、不跨週目。
  var ISLAND = window.STUDIO_DB_SCOPE === 'island';
  var EXTRA_SHARDS = { islandSave: 2 };
  function shardCount(name) { return SHARDS[name] || EXTRA_SHARDS[name] || 1; }
  function capacity(name) { return shardCount(name) * SHARD_CHARS; }
  var LIMITS = { chatMessages: 40, messageChars: 600, memoryChars: 1200, works: 60, shardChars: SHARD_CHARS };
  var SHORT = { chen: 'C', ming: 'M', shi: 'S', group: 'G' };
  var VARS = {
    playerId: 'studioPlayerId', progress: 'studioProgress', settings: 'studioSettings', works: 'studioWorks', misc: ISLAND ? 'islandSave' : 'studioMisc'
  };
  function chatVar(conversation) { return 'studioChat' + SHORT[conversation]; }
  function memoryVar(conversation) { return 'studioMem' + SHORT[conversation]; }
  var CARD_KEYS = { studioTurnState: true };

  function larchBackend() {
    var vars = {};       // 邏輯欄位現值（各格拼回來的字串）
    var raw = {};        // 實際的劇情變數（一格一格）
    var card = {};       // 這張卡的 larch.storage
    var seeded = false;
    var resolveReady;
    var ready = new Promise(function (resolve) { resolveReady = resolve; });
    function finishSeed() { if (!seeded) { seeded = true; resolveReady(); } }
    window.addEventListener('message', function (event) {
      if (event.source !== window.parent) return;
      var data = event.data || {};
      if (data.type === 'larch:init') {
        var incoming = data.variables || {};
        // 島頁在同一張卡裡換頁時，init 是進卡當時的舊值：這張卡裡寫過的蓋回去
        if (ISLAND && window.IslandBridge) incoming = window.IslandBridge.merge(incoming);
        Object.keys(incoming).forEach(function (name) { if (/^(studio|islandSave)/.test(name)) raw[name] = String(incoming[name] === undefined || incoming[name] === null ? '' : incoming[name]); });
        Object.keys(SHARDS).concat(Object.keys(EXTRA_SHARDS)).forEach(function (name) {
          if (shardCount(name) === 1) { vars[name] = raw[name] || ''; return; }
          var text = '';
          for (var index = 0; index < shardCount(name); index += 1) text += raw[name + index] || '';
          vars[name] = text;
        });
        finishSeed();
      } else if (data.type === 'studio:card-storage') {
        card = data.storage && typeof data.storage === 'object' ? data.storage : {};
      }
    });
    // 編輯器預覽或沒有外殼時不會送 init，2.5 秒後照空的開始。
    setTimeout(finishSeed, 2500);

    function post(message) { try { window.parent.postMessage(message, '*'); } catch (error) { /* 外殼不在 */ } }
    function writeVar(name, value) {
      var text = String(value === undefined || value === null ? '' : value).slice(0, capacity(name));
      vars[name] = text;
      if (shardCount(name) === 1) { post({ type: 'larch:set', name: name, value: text }); return; }
      for (var index = 0; index < shardCount(name); index += 1) {
        var part = text.slice(index * SHARD_CHARS, (index + 1) * SHARD_CHARS);
        if ((raw[name + index] || '') === part) continue;
        raw[name + index] = part;
        if (ISLAND && window.IslandBridge) { if (window.IslandBridge.done) return; var noted = {}; noted[name + index] = part; window.IslandBridge.note(noted); }   // 島頁送完成之後不再寫
        post({ type: 'larch:set', name: name + index, value: part });
      }
    }
    function parse(name, fallback) {
      var raw = vars[name];
      if (typeof raw !== 'string' || !raw) return fallback;
      try { return JSON.parse(raw); } catch (error) { return fallback; }
    }
    function misc() { var value = parse(VARS.misc, {}); return value && typeof value === 'object' ? value : {}; }
    // 放不下就從最舊的丟（舊的內容靠記憶摘要記住）。
    function fitList(items, name) {
      var text = JSON.stringify(items);
      while (items.length > 1 && text.length > capacity(name)) { items.shift(); text = JSON.stringify(items); }
      return text.length > capacity(name) ? '[]' : text;
    }
    function fitChat(list, name) {
      var items = (Array.isArray(list) ? list : []).slice(-LIMITS.chatMessages).map(function (message) {
        var item = { r: message.role === 'user' ? 'u' : 'a', c: String(message.content || '').slice(0, LIMITS.messageChars), t: message.ts };
        if (message.speaker) item.s = message.speaker;
        if (message.mood) item.m = message.mood;   // 這句話的表情（頭像用）
        if (message.draw) item.d = message.draw;   // 「妳給晨看了一張畫」那一則：作品編號，用來顯示縮圖
        return item;
      });
      return fitList(items, name);
    }
    function unpackChat(list) {
      return (Array.isArray(list) ? list : []).map(function (item) {
        if (item.role) return item;
        var message = { role: item.r === 'u' ? 'user' : 'assistant', content: item.c, ts: item.t };
        if (item.s) message.speaker = item.s;
        if (item.d) message.draw = item.d;
        if (item.m) message.mood = item.m;
        return message;
      });
    }
    // 作品清單只存編號、種類、標題、時間（每件約 100 字）；檔案在 Worker 的 R2，歌詞不存。
    function workMeta(work) {
      return { id: work.id, kind: work.kind, title: String(work.title || '').slice(0, 40), createdAt: work.createdAt, workId: work.workId || work.jobId || '' };
    }
    function works() { var list = parse(VARS.works, []); return Array.isArray(list) ? list : []; }
    function writeWorks(list) { writeVar(VARS.works, fitList(list.slice(-LIMITS.works), VARS.works)); }
    function conversationOf(key, prefix) {
      var name = key.slice(prefix.length);
      return SHORT[name] ? name : null;
    }

    async function get(key) {
      await ready;
      if (key === 'anonymousPlayerId') return vars[VARS.playerId] || undefined;
      if (key === 'progressTable') return parse(VARS.progress, undefined);
      if (key === 'computerSettings') return parse(VARS.settings, undefined);
      if (key.indexOf('chat:') === 0 && conversationOf(key, 'chat:')) { var chat = parse(chatVar(conversationOf(key, 'chat:')), undefined); return chat ? unpackChat(chat) : undefined; }
      if (key.indexOf('chatMemory:') === 0 && conversationOf(key, 'chatMemory:')) return vars[memoryVar(conversationOf(key, 'chatMemory:'))] || undefined;
      if (/^(image|song|drawing):/.test(key)) {
        var id = key.slice(key.indexOf(':') + 1);
        return works().find(function (work) { return work.id === id; });
      }
      if (CARD_KEYS[key]) return card[key] === undefined ? undefined : JSON.parse(card[key]);
      var bag = misc();
      return Object.prototype.hasOwnProperty.call(bag, key) ? bag[key] : undefined;
    }

    async function set(key, value) {
      await ready;
      if (key === 'anonymousPlayerId') return writeVar(VARS.playerId, value);
      if (key === 'progressTable') {
        var progress = JSON.stringify(value);
        if (progress.length > capacity(VARS.progress)) {
          var copy = JSON.parse(progress);
          (copy.days || []).forEach(function (day) { day.task = String(day.task || '').slice(0, 30); });
          delete copy.updatedAt;
          progress = JSON.stringify(copy);
        }
        return writeVar(VARS.progress, progress.length > capacity(VARS.progress) ? '' : progress);
      }
      if (key === 'computerSettings') return writeVar(VARS.settings, JSON.stringify(value));
      if (key.indexOf('chat:') === 0 && conversationOf(key, 'chat:')) { var target = chatVar(conversationOf(key, 'chat:')); return writeVar(target, fitChat(value, target)); }
      if (key.indexOf('chatMemory:') === 0 && conversationOf(key, 'chatMemory:')) return writeVar(memoryVar(conversationOf(key, 'chatMemory:')), String(value || '').slice(0, LIMITS.memoryChars));
      if (/^(image|song|drawing):/.test(key)) {
        var list = works().filter(function (work) { return work.id !== value.id; });
        list.push(workMeta(value));
        return writeWorks(list);
      }
      if (CARD_KEYS[key]) {
        var text = JSON.stringify(value);
        card[key] = text;
        return post({ type: 'larch:storage:set', key: key, value: text });
      }
      var bag = misc();
      if (key.indexOf('job:') === 0 && value && typeof value === 'object') value = Object.assign({}, value, { prompt: String(value.prompt || '').slice(0, 120), title: String(value.title || '').slice(0, 60) });
      bag[key] = value;
      var packed = JSON.stringify(bag);
      if (packed.length > capacity(VARS.misc)) {
        // 太大時先丟舊的工作編號（已經做完或過期的會被前端清掉，這裡只是保險）。
        Object.keys(bag).filter(function (name) { return name.indexOf('job:') === 0; }).slice(0, -5).forEach(function (name) { delete bag[name]; });
        packed = JSON.stringify(bag);
      }
      return writeVar(VARS.misc, packed);
    }

    async function remove(key) {
      await ready;
      if (/^(image|song|drawing):/.test(key)) {
        var id = key.slice(key.indexOf(':') + 1);
        return writeWorks(works().filter(function (work) { return work.id !== id; }));
      }
      if (CARD_KEYS[key]) { delete card[key]; return post({ type: 'larch:storage:remove', key: key }); }
      if (key === 'anonymousPlayerId' || key === 'progressTable' || key === 'computerSettings' || key.indexOf('chat:') === 0 || key.indexOf('chatMemory:') === 0) {
        var target = key === 'anonymousPlayerId' ? VARS.playerId : key === 'progressTable' ? VARS.progress : key === 'computerSettings' ? VARS.settings
          : key.indexOf('chat:') === 0 ? chatVar(conversationOf(key, 'chat:')) : memoryVar(conversationOf(key, 'chatMemory:'));
        if (target && target.indexOf('undefined') < 0) return writeVar(target, '');
        return;
      }
      var bag = misc();
      if (!Object.prototype.hasOwnProperty.call(bag, key)) return;
      delete bag[key];
      return writeVar(VARS.misc, JSON.stringify(bag));
    }

    async function entries() {
      await ready;
      var out = [];
      if (vars[VARS.playerId]) out.push(['anonymousPlayerId', vars[VARS.playerId]]);
      if (vars[VARS.progress]) out.push(['progressTable', parse(VARS.progress, null)]);
      if (vars[VARS.settings]) out.push(['computerSettings', parse(VARS.settings, null)]);
      Object.keys(SHORT).forEach(function (conversation) {
        var chat = parse(chatVar(conversation), null);
        if (chat) out.push(['chat:' + conversation, unpackChat(chat)]);
        if (vars[memoryVar(conversation)]) out.push(['chatMemory:' + conversation, vars[memoryVar(conversation)]]);
      });
      works().forEach(function (work) { out.push([(work.kind === 'song' ? 'song:' : work.kind === 'drawing' ? 'drawing:' : 'image:') + work.id, work]); });
      var bag = misc();
      Object.keys(bag).forEach(function (key) { out.push([key, bag[key]]); });
      Object.keys(card).forEach(function (key) { try { out.push([key, JSON.parse(card[key])]); } catch (error) { /* 壞掉的暫存略過 */ } });
      return out;
    }

    async function replaceAll(items) {
      await ready;
      Object.keys(SHARDS).forEach(function (name) { if (vars[name]) writeVar(name, ''); });
      card = {};
      post({ type: 'larch:storage:clear' });
      for (var index = 0; index < items.length; index += 1) {
        if (items[index][1] instanceof Blob) continue;
        await set(items[index][0], items[index][1]);
      }
    }

    return { mode: 'larch', ready: ready, get: get, set: set, remove: remove, entries: entries, replaceAll: replaceAll, limits: LIMITS, debugVars: function () { return Object.assign({}, vars); }, rawVars: function () { return Object.assign({}, raw); }, shards: SHARDS };
  }

  // ── 記憶體（最後的退路） ──
  function memoryBackend() {
    var store = new Map();
    return {
      mode: 'memory', ready: Promise.resolve(),
      get: async function (key) { return store.get(key); },
      set: async function (key, value) { store.set(key, value); },
      remove: async function (key) { store.delete(key); },
      entries: async function () { return Array.from(store.entries()); },
      replaceAll: async function (items) { store.clear(); items.forEach(function (item) { store.set(item[0], item[1]); }); }
    };
  }

  var inLarchFrame = false;
  try { inLarchFrame = window.parent !== window; } catch (error) { inLarchFrame = true; }
  window.StudioDB = indexedDbUsable() ? idbBackend() : inLarchFrame ? larchBackend() : memoryBackend();
})();
