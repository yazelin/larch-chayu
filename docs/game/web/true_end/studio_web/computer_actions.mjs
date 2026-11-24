export const WALLPAPERS = ['moonlight', 'north', 'east', 'south', 'west'];
export const COLORS = ['#eadfda', '#e8d9b8', '#d8dfed', '#d9e2c2', '#eed7dc', '#f3ead9'];
export const POSITIONS = ['left', 'right', 'top', 'bottom'];
export const WIDGETS = ['progress', 'favorites', 'calendar', 'notes'];
export const COMPUTER_PANELS = { progress: '進度表', replay: '重玩故事關卡', newgame: '請明做新遊戲' };

export function settingsPatch(value) {
  const patch = {};
  if (WALLPAPERS.includes(value?.wallpaper)) patch.wallpaper = value.wallpaper;
  const color = typeof value?.themeColor === 'string' && value.themeColor.toLowerCase();
  if (COLORS.includes(color)) patch.themeColor = color;
  const widgets = {};
  for (const key of WIDGETS) {
    const source = value?.widgets?.[key];
    const item = {};
    if (typeof source?.enabled === 'boolean') item.enabled = source.enabled;
    if (POSITIONS.includes(source?.position)) item.position = source.position;
    if (Object.keys(item).length) widgets[key] = item;
  }
  if (Object.keys(widgets).length) patch.widgets = widgets;
  return patch;
}

export function computerAction(value) {
  if (value?.type === 'open' && typeof value.panel === 'string' && Object.hasOwn(COMPUTER_PANELS, value.panel)) {
    return { type: 'open', panel: value.panel };
  }
  if (value?.type === 'settings') {
    const settings = settingsPatch(value.settings);
    if (Object.keys(settings).length) return { type: 'settings', settings };
  }
  return null;
}

export function applySettingsPatch(current, patch) {
  const widgets = { ...current.widgets };
  for (const key of Object.keys(patch.widgets || {})) {
    widgets[key] = { ...widgets[key], ...patch.widgets[key] };
  }
  return { ...current, ...patch, widgets };
}
