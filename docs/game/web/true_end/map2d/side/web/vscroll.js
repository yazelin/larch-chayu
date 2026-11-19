// 直向長畫共用的捲動（天燈 lantern_play.js、海底 dive_play.js 都用這一支）：
//   fit()     寬度撐滿畫面（最寬看整條長畫寬）；直式手機把可見寬度收到 minW 左右，讓人物夠大；畫面比長畫還高時改成高度撐滿
//   follow()  鏡頭平滑跟到目標（每秒趨近 rate 倍），左上角夾在長畫裡
//   apply()   把鏡頭寫成 #art 的 transform
export function fit(cam, W, H, sw, sh, minW = 900) {
  const a = sw / sh;
  cam.Vw = Math.min(W, Math.max(minW, 1400 * a)); cam.s = sw / cam.Vw; cam.Vh = sh / cam.s;
  if (cam.Vh > H) { cam.Vh = H; cam.s = sh / H; cam.Vw = Math.min(W, sw / cam.s); }
  cam.cx = cam.cy = null;
  return cam;
}
export function follow(cam, W, H, tx, ty, dt, rate = 5) {
  tx = Math.max(0, Math.min(W - cam.Vw, tx)); ty = Math.max(0, Math.min(H - cam.Vh, ty));
  if (cam.cy === null || cam.cx === null) { cam.cx = tx; cam.cy = ty; }
  const k = 1 - Math.exp(-dt * rate); cam.cy += (ty - cam.cy) * k; cam.cx += (tx - cam.cx) * k;
  if (Math.abs(ty - cam.cy) < 0.05) cam.cy = ty;
  if (Math.abs(tx - cam.cx) < 0.05) cam.cx = tx;
  cam.vx = cam.cx; cam.vy = cam.cy;
  return cam;
}
export function apply(el, cam) {
  el.style.transform = `translate3d(${(-cam.vx * cam.s).toFixed(2)}px,${(-cam.vy * cam.s).toFixed(2)}px,0) scale(${cam.s})`;
}
