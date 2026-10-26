#!/usr/bin/env node
/**
 * 现金流体检 —— 回答「为什么玩家觉得钱花不完」。
 *
 * 记录每一局每一天：这张卡让现金变了多少（选边）、日结算让现金变了多少（工资/燃烧/利息）。
 * 输出第 20/30/37/45/60 天的现金分位数、以及「30 天窗口内的净现金流」构成。
 *
 * 用法：node tools/diag-cashflow.js --runs 2000
 */
'use strict';
const path = require('path');
const { load, verifyWhenEquivalence, installFastWhen, mulberry32, setRNG } =
  require(path.join(__dirname, 'sim', 'engine'));

function argVal(n, d) { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; }
const RUNS = parseInt(argVal('--runs', '2000'), 10);
const SEED = parseInt(argVal('--seed', '20261026'), 10);

const { sandbox, CARDS } = load();
verifyWhenEquivalence(sandbox, CARDS);
installFastWhen(sandbox);

function vec(eff) {
  if (!eff) eff = {};
  const hiddenRisk = eff.borrow ? Math.min(16, 5 + eff.borrow / 1300) : 0;
  return {
    net: (eff.cash || 0) - (eff.spend || 0) - (eff.repay || 0),
    mind: eff.mind || 0, risk: (eff.risk || 0) + hiddenRisk, social: eff.social || 0, energy: eff.energy || 0,
  };
}
const INIT = 20000;
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
const POLICIES = {
  '随机乱滑': function (c, S, rng) { return rng() < 0.5 ? 'L' : 'R'; },
  '会玩': function (c, S, rng) {
    const L = vec(c.L && c.L.e), R = vec(c.R && c.R.e);
    const net = S.cash + S.equity - S.debt;
    const wm = S.mind < 35 ? 3 : 1, ws = S.social < 30 ? 3 : 1;
    const wr = S.risk > 60 ? 3 : 1, wn = net < INIT * 0.5 ? 2 : 0.5;
    const we = S.energy < 25 ? 3 : 1;
    const u = v => v.net / (INIT * 0.1) * wn + v.mind * wm + v.social * ws - v.risk * wr + v.energy * we;
    const a = u(L), b = u(R);
    if (Math.abs(a - b) < 1e-9) return rng() < 0.5 ? 'L' : 'R';
    return a > b ? 'L' : 'R';
  },
  '会玩·maximin': function (c, S, rng) {
    const L = vec(c.L && c.L.e), R = vec(c.R && c.R.e);
    const score = e => {
      const net = S.cash + S.equity - S.debt + e.net;
      const d = [clamp01((S.mind + e.mind) / 100), clamp01((100 - (S.risk + e.risk)) / 100),
                 clamp01((S.social + e.social) / 100), clamp01(net / INIT),
                 clamp01((S.energy + e.energy + 8) / 100)];
      return Math.min.apply(null, d) * 10 + d.reduce((a, b) => a + b, 0) * 0.01;
    };
    const a = score(L), b = score(R);
    if (Math.abs(a - b) < 1e-9) return rng() < 0.5 ? 'L' : 'R';
    return a > b ? 'L' : 'R';
  },
};

const MARKS = [10, 20, 30, 37, 45, 60, 90];
function q(arr, p) { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; }

for (const name of Object.keys(POLICIES)) {
  const pick = POLICIES[name];
  const cashAt = {}; MARKS.forEach(m => cashAt[m] = []);
  const netAt = {}; MARKS.forEach(m => netAt[m] = []);
  let cardCash = 0, tickCash = 0, days = 0, alive37 = 0, over37 = 0;
  const monthNet = [];   // 每局：第 31–60 天的净现金流

  for (let g = 0; g < RUNS; g++) {
    const rng = mulberry32(SEED + g * 7919);
    setRNG(sandbox, rng);
    sandbox.reset();
    let cash30 = null;
    for (let t = 0; t < 360 && !sandbox.S.over; t++) {
      const c = sandbox.pick();
      const before = sandbox.S.cash, day0 = sandbox.S.day;
      sandbox.resolve(c, pick(c, sandbox.S, rng));
      const mid = sandbox.S.cash;
      sandbox.tick();
      const after = sandbox.S.cash;
      cardCash += mid - before; tickCash += after - mid;
      days++;
      const d = sandbox.S.day - 1;   // tick 后 day 已 +1，这里取刚结算完的那天
      if (MARKS.indexOf(d) >= 0) { cashAt[d].push(after); netAt[d].push(sandbox.S.cash + sandbox.S.equity - sandbox.S.debt); }
      if (d === 31) cash30 = sandbox.S.cash;
      if (d === 61 && cash30 !== null) monthNet.push(sandbox.S.cash - cash30);
      sandbox.check();
      if (sandbox.S.over) { if (day0 <= 37) over37++; break; }
    }
    if (sandbox.S.day > 37) alive37++;
  }
  console.log('\n==== ' + name + ' · ' + RUNS + ' 局 ====');
  console.log('  平均每天现金变化：卡片 ' + (cardCash / days).toFixed(0) + ' + 日结算 ' + (tickCash / days).toFixed(0) +
    ' = ' + ((cardCash + tickCash) / days).toFixed(0) + '/天');
  console.log('  活过 37 天的局：' + (alive37 / RUNS * 100).toFixed(1) + '%');
  MARKS.forEach(m => {
    if (!cashAt[m].length) return;
    console.log('   第 ' + String(m).padStart(2) + ' 天  n=' + String(cashAt[m].length).padStart(4) +
      '  现金 p25/p50/p75 = ' + q(cashAt[m], .25).toFixed(0) + ' / ' + q(cashAt[m], .5).toFixed(0) + ' / ' + q(cashAt[m], .75).toFixed(0) +
      '　净值 p50 = ' + q(netAt[m], .5).toFixed(0));
  });
  if (monthNet.length) {
    console.log('   第 31→61 天现金净变化（一个月）：p25/p50/p75 = ' +
      q(monthNet, .25).toFixed(0) + ' / ' + q(monthNet, .5).toFixed(0) + ' / ' + q(monthNet, .75).toFixed(0) +
      '　（活到 61 天的 ' + monthNet.length + ' 局）');
  }
}
