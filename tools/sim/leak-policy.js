#!/usr/bin/env node
/**
 * 消息卡体检 —— 回答一个问题：
 *   「买消息」到底是一个需要判断的决定，还是无脑点就赚？
 *
 * 做法：同一套 maximin 玩法（先保最短板），只在「带 leak 的卡」上强制方向：
 *   · 原生    —— maximin 自己判断（它看不见 leak 的期望，会按显式数值衡量）
 *   · 全买    —— 只要这张卡有一侧卖消息，就买
 *   · 全不买  —— 只要这张卡有一侧卖消息，就选另一边
 * 三者通关率差不多 = 玩家得自己算仓位和概率，这是好设计；
 * 「全买」明显赢 = 这张卡无脑点就行，参数还得收。
 *
 * 用法：node tools/sim/leak-policy.js --runs 1500
 */
'use strict';
const path = require('path');
const { load, verifyWhenEquivalence, installFastWhen, mulberry32, setRNG } =
  require(path.join(__dirname, 'engine'));

function argVal(n, d) { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; }
const RUNS = parseInt(argVal('--runs', '1500'), 10);
const SEED = parseInt(argVal('--seed', '20261028'), 10);

const { sandbox, getEl, CARDS } = load();
verifyWhenEquivalence(sandbox, CARDS);
installFastWhen(sandbox);

const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const INIT = 20000;

function eff(e) {
  if (!e) e = {};
  const hiddenRisk = e.borrow ? Math.min(16, 5 + e.borrow / 1300) : 0;
  return {
    net: (e.cash || 0) - (e.spend || 0) - (e.repay || 0),
    mind: e.mind || 0, risk: (e.risk || 0) + hiddenRisk,
    social: e.social || 0, energy: e.energy || 0,
  };
}

function maximin(c, S) {
  const L = eff(c.L && c.L.e), R = eff(c.R && c.R.e);
  const score = e => {
    const net = S.cash + S.equity - S.debt + e.net;
    const d = [
      clamp01((S.mind + e.mind) / 100),
      clamp01((100 - (S.risk + e.risk)) / 100),
      clamp01((S.social + e.social) / 100),
      clamp01(net / INIT),
      clamp01((S.energy + e.energy + 8) / 100),
    ];
    return Math.min.apply(null, d) * 10 + d.reduce((a, b) => a + b, 0) * 0.01;
  };
  const a = score(L), b = score(R);
  if (Math.abs(a - b) < 1e-9) return null;
  return a > b ? 'L' : 'R';
}

// 哪一侧卖消息
function leakSide(c) {
  if (c.L && c.L.e && c.L.e.leak) return 'L';
  if (c.R && c.R.e && c.R.e.leak) return 'R';
  return null;
}

// mode: null=原生（maximin 自己判断）/ 'BUY'=有消息那侧 / 'SKIP'=反侧
function play(mode) {
  const rng = mulberry32(SEED);
  setRNG(sandbox, rng);
  let win = 0, days = 0;
  for (let g = 0; g < RUNS; g++) {
    sandbox.reset();
    let t = 0;
    for (; t < 360 && !sandbox.S.over; t++) {
      const c = sandbox.pick();
      const ls = leakSide(c);
      let dir;
      if (ls) dir = mode === null ? null : (mode === 'BUY' ? ls : (ls === 'L' ? 'R' : 'L'));
      if (!dir) dir = maximin(c, sandbox.S) || (rng() < 0.5 ? 'L' : 'R');
      sandbox.resolve(c, dir);
      sandbox.tick();
      sandbox.check();
    }
    days += t;
    if (t >= 60) win++;
  }
  return { win: win / RUNS * 100, days: days / RUNS };
}

console.log(`\n==== 消息卡体检 · 每种 ${RUNS} 局 · seed=${SEED} ====`);
[['原生（自己判断）', null], ['全买（见消息就买）', 'BUY'], ['全不买（见消息就躲）', 'SKIP']].forEach(([nm, mode]) => {
  const r = play(mode);
  console.log(`  ${nm.padEnd(18)} 通关 ${r.win.toFixed(1).padStart(5)}%   平均 ${r.days.toFixed(1).padStart(5)} 天`);
});
console.log('');
