import { CHARACTERS } from './studio_core.mjs';
import { storyTime } from './story_time.mjs';

const KEYS = { chen: ['affC', 'freeAffC_ch'], ming: ['affM', 'freeAffM_ch'], shi: ['affS', 'freeAffS_ch'] };
export const AFFINITY_MAX = 12; // 與新版/hud/src/hud.src.html 的 AFF_MAX 一致
const SAVE_KEY = 'larch-free-affinity';

export function affinityChapter(day, chapter) {
  return String(chapter) === 'true' ? 7 : storyTime(Number(day) || 1, chapter).chapter;
}

export function createFreeAffinity({ embedded, variables, chapter, write, update, debug }) {
  function localSave() {
    try { return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch { return {}; }
  }
  let local = embedded ? {} : localSave();
  const values = () => ({ ...variables(), ...local });
  function refresh() {
    const vars = values();
    update(vars);
    if (!debug) return;
    let label = document.querySelector('.free-aff-debug');
    if (!label) {
      label = document.createElement('output');
      label.className = 'free-aff-debug';
      document.body.append(label);
    }
    const ch = chapter();
    label.textContent = '第 ' + ch + ' 章自由互動　' + Object.entries(KEYS).map(([who, [, mark]]) => {
      return CHARACTERS[who].name + ' ' + (Number(vars[mark]) >= ch ? '已加' : '未加');
    }).join('　');
  }
  function award(who) {
    if (!embedded) local = { ...local, ...localSave() };
    const [score, mark] = KEYS[who];
    const vars = values(), ch = chapter();
    const before = Math.max(0, Number(vars[score]) || 0);
    if (!ch || (Number(vars[mark]) || 0) >= ch || before >= AFFINITY_MAX) return false;
    const changes = { [score]: Math.min(AFFINITY_MAX, before + 1), [mark]: ch };
    if (embedded) write(changes);
    else {
      Object.assign(local, changes);
      try { localStorage.setItem(SAVE_KEY, JSON.stringify(local)); } catch { /* 保留這一頁的狀態 */ }
    }
    refresh();
    const { name, color } = CHARACTERS[who];
    const toast = document.createElement('div');
    toast.className = 'free-aff-toast';
    toast.setAttribute('role', 'status');
    const heart = document.createElement('span');
    heart.textContent = '♥';
    heart.setAttribute('aria-hidden', 'true');
    heart.style.color = color;
    toast.append(heart, ' ' + name + '的好感 +1');
    document.body.append(toast);
    setTimeout(() => toast.remove(), 2600);
    return true;
  }
  if (typeof window !== 'undefined' && !embedded) window.addEventListener('storage', event => {
    if (event.key === SAVE_KEY) { local = localSave(); refresh(); }
  });
  return { award, refresh };
}
