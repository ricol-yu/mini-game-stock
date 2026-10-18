#!/usr/bin/env node
/* 从 prototype.html 抽取卡池与数值，产出结构化数据。
   用途：把硬编码在 JS 字面量里的设计数据变成可版本管理、可表格编辑的资产。
   用法：node tools/extract-cards.js <prototype.html> */

const fs = require('fs');
const path = require('path');

const src = process.argv[2];
if (!src) {
  console.error('用法: node tools/extract-cards.js <prototype.html>');
  process.exit(1);
}

const html = fs.readFileSync(src, 'utf8');

const start = html.indexOf('\nCARDS = [');
if (start < 0) {
  console.error('没找到 CARDS 数组');
  process.exit(1);
}
const end = html.indexOf('\n];', start);
if (end < 0) {
  console.error('没找到 CARDS 数组结尾');
  process.exit(1);
}
const arraySrc = html.slice(start + 'CARDS = '.length, end + 2);

const stubS = { st: {}, social: 60, day: 1, equity: 0, cost: 0, cash: 1000, debt: 0, risk: 0 };
let cards;
try {
  cards = new Function('S', 'return ' + arraySrc + ';')(stubS);
} catch (e) {
  console.error('卡池解析失败:', e.message);
  process.exit(1);
}

const out = cards.map((c, i) => ({
  id: 'c' + String(i + 1).padStart(3, '0'),
  who: c.who,
  avatar: c.av,
  tag: c.tag,
  text: c.txt,
  when: typeof c.when === 'function' ? c.when.toString().replace(/\s+/g, ' ') : null,
  alwaysStatus: c.st || null,
  left: { label: c.L.s, effects: c.L.e },
  right: { label: c.R.s, effects: c.R.e }
}));

const dir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'cards.json'), JSON.stringify({
  version: 'v3',
  source: path.basename(src),
  total: out.length,
  cards: out
}, null, 2), 'utf8');

console.log('已导出 ' + out.length + ' 张卡 -> data/cards.json');

const tags = {};
out.forEach(c => { tags[c.tag] = (tags[c.tag] || 0) + 1; });
console.log('分类分布:', JSON.stringify(tags));

const withCond = out.filter(c => c.when).length;
const withStatus = out.filter(c => c.alwaysStatus).length;
console.log('带触发条件:', withCond, '张 | 自带状态:', withStatus, '张');

/* 支配选项检测：某个选项在所有维度上都不差于另一方，且至少一项更好
   —— 这种卡没有真正的选择，玩家只需记住「永远滑这一边」 */
const dims = ['cash', 'equity', 'cost', 'mind', 'risk', 'social'];
const score = e => {
  const v = {};
  dims.forEach(d => { v[d] = e[d] || 0; });
  if (e.buy) v.equity += e.buy;
  if (e.borrow) { v.equity += e.borrow; v.risk += 5; }
  if (e.sell) v.equity -= e.sell * 100;
  if (e.spend) v.cash -= e.spend;
  if (e.repay) { v.cash -= e.repay; v.risk -= e.repay / 600; }
  return v;
};

const dominated = [];
out.forEach(c => {
  const R = score(c.right.effects), L = score(c.left.effects);
  const keys = dims.filter(d => d !== 'risk');
  const rWins = keys.every(k => R[k] >= L[k]) && (R.risk <= L.risk);
  const lWins = keys.every(k => L[k] >= R[k]) && (L.risk <= R.risk);
  const rAny = keys.some(k => R[k] !== L[k]) || R.risk !== L.risk;
  if (rWins && rAny) dominated.push({ id: c.id, who: c.who, keep: '右滑', text: c.text });
  if (lWins && rAny) dominated.push({ id: c.id, who: c.who, keep: '左滑', text: c.text });
});

console.log('\n存在支配选项的卡（选哪边其实没有差别）: ' + dominated.length + ' 张');
dominated.forEach(d => console.log('  ' + d.id + ' [' + d.who + '] 永远' + d.keep + ' — ' + d.text));
