#!/usr/bin/env node
/**
 * 无头仿真器 —— 让程序自己玩 N 局，回答四个手工答不了的问题：
 *   ① 13 个结局的真实分布（有没有结局从来没人触发过）
 *   ② 单局重复率（同一张卡一局平均被看到几次）
 *   ③ 每张卡的出现率（有没有"写了等于没写"的卡）
 *   ④ 平均寿命 / 存活天数分布
 *
 * 用法：
 *   node tools/simulate.js --runs 1000          # 冒烟（约 1 秒）
 *   node tools/simulate.js --runs 10000         # 日常档（约 11 秒）
 *   node tools/simulate.js --runs 100000 --out data/sim/baseline-100k.json   # 基线（约 2 分钟）
 *
 * 保真：引擎直接运行 prototype.html 的真实脚本（见 sim/engine.js），
 *      开跑前先做 when 快版过滤器与原版 whenOK 的等价对拍，不一致直接拒绝运行。
 *      随机性全部来自同一个种子流（行情 + 选卡 + 玩家选择），
 *      同 --seed 结果完全可复现（整轮复现，不逐局）。
 *
 * 性能实测（本机）：曾试过把主循环整体搬进 vm 沙箱执行，反而慢一倍
 *   （本环境的 vm 上下文执行开销高于普通 JS），故主循环留在 Node 侧，
 *   只有 resolve/tick/check 三个真实函数跨越沙箱边界。10 万局约 2 分钟。
 *
 * 档位建议：冒烟 1k · 日常 1 万 · 基线 10 万（调参对比/里程碑才跑）
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { load, verifyWhenEquivalence, installFastWhen, mulberry32, setRNG } = require('./sim/engine');

const args = process.argv.slice(2);
function argVal(name, dft) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : dft;
}
const RUNS = parseInt(argVal('--runs', '10000'), 10);
const SEED = parseInt(argVal('--seed', '20261020'), 10);
const OUT = argVal('--out', null);
if (!RUNS || RUNS < 1) { console.error('--runs 必须是正整数'); process.exit(1); }

const { sandbox, getEl, CARDS } = load();

/* 开跑前置：when 快版过滤器 vs 原版 whenOK 等价对拍，不一致即拒绝跑 */
const pairs = verifyWhenEquivalence(sandbox, CARDS);
console.log(`✓ when 过滤器对拍：${pairs} 组 状态×卡 全部一致（快版 = 原版 whenOK）`);

/* 对拍通过后，把 whenOK 换成编译缓存版，让原型自己的 pick() 跑得动。
   抽卡算法（洗牌袋 / 冷却 / 同类摊开）从此只存在于 prototype.html 一份，
   这里不再抄第二遍 —— 抄一遍就等于埋一个必然漂移的分叉。 */
installFastWhen(sandbox);

/* 同一个种子流贯穿整轮：行情（沙箱内 Math.random）与选卡/选择（Node 侧）交替消耗，
   顺序固定，因此同 seed 整轮可复现 */
const rng = mulberry32(SEED);
setRNG(sandbox, rng);

/* ---------- 主循环（Node 侧） ---------- */
const t0 = Date.now();
const days = [], uniquePerGame = [], fullUnique = [];
const endings = {}, picks = {}, plays = {};
let poolResets = 0, overBefore = 0;

for (let g = 0; g < RUNS; g++) {
  sandbox.reset();                          // 真实 reset（render 已置空、nextCard 已摘除）
  let played = 0, uniqN = 0;
  const uniq = {};

  for (let turn = 0; turn < 60 && !sandbox.S.over; turn++) {
    // 真实抽卡：抽三张（后两张是垫层，不计数）、只打第一张
    const first = sandbox.pick();
    sandbox.pickPeek(1, first);      // 垫层只预览不消耗
    sandbox.pickPeek(2, first);
    picks[first._id] = (picks[first._id] || 0) + 1;

    const dir = rng() < 0.5 ? 'L' : 'R';    // 玩家随机乱滑（与原型图例 600 局口径一致）
    const id = first._id;
    plays[id] = (plays[id] || 0) + 1;
    if (!uniq[id]) { uniq[id] = 1; uniqN++; }
    played++;

    sandbox.resolve(first, dir);            // 真实出牌
    sandbox.tick();                         // 真实日结算（day++ 在这里）
    sandbox.check();                        // 真实结局判定（写结局 DOM，桩会记录）
  }
  if ((sandbox._pickResets | 0) > 0) poolResets++;

  days.push(played);
  uniquePerGame.push(uniqN);
  if (played === 60) fullUnique.push(uniqN); // 活满 60 天的局单独记：N2 重复率目标约束的就是这批
  if (played < 60) overBefore++;

  if (sandbox.S.over) {
    // 结局名从桩元素读回 —— 写它的正是原型自己的 check()
    const t = getEl('o-t')._t;
    const sub = (getEl('o-s')._t.split('·')[1] || '').trim();
    const key = t + '|' + sub;
    const e = endings[key] || (endings[key] = { count: 0, daysSum: 0 });
    e.count++; e.daysSum += played;
  }
}
const elapsed = (Date.now() - t0) / 1000;

