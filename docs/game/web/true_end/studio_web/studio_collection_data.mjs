// 裁切框為原圖的 [左、上、寬、高] 比例。這批 WebP 均為 1024 × 683。
const sources = {
  sunset: ['../../art/web/bg/outside_new_WALK_1.webp', [.563, .232, .143, .256]],
  rain: ['../../art/web/bg/outside_new_RAIN_1.webp', [.55, .058, .31, .275]],
  court: ['../../art/web/bg/outside_new_COURT_1.webp', [.80, .008, .18, .13]],
  hall: ['../../art/web/bg/outside_new_HALL_1.webp', [.867, .22, .123, .25]],
  store: ['../../art/web/bg/outside_new_STORE_1.webp', [.20, .026, .121, .27]],
  morning: ['../../art/web/bg/room_new_DESK_A_morning.webp', [.557, .007, .222, .132]],
  noon: ['../../art/web/bg/room_new_DESK_A_noon.webp', [.557, .006, .203, .13]],
  evening: ['../../art/web/bg/room_new_DESK_A_evening.webp', [.55, .006, .212, .15]],
  dawn: ['../../art/web/bg/room_new_DESK_A_dawn.webp', [.559, .006, .214, .107]],
  night: ['../../art/web/bg/room_new_DESK_A.webp', [.555, .009, .229, .156]]
};

// 正文沒有交代實際拍照時刻的日子，取當天有敘述的時段。
export const SKY_DIARY = [
  [5, 'sunset', '第三章〈夕陽〉，下課經過天橋拍的第一張。'],
  [6, 'morning', '第三章提到早上第一堂課，取出門前的窗景。'],
  [7, 'night', '第三章晚間預演色之國，取晚上的窗景。'],
  [8, 'morning', '第三章早上〈台詞檔〉，取書桌前的窗景。'],
  [9, 'rain', '第三章明寫拍雨和剛亮的路燈，取校園空景窗外帶雨絲的灰天與樹梢。'],
  [10, 'court', '第三章中午在學校拿到合唱團的票，取同場校園的天空。'],
  [11, 'noon', '〈請假的一天〉白天在家休息，取房間窗景。'],
  [12, 'night', '第四章晚上〈退件〉，取晚上的房間窗景。'],
  [13, 'evening', '第四章傍晚放學回家，想起和晨約好拍天空。'],
  [14, 'night', '第四章晚上〈耳塞〉，取晚上的房間窗景。'],
  [15, 'night', '第五章晚上做時之國，取晚上的房間窗景。'],
  [16, 'noon', '第五章下午的自由時間談到天空日記，取白天天光。'],
  [17, 'morning', '第五章早上〈過關〉，取書桌前的窗景。'],
  [18, 'dawn', '第六章清晨看續訂頁面，取同場窗景。'],
  [19, 'hall', '第六章中午在學校走廊，取同場窗外的天空。'],
  [20, 'evening', '第六章生日傍晚〈什麼都不用做〉，取同場窗景。'],
  [21, 'morning', '第七章早上〈不要再裝了〉，取同場窗景。'],
  [22, 'night', '第七章晚上最後一次排練，取晚上的房間窗景。'],
  [23, 'night', '第七章晚上送出作品，取同場窗景。'],
  [24, 'morning', '第七章評審週第一天早上，取同場窗景。'],
  [25, 'noon', '第七章評審週第二天從白天的房間開始，取窗外天光。'],
  [26, 'store', '第七章評審週第三天早上路過超商，取街上的天空。'],
  [27, 'morning', '第七章種花當天早上，取出門前書桌的窗景。'],
  [28, 'morning', '第七章撿貝殼當天早上，取出門前書桌的窗景。'],
  [29, 'morning', '第七章〈第一天〉早上，取同場窗景。'],
  [30, 'evening', '第七章傍晚等公布，取夕照中的窗景。']
].map(([day, key, reason]) => {
  const [src, box] = sources[key];
  return { day, src, box, reason };
});

export const GROUP_PHOTO = {
  day: 27,
  src: '../../../cg/ch7/ch7_cg_040.webp',
  // 畫面中央已有拍立得白邊。裁掉周圍桌面，保留底下可放日期的位置。
  box: [.213, .025, .558, .965]
};

export const MUSICAL_TICKET = {
  src: '../../新版/canon_new/props/ticket_musical.jpg',
  box: [.035, .293, .933, .443],
  ratio: 1
};

export const CHEN_ART = [
  { title: '城門的草圖', src: '../../canon/refs/cg_04C-1_gate_sketch.jpg', chapter: 1 },
  { title: '素描本上的側臉', src: '../../canon/refs/cg_1-12_sketch_profile.jpg', chapter: 2 },
  { title: '朝霞丘的速寫', src: '../map2d/side/art/out/dawn/easel_sketch.jpg', chapter: 3, day: 8 },
  { title: '朝霞丘的日出', src: '../map2d/side/art/out/dawn/easel_painting.jpg', chapter: 7, day: 25 },
  { title: '天燈上的四個人', src: '../../canon/refs/lantern_chen_drawing.jpg', chapter: 99 }
];
