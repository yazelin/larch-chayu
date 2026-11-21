// 第七章第 27 天種花（朝霞丘）、第 28 天撿貝殼（海灘）共用的小工具。玩法照 ../_第七章27_28天_提案.md（2026-11-18 作者同意）。
// 三個小紙人（晨、明、詩）排成一列跟在茶語後面走；她停下來，三個人站到旁邊。紙人用現有的三頭身圖，不另外畫。
const SPRITES = { chen: '../../../sprites/chen_3h.png', ming: '../../../sprites/ming_3h.png', shi: '../../../sprites/shi_3h.png' };
export const NAMES = { chen: '晨', ming: '明', shi: '詩' };

// api：flat_engine 給的那一包；feet：腳底（長畫高的比例）；hFrac：人物高（長畫高的比例）；gap：每個人往後隔多少 px；bounds：能走的範圍 [左, 右]
export async function makeFollowers(api, { feet, hFrac, gap = 105, bounds, order = ['chen', 'ming', 'shi'], startX }) {
  const { art, IMG, state, paperize } = api;
  const H = IMG.height, W = IMG.width;
  const firstPerson = art.querySelector('.person.tea');
  const people = [];
  for (const [i, id] of order.entries()) {
    const pp = await paperize(SPRITES[id]);
    const d = document.createElement('div'); d.className = 'person npc follower ' + id; d.dataset.follower = id;
    const s = hFrac * H / (pp.height - pp.pad * 2);
    d.style.top = (feet * 100) + '%'; d.style.height = (pp.height * s / H * 100) + '%'; d.style.setProperty('--pad', (pp.pad * s / H * 100) + '%');
    const sh = document.createElement('img'); sh.className = 'shadow'; sh.src = pp.shadow; sh.alt = '';
    const im = document.createElement('img'); im.className = 'sheet'; im.src = pp.src; im.alt = ''; im.draggable = false; d.append(sh, im);
    art.insertBefore(d, firstPerson);   // 在茶語後面
    const x = Math.max(bounds[0], Math.min(bounds[1], (startX ?? state.x) - state.face * gap * (i + 1)));
    const p = { id, el: d, x, face: 1, t: Math.random() * 6, busy: false, i };
    d.style.left = (x / W * 100) + '%';
    people.push(p);
  }
  api.onFrame(dt => {
    for (const p of people) {
      p.t += dt; if (p.busy) continue;
      const want = Math.max(bounds[0], Math.min(bounds[1], state.x - state.face * gap * (p.i + 1)));
      const d = want - p.x;
      if (Math.abs(d) > 24) {
        const v = Math.sign(d) * Math.min(Math.abs(d) - 18, 560 * dt); p.x += v; p.face = Math.sign(d);
        p.el.style.setProperty('--bob', (-window.WalkSway.pose(p.t, true).lift * 100) + '%'); p.el.style.setProperty('--rock', window.WalkSway.pose(p.t, true).tilt + 'deg');
      } else {
        p.el.style.setProperty('--bob', '0%'); p.el.style.setProperty('--rock', '0deg');
        p.face = state.x >= p.x ? 1 : -1;
      }
      p.el.style.left = (p.x / W * 100) + '%'; p.el.style.setProperty('--facing', String(p.face));
    }
  });
  // 彎腰一下（撿東西、蹲下來量）：紙片往前傾再立起來
  const bend = p => new Promise(ok => { p.busy = true; p.el.classList.remove('bend'); void p.el.offsetWidth; p.el.classList.add('bend'); setTimeout(() => { p.el.classList.remove('bend'); p.busy = false; ok(); }, 700); });
  // 走到某個 x（演出用），走完回到跟隨
  const walkTo = (p, x) => new Promise(ok => { p.busy = true; const from = p.x; const secs = Math.max(0.2, Math.abs(x - from) / 420); let t = 0; p.face = x >= from ? 1 : -1;
    const step = dt => { t += dt / secs; const e = Math.min(1, t); p.x = from + (x - from) * e; p.el.style.left = (p.x / W * 100) + '%'; p.el.style.setProperty('--facing', String(p.face)); window.WalkSway.css(p.el, window.WalkSway.pose(t * secs, e < 1));
      if (e >= 1) { const k = api.frameHooks.indexOf(step); if (k >= 0) api.frameHooks.splice(k, 1); window.WalkSway.css(p.el, window.WalkSway.pose(0, false)); ok(); } };
    api.frameHooks.push(step); });
  return { people, get: id => people.find(p => p.id === id), bend, walkTo, release: p => { p.busy = false; } };
}

// 把近白色的花瓣染成指定顏色（綠色的莖、葉、黃色花心不動），回傳 data URL。小花素材只有一張白的，淡紫、粉紅照這裡染
export async function tintPetals(src, hex) {
  const im = await new Promise((ok, no) => { const i = new Image(); i.crossOrigin = 'anonymous'; i.onload = () => ok(i); i.onerror = no; i.src = src; });   // 嵌在 Larch 時頁面是 Origin null，不帶 crossOrigin 讀回像素會被擋
  const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
  if (!hex) return c.toDataURL();
  const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
  const tr = parseInt(hex.slice(1, 3), 16), tg = parseInt(hex.slice(3, 5), 16), tb = parseInt(hex.slice(5, 7), 16);
  for (let i = 0; i < a.length; i += 4) {
    if (!a[i + 3]) continue;
    const r = a[i], gg = a[i + 1], b = a[i + 2], mx = Math.max(r, gg, b), mn = Math.min(r, gg, b);
    if (mx < 150 || (mx - mn) > 60 || (gg > r + 12 && gg > b + 12)) continue;   // 只動亮、偏白的像素
    const k = mx / 255;   // 保留明暗
    a[i] = Math.round(tr * k); a[i + 1] = Math.round(tg * k); a[i + 2] = Math.round(tb * k);
  }
  g.putImageData(d, 0, 0); return c.toDataURL();
}
