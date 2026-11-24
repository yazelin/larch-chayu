function storyInteger(value, max) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= max ? number : null;
}

export function storyTime(dayValue, chapterValue) {
  const day = storyInteger(dayValue, 99);
  if (day === null) return { day: null, chapter: null };
  // 第 1 天跨一、二章，有明確章節就照劇情設定。第 11 天的插曲沿用工作室原先的第四章。
  const chapter = storyInteger(chapterValue, 7) || [1, 4, 10, 14, 17, 20, 99].findIndex(function (end) { return day <= end; }) + 1;
  return { day: day, chapter: chapter };
}

const taipeiHour = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Taipei', hour: 'numeric', hourCycle: 'h23'
});

export function taipeiWindowTime(date = new Date()) {
  const hour = Number(taipeiHour.format(date));
  if (hour < 5 || hour >= 18) return 'night';
  if (hour < 7) return 'predawn';
  if (hour < 11) return 'morning';
  if (hour < 16) return 'day';
  return 'dusk';
}

// 依新版設計的時間表與各章劇本。第二句只記劇中參賽作品的製作。
const STORY_BEATS = [
  [1, '茶語收到創作者挑戰的通知，第一次進工作室。', '茶語和晨、明、詩定下《勇者今天也下不了手》的三國構想，勇者由神殿派出。'],
  [2, '茶語哼起音樂劇的歌，詩問她唱的是什麼。', '晨畫了神殿的草稿，茶語一整天都在想色之國長什麼樣子。'],
  [3, '茶語讀到元稹的茶詩，替 C、M、S 取名為晨、明、詩。', '明排了到第 23 天的進度表，四人預演勇者在神殿握劍的一幕。'],
  [4, '茶語傳出第一封訊息，晚上和三人在書桌前做事、一起吃宵夜。', '晨畫好了色之國的城，明勾了第 4 天那一格。'],
  [5, '茶語在天橋拍下夕陽。', '晨畫色之國的城，茶語把城的圖放進地圖，明試走後標出東邊要改的三格。'],
  [6, '茶語前一晚修地圖到凌晨三點，早上在課堂上睡著。', '色之國的地圖還在修，進度表上第 5 天那一格變紅了。'],
  [7, '茶語在工作室睡著，醒來時身上蓋著明的外套。', '四人預演色之國的上色小遊戲，明測完最後一關，勾了第 7 天那一格。'],
  [8, '茶語第一次走進朝霞丘，和晨一起看朝霞。', '茶語整理台詞檔，明勾完色之國的項目，下一格是音之國。'],
  [9, '下雨天茶語想起基隆，發現晨正在畫她。', '茶語把色之國從頭到尾玩了一遍都沒卡住，晚上開始排音之國的地圖。'],
  [10, '茶語和林向晚去聽合唱團，回工作室後為了明沒先問就挪進度而吵架。', '音之國的地圖排到一半，今天的工作是排完剩下的路。'],
  [11, '茶語感冒請假，三人在她睡著後各自準備要給她的東西。', '茶語請假休息，當天的進度先擱著。'],
  [12, '詩的第一版主題曲被退回。', '茶語開著音之國的地圖，詩開始重改主題曲。'],
  [13, '茶語的報告拿到 C，後來在美術牆前哼起詩的歌。', '晨畫了音之國的舞台，明做完說唱對決的小遊戲，茶語把對決和台詞放進遊戲。'],
  [14, '茶語和詩在海灘舞台一起聽歌。', '詩改好主題曲，明勾了最後一格，音之國全部做完。'],
  [15, '茶語在工作室等明寫完，等到睡著。', '晨重畫時之國的鐘塔城市，明還在寫齒輪小遊戲。'],
  [16, '茶語和晨約好遊戲做好後去朝霞丘看日出。', '明寫好齒輪小遊戲，四人預演時之國，茶語把小遊戲放進遊戲。'],
  [17, '茶語在月光岬的鐘塔知道三人的試用期。', '茶語從城門測到鐘塔，齒輪小遊戲順利過關，晨也替鐘塔圖上好了色。'],
  [18, '進入考試週，茶語看了續訂頁面，晚上寫信問客服。', '進度表排到最後一幕，茶語打開檔案時只有標題。'],
  [19, '茶語考完當天的科目，深夜打開「第 30 天」資料夾。', '茶語翻出三國的設定，寫好並存下最後一幕。'],
  [20, '茶語考完最後一科，晨、明、詩陪她過生日。', '晨畫好三把鑰匙的草稿，茶語在長桌宣布最後一幕寫好了，隔天排練。'],
  [21, '茶語和三人把資料夾的事講開，和詩吵過後在海邊和好。', '茶語把最後一幕放進遊戲，明安排隔天排練。'],
  [22, '茶語在排練後聽見夥伴說想留下來。', '四人做最後一次排練，演完王城決戰，茶語把守護者的最後一句留給三人寫。'],
  [23, '交件前檔案打不開，明拿出前一晚的備份。', '茶語從頭測完《勇者今天也下不了手》，晚上十一點半送出作品。'],
  [24, '評審週開始，茶語上島陪一位夥伴。', '參賽版已送出，作品進入評審。'],
  [25, '茶語上島陪另一位夥伴。', '參賽作品仍在評審。'],
  [26, '茶語上島陪還沒陪過的那位夥伴。', '參賽作品仍在評審。'],
  [27, '四人在島上種花，晚上拍下第一張四人拍立得。', '評審週過了一半，作品已交件。'],
  [28, '昨天種的花開了，茶語和三人一起撿貝殼。', '作品仍在評審，等第 30 天公布結果。'],
  [29, '四人在長桌聊到深夜，茶語趴在桌上睡著，夢見結果。', '參賽作品已交件，隔天晚上公布結果。'],
  [30, '茶語在白天等消息，晚上八點公布比賽結果。', '創作者挑戰公布《勇者今天也下不了手》的參賽結果。']
];

