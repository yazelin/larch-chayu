const FLAT_SCENES = new Set(['dawn', 'beach', 'cape']);

function truth(value) {
  return value === true || value === 1 || value === '1' || value === 'true';
}

function distance(position, target, width, height) {
  if (!position || !target) return Infinity;
  return Math.hypot((position.x - target.x) * width, (position.y - target.y) * height);
}

function queryValue(query, key) {
  return typeof query?.get === 'function' ? query.get(key) : query?.[key];
}

export function pointInPolygon(point, polygon) {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a[1] > point.y) !== (b[1] > point.y) &&
        point.x < (b[0] - a[0]) * (point.y - a[1]) / ((b[1] - a[1]) || 1e-9) + a[0]) inside = !inside;
  }
  return inside;
}

export function isWalkable(point, stage, config) {
  return pointInPolygon(point, config.walkable[String(stage)]);
}

export function isNearEntrance(position, entrance, width, height) {
  return distance(position, entrance, width, height) <= entrance.radius * height + 45;
}

export function dolphinActionVisible({ stage, chapter, position, beach, alreadyRidden, width, height }) {
  return Number(stage) === 3 && String(chapter ?? '') === '4' && !truth(alreadyRidden) &&
    distance(position, beach, width, height) < beach.radius * height + 34;
}

export function boatActionVisible({ stage, position, dock, alreadyRidden, width, height }) {
  return Number(stage) === 5 && !truth(alreadyRidden) &&
    distance(position, dock, width, height) < dock.radius * height + 34;
}

// 真結局從北邊碼頭水邊下潛（直向海底長畫 dive.html，潛到最底；回憶捲軸第 6 張在那裡）。小船出海與否都可以下潛
export function diveActionVisible({ stage, position, dock, width, height }) {
  return Number(stage) === 5 && distance(position, dock, width, height) < dock.radius * height + 34;
}

export function shouldShowMemory7(stage, variables) {
  return Number(stage) === 5 && truth(variables?.island_boat_trip) && !truth(variables?.memory7);
}

export function shouldRunLanding(stage, variables, arrival) {
  return Number(stage) === 5 && !truth(variables?.island_landed) && arrival !== '0' && arrival !== 'false';
}

export function islandTimeFromVars(variables, stage, query = {}) {
  const explicit = queryValue(query, 'time') || variables.time;
  if (explicit) return explicit;
  if (stage === 4 && String(variables.chapter ?? queryValue(query, 'chapter') ?? '') === '7') {
    const day = Number(variables.day || queryValue(query, 'day') || 24);
    return day === 27 ? '清晨' : '下午';
  }
  if (stage !== 5) return ({ 1: '早上', 2: '早上', 3: '黃昏', 4: '月夜' })[stage] || '早上';
  const gifts = Math.max(Number(variables.gifts) || 0,
    ['gift_chen', 'gift_shi', 'gift_ming'].filter(key => truth(variables[key])).length);
  const homeStep = Number(variables.trueEnding_island_step || queryValue(query, 'step') || 0) >= 6;
  return gifts >= 3 && homeStep ? '天剛暗' : gifts >= 2 ? '黃昏' : '早上';
}

export function islandMapFor(stage, time, maps) {
  if (stage === 5 && time === '黃昏') return maps['5_dusk'];
  if (stage === 5 && time === '天剛暗') return maps['5_night'];
  return maps[String(stage)];
}

export function entranceAction(entrance, stage, inFrame) {
  if (!entrance || entrance.stage > stage) return null;
  const scene = entrance.scene;
  const variables = { island_next_scene: scene };
  if (inFrame) return {
    kind: 'complete', scene, variables,
    result: `enter_${scene}`,
    payload: { scene, area: scene, island_next_scene: scene }
  };
  if (FLAT_SCENES.has(scene)) return { kind: 'flat', scene, area: scene, variables };
  if (scene === 'home') return { kind: 'home', scene, variables };
  if (scene === 'dock') return { kind: 'dock', scene, variables };
  return { kind: 'toast', scene, variables };
}

export function memoryUpdates(variables, id) {
  return {
    [id]: 'true',
    memories: String((Number(variables.memories) || 0) + 1)
  };
}

export function orbitCompletion(kind, passed) {
  const varName = kind === 'dolphin' ? 'island_dolphin_done' : 'island_boat_trip';
  const variables = { [varName]: 'true', island_next_scene: 'island' };
  return {
    result: kind === 'dolphin' ? 'dolphin_circled' : 'boat_circled',
    variables,
    payload: { route: 'island_orbit', vehicle: kind, passed: [...passed], writes: variables }
  };
}

export function landingVariables() {
  return { island_landed: 'true', island_next_scene: 'island' };
}
