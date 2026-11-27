import { group1Line } from './studio_lines_group1.mjs';

const FOCUS_KEY = 'studioFocus';
const NIGHT_KEY = 'studioNight';
const MINUTE = 60_000;
const LENGTHS = [15, 25, 45, 60];
const pad = value => String(value).padStart(2, '0');
const say = (key, values) => group1Line('ming', key, values);

function localDay(time = Date.now()) {
  const date = new Date(time);
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate())].join('-');
}
function dayOffset(time, offset) {
  const date = new Date(time);
  return +new Date(date.getFullYear(), date.getMonth(), date.getDate() + offset);
}
function duration(seconds) {
  return Math.floor(seconds / 60) + ':' + pad(seconds % 60);
}

export function createFocus({ db, el, button, avatar, volume, desktop }) {
  let state = { v: 1, minutes: 25, days: {}, lastStop: null, active: null };
  let phase = 'idle';
  let end = 0;
  let streak = 0;
  let lines = [];
  let storageError = false;
  let pendingWrite = Promise.resolve();
  let audio;
  let nightDays = [];
  let notice;
  const views = new Map();
  const today = () => state.days[localDay()] || [0, 0];

  // 每次寫入用當下的快照。開始、停止及換段的寫入照順序完成。
  function save() {
    const snapshot = JSON.stringify(state);
    pendingWrite = pendingWrite.then(() => db.set(FOCUS_KEY, snapshot)).then(() => {
      storageError = false;
    }, () => {
      storageError = true;
      refresh();
    });
    return pendingWrite;
  }

  function credit(start, seconds, completedAt) {
    const finish = start + seconds * 1000;
    for (let time = start; time < finish;) {
      const next = Math.min(finish, dayOffset(time, 1));
      const record = state.days[localDay(time)] ||= [0, 0];
      record[1] = Math.min(99_999, record[1] + Math.floor((next - start) / 1000) - Math.floor((time - start) / 1000));
      time = next;
    }
    if (completedAt !== undefined) {
      const record = state.days[localDay(completedAt)] ||= [0, 0];
      record[0] = Math.min(9_999, record[0] + 1);
    }
    const keep = Object.keys(state.days).sort().slice(-40);
    state.days = Object.fromEntries(keep.map(day => [day, state.days[day]]));
  }

  const ready = Promise.all([db.get(FOCUS_KEY), db.get(NIGHT_KEY)]).then(async ([focus, night]) => {
    for (const [type, saved] of [['focus', focus], ['night', night]]) {
      try {
        const value = JSON.parse(saved || 'null');
        if (value?.v !== 1) continue;
        if (type === 'focus') state = value;
        else if (Array.isArray(value.days)) nightDays = value.days;
      } catch { /* 舊紀錄或空值 */ }
    }
    if (state.active) {
      const { kind, startedAt, elapsedSeconds } = state.active;
      if (kind === 'focus') credit(startedAt, elapsedSeconds);
      state.lastStop = Math.floor(elapsedSeconds / 60);
      state.active = null;
      await save();
    }
    if (state.lastStop !== null) lines = [say('resume_note', { minutes: state.lastStop })];
  }).catch(() => { storageError = true; });

  function refresh() {
    for (const [root, draw] of views) {
      if (root.isConnected) draw();
      else views.delete(root);
    }
  }

  function unlockAudio() {
    if (!window.AudioContext || !volume()) return;
    try {
      audio ||= new AudioContext();
      audio.resume().catch(() => {});
    } catch { /* 仍可計時 */ }
  }

  function chime() {
    const level = volume();
    if (!level || audio?.state !== 'running') return;
    const start = audio.currentTime;
    const note = audio.createOscillator();
    const gain = audio.createGain();
    note.frequency.value = 660;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level * 0.11, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
    note.connect(gain).connect(audio.destination);
    note.onended = () => { note.disconnect(); gain.disconnect(); };
    note.start(start);
    note.stop(start + 0.36);
  }

  function tick(now = Date.now(), checkpoint = false) {
    if (phase === 'focus' && now >= end) {
      const { startedAt, minutes } = state.active;
      credit(startedAt, minutes * 60, end);
      state.lastStop = null;
      const n = ++streak;
      const rest = n % 4 === 0 ? 15 : 5;
      phase = 'break';
      state.active = { kind: 'break', startedAt: end, minutes: rest, elapsedSeconds: 0 };
      end += rest * MINUTE;
      lines = [
        say(rest === 15 ? 'long_break' : 'focus_done', { n, rest }),
        say('round_done', { n, total: Math.floor(today()[1] / 60) })
      ];
      save();
      chime();
    }
    if (phase === 'break' && now >= end) finishBreak();
    if (phase !== 'idle') {
      const elapsed = Math.max(0, Math.floor((now - state.active.startedAt) / 1000));
      if (elapsed > state.active.elapsedSeconds && (checkpoint || elapsed >= state.active.elapsedSeconds + 15)) {
        state.active.elapsedSeconds = elapsed;
        save();
      }
    }
    refresh();
  }

  function finishBreak() {
    phase = 'idle';
    state.active = null;
    save();
    lines = [say('break_done')];
    refresh();
  }

  function start() {
    unlockAudio();
    const startedAt = Date.now();
    state.active = { kind: 'focus', startedAt, minutes: state.minutes, elapsedSeconds: 0 };
    phase = 'focus';
    end = startedAt + state.minutes * MINUTE;
    state.lastStop = null;
    lines = [say('start', { minutes: state.minutes })];
    save();
    refresh();
  }

  function stop(leaving = false) {
    if (phase !== 'idle') {
      const { startedAt, minutes } = state.active;
      const elapsed = Math.min(minutes * 60, Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
      if (phase === 'focus') credit(startedAt, elapsed);
      state.lastStop = Math.floor(elapsed / 60);
      state.active = null;
      lines = [say(leaving ? 'resume_note' : 'stopped_early', { minutes: state.lastStop })];
      save();
    }
    phase = 'idle';
    refresh();
    return pendingWrite;
  }

  function placeNotice() {
    if (!notice) return;
    const parent = desktop() || document.body;
    if (notice.parentNode !== parent) parent.append(notice);
  }

  function dismissNotice() {
    notice?.remove();
    notice = null;
  }

  // 按「知道了」才記成今晚提醒過（2026-11-28：原本一跳出就記，第一次被說明框蓋住，作者沒看到，之後也不再跳）。
  // 這次開著的頁面裡跳過就不再重跳。預覽可加 lateNight=1 不管紀錄、隨時顯示。
  const forceNight = new URLSearchParams(location.search).get('lateNight') === '1';
  let shownDay = null;
  function markNight(day) {
    if (nightDays.includes(day)) return;
    nightDays = [...nightDays, day].slice(-14);
    db.set(NIGHT_KEY, JSON.stringify({ v: 1, days: nightDays })).catch(() => {});
  }

  function checkNight() {
    const now = new Date();
    const day = localDay(+now);
    if (shownDay === day) return;
    if (!forceNight && (now.getHours() >= 5 || nightDays.includes(day))) return;
    shownDay = day;
    dismissNotice();
    notice = el('aside', 'sf-night-notice');
    notice.setAttribute('aria-label', '明的提醒');
    const dialogue = el('div', 'sf-group1-dialogue');
    const portrait = el('img');
    portrait.src = avatar;
    portrait.alt = '';
    const message = el('div');
    message.setAttribute('role', 'status');
    const time = pad(now.getHours()) + ':' + pad(now.getMinutes());
    message.append(el('strong', '', '明'), el('p', '', say('late_night', { time })), el('p', '', say('late_night_2')));
    dialogue.append(portrait, message);
    notice.append(dialogue, button('知道了', () => { markNight(day); dismissNotice(); }));
    placeNotice();
  }

  ready.then(() => {
    checkNight();
    window.setInterval(() => { tick(); checkNight(); }, 500);
    document.addEventListener('visibilitychange', () => { tick(Date.now(), document.hidden); checkNight(); });
    window.addEventListener('pagehide', () => { tick(); stop(true); });
  });

  return {
    async desktopChanged() { await ready; checkNight(); placeNotice(); },
    async leave() { await ready; tick(); await stop(true); },
    escape() {
      if (notice && notice.contains(document.activeElement)) { dismissNotice(); return true; }
      const root = desktop()?.querySelector('[data-ming-window="focus"]:not(.inactive):not([hidden]) .sf-focus');
      if (phase === 'idle' || !root) return false;
      tick();
      stop();
      return true;
    },
    async render(root) {
      await ready;
      const card = el('section', 'sf-focus');
      const stats = el('p', 'sf-focus-stats');
      const clock = el('div', 'sf-focus-clock');
      clock.setAttribute('role', 'timer');
      const label = el('label', 'sf-focus-choice', '專心時間');
      const select = el('select', 'sf-select');
      for (const minutes of LENGTHS) {
        const option = el('option', '', minutes + ' 分鐘');
        option.value = minutes;
        select.append(option);
      }
      select.addEventListener('change', () => {
        state.minutes = Number(select.value);
        save();
        refresh();
      });
      label.append(select);
      const actions = el('div', 'sf-focus-actions');
      const toggle = button('開始', () => {
        if (phase === 'idle') start();
        else { tick(); stop(); }
      }, 'primary sf-focus-toggle');
      const skip = button('跳過休息', () => { finishBreak(); toggle.focus(); }, 'sf-focus-skip');
      actions.append(toggle, skip);
      const dialogue = el('div', 'sf-group1-dialogue');
      const image = el('img');
      image.src = avatar;
      image.alt = '明';
      const speech = el('div');
      speech.setAttribute('role', 'status');
      dialogue.append(image, speech);
      const error = el('p', 'sf-status');
      card.append(stats, clock, label, actions, dialogue, error);
      root.append(card);
      let spoken;
      views.set(card, () => {
        stats.textContent = (phase === 'break' ? '休息' : '專心') + '・第 ' + (phase === 'break' ? streak : streak + 1)
          + ' 輪・今天 ' + Math.floor(today()[1] / 60) + ' 分鐘';
        clock.textContent = duration(phase === 'idle' ? state.minutes * 60 : Math.max(0, Math.ceil((end - Date.now()) / 1000)));
        select.value = state.minutes;
        select.disabled = phase !== 'idle';
        const toggleLabel = phase === 'idle' ? '開始' : '停止';
        if (toggle.textContent !== toggleLabel) toggle.textContent = toggleLabel;
        skip.hidden = phase !== 'break';
        dialogue.hidden = !lines.length;
        if (spoken !== lines) {
          speech.replaceChildren(...lines.map(line => el('p', '', line)));
          spoken = lines;
        }
        error.textContent = storageError ? '暫時無法儲存陪讀紀錄。' : '';
      });
      tick();
    },
    async renderHistory(root) {
      await ready;
      const section = el('section', 'sf-focus-history');
      const list = el('ul');
      section.append(el('h3', '', '陪讀紀錄'), list);
      root.append(section);
      let previous;
      views.set(section, () => {
        const days = Array.from({ length: 7 }, (_, index) => localDay(dayOffset(Date.now(), -index)));
        const rows = days.map(day => [day, ...(state.days[day] || [0, 0])]);
        const key = JSON.stringify(rows);
        if (previous === key) return;
        previous = key;
        list.replaceChildren(...rows.map(([day, rounds, seconds]) =>
          el('li', '', day + '　' + Math.floor(seconds / 60) + ' 分鐘・' + rounds + ' 輪')));
      });
      refresh();
    }
  };
}
