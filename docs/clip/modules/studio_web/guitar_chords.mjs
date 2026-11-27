// 從第六弦（低音）排到第一弦（高音）。x 為悶弦，0 為空弦。
export const CHORD_GROUPS = [
  ['大三和弦', { C: 'x32010', D: 'xx0232', E: '022100', F: '133211', G: '320003', A: 'x02220' }],
  ['小三和弦', { Am: 'x02210', Bm: 'x24432', Dm: 'xx0231', Em: '022000' }],
  ['七和弦', { G7: '320001', E7: '020100', A7: 'x02020', D7: 'xx0212', Am7: 'x02010', Cmaj7: 'x32000', Fmaj7: 'xx3210' }],
  ['變化和弦', { Dsus4: 'xx0233', 'G/B': 'x20003', 'C/E': '032010' }],
];

// 譜上出現的補充指法可用提示旁的撥片套用。
export const CHORDS = Object.assign({}, ...CHORD_GROUPS.map(([, shapes]) => shapes), {
  Dm7: 'xx0211', Gmaj7: '320002', Gm7: '3x3333',
  Em7: '022030', Dmaj7: 'xx0222', Gsus4: '330013', Csus4: 'x33011',
});

export const PROGRESSIONS = [
  ['C', 'G', 'Am', 'F'],
  ['C', 'G', 'Am', 'Em', 'F', 'C', 'F', 'G'],
  ['Am', 'F', 'C', 'G'],
  ['F', 'G', 'Em', 'Am'],
];

const STRING_MIDI = [40, 45, 50, 55, 59, 64];
export const guitarFrequency = (string, fret, capo = 0) =>
  440 * 2 ** ((STRING_MIDI[string] + fret + capo - 69) / 12);
