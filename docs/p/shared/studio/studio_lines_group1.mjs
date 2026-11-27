export const GROUP1_LINES = {
  ming: {
    start: '{minutes} 分鐘。開始。',
    focus_done: '好。休息 {rest} 分鐘。',
    break_done: '休息完了。下一輪？',
    round_done: '第 {n} 輪。今天 {total} 分鐘。',
    stopped_early: '停了。這輪 {minutes} 分鐘。',
    long_break: '{n} 輪了。休息 {rest} 分鐘。',
    resume_note: '上次停在第 {minutes} 分鐘。',
    late_night: '{time} 了。去睡。',
    late_night_2: '進度明天再趕。',
    phone_focus: '手機那邊專心了 {minutes} 分鐘。記上了。'
  },
  chen: {
    pick_image: '哪一張？妳選。',
    pick_pieces: '幾片？妳選。',
    start: '慢慢拼。',
    hint: '這片在{area}。',
    hint_move: '這一塊太靠邊了。先拖回中間。',
    done: '拼好了。',
    done_best: '比上次快。',
    give_up: '放著吧，下次再拼。',
    again: '再一張？妳選。',
    coloring_enter: '線稿在這裡。妳選。',
    coloring_pick: '慢慢塗。顏色妳選。',
    coloring_done: '塗好了？我看看。',
    coloring_saved: '收好了。下一張，妳選。',
    coloring_switch_warn: '那張還沒收好。妳選。',
    phone_puzzle: '手機上的拼圖，記好了。',
    phone_drawing: '手機上塗的，收進來了。'
  }
};

export function group1Line(person, key, values = {}) {
  return GROUP1_LINES[person][key].replace(/\{(\w+)\}/g, (_, field) => values[field] ?? '');
}
