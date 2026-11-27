import { BAND_PROGRESSIONS, BAND_STYLES, createBandEngine } from './band_engine.mjs';
import { loadPianoSamples } from './piano_samples.mjs';
import { PIANO_VOICES, createPianoMix, createPianoVoices } from './piano_voices.mjs';
export { bindPianoInput, bindPianoRange } from './studio_piano_input.mjs';

let pianoLoad, pianoSamples;

export function makePianoBand(el, audio) {
  const controls = el('section', 'sp-band');
  controls.setAttribute('aria-label', '伴奏');
  const toggle = el('button', 'sp-band-toggle', '開啟伴奏');
  toggle.type = 'button';
  toggle.title = '空白鍵開停伴奏';
  toggle.setAttribute('aria-keyshortcuts', 'Space');
  const position = el('span', 'sp-band-position');
  position.setAttribute('role', 'status');
  const transport = el('div', 'sp-band-transport');
  transport.append(toggle, position);

  function field(text, input, className = 'sp-band-field') {
    const label = el('label', className);
    label.append(text, input);
    return label;
  }
  function select(labels, values = labels.map((_, index) => index)) {
    const node = el('select');
    labels.forEach((label, index) => {
      const option = el('option', '', label);
      option.value = values[index];
      node.append(option);
    });
    return node;
  }
  function slider(min, max, value, unit) {
    const input = el('input');
    Object.assign(input, { type: 'range', min, max, value });
    const showValue = () => input.setAttribute('aria-valuetext', input.value + unit);
    input.addEventListener('input', showValue);
    showValue();
    return input;
  }

  const voice = select(Object.values(PIANO_VOICES), Object.keys(PIANO_VOICES));
  let manualVoice = false;
  const sampleStatus = el('span', 'sp-band-sample-status');
  sampleStatus.setAttribute('role', 'status');
  const voiceField = field('音色', voice);
  function updateSampleStatus() {
    sampleStatus.textContent = voice.value === 'piano' && pianoSamples === undefined
      ? '鋼琴取樣載入中…' : '';
  }
  let watchingSamples = false;
  function loadSelectedVoice() {
    if (voice.value === 'piano' && !watchingSamples && pianoSamples === undefined) {
      const context = audio(false);
      if (context) {
        pianoLoad ??= loadPianoSamples(context).then(
          samples => { pianoSamples = samples; },
          () => { pianoSamples = null; },
        );
        watchingSamples = true;
        pianoLoad.then(updateSampleStatus);
      } else {
        pianoSamples = null;
      }
    }
    updateSampleStatus();
  }
  voice.addEventListener('change', () => {
    manualVoice = true;
    loadSelectedVoice();
  });
  const style = select(BAND_STYLES.map(preset => preset.label));
  const progression = select(BAND_PROGRESSIONS.map(chords => chords.map(chord => chord.name).join(' · ')));
  const tempo = slider(60, 160, 108, ' BPM');
  const bpm = el('span', 'sp-band-bpm', tempo.value + ' BPM');
  bpm.setAttribute('aria-hidden', 'true');
  const tempoField = field('速度', tempo);
  tempoField.insertBefore(bpm, tempo);
  const volume = slider(0, 100, 60, '%');
  const countIn = el('input');
  countIn.type = 'checkbox';
  countIn.checked = true;
  // Keep the live status outside the label so the select's accessible name stays 音色.
  const voiceControl = el('div', 'sp-band-voice');
  voiceControl.append(voiceField, sampleStatus);
  controls.append(transport, voiceControl, field('風格', style), field('和弦進行', progression), tempoField,
    field('伴奏音量', volume), field('先數一小節', countIn, 'sp-band-count'));

  let engine, mix, voices;
  const settings = () => [BAND_STYLES[style.value], BAND_PROGRESSIONS[progression.value]];
  function stop() {
    engine?.stop();
    mix?.setBandPlaying(false);
    toggle.textContent = '開啟伴奏';
    position.textContent = '';
  }
  function togglePlayback() {
    if (engine?.running) { stop(); return; }
    const context = audio();
    if (!context) { position.textContent = '無法播放'; return; }
    const [style, progression] = settings();
    mix ??= createPianoMix(context);
    engine ??= createBandEngine(context, mix.master, {
      style, progression, bpm: Number(tempo.value), volume: Number(volume.value) / 100,
      onPosition: ({ beat, chord }) => {
        position.textContent = chord ? '和弦 ' + chord.name : '數拍 ' + beat;
      },
    });
    position.textContent = countIn.checked ? '準備數拍' : '';
    toggle.textContent = '停止伴奏';
    mix.setBandPlaying(true);
    engine.start({ countIn: countIn.checked });
  }
  toggle.addEventListener('click', togglePlayback);
  const updatePattern = () => engine?.setPattern(...settings());
  const applyDefaultVoice = () => {
    if (!manualVoice) voice.value = BAND_STYLES[style.value].voice;
    loadSelectedVoice();
  };
  applyDefaultVoice();
  style.addEventListener('change', () => {
    applyDefaultVoice();
    updatePattern();
  });
  progression.addEventListener('change', updatePattern);
  tempo.addEventListener('input', () => {
    bpm.textContent = tempo.value + ' BPM';
    engine?.setTempo(Number(tempo.value));
  });
  volume.addEventListener('input', () => engine?.setVolume(Number(volume.value) / 100));

  const events = new AbortController();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
  }, { signal: events.signal });
  window.addEventListener('pagehide', stop, { signal: events.signal });

  return {
    controls,
    noteOn(frequency) {
      const context = audio();
      if (!context) return;
      mix ??= createPianoMix(context);
      voices ??= createPianoVoices(context, mix, frequency => pianoSamples?.(frequency));
      const noteOff = voices.noteOn(voice.value, frequency);
      return (delay = 0, letDecay = false) => noteOff(context.currentTime + delay, letDecay);
    },
    releaseNotes() { voices?.releaseAll(); },
    handleKey(event) {
      if (event.target.closest?.('input, select, textarea')) return true;
      if (event.code !== 'Space' && event.key !== ' ') return false;
      if (event.target.matches?.('button:focus-visible')) return true;
      event.preventDefault();
      event.stopPropagation();
      togglePlayback();
      return true;
    },
    dispose() {
      stop();
      events.abort();
      mix?.dispose();
    },
  };
}
