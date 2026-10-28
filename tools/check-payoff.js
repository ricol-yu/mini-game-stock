#!/usr/bin/env node
/**
 * 花钱性价比检测 —— 回答一个问题：
 *   「这个要掏钱的选项，玩家凭什么选它？」
 *
 * 动机（2026-10-28 玩家反馈）：老师说交 8,888 学费、张阿姨说交 5,000 内部渠道，
 *   选项里只有 spend 和各种扣分，等于把玩家往另一边赶 —— 这不叫选择，叫提示。
 *
 * 做法：两侧各自折成一个净收益（¥），再相减。
 *   net = −spend + 心态×250 + 社会×250 + 精力×60 − 风险×150 + 状态×天数×费率
 *   交易类（buy/sell/borrow/repay）不计入「回报」：钱只是换成持仓，不是赚了
 *
 * 判读只看「掏钱这一侧 相对 另一侧」：
 *   diff = net(掏钱侧) − net(另一侧)
 *   消息类（leak）按「典型持仓 1.5 万」把兑现期望折进 diff，否则永远误判
 *   diff < −spend×0.5  → 掏钱侧明显更差，理性玩家永远点另一边（伪选择）
 *   diff < 0           → 略差，需要玩家有"特别在乎某项"的理由才会选
 *   diff ≥ 0           → 花钱这侧是划得来的
 *
 * 用法：node tools/check-payoff.js [--list]
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cards.json'), 'utf8')).cards;

const W = { mind: 250, social: 250, energy: 60, risk: 150 };
const ST_RATE = { insider: 120, baby: 30, bull: 0, bear: 0, bubble: 0, crisis: 0, halt: 0, fired: 0, over: 0, laolai: 0 };

function worth(e) {
  let v = 0;
  ['mind', 'social', 'energy'].forEach(k => { v += (e[k] || 0) * W[k]; });
  v -= (e.risk || 0) * W.risk;
  if (e.addst) for (const s in e.addst) {
    const d = e.addst[s];
    v += (d > 0 ? d : 3) * (ST_RATE[s] === undefined ? 0 : ST_RATE[s]);
  }
  return v;
}
// 消息：兑现概率 × 连板涨幅，按"持仓 1.5 万"折成期望 ¥（只是提示，不计入 diff）
function leakHint(e) {
  if (!e.leak) return null;
  const pct = (1 - Math.pow(0.901, e.leak.run || 1)) * (e.leak.p || 0.5);
  return { pct: Math.round(pct * 1000) / 10, at15k: Math.round(pct * 15000) };
}

const rows = [];
cards.forEach(c => {
  const L = (c.left && c.left.effects) || {}, R = (c.right && c.right.effects) || {};
  const anyPay = (L.spend || 0) > 0 || (R.spend || 0) > 0;
  if (!anyPay) return;
  const trade = ['buy', 'sell', 'borrow', 'repay'].some(k => L[k] || R[k]);
  const netL = -(L.spend || 0) + worth(L), netR = -(R.spend || 0) + worth(R);
  // 以「掏钱更多的那一侧」为基准
  const payIsLeft = (L.spend || 0) >= (R.spend || 0);
  const pay = payIsLeft ? L : R, other = payIsLeft ? R : L;
  const netPay = payIsLeft ? netL : netR, netOther = payIsLeft ? netR : netL;
  const spend = pay.spend || 0;
  const diff = netPay - netOther;
  // 消息（leak）的回报取决于仓位，这里按「典型持仓 1.5 万」折算成期望值参与判定，
  // 否则"花钱买消息"这类卡会被永久误判成纯亏
  const lk = leakHint(pay);
  const diffEff = diff + (lk ? lk.at15k : 0);
  rows.push({
    id: c.id, tag: c.tag, spend, side: payIsLeft ? 'L' : 'R',
    label: (payIsLeft ? c.left : c.right).label,
    otherLabel: (payIsLeft ? c.right : c.left).label,
    netPay: Math.round(netPay), netOther: Math.round(netOther), diff: Math.round(diff),
    ratio: spend ? Math.round(diffEff / spend * 100) / 100 : 0,
    diffEff: Math.round(diffEff),
    leak: leakHint(pay), trade: !!trade,
    bothPay: (L.spend || 0) > 0 && (R.spend || 0) > 0,
  });
});

const bad = rows.filter(r => !r.trade && !r.bothPay && r.ratio < -0.5);
const weak = rows.filter(r => !r.trade && !r.bothPay && r.ratio < 0 && r.ratio >= -0.5);
const ok = rows.filter(r => !r.trade && !r.bothPay && r.ratio >= 0);

function show(title, arr) {
  console.log(`\n${title}（${arr.length} 个）`);
  arr.sort((a, b) => a.diffEff - b.diffEff).forEach(r => {
    console.log(`  ¥${String(r.spend).padStart(5)}  掏钱侧净 ¥${String(r.netPay).padStart(6)} vs 另一侧 ¥${String(r.netOther).padStart(6)}`
      + `  差 ¥${String(r.diff).padStart(6)}`
      + (r.leak ? ` +消息 ¥${r.leak.at15k} = ¥${r.diffEff}` : '')
      + `  ${r.id}「${r.label}」`);
  });
}

console.log(`==== 花钱性价比 · ${cards.length} 张卡 / ${rows.length} 张有花钱选项 ====`);
show('>>> 掏钱这侧明显更差（玩家永远点另一边）', bad);
show('>>> 掏钱这侧略差（没有特别理由不会选）', weak);
console.log(`\n合计：明显更差 ${bad.length} · 略差 ${weak.length} · 站得住 ${ok.length}`
  + ` · 不计（交易/双付费）${rows.length - bad.length - weak.length - ok.length}`);

if (process.argv.includes('--all')) {
  console.log('\n---- 全量（按差额） ----');
  rows.sort((a, b) => a.diff - b.diff).forEach(r => {
    console.log(`${String(r.diff).padStart(7)}  ¥${String(r.spend).padStart(5)}  ${r.id.padEnd(20)} `
      + `${r.trade ? '[交易]' : ''}${r.bothPay ? '[双付]' : ''}「${r.label}」`);
  });
}
