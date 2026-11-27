import { playMusicBox } from './piano_music_box.mjs';

export const PIANO_VOICES = {
  piano: '原聲鋼琴',
  rhodes: '電鋼琴',
  organ: '風琴',
  lead: '合成主音',
  musicbox: '八音盒',
};
export const PIANO_POLYPHONY = 16;

// Gain at C3, C4, and C5 and above. Interpolate in pitch so adjacent keys
// transition smoothly, and hold the end settings outside this range.
const synthKeyGain = {
  rhodes: [1.22, 1.17, .93],
  organ: [1.22, 1.16, .93],
  lead: [1.15, 1.08, .88],
  musicbox: [1.07, 1, .78],
};
const MIDDLE_C = 261.63;

function keyGain([low, middle, high], bass, treble) {
  return middle + (low - middle) * bass + (high - middle) * treble;
}

// The compressor can let short stacked attacks through. Sum a soft-knee
// correction with the dry signal so ordinary peaks pass through sample-exactly.
const peakRange = 16;
const peakKnee = .72;
const peakRoom = .23;
const peakCorrection = Float32Array.from({ length: 8193 }, (_, index) => {
  const sample = peakRange * (index / 4096 - 1);
  const excess = Math.max(0, Math.abs(sample) - peakKnee);
  return Math.sign(sample) * (peakRoom * Math.tanh(excess / peakRoom) - excess);
});

export function createPianoMix(context, destination = context.destination) {
  const sum = context.createGain();
  sum.connect(destination);
  const scale = context.createGain();
  scale.gain.value = 1 / peakRange;
  const correction = context.createWaveShaper();
  correction.curve = peakCorrection;
  sum.connect(scale).connect(correction).connect(destination);

  const master = context.createDynamicsCompressor();
  master.threshold.value = -16;
  master.knee.value = 12;
  master.ratio.value = 6;
  master.attack.value = .003;
  master.release.value = .16;
  master.connect(sum);

  const musicBox = context.createGain();
  let bandPlaying = false;
  musicBox.connect(sum);
  return {
    master,
    musicBox,
    dispose() {
      // Let the final panel-close fade finish on the audio clock.
      const tail = context.createConstantSource();
      tail.offset.value = 0;
      tail.connect(master);
      tail.onended = () => {
        tail.disconnect();
        musicBox.disconnect();
        master.disconnect();
        sum.disconnect();
        scale.disconnect();
        correction.disconnect();
      };
      tail.start();
      tail.stop(context.currentTime + .04);
    },
    setBandPlaying(next) {
      if (next === bandPlaying) return;
      musicBox.disconnect();
      musicBox.connect(next ? master : sum);
      bandPlaying = next;
    },
  };
}

