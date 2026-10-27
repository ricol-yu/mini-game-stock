#!/usr/bin/env node
/**
 * 一次性脚本：给「陪伴/亏欠」类卡打上欠账标记，并新增四张欠账清算卡。
 *
 * 用法：node tools/add-miss-cards.js
 *
 * 背景（2026-10-27）：
 *   用户要求「累计对父母/孩子/宠物/伴侣亏欠次数达到要求 → 触发欠账清算卡，
 *   清算卡两边一样，目的是告诉玩家已成既定事实」。
 *   所以需要一个**不显示给玩家**的欠账计数：
 *   - 卡牌某个选项标 `miss:'fam'|'child'|'pet'|'lover'`，选它就欠这条线一笔；
 *   - 引擎在 resolve() 里累加 S.miss[线]，when 里可写 `miss.fam>=3`；
 *   - 玩家看不到次数、看不到进度，只会在欠够之后撞上那张清算卡。
 *
 * 打标规则：默认「社交更低的那一侧 = 亏欠侧」（同社交比心态），
 *   下面 NO_MARK 是人工否掉的（两张都是好意/都在谈钱，不算亏欠）。
 *   左右不对称是真实存在的：有的卡左=陪、有的卡右=陪，所以不能按左右硬套。
 */
const fs = require('fs');
const path = require('path');

const P = path.join(__dirname, '..', 'data', 'cards.json');
const data = JSON.parse(fs.readFileSync(P, 'utf8'));
const cards = data.cards;

const TAG_LINE = { '伴侣': 'lover', '家人': 'fam', '孩子': 'child', '宠物': 'pet' };

// 人工否决：这两侧都不该算「亏欠」，或这张卡本身不是陪伴题
const NO_MARK = new Set([
  'fam_mortgage_01',   // 早知道就不买了 / 总算有个家：对房子的感慨，不是对人的亏欠
  'fam_shitan_01',     // 实话实说 vs 吹牛：诚实不该记账
  'fam_inlaws_02',     // 说了实话：同上
  'love_debt_01',      // 多还 / 先还最低：这是还钱，不是陪不陪
  'fam_anwei_01',      // 两个选项都是好话
  'fam_reportcard_02', // 下馆子庆祝 / 拍照发朋友圈：都高兴
  'fam_momhealth_02',  // 收下 / 转钱：两个都在照顾
  'life_parents_01',   // 教她清内存 / 买新手机：不是"不在场"
  'fam_divorce_01',    // 离婚卡本身是清算，不重复记账
]);

let marked = 0;
const report = [];
for (const c of cards) {
  const line = TAG_LINE[c.tag];
  if (!line || NO_MARK.has(c.id)) continue;
  const L = (c.left && c.left.effects) || {}, R = (c.right && c.right.effects) || {};
  const ls = L.social || 0, rs = R.social || 0, lm = L.mind || 0, rm = R.mind || 0;
  let side = null;
  if (ls < rs) side = 'left';
  else if (rs < ls) side = 'right';
  else if (lm < rm) side = 'left';
  else if (rm < lm) side = 'right';
  if (!side) continue;                                  // 两边一样：不是陪伴题，跳过
  if (c[side].miss) continue;                            // 已经打过标，保持原样
  c[side].miss = line;
  marked++;
  report.push([line, c.id, side, c[side].label]);
}

