const sampleNames = [
  'A2', 'C3', 'Ds3', 'Fs3', 'A3', 'C4', 'Ds4', 'Fs4', 'A4',
  'C5', 'Ds5', 'Fs5', 'A5', 'C6', 'Ds6',
];
const lowestMidi = 45;
const sampleStep = 3;

export async function loadPianoSamples(context) {
  const buffers = await Promise.all(sampleNames.map(async name => {
    const url = new URL(`../../art/instruments/piano/${name}.mp3`, import.meta.url);
    const response = await fetch(url);
    if (!response.ok) throw new Error('Piano sample could not be fetched: ' + name);
    const bytes = await response.arrayBuffer();
    return new Promise((resolve, reject) => context.decodeAudioData(bytes, resolve, reject));
  }));
  return frequency => {
    const midi = 69 + 12 * Math.log2(frequency / 440);
    const nearest = Math.round((midi - lowestMidi) / sampleStep);
    const index = Math.max(0, Math.min(buffers.length - 1, nearest));
    const playbackRate = 2 ** ((midi - lowestMidi - index * sampleStep) / 12);
    return { buffer: buffers[index], playbackRate };
  };
}
