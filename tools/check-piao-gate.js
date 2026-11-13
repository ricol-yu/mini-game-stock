#!/usr/bin/env node
/**
 * 票支线闸门自验（share-flow §4.2 / §8.2 三条）
 *
 * 用法：node tools/check-piao-gate.js [局数=200] [天数=60]
 *
 * 查三件事：
 *   ① 静态：`if(!piaoOK(c)) continue;` 必须同时出现在 bagFind 与 bagFindChain 的函数体里
 *      （只挂一处 = 那一段的票卡完全不设防；段 1/2 走 bagFind，段 3 走 bagFindChain）
 *   ② 动态：N 局 × M 天，段位必须单调 1→2→3、每次只 +1，不跳段、不倒退；
 *      同局不许出现两张段 1（互斥变体）、段 1 不早于第 4 天、段间 ≥8 张（1 卡/天 = 8 天）、
 *      _pAdv ≤ 2（最多升段 2 次 = 最多走到第 3 段）
 *   ③ 反证：把 piaoOK 换成恒真（= 闸门被拆掉）重跑同一批局，
 *      必须立刻复现「同局两张段 1 / 段位乱序」——复现不了说明闸门没挂在真正的出牌路径上
 *
 * DOM 桩与 smoke-ui.js 同源（那份是主用例，这里只留"脚本能跑起来"的最小集合）。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'prototype.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
const GAMES = Number(process.argv[2] || 200);
const DAYS = Number(process.argv[3] || 60);

/* ---------- 最小 DOM 桩 ---------- */
class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.style = {}; this._t = ''; this._html = ''; this.children = []; this.parentNode = null;
    this.offsetLeft = 0; this.offsetWidth = 0; this.offsetParent = { clientWidth: 344 }; this.dataset = {};
    const cls = new Set();
    this.classList = {
      add: (...c) => c.forEach(x => cls.add(x)),
      remove: (...c) => c.forEach(x => cls.delete(x)),
      toggle: (c, on) => { if (on === undefined) cls.has(c) ? cls.delete(c) : cls.add(c); else on ? cls.add(c) : cls.delete(c); },
      contains: c => cls.has(c),
    };
    Object.defineProperty(this, 'className', {
      get: () => [...cls].join(' '),
      set: v => { cls.clear(); String(v).split(/\s+/).filter(Boolean).forEach(c => cls.add(c)); },
    });
  }
  get textContent() { return this._t; }
  set textContent(v) { this._t = String(v); }
  get innerHTML() { return this._html; }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  remove() { const p = this.parentNode; if (p) p.children = p.children.filter(x => x !== this); }
  removeChild(c) { if (c) { c.remove(); c.parentNode = null; } return c; }
  addEventListener() {} removeEventListener() {}
  setPointerCapture() {} releasePointerCapture() {}
  getTotalLength() { return 100; }
  getBoundingClientRect() { return { width: 296, height: 46, top: 0, left: 0 }; }
  querySelector() { return new El('span'); }
  querySelectorAll() { return []; }
}

/* 固定种子 PRNG（mulberry32）：两次运行用同一个种子，才谈得上「反证」 */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

function makeSandbox(seed) {
  const els = {};
  const getEl = id => els[id] || (els[id] = new El('div'));
  const M = Object.create(Math);
  M.random = mulberry32(seed);
  const sandbox = {
    document: {
      getElementById: getEl,
      createElement: t => new El(t),
      body: new El('body'),
      addEventListener() {},
    },
    setTimeout() { return 1; },
    clearTimeout() {},
    console,
  };
  sandbox.window = sandbox;
  sandbox.Math = M;
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: 'prototype-inline.js' });
  return sandbox;
}

/* 跑一局，返回段位轨迹 { seq:[1,2,3], days:[10,22,35], stage1Cards:[id], adv, stage, seenB:[] } */
function runGame(sb, days) {
  const rec = { seq: [], days: [], stage1Cards: [], adv: 0, stage: 0, order: [], seenB: [] };
  sb.S.tut = 3;
  sb.reset();
  for (let i = 0; i < days && !sb.S.over; i++) {
    const c = sb.pick();
    if (!c) break;
    if (c.tier === 'B') {
      rec.order.push({ id: c.id, stage: c.stage, day: sb.S.day, prevStage: rec.stage });
      if ((c.stage | 0) === 1) rec.stage1Cards.push(c.id);
      rec.seenB.push(c.id);
      rec.seq.push(c.stage | 0);
      rec.days.push(sb.S.day);
    }
    sb.resolve(c, i % 2 ? 'L' : 'R');
    sb.tick();
    sb.render();
    sb.check();
    rec.stage = sb.S._pStage | 0;
    rec.adv = sb.S._pAdv | 0;
  }
  rec.finalStage = sb.S._pStage | 0;
  rec.finalAdv = sb.S._pAdv | 0;
  rec.day = sb.S.day;
  return rec;
}

/* ---------- ① 静态：闸门在两个抽屉里 ---------- */
function fnBody(name) {
  const i = script.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const j = script.indexOf('{', i);
  let d = 0;
  for (let k = j; k < script.length; k++) {
    if (script[k] === '{') d++;
    else if (script[k] === '}') { d--; if (!d) return script.slice(i, k + 1); }
  }
  return '';
}
const GATE = 'if(!piaoOK(c)) continue;';
const bagBody = fnBody('bagFind');
const chainBody = fnBody('bagFindChain');
const issues = [];
const staticBag = bagBody.indexOf(GATE) >= 0;
const staticChain = chainBody.indexOf(GATE) >= 0;
if (!staticBag) issues.push('bagFind 里没有闸门');
if (!staticChain) issues.push('bagFindChain 里没有闸门');
console.log('\n==== 票支线闸门自验 ====\n');
console.log('① 静态挂载：bagFind ' + (staticBag ? '✓' : '✗') + ' · bagFindChain ' + (staticChain ? '✓' : '✗') +
            '（源码里共 ' + (script.split(GATE).length - 1) + ' 处）');

