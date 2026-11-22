(function () {
  "use strict";

  const app = document.getElementById("app");
  const toastNode = document.getElementById("toast");
  const KEY_SLOT = "nyhm-phone-key-v1";
  const READ_SLOT = "nyhm-phone-read-v1";
  const PEOPLE = {
    chen: { name: "晨", app: "畫圖", role: "畫圖的人形介面", color: "#91ad57", soft: "#edf3df", portrait: "./assets/portraits/chen.webp", icon: "./assets/appicons/chen_draw.png", device: "延伸到平板", reply: "嗯。" },
    ming: { name: "明", app: "寫程式", role: "寫程式的人形介面", color: "#49628d", soft: "#e8edf6", portrait: "./assets/portraits/ming.webp", icon: "./assets/appicons/ming_os_logo.svg", device: "延伸到筆電", reply: "嗯。" },
    shi: { name: "詩", app: "做音樂", role: "做音樂的人形介面", color: "#a05a70", soft: "#f6e9ed", portrait: "./assets/portraits/shi.webp", icon: "./assets/appicons/shi_music.png", device: "在這支手機", reply: "喔～" }
  };
  const UTILITIES = [
    { id: "album", name: "相簿", icon: "image", tone: "green" },
    { id: "music", name: "音樂", icon: "music", tone: "wine" },
    { id: "calendar", name: "行事曆", icon: "calendar-days", tone: "pink" },
    { id: "health", name: "好感", icon: "heart", tone: "rose" },
    { id: "chats", name: "訊息", icon: "message-circle", tone: "blue" },
    { id: "settings", name: "設定", icon: "settings", tone: "lav" }
  ];
  const DAY_EVENTS = {
    1: [["第一次進工作室", "三個人在等妳"]],
    8: [["色之國預演", "一起試上色小遊戲"]],
    12: [["詩交主題曲", "被退件後再改一版"]],
    14: [["音之國預演", "詩的新歌"]],
    15: [["寫時之國的齒輪小遊戲", "明在書桌前"]],
    16: [["晨畫的工作室", "收進相簿"]],
    17: [["試用期第 17 天", "還剩 14 天"], ["寫時之國的齒輪關卡", "20:00"]],
    23: [["截止日", "明圈起來的那天"]],
    30: [["比賽結果公布", "試用期最後一天"]]
  };
  const SONGS = [
    { title: "主題曲（退件版）", author: "詩", note: "劇情歌曲" },
    { title: "主題曲（改好版）", author: "詩", note: "劇情歌曲" },
    { title: "主題曲（貝殼版）", author: "詩", note: "劇情歌曲" },
    { title: "詩的歌（手機悶聲版）", author: "詩", note: "手機版本" },
    { title: "詩的歌（耳機完整版）", author: "詩", note: "耳機完整版" },
    { title: "明天一定寫", author: "詩", note: "劇情歌曲" },
    { title: "合唱團", author: "合唱團", note: "第三章音樂廳" }
  ];
  const state = {
    key: "",
    data: null,
    view: "home",
    chatWho: "chen",
    filter: "全部",
    selectedDay: 17,
    selectedSong: 0,
    playing: false,
    progress: 12,
    game: [0, 0, 1],
    gameWon: false,
    modalPhoto: null,
    busy: false,
    error: "",
    pendingCode: "",
    read: loadReadState(),
    installPrompt: null
  };

  function loadReadState() {
    try { return JSON.parse(localStorage.getItem(READ_SLOT) || "{}"); } catch (_) { return {}; }
  }
  function escapeHTML(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function icon(name) { return "./assets/icons/" + name + ".svg"; }
  function appIcon(name, alt) { return '<img src="' + icon(name) + '" alt="' + escapeHTML(alt || "") + '">'; }
  function personIcon(who, dot) {
    const p = PEOPLE[who];
    return '<span class="person-icon tool-app-icon ' + who + '" data-person-app-icon="' + who + '"><img src="' + p.icon + '" alt=""><span class="new-dot" ' + (dot ? "" : "hidden") + '></span></span>';
  }
  function timeNow() {
    return new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", hour12: false });
  }
  function trialDay() { return Math.max(1, Math.min(30, Number(state.data && state.data.day) || 17)); }
  function daysLeft() { return Math.max(0, Number(state.data && state.data.trialDaysLeft) || (31 - trialDay())); }
  function header(title, subtitle, showClock) {
    return '<header class="topbar"><div class="nav-top"><button class="back-button" data-back aria-label="回到主畫面">' +
      appIcon("chevron-left", "") + '</button><div class="page-heading"><h1>' + escapeHTML(title) +
      '</h1>' + (subtitle ? '<p>' + escapeHTML(subtitle) + '</p>' : "") + '</div>' +
      (showClock ? '<time class="clock" data-clock>' + timeNow() + '</time>' : "") + '</div></header>';
  }
  function dock() {
    const buttons = [
      ["chats", "訊息", "message-circle"], ["album", "相簿", "image"], ["music", "音樂", "music"], ["settings", "設定", "settings"]
    ];
    return '<nav class="dock" aria-label="常用 App">' + buttons.map(function (item) {
      return '<button data-open="' + item[0] + '" aria-label="' + item[1] + '">' + appIcon(item[2], "") + '<span>' + item[1] + '</span></button>';
    }).join("") + '</nav>';
  }
  function shell(title, subtitle, content, isHome) {
    return '<div class="app-shell">' +
      (isHome ? '<header class="topbar"><div class="home-top"><h1 class="brand">夜後明月</h1><time class="clock" data-clock>' + timeNow() + '</time></div><div class="dayline"><span class="day-pill">第 ' + trialDay() + ' 天</span><span>試用期剩 ' + daysLeft() + ' 天</span></div></header>' : header(title, subtitle, true)) +
      '<section class="content ' + (isHome ? "home-content" : "") + '" data-scroll>' + content + '</section>' +
      (state.view === "thread" ? "" : dock()) + '</div>';
  }
  function pairScreen() {
    const queryCode = state.pendingCode || new URLSearchParams(location.search).get("c") || "";
    const message = state.busy ? "正在驗證配對碼⋯" : state.error;
    return '<section class="pair-screen"><div class="pair-topline"><span>《夜後明月》</span><time class="clock" data-clock>' + timeNow() + '</time></div>' +
      '<div class="pair-art"><img src="./assets/phone.png" alt=""></div><h1 class="pair-title">把手機帶在身邊</h1>' +
      '<p class="pair-subtitle">用遊戲裡的手機掃配對碼<br>也可以手動輸入 8 碼配對碼。</p>' +
      '<form class="pair-card" data-pair-form><label for="pair-code">遊戲裡顯示的配對碼</label>' +
      '<input class="code-input" id="pair-code" name="code" type="text" inputmode="text" autocomplete="one-time-code" autocapitalize="characters" maxlength="8" placeholder="ABCD2345" value="' + escapeHTML(queryCode.toUpperCase()) + '" aria-label="8 碼配對碼">' +
      '<button class="primary-button" type="submit" ' + (state.busy ? "disabled" : "") + '>' + (state.busy ? "正在配對…" : "配對這支手機") + '</button>' +
      '<p class="pair-error" data-pair-error>' + escapeHTML(message) + '</p></form>' +
      '<p class="pair-footer">配對成功後，可以查看收藏、聊天紀錄與好感。<br><b>不需要 email，也不會要求個人資料。</b></p>' + apiConfigPanel() +
      '<p class="pair-bottom">' + (window.PhoneAPI.mode === "mock" ? "本機假資料模式" : "作品伺服器連線模式") + '</p></section>';
  }
  function apiConfigPanel() {
    const config = window.PhoneAPI.getConfig();
    return '<details class="api-config" data-api-config><summary>連線設定</summary><label>模式<select data-api-mode><option value="mock" ' + (config.mode === "mock" ? "selected" : "") + '>本機假資料（預設）</option><option value="worker" ' + (config.mode === "worker" ? "selected" : "") + '>作品 Worker</option></select></label>' +
      '<label>Worker 網址<input data-api-base type="url" inputmode="url" value="' + escapeHTML(config.base) + '" placeholder="https://你的-worker.workers.dev" autocomplete="url"></label>' +
      '<button class="secondary-button" type="button" data-api-save>儲存連線設定</button><small>正式連線只把鑰匙放在 Authorization 標頭；請確認網址是作品自己的 HTTPS Worker。</small></details>';
  }
  function trialCard() {
    const day = trialDay();
    const ticks = Array.from({ length: 30 }, function (_, index) {
      const n = index + 1;
      return '<i class="' + (n < day ? "past " : "") + (n === day ? "today" : "") + '"></i>';
    }).join("");
    return '<button class="trial-card" data-open="calendar" aria-label="打開試用期行事曆"><div class="trial-top"><span><small>試用期</small><strong>第 ' + day + ' 天</strong></span><span class="trial-count"><b>' + daysLeft() + '</b><span>天後結束</span></span></div><span class="trial-track">' + ticks + '</span><span class="trial-caption"><span>第 1 天</span><span>第 23 天・截止</span><span>第 30 天・公布</span></span></button>';
  }
  function home() {
    const day = trialDay();
    const people = Object.keys(PEOPLE).map(function (who) {
      const p = PEOPLE[who];
      const isNew = Boolean(state.data.newContent && state.data.newContent[who] && !state.read[who]);
      return '<button class="person-card" data-open="' + who + '">' + personIcon(who, isNew) +
        '<span class="person-copy"><strong>' + p.name + '的 App</strong><small>' + p.app + '・' +
        (who === "chen" ? "新畫已收到" : who === "ming" ? "進度與小遊戲" : "歌單有更新") + '</small></span>' +
        '<span class="person-trial">第 ' + day + ' 天</span><span class="chevron">›</span></button>';
    }).join("");
    const tiles = UTILITIES.map(function (item) {
      const unread = item.id === "chats" && Object.keys(PEOPLE).some(function (who) { return state.data.newContent && state.data.newContent[who] && !state.read[who]; });
      return '<button class="app-tile" data-open="' + item.id + '" aria-label="' + item.name + '">' +
        '<span class="tile-icon ' + item.tone + '">' + appIcon(item.icon, "") + (unread ? '<i class="tile-dot"></i>' : "") + '</span>' +
        '<span class="tile-label">' + item.name + '</span></button>';
    }).join("");
    const content = '<p class="welcome-copy">今晚也在工作室見面。這裡的內容會跟著故事往前走。</p>' +
      trialCard() + '<div class="section-heading"><h2>三人的 App</h2><small>有新內容時會亮起小點</small></div>' +
      '<div class="people-list">' + people + '</div><div class="section-heading"><h2>手機 App</h2><small>收藏與日常</small></div>' +
      '<div class="app-grid">' + tiles + '</div>' +
      '<button class="soft-link" data-open="favs"><span><span class="tile-icon orange" style="width:36px;height:36px;border-radius:12px">' + appIcon("list-checks", "") + '</span><span>收藏</span></span><span class="chevron">›</span></button>' +
      '<p class="content-note">' + (window.PhoneAPI.mode === "mock" ? "以上是本機示意資料。" : "天數、好感與收藏會從遊戲存檔同步。") + '聊天與遊戲共用每日額度；真實手機聊天不會打斷劇情。</p>';
    return shell("", "", content, true);
  }
  function section(title, right) {
    return '<div class="section-heading"><h2>' + escapeHTML(title) + '</h2>' + (right ? '<small>' + escapeHTML(right) + '</small>' : "") + '</div>';
  }
  function personHero(who) {
    const p = PEOPLE[who];
    return '<div class="tool-hero" style="--tone:' + p.color + ';--tone-soft:' + p.soft + '">' +
      personIcon(who, false) + '<span class="tool-hero-copy"><strong>' + p.name + '・' + p.app + '</strong><small>' + p.role + '</small></span><span class="chevron">›</span></div>';
  }
  function humanInterface(who) {
    const p = PEOPLE[who];
    const renewed = Boolean(state.data.subscriptions && state.data.subscriptions[who]);
    return '<div class="panel"><div class="panel-title"><h2>人形介面</h2><span class="badge">' + (trialDay() > 0 ? "試用中" : "已到期") + '</span></div>' +
      '<div class="human-window" style="--tone:' + p.color + '"><img src="' + p.portrait + '" alt="' + p.name + '"><strong>' + p.name + '</strong><small>第 ' + trialDay() + ' 天・試用期剩 ' + daysLeft() + ' 天</small></div>' +
      '<div class="tool-facts"><div class="fact"><small>所在裝置</small><strong>' + p.device + '</strong></div><div class="fact"><small>續訂狀態</small><strong>' + (renewed ? "已續訂一年" : "還沒續訂") + '</strong></div></div>' +
      '<p class="content-note" style="margin:11px 2px 0">續訂一位一年 30,000 元。這裡只展示故事狀態。</p></div>';
  }
  function chenApp() {
    const items = state.data.collections.filter(function (x) { return x.who === "chen" && x.type === "photo"; });
    const rows = items.map(function (item) {
      return '<button class="content-row" data-photo="' + escapeHTML(item.id) + '" style="width:100%;border:0;border-top:1px solid var(--line);text-align:left;background:transparent;cursor:pointer"><span class="row-mark" style="--tone:#698643;--tone-bg:#edf3df">畫</span><span class="row-copy"><strong>' + escapeHTML(item.title) + '</strong><small>' + escapeHTML(item.note) + '・點開看收藏</small></span><span class="chevron">›</span></button>';
    }).join("");
    const content = personHero("chen") + humanInterface("chen") + '<div class="panel"><div class="panel-title"><h2>晨的畫</h2><small>' + items.length + ' 張收藏</small></div>' + rows + '</div>';
    return shell("晨的 App", "畫圖", content, false);
  }
  function mingApp() {
    const todos = state.data.todos || [];
    const todoRows = todos.map(function (todo, index) {
      return '<div class="todo-row ' + (todo.done ? "done" : "") + '"><input type="checkbox" data-todo="' + index + '" id="todo-' + index + '" ' + (todo.done ? "checked" : "") + '><label for="todo-' + index + '">' + escapeHTML(todo.title) + '</label>' + (todo.fixed ? '<small class="subtle">明排</small>' : '<small class="subtle">自己加</small>') + '</div>';
    }).join("");
    const gearNames = ["大齒輪", "中齒輪", "小齒輪"];
    const game = '<div class="panel"><div class="panel-title"><h2>明的小遊戲</h2><small>時之國齒輪</small></div><p class="body-copy">把三枚齒輪轉到「月」的位置。按一下就轉一格。</p><div class="gear-grid">' +
      state.game.map(function (position, index) {
        return '<button class="gear-button ' + (state.gameWon ? "solved" : "") + '" data-gear="' + index + '" aria-label="轉動' + gearNames[index] + '"><span class="gear-wheel">' + ["日", "月", "星"][position] + '</span><small>' + gearNames[index] + '</small></button>';
      }).join("") + '</div><p class="game-status" data-game-status>' + (state.gameWon ? "門開了。鐘又開始走了。" : "轉動齒輪，找到相同的月亮。") + '</p></div>';
    const content = personHero("ming") + humanInterface("ming") +
      '<div class="panel"><div class="panel-title"><h2>進度表</h2><small>明排的項目不能刪</small></div>' + todoRows + '</div>' + game +
      '<div class="panel"><div class="panel-title"><h2>今天的時光記錄</h2><small>第 ' + trialDay() + ' 天</small></div>' +
      '<div class="content-row"><span class="row-mark" style="--tone:#49628d;--tone-bg:#e8edf6">◷</span><span class="row-copy"><strong>和三人聊了 ' + Math.max(0, 2 + Number(state.data.quota.used || 0)) + ' 句</strong><small>一起把齒輪關卡往前推了一點</small></span></div></div>';
    return shell("明的 App", "寫程式・進度與時光記錄", content, false);
  }
  function shiApp() {
    const rows = SONGS.map(function (song, index) {
      if (song.author !== "詩") return "";
      return '<button class="content-row" data-song="' + index + '" style="width:100%;border:0;border-top:1px solid var(--line);text-align:left;background:transparent;cursor:pointer"><span class="row-mark" style="--tone:#9a536a;--tone-bg:#f6e9ed">音</span><span class="row-copy"><strong>' + song.title + '</strong><small>詩・' + song.note + '</small></span><span class="chevron">›</span></button>';
    }).join("");
    const content = personHero("shi") + humanInterface("shi") +
      '<div class="panel"><div class="panel-title"><h2>詩做的歌</h2><small>點歌開始播放</small></div>' + rows +
      '<button class="secondary-button" data-open="music">打開完整歌單</button></div>';
    return shell("詩的 App", "做音樂", content, false);
  }
  function photos() {
    const photos = state.data.collections.filter(function (x) { return x.type === "photo"; });
    const filtered = photos.filter(function (x) {
      if (state.filter === "全部") return true;
      return x.who === state.filter;
    });
    const chips = [["全部", "全部"], ["chen", "晨的畫"], ["ming", "明傳的圖"], ["shi", "詩傳的圖"]];
    const chipHTML = chips.map(function (pair) {
      return '<button class="filter-chip ' + (state.filter === pair[0] ? "active" : "") + '" data-filter="' + pair[0] + '">' + pair[1] + '</button>';
    }).join("");
    const cards = filtered.map(function (photo) {
      const p = PEOPLE[photo.who] || PEOPLE.chen;
      return '<button class="photo-card" data-photo="' + escapeHTML(photo.id) + '" aria-label="打開' + escapeHTML(photo.title) + '"><span class="photo-art"><img src="' + escapeHTML(photo.imageUrl || p.portrait) + '" alt=""></span><span class="photo-caption"><strong>' + escapeHTML(photo.title) + '</strong><small>' + escapeHTML(photo.note) + '</small></span></button>';
    }).join("");
    const content = '<div class="filter-row">' + chipHTML + '</div><div class="photo-grid">' + (cards || '<p class="body-copy">這個分類目前沒有收藏。</p>') + '</div>' +
      '<p class="content-note">' + (window.PhoneAPI.mode === "mock" ? "相簿是本機示意資料。" : "已同步的收藏作品會從作品伺服器載入；過期或找不到的檔案仍會保留標題。") + '</p>';
    return shell("相簿", photos.length + " 張收藏", content, false);
  }
  function music() {
    const song = SONGS[state.selectedSong] || SONGS[0];
    const content = '<div class="player-card"><div class="player-main"><img src="./assets/appicons/shi_music.png" alt=""><span><strong>' + song.title + '</strong><small>' + song.author + '・曲目資料</small></span></div>' +
      '<div class="progress"><i style="width:' + state.progress + '%"></i></div><div class="player-time"><span>示意進度</span><span>—:—</span></div>' +
      '<div class="player-controls"><button data-song-step="-1" aria-label="上一首">‹</button><button class="play" data-play aria-label="' + (state.playing ? "暫停" : "播放") + '">' + (state.playing ? "Ⅱ" : "▶") + '</button><button data-song-step="1" aria-label="下一首">›</button></div></div>' +
      '<div class="panel"><div class="panel-title"><h2>接下來播放</h2><small>' + SONGS.length + ' 首</small></div><div class="song-list">' +
      SONGS.map(function (item, index) {
        return '<button class="song-row" data-song="' + index + '"><span class="song-cover">' + appIcon("music", "") + '</span><span class="song-meta"><strong>' + item.title + '</strong><small>' + item.author + '・' + item.note + '</small></span><span class="song-length">—:—</span></button>';
      }).join("") + '</div>' + (state.data.collections || []).filter(function (item) { return item.type === "song" && item.audioUrl; }).map(function (item) {
        return '<div class="song-row real-song"><span class="song-cover">' + appIcon("music", "") + '</span><span class="song-meta"><strong>' + escapeHTML(item.title) + '</strong><small>收藏的歌曲</small><audio controls preload="none" src="' + escapeHTML(item.audioUrl) + '"></audio></span></div>';
      }).join("") + '</div></div><p class="content-note">曲目名稱依劇情與配樂表；已同步到的作品會從作品伺服器載入。</p>';
    return shell("音樂", "劇情歌曲與詩做的歌", content, false);
  }
  function calendar() {
    const day = trialDay();
    const buttons = "";
    let days = "";
    for (let n = 1; n <= 30; n += 1) {
      const classes = [(n === day ? "today" : ""), (n === state.selectedDay ? "selected" : ""), (n === 23 ? "deadline" : ""), (n === 30 ? "announcement" : "")].filter(Boolean).join(" ");
      days += '<button class="' + classes + '" data-day="' + n + '" aria-label="第 ' + n + ' 天・試用期剩 ' + (31 - n) + ' 天"><span>' + n + '</span></button>';
    }
    const events = DAY_EVENTS[state.selectedDay] || [];
    const eventHTML = events.length ? events.map(function (event) {
      return '<div class="event-row"><i class="event-dot"></i><span><strong>' + escapeHTML(event[0]) + '</strong><small>' + escapeHTML(event[1]) + '</small></span></div>';
    }).join("") : '<p class="body-copy">這天沒有排定的行程。</p>';
    const dayLabel = "第 " + state.selectedDay + " 天・試用期剩 " + (31 - state.selectedDay) + " 天" + (state.selectedDay === day ? "・今天" : "");
    const content = '<div class="calendar-head"><strong>試用期</strong><span>30 天</span></div><div class="calendar-grid">' + buttons + days + '</div>' +
      '<div class="panel selected-day"><div class="panel-title"><h2>' + dayLabel + '</h2></div>' + eventHTML + '</div>' +
      '<p class="content-note">第 23 天是截止日，第 30 天公布結果。介面不顯示月份。</p>';
    return shell("行事曆", "試用期 30 天", content, false);
  }
  function affection() {
    const rows = ["chen", "ming", "shi"].map(function (who) {
      const p = PEOPLE[who];
      const value = Math.max(0, Number(state.data.affection[who]) || 0);
      const percent = Math.min(100, value <= 12 ? value / 12 * 100 : value);
      return '<div class="heart-row"><img src="' + p.portrait + '" alt=""><span class="heart-info"><strong>' + p.name + '</strong><span class="heart-meter"><i style="width:' + percent + '%;--heart-tone:' + p.color + '"></i></span></span><span class="heart-value">' + (value <= 12 ? value + ' / 12' : value) + '</span></div>';
    }).join("");
    return shell("好感", "三人的好感狀態", '<div class="heart-list">' + rows + '</div><p class="content-note">好感跟著劇情與存檔變數更新；即時聊天不會增加好感。</p>', false);
  }
  function chatList() {
    const cards = ["chen", "ming", "shi"].map(function (who) {
      const p = PEOPLE[who];
      const messages = state.data.chats[who] || [];
      const latest = messages[messages.length - 1];
      const isNew = Boolean(state.data.newContent && state.data.newContent[who] && !state.read[who]);
      return '<button class="chat-person" data-chat-who="' + who + '"><span class="person-icon avatar ' + who + '" data-chat-avatar="' + who + '"><img src="' + p.portrait + '" alt=""><span class="new-dot" ' + (isNew ? "" : "hidden") + '></span></span><span class="chat-person-copy"><strong>' + p.name + '</strong><small>' + escapeHTML(latest ? latest.text : "還沒有聊天紀錄") + '</small></span>' + (isNew ? '<span class="quota-pill">新訊息</span>' : '<span class="chevron">›</span>') + '</button>';
    }).join("");
    const remaining = Math.max(0, Number(state.data.quota.limit) - Number(state.data.quota.used));
    return shell("訊息", "跟三人聊天", '<div class="panel"><div class="panel-title"><h2>聊天室</h2><span class="badge">今天還能傳 ' + remaining + ' 則</span></div><div class="chat-people">' + cards + '</div></div><p class="content-note">跟遊戲共用每日額度。真實手機聊天不會打斷劇情。</p>', false);
  }
  function chatThread() {
    const who = state.chatWho;
    const p = PEOPLE[who];
    const messages = state.data.chats[who] || [];
    const bubbles = messages.map(function (message) {
      const mine = message.from === "me";
      return '<div class="chat-message ' + (mine ? "me" : "") + '">' + (!mine ? '<img data-chat-thread-avatar="' + who + '" src="' + p.portrait + '" alt="">' : "") +
        '<span class="bubble">' + escapeHTML(message.text) + '</span><time>' + escapeHTML(message.at || "") + '</time></div>';
    }).join("");
    const remaining = Math.max(0, Number(state.data.quota.limit) - Number(state.data.quota.used));
    const content = '<div class="chat-thread" data-thread>' + bubbles + '</div><form class="chat-compose" data-chat-form>' +
      '<input name="message" maxlength="500" placeholder="傳訊息給' + p.name + '…" aria-label="聊天訊息" autocomplete="off">' +
      '<button class="send-button" type="submit" aria-label="送出訊息" ' + (remaining <= 0 ? "disabled" : "") + '>↑</button></form>';
    return shell(p.name, "今天還可以傳 " + remaining + " 則", content, false);
  }
  function settings() {
    const pairedAt = state.data.pairedAt ? new Date(state.data.pairedAt).toLocaleString("zh-TW", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : "本機假配對";
    const keyTail = state.key.slice(-6).toUpperCase();
    const content = '<div class="panel"><div class="panel-title"><h2>配對資訊</h2><span class="paired-label">已配對</span></div>' +
      '<div class="settings-row"><span class="settings-icon">' + appIcon("settings", "") + '</span><span class="settings-copy"><strong>這支手機</strong><small>配對於 ' + escapeHTML(pairedAt) + '</small></span></div>' +
      '<div class="settings-row"><span class="settings-icon">⌑</span><span class="settings-copy"><strong>手機鑰匙</strong><small>只保存在這支手機・末六碼 ' + escapeHTML(keyTail) + '</small></span></div></div>' +
      '<p class="server-note">' + (window.PhoneAPI.mode === "mock" ? "本機示意資料存在這台瀏覽器。" : "正式版只同步遊戲內容，不收 email 或個人資料。") + '解除配對只會解除這支手機，其他已配對手機不受影響。</p>' +
      '<div class="panel"><div class="panel-title"><h2>資料</h2><small>' + (window.PhoneAPI.mode === "mock" ? "本機示意" : "已連線") + '</small></div>' +
      '<div class="settings-row"><span class="settings-icon">' + appIcon("image", "") + '</span><span class="settings-copy"><strong>收藏與聊天紀錄</strong><small>包含收藏、聊天紀錄、好感與試用期進度</small></span></div>' +
      apiConfigPanel() +
      '<button class="primary-button install-button ' + (state.installPrompt ? "visible" : "") + '" data-install>安裝到主畫面</button></div>' +
      '<button class="danger-button" data-unpair>解除這支手機的配對</button><p class="content-note">解除後，這支手機的鑰匙會立即失效。需要時可以用遊戲裡的新配對碼重新配對。</p>';
    return shell("設定", "配對與資料", content, false);
  }
  function favorites() {
    const rows = state.data.collections.map(function (item) {
      const p = PEOPLE[item.who] || PEOPLE.chen;
      const label = item.type === "song" ? "歌" : "圖";
      const open = item.type === "song" ? "music" : "album";
      return '<button class="content-row" data-open="' + open + '" style="width:100%;border:0;border-top:1px solid var(--line);text-align:left;background:transparent;cursor:pointer"><span class="row-mark" style="--tone:' + p.color + ';--tone-bg:' + p.soft + '">' + label + '</span><span class="row-copy"><strong>' + escapeHTML(item.title) + '</strong><small>' + p.name + '・' + escapeHTML(item.note) + '</small></span><span class="chevron">›</span></button>';
    }).join("");
    return shell("收藏", "照片與歌曲", '<div class="panel">' + rows + '</div>', false);
  }
  function photoModal() {
    if (!state.modalPhoto) return "";
    const photo = state.data.collections.find(function (item) { return item.id === state.modalPhoto; });
    if (!photo) return "";
    const p = PEOPLE[photo.who] || PEOPLE.chen;
    return '<div class="modal-backdrop" data-close-modal><div class="photo-modal" role="dialog" aria-modal="true" aria-label="' + escapeHTML(photo.title) + '" data-modal-body>' +
      '<button class="modal-close" data-close-modal aria-label="關閉">×</button><img src="' + escapeHTML(photo.imageUrl || p.portrait) + '" alt=""><strong>' + escapeHTML(photo.title) + '</strong><small>' + p.name + '・' + escapeHTML(photo.note) + '</small></div></div>';
  }
  function currentPage() {
    switch (state.view) {
      case "home": return home();
      case "chen": return chenApp();
      case "ming": return mingApp();
      case "shi": return shiApp();
      case "album": return photos();
      case "music": return music();
      case "calendar": return calendar();
      case "health": return affection();
      case "chats": return chatList();
      case "thread": return chatThread();
      case "settings": return settings();
      case "favs": return favorites();
      default: state.view = "home"; return home();
    }
  }
  function render() {
    app.innerHTML = state.key && state.data ? currentPage() + photoModal() : pairScreen();
    bindDynamic();
    if (state.view === "thread") {
      const thread = document.querySelector("[data-thread]");
      if (thread) thread.scrollTop = thread.scrollHeight;
      const input = document.querySelector('[data-chat-form] input');
      if (input && state.focusChatInput) { input.focus(); state.focusChatInput = false; }
    }
  }
  let toastTimer = 0;
  function toast(message) {
    toastNode.textContent = message;
    toastNode.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastNode.classList.remove("show"); }, 2600);
  }
  function saveRead(who) {
    state.read[who] = true;
    localStorage.setItem(READ_SLOT, JSON.stringify(state.read));
  }
  function cleanPairCodeFromURL() {
    const url = new URL(location.href);
    url.searchParams.delete("c");
    history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + url.hash);
  }
  async function pair(code) {
    state.busy = true;
    state.error = "";
    render();
    try {
      const result = await window.PhoneAPI.pair(code);
      state.key = result.key;
      localStorage.setItem(KEY_SLOT, state.key);
      state.data = await window.PhoneAPI.fetch(state.key);
      state.busy = false;
      state.view = "home";
      state.pendingCode = "";
      cleanPairCodeFromURL();
      toast("配對完成。這支手機已連上作品資料。");
      render();
    } catch (error) {
      state.busy = false;
      state.error = error.message || "配對失敗，請確認配對碼後再試。";
      render();
    }
  }
  async function refreshData() {
    state.data = await window.PhoneAPI.fetch(state.key);
  }
  function bindDynamic() {
    const code = document.getElementById("pair-code");
    if (code) {
      code.addEventListener("input", function () {
        const value = code.value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase().replace(/[ILO01]/g, "").slice(0, 8);
        if (code.value !== value) code.value = value;
      });
    }
    const chatForm = document.querySelector("[data-chat-form]");
    if (chatForm) chatForm.addEventListener("submit", sendChat);
    const pairForm = document.querySelector("[data-pair-form]");
    if (pairForm) pairForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const input = pairForm.elements.code;
      pair(input.value);
    });
    const configSave = document.querySelector("[data-api-save]");
    if (configSave) configSave.addEventListener("click", function () {
      try {
        window.PhoneAPI.configure({ mode: document.querySelector("[data-api-mode]").value, base: document.querySelector("[data-api-base]").value });
        state.error = "連線設定已儲存。";
        render();
      } catch (error) { state.error = error.message; render(); }
    });
    document.querySelectorAll("[data-todo]").forEach(function (box) {
      box.addEventListener("change", function () {
        const todo = state.data.todos[Number(box.dataset.todo)];
        if (!todo) return;
        todo.done = box.checked;
        render();
        toast(todo.done ? "明：好，我記下來了。" : "已取消完成狀態。");
      });
    });
    document.querySelectorAll("[data-clock]").forEach(function (clock) { clock.textContent = timeNow(); });
  }
  async function sendChat(event) {
    event.preventDefault();
    if (state.busy) return;
    const form = event.currentTarget;
    const input = form.elements.message;
    const message = input.value.trim();
    if (!message) return;
    state.busy = true;
    const send = form.querySelector("button");
    send.disabled = true;
    try {
      await window.PhoneAPI.chat(state.key, state.chatWho, message);
      await refreshData();
      state.busy = false;
      state.focusChatInput = true;
      render();
    } catch (error) {
      state.busy = false;
      toast(error.message || "訊息沒有送出，請再試一次。");
      render();
    }
  }
  async function unpair() {
    if (!window.confirm("要解除這支手機的配對嗎？其他手機不會受影響。")) return;
    try {
      await window.PhoneAPI.unpair(state.key);
      localStorage.removeItem(KEY_SLOT);
      state.key = "";
      state.data = null;
      state.view = "home";
      state.error = "";
      state.read = {};
      localStorage.removeItem(READ_SLOT);
      render();
      toast("這支手機已解除配對。");
    } catch (error) {
      toast(error.message || "解除配對失敗。");
    }
  }
  function openPage(id) {
    state.view = id;
    state.modalPhoto = null;
    state.error = "";
    if (PEOPLE[id]) saveRead(id);
    if (id === "chats") {
      // 聊天清單仍保留各人的未讀點；進入各自聊天室時才清除該人的點。
    }
    render();
  }
  function bindClicks() {
    app.addEventListener("click", async function (event) {
      const target = event.target.closest("button, [data-close-modal]");
      if (!target) return;
      if (target.matches("[data-close-modal]")) {
        if (event.target.closest("[data-modal-body]") && !target.matches("button")) return;
        state.modalPhoto = null; render(); return;
      }
      if (target.hasAttribute("data-back")) { state.view = "home"; state.modalPhoto = null; render(); return; }
      if (target.dataset.open) {
        if (target.dataset.open === "music") state.playing = false;
        openPage(target.dataset.open); return;
      }
      if (target.dataset.chatWho) {
        state.chatWho = target.dataset.chatWho;
        state.view = "thread";
        saveRead(state.chatWho);
        render();
        return;
      }
      if (target.dataset.photo) { state.modalPhoto = target.dataset.photo; render(); return; }
      if (target.dataset.filter) { state.filter = target.dataset.filter; render(); return; }
      if (target.dataset.day) { state.selectedDay = Number(target.dataset.day); render(); return; }
      if (target.dataset.song) {
        state.selectedSong = Number(target.dataset.song); state.playing = true; state.progress = 0;
        if (state.view === "shi") state.view = "music";
        render(); toast("正在播放：" + SONGS[state.selectedSong].title); return;
      }
      if (target.dataset.songStep) {
        state.selectedSong = (state.selectedSong + Number(target.dataset.songStep) + SONGS.length) % SONGS.length;
        state.playing = true; state.progress = 0; render(); return;
      }
      if (target.hasAttribute("data-play")) { state.playing = !state.playing; render(); return; }
      if (target.dataset.gear != null) {
        if (state.gameWon) return;
        const index = Number(target.dataset.gear);
        state.game[index] = (state.game[index] + 1) % 3;
        state.gameWon = state.game[0] === 1 && state.game[1] === 1 && state.game[2] === 1;
        render();
        if (state.gameWon) toast("明：門開了。鐘又開始走了。");
        return;
      }
      if (target.hasAttribute("data-unpair")) { await unpair(); return; }
      if (target.hasAttribute("data-install") && state.installPrompt) {
        state.installPrompt.prompt();
        await state.installPrompt.userChoice;
        state.installPrompt = null;
        target.classList.remove("visible");
      }
    });
    app.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        if (state.modalPhoto) { state.modalPhoto = null; render(); }
        else if (state.view !== "home") { state.view = "home"; render(); }
      }
    });
  }
  function startClock() { setInterval(function () {
    document.querySelectorAll("[data-clock]").forEach(function (clock) { clock.textContent = timeNow(); });
  }, 15000); }
  function registerWorker() {
    if (!("serviceWorker" in navigator)) return;
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.addEventListener("controllerchange", function () {
      if (hadController && !window.__nyhmReloadedForUpdate) {
        window.__nyhmReloadedForUpdate = true;
        location.reload();
      }
    });
    navigator.serviceWorker.register("./sw.js").catch(function (error) {
      console.warn("Service worker registration failed", error);
    });
  }
  async function start() {
    bindClicks();
    window.addEventListener("beforeinstallprompt", function (event) {
      event.preventDefault();
      state.installPrompt = event;
      const button = document.querySelector("[data-install]");
      if (button) button.classList.add("visible");
    });
    window.addEventListener("appinstalled", function () { state.installPrompt = null; toast("已安裝到主畫面。"); });

    const query = new URLSearchParams(location.search);
    const queryCode = query.get("c");
    if (queryCode && (window.PhoneAPI.mode === "worker" || query.get("mock") === "1")) {
      state.busy = true;
      render();
      await pair(queryCode);
      registerWorker();
      startClock();
      return;
    }
    if (queryCode) state.pendingCode = queryCode;
    const key = localStorage.getItem(KEY_SLOT);
    if (key) {
      try {
        state.key = key;
        state.data = await window.PhoneAPI.fetch(key);
        const shortcut = query.get("app");
        if (shortcut && ["chen", "ming", "shi"].includes(shortcut)) {
          state.view = shortcut;
          saveRead(shortcut);
        }
      } catch (_) {
        localStorage.removeItem(KEY_SLOT);
        state.key = "";
        state.data = null;
      }
    }
    render();
    startClock();
    registerWorker();
  }
  start();
})();
