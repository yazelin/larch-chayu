import { clipDuration, normalize } from './clip_format.mjs';
import { createComposerEngine } from './composer_engine.mjs';

const clamp = (value, max) => Math.max(0, Math.min(max, value));
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * The resolver returns an image URL. Music is a URL or a composer song.
 * prepare() loads images, drawFrame(seconds) paints without advancing the
 * transport, and output is a connectable AudioNode on audioContext.
 */
export function createClipPlayer({ canvas, resolveImage, width = 960, height,
  audioContext, monitor = true } = {}) {
  if (height !== undefined) width = Math.round(height * 16 / 9);
  canvas.width = width;
  canvas.height = Math.round(width * 9 / 16);
  const ctx = canvas.getContext('2d');
  const blendSurface = document.createElement('canvas');
  blendSurface.width = canvas.width;
  blendSurface.height = canvas.height;
  const blendContext = blendSurface.getContext('2d');
  const events = new EventTarget();
  const pictures = new Map();
  const tracks = new Map();
  let clip = normalize(), slides = [], duration = 0, position = 0;
  let context = audioContext, output, engine, music, source, pending, frame, playing = false;
  let beginning = 0, generation = 0, destroyed = false, audioClock = false;
  let audioFetch;

  function connectOutput() {
    context ??= new (window.AudioContext || window.webkitAudioContext)();
    if (!output) {
      output = context.createGain();
      if (monitor) output.connect(context.destination);
    }
    return output;
  }

  function imageFor(src) {
    const url = resolveImage(src);
    if (!url) return null;
    if (pictures.has(url)) return pictures.get(url);
    const image = new Image();
    const entry = { image, ready: false };
    entry.loaded = new Promise(resolve => {
      image.onload = () => {
        entry.ready = true;
        if (!destroyed && !playing) drawFrame(position);
        resolve(true);
      };
      image.onerror = () => resolve(false);
      image.crossOrigin = 'anonymous';
      image.src = url;
    });
    pictures.set(url, entry);
    return entry;
  }

  function paintSlide(target, item, progress, offset = 0) {
    const { width: w, height: h } = canvas;
    const image = item.image?.ready && item.image.image;
    target.save();
    target.translate(offset, 0);
    target.beginPath();
    target.rect(0, 0, w, h);
    target.clip();
    target.fillStyle = '#232740';
    target.fillRect(0, 0, w, h);
    if (image) {
      const pan = item.cam === 'left' || item.cam === 'right';
      const zoom = { in: lerp(1, 1.18, progress), out: lerp(1.18, 1, progress) }[item.cam] ?? (pan ? 1.18 : 1);
      const scale = Math.max(w / image.naturalWidth, h / image.naturalHeight) * zoom;
      const dw = image.naturalWidth * scale, dh = image.naturalHeight * scale;
      const x = pan ? lerp(0, w - dw, item.cam === 'right' ? progress : 1 - progress) : (w - dw) / 2;
      target.drawImage(image, x, (h - dh) / 2, dw, dh);
    }
    target.restore();
  }

  function paintCaptions(time) {
    const { width: w, height: h } = canvas;
    const margin = h * .063;
    const size = h * .052, lineHeight = size * 1.28;
    const padding = size * .48;
    const groups = { top: [], middle: [], bottom: [] };
    for (const caption of clip.captions) {
      if (caption.text && caption.start <= time && time < caption.end) groups[caption.pos].push(caption.text);
    }
    ctx.save();
    ctx.font = '600 ' + size + 'px "Noto Sans CJK TC", "PingFang TC", sans-serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    for (const [where, texts] of Object.entries(groups)) {
      if (!texts.length) continue;
      const text = texts.join('　');
      const lines = [];
      let line = '';
      for (const char of text) {
        if (line && ctx.measureText(line + char).width > w * .78) { lines.push(line); line = ''; }
        line += char;
      }
      if (line) lines.push(line);
      const slots = Math.max(1, Math.floor((h / 3 - margin - 2 * padding) / lineHeight));
      if (lines.length > slots) lines.splice(slots - 1, Infinity, lines[slots - 1].slice(0, -1) + '…');
      const boxWidth = Math.max(...lines.map(value => ctx.measureText(value).width)) + padding * 3;
      const boxHeight = lines.length * lineHeight + padding * 2;
      const x = (w - boxWidth) / 2;
      const y = { top: margin, middle: (h - boxHeight) / 2, bottom: h - margin - boxHeight }[where];
      ctx.shadowColor = '#11182d80';
      ctx.shadowBlur = padding * .6;
      ctx.fillStyle = '#fff3dc';
      ctx.fillRect(x, y, boxWidth, boxHeight);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#b69f7b';
      ctx.strokeRect(x + 2, y + 2, boxWidth - 4, boxHeight - 4);
      ctx.fillStyle = '#352d34';
      lines.forEach((value, index) => ctx.fillText(value, w / 2, y + padding + (index + .5) * lineHeight));
    }
    ctx.restore();
  }

  function drawFrame(seconds) {
    const time = clamp(Number(seconds) || 0, duration);
    const { width: w, height: h } = canvas;
    ctx.fillStyle = '#232740';
    ctx.fillRect(0, 0, w, h);
    if (!slides.length) return;
    const last = slides.length - 1;
    const index = slides.findIndex((item, i) => time < item.end || i === last);
    const slide = slides[index];
    const elapsed = Math.max(0, time - slide.start);
    const progress = clamp(elapsed / slide.dur, 1);
    const blend = clamp(elapsed / Math.min(.65, slide.dur / 2), 1);
    if (slide.trans === 'fade' && blend < 1) {
      if (index) paintSlide(ctx, slides[index - 1], 1);
      paintSlide(blendContext, slide, progress);
      ctx.save();
      ctx.globalAlpha = blend;
      ctx.drawImage(blendSurface, 0, 0);
      ctx.restore();
    } else if (slide.trans === 'slide' && blend < 1) {
      if (index) paintSlide(ctx, slides[index - 1], 1, -blend * w);
      paintSlide(ctx, slide, progress, (1 - blend) * w);
    } else paintSlide(ctx, slide, progress);
    paintCaptions(time);
  }

  function emit(type, detail) { events.dispatchEvent(new CustomEvent(type, { detail })); }
  function update(time) {
    position = clamp(time, duration);
    drawFrame(position);
    emit('timeupdate', position);
  }
  function cancelAudio() {
    engine?.stop();
    if (source) {
      source.stop();
      source.disconnect();
      source = null;
    }
  }
  function pause() {
    generation++;
    const active = playing || pending;
    pending = false;
    cancelAnimationFrame(frame);
    cancelAudio();
    playing = false;
    if (active) emit('playstate', false);
  }

  function clock() { return audioClock ? context.currentTime : performance.now() / 1000; }
  function advance() {
    if (!playing) return;
    update(Math.max(position, clock() - beginning));
    if (position >= duration) {
      pause();
      emit('ended', position);
    } else frame = requestAnimationFrame(advance);
  }

  function audioBuffer(url) {
    if (!tracks.has(url)) {
      audioFetch = new AbortController();
      const loaded = fetch(url, { signal: audioFetch.signal }).then(response => {
        if (!response.ok) throw new Error('音檔讀取失敗');
        return response.arrayBuffer();
      }).then(data => context.decodeAudioData(data)).catch(error => {
        tracks.delete(url);
        throw error;
      });
      tracks.set(url, loaded);
    }
    return tracks.get(url);
  }

  async function play() {
    if (destroyed || playing || pending || !duration) return;
    if (position >= duration) update(0);
    const request = ++generation;
    pending = true;
    emit('playstate', true);
    if (request !== generation) return;
    let buffer, prepared = false;
    const hasMusic = music && clip.music.kind !== 'none';
    if (hasMusic) {
      try {
        connectOutput();
        await context.resume();
        if (request !== generation) return;
        if (typeof music === 'string') buffer = await audioBuffer(music);
        else {
          engine ??= createComposerEngine(context, { destination: output });
          await engine.preparePiano();
        }
        prepared = true;
      } catch {
        if (request === generation) emit('error', '配樂讀取失敗。');
      }
    }
    const ready = await Promise.all(slides.map(item => item.image?.loaded ?? false));
    if (request !== generation) return;
    if (ready.some(value => !value)) emit('error', '有圖片無法讀取。');
    else if (clip.music.kind !== 'none' && !music) emit('error', '配樂已無法取得。');
    if (request !== generation) return;
    audioClock = prepared;
    const videoStart = clock() + (prepared ? .065 : 0);
    const offset = Math.max(0, position - clip.music.start);
    const audioStart = videoStart + Math.max(0, clip.music.start - position);
    beginning = videoStart - position;
    if (buffer && offset < buffer.duration) {
      source = context.createBufferSource();
      source.buffer = buffer;
      source.connect(output);
      source.start(audioStart, offset);
    } else if (prepared && typeof music !== 'string') {
      engine.play(music, { offset, at: audioStart });
    }
    pending = false;
    playing = true;
    frame = requestAnimationFrame(advance);
  }

  const player = {
    events,
    get time() { return position; },
    get duration() { return duration; },
    get playing() { return playing || pending; },
    get audioContext() { return context; },
    get output() { return connectOutput(); },
    setClip(value, audio) {
      pause();
      clip = normalize(value);
      duration = clipDuration(clip);
      music = audio;
      let start = 0;
      slides = clip.slides.map(slide => {
        const end = Math.round((start + slide.dur) * 10) / 10;
        const item = { ...slide, start, end, image: imageFor(slide.src) };
        start = end;
        return item;
      });
      update(position);
    },
    prepare: () => Promise.all(slides.map(item => item.image?.loaded ?? false)),
    drawFrame, play, pause,
    stop() { player.pause(); update(0); },
    seek(time) {
      const resume = player.playing;
      player.pause();
      update(Number(time) || 0);
      if (resume && position < duration) void play();
    },
    dispose() {
      player.pause();
      destroyed = true;
      audioFetch?.abort();
      engine?.dispose();
      output?.disconnect();
      if (context && !audioContext) context.close().catch(() => {});
    }
  };
  drawFrame(0);
  return player;
}
