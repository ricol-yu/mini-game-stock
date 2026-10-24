#!/usr/bin/env node
/**
 * 策略体检 —— 回答「决策到底值不值钱」。
 * 单卡有没有权衡，check-dominance.js 管；这张卡池整体的策略空间是不是平的，归它管。
 *
 * 两种模式：
 *   policy  几种代表性玩法打对照，看「认真玩」能不能赢过「随机乱滑」
 *   scan    枚举所有「按类型站队」的玩法（每类卡一律左滑或一律右滑），
 *           看最优解是不是只有一条，以及哪些类型对胜负毫无影响
 *
 * 用法：
 *   node tools/check-policy.js policy --runs 3000
 *   node tools/check-policy.js scan --runs 300
 *
 * 保真：走 tools/sim/engine.js，跑的是 prototype.html 的真实脚本，与玩家玩到的是同一份逻辑。
 */
'use strict';
const path = require('path');
const __d = __dirname;
const { load, verifyWhenEquivalence, installFastWhen, mulberry32, setRNG } =
  require(path.join(__d, 'sim', 'engine'));

function argVal(n, d) { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; }
const MODE = process.argv[2] || 'policy';
const RUNS = parseInt(argVal('--runs', MODE === 'scan' ? 300 : 3000), 10);
const SEED = parseInt(argVal('--seed', '20261021'), 10);

const { sandbox, getEl, CARDS } = load();
verifyWhenEquivalence(sandbox, CARDS);
installFastWhen(sandbox);   // 对拍通过后加速 whenOK，让原型自己的 pick() 可直接跑

/* 抽卡走原型自己的 pick()：洗牌袋 / 冷却 / 同类摊开只有那一份实现。
   以前这里抄过一遍，任何一次抽卡算法改动都会让「仿真结论」与「玩家体验」分叉。 */
function nextCard(rng, S) {
  const first = sandbox.pick();
  sandbox.pickPeek(1, first);   // 垫层只预览，不消耗袋子
  sandbox.pickPeek(2, first);
  return first;
}

function effects(c) { return { L: vec(c.L && c.L.e), R: vec(c.R && c.R.e) }; }
function vec(eff) {
  if (!eff) eff = {};
  // borrow 的隐性代价进规则：borrow() 会加风险 min(16, 5+x/1300)，策略有权知道游戏规则
  const hiddenRisk = eff.borrow ? Math.min(16, 5 + eff.borrow / 1300) : 0;
  return {
    // borrow 不计入即时净值：真实结算=负债+x 且持仓+x（带满杠杆成本），净值变化为 0；
    // 借钱的代价走的是风险(+5~16)与后续利息，策略能看到的显式 risk 才是它的表面成本
    net: (eff.cash || 0) - (eff.spend || 0) - (eff.repay || 0),
    mind: eff.mind || 0, risk: (eff.risk || 0) + hiddenRisk, social: eff.social || 0,
  };
}

function play(pick, seed) {
  const rng = mulberry32(seed);
  setRNG(sandbox, rng);
  let survived = 0, days = 0;
  const endings = {};
  for (let g = 0; g < RUNS; g++) {
    sandbox.reset();
    let p = 0;
    for (let t = 0; t < 60 && !sandbox.S.over; t++) {
      const card = nextCard(rng, sandbox.S);
      sandbox.resolve(card, pick(card, sandbox.S, rng));
      sandbox.tick();
      sandbox.check();
      p++;
    }
    days += p;
    if (p === 60) survived++;
    if (sandbox.S.over) {
      const k = getEl('o-t')._t + ' | ' + ((getEl('o-s')._t.split('·')[1] || '').trim());
      endings[k] = (endings[k] || 0) + 1;
    }
  }
  return { win: survived / RUNS * 100, days: days / RUNS, endings: endings };
}

const R = function (c, S, rng) { return rng() < 0.5 ? 'L' : 'R'; };

const POLICIES = {
  '随机乱滑': R,
  '永远左滑（什么都拒绝）': function () { return 'L'; },
  '永远右滑（什么都认了）': function () { return 'R'; },
  '老好人（只看心态+社会）': function (c, S, rng) {
    const e = effects(c);
    const a = e.L.mind + e.L.social, b = e.R.mind + e.R.social;
    if (a === b) return R(c, S, rng);
    return a > b ? 'L' : 'R';
  },
  '会玩（哪条快见底先救哪条）': function (c, S, rng) {
    const e = effects(c), INIT = 12000, net = S.cash + S.equity - S.debt;
    const wm = S.mind < 35 ? 3 : 1, ws = S.social < 30 ? 3 : 1;
    const wr = S.risk > 60 ? 3 : 1, wn = net < INIT * 0.5 ? 2 : 0.5;
    const u = function (v) { return v.net / (INIT * 0.1) * wn + v.mind * wm + v.social * ws - v.risk * wr; };
    const a = u(e.L), b = u(e.R);
    if (Math.abs(a - b) < 1e-9) return R(c, S, rng);
    return a > b ? 'L' : 'R';
  },
  /* 2026-10-21 加：L1 改造后每条路都有代价，「只看最短板」的线性权重会失灵
     （钱亏了它不在乎，直到跌破 6000 才加权）。maximin 换成「先把离死线最近的那条抬高」，
     更接近真人在 Reigns 里的玩法：不让任何一条触底。两者并存，不做替换。 */
  '会玩·maximin（先保住最短板）': function (c, S, rng) {
    const INIT = 12000;
    const e = effects(c);
    const score = function (e) {
      if (!e) e = {};
      const net = S.cash + S.equity - S.debt + e.net;
      const d = [
        clamp01((S.mind + e.mind) / 100),
        clamp01((100 - (S.risk + e.risk)) / 100),
        clamp01((S.social + e.social) / 100),
        clamp01(net / INIT),
      ];
      return Math.min.apply(null, d) * 10 + d.reduce(function (a, b) { return a + b; }, 0) * 0.01;
    };
    const a = score(e.L), b = score(e.R);
    if (Math.abs(a - b) < 1e-9) return R(c, S, rng);
    return a > b ? 'L' : 'R';
  },
};

