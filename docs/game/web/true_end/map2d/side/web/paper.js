// 小紙人（作者 2026-11-13）：人物像從紙上剪下來的小紙片。用程式在瀏覽器裡做，不產新圖：
//   paperize(src)：立繪 PNG → 外形往外長一圈不規則的白邊（剪紙留下的紙邊）；白邊外緣再一圈極細的暗線（切口與厚度）；
//                  紙面淡紙紋＋微光影（迎光的右側稍亮、左側稍暗、略帶彎曲的光澤，像紙片微微翹起）。
//   作者同日澄清「加影不是地面人影，是要紙感立體」：紙片背後的投影用 CSS drop-shadow（在 flat.html，跟著翻面、傾斜一起變），
//   這裡回的 shadow 只是一小塊很淡的接地影。
// 剪紙的邊距以換成 WebP 前的立繪像素為基準，依實際圖高換算。
const ORIGINAL_HEIGHTS = {
  bird: 682, bird_fly_0: 436, bird_fly_1: 427, bird_fly_2: 346,
  butterfly: 601, c7_flower: 440, flower_blue: 405, flower_blue_big: 526,
  flower_orange: 405, flower_purple: 405, flower_red: 405, flower_yellow: 405,
  lt_chen: 1000, lt_ming: 1000, lt_shi: 1000, lt_tea: 1000,
  ming_gear: 900, pot: 1045, rabbit: 872, shell_1: 142,
  zk_cat_sleep: 397, zk_cat_walk: 424, chen_3h: 1463, ming_3h: 1476,
  shi_3h: 1464, tea_side_3h_cut: 1439,
};
export async function paperize(src, opt = {}) {
  const source = new Image();
  source.crossOrigin = 'anonymous';
  source.src = src;
  await (window.PageLoading ? PageLoading.image(source) : source.decode());
  let im = source;
  const name = src.split('/').pop().replace(/\.webp$/, '');
  const scale = im.height / (ORIGINAL_HEIGHTS[name] || im.height);
  const edge = (opt.edge ?? 14) * scale, jitter = (opt.jitter ?? 4) * scale, tex = opt.texture ?? 0.09;
  if (opt.gray) { const gc = document.createElement('canvas'); gc.width = im.width; gc.height = im.height; const gg = gc.getContext('2d'); gg.filter = 'grayscale(1) brightness(1.08) contrast(.9)'; gg.drawImage(im, 0, 0); im = gc; }
  const pad = Math.ceil(edge + jitter + 8 * scale), W = im.width + pad * 2, H = im.height + pad * 2;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'); const rnd = mulberry(7);
  const dirs = []; for (let k = 0; k < 28; k++) dirs.push([rnd() * Math.PI * 2, edge * (0.55 + rnd() * 0.45) + (rnd() - 0.5) * jitter * 2]);
  // 1 切口厚度：白邊外再一圈暗線（往光的反方向、左下偏一點）
  for (const [a, r] of dirs) { g.filter = `drop-shadow(${(Math.cos(a) * r - 1.2 * scale).toFixed(1)}px ${(Math.sin(a) * r + 1.4 * scale).toFixed(1)}px 0 rgba(110,78,88,0.55))`; g.drawImage(im, pad, pad); }
  // 2 不規則白邊：很多個隨機偏移的影子疊出來（剪刀剪出來的邊不會是等距的）
  for (const [a, r] of dirs) { g.filter = `drop-shadow(${(Math.cos(a) * r).toFixed(1)}px ${(Math.sin(a) * r).toFixed(1)}px 0 #fbf7ef)`; g.drawImage(im, pad, pad); }
  g.filter = 'none';
  // 3 原圖疊回去
  g.drawImage(im, pad, pad);
  // 4 紙紋：整張乘上很淡的噪點（只動有像素的地方）
  const id = g.getImageData(0, 0, W, H), d = id.data, n2 = mulberry(3);
  for (let i = 0; i < d.length; i += 4) { if (d[i + 3] > 0) { const v = 1 - tex + n2() * tex * 2; d[i] = Math.min(255, d[i] * v); d[i + 1] = Math.min(255, d[i + 1] * v); d[i + 2] = Math.min(255, d[i + 2] * v); } }
  g.putImageData(id, 0, 0);
  // 5 微光影：迎光（右）稍亮、背光（左）稍暗，再一道略彎的柔光，像紙片微微翹起
  g.globalCompositeOperation = 'source-atop';
  const lg = g.createLinearGradient(0, 0, W, H * 0.3); lg.addColorStop(0, 'rgba(70,40,60,0.13)'); lg.addColorStop(0.55, 'rgba(0,0,0,0)'); lg.addColorStop(1, 'rgba(255,250,235,0.16)'); g.fillStyle = lg; g.fillRect(0, 0, W, H);
  const sheen = g.createLinearGradient(W * 0.2, 0, W * 0.75, H); sheen.addColorStop(0, 'rgba(255,255,255,0)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0.09)'); sheen.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = sheen; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'source-over';
  // 接地影：很淡的一小塊
  const s = document.createElement('canvas'); s.width = W; s.height = 40; const sg = s.getContext('2d'); const rg = sg.createRadialGradient(W / 2, 22, 2, W / 2, 22, W * 0.3); rg.addColorStop(0, 'rgba(70,40,60,0.28)'); rg.addColorStop(1, 'rgba(70,40,60,0)'); sg.fillStyle = rg; sg.save(); sg.scale(1, 0.35); sg.fillRect(0, 0, W, 120); sg.restore();
  return { src: c.toDataURL('image/png'), shadow: s.toDataURL('image/png'), pad, width: W, height: H };
}
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
