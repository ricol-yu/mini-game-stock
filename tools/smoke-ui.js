#!/usr/bin/env node
/**
 * UI 冒烟测试 —— engine.js 的桩把 render/nextCard 都砸平了，仿真跑得过不代表浏览器里不崩。
 * 这里造一套"够用的 DOM"，让 prototype.html 的真实脚本在里面跑 60 天，
 * 专门抓 render() 的字符串拼接、新加的 HUD 胶囊、月结日分支、离场卡通道 这类只在 UI 层出错的东西。
 *
 * 用法：node tools/smoke-ui.js
 * 退出码非 0 = 有异常，别 commit。
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(ROOT, 'prototype.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

/* ---------- 够用的 DOM ---------- */
class El {
  constructor(tag) {
    this.tagName = (tag || 'div').toUpperCase();
    this.style = {};
    this._t = '';
    this._html = '';
    this.className = '';
    this.children = [];
    this.parentNode = null;
    this.offsetLeft = 0; this.offsetWidth = 0;
    this.offsetParent = { clientWidth: 344 };
    this.dataset = {};
    const cls = new Set();
    this.classList = {
      add: (...c) => c.forEach(x => cls.add(x)),
      remove: (...c) => c.forEach(x => cls.delete(x)),
      toggle: (c, on) => { if (on === undefined) cls.has(c) ? cls.delete(c) : cls.add(c); else on ? cls.add(c) : cls.delete(c); },
      contains: c => cls.has(c),
    };
  }
  get textContent() { return this._t; }
  set textContent(v) { this._t = String(v); }
  get innerHTML() { return this._html; }
  set innerHTML(v) {
    this._html = String(v);
    // 只要能被 querySelector(".ln") 之类找到就行：按 class 粗略造几个子元素
    this.children = [];
    const re = /class="([^"]*)"/g; let m;
    while ((m = re.exec(this._html))) {
      const e = new El('span'); m[1].split(/\s+/).forEach(c => c && e.classList.add(c));
      e.parentNode = this; this.children.push(e);
    }
  }
  appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
  remove() { const p = this.parentNode; if (p) p.children = p.children.filter(x => x !== this); }
  addEventListener() {} removeEventListener() {}
  setPointerCapture() {} releasePointerCapture() {}
  getTotalLength() { return 100; }
  getBoundingClientRect() { return { width: 296, height: 46, top: 0, left: 0 }; }
  querySelector(sel) {
    const c = sel.replace(/^\./, '');
    const walk = el => {
      for (const ch of el.children) { if (ch.classList.contains(c)) return ch; const r = walk(ch); if (r) return r; }
      return null;
    };
    return walk(this) || new El('span');
  }
  querySelectorAll(sel) {
    const c = sel.replace(/^\./, '');
    const out = [];
    const walk = el => { for (const ch of el.children) { if (ch.classList.contains(c)) out.push(ch); walk(ch); } };
    walk(this);
    return out;
  }
}

const els = {};
const getEl = id => els[id] || (els[id] = new El('div'));
const timers = [];
const sandbox = {
  document: {
    getElementById: getEl,
    createElement: t => new El(t),
    body: new El('body'),
    addEventListener() {},
  },
  setTimeout(fn) { timers.push(fn); return timers.length; },
  clearTimeout() {},
  console,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(script, sandbox, { filename: 'prototype-inline.js' });

const S = sandbox.S ? () => sandbox.S : null;
let fail = 0;
function step(name, fn) {
  try { fn(); console.log('  ✓ ' + name); }
  catch (e) { fail++; console.log('  ✗ ' + name + ' → ' + e.message + '\n' + (e.stack || '').split('\n').slice(1, 4).join('\n')); }
}

console.log('\n==== UI 冒烟 ====');
step('reset + 首次 render', () => { sandbox.S.tut = 3; sandbox.reset(); sandbox.render(); });

step('连打 60 天（每步 render + pick + resolve + tick + check）', () => {
  for (let i = 0; i < 60 && !sandbox.S.over; i++) {
    const c = sandbox.pick();
    sandbox.resolve(c, i % 2 ? 'L' : 'R');
    sandbox.tick();
    sandbox.render();
    sandbox.check();
  }
  const d = sandbox.S.day;
  if (d < 20) throw new Error('只走了 ' + d + ' 天，可能中途崩在别处');
});

step('月结日分支（day 5 发薪、同一天扣房租水电）', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.day = 5; sandbox.S.cash = 20000; sandbox.S.debt = 0;
  sandbox.tick();
  const delta = sandbox.S.cash - 20000;
  // 期望值现算，不写死：改工资/账单/日 burn 时这条断言要跟着走，而不是变成假警报
  const want = sandbox.SALARY - sandbox.billOf(5).total - sandbox.EARLY_BURN;
  if (Math.abs(delta - want) > 2)
    throw new Error('第 5 天现金变化 ' + delta + '，应为「工资 ' + sandbox.SALARY +
                    ' − 账单 ' + sandbox.billOf(5).total + ' − 日用 ' + sandbox.EARLY_BURN + '」= ' + want);
  if (sandbox.S.debt !== 0) throw new Error('明明是付得起的，却欠了钱：' + sandbox.S.debt);
  sandbox.render();
});

