export function makePianoKeyboard(el, bindKey) {
  const DEGREES = [[0, 'Do'], [2, 'Re'], [4, 'Mi'], [5, 'Fa'], [7, 'Sol'], [9, 'La'], [11, 'Si']];
  const SHARPS = [[1, 0], [3, 1], [6, 3], [8, 4], [10, 5]];   // 半音、在第幾個白鍵右邊
  const PIANO_ROWS = [
    { name: '高音', base: 12, letters: 'qwertyu', top: 'i' },
    { name: '中音', base: 0, letters: 'asdfghj' },
    { name: '低音', base: -12, letters: 'zxcvbnm' }
  ];

  const wrap = el('div', 'sp-keys sp-keys-wide');
  const keys = {}, byNote = new Map();
  const whites = [];
  for (const row of PIANO_ROWS.slice().reverse()) {
    DEGREES.forEach(([d, name], i) => whites.push({ n: row.base + d, name, k: row.letters[i], row }));
    if (row.top) whites.push({ n: row.base + 12, name: 'Do', k: row.top, row });
  }
  const w = 100 / whites.length;
  const keyButton = (cls, label, n, aria) => {
    const b = el('button', cls, label); b.type = 'button'; b.dataset.note = String(n); b.setAttribute('aria-label', aria);
    bindKey?.(b, n);
    byNote.set(n, b); return b;
  };
  whites.forEach(({ n, name, k, row }, i) => {
    const b = keyButton('sp-key', name, n, row.name + ' ' + name + '（鍵盤 ' + k.toUpperCase() + '，Shift 升半音）');
    if (name === 'Do' && n === row.base) { b.dataset.octave = row.name; b.classList.add('octave-start'); }
    wrap.append(b);
    keys[k] = n;
    const sharp = SHARPS.find(([d]) => row.base + d === n + 1 && n !== row.base + 12);
    if (sharp) {
      const bk = keyButton('sp-key black', '', n + 1, row.name + ' 黑鍵（Shift＋' + k.toUpperCase() + '）');
      bk.style.left = ((i + 1) * w - w * 0.32) + '%'; bk.style.width = (w * 0.64) + '%'; wrap.append(bk);
    }
  });
  const scroller = el('div', 'sp-keys-scroll'); scroller.append(wrap);
  if (!bindKey) scroller.classList.add('sp-keys-scroll--playable');
  const instrument = el('div', 'sp-piano-case');
  const deck = el('div', 'sp-piano-deck');
  deck.append(el('span'), el('span', 'sp-piano-lamp'), el('span'));
  deck.setAttribute('aria-hidden', 'true');
  instrument.append(deck, scroller);
  requestAnimationFrame(() => {
    const middle = wrap.querySelector('[data-octave="中音"]');
    if (scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = middle.offsetLeft - 8;
  });
  return { instrument, scroller, wrap, keys, byNote };
}
