export const MIN_BARS = 4;
export const MAX_BARS = 32;
export const MELODY_MIN = 48;
export const MELODY_MAX = 84;
export const BASS_MIN = 24;
export const BASS_MAX = 59;
export const DRUM_ROWS = Object.freeze(['kick', 'snare', 'closedHat', 'clap']);
export const TRACK_NAMES = Object.freeze(['drums', 'bass', 'chords', 'melody']);
export const PATTERNS = Object.freeze(['down', 'mixed', 'pima']);
export const VOICES = Object.freeze(['piano', 'rhodes', 'organ', 'lead', 'musicbox']);
export const CHORD_VOICES = Object.freeze([...VOICES, 'guitar']);

// Frozen wire IDs for reading C1 saves.
const V1_CHORDS = ['', 'C', 'D', 'E', 'F', 'G', 'A', 'Am', 'Bm', 'Dm', 'Em',
  'G7', 'E7', 'A7', 'D7', 'Am7', 'Cmaj7', 'Fmaj7', 'Dsus4', 'G/B', 'C/E',
  'Dm7', 'Gmaj7', 'Gm7', 'Em7', 'Dmaj7', 'Gsus4', 'Csus4'];
const V1_KEYS = ['C', 'G', 'D', 'Am', 'Em'];

// The root order, quality order and appended inversions define the C2 wire IDs.
export const ROOT_NAMES = Object.freeze(['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']);
const CHORD_QUALITIES = [
  ['', [0, 4, 7]], ['m', [0, 3, 7]], ['7', [0, 4, 7, 10]],
  ['maj7', [0, 4, 7, 11]], ['m7', [0, 3, 7, 10]], ['sus4', [0, 5, 7]],
  ['sus2', [0, 2, 7]], ['dim', [0, 3, 6]], ['aug', [0, 4, 8]], ['add9', [0, 4, 7, 14]],
];
const HARMONY = new Map(ROOT_NAMES.flatMap((name, root) => CHORD_QUALITIES.map(([quality, intervals]) =>
  [name + quality, Object.freeze({ root, bass: root, intervals: Object.freeze(intervals) })])));
