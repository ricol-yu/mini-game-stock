#!/usr/bin/env node
/**
 * 抽卡体验体检 —— 回答「为什么玩家觉得一直在看同一张卡」。
 *
 * 三种问题要分开量，混在一起会误判：
 *   ① 同一张卡重复（刚打完又来）—— 算法问题
 *   ② 同一类卡扎堆（连来三张家庭/借贷）—— 算法 + 卡池结构
 *   ③ 同一主题占比过高（借钱卡有 6 张，难怪老遇到）—— 内容问题
 *
 * 用法：
 *   node tools/check-repeat.js                 # 默认 2000 局
 *   node tools/check-repeat.js --runs 5000
 *   node tools/check-repeat.js --compare       # 同时跑「旧算法 iid」对照
 *
 * 保真：抽卡走 prototype.html 的真实 pick()，与玩家玩到的是同一份；
 *       --compare 里的 iid 是按住同一份卡池/条件手写的旧算法，只作对照基线。
 */
'use strict';
const path = require('path');
const { load, verifyWhenEquivalence, installFastWhen, mulberry32, setRNG } =
  require(path.join(__dirname, 'sim', 'engine'));

function argVal(n, d) { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; }
const RUNS = parseInt(argVal('--runs', '2000'), 10);
const SEED = parseInt(argVal('--seed', '20261021'), 10);
const COMPARE = process.argv.indexOf('--compare') >= 0;

const { sandbox, CARDS } = load();
verifyWhenEquivalence(sandbox, CARDS);

const N = CARDS.length;
const pick = () => sandbox.pick();

/* ---------- 旧算法（iid）：只用于 --compare 的对照 ---------- */
const rawWhenOK = sandbox.whenOK;
function iidPick() {
  const pool = CARDS.filter(c => (c._used | 0) < 2 && rawWhenOK(c.when));
  let p = pool;
  if (!p.length) { CARDS.forEach(c => (c._used = 0)); p = CARDS.filter(c => rawWhenOK(c.when)); }
  const c = p[(Math.random() * p.length) | 0];
  c._used = (c._used | 0) + 1;
  return c;
}

/* 借贷卡：含 borrow / repay 任一项 */
const LOAN = new Set(CARDS.map((c, i) => i).filter(i => {
  const L = CARDS[i].L.e || {}, R = CARDS[i].R.e || {};
  return ['borrow', 'repay'].some(k => L[k] !== undefined || R[k] !== undefined);
}));
const INCOME = new Set(CARDS.map((c, i) => i).filter(i => CARDS[i].tag === '收入'));

function tagsOf() { return [...new Set(CARDS.map(c => c.tag))]; }

function run(pickFn, mode) {
  if (mode === 'bag') installFastWhen(sandbox); else sandbox.whenOK = rawWhenOK;
  const isBag = mode === 'bag';
  const rng = mulberry32(SEED);
  setRNG(sandbox, rng);

  const m = {
    draws: 0, games: 0,
    cardAdj: 0, card5: 0, card10: 0, whoAdj: 0, tagAdj: 0,
    tripleDup: 0, tripleSameTag: 0, tripleSameWho: 0,
    loanN: 0, loanAdj: 0, loan5: 0, loanStreak: 0, loanStreakMax: 0,
    incN: 0, incAdj: 0, inc5: 0,
    maxPerGame: 0, repeatGames: 0,
    tagCount: {}, tagLast: {}, tagGap: {},
  };
  const TAGS = tagsOf();

  for (let g = 0; g < RUNS; g++) {
    sandbox.reset();
    m.games++;
    const seq = [], perCard = {};
    let prev = null, prevWho = null, prevTag = null, streak = 0;
    const loanDays = [], incDays = [];

    for (let t = 0; t < 60 && !sandbox.S.over; t++) {
      const c = pickFn();
      // 三张牌：袋子模式读真实预览；iid 模式按旧行为再抽两张（出牌即计数）
      const peek1 = isBag ? sandbox.pickPeek(1, c) : iidPick();
      const peek2 = isBag ? sandbox.pickPeek(2, c) : iidPick();

      m.draws++;
      seq.push(c);
      perCard[c._id] = (perCard[c._id] || 0) + 1;

      if (c === peek1 || c === peek2 || peek1 === peek2) m.tripleDup++;
      if (peek1 && peek2) {
        if (c.tag === peek1.tag && c.tag === peek2.tag) m.tripleSameTag++;
        if (c.who === peek1.who && c.who === peek2.who) m.tripleSameWho++;
      }

      if (prev) {
        if (c === prev) m.cardAdj++;
        if (c.who === prevWho) m.whoAdj++;
        if (c.tag === prevTag) m.tagAdj++;
        if (seq.length > 5 && seq.slice(-6, -1).indexOf(c) >= 0) m.card5++;
        if (seq.length > 10 && seq.slice(-11, -1).indexOf(c) >= 0) m.card10++;
      }

      const ci = CARDS.indexOf(c);
      if (LOAN.has(ci)) {
        m.loanN++;
        if (loanDays.length && loanDays[loanDays.length - 1] === t - 1) m.loanAdj++;
        if (loanDays.some(d => t - d <= 5)) m.loan5++;
        loanDays.push(t);
        streak++;
        if (streak > m.loanStreakMax) m.loanStreakMax = streak;
      } else streak = 0;
      if (INCOME.has(ci)) {
        m.incN++;
        if (incDays.length && incDays[incDays.length - 1] === t - 1) m.incAdj++;
        if (incDays.some(d => t - d <= 5)) m.inc5++;
        incDays.push(t);
      }

      m.tagCount[c.tag] = (m.tagCount[c.tag] || 0) + 1;
      if (m.tagLast[c.tag] !== undefined) {
        const gap = t - m.tagLast[c.tag];
        const b = gap <= 2 ? '1-2' : gap <= 4 ? '3-4' : gap <= 8 ? '5-8' : '9+';
        m.tagGap[c.tag] = m.tagGap[c.tag] || {};
        m.tagGap[c.tag][b] = (m.tagGap[c.tag][b] || 0) + 1;
      }
      m.tagLast[c.tag] = t;

      prev = c; prevWho = c.who; prevTag = c.tag;
      sandbox.resolve(c, 'L');
      sandbox.tick();
      sandbox.check();
    }

    const mx = Math.max.apply(null, Object.values(perCard).concat([0]));
    if (mx > m.maxPerGame) m.maxPerGame = mx;
    if (Object.keys(perCard).length < seq.length) m.repeatGames++;
  }
  m.TAGS = TAGS;
  return m;
}

