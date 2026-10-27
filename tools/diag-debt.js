#!/usr/bin/env node
/**
 * 老赖体检 —— 回答「这套还款节点到底会不会咬到人、咬得太狠还是太松」。
 *
 * 每个策略跑 N 局，记录：
 *   1. 成过老赖的比例（局内只要出现过 laolai 就算）
 *   2. 违约次数峰值分布（arrears 的最大值）
 *   3. 老赖专属卡（催收电话 / 限高）的出现率
 *   4. 老赖状态一共挂了几天（衡量惩罚时长）
 *   5. 寿命 p50/p90
 *
 * 用法：node tools/diag-debt.js --runs 1500
 */
'use strict';
const path = require('path');
const { load, verifyWhenEquivalence, installFastWhen, mulberry32, setRNG } =
  require(path.join(__dirname, 'sim', 'engine'));

function argVal(n, d) { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; }
const RUNS = parseInt(argVal('--runs', '1500'), 10);
const SEED = parseInt(argVal('--seed', '20261027'), 10);

const { sandbox, CARDS } = load();
verifyWhenEquivalence(sandbox, CARDS);
installFastWhen(sandbox);

const INIT = 20000;
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
function vec(eff) {
  if (!eff) eff = {};
  const hiddenRisk = eff.borrow ? Math.min(16, 5 + eff.borrow / 1300) : 0;
  return {
    net: (eff.cash || 0) - (eff.spend || 0) - (eff.repay || 0) - (eff.borrow || 0) * 0,
    mind: eff.mind || 0, risk: (eff.risk || 0) + hiddenRisk, social: eff.social || 0,
    energy: eff.energy || 0, borrow: eff.borrow || 0,
  };
}

const POLICIES = {
  '随机乱滑': (c, S, rng) => (rng() < 0.5 ? 'L' : 'R'),
  '会玩·maximin': (c, S, rng) => {
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
  '会玩·爱借钱（激进加仓）': (c, S, rng) => {
    // 故意偏爱「借了钱就买」的选项：这是最容易滚到老赖的玩法
    const L = vec(c.L && c.L.e), R = vec(c.R && c.R.e);
    const u = v => v.net / (INIT * 0.1) + v.borrow / (INIT * 0.02) + v.mind * 0.4 + v.social * 0.3
                   - v.risk * 0.8 + v.energy * 0.5;
    const a = u(L), b = u(R);
    if (Math.abs(a - b) < 1e-9) return rng() < 0.5 ? 'L' : 'R';
    return a > b ? 'L' : 'R';
  },
  '只花钱不还钱（从不看债）': (c, S, rng) => {
    // 对照组：只图爽，从不考虑负债
    const L = vec(c.L && c.L.e), R = vec(c.R && c.R.e);
    const u = v => v.mind + v.social - v.risk * 0.2 + (v.net > 0 ? 2 : 0);
    const a = u(L), b = u(R);
    if (Math.abs(a - b) < 1e-9) return rng() < 0.5 ? 'L' : 'R';
    return a > b ? 'L' : 'R';
  },
};

const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

for (const name of Object.keys(POLICIES)) {
  const policy = POLICIES[name];
  let became = 0, peakArrears = [], lives = [], laolaiDays = [], cardHit = 0, debtAtLaolai = [];
  for (let g = 0; g < RUNS; g++) {
    const rng = mulberry32(SEED + g * 7919);
    setRNG(sandbox, rng);
    sandbox.reset();
    let was = false, days = 0, peak = 0, debtThen = 0;
    for (let t = 0; t < 360 && !sandbox.S.over; t++) {
      const c = sandbox.pick();
      sandbox.resolve(c, policy(c, sandbox.S, rng));
      sandbox.tick();
      sandbox.check();
      peak = Math.max(peak, sandbox.S.arrears || 0);
      if (sandbox.S.st.laolai) {
        days++;
        if (!was) { was = true; debtThen = sandbox.S.debt; }
      }
      if (sandbox.S.over) break;
    }
    if (was) { became++; debtAtLaolai.push(debtThen); }
    if (sandbox.S.seen.debt_calls_01 || sandbox.S.seen.debt_limit_01) cardHit++;
    peakArrears.push(peak);
    laolaiDays.push(days);
    lives.push(sandbox.S.day);
  }
  console.log('\n==== ' + name + ' · ' + RUNS + ' 局 ====');
  console.log('  寿命 p50/p90 = ' + q(lives, .5) + ' / ' + q(lives, .9));
  console.log('  成过老赖 ' + (became / RUNS * 100).toFixed(1) + '%' +
    (became ? '（上名单时欠款 p50 = ¥' + q(debtAtLaolai, .5).toLocaleString('en-US') + '）' : ''));
  console.log('  违约次数峰值 p50/p90/max = ' + q(peakArrears, .5) + ' / ' + q(peakArrears, .9) + ' / ' + Math.max.apply(null, peakArrears));
  console.log('  老赖状态挂了几天 p50/p90 = ' + q(laolaiDays, .5) + ' / ' + q(laolaiDays, .9));
  console.log('  老赖专属卡（催收/限高）至少出一张 ' + (cardHit / RUNS * 100).toFixed(1) + '%');
}
