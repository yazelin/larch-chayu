// Each slot is a sixteenth note. Drum values are velocities, and bass values
// are [semitones from the chord root, length in slots]. A null bass slot rests.
function slots(size, hits, rest = 0) {
  return Array.from({ length: size }, (_, step) => hits[step] ?? rest);
}

function pattern(label, { id, voice, mix, drumLevels, beats = 4, shuffle = false }, drumHits, bassHits) {
  const size = beats * 4;
  const drums = Object.fromEntries(Object.entries(drumHits).map(
    ([voice, hits]) => [voice, slots(size, hits)],
  ));
  const [cutoff, saw, bassLevel, drumsLevel] = mix;
  return {
    id, label, voice, beats, shuffle, drums, bass: slots(size, bassHits, null),
    mix: { cutoff, saw, bassLevel, drumsLevel, drumLevels },
  };
}

export const BAND_STYLES = [
  pattern('流行 8 拍', { id: 'pop', voice: 'piano', mix: [760, .20, .20, .72],
    drumLevels: { kick: 1.04, snare: 1.02, closedHat: .92, openHat: .84 } }, {
    kick: { 0: 1, 8: .92, 10: .65 },
    snare: { 4: .8, 12: .95 },
    closedHat: { 0: .55, 2: .34, 4: .46, 6: .38, 8: .55, 10: .34, 12: .46 },
    openHat: { 14: .42 },
  }, { 0: [0, 3], 6: [7, 1.5], 8: [0, 2], 10: [12, 1.5], 14: [7, 1.5] }),
  pattern('抒情慢板', { id: 'ballad', voice: 'rhodes', mix: [610, .12, .18, .65],
    drumLevels: { kick: .94, snare: .91, closedHat: .76, openHat: .72 } }, {
    kick: { 0: .72, 8: .58 },
    snare: { 4: .38, 12: .48 },
    closedHat: { 0: .3, 4: .24, 8: .28, 10: .18, 12: .24 },
    openHat: { 14: .28 },
  }, { 0: [0, 4], 8: [7, 3], 12: [12, 3] }),
  pattern('搖擺（shuffle）', { id: 'shuffle', voice: 'piano', shuffle: true, mix: [720, .18, .19, .68],
    drumLevels: { kick: 1.03, snare: 1.05, closedHat: 1.02 } }, {
    kick: { 0: .88, 8: .77 },
    snare: { 4: .75, 10: .26, 12: .88 },
    closedHat: { 0: .54, 2: .28, 4: .52, 6: .3, 8: .54, 10: .28, 12: .52, 14: .32 },
  }, { 0: [0, 2], 2: [12, 1], 4: [7, 2], 8: [0, 2], 10: [12, 1], 12: [7, 2], 14: [5, 1] }),
  pattern('華爾滋 3/4', { id: 'waltz', voice: 'piano', beats: 3, mix: [670, .15, .18, .67],
    drumLevels: { kick: .90, snare: 1.03, closedHat: .79 } }, {
    kick: { 0: .91 },
    snare: { 4: .42, 8: .5 },
    closedHat: { 0: .48, 4: .34, 8: .38, 10: .2 },
  }, { 0: [0, 3], 4: [7, 2], 8: [12, 2] }),
  pattern('放克 16 拍', { id: 'funk', voice: 'rhodes', mix: [900, .31, .20, .70],
    drumLevels: { kick: 1.06, snare: .91, closedHat: .82, openHat: .90, clap: .88 } }, {
    kick: { 0: 1, 3: .62, 6: .76, 10: .89, 13: .65 },
    snare: { 4: .88, 7: .26, 12: .92 },
    closedHat: { 0: .58, 1: .27, 2: .37, 3: .25, 4: .48, 5: .23, 7: .31,
      8: .56, 9: .23, 10: .4, 11: .29, 12: .51, 13: .24, 15: .35 },
    openHat: { 6: .4, 14: .46 },
    clap: { 4: .64, 12: .72 },
  }, { 0: [0, 2], 3: [12, .8], 6: [7, 1.5], 8: [0, 1.5], 10: [12, 1], 13: [7, 1], 15: [0, .65] }),
];

// MIDI pitches keep the chord roots in a compact bass register.
const chords = {
  C: { name: 'C', root: 36 }, Dm: { name: 'Dm', root: 38 }, F: { name: 'F', root: 41 },
  G: { name: 'G', root: 43 }, Am: { name: 'Am', root: 45 },
};

export const BAND_PROGRESSIONS = [
  ['C', 'G', 'Am', 'F'], ['Am', 'F', 'C', 'G'], ['C', 'Am', 'F', 'G'],
  ['Dm', 'G', 'C'], ['C', 'F', 'G', 'C'],
].map(names => names.map(name => chords[name]));

