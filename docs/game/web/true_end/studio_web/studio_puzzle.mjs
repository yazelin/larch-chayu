import { group1Line } from './studio_lines_group1.mjs';

const SAVE_KEY = 'studioPuzzle';
const PIECES = [9, 16, 25, 36];
const AREAS = ['左上', '上面', '右上', '左邊', '中間', '右邊', '左下', '下面', '右下'];
const say = (key, values) => group1Line('chen', key, values);
const SVG_NS = 'http://www.w3.org/2000/svg';
const CELL_SIZE = 100;
// The extra space fits the 22-unit tabs, stroke, and shadow.
const PIECE_PADDING = 27;
const PIECE_SIZE = CELL_SIZE + 2 * PIECE_PADDING;
let clipId = 0;

export function puzzleEdges(imageId, count) {
  let seed = 2166136261;
  for (const character of JSON.stringify([imageId, count])) {
    seed = Math.imul(seed ^ character.codePointAt(0), 16777619);
  }
  function nextEdge() {
    seed = (seed + 0x9e3779b9) | 0;
    let value = Math.imul(seed ^ (seed >>> 16), 0x21f0aaad);
    value = Math.imul(value ^ (value >>> 15), 0x735a2d97);
    return (value ^ (value >>> 15)) < 0 ? -1 : 1;
  }

  const side = Math.sqrt(count);
  const edges = [];
  for (let index = 0; index < count; index++) {
    const row = Math.floor(index / side);
    const col = index % side;
    const top = row === 0 ? 0 : -edges[index - side][2];
    const right = col === side - 1 ? 0 : nextEdge();
    const bottom = row === side - 1 ? 0 : nextEdge();
    const left = col === 0 ? 0 : -edges[index - 1][1];
    edges.push([top, right, bottom, left]);
  }
  return edges;
}

// The profile is symmetric along the edge, so reversing it and changing
// its sign traces exactly the same cut from the neighboring cell.
const TAB_CURVES = [
  [[43, 0], [45, 2], [45, 5]],
  [[45, 8], [38, 8], [38, 15]],
  [[38, 19], [43, 22], [50, 22]],
  [[57, 22], [62, 19], [62, 15]],
  [[62, 8], [55, 8], [55, 5]],
  [[55, 2], [57, 0], [64, 0]]
];

export function puzzlePiecePath(edges) {
  const mapPoint = [
    (along, out) => [along, -out],
    (along, out) => [CELL_SIZE + out, along],
    (along, out) => [CELL_SIZE - along, CELL_SIZE + out],
    (along, out) => [-out, CELL_SIZE - along]
  ];
  const commands = edges.map((edge, side) => {
    const point = (along, out) => mapPoint[side](along, out * edge).join(' ');
    const end = 'L' + point(CELL_SIZE, 0);
    if (!edge) return end;
    const curves = TAB_CURVES.map(curve => 'C' + curve.map(([x, y]) => point(x, y)).join(' '));
    return ['L' + point(36, 0), ...curves, end].join(' ');
  });
  return ['M0 0', ...commands, 'Z'].join(' ');
}

function svgElement(tag, attrs) {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, value);
  return node;
}

function pieceShape() {
  const viewBox = [-PIECE_PADDING, -PIECE_PADDING, PIECE_SIZE, PIECE_SIZE].join(' ');
  return svgElement('svg', { class: 'sf-puzzle-shape', viewBox, 'aria-hidden': 'true' });
}

