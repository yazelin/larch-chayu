// 全劇統一的小生物圖鑑（作者 2026-11-16 看過草圖 check/zukan_mock.jpg 定案；做法與紀錄 zukan_plan.md）。
//   十三種：朝霞丘的兔子、蝴蝶、小鳥、小屋門口的貓；海灘的螃蟹、海鷗、寄居蟹、海豚；月光岬的螢火蟲、海龜；海底的小魚群、水母；全島遠海的鯨魚。
//   記錄：Larch 變數 creatures（逗號分隔的 id），本機 StudioDB 'zukan_seen' 也存一份（同一個網域的各頁共用；網址加 ?zukanReset=1 清掉本機那份）。
//   遷移：海底長畫 11-16 第一版記在 dive_seen（fish、jelly、turtle），讀的時候併進來，有新的就寫回 creatures；之後不再寫 dive_seen。
//   收齊十三種寫 zukan_complete=true，同時解開 CG 真-圖鑑（設計 131 行「收齊解鎖一張四人在島上的 CG」）：收齊的那一刻在當頁跳出那張畫（showReward），
//   之後全島圖鑑右上「看那張畫」隨時再看。CG 走 新版/cg 產線，定稿 新版/cg/art/真結局/真-圖鑑.jpg（凍結列在 新版/cg/freeze/真結局.yaml）。
//   各長畫只在第一次遇到時跳一句「收進小生物圖鑑：○○」；圖鑑本身只在全島大地圖右上「圖鑑 n／13」打開（openPanel）。
export const CREATURES = [
  { id: 'rabbit', name: '兔子', img: '../art/sprites/rabbit.webp', desc: '灰色的時候躲在花田邊，塗上顏色就會跳來跳去。', place: '朝霞丘', ability: '上色' },
  { id: 'butterfly', name: '蝴蝶', img: '../art/sprites/butterfly.webp', desc: '在花田上飛，有時候停在花上，把翅膀收起來。', place: '朝霞丘', ability: '' },
  { id: 'bird', name: '小鳥', img: '../art/sprites/bird.webp', desc: '停在籬笆和信箱上，點一下會拍拍翅膀。', place: '朝霞丘・月光岬', ability: '' },
  { id: 'cat', name: '貓', img: '../art/sprites/zk_cat_sleep.webp', desc: '睡在小屋門口，摸摸牠，牠會跟著妳走一小段。', place: '朝霞丘・小屋門口', ability: '' },
  { id: 'crab', name: '螃蟹', img: '../art/sprites/crab.webp', desc: '很怕生，會橫著跑開；哼歌給牠聽，牠就會靠過來。', place: '海灘', ability: '呼喚' },
  { id: 'gull', name: '海鷗', img: '../art/sprites/gull.webp', desc: '停在木桶和漁網架上，被嚇到會飛走，過一下又飛回來。', place: '海灘', ability: '' },
  { id: 'hermit', name: '寄居蟹', img: '../art/sprites/hermit.webp', desc: '躲在石頭後面，要呼喚牠才會出來。', place: '海灘', ability: '呼喚' },
  { id: 'dolphin', name: '海豚', img: '../art/sprites/dolphin_1.webp', desc: '走到浪邊叫牠，牠就會游過來，還可以騎著牠繞島。', place: '海灘・全島', ability: '呼喚' },
  { id: 'firefly', name: '螢火蟲', img: '../art/sprites/zk_firefly.webp', desc: '走過去，牠們會散開；站著不動，牠們會飛過來。飛得很快的那幾隻，要停下時間才看得清楚。', place: '月光岬', ability: '停下時間' },
  { id: 'turtle', name: '海龜', img: '../art/sprites/turtle_0.webp', desc: '在礁石邊慢慢游；海底那一隻會載妳游一段。', place: '月光岬・海底', ability: '' },
  { id: 'fish', name: '小魚群', img: '../art/sprites/dv_fish_0.webp', desc: '一群一起游，點一下會散開，過一下又聚回來。', place: '海底', ability: '' },
  { id: 'jelly', name: '水母', img: '../art/sprites/dv_jelly_0.webp', desc: '身體一縮一放地漂，點一下會發光。', place: '海底', ability: '' },
  { id: 'whale', name: '鯨魚', img: '../art/sprites/ie_whale_0.webp', desc: '在很遠的海上噴水，坐船繞島才看得到。', place: '全島・遠海', ability: '坐船' },
];
export const TOTAL = CREATURES.length;
// 收齊的獎勵 CG（相簿／獎勵 CG，不在劇情裡播；劇本標記在 新版/劇本/真結局.md「相簿／獎勵 CG」一節）
export const REWARD = { id: '真-圖鑑', img: '../../../../../cg/true_end/true_end_cg_014.webp', title: '四個人在島上' };
const BY = Object.fromEntries(CREATURES.map(c => [c.id, c]));
const LEGACY = ['dive_seen'];   // 舊變數：id 跟現在一樣（fish、jelly、turtle）
const list = v => String(v || '').split(',').map(s => s.trim()).filter(id => BY[id]);

