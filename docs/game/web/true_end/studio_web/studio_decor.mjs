import { preparePanel } from './studio_panel.mjs';
import { taipeiDay } from './studio_draw.mjs';
// 工作室佈置：5 個常駐位（寵物或植物）、澆水長大、落地鏡換裝（6 套衣服＋8 件配件）與穿著走路、換上三人私人物品時的一句話。
// 方案與作者定案：真結局/studio_decor_plan.md；素材與疊圖規則：真結局/studio_decor/（art/wear/wear.json、wear.py 同一套規則）。
// 存檔：StudioDB 的 studio_slots、plant_growth、plant_watered、outfit、accessories（Larch 卡裡會進 persistent 的 studioMisc，跨週目保留）。
// 解鎖：衣服與配件看章節（或小遊戲完成變數）；寵物看圖鑑 creatures／zukan_seen；植物看 plants／plants_seen。測試用網址參數 unlock=all。
const query = new URLSearchParams(location.search);
if (query.get('mode') !== 'turn' && !document.documentElement.classList.contains('studio-real-chat')) boot();

function boot() {
  const DB = window.StudioDB;
  const ART = '../studio_decor/art/';
  const WEAR = '../studio_decor/art/wear/';   // 路徑寫成完整字串、檔名用「前綴＋名字」組：新版/build/export_pages.py 靠這個把圖收進公開站
  // 常駐位的寵物用另外畫的沒白邊版本（studio_decor/art/pet_*.webp；圖鑑紙片有白色貼紙邊，留在圖鑑用）
  const UNLOCK_ALL = query.get('unlock') === 'all';
  let variables = (window.__studio && window.__studio.variables) || {};   // larch:init 比這支模組早到，先拿 index.html 收到的那份
  window.addEventListener('message', function (event) {
    if (event.source !== window.parent) return;
    const data = event.data || {};
    if (data.type === 'larch:init') {
      variables = data.variables || {};
      const ready = refreshAll();
      if (ready) window.PageLoading?.prepare('工作室佈置與換裝', ready);
    }
  });
  function game() { return (window.STUDIO_FEATURES && window.STUDIO_FEATURES.context()) || { chapter: 1, day: 1 }; }
  function flag(name) { const v = variables[name] !== undefined ? variables[name] : query.get(name); return v === true || v === 1 || v === 'true' || v === '1'; }
  function listVar(name) { const v = variables[name] !== undefined ? variables[name] : query.get(name); return String(v || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); }

  // ── 資料 ──
  const OUTFITS = [
    { id: 'everyday', name: '平常的衣服', lock: '', open: function () { return true; } },
    { id: 'hero', name: '勇者裝', lock: '第一章', open: function (g) { return g.chapter >= 1; } },
    { id: 'pajamas', name: '淡藍睡衣', lock: '第二章', open: function (g) { return g.chapter >= 2; } },
    { id: 'smock', name: '畫室罩衫', lock: '第三章色之國之後', open: function (g) { return g.chapter >= 4 || flag('ch3ColorDone'); } },
    { id: 'stage', name: '舞台外套', lock: '第四章音之國之後', open: function (g) { return g.chapter >= 5 || flag('ch4RapDone'); } },
    { id: 'cardigan', name: '深藍開襟衫', lock: '第五章時之國之後', open: function (g) { return g.chapter >= 6 || flag('ch5GearsDone'); } }
  ];
  const ACCS = [
    { id: 'headphones', name: '酒紅色耳機', slot: 'head', lock: '', open: function () { return true; } },
    { id: 'tea', name: '冰紅茶', slot: 'hand', lock: '', open: function () { return true; } },
    { id: 'cape', name: '淡紫披風', slot: 'shoulder', lock: '第一章', open: function (g) { return g.chapter >= 1; } },
    { id: 'sketchbook', name: '晨的素描本', slot: 'hand', lock: '第三章', open: function (g) { return g.chapter >= 3; } },
    { id: 'hat', name: '詩的大帽子', slot: 'head', lock: '第四章說唱對決之後', open: function (g) { return g.chapter >= 5 || flag('ch4RapDone'); } },
    { id: 'watch', name: '明的懷錶', slot: 'hand', lock: '第五章時之國之後', open: function (g) { return g.chapter >= 6 || flag('ch5GearsDone'); } },
    { id: 'blazer', name: '明的西裝外套', slot: 'shoulder', lock: '第五章那一晚之後', open: function (g) { return g.chapter >= 6; } },
    { id: 'camera', name: '拍立得相機', slot: 'neck', lock: '第七章', open: function (g) { return g.chapter >= 7; } }
  ];
  const SLOT_NAME = { head: '頭上', hand: '手上', shoulder: '肩上', neck: '脖子' };
  const EXCLUSIVE = { head: '兩個都戴在頭上，一次只能戴一個。', hand: '都拿在同一隻手上，一次只能拿一樣。', shoulder: '都披在肩上，一次只能披一件。' };
  const ACC = Object.fromEntries(ACCS.map(function (a) { return [a.id, a]; }));
  // 換上三人的私人物品、走到那人旁邊時的一句（白話審稿過，真結局/studio_decor/lines/outfit_lines.md）
  const LINES = {
    hat: { who: 'shi', lines: [['茶語', '我戴一下你的帽子喔。'], ['詩', '那頂是我的帽子欸。……算了，妳戴比較好看。']] },
    watch: { who: 'ming', lines: [['茶語', '我拿一下你的懷錶喔。'], ['明', '拿好，不要摔到。']] },
    blazer: { who: 'ming', lines: [['茶語', '我穿一下你的外套喔。'], ['明', '又拿我的外套。……晚上冷，穿著吧。']] }
  };
  const PETS = {
    cat: { name: '貓', img: 'cat_sleep', walk: 'cat_walk', place: '朝霞丘小屋門口', h: 34, act: 'cat' },
    rabbit: { name: '兔子', img: 'rabbit', place: '朝霞丘', h: 40, act: 'hop' },
    hermit: { name: '寄居蟹', img: 'hermit', place: '海灘', h: 16, act: 'crawl' },
    crab: { name: '螃蟹', img: 'crab', place: '海灘', h: 14, act: 'crawl' },
    fish: { name: '小魚群', img: 'fish', place: '海底', h: 20, act: 'swim' },
    jelly: { name: '水母', img: 'jelly', place: '海底', h: 24, act: 'swim' },
    turtle: { name: '海龜', img: 'turtle', place: '月光岬', h: 18, act: 'swim' },
    bird: { name: '小鳥', img: 'bird', place: '朝霞丘', h: 26, act: 'bird' },
    butterfly: { name: '蝴蝶', img: 'butterfly', place: '朝霞丘', h: 22, act: 'flutter' },
    firefly: { name: '螢火蟲', img: 'firefly', place: '月光岬', h: 30, act: 'glow' }
  };
  const PLANTS = [
    ['tulip', '鬱金香', '朝霞丘'], ['sakura', '櫻花小盆景', '朝霞丘'], ['paint', '五色顏料花', '朝霞丘'], ['tomato', '小番茄苗', '朝霞丘'],
    ['coconut', '椰子苗', '海灘'], ['morning', '馬鞍藤', '海灘'], ['airplant', '貝殼空氣鳳梨', '海灘'],
    ['primrose', '月見草', '月光岬'], ['pine', '小松樹盆景', '月光岬'], ['moss', '苔球', '月光岬'], ['olive', '四個人一起種的小樹', '碼頭']
  ].map(function (p) { return { id: p[0], name: p[1], place: p[2] }; });
  const PLANT = Object.fromEntries(PLANTS.map(function (p) { return [p.id, p]; }));
  // 常駐位：哪面牆、離牆左端幾公分、台子、可以放的寵物。台子寬與離地高度是公分（跟人物同一套比例）。
  // 第四格照方案是「長桌東端」，側面捲軸沒有畫長桌，放在南牆矮櫃上面。
  const SLOTS = [
    { key: 's1', name: '窗邊', wall: 'north', xCm: 548, base: 'cushion', baseW: 92, pets: ['cat', 'rabbit'], sit: .52, def: 'cat' },
    { key: 's2', name: '東南角水族缸', wall: 'south', xCm: 92, base: 'aquarium', baseW: 104, pets: ['hermit', 'crab', 'fish', 'jelly', 'turtle'], sit: .30, inset: true, def: 'hermit' },
    { key: 's3', name: '西南角', wall: 'south', xCm: 812, base: 'fence', baseW: 112, pets: ['rabbit', 'cat'], sit: .34, def: 'rabbit' },
    { key: 's4', name: '矮櫃上', wall: 'south', xCm: 652, base: 'tray', baseW: 44, liftCm: 90, pets: ['bird', 'firefly'], sit: .90, floor: .30, floorPets: ['firefly'], def: 'tulip' },
    { key: 's5', name: '窗邊花架', wall: 'north', xCm: 706, base: 'stand', baseW: 54, pets: ['bird', 'butterfly'], sit: .88, def: 'bird' }
  ];
  // sit：放上去的東西「底部」落在台子圖高度的哪裡（從下往上量，對的是台面的中前段，不是台子的最頂邊）。
  // 花架頂盤的盤面在圖高 .87～.95（前緣到後緣），放 .88；原本 .97 是頂盤後緣，東西會浮在半空（作者 2026-11-21 回饋）。
  // floor：台子底盤的盤面（矮櫃上的托盤是 .30）；植物與 floorPets（螢火蟲是一整個玻璃罐）放這裡，鳥才站上面的橫桿（sit .90，橫桿在圖高 .88～.97；原本 .60 是立柱中段，鳥腳底下沒有東西）。
  // 寵物與植物的圖四周都留了約 6px（原圖高約 3%）的透明邊，落點要把這段往下扣，底部才會貼住台面。
  const ART_PAD = .028;
  function seatBottom(fraction, heightPx) { return 'calc(' + (fraction * 100) + '% - ' + (heightPx * ART_PAD).toFixed(1) + 'px)'; }
  const BASE_AR = { cushion: 462 / 295, aquarium: 426 / 361, fence: 477 / 326, tray: 373 / 291, stand: 275 / 420 };

  // ── 狀態 ──
  const st = { slots: null, growth: {}, watered: {}, outfit: 'everyday', accs: [], seenPets: new Set(), plants: new Set(), loaded: false };
  let saidFor = '';
  async function load() {
    const [slots, growth, watered, outfit, accs, zukan, plants] = await Promise.all(
      ['studio_slots', 'plant_growth', 'plant_watered', 'outfit', 'accessories', 'zukan_seen', 'plants_seen'].map(function (k) { return DB.get(k).catch(function () { return undefined; }); }));
    st.slots = typeof slots === 'string' && slots.split(',').length === SLOTS.length ? slots.split(',') : null;
    st.growth = growth && typeof growth === 'object' ? growth : {};
    st.watered = watered && typeof watered === 'object' ? watered : {};
    st.outfit = OUTFITS.some(function (o) { return o.id === outfit; }) ? outfit : 'everyday';
    st.accs = String(accs || '').split(',').filter(function (a) { return ACC[a]; });
    st.zukanLocal = Array.isArray(zukan) ? zukan : [];
    st.plantsLocal = Array.isArray(plants) ? plants : [];
    st.loaded = true;
  }
  function recompute() {
    st.seenPets = new Set(UNLOCK_ALL ? Object.keys(PETS) : listVar('creatures').concat(st.zukanLocal || []));
    st.plants = new Set(UNLOCK_ALL ? PLANTS.map(function (p) { return p.id; }) : listVar('plants').concat(st.plantsLocal || []));
    const g = game();
    if (!OUTFITS.find(function (o) { return o.id === st.outfit; }).open(g) && !UNLOCK_ALL) st.outfit = 'everyday';
    st.accs = st.accs.filter(function (a) { return UNLOCK_ALL || ACC[a].open(g); });
  }
  function islandOpen() { return UNLOCK_ALL || game().chapter >= 3 || st.seenPets.size > 0 || st.plants.size > 0; }
  // 每格實際放什麼：存過的照存的（放不了的當空）；沒存過用預設（要遇過／收集過才出現）
  function occupant(index) {
    const slot = SLOTS[index]; const id = st.slots ? st.slots[index] : slot.def;
    if (!id || id === '-') return null;
    if (PETS[id]) return st.seenPets.has(id) && slot.pets.includes(id) ? { kind: 'pet', id: id } : null;
    if (PLANT[id]) return st.plants.has(id) ? { kind: 'plant', id: id } : null;
    return null;
  }
  function setSlot(index, id) {
    const now = SLOTS.map(function (slot, i) { const o = occupant(i); return o ? o.id : '-'; });
    if (id !== '-') now.forEach(function (v, i) { if (v === id && i !== index) now[i] = '-'; });   // 同一隻、同一盆只會在一格
    now[index] = id; st.slots = now; DB.set('studio_slots', now.join(',')).catch(function () {});
    renderSlots();
  }
  function grown(id) { return (st.growth[id] || 0) >= 3; }
  function water(id) {
    // 劇情中照遊戲天數；通關後（第 31 天以後劇情天數不再前進）改用現實日期，隔天回來還能再澆（作者 2026-11-22 問「週目過完是否就不再有明天」）
    const day = Number(game().day) > 30 ? 'real-' + taipeiDay() : game().day;
    if (grown(id)) return '已經長大了。';
    if (st.watered[id] === day) return '今天澆過了，明天再來。';
    st.watered[id] = day; st.growth[id] = (st.growth[id] || 0) + 1;
    DB.set('plant_growth', st.growth).catch(function () {}); DB.set('plant_watered', st.watered).catch(function () {});
    return grown(id) ? '長大了！' : '澆水 ' + st.growth[id] + '／3 天';
  }

  // ── 換裝：疊圖（跟 wear.py 同一套規則） ──
  const images = new Map();
  function img(src) {
    if (!images.has(src)) {
      const image = new Image();
      image.src = src;
      const decoded = window.PageLoading ? PageLoading.image(image) : image.decode();
      images.set(src, decoded.then(() => image));
    }
    return images.get(src);
  }
  function layerName(acc, outfit, accs) {
    const slot = ACC[acc].slot;
    if (slot === 'hand') {
      if (accs.includes('blazer')) return acc + '_blazer_' + outfit;
      if (accs.includes('cape') && outfit !== 'hero') return acc + '_cape_' + outfit;
      return acc + '_' + outfit;
    }
    if (slot === 'head' && outfit === 'pajamas') return acc + '_pajamas';
    return acc;
  }
  function bodySrc(outfit, accs) {
    const sh = accs.find(function (a) { return ACC[a].slot === 'shoulder'; });
    if (sh && !(sh === 'cape' && outfit === 'hero')) return WEAR + 'shoulder_' + sh + '_' + outfit + '.webp';
    return WEAR + 'outfit_' + outfit + '.webp';
  }
  const ORDER = { hand: 0, neck: 1, head: 2 };
  let composeToken = 0;
  const composed = document.createElement('canvas'); composed.width = 1024; composed.height = 1536;
  async function compose(outfit, accs, target) {
    const worn = accs.filter(function (a) { return ACC[a].slot !== 'shoulder'; }).sort(function (a, b) { return ORDER[ACC[a].slot] - ORDER[ACC[b].slot]; });
    const names = worn.map(function (a) { return layerName(a, outfit, accs); });
    const loads = [img(bodySrc(outfit, accs))].concat(names.map(function (n) { return img(WEAR + 'layer_' + n + '.webp'); }),
      names.map(function (n) { return n === 'camera' ? Promise.resolve(null) : img(WEAR + 'layer_' + n + '_erase.webp').catch(function () { return null; }); }));
    const got = await Promise.all(loads);
    const ctx = target.getContext('2d'); ctx.clearRect(0, 0, target.width, target.height);
    ctx.globalCompositeOperation = 'source-over'; ctx.drawImage(got[0], 0, 0, target.width, target.height);
    ctx.globalCompositeOperation = 'destination-out';
    names.forEach(function (n, i) { const e = got[1 + names.length + i]; if (e) ctx.drawImage(e, 0, 0, target.width, target.height); });
    ctx.globalCompositeOperation = 'source-over';
    names.forEach(function (n, i) { ctx.drawImage(got[1 + i], 0, 0, target.width, target.height); });
  }
  // 走路的她：把每一份人物的圖換成畫布（畫布是整張 1024×1536，身體那一塊對回原本 422×900 立繪的框）
  async function applyPlayer() {
    const token = ++composeToken;
    const plain = st.outfit === 'everyday' && !st.accs.length;
    const temp = document.createElement('canvas'); temp.width = 1024; temp.height = 1536;
    if (!plain) { try { await compose(st.outfit, st.accs.slice(), temp); } catch (error) { console.error(error); return; } }
    if (token !== composeToken) return;
    if (!plain) { composed.getContext('2d').clearRect(0, 0, 1024, 1536); composed.getContext('2d').drawImage(temp, 0, 0); }
    document.querySelectorAll('.ring-player .character-motion').forEach(function (body) {
      let canvas = body.querySelector('canvas.worn'); const image = body.querySelector('img.character-sprite');
      if (plain) { if (canvas) canvas.remove(); if (image) image.style.visibility = ''; return; }
      if (!canvas) { canvas = document.createElement('canvas'); canvas.className = 'character-sprite worn'; canvas.width = 512; canvas.height = 768; body.appendChild(canvas); }
      canvas.getContext('2d').clearRect(0, 0, 512, 768); canvas.getContext('2d').drawImage(composed, 0, 0, 512, 768);
      if (image) image.style.visibility = 'hidden';
    });
    document.body.dataset.outfit = st.outfit; document.body.dataset.accessories = st.accs.join(',');
  }
  function saveWear() { DB.set('outfit', st.outfit).catch(function () {}); DB.set('accessories', st.accs.join(',')).catch(function () {}); saidFor = ''; applyPlayer(); }

  // ── 小提示與台詞泡泡 ──
  let toastTimer = 0;
  function toast(text, ms) {
    let node = document.getElementById('decor-toast');
    if (!node) { node = document.createElement('div'); node.id = 'decor-toast'; node.setAttribute('role', 'status'); document.body.appendChild(node); }
    node.textContent = text; node.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(function () { node.classList.remove('on'); }, ms || 2200);
  }
  function say(lines) {
    let box = document.getElementById('decor-say');
    if (!box) { box = document.createElement('div'); box.id = 'decor-say'; box.setAttribute('role', 'status'); document.body.appendChild(box); }
    let i = 0;
    (function next() {
      if (i >= lines.length) { box.classList.remove('on'); return; }
      box.replaceChildren(); const who = document.createElement('b'); who.textContent = lines[i][0]; const text = document.createElement('span'); text.textContent = lines[i][1];
      box.append(who, text); box.classList.add('on'); i += 1; setTimeout(next, 2600);
    })();
  }
  const STATION = { ming: 405, shi: 900 + 230, chen: 2500 + 424 };   // 三人站的位置（整圈公分，跟 index.html 的 PERSON_STATIONS 一致）
  function checkLines() {
    if (!panel.isConnected) { clearInterval(lineTimer); return; }
    const studio = window.__studio; if (!studio || panel.classList.contains('on')) return;
    const key = st.accs.filter(function (a) { return LINES[a]; }).join(',');
    if (!key) return;
    const said = saidFor.split('|');
    st.accs.forEach(function (a) {
      const line = LINES[a]; if (!line || said.includes(a)) return;
      const ring = studio.ringCm, d = Math.abs(((studio.state.x - STATION[line.who] + ring / 2) % ring + ring) % ring - ring / 2);
      if (d < 90) { saidFor += '|' + a; window.__decorLastLine = a; say(line.lines); }
    });
  }
  const lineTimer = setInterval(checkLines, 300);

  // ── 常駐位 ──
  function metrics() { return window.__studio && window.__studio.metrics ? window.__studio.metrics() : null; }
  function renderSlots() {
    const m = metrics(); if (!m || !st.loaded) return;
    document.querySelectorAll('.decor-slot').forEach(function (n) { n.remove(); });
    document.querySelectorAll('.wall-piece').forEach(function (piece) {
      SLOTS.forEach(function (slot, index) {
        if (slot.wall !== piece.dataset.wall) return;
        const wallCm = m.wallCm[slot.wall]; const w = slot.baseW * m.pxPerCm, h = w / BASE_AR[slot.base];
        const node = document.createElement('button'); node.type = 'button'; node.className = 'decor-slot'; node.dataset.slot = slot.key;
        node.style.left = (slot.xCm / wallCm * 100) + '%'; node.style.bottom = (m.floorGap + (slot.liftCm || 0) * m.pxPerCm) + 'px';
        node.style.width = w + 'px'; node.style.height = h + 'px';
        const o = occupant(index);
        node.setAttribute('aria-label', slot.name + '常駐位' + (o ? '：' + (o.kind === 'pet' ? PETS[o.id].name : PLANT[o.id].name) : '（空的）'));
        node.dataset.occupant = o ? o.id : '';
        const plantInAquarium = slot.base === 'aquarium' && o && o.kind === 'plant';
        if (!plantInAquarium) { const base = document.createElement('img'); base.className = 'decor-base'; base.src = ART + 'base_' + slot.base + '.webp'; base.alt = ''; base.draggable = false; node.appendChild(base); }
        if (o) {
          const pic = document.createElement('img'); pic.alt = ''; pic.draggable = false;
          if (o.kind === 'pet') {
            const pet = PETS[o.id]; pic.className = 'decor-pet act-' + pet.act; pic.src = ART + 'pet_' + pet.img + '.webp'; pic.dataset.rest = pic.src; if (pet.walk) pic.dataset.walk = ART + 'pet_' + pet.walk + '.webp';
            const ph = pet.h * 1.3 * m.pxPerCm; pic.style.height = ph + 'px'; pic.style.bottom = seatBottom((slot.floorPets || []).includes(o.id) ? slot.floor : slot.sit, ph);
          } else {
            const big = grown(o.id); pic.className = 'decor-plant'; pic.src = ART + 'plant_' + o.id + '_' + (big ? 'grown' : 'young') + '.webp';
            pic.dataset.stage = big ? 'grown' : 'young';
            const ph = (big ? 62 : 34 + 5 * (st.growth[o.id] || 0)) * m.pxPerCm; pic.style.height = ph + 'px';
            pic.style.bottom = seatBottom(plantInAquarium ? 0 : slot.floor != null ? slot.floor : slot.sit, ph);
          }
          node.appendChild(pic);
        }
        node.addEventListener('pointerdown', function (event) { event.stopPropagation(); });
        node.addEventListener('click', function (event) { event.stopPropagation(); openSlot(index, node); });
        piece.appendChild(node);
      });
    });
  }
  // 貓偶爾起來走一小段再回坐墊
  setInterval(function () {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    document.querySelectorAll('.decor-pet.act-cat').forEach(function (cat) {
      if (cat.classList.contains('strolling') || Math.random() > .35) return;
      cat.classList.add('strolling'); cat.src = cat.dataset.walk;
      setTimeout(function () { cat.classList.remove('strolling'); cat.src = cat.dataset.rest; }, 5200);
    });
  }, 9000);
  function pet(node, id) {
    const heart = document.createElement('span'); heart.className = 'decor-heart'; heart.textContent = '♥'; node.appendChild(heart); setTimeout(function () { heart.remove(); }, 1100);
    const pic = node.querySelector('.decor-pet'); if (pic) { pic.classList.remove('petted'); void pic.offsetWidth; pic.classList.add('petted'); }
    if (id === 'bird') chirp();
  }
  function chirp() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext; const ac = chirp.ac || (chirp.ac = new AC());
      [1318.5, 1568].forEach(function (f, i) { const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * .16; o.type = 'sine'; o.frequency.value = f; g.gain.setValueAtTime(.0001, t); g.gain.linearRampToValueAtTime(.08, t + .02); g.gain.exponentialRampToValueAtTime(.0001, t + .15); o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + .17); });
    } catch (error) { /* 沒有聲音就算了 */ }
  }

  // ── 面板 ──
  const panel = document.getElementById('panel'), panelTitle = document.getElementById('panel-title'), panelBody = document.getElementById('panel-body'), scrim = document.getElementById('scrim');
  function openPanel(title, focus, design) {
    preparePanel(design, focus);
    panelTitle.textContent = title; panelBody.replaceChildren(); panel.classList.add('on', 'decor-panel'); panel.setAttribute('aria-hidden', 'false'); scrim.classList.add('on');
    document.getElementById('panel-close').focus({ preventScroll: true });
  }
  new MutationObserver(function () { if (!panel.classList.contains('on') && panel.classList.contains('decor-panel')) panel.classList.remove('decor-panel'); }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; }
  function restoreChoice(id) {
    const control = panelBody.querySelector('[data-id="' + CSS.escape(id) + '"]:enabled');
    (control || document.getElementById('panel-close')).focus({ preventScroll: true });
  }
  function card(opts) {
    const b = el('button', 'decor-card' + (opts.locked ? ' locked' : '') + (opts.on ? ' on' : '')); b.type = 'button'; b.disabled = !!opts.locked; if (opts.id) b.dataset.id = opts.id;
    const pic = el('span', 'decor-card-pic' + (opts.picClass ? ' ' + opts.picClass : '')); if (opts.src) { const i = el('img'); i.src = opts.src; i.alt = ''; i.draggable = false; pic.appendChild(i); } b.appendChild(pic);
    b.appendChild(el('span', 'decor-card-name', opts.locked && opts.hideName ? '？？？' : opts.name)); if (opts.sub) b.appendChild(el('span', 'decor-card-sub', opts.sub));
    b.setAttribute('aria-pressed', opts.on ? 'true' : 'false'); if (opts.click) b.addEventListener('click', opts.click);
    return b;
  }
  function openSlot(index, focus) {
    const slot = SLOTS[index];
    openPanel('常駐位｜' + slot.name, focus, 'slot');
    function draw() {
      panelBody.replaceChildren(); const o = occupant(index);
      if (!islandOpen()) { panelBody.appendChild(el('p', 'decor-empty', '島上遇到的小生物，會來這裡住。')); return; }
      const vignette = el('div', 'decor-vignette');
      const base = el('img', 'decor-vignette-base');
      base.src = ART + 'base_' + slot.base + '.webp'; base.alt = '';
      vignette.appendChild(base);
      if (o) {
        const occupant = el('img', 'decor-vignette-occupant');
        occupant.alt = o.kind === 'pet' ? PETS[o.id].name : PLANT[o.id].name;
        occupant.src = o.kind === 'pet' ? ART + 'pet_' + PETS[o.id].img + '.webp'
          : ART + 'plant_' + o.id + '_' + (grown(o.id) ? 'grown' : 'young') + '.webp';
        vignette.appendChild(occupant);
      }
      panelBody.appendChild(vignette);
      if (o) {
        const now = el('div', 'decor-now'); now.appendChild(el('strong', '', o.kind === 'pet' ? PETS[o.id].name : PLANT[o.id].name));
        if (o.kind === 'pet') { const b = el('button', 'decor-action', '摸摸牠'); b.type = 'button'; b.dataset.action = 'pet'; b.addEventListener('click', function () { document.querySelectorAll('.decor-slot[data-slot="' + slot.key + '"]').forEach(function (n) { pet(n, o.id); }); toast(PETS[o.id].name + '看起來很開心。'); }); now.appendChild(b); }
        else { const b = el('button', 'decor-action', grown(o.id) ? '已經長大了' : '澆水（' + (st.growth[o.id] || 0) + '／3 天）'); b.type = 'button'; b.dataset.action = 'water'; b.disabled = grown(o.id); b.addEventListener('click', function () { toast(water(o.id)); renderSlots(); draw(); }); now.appendChild(b); }
        const clear = el('button', 'decor-action', '收起來'); clear.type = 'button'; clear.dataset.action = 'clear'; clear.addEventListener('click', function () { setSlot(index, '-'); draw(); }); now.appendChild(clear);
        panelBody.appendChild(now);
      }
      panelBody.appendChild(el('h2', 'decor-h', '寵物（圖鑑遇過的才能放）'));
      const pets = el('div', 'decor-grid');
      slot.pets.forEach(function (id) { const p = PETS[id], seen = st.seenPets.has(id);
        pets.appendChild(card({ id: id, name: p.name, hideName: true, locked: !seen, src: ART + 'pet_' + p.img + '.webp', sub: seen ? '' : '在' + p.place + '遇到', on: o && o.id === id, click: function () { setSlot(index, id); draw(); restoreChoice(id); } })); });
      panelBody.appendChild(pets);
      panelBody.appendChild(el('h2', 'decor-h', '植物（收集到的才能放；放在這裡每天可以澆一次水）'));
      const plants = el('div', 'decor-grid');
      PLANTS.forEach(function (p) { const have = st.plants.has(p.id);
        plants.appendChild(card({ id: p.id, name: p.name, hideName: true, locked: !have, src: ART + 'plant_' + p.id + '_' + (grown(p.id) ? 'grown' : 'young') + '.webp', sub: have ? (grown(p.id) ? '長大了' : '澆水 ' + (st.growth[p.id] || 0) + '／3 天') : '在' + p.place, on: o && o.id === p.id, click: function () { setSlot(index, p.id); draw(); restoreChoice(p.id); } })); });
      panelBody.appendChild(plants);
      panelBody.appendChild(el('p', 'decor-note', '換下來的會回到圖鑑和花盆，不會不見。'));
    }
    draw();
  }
  function openMirror(focus) {
    openPanel('落地鏡｜換裝', focus, 'mirror');
    const wrap = el('div', 'mirror'); const glass = el('div', 'mirror-glass'); const view = document.createElement('canvas'); view.width = 512; view.height = 768; view.className = 'mirror-view'; glass.appendChild(view);
    const side = el('div', 'mirror-side'); wrap.append(glass, side); panelBody.appendChild(wrap);
    const hint = el('p', 'decor-note mirror-hint', '同一個部位一次一件；換上之後會穿著在工作室裡走。');
    let mirrorToken = 0;
    async function draw() {
      const g = game(); side.replaceChildren();
      side.appendChild(el('h2', 'decor-h', '衣服'));
      const og = el('div', 'decor-grid outfits');
      OUTFITS.forEach(function (o) { const open = UNLOCK_ALL || o.open(g);
        og.appendChild(card({ id: o.id, name: o.name, locked: !open, src: WEAR + 'outfit_' + o.id + '.webp', picClass: 'tall', sub: open ? '' : o.lock, on: st.outfit === o.id, click: function () { st.outfit = o.id; saveWear(); draw(); restoreChoice(o.id); } })); });
      side.appendChild(og);
      side.appendChild(el('h2', 'decor-h', '配件'));
      const ag = el('div', 'decor-grid accs');
      ACCS.forEach(function (a) { const open = UNLOCK_ALL || a.open(g); const on = st.accs.includes(a.id);
        const clash = !on && st.accs.find(function (b) { return ACC[b].slot === a.slot; });
        ag.appendChild(card({ id: a.id, name: a.name, locked: !open, src: ART + 'acc_' + a.id + '.webp', sub: open ? SLOT_NAME[a.slot] + (clash ? '・會換掉' + ACC[clash].name : '') : a.lock, on: on, click: function () {
          if (on) st.accs = st.accs.filter(function (b) { return b !== a.id; });
          else { if (clash) hint.textContent = EXCLUSIVE[a.slot]; st.accs = st.accs.filter(function (b) { return ACC[b].slot !== a.slot; }).concat([a.id]); }
          saveWear(); draw(); restoreChoice(a.id); } })); });
      side.appendChild(ag); side.appendChild(hint);
      const mine = ++mirrorToken, key = st.outfit + ':' + st.accs.join(','), temp = document.createElement('canvas'); temp.width = 512; temp.height = 768;
      try { await compose(st.outfit, st.accs.slice(), temp); } catch (error) { console.error(error); return; }
      if (mine !== mirrorToken) return;   // 連點時只留最後一次
      view.getContext('2d').clearRect(0, 0, 512, 768); view.getContext('2d').drawImage(temp, 0, 0); view.dataset.ready = key;
    }
    draw();
  }

  // ── 接到工作室 ──
  function refreshAll() { if (!st.loaded) return; recompute(); renderSlots(); return applyPlayer(); }
  function hook() {
    const features = window.STUDIO_FEATURES;
    if (features && !features.__decor) {
      const handle = features.handle; features.__decor = true;
      features.handle = function (id, focus) { if (id === 1) { openMirror(focus); return true; } return handle.call(features, id, focus); };
    }
  }
  window.STUDIO_DECOR = {
    rebuilt: function () { if (st.loaded) { renderSlots(); applyPlayer(); } },
    get state() { return { slots: SLOTS.map(function (s, i) { const o = occupant(i); return o ? o.id : '-'; }), growth: st.growth, outfit: st.outfit, accessories: st.accs.slice(), loaded: st.loaded }; },
    openMirror: openMirror, openSlot: function (i) { openSlot(i, document.body); }
  };
  const ready = (async function () {
    for (let i = 0; i < 40 && !window.STUDIO_FEATURES; i += 1) await new Promise(function (r) { setTimeout(r, 50); });
    hook(); await load(); await refreshAll();
  })();
  window.PageLoading?.prepare('工作室佈置與換裝', ready);
}
