#!/usr/bin/env node
/**
 * 不碰股票路线模拟：只在卡面上做选择，一单不买卖，看现金能攒到多少。
 *
 * 为什么要单独一个器：tools/simulate.js 是「随机乱滑」，它既随机买也随机卖，
 * 统计的是全局寿命分布；回答不了「我什么都不炒，能不能把钱攒到 4 万」这个问题。
 *
 * 用法：
 *   node tools/sim/nostock.js --runs 2000
 *   node tools/sim/nostock.js --runs 5000 --policy cash
 *
 * 策略（--policy）：
 *   random   两边随便滑（含买卖）—— 现状基线
 *   nostock  能避开 buy/sell 就避开，避不开选金额小的
 *   cash     在 nostock 基础上，优先选现金净增最多的（最贪的攒钱玩法）
 *   survive  在 nostock 基础上，优先保三条线（maximin），钱随便
 */
'use strict';
const { load, installFastWhen, mulberry32, setRNG } = require('./engine');

const args = process.argv.slice(2);
const argVal = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const RUNS = parseInt(argVal('--runs', '2000'), 10);
const SEED = parseInt(argVal('--seed', '20261028'), 10);
const POLICY = argVal('--policy', 'nostock');

const { sandbox, getEl, CARDS } = load();
installFastWhen(sandbox);
const rng = mulberry32(SEED);
setRNG(sandbox, rng);

const touchesStock = e => !!(e && (e.buy || e.sell));
const cashDelta = e => (e && e.cash ? e.cash : 0) - (e && e.spend ? e.spend : 0);

function choose(c, policy) {
  const L = c.L.e || {}, R = c.R.e || {};
  if (policy === 'random') return rng() < 0.5 ? 'L' : 'R';

  const opts = [];
  if (!touchesStock(L)) opts.push('L');
  if (!touchesStock(R)) opts.push('R');
  // 两边都碰股票（比如「全仓」vs「半仓」）：挑金额小的，仍算不主动加仓
  const pool = opts.length ? opts : [((L.buy || 0) + (L.sell || 0)) <= ((R.buy || 0) + (R.sell || 0)) ? 'L' : 'R'];

  if (policy === 'nostock' || pool.length === 1) return pool[rng() < 0.5 ? 0 : pool.length - 1];

  const v = s => (s === 'L' ? L : R);
  if (policy === 'cash') {
    return cashDelta(v(pool[0])) >= cashDelta(v(pool[1])) ? pool[0] : pool[1];
  }
  // survive：选完之后最短板最高的那一支
  const worst = s => {
    const e = v(s);
    return Math.min(
      58 + (e.mind || 0),        // 只比较相对变化：基线常数不影响排序
      56 + (e.social || 0),
      50 + (e.energy || 0),
      100 - (e.risk || 0)
    );
  };
  return worst(pool[0]) >= worst(pool[1]) ? pool[0] : pool[1];
}

/* ---------- 主循环 ---------- */
/* 横截面（每天在场的人的现金）会被存活偏差污染：活到 60 天的本来就是会玩的那批。
   所以另记一份「同批纵向」：只取活过 COHORT 天的局，看这同一批人逐日的现金轨迹。 */
const SNAP = [10, 20, 30, 45, 60, 75, 90, 120, 150];
const COHORT = parseInt(argVal('--cohort', '60'), 10);
const snaps = {};                    // day -> []  全场横截面
SNAP.forEach(d => (snaps[d] = []));
const cohSnaps = {};                 // day -> []  同一批长命局的轨迹
SNAP.forEach(d => (cohSnaps[d] = []));
const tracks = [];                   // 每局逐日 cash 序列
const lifes = [], finalCash = [], finalNet = [], endings = {};
const contrib = {};                  // 卡 id -> {n 抽到次数, sum 净值贡献}
let maxDay = 0, maxCash = 0, maxNet = 0;

for (let g = 0; g < RUNS; g++) {
  sandbox.reset();
  let d = 0;
  const track = [];
  let cardSum = 0;                    // 卡片带来的净值变化（cash − spend；buy/sell/borrow/repay 净值恒为 0）
  for (let turn = 0; turn < 400 && !sandbox.S.over; turn++) {
    const card = sandbox.pick();
    const dir = choose(card, POLICY);
    const sel = dir === 'L' ? card.L.e : card.R.e;
    const dlt = sel ? (sel.cash || 0) - (sel.spend || 0) : 0;
    cardSum += dlt;
    const cc = contrib[card._id] || (contrib[card._id] = { n: 0, sum: 0 });
    cc.n++; cc.sum += dlt;
    sandbox.resolve(card, dir);
    sandbox.tick();
    sandbox.check();
    d = sandbox.S.day - 1;               // 已完成的天数
    const S = sandbox.S;
    const nv = S.cash + S.equity - S.debt;
    track.push({ cash: S.cash, net: nv, debt: S.debt, day: d, cardSum });
    if (snaps[d]) {
      snaps[d].push({ cash: S.cash, net: nv });
    }
    if (d > maxDay) maxDay = d;
    if (S.cash > maxCash) maxCash = S.cash;
    if (nv > maxNet) maxNet = nv;
  }
  if (d >= COHORT) tracks.push(track);
  const S = sandbox.S;
  lifes.push(d);
  finalCash.push(S.cash);
  finalNet.push(S.cash + S.equity - S.debt);
  if (S.over) {
    const key = getEl('o-t')._t || '?';
    endings[key] = (endings[key] || 0) + 1;
  }
}