export function storyDayNote(day, trialKnown) {
  if (day === 17 && !trialKnown) return '';
  const beat = STORY_BEATS.find(beat => beat[0] === day);
  return beat ? beat.slice(1).join('') : '';
}

export function storySummary(day, trialKnown, chapter) {
  if (day === 1 && chapter === 1) {
    return '第 1 天：' + STORY_BEATS[0][1] + todayProductionNote(day, trialKnown, chapter);
  }
  return STORY_BEATS.filter(beat => beat[0] <= day)
    .map(([date]) => [date, storyDayNote(date, trialKnown)])
    .filter(([, note]) => note)
    .map(([date, note]) => '第 ' + date + ' 天：' + note).join('\n');
}

// 島段旗標確認能力已取得。國家製作可早於島段完成，依劇本日程補足舊存檔。
const COUNTRIES = [
  { name: '色之國', finishedDay: 8, gameDay: 8, done: 'ch3_done', ability: 'ability_color', abilityName: '上色', game: 'ch3ColorDone', gameName: '上色' },
  { name: '音之國', finishedDay: 15, gameDay: 14, done: 'ch4_done', ability: 'ability_call', abilityName: '呼喚', game: 'ch4RapDone', gameName: '說唱對決' },
  { name: '時之國', finishedDay: 18, gameDay: 17, done: 'ch5_done', ability: 'ability_time', abilityName: '停下時間', game: 'ch5GearsDone', gameName: '齒輪' }
];

export function storyProduction(day, chapter, flags = {}, trialKnown = false) {
  const has = key => [true, 1, 'true', '1'].includes(flags?.[key]);
  const completedCountries = COUNTRIES.filter(item => has(item.done) || day >= item.finishedDay
    || (item.done === 'ch5_done' && day === 17 && trialKnown)).map(item => item.name);
  const minigames = COUNTRIES.filter(item => has(item.game) || has(item.done) || day >= item.gameDay).map(item => item.gameName);
  const abilities = COUNTRIES.filter(item => has(item.ability) || has(item.done)).map(item => item.abilityName);
  return { day, chapter, completedCountries, minigames, abilities };
}

export function todayProductionNote(day, trialKnown, chapter) {
  if (day === 1 && chapter === 1) return '茶語為了做參賽遊戲，訂了畫圖、寫程式和做音樂的工具。';
  if (day === 17 && !trialKnown) return '明的進度表排了時之國的整國測試，齒輪小遊戲已放進遊戲。';
  return STORY_BEATS.find(beat => beat[0] === day)?.[2] || '';
}