/* ---------- ② 动态：N 局 × M 天 ---------- */
const sb = makeSandbox(20261114);
const games = [];
for (let g = 0; g < GAMES; g++) games.push(runGame(sb, DAYS));

let vSkip = 0, vBack = 0, vStage1Dup = 0, vAdv = 0, vMinGap = 0, vEarly = 0, vStageOver3 = 0;
let minGap = 999, minStage1Day = 999, reached2 = 0, reached3 = 0, stage3Days = [], stage2Days = [];
games.forEach(r => {
  // 单调 +1（跳段 / 倒退都算违规）
  let prev = 0;
  r.seq.forEach((st, i) => {
    if (st === prev) return;                     // 同段重复（互斥变体理论上不会出现，见下面的 dup 统计）
    if (st > prev + 1) vSkip++;
    if (st < prev) vBack++;
    if (st > 3) vStageOver3++;
    prev = st;
  });
  // 同局两张段 1 = 互斥变体失效
  if (r.stage1Cards.length > 1) vStage1Dup++;
  if (r.finalAdv > 2) vAdv++;
  // 段 1 最早第 4 天
  if (r.days.length) {
    if (r.days[0] < 4) vEarly++;
    minStage1Day = Math.min(minStage1Day, r.days[0]);
  }
  // 段间 ≥8 天（1 卡/天 = 8 张）
  for (let i = 1; i < r.days.length; i++) {
    const gap = r.days[i] - r.days[i - 1];
    minGap = Math.min(minGap, gap);
    if (gap < 8) vMinGap++;
  }
  if (r.finalStage >= 2) reached2++;
  if (r.finalStage >= 3) reached3++;
  if (r.seq.indexOf(2) >= 0) stage2Days.push(r.days[r.seq.indexOf(2)]);
  if (r.seq.indexOf(3) >= 0) stage3Days.push(r.days[r.seq.indexOf(3)]);
});
const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '—';
console.log('② 动态（' + GAMES + ' 局 × ' + DAYS + ' 天，种子 20261114）');
console.log('   段位：走到段 2 ' + reached2 + ' 局 · 段 3 ' + reached3 + ' 局（段 2 首次均 ' + avg(stage2Days) +
            ' 天 / 段 3 首次均 ' + avg(stage3Days) + ' 天）');
console.log('   违规：跳段 ' + vSkip + ' · 倒退 ' + vBack + ' · 段位>3 ' + vStageOver3 +
            ' · 同局两张段1 ' + vStage1Dup + ' · 升段>2 ' + vAdv + ' · 段间<8张 ' + vMinGap + ' · 段1早于第4天 ' + vEarly);
console.log('   极值：段 1 最早出现在第 ' + (minStage1Day === 999 ? '—' : minStage1Day) + ' 天 · 段间最小间隔 ' +
            (minGap === 999 ? '—' : minGap) + ' 天');
if (vSkip || vBack || vStageOver3 || vStage1Dup || vAdv || vMinGap || vEarly) {
  issues.push('动态闸门违规：跳段' + vSkip + ' 倒退' + vBack + ' 段位>3' + vStageOver3 +
              ' 两张段1 ' + vStage1Dup + ' 升段>2 ' + vAdv + ' 段间<8 ' + vMinGap + ' 早于第4天 ' + vEarly);
}
if (reached2 === 0) issues.push('200 局里一次都没走到段 2——闸门把支线饿死了，不是"没触发"');

/* ---------- ③ 反证：拆掉闸门必须立刻复现 ---------- */
const sb2 = makeSandbox(20261114);
sb2.piaoOK = function () { return true; };        // 等价于「把那行闸门注释掉」
const games2 = [];
for (let g = 0; g < GAMES; g++) games2.push(runGame(sb2, DAYS));
let badDup = 0, badSkip = 0;
games2.forEach(r => {
  if (r.stage1Cards.length > 1) badDup++;
  let prev = 0;
  r.seq.forEach(st => { if (st > prev + 1) badSkip++; if (st > prev) prev = st; });
});
console.log('③ 反证（piaoOK 恒真 = 闸门被拆）：同局两张段 1 → ' + badDup + ' 局 · 跳段 → ' + badSkip + ' 次');
if (badDup + badSkip === 0) issues.push('反证没复现：把闸门拆掉也没有越界，说明闸门不在真正的出牌路径上');

/* ---------- 结论 ---------- */
const stage3VsTheory = stage3Days.length && stage2Days.length
  ? (avg(stage3Days) - avg(stage2Days)).toFixed(1) : '—';
console.log('   段 3 相对段 2 的实际延迟 ' + stage3VsTheory + ' 天（理论 8 天；多出来的是 bagFindChain 的 _lastWasChain 隔天限制，属预期，不是 bug）');
console.log(issues.length ? '\n✗ 闸门自验失败：\n   - ' + issues.join('\n   - ') : '\n✓ 票支线闸门自验通过');
process.exit(issues.length ? 1 : 0);
