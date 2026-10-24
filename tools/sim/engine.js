#!/usr/bin/env node
/**
 * 仿真引擎：把 prototype.html 的真实游戏脚本原样加载进 Node vm 沙箱无头运行。
 *
 * 为什么不把逻辑"移植"成 Node 版？
 *   移植 = 两份逻辑，必然漂移，对拍永远存疑。
 *   直接跑原型自己的代码（DOM 用桩替身吸收渲染，Math.random 注入种子），
 *   仿真器与玩家玩到的逻辑天然是同一份 —— 对拍在架构层面成立。
 *
 * 性能：原型 pick() 每次抽卡都对全池重新解析 when 字符串（浏览器里无所谓，
 *   百万次抽卡就是灾难）。引擎提供语义等价的快版过滤器，并做双向等价验证：
 *   随机构造上千个状态，快版与原型版逐卡对拍，必须 100% 一致才允许跑仿真。
 *
 * 已知保真点（必须复刻的真实行为）：
 *   - nextCard() 每次 pick() 三张、只打一张（下面两张是视觉垫层）——
 *     所以池子消耗是 每天三抽、可见一张。驱动器按此复刻。
 *   - check() 在每张卡 resolve+tick 之后都会调用（fly 的 setTimeout 里）。
 *   - tick() 末尾 S.day++，所以"一天"= 一张可见卡。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..', '..');   // tools/sim/ → 仓库根
const PROTO = path.join(ROOT, 'prototype.html');

/* ---------- DOM 桩：吸收一切渲染副作用，只记录结局写入 ---------- */
class El {
  constructor() {
    this.style = {};
    this._t = '';
    this.classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
    this.dataset = {};
  }
  get textContent() { return this._t; }
  set textContent(v) { this._t = String(v); }
  get innerHTML() { return ''; }
  set innerHTML(v) {}
  appendChild() {} remove() {} addEventListener() {} setPointerCapture() {}
  querySelector() { return new El(); }
  querySelectorAll() { return []; }
}

function load() {
  const html = fs.readFileSync(PROTO, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('prototype.html 里找不到 <script>');
  const script = m[1];

  const els = {};
  const getEl = id => els[id] || (els[id] = new El());
  const sandbox = {
    document: {
      getElementById: getEl,
      createElement: () => new El(),
      body: new El(),
      addEventListener() {},
    },
    setTimeout() { return 0; },
    clearTimeout() {},
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(script, sandbox, { filename: 'prototype-inline.js' });

  // 摘掉 DOM 部件：reset() 会调 nextCard()（真身要建三张卡），仿真里换成空操作。
  // 顶层 function 声明挂在沙箱全局上，直接覆盖即可，fly/reset 内部调用走同名全局。
  sandbox.nextCard = function () {};
  // 同理摘掉两个纯显示函数：render() 只读状态写 DOM、money() 只格式化字符串，
  // 两者都不消耗 Math.random、不改任何游戏状态 —— 置空不改变仿真语义，
  // 但省掉每局一次全量渲染和每跳多次 toLocaleString（10 万局省约 40 秒）。
  // 注意 money() 的返回值在 tick 里会被 .replace()，必须仍是字符串（省掉千分位分组）。
  sandbox.render = function () {};
  sandbox.money = function (n) { return (n < 0 ? '-¥' : '¥') + Math.round(Math.abs(n)); };

  // 卡片无 id（sync 脚本不往 CARDS 写 id）→ 从真源 json 按顺序对齐贴上，
  // 并逐卡核对 who/tag/text 防错位，错位即中止。
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'cards.json'), 'utf8'));
  const CARDS = sandbox.CARDS;
  if (CARDS.length !== data.cards.length)
    throw new Error(`原型 ${CARDS.length} 张卡 vs json ${data.cards.length} 张卡，数量不一致`);
  CARDS.forEach((c, i) => {
    const j = data.cards[i];
    if (c.who !== j.who || c.tag !== j.tag || c.txt !== j.text)
      throw new Error(`第 ${i} 张卡原型与 json 不对齐：${c.who}/${c.tag} vs ${j.who}/${j.tag}`);
    c._id = j.id;
  });

  return { sandbox, els, getEl, data, CARDS };
}

