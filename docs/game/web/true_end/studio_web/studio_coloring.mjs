import { drawingLook, DRAW_COLORS, unlockedColors, CANVAS_W } from './studio_draw.mjs';
import { group1Line } from './studio_lines_group1.mjs';
import { coloringFixtures } from './studio_coloring_fixture.mjs';
import { coloringHistory, coloringRegion, coloringWalls } from './studio_coloring_pixels.mjs';

const PAPER = '#fffdf6';
const CARD_KEY = 'coloringDraft';
const CARD_BUDGET = 85_000;
// 線稿索引由另一條製作線提供，匯出器會在索引存在時收進這個目錄。
const ART_INDEX = new URL('../../art/coloring/index.json', import.meta.url);
const ART_DIRECTORY = new URL('.', ART_INDEX);

function artUrl(path, id, suffix) {
  const name = id + suffix;
  if (path === 'art/coloring/' + name || path === name) return new URL(name, ART_DIRECTORY).href;
  return '';
}

async function loadSources() {
  const response = await fetch(ART_INDEX);
  if (response.status === 404) return coloringFixtures();
  if (!response.ok) throw new Error('線稿清單暫時讀不到。');
  const rows = await response.json();
  if (!Array.isArray(rows)) throw new Error('線稿清單格式錯誤。');
  return rows.flatMap(({ id, title, line, thumb }) => {
    if (typeof id !== 'string' || !/^[a-z\d_]+$/i.test(id)) return [];
    const src = artUrl(line, id, '.webp');
    return src ? [{ id, title: title || id, src, thumb: artUrl(thumb, id, '_thumb.webp') || src }] : [];
  });
}

async function imageAt(src, readPixels = false) {
  const image = new Image();
  if (readPixels) image.crossOrigin = 'anonymous';
  image.src = src;
  await image.decode();
  return image;
}

function draftKey(db, item) {
  return db.mode === 'larch' ? CARD_KEY : CARD_KEY + ':' + (item.fixture ? 'fixture:' : '') + item.id;
}

function saveDraft(db, item, canvas) {
  const state = { id: item.id, fixture: !!item.fixture, src: canvas.toDataURL() };
  // 網頁存原尺寸。Larch 每張卡共 10 萬字，複雜的草稿必要時等比縮小。
  if (db.mode === 'larch' && state.src.length > CARD_BUDGET) {
    const small = document.createElement('canvas');
    for (let factor = 0.85; state.src.length > CARD_BUDGET; factor *= 0.8) {
      small.width = Math.max(1, Math.round(canvas.width * factor));
      small.height = Math.max(1, Math.round(canvas.height * factor));
      small.getContext('2d').drawImage(canvas, 0, 0, small.width, small.height);
      state.src = small.toDataURL();
    }
  }
  if (db.mode === 'memory') throw new Error('本機儲存無法使用');
  return db.set(draftKey(db, item), state);
}

function shade(color, value) {
  const rgb = parseInt(color.slice(1), 16);
  const end = value < 0 ? 0 : 255;
  const f = Math.abs(value) / 100;
  const components = [16, 8, 0].map(shift => (rgb >> shift) & 255);
  return '#' + components.map(c => Math.round(c + (end - c) * f).toString(16).padStart(2, '0')).join('');
}

