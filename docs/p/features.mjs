import { renderPuzzle, decodePuzzleBests, encodePuzzleBests } from './shared/studio/studio_puzzle.mjs';
import { renderColoring } from './shared/studio/studio_coloring.mjs';
import { group1Line } from './shared/studio/studio_lines_group1.mjs';
import { CHEN_ART } from './shared/studio/studio_collection_data.mjs';
import { STUDIO_PUZZLE_CGS } from './shared/studio/studio_puzzle_cgs.mjs';
import { decodeHudSeen } from './shared/studio/hud_seen.mjs';
import { HUD_SEEN_KEYS } from './shared/studio/hud_seen_keys.mjs';

const PORTRAITS = './assets/portraits/';
const ICONS = './assets/activities/';
const DEMO_SEEN = ['ch1_cg_032', 'ch1_cg_042', 'ch2_cg_037'];
const PUZZLE_SAVE = 'studioPuzzle';
const DARK_ACK = 'nyhm-phone-night-v1';
const MINUTE = 60_000;
const pad = value => String(value).padStart(2, '0');
const ming = (key, tokens) => group1Line('ming', key, tokens);

const buttonIcons = new Map(Object.entries({
  '取消': 'close', '返回選圖': 'prev', '看原圖': 'eye', '提示': 'wand', '重新打散': 'reset',
  '放棄': 'stop', '回到選圖': 'prev', '選另一張': 'image', '回到著色': 'prev',
  '填色': 'bucket', '筆刷': 'brush', '橡皮擦': 'eraser', '滴管': 'dropper', '移動': 'hand',
  '復原': 'undo', '重做': 'redo', '清除全部': 'clear', '清除': 'trash',
  '完成，傳回遊戲展廳': 'send', '自訂色': 'palette', '加入調色盤': 'plus', '刪除': 'trash',
  '−': 'zoom-out', '＋': 'zoom-in', '整張': 'frame'
}));

