// 太陽的動態光（作者 2026-11-13 提議）：全部程式畫、不產圖。柔和、像水彩繪本，不是遊戲的強光。
// 四件事：太陽光暈緩慢呼吸（週期 7 秒、亮度差 8%）、幾道很寬很淡的放射光束極慢旋轉並各自忽明忽暗、海上光帶細碎閃爍、偶爾一兩顆小光點從太陽飄出。
// 畫在一張 canvas 上，放在底圖之後、人物之前，是 #art 的子元素所以跟著長畫同速捲動（不視差）；人物紙片不會被蓋到。
// 第三章灰色狀態照常顯示（灰層只蓋花，天空與海本來就是原色）。prefers-reduced-motion 時只留靜態光暈。
// ponytail: canvas 只蓋太陽周圍一塊、半解析度、30fps 上限；畫面不在那一段時不畫
export function sunlight(art, after, IMG, cfg, camX, getScale) {
  const sun = { x: cfg.x, y: cfg.y, r: cfg.r || 32 }, horizon = cfg.horizon || sun.y + 25, bandBottom = cfg.band_bottom || horizon + 280;
  const RX = 1000, TOP = 0, BOTTOM = bandBottom + 20;   // 畫布涵蓋：太陽左右各 1000px、從天頂到光帶底
  const L = Math.max(0, sun.x - RX), R = Math.min(IMG.width, sun.x + RX), W = R - L, H = BOTTOM - TOP, SC = 0.5;
  const cv = document.createElement('canvas'); cv.className = 'sunlight'; cv.width = Math.round(W * SC); cv.height = Math.round(H * SC);
  Object.assign(cv.style, { position: 'absolute', left: (L / IMG.width * 100) + '%', top: (TOP / IMG.height * 100) + '%', width: (W / IMG.width * 100) + '%', height: (H / IMG.height * 100) + '%', pointerEvents: 'none', mixBlendMode: 'screen' });
  after.after(cv);
  const g = cv.getContext('2d'); g.scale(SC, SC); g.translate(-L, -TOP);   // 之後都用長畫座標畫
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rnd = (a, b) => a + Math.random() * (b - a);
  // 光束：角度以太陽為中心，主要往上（-170°～-10°），每道有自己的寬度、長度、明暗週期
  const rays = Array.from({ length: 7 }, (_, i) => ({ a: -165 + i * 25 + rnd(-6, 6), w: rnd(7, 14), len: rnd(520, 820), ph: rnd(0, 6.28), per: rnd(9, 15), k: rnd(0.5, 1) }));
  const glints = []; const motes = []; let nextMote = rnd(3, 6), nextGlint = 0;
  let last = performance.now(), t = 0, acc = 0;
  function draw(now) {
    requestAnimationFrame(draw); if (document.hidden) { last = now; return; }
    const dt = Math.min(0.1, (now - last) / 1000); last = now; acc += dt; if (acc < 1 / 30) return; const step = acc; acc = 0; t += step;
    if (camX) { const s = getScale(), vw = innerWidth / s, cx = camX(); if (cx + vw < L - 50 || cx > R + 50) return; }   // 太陽不在畫面裡就不畫
    g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.restore();
    g.globalCompositeOperation = 'lighter';
    // 1. 光暈呼吸：7 秒一圈，亮度在基準上下 8%
    const breath = still ? 1 : 1 + 0.08 * Math.sin(t / 7 * 6.283);
    const halo = g.createRadialGradient(sun.x, sun.y, sun.r * 0.8, sun.x, sun.y, sun.r * 5.5 * (0.97 + 0.03 * breath));
    halo.addColorStop(0, `rgba(255,226,170,${0.22 * breath})`); halo.addColorStop(0.35, `rgba(255,205,150,${0.10 * breath})`); halo.addColorStop(1, 'rgba(255,190,170,0)');
    g.fillStyle = halo; g.beginPath(); g.arc(sun.x, sun.y, sun.r * 5.6, 0, 6.283); g.fill();
    if (still) return;
    // 2. 放射光束：整組 0.35°/秒 慢慢轉，每道各自忽明忽暗；暖金到淡粉、很低的不透明度
    const rot = t * 0.35;
    for (const r of rays) {
      const al = 0.045 + 0.04 * r.k * (0.5 + 0.5 * Math.sin(t / r.per * 6.283 + r.ph)); const ang = (r.a + rot) * Math.PI / 180, hw = r.w * Math.PI / 360;
      const lg = g.createLinearGradient(sun.x, sun.y, sun.x + Math.cos(ang) * r.len, sun.y + Math.sin(ang) * r.len);
      lg.addColorStop(0, `rgba(255,214,150,${al})`); lg.addColorStop(0.5, `rgba(255,205,185,${al * 0.6})`); lg.addColorStop(1, 'rgba(255,200,210,0)');
      g.fillStyle = lg; g.beginPath(); g.moveTo(sun.x, sun.y); g.arc(sun.x, sun.y, r.len, ang - hw, ang + hw); g.closePath(); g.fill();
    }
    // 3. 海上光帶的閃爍：零星亮點慢慢出現、淡出；越往下光帶越寬
    nextGlint -= step; if (nextGlint <= 0 && glints.length < 12) { const y = rnd(horizon + 8, bandBottom); const half = 40 + (y - horizon) / (bandBottom - horizon) * 150; glints.push({ x: sun.x + rnd(-half, half), y, w: rnd(8, 22), h: rnd(2.5, 4.5), life: rnd(2.2, 4.5), age: 0, a: rnd(0.25, 0.5) }); nextGlint = rnd(0.25, 0.7); }
    for (let i = glints.length - 1; i >= 0; i--) { const q = glints[i]; q.age += step; if (q.age > q.life) { glints.splice(i, 1); continue; } const e = q.age / q.life, al = q.a * Math.sin(e * Math.PI); g.fillStyle = `rgba(255,236,200,${al})`; g.beginPath(); g.ellipse(q.x, q.y, q.w, q.h, 0, 0, 6.283); g.fill(); }
    // 4. 偶爾一顆小光點從太陽方向飄過去
    nextMote -= step; if (nextMote <= 0) { const dir = rnd(2.6, 3.6); motes.push({ x: sun.x + rnd(-20, 20), y: sun.y + rnd(-20, 10), vx: Math.cos(dir) * rnd(14, 26), vy: Math.sin(dir) * rnd(8, 16) - 6, ph: rnd(0, 6), life: rnd(5, 8), age: 0 }); nextMote = rnd(4, 9); }
    for (let i = motes.length - 1; i >= 0; i--) { const m = motes[i]; m.age += step; if (m.age > m.life) { motes.splice(i, 1); continue; } m.x += m.vx * step; m.y += (m.vy + Math.sin(t * 1.3 + m.ph) * 6) * step; const al = 0.45 * Math.sin(m.age / m.life * Math.PI); const rg = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, 7); rg.addColorStop(0, `rgba(255,240,200,${al})`); rg.addColorStop(1, 'rgba(255,240,200,0)'); g.fillStyle = rg; g.beginPath(); g.arc(m.x, m.y, 7, 0, 6.283); g.fill(); }
  }
  requestAnimationFrame(draw);
  return { cv, rays, glints, motes };
}
