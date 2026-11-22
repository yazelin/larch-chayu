// 小紙卡只接收自己的點擊。各頁沿用自己的存檔和 Larch 變數轉接。
const shown = new Set();

export function guideHint(key, message, { vars, set, container = document.body, position = 'scene' }) {
  if (shown.has(key) || [true, 'true', 1, '1'].includes(vars()?.[key])) return null;
  shown.add(key);
  const hint = document.createElement('button');
  hint.type = 'button';
  hint.className = 'play-guide-hint play-guide-hint--' + position;
  hint.dataset.guide = key;
  hint.title = '收起提示';
  hint.textContent = message;
  for (const event of ['pointerdown', 'pointerup']) {
    hint.addEventListener(event, e => e.stopPropagation());
  }
  hint.addEventListener('click', event => {
    event.stopPropagation();
    hint.remove();
  });
  if (!document.getElementById('play-guide-style')) {
    const style = document.createElement('style');
    style.id = 'play-guide-style';
    style.textContent = `
.play-guide-hint{box-sizing:border-box;pointer-events:auto;cursor:pointer;border:1px solid #d8c3a8;border-radius:11px;background:#fbf5ea;color:#523d38;padding:7px 12px;font:inherit;font-size:14px;font-weight:600;line-height:1.45;box-shadow:0 2px 9px #30232733}
.play-guide-hint--scene{position:fixed;z-index:23;left:50%;transform:translateX(-50%);width:max-content;max-width:calc(100vw - 32px);top:calc(var(--hud-clear,124px) + 78px);font:600 14px/1.45 "Noto Sans TC",sans-serif}
.panel-open .play-guide-hint--scene{visibility:hidden}
.play-guide-hint--scene ~ .play-guide-hint--scene{margin-top:44px}
.play-guide-hint--point{display:block;margin-top:4px;font-size:13px}
.play-guide-hint--map{position:absolute;z-index:1;transform:translate(-50%,-100%);width:max-content;padding:3px 8px;font-size:12px}
`;
    document.head.append(style);
  }
  container.append(hint);
  set({ [key]: true });
  if (position !== 'map') setTimeout(() => hint.remove(), 8500);
  return hint;
}