/* ---------- 汇总 ---------- */
const daysSorted = days.slice().sort((a, b) => a - b);
const quant = p => daysSorted[Math.min(daysSorted.length - 1, Math.floor(daysSorted.length * p))];
const totalDays = days.reduce((a, b) => a + b, 0);
const repeatRate = 1 - (uniquePerGame.reduce((a, b) => a + b, 0) / (totalDays || 1));
const fullGames = fullUnique.length;
const fullRepeatRate = fullGames ? 1 - (fullUnique.reduce((a, b) => a + b, 0) / (fullGames * 60)) : null;
const totalPicks = Object.values(picks).reduce((a, b) => a + b, 0);

const endingList = Object.entries(endings)
  .map(([k, v]) => ({ ending: k, count: v.count, pct: +(v.count / RUNS * 100).toFixed(3), avgDay: +(v.daysSum / v.count).toFixed(1) }))
  .sort((a, b) => b.count - a.count);

const cardStats = CARDS.map(c => ({
  id: c._id, when: c.when || null,
  picks: picks[c._id] || 0,
  plays: plays[c._id] || 0,
  pickPct: +(((picks[c._id] || 0) / (totalPicks || 1)) * 100).toFixed(3),
  playsPerGame: +(((plays[c._id] || 0) / RUNS)).toFixed(2),
})).sort((a, b) => b.plays - a.plays);

const report = {
  meta: {
    runs: RUNS, seed: SEED,
    date: new Date().toISOString().replace('T', ' ').slice(0, 16),
    elapsedSec: +elapsed.toFixed(1),
    engine: 'prototype.html 真实脚本（vm 无头）+ when 快版过滤器（对拍 ' + pairs + ' 组一致）',
    playerModel: '随机乱滑（50/50），与原型图例 600 局口径一致',
  },
  summary: {
    avgDays: +(totalDays / RUNS).toFixed(1),
    p50Days: quant(0.5), p90Days: quant(0.9),
    earlyEndPct: +(overBefore / RUNS * 100).toFixed(2),
    repeatRatePct: +(repeatRate * 100).toFixed(1),
    repeatRateFullPct: fullRepeatRate === null ? null : +(fullRepeatRate * 100).toFixed(1),
    fullGames,
    avgUniquePerGame: +(uniquePerGame.reduce((a, b) => a + b, 0) / RUNS).toFixed(1),
    poolResetsPct: +(poolResets / RUNS * 100).toFixed(1),
  },
  endings: endingList, cards: cardStats,
  neverPlayed: cardStats.filter(c => c.plays === 0).map(c => c.id),
};

/* ---------- 输出 ---------- */
const s = report.summary;
console.log('');
console.log(`==== ${RUNS.toLocaleString()} 局 · seed=${SEED} · 耗时 ${elapsed.toFixed(1)}s ====`);
console.log(`平均寿命 ${s.avgDays} 张卡 · p50=${s.p50Days} · p90=${s.p90Days} · 提前结局率 ${s.earlyEndPct}%`);
console.log(`单局重复率 ${s.repeatRatePct}%（一局平均 ${s.avgUniquePerGame} 张不同的卡）` +
  (s.repeatRateFullPct !== null ? `；活满 60 天的局：${s.repeatRateFullPct}%（${fullGames} 局）` : ''));
console.log(`池被抽空重置的局占比 ${s.poolResetsPct}%`);
console.log('---- 结局分布 ----');
endingList.forEach(e => console.log(`  ${String(e.pct).padStart(6)}%  ${String(e.count).padStart(7)} 局 · 均寿 ${e.avgDay} · ${e.ending}`));
console.log('---- 卡覆盖 ----');
console.log(`  从未被打出过的卡：${report.neverPlayed.length ? report.neverPlayed.join(', ') : '无'}`);
console.log(`  出场最少的 5 张：${cardStats.slice(-5).map(c => `${c.id}(${c.playsPerGame}/局)`).join(' · ')}`);

if (OUT) {
  fs.mkdirSync(path.dirname(path.resolve(OUT)), { recursive: true });
  fs.writeFileSync(path.resolve(OUT), JSON.stringify(report, null, 2), 'utf8');
  console.log('✓ 报告已写入 ' + path.resolve(OUT));
}
