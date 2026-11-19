// 植物收集（全島 11 種）：島上各區與碼頭拿到的植物記在這裡，帶回工作室放在常駐位澆水長大。做法照 zukan.js。
// 方案：真結局/studio_decor_plan.md 第三節（作者 2026-11-17 定案：10 種＋真結局碼頭「四個人一起種的小樹」）。
// 記錄：Larch 變數 plants（逗號分隔的 id，照下面順序）；同網域另存 StudioDB plants_seen（工作室 studio_decor.mjs 也讀這一份）。
// 圖：真結局/studio_decor/art/plant_<id>_young.webp（剛拿到是幼苗）、_grown.webp。
export const PLANTS = [
  { id: 'tulip', name: '鬱金香', place: '朝霞丘', how: '花田邊撿球根' },
  { id: 'sakura', name: '櫻花小盆景', place: '朝霞丘', how: '櫻花樹下的小苗，要先上色', ability: '上色' },
  { id: 'paint', name: '五色顏料花', place: '朝霞丘', how: '把五色顏料花交給晨之後，晨回送' },
  { id: 'tomato', name: '小番茄苗', place: '朝霞丘', how: '做完晨的小委託' },
  { id: 'coconut', name: '椰子苗', place: '海灘', how: '岸邊發芽的椰子' },
  { id: 'morning', name: '馬鞍藤', place: '海灘', how: '詩在舞台邊留的一盆' },
  { id: 'airplant', name: '貝殼空氣鳳梨', place: '海灘', how: '寄居蟹讓出來的大貝殼', ability: '呼喚' },
  { id: 'primrose', name: '月見草', place: '月光岬', how: '只開一下，要停下時間才摘得到', ability: '停下時間' },
  { id: 'pine', name: '小松樹盆景', place: '月光岬', how: '明在松樹下留的一盆' },
  { id: 'moss', name: '苔球', place: '月光岬', how: '鐘塔石縫裡撿' },
  { id: 'olive', name: '四個人一起種的小樹', place: '碼頭', how: '三樣禮物都拿到之後，在碼頭一起種' },
];
export const TOTAL = PLANTS.length;
const BY = Object.fromEntries(PLANTS.map(p => [p.id, p]));
const list = v => String(v || '').split(',').map(s => s.trim()).filter(id => BY[id]);
export const plantImg = (id, stage = 'young') => `../../../studio_decor/art/plant_${id}_${stage}.webp`;   // 路徑整條寫在樣板字串裡，新版/build/export_pages.py 才收得到這些圖

// vars()：這一頁目前的 Larch 變數；set(obj)：寫回 Larch；toast(text)：這一頁的小提示
export function createPlants({ vars, set, toast }) {
  const have = new Set();
  const merge = () => { for (const id of list((vars() || {}).plants)) have.add(id); };
  const write = () => { set({ plants: PLANTS.filter(p => have.has(p.id)).map(p => p.id).join(',') }); if (window.StudioDB) StudioDB.set('plants_seen', [...have]).catch(() => {}); };
  const P = {
    ready: (async () => {
      merge();
      if (window.StudioDB) { try { if (new URLSearchParams(location.search).get('plantsReset') === '1') await StudioDB.remove('plants_seen'); const a = await StudioDB.get('plants_seen'); if (Array.isArray(a)) for (const id of a) if (BY[id]) have.add(id); } catch (e) {} }
      if (list((vars() || {}).plants).length !== have.size) write();
    })(),
    got(id) { if (!BY[id]) return false; merge(); if (have.has(id)) return false; have.add(id); write(); if (toast) toast('收進花盆：' + BY[id].name); return true; },
    has: id => (merge(), have.has(id)), get count() { merge(); return have.size; }, total: TOTAL, list: () => (merge(), [...have]),
  };
  return P;
}

