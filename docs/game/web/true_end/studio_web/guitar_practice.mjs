import { PROGRESSIONS } from './guitar_chords.mjs';
import { FOLK_GUITAR_SONGS, ORIGINAL_GUITAR_SONGS } from './guitar_songs_data.mjs';

const SONGS = [...FOLK_GUITAR_SONGS, ...ORIGINAL_GUITAR_SONGS];

// 將公版旋律做成單聲道 WAV，和原曲共用播放時間、音量和暫停控制。
function melodyURL(song) {
  const rate = 22050;
  const size = Math.ceil(song.duration * rate);
  const buffer = new ArrayBuffer(44 + size * 2);
  const header = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  for (const [offset, label] of [[0, 'RIFF'], [8, 'WAVEfmt '], [36, 'data']]) {
    bytes.set(new TextEncoder().encode(label), offset);
  }
  for (const [offset, value] of [[4, buffer.byteLength - 8], [16, 16], [24, rate], [28, rate * 2], [40, size * 2]]) {
    header.setUint32(offset, value, true);
  }
  for (const [offset, value] of [[20, 1], [22, 1], [32, 2], [34, 16]]) {
    header.setUint16(offset, value, true);
  }
  const samples = new Int16Array(buffer, 44);
  let beat = 0;
  for (const [midi, beats] of song.melody) {
    const start = Math.round(beat * song.beat * rate);
    beat += beats;
    const length = Math.min(size, Math.round(beat * song.beat * rate)) - start;
    const cycles = 2 * Math.PI * 440 * 2 ** ((midi - 69) / 12) / rate;
    for (let i = 0; i < length; i++) {
      const envelope = Math.min(1, i / 150, (length - i) / 850) * Math.exp(-i / (rate * .48));
      samples[start + i] = envelope * (6500 * Math.sin(i * cycles) + 1700 * Math.sin(i * cycles * 2));
    }
  }
  return URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' }));
}

