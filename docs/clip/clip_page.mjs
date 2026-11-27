import { createClipPlayer } from './modules/studio_web/clip_player.mjs';
import { deserializeSong } from './modules/studio_web/composer_model.mjs';
import { STUDIO_PUZZLE_CGS } from './modules/studio_web/studio_puzzle_cgs.mjs';
import { CLIP_ART } from './clip_art.mjs';

const params = new URLSearchParams(location.search);
const id = params.get('id') || '';
const local = params.get('api') || '';
const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);
const api = isLocal && /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(local)
  ? local : 'https://larch-studio-chat.yazelinj303.workers.dev';
const get = id => document.getElementById(id);
const frame = get('player');
const play = get('play');
const slider = get('time');
const fullscreen = get('fullscreen');
const download = get('download');
const position = get('position');
const progress = get('record-progress');
const canvas = frame.querySelector('canvas');
const cgs = new Map(STUDIO_PUZZLE_CGS.map(([id, , url]) => [id, url]));
const clock = seconds => Math.floor(seconds / 60) + ':' + String(Math.floor(seconds % 60)).padStart(2, '0');
let player, recording, clip;

function say(message) {
  const status = get('status');
  status.textContent = message;
  status.hidden = !message;
}

function launch() {
  say('');
  void player.play().catch(() => {
    player.pause();
    say('暫時無法播放，請重試。');
  });
}

play.addEventListener('click', () => {
  if (player.playing) player.pause();
  else launch();
});
slider.addEventListener('input', () => player.seek(Number(slider.value)));

function fullLabel() {
  fullscreen.textContent = document.fullscreenElement || frame.classList.contains('expanded') ? '離開全螢幕' : '全螢幕';
}

fullscreen.addEventListener('click', async () => {
  if (document.fullscreenElement) await document.exitFullscreen();
  else if (frame.classList.contains('expanded')) frame.classList.remove('expanded');
  else {
    try {
      if (!frame.requestFullscreen) throw new Error();
      await frame.requestFullscreen();
    } catch {
      frame.classList.add('expanded');
    }
  }
  fullLabel();
});
document.addEventListener('fullscreenchange', fullLabel);
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && frame.classList.contains('expanded')) {
    frame.classList.remove('expanded');
    fullLabel();
  }
});

function assetUrl(path) {
  const match = /^\/clip\/asset\?id=([A-Za-z0-9]{8,10})&i=(0|[1-9]\d?)$/.exec(path);
  return match?.[1] === id ? api + path : '';
}

async function load() {
  const message = get('load');
  if (!/^[A-Za-z0-9]{8,10}$/.test(id)) {
    message.textContent = '找不到這個剪輯，請確認分享網址。';
    return;
  }
  try {
    const response = await fetch(api + '/clip?id=' + id, { signal: AbortSignal.timeout(15000) });
    if (response.status === 404) {
      message.textContent = '這個剪輯已過期或已刪除，也可能是網址有誤。';
      return;
    }
    if (!response.ok) throw new Error();
    clip = await response.json();
    const images = new Map();
    // The player expects clip-format IDs. Map private media URLs to local IDs
    // only for the duration of this page.
    const slides = clip.slides.map((slide, index) => {
      const src = slide.src;
      if (src.kind !== 'work') return slide;
      const key = String(index);
      images.set(key, assetUrl(src.url));
      return { ...slide, src: { kind: 'work', id: key } };
    });
    const music = clip.music.kind === 'work' ? { ...clip.music, id: 'audio' } : clip.music;
    const audio = music.kind === 'work' ? assetUrl(clip.music.url) : deserializeSong(clip.composer);

    player = createClipPlayer({ canvas, resolveImage: ({ kind, id }) => kind === 'work' ? images.get(id)
      : kind === 'cg' ? cgs.get(id) : CLIP_ART[id] });
    player.events.addEventListener('playstate', ({ detail }) => { play.textContent = detail ? '暫停' : '播放'; });
    player.events.addEventListener('timeupdate', ({ detail }) => {
      slider.value = detail;
      position.value = clock(detail) + ' / ' + clock(player.duration);
      if (recording?.recorder?.state === 'recording') {
        progress.value = detail / player.duration;
        const percent = Math.floor(progress.value * 100);
        if (percent !== recording.percent) {
          recording.percent = percent;
          say('正在錄製 ' + percent + '％');
        }
      }
    });
    player.events.addEventListener('error', ({ detail }) => {
      if (recording) finishRecording(recording, '錄製中止。' + detail);
      else say(detail);
    });
    player.events.addEventListener('ended', () => {
      if (recording) finishRecording(recording);
    });
    get('title').textContent = clip.title;
    document.title = clip.title + ' · 夜後明月';
    player.setClip({ ...clip, slides, music }, audio);
    slider.max = player.duration;
    position.value = '0:00 / ' + clock(player.duration);
    message.hidden = true;
    frame.hidden = false;
    get('export').hidden = false;

    const available = await player.prepare();
    play.disabled = slider.disabled = false;
    download.disabled = available.some(ready => !ready);
    if (download.disabled) say('部分圖片無法讀取，請重新整理後再試。');
  } catch {
    message.hidden = false;
    message.textContent = '暫時無法讀取剪輯，請稍後重新整理。';
  }
}

