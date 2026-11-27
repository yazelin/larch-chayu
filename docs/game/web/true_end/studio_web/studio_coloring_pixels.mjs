// 以線稿透明度建立牆。3×3 閉運算補直線缺口，並保留原始細線。
export function coloringWalls(rgba, width, height, tolerance) {
  const walls = new Uint8Array(width * height);
  const horizontal = new Uint8Array(walls.length);
  const dilated = new Uint8Array(walls.length);
  for (let i = 0; i < walls.length; i++) walls[i] = +(rgba[i * 4 + 3] >= 255 - tolerance);
  function pass(input, output, step, extent, edge, operation) {
    for (let i = 0; i < walls.length; i++) {
      const position = edge(i);
      output[i] = operation(input[position === 0 ? i : i - step], input[i],
        input[position === extent - 1 ? i : i + step]);
    }
  }
  const col = i => i % width;
  const row = i => Math.floor(i / width);
  pass(walls, horizontal, 1, width, col, Math.max);
  pass(horizontal, dilated, width, height, row, Math.max);
  pass(dilated, horizontal, 1, width, col, Math.min);
  pass(horizontal, dilated, width, height, row, Math.min);
  // 方形閉運算會漏掉很細的斜線，直接接上相距一到兩格的斜線端點。
  for (let y = 0; y < height - 2; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!walls[i]) continue;
      dilated[i] = 1;
      for (const direction of [-1, 1]) {
        const step = width + direction;
        for (let distance = 2; distance <= 3; distance++) {
          const destX = x + direction * distance;
          if (destX < 0 || destX >= width || y + distance >= height) break;
          if (!walls[i + step * distance]) continue;
          for (let gap = 1; gap < distance; gap++) dilated[i + gap * step] = 1;
          break;
        }
      }
    }
  }
  for (let i = (Math.max(0, height - 2)) * width; i < walls.length; i++) dilated[i] |= walls[i];
  return dilated;
}

export function coloringRegion(walls, width, height, x, y) {
  const cells = new Int32Array(walls.length);
  const visited = new Uint8Array(walls.length);
  let end = 0;
  if (x < 0 || x >= width || y < 0 || y >= height || walls[y * width + x]) {
    return { cells: cells.subarray(0, 0), bounds: [0, 0, 0, 0] };
  }
  let left = x, right = x, top = y, bottom = y;
  function add(i) {
    visited[i] = 1;
    cells[end++] = i;
  }
  // 先走完整個區塊，再向牆內延伸。延伸只走牆，不能從牆的另一側出去。
  function walk(i, ink) {
    const col = i % width, row = Math.floor(i / width);
    left = Math.min(left, col); right = Math.max(right, col);
    top = Math.min(top, row); bottom = Math.max(bottom, row);
    if (col > 0 && !visited[i - 1] && walls[i - 1] === ink) add(i - 1);
    if (col < width - 1 && !visited[i + 1] && walls[i + 1] === ink) add(i + 1);
    if (row > 0 && !visited[i - width] && walls[i - width] === ink) add(i - width);
    if (row < height - 1 && !visited[i + width] && walls[i + width] === ink) add(i + width);
  }
  add(y * width + x);
  for (let i = 0; i < end; i++) walk(cells[i], 0);
  let at = 0;
  for (let depth = 0; depth <= 3; depth++) {
    const stop = end;
    while (at < stop) walk(cells[at++], 1);
  }
  return { cells: cells.subarray(0, end), bounds: [left, top, right + 1, bottom + 1] };
}

const TILE = 64;
const HISTORY_LIMIT = 32;

// 大面積平塗通常只有少數連續色。未能縮小時保留原像素。
function pack(image) {
  const pixels = new Uint32Array(image.data.buffer);
  const runs = new Uint32Array(pixels.length);
  let n = 0;
  for (let start = 0; start < pixels.length;) {
    let end = start + 1;
    while (end < pixels.length && pixels[end] === pixels[start]) end++;
    if (n + 2 >= pixels.length) return image;
    runs[n++] = pixels[start];
    runs[n++] = end - start;
    start = end;
  }
  return runs.slice(0, n);
}

export function coloringHistory(ctx) {
  const { width, height } = ctx.canvas;
  const undo = [], redo = [];
  let pending = new Map();
  function capture(left, top, right, bottom) {
    for (let y = Math.max(0, Math.floor(top / TILE) * TILE); y < Math.min(height, bottom); y += TILE) {
      for (let x = Math.max(0, Math.floor(left / TILE) * TILE); x < Math.min(width, right); x += TILE) {
        const key = y * width + x;
        if (!pending.has(key)) {
          const w = Math.min(TILE, width - x), h = Math.min(TILE, height - y);
          pending.set(key, { x, y, w, h, data: ctx.getImageData(x, y, w, h) });
        }
      }
    }
  }
  function put(tile) {
    let image = tile.data;
    if (image instanceof Uint32Array) {
      image = ctx.createImageData(tile.w, tile.h);
      const pixels = new Uint32Array(image.data.buffer);
      let start = 0;
      for (let i = 0; i < tile.data.length; i += 2) {
        const end = start + tile.data[i + 1];
        pixels.fill(tile.data[i], start, end);
        start = end;
      }
    }
    ctx.putImageData(image, tile.x, tile.y);
  }
  function reset() { pending = new Map(); }
  function swap(from, to) {
    const entry = from.pop();
    if (!entry) return false;
    to.push(entry.map(tile => {
      const data = pack(ctx.getImageData(tile.x, tile.y, tile.w, tile.h));
      put(tile);
      return { ...tile, data };
    }));
    return true;
  }
  return {
    capture,
    preview(bounds, render) {
      capture(...bounds);
      for (const tile of pending.values()) {
        const [left, top, right, bottom] = bounds;
        if (tile.x + tile.w <= left || tile.x >= right || tile.y + tile.h <= top || tile.y >= bottom) continue;
        put(tile);
        render(tile);
      }
    },
    cancel() { pending.forEach(put); reset(); },
    commit() {
      const changed = [];
      for (const tile of pending.values()) {
        const before = new Uint32Array(tile.data.data.buffer);
        const after = new Uint32Array(ctx.getImageData(tile.x, tile.y, tile.w, tile.h).data.buffer);
        if (before.some((pixel, i) => pixel !== after[i])) changed.push({ ...tile, data: pack(tile.data) });
      }
      reset();
      if (!changed.length) return false;
      undo.push(changed);
      if (undo.length > HISTORY_LIMIT) undo.shift();
      redo.length = 0;
      return true;
    },
    undo: () => swap(undo, redo),
    redo: () => swap(redo, undo),
    get canUndo() { return !!undo.length; },
    get canRedo() { return !!redo.length; }
  };
}
