const buffersByContext = new WeakMap();

export function guitarSample(a, freq) {
  let pluckBuffers = buffersByContext.get(a);
  if (!pluckBuffers) {
    pluckBuffers = new Map();
    buffersByContext.set(a, pluckBuffers);
  }
  if (pluckBuffers.has(freq)) return pluckBuffers.get(freq);
  const rate = a.sampleRate;
  // Karplus–Strong：取相鄰樣本平均會多半個樣本的延遲，用播放速率補回音高。
  const period = Math.round(rate / freq - 0.5);
  const playbackRate = freq * (period + 0.5) / rate;
  const buffer = a.createBuffer(1, Math.ceil(2 * rate * playbackRate), rate);
  const samples = buffer.getChannelData(0);
  const pick = Math.round(period * 0.22);
  let mean = 0;
  for (let i = 0; i < period; i++) {
    const displacement = i < pick ? i / pick : (period - i) / (period - pick);
    samples[i] = 0.65 * displacement + 0.35 * (2 * Math.random() - 1);
    mean += samples[i] / period;
  }
  for (let i = 0; i < period; i++) samples[i] -= mean;
  const decay = Math.exp(-1.25 * period / rate);
  samples[period] = decay * (samples[0] + samples[period - 1]) / 2;
  for (let i = period + 1; i < samples.length; i++) {
    samples[i] = decay * (samples[i - period] + samples[i - period - 1]) / 2;
  }
  for (let i = 0; i < samples.length; i++) {
    const time = i / (rate * playbackRate);
    samples[i] *= Math.min(1, time / 0.002) * Math.exp(-2 * time) * Math.min(1, (2 - time) / 0.12);
  }
  const sample = { buffer, playbackRate };
  pluckBuffers.set(freq, sample);
  return sample;
}
