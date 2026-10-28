#!/usr/bin/env node
/**
 * 借贷续命链路体检（2026-10-28）。
 * 回答三个问题：
 *   1. 净值归零之后，玩家是不是还活着（而不是当场结算）？
 *   2. 靠借撑了多少天？
 *   3. 有多少人真的滑到了"还不上→老赖"？
 *
 * 不写进 nostock.js：那个器回答的是"钱能攒多少"，这个是"死法链路"。
 */
'use strict';
const { load, installFastWhen, mulberry32, setRNG } = require('./engine');
const RUNS = parseInt(process.argv[2] || '1500', 10);
const { sandbox, getEl } = load();
installFastWhen(sandbox);
const rng = mulberry32(20261028);
setRNG(sandbox, rng);

let zero = 0, survivedAfterZero = [], laolaiEver = 0, laolaiDay = [];
const debtEnd = [], debtMax = [];
const credit = () => sandbox.creditLimit();

for (let g = 0; g < RUNS; g++) {
  sandbox.reset();
  let firstZero = -1, sawLaolai = false, dmax = 0;
  for (let t = 0; t < 400 && !sandbox.S.over; t++) {
    const card = sandbox.pick();
    sandbox.resolve(card, rng() < 0.5 ? 'L' : 'R');
    sandbox.tick();
    sandbox.check();
    const S = sandbox.S;
    if (firstZero < 0 && S.cash + S.equity - S.debt <= 0) firstZero = S.day;
    if (!sawLaolai && S.st.laolai) { sawLaolai = true; laolaiDay.push(S.day); }
    if (S.debt > dmax) dmax = S.debt;
  }
  const d = sandbox.S.day - 1;
  debtEnd.push(sandbox.S.debt);
  debtMax.push(dmax);
  if (sawLaolai) laolaiEver++;
  if (firstZero > 0) { zero++; survivedAfterZero.push(d - firstZero); }
}

const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))] || 0; };
const k = n => (n >= 10000 ? (n / 10000).toFixed(1) + '万' : Math.round(n).toLocaleString('en-US'));
const pct = n => (n / RUNS * 100).toFixed(1) + '%';

console.log(`\n局数 ${RUNS} · 终局信用额度 ${k(credit())}`);
console.log(`净值曾经 ≤0 的局：${pct(zero)}（${zero} 局）`);
console.log(`其中「归零之后还活了几天」：中位 ${q(survivedAfterZero, 0.5)} 天 · p75 ${q(survivedAfterZero, 0.75)} · 最长 ${Math.max(0, ...survivedAfterZero)} 天`);
console.log(`归零后当天就结束（续命 0 天）：${survivedAfterZero.filter(v => v <= 0).length} 局`);
console.log(`终局负债：中位 ${k(q(debtEnd, 0.5))} · p90 ${k(q(debtEnd, 0.9))} · 最高 ${k(Math.max(...debtEnd))}`);
console.log(`全程负债峰值：中位 ${k(q(debtMax, 0.5))} · p90 ${k(q(debtMax, 0.9))}`);
console.log(`出现过老赖的局：${pct(laolaiEver)}（首次上名单中位第 ${q(laolaiDay, 0.5)} 天）`);
