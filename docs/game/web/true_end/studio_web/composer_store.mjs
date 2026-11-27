import { deserializeSong, normalizeSong, serializeSong } from './composer_model.mjs';

const SLOTS = [1, 2, 3];
const keyFor = slot => 'studioComposerSlot' + slot;
const MIGRATION = 'studioComposerMigrated';
const LEGACY = 'guitarArrangement';
const NAMED = 'CN:';
export const TITLE_LIMIT = 48;
export const DEFAULT_TITLE = '未命名曲子';

function unpack(data) {
  if (typeof data !== 'string' || !data.startsWith(NAMED)) return deserializeSong(data);
  try {
    const [title, packed] = JSON.parse(data.slice(NAMED.length));
    const song = deserializeSong(packed);
    return song && { ...song, title: cleanTitle(title) };
  } catch {
    return null;
  }
}

function cleanTitle(title) {
  return typeof title === 'string' ? title.trim().slice(0, TITLE_LIMIT) || DEFAULT_TITLE : DEFAULT_TITLE;
}

export function convertLegacyArrangement(legacy) {
  if (!Array.isArray(legacy?.bars) || !legacy.bars.length) return null;
  return normalizeSong({
    bpm: legacy.bpm, beats: legacy.beats,
    tracks: { chords: { voice: 'guitar', pattern: legacy.pattern } },
    bars: legacy.bars.map(chord => ({ chord })),
  });
}

// Serialize operations for the same backend so opening while a save/delete is
// pending cannot overwrite slot 1, even when more than one store is created.
const queues = new WeakMap();

export function createComposerStore(storage) {
  function enqueue(operation) {
    const task = (queues.get(storage) || Promise.resolve()).then(operation);
    queues.set(storage, task.catch(() => {}));
    return task;
  }

  return {
    list: () => enqueue(() => Promise.all(SLOTS.map(async slot => {
      const data = await storage.get(keyFor(slot));
      const song = unpack(data);
      return { slot, occupied: !!data, title: song && (song.title || DEFAULT_TITLE), bpm: song?.bpm, beats: song?.beats, bars: song?.bars.length };
    }))),
    load: slot => enqueue(async () => SLOTS.includes(slot) ? unpack(await storage.get(keyFor(slot))) : null),
    save: (slot, song) => enqueue(async () => {
      if (!SLOTS.includes(slot)) return false;
      const packed = serializeSong(song);
      const data = song.title === undefined ? packed : NAMED + JSON.stringify([cleanTitle(song.title), packed]);
      await storage.set(keyFor(slot), data);
      return true;
    }),
    delete: slot => enqueue(async () => {
      if (!SLOTS.includes(slot)) return false;
      await storage.remove(keyFor(slot));
      return true;
    }),
    migrateLegacy: () => enqueue(async () => {
      if (await storage.get(MIGRATION)) return false;
      const oldSong = convertLegacyArrangement(await storage.get(LEGACY));
      // An occupied slot, including a newer format, belongs to the player.
      const imported = oldSong && !await storage.get(keyFor(1));
      if (imported) await storage.set(keyFor(1), serializeSong(oldSong));
      await storage.set(MIGRATION, '1');
      return !!imported;
    }),
  };
}