function report(name, m) {
  const p = x => (x / m.draws * 100).toFixed(2) + '%';
  const pl = x => (x / Math.max(m.loanN, 1) * 100).toFixed(1) + '%';
  const pi = x => (x / Math.max(m.incN, 1) * 100).toFixed(1) + '%';
  console.log('\n==== ' + name + '（' + m.games + ' 局 / ' + m.draws + ' 次抽卡）====');
  console.log('  同一张卡连着来        ' + p(m.cardAdj).padStart(7));
  console.log('  同一张卡 5 步内再来   ' + p(m.card5).padStart(7));
  console.log('  同一张卡 10 步内再来  ' + p(m.card10).padStart(7));
  console.log('  同一角色连着来        ' + p(m.whoAdj).padStart(7));
  console.log('  同一类卡连着来        ' + p(m.tagAdj).padStart(7));
  console.log('  一局内出现重复卡      ' + (m.repeatGames / m.games * 100).toFixed(1) + '% 的局');
  console.log('  单张卡一局最多出现    ' + m.maxPerGame + ' 次');
  console.log('  三张牌里有重复        ' + p(m.tripleDup).padStart(7));
  console.log('  三张牌全同类          ' + p(m.tripleSameTag).padStart(7));
  console.log('  --- 借贷卡（' + m.loanN + ' 次，每局 ' + (m.loanN / m.games).toFixed(2) + '）---');
  console.log('    紧接上一张借贷卡    ' + pl(m.loanAdj).padStart(7));
  console.log('    5 步内又来借贷卡    ' + pl(m.loan5).padStart(7));
  console.log('    最长连续借贷        ' + m.loanStreakMax + ' 张');
  console.log('  --- 收入卡（' + m.incN + ' 次，每局 ' + (m.incN / m.games).toFixed(2) + '）---');
  console.log('    紧接上一张收入卡    ' + pi(m.incAdj).padStart(7));
  console.log('    5 步内又来收入卡    ' + pi(m.inc5).padStart(7));
  console.log('  --- 各类卡的上场占比（应贴近卡池占比，差太多说明分层偏心）---');
  const poolTag = {};
  CARDS.forEach(c => (poolTag[c.tag] = (poolTag[c.tag] || 0) + 1));
  m.TAGS.forEach(t => {
    const got = (m.tagCount[t] || 0) / m.draws * 100;
    const want = poolTag[t] / N * 100;
    const dev = got - want;
    console.log('    ' + t.padEnd(4) + ' 卡池 ' + want.toFixed(1).padStart(4) + '%  上场 ' + got.toFixed(1).padStart(4) + '%   ' +
      (Math.abs(dev) < 0.8 ? 'ok' : (dev > 0 ? '偏多 +' : '偏少 ') + dev.toFixed(1)));
  });
  console.log('  --- 同类卡「两次之间的间隔」分布 ---');
  m.TAGS.forEach(t => {
    const g = m.tagGap[t]; if (!g) return;
    const tot = Object.values(g).reduce((a, b) => a + b, 0);
    const s = ['1-2', '3-4', '5-8', '9+'].map(k => k + ':' + ((g[k] || 0) / tot * 100).toFixed(0) + '%').join(' ');
    console.log('    ' + t.padEnd(4) + ' ' + s);
  });
}

const after = run(pick, 'bag');
report('新算法 · 洗牌袋 + 同类摊开 + 冷却', after);

if (COMPARE) {
  const before = run(iidPick, 'iid');
  report('旧算法 · 独立等概率（iid）', before);
  console.log('\n==== 变化（负 = 变少 = 变好）====');
  const d = (label, a, b) => {
    const x = a / before.draws * 100, y = b / after.draws * 100;
    const chg = x === 0 ? '=' : (y < x ? '↓' : y > x ? '↑' : '=') + ' ' + Math.abs((y - x) / x * 100).toFixed(0) + '%';
    console.log('  ' + label.padEnd(22) + x.toFixed(2) + '% → ' + y.toFixed(2) + '%   ' + chg);
  };
  d('同一张卡连着来', before.cardAdj, after.cardAdj);
  d('同一张卡 5 步内', before.card5, after.card5);
  d('同一类卡连着来', before.tagAdj, after.tagAdj);
  d('同一角色连着来', before.whoAdj, after.whoAdj);
  d('三张牌里有重复', before.tripleDup, after.tripleDup);
  console.log('  ' + '一局内有重复卡'.padEnd(20) + (before.repeatGames / before.games * 100).toFixed(1) + '% → ' + (after.repeatGames / after.games * 100).toFixed(1) + '%');
  console.log('  ' + '单张卡一局最多'.padEnd(20) + before.maxPerGame + ' 次 → ' + after.maxPerGame + ' 次');
}