/* ---------- 快版 when 过滤器（语义逐字对齐 oneCond/exprVal） ---------- */
function parseCond(t) {
  let m = t.match(/^did:([\w]+?)\.(l|r)$/i);
  if (m) { const id = m[1], d = m[2].toLowerCase(); return S => !!(S.did && S.did[id] === d); }
  m = t.match(/^did:([\w]+)$/i);
  if (m) { const id = m[1]; return S => !!(S.did && S.did[id]); }
  m = t.match(/^seen:([\w]+)$/i);
  if (m) { const id = m[1]; return S => !!(S.seen && S.seen[id]); }
  m = t.match(/^(has|no):(\w+)$/);
  if (m) { const want = m[1] === 'has', k = m[2]; return S => !!(S.st && S.st[k]) === want; }
  m = t.match(/^(\w+)\s*(<=|>=|<|>)\s*(.+)$/);
  if (m) {
    const attr = m[1], op = m[2], rx = m[3].trim();
    let rvFn;
    const mc = rx.match(/^cost\s*\*\s*([\d.]+)$/);
    if (mc) { const k = parseFloat(mc[1]); rvFn = S => S.cost * k; }
    else if (rx === 'cost') rvFn = S => S.cost;
    else { const v = parseFloat(rx); rvFn = isNaN(v) ? () => undefined : () => v; } // NaN→undefined，与 exprVal 一致
    return S => {
      const lv = S[attr], rv = rvFn(S);
      if (lv === undefined || rv === undefined) return false;
      if (op === '<') return lv < rv;
      if (op === '>') return lv > rv;
      if (op === '<=') return lv <= rv;
      return lv >= rv;
    };
  }
  return () => false; // 无法识别 → 不满足，与 oneCond 的保守语义一致
}
function compileWhen(w) {
  const groups = String(w).split('|').map(g =>
    g.split(/[;&]/).map(t => t.trim()).filter(Boolean).map(parseCond)
  );
  return function (S) {
    for (const g of groups) {
      let ok = true;
      for (const f of g) { if (!f(S)) { ok = false; break; } }
      if (ok) return true;
    }
    return false;
  };
}

/* ---------- 等价性对拍：快版 vs 原版，逐卡随机状态，必须 100% 一致 ---------- */
function verifyWhenEquivalence(sandbox, CARDS) {
  const RSTATES = 400;
  const STATUS = ['bubble', 'crisis', 'halt', 'baby', 'fired', 'insider', 'over', 'bull', 'bear'];
  let rnd = mulberry32(20261020);
  function randState() {
    const st = {};
    STATUS.forEach(s => { if (rnd() < 0.25) st[s] = -1; });
    const cost = Math.round(rnd() * 60000);
    const did = {}, seen = {};                       // 随机填 did/seen，让关联谓词也参与对拍
    for (let k = 0; k < 6; k++) {
      const c = CARDS[(rnd() * CARDS.length) | 0];
      if (!c) continue;
      if (rnd() < 0.5) did[c.id] = rnd() < 0.5 ? 'l' : 'r';
      else seen[c.id] = 1;
    }
    return {
      mind: Math.round(rnd() * 100), social: Math.round(rnd() * 100), risk: Math.round(rnd() * 100),
      day: 1 + Math.floor(rnd() * 70), cash: Math.round(rnd() * 50000),
      equity: Math.round(rnd() * 60000), cost, debt: Math.round(rnd() * 30000), st, did, seen,
    };
  }
  const states = [];
  for (let i = 0; i < RSTATES; i++) states.push(randState());

  let checked = 0;
  for (const c of CARDS) {
    if (!c.when) continue;
    const fast = compileWhen(c.when);
    for (const st of states) {
      sandbox.S = st;
      const a = sandbox.whenOK(c.when);
      const b = fast(st);
      checked++;
      if (a !== b)
        throw new Error(`when 对拍不一致：${c._id}「${c.when}」\n  状态: ${JSON.stringify(st)}\n  原版=${a} 快版=${b}`);
    }
  }
  sandbox.S = undefined;
  return checked;
}

/* ---------- 种子 RNG ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

/* 把种子 RNG 注入沙箱的 Math.random（必须从上下文内部改，沙箱对象上摸不到内建 Math） */
function setRNG(sandbox, fn) {
  sandbox.__rng = fn;
  vm.runInContext('Math.random = function(){ return __rng(); };', sandbox);
}

/* 把 whenOK 换成「编译一次、按字符串缓存」的版本。
 * 原型每次抽卡都重新解析 when 字符串（浏览器里无所谓，百万次抽卡是灾难）。
 * 这里只加缓存、不换语义；调用前必须已经跑过 verifyWhenEquivalence，
 * 否则就是在拿自己跟自己比对拍。
 *
 * 有了它，驱动程序可以直接调 sandbox.pick() —— 抽卡算法只有原型那一份，
 * 不会像以前那样在 Node 侧再抄一遍（两份必然漂移）。 */
function installFastWhen(sandbox) {
  const cache = new Map();
  sandbox.whenOK = function (w) {
    if (!w) return true;
    let f = cache.get(w);
    if (!f) { f = compileWhen(w); cache.set(w, f); }
    return f(sandbox.S);
  };
}

module.exports = { load, compileWhen, parseCond, verifyWhenEquivalence, installFastWhen, mulberry32, setRNG };