export function createPianoVoices(context, mix, getPianoSample = () => null, { gateMusicBox = false } = {}) {
  const voices = new Set();
  let hammerNoise;

  function noteOn(preset, frequency, time = context.currentTime, velocity = 1) {
    for (const voice of voices) {
      if (voice.end <= time) voices.delete(voice);
    }
    if (voices.size >= PIANO_POLYPHONY) {
      const oldest = voices.values().next().value;
      oldest.fade(time, .018);
      voices.delete(oldest);
    }

    const output = context.createGain();
    const sources = [];
    const musicBox = preset === 'musicbox';
    const sample = preset === 'piano' ? getPianoSample(frequency) : null;
    output.connect(musicBox ? mix.musicBox : mix.master);
    const octave = Math.log2(frequency / MIDDLE_C);
    const bass = Math.min(1, Math.max(0, -octave));
    const treble = Math.min(1, Math.max(0, octave));
    const lowHarmonics = (1 + bass - treble) / 2;
    const gain = synthKeyGain[preset];
    const initialLevel = (musicBox ? 1 : velocity) * (gain ? keyGain(gain, bass, treble) : 1);
    output.gain.setValueAtTime(initialLevel, time);
    let fadeStart = Infinity;
    let fadeLevel = initialLevel;

    function oscillator(type, hz, destination, detune = 0) {
      const source = context.createOscillator();
      source.type = type;
      source.frequency.value = hz;
      source.detune.value = detune;
      source.connect(destination);
      source.start(time);
      sources.push(source);
      return source;
    }
    function partial(hz, level, attack, decay = Infinity) {
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(.0001, time);
      envelope.gain.linearRampToValueAtTime(level, time + attack);
      if (Number.isFinite(decay)) {
        envelope.gain.exponentialRampToValueAtTime(.0001, time + decay);
      }
      envelope.connect(output);
      oscillator('sine', hz, envelope);
    }
    let duration = Infinity;
    let release = .3;
    if (musicBox) {
      // Keep the box's fast pluck, with more of the tine resonance on low keys.
      const tineBlend = bass * (2 - bass);
      const pluck = bass > 0 ? context.createGain() : output;
      if (bass > 0) {
        pluck.gain.value = 1 - .50 * tineBlend;
        pluck.connect(output);
      }
      sources.push(...playMusicBox(context, pluck, frequency, time));
      if (bass > 0) {
        for (const [ratio, level, decay] of [[2.001, .19, 1.1], [3.01, .145, .94], [4.08, .066, .72], [5.12, .027, .44]]) {
          partial(frequency * ratio, level * tineBlend, .012, decay);
        }
        for (const source of sources.slice(2)) source.stop(time + 1.2);
      }
      duration = 1.2;
    } else if (sample) {
      const source = context.createBufferSource();
      source.buffer = sample.buffer;
      source.playbackRate.value = sample.playbackRate;
      source.connect(output);
      source.start(time);
      sources.push(source);
      duration = sample.buffer.duration / sample.playbackRate;
      release = .25;
    } else if (preset === 'piano') {
      const register = Math.max(.42, Math.min(1, (261.63 / frequency) ** .28));
      const levels = [.115, .073, .046, .026, .017, .009];
      duration = 4 * register;
      levels.forEach((level, index) => {
        const harmonic = index + 1;
        partial(frequency * harmonic * Math.sqrt(1 + .00024 * (harmonic ** 2 - 1)),
          level, .003 + index * .0005, duration / (1 + index * .34));
      });
      if (!hammerNoise) {
        hammerNoise = context.createBuffer(1, Math.ceil(context.sampleRate * .035), context.sampleRate);
        const data = hammerNoise.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
          const phase = i / data.length;
          data[i] = (Math.random() * 2 - 1) * Math.min(1, phase * 40) * (1 - phase) ** 5;
        }
      }
      const hammer = context.createBufferSource();
      hammer.buffer = hammerNoise;
      const filter = context.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = Math.min(3000, 1000 + frequency * 2);
      const level = context.createGain();
      level.gain.value = .055;
      hammer.connect(filter).connect(level).connect(output);
      hammer.start(time);
      sources.push(hammer);
    } else if (preset === 'rhodes') {
      const tremolo = context.createGain();
      tremolo.gain.value = .92;
      tremolo.connect(output);
      const depth = context.createGain();
      depth.gain.value = .08;
      depth.connect(tremolo.gain);
      oscillator('sine', 4.8, depth);

      const envelope = context.createGain();
      envelope.gain.setValueAtTime(.0001, time);
      envelope.gain.linearRampToValueAtTime(.205, time + .009);
      envelope.gain.exponentialRampToValueAtTime(.003, time + 3.7);
      envelope.gain.exponentialRampToValueAtTime(.0001, time + 5);
      envelope.connect(tremolo);
      const carrierLevel = context.createGain();
      carrierLevel.gain.value = 1 - .32 * lowHarmonics;
      carrierLevel.connect(envelope);
      const carrier = oscillator('sine', frequency, carrierLevel);
      if (lowHarmonics > 0) {
        // Tine overtones share the carrier's decay and tremolo.
        for (const [ratio, level] of [[2, .63], [3.01, .42], [4.02, .17]]) {
          const tine = context.createGain();
          tine.gain.value = level * lowHarmonics;
          tine.connect(envelope);
          oscillator('sine', frequency * ratio, tine);
        }
      }
      const bell = context.createGain();
      bell.gain.setValueAtTime(frequency * .65, time);
      bell.gain.exponentialRampToValueAtTime(frequency * .045, time + .32);
      bell.connect(carrier.frequency);
      oscillator('sine', frequency * 2.01, bell);
      partial(frequency * 3.97, .023, .004, .32);
      duration = 5;
      release = .23;
    } else if (preset === 'organ') {
      const rotary = context.createGain();
      rotary.gain.setValueAtTime(0, time);
      rotary.gain.linearRampToValueAtTime(.92, time + .014);
      rotary.connect(output);
      const depth = context.createGain();
      depth.gain.value = .065;
      depth.connect(rotary.gain);
      const lfo = oscillator('sine', 5.6, depth);
      const pitchDepth = context.createGain();
      pitchDepth.gain.value = 3.2;
      lfo.connect(pitchDepth);
      for (const [ratio, level, lowLevel] of [
        [.5, .037, .024], [1, .094, .061], [1.5, .025, .025],
        [2, .039, .060], [3, .020, .047], [4, .011, .025],
      ]) {
        const drawbar = context.createGain();
        drawbar.gain.value = level + (lowLevel - level) * lowHarmonics;
        drawbar.connect(rotary);
        const source = oscillator('sine', frequency * ratio, drawbar);
        pitchDepth.connect(source.detune);
      }
      release = .095;
    } else {
      const filter = context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.Q.value = .62;
      const cutoff = Math.min(3000, Math.max(1150, frequency * 4.5));
      filter.frequency.setValueAtTime(cutoff, time);
      filter.frequency.exponentialRampToValueAtTime(cutoff * .66, time + .23);
      const envelope = context.createGain();
      envelope.gain.setValueAtTime(.0001, time);
      envelope.gain.linearRampToValueAtTime(.21, time + .022);
      envelope.gain.exponentialRampToValueAtTime(.13, time + .21);
      filter.connect(envelope).connect(output);
      oscillator('sawtooth', frequency, filter, -7);
      oscillator('sawtooth', frequency, filter, 7);
      if (lowHarmonics > 0) {
        // Reinforce the lower saw harmonics while keeping the twin detune and filter sweep.
        for (const [ratio, level] of [[3, .09], [4, -.05]]) {
          const harmonic = context.createGain();
          harmonic.gain.value = level * lowHarmonics;
          harmonic.connect(filter);
          oscillator('sine', frequency * ratio, harmonic, -7);
          oscillator('sine', frequency * ratio, harmonic, 7);
        }
      }
      release = .16;
    }

    const voice = {
      end: time + duration,
      fade(at, length) {
        const end = Math.min(voice.end, at + length);
        if (end <= at) return;
        // Preserve the part of an existing fade that precedes a voice steal or blur.
        output.gain.cancelScheduledValues(at);
        if (at > fadeStart) {
          fadeLevel *= (voice.end - at) / (voice.end - fadeStart);
          output.gain.linearRampToValueAtTime(fadeLevel, at);
        } else {
          fadeLevel = initialLevel;
          output.gain.setValueAtTime(fadeLevel, at);
        }
        fadeStart = at;
        output.gain.linearRampToValueAtTime(0, end);
        voice.end = end;
        for (const source of sources) source.stop(end);
      },
    };
    if (!musicBox && !sample && Number.isFinite(voice.end)) {
      for (const source of sources) source.stop(voice.end);
    }
    // The first source spans the entire voice, including its release.
    sources[0].onended = () => {
      voices.delete(voice);
      output.disconnect();
      for (const source of sources) source.disconnect();
    };
    voices.add(voice);

    let released = false;
    function noteOff(at = context.currentTime, letDecay = false) {
      const naturalTail = letDecay && Number.isFinite(duration);
      if ((!musicBox || gateMusicBox) && !naturalTail && !released && voices.has(voice)) voice.fade(Math.max(time, at), release);
      released = true;
    }
    noteOff.cancel = () => {
      output.disconnect();
      voices.delete(voice);
      for (const source of sources) source.stop(context.currentTime);
    };
    return noteOff;
  }

  return {
    noteOn,
    releaseAll() {
      for (const voice of voices) voice.fade(context.currentTime, .035);
    },
  };
}