step('现金不足时账单转负债（不静默、不留负现金）', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.setST('fired', -1);                       // 失业就没有工资进账，只扣账单
  sandbox.S.day = 35; sandbox.S.cash = 100; sandbox.S.debt = 0;
  sandbox.tick();
  if (sandbox.S.cash < 0) throw new Error('现金变成负数了：' + sandbox.S.cash);
  if (!(sandbox.S.debt > 1000)) throw new Error('交不上账单却没记负债，debt=' + sandbox.S.debt);
});

step('月供按月还（有债必还，且不超过现金）', () => {
  sandbox.S.day = 65; sandbox.S.cash = 30000; sandbox.S.debt = 20000;
  sandbox.tick();
  if (sandbox.S.debt >= 20000) throw new Error('有欠款但月供没还：' + sandbox.S.debt);
});

const isExit = c => c && c.tag === '决策' && c.urgent;

/* 借贷续命（2026-10-28 用户定）：钱花光不是结局，借不动了才是。
   这两条一正一反，缺哪条都可能把「归零即死」偷偷改回来。 */
step('钱花光不结束：净值归零、但信用额度还没用满 → 继续玩', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.day = 40;
  sandbox.S.cash = 0; sandbox.S.equity = 0; sandbox.S.debt = 8000;   // 净值 −8,000
  sandbox.check();
  if (sandbox.S.debt >= sandbox.creditLimit()) throw new Error('用例自身有问题：负债不该顶到额度');
  if (sandbox.S.over) throw new Error('净值归零就直接结束了（' + getEl('o-t')._t + '），应该是「还能借」');
});

step('借不动了才结束：负债顶到信用额度 → 穿仓', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.day = 40;
  sandbox.S.cash = 0; sandbox.S.equity = 0; sandbox.S.debt = sandbox.creditLimit();
  sandbox.check();
  if (!sandbox.S.over) throw new Error('额度用满了却没结束');
  if (getEl('o-t')._t !== '穿仓') throw new Error('结局不是穿仓，是 ' + getEl('o-t')._t);
});

step('现金刷爆转负债，并告诉玩家还能借多少', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.day = 30; sandbox.S.cash = 0; sandbox.S.debt = 0;
  const m = sandbox.tick();
  if (!(sandbox.S.debt > 0)) throw new Error('现金见底却没转成负债');
  if (m.indexOf('还能借') < 0) throw new Error('没告诉玩家还能借多少：' + m);
});

step('离场卡：条件满足时插队出现，右滑 → 上岸结局', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.day = 40; sandbox.S.equity = 0; sandbox.S.debt = 0; sandbox.S.cash = 31000; sandbox.S.trades = 5;
  sandbox.S._urgentCd = 0;
  const c = sandbox.pick();
  if (!isExit(c)) throw new Error('条件满足却没出离场卡，实际是 ' + (c && c.txt));
  sandbox.resolve(c, 'R');
  sandbox.tick();
  sandbox.check();
  if (!sandbox.S.over) throw new Error('右滑「收手」之后没结束');
  if (getEl('o-t')._t !== '上岸') throw new Error('结局不是上岸，是 ' + getEl('o-t')._t);
});

step('离场卡：左滑「再玩两天」继续，且两天内不重复追问', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.day = 40; sandbox.S.equity = 0; sandbox.S.debt = 0; sandbox.S.cash = 31000; sandbox.S.trades = 5;
  const c = sandbox.pick();
  if (!isExit(c)) throw new Error('条件满足却没出离场卡');
  sandbox.resolve(c, 'L'); sandbox.tick(); sandbox.check();
  if (sandbox.S.over) throw new Error('左滑不该结束游戏');
  sandbox.S.cash = 31000;
  const c2 = sandbox.pick();
  if (isExit(c2)) throw new Error('隔天就追问了（冷却没生效）');
});

