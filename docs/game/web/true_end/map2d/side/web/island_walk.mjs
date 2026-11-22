// 島的可走範圍是多邊形。直走不通時，在同一個範圍內找可達的接近點，再把路徑拉直。
export function approachRoute(start, goal, reach, width, height, walkable) {
  const distance = (a, b) => Math.hypot((a.x - b.x) * width, (a.y - b.y) * height);
  const mix = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const clear = (a, b) => {
    const steps = Math.max(1, Math.ceil(distance(a, b) / 3));
    for (let i = 1; i <= steps; i++) if (!walkable(mix(a, b, i / steps))) return false;
    return true;
  };
  const direct = mix(start, goal, 1 - (reach - 3) / distance(start, goal));
  if (clear(start, direct)) return [direct];

  const cell = 10;
  const cols = Math.floor(width / cell) + 1, rows = Math.floor(height / cell) + 1;
  const seen = new Uint8Array(cols * rows);
  const first = { point: { x: start.x, y: start.y }, prev: null };
  const queue = [first];
  let best = first, bestDistance = distance(start, goal);
  const offsets = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, 1], [1, -1], [-1, -1], [0, 0]];
  for (let i = 0; i < queue.length; i++) {
    const node = queue[i];
    const d = distance(node.point, goal);
    if (d < bestDistance) { best = node; bestDistance = d; }
    if (d <= reach - 3) break;
    const x0 = Math.round(node.point.x * width / cell), y0 = Math.round(node.point.y * height / cell);
    for (const [dx, dy] of offsets) {
      const x = x0 + dx, y = y0 + dy, key = y * cols + x;
      if (x < 0 || x >= cols || y < 0 || y >= rows || seen[key]) continue;
      const point = { x: x * cell / width, y: y * cell / height };
      if (!clear(node.point, point)) continue;
      seen[key] = 1;
      queue.push({ point, prev: node });
    }
  }

  // 格點落在邊界旁時，沿著可走的區段再靠近一點。
  const rest = distance(best.point, goal);
  let end = best.point;
  for (let d = 1; d < rest && distance(end, goal) > reach - 3; d++) {
    const next = mix(best.point, goal, d / rest);
    if (!walkable(next)) break;
    end = next;
  }
  const points = end === best.point ? [] : [end];
  for (let n = best; n.prev; n = n.prev) points.push(n.point);
  points.reverse();
  const route = [];
  for (let i = 0; i < points.length;) {
    let j = i + 1;
    while (j < points.length && clear(points[i], points[j]) && clear(route.at(-1) || start, points[j])) j++;
    route.push(points[j - 1]);
    i = j;
  }
  return route;
}

// 小步檢查岸線。碰到邊界後，只保留沿該段岸線的速度。
export function slideAlongShore(start, dx, dy, width, height, polygon, walkable) {
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
  const sx = dx / steps, sy = dy / steps;
  let p = { x: start.x, y: start.y };
  for (let i = 0; i < steps; i++) {
    const next = { x: p.x + sx / width, y: p.y + sy / height };
    if (walkable(next)) { p = next; continue; }
    let distance = Infinity, tangentX = 0, tangentY = 0;
    for (let j = 0; j < polygon.length; j++) {
      const a = polygon[j], b = polygon[(j + 1) % polygon.length];
      const ex = (b[0] - a[0]) * width, ey = (b[1] - a[1]) * height;
      const length = Math.hypot(ex, ey);
      if (!length) continue;
      const ux = ex / length, uy = ey / length;
      const ax = (next.x - a[0]) * width, ay = (next.y - a[1]) * height;
      const along = Math.max(0, Math.min(length, ax * ux + ay * uy));
      const gap = Math.hypot(ax - along * ux, ay - along * uy);
      if (gap < distance) { distance = gap; tangentX = ux; tangentY = uy; }
    }
    const along = sx * tangentX + sy * tangentY;
    const slide = { x: p.x + along * tangentX / width, y: p.y + along * tangentY / height };
    if (walkable(slide)) p = slide;
  }
  return p;
}