// 一覽（全島右上「植物 n／11」）：樣子照圖鑑，紙感面板、拿到的是圖與名字，沒拿到的是剪影加在哪、怎麼拿
let panel = null;
const STYLE = `
.pl-scrim{position:fixed;inset:0;z-index:60;display:grid;place-items:center;background:rgba(40,28,36,.5);padding:12px;box-sizing:border-box}
.pl-book{position:relative;width:min(1240px,100%);max-height:calc(100dvh - 24px);display:flex;flex-direction:column;box-sizing:border-box;padding:clamp(14px,2vw,30px);border-radius:18px;background:#fbf5ea;border:3px solid #d8c3a8;box-shadow:0 10px 40px rgba(0,0,0,.35);color:#4a3a36;font-family:inherit}
.pl-head{display:flex;flex-wrap:wrap;align-items:baseline;gap:6px 18px;margin-bottom:10px}.pl-head h2{margin:0;font-size:clamp(18px,2vw,26px)}.pl-head span{font-size:clamp(13px,1.2vw,16px);color:#7a665e}
.pl-grid{flex:1 1 auto;min-height:0;overflow-y:auto;display:grid;grid-template-columns:repeat(6,1fr);gap:10px;padding:2px}
.pl-card{display:flex;flex-direction:column;gap:2px;padding:8px;border-radius:12px;background:#fffdf8;border:2px solid #e3d3bd;min-width:0}
.pl-pic{height:clamp(84px,9vw,130px);display:flex;align-items:flex-end;justify-content:center}.pl-pic img{max-width:100%;max-height:100%;object-fit:contain}
.pl-card.unseen .pl-pic img{filter:brightness(0) opacity(.28)}.pl-card b{font-size:clamp(13px,1.15vw,16px)}.pl-card small{font-size:clamp(11px,.95vw,13px);color:#7a665e;line-height:1.35}
.pl-close{align-self:flex-end;margin-top:10px;min-height:44px;padding:6px 22px;border-radius:999px;border:2px solid #cbb39c;background:#fffaf2;color:#4a3a36;font-size:15px;font-weight:700;cursor:pointer}
@media(max-width:1100px){.pl-grid{grid-template-columns:repeat(4,1fr)}}@media(max-width:700px){.pl-grid{grid-template-columns:repeat(2,1fr)}}`;
export const plantPanelOpen = () => !!panel;
export function closePlantPanel() { if (!panel) return; const p = panel; panel = null; p.node.remove(); removeEventListener('keydown', p.key, true); if (p.onClose) p.onClose(); }
export function openPlantPanel(pl, { onClose } = {}) {
  if (panel) return;
  if (!document.getElementById('pl-style')) { const s = document.createElement('style'); s.id = 'pl-style'; s.textContent = STYLE; document.head.appendChild(s); }
  const node = document.createElement('div'); node.className = 'pl-scrim'; node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true'); node.setAttribute('aria-label', '植物一覽');
  const book = document.createElement('div'); book.className = 'pl-book';
  book.innerHTML = `<div class="pl-head"><h2>植物</h2><span>拿到 ${pl.count}／${TOTAL} 種　帶回工作室，放在常駐位每天澆一次水，三天長大</span></div><div class="pl-grid"></div><button type="button" class="pl-close">收起</button>`;
  const grid = book.querySelector('.pl-grid');
  for (const p of PLANTS) {
    const have = pl.has(p.id); const c = document.createElement('div'); c.className = 'pl-card' + (have ? '' : ' unseen'); c.dataset.id = p.id;
    const pic = document.createElement('div'); pic.className = 'pl-pic'; const im = document.createElement('img'); im.alt = ''; im.draggable = false; im.src = plantImg(p.id, 'grown'); pic.appendChild(im);
    const b = document.createElement('b'); b.textContent = have ? p.name : '？？？'; const s = document.createElement('small'); s.textContent = have ? p.place : `在${p.place}。${p.how}${p.ability ? `（要用「${p.ability}」）` : ''}。`;
    c.append(pic, b, s); grid.appendChild(c);
  }
  node.appendChild(book); document.body.appendChild(node);
  for (const t of ['pointerdown', 'pointerup', 'click']) node.addEventListener(t, e => e.stopPropagation());
  const key = e => { e.stopPropagation(); if (e.key === 'Escape' || e.key === 'Enter') { e.preventDefault(); closePlantPanel(); } };
  addEventListener('keydown', key, true);
  panel = { node, key, onClose };
  book.querySelector('.pl-close').addEventListener('click', closePlantPanel); node.addEventListener('click', e => { if (e.target === node) closePlantPanel(); });
  book.querySelector('.pl-close').focus({ preventScroll: true });
}

