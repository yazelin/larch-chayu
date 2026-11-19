// 互動音效（Web Audio 合成，音量小、柔和；不用外部檔）。作者 2026-11-13：每個互動配一個合適的短音效。
let ac = null; const master = () => { if (!ac) { ac = new (window.AudioContext || window.webkitAudioContext)(); ac.g = ac.createGain(); ac.g.gain.value = 0.22; ac.g.connect(ac.destination); } if (ac.state === 'suspended') ac.resume(); return ac; };
addEventListener('pointerdown', () => master(), { once: true }); addEventListener('keydown', () => master(), { once: true });
function noise(sec) { const a = master(); const b = a.createBuffer(1, Math.ceil(a.sampleRate * sec), a.sampleRate); const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1; const s = a.createBufferSource(); s.buffer = b; return s; }
function env(node, t0, a, h, r, peak = 1) { const a_ = master(); const g = a_.createGain(); g.gain.setValueAtTime(0.0001, t0); g.gain.linearRampToValueAtTime(peak, t0 + a); g.gain.setValueAtTime(peak, t0 + a + h); g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + h + r); node.connect(g); g.connect(a_.g); return g; }
function tone(freq, t0, dur, type = 'sine', peak = 0.5, glide) { const a = master(); const o = a.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t0); if (glide) o.frequency.exponentialRampToValueAtTime(glide, t0 + dur); env(o, t0, 0.01, dur * 0.3, dur * 0.7, peak); o.start(t0); o.stop(t0 + dur + 0.05); }
export const sfx = {
  rustle(n = 1) {   // 花瓣沙沙：帶通的噪音短促幾下
    const a = master(); for (let i = 0; i < n; i++) { const t = a.currentTime + i * 0.09 + Math.random() * 0.05; const s = noise(0.25); const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400 + Math.random() * 1800; f.Q.value = 0.9; s.connect(f); env(f, t, 0.02, 0.03, 0.18, 0.35); s.start(t); }
  },
  chirp() {   // 鳥叫兩聲＋拍翅
    const a = master(); const t = a.currentTime; tone(2600, t, 0.09, 'sine', 0.35, 3400); tone(3100, t + 0.14, 0.11, 'sine', 0.3, 2300);
    for (let i = 0; i < 5; i++) { const s = noise(0.08); const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900; s.connect(f); env(f, t + 0.25 + i * 0.13, 0.01, 0.02, 0.06, 0.4); s.start(t + 0.25 + i * 0.13); }
  },
  water() {   // 澆水：低通噪音流水＋幾滴
    const a = master(); const t = a.currentTime; const s = noise(1.1); const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; s.connect(f); env(f, t, 0.15, 0.5, 0.4, 0.3); s.start(t);
    for (let i = 0; i < 6; i++) tone(900 + Math.random() * 600, t + 0.2 + i * 0.14, 0.06, 'sine', 0.18, 500);
  },
  click(open = true) {   // 信箱開合：短促木頭聲
    const a = master(); const t = a.currentTime; const s = noise(0.05); const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = open ? 1100 : 700; f.Q.value = 2; s.connect(f); env(f, t, 0.004, 0.01, 0.07, 0.6); s.start(t); tone(open ? 520 : 380, t, 0.08, 'triangle', 0.15);
  },
  sparkle() {   // 上色的閃亮：上行琶音
    const a = master(); const t = a.currentTime; [880, 1175, 1480, 1760, 2217].forEach((f, i) => tone(f, t + i * 0.07, 0.35, 'sine', 0.22));
  },
  pick() {   // 撿東西：短撥弦往上滑
    const a = master(); const t = a.currentTime; tone(660, t, 0.18, 'triangle', 0.3, 990); tone(1320, t + 0.06, 0.12, 'sine', 0.12);
  },
  boing() {   // 兔子跳一下
    const a = master(); const t = a.currentTime; tone(300, t, 0.22, 'sine', 0.3, 620);
  },
  heart() {   // 冒愛心：兩個柔和的音
    const a = master(); const t = a.currentTime; tone(784, t, 0.18, 'sine', 0.22); tone(1046, t + 0.12, 0.3, 'sine', 0.2);
  },
  brush() {   // 畫筆刷過畫布：一下噪音掃過
    const a = master(); const t = a.currentTime; const s = noise(0.35); const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(600, t); f.frequency.exponentialRampToValueAtTime(2400, t + 0.3); f.Q.value = 1.2; s.connect(f); env(f, t, 0.05, 0.1, 0.2, 0.25); s.start(t);
  },
  bleed() {   // 顏色滲開：很柔的墊底音
    const a = master(); const t = a.currentTime; tone(392, t, 1.6, 'sine', 0.12); tone(587, t + 0.3, 1.4, 'sine', 0.08);
  },
  sit() { const a = master(); const t = a.currentTime; const s = noise(0.2); const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700; s.connect(f); env(f, t, 0.02, 0.05, 0.15, 0.3); s.start(t); },
  paper() {   // 紙片翻開、對話框出現
    const a = master(); const t = a.currentTime; const s = noise(0.12); const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1800; s.connect(f); env(f, t, 0.01, 0.02, 0.1, 0.18); s.start(t);
  },
};