step('结局面板文案非空（why 必写，且带「为什么是这个结局」）', () => {
  const why = getEl('o-why')._t;
  if (!why || why.indexOf('为什么是这个结局') < 0) throw new Error('结局面板没解释：' + why);
});

step('HUD 还款节点胶囊：无债只显示房租，有债连月供一起算进总额', () => {
  sandbox.S.tut = 3; sandbox.reset(); sandbox.render();
  let h = getEl('strip').innerHTML;
  if (h.indexOf('交钱') < 0) throw new Error('strip 里没有还款胶囊：' + h.slice(0, 160));
  if (!/¥[\d,]+/.test(h)) throw new Error('还款胶囊没有金额');
  // 有欠款：下一次要出去的钱 = 房租 + 月供（比例直接读沙箱常量，别写死）
  sandbox.S.debt = 20000; sandbox.render();
  h = getEl('strip').innerHTML;
  const nb = sandbox.billOf(sandbox.S.day + sandbox.daysToPayday()).total;
  const due = Math.min(sandbox.S.debt, Math.max(sandbox.DEBT_DUE_MIN, sandbox.S.debt * sandbox.DEBT_DUE_RATE));
  const total = (nb + due).toLocaleString('en-US');
  if (h.indexOf(total) < 0) throw new Error('有债时胶囊没把月供算进去，应该显示 ¥' + total + '：' + h.slice(0, 200));
  if (h.indexOf('due') < 0) throw new Error('有债时胶囊没变红');
});

step('还款日：每月 5 号和 20 号各一次，20 号只还月供不交房租', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.day = 18; sandbox.S.debt = 20000;          // 1 号起算，18 号 = 距 20 号 2 天
  const np = sandbox.nextPayday();
  if (np.kind !== 'due') throw new Error('18 号之后最近的是 20 号还款日，实际 ' + np.kind);
  if (np.in !== 2) throw new Error('20 号还有 ' + np.in + ' 天，不是 2');
  sandbox.S.day = 3;                                    // 距 5 号 2 天
  if (sandbox.nextPayday().kind !== 'rent') throw new Error('3 号之后最近的是发薪日');
  sandbox.S.debt = 0;                                   // 没债：不用管 20 号
  sandbox.S.day = 18;
  if (sandbox.nextPayday().kind !== 'rent') throw new Error('没欠款还提示还月供');
});

/* 净值飘字（2026-10-26）：玩家反馈「金钱有变动看起来不明显」。
   规则：只在净值真的变了时飘，涨用红（up）跌用绿（down），显示的数字必须等于实际净值差。
   只有金额、没有小字（跟过一版来源明细，玩家说奇怪，去掉了）。 */
function deltaBox() { return getEl('v-delta'); }
function shownDelta() {
  const m = deltaBox().textContent.match(/^([+−])¥([\d,]+)$/);
  if (!m) return null;
  return (m[1] === '+' ? 1 : -1) * Number(m[2].replace(/,/g, ''));
}

step('净值飘字：涨了飘红字，金额等于净值差', () => {
  sandbox.S.tut = 3; sandbox.reset(); sandbox.render();
  if (shownDelta() !== null) throw new Error('刚重开就飘了，不该有');
  const n0 = sandbox.net();
  sandbox.S.cash += 1234;
  sandbox.render();
  if (deltaBox().className.indexOf('on') < 0) throw new Error('没播动画：' + deltaBox().className);
  if (deltaBox().className.indexOf('up') < 0) throw new Error('涨了却不是红（up）：' + deltaBox().className);
  if (shownDelta() !== 1234) throw new Error('飘字金额不对：' + deltaBox().innerHTML);
  if (sandbox.net() - n0 !== 1234) throw new Error('净值本身算错了');
});

step('净值飘字：跌了飘绿字', () => {
  sandbox.S.cash -= 560;
  sandbox.render();
  if (deltaBox().className.indexOf('down') < 0) throw new Error('跌了却不是绿（down）：' + deltaBox().className);
  if (shownDelta() !== -560) throw new Error('飘字金额不对：' + deltaBox().innerHTML);
});