export async function renderColoring(root, deps) {
  const { el, button, db } = deps;
  const panel = root.closest('#panel');
  const scrollBox = root.closest('#panel-body');
  const say = key => group1Line('chen', 'coloring_' + key);
  const wrap = el('div', 'sf-coloring');
  const speech = el('div', 'sf-group1-dialogue sf-coloring-dialogue');
  const avatar = el('img');
  avatar.src = deps.avatar;
  avatar.alt = '晨';
  const phrase = el('p', '', say('enter'));
  speech.append(avatar, phrase);
  const content = el('div', 'sf-coloring-content');
  wrap.append(speech, content);
  root.append(wrap);
  let generation = 0, disposeEditor, interrupt;
  let selected, sources = [], colors = [];
  let writes = Promise.resolve();
  let recent = [];

  function cleanEditor() {
    generation++;
    disposeEditor?.();
    disposeEditor = interrupt = null;
    root.coloringBack = root.coloringEscape = null;
  }
  root.coloringDestroy = cleanEditor;

  function pick() {
    cleanEditor();
    panel.dataset.design = 'coloring';
    panel.classList.add('sf-wide');
    phrase.textContent = say('enter');
    scrollBox.scrollTop = 0;
    const heading = el('h2', '', '選一張線稿');
    const grid = el('div', 'sf-coloring-picks');
    for (const item of sources) {
      const card = button('', () => open(item), 'sf-coloring-card');
      card.dataset.coloringId = item.id;
      const preview = item.fixture ? item.make() : el('img');
      if (!item.fixture) {
        preview.src = item.thumb;
        preview.loading = 'lazy';
        preview.alt = '';
      }
      card.append(preview, el('span', '', item.title));
      grid.append(card);
    }
    if (!sources.length) grid.append(el('p', 'sf-empty', '看過劇情插畫後，就能在這裡選它的線稿。'));
    const fixtureNote = sources.some(item => item.fixture) ? el('small', 'sf-coloring-fixture', '預覽線稿') : '';
    content.replaceChildren(...(fixtureNote ? [heading, fixtureNote, grid] : [heading, grid]));
    if (selected) grid.querySelector('[data-coloring-id="' + selected.id + '"]')?.focus({ preventScroll: true });
  }

  async function open(item) {
    const token = ++generation;
    selected = item;
    phrase.textContent = say('pick');
    const loading = el('p', 'sf-status', '正在打開線稿…');
    loading.setAttribute('role', 'status');
    const cancel = button('取消', pick);
    content.replaceChildren(loading, cancel);
    cancel.focus();
    root.coloringEscape = () => { pick(); return true; };
    try {
      const source = item.fixture ? item.make() : await imageAt(item.src, true);
      await writes;
      let saved, readFailed = false;
      try {
        const draft = await db.get(draftKey(db, item));
        if (draft?.id === item.id && !!draft.fixture === !!item.fixture) saved = await imageAt(draft.src);
      } catch (error) { readFailed = true; }
      if (token !== generation || !root.isConnected) return;
      edit(item, source, saved, readFailed);
    } catch (error) {
      if (token !== generation) return;
      loading.textContent = '這張線稿暫時讀不到。';
      cancel.textContent = '返回選圖';
    }
  }

  function edit(item, source, saved, readFailed) {
    const width = source.naturalWidth || source.width, height = source.naturalHeight || source.height;
    const workspace = el('div', 'sf-coloring-workspace');
    const zoomBar = el('div', 'sf-coloring-zoom');
    const viewport = el('div', 'sf-coloring-viewport');
    viewport.setAttribute('aria-label', '上色畫布');
    const sheet = el('div', 'sf-coloring-sheet');
    const paint = el('canvas', 'sf-coloring-paint');
    const line = el('canvas', 'sf-coloring-line');
    const mask = el('canvas');
    for (const canvas of [paint, line, mask]) {
      canvas.width = width;
      canvas.height = height;
    }
    const ctx = paint.getContext('2d', { willReadFrequently: true });
    const ink = line.getContext('2d');
    const scratch = mask.getContext('2d');
    ink.drawImage(source, 0, 0);
    const linePixels = ink.getImageData(0, 0, width, height).data;
    if (saved) ctx.drawImage(saved, 0, 0, width, height);
    const history = coloringHistory(ctx);
    sheet.append(paint, line);
    viewport.append(sheet);
    workspace.append(zoomBar, viewport);

    const tray = el('aside', 'sf-coloring-tray');
    tray.setAttribute('aria-label', '著色工具');
    const actions = el('div', 'sf-coloring-row');
    const palette = el('div', 'sf-coloring-palette');
    palette.setAttribute('aria-label', '已解鎖顏色');
    const recents = el('div', 'sf-coloring-recent');
    recents.setAttribute('aria-label', '最近使用的顏色');
    const settings = el('div', 'sf-coloring-settings');
    const operations = el('div', 'sf-coloring-row');
    const saveStatus = el('div', 'sf-coloring-save', readFailed ? '草稿讀取失敗' : saved ? '已載入草稿' : '自動儲存草稿');
    saveStatus.setAttribute('role', 'status');
    const editor = el('div', 'sf-coloring-editor');
    editor.append(workspace, tray);
    const dialog = el('dialog', 'sf-coloring-dialog');
    const dialogContent = el('div', 'sf-coloring-dialog-content');
    const dismiss = button('回到著色', () => dialog.close());
    const dialogHead = el('header', 'sf-coloring-row');
    const dialogTitle = el('strong');
    dialogTitle.id = 'sf-coloring-dialog-title';
    dialog.setAttribute('aria-labelledby', dialogTitle.id);
    dialogHead.append(dialogTitle, dismiss);
    dialog.append(dialogHead, dialogContent);
    editor.append(dialog);

    let tool = 'fill', baseColor = colors[0].hex, light = 0;
    let walls, wallTolerance;
    let zoom = 1, offsetX = 0, offsetY = 0, scale = 1;
    let draftWrite = 0;
    const toolButtons = new Map();
    const swatches = new Map();
    const press = (node, current) => node.setAttribute('aria-pressed', String(current));
    for (const [id, text] of [['fill', '填色'], ['brush', '筆刷'], ['erase', '橡皮擦'], ['pick', '滴管']]) {
      const control = button(text, () => { tool = id; refresh(); });
      control.dataset.coloringTool = id;
      toolButtons.set(id, control);
      actions.append(control);
    }

    const value = input => Number(input.value);
    function slider(label, min, max, start, suffix = '') {
      const field = el('label', 'sf-coloring-slider');
      const input = el('input');
      input.type = 'range'; input.min = min; input.max = max; input.value = start;
      input.setAttribute('aria-label', label);
      const output = el('output', '', start + suffix);
      input.addEventListener('input', () => { output.textContent = input.value + suffix; });
      field.append(el('span', '', label), input, output);
      settings.append(field);
      return input;
    }
    const shadeInput = slider('明暗', -100, 100, 0);
    const tolerance = slider('填色容差', 0, 250, 145);
    const size = slider('筆尖大小', 2, 120, 30, ' px');
    const opacity = slider('不透明度', 5, 100, 85, '%');
    shadeInput.addEventListener('input', () => { light = value(shadeInput); refresh(); });
    const paintColor = () => shade(baseColor, light);

    function setColor(color) {
      baseColor = color; light = 0;
      shadeInput.value = 0;
      shadeInput.dispatchEvent(new Event('input'));
      if (tool === 'erase' || tool === 'pick') tool = 'brush';
      refresh();
    }
    function swatch(color, name, action) {
      const control = button('', action, 'sf-coloring-swatch');
      control.style.setProperty('--paint', color);
      control.title = name;
      control.setAttribute('aria-label', name);
      return control;
    }
    for (const { hex, name } of colors) {
      const control = swatch(hex, name, () => setColor(hex));
      swatches.set(hex, control);
      palette.append(control);
    }
    const sample = el('span', 'sf-coloring-sample');
    sample.setAttribute('role', 'img');
    function remember(color) {
      recent = [color, ...recent.filter(item => item !== color)].slice(0, 6);
      if (!recents.contains(document.activeElement)) renderRecent();
    }
    function renderRecent() {
      recents.replaceChildren(el('span', '', '最近'), ...recent.map(color => swatch(color, '最近使用 ' + color, () => setColor(color))));
    }
    renderRecent();
    recents.addEventListener('focusout', event => {
      if (!recents.contains(event.relatedTarget)) renderRecent();
    });

    const undo = button('復原', () => { if (history.undo()) changed(); });
    const redo = button('重做', () => { if (history.redo()) changed(); });
    const clear = button('清除全部', () => {
      const confirm = button('清除', () => {
        history.capture(0, 0, width, height);
        ctx.clearRect(0, 0, width, height);
        if (history.commit()) changed();
        dialog.close();
      });
      const cancel = button('取消', () => dialog.close());
      const row = el('div', 'sf-coloring-row');
      row.append(cancel, confirm);
      dialogTitle.textContent = '清除全部顏色？';
      dialogContent.replaceChildren(row);
      dismiss.hidden = true;
      dialog.showModal();
      cancel.focus();
    });
    operations.append(undo, redo, clear);

    const lookBox = el('div', 'sf-coloring-look');
    const openReply = button('看晨的回覆', showLook);
    openReply.hidden = true;
    const lookRoot = el('div');
    const look = drawingLook(lookRoot, deps, {
      hasPaint: () => ctx.getImageData(0, 0, width, height).data.some((channel, i) => i % 4 === 3 && channel !== 0),
      image: () => composite(paint, line),
      emptyMessage: '先塗點顏色，再給晨看。',
      savedMessage: '這張畫收進畫架展廳的「我畫的」。',
      onSubmit() { phrase.textContent = say('done'); showLook(); },
      onResult() { openReply.hidden = false; }
    });
    lookBox.append(look.status, look.result);
    lookRoot.append(lookBox);
    editor.append(lookRoot);
    lookRoot.hidden = true;
    function showLook() {
      openReply.hidden = false;
      dialogTitle.textContent = '讓晨看看';
      dismiss.hidden = false;
      dialogContent.replaceChildren(lookBox);
      if (!dialog.open) dialog.showModal();
    }
    dialog.addEventListener('close', () => {
      if (!dialog.open && dialogContent.contains(lookBox)) lookRoot.append(lookBox);
    });
    // 點空白草稿的提示也要看得到。
    const lookButton = look.actions.querySelector('button');
    lookButton.addEventListener('click', () => {
      if (!dialog.open && look.status.textContent) showLook();
    });
    const controls = el('div', 'sf-coloring-controls');
    controls.append(actions, palette, recents, settings, operations);
    const footer = el('div', 'sf-coloring-footer');
    footer.append(look.actions, openReply, saveStatus);
    tray.append(controls, footer);
    const current = el('div', 'sf-coloring-now');
    current.append(el('span', '', '目前顏色'), sample);
    settings.prepend(current);

    function refresh() {
      for (const [id, control] of toolButtons) press(control, id === tool);
      for (const [hex, control] of swatches) press(control, baseColor === hex);
      viewport.dataset.tool = tool;
      sample.style.setProperty('--paint', paintColor());
      sample.setAttribute('aria-label', '目前的顏色 ' + paintColor());
      tolerance.parentElement.hidden = tool !== 'fill';
      size.parentElement.hidden = opacity.parentElement.hidden = !['brush', 'erase'].includes(tool);
      undo.disabled = !history.canUndo;
      redo.disabled = !history.canRedo;
    }

    function changed() {
      refresh();
      const serial = ++draftWrite;
      saveStatus.textContent = '儲存中…';
      // 同一張草稿的寫入按操作順序進入儲存，返回選圖後重開會等待最後一筆。
      let save;
      try {
        const snapshot = document.createElement('canvas');
        snapshot.width = width; snapshot.height = height;
        snapshot.getContext('2d').drawImage(paint, 0, 0);
        save = writes.then(() => saveDraft(db, item, snapshot));
      } catch (error) { save = Promise.reject(error); }
      writes = save.then(() => {
        if (serial === draftWrite) saveStatus.textContent = '草稿已儲存';
      }, () => {
        if (serial === draftWrite) saveStatus.textContent = '草稿無法儲存';
      });
    }

    const minus = button('−', () => zoomAt(zoom / 1.35, viewport.clientWidth / 2, viewport.clientHeight / 2));
    const plus = button('＋', () => zoomAt(zoom * 1.35, viewport.clientWidth / 2, viewport.clientHeight / 2));
    minus.setAttribute('aria-label', '縮小');
    plus.setAttribute('aria-label', '放大');
    const fit = button('整張', () => { zoom = 1; offsetX = offsetY = 0; layout(); });
    const percentage = el('output', '', '100%');
    const title = el('strong', 'sf-coloring-name', item.title);
    zoomBar.append(title, minus, percentage, plus, fit);

    function constrain(offset, extent, view) {
      const excess = Math.max(0, (extent - view) / 2);
      return Math.max(-excess, Math.min(excess, offset));
    }
    function layout() {
      const w = viewport.clientWidth, h = viewport.clientHeight;
      if (!w || !h) return;
      scale = Math.min(w / width, h / height) * zoom;
      offsetX = constrain(offsetX, width * scale, w);
      offsetY = constrain(offsetY, height * scale, h);
      sheet.style.width = width * scale + 'px';
      sheet.style.height = height * scale + 'px';
      sheet.style.left = (w - width * scale) / 2 + offsetX + 'px';
      sheet.style.top = (h - height * scale) / 2 + offsetY + 'px';
      percentage.textContent = Math.round(zoom * 100) + '%';
      minus.disabled = zoom <= 1;
      plus.disabled = zoom >= 8;
    }
    function zoomAt(next, x, y, toX = x, toY = y) {
      next = Math.min(8, Math.max(1, next));
      const ratio = next / zoom;
      const centerX = viewport.clientWidth / 2, centerY = viewport.clientHeight / 2;
      offsetX = toX - centerX - (x - centerX - offsetX) * ratio;
      offsetY = toY - centerY - (y - centerY - offsetY) * ratio;
      zoom = next;
      layout();
    }
    viewport.addEventListener('wheel', event => {
      event.preventDefault();
      if (pointers.size) return;
      const box = viewport.getBoundingClientRect();
      const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1;
      zoomAt(zoom * Math.exp(-event.deltaY * units * 0.002), event.clientX - box.left, event.clientY - box.top);
    }, { passive: false });

    function paperPoint({ clientX, clientY }) {
      const rect = sheet.getBoundingClientRect();
      return [(clientX - rect.left) * width / rect.width, (clientY - rect.top) * height / rect.height];
    }
    function inside([x, y]) { return x >= 0 && y >= 0 && x < width && y < height; }
    function fill([x, y]) {
      const threshold = value(tolerance);
      if (wallTolerance !== threshold) {
        walls = coloringWalls(linePixels, width, height, threshold);
        wallTolerance = threshold;
      }
      const { cells, bounds } = coloringRegion(walls, width, height, Math.floor(x), Math.floor(y));
      if (!cells.length) return;
      const [left, top, right, bottom] = bounds;
      const w = right - left;
      history.capture(...bounds);
      const image = ctx.getImageData(left, top, w, bottom - top);
      const color = paintColor();
      const rgb = parseInt(color.slice(1), 16);
      for (const cell of cells) {
        const at = ((Math.floor(cell / width) - top) * w + cell % width - left) * 4;
        image.data[at] = rgb >> 16;
        image.data[at + 1] = (rgb >> 8) & 255;
        image.data[at + 2] = rgb & 255;
        image.data[at + 3] = 255;
      }
      ctx.putImageData(image, left, top);
      if (history.commit()) { remember(color); changed(); }
    }
    function dropper([x, y]) {
      const [r, g, b, alpha] = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
      if (!alpha) return;
      const color = '#' + [r, g, b].map(channel => channel.toString(16).padStart(2, '0')).join('');
      remember(color);
      setColor(color);
    }

    function beginStroke(point) {
      const diameter = value(size), color = paintColor(), eraser = tool === 'erase';
      const tip = el('canvas');
      tip.width = tip.height = diameter;
      const tipCtx = tip.getContext('2d');
      const radius = diameter / 2;
      const gradient = tipCtx.createRadialGradient(radius, radius, radius * 0.32, radius, radius, radius);
      gradient.addColorStop(0, color);
      gradient.addColorStop(0.72, color + 'a0');
      gradient.addColorStop(1, color + '00');
      tipCtx.fillStyle = gradient;
      tipCtx.fillRect(0, 0, diameter, diameter);
      stroke = { last: point, tip, radius, color, eraser, alpha: value(opacity) / 100 };
      brushTo(point, true);
    }
    function brushTo(point, first = false) {
      const { last, tip, radius, eraser, alpha } = stroke;
      const [x, y] = point, [px, py] = last;
      const distance = Math.hypot(x - px, y - py);
      if (!first && distance < 0.25) return;
      const count = Math.max(1, Math.ceil(distance / Math.max(1, radius * 0.45)));
      for (let i = 1; i <= count; i++) {
        scratch.drawImage(tip, px + (x - px) * i / count - radius, py + (y - py) * i / count - radius);
      }
      const pad = radius + 2;
      const bounds = [Math.min(x, px) - pad, Math.min(y, py) - pad, Math.max(x, px) + pad, Math.max(y, py) + pad];
      ctx.globalAlpha = alpha;
      ctx.globalCompositeOperation = eraser ? 'destination-out' : 'source-over';
      history.preview(bounds, ({ x, y, w, h }) => ctx.drawImage(mask, x, y, w, h, x, y, w, h));
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      stroke.last = point;
    }
    function endStroke(keep) {
      if (!stroke) return;
      if (!keep) history.cancel();
      else if (history.commit()) {
        if (!stroke.eraser) remember(stroke.color);
        changed();
      }
      scratch.clearRect(0, 0, width, height);
      stroke = null;
    }

    const pointers = new Map();
    let stroke, gesture, startPoint, pinch, originalTool;
    function center() {
      const [a, b] = pointers.values();
      const box = viewport.getBoundingClientRect();
      return [(a.clientX + b.clientX) / 2 - box.left, (a.clientY + b.clientY) / 2 - box.top,
        Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)];
    }
    viewport.addEventListener('pointerdown', event => {
      if (event.button !== 0 && event.button !== 1) return;
      event.preventDefault();
      try { viewport.setPointerCapture(event.pointerId); } catch (error) { /* 合成事件沒有實體指標 */ }
      pointers.set(event.pointerId, event);
      if (pointers.size >= 2) {
        endStroke(false);
        gesture = 'pinch';
        pinch = center();
        return;
      }
      gesture = event.button === 1 ? 'pan' : 'draw';
      originalTool = tool;
      startPoint = [event.clientX, event.clientY];
      const point = paperPoint(event);
      if (gesture === 'draw' && inside(point) && ['brush', 'erase'].includes(tool)) beginStroke(point);
    });
    viewport.addEventListener('pointermove', event => {
      const previous = pointers.get(event.pointerId);
      if (!previous) return;
      pointers.set(event.pointerId, event);
      if (gesture === 'pinch' && pointers.size >= 2) {
        const next = center();
        zoomAt(zoom * Math.max(1, next[2]) / Math.max(1, pinch[2]), pinch[0], pinch[1], next[0], next[1]);
        pinch = next;
      } else if (gesture === 'pan') {
        offsetX += event.clientX - previous.clientX;
        offsetY += event.clientY - previous.clientY;
        layout();
      } else if (stroke) brushTo(paperPoint(event));
    });
    function release(event) {
      if (!pointers.delete(event.pointerId)) return;
      const keep = event.type === 'pointerup';
      if (gesture === 'draw') {
        if (stroke && keep) brushTo(paperPoint(event));
        endStroke(keep);
        if (keep && Math.hypot(event.clientX - startPoint[0], event.clientY - startPoint[1]) < 8) {
          const point = paperPoint(event);
          if (inside(point) && originalTool === 'fill') fill(point);
          if (inside(point) && originalTool === 'pick') dropper(point);
        }
      }
      if (!pointers.size) gesture = null;
      else if (gesture === 'pinch' && pointers.size >= 2) pinch = center();
    }
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) viewport.addEventListener(type, release);
    viewport.addEventListener('contextmenu', event => event.preventDefault());

    panel.dataset.design = 'coloring-play';
    panel.classList.remove('sf-wide');
    panel.querySelector('#panel-title').textContent = '晨的著色本';
    scrollBox.scrollTop = 0;
    content.replaceChildren(editor);
    const resize = new ResizeObserver(layout);
    resize.observe(viewport);
    layout();
    refresh();
    toolButtons.get(tool).focus({ preventScroll: true });
    interrupt = () => {
      if (dialog.open) { dialog.close(); return true; }
      if (pointers.size && gesture !== 'canceled') { endStroke(false); gesture = 'canceled'; return true; }
      return false;
    };
    disposeEditor = () => { resize.disconnect(); endStroke(false); dialog.close(); };
    root.coloringBack = () => { panel.querySelector('#panel-title').textContent = '著色本'; pick(); return true; };
    root.coloringEscape = () => interrupt() || root.coloringBack();
  }

  content.append(el('p', 'sf-status', '正在翻開著色本…'));
  const token = generation;
  try {
    const [items, progress] = await Promise.all([loadSources(), deps.progress()]);
    if (generation !== token || !root.isConnected) return;
    sources = items.filter(item => deps.all || deps.seen?.has(item.id));
    const open = unlockedColors(progress);
    colors = DRAW_COLORS.filter(color => open.has(color.id));
    pick();
  } catch (error) {
    if (generation === token) content.replaceChildren(el('p', 'sf-status', '線稿清單暫時讀不到，請重新打開著色本。'));
  }
}

function composite(paint, line) {
  const image = document.createElement('canvas');
  image.width = Math.min(CANVAS_W, paint.width);
  image.height = Math.round(paint.height * image.width / paint.width);
  const ctx = image.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, image.width, image.height);
  ctx.drawImage(paint, 0, 0, image.width, image.height);
  ctx.drawImage(line, 0, 0, image.width, image.height);
  return image.toDataURL('image/jpeg', 0.85);
}