HARMONY.set('G/B', Object.freeze({ ...HARMONY.get('G'), bass: 11 }));
HARMONY.set('C/E', Object.freeze({ ...HARMONY.get('C'), bass: 4 }));
export const CHORD_NAMES = Object.freeze(['', ...HARMONY.keys()]);
export const KEY_NAMES = Object.freeze([...ROOT_NAMES, ...ROOT_NAMES.map(name => name + 'm')]);
const ENHARMONIC = new Map([['Db', 'C#'], ['D#', 'Eb'], ['Gb', 'F#'], ['G#', 'Ab'], ['A#', 'Bb']]);
const canonicalName = name => typeof name === 'string' ? name.replace(/^[A-G][#b]?/, root => ENHARMONIC.get(root) ?? root) : '';
export const chordHarmony = name => HARMONY.get(canonicalName(name));
const MODES = {
  major: { scale: [0, 2, 4, 5, 7, 9, 11], qualities: ['', 'm', 'm', '', '', 'm', 'dim'] },
  minor: { scale: [0, 2, 3, 5, 7, 8, 10], qualities: ['m', 'dim', '', 'm', 'm', '', ''] },
};
const KEYS = new Map(KEY_NAMES.map(name => {
  const minor = name.endsWith('m');
  const tonic = ROOT_NAMES.indexOf(minor ? name.slice(0, -1) : name);
  const mode = minor ? MODES.minor : MODES.major;
  const scale = mode.scale.map(interval => (tonic + interval) % 12);
  const chords = scale.map((root, degree) => ROOT_NAMES[root] + mode.qualities[degree]);
  return [name, { scale, chords: [...chords, ROOT_NAMES[scale[4]] + '7'] }];
}));
const keyHarmony = key => KEYS.get(canonicalName(key)) ?? KEYS.get('C');
const MIX_VOLUME = { drums: 75, bass: 75, chords: 55, melody: 80 };
const PITCHES = MELODY_MAX - MELODY_MIN + 1;
const VARIANT = 'C2:';
const DENSE_MELODY = 0xffff;
const HEADER_BYTES = 10;
const BAR_HEADER_BYTES = 12; // Chord, strum pattern, four drum masks, and the melody count.

export function clampInt(value, min, max, fallback = min) {
  const number = typeof value === 'number' || (typeof value === 'string' && value.trim()) ? Number(value) : NaN;
  return Number.isNaN(number) ? fallback : Math.min(max, Math.max(min, Math.round(number)));
}

const choice = (value, options, fallback) => options.includes(value) ? value : fallback;
export const stepsPerBar = beats => beats === 3 ? 12 : 16;
export const chordSuggestions = key => [...keyHarmony(key).chords];

function normalizeBar(source, steps) {
  const drums = Object.fromEntries(DRUM_ROWS.map(row => [row, Array.from({ length: steps }, (_, step) => {
    const value = source?.drums?.[row]?.[step];
    return value === true || clampInt(value, 0, 1) === 1;
  })]));
  const bass = Array.from({ length: steps }, (_, step) => {
    const value = source?.bass?.[step];
    return value == null || value === '' ? null : clampInt(value, BASS_MIN, BASS_MAX, null);
  });
  const cells = new Map();
  const notes = Array.isArray(source?.melody) ? source.melody : [];
  for (const note of notes) {
    if (!note || typeof note !== 'object') continue;
    const start = clampInt(note.start, 0, steps - 1);
    const pitch = clampInt(note.pitch, MELODY_MIN, MELODY_MAX);
    const length = clampInt(note.length, 1, steps - start);
    const cell = start * PITCHES + pitch - MELODY_MIN;
    cells.set(cell, Math.max(length, cells.get(cell) || 0));
  }
  const melody = [...cells].sort(([a], [b]) => a - b).map(([cell, length]) => ({
    start: Math.floor(cell / PITCHES), pitch: MELODY_MIN + cell % PITCHES, length,
  }));
  return {
    drums, bass, melody,
    chord: choice(canonicalName(source?.chord), CHORD_NAMES, ''),
    pattern: choice(source?.pattern, PATTERNS, null),
  };
}

export function normalizeSong(source = {}) {
  const beats = clampInt(source?.beats, 3, 4, 4);
  const bars = Array.isArray(source?.bars) ? source.bars : [];
  const tracks = Object.fromEntries(TRACK_NAMES.map(name => {
    const track = source?.tracks?.[name];
    return [name, {
      volume: clampInt(track?.volume, 0, 100, MIX_VOLUME[name]),
      mute: track?.mute === true,
      solo: track?.solo === true,
    }];
  }));
  tracks.bass.mode = source?.tracks?.bass?.mode === 'auto' ? 'auto' : 'manual';
  tracks.chords.voice = choice(source?.tracks?.chords?.voice, CHORD_VOICES, 'guitar');
  tracks.chords.pattern = choice(source?.tracks?.chords?.pattern, PATTERNS, 'down');
  tracks.melody.voice = choice(source?.tracks?.melody?.voice, CHORD_VOICES, 'piano');
  return {
    bpm: clampInt(source?.bpm, 60, 160, 100), beats,
    key: choice(canonicalName(source?.key), KEY_NAMES, 'C'), tracks,
    bars: Array.from({ length: clampInt(bars.length, MIN_BARS, MAX_BARS) },
      (_, index) => normalizeBar(bars[index], stepsPerBar(beats))),
  };
}

// All edits return a fresh normalized song. Indices are zero-based.
export function insertBar(source, index) {
  const song = normalizeSong(source);
  if (song.bars.length < MAX_BARS) {
    song.bars.splice(clampInt(index, 0, song.bars.length), 0, normalizeBar(null, stepsPerBar(song.beats)));
  }
  return song;
}

export const appendBar = song => insertBar(song, MAX_BARS);

export function duplicateBar(source, index) {
  const song = normalizeSong(source);
  if (song.bars.length < MAX_BARS) {
    const at = clampInt(index, 0, song.bars.length - 1);
    song.bars.splice(at + 1, 0, normalizeBar(song.bars[at], stepsPerBar(song.beats)));
  }
  return song;
}

export function clearBar(source, index) {
  const song = normalizeSong(source);
  song.bars[clampInt(index, 0, song.bars.length - 1)] = normalizeBar(null, stepsPerBar(song.beats));
  return song;
}

export function clearTracks(source, { startBar, endBar }, tracks) {
  const song = normalizeSong(source);
  // Auto bass has no per-bar rests. Preserve the audible bass outside the range
  // when switching the track to manual, then clear just the selected bars.
  if (tracks.includes('bass') && song.tracks.bass.mode === 'auto') {
    song.bars.forEach((bar, index) => {
      if (index >= startBar && index <= endBar) return;
      bar.bass = autoBassBar(bar.chord, song.bars[index + 1]?.chord, song.key, song.beats);
    });
    song.tracks.bass.mode = 'manual';
  }
  for (const bar of song.bars.slice(startBar, endBar + 1)) {
    const blank = normalizeBar(null, stepsPerBar(song.beats));
    if (tracks.includes('drums')) bar.drums = blank.drums;
    if (tracks.includes('bass')) bar.bass = blank.bass;
    if (tracks.includes('chords')) Object.assign(bar, { chord: blank.chord, pattern: blank.pattern });
    if (tracks.includes('melody')) bar.melody = blank.melody;
  }
  return song;
}

export function deleteBar(source, index) {
  const song = normalizeSong(source);
  if (song.bars.length > MIN_BARS) song.bars.splice(clampInt(index, 0, song.bars.length - 1), 1);
  return song;
}

export const deleteLastBar = song => deleteBar(song, MAX_BARS - 1);

export function autoBassBar(chord, nextChord, key, beats) {
  const notes = Array(stepsPerBar(beats)).fill(null);
  const harmony = chordHarmony(chord);
  if (!harmony) return notes;
  const { root, bass, intervals } = harmony;
  notes[0] = 36 + bass;
  notes[4] = 36 + (root + intervals[2]) % 12;
  notes[8] = 36 + root;
  const next = chordHarmony(nextChord);
  if (next) {
    const { scale } = keyHarmony(key);
    let approach = 36 + next.bass - 1;
    while (!scale.includes(approach % 12)) approach--;
    notes[notes.length - 4] = approach;
  }
  return notes;
}

const cellWidths = steps => Array.from({ length: steps }, (_, step) => Math.ceil(Math.log2(steps - step + 1)));
const denseSize = widths => Math.ceil(widths.reduce((sum, width) => sum + width * PITCHES, 0) / 8);
const MAX_BYTES = HEADER_BYTES + MAX_BARS * (BAR_HEADER_BYTES + 16 + denseSize(cellWidths(16)));
const MAX_CHARS = VARIANT.length + 4 * Math.ceil(MAX_BYTES / 3);

// Dense durations are stored LSB first, with only enough bits for that start step.
function packDense(bar, widths) {
  const bytes = [];
  let cell = 0, bits = 0, pending = 0, noteIndex = 0;
  for (const [step, width] of widths.entries()) {
    for (let pitch = MELODY_MIN; pitch <= MELODY_MAX; pitch++) {
      const note = bar.melody[noteIndex];
      if (note?.start === step && note.pitch === pitch) {
        pending |= note.length << bits;
        noteIndex++;
      }
      bits += width;
      if (bits >= 8) {
        bytes[cell++] = pending & 255;
        pending >>>= 8;
        bits -= 8;
      }
    }
  }
  if (bits) bytes.push(pending);
  return bytes;
}

export function serializeSong(source) {
  const { bpm, beats, key, tracks, bars } = normalizeSong(source);
  const widths = cellWidths(stepsPerBar(beats));
  const bytes = [bpm, beats, KEY_NAMES.indexOf(key), bars.length,
    (CHORD_VOICES.indexOf(tracks.melody.voice) * 6 + CHORD_VOICES.indexOf(tracks.chords.voice)) * 6
      + PATTERNS.indexOf(tracks.chords.pattern) * 2 + Number(tracks.bass.mode === 'auto'),
    ...TRACK_NAMES.map(name => tracks[name].volume | (tracks[name].mute ? 128 : 0)),
    TRACK_NAMES.reduce((mask, name, index) => mask | (Number(tracks[name].solo) << index), 0),
  ];
  for (const bar of bars) {
    bytes.push(CHORD_NAMES.indexOf(bar.chord), PATTERNS.indexOf(bar.pattern) + 1);
    for (const row of DRUM_ROWS) {
      const mask = bar.drums[row].reduce((value, on, step) => value | (Number(on) << step), 0);
      bytes.push(mask & 255, mask >>> 8);
    }
    bytes.push(...bar.bass.map(pitch => pitch ?? 0));
    const count = bar.melody.length;
    if (count * 2 >= denseSize(widths)) {
      bytes.push(255, 255, ...packDense(bar, widths));
    } else {
      bytes.push(count & 255, count >>> 8);
      for (const note of bar.melody) {
        const packed = (note.start * PITCHES + note.pitch - MELODY_MIN) * 16 + note.length - 1;
        bytes.push(packed & 255, packed >>> 8);
      }
    }
  }
  return VARIANT + btoa(String.fromCharCode(...bytes));
}

// Invalid framing or an unknown version returns null. Decoded field values go
// through the same normalization as newly edited songs.
export function deserializeSong(text) {
  if (typeof text !== 'string' || text.length > MAX_CHARS) return null;
  const v1 = text.startsWith('C1:');
  if (!v1 && !text.startsWith(VARIANT)) return null;
  let bytes;
  try { bytes = atob(text.slice(VARIANT.length)); } catch { return null; }
  if (bytes.length < HEADER_BYTES) return null;
  let offset = 0;
  const read = () => bytes.charCodeAt(offset++);
  const read16 = () => read() | (read() << 8);
  const bpm = read(), beats = clampInt(read(), 3, 4), key = (v1 ? V1_KEYS : KEY_NAMES)[read()], count = read();
  const sound = read();
  const steps = stepsPerBar(beats);
  const widths = cellWidths(steps);
  const tracks = Object.fromEntries(TRACK_NAMES.map(name => {
    const packed = read();
    return [name, { volume: packed & 127, mute: !!(packed & 128) }];
  }));
  const solos = read();
  TRACK_NAMES.forEach((name, index) => { tracks[name].solo = !!(solos & (1 << index)); });
  tracks.bass.mode = sound & 1 ? 'auto' : 'manual';
  tracks.chords.pattern = PATTERNS[(sound >>> 1) % 3];
  tracks.chords.voice = CHORD_VOICES[Math.floor(sound / 6) % 6];
  tracks.melody.voice = CHORD_VOICES[Math.floor(sound / 36)];
  const bars = [];
  for (let index = 0; index < count; index++) {
    if (offset + BAR_HEADER_BYTES - Number(v1) + steps > bytes.length) return null;
    const harmony = read();
    const chord = v1 ? V1_CHORDS[harmony >>> 2] : CHORD_NAMES[harmony];
    const pattern = PATTERNS[(v1 ? harmony & 3 : read()) - 1];
    const drums = Object.fromEntries(DRUM_ROWS.map(row => {
      const mask = read16();
      return [row, Array.from({ length: steps }, (_, step) => !!(mask & (1 << step)))];
    }));
    const bass = Array.from({ length: steps }, () => read() || null);
    const notes = read16();
    const melody = [];
    if (notes === DENSE_MELODY) {
      if (offset + denseSize(widths) > bytes.length) return null;
      let pending = 0, bits = 0;
      for (const [start, width] of widths.entries()) {
        for (let pitch = MELODY_MIN; pitch <= MELODY_MAX; pitch++) {
          if (bits < width) {
            pending |= read() << bits;
            bits += 8;
          }
          const length = pending & ((1 << width) - 1);
          if (length) melody.push({ start, pitch, length });
          pending >>>= width;
          bits -= width;
        }
      }
    } else {
      if (offset + notes * 2 > bytes.length) return null;
      for (let note = 0; note < notes; note++) {
        const packed = read16(), cell = packed >>> 4;
        melody.push({ start: Math.floor(cell / PITCHES), pitch: MELODY_MIN + cell % PITCHES, length: (packed & 15) + 1 });
      }
    }
    bars.push({ drums, bass, melody, chord, pattern });
  }
  return offset === bytes.length ? normalizeSong({ bpm, beats, key, tracks, bars }) : null;
}