export function makeGuitarPractice({ el, button, applyShape, setCapo, cards, playChord, stopNotes, beforePlay }) {
  const panel = el('section', 'sp-practice');
  const title = el('h2', '', '範例曲');
  title.id = 'sp-practice-title';
  panel.setAttribute('aria-labelledby', title.id);
  const heading = el('div', 'sp-practice-heading');
  const pickSong = el('select', 'sp-song-select');
  pickSong.setAttribute('aria-label', '選擇範例曲');
  const placeholder = el('option', '', '選擇範例曲');
  placeholder.value = '';
  placeholder.disabled = true;
  pickSong.append(placeholder);
  for (const { id, title } of SONGS) {
    const option = el('option', '', title);
    option.value = id;
    pickSong.append(option);
  }
  pickSong.addEventListener('change', () => load(SONGS.find(song => song.id === pickSong.value)));
  const metadata = el('p', 'sp-song-key');
  heading.append(title, pickSong, metadata);

  const transport = el('div', 'sp-practice-tools');
  const own = button('sp-pace', '自己的速度', () => changeMode(false));
  const original = button('sp-follow', '跟原曲一起彈', () => changeMode(true));
  const modes = el('div', 'sp-practice-modes');
  modes.append(own, original);
  const play = button('sp-play', '播放', togglePlay);
  const soloDemo = button('sp-demo-solo', '示範', () => toggleDemo(false));
  const backedDemo = button('sp-demo-backed', '跟原曲示範', () => toggleDemo(true));
  const demos = el('div', 'sp-practice-demos');
  demos.append(soloDemo, backedDemo);
  const restart = button('sp-restart', '從頭練習', () => {
    stop();
    if (audio.src) audio.currentTime = 0;
    index = 0;
    clearMatch();
    render(follow ? -1 : 0, follow ? 0 : cues[0].row);
  });
  const volume = el('input');
  volume.type = 'range'; volume.min = '0'; volume.max = '1'; volume.step = '.05'; volume.value = '.65';
  const volumeLabel = el('label', 'sp-song-volume', '音量');
  volumeLabel.append(volume);
  const audio = el('audio', 'sp-practice-audio');
  audio.preload = 'none';
  audio.volume = Number(volume.value);
  volume.addEventListener('input', () => { audio.volume = Number(volume.value); });
  const paceHelp = el('span', 'sp-pace-help', '每刷一次就換下一個和弦。');
  transport.append(play, restart, volumeLabel, paceHelp, audio);

  const score = el('div', 'sp-song-score');
  score.tabIndex = 0;
  score.setAttribute('aria-label', '歌詞與和弦譜');
  const notice = el('p', 'sp-song-notice');
  notice.setAttribute('role', 'status');

  const hint = el('div', 'sp-practice-hint');
  const current = el('strong', 'sp-practice-current');
  const match = el('span', 'sp-practice-match', '✓');
  match.setAttribute('role', 'status');
  match.setAttribute('aria-label', '和弦正確');
  match.hidden = true;
  const useShape = button('sp-use-shape', '套用提示的指法', () => {
    const cue = cues[shown] || (shown < 0 && cues[0]);
    if (cue) applyShape(cue.name);
  });
  const upcoming = el('span', 'sp-practice-next');
  upcoming.hidden = true;
  hint.append(current, useShape, match, upcoming);

  const drills = el('div', 'sp-drills');
  const drillButtons = PROGRESSIONS.map((names, i) => {
    const choice = button('sp-progression', names.join('–'), () => {
      load({
        id: 'progression-' + i,
        lines: [[0, '', names.map((name, j) => [j, name, j])]],
      });
    });
    drills.append(choice);
    return choice;
  });
  panel.append(heading, modes, transport, demos, notice, score, el('h3', 'sp-drill-title', '常用進行'), drills);
  let song, follow = false, index = 0, shown = -1, activeRow = -1, preview = -1;
  let cues = [], rows = [], matchIndex = -1, frame = 0, objectURL;
  let playPending = false, generation = 0, bgmHeld = false;
  let demo, demoTimer;

  function clearMatch() {
    cues[matchIndex]?.token.classList.remove('matched');
    matchIndex = -1;
    match.hidden = true;
  }

  function render(cueIndex, rowIndex, previewIndex = -1) {
    if (cueIndex !== shown) {
      cues[shown]?.token.classList.remove('current');
      const cue = cues[cueIndex];
      cue?.token.classList.add('current');
      cards.get(cues[shown]?.name)?.classList.remove('target');
      cards.get(cue?.name)?.classList.add('target');
      shown = cueIndex;
    }
    const cue = cues[shown];
    const label = cue ? '現在彈 ' + cue.name : shown < 0 ? '準備彈 ' + cues[0].name : '練習完成';
    if (current.textContent !== label) current.textContent = label;
    useShape.disabled = shown >= cues.length;
    if (rowIndex !== activeRow) {
      rows[activeRow]?.removeAttribute('aria-current');
      const row = rows[rowIndex];
      row?.setAttribute('aria-current', 'true');
      activeRow = rowIndex;
      if (row) {
        const offset = row.offsetTop - score.scrollTop;
        if (offset < 0 || offset + row.offsetHeight > score.clientHeight) score.scrollTop = row.offsetTop;
      }
    }
    if (previewIndex !== preview) {
      cues[preview]?.token.classList.remove('up-next');
      cues[previewIndex]?.token.classList.add('up-next');
      preview = previewIndex;
      upcoming.hidden = preview < 0;
      if (preview >= 0) upcoming.textContent = '接著 ' + cues[preview].name;
    }
  }

  function drawScore() {
    cues = [];
    rows = song.lines.map(([time, text, changes], row) => {
      const line = el('p', 'sp-song-line');
      line.dataset.time = time;
      const section = text === '前奏' || text === '間奏';
      const chars = Array.from(text);
      const carry = cues.at(-1);
      const needsCarry = carry && !section && (changes[0]?.[0] ?? Infinity) > time + .12;
      const annotations = needsCarry ? [[time, carry.name, 0], ...changes] : changes;
      if (section) line.classList.add('sp-song-section');
      let start = 0;
      for (const [i, [at, name, pos]] of annotations.entries()) {
        if (!section && pos > start) line.append(el('span', 'sp-lyric-text', chars.slice(start, pos).join('')));
        const token = el('span', 'sp-score-chord', name);
        if (needsCarry && i === 0) {
          token.classList.add('held');
          token.setAttribute('aria-label', '延續 ' + name);
        } else {
          token.dataset.chord = name;
          token.dataset.time = at;
          cues.push({ at, name, row, token });
        }
        if (section) {
          line.append(token);
        } else {
          const stack = el('span', 'sp-lyric-stack');
          start = annotations[i + 1]?.[2] ?? chars.length;
          stack.append(token, el('span', 'sp-lyric-text', chars.slice(pos, start).join('')));
          line.append(stack);
        }
      }
      if (section || !annotations.length) line.append(el('span', 'sp-lyric-text', text));
      return line;
    });
    score.replaceChildren(...rows);
    score.scrollTop = 0;
  }

  function holdBgm(pause) {
    if (window.parent === window || bgmHeld === pause) return;
    bgmHeld = pause;
    window.parent.postMessage({ type: 'larch:hud:music', pause }, '*');
  }

  function stop() {
    generation++;
    playPending = false;
    audio.pause();
    holdBgm(false);
    cancelAnimationFrame(frame);
    play.textContent = '播放';
    if (demo) {
      clearTimeout(demoTimer);
      stopNotes();
      demo = undefined;
      soloDemo.textContent = '示範';
      backedDemo.textContent = song.melody ? '跟旋律示範' : '跟原曲示範';
      volumeLabel.hidden = !follow;
      if (follow) sync(audio.currentTime, false);
      else render(index, cues[index]?.row ?? activeRow);
    }
  }

  function releaseAudio() {
    stop();
    if (audio.hasAttribute('src')) {
      audio.removeAttribute('src');
      audio.load();
    }
    if (objectURL) URL.revokeObjectURL(objectURL);
    objectURL = undefined;
  }

  function load(nextSong) {
    releaseAudio();
    clearMatch();
    cards.get(cues[shown]?.name)?.classList.remove('target');
    song = nextSong;
    const drill = !song.beat;
    pickSong.value = drill ? '' : song.id;
    index = 0;
    shown = activeRow = preview = -1;
    upcoming.hidden = true;
    setCapo(song.capo ?? 0);
    metadata.textContent = drill ? '' : song.key + ' 調' + (song.capo ? ' · 建議 Capo ' + song.capo : '');
    drillButtons.forEach((node, i) => node.setAttribute('aria-pressed', String(song.id === 'progression-' + i)));
    original.disabled = drill;
    demos.hidden = drill;
    drawScore();
    changeMode(drill ? false : follow, true);
  }

  function changeMode(value, reset = false) {
    if (follow === value && !reset) return;
    stop();
    if (audio.src) audio.currentTime = 0;
    clearMatch();
    follow = value;
    index = 0;
    own.setAttribute('aria-pressed', String(!follow));
    original.setAttribute('aria-pressed', String(follow));
    play.hidden = volumeLabel.hidden = !follow;
    paceHelp.hidden = follow;
    original.textContent = song.melody ? '跟旋律一起彈' : '跟原曲一起彈';
    backedDemo.textContent = song.melody ? '跟旋律示範' : '跟原曲示範';
    notice.textContent = '';
    render(follow ? -1 : 0, follow ? 0 : cues[0].row);
  }

  function sync(time = audio.currentTime, playing = !audio.paused) {
    const cueIndex = cues.findLastIndex(cue => cue.at <= time);
    const rowIndex = song.lines.findLastIndex(([at]) => at <= time);
    const next = cues[cueIndex + 1];
    const previewIndex = next && next.at - time <= song.beat / 2 && playing ? cueIndex + 1 : -1;
    render(cueIndex, rowIndex, previewIndex);
  }

  function animate() {
    sync();
    if (!audio.paused) frame = requestAnimationFrame(animate);
  }

  async function togglePlay() {
    if (demo) stop();
    if (playPending || !audio.paused) {
      stop();
      sync();
      return;
    }
    beforePlay();
    if (!audio.src) audio.src = song.audio || (objectURL = melodyURL(song));
    if (audio.ended) {
      audio.currentTime = 0;
      clearMatch();
    }
    notice.textContent = '';
    const request = ++generation;
    playPending = true;
    play.textContent = '暫停';
    try {
      await audio.play();
      if (request !== generation) return;
      playPending = false;
      animate();
    } catch {
      if (request !== generation) return;
      stop();
      notice.textContent = '音檔無法播放，可以切換到自己的速度。';
    }
  }

  async function toggleDemo(backed) {
    const wasPlaying = demo?.backed === backed;
    stop();
    if (wasPlaying) return;
    beforePlay();
    clearMatch();
    setCapo(song.capo ?? 0);
    notice.textContent = '';
    const start = cues[0].at;
    // 四小節 4/4。生日快樂是 3/4，用六小節示範。
    const end = Math.min(song.duration, start + song.beat * (song.id === 'birthday' ? 18 : 16));
    const beats = [];
    for (const [i, cue] of cues.entries()) {
      const limit = Math.min(end, cues[i + 1]?.at ?? end);
      for (let at = cue.at; at < limit; at += song.beat) {
        if (at === cue.at || limit - at > song.beat / 8) beats.push({ at, name: cue.name });
      }
      if (limit === end) break;
    }
    const run = { backed };
    demo = run;
    if (backed) {
      volumeLabel.hidden = false;
      backedDemo.textContent = '停止伴奏示範';
      if (!audio.src) audio.src = song.audio || (objectURL = melodyURL(song));
      try {
        audio.currentTime = start;
        await audio.play();
      } catch {
        if (demo !== run) return;
        stop();
        notice.textContent = '音檔無法播放，可以單聽吉他示範。';
        return;
      }
      if (demo !== run) return;
    } else {
      soloDemo.textContent = '停止示範';
      holdBgm(true);
    }
    const startTime = performance.now();
    let next = 0;
    function tick() {
      const time = backed ? audio.currentTime : start + (performance.now() - startTime) / 1000;
      if (time >= end) {
        stop();
        return;
      }
      // 跟著實際播放位置，緩衝時等伴奏，計時器晚到時只補目前的一拍。
      let beat;
      while (beats[next]?.at <= time + .002) beat = beats[next++];
      if (beat) playChord(beat.name, 'down');
      sync(time, true);
      demoTimer = setTimeout(tick, 16);
    }
    tick();
  }

  audio.addEventListener('playing', () => { if (!audio.paused) holdBgm(true); });
  audio.addEventListener('pause', () => { if (audio.paused && demo?.backed !== false) holdBgm(false); });
  audio.addEventListener('ended', () => {
    stop();
    render(cues.length, activeRow);
  });

  load(SONGS[0]);
  return {
    panel,
    hint,
    strum(name) {
      if (demo) return;
      if (follow && !audio.paused) sync();
      const target = follow ? shown : index;
      const cue = cues[target];
      if (!cue) return;
      clearMatch();
      if (name === cue.name) {
        matchIndex = target;
        cue.token.classList.add('matched');
        match.hidden = false;
      }
      if (!follow) {
        index++;
        render(index, cues[index]?.row ?? cue.row);
      }
    },
    stop,
    dispose: releaseAudio,
  };
}