function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }

if (MODE === 'policy') {
  console.log('');
  console.log('==== 策略对照 · 每种 ' + RUNS + ' 局 · seed=' + SEED + ' ====');
  const out = {};
  Object.keys(POLICIES).forEach(function (name) {
    const r = play(POLICIES[name], SEED);
    out[name] = r;
    console.log('  ' + name.padEnd(24) + '通关 ' + r.win.toFixed(1).padStart(5) + '%   平均 ' + r.days.toFixed(1).padStart(5) + ' 天');
  });
  const base = out['随机乱滑'].win;
  console.log('\n---- 相对随机（技巧回报，目标 ≥2.0x）----');
  Object.keys(out).forEach(function (k) {
    console.log('  ' + k.padEnd(24) + 'x' + (out[k].win / base).toFixed(2));
  });
  const best = Math.max.apply(null, Object.keys(out).map(function (k) { return out[k].win / base; }));
  console.log('\n' + (best < 1.2 ? '✗ 没有任何有信息的玩法能明显赢过随机 —— 决策目前不值钱' : '✓ 最优玩法通关率是随机的 ' + best.toFixed(2) + ' 倍'));
} else {
  const TAGS = [];
  CARDS.forEach(function (c) { if (TAGS.indexOf(c.tag) < 0) TAGS.push(c.tag); });
  const counts = {};
  CARDS.forEach(function (c) { counts[c.tag] = (counts[c.tag] || 0) + 1; });
  console.log('');
  console.log('==== 策略空间扫描 · ' + TAGS.length + ' 类共 ' + (1 << TAGS.length) + ' 种「按类型站队」玩法 · 每种 ' + RUNS + ' 局 ====');
  console.log('  （每类卡一律左滑或一律右滑，模拟玩家"摸清套路后按类型站队"）');
  const res = [];
  for (let mask = 0; mask < (1 << TAGS.length); mask++) {
    const m = mask;
    const r = play(function (c) { return ((m >> TAGS.indexOf(c.tag)) & 1) ? 'R' : 'L'; }, 77777);
    res.push({ mask: m, win: r.win, days: r.days });
  }
  res.sort(function (a, b) { return b.win - a.win; });
  const desc = function (m) {
    return TAGS.map(function (t, i) { return t + ((m >> i) & 1 ? '右' : '左'); }).join(' ');
  };
  console.log('\n---- 通关率 Top 5 ----');
  res.slice(0, 5).forEach(function (r, i) {
    console.log('  ' + (i + 1) + '. ' + r.win.toFixed(1).padStart(5) + '%  平均 ' + r.days.toFixed(1).padStart(5) + ' 天   ' + desc(r.mask));
  });
  const wins = res.map(function (r) { return r.win; });
  const avg = wins.reduce(function (a, b) { return a + b; }, 0) / wins.length;
  console.log('\n---- 分布 ----');
  console.log('  平均 ' + avg.toFixed(1) + '%  最高 ' + Math.max.apply(null, wins).toFixed(1) + '%  最低 ' + Math.min.apply(null, wins).toFixed(1) + '%');
  [20, 25].forEach(function (th) {
    const c = wins.filter(function (w) { return w >= th; }).length;
    console.log('  通关率 ≥' + th + '% 的玩法: ' + c + '/' + wins.length + ' (' + (c / wins.length * 100).toFixed(1) + '%)');
  });
  console.log('\n---- 每类卡在 Top 20 玩法里被推向哪边（10/20 = 滑哪边都无所谓）----');
  const top = res.slice(0, 20);
  let dead = 0, deadCards = 0;
  TAGS.forEach(function (t, i) {
    const c = top.filter(function (r) { return (r.mask >> i) & 1; }).length;
    const label = c >= 17 ? '几乎必须「投入」' : (c <= 3 ? '几乎必须「抽身」' : '不影响胜负');
    if (c > 3 && c < 17) { dead++; deadCards += counts[t]; }
    console.log('  ' + t.padEnd(4) + '(' + String(counts[t]).padStart(2) + '张)  右滑 ' + String(c).padStart(2) + '/20   ' + label);
  });
  console.log('\n' + (deadCards > 0 ? '✗ ' + dead + ' 类共 ' + deadCards + ' 张卡怎么滑都不影响胜负（' + (deadCards / CARDS.length * 100).toFixed(0) + '% 的卡是装饰）' : '✓ 每类卡都对胜负有影响'));
}
