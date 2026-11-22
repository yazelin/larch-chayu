(() => {
  const screen = document.getElementById('page-loading');
  const shell = parent !== window && window.name === 'larch-page-shell';
  const post = message => { if (parent !== window) parent.postMessage(message, '*'); };
  const scriptOrStyle = 'script[src], link[rel="stylesheet"]';
  const imageSelector = 'img[src], img[srcset]';
  const tasks = [];
  const resources = new WeakSet();
  const decoded = new WeakMap();
  const observedImages = new WeakMap();
  const preloads = new Map();
  let pendingWork = [];
  let finished = !shell && (!screen || screen.classList.contains('leaving'));
  let visible = finished;
  let finishing = false;
  let reported = 0;
  let deadline;
  let assembled = false;
  let reportsToShell = shell;

  function progress() {
    if (finished) return;
    const active = tasks.filter(task => task.relevant());
    const ratio = active.filter(task => task.status === 'done').length / Math.max(1, active.length);
    screen?.setLoadingProgress(Math.min(.99, ratio));
    if (reportsToShell && ratio > reported) {
      reported = Math.min(ratio, .99);
      post({ type: 'larch-page:progress', value: reported });
    }
  }

  function register(label, relevant = () => true) {
    const task = { label, relevant, status: 'pending' };
    tasks.push(task);
    progress();
    return (status, error) => {
      task.status = status;
      task.error = error;
      progress();
    };
  }

  function track(label, promise, relevant) {
    if (finished) return promise;
    const settle = register(label, relevant);
    Promise.resolve(promise).then(() => settle('done'), error => settle('failed', error));
    return promise;
  }

  function watchResource(node) {
    if (resources.has(node)) return;
    resources.add(node);
    const settle = register(node.src || node.href);
    node.addEventListener('load', () => settle('done'), { once: true });
    node.addEventListener('error', () => settle('failed', new Error('載入失敗')), { once: true });
  }

  function image(node) {
    const src = node.srcset ? node.currentSrc || node.src : node.src;
    if (decoded.get(node)?.src === src) return decoded.get(node).promise;
    const label = src.startsWith('data:') ? `內嵌圖片（${node.className || node.id || 'img'}）` : src;
    const inScene = node.isConnected;
    const record = { src };
    decoded.set(node, record);
    record.promise = track(label, node.decode(), () => decoded.get(node) === record && (!inScene || node.isConnected));
    return record.promise;
  }

  function watchImage(node) {
    // 延遲載入的相簿圖由原本的相簿介面按需載入。
    if (node.loading === 'lazy' || node.closest('.chapter-tip-screen')) return;
    const promise = image(node);
    if (observedImages.get(node) === promise) return;
    observedImages.set(node, promise);
    pendingWork.push(promise);
  }

  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'attributes') {
        if (record.target.matches(imageSelector)) watchImage(record.target);
        continue;
      }
      for (const node of record.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches(scriptOrStyle)) watchResource(node);
        if (node.matches(imageSelector)) watchImage(node);
        node.querySelectorAll(scriptOrStyle).forEach(watchResource);
        node.querySelectorAll(imageSelector).forEach(watchImage);
      }
    }
  });
  if (!finished) {
    watchResource(document.currentScript);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'srcset'] });
  }

  function preload(src, crossOrigin = null) {
    const url = new URL(src, document.baseURI).href;
    const key = crossOrigin ? `${crossOrigin} ${url}` : url;
    if (preloads.has(key)) return preloads.get(key);
    const node = new Image();
    if (crossOrigin) node.crossOrigin = crossOrigin;
    node.src = url;
    const promise = image(node).then(() => node);
    if (!finished) preloads.set(key, promise);
    return promise;
  }

  async function sceneImages() {
    document.querySelectorAll(imageSelector).forEach(watchImage);
    const urls = new Set();
    const documentUrl = location.href.split('#', 1)[0];
    const properties = ['backgroundImage', 'borderImageSource', 'maskImage', 'listStyleImage', 'content'];
    function collect(node) {
      const style = getComputedStyle(node);
      if (style.display === 'none' || node.classList.contains('chapter-tip-screen')) return;
      for (const part of [style, getComputedStyle(node, '::before'), getComputedStyle(node, '::after')]) {
        for (const key of properties) {
          for (const match of part[key].matchAll(/url\("([^"]+)"\)/g)) urls.add(match[1]);
        }
      }
      for (const child of node.children) collect(child);
    }
    collect(document.body);
    for (const node of document.querySelectorAll('svg image')) {
      if (node.href.baseVal) urls.add(node.href.baseVal);
    }
    await Promise.allSettled([...urls].map(src => {
      const url = new URL(src, document.baseURI);
      // 行內 SVG 的遮罩等片段只參照本頁，沒有圖片要下載。
      if (url.hash && url.href.split('#', 1)[0] === documentUrl) return;
      return preload(url.href);
    }));
  }

  let show;
  const shown = finished ? Promise.resolve() : new Promise(resolve => { show = resolve; });
  let shellRevealed;
  const shellShown = shell && new Promise(resolve => { shellRevealed = resolve; });
  function reveal(reason) {
    if (finished) return;
    finished = true;
    clearTimeout(deadline);
    observer.disconnect();
    pendingWork = [];
    preloads.clear();
    const missing = tasks.filter(task => task.relevant() && task.status !== 'done')
      .map(({ label, status, error }) => ({ resource: label, status, error: error?.message }));
    if (reason) {
      for (const font of document.fonts) {
        if (font.status === 'loading') missing.push({ resource: font.family, status: 'pending' });
      }
    }
    if (missing.length || reason) {
      console.warn(`[page-loading] ${reason || '部分資源載入失敗'}`, missing);
    }
    tasks.length = 0;
    if (reportsToShell && !reason) {
      if (shell && window.name === 'larch-page-shell') window.name = '';
      post({ type: 'larch-page:ready' });
    }
    assembled = !reason;
    let showing = shellShown;
    if (screen) showing = screen.dismiss(!reason);
    else if (reason) {
      // 外殼若已逾時，送出的顯示通知可能早於本頁程式。
      showing = Promise.race([shellShown, new Promise(resolve => setTimeout(resolve, 400))]);
    }
    showing.then(() => { visible = true; show(); });
  }

  function prepare(label, promise) {
    if (finished) {
      Promise.resolve(promise).catch(error => console.warn(label, error));
      return;
    }
    pendingWork.push(track(label, promise));
  }

  async function drain() {
    while (pendingWork.length) {
      const batch = pendingWork;
      pendingWork = [];
      await Promise.allSettled(batch);
    }
  }

  const domReady = document.readyState === 'loading'
    ? new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve, { once: true }))
    : Promise.resolve();
  const endAssembly = !finished && register('頁面組裝');
  const endVisuals = !finished && register('場景圖層與字型');
  async function finish() {
    if (finished || finishing) return;
    finishing = true;
    endAssembly('done');
    await domReady;
    await Promise.all([sceneImages(), drain()]);
    // 進場資料可能換上新的圖層，例如工作室的服裝或小島的底圖。
    while (!finished) {
      await drain();
      // 先收集當前樣式，讓畫面會用到的字型進入載入佇列。
      await Promise.all([sceneImages(), document.fonts.ready]);
      if (pendingWork.length) continue;
      const failed = [...document.fonts].filter(font => font.status === 'error').map(font => font.family);
      if (failed.length) endVisuals('failed', new Error(failed.join(', ')));
      else endVisuals('done');
      reveal();
    }
  }

  window.PageLoading = {
    track, prepare, image, preload, finish, shown, shell,
    get loading() { return !visible; },
    timeout: () => reveal('載入逾時'),
    json: src => track(src, fetch(src).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    })),
  };
  if (shell) deadline = setTimeout(() => reveal('載入逾時'), 20000);
  addEventListener('message', event => {
    if (event.source !== parent) return;
    if (shell && event.data?.type === 'larch-page:shown') shellRevealed();
    if (shell && event.data?.type === 'larch-page:timeout') reveal('載入逾時');
    // 小島在同一張卡內換頁時，讓頁內層照常顯示，也回報這一頁已就緒。
    if (screen && !reportsToShell && event.data?.type === 'larch-page:observe') {
      reportsToShell = true;
      if (assembled) post({ type: 'larch-page:ready' });
    }
  });
})();