step('净值飘字：没变化就不飘（防止每帧重播）', () => {
  sandbox.render();
  if (deltaBox().className.indexOf('on') >= 0) throw new Error('净值没动却又播了一次');
  if (deltaBox().textContent !== '') throw new Error('净值没动却留着数字：' + deltaBox().textContent);
});

step('净值飘字：发薪日飘的金额 = 实际净值变化，且只有金额、没有多余小字', () => {
  sandbox.S.tut = 3; sandbox.reset(); sandbox.render();
  sandbox.S.day = 5; sandbox.S.cash = 30000; sandbox.S.debt = 0;
  sandbox.render();                                  // 先把手动改现金这一下同步掉，再算「当天」的账
  const n0 = sandbox.net();
  sandbox.tick(); sandbox.render();
  const shown = shownDelta();
  if (shown === null) throw new Error('发薪日没飘，或文案不是「±¥金额」：' + JSON.stringify(deltaBox().textContent));
  if (Math.abs(shown - (sandbox.net() - n0)) > 2)
    throw new Error('飘字 ' + shown + ' 与净值差 ' + (sandbox.net() - n0) + ' 对不上');
});

/* 「现金 0 还能花钱，扣的是哪里的钱」（2026-10-27 首版 → 当晚重写）
   旧逻辑：现金不够先砍仓抵账，再不够才欠债。玩家反馈这样会出现
   「阿姨让你投五千买股 → 系统卖掉你的股票付这五千」，账说不通。
   新逻辑：**系统永不替玩家卖股票**——支出超额只记账（负债），买入只用现金、买不起就少买。 */
step('现金不够花钱：不砍仓，差额全额记负债，并进提示队列', () => {
  sandbox.S.tut = 3; sandbox.reset(); sandbox.render();
  sandbox.S.cash = 500; sandbox.S.equity = 9000; sandbox.S.debt = 0;
  sandbox.spend(3000);
  if (sandbox.S.equity !== 9000) throw new Error('系统偷偷卖了股票：持仓 ' + sandbox.S.equity);
  if (sandbox.S.debt !== 2500) throw new Error('差额没记负债：' + sandbox.S.debt);
  if (sandbox.S.cash !== 0) throw new Error('现金没清零：' + sandbox.S.cash);
  if (sandbox.S._autoDebt !== 2500) throw new Error('欠债没进提示队列：' + sandbox.S._autoDebt);
});

step('现金不够买入：只买得起多少买多少，不卖股票，差额记账', () => {
  sandbox.S.tut = 3; sandbox.reset(); sandbox.render();
  sandbox.S.cash = 800; sandbox.S.equity = 9000; sandbox.S.debt = 0;
  sandbox.buy(3000);
  if (sandbox.S.equity !== 9800) throw new Error('没买进：持仓 ' + sandbox.S.equity);
  if (sandbox.S.cash !== 0) throw new Error('现金没扣干净：' + sandbox.S.cash);
  if (sandbox.S.debt !== 0) throw new Error('买股票怎么买出负债了：' + sandbox.S.debt);
  if (sandbox.S._buyWant !== 3000 || sandbox.S._buyGot !== 800)
    throw new Error('买入差额没记账：想买 ' + sandbox.S._buyWant + ' 实买 ' + sandbox.S._buyGot);
});

step('金额融进选项文案：{} 填真实金额，没金额的一侧不带数字，上头状态买入 ×1.35', () => {
  sandbox.S.tut = 3; sandbox.reset(); sandbox.render();
  sandbox.S.cash = 100; sandbox.S.equity = 9000;
  const spendCard = { id:'w1', who:'测试', av:'🧪', tag:'测试', txt:'x',
                      L:{ s:'花大钱，{}', e:{ spend: 5000 } }, R:{ s:'不花', e:{ mind: 1 } } };
  // 王权式：选项不常驻在卡面上，拖动时才填进印章（stamp）——所以直接验证 labelOf 和拖动填充
  if (sandbox.labelOf(spendCard.L).indexOf('花大钱，5,000') < 0)
    throw new Error('金额没融进文案：' + sandbox.labelOf(spendCard.L));
  if (sandbox.labelOf(spendCard.R).indexOf('不花') < 0 || sandbox.labelOf(spendCard.R).indexOf('5,000') >= 0)
    throw new Error('没金额的一侧也被填了数字：' + sandbox.labelOf(spendCard.R));

  const buyCard = { id:'w2', who:'测试', av:'🧪', tag:'测试', txt:'x',
                    L:{ s:'不买', e:{ mind: 1 } }, R:{ s:'上车，{}', e:{ buy: 3000 } } };
  if (sandbox.labelOf(buyCard.R).indexOf('上车，3,000') < 0)
    throw new Error('买入项没报价：' + sandbox.labelOf(buyCard.R));
  sandbox.S.st.over = -1;                              // 上头状态：买入多掏 35%
  if (sandbox.labelOf(buyCard.R).indexOf('4,050') < 0)
    throw new Error('上头状态金额没跟着涨（应 4,050）：' + sandbox.labelOf(buyCard.R));
  sandbox.S.st.over = 0;
  // 拖动时印章被填充：模拟 pointermove 里那段逻辑依赖的 build 产物结构
  const d = sandbox.build(buyCard);
  if (d.querySelectorAll('.stamp').length !== 2) throw new Error('印章结构丢了');
  if (d.innerHTML.indexOf('上车') >= 0) throw new Error('静止卡面不该出现选项文字（王权式：拖动才浮现）');
});

