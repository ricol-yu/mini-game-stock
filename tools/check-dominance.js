#!/usr/bin/env node
/**
 * 支配选项检测 —— 回答一个手工看不出来的问题：
 *   「这张卡，玩家还需要想吗？」
 *
 * 做法：把左右两个选项各自折算成同一套收益向量，再比较。
 *   money 净资产 = cash - spend + borrow - repay（buy/sell 只是现金↔持仓，净资产中性）
 *   exposure 市场敞口 = buy/sell/borrow/repay（单独一列，因为它正负取决于行情）
 *   统一成「越大越好」：risk 与 exposure 取负号。
 *
 * 判定：
 *   tradeoff      两边各有高低 → 真权衡，玩家要想
 *   L/R-dominates 一边在每个维度都不差、且至少一维更好 → 理性玩家永远选那边（伪选择）
 *   identical     两边完全一样 → 也是伪选择
 *
 * 注意：含 addst（给状态）、buy/sell/borrow/repay（交易）的卡会左右不全，
 *       默认标为「需人工看」，不计入伪选择率，避免冤枉好卡。
 *
 * 用法：
 *   node tools/check-dominance.js            # 报告
 *   node tools/check-dominance.js --list     # 列出每张伪选择卡的详情
 *   node tools/check-dominance.js --json     # 机器可读
 *
 * 退出码：伪选择率 > 10% 时返回 1（可接入 CI）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const cards = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/cards.json'), 'utf8')).cards;

function vec(eff) {
  if (!eff) eff = {};
  const buy = eff.buy || 0, sell = eff.sell || 0;
  const borrow = eff.borrow || 0, repay = eff.repay || 0;
  return {
    money: (eff.cash || 0) - (eff.spend || 0) + borrow - repay,
    mind: eff.mind || 0,
    risk: -(eff.risk || 0),
    social: eff.social || 0,
    exposure: -(buy - sell + borrow - repay) / 1000,
  };
}

function compare(a, b, keys) {
  let ge = true, le = true, strict = false;
  keys.forEach(function (k) {
    if (a[k] > b[k]) { le = false; strict = true; }
    if (a[k] < b[k]) { ge = false; strict = true; }
  });
  if (!strict) return 'identical';
  if (ge) return 'L-dominates';
  if (le) return 'R-dominates';
  return 'tradeoff';
}

const K = ['money', 'mind', 'risk', 'social', 'exposure'];

/* 一边是否「全赚不赔」：所有非零字段都是正向，没有任何代价 */
function isPureGain(e) {
  if (!e) return false;
  const keys = Object.keys(e).filter(function (k) { return e[k] !== 0; });
  if (!keys.length) return false;
  const gain = keys.some(function (k) { return (k === 'mind' || k === 'social' || k === 'cash') && e[k] > 0; });
  const cost = keys.some(function (k) {
    if (k === 'spend' || k === 'repay' || k === 'borrow') return true;
    if (k === 'risk') return true;
    if (k === 'mind' || k === 'social' || k === 'cash') return e[k] < 0;
    return false;
  });
  return gain && !cost;
}

const rows = cards.map(function (c) {
  const L = (c.left && c.left.effects) || {};
  const R = (c.right && c.right.effects) || {};
  const vL = vec(L), vR = vec(R);
  const traded = ['buy', 'sell', 'borrow', 'repay', 'cash'].some(function (k) {
    return (L[k] !== undefined) || (R[k] !== undefined);
  });
  const stated = !!(L.addst || R.addst || c.alwaysStatus || c.fact);   // fact：既定事实卡，两边本来一样
  const touched = new Set(Object.keys(L).concat(Object.keys(R)));
  return {
    id: c.id, who: c.who, tag: c.tag, text: c.text,
    L: c.left && c.left.label, R: c.right && c.right.label,
    vL: vL, vR: vR,
    verdict: compare(vL, vR, K),
    manual: traded || stated,
    dims: touched.size,
    pureL: isPureGain(L), pureR: isPureGain(R),
  };
});

const auto = rows.filter(function (r) { return !r.manual; });
const fake = auto.filter(function (r) { return r.verdict !== 'tradeoff'; });
const pure = rows.filter(function (r) { return r.pureL || r.pureR; });
const narrow = rows.filter(function (r) { return r.dims <= 2; });
const rate = auto.length ? fake.length / auto.length * 100 : 0;

if (process.argv.indexOf('--json') >= 0) {
  console.log(JSON.stringify({
    total: rows.length, auto: auto.length, fakeChoice: fake.length,
    fakeRatePct: +rate.toFixed(1), pureGainCards: pure.length,
    narrowCards: narrow.length, rows: rows,
  }, null, 1));
  process.exit(rate > 10 ? 1 : 0);
}

console.log('');
console.log('==== 支配选项检测 · ' + rows.length + ' 张卡 ====');
console.log('  可自动判定: ' + auto.length + ' 张   （含状态/交易的 ' + (rows.length - auto.length) + ' 张标注为「需人工看」，不误判）');
console.log('  >>> 伪选择（某一侧全面占优，不用想）: ' + fake.length + ' 张  = ' + rate.toFixed(1) + '%');
console.log('  存在「全赚不赔」选项的卡: ' + pure.length + ' 张  = ' + (pure.length / rows.length * 100).toFixed(1) + '%');
console.log('  只触及 1–2 个数值的卡: ' + narrow.length + ' 张  = ' + (narrow.length / rows.length * 100).toFixed(1) + '%');

console.log('\n---- 按类型看伪选择密度 ----');
const tg = {};
auto.forEach(function (r) {
  tg[r.tag] = tg[r.tag] || { tot: 0, bad: 0 };
  tg[r.tag].tot++;
  if (r.verdict !== 'tradeoff') tg[r.tag].bad++;
});
Object.entries(tg).sort(function (a, b) { return b[1].bad / b[1].tot - a[1].bad / a[1].tot; })
  .forEach(function (e) {
    console.log('  ' + e[0].padEnd(6) + e[1].bad + '/' + e[1].tot + '  (' + (e[1].bad / e[1].tot * 100).toFixed(0) + '%)');
  });

if (process.argv.indexOf('--list') >= 0) {
  console.log('\n---- 伪选择清单 ----');
  const fmt = function (v) { return '钱' + v.money + ' 心态' + v.mind + ' 风险' + (-v.risk) + ' 社会' + v.social; };
  fake.forEach(function (r) {
    console.log('[' + r.id + '] ' + r.who + ' {' + r.tag + '}  ' + r.verdict);
    console.log('    「' + r.text + '」');
    console.log('     左 ' + r.L + '  →  ' + fmt(r.vL));
    console.log('     右 ' + r.R + '  →  ' + fmt(r.vR));
  });
  if (pure.length) {
    console.log('\n---- 有「全赚不赔」选项的卡 ----');
    pure.forEach(function (r) {
      console.log('  [' + r.id + '] ' + r.who + '  ' + (r.pureL ? '左「' + r.L + '」' : '') + (r.pureR ? '右「' + r.R + '」' : ''));
    });
  }
}

console.log('');
console.log(rate > 10 ? '✗ 伪选择率 ' + rate.toFixed(1) + '% 超过 10% 红线' : '✓ 伪选择率 ' + rate.toFixed(1) + '% 在 10% 红线内');
process.exit(rate > 10 ? 1 : 0);
