import { BAND_STYLES, createBandPlayer } from './band_engine.mjs';
import { autoBassBar, chordHarmony, clampInt, DRUM_ROWS, normalizeSong, stepsPerBar, TRACK_NAMES } from './composer_model.mjs';
import { CHORDS, guitarFrequency } from './guitar_chords.mjs';
import { guitarRhythm } from './guitar_rhythm.mjs';
import { guitarSample } from './guitar_sound.mjs';
import { loadPianoSamples } from './piano_samples.mjs';
import { createPianoMix, createPianoVoices } from './piano_voices.mjs';

const POLL_MS = 25;
// Shorter than a sixteenth at 160 BPM, so at most one grid position is
// queued ahead of the audio clock. Individual strums finish within their slot.
const LOOK_AHEAD = .09;
const MIN_LEAD = .005;
const START_LEAD = .045;
const BAND_STYLE = BAND_STYLES[0];
const stepLength = bpm => 15 / bpm;
const midiFrequency = midi => 440 * 2 ** ((midi - 69) / 12);
const defaultTimers = {
  setTimeout: (callback, delay) => setTimeout(callback, delay),
  clearTimeout: timer => clearTimeout(timer),
};

function chordSteps(bar, beats, defaultPattern) {
  const harmony = chordHarmony(bar.chord);
  if (!harmony) return [];
  const shape = CHORDS[bar.chord];
  const { subdivision, strokes } = guitarRhythm(bar.pattern ?? defaultPattern, beats);
  let frequencies, upper;
  if (shape) {
    const strings = Array.from(shape, (fret, index) => fret === 'x' ? null : guitarFrequency(index, Number(fret)));
    frequencies = strings.filter(Boolean);
    upper = strings.slice(3);
  } else {
    // Stack the chord above its lowest root at or above the open low E.
    // Double the root at the octave for triads so Pima has three upper notes.
    const root = 40 + (harmony.root + 8) % 12;
    const intervals = harmony.intervals.length === 3 ? [...harmony.intervals, 12] : harmony.intervals;
    frequencies = intervals.map(interval => midiFrequency(root + interval));
    upper = frequencies.slice(1);
  }
  const picks = { p: frequencies[0], i: upper[0], m: upper[1], a: upper[2] };
  const steps = [];
  for (let index = 0; index < beats * subdivision; index++) {
    const stroke = strokes[index];
    if (!stroke) continue;
    const notes = stroke === 'down' ? frequencies : stroke === 'up' ? [...frequencies].reverse() : [picks[stroke]].filter(Boolean);
    steps[index * 4 / subdivision] = { stroke, frequencies: notes };
  }
  return steps;
}