step('资金条闪烁：动了的段挂 hit 类，没动的段不挂', () => {
  sandbox.S.tut = 3; sandbox.reset(); sandbox.render();   // 建立 _pc/_pe/_pd 基线
  // 桩的 setTimeout 不执行、hit 类不会自动摘；真实浏览器里 1.15s 后已摘干净，先模拟这一点
  ['b-cash', 'b-eq', 'b-debt'].forEach(id => { getEl(id).className = ''; });
  const cls = id => getEl(id).className;
  sandbox.S.cash -= 400; sandbox.render();
  if (cls('b-cash').indexOf('hit') < 0) throw new Error('现金条动了没闪：' + cls('b-cash'));
  if (cls('b-eq').indexOf('hit') >= 0) throw new Error('持仓没动却闪了：' + cls('b-eq'));
  sandbox.S.debt += 900; sandbox.render();
  if (cls('b-debt').indexOf('hit') < 0) throw new Error('负债条动了没闪：' + cls('b-debt'));
});

/* ---------- 欠账计数与欠账清算（2026-10-27） ---------- */
step('欠账计数：选带标记的一侧 +1，另一侧不加（且玩家看不到次数）', () => {
  sandbox.S.tut = 3; sandbox.reset();
  const c = sandbox.CARDS.find(x => x.id === 'fam_momcall_01');   // 左「嗯嗯两声」=欠账，右「回厨房看她」=在场
  sandbox.resolve(c, 'L');
  if (sandbox.S.miss.fam !== 1) throw new Error('欠账没记上：' + JSON.stringify(sandbox.S.miss));
  sandbox.resolve(c, 'R');
  if (sandbox.S.miss.fam !== 1) throw new Error('不欠账的那一侧也加数了：' + JSON.stringify(sandbox.S.miss));
  sandbox.render();
  const strip = getEl('strip').innerHTML;
  if (strip.indexOf('欠账') >= 0) throw new Error('HUD 里露了欠账计数：' + strip.slice(0, 120));
});

step('欠账清算：次数没到不出现，到了才来，两边效果一模一样', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.day = 60; sandbox.S.miss.fam = 2; sandbox.S._urgentCd = 0;
  let i = sandbox.urgentFind();
  if (i >= 0 && sandbox.CARDS[i].id === 'fam_momgone_01') throw new Error('才欠 2 次清算卡就来了');
  sandbox.S.miss.fam = 3;
  i = sandbox.urgentFind();
  if (i < 0 || sandbox.CARDS[i].id !== 'fam_momgone_01') throw new Error('欠够 3 次清算卡没来');
  const c = sandbox.CARDS[i];
  if (!c.fact) throw new Error('清算卡没标 fact');
  if (JSON.stringify(c.L.e) !== JSON.stringify(c.R.e))
    throw new Error('清算卡两边效果不一致，变成了假选择：' + JSON.stringify([c.L.e, c.R.e]));
});