const drumVoices = {
  kick:      { type: 'sine', from: 172, to: 55, pitchDrop: .12, tone: .27, length: .24,
    overtone: { ratio: 2, tone: .35, length: .067, pitchDrop: .12 },
    noise: .045, filter: 'bandpass', cutoff: 2800, tail: .009, noiseAttack: .001 },
  snare:     { type: 'triangle', from: 195, to: 113, pitchDrop: .05, tone: .105, length: .095, noise: .39, filter: 'bandpass', cutoff: 1750, tail: .15 },
  closedHat: { type: 'square', from: 3350, tone: .003, length: .03, noise: .092, filter: 'bandpass', cutoff: 4900, tail: .046 },
  openHat:   { type: 'square', from: 2850, tone: .003, length: .075, noise: .101, filter: 'bandpass', cutoff: 4400, tail: .19 },
  clap:      { type: 'triangle', from: 760, tone: .04, length: .037, noise: .25, filter: 'bandpass', cutoff: 1450,
    bursts: [[0, .016], [.012, .016], [.024, .115]] },
};

const POLL_MS = 25;
const LOOK_AHEAD = .1;
const MIN_LEAD = .005;
const RESYNC_DELAY = .25;
const SWING = [4 / 3, 4 / 3, 2 / 3, 2 / 3];
const stepLength = bpm => 60 / bpm / 4;

export function createBandPlayer(context) {
  let noise;

  function play({ output, voices }, source, time, length, level, attack = .003, filter) {
    const envelope = context.createGain();
    source.connect(filter || envelope);
    if (filter) filter.connect(envelope);
    envelope.connect(output);
    // A source can start a sample before the gain automation at a fractional sample time.
    envelope.gain.value = .0001;
    envelope.gain.setValueAtTime(.0001, time);
    envelope.gain.exponentialRampToValueAtTime(Math.max(.0001, level), time + attack);
    envelope.gain.exponentialRampToValueAtTime(.0001, time + length);

    const release = () => {
      source.disconnect();
      filter?.disconnect();
      envelope.disconnect();
      voices.delete(source);
    };
    voices.set(source, release);
    source.onended = release;
    source.start(time);
    source.stop(time + length);
  }

  function drum(clock, voice, time, velocity) {
    const spec = drumVoices[voice];
    const oscillator = context.createOscillator();
    oscillator.type = spec.type;
    oscillator.frequency.setValueAtTime(spec.from, time);
    if (spec.to) oscillator.frequency.exponentialRampToValueAtTime(spec.to, time + spec.pitchDrop);
    play(clock, oscillator, time, spec.length, spec.tone * velocity);

    // The short octave gives the kick some weight on speakers that lose its fundamental.
    if (spec.overtone) {
      const { ratio, tone, length, pitchDrop } = spec.overtone;
      const overtone = context.createOscillator();
      overtone.frequency.setValueAtTime(spec.from * ratio, time);
      overtone.frequency.exponentialRampToValueAtTime(spec.to * ratio, time + pitchDrop);
      play(clock, overtone, time, length, tone * velocity, .0015);
    }

    if (!noise) {
      noise = context.createBuffer(1, Math.ceil(context.sampleRate * .3), context.sampleRate);
      const samples = noise.getChannelData(0);
      for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
    }
    for (const [offset, length] of spec.bursts || [[0, spec.tail]]) {
      const source = context.createBufferSource();
      source.buffer = noise;
      const filter = context.createBiquadFilter();
      filter.type = spec.filter;
      filter.frequency.value = spec.cutoff;
      filter.Q.value = .75;
      play(clock, source, time + offset, length, spec.noise * velocity, spec.noiseAttack ?? .003, filter);
    }
  }

  function bass(clock, time, root, [interval, length]) {
    const { cutoff, saw, bassLevel } = clock.style.mix;
    const frequency = 440 * 2 ** ((root + interval - 69) / 12);
    const duration = Math.min(.38, length * stepLength(clock.bpm));
    const sine = context.createOscillator();
    sine.frequency.value = frequency;
    play(clock, sine, time, duration, bassLevel * (1 - saw), .013);

    const oscillator = context.createOscillator();
    oscillator.type = 'sawtooth';
    oscillator.frequency.value = frequency;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = .65;
    filter.frequency.setValueAtTime(cutoff, time);
    filter.frequency.exponentialRampToValueAtTime(cutoff * .44, time + .075);
    play(clock, oscillator, time, duration, bassLevel * saw, .009, filter);
  }

  return {
    drum,
    bass,
    count(clock, time, beat) {
      const oscillator = context.createOscillator();
      oscillator.frequency.value = beat === 1 ? 1240 : 930;
      play(clock, oscillator, time, .06, .15);
    },
    slot(clock, time, chord) {
      const { style, step } = clock;
      for (const [voice, track] of Object.entries(style.drums)) {
        if (track[step]) {
          const level = style.mix.drumLevels?.[voice] ?? 1;
          drum(clock, voice, time, track[step] * style.mix.drumsLevel * level);
        }
      }
      const note = style.bass[step];
      if (note) bass(clock, time, chord.root, note);
    },
  };
}

