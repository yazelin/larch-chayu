const MIXED_WALTZ = ['down', 'down', 'up', 'up', 'down', 'up'];
export const GUITAR_PATTERNS = {
  down: { label: '全下刷', marks: '↓ ↓ ↓ ↓', strokes: ['down', 'down', 'down', 'down'], subdivision: 1 },
  mixed: { label: '下下上上下上', marks: '↓ ↓↑ ↑↓↑', strokes: ['down', '', 'down', 'up', '', 'up', 'down', 'up'], subdivision: 2 },
  pima: { label: '分解和弦 Pima', marks: 'P i m a', strokes: ['p', 'i', 'm', 'a', 'p', 'i', 'm', 'a'], subdivision: 2 },
};

export function guitarRhythm(pattern, beats) {
  const { subdivision, strokes } = GUITAR_PATTERNS[pattern];
  return { subdivision, strokes: beats === 3 && pattern === 'mixed' ? MIXED_WALTZ : strokes };
}