// ── 真結局「四個人一起種小樹」：一小段對話＋一張 CG（定稿 真結局/studio_decor/委託與種樹_提案.md 第三節，作者 2026-11-17 同意）──
// 全島大地圖沒有對話框，這裡自己疊一層：點一下或按 Enter／空白鍵換下一句；到 { cg: true } 那一步把 CG 亮出來，之後的台詞疊在 CG 下緣。
export const TREE_CG = '../../../../../cg/true_end/true_end_cg_015.webp';
export const TREE_LINES = [
  ['', '（碼頭邊的草地上，四個人圍著一個剛挖好的小土坑。）'],
  ['晨', '我畫了一棵小樹，想種在島上。'],
  ['詩', '位置是我挑的！一下船就看得到。'],
  ['明', '我寫了一個小程式，讓它每年長高一點。'],
  ['晨', '可是這座島只有妳能改。妳幫我們把樹種到島上，好不好？'],
  ['茶語', '好。我放在這裡。'],
  ['', '（小樹出現在土坑裡。四個人一起把土蓋回去。）'],
  { cg: true },
  ['詩', '我要綁酒紅色的緞帶！'],
  ['晨', '我綁黃綠色的。'],
  ['明', '我綁深藍色的。'],
  ['茶語', '那我綁淡紫色的。'],
  ['', '（四條緞帶綁在同一根樹枝上。）'],
  ['詩', '它什麼時候會長大啊？'],
  ['明', '要好幾年。'],
  ['茶語', '那我們每年都來看它。'],
  ['晨', '嗯。我每年幫它畫一張。'],
  ['', '（晨另外分了一小盆，讓她帶回工作室。）'],
];
const SCENE_STYLE = `
.ps-scrim{position:fixed;inset:0;z-index:70;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;background:rgba(30,20,28,.62);padding:max(12px,env(safe-area-inset-top)) 12px max(18px,env(safe-area-inset-bottom));box-sizing:border-box;cursor:pointer}
.ps-cg{flex:1 1 auto;min-height:0;display:flex;align-items:center;justify-content:center;width:100%;opacity:0;transition:opacity .8s}.ps-cg.on{opacity:1}
.ps-cg img{max-width:min(1500px,100%);max-height:100%;object-fit:contain;border:clamp(5px,.5vw,10px) solid #fbf7ef;box-shadow:0 6px 30px rgba(0,0,0,.45);box-sizing:border-box}
.ps-box{flex:0 0 auto;width:min(980px,100%);min-height:clamp(84px,14vh,130px);margin-top:12px;padding:14px 20px;box-sizing:border-box;border-radius:16px;background:#fbf5ea;border:3px solid #d8c3a8;color:#4a3a36;font-size:clamp(16px,1.6vw,22px);line-height:1.7}
.ps-box b{display:block;color:#8a5a3c;font-size:.9em}.ps-box small{float:right;color:#9a8478;font-size:.7em;margin-top:.4em}`;
let scene = null;
export const sceneOpen = () => !!scene;
export function playScene(lines, { cg, onDone } = {}) {
  if (scene) return;
  if (!document.getElementById('ps-style')) { const s = document.createElement('style'); s.id = 'ps-style'; s.textContent = SCENE_STYLE; document.head.appendChild(s); }
  const node = document.createElement('div'); node.className = 'ps-scrim'; node.setAttribute('role', 'dialog'); node.setAttribute('aria-modal', 'true'); node.setAttribute('aria-label', '一起種小樹');
  node.innerHTML = '<div class="ps-cg"><img alt="四個人在碼頭邊種小樹" draggable="false"></div><div class="ps-box" tabindex="0"><b></b><span></span><small>點一下繼續</small></div>';
  const cgBox = node.querySelector('.ps-cg'), who = node.querySelector('.ps-box b'), text = node.querySelector('.ps-box span'); if (cg) node.querySelector('img').src = cg;
  let i = -1;
  const close = () => { const s = scene; scene = null; node.remove(); removeEventListener('keydown', key, true); if (s && onDone) onDone(); };
  const next = () => { i += 1; while (i < lines.length && lines[i] && lines[i].cg) { cgBox.classList.add('on'); i += 1; } if (i >= lines.length) return close(); who.textContent = lines[i][0]; text.textContent = lines[i][1]; node.dataset.step = String(i); };
  const key = e => { e.stopPropagation(); if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); } };
  for (const t of ['pointerdown', 'pointerup']) node.addEventListener(t, e => e.stopPropagation());
  node.addEventListener('click', e => { e.stopPropagation(); next(); }); addEventListener('keydown', key, true);
  document.body.appendChild(node); scene = { node }; next(); node.querySelector('.ps-box').focus({ preventScroll: true });
}