/* ---- 四张欠账清算卡：两边效果完全相同（既定事实，没有选择） ---- */
const FACT = [
  {
    id: 'fam_momgone_01', who: '老妈', avatar: '📵', tag: '家人',
    text: '这个月她一个电话都没打。你打回去，响到自动挂断。',
    when: 'miss.fam>=3; day>=45', cap: 1, urgent: true, fact: true,
    st: { momgone: -1 },
    left:  { label: '再打一次', effects: { mind: -14, social: -13 } },
    right: { label: '明天再说吧', effects: { mind: -14, social: -13 } },
  },
  {
    id: 'fam_childgone_01', who: '孩子', avatar: '🎓', tag: '孩子',
    text: '毕业照寄到了。他站在中间，旁边是他妈。你从头看到尾，没有自己。',
    when: 'miss.child>=3; day>=45', cap: 1, urgent: true, fact: true,
    st: { childgone: -1 },
    left:  { label: '收进抽屉', effects: { mind: -11, social: -11 } },
    right: { label: '摆在桌上', effects: { mind: -11, social: -11 } },
  },
  {
    id: 'pet_gone_01', who: '你妈', avatar: '🐈', tag: '宠物',
    text: '猫被送到你妈家了。她说，它在你家总是一个人蹲在门口。',
    when: 'miss.pet>=2; day>=38', cap: 1, urgent: true, fact: true,
    st: { petgone: -1 },
    left:  { label: '周末去看它', effects: { mind: -8, social: -4 } },
    right: { label: '先这样吧', effects: { mind: -8, social: -4 } },
  },
  {
    id: 'fam_gone_01', who: '她', avatar: '🚪', tag: '伴侣',
    text: '她搬走了。衣柜空了一半，钥匙放在鞋柜上。',
    when: 'miss.lover>=4; day>=38; no:did:fam_hunli_01', cap: 1, urgent: true, fact: true,
    st: { lovergone: -1 },
    left:  { label: '打给她', effects: { mind: -10, social: -12 } },
    right: { label: '让她静静', effects: { mind: -10, social: -12 } },
  },
];

for (const f of FACT) {
  if (cards.some(c => c.id === f.id)) { console.log('已存在，跳过：' + f.id); continue; }
  cards.push(f);
}

/* ---- 爸妈这条线关掉后，爸妈的卡不能再出现 ----
   「家人」分类里混着丈母娘（她属于婚姻线，不该被爸妈的清算连坐），
   所以爸妈卡用 when 守卫（no:has:momgone），孩子/宠物/伴侣按分类整条关。 */
const FOLKS = ['fam_hospital_01', 'fam_hospital_02', 'fam_eldermoney_01',
               'fam_momcall_01', 'fam_momcall_02', 'fam_momhealth_01',
               'fam_momhealth_02', 'life_parents_01'];
const GUARD = 'no:has:momgone';
function guardWhen(w) {
  if (!w) return GUARD;
  // when 的 | 比 ; 松，直接在最前面拼一个守卫只会罩住第一组，必须逐组加
  return String(w).split('|').map(g => GUARD + '; ' + g.trim()).join('|');
}
let guarded = 0;
for (const id of FOLKS) {
  const c = cards.find(x => x.id === id);
  if (!c) { console.log('⚠ 找不到 ' + id); continue; }
  if (String(c.when || '').includes(GUARD)) continue;
  c.when = guardWhen(c.when);
  guarded++;
}

/* ---- 已婚的人：欠账太多也会走到离婚卡（原来只认 mind<35 与两条特定线） ---- */
const div = cards.find(c => c.id === 'fam_divorce_01');
if (div && !String(div.when).includes('miss.lover')) {
  div.when += '|miss.lover>=6; did:fam_hunli_01; day>=55';
}

fs.writeFileSync(P, JSON.stringify(data, null, 2) + '\n');

console.log('打标 ' + marked + ' 个选项：');
const byLine = {};
report.forEach(r => { (byLine[r[0]] = byLine[r[0]] || []).push(r); });
Object.keys(byLine).forEach(l => {
  console.log('  [' + l + '] ' + byLine[l].length + ' 处');
  byLine[l].forEach(r => console.log('     ' + r[1].padEnd(20) + r[2].padEnd(6) + r[3]));
});
console.log('爸妈卡加守卫 ' + guarded + ' 张，新增清算卡 ' + FACT.length + ' 张，总数 ' + cards.length);