export function puzzleTime(ms) {
  const seconds = Math.floor(ms / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}

// 拼好的標記：圖的右下角寫「36 片」，滑鼠移上去看最佳時間
export function puzzleBadge(el, best) {
  const badge = el('span', 'sf-puzzle-badge', best[1] + ' 片');
  badge.title = '拼好了・' + best[1] + ' 片最快 ' + puzzleTime(best[2]);
  return badge;
}

// 拼圖紀錄的存法（2026-11-28 改，作者要看過的 CG 全部都留標記）：
// v2 是一行字「2;」接每筆「縮寫 id|片數|毫秒(36 進位)」用分號隔開，排在越後面越新。
// 一筆約 20～30 字；Larch 版存在 studioPuzzle0～7 共 8 格 × 1900 字（studio_storage.js），
// 裝滿才從最舊的擠掉，393 張劇情 CG 加晨的畫都放得下。舊的 v1（JSON、最多 60 筆）照樣讀得到。
export const PUZZLE_SAVE_CHARS = 8 * 1900 - 100;
const ID_SHORT = [['cg:', 'c'], ['art:', 'a'], ['image:', 'i'], ['drawing:', 'd']];
const shortId = id => { for (const [long, short] of ID_SHORT) if (id.startsWith(long)) return short + id.slice(long.length); return null; };
const longId = id => { for (const [long, short] of ID_SHORT) if (id.startsWith(short)) return long + id.slice(short.length); return null; };

export function encodePuzzleBests(rows) {
  const parts = rows.map(([id, pieces, ms]) => shortId(id) && shortId(id) + '|' + pieces + '|' + Math.round(ms).toString(36)).filter(Boolean);
  let text = '2;' + parts.join(';');
  while (text.length > PUZZLE_SAVE_CHARS && parts.length) { parts.shift(); text = '2;' + parts.join(';'); }
  return text;
}

export function decodePuzzleBests(text) {
  const map = new Map();
  if (typeof text !== 'string' || !text) return map;
  if (text.startsWith('2;')) {
    text.slice(2).split(';').forEach((part, order) => {
      const [short, pieces, ms] = part.split('|');
      const id = short && longId(short);
      if (id && pieces && ms) map.set(id, [id, Number(pieces), parseInt(ms, 36), order]);
    });
    return map;
  }
  try {
    const saved = JSON.parse(text);
    if (saved?.v === 1 && Array.isArray(saved.best)) [...saved.best].sort((a, b) => a[3] - b[3]).forEach(row => map.set(row[0], row));
  } catch { /* 無法讀取的紀錄 */ }
  return map;
}

export async function readPuzzleBests(db) {
  try { return decodePuzzleBests(await db.get(SAVE_KEY)); }
  catch { return new Map(); }
}

function shuffled(length) {
  const order = Array.from({ length }, (_, index) => index);
  for (let i = length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  if (order.every((value, index) => value === index)) order.push(order.shift());
  return order;
}

function quarterTurn(x, y, turn) {
  return [{ x, y }, { x: -y, y: x }, { x: -x, y: -y }, { x: y, y: -x }][turn];
}

export function renderPuzzle(root, { el, button, avatar, db, sources, initial }) {
  const shell = el('section', 'sf-puzzle');
  const scrollBox = root.parentElement;
  const panel = root.closest('#panel');
  const dialogue = el('div', 'sf-group1-dialogue');
  const portrait = el('img');
  portrait.src = avatar;
  portrait.alt = '晨';
  const speech = el('div');
  speech.setAttribute('role', 'status');
  dialogue.append(portrait, speech);
  const content = el('div', 'sf-puzzle-content');
  shell.append(dialogue, content);
  root.append(shell);

  let image;
  let count;
  let side;
  let edges;
  let paths;
  let startedAt;
  let board;
  let frame;
  let guide;
  let groups;
  let tiles;
  let table;
  let observer;
  let order;
  let drag;
  let flash;
  let hintedTiles = [];
  let layerOrder;
  let solved;
  let rotationEnabled = true;
  let ratio;
  let generation = 0;

  function speak(...lines) {
    speech.replaceChildren(...lines.map(line => el('p', '', line)));
  }

  let bests = new Map();
  readPuzzleBests(db).then(map => { bests = map; if (!image) pickImage(); });

  function pickImage(line = 'pick_image') {
    generation++;
    root.puzzleEscape = null;
    speak(say(line));
    content.replaceChildren();
    for (const [label, rows] of sources) {
      if (!rows.length) continue;
      const group = el('section', 'sf-puzzle-images');
      group.append(el('h3', '', label));
      const grid = el('div', 'sf-grid');
      for (const item of rows) {
        const card = button('', () => pickPieces(item), 'sf-puzzle-source');
        card.dataset.puzzleImage = item.id;
        const photo = el('img');
        photo.src = item.src;
        photo.loading = 'lazy';
        photo.alt = '';
        const thumb = el('span', 'sf-puzzle-thumb');
        thumb.append(photo);
        const best = bests.get(item.id);
        if (best) thumb.append(puzzleBadge(el, best));
        card.append(thumb, el('span', '', item.title));
        grid.append(card);
      }
      group.append(grid);
      content.append(group);
    }
    if (!content.children.length) content.append(el('p', 'sf-empty', '目前還沒有可以拼的畫。'));
  }

  function returnToImages(line) {
    leaveTable();
    panel.dataset.design = 'puzzle';
    pickImage(line);
    scrollBox.scrollTop = 0;
    (content.querySelector('.sf-puzzle-source') || panel.querySelector('#panel-close')).focus({ preventScroll: true });
    return true;
  }

  function pickPieces(item) {
    image = item;
    generation++;
    speak(say('pick_pieces'));
    const choices = el('div', 'sf-puzzle-tools');
    for (const size of PIECES) choices.append(button(size + ' 片', () => loadImage(size)));
    const name = el('h3', '', item.title);
    const back = button('取消', () => pickImage());
    const rotateOption = el('label', 'sf-puzzle-rotation');
    const checkbox = el('input');
    checkbox.type = 'checkbox';
    checkbox.checked = rotationEnabled;
    checkbox.addEventListener('change', () => { rotationEnabled = checkbox.checked; });
    rotateOption.append(checkbox, '碎片會旋轉');
    choices.append(rotateOption, back);
    content.replaceChildren(name, choices);

    function loadImage(size) {
      const preview = new Image();
      const loaded = ++generation;
      const status = el('p', 'sf-status', '正在讀取圖片……');
      status.setAttribute('role', 'status');
      content.replaceChildren(name, el('div', 'sf-puzzle-tools'));
      content.lastElementChild.append(back);
      content.append(status);
      back.focus();
      preview.onload = () => {
        if (loaded !== generation || !root.isConnected) return;
        ratio = preview.naturalWidth / preview.naturalHeight;
        start(size);
      };
      preview.onerror = () => {
        if (loaded !== generation || !root.isConnected) return;
        pickPieces(item);
        content.append(el('p', 'sf-status', '這張圖暫時讀不到。'));
      };
      preview.src = item.src;
    }
    root.puzzleEscape = () => {
      pickImage();
      return true;
    };
  }

  function decorate(tile, index) {
    const shape = pieceShape();
    const id = 'studio-puzzle-cut-' + ++clipId;
    const clip = svgElement('clipPath', { id });
    const path = paths[index];
    clip.append(svgElement('path', { d: path }));
    const square = side * CELL_SIZE;
    const width = square * Math.max(1, ratio);
    const height = square * Math.max(1, 1 / ratio);
    const photo = svgElement('image', {
      href: image.src,
      x: (square - width) / 2 - (index % side) * CELL_SIZE,
      y: (square - height) / 2 - Math.floor(index / side) * CELL_SIZE,
      width, height,
      preserveAspectRatio: 'none',
      'clip-path': 'url(#' + id + ')'
    });
    const outline = svgElement('path', {
      class: 'sf-puzzle-outline', d: path, 'vector-effect': 'non-scaling-stroke'
    });
    shape.append(clip, photo, outline);
    tile.replaceChildren(shape);
  }

  function start(size, previousOrder) {
    leaveTable();
    count = size;
    side = Math.sqrt(count);
    edges = puzzleEdges(image.id, count);
    paths = edges.map(puzzlePiecePath);
    order = shuffled(count);
    if (previousOrder && order.every((index, i) => index === previousOrder[i])) order.push(order.shift());
    groups = new Set();
    tiles = [];
    table = null;
    layerOrder = 0;
    solved = false;
    startedAt = Date.now();
    if (!previousOrder) speak(say('start'));
    const tools = el('div', 'sf-puzzle-tools');
    const original = button('看原圖', null, 'sf-puzzle-peek');
    const hint = button('提示', showHint);
    const again = button('重新打散', () => start(count, order));
    const abandon = button('放棄', giveUp);
    tools.append(original, hint, again, abandon);
    board = el('div', 'sf-puzzle-board');
    board.setAttribute('aria-label', '拼圖桌面');
    board.style.setProperty('--puzzle-shape-scale', PIECE_SIZE / CELL_SIZE);
    frame = el('div', 'sf-puzzle-frame');
    frame.setAttribute('aria-hidden', 'true');
    const pieces = el('div', 'sf-puzzle-pieces');
    guide = el('div', 'sf-puzzle-hint');
    guide.hidden = true;
    guide.append(pieceShape());
    const photo = el('img', 'sf-puzzle-original');
    photo.src = image.src;
    photo.alt = image.title;
    photo.hidden = true;
    board.append(frame, pieces, guide, photo);
    const hide = () => { photo.hidden = true; };
    original.addEventListener('pointerdown', event => {
      original.setPointerCapture(event.pointerId);
      photo.hidden = false;
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) original.addEventListener(type, hide);
    original.addEventListener('keydown', event => {
      if ([' ', 'Enter'].includes(event.key)) { event.preventDefault(); photo.hidden = false; }
    });
    original.addEventListener('keyup', hide);

    for (const index of order) {
      const node = el('div', 'sf-puzzle-group');
      const group = { node, members: [], turn: rotationEnabled ? Math.floor(Math.random() * 4) : 0 };
      const piece = button('', event => { if (event.detail === 0) dropGroup(tile.group); }, 'sf-puzzle-piece');
      const tile = {
        index, piece, group,
        col: index % side, row: Math.floor(index / side)
      };
      piece.dataset.puzzlePiece = index;
      piece.style.setProperty('--col', tile.col);
      piece.style.setProperty('--row', tile.row);
      decorate(piece, index);
      tile.neighbors = [-side, 1, side, -1].flatMap((step, edge) => edges[index][edge] ? [index + step] : []);
      group.members.push(tile);
      groups.add(group);
      tiles[index] = tile;
      node.append(piece);
      pieces.append(node);
      piece.addEventListener('pointerdown', event => grab(event, tile));
      piece.addEventListener('keydown', event => moveWithKeys(event, tile));
    }
    board.addEventListener('pointermove', moveDrag);
    board.addEventListener('pointerup', releaseDrag);
    for (const type of ['pointercancel', 'lostpointercapture']) {
      board.addEventListener(type, event => { if (drag?.id === event.pointerId) stopDrag(); });
    }
    board.addEventListener('contextmenu', event => event.preventDefault());

    content.replaceChildren(tools, board);
    panel.dataset.design = 'puzzle-play';
    root.puzzleBack = returnToImages;
    root.puzzleEscape = () => {
      if (drag) stopDrag();
      else if (!photo.hidden) hide();
      else giveUp();
      return true;
    };
    scrollBox.scrollTop = 0;
    resizeTable();
    observer = new ResizeObserver(resizeTable);
    observer.observe(board);
    original.focus({ preventScroll: true });
  }

  function resizeTable() {
    const width = board.clientWidth;
    const height = board.clientHeight;
    if (!width || !height || (table?.width === width && table.height === height)) return;
    const old = table;
    const columns = Math.min(count, Math.max(1, Math.round(Math.sqrt(count * width / height))));
    const rows = Math.ceil(count / columns);
    const slotWidth = width / columns;
    const slotHeight = height / rows;
    const unit = Math.min(width, height) * 0.82 / side;
    const cell = Math.min(unit, slotWidth / 1.38, slotHeight / 1.38);
    const frameX = (width - cell * (side - 1)) / 2;
    const frameY = (height - cell * (side - 1)) / 2;
    table = { width, height, cell, frameX, frameY };
    board.style.setProperty('--puzzle-unit', cell + 'px');
    frame.style.left = frameX - cell / 2 + 'px';
    frame.style.top = frameY - cell / 2 + 'px';
    frame.style.width = frame.style.height = side * cell + 'px';
    stopDrag();
    hideHint();

    const slots = old ? [] : shuffled(columns * rows);
    for (const [i, group] of [...groups].entries()) {
      group.animation?.cancel();
      if (old) {
        group.x = frameX + (group.x - old.frameX) * cell / old.cell;
        group.y = frameY + (group.y - old.frameY) * cell / old.cell;
        position(group, group.x, group.y);
      } else {
        const slot = slots[i];
        const x = (slot % columns + 0.5) * slotWidth + (Math.random() - 0.5) * (slotWidth - cell);
        const y = (Math.floor(slot / columns) + 0.5) * slotHeight + (Math.random() - 0.5) * (slotHeight - cell);
        const offset = tileOffset(group.members[0], group.turn);
        position(group, x - offset.x, y - offset.y);
      }
    }
  }

  // All pieces use coordinates relative to the center of the original top-left
  // piece. A group can use that same origin even if it has yet to find that piece.
  function tileOffset(tile, turn) {
    const offset = quarterTurn(tile.col, tile.row, turn);
    return { x: offset.x * table.cell, y: offset.y * table.cell };
  }

  function renderPose(group) {
    group.node.style.transform = `translate(${group.x}px, ${group.y}px) rotate(${group.turn * 90}deg)`;
    if (group.node.dataset.turn === String(group.turn)) return;
    group.node.dataset.turn = group.turn;
    for (const { index, piece } of group.members) {
      piece.setAttribute('aria-label', '拼圖片 ' + (index + 1) + '，' + group.turn * 90 + ' 度');
    }
  }

  function limits(group) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const tile of group.members) {
      const [top, right, bottom, left] = edges[tile.index];
      const before = edge => 0.5 + (edge > 0 ? 0.22 : 0);
      const a = quarterTurn(tile.col - before(left), tile.row - before(top), group.turn);
      const b = quarterTurn(tile.col + before(right), tile.row + before(bottom), group.turn);
      minX = Math.min(minX, a.x, b.x);
      minY = Math.min(minY, a.y, b.y);
      maxX = Math.max(maxX, a.x, b.x);
      maxY = Math.max(maxY, a.y, b.y);
    }
    const { cell, width, height } = table;
    return { left: 2 - minX * cell, right: width - 2 - maxX * cell,
      top: 2 - minY * cell, bottom: height - 2 - maxY * cell };
  }

  function position(group, x, y) {
    const { left, right, top, bottom } = limits(group);
    group.x = Math.max(left, Math.min(x, right));
    group.y = Math.max(top, Math.min(y, bottom));
    renderPose(group);
  }

  function raise(group) {
    group.animation?.cancel();
    group.node.style.zIndex = ++layerOrder;
  }

  function grab(event, tile) {
    if (event.button !== 0 || drag || solved) return;
    const { piece, group } = tile;
    piece.focus({ preventScroll: true });
    raise(group);
    piece.setPointerCapture(event.pointerId);
    board.classList.add('held');
    drag = { tile, id: event.pointerId, x: event.clientX, y: event.clientY,
      startX: group.x, startY: group.y, moved: false };
  }

  function moveDrag(event) {
    if (drag?.id !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    position(drag.tile.group, drag.startX + dx, drag.startY + dy);
  }

  function releaseDrag(event) {
    if (drag?.id !== event.pointerId) return;
    moveDrag(event);
    const { tile, moved } = drag;
    stopDrag();
    if (moved) dropGroup(tile.group);
    else rotate(tile);
  }

  function stopDrag() {
    if (!drag) return;
    const { id, tile } = drag;
    drag = null;
    board.classList.remove('held');
    if (tile.piece.hasPointerCapture(id)) tile.piece.releasePointerCapture(id);
  }

  function moveWithKeys(event, tile) {
    if (solved || drag || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const { group } = tile;
    const steps = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    const step = steps[event.key];
    if (step) {
      raise(group);
      const distance = event.shiftKey ? table.cell / 2 : table.cell / 8;
      position(group, group.x + step[0] * distance, group.y + step[1] * distance);
    } else if (event.key.toLowerCase() === 'r') {
      if (!event.repeat) rotate(tile);
    } else if (event.key === 'Enter') {
      if (!event.repeat) dropGroup(group);
    } else return;
    event.preventDefault();
  }

  function rotate(tile) {
    if (!rotationEnabled) return;
    const { group } = tile;
    raise(group);
    const turn = group.turn;
    const pivot = tileOffset(tile, turn);
    const x = group.x + pivot.x;
    const y = group.y + pivot.y;
    group.turn = (turn + 1) % 4;
    const next = tileOffset(tile, group.turn);
    position(group, x - next.x, y - next.y);
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dropGroup(group);
      return;
    }

    // Rotate about the selected tile, including any shift needed at the table edge.
    const local = tileOffset(tile, 0);
    const pose = (px, py, angle) =>
      `translate(${px}px, ${py}px) rotate(${angle}deg) translate(${-local.x}px, ${-local.y}px)`;
    group.animation = group.node.animate([
      { transform: pose(x, y, turn * 90) },
      { transform: pose(group.x + next.x, group.y + next.y, (turn + 1) * 90) }
    ], { duration: 150, easing: 'ease-out' });
    group.animation.onfinish = () => { if (groups.has(group)) dropGroup(group); };
  }

  function nearestNeighbor(group) {
    let nearest;
    let distance = table.cell * 0.18;
    const { left, right, top, bottom } = limits(group);
    // A matching neighbor's group origin is the exact pose needed for the cut.
    for (const tile of group.members) {
      for (const index of tile.neighbors) {
        const other = tiles[index].group;
        if (other === group || other.turn !== group.turn) continue;
        if (other.x < left - 0.01 || other.x > right + 0.01 || other.y < top - 0.01 || other.y > bottom + 0.01) continue;
        const gap = Math.hypot(other.x - group.x, other.y - group.y);
        if (gap <= distance) {
          nearest = other;
          distance = gap;
        }
      }
    }
    return nearest;
  }

  function dropGroup(group) {
    if (solved || !table) return;
    const { cell, frameX, frameY } = table;
    let other = nearestNeighbor(group);
    if (!other && group.turn === 0 && group.members.some(tile => edges[tile.index].includes(0))
      && Math.hypot(frameX - group.x, frameY - group.y) <= cell * 0.18) {
      position(group, frameX, frameY);
      other = nearestNeighbor(group);
    }
    while (other) {
      group.x = other.x;
      group.y = other.y;
      for (const tile of other.members) {
        tile.group = group;
        group.members.push(tile);
        group.node.append(tile.piece);
      }
      groups.delete(other);
      other.node.remove();
      other = nearestNeighbor(group);
    }
    renderPose(group);
    restack();
    if (groups.size === 1 && group.turn === 0) finish();
  }

  // 疊層（作者 2026-11-27）：已經合進外框的放最下層，接好的組在中間，散的單片在最上層，
  // 小片才不會被大塊擋住找不到。同一層裡維持原本的先後。
  function restack() {
    const { frameX, frameY } = table;
    const tier = group => group.turn === 0 && Math.abs(group.x - frameX) < 0.5 && Math.abs(group.y - frameY) < 0.5
      ? 0 : group.members.length > 1 ? 1 : 2;
    const sorted = [...groups].sort((a, b) => tier(a) - tier(b) || (Number(a.node.style.zIndex) || 0) - (Number(b.node.style.zIndex) || 0));
    sorted.forEach((group, i) => { group.node.style.zIndex = i + 1; });
    layerOrder = sorted.length;
  }

  function hideHint() {
    clearTimeout(flash);
    for (const { piece } of hintedTiles) piece.classList.remove('hint');
    hintedTiles = [];
    if (guide) guide.hidden = true;
  }

  function showHint() {
    hideHint();
    const { cell, width, height, frameX, frameY } = table;
    // 目標位置要整片都在桌面內才指給玩家看，不然放不上去（2026-11-27 實測：指到桌面右緣外）
    const inside = (x, y) => x >= cell * 0.75 && y >= cell * 0.75 && x <= width - cell * 0.75 && y <= height - cell * 0.75;
    let pick;
    const bySize = [...groups].sort((a, b) => b.members.length - a.members.length);
    for (const group of bySize) {
      for (const anchor of group.members) {
        for (const index of anchor.neighbors) {
          const tile = tiles[index];
          if (tile.group === group) continue;
          const offset = tileOffset(tile, group.turn);
          // 要接上去的是那片所在的整組，整組放到位都要在桌面內
          const room = limits({ members: tile.group.members, turn: group.turn });
          const fits = group.x >= room.left && group.x <= room.right && group.y >= room.top && group.y <= room.bottom;
          if (fits && inside(group.x + offset.x, group.y + offset.y)) { pick = { tile, turn: group.turn, x: group.x + offset.x, y: group.y + offset.y }; break; }
        }
        if (pick) break;
      }
      if (pick) break;
    }
    if (!pick && bySize.length > 1) {
      // 每個可接的位置都在桌面外：把最大那塊閃一下，請玩家先拖回中間
      hintedTiles = bySize[0].members;
      bySize[0].node.style.zIndex = ++layerOrder;
      for (const { piece } of hintedTiles) { piece.classList.remove('hint'); void piece.offsetWidth; piece.classList.add('hint'); }
      flash = setTimeout(hideHint, 3500);
      speak(say('hint_move'));
      return;
    }
    if (!pick) return;
    const { tile, turn, x, y } = pick;
    guide.style.transform = `translate(${x}px, ${y}px) rotate(${turn * 90}deg)`;
    guide.firstElementChild.replaceChildren(svgElement('path', {
      d: paths[tile.index], 'vector-effect': 'non-scaling-stroke'
    }));
    hintedTiles = [tile];
    tile.group.node.style.zIndex = ++layerOrder;   // 提示的那片放最上層，不被別片蓋住
    tile.piece.classList.remove('hint');
    void tile.piece.offsetWidth;                  // 連按提示時動畫重播
    tile.piece.classList.add('hint');
    guide.hidden = false;
    flash = setTimeout(hideHint, 3500);
    const col = Math.floor((tile.col + 0.5) * 3 / side);
    const row = Math.floor((tile.row + 0.5) * 3 / side);
    speak(say('hint', { area: AREAS[row * 3 + col] }));
  }

  function leaveTable() {
    stopDrag();
    hideHint();
    observer?.disconnect();
    for (const group of groups || []) group.animation?.cancel();
  }

  function giveUp() {
    leaveTable();
    root.puzzleEscape = returnToImages;
    speak(say('give_up'));
    const choose = button('回到選圖', () => returnToImages(), 'primary');
    content.replaceChildren(choose);
    choose.focus();
  }

  async function finish() {
    solved = true;
    hideHint();
    for (const { piece } of tiles) piece.disabled = true;
    root.puzzleEscape = () => returnToImages('again');
    const at = Date.now();
    const ms = Math.min(9_999_999_999, Math.max(0, at - startedAt));
    const finishedImage = image;
    const finishedCount = count;
    const done = el('div', 'sf-puzzle-tools');
    const newImage = button('選另一張', () => returnToImages('again'), 'primary');
    done.append(el('strong', '', finishedCount + ' 片・' + puzzleTime(ms)), newImage);
    content.firstElementChild.replaceWith(done);
    speak(say('done'), say('again'));
    newImage.focus();
    const saved = await readPuzzleBests(db);
    const previous = saved.get(finishedImage.id);
    // 紀錄先比片數再比時間：拼過 36 片，之後拼 9 片再快也不會蓋掉 36 片（右下角標記顯示最多片數）
    if (!previous || finishedCount > previous[1] || (finishedCount === previous[1] && ms < previous[2])) {
      if (previous && done.isConnected) speak(say('done'), say('done_best'), say('again'));
      saved.delete(finishedImage.id);   // 刪掉再加，這筆排到最後＝最新
      saved.set(finishedImage.id, [finishedImage.id, finishedCount, ms, at]);
      bests = saved;
      try { await db.set(SAVE_KEY, encodePuzzleBests([...saved.values()])); }
      catch { if (done.isConnected) done.append(el('p', 'sf-status', '暫時無法儲存最佳時間。')); }
    }
  }

  root.puzzleDestroy = () => {
    generation++;
    leaveTable();
  };
  if (initial) pickPieces(initial);
  else pickImage();
}
