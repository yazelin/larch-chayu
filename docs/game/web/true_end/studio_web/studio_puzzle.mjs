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

export async function readPuzzleBests(db) {
  try {
    const saved = JSON.parse(await db.get(SAVE_KEY) || 'null');
    if (saved?.v === 1 && Array.isArray(saved.best)) return new Map(saved.best.map(row => [row[0], row]));
  } catch { /* 空白或無法讀取的紀錄 */ }
  return new Map();
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

export function renderPuzzle(root, { el, button, avatar, db, sources, initial }) {
  const shell = el('section', 'sf-puzzle');
  const scrollBox = root.closest('#panel-body');
  const panel = scrollBox.closest('#panel');
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
  let paths;
  let startedAt;
  let board;
  let tray;
  let placed;
  let order;
  let drag;
  let keyboardPiece;
  let flash;
  let ghost;
  let scrollFrame;
  let scrollTarget;
  let scrollDirection = 0;
  let ratio;
  let generation = 0;

  function speak(...lines) {
    speech.replaceChildren(...lines.map(line => el('p', '', line)));
  }

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
        card.append(photo, el('span', '', item.title));
        grid.append(card);
      }
      group.append(grid);
      content.append(group);
    }
    if (!content.children.length) content.append(el('p', 'sf-empty', '目前還沒有可以拼的畫。'));
  }

  function returnToImages(line) {
    stopDrag();
    clearTimeout(flash);
    panel.dataset.design = 'puzzle';
    panel.classList.add('sf-wide');
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
    choices.append(back);
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
    stopDrag();
    clearTimeout(flash);
    count = size;
    side = Math.sqrt(count);
    paths = puzzleEdges(image.id, count).map(puzzlePiecePath);
    placed = new Set();
    keyboardPiece = null;
    order = shuffled(count);
    if (previousOrder && order.every((index, i) => index === previousOrder[i])) order.push(order.shift());
    startedAt = Date.now();
    if (!previousOrder) speak(say('start'));
    const tools = el('div', 'sf-puzzle-tools');
    const original = button('看原圖', null, 'sf-puzzle-peek');
    const hint = button('提示', () => {
      const index = order.find(piece => !placed.has(piece));
      if (index === undefined) return;
      clearTimeout(flash);
      board.querySelector('.hint')?.classList.remove('hint');
      const spot = board.children[index];
      spot.classList.add('hint');
      flash = setTimeout(() => spot.classList.remove('hint'), 850);
      const x = Math.floor((index % side + 0.5) * 3 / side);
      const y = Math.floor((Math.floor(index / side) + 0.5) * 3 / side);
      speak(say('hint', { area: AREAS[y * 3 + x] }));
    });
    const again = button('重新打散', () => start(count, order));
    const abandon = button('放棄', giveUp);
    tools.append(original, hint, again, abandon);
    const layout = el('div', 'sf-puzzle-layout');
    const trayColumns = Math.ceil(side * 1.5);
    layout.style.setProperty('--puzzle-side', side);
    layout.style.setProperty('--puzzle-shape-scale', PIECE_SIZE + '%');
    layout.style.setProperty('--puzzle-tray-columns', trayColumns);
    layout.style.setProperty('--puzzle-tray-rows', Math.ceil(count / trayColumns));
    const boardWrap = el('div', 'sf-puzzle-board-wrap');
    board = el('div', 'sf-puzzle-board');
    board.setAttribute('aria-label', '拼圖板');
    tray = el('div', 'sf-puzzle-tray');
    tray.setAttribute('aria-label', '拼圖片托盤');
    const photo = el('img', 'sf-puzzle-original');
    photo.src = image.src;
    photo.alt = image.title;
    photo.hidden = true;
    boardWrap.append(board, photo);
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

    for (let i = 0; i < count; i++) {
      const spot = button('', () => { if (keyboardPiece) place(keyboardPiece, i); }, 'sf-puzzle-cell');
      spot.dataset.puzzleCell = i;
      spot.setAttribute('aria-label', '第 ' + (Math.floor(i / side) + 1) + ' 列，第 ' + (i % side + 1) + ' 格');
      const guide = pieceShape();
      guide.append(svgElement('path', {
        class: 'sf-puzzle-guide', d: paths[i], 'vector-effect': 'non-scaling-stroke'
      }));
      spot.append(guide);
      board.append(spot);
    }
    for (const index of order) {
      const piece = button('', () => {
        keyboardPiece?.removeAttribute('aria-pressed');
        keyboardPiece = piece;
        piece.setAttribute('aria-pressed', 'true');
      }, 'sf-puzzle-piece');
      piece.dataset.puzzlePiece = index;
      piece.setAttribute('aria-label', '拼圖片 ' + (index + 1));
      decorate(piece, index);
      tray.append(piece);
    }

    tray.addEventListener('pointerdown', event => {
      if (event.pointerType === 'touch' || event.button !== 0) return;
      const piece = event.target.closest('.sf-puzzle-piece');
      if (!piece || drag) return;
      piece.setPointerCapture(event.pointerId);
      drag = { piece, id: event.pointerId, x: event.clientX, y: event.clientY };
      lift();
    });
    tray.addEventListener('pointermove', event => {
      if (drag?.id === event.pointerId && !drag.touch) move(event);
    });
    tray.addEventListener('pointerup', event => {
      if (drag?.id === event.pointerId && !drag.touch) drop(event);
    });
    for (const type of ['pointercancel', 'lostpointercapture']) tray.addEventListener(type, event => {
      if (drag?.id === event.pointerId && !drag.touch) stopDrag();
    });

    // 先讓原生垂直捲動接手。長按成立後才攔截 touchmove。
    tray.addEventListener('touchstart', event => {
      const piece = event.target.closest('.sf-puzzle-piece');
      if (!piece || drag || event.touches.length !== 1) return;
      const finger = event.changedTouches[0];
      drag = { piece, id: finger.identifier, x: finger.clientX, y: finger.clientY, touch: true };
      drag.timer = setTimeout(lift, 150);
    }, { passive: true });
    tray.addEventListener('touchmove', event => {
      const finger = touch(event);
      if (!finger) return;
      if (!ghost) {
        if (Math.hypot(finger.clientX - drag.x, finger.clientY - drag.y) > 7) stopDrag();
        return;
      }
      if (event.cancelable) event.preventDefault();
      move(finger);
    }, { passive: false });
    tray.addEventListener('touchend', event => {
      const finger = touch(event);
      if (!finger) return;
      if (ghost && event.cancelable) event.preventDefault();
      drop(finger);
    });
    tray.addEventListener('touchcancel', event => { if (touch(event)) stopDrag(); });
    tray.addEventListener('contextmenu', event => event.preventDefault());

    layout.append(boardWrap, tray);
    content.replaceChildren(tools, layout);
    panel.classList.remove('sf-wide');
    panel.dataset.design = 'puzzle-play';
    root.puzzleBack = returnToImages;
    root.puzzleEscape = () => {
      if (drag) stopDrag();
      else if (!photo.hidden) hide();
      else giveUp();
      return true;
    };
    scrollBox.scrollTop = 0;
    original.focus({ preventScroll: true });
  }

  function touch(event) {
    if (drag?.touch) return Array.from(event.changedTouches).find(finger => finger.identifier === drag.id);
  }

  function lift() {
    if (!drag || !root.isConnected) { stopDrag(); return; }
    const size = board.getBoundingClientRect().width / side;
    ghost = el('div', 'sf-puzzle-ghost');
    ghost.style.setProperty('--piece-size', size * PIECE_SIZE / CELL_SIZE + 'px');
    decorate(ghost, Number(drag.piece.dataset.puzzlePiece));
    drag.piece.classList.add('held');
    document.body.append(ghost);
    move({ clientX: drag.x, clientY: drag.y });
  }

  function move(event) {
    ghost.style.left = event.clientX + 'px';
    ghost.style.top = event.clientY + 'px';
    const trayRect = tray.getBoundingClientRect();
    const overTray = event.clientX >= trayRect.left && event.clientX <= trayRect.right
      && event.clientY >= trayRect.top && event.clientY <= trayRect.bottom;
    scrollTarget = overTray && tray.scrollHeight > tray.clientHeight ? tray : scrollBox;
    const rect = scrollTarget.getBoundingClientRect();
    scrollDirection = event.clientY < rect.top + 24 ? -1 : event.clientY > rect.bottom - 24 ? 1 : 0;
    if (scrollDirection && !scrollFrame) scrollFrame = requestAnimationFrame(scrollDuringDrag);
  }

  function scrollDuringDrag() {
    scrollFrame = null;
    if (!ghost || !scrollDirection) return;
    const before = scrollTarget.scrollTop;
    scrollTarget.scrollTop += scrollDirection * 7;
    if (scrollTarget.scrollTop !== before) scrollFrame = requestAnimationFrame(scrollDuringDrag);
  }

  function stopDrag() {
    clearTimeout(drag?.timer);
    cancelAnimationFrame(scrollFrame);
    scrollFrame = null;
    scrollTarget = null;
    scrollDirection = 0;
    drag?.piece.classList.remove('held');
    ghost?.remove();
    ghost = null;
    drag = null;
  }

  function drop(event) {
    const { piece } = drag;
    const lifted = !!ghost;
    stopDrag();
    if (!lifted) return;
    const rect = board.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / rect.width * side);
    const y = Math.floor((event.clientY - rect.top) / rect.height * side);
    const target = x >= 0 && x < side && y >= 0 && y < side ? y * side + x : -1;
    place(piece, target);
  }

  function place(piece, target) {
    const index = Number(piece.dataset.puzzlePiece);
    if (index !== target) {
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      piece.getAnimations().forEach(animation => animation.cancel());
      piece.animate([{ transform: 'scale(.86)' }, { transform: 'scale(1)' }], 180);
      return;
    }
    const cell = board.children[index];
    decorate(cell, index);
    cell.classList.add('placed');
    cell.disabled = true;
    if (keyboardPiece === piece) keyboardPiece = null;
    placed.add(index);
    piece.remove();
    if (placed.size === count) finish();
  }

  function giveUp() {
    stopDrag();
    clearTimeout(flash);
    root.puzzleEscape = returnToImages;
    speak(say('give_up'));
    const choose = button('回到選圖', () => returnToImages(), 'primary');
    content.replaceChildren(choose);
    choose.focus();
  }

  async function finish() {
    clearTimeout(flash);
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
    const bests = await readPuzzleBests(db);
    const previous = bests.get(finishedImage.id);
    if (!previous || ms < previous[2]) {
      if (previous && done.isConnected) speak(say('done'), say('done_best'), say('again'));
      bests.set(finishedImage.id, [finishedImage.id, finishedCount, ms, at]);
      const best = [...bests.values()].sort((a, b) => b[3] - a[3]).slice(0, 60);
      try { await db.set(SAVE_KEY, JSON.stringify({ v: 1, best })); }
      catch { if (done.isConnected) done.append(el('p', 'sf-status', '暫時無法儲存最佳時間。')); }
    }
  }

  root.puzzleDestroy = () => {
    generation++;
    clearTimeout(flash);
    stopDrag();
  };
  if (initial) pickPieces(initial);
  else pickImage();
}
