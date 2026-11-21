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

const STORY_BEATS = [
  [1, '第一次進入工作室，茶語和晨、明、詩開始一起製作遊戲。'],
  [2, '茶語哼起音樂劇的歌，詩問她唱的是什麼。'],
  [3, '茶語讀到元稹的茶詩，替 C、M、S 取名為晨、明、詩；明排好進度表。'],
  [5, '開始製作色之國，晨負責遊戲角色與美術。'],
  [6, '茶語修地圖到凌晨，隔天在課堂上睡著。'],
  [9, '下雨天茶語想起基隆；晨偷偷畫她，被她發現。'],
  [10, '明沒問茶語就挪動進度，她為此和明吵架；晚上茶語和小天去聽合唱團。'],
  [11, '茶語感冒休息；她睡著後，晨、明、詩各自準備一份要送她的東西。'],
  [12, '進入音之國，詩開始完成主題曲。'],
  [13, '茶語的報告拿到 C。'],
  [14, '音之國主題曲繼續修改，三人陪茶語把進度追回來。'],
  [15, '進入時之國；晨重畫鐘塔城市，並在畫裡加上茶語。'],
  [17, '茶語在鐘塔知道三人的試用期限。'],
  [18, '進入考試週，茶語一邊準備考試，一邊想辦法讓三人留下。'],
  [19, '茶語打開「第 30 天」資料夾。'],
  [20, '茶語生日，晨、明、詩陪她一起過。'],
  [21, '茶語和三人把試用期限的事講開，之後和詩吵架又和好。'],
  [22, '四人進行最後一次排練，留下最後一句台詞讓茶語自己寫。'],
  [23, '遊戲完成並送出參賽；明拿出備份救回檔案。'],
  [24, '評審週開始，茶語每天陪一位夥伴。'],
  [25, '評審週持續，茶語每天陪一位夥伴。'],
  [26, '評審週最後一天，茶語每天陪一位夥伴。'],
  [27, '四人種花，晚上拍下第一張四人拍立得。'],
  [28, '茶語和三人一起撿貝殼。'],
  [29, '四人在長桌聊到深夜，茶語趴在桌上睡著。'],
  [30, '晚上八點公布比賽結果。']
];

export function storySummary(day, trialKnown) {
  const visibleBeats = STORY_BEATS.filter(function (beat) {
    return beat[0] <= day && (beat[0] !== 17 || trialKnown);
  });
  return visibleBeats.map(function (beat) { return '第 ' + beat[0] + ' 天：' + beat[1]; }).join('\n');
}