// ── 海灘舞台用（beach_play.js）。都是新增的，朝霞丘原有的音效沒有動 ──
const SCALE7 = [261.63, 293.66, 329.63, 349.23, 392.0, 440.0, 493.88];   // 七個貝殼：Do Re Mi Fa Sol La Si（大貝殼低、小貝殼高）
Object.assign(sfx, {
  shell(i, peak = 0.42) {   // 敲貝殼：像木琴，基音加兩個泛音，起音快、尾巴短
    const a = master(); const t = a.currentTime, f = SCALE7[Math.max(0, Math.min(6, i))]; tone(f, t, 0.55, 'sine', peak); tone(f * 2.76, t, 0.18, 'sine', peak * 0.28); tone(f * 4.0, t, 0.09, 'triangle', peak * 0.14);
  },
  hum(n = 3) {   // 呼喚：哼幾個音（主題曲開頭），柔的三角波加一點顫音
    const a = master(); const t = a.currentTime; [329.63, 392.0, 440.0, 392.0].slice(0, n + 1).forEach((f, i) => { const o = a.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(f, t + i * 0.2); const l = a.createOscillator(); l.frequency.value = 5.5; const lg = a.createGain(); lg.gain.value = 4; l.connect(lg).connect(o.frequency); env(o, t + i * 0.2, 0.05, 0.1, 0.22, 0.3); o.start(t + i * 0.2); o.stop(t + i * 0.2 + 0.5); l.start(t + i * 0.2); l.stop(t + i * 0.2 + 0.5); });
  },
  pluck(freq, when = 0, peak = 0.3) {   // 吉他撥一下：鋸齒波過低通、很快衰減
    const a = master(); const t = a.currentTime + when; const o = a.createOscillator(); o.type = 'sawtooth'; o.frequency.value = freq; const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(2600, t); f.frequency.exponentialRampToValueAtTime(500, t + 0.5); o.connect(f); env(f, t, 0.004, 0.02, 0.7, peak); o.start(t); o.stop(t + 0.8);
  },
  wood(step = 0) {   // 木板腳步：低的悶響加一點木頭的敲擊
    const a = master(); const t = a.currentTime; tone(150 + (step % 2) * 22, t, 0.11, 'sine', 0.5, 80); const s = noise(0.05); const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 820 + (step % 3) * 90; f.Q.value = 3; s.connect(f); env(f, t, 0.003, 0.01, 0.05, 0.4); s.start(t);
  },
  thud() {   // 椰子落在沙上
    const a = master(); const t = a.currentTime; tone(120, t, 0.22, 'sine', 0.6, 55); const s = noise(0.12); const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 500; s.connect(f); env(f, t, 0.005, 0.02, 0.1, 0.35); s.start(t);
  },
  clink(k = 0) {   // 玻璃浮球互碰
    const a = master(); const t = a.currentTime; const f = 1500 + k * 240 + Math.random() * 120; tone(f, t, 0.5, 'sine', 0.28); tone(f * 2.4, t, 0.2, 'sine', 0.1);
  },
  creak(open = true) {   // 木箱、木桶的蓋子
    const a = master(); const t = a.currentTime; tone(open ? 180 : 260, t, 0.3, 'sawtooth', 0.09, open ? 320 : 150); const s = noise(0.06); const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = open ? 900 : 600; f.Q.value = 2; s.connect(f); env(f, t + (open ? 0 : 0.22), 0.004, 0.01, 0.07, 0.5); s.start(t + (open ? 0 : 0.22));
  },
  crackle(n = 8) {   // 營火：一串短促的劈啪
    const a = master(); for (let i = 0; i < n; i++) { const t = a.currentTime + Math.random() * 0.9; const s = noise(0.03); const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 1500 + Math.random() * 2500; s.connect(f); env(f, t, 0.002, 0.005, 0.03, 0.35 + Math.random() * 0.3); s.start(t); }
    const s = noise(0.9); const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420; s.connect(f); env(f, a.currentTime, 0.1, 0.3, 0.5, 0.16); s.start(a.currentTime);
  },
  wave() {   // 浪上來又退下去
    const a = master(); const t = a.currentTime; const s = noise(3.2); const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(1500, t + 1.2); f.frequency.linearRampToValueAtTime(600, t + 3); f.Q.value = 0.5; s.connect(f); env(f, t, 1.1, 0.3, 1.7, 0.3); s.start(t);
  },
  splash() { const a = master(); const t = a.currentTime; const s = noise(0.5); const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(700, t + 0.45); f.Q.value = 0.7; s.connect(f); env(f, t, 0.01, 0.05, 0.4, 0.35); s.start(t); },
  squawk() { const a = master(); const t = a.currentTime; tone(1250, t, 0.16, 'sawtooth', 0.1, 900); tone(1400, t + 0.2, 0.22, 'sawtooth', 0.09, 800); },   // 海鷗叫
  scuttle() { const a = master(); for (let i = 0; i < 5; i++) { const t = a.currentTime + i * 0.055; const s = noise(0.02); const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2600 + Math.random() * 900; f.Q.value = 4; s.connect(f); env(f, t, 0.002, 0.004, 0.02, 0.3); s.start(t); } },   // 螃蟹橫著跑的喀喀聲
  squeak() { const a = master(); const t = a.currentTime; tone(1900, t, 0.1, 'sine', 0.22, 2600); tone(2300, t + 0.12, 0.1, 'sine', 0.22, 3000); tone(2000, t + 0.26, 0.16, 'sine', 0.2, 2900); },   // 海豚叫
  bulb(i = 0) { const a = master(); const t = a.currentTime; const f = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5, 1568][i % 9]; tone(f, t, 0.5, 'sine', 0.2); tone(f * 2, t, 0.25, 'sine', 0.06); },   // 燈一盞一盞亮：五聲音階往上
});

