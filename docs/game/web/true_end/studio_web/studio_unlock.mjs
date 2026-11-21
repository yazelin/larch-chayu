import { storyTime } from './story_time.mjs';

const BATCHES = [
  [13, 15, 8, 12, 6],
  [7, 5, 3, 10],
  [11, 4, 9, 2, 1],
  [14, 16]
];
const POINTS = '.hotspot, #table-entry, #seat-entry';
const SEEN_KEY = 'studioUnlockSeen';
const HIGHLIGHT_MS = 3000;

function unlockState(search, variables, inFrame) {
  const query = new URLSearchParams(search);
  const day = storyTime(variables.day).day ?? storyTime(query.get('day')).day;
  // 網址的 chapter 是劇本卡所在章節。Larch 的 chapter 也會被島段拿來記島的進度。
  const chapter = storyTime(day ?? 1, query.get('chapter') || variables.studioChapter).chapter;
  const preview = query.get('debug') === '1' || (!inFrame && day === null);
  const islandDone = chapter > 3 || (chapter === 3 && (
    query.get('islandDoor') === '1' ||
    [true, 'true', 1, '1'].includes(variables.ch3_done ?? query.get('ch3_done')) ||
    // 單開頁沒有白板的島段旗標，第 9 天是第一次上島之後的首個自由時間。
    (!inFrame && day >= 9)
  ));
  const batches = preview || day > 30 ? [true, true, true, true] : [true, chapter >= 2, islandDone, chapter >= 4];
  return { batches, preview };
}

// 自由探索的入口共用這個判斷。劇情指定開啟面板時，直接走面板 API。
export function studioPointOpen(id, search, variables, inFrame) {
  return unlockState(search, variables, inFrame).batches[BATCHES.findIndex(batch => batch.includes(id))] === true;
}

export function createStudioUnlock(search, scope) {
  const inFrame = window.parent !== window;
  const status = document.getElementById('studio-unlock-status');
  let variables = {};
  let seen;
  const highlighting = new Set();
  let timer;

  function apply(button) {
    const id = Number(button.dataset.id);
    const open = studioPointOpen(id, search, variables, inFrame);
    button.hidden = button.disabled = !open;
    button.classList.toggle('unlock-new', open && highlighting.has(id));
  }

  function refresh() {
    scope.querySelectorAll(POINTS).forEach(apply);
  }

  async function notify() {
    if (unlockState(search, variables, inFrame).preview) return;
    // 跟唱片架的 albumSeen 一樣，網站存 IndexedDB，Larch 存在既有的 studioMisc。
    seen ??= StudioDB.get(SEEN_KEY).then(value => new Set(Array.isArray(value) ? value : []), () => new Set());
    const remembered = await seen;
    const { batches, preview } = unlockState(search, variables, inFrame);
    if (preview) return;
    const fresh = batches.map((open, index) => open && !remembered.has(index + 1));
    if (!fresh.includes(true)) return;
    fresh.forEach((isNew, index) => {
      if (!isNew) return;
      remembered.add(index + 1);
      BATCHES[index].forEach(id => highlighting.add(id));
    });
    StudioDB.set(SEEN_KEY, [...remembered]).catch(() => {});
    refresh();
    const line = document.createElement('div');
    line.className = 'sf-toast';
    line.textContent = '工作室裡多了可以看的地方';
    status.replaceChildren(line);
    clearTimeout(timer);
    timer = setTimeout(() => {
      highlighting.clear();
      refresh();
      status.replaceChildren();
    }, HIGHLIGHT_MS);
  }

  return {
    apply,
    sync(values) {
      variables = values;
      refresh();
      void notify();
    }
  };
}
