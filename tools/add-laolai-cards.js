/* 一次性脚本：加两张老赖专属事件卡（2026-10-27）
   目的：老赖不只是一个 red badge，得有事发生——催收打到家里、高铁坐不了。
   只在 has:laolai 时出现；还清债、状态解除后自动不再出。 */
const fs = require('fs');
const P = 'data/cards.json';
const d = JSON.parse(fs.readFileSync(P, 'utf8'));

const NEW = [
  {
    id: 'debt_calls_01',
    who: '催收',
    whoId: 'cuishou',
    avatar: '📞',
    tag: '风险',
    text: '电话打到你妈那儿。她问：「你是不是在外面欠钱了？」',
    when: 'has:laolai',
    cap: 2,
    left: { label: '跟她说了实话', effects: { mind: -4, social: -2, energy: -4 } },
    right: { label: '说打错了，是诈骗', effects: { mind: -2, social: -8 } },
  },
  {
    id: 'debt_limit_01',
    who: '出差',
    whoId: 'chucha',
    avatar: '🚄',
    tag: '风险',
    text: '客户在两千公里外。名单上的人，买不了高铁和机票。',
    when: 'has:laolai',
    cap: 2,
    left: { label: '坐绿皮，硬座两天', effects: { energy: -30, mind: -4, social: 2 } },
    right: { label: '视频会议算了，单子丢了', effects: { mind: -4, social: -6 } },
  },
];

const ids = new Set(d.cards.map((c) => c.id));
let added = 0;
NEW.forEach((c) => {
  if (ids.has(c.id)) return;
  d.cards.push(c);
  added++;
});

fs.writeFileSync(P, JSON.stringify(d, null, 2) + '\n');
console.log('新增', added, '张，池子共', d.cards.length, '张');
NEW.forEach((c) => console.log(' ', c.id, c.text, '(' + c.text.length + ' 字)'));