step('清算之后这条线就关了：爸妈日常卡不再出现、整条分类从袋子里撤掉', () => {
  sandbox.S.tut = 3; sandbox.reset();
  const c = sandbox.CARDS.find(x => x.id === 'fam_momgone_01');
  sandbox.resolve(c, 'L');
  if (!sandbox.S.st.momgone) throw new Error('清算卡没关掉这条线');
  const mom = sandbox.CARDS.find(x => x.id === 'fam_momcall_01');
  if (sandbox.whenOK(mom.when)) throw new Error('老妈的日常卡还能出现：' + mom.when);
  sandbox.S.st.petgone = -1;
  sandbox.bagShuffle();
  const left = sandbox._bag.map(k => sandbox.CARDS[k]).filter(x => x.tag === '宠物');
  if (left.length) throw new Error('猫送走了，宠物卡还在袋子里：' + left.map(x => x.id).join(','));
});

step('伴侣清算卡只在婚前出现（婚后走离婚卡那条路）', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.day = 60; sandbox.S.miss.lover = 9; sandbox.S._urgentCd = 0;
  sandbox.S.did.fam_hunli_01 = 'l';
  const i = sandbox.urgentFind();
  if (i >= 0 && sandbox.CARDS[i].id === 'fam_gone_01') throw new Error('结过婚了还出「她搬走了」');
});

step('清算卡渲染成「既定事实」：有那行说明、两边都不标红绿', () => {
  const c = sandbox.CARDS.find(x => x.id === 'fam_momgone_01');
  const h = sandbox.build(c).innerHTML;
  if (h.indexOf('已经这样了') < 0) throw new Error('既定事实卡没有说明行：' + h.slice(-160));
  if (sandbox.build(c).className.indexOf('fact') < 0) throw new Error('既定事实卡没有 fact 类');
  const plain = sandbox.CARDS.find(x => x.id === 'fam_momcall_01');
  if (sandbox.build(plain).innerHTML.indexOf('已经这样了') >= 0) throw new Error('普通卡也被标成既定事实了');
});

/* ---------- 还款节点与老赖（2026-10-28 改规则） ----------
   月供节点 = 每月 5 号和 20 号。只要没全额还上（哪怕还了一大半），一次就上失信名单
   （laolai，debuff 挂到债还清为止）。老赖的惩罚：心态/社会每天掉、
   发薪日工资被划走 25%、只能借到一半的钱。 */
function payday(day, cash, debt, fired) {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.day = day; sandbox.S.cash = cash; sandbox.S.debt = debt;
  sandbox.S.equity = 0; sandbox.S.risk = 0; sandbox.S.mind = 60; sandbox.S.social = 60;
  if (fired) sandbox.S.st.fired = -1;                // 失业：5 号没有工资进来，才真的还不上
  return sandbox.tick();                             // 返回结算文案，供断言"只凑出多少"
}

step('还款节点：一次没还上，直接上失信名单', () => {
  payday(35, 0, 20000, true);                        // 第 35 天 = 5 号，没工资、没现金
  if (sandbox.S.arrears !== 1) throw new Error('逾期没记上：' + sandbox.S.arrears);
  if (!sandbox.S.st.laolai) throw new Error('一次还不上居然没成老赖');
});

step('还款节点：还了一大半但没还满，一样成老赖', () => {
  // 房租 6,600 先扣，剩 1,400 → 月供应还 2,400 只凑得出 1,400（不是 0，是真"还了一部分"）
  const m = payday(35, 8000, 20000, true);
  if (m.indexOf('只凑出') < 0 || m.indexOf('只凑出 ¥0') >= 0)
    throw new Error('没造出「还了一部分」的场景：' + m);
  if (!sandbox.S.st.laolai) throw new Error('还大半没还满居然放过他了');
  if (sandbox.S.arrears !== 1) throw new Error('逾期没记上：' + sandbox.S.arrears);
});

step('还款节点：全额还清不记逾期，记录翻篇', () => {
  payday(35, 6000, 20000);                           // 应还 2,400，还 6,000 → 全额
  if (sandbox.S.arrears !== 0) throw new Error('全额还清了怎么还有违约记录：' + sandbox.S.arrears);
  // 先攒一次违约，再全额还一次，记录应该被抹掉
  sandbox.S.arrears = 1;
  sandbox.S.day = 65; sandbox.S.debt = 20000; sandbox.S.cash = 6000;
  sandbox.tick();
  if (sandbox.S.arrears !== 0) throw new Error('全额还清后逾期记录没清零：' + sandbox.S.arrears);
});

