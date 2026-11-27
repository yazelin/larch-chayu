/* 《夜後明月》手機 App API。預設 mock；正式模式只在玩家明確切換後呼叫 Worker。 */
(function () {
  "use strict";

  const KEY_SLOT = "nyhm-phone-key-v1";
  const DATA_SLOT = "nyhm-phone-mock-data-v1";
  const USED_SLOT = "nyhm-phone-mock-codes-v1";
  const PAIR_SLOT = "nyhm-phone-mock-pairing-v1";
  const CONFIG_SLOT = "nyhm-phone-api-config-v1";
  const CHARACTERS = ["chen", "ming", "shi"];
  const query = new URLSearchParams(location.search);
  const meta = document.querySelector('meta[name="phone-api-base"]');
  const defaultBase = String(window.PHONE_API_BASE || (meta && meta.content) || "").replace(/\/+$/, "");
  const activeObjectUrls = [];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function readConfig() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(CONFIG_SLOT) || "{}"); } catch (_) { saved = {}; }
    /* 配對 QR 的 ?c= 是明確的配對操作；空白開啟 PWA 仍維持 mock 預設。 */
    const qrPairing = query.has("c") && query.get("mock") !== "1";
    const forceMock = query.get("mock") === "1" || query.get("mode") === "mock";
    return {
      mode: !forceMock && (query.get("mode") === "worker" || qrPairing || saved.mode === "worker") ? "worker" : "mock",
      base: String(saved.base || defaultBase).replace(/\/+$/, "")
    };
  }
  let config = readConfig();
  function validCode(code) { return /^[A-HJ-KM-NP-Z2-9]{8}$/.test(String(code || "").toUpperCase()); }
  function localDate() {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Taipei", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(function (part) { return [part.type, part.value]; }));
    return values.year + "-" + values.month + "-" + values.day;
  }

  // 假資料模式的示意聊天：只放中性的示意句，不寫劇情台詞
  function demoChat(who) {
    return [
      { from: who, text: "這是聊天示意訊息。", at: "示意" },
      { from: "me", text: "收到，謝謝。", at: "示意" },
      { from: who, text: "這是另一則示意訊息。", at: "示意" }
    ];
  }

  const SEED = {
    day: 17, trialDaysLeft: 14,
    affection: { chen: 8, ming: 6, shi: 9 },
    collections: [
      { id: "photo-1", type: "photo", who: "chen", title: "晨畫的：看窗外", note: "第 16 天" },
      { id: "photo-2", type: "photo", who: "chen", title: "晨畫的：工作室", note: "第 15 天" },
      { id: "song-1", type: "song", who: "shi", title: "詩的歌（耳機完整版）", note: "詩的歌" },
      { id: "song-2", type: "song", who: "shi", title: "明天一定寫", note: "劇情歌曲" }
    ],
    chats: {
      chen: demoChat("chen"),
      ming: demoChat("ming"),
      shi: demoChat("shi")
    },
    quota: { date: "", limit: 20, used: 2, remaining: 18 },
    newContent: { chen: true, ming: true, shi: true },
    todos: [
      { title: "完成鐘塔的齒輪草圖", done: true, fixed: true, day: 16 },
      { title: "整理最後一幕的分鏡", done: false, fixed: true, day: 17 },
      { title: "把明天要寫的段落記下來", done: false, fixed: false, day: 17 }
    ],
    subscriptions: { chen: false, ming: false, shi: false }
  };
  const replies = { chen: ["這是示意回覆。"], ming: ["這是示意回覆。"], shi: ["這是示意回覆。"] };   // 假資料只放中性示意句

  function readData() {
    try {
      const value = JSON.parse(localStorage.getItem(DATA_SLOT) || "null");
      return value && typeof value === "object" ? value : clone(SEED);
    } catch (_) { return clone(SEED); }
  }
  function writeData(value) { localStorage.setItem(DATA_SLOT, JSON.stringify(value)); }
  function readPairing() {
    try { return JSON.parse(localStorage.getItem(PAIR_SLOT) || "null"); } catch (_) { return null; }
  }
  function savePairing(value) { localStorage.setItem(PAIR_SLOT, JSON.stringify(value)); }
  function validMockKey(key) {
    if (!key || key !== localStorage.getItem(KEY_SLOT)) return false;
    const pairing = readPairing();
    if (!pairing || !Array.isArray(pairing.devices)) return true;
    return pairing.devices.some(function (device) { return device.key === key; });
  }
  function resetQuotaIfNeeded(data) {
    const today = localDate();
    if (!data.quota || data.quota.date !== today) data.quota = { date: today, limit: 20, used: 0, remaining: 20 };
    data.quota.remaining = Math.max(0, Number(data.quota.limit) - Number(data.quota.used));
  }
  function makeKey() {
    const bytes = new Uint8Array(32); crypto.getRandomValues(bytes);
    return "mock_" + Array.from(bytes, function (n) { return n.toString(16).padStart(2, "0"); }).join("");
  }
  function mockPairSnapshot(record) {
    const source = record && record.snapshot ? clone(record.snapshot) : null;
    const data = source ? Object.assign(clone(SEED), source) : clone(SEED);
    if (source && Array.isArray(source.works)) data.collections = source.works.map(function (work) {
      return { id: work.workId, workId: work.workId, type: work.kind === "song" ? "song" : "photo", who: work.kind === "song" ? "shi" : "chen", title: work.title || "收藏的作品", note: work.createdAt ? new Date(work.createdAt).toLocaleDateString("zh-TW") : "收藏" };
    });
    if (source && source.chats && typeof source.chats === "object") {
      data.chats = {};
      Object.keys(source.chats).forEach(function (who) {
        data.chats[who] = (Array.isArray(source.chats[who]) ? source.chats[who] : []).map(function (item) {
          return { from: item.r === "u" ? "me" : (item.s || who), text: item.c || "", at: item.t ? new Date(item.t).toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }) : "" };
        });
      });
    }
    if (source && source.progress && Array.isArray(source.progress.days) && !source.todos) data.todos = source.progress.days.filter(function (item) { return item.task && item.task !== "待安排"; }).map(function (item) { return { title: item.task, done: item.status === "done", fixed: true, day: item.day }; });
    if (source && source.day) data.trialDaysLeft = source.day <= 30 ? Math.max(0, 31 - source.day) : null;
    data.pairedAt = new Date().toISOString();
    data.quota = data.quota || { date: "", limit: 20, used: 0 };
    resetQuotaIfNeeded(data);
    return data;
  }
  async function mockPair(code) {
    const normalized = String(code || "").toUpperCase().replace(/[\s\-‐－]/g, "");
    if (!validCode(normalized)) throw new Error("請輸入 8 碼英數配對碼。");
    const used = JSON.parse(localStorage.getItem(USED_SLOT) || "[]");
    if (used.includes(normalized)) throw new Error("這組配對碼已用過，請回到遊戲產生新碼。");
    const pairing = readPairing();
    let record = pairing && pairing.code === normalized ? pairing : null;
    if (record && (record.used || Number(record.expiresAt) <= Date.now())) throw new Error(record.used ? "這組配對碼已經用過，請回到遊戲產生新碼。" : "這組配對碼過期了，請回到遊戲重新產生。 ");
    const key = makeKey();
    used.push(normalized); localStorage.setItem(USED_SLOT, JSON.stringify(used));
    if (record) {
      record.used = true;
      record.devices = Array.isArray(record.devices) ? record.devices : [];
      record.devices.push({ deviceId: "mock-device-" + Date.now(), label: "手機 " + (record.devices.length + 1), key: key, pairedAt: Date.now() });
      savePairing(record);
    }
    localStorage.setItem(KEY_SLOT, key);
    writeData(mockPairSnapshot(record));
    return { key: key, deviceId: record && record.devices.length ? record.devices[record.devices.length - 1].deviceId : "mock-device-local" };
  }
  async function mockFetch(key) {
    if (!validMockKey(key)) throw new Error("這支手機尚未配對，或配對已解除。");
    const data = readData(); resetQuotaIfNeeded(data); writeData(data); return clone(data);
  }
  async function mockUnpair(key) {
    if (!validMockKey(key)) throw new Error("這支手機的配對已經失效。");
    const pairing = readPairing();
    if (pairing && Array.isArray(pairing.devices)) {
      pairing.devices = pairing.devices.filter(function (device) { return device.key !== key; });
      savePairing(pairing);
    }
    localStorage.removeItem(KEY_SLOT); localStorage.removeItem(DATA_SLOT);
    return { ok: true };
  }
  async function mockChat(key, who, text) {
    if (!validMockKey(key)) throw new Error("配對已失效，請重新配對。");
    if (!CHARACTERS.includes(who)) throw new Error("找不到這位聊天對象。");
    const message = String(text || "").trim().slice(0, 500);
    if (!message) throw new Error("先寫一句話再送出。");
    const data = readData(); resetQuotaIfNeeded(data);
    if (data.quota.used >= data.quota.limit) throw new Error("今天的聊天額度已用完，明天再聊。");
    data.chats[who] = data.chats[who] || [];
    data.chats[who].push({ from: "me", text: message, at: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }) });
    data.quota.used += 1;
    const reply = replies[who][(data.quota.used - 1) % replies[who].length];
    data.chats[who].push({ from: who, text: reply, at: new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false }) });
    resetQuotaIfNeeded(data); writeData(data);
    return { reply: reply, quotaRemaining: data.quota.remaining };
  }

  async function workerRequest(path, options) {
    if (!config.base) throw new Error("請先在配對入口設定 Worker 網址。");
    let response;
    try { response = await fetch(config.base + path, options || {}); }
    catch (_) { throw new Error("連不上作品伺服器，請檢查 Worker 網址與網路。"); }
    const type = response.headers.get("content-type") || "";
    if (!response.ok) {
      const info = type.includes("json") ? await response.json().catch(function () { return {}; }) : {};
      const error = new Error(info.message || info.error || "作品伺服器回應錯誤（" + response.status + "）");
      error.code = info.code || ""; error.status = response.status; throw error;
    }
    return type.includes("json") ? response.json() : response.blob();
  }
  function jsonOptions(method, body, key) {
    const headers = { "content-type": "application/json" };
    if (key) headers.authorization = "Bearer " + key;
    return { method: method, headers: headers, body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store" };
  }
  async function hydrateWorks(data, key) {
    activeObjectUrls.splice(0).forEach(function (url) { URL.revokeObjectURL(url); });
    const items = Array.isArray(data.collections) ? data.collections : [];
    for (const item of items) {
      if (!item || !item.workId) continue;
      try {
        const blob = await workerRequest("/phone/work?id=" + encodeURIComponent(item.workId), { method: "GET", headers: { authorization: "Bearer " + key }, cache: "no-store" });
        const url = URL.createObjectURL(blob); activeObjectUrls.push(url);
        if (item.type === "song") item.audioUrl = url; else item.imageUrl = url;
      } catch (_) { /* 作品超過保留期時保留標題列，畫面仍可用。 */ }
    }
    return data;
  }
  const formal = {
    async pair(code) {
      const result = await workerRequest("/pair/claim", jsonOptions("POST", { code }));
      return { key: result.deviceKey, deviceId: result.deviceId, pairedAt: Date.now() };
    },
    async fetch(key, { hydrate = true } = {}) {
      const result = await workerRequest("/phone/data", { method: "GET", headers: { authorization: "Bearer " + key }, cache: "no-store" });
      const data = { updatedAt: result.updatedAt, ...(result.data || result) };
      return hydrate ? hydrateWorks(data, key) : data;
    },
    async unpair(key) {
      const result = await workerRequest("/phone/unpair", jsonOptions("POST", {}, key));
      return { ok: result.ok === true };
    },
    async chat(key, who, text) {
      return workerRequest("/phone/chat", jsonOptions("POST", { who, text }, key));
    }
  };
  const mock = { pair: mockPair, fetch: mockFetch, unpair: mockUnpair, chat: mockChat };
  async function activity(kind, key, body) {
    if (config.mode === "mock") {
      if (kind === "focus") return { ok: true, stored: body.sessions.length };
      if (kind === "coloring") return { ok: true, workId: "mock-" + body.id, title: body.title };
      return { ok: true };
    }
    if (!key) throw new Error("請先配對這支手機。");
    const options = jsonOptions("POST", body, key);
    options.signal = AbortSignal.timeout(12_000);
    return workerRequest("/phone/" + kind, options);
  }
  function api() { return config.mode === "worker" ? formal : mock; }
  function setConfig(value) {
    const mode = value && value.mode === "worker" ? "worker" : "mock";
    const base = String(value && value.base || "").trim().replace(/\/+$/, "");
    if (base) {
      let parsed;
      try { parsed = new URL(base); } catch (_) { throw new Error("Worker 網址格式不正確。"); }
      const local = /^(localhost|127\.0\.0\.1)$/.test(parsed.hostname);
      if ((parsed.protocol !== "https:" && !(local && parsed.protocol === "http:")) || parsed.username || parsed.password) throw new Error("請使用 HTTPS Worker 網址；本機測試可用 localhost 或 127.0.0.1。");
      if (parsed.pathname !== "/" || parsed.search || parsed.hash) throw new Error("Worker 網址只填主機，不要加路徑或查詢參數。");
    }
    config = { mode: mode, base: base };
    localStorage.setItem(CONFIG_SLOT, JSON.stringify(config));
    return clone(config);
  }

  window.PhoneAPI = Object.freeze({
    get mode() { return config.mode; },
    get base() { return config.base; },
    getConfig: function () { return clone(config); },
    configure: setConfig,
    pair: function (code) {
      return api().pair(code).then(function (result) {
        /* QR 的帶碼入口只負責這次選模式；配對後保存，重新開啟仍會使用 Worker。 */
        if (config.mode === "worker") localStorage.setItem(CONFIG_SLOT, JSON.stringify(config));
        return result;
      });
    },
    fetch: function (key, options) { return api().fetch(key, options); },
    demo: function () { return clone(SEED); },
    unpair: function (key) { return api().unpair(key); },
    chat: function (key, who, text) { return api().chat(key, who, text); },
    focus: function (key, body) { return activity("focus", key, body); },
    puzzle: function (key, body) { return activity("puzzle", key, body); },
    coloring: function (key, body) { return activity("coloring", key, body); }
  });
})();