/* 同批轨迹：对活过 COHORT 天的局，取每个快照日的现金/净值中位 */
tracks.forEach(tr => {
  SNAP.forEach(day => {
    const p = tr[day - 1];
    if (p) cohSnaps[day].push({ cash: p.cash, net: p.net });
  });
});

/* ---------- 统计 ---------- */
const q = (arr, p) => {
  if (!arr.length) return NaN;
  const a = arr.slice().sort((x, y) => x - y);
  return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))];
};
const k = n => (n >= 10000 ? (n / 10000).toFixed(1) + '万' : Math.round(n).toLocaleString('en-US'));

console.log(`\n策略=${POLICY}  局数=${RUNS}  seed=${SEED}`);
console.log(`寿命：中位 ${q(lifes, 0.5)} 天 / p75 ${q(lifes, 0.75)} / p90 ${q(lifes, 0.9)} / 最长 ${maxDay}`);
console.log(`终局现金：中位 ${k(q(finalCash, 0.5))} / p75 ${k(q(finalCash, 0.75))} / p90 ${k(q(finalCash, 0.9))}`);
console.log(`终局净值：中位 ${k(q(finalNet, 0.5))} / p75 ${k(q(finalNet, 0.75))} / p90 ${k(q(finalNet, 0.9))}`);
console.log(`全程最高现金 ${k(maxCash)}，最高净值 ${k(maxNet)}`);

const over40 = finalCash.filter(v => v >= 40000).length / RUNS * 100;
const over50 = finalCash.filter(v => v >= 50000).length / RUNS * 100;
console.log(`终局现金 ≥4万 ${over40.toFixed(1)}%    ≥5万 ${over50.toFixed(1)}%`);

console.log('\n【横截面】天  在场局数  现金中位  现金p90  净值中位  净值p90');
SNAP.forEach(d => {
  const arr = snaps[d];
  if (!arr.length) { console.log(`${String(d).padStart(3)}   0        -`); return; }
  const c = arr.map(x => x.cash), n = arr.map(x => x.net);
  console.log(
    `${String(d).padStart(3)}  ${String(arr.length).padStart(5)}   ${k(q(c, 0.5)).padStart(8)}  ${k(q(c, 0.9)).padStart(8)}  ${k(q(n, 0.5)).padStart(8)}  ${k(q(n, 0.9)).padStart(8)}`
  );
});

console.log(`\n【同批纵向】活过 ${COHORT} 天的 ${tracks.length} 局（${(tracks.length / RUNS * 100).toFixed(1)}%），逐日现金中位`);
console.log('天   现金中位  现金p25  现金p75  净值中位   负债中位');
SNAP.forEach(d => {
  const arr = cohSnaps[d];
  if (!arr.length) return;
  const c = arr.map(x => x.cash), n = arr.map(x => x.net);
  const deb = tracks.map(tr => (tr[d - 1] ? tr[d - 1].debt : 0));
  console.log(
    `${String(d).padStart(3)}  ${k(q(c, 0.5)).padStart(8)} ${k(q(c, 0.25)).padStart(8)} ${k(q(c, 0.75)).padStart(8)} ${k(q(n, 0.5)).padStart(8)}  ${k(q(deb, 0.5)).padStart(8)}`
  );
});

console.log('\n【钱的来源分解】同一批长命局，累计到该日的中位数');
console.log('     卡片净额（花钱/收入）   系统净流入（工资−账单−日常−利息）');
[30, 60, 75].forEach(d => {
  const rows = tracks.map(tr => tr[d - 1]).filter(Boolean);
  if (!rows.length) return;
  const cs = rows.map(r => r.cardSum);
  const sys = rows.map(r => r.net - 20000 - r.cardSum);
  console.log(
    `${String(d).padStart(3)}天  ${k(q(cs, 0.5)).padStart(10)}（区间 ${k(q(cs, 0.1))}~${k(q(cs, 0.9))}）` +
    `   ${k(q(sys, 0.5)).padStart(10)}（区间 ${k(q(sys, 0.1))}~${k(q(sys, 0.9))}）`
  );
});

console.log('\n【最会送钱的 15 张卡】按累计净值贡献排序（每局平均）');
Object.entries(contrib).sort((a, b) => b[1].sum - a[1].sum).slice(0, 15)
  .forEach(([id, v]) => {
    const c = CARDS.find(x => x._id === id);
    console.log(`  ${id.padEnd(20)} 抽到率${(v.n / RUNS * 100).toFixed(0).padStart(3)}% × 均值${k(v.sum / v.n).padStart(7)} = 每局${k(v.sum / RUNS).padStart(7)}  ${c ? c.who + '「' + c.txt.slice(0, 16) + '」' : ''}`);
  });

console.log('\n结局分布：');
Object.entries(endings).sort((a, b) => b[1] - a[1])
  .forEach(([kk, v]) => console.log(`  ${kk.padEnd(14)} ${(v / RUNS * 100).toFixed(1)}%`));