// vars()：回這一頁目前的 Larch 變數（物件）；set(obj)：寫回 Larch（與這一頁自己的狀態）；toast(text)：這一頁的小提示
export function createZukan({ vars, set, toast, reward = true }) {
  // 紙感底圖先載，第一次打開圖鑑就有紙。
  for (const src of ['../art/ui/ui_panel.webp', '../art/ui/ui_tag.webp', '../art/ui/ui_btn.webp']) {
    if (window.PageLoading) PageLoading.prepare(src, PageLoading.preload(src));
    else { const image = new Image(); image.src = src; }
  }
  const seen = new Set();
  const merge = () => { const v = vars() || {}; for (const id of list(v.creatures)) seen.add(id); for (const k of LEGACY) for (const id of list(v[k])) seen.add(id); };
  const write = () => {
    const out = { creatures: CREATURES.filter(c => seen.has(c.id)).map(c => c.id).join(',') };
    if (seen.size >= TOTAL) out.zukan_complete = 'true';
    set(out);
    if (window.StudioDB) StudioDB.set('zukan_seen', [...seen]).catch(() => {});
  };
  const Z = {
    ready: (async () => {
      merge();
      if (window.StudioDB) { try { if (new URLSearchParams(location.search).get('zukanReset') === '1') await StudioDB.remove('zukan_seen'); const a = await StudioDB.get('zukan_seen'); if (Array.isArray(a)) for (const id of a) if (BY[id]) seen.add(id); } catch (e) {} }
      // 讀存檔時可能才收到 larch:init，先合併播放器的新值，再判斷有沒有要補寫的生物。
      merge();
      const v = vars() || {};
      if (new Set(list(v.creatures)).size < seen.size) write();
    })(),
    saw(id) { if (!BY[id]) return false; merge(); if (seen.has(id)) return false; seen.add(id); write(); if (toast) toast('收進小生物圖鑑：' + BY[id].name);
      if (seen.size === TOTAL && reward) setTimeout(() => showReward({ first: true }), 2800);   // 剛好收齊這一種：提示之後跳出那張畫
      return true; },
    has: id => (merge(), seen.has(id)), get count() { merge(); return seen.size; }, total: TOTAL, list: () => (merge(), [...seen]),
    refresh: merge,
  };
  return Z;
}

// 熱區包一層：點到 id 開頭符合的熱區時記一筆。rules：[[熱區 id 的開頭, 生物 id, 條件函式（可省；回 true 才算遇到，點了之後 0、1.5、3 秒各看一次）], …]
// 熱區是後來才加的也包得到（每一格掃一次沒包過的）
export function watchHot(hotList, rules, zk) {
  const wrap = () => { for (const h of hotList) { if (h.__zk || typeof h.fn !== 'function') continue; const r = rules.find(([p]) => h.id.startsWith(p)); if (!r) continue; h.__zk = true; const f = h.fn, [, id, when] = r;
    h.fn = (...a) => { const out = f(...a); const ok = () => !when || when(); if (ok()) zk.saw(id); else for (const t of [1500, 3000]) setTimeout(() => { if (ok()) zk.saw(id); }, t); return out; }; } };
  wrap(); return wrap;
}

