import { CLIP_CAMERAS, CLIP_LIMITS, CLIP_POSITIONS, CLIP_SLOTS, CLIP_TRANSITIONS,
  clipDuration, normalize, serializeClip } from './clip_format.mjs';
import { serializeSong } from './composer_model.mjs';
import { createClipPlayer } from './clip_player.mjs';
import { group1Line } from './studio_lines_group1.mjs';

const SECOND = 43;
const HISTORY = 50;
const ASSET_TYPE = 'application/x-studio-clip-asset';
const keyOf = src => src.kind + ':' + src.id;
const slotKey = slot => 'studioClip' + slot;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const timecode = seconds => {
  const ticks = Math.round(seconds * 10);
  return String(Math.floor(ticks / 600)).padStart(2, '0') + ':' +
    String(Math.floor(ticks / 10) % 60).padStart(2, '0') + '.' + ticks % 10;
};
const cameras = ['無', '推近', '拉遠', '向左平移', '向右平移'];
const transitions = ['無', '淡入淡出', '滑入'];
const positions = ['上方', '中央', '下方'];
const labels = { slides: '圖片', captions: '字幕', music: '配樂' };

const shareUrl = id => typeof id === 'string' && /^[A-Za-z0-9]{8,10}$/.test(id)
  ? 'https://yazelin.github.io/larch-chayu/clip/?id=' + id : '';
const packSlot = (value, share) => JSON.stringify({ ...value, ...(share ? { share } : {}) });

function readClip(raw) {
  try {
    const value = JSON.parse(raw);
    if (value?.v !== 1) return null;
    const url = shareUrl(value.share?.id);
    return { clip: normalize(value), share: url ? { id: value.share.id, url } : null };
  } catch {
    return null;
  }
}