// The caller supplies the shared context and owns its lifecycle. Each run
// feeds four live gain controls through one compressor.
export function createComposerEngine(context, {
  destination = context.destination, onPosition, onSchedule, timers = defaultTimers,
} = {}) {
  const mix = createPianoMix(context, destination);
  const band = createBandPlayer(context);
  let pianoLoad, pianoSamples, run, disposed = false;
  const previewSources = new Map();
  const preview = createPianoVoices(context, mix, frequency => pianoSamples?.(frequency), { gateMusicBox: true });

  function preparePiano() {
    pianoLoad ??= loadPianoSamples(context).then(samples => { pianoSamples = samples; }, () => {});
    return pianoLoad;
  }

  function applyMix(clock, initial = false) {
    const solo = TRACK_NAMES.some(name => clock.tracks[name].solo);
    for (const name of TRACK_NAMES) {
      const { volume, mute, solo: selected } = clock.tracks[name];
      const level = mute || (solo && !selected) ? 0 : volume / 100;
      const parameter = clock.outputs[name].gain;
      if (initial) parameter.value = level;
      else parameter.setTargetAtTime(level, context.currentTime, .006);
    }
  }

  function playGuitar(frequency, output, time, sources) {
    const { buffer, playbackRate } = guitarSample(context, frequency);
    const source = context.createBufferSource();
    source.buffer = buffer;
    source.playbackRate.value = playbackRate;
    const gain = context.createGain();
    gain.gain.value = .28;
    source.connect(gain).connect(output);
    function release() {
      source.disconnect();
      gain.disconnect();
      sources.delete(source);
    }
    sources.set(source, release);
    source.onended = release;
    source.start(time);
    const off = (at, letDecay) => {
      if (letDecay || !sources.has(source)) return;
      const end = Math.max(at, time + .025);
      gain.gain.setTargetAtTime(0, end, .014);
      source.stop(end + .08);
    };
    off.cancel = () => {
      if (!sources.has(source)) return;
      source.stop();
      release();
    };
    return off;
  }

  function stopSources(sources) {
    for (const [source, release] of sources) {
      source.onended = null;
      source.stop(context.currentTime);
      release();
    }
  }

  function mapBar(clock, tick) {
    const index = clock.fromBar + Math.floor(tick / clock.steps);
    if (!clock.loop || index <= clock.loop.endBar) return index;
    const { startBar, endBar } = clock.loop;
    return startBar + (index - startBar) % (endBar - startBar + 1);
  }

  function gridPosition(clock, tick, time) {
    const step = tick % clock.steps;
    return { bar: mapBar(clock, tick), step, beat: Math.floor(step / 4), time, bpm: clock.bpm };
  }

  function scheduleStep(clock, position) {
    const { bar, step, time, bpm } = position;
    const item = clock.bars[bar];
    const sources = new Map(), cancelNotes = [];
    const duration = stepLength(bpm);
    const bandClock = { output: clock.outputs.drums, voices: sources, bpm, style: BAND_STYLE };
    const report = (track, detail, at = time) => onSchedule?.({ ...position, track, ...detail, time: at });
    function gate(off, length, offset = 0) {
      const tick = clock.tick + length;
      const releases = clock.releases.get(tick) || new Set();
      const release = at => off(at + offset);
      releases.add(release);
      clock.releases.set(tick, releases);
      cancelNotes.push(() => {
        releases.delete(release);
        if (!releases.size) clock.releases.delete(tick);
        off.cancel();
      });
    }
    for (const row of DRUM_ROWS) {
      if (!item.drums[row][step]) continue;
      band.drum(bandClock, row, time, BAND_STYLE.mix.drumsLevel);
      report('drums', { row });
    }
    const midi = item.bass[step];
    if (midi !== null) {
      band.bass({ ...bandClock, output: clock.outputs.bass }, time, midi, [0, item.autoBass ? 3 : 1]);
      report('bass', { midi });
    }

    const chord = item.chordSteps[step];
    if (chord) {
      const { voice } = clock.tracks.chords;
      const spread = Math.min(.022, duration * .75 / Math.max(1, chord.frequencies.length - 1));
      chord.frequencies.forEach((frequency, index) => {
        const at = time + index * spread;
        if (voice === 'guitar') playGuitar(frequency, clock.outputs.chords, at, sources);
        else {
          const off = clock.piano.chords.noteOn(voice, frequency, at, .72);
          gate(off, 2, at - time);
        }
        report('chords', { stroke: chord.stroke, frequency, voice }, at);
      });
    }

    for (const note of item.melodySteps[step]) {
      const { voice } = clock.tracks.melody;
      const frequency = midiFrequency(note.pitch);
      const off = voice === 'guitar' ? playGuitar(frequency, clock.outputs.melody, time, sources)
        : clock.piano.melody.noteOn(voice, frequency, time, .85);
      gate(off, note.length);
      report('melody', { midi: note.pitch, length: note.length, voice });
    }
    if (sources.size) clock.sources.add(sources);
    return () => {
      stopSources(sources);
      for (const cancel of cancelNotes) cancel();
    };
  }

  function applyTempo(clock) {
    const change = clock.tempoChange;
    if (change && clock.tick % 4 === 0 && clock.nextTime > change.after) {
      clock.bpm = change.bpm;
      clock.tempoChange = null;
    }
  }

  function releaseThrough(clock, tick, time) {
    for (const [endTick, releases] of clock.releases) {
      if (endTick > tick) continue;
      clock.releases.delete(endTick);
      for (const release of releases) release(time);
    }
  }

  function pass(clock, count) {
    clock.tick += count;
    clock.nextTime += count * stepLength(clock.bpm);
  }

  function publish(clock, position) {
    clock.position = position;
    onPosition?.(position);
  }

  function stop() {
    if (!run) return;
    const clock = run;
    run = null;
    timers.clearTimeout(clock.timer);
    for (const name of TRACK_NAMES) clock.outputs[name].disconnect();
    for (const sources of clock.sources) stopSources(sources);
    stopSources(clock.metronome);
    for (const piano of Object.values(clock.piano)) piano.releaseAll();
    publish(clock, null);
  }

  function schedule(clock) {
    if (clock !== run) return;
    const now = context.currentTime;
    let latest;
    if (clock.pending?.position.time <= now) {
      latest = clock.pending.position;
      clock.pending = null;
    }
    for (const sources of clock.sources) {
      if (!sources.size) clock.sources.delete(sources);
    }
    // Skip elapsed slots on the original grid. Jump arithmetically during a
    // long stall, stopping at the first beat where a tempo change can apply.
    while (clock.tick < clock.endTick && clock.nextTime <= now) {
      applyTempo(clock);
      const overdue = Math.floor((now - clock.nextTime) / stepLength(clock.bpm)) + 1;
      let count = Math.min(overdue, clock.endTick - clock.tick);
      if (clock.tempoChange) count = Math.min(count, 1);
      releaseThrough(clock, clock.tick + count - 1, now);
      latest = gridPosition(clock, clock.tick + count - 1, clock.nextTime + (count - 1) * stepLength(clock.bpm));
      pass(clock, count);
    }
    if (clock.tick === clock.endTick && clock.nextTime <= now) {
      stop();
      return;
    }

    if (clock.tick < clock.endTick && clock.nextTime < now + LOOK_AHEAD) {
      const previousBpm = clock.bpm;
      applyTempo(clock);
      const position = gridPosition(clock, clock.tick, clock.nextTime);
      // Gate sounding notes against the live grid so a tempo change also
      // moves the end of notes that started on a previous beat.
      releaseThrough(clock, clock.tick, position.time);
      // Late notes are dropped as a group. No voice is moved off its grid.
      const cancel = position.time >= context.currentTime + MIN_LEAD ? scheduleStep(clock, position) : null;
      clock.pending = { tick: clock.tick, position, previousBpm, cancel };
      pass(clock, 1);
    }
    if (latest) publish(clock, latest);
    if (run === clock) clock.timer = timers.setTimeout(() => schedule(clock), POLL_MS);
  }

  return {
    get running() { return !!run; },
    getPosition: () => run?.position ?? null,
    preparePiano,
    previewNote(pitch, voice) {
      if (voice === 'piano') preparePiano();
      const frequency = midiFrequency(pitch);
      const at = context.currentTime;
      const off = voice === 'guitar' ? playGuitar(frequency, mix.master, at, previewSources)
        : preview.noteOn(voice, frequency, at, .85);
      return (delay = 0, letDecay = false) => off(context.currentTime + delay, letDecay);
    },
    previewBass(pitch, bpm) {
      band.bass({ output: mix.master, voices: previewSources, bpm, style: BAND_STYLE },
        context.currentTime, pitch, [0, 1]);
    },
    releasePreview() {
      preview.releaseAll();
      stopSources(previewSources);
    },
    play(source, { fromBar, endBar, loop, countIn = false } = {}) {
      if (disposed) return;
      stop();
      const song = normalizeSong(source);
      const lastBar = clampInt(endBar, 0, song.bars.length - 1, song.bars.length - 1);
      if (loop) {
        const startBar = clampInt(loop.startBar, 0, lastBar);
        loop = { startBar, endBar: clampInt(loop.endBar, startBar, lastBar, lastBar) };
      }
      fromBar = clampInt(fromBar, loop?.startBar ?? 0, loop?.endBar ?? lastBar, loop?.startBar ?? 0);
      const steps = stepsPerBar(song.beats);
      const outputs = Object.fromEntries(TRACK_NAMES.map(name => {
        const gain = context.createGain();
        gain.connect(mix.master);
        return [name, gain];
      }));
      const piano = Object.fromEntries(['chords', 'melody'].map(name => [name,
        createPianoVoices(context, { master: outputs[name], musicBox: outputs[name] },
          frequency => pianoSamples?.(frequency), { gateMusicBox: true }),
      ]));
      if (song.tracks.melody.voice === 'piano' || song.tracks.chords.voice === 'piano') preparePiano();
      const autoBass = song.tracks.bass.mode === 'auto';
      const bars = song.bars.map((bar, index) => {
        const next = song.bars[index === loop?.endBar ? loop.startBar : index + 1];
        const bass = autoBass ? autoBassBar(bar.chord, next?.chord, song.key, song.beats) : bar.bass;
        const melodySteps = Array.from({ length: steps }, () => []);
        for (const note of bar.melody) melodySteps[note.start].push(note);
        return { drums: bar.drums, bass, autoBass, melodySteps,
          chordSteps: chordSteps(bar, song.beats, song.tracks.chords.pattern) };
      });
      const firstBeat = context.currentTime + START_LEAD;
      const beatDuration = 60 / song.bpm;
      const startTime = firstBeat + (countIn ? beatDuration * song.beats : 0);
      const metronome = new Map();
      if (countIn) {
        const click = { output: mix.master, voices: metronome, bpm: song.bpm, style: BAND_STYLE };
        for (let beat = 0; beat < song.beats; beat++) {
          band.drum(click, beat === 0 ? 'clap' : 'closedHat', firstBeat + beat * beatDuration, .85);
        }
      }
      const clock = { bars, outputs, piano, tracks: song.tracks, loop, fromBar, steps,
        bpm: song.bpm, tick: 0, nextTime: startTime,
        endTick: loop ? Infinity : (lastBar - fromBar + 1) * steps,
        sources: new Set(), releases: new Map(), metronome };
      run = clock;
      applyMix(clock, true);
      schedule(clock);
      return startTime;
    },
    stop,
    setTempo(value) {
      if (!run) return;
      const clock = run;
      const now = context.currentTime;
      const bpm = clampInt(value, 60, 160, clock.bpm);
      clock.tempoChange = { bpm, after: now };
      const pending = clock.pending;
      if (!pending || pending.position.step % 4 !== 0 || pending.position.time <= now) return;

      if (pending.position.time < now + MIN_LEAD) {
        // Keep the already queued downbeat when it is too near to replace.
        // Its onset is invariant. The next subdivision uses the new tempo.
        clock.bpm = bpm;
        pending.position.bpm = bpm;
        clock.nextTime = pending.position.time + stepLength(bpm);
        clock.tempoChange = null;
        return;
      }
      pending.cancel?.();
      clock.bpm = pending.previousBpm;
      clock.tick = pending.tick;
      clock.nextTime = pending.position.time;
      clock.pending = null;
      timers.clearTimeout(clock.timer);
      schedule(clock);
    },
    setTrackMix(name, patch) {
      if (!run || !TRACK_NAMES.includes(name)) return;
      const track = run.tracks[name];
      track.volume = clampInt(patch?.volume, 0, 100, track.volume);
      if (typeof patch?.mute === 'boolean') track.mute = patch.mute;
      if (typeof patch?.solo === 'boolean') track.solo = patch.solo;
      applyMix(run);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      preview.releaseAll();
      stopSources(previewSources);
      mix.dispose();
    },
  };
}