// ── 圖鑑本身（全島大地圖打開）──
const CSS = `
.zk-scrim{position:fixed;inset:0;z-index:40;display:none;background:rgba(24,28,52,.62);backdrop-filter:blur(5px);-webkit-backdrop-filter:blur(5px);font-family:"LXGW WenKai TC","Iansui","Kaiti TC","Noto Sans TC",serif;color:#5a4150}
.zk-scrim.on{display:grid;place-items:center}
.zk-book{position:relative;box-sizing:border-box;width:min(1760px,calc(100vw - 48px));max-height:calc(100dvh - 40px);overflow:auto;padding:clamp(70px,6vw,108px) clamp(26px,3.2vw,64px) clamp(70px,5vw,96px);
  border-style:solid;border-width:0;border-image:url("../art/ui/ui_panel.webp") 131 194 131 194 fill / clamp(40px,4vw,70px) clamp(50px,5vw,96px) stretch;-webkit-overflow-scrolling:touch}
.zk-head{position:absolute;left:clamp(26px,3vw,70px);top:clamp(14px,1.6vw,26px);right:clamp(26px,3vw,70px);display:flex;align-items:center;gap:1.2em;flex-wrap:wrap}
.zk-title{padding:.35em 1.4em .45em 1.1em;color:#fffaf4;font-weight:700;font-size:clamp(22px,2.2vw,40px);letter-spacing:.12em;border-style:solid;border-width:0;border-image:url("../art/ui/ui_tag.webp") 125 299 125 299 fill / 26px 60px stretch}
.zk-count{font-size:clamp(18px,1.5vw,28px)}.zk-reward{margin-left:auto;font-size:clamp(14px,1.1vw,21px);color:#8a7080}
.zk-reward.done{color:#b2445a;font-weight:700}
.zk-reward-btn{display:flex;align-items:center;gap:.6em;padding:.2em .9em .25em .3em;font:inherit;font-weight:700;color:#b2445a;cursor:pointer;background:none;border-style:solid;border-width:0;border-image:url("../art/ui/ui_btn.webp") 114 213 114 213 fill / 18px 32px stretch}
.zk-reward-btn img{height:clamp(36px,3.2vw,60px);aspect-ratio:3/2;object-fit:cover;border-radius:3px;box-shadow:0 1px 3px rgba(80,50,60,.35)}
.zk-cg{position:fixed;inset:0;z-index:45;display:none;place-items:center;background:rgba(24,28,52,.78);font-family:"LXGW WenKai TC","Iansui","Kaiti TC","Noto Sans TC",serif;color:#fffaf4}
.zk-cg.on{display:grid}
.zk-cg figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:14px;max-width:calc(100vw - 32px)}
.zk-cg img{display:block;max-width:min(1500px,calc(100vw - 32px));max-height:calc(100dvh - 150px);object-fit:contain;border:clamp(6px,.6vw,12px) solid #fbf7ef;box-shadow:0 6px 30px rgba(0,0,0,.45)}
.zk-cg figcaption{font-size:clamp(17px,1.4vw,26px);letter-spacing:.08em;text-align:center}
.zk-cg .zk-close{position:static;color:#5a4150}
.zk-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:clamp(10px,1vw,20px)}
.zk-card{position:relative;display:flex;flex-direction:column;align-items:center;min-height:clamp(250px,19vw,370px);padding:14px 14px 46px;box-sizing:border-box;border-style:solid;border-width:0;border-image:url("../art/ui/ui_panel.webp") 131 194 131 194 fill / 26px 36px stretch}
.zk-pic{width:82%;height:clamp(96px,8.4vw,160px);display:flex;align-items:center;justify-content:center;margin-top:6px}
.zk-pic img{display:block;width:auto;height:auto;max-width:100%;max-height:100%;min-width:0;min-height:0;object-fit:contain;filter:drop-shadow(-2px 3px 2px rgba(80,50,60,.3))}   /* 紙片整張等比例放進格子（不裁、不拉伸）；之前 grid 裡 height:100% 沒作用，直的紙片被 overflow 裁掉 */
.zk-card.unseen .zk-pic img{filter:brightness(0) opacity(.3)}
.zk-name{margin-top:.35em;font-size:clamp(19px,1.5vw,28px);font-weight:700;letter-spacing:.08em}
.zk-desc{margin-top:.3em;font-size:clamp(13px,.95vw,18px);line-height:1.5;text-align:left;align-self:stretch}
.zk-card.unseen .zk-desc{color:#8a7080}
.zk-place{position:absolute;right:12px;bottom:12px;padding:.25em .9em .3em;font-size:clamp(11px,.8vw,15px);color:#fffaf4;white-space:nowrap;border-style:solid;border-width:0;border-image:url("../art/ui/ui_tag.webp") 125 299 125 299 fill / 14px 30px stretch}
.zk-close{position:absolute;right:clamp(30px,3vw,70px);bottom:clamp(16px,1.6vw,30px);padding:.45em 1.6em .5em 2.4em;font-weight:700;font-size:clamp(18px,1.4vw,26px);line-height:1.2;font-family:inherit;letter-spacing:.12em;color:#5a4150;background:none;cursor:pointer;border-style:solid;border-width:0;border-image:url("../art/ui/ui_btn.webp") 114 213 114 213 fill / 22px 40px stretch}
@media (max-width:1100px){.zk-grid{grid-template-columns:repeat(4,minmax(0,1fr))}}
@media (max-width:700px){.zk-book{width:100vw;max-height:100dvh;height:100dvh;padding:76px 12px 84px;border-image-width:24px 28px}.zk-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
  .zk-head{left:14px;right:14px;top:12px}.zk-reward{display:none}.zk-reward.done{display:block;margin-left:0;font-size:15px}.zk-book.done{padding-top:128px}.zk-card{min-height:270px}.zk-pic{height:120px}.zk-close{position:fixed;right:14px;bottom:max(14px,env(safe-area-inset-bottom))}}
`;
export function openPanel(zk, { onClose } = {}) {
  if (!document.getElementById('zk-css')) { const st = document.createElement('style'); st.id = 'zk-css'; st.textContent = CSS; document.head.append(st); }
  let scrim = document.getElementById('zk-scrim');
  if (!scrim) { scrim = document.createElement('div'); scrim.id = 'zk-scrim'; scrim.className = 'zk-scrim'; scrim.setAttribute('role', 'dialog'); scrim.setAttribute('aria-label', '小生物圖鑑'); document.body.append(scrim);
    scrim.addEventListener('pointerdown', e => e.stopPropagation()); scrim.addEventListener('click', e => { if (e.target === scrim) closePanel(); });
    addEventListener('keydown', e => { if (scrim.classList.contains('on') && e.key === 'Escape' && !rewardOpen()) { e.preventDefault(); closePanel(); } }, true); }
  const n = zk.count, done = n >= TOTAL;
  scrim.innerHTML = `<div class="zk-book${done ? ' done' : ''}"><div class="zk-head"><div class="zk-title">小生物圖鑑</div><div class="zk-count">遇到 ${n}／${TOTAL} 種</div>
    <div class="zk-reward${done ? ' done' : ''}">${done ? '<button type="button" class="zk-reward-btn"><img alt="" draggable="false">十三種都收齊了！看那張畫</button>' : `收齊${TOTAL === 13 ? '十三' : TOTAL}種，就能看到一張四個人在島上的畫`}</div></div><div class="zk-grid"></div>
    <button type="button" class="zk-close">收起</button></div>`;
  const grid = scrim.querySelector('.zk-grid');
  for (const c of CREATURES) {
    const s = zk.has(c.id), d = document.createElement('div'); d.className = 'zk-card ' + (s ? 'seen' : 'unseen'); d.dataset.id = c.id;
    const hint = `在${c.place}` + (c.ability ? `，要用「${c.ability}」` : '') + '。';
    d.innerHTML = `<div class="zk-pic"><img alt="" draggable="false"></div><div class="zk-name"></div><div class="zk-desc"></div><div class="zk-place"></div>`;
    d.querySelector('img').src = c.img; d.querySelector('.zk-name').textContent = s ? c.name : '？？？'; d.querySelector('.zk-desc').textContent = s ? c.desc : hint;
    d.querySelector('.zk-place').textContent = c.place + (c.ability ? '｜' + c.ability : '');
    grid.append(d);
  }
  scrim.querySelector('.zk-close').addEventListener('click', e => { e.stopPropagation(); closePanel(); });
  const rb = scrim.querySelector('.zk-reward-btn'); if (rb) { rb.querySelector('img').src = REWARD.img; rb.addEventListener('click', e => { e.stopPropagation(); showReward(); }); }
  scrim.classList.add('on'); scrim._onClose = onClose;
  return scrim;
}
export function closePanel() { const s = document.getElementById('zk-scrim'); if (!s || !s.classList.contains('on')) return; s.classList.remove('on'); if (s._onClose) s._onClose(); }
export const panelOpen = () => !!document.getElementById('zk-scrim')?.classList.contains('on') || rewardOpen();