// ── 月光岬（2026-11-14）：停下時間、浮空石、齒輪、鐘塔、提燈、蘑菇、松果、海龜。原有的都沒動 ──
// 停下時間的「聲音拉長變悶」：主音量後面接一個低通，平常全開，停住時關到 420 Hz；另外一條很低的長音墊著，恢復時收掉
let lp = null, drone = null;
function lowpass() { const a = master(); if (!lp) { lp = a.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 20000; a.g.disconnect(); a.g.connect(lp); lp.connect(a.destination); } return lp; }
Object.assign(sfx, {
  freeze() {   // 一個往下滑的長音，接著整個世界變悶
    const a = master(); const t = a.currentTime; tone(880, t, 1.1, 'sine', 0.3, 196); tone(1320, t, 0.7, 'triangle', 0.12, 330);
    const f = lowpass(); f.frequency.cancelScheduledValues(t); f.frequency.setValueAtTime(Math.max(500, f.frequency.value), t + 0.25); f.frequency.exponentialRampToValueAtTime(420, t + 0.9);
    if (!drone) { const o = a.createOscillator(); o.type = 'sine'; o.frequency.value = 98; const g = a.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.3, t + 0.8); o.connect(g); g.connect(a.g); o.start(t); drone = { o, g }; }
  },
  unfreeze() {   // 低通打開、長音收掉、一個往上的短音
    const a = master(); const t = a.currentTime; const f = lowpass(); f.frequency.cancelScheduledValues(t); f.frequency.setValueAtTime(Math.max(420, Math.min(f.frequency.value, 19000)), t); f.frequency.exponentialRampToValueAtTime(20000, t + 0.5);
    if (drone) { const d = drone; drone = null; d.g.gain.cancelScheduledValues(t); d.g.gain.setValueAtTime(0.3, t); d.g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4); d.o.stop(t + 0.5); }
    tone(330, t + 0.05, 0.5, 'sine', 0.22, 880);
  },
  hop() { const a = master(); const t = a.currentTime; tone(420, t, 0.16, 'sine', 0.3, 720); },   // 跳上一塊浮空石
  stone(i = 0) { const a = master(); const t = a.currentTime; const f = [659.25, 739.99, 830.61, 987.77, 1108.73, 1318.5][i % 6]; tone(f, t, 0.6, 'sine', 0.2); tone(f * 2.01, t, 0.3, 'sine', 0.07); tone(140, t, 0.1, 'sine', 0.3, 90); },   // 踩上去：晶石的一個清音加一點悶響
  sinking() { const a = master(); const t = a.currentTime; tone(520, t, 1.2, 'sine', 0.16, 180); },   // 石頭往下沉
  gear() { const a = master(); const t = a.currentTime; for (let i = 0; i < 3; i++) { tone(1900 + i * 420, t + i * 0.07, 0.25, 'triangle', 0.16); } tone(240, t, 0.12, 'square', 0.06, 180); },   // 黃銅齒輪的金屬聲
  ratchet(n = 5) { const a = master(); for (let i = 0; i < n; i++) { const t = a.currentTime + i * 0.07; const s = noise(0.02); const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1700 + (i % 2) * 500; f.Q.value = 5; s.connect(f); env(f, t, 0.002, 0.004, 0.02, 0.45); s.start(t); } },   // 齒輪咬住、轉一下
  bong() { const a = master(); const t = a.currentTime; tone(82, t, 2.4, 'sine', 0.7, 70); tone(164, t, 1.6, 'sine', 0.3); tone(246.9, t, 1.1, 'triangle', 0.12); const s = noise(0.08); const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 300; s.connect(f); env(f, t, 0.004, 0.02, 0.06, 0.6); s.start(t); },   // 鐘塔裡很重的一聲
  tick(back = false) { const a = master(); const t = a.currentTime; const s = noise(0.02); const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = back ? 1500 : 2300; f.Q.value = 6; s.connect(f); env(f, t, 0.001, 0.004, 0.02, 0.5); s.start(t); },   // 指針走一格
  blow() { const a = master(); const t = a.currentTime; const s = noise(0.35); const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(1800, t); f.frequency.exponentialRampToValueAtTime(600, t + 0.3); f.Q.value = 0.8; s.connect(f); env(f, t, 0.02, 0.05, 0.25, 0.3); s.start(t); },   // 吹熄提燈
  ignite() { const a = master(); const t = a.currentTime; const s = noise(0.12); const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 2500; s.connect(f); env(f, t, 0.003, 0.02, 0.09, 0.3); s.start(t); tone(392, t + 0.08, 0.7, 'sine', 0.16); tone(587.3, t + 0.08, 0.5, 'sine', 0.08); },   // 點亮提燈
  shroom(i = 0) { const a = master(); const t = a.currentTime; const f = [392, 466.16, 523.25, 587.33, 698.46, 783.99][i % 6]; tone(f, t, 0.9, 'sine', 0.18); tone(f * 3, t, 0.35, 'sine', 0.04); },   // 蘑菇一朵接一朵亮
  bloom(open = true) { const a = master(); const t = a.currentTime; const seq = open ? [523.25, 659.25, 783.99, 1046.5] : [1046.5, 783.99, 659.25, 523.25]; seq.forEach((f, i) => tone(f, t + i * 0.32, 0.7, 'sine', 0.11)); },   // 鬱金香慢慢打開、闔上
  cone() { const a = master(); const t = a.currentTime; tone(210, t, 0.09, 'triangle', 0.3, 130); const s = noise(0.04); const f = a.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1300; f.Q.value = 2; s.connect(f); env(f, t, 0.003, 0.01, 0.04, 0.35); s.start(t); },   // 松果落地
  twinkle() { const a = master(); const t = a.currentTime; tone(1568, t, 0.3, 'sine', 0.1); tone(2093, t + 0.09, 0.3, 'sine', 0.08); },   // 螢火蟲
  cloud() { const a = master(); const t = a.currentTime; const s = noise(3); const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 380; s.connect(f); env(f, t, 1.2, 0.4, 1.3, 0.2); s.start(t); },   // 雲飄過去的風
});
