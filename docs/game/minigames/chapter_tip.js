// shared-loading-tips:start
function chapterTip(tips, requested, islandStage) {
  const PHONE_APP_ENABLED = false;
  const chapters = new Map([
    ['ch1', '第一章'], ['interlude1', '小插曲一'], ['ch2', '第二章'], ['interlude2', '小插曲二'],
    ['ch3', '第三章'], ['interlude3', '小插曲三'], ['ch4', '第四章'], ['interlude4', '小插曲四'],
    ['ch5', '第五章'], ['ch6', '第六章'], ['interlude5', '小插曲五'], ['ch7', '第七章'],
    ['morning', '通關後'], ['bright', '通關後'], ['poem', '通關後'], ['partners', '通關後'],
    ['true_end', '通關後'],
  ]);
  const stages = [...new Set(chapters.values())];
  const stageChapters = ['ch1', 'ch3', 'ch4', 'ch5', 'true_end'];
  const normalized = /^[1-7]$/.test(requested) ? 'ch' + requested :
    /^(true|trueending|真結局)$/i.test(requested) ? 'true_end' : requested;
  const chapter = chapters.has(normalized) ? normalized :
    ([...chapters].find(([, stage]) => stage === normalized)?.[0] ??
      stageChapters[Number(islandStage) - 1] ?? 'ch1');
  const unused = tips.filter(tip => stages.includes(tip.from) &&
    (!tip.needs || (tip.needs === 'phone_app' && PHONE_APP_ENABLED)));
  // 依順序替各章挑一則並移出池子，每次開頁都會得到同一份分配。
  for (const [key, stage] of chapters) {
    const rank = stages.indexOf(stage);
    const eligible = unused.filter(tip => stages.indexOf(tip.from) <= rank);
    const tip = eligible.length ? eligible[(rank + unused.length) % eligible.length] : null;
    if (key === chapter) {
      return { tip, eligible, chapter };
    }
    if (tip) unused.splice(unused.indexOf(tip), 1);
  }
}
// shared-loading-tips:end

(() => {
  const DURATION_MS = 3000;
  const screen = document.getElementById('chapter-transition');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  let completed = false;
  let timer;
  let frame;

  function complete() {
    if (completed) return;
    completed = true;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    screen.setLoadingProgress(1, true);
    screen.stopLoadingMotion();
    parent.postMessage({ type: 'larch:complete', result: 'continue', payload: {} }, '*');
  }

  screen.addEventListener('click', complete);
  addEventListener('keydown', event => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    complete();
  });
  if (window.PageLoading?.shell) {
    screen.setLoadingProgress(1, true);
    addEventListener('message', event => {
      if (event.source === parent && event.data?.type === 'larch-page:continue') complete();
    });
    PageLoading.shown.then(() => {
      if (completed) return;
      screen.focus({ preventScroll: true });
      timer = setTimeout(complete, DURATION_MS);
    });
  } else {
    screen.focus({ preventScroll: true });
    timer = setTimeout(complete, DURATION_MS);
    const started = performance.now();
    function count(now) {
      if (!motion.matches) screen.setLoadingProgress((now - started) / DURATION_MS, true);
      frame = requestAnimationFrame(count);
    }
    if (!motion.matches) frame = requestAnimationFrame(count);
  }
  parent.postMessage({ type: 'larch:ready' }, '*');
  window.PageLoading?.finish();
})();