// ── 收齊的那張畫（任何一頁都能跳；開著時鍵盤只認 Esc，其他鍵不傳給底下的頁面）──
export function showReward({ first = false } = {}) {
  if (!document.getElementById('zk-css')) { const st = document.createElement('style'); st.id = 'zk-css'; st.textContent = CSS; document.head.append(st); }
  let box = document.getElementById('zk-cg');
  if (!box) { box = document.createElement('div'); box.id = 'zk-cg'; box.className = 'zk-cg'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-label', REWARD.title); document.body.append(box);
    for (const ev of ['pointerdown', 'pointerup', 'click']) box.addEventListener(ev, e => e.stopPropagation());
    box.addEventListener('click', e => { if (e.target === box) closeReward(); });
    addEventListener('keydown', e => { if (!box.classList.contains('on')) return; e.stopPropagation(); e.preventDefault(); if (e.key === 'Escape' || e.key === 'Enter') closeReward(); }, true);
    addEventListener('keyup', e => { if (box.classList.contains('on')) e.stopPropagation(); }, true); }
  box.innerHTML = `<figure><img alt="" draggable="false"><figcaption></figcaption><button type="button" class="zk-close">收起</button></figure>`;
  box.querySelector('img').src = REWARD.img; box.querySelector('img').alt = REWARD.title;
  box.querySelector('figcaption').textContent = first ? `小生物圖鑑收齊了。${REWARD.title}。` : REWARD.title;
  box.querySelector('.zk-close').addEventListener('click', e => { e.stopPropagation(); closeReward(); });
  box.classList.add('on'); box.dataset.first = first ? '1' : '0';
  return box;
}
export function closeReward() { const b = document.getElementById('zk-cg'); if (b) b.classList.remove('on'); }
export const rewardOpen = () => !!document.getElementById('zk-cg')?.classList.contains('on');