function el(tag, classes = '', text) {
  const node = document.createElement(tag);
  if (classes) node.className = classes;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function activityIcon(name) {
  return '<img class="activity-icon" alt="" src="' + ICONS + name + '.webp">';
}

function putIcon(node, name) {
  const picture = el('img', 'activity-icon');
  picture.alt = '';
  picture.src = name === 'image' ? './assets/icons/image.svg' : ICONS + (name === 'redo' ? 'undo' : name) + '.webp';
  if (name === 'redo') picture.classList.add('activity-redo');
  node.append(picture);
}

function setButtonLabel(control, text) {
  control.querySelector('.activity-label').textContent = text;
}

function button(label, action, classes = '', image) {
  const node = el('button', 'sf-button' + (classes ? ' ' + classes : ''));
  node.type = 'button';
  // 圖卡、拼圖片和色票本身就是圖示。
  if (label) {
    putIcon(node, image || buttonIcons.get(label) || 'puzzle');
    node.append(el('span', 'activity-label', label));
  }
  if (action) node.addEventListener('click', action);
  return node;
}

function bubble(who, ...lines) {
  const box = el('div', 'sf-group1-dialogue');
  const avatar = el('img');
  avatar.src = PORTRAITS + who + '.webp';
  avatar.alt = who === 'ming' ? '明' : '晨';
  box.append(avatar, el('div'));
  box.lastElementChild.append(...lines.map(line => el('p', '', line)));
  return box;
}

function mergePuzzleBests(snapshot, local) {
  const bests = decodePuzzleBests(snapshot);
  for (const [id, row] of decodePuzzleBests(local)) {
    const previous = bests.get(id);
    if (!previous || row[1] > previous[1] || (row[1] === previous[1] && row[2] < previous[2])) bests.set(id, row);
  }
  return encodePuzzleBests([...bests.values()]);
}

export function mountChenActivity(root, kind, data, { mock, activities }) {
  const seen = decodeHudSeen(data.seen, HUD_SEEN_KEYS)?.keys ?? new Set();
  if (mock && !seen.size) DEMO_SEEN.forEach(id => seen.add(id));
  const db = activities.storage;
  const deps = { el, button, setButtonLabel, avatar: PORTRAITS + 'chen.webp', db };
  if (kind === 'puzzle') {
    const cgs = STUDIO_PUZZLE_CGS.filter(([id]) => seen.has(id)).map(([id, title]) => ({
      id: 'cg:' + id, title: title || id, src: (DEMO_SEEN.includes(id) ? './assets/puzzle/' : './puzzle-cg/') + id + '.webp'
    }));
    const art = CHEN_ART.filter(work => mock ? work.chapter <= 2 : (!work.day || work.day <= data.day)
      && (work.chapter === 99 ? seen.has('true_end_cg_003') : !data.chapter || work.chapter <= data.chapter))
      .map(({ puzzleId, title }) => ({ id: 'art:' + puzzleId, title, src: './assets/puzzle/' + puzzleId + '.webp' }));
    renderPuzzle(root, {
      ...deps,
      db: { ...db, async get(slot) {
        const local = await db.get(slot);
        return slot === PUZZLE_SAVE ? mergePuzzleBests(data.puzzle, local) : local;
      } },
      sources: [['晨畫的', art], ['劇情 CG', cgs]],
      onFinish: ({ imageId, pieces, ms }) =>
        activities.submit('puzzle', { imageId, pieces, ms: Math.round(Math.max(1000, Math.min(ms, 86_400_000))) })
    });
  } else {
    return renderColoring(root, {
      ...deps, phone: true, seen, progress: () => ({ day: data.day, all: mock }),
      chenBubble: text => bubble('chen', text),
      saveDrawing: (image, title, lineId) => activities.submit('coloring', { image, title, lineId })
    });
  }
}

export function createPhoneFocus({ getActivities, getSnapshot, report }) {
  let selected = 25;
  let phase = 'idle';
  let end = 0;
  let paused = null;
  let remaining = 0;
  let round = 0;
  let lines = [];
  let root, controls;
  let total = 0;
  let totalRevision = 0;

  async function updateTotal() {
    const activities = getActivities();
    const revision = ++totalRevision;
    if (!activities) return;
    try {
      const next = await activities.today(getSnapshot());
      if (revision === totalRevision && activities === getActivities()) {
        total = next;
        draw();
      }
    } catch { /* 寫入失敗時由各操作顯示訊息 */ }
  }

  function draw() {
    if (!root?.isConnected) return;
    const seconds = phase === 'idle' ? selected * 60
      : Math.max(0, Math.ceil((paused ? remaining : end - Date.now()) / 1000));
    const label = phase === 'break' ? '休息' : '專心';
    controls.clock.textContent = pad(Math.floor(seconds / 60)) + ':' + pad(seconds % 60);
    controls.stats.textContent = '今天合計專心 ' + total + ' 分鐘';
    controls.phase.textContent = label + (paused ? ' · 已暫停' : '');
    controls.set.forEach(choice => {
      choice.disabled = phase !== 'idle';
      choice.setAttribute('aria-pressed', String(Number(choice.dataset.minutes) === selected));
    });
    controls.start.hidden = phase !== 'idle';
    controls.pause.hidden = phase === 'idle' || Boolean(paused);
    controls.resume.hidden = !paused;
    controls.stop.hidden = phase === 'idle';
    const text = phase === 'break' ? [...lines, ming('round_done', { n: round, total })] : lines;
    const signature = text.join('\n');
    if (controls.speech.dataset.last !== signature) {
      controls.speech.dataset.last = signature;
      controls.speech.replaceChildren(...text.map(line => el('p', '', line)));
    }
    controls.speech.parentElement.hidden = !text.length;
  }

  function tick(now = Date.now()) {
    if (!paused && phase === 'focus' && now >= end) {
      const endedAt = end;
      round++;
      phase = 'break';
      end += 5 * MINUTE;
      lines = [ming('focus_done', { rest: 5 })];
      getActivities()?.submit('focus', { endedAt, minutes: selected }).catch(report);
    }
    if (!paused && phase === 'break' && now >= end) {
      phase = 'idle';
      lines = [ming('break_done')];
    }
    draw();
  }

  function start() {
    if (phase !== 'idle') return;
    phase = 'focus';
    end = Date.now() + selected * MINUTE;
    lines = [ming('start', { minutes: selected })];
    draw();
    controls.pause.focus();
  }

  function pause() {
    tick();
    if (phase === 'idle') return;
    remaining = Math.max(0, end - Date.now());
    paused = true;
    draw();
    controls.resume.focus();
  }

  function resume() {
    if (!paused) return;
    end = Date.now() + remaining;
    paused = null;
    draw();
    controls.pause.focus();
  }

  function stop() {
    if (phase === 'idle') return false;
    const duration = phase === 'focus' ? selected : 5;
    const elapsed = duration * MINUTE - (paused ? remaining : Math.max(0, end - Date.now()));
    phase = 'idle';
    paused = null;
    lines = [ming('stopped_early', { minutes: Math.floor(elapsed / MINUTE) })];
    draw();
    controls?.start.focus({ preventScroll: true });
    return true;
  }

  return {
    tick, updateTotal, stop,
    reset() {
      paused = null;
      phase = 'idle';
      round = total = 0;
      lines = [];
      draw();
    },
    mount(node) {
      root = node;
      const title = el('h2', '', '陪讀計時器');
      const stats = el('p', 'phone-focus-total');
      stats.setAttribute('role', 'status');
      const clock = el('output', 'phone-focus-time');
      clock.setAttribute('role', 'timer');
      const phaseLabel = el('p', 'phone-focus-phase');
      const choices = el('div', 'phone-focus-options');
      choices.setAttribute('aria-label', '專心分鐘數');
      const set = [15, 25, 45, 60].map(minutes => {
        const choice = button(minutes + ' 分', () => { selected = minutes; draw(); }, '', 'timer');
        choice.dataset.minutes = minutes;
        return choice;
      });
      choices.append(...set);
      const actions = el('div', 'phone-focus-actions');
      const startButton = button('開始', start, 'primary', 'play');
      const pauseButton = button('暫停', pause, '', 'pause');
      const resumeButton = button('繼續', resume, 'primary', 'play');
      const stopButton = button('停止', stop, '', 'stop');
      actions.append(startButton, pauseButton, resumeButton, stopButton);
      const dialogue = bubble('ming');
      dialogue.lastElementChild.setAttribute('role', 'status');
      controls = { stats, clock, phase: phaseLabel, set, start: startButton, pause: pauseButton,
        resume: resumeButton, stop: stopButton, speech: dialogue.lastElementChild };
      root.append(title, stats, clock, phaseLabel, choices, actions, dialogue);
      draw();
      updateTotal();
    }
  };
}

let night;
let acknowledged;
export function checkNight() {
  if (night?.open) return;
  const now = new Date();
  if (now.getHours() >= 5) return;
  const day = [now.getFullYear(), pad(now.getMonth() + 1), pad(now.getDate())].join('-');
  if (acknowledged === day) return;
  try { if (localStorage.getItem(DARK_ACK) === day) return; } catch { /* 這次開啟期間仍可提醒 */ }
  const time = pad(now.getHours()) + ':' + pad(now.getMinutes());
  night = el('dialog', 'phone-night');
  night.setAttribute('aria-label', '明的深夜提醒');
  night.addEventListener('cancel', event => event.preventDefault());
  const dismiss = button('知道了', () => {
    acknowledged = day;
    try { localStorage.setItem(DARK_ACK, day); } catch { /* 這次開啟期間仍記得 */ }
    night.close();
    night.remove();
  }, 'primary', 'check');
  night.append(bubble('ming', ming('late_night', { time }), ming('late_night_2')), dismiss);
  document.body.append(night);
  night.showModal();
}
