import { preparePanel } from './studio_panel.mjs';

const query = new URLSearchParams(location.search);
const embedded = query.get('embed') === '1' && window.parent !== window;
const realChat = document.documentElement.classList.contains('studio-real-chat');
if (embedded || realChat) {
  const mode = query.get('mode') || 'map';
  if (realChat) {
    document.getElementById('panel').setAttribute('aria-modal', 'false');
    const background = document.createElement('img');
    background.id = 'real-chat-bg';
    background.alt = '';
    const desk = '../../新版/canon_new/room/DESK-A_morning.jpg';
    if (query.get('bg')) {
      background.addEventListener('error', () => { background.src = desk; }, { once: true });
    }
    background.src = query.get('bg') || desk;
    document.body.prepend(background);
  }
  const targetIds = { '圓鐘': 10, '門': 11, '電子琴': 6, '畫架': 8, 'M 的螢幕': 12 };
  const investigation = mode === 'investigation' && query.has('investigation')
    ? JSON.parse(query.get('investigation')) : null;
  const target = query.get('target') || '';
  const locationText = query.get('location') || '';
  const titles = {
    map: '工作室地圖', free_time: '自由時間', open_chat: '開放聊天',
    investigation: '工作室調查', album_player: '詩的專輯播放器'
  };
  const descriptions = {
    map: locationText || '走動、查看工作室裡的互動物件。',
    free_time: '可以走動、和角色聊天，並使用目前已接上的工作室互動。',
    open_chat: '可選群聊或私聊，按「繼續」接回劇情。',
    investigation: target ? '調查目標：' + target : '查看指定的工作室物件。',
    album_player: query.get('album') || '打開詩的唱片架。'
  };
  const styles = document.createElement('style');
  styles.textContent = '.studio-embed-card{position:fixed;z-index:19;pointer-events:none;top:max(12px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);width:min(520px,calc(100vw - 24px));padding:9px 13px;border:1px solid rgba(255,250,242,.88);border-radius:13px;background:rgba(255,250,242,.94);box-shadow:0 4px 18px rgba(25,18,24,.22);color:#382c2b;font:14px/1.45 "Noto Sans TC","Noto Sans CJK TC",sans-serif}.studio-embed-card--plain{width:auto;padding:5px 16px;border-radius:999px}.studio-embed-card--plain .studio-embed-meta{margin:0;opacity:1;font-size:14px}.studio-embed-card[hidden]{display:none}.studio-embed-card strong{display:block;font-size:15px}.studio-embed-card p{margin:3px 0 0}.studio-embed-meta{opacity:.78;font-size:12px}.studio-embed-note{color:#805533}.studio-embed-continue{position:fixed;z-index:31;right:max(14px,env(safe-area-inset-right));bottom:max(14px,env(safe-area-inset-bottom));min-height:46px;padding:9px 21px;border:1px solid #76513f;border-radius:999px;background:#885d45;color:#fffaf2;font:700 16px/1.2 "Noto Sans TC","Noto Sans CJK TC",sans-serif;box-shadow:0 4px 16px rgba(25,18,24,.28);cursor:pointer}.studio-embed-continue:focus-visible{outline:3px solid #fff2a9;outline-offset:3px}.studio-embed-continue:disabled{opacity:.72;cursor:default}.studio-embed-continue--table{min-height:48px;padding:10px 24px;font-size:17px;background:#b0623c;border-color:#8a4a2c;box-shadow:0 0 0 3px rgba(255,242,169,.85),0 4px 16px rgba(25,18,24,.3)}@media(max-width:900px){.studio-embed-card{top:var(--hud-clear,124px)}}@media(max-width:600px){.studio-embed-card{padding:8px 11px;font-size:12px}.studio-embed-card strong{font-size:14px}.studio-embed-continue{right:max(10px,env(safe-area-inset-right));bottom:calc(max(12px,env(safe-area-inset-bottom)) + 48px);min-height:42px;padding:8px 17px;font-size:14px}.studio-embed-continue.studio-embed-continue--table{min-height:46px;padding:9px 18px;font-size:15px}}';
  document.head.appendChild(styles);
  if (investigation) {
    const storyStyles = document.createElement('style');
    storyStyles.textContent = `
      #panel[data-design="story-investigation"] {top:auto;bottom:26px;width:min(660px,calc(100vw - 32px));transform:translateX(-50%)}
      #panel[data-design="story-investigation"] #panel-title {font-size:1rem}
      #panel[data-design="story-investigation"] #panel-body {padding-bottom:4px}
      #panel[data-design="story-investigation"] .studio-embed-continue {position:static;align-self:flex-end;margin:4px 16px 12px;box-shadow:none}
      .studio-investigation-speaker {font-weight:700}
      .studio-investigation-line {margin:4px 0 10px;white-space:pre-wrap}
      body.studio-investigating #scrim {background:transparent}
      body.studio-investigating #scroll-controls, body.studio-investigating #scroll-hint {visibility:hidden}
      @media(max-width:720px) {
        #panel[data-design="story-investigation"] {left:0;right:0;bottom:0;width:100%;transform:none}
      }
    `;
    document.head.appendChild(storyStyles);
  }

  const card = document.createElement('section');
  card.className = 'studio-embed-card';
  card.setAttribute('aria-live', 'polite');
  const heading = document.createElement('strong');
  heading.textContent = query.get('title') || titles[mode] || '工作室';
  const description = document.createElement('p');
  description.textContent = descriptions[mode] || '查看工作室裡的互動。';
  const context = document.createElement('p');
  context.className = 'studio-embed-meta';
  // 標題、說明、章節座位好感這些是給製作者看的：網址帶 debug=1 才顯示。玩家平常最多看到「第 N 天」。
  const debug = query.get('debug') === '1';
  if (debug) card.append(heading, description, context);
  else { card.classList.add('studio-embed-card--plain'); card.append(context); }

  if (debug && !realChat && locationText && !locationText.includes('工作室')) {
    const note = document.createElement('p');
    note.className = 'studio-embed-note';
    note.textContent = '這段標記的是劇中場景；目前頁面仍顯示工作室，該場景地圖尚未接線。';
    card.appendChild(note);
  }
  document.body.appendChild(card);

  const continueButton = document.createElement('button');
  continueButton.className = 'studio-embed-continue';
  continueButton.type = 'button';
  continueButton.textContent = '繼續';
  continueButton.setAttribute('aria-label', realChat ? continueButton.textContent : '完成工作室互動並回到劇情');
  // 「走到長桌觸發本段」的地圖卡（作者 2026-11-21 選定）：捲軸版沒有畫長桌，原本只能自己按「繼續」；
  // 這類卡把右下角的鈕改成「直接到長桌」，按一下跟走到長桌一樣接回劇情（同樣寫回 completionWrites、送 larch:complete）。
  // 想逛的照樣走動；沒有「走到長桌」條件的自由逛卡、從長桌座位起頭的卡（start=seat）照舊是「繼續」。
  const tableTrigger = mode === 'map' && query.get('start') !== 'seat' && /走到長桌/.test(locationText);
  if (tableTrigger) {
    continueButton.textContent = '直接到長桌';
    continueButton.classList.add('studio-embed-continue--table');
    continueButton.dataset.trigger = 'table';
    continueButton.setAttribute('aria-label', '直接到長桌，接回劇情');
  }
  document.body.appendChild(continueButton);

  let completed = false;
  let opened = false;
  let stepIndex = 0;
  let lineIndex = 0;
  const completionWrites = (() => {
    try { return JSON.parse(query.get('completionWrites') || '{}'); }
    catch (_error) { return {}; }
  })();
  const variableNames = (query.get('affinityVariables') || 'affC,affM,affS').split(',');

  function updateContext(variables) {
    const values = variables || {};
    // 日期：先看 Larch 變數 day（要是正數），沒有才用網址的 day。
    const day = Number(values.day) > 0 ? values.day : query.get('day');
    if (!debug) {
      const known = day !== null && day !== '' && day !== undefined;
      context.textContent = known ? '第 ' + day + ' 天' : '';
      card.hidden = realChat || !known;
      return;
    }
    const chapter = query.get('chapter');
    const seat = values.seat || query.get('seat') || '';
    const affinity = variableNames.map(function (name) {
      return name.replace(/^aff/, '') + ' ' + (values[name] === undefined ? '0' : values[name]);
    }).join('・');
    const parts = [];
    if (day !== null && day !== '') parts.push('第 ' + day + ' 天');
    if (chapter) parts.push('第 ' + chapter + ' 章');
    if (seat) parts.push('座位 ' + seat);
    if (affinity) parts.push(affinity);
    if (values.trialKnown !== undefined) parts.push('試用期已知 ' + (values.trialKnown ? '是' : '否'));
    context.textContent = parts.join('・');
  }

  function showInvestigationLine() {
    const step = investigation[stepIndex];
    const line = step.lines[lineIndex];
    const panel = document.getElementById('panel');
    const panelBody = document.getElementById('panel-body');
    preparePanel('story-investigation', continueButton);
    if (lineIndex === 0) window.__studio.focusObject(targetIds[step.target]);
    panel.dataset.target = step.target;
    document.getElementById('panel-title').textContent = step.target;
    const speaker = document.createElement('div');
    speaker.className = 'studio-investigation-speaker';
    speaker.textContent = line.speaker === '旁白' ? '' : line.speaker;
    const text = document.createElement('p');
    text.className = 'studio-investigation-line';
    text.textContent = line.text;
    if (line.inner_voice) text.style.fontStyle = 'italic';
    panelBody.replaceChildren(speaker, text);
    panelBody.setAttribute('aria-live', 'polite');
    panelBody.setAttribute('aria-atomic', 'true');
    panel.appendChild(continueButton);
    panel.classList.add('on');
    panel.setAttribute('aria-hidden', 'false');
    const lastLine = lineIndex === step.lines.length - 1;
    continueButton.textContent = !lastLine ? '繼續'
      : stepIndex + 1 < investigation.length ? '查看' + investigation[stepIndex + 1].target : '前往長桌';
    continueButton.setAttribute('aria-label', continueButton.textContent);
    continueButton.focus({ preventScroll: true });
  }

  if (investigation) {
    document.getElementById('panel').addEventListener('studio:restore-investigation', showInvestigationLine);
  }

  function openRequestedInteraction() {
    if (opened || !window.STUDIO_FEATURES) return;
    let handled = false;
    if (investigation) {
      document.body.classList.add('studio-investigating');
      document.getElementById('scroll-mode').inert = true;
      document.getElementById('panel-close').hidden = true;
      document.getElementById('scrim').classList.add('on');
      showInvestigationLine();
      handled = true;
    }
    // 夥伴結局「最後一格「？」解鎖」：作者 2026-11-21 把劇情曲搬到唱片架（5），這張卡記下解鎖、開唱片架放最後一首
    else if (mode === 'album_player') handled = window.STUDIO_FEATURES.albumFinal ? window.STUDIO_FEATURES.albumFinal(continueButton) : window.STUDIO_FEATURES.handle(5, continueButton);
    // 小插曲一起「長桌她自己的位子」：進場就開長桌面板（作者 11-18 選 C，不畫長桌）。
    else if (mode === 'map' && query.get('start') === 'seat') handled = window.STUDIO_FEATURES.handle(13, continueButton);
    else if (mode === 'investigation') {
      const id = targetIds[target];
      if (id) handled = window.STUDIO_FEATURES.handle(id, continueButton);
    }
    if (handled) opened = true;
  }

  continueButton.addEventListener('click', function () {
    if (completed) return;
    if (investigation) {
      if (!opened) return;
      lineIndex++;
      if (lineIndex === investigation[stepIndex].lines.length) {
        stepIndex++;
        lineIndex = 0;
      }
      if (stepIndex < investigation.length) {
        showInvestigationLine();
        return;
      }
    }
    completed = true;
    continueButton.disabled = true;
    continueButton.textContent = tableTrigger ? '到長桌了' : '已返回劇情';
    Object.entries(completionWrites).forEach(function (entry) {
      window.parent.postMessage({ type: 'larch:set', name: entry[0], value: entry[1] }, '*');
    });
    window.parent.postMessage({ type: 'larch:complete', result: 'continue', payload: completionWrites }, '*');
  });

  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    const data = event.data || {};
    if (data.type !== 'larch:init') return;
    const variables = data.variables || {};
    updateContext(variables);
    if (!realChat) openRequestedInteraction();
  });
  // larch:init 常比這支模組早到（index.html 先收）：有的話直接用那一份，不然先用目前的遊戲狀態。
  const early = window.__studio && window.__studio.variables;
  updateContext(early && Object.keys(early).length ? early : window.STUDIO_GAME_STATE ? {
    day: window.STUDIO_GAME_STATE.day,
    seat: window.STUDIO_GAME_STATE.seat,
    affC: window.STUDIO_GAME_STATE.affinity.chen,
    affM: window.STUDIO_GAME_STATE.affinity.ming,
    affS: window.STUDIO_GAME_STATE.affinity.shi,
    trialKnown: window.STUDIO_GAME_STATE.trialKnown
  } : {});
  if (realChat) {
    if (window.parent !== window) window.parent.postMessage({ type: 'larch:ready' }, '*');
    window.PageLoading.prepare('開放聊天', window.StudioDB.ready.then(() => window.STUDIO_FEATURES.openChat(continueButton)));
  } else {
    window.setTimeout(openRequestedInteraction, 0);
  }
}
