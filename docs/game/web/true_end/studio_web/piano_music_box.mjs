// The original piano envelope and oscillators, shared with the band music box.
export function playMusicBox(context, destination, frequency, time) {
  const gain = context.createGain();
  gain.connect(destination);
  const fundamental = context.createOscillator();
  fundamental.type = 'sine';
  fundamental.frequency.value = frequency;
  const overtone = context.createOscillator();
  overtone.type = 'triangle';
  overtone.frequency.value = frequency * 2.001;
  const mix = context.createGain();
  mix.gain.value = .18;
  fundamental.connect(gain);
  overtone.connect(mix);
  mix.connect(gain);
  gain.gain.setValueAtTime(.0001, time);
  gain.gain.exponentialRampToValueAtTime(.28, time + .012);
  gain.gain.exponentialRampToValueAtTime(.0001, time + 1.1);
  fundamental.start(time);
  overtone.start(time);
  fundamental.stop(time + 1.2);
  overtone.stop(time + 1.2);
  return [fundamental, overtone];
}
