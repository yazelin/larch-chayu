// 落花瓣（作者 2026-11-13：零星不整齊；「應該要飄落才浪漫」；「從最頂端落下」「從中間冒出來太突然」；「落花瓣就是要製作一組」生成的花瓣圖）。
// 用生成的花瓣小圖（art/sprites/petal_c_*.png 櫻花 10 片＋3 朵小花、petal_t_*.png 鬱金香 8 片），canvas 逐格畫、每片自己的物理：
//   出生一律在畫面上緣以外（看不到出現那一刻），飄過整個畫面高度到地面帶（y 0.78–0.92），一片 6–12 秒；落地停 1–2.5 秒再慢慢淡出。
//   常駐：指數分布的間隔（有櫻花樹的區段平均 2.2 秒、沒樹的段 5.5 秒），偶爾一陣兩三片、偶爾十幾秒沒有。
//   飄：水平比垂直明顯，S 形（兩個頻率的正弦疊加）＋偶爾被微風托著往上回一點、偶爾停頓；邊飄邊翻面（寬度忽大忽小）、慢慢轉。
//   景深 d 0.3–1.3：遠的小淡慢、近的大清楚，偶爾一片很大的從鏡頭前飄過。
//   花雨（點樹）：從那棵樹冠頂端外緣（畫面頂端以上）開始，3 秒內陸續飄下十幾片。鬱金香：從花田上方一點點、用鬱金香花瓣。
export function createPetals({ stage, IMG, camX, getScale, canopies, feetY = 0.80, base = '../art/sprites/' }) {
  const cv = document.createElement('canvas'); cv.className = 'petals'; Object.assign(cv.style, { position: 'fixed', inset: '0', zIndex: 5, pointerEvents: 'none' }); stage.appendChild(cv);
  const ctx = cv.getContext('2d'); const P = []; let next = 1.0, wind = 10, windT = 0, grayMode = false;   // 第三章樹還是灰的時候花瓣也灰（降飽和，灰階不會髒）
  const rnd = (a, b) => a + Math.random() * (b - a);
  const IMGS = { cherry: [], tulip: [] };
  const load = async (pre, key) => { const meta = await (await fetch(base + pre + '.json')).json(); for (const m of meta) { const im = new Image(); im.src = base + m.file; await new Promise(ok => { im.onload = ok; im.onerror = ok; }); IMGS[key].push({ im, w: m.w, h: m.h, flower: key === 'cherry' && m.w > 0 && Math.abs(m.w - m.h) < m.w * 0.25 }); } };
  const ready = Promise.all([load('petal_c', 'cherry'), load('petal_t', 'tulip')]);
  function pickImg(kind) { const arr = IMGS[kind]; if (!arr.length) return null; if (kind === 'cherry') { const flowers = arr.filter(a => a.flower), petals = arr.filter(a => !a.flower); const pool = Math.random() < 0.08 && flowers.length ? flowers : (petals.length ? petals : arr); return pool[Math.floor(Math.random() * pool.length)]; } return arr[Math.floor(Math.random() * arr.length)]; }
  function make(x, y, kind = 'cherry') {
    const big = Math.random() < 0.05; const d = big ? rnd(1.6, 2.3) : rnd(0.3, 1.3); const img = pickImg(kind); if (!img) return null;
    const H = IMG.height; const ground = (feetY - 0.02 + Math.random() * 0.14) * H; const secs = rnd(6, 12) * (big ? 0.8 : 1);
    const size = (img.flower ? rnd(26, 34) : rnd(16, 26)) * d;   // 長圖座標 px（寬）
    return { x, y, d, img, w: size, h: size * img.h / img.w, a: 0, amax: big ? 0.85 : Math.min(1, 0.45 + d * 0.45), rot: rnd(0, 6.28), rv: rnd(-0.9, 0.9),
             vy: (ground - y) / secs, drift: Math.random() < 0.5 ? -1 : 1, s1: rnd(0.25, 0.6), s2: rnd(0.9, 1.7), p1: rnd(0, 6.28), p2: rnd(0, 6.28), amp1: rnd(18, 46), amp2: rnd(6, 16),
             lift: rnd(0.12, 0.35), fl: rnd(0.6, 1.6), fph: rnd(0, 6.28), ground, rest: rnd(1.0, 2.5), fade: rnd(1.0, 1.8), t: 0, pause: 0 };
  }
  const topY = () => -rnd(10, 60);
  function spawnAmbient() {
    const cx = camX(), vw = innerWidth / getScale(); const near = canopies.filter(c => c.x + c.w > cx - 120 && c.x < cx + vw + 120); let x;
    if (near.length && Math.random() < 0.8) { const c = near[Math.floor(Math.random() * near.length)]; x = rnd(Math.max(c.x, cx - 60), Math.min(c.x + c.w, cx + vw + 60)); } else x = rnd(cx - 80, cx + vw + 80);
    const p = make(x, topY()); if (p) P.push(p);
  }
  function rain(c, n = 11 + Math.floor(Math.random() * 7), span = 3.0, kind = 'cherry') {
    for (let i = 0; i < n; i++) setTimeout(() => { const y = kind === 'cherry' ? Math.min(topY(), c.y * IMG.height - rnd(20, 80)) : c.y * IMG.height - rnd(10, 40); const p = make(rnd(c.x + c.w * 0.1, c.x + c.w * 0.9), y, kind); if (p) { if (kind !== 'cherry') { p.vy *= 2.2; p.rest = rnd(0.6, 1.2); } P.push(p); } }, Math.random() * span * 1000);
  }
  function resize() { cv.width = Math.round(innerWidth * devicePixelRatio); cv.height = Math.round(innerHeight * devicePixelRatio); cv.style.width = innerWidth + 'px'; cv.style.height = innerHeight + 'px'; }
  addEventListener('resize', resize); resize();
  function step(dt) {
    windT += dt; wind = 8 + Math.sin(windT * 0.19) * 9 + Math.sin(windT * 0.053) * 6; next -= dt;
    if (next <= 0) { const cx = camX(), vw = innerWidth / getScale(); const hasTree = canopies.some(c => c.x + c.w > cx && c.x < cx + vw); const mean = hasTree ? 2.2 : 5.5; const r = Math.random(); next = r < 0.12 ? rnd(0.15, 0.5) : r < 0.85 ? -Math.log(Math.random()) * mean : rnd(6, 14); spawnAmbient(); }
    for (const p of P) {
      p.t += dt; p.a = Math.min(p.amax, p.a + dt * 1.2);
      if (p.y < p.ground) {
        if (p.pause > 0) { p.pause -= dt; p.rot += p.rv * 0.3 * dt; continue; }
        if (Math.random() < dt * 0.06) p.pause = rnd(0.25, 0.7);
        const sway = Math.sin(p.t * p.s1 + p.p1) * p.amp1 + Math.sin(p.t * p.s2 + p.p2) * p.amp2; const up = Math.max(0, Math.sin(p.t * p.s1 * 0.5 + p.p2)) * p.lift;
        p.y += p.vy * (1 - up) * dt * (0.75 + 0.25 * Math.sin(p.t * p.s2 + p.p1)); p.x += (wind * (0.4 + p.d * 0.6) * p.drift * 0.6 + wind * 0.4 + sway * p.s1) * dt; p.rot += p.rv * dt;
      } else { p.rest -= dt; if (p.rest < 0) p.a = Math.max(0, p.amax * (1 + p.rest / p.fade)); if (p.rest <= -p.fade) p.dead = true; }
    }
    for (let i = P.length - 1; i >= 0; i--) if (P[i].dead) P.splice(i, 1);
  }
  function draw() {
    const s = getScale(), cx = camX(); ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0); ctx.clearRect(0, 0, innerWidth, innerHeight);
    for (const p of P) {
      const sx = (p.x - cx) * s, sy = p.y * s; if (sx < -80 || sx > innerWidth + 80 || sy < -80) continue;
      const flip = Math.abs(Math.cos(p.t * p.fl + p.fph)) * 0.85 + 0.15;
      ctx.save(); ctx.translate(sx, sy); ctx.rotate(p.rot); ctx.scale(flip, 1); ctx.globalAlpha = p.a * (p.d < 0.6 ? 0.7 : 1);
      ctx.filter = (grayMode && p.img && IMGS.cherry.includes(p.img) ? 'grayscale(1) brightness(1.08) ' : '') + (p.d < 0.55 ? 'blur(0.6px)' : 'none');
      ctx.drawImage(p.img.im, -p.w * s / 2, -p.h * s / 2, p.w * s, p.h * s); ctx.restore();
    }
  }
  return { step, draw, rain, spawnAmbient, ready, setGray(v) { grayMode = !!v; }, get count() { return P.length; } };
}