export function mountClipEditor(host, { storage, collections, songs, composerSlots, remoteSource, keepWorks, shareClip, embedded, onSound }) {
  const node = (tag, className, text) => {
    const item = document.createElement(tag);
    if (className) item.className = className;
    if (text !== undefined) item.textContent = text;
    return item;
  };
  function button(label, icon, action, className = '') {
    const item = node('button', 'ce-button ' + className, label);
    item.type = 'button';
    item.dataset.clipIcon = icon;
    if (action) item.addEventListener('click', action);
    return item;
  }

  const assets = new Map(collections.flatMap(([, items]) => items.map(item => [keyOf(item.ref), item])));
  const tracks = new Map(songs.map(song => ['work:' + song.id, song]));
  for (const { slot, song, title } of composerSlots) {
    if (song) tracks.set('composer:' + slot, { title, song });
  }
  function musicItem(music) {
    const item = tracks.get(music.kind + ':' + (music.id ?? music.slot));
    if (item || music.kind !== 'work') return item;
    const url = remoteSource('song', music.id);
    return url ? { title: '詩的歌', url } : null;
  }
  const assetTitle = src => assets.get(keyOf(src))?.title || '素材已無法取得';
  let clip = normalize(), baseline = serializeClip(clip);
  let selection = null, activePane = 'preview', activeCategory = 0, savedSlot = null, savedShare = null;
  let history = [], future = [], busy = false, disposed = false, cancelGesture;
  const events = new AbortController();
  const root = node('div', 'ce-app');
  root.style.setProperty('--ce-second', SECOND + 'px');
  const actions = node('div', 'ce-actions');
  const title = node('input');
  title.type = 'text';
  limitText(title, CLIP_LIMITS.title);
  const titleLabel = node('label', 'ce-title', '作品名稱');
  titleLabel.append(title);
  const fresh = button('新作品', 'plus', () => {
    if (serializeClip(clip) === baseline && !clip.slides.length && !savedSlot &&
      clip.music.kind === 'none' && clip.title === normalize().title) return;
    confirm('開始新作品？', '目前的剪輯會從時間軸移除。', () => {
      replace(clip => Object.assign(clip, normalize()), null);
      savedSlot = null;
      savedShare = null;
      baseline = serializeClip(clip);
      player.stop();
    });
  });
  const undo = button('復原', 'undo', () => restore(history, future), 'ce-icon');
  const redo = button('重做', 'next', () => restore(future, history), 'ce-icon');
  const clear = button('清空', 'trash', () => confirm('清空時間軸？', '圖片、字幕與配樂會移除。', () => {
    replace(draft => Object.assign(draft, { slides: [], captions: [], music: { kind: 'none' } }), null);
    player.stop();
  }), 'ce-icon');
  const load = button('作品', 'list', () => void openSlots(false));
  load.setAttribute('aria-label', '作品清單');
  const save = button('存檔', 'box', () => void openSlots(true));
  const status = node('div', 'ce-status');
  status.setAttribute('role', 'status');
  const speak = (cue, values) => { status.textContent = '明：' + group1Line('ming', cue, values); };
  const share = button('分享', 'send', openShare, 'ce-primary');
  actions.append(titleLabel, fresh, undo, redo, clear, load, save, share);

  const nav = node('nav', 'ce-tabs');
  nav.setAttribute('aria-label', '切換剪輯面板');
  const workspace = node('div', 'ce-workspace');
  const library = node('aside', 'ce-library');
  library.setAttribute('aria-label', '素材庫');
  const categoryBar = node('nav', 'ce-categories');
  categoryBar.setAttribute('aria-label', '素材分類');
  const assetList = node('div', 'ce-asset-list');
  library.append(node('h2', '', '素材庫'), categoryBar, assetList);
  const preview = node('section', 'ce-preview');
  preview.setAttribute('aria-label', '影片預覽');
  const canvas = node('canvas', 'ce-frame');
  canvas.setAttribute('aria-label', '剪輯預覽畫面');
  const transport = node('div', 'ce-transport');
  const start = button('回到開頭', 'prev', () => seek(0), 'ce-icon');
  const play = button('播放', 'play', () => {
    showPane('preview');
    void player.play();
  }, 'ce-icon ce-primary');
  const stop = button('停止', 'stop', () => player.stop(), 'ce-icon ce-primary');
  const pause = button('暫停', 'pause', () => player.pause(), 'ce-icon');
  const end = button('跳到結尾', 'next', () => seek(player.duration), 'ce-icon');
  const position = node('output', 'ce-time');
  const slider = node('input', 'ce-scrub');
  slider.type = 'range';
  slider.min = '0';
  slider.step = '.01';
  slider.setAttribute('aria-label', '預覽時間');
  stop.hidden = true;
  pause.disabled = true;
  transport.append(start, play, stop, pause, end, position, slider);
  preview.append(canvas, transport);

  const inspector = node('aside', 'ce-inspector');
  inspector.setAttribute('aria-label', '片段屬性');
  const fields = node('div', 'ce-fields');
  inspector.append(node('h2', '', '片段屬性'), fields);
  workspace.append(library, preview, inspector);
  const panes = { library, preview, inspector };
  for (const [name, label, icon] of [
    ['library', '素材庫', 'sketchbook'], ['preview', '預覽', 'play'], ['inspector', '屬性', 'list']
  ]) {
    const tab = button(label, icon, () => showPane(name));
    tab.dataset.pane = name;
    nav.append(tab);
    panes[name].dataset.pane = name;
  }

  const timeline = node('section', 'ce-timeline');
  timeline.setAttribute('aria-label', '時間軸');
  const heading = node('div', 'ce-timeline-heading');
  const length = node('span', 'ce-time');
  const addCaption = button('加字幕', 'plus', () => {
    if (clip.captions.length >= CLIP_LIMITS.captions) { status.textContent = '最多 20 條字幕。'; return; }
    const start = Math.min(player.time, player.duration - .1);
    replace(draft => draft.captions.push({ text: '', start, end: start + 3, pos: 'bottom' }),
      { kind: 'captions', index: clip.captions.length });
    showPane('inspector');
    fields.querySelector('textarea')?.focus();
  });
  heading.append(node('h2', '', '時間軸'), length, addCaption);
  const scroll = node('div', 'ce-timeline-scroll');
  scroll.tabIndex = 0;
  scroll.setAttribute('role', 'region');
  scroll.setAttribute('aria-label', '時間軸，可左右捲動');
  const content = node('div', 'ce-timeline-content');
  const lanes = {};
  for (const [kind, label] of Object.entries({ ruler: '秒', ...labels })) {
    const row = node('div', 'ce-row ce-' + kind);
    const rail = node('div', 'ce-rail', label);
    const lane = node('div', 'ce-lane');
    row.append(rail, lane);
    content.append(row);
    lanes[kind] = lane;
  }
  scroll.append(content);
  timeline.append(heading, scroll);
  const dialog = node('dialog', 'ce-dialog');
  dialog.setAttribute('aria-label', '剪輯台');
  dialog.addEventListener('cancel', event => {
    event.stopPropagation();
    if (busy) event.preventDefault();
  });
  root.append(actions, nav, workspace, timeline, status, dialog);
  host.append(root);

  const player = createClipPlayer({ canvas, resolveImage: src => assets.get(keyOf(src))?.url ||
    (src.kind === 'work' && remoteSource('image', src.id)) });
  player.events.addEventListener('timeupdate', ({ detail }) => {
    position.textContent = timecode(detail) + ' / ' + timecode(player.duration);
    slider.value = detail;
    content.style.setProperty('--ce-cursor', detail * SECOND + 'px');
  });
  player.events.addEventListener('playstate', ({ detail }) => {
    const swapFocus = document.activeElement === (detail ? play : stop);
    play.hidden = detail;
    stop.hidden = !detail;
    pause.disabled = !detail;
    onSound(detail && clip.music.kind !== 'none' && !!musicItem(clip.music));
    if (swapFocus) (detail ? stop : play).focus();
  });
  player.events.addEventListener('ended', () => speak('clip_done', { seconds: timecode(player.duration) }));
  player.events.addEventListener('error', ({ detail }) => { status.textContent = detail; });
  let resumeAfterScrub = false;
  slider.addEventListener('pointerdown', () => {
    resumeAfterScrub = player.playing;
    player.pause();
  });
  function finishScrub() {
    if (resumeAfterScrub && player.time < player.duration) void player.play();
    resumeAfterScrub = false;
  }
  slider.addEventListener('pointerup', finishScrub);
  slider.addEventListener('pointercancel', finishScrub);
  slider.addEventListener('input', () => seek(slider.valueAsNumber, false));
  title.addEventListener('change', () => {
    remember({ ...clip, title: title.value });
    title.value = clip.title;
    updateActions();
  });
  for (const [index, [label]] of [...collections, ['歌']].entries()) {
    const tab = button(index === 2 ? 'CG' : label, ['sketchbook', 'hand', 'story', 'music'][index], () => {
      activeCategory = index;
      renderLibrary();
    });
    tab.setAttribute('aria-label', label);
    categoryBar.append(tab);
  }

  function showPane(name) {
    if (name !== 'preview' && nav.getClientRects().length) player.pause();
    activePane = name;
    for (const [id, pane] of Object.entries(panes)) pane.classList.toggle('ce-current', id === activePane);
    for (const tab of nav.children) tab.setAttribute('aria-pressed', tab.dataset.pane === activePane);
  }

  function showDialog(heading, children) {
    dialog.replaceChildren(node('h3', '', heading), ...children);
    if (!dialog.open) dialog.showModal();
  }

  function confirm(heading, question, action) {
    const choices = node('div', 'ce-dialog-actions');
    choices.append(button('取消', 'close', () => dialog.close()), button('確認', 'check', () => {
      dialog.close();
      action();
    }, 'ce-primary'));
    showDialog(heading, [node('p', '', question), choices]);
    choices.firstElementChild.focus();
  }

  async function openSlots(writing, sharing = false) {
    if (busy) return;
    busy = true;
    updateActions();
    try {
      const slots = await Promise.all(CLIP_SLOTS.map(async slot => {
        const raw = await storage.get(slotKey(slot));
        return { slot, raw, value: readClip(raw) };
      }));
      if (disposed) return;
      const rows = slots.map(({ slot, raw, value }) => {
        const item = button('第 ' + slot + ' 格　' + (value ? value.clip.title : raw ? '無法讀取' : '空白'),
          writing ? 'box' : 'list', () => {
            if (writing) {
              const write = () => void (sharing ? publish(slot) : saveFile(slot));
              if (raw) confirm('覆寫第 ' + slot + ' 格？', value?.clip.title || '這一格已有存檔。', write);
              else { dialog.close(); write(); }
            } else {
              const load = () => {
                dialog.close();
                player.stop();
                clip = value.clip;
                savedShare = value.share;
                baseline = serializeClip(clip);
                savedSlot = slot;
                history = [];
                future = [];
                selection = null;
                showPane('preview');
                render();
                status.textContent = '已讀取第 ' + slot + ' 格。';
              };
              if (serializeClip(clip) !== baseline) confirm('讀取另一份作品？', '目前的變更尚未存檔。', load);
              else load();
            }
          }, 'ce-slot');
        item.disabled = !writing && !value;
        item.dataset.slot = slot;
        return item;
      });
      showDialog(sharing ? '分享前先存到哪一格？' : writing ? '存到哪一格？' : '作品清單', [...rows, button('關閉', 'close', () => dialog.close())]);
    } catch {
      status.textContent = '存檔清單暫時無法讀取。';
    } finally {
      busy = false;
      updateActions();
    }
  }

  async function saveFile(slot) {
    if (busy) return;
    const snapshot = clip;
    const link = savedSlot === slot ? savedShare : null;
    busy = true;
    updateActions();
    try {
      await writeSlot(slot, snapshot, link);
      speak('clip_saved', { slot });
      if (keepWorks) {
        const savedLine = status.textContent;
        const kept = await keepWorks(slot, snapshot).catch(() => null);
        if (status.textContent === savedLine && kept !== true) {
          status.textContent = savedLine + (kept === null ? ' 素材保留尚未同步，再存一次可重試。' : ' 部分伺服器素材已無法取得。');
        }
      }
    } catch {
      status.textContent = '存檔失敗，請再試一次。';
    } finally {
      busy = false;
      updateActions();
    }
  }

  async function writeSlot(slot, value, link) {
    await storage.set(slotKey(slot), packSlot(value, link));
    baseline = serializeClip(value);
    savedSlot = slot;
    savedShare = link;
  }

  function openShare() {
    if (busy || !clip.slides.length) return;
    if (!savedSlot) { void openSlots(true, true); return; }
    if (!savedShare) { void publish(savedSlot); return; }
    const choices = node('div', 'ce-dialog-actions');
    choices.append(button('另開一個', 'plus', () => void publish(savedSlot)),
      button('更新', 'send', () => void publish(savedSlot, savedShare.id), 'ce-primary'));
    showDialog('這部剪輯已分享', [node('p', '', '更新會沿用原網址。'), linkField(savedShare.url), choices,
      button('取消', 'close', () => dialog.close())]);
  }

  function linkField(url) {
    const field = node('textarea', 'ce-share-url');
    field.rows = 2;
    field.spellcheck = false;
    field.readOnly = true;
    field.value = url;
    field.setAttribute('aria-label', '分享網址');
    field.addEventListener('focus', () => field.select());
    return field;
  }

  async function publish(slot, updateId) {
    if (busy) return;
    const value = clip;
    const link = savedSlot === slot ? savedShare : null;
    const track = value.music.kind === 'composer' ? musicItem(value.music)?.song : null;
    if (value.music.kind === 'composer' && !track) {
      showDialog('無法分享', [node('p', '', '編曲室的曲子已無法取得。'), button('關閉', 'close', () => dialog.close())]);
      return;
    }
    busy = true;
    updateActions();
    player.pause();
    const progress = node('p', '', '正在存檔…');
    progress.setAttribute('role', 'status');
    showDialog('正在分享', [progress]);
    try {
      await writeSlot(slot, value, link);
      progress.textContent = '正在上傳剪輯…';
      await keepWorks?.(slot, value).catch(() => {});
      const result = await shareClip({ clip: value, updateId, composer: track ? serializeSong(track) : undefined });
      const url = shareUrl(result.id);
      if (!url || result.url !== url) throw new Error('分享服務未傳回有效網址。');
      savedShare = { id: result.id, url };
      let stored = true;
      try { await writeSlot(slot, value, savedShare); }
      catch { stored = false; }
      if (disposed) return;
      speak('clip_shared');
      const field = linkField(url);
      const hint = node('p', 'ce-share-hint', embedded ? '請在手機或瀏覽器開啟這個網址。' : '');
      const copy = button('複製網址', 'list', async () => {
        try {
          await navigator.clipboard.writeText(url);
          hint.textContent = '網址已複製。' + (embedded ? '請在手機或瀏覽器開啟。' : '');
        } catch {
          field.focus();
          field.select();
          hint.textContent = '無法自動複製，網址已選取，請手動複製。' +
            (embedded ? '請在手機或瀏覽器開啟。' : '');
        }
      });
      const choices = node('div', 'ce-dialog-actions');
      choices.append(copy);
      if (!embedded) {
        const open = node('a', 'ce-button ce-open-share', '打開播放頁');
        open.dataset.clipIcon = 'open';
        open.href = url;
        open.target = '_blank';
        open.rel = 'noopener noreferrer';
        choices.append(open);
      }
      choices.append(button('關閉', 'close', () => dialog.close()));
      const line = node('p', '', status.textContent);
      const details = [line, field, hint, choices];
      if (!stored) details.splice(1, 0, node('p', '', '網址已建立，暫時無法寫回存檔。再存一次可重試。'));
      showDialog('分享成功', details);
    } catch (error) {
      if (!disposed) showDialog('分享未完成', [node('p', '', error.message || '請稍後再試。'),
        button('關閉', 'close', () => dialog.close())]);
    } finally {
      busy = false;
      updateActions();
    }
  }

  function updateActions() {
    const dirty = serializeClip(clip) !== baseline;
    titleLabel.classList.toggle('ce-dirty', dirty);
    undo.disabled = !history.length;
    redo.disabled = !future.length;
    clear.disabled = !clip.slides.length && clip.music.kind === 'none';
    save.disabled = load.disabled = busy;
    share.disabled = busy || !clip.slides.length || !shareClip;
  }

  function snapshot() { return { clip, selection, time: player.time }; }
  function remember(draft) {
    const next = normalize(draft);
    if (serializeClip(next) === serializeClip(clip)) return;
    history.push(snapshot());
    if (history.length > HISTORY) history.shift();
    future.length = 0;
    clip = next;
  }
  function replace(mutate, nextSelection = selection, preserveFields = false) {
    const draft = structuredClone(clip);
    mutate(draft);
    remember(draft);
    selection = nextSelection;
    render(preserveFields);
  }
  function restore(from, to) {
    if (!from.length) return;
    to.push(snapshot());
    const previous = from.pop();
    clip = previous.clip;
    selection = previous.selection;
    render();
    seek(previous.time);
  }

  function addImage(item, index = clip.slides.length) {
    if (clip.slides.length === CLIP_LIMITS.slides || player.duration > CLIP_LIMITS.seconds - 1) {
      status.textContent = '最多 40 張圖片，片長最多 5 分鐘。';
      return;
    }
    const start = clip.slides.slice(0, index).reduce((time, slide) => time + slide.dur, 0);
    replace(draft => draft.slides.splice(index, 0,
      { src: item.ref, dur: Math.min(3, 300 - player.duration), cam: 'none', trans: 'none' }), { kind: 'slides', index });
    seek(start);
  }

  function selectMusic(kind, id) {
    const reference = kind === 'work' ? { id } : kind === 'composer' ? { slot: id } : {};
    replace(draft => { draft.music = { kind, ...reference, start: draft.music.start }; },
      kind === 'none' ? null : { kind: 'music' });
  }

  function renderLibrary() {
    for (const [index, tab] of [...categoryBar.children].entries()) tab.setAttribute('aria-pressed', index === activeCategory);
    assetList.replaceChildren();
    if (activeCategory === collections.length) {
      const noMusic = button('無配樂', 'clear', () => selectMusic('none'));
      noMusic.setAttribute('aria-pressed', clip.music.kind === 'none');
      assetList.append(noMusic, node('h3', '', '詩的歌'));
      if (!songs.length) assetList.append(node('p', 'ce-empty', '還沒有歌。'));
      for (const song of songs) {
        const item = button(song.title, 'music', () => selectMusic('work', song.id));
        item.setAttribute('aria-pressed', clip.music.kind === 'work' && clip.music.id === song.id);
        assetList.append(item);
      }
      assetList.append(node('h3', '', '編曲室'));
      for (const { slot, title, song } of composerSlots) {
        const item = button('第 ' + slot + ' 格　' + (title || '空白'), 'music', () => selectMusic('composer', slot));
        item.disabled = !song;
        item.setAttribute('aria-pressed', clip.music.kind === 'composer' && clip.music.slot === slot);
        assetList.append(item);
      }
      return;
    }
    const grid = node('div', 'ce-assets');
    const items = collections[activeCategory][1];
    if (!items.length) assetList.append(node('p', 'ce-empty', '還沒有素材。'));
    for (const item of items) {
      const asset = button(item.title, 'plus', () => addImage(item), 'ce-asset');
      const thumb = node('img');
      thumb.src = item.url;
      thumb.alt = '';
      thumb.loading = 'lazy';
      asset.prepend(thumb);
      asset.draggable = true;
      asset.addEventListener('dragstart', event => {
        event.dataTransfer.setData(ASSET_TYPE, keyOf(item.ref));
        event.dataTransfer.effectAllowed = 'copy';
      });
      grid.append(asset);
    }
    assetList.append(grid);
  }

  function selected(kind, index) { return selection?.kind === kind && (selection.index ?? 0) === index; }
  function choose(kind, index, start) {
    selection = { kind, index };
    renderInspector();
    showPane('inspector');
    if (start !== undefined) seek(start);
    for (const item of content.querySelectorAll('.ce-clip')) {
      item.setAttribute('aria-pressed', selected(item.dataset.kind, Number(item.dataset.index) || 0));
    }
  }

  function selectField(name, values, options, value, apply) {
    const input = node('select');
    input.setAttribute('aria-label', name);
    for (const [index, key] of values.entries()) {
      const option = node('option', '', options[index]);
      option.value = key;
      input.append(option);
    }
    input.value = value;
    input.addEventListener('change', () => apply(input.value));
    return field(name, input);
  }

  function limitText(input, max) {
    input.maxLength = max * 2;
    const limit = event => {
      if (event.isComposing) return;
      const chars = [...input.value];
      if (chars.length > max) input.value = chars.slice(0, max).join('');
    };
    input.addEventListener('input', limit);
    input.addEventListener('compositionend', limit);
  }

  function field(name, input) {
    const label = node('label', '', name);
    label.append(input);
    return label;
  }
  function number(name, value, min, max, apply) {
    const input = node('input');
    input.type = 'number';
    input.min = min;
    input.max = max;
    input.step = '.1';
    input.defaultValue = value;
    input.addEventListener('change', () => {
      if (Number.isFinite(input.valueAsNumber)) apply(clamp(input.valueAsNumber, Number(input.min), Number(input.max)));
      else input.value = input.defaultValue;
    });
    return field(name, input);
  }

  function moveSlide(index, to) {
    if (index === to) return;
    replace(draft => draft.slides.splice(to, 0, ...draft.slides.splice(index, 1)), { kind: 'slides', index: to });
    seek(clip.slides.slice(0, to).reduce((total, item) => total + item.dur, 0));
  }

  function renderInspector(preserve = false) {
    const view = node('div');
    const { kind, index } = selection || {};
    const item = kind === 'music' ? clip.music : clip[kind]?.[index];
    if (!item) {
      fields.replaceChildren(node('p', 'ce-empty', '選取時間軸上的片段。'));
      return;
    }
    const update = (key, value) => replace(draft => {
      const target = kind === 'music' ? draft.music : draft[kind][index];
      target[key] = value;
    }, selection, true);
    const label = kind === 'slides' ? assetTitle(item.src) : kind === 'captions' ? item.text || '新字幕'
      : musicItem(item)?.title || '配樂已無法取得';
    const header = node('div', 'ce-selection');
    header.append(node('span', '', labels[kind]), node('strong', '', label));
    view.append(header);
    const commands = node('div', 'ce-inspector-actions');
    if (kind === 'slides') {
      const max = Math.min(10, (3000 - Math.round((player.duration - item.dur) * 10)) / 10);
      view.append(number('停留秒數', item.dur, 1, max, value => update('dur', value)),
        selectField('運鏡', CLIP_CAMERAS, cameras, item.cam, value => update('cam', value)),
        selectField('轉場', CLIP_TRANSITIONS, transitions, item.trans, value => update('trans', value)));
      const prior = button('往前移', 'prev', () => moveSlide(index, index - 1), 'ce-icon');
      const next = button('往後移', 'next', () => moveSlide(index, index + 1), 'ce-icon');
      prior.disabled = index === 0;
      next.disabled = index === clip.slides.length - 1;
      commands.append(prior, next);
    } else if (kind === 'captions') {
      const input = node('textarea');
      input.rows = 2;
      limitText(input, CLIP_LIMITS.text);
      input.value = item.text;
      input.addEventListener('change', () => update('text', input.value));
      view.append(field('字幕文字', input),
        selectField('位置', CLIP_POSITIONS, positions, item.pos, value => update('pos', value)),
        number('開始秒數', item.start, 0, item.end - .1, value => update('start', value)),
        number('結束秒數', item.end, item.start + .1, player.duration, value => update('end', value)));
    } else {
      view.append(number('配樂起點', item.start, 0, player.duration, value => update('start', value)));
    }
    commands.append(button('移除' + labels[kind], 'trash', () => {
      if (kind === 'music') selectMusic('none');
      else replace(draft => draft[kind].splice(index, 1), null);
    }));
    view.append(commands);
    if (!preserve || !fields.querySelector('.ce-selection')) {
      fields.replaceChildren(...view.children);
      return;
    }
    fields.querySelector('.ce-selection strong').textContent = label;
    const previous = fields.querySelectorAll('input, select, textarea');
    view.querySelectorAll('input, select, textarea').forEach((input, index) => {
      const old = previous[index];
      if (input.type === 'number') {
        old.min = input.min;
        old.max = input.max;
        old.defaultValue = input.value;
      }
      old.value = input.value;
    });
  }

  function seek(time, follow = true) {
    player.seek(time);
    if (follow) {
      const rail = content.querySelector('.ce-rail').offsetWidth;
      const x = player.time * SECOND;
      if (x < scroll.scrollLeft || x > scroll.scrollLeft + scroll.clientWidth - rail - 8) {
        scroll.scrollLeft = Math.max(0, x - (scroll.clientWidth - rail) / 2);
      }
    }
  }

  function laneTime(lane, clientX) {
    const rect = lane.getBoundingClientRect();
    return (clientX - rect.left) * (lane.offsetWidth / rect.width) / SECOND;
  }

  function insertion(time) {
    let point = 0;
    for (const [index, slide] of clip.slides.entries()) {
      if (time < point + slide.dur / 2) return index;
      point += slide.dur;
    }
    return clip.slides.length;
  }

  function gesture(event, target, move, finish, revert) {
    if (event.button !== 0 || cancelGesture) return;
    const { pointerId, clientX } = event;
    let moved = false;
    const controller = new AbortController();
    const { signal } = controller;
    target.setPointerCapture(pointerId);
    const cleanup = () => {
      controller.abort();
      cancelGesture = null;
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
      revert?.();
    };
    cancelGesture = cleanup;
    target.addEventListener('pointermove', event => {
      if (event.pointerId !== pointerId || (!moved && Math.abs(event.clientX - clientX) < 4)) return;
      moved = true;
      move(event.clientX, clientX);
    }, { signal });
    target.addEventListener('pointerup', event => {
      if (event.pointerId !== pointerId) return;
      cleanup();
      if (moved) {
        // A pointerup can still synthesize a click before the lane redraw.
        target.addEventListener('click', event => event.stopImmediatePropagation(), { capture: true, once: true });
        finish(event.clientX, clientX);
      }
    }, { signal });
    target.addEventListener('lostpointercapture', cleanup, { signal });
    target.addEventListener('pointercancel', cleanup, { signal });
  }

  lanes.ruler.addEventListener('pointerdown', event => {
    if (event.button !== 0) return;
    const time = x => seek(laneTime(lanes.ruler, x), false);
    time(event.clientX);
    gesture(event, lanes.ruler, time, time);
  });
  lanes.slides.addEventListener('dragover', event => {
    if (!event.dataTransfer.types.includes(ASSET_TYPE)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  });
  lanes.slides.addEventListener('drop', event => {
    const item = assets.get(event.dataTransfer.getData(ASSET_TYPE));
    if (!item) return;
    event.preventDefault();
    addImage(item, insertion(laneTime(lanes.slides, event.clientX)));
  });

  function segment(kind, index, name, start, end, icon, resize) {
    const lane = lanes[kind];
    const item = button(name, icon, () => choose(kind, index, start), 'ce-clip');
    item.setAttribute('aria-pressed', selected(kind, index));
    item.dataset.index = index;
    item.dataset.kind = kind;
    item.setAttribute('aria-label', labels[kind] + '，' + name + '，' + timecode(start));
    if (kind === 'slides') item.append(node('small', 'ce-clip-duration', clip.slides[index].dur + ' 秒'));
    const handle = node('span', 'ce-trim');
    handle.setAttribute('aria-hidden', 'true');
    if (resize) item.append(handle);
    const layout = (from, through) => {
      item.style.left = 'calc(' + from * SECOND + 'px + 2px)';
      item.style.width = 'max(12px, calc(' + (through - from) * SECOND + 'px - 4px))';
    };
    layout(start, end);
    item.addEventListener('pointerdown', event => {
      const trimming = event.target === handle;
      const origin = laneTime(lane, event.clientX);
      const adjust = (x, commit) => {
        const delta = laneTime(lane, x) - origin;
        if (trimming) {
          const max = kind === 'slides' ? Math.min(10, 300 - player.duration + end - start) : player.duration - start;
          const duration = clamp(end - start + delta, kind === 'slides' ? 1 : .1, max);
          if (!commit) layout(start, start + duration);
          else replace(draft => {
            if (kind === 'slides') draft.slides[index].dur = duration;
            else draft.captions[index].end = start + duration;
          }, { kind, index });
        } else if (kind === 'slides') {
          const insert = insertion(laneTime(lane, x));
          const to = insert > index ? insert - 1 : insert;
          if (commit) moveSlide(index, to);
          else item.style.transform = 'translateX(' + delta * SECOND + 'px)';
        } else {
          const span = kind === 'captions' ? end - start : 0;
          const from = clamp(start + delta, 0, player.duration - span);
          if (!commit) layout(from, kind === 'music' ? end : from + span);
          else replace(draft => {
            if (kind === 'music') draft.music.start = from;
            else Object.assign(draft.captions[index], { start: from, end: from + span });
          }, { kind, index });
        }
      };
      let pointerX, scrollFrame;
      function scrollAtEdge() {
        const { left, right } = scroll.getBoundingClientRect();
        const stickyWidth = content.querySelector('.ce-rail').getBoundingClientRect().width;
        const direction = pointerX > right - 22 ? 1 : pointerX < left + stickyWidth + 16 ? -1 : 0;
        if (!direction) return;
        const previous = scroll.scrollLeft;
        scroll.scrollLeft += direction * 12;
        if (scroll.scrollLeft === previous) return;
        adjust(pointerX, false);
        scrollFrame = requestAnimationFrame(scrollAtEdge);
      }
      gesture(event, item, x => {
        pointerX = x;
        cancelAnimationFrame(scrollFrame);
        adjust(x, false);
        scrollFrame = requestAnimationFrame(scrollAtEdge);
      }, x => {
        adjust(x, true);
        if (trimming || kind !== 'slides') showPane('inspector');
      }, () => {
        cancelAnimationFrame(scrollFrame);
        layout(start, end);
        item.style.transform = '';
      });
    });
    lane.append(item);
  }

  function renderTimeline() {
    for (const lane of Object.values(lanes)) lane.replaceChildren();
    const total = player.duration;
    const extent = Math.max(12, Math.ceil(total + 1));
    content.style.setProperty('--ce-length', extent * SECOND + 'px');
    for (let t = 0; t <= extent; t += 2) {
      const tick = node('span', 'ce-tick', String(t));
      tick.style.left = t * SECOND + 'px';
      lanes.ruler.append(tick);
    }
    let at = 0;
    clip.slides.forEach((slide, index) => {
      const end = Math.round((at + slide.dur) * 10) / 10;
      segment('slides', index, assetTitle(slide.src), at, end, 'sketchbook', true);
      at = end;
    });
    clip.captions.forEach((caption, index) => {
      segment('captions', index, caption.text || '新字幕', caption.start, caption.end, 'story', true);
    });
    if (clip.music.kind !== 'none') segment('music', 0, musicItem(clip.music)?.title || '配樂已無法取得',
      clip.music.start, total, 'music', false);
    length.textContent = '片長 ' + timecode(total);
    slider.max = total;
    addCaption.disabled = !clip.slides.length;
    slider.disabled = play.disabled = start.disabled = end.disabled = !clip.slides.length;
  }

  function render(preserveFields) {
    if (document.activeElement !== title) title.value = clip.title;
    const item = musicItem(clip.music);
    const categoryIsMusic = activeCategory === collections.length;
    player.setClip(clip, item?.url || item?.song);
    if (selection?.kind !== 'music' && selection && !clip[selection.kind][selection.index]) selection = null;
    renderInspector(preserveFields);
    renderTimeline();
    slider.value = player.time;
    if (categoryIsMusic) {
      // Update selection in place so the keyboard stays on the chosen song.
      const buttons = [...assetList.querySelectorAll('button')];
      const keys = ['none:', ...songs.map(song => 'work:' + song.id), ...composerSlots.map(({ slot }) => 'composer:' + slot)];
      const key = clip.music.kind + ':' + (clip.music.id ?? clip.music.slot ?? '');
      buttons.forEach((item, index) => item.setAttribute('aria-pressed', keys[index] === key));
    }
    updateActions();
  }

  document.addEventListener('keydown', event => {
    if (!host.closest('.ming-app-window')?.matches(':not([hidden]):not(.inactive)') || event.isComposing) return;
    if (event.key === 'Escape' && (cancelGesture || resumeAfterScrub || player.playing || dialog.open)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (dialog.open) dialog.close();
      else if (cancelGesture) cancelGesture();
      else { resumeAfterScrub = false; player.stop(); }
    }
    if (root.contains(event.target) && !event.target.matches('input, textarea, select') && !dialog.open &&
      (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) restore(future, history);
      else restore(history, future);
    }
  }, { capture: true, signal: events.signal });
  speak('clip_open', { slots: CLIP_SLOTS.length });
  showPane('preview');
  renderLibrary();
  render();
  return {
    stop: () => player.pause(),
    dispose() {
      disposed = true;
      cancelGesture?.();
      events.abort();
      player.dispose();
      if (dialog.open) dialog.close();
    }
  };
}
