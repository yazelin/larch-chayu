export const CLIP_LIMITS = Object.freeze({ slides: 40, captions: 20, seconds: 300, text: 40, title: 48, id: 128 });
export const CLIP_CAMERAS = Object.freeze(['none', 'in', 'out', 'left', 'right']);
export const CLIP_TRANSITIONS = Object.freeze(['none', 'fade', 'slide']);
export const CLIP_POSITIONS = Object.freeze(['top', 'middle', 'bottom']);
export const CLIP_SLOTS = Object.freeze([1, 2, 3]);
export const DEFAULT_CLIP_TITLE = '未命名作品';

const controls = /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/gu;
const clean = (value, max) => typeof value === 'string' ? [...value.replace(controls, char => char === '\u200d' || char === '\u200c' ? char : '').trim()].slice(0, max).join('') : '';
const idOf = value => typeof value === 'string' && /^[\w.:-]{1,128}$/.test(value) ? value : '';
const oneOf = (value, choices, fallback) => choices.includes(value) ? value : fallback;
const ticks = (value, fallback, min, max) => Number.isFinite(value)
  ? Math.min(max, Math.max(min, Math.round(value * 10))) : fallback;

export function clipDuration(clip) {
  return Math.round(clip.slides.reduce((sum, slide) => sum + slide.dur, 0) * 10) / 10;
}

export function normalize(value) {
  const source = value?.v === 1 ? value : {};
  const slides = [], captions = [];
  let remaining = CLIP_LIMITS.seconds * 10;
  for (const item of Array.isArray(source.slides) ? source.slides : []) {
    if (slides.length >= CLIP_LIMITS.slides || remaining < 10) break;
    const kind = oneOf(item?.src?.kind, ['work', 'cg', 'art'], '');
    const id = idOf(item?.src?.id);
    if (!kind || !id) continue;
    const dur = ticks(item.dur, 30, 10, Math.min(100, remaining));
    slides.push({ src: { kind, id }, dur: dur / 10, cam: oneOf(item.cam, CLIP_CAMERAS, 'none'),
      trans: oneOf(item.trans, CLIP_TRANSITIONS, 'none') });
    remaining -= dur;
  }

  const length = CLIP_LIMITS.seconds * 10 - remaining;
  for (const item of Array.isArray(source.captions) ? source.captions : []) {
    if (!length || captions.length >= CLIP_LIMITS.captions) break;
    if (typeof item?.text !== 'string') continue;
    const start = ticks(item.start, 0, 0, length - 1);
    const end = ticks(item.end, Math.min(length, start + 30), start + 1, length);
    captions.push({ text: clean(item.text, CLIP_LIMITS.text), start: start / 10, end: end / 10,
      pos: oneOf(item.pos, CLIP_POSITIONS, 'bottom') });
  }

  const start = ticks(source.music?.start, 0, 0, length) / 10;
  const workId = idOf(source.music?.id);
  let music = { kind: 'none', start: 0 };
  if (source.music?.kind === 'work' && workId) music = { kind: 'work', id: workId, start };
  if (source.music?.kind === 'composer' && CLIP_SLOTS.includes(source.music.slot)) {
    music = { kind: 'composer', slot: source.music.slot, start };
  }
  return { v: 1, title: clean(source.title, CLIP_LIMITS.title) || DEFAULT_CLIP_TITLE, slides, captions, music };
}

// Validate independently of property order. A canonical value survives
// normalization without dropped fields, rounding, or other edits.
export function validate(value) {
  function same(a, b) {
    if (a === b) return true;
    if (!a || !b || typeof a !== 'object' || typeof b !== 'object' || Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(b);
    return Object.keys(a).length === keys.length && keys.every(key => Object.hasOwn(a, key) && same(a[key], b[key]));
  }
  return same(value, normalize(value));
}

export const serializeClip = value => JSON.stringify(normalize(value));
export const serializedLength = value => serializeClip(value).length;
