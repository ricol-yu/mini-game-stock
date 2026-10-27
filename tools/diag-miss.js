#!/usr/bin/env node
/**
 * 欠账清算体检 —— 回答「这套计数到底会不会误伤」。
 *
 * 每个策略跑 N 局，记录：
 *   1. 四条线的欠账计数在局终/死亡时的分布（p50 / p90 / max）
 *   2. 四张清算卡各自的触发率
 *   3. 结婚率（口径必须用「婚礼之后还活着」，不能用 did:，见 AGENTS.md）
 *   4. 寿命 p50 / p90
 *
 * 用法：node tools/diag-miss.js --runs 2000
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
const clamp01 = x => (x < 0 ? 0 : x > 1 ? 1 : x);
const POLICIES = {
  '随机乱滑': (c, S, rng) => (rng() < 0.5 ? 'L' : 'R'),
  '会玩': (c, S, rng) => {
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
  '会玩·maximin（先保住最短板）': (c, S, rng) => {
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
  '老好人（只看心态+社会）': (c, S, rng) => {
    // 对照组：只在乎人和心情的人，理应几乎不触发欠账清算
    const L = vec(c.L && c.L.e), R = vec(c.R && c.R.e);
    const u = v => v.mind + v.social * 1.2;
    const a = u(L), b = u(R);
    if (Math.abs(a - b) < 1e-9) return rng() < 0.5 ? 'L' : 'R';
    return a > b ? 'L' : 'R';
  },
  '会玩·只盯盘（不管人）': (c, S, rng) => {
    // 故意只算钱和风险：用来验证「一直不管人」真的会被清算
    const L = vec(c.L && c.L.e), R = vec(c.R && c.R.e);
    const u = v => v.net / (INIT * 0.1) - v.risk * 2.2 + v.energy * 0.6;
    const a = u(L), b = u(R);
    if (Math.abs(a - b) < 1e-9) return rng() < 0.5 ? 'L' : 'R';
    return a > b ? 'L' : 'R';
  },
};

const FACT = ['fam_momgone_01', 'fam_childgone_01', 'pet_gone_01', 'fam_gone_01'];
const LINES = ['fam', 'child', 'pet', 'lover'];
const q = (arr, p) => { const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(s.length * p))]; };

for (const name of Object.keys(POLICIES)) {
  const policy = POLICIES[name];
  const miss = {}; LINES.forEach(l => miss[l] = []);
  const fired = {}; FACT.forEach(f => fired[f] = 0);
  const lives = [];
  let marriedAlive = 0, hadWedding = 0;

  for (let g = 0; g < RUNS; g++) {
    const rng = mulberry32(SEED + g * 7919);
    setRNG(sandbox, rng);
    sandbox.reset();
    let weddingDay = -1;
    for (let t = 0; t < 360 && !sandbox.S.over; t++) {
      const c = sandbox.pick();
      sandbox.resolve(c, policy(c, sandbox.S, rng));
      sandbox.tick();
      if (weddingDay < 0 && sandbox.S.did.fam_hunli_01) weddingDay = sandbox.S.day;
      sandbox.check();
      if (sandbox.S.over) break;
    }
    // 统计口径：婚礼之后还活着才算结婚（当场穿仓的不算）
    if (weddingDay > 0) { hadWedding++; if (sandbox.S.day > weddingDay && !sandbox.S.over) marriedAlive++; }
    LINES.forEach(l => miss[l].push(sandbox.S.miss[l] || 0));
    FACT.forEach(f => { if (sandbox.S.seen[f]) fired[f]++; });
    lives.push(sandbox.S.day);
  }

  console.log('\n==== ' + name + ' · ' + RUNS + ' 局 ====');
  console.log('  寿命 p50/p90 = ' + q(lives, .5) + ' / ' + q(lives, .9));
  console.log('  结婚（婚礼后仍活着）' + (marriedAlive / RUNS * 100).toFixed(1) + '%；办过婚礼 ' + (hadWedding / RUNS * 100).toFixed(1) + '%');
  LINES.forEach(l => {
    console.log('  欠账 ' + l.padEnd(5) + ' p50/p90/max = ' +
      q(miss[l], .5) + ' / ' + q(miss[l], .9) + ' / ' + Math.max.apply(null, miss[l]));
  });
  console.log('  清算卡触发率：' + FACT.map(f => f.replace(/_01$/, '') + ' ' + (fired[f] / RUNS * 100).toFixed(1) + '%').join(' · '));
}