step('老赖：发薪日工资被划走 25% 直接还债', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.day = 95; sandbox.S.debt = 30000; sandbox.S.cash = 0;
  sandbox.S.equity = 0; sandbox.S.st.laolai = -1;
  const m = sandbox.tick();
  // 工资的 25% 先被划走（同一天后续还会因为日用/月供再欠，
  // 所以不能拿"负债净减少"当断言，那样被后面的开支抵消掉了）
  const garnish = Math.round(sandbox.SALARY * 0.25).toLocaleString('en-US');
  if (m.indexOf('法院直接划走') < 0) throw new Error('老赖的工资没被划扣：' + m);
  if (m.indexOf(garnish) < 0) throw new Error('划扣金额不对（应是工资的 25% = ' + garnish + '）：' + m);
});

step('老赖：借钱只能借到一半', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.cash = 0; sandbox.S.debt = 0;
  sandbox.borrow(10000);
  if (sandbox.S.cash !== 10000) throw new Error('正常状态借钱就不对：' + sandbox.S.cash);
  sandbox.S.cash = 0; sandbox.S.debt = 0; sandbox.S.st.laolai = -1;
  sandbox.borrow(10000);
  if (sandbox.S.cash !== 5000) throw new Error('老赖怎么还借到了 ' + sandbox.S.cash);
  if (sandbox.S._borrowCut !== 5000) throw new Error('少借的那截没记账');
});

step('老赖：债还清自动解除名单', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.day = 40; sandbox.S.st.laolai = -1; sandbox.S.debt = 500; sandbox.S.cash = 0;
  sandbox.tick();
  sandbox.S.debt = 0;
  sandbox.tick();
  if (sandbox.S.st.laolai) throw new Error('债都还清了还挂在名单上');
  if (sandbox.S.arrears !== 0) throw new Error('解除后违约计数没归零');
});

step('老赖专属卡只在老赖时出现', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.day = 40;
  const card = sandbox.CARDS.find(x => x.id === 'debt_limit_01');
  if (sandbox.whenOK(card.when) !== false) throw new Error('不是老赖也能出限高卡');
  sandbox.S.st.laolai = -1;
  if (sandbox.whenOK(card.when) !== true) throw new Error('成了老赖却不出限高卡');
});

/* ---------- 消息（leak）：花钱买的内部渠道必须是真东西 ---------- */
step('消息：卡面上的 leak 能通过 resolve 挂到 S.leak', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.cash = 50000;
  const card = sandbox.CARDS.find(x => x.id === 'risk_scam_01');
  sandbox.resolve(card, 'R');
  if (!sandbox.S.leak) throw new Error('交了会费却没挂上消息');
  if (sandbox.S.leak.total !== 4) throw new Error('连板数没有带过来：' + JSON.stringify(sandbox.S.leak));
});

step('消息：兑现时真的连拉涨停（不是一句空话）', () => {
  sandbox.S.tut = 3; sandbox.reset();
  sandbox.S.st = {}; sandbox.S.cash = 50000; sandbox.S.debt = 0;
  sandbox.S.leak = { left: 6, p: 0.5, total: 3, run: 0 };      // p=0.5：一半真一半假，两种结局都合法
  let ups = 0;
  for (let i = 0; i < 10 && sandbox.S.leak; i++) {
    sandbox.S.day++; sandbox.tick();
    if (sandbox.S.intra.lim === 'up') ups++;
  }
  // p=0.5 的消息：要么兑现（连板），要么判假，不会悬着不结案
  if (sandbox.S.leak) throw new Error('10 天过去消息还挂着，没有结案');
  if (ups > 0 && ups !== 3) throw new Error('兑现了但连板数不对：' + ups);
});

step('消息：到期没兑现 = 假消息，风险与心态要付代价', () => {
  let settled = 0;
  for (let k = 0; k < 40; k++) {
    sandbox.S.tut = 3; sandbox.reset();
    sandbox.S.st = {}; sandbox.S.cash = 50000; sandbox.S.debt = 0;
    sandbox.S.leak = { left: 1, p: 0.999, total: 1, run: 0 };  // 99.9% 判假
    const r0 = sandbox.S.risk;
    sandbox.S.day++; sandbox.tick();
    if (!sandbox.S.leak && sandbox.S.risk >= r0 + 13) settled++;
  }
  if (settled < 36) throw new Error('假消息分支没正确结算：40 次只有 ' + settled + ' 次扣了风险');
});

console.log(fail ? '\n✗ UI 冒烟失败 ' + fail + ' 项\n' : '\n✓ UI 冒烟全绿\n');
process.exit(fail ? 1 : 0);