function advanceStep(clock) {
  const multiplier = !clock.counting && clock.style.shuffle ? SWING[clock.step % 4] : 1;
  clock.nextTime += stepLength(clock.bpm) * multiplier;
  clock.step++;
  if (clock.step === clock.style.beats * 4) {
    if (!clock.counting) clock.bar++;
    clock.step = 0;
    clock.counting = false;
  }
}

function bandOutput(context, destination, volume) {
  const output = context.createGain();
  output.gain.value = volume;
  output.connect(destination);
  return output;
}

// Schedule a fixed set of bars in an OfflineAudioContext without the live polling loop.
export function scheduleBandBars(context, destination, { style, progression, bpm, volume, bars, start }) {
  const player = createBandPlayer(context);
  const clock = {
    output: bandOutput(context, destination, volume), voices: new Map(), style, bpm,
    bar: 0, step: 0, nextTime: start,
  };
  while (clock.bar < bars) {
    player.slot(clock, clock.nextTime, progression[clock.bar % progression.length]);
    advanceStep(clock);
  }
}

// The caller owns the context and the destination node. Position events report
// audible chord changes and count-in beats, using the same clock as the notes.
export function createBandEngine(context, destination, { style, progression, bpm, volume, onPosition }) {
  const player = createBandPlayer(context);
  let run = null;

  function resync(clock, earliest) {
    clock.positions.length = 0;
    // Finish the current bar on its own grid, then skip whole bars in one jump.
    while (clock.step !== 0 || clock.counting) advanceStep(clock);
    const barLength = stepLength(clock.bpm) * clock.style.beats * 4;
    const bars = Math.max(0, Math.ceil((earliest - clock.nextTime) / barLength));
    clock.nextTime += bars * barLength;
    clock.bar += bars;
  }

  function schedule() {
    const clock = run;
    const now = context.currentTime;
    if (now - clock.nextTime >= RESYNC_DELAY) resync(clock, now + MIN_LEAD);
    while (clock.nextTime < now + LOOK_AHEAD) {
      const { step, nextTime: time, counting } = clock;
      if (step === 0 && !counting) {
        clock.bpm = bpm;
        clock.style = style;
        if (clock.progression !== progression) clock.bar = 0;
        clock.progression = progression;
      }
      const chord = clock.progression[clock.bar % clock.progression.length];
      // A slot and all of its voices either keep their scheduled times or rest.
      const audible = time >= context.currentTime + MIN_LEAD;
      if (counting && step % 4 === 0 && audible) {
        const beat = step / 4 + 1;
        clock.positions.push({ time, beat });
        player.count(clock, time, beat);
      }
      if (!counting) {
        if (step === 0) clock.positions.push({ time, chord });
        if (audible) player.slot(clock, time, chord);
      }

      advanceStep(clock);
    }

    let position;
    while (clock.positions[0]?.time <= now) position = clock.positions.shift();
    if (position) onPosition?.(position);
    if (run === clock) clock.timer = setTimeout(schedule, POLL_MS);
  }

  return {
    get running() { return run !== null; },
    start({ countIn = true } = {}) {
      if (run) return;
      const output = bandOutput(context, destination, volume);
      run = {
        output, voices: new Map(), positions: [], style, progression, bpm, bar: 0, step: 0,
        counting: countIn, nextTime: context.currentTime + .045,
      };
      schedule();
    },
    stop() {
      if (!run) return;
      const clock = run;
      run = null;
      clearTimeout(clock.timer);
      clock.output.disconnect();
      for (const [source, release] of clock.voices) {
        source.onended = null;
        source.stop(context.currentTime);
        release();
      }
    },
    setTempo(nextBpm) {
      bpm = nextBpm;
    },
    setPattern(nextStyle, nextProgression) {
      style = nextStyle;
      progression = nextProgression;
    },
    setVolume(nextVolume) {
      volume = nextVolume;
      if (run) run.output.gain.setTargetAtTime(volume, context.currentTime, .015);
    },
  };
}