const mimeTypes = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'];
download.addEventListener('click', () => {
  if (recording) finishRecording(recording, '已停止錄製。');
  else void record();
});

async function record() {
  const codec = typeof MediaRecorder === 'function' && mimeTypes.find(type => MediaRecorder.isTypeSupported(type));
  if (!codec || !canvas.captureStream || !(window.AudioContext || window.webkitAudioContext)) {
    say('這個瀏覽器無法錄製 WebM。請用支援 WebM 錄製的瀏覽器開啟。');
    return;
  }
  const session = { chunks: [], done: false };
  recording = session;
  play.disabled = slider.disabled = fullscreen.disabled = true;
  download.textContent = '停止';
  progress.value = 0;
  progress.hidden = false;
  say('正在準備錄製…');
  player.stop();
  try {
    session.output = player.output;
    session.destination = player.audioContext.createMediaStreamDestination();
    session.output.connect(session.destination);
    await player.audioContext.resume();
    if (session.done) return;
    await player.play();
    if (session.done) return;
    session.stream = canvas.captureStream(30);
    for (const track of session.destination.stream.getAudioTracks()) session.stream.addTrack(track);
    session.recorder = new MediaRecorder(session.stream, { mimeType: codec, videoBitsPerSecond: 4_000_000 });
    session.recorder.ondataavailable = ({ data }) => { if (data.size) session.chunks.push(data); };
    session.recorder.onerror = () => finishRecording(session, '錄製失敗，請再試一次。');
    session.recorder.onstop = () => {
      if (!session.done) {
        player.pause();
        resetRecording(session, '錄製意外中止，請重試。');
        return;
      }
      const file = new Blob(session.chunks, { type: 'video/webm' });
      if (session.failure || !file.size) {
        resetRecording(session, session.failure || '影片沒有錄到畫面，請重試。');
        return;
      }
      const url = URL.createObjectURL(file);
      const save = document.createElement('a');
      save.href = url;
      save.download = (clip.title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 48) || '剪輯') + '.webm';
      document.body.append(save);
      save.click();
      save.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      resetRecording(session, '影片已錄製，開始下載。');
    };
    session.recorder.start(250);
  } catch {
    finishRecording(session, '錄製失敗，請再試一次。');
  }
}

function finishRecording(session, failure) {
  if (session.done) return;
  session.done = true;
  session.failure = failure;
  player.pause();
  download.disabled = true;
  if (session.recorder && session.recorder.state !== 'inactive') session.recorder.stop();
  else resetRecording(session, failure);
}

function resetRecording(session, message) {
  if (session.destination) session.output.disconnect(session.destination);
  session.stream?.getTracks().forEach(track => track.stop());
  session.destination?.stream.getTracks().forEach(track => track.stop());
  recording = null;
  download.textContent = '下載影片';
  download.disabled = play.disabled = slider.disabled = fullscreen.disabled = false;
  progress.hidden = true;
  say(message);
}

void load();
