#!/usr/bin/env node
/**
 * 卡池校验器 —— 改完 data/cards.json 必须先过这一关
 *
 * 用法：
 *   node tools/validate-cards.js               # 校验 data/cards.json，有问题退出码 1
 *   node tools/validate-cards.js 某文件.json    # 校验指定文件
 *   node tools/validate-cards.js --selftest    # 注入 8 个坏样例，8 类检查必须全部命中
 *
 * 设计：validateCards() 是自包含纯函数（无 require、无外部引用），
 *      因此可以被 build-manager.js 用 toString() 原样注入网页管理表，
 *      浏览器端与这里跑的是同一份逻辑，不会各写一遍后慢慢漂移。
 *
 * 8 类检查（对应 development-plan N1.3）：
 *   id          唯一且符合命名规则 ^[a-z]+(_[a-z]+){1,3}_[0-9]{2}$
 *   required    必填字段齐全
 *   when        条件语法可解析（含 v2 谓词 did: / seen: / pick:）
 *   effect-key  效果键在白名单内
 *   effect-range数值在合理区间
 *   text-len    文案字数（卡面 ≤31、选项 ≤11）
 *   did-ref     did: 引用的卡存在
 *   window      window 字段合法
 *
 * 第 9 类 choice（2026-10-21 加，L1 写作规则）：
 *   正文剧透选项 / 选项只碰 1 条数值 / 选项没有代价 / 两选项互相支配或完全相同
 *   —— 这是「决策感」的门禁，卡池里任何一张滑哪边都一样，玩法就少一张。
 */
'use strict';

/* ====================== 自包含校验核心（可注入浏览器） ====================== */
function validateCards(data) {
  var ISSUES = [];
  function err(rule, id, field, msg) { ISSUES.push({ rule: rule, id: id, field: field, msg: msg, level: 'error' }); }
  function warn(rule, id, field, msg) { ISSUES.push({ rule: rule, id: id, field: field, msg: msg, level: 'warn' }); }

  var TAGS = ['伴侣', '家人', '孩子', '宠物', '房子', '职场', '收入', '人情', '自己', '市场', '决策', '风险', '意外'];
  var STS = ['bubble', 'crisis', 'halt', 'baby', 'fired', 'insider', 'over', 'bull', 'bear',
             'momgone', 'childgone', 'petgone', 'lovergone'];   // 后四个：欠账清算后把整条线关掉
  var LINES = ['fam', 'child', 'pet', 'lover'];                 // 欠账计数：父母/孩子/宠物/伴侣
  var LINE_OF_TAG = { '家人': 'fam', '孩子': 'child', '宠物': 'pet', '伴侣': 'lover' };
  var STAT_KEYS = ['cash', 'equity', 'cost', 'mind', 'risk', 'social', 'day'];
  var WHEN_VARS = ['mind', 'social', 'risk', 'day', 'equity', 'cash', 'debt', 'cost', 'energy'];
  var MONEY_KEYS = ['spend', 'buy', 'sell', 'borrow', 'repay', 'cash', 'equity', 'cost'];
  var ID_RE = /^[a-z]+(_[a-z]+){1,3}_[0-9]{2}$/;

  var cards = (data && data.cards) || [];
  var ids = {};
  cards.forEach(function (c) { if (c && c.id) ids[c.id] = true; });

  // when 解析器：与 prototype.html 的 whenOK/andOK/oneCond/exprVal 语义一致，
  // 并扩展 v2 谓词 did:/seen:/pick:（引擎 N3 实装，校验先行）
  function parseWhen(w) {
    var problems = [];
    String(w).split('|').forEach(function (orGroup) {
      orGroup.split(/[;&]/).forEach(function (raw) {
        var t = raw.trim();
        if (!t) return;
        var m = t.match(/^no:has:(\w+)$/);        // 反向状态：这条线还没关（欠账清算后日常卡停出）
        if (m) {
          if (STS.indexOf(m[1]) < 0) problems.push('未知状态「' + m[1] + '」（可用：' + STS.join('/') + '）');
          return;
        }
        var m = t.match(/^(has|no):(\w+)$/);
        if (m) {
          if (STS.indexOf(m[2]) < 0) problems.push('未知状态「' + m[2] + '」（可用：' + STS.join('/') + '）');
          return;
        }
        m = t.match(/^(did):([\w]+)\.(l|r)$/i);
        if (m) { if (!ids[m[2]]) problems.push('did: 引用的卡「' + m[2] + '」不存在'); return; }
        m = t.match(/^(did):([\w]+)$/);
        if (m) { if (!ids[m[2]]) problems.push('did: 引用的卡「' + m[2] + '」不存在'); return; }
        m = t.match(/^(seen):([\w]+)$/);
        if (m) { if (!ids[m[2]]) problems.push('seen: 引用的卡「' + m[2] + '」不存在'); return; }
        m = t.match(/^no:did:([\w]+)$/);
        if (m) { if (!ids[m[1]]) problems.push('no:did: 引用的卡「' + m[1] + '」不存在'); return; }
        m = t.match(/^no:seen:([\w]+)$/);
        if (m) { if (!ids[m[1]]) problems.push('no:seen: 引用的卡「' + m[1] + '」不存在'); return; }
        m = t.match(/^(pick):([a-z]+)\s*(<=|>=|<|>)\s*(\d+)$/);
        if (m) { if (TAGS.indexOf(m[2]) < 0) problems.push('pick: 的 tag「' + m[2] + '」不在分类表里'); return; }
        /* 欠账计数比较：miss.fam>=3。故意不做显性显示，玩家看不到次数 */
        m = t.match(/^miss\.(\w+)\s*(<=|>=|<|>)\s*(\d+)$/);
        if (m) { if (LINES.indexOf(m[1]) < 0) problems.push('miss. 的线「' + m[1] + '」不在 ' + LINES.join('/') + ' 里'); return; }
        m = t.match(/^(\w+)\s*(<=|>=|<|>)\s*(.+)$/);
        if (m) {
          if (WHEN_VARS.indexOf(m[1]) < 0) { problems.push('未知属性「' + m[1] + '」（可用：' + WHEN_VARS.join(' ') + '）'); return; }
          var rv = m[3].trim();
          var mc = rv.match(/^cost\s*\*\s*([\d.]+)$/);
          if (mc) return;
          if (rv === 'cost') return;
          if (isNaN(parseFloat(rv)) || String(parseFloat(rv)) !== rv.replace(/^\+/, '')) {
            // 允许纯数字；其他一律报错（保守，和引擎 oneCond 的「无法识别=不满足」对齐）
            if (!/^-?[\d.]+$/.test(rv)) problems.push('比较右侧「' + rv + '」既不是数字也不是 cost 表达式');
          }
          return;
        }
        problems.push('无法解析的条件「' + t + '」');
      });
    });
    return problems;
  }

  function checkEffect(ruleId, side, eff) {
    for (var k in (eff || {})) {
      var v = eff[k];
      if (k === 'addst') {
        if (typeof v !== 'object' || Array.isArray(v)) { err('effect-key', ruleId, side + '.addst', 'addst 必须是 {状态:天数} 对象'); continue; }
        for (var s in v) {
          if (STS.indexOf(s) < 0) err('effect-key', ruleId, side + '.addst.' + s, '未知状态「' + s + '」');
          var d = v[s];
          if (typeof d !== 'number' || d === 0 || (!Number.isInteger(d)) || (d !== -1 && (d < 1 || d > 30)))
            err('effect-range', ruleId, side + '.addst.' + s, '状态天数应为 1..30 的整数或 -1（永久），当前 ' + d);
        }
        continue;
      }
      if (k === 'unst') {
        if (!Array.isArray(v)) { err('effect-key', ruleId, side + '.unst', 'unst 必须是状态名数组'); continue; }
        v.forEach(function (s) { if (STS.indexOf(s) < 0) err('effect-key', ruleId, side + '.unst', '未知状态「' + s + '」'); });
        continue;
      }
      if (MONEY_KEYS.indexOf(k) < 0 && ['mind', 'risk', 'social', 'energy'].indexOf(k) < 0) {
        err('effect-key', ruleId, side + '.' + k, '未知效果键「' + k + '」');
        continue;
      }
      if (typeof v !== 'number' || isNaN(v)) { err('effect-range', ruleId, side + '.' + k, '效果值必须是数字，当前 ' + v); continue; }
      if (k === 'sell') {
        if (v <= 0 || v > 1) err('effect-range', ruleId, side + '.sell', 'sell 是卖出比例，应在 (0,1]，当前 ' + v);
      } else if (k === 'mind' || k === 'risk' || k === 'social') {
        if (v === 0) warn('effect-range', ruleId, side + '.' + k, '加减 0 通常是无意义的占位，请确认');
        if (Math.abs(v) > 30) err('effect-range', ruleId, side + '.' + k, k + ' 单卡变动 |' + v + '| 超过 30');
      } else if (k === 'energy') {
        // 精力：花时间的选项（陪伴/私活/婚礼）扣，休息/早睡回；上限 100，单卡 ±35 为叙事上限（婚礼全天 −30/连续熬夜 +20 级别）
        if (v === 0) warn('effect-range', ruleId, side + '.energy', '精力加减 0 通常是无意义的占位，请确认');
        if (Math.abs(v) > 35) err('effect-range', ruleId, side + '.energy', 'energy 单卡变动 |' + v + '| 超过 35');
      } else if (['spend', 'buy', 'borrow', 'repay'].indexOf(k) >= 0) {
        if (v <= 0) err('effect-range', ruleId, side + '.' + k, k + ' 应为正数，当前 ' + v);
        // borrow 上限 65000：彩礼（60000）/首付（40000）级叙事债务是设计本意，高于 65000 才算手滑
        if (v > 65000) err('effect-range', ruleId, side + '.' + k, k + ' 数额 ' + v + ' 超过 65000，确认是否手滑');
      } else { // cash / equity / cost
        if (Math.abs(v) > 100000) err('effect-range', ruleId, side + '.' + k, k + ' 变动 ' + v + ' 超过 100000');
      }
    }
  }

  cards.forEach(function (c) {
    var id = (c && c.id) || '(无id)';

    /* 1. id */
    if (!c.id) err('id', id, 'id', '缺少 id');
    else {
      if (!ID_RE.test(c.id)) err('id', id, 'id', 'id「' + c.id + '」不符合命名规则：小写拼音_场景_两位序号，如 fam_mortgage_01');
      if (ids[c.id] !== true) err('id', id, 'id', 'id「' + c.id + '」重复'); // 用 seen 集合判重
    }

    /* 2. 必填字段 */
    ['who', 'avatar', 'tag', 'text', 'left', 'right'].forEach(function (k) {
      if (c[k] === undefined || c[k] === null || c[k] === '') err('required', id, k, '缺少必填字段 ' + k);
    });
    if (!c.whoId) warn('required', id, 'whoId', '缺少 whoId（N4 素材锚点），建议补上');
    if (TAGS.indexOf(c.tag) < 0) err('required', id, 'tag', 'tag「' + c.tag + '」不在分类表：' + TAGS.join('/'));
    ['left', 'right'].forEach(function (s) {
      var sd = c[s];
      if (!sd) return;
      if (!sd.label) err('required', id, s + '.label', s + ' 缺选项文案');
      var ef = sd.effects || {};
      var n = 0; for (var k in ef) n++;
      if (n === 0) err('required', id, s + '.effects', s + ' 没有任何效果');
      if (!sd.effects) err('required', id, s + '.effects', s + ' 缺 effects');
    });

    /* 3+7. when 语法 / did 引用 */
    if (c.when) parseWhen(c.when).forEach(function (p) {
      if (p.indexOf('引用') >= 0) err('did-ref', id, 'when', p);
      else err('when', id, 'when', p);
    });

    /* 4+5. 效果键与数值 */
    ['left', 'right'].forEach(function (s) { if (c[s]) checkEffect(id, s, c[s].effects); });

    /* 4.5 还钱卡必须挂负债条件：没欠过钱的玩家不该抽到「还钱」选项（2026-10-25 线上反馈） */
    var hasRepay = ['left', 'right'].some(function (s) {
      return c[s] && c[s].effects && c[s].effects.repay;
    });
    if (hasRepay && !(typeof c.when === 'string' && c.when.indexOf('debt') >= 0)) {
      err('effect-key', id, 'when', '卡面含 repay（还钱），但 when 没有负债条件（如 debt>0）——零负债玩家会抽到无法执行的还钱卡');
    }

    /* 4.6 同一侧不许既"买入"又"花钱"（2026-10-27 线上反馈）
       buy 只用现金、spend 现金不够就记账——写在同一侧，玩家读不出钱到底变成股票还是花掉了。
       「阿姨让你投五千」当初就写成纯 spend，于是系统卖股票凑钱，变成"卖股票买股票"。 */
    ['left', 'right'].forEach(function (s) {
      var e = c[s] && c[s].effects;
      if (!e || !e.buy) return;
      if (e.spend || e.repay) {
        err('effect-key', id, s, '同一侧既有 buy（买入）又有 ' + (e.spend ? 'spend（花钱）' : 'repay（还钱）') +
          '——钱到底是变成股票还是花掉了，玩家分不清。要买入就只写 buy，要花钱就只写 spend');
      }
    });

    /* alwaysStatus */
    if (c.alwaysStatus) {
      var as = c.alwaysStatus;
      if (typeof as !== 'object' || Array.isArray(as)) err('effect-key', id, 'alwaysStatus', '必须是 {状态:天数}');
      else for (var s2 in as) {
        if (STS.indexOf(s2) < 0) err('effect-key', id, 'alwaysStatus.' + s2, '未知状态「' + s2 + '」');
        var d2 = as[s2];
        if (typeof d2 !== 'number' || d2 === 0 || (d2 !== -1 && (d2 < 1 || d2 > 30)))
          err('effect-range', id, 'alwaysStatus.' + s2, '状态天数应为 1..30 或 -1，当前 ' + d2);
      }
    }

    /* 6. 文案长度 */
    if (c.text && [...c.text].length > 31) err('text-len', id, 'text', '卡面 ' + [...c.text].length + ' 字，超过 31（卡面放不下）');
    ['left', 'right'].forEach(function (s) {
      if (c[s] && c[s].label && [...c[s].label].length > 11)
        err('text-len', id, s + '.label', s + ' 选项 ' + [...c[s].label].length + ' 字，超过 11');
    });

    /* 8. window / weight / once / hidden */
    if (c.window !== undefined && c.window !== null) {
      var w = c.window;
      if (!Array.isArray(w) || w.length !== 2 || !Number.isInteger(w[0]) || !Number.isInteger(w[1]) ||
          w[0] < 1 || w[1] > 360 || w[0] > w[1])
        err('window', id, 'window', 'window 应为 [起,止]，1..360 的整数且起≤止（开放局上限 360），当前 ' + JSON.stringify(w));
    }
    if (c.weight !== undefined && (typeof c.weight !== 'number' || c.weight < 0.1 || c.weight > 10))
      err('window', id, 'weight', 'weight 应在 0.1..10，当前 ' + c.weight);
    if (c.once !== undefined && typeof c.once !== 'boolean') err('window', id, 'once', 'once 应为布尔值');
    if (c.hidden !== undefined && typeof c.hidden !== 'boolean') err('window', id, 'hidden', 'hidden 应为布尔值');
    /* urgent（2026-10-26 加）：关键卡不走袋子，条件满足就插队来问——所以必须带 when，
       否则一局从头问到底。目前只有「上岸」确认一张。 */
    if (c.urgent !== undefined) {
      if (typeof c.urgent !== 'boolean') err('window', id, 'urgent', 'urgent 应为布尔值');
      if (!c.when) err('window', id, 'when', 'urgent 卡必须带 when——它不走袋子，没有条件就会天天插队');
      if (!c.cap) warn('window', id, 'cap', 'urgent 卡建议设 cap（一局最多问几次），否则会反复插队');
    }
    /* miss（2026-10-27 加）：选项级欠账标记——选它就欠这条线一笔，引擎悄悄累加，
       玩家看不到次数。分类和线必须对得上，否则会出现「陪宠物却记了父母账」这种脏数据。 */
    ['left', 'right'].forEach(function (s) {
      var sd = c[s];
      if (!sd || sd.miss === undefined) return;
      if (LINES.indexOf(sd.miss) < 0)
        err('miss', id, s + '.miss', 'miss 只能是 ' + LINES.join('/') + '，当前「' + sd.miss + '」');
      else if (LINE_OF_TAG[c.tag] !== sd.miss)
        err('miss', id, s + '.miss', '分类「' + c.tag + '」不该记 ' + sd.miss + ' 的账（这张卡只能记 ' + (LINE_OF_TAG[c.tag] || '无') + '）');
    });
    if (c.left && c.right && c.left.miss && c.right.miss)
      err('miss', id, 'left/right.miss', '两边都记了欠账：这张卡没有「在场」的选法，不该算陪伴题');

    /* 事件自带状态：键必须在状态表里，天数为 -1（永久）或 1..30 */
    if (c.st !== undefined) {
      if (typeof c.st !== 'object' || Array.isArray(c.st)) err('effect-key', id, 'st', 'st 必须是 {状态:天数} 对象');
      else for (var sk in c.st) {
        if (STS.indexOf(sk) < 0) err('effect-key', id, 'st.' + sk, '未知状态「' + sk + '」');
        var sv = c.st[sk];
        if (typeof sv !== 'number' || (sv !== -1 && (sv < 1 || sv > 30)))
          err('effect-range', id, 'st.' + sk, '状态天数应为 1..30 或 -1（永久），当前 ' + sv);
      }
    }

    /* fact（2026-10-27 加）：既定事实卡——两边效果必须一模一样，作用只是告诉玩家
       「这事已经这样了」。所以它天然是伪选择，这里明令豁免，同时用规则保证两边真的相等，
       免得以后有人偷偷把一边改成「还有救」，把既定事实又变回一个假选择。 */
    if (c.fact !== undefined) {
      if (typeof c.fact !== 'boolean') err('fact', id, 'fact', 'fact 应为布尔值');
      if (!c.urgent) err('fact', id, 'urgent', 'fact 卡必须 urgent——条件够了就该自己插队出现');
      if (c.cap !== 1) err('fact', id, 'cap', 'fact 卡必须 cap:1——既定事实只说一次');
      if (!c.when) err('fact', id, 'when', 'fact 卡必须带 when，否则一局从头说到尾');
      if (c.left && c.right) {
        var la = c.left.effects || {}, ra = c.right.effects || {};
        var keys = Object.keys(la).concat(Object.keys(ra)).filter(function (k, i, arr) { return arr.indexOf(k) === i; });
        var diff = keys.filter(function (k) { return (la[k] || 0) !== (ra[k] || 0); });
        if (diff.length) err('fact', id, 'left/right', 'fact 卡两边效果必须完全相同（既定事实，没有选择），不一致的字段：' + diff.join(','));
        if (c.left.miss || c.right.miss) err('fact', id, 'left.miss', 'fact 卡不该标 miss——它不是在场的取舍');
      }
    }

    /* 9. choice 决策质量（L1 写作规则，2026-10-21 加）          ① 正文不得包含选项原文（正文替玩家做选择 = 剧透，选择张力归零）
          ② 每个选项至少触及 2 条数值（只碰心态/社会 = 金钱风险全程缺席）
          ③ 每个选项至少 1 条下降（禁止「全赚不赔」）
          ④ 两选项不得互相支配，也不得完全相同（滑哪边都一样 = 伪选择）
       交易类（buy/sell/borrow/repay）与状态类（addst/unst）不参与④的自动判定，
       因为它们的真实成本是非线性的（如 sell 0.5 同时降敞口、降风险、还债）。 */
    var SPOILER_SKIP = ['·'];
    ['left', 'right'].forEach(function (s) {
      var sd = c[s];
      if (!sd || !sd.label || !c.text) return;
      var lb = String(sd.label).trim();
      if (lb.length >= 2 && SPOILER_SKIP.indexOf(lb) < 0 && String(c.text).indexOf(lb) >= 0)
        err('choice', id, s + '.label', '正文里出现了选项原文「' + lb + '」——正文在替玩家做选择，改成只给情境');
    });
    ['left', 'right'].forEach(function (s) {
      var sd = c[s];
      if (!sd || !sd.effects) return;
      var e = sd.effects;
      var dims = 0;
      for (var k in e) { if (k === 'addst' || k === 'unst') continue; if (e[k]) dims++; }
      if (dims < 2) err('choice', id, s + '.effects', s + ' 只触及 ' + dims + ' 条数值（要求 ≥2）：' + JSON.stringify(e));
      var down = (e.spend || 0) > 0 || (e.buy || 0) > 0 || (e.borrow || 0) > 0 ||
                 (e.repay || 0) > 0 || (e.risk || 0) > 0 || (e.mind || 0) < 0 ||
                 (e.social || 0) < 0 || (e.cash || 0) < 0 || (e.equity || 0) < 0 ||
                 (e.energy || 0) < 0;
      if (!down) err('choice', id, s + '.effects', s + ' 是一个「全赚不赔」选项，必须至少付出一条代价');
    });
    (function () {
      var L = c.left && c.left.effects, R = c.right && c.right.effects;
      if (!L || !R) return;
      if (c.fact) return;                       // 既定事实卡两边本来就一样，见上面 fact 规则
      var txn = ['buy', 'sell', 'borrow', 'repay'].some(function (k) { return L[k] !== undefined || R[k] !== undefined; });
      if (txn || L.addst || R.addst || L.unst || R.unst) return;
      var vec = function (e) {
        return { money: (e.cash || 0) - (e.spend || 0), mind: e.mind || 0, risk: -(e.risk || 0), social: e.social || 0, energy: e.energy || 0 };
      };
      var a = vec(L), b = vec(R), ge = true, le = true, same = true;
      ['money', 'mind', 'risk', 'social', 'energy'].forEach(function (k) {
        if (a[k] > b[k]) { le = false; same = false; }
        if (a[k] < b[k]) { ge = false; same = false; }
      });
      if (same) err('choice', id, 'left/right', '两个选项效果完全相同，滑哪边都一样');
      else if (ge) err('choice', id, 'right', '左选项全面支配右选项（每个维度都不差），右选项是摆设');
      else if (le) err('choice', id, 'left', '右选项全面支配左选项（每个维度都不差），左选项是摆设');
    })();

  });

  // id 判重（第二轮，避免第一轮里的 ids 集合被自身覆盖逻辑干扰）
  var seen = {};
  cards.forEach(function (c) {
    if (!c || !c.id) return;
    if (seen[c.id]) err('id', c.id, 'id', 'id「' + c.id + '」重复出现');
    seen[c.id] = true;
  });

  return ISSUES;
}

/* ====================== 模块导出（build-manager.js 会把 validateCards 注入网页） ====================== */
module.exports = { validateCards };

/* ====================== CLI ====================== */
function main() {
  var fs = require('fs');
  var path = require('path');
  var args = process.argv.slice(2);
  var selftest = args.indexOf('--selftest') >= 0;
  var file = args.find(function (a) { return a !== '--selftest'; }) ||
             path.join(__dirname, '..', 'data', 'cards.json');

  var data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    console.error('✗ 读不了 ' + file + '：' + e.message);
    process.exit(1);
  }

  var issues = validateCards(data);
  var errors = issues.filter(function (i) { return i.level === 'error'; });
  var warns = issues.filter(function (i) { return i.level === 'warn'; });

  if (selftest) { selfTest(validateCards, data); return; }

  if (errors.length === 0 && warns.length === 0) {
    console.log('✓ 校验通过：' + data.cards.length + ' 张卡，9 类检查全绿');
    return;
  }
  issues.forEach(function (i) {
    console.log((i.level === 'error' ? '  ✗ ' : '  ⚠ ') + '[' + i.rule + '] ' + i.id + ' · ' + i.field + ' — ' + i.msg);
  });
  console.log(errors.length + ' 个错误，' + warns.length + ' 个提醒（共 ' + data.cards.length + ' 张卡）');
  process.exit(errors.length ? 1 : 0);
}

/* --selftest：注入 8 个坏样例，8 类检查必须全部命中，否则判失败 */
function selfTest(validateCards, goodData) {
  var RULES = ['id', 'required', 'when', 'effect-key', 'effect-range', 'text-len', 'did-ref', 'window', 'choice'];
  function clone(d) { return JSON.parse(JSON.stringify(d)); }
  function make(mutate) {
    var d = clone(goodData);
    mutate(d);
    return d;
  }
  var bad = [
    { rule: 'id', file: make(function (d) { d.cards[1].id = d.cards[0].id; }) },                 // id 重复
    { rule: 'id', file: make(function (d) { d.cards[0].id = 'C001_x'; }) },                      // id 格式
    { rule: 'required', file: make(function (d) { delete d.cards[0].text; }) },                  // 缺字段
    { rule: 'when', file: make(function (d) { d.cards[0].when = 'mimd<30'; }) },                 // when 语法
    { rule: 'effect-key', file: make(function (d) { d.cards[0].right.effects.mimd = 5; }) },     // 效果键
    { rule: 'effect-range', file: make(function (d) { d.cards[0].left.effects.mind = -99; }) },  // 数值
    { rule: 'text-len', file: make(function (d) { d.cards[0].text = '这是一段远远超过三十一个字上限的卡面文案，用来验证字数检查是否真的会拦截超长文案不说别的。'; }) },
    { rule: 'did-ref', file: make(function (d) { d.cards[0].when = 'did:no_such_card_99.r'; }) },// 引用
    { rule: 'window', file: make(function (d) { d.cards[0].window = [45, 7]; }) },               // window
    { rule: 'choice', file: make(function (d) {                                                  // 全赚不赔 + 支配
        d.cards[0].left.effects = { mind: 3, social: 2 };
        d.cards[0].right.effects = { mind: 5, social: 4 };
      }) },
    { rule: 'choice', file: make(function (d) {                                                  // 正文剧透
        d.cards[0].text = '这个月房贷 6,800。先拖两天还是出 5,500？';
      }) },
  ];

  var missed = [];
  bad.forEach(function (b) {
    var issues = validateCards(b.file);
    var hit = issues.some(function (i) { return i.rule === b.rule && i.level === 'error'; });
    console.log((hit ? '  ✓' : '  ✗') + ' [' + b.rule + '] 坏样例' + (hit ? '被拦截' : '漏检！'));
    if (!hit) missed.push(b.rule);
  });
  // 干净数据必须零错误（防止校验器误伤）
  var clean = validateCards(goodData).filter(function (i) { return i.level === 'error'; });
  console.log((clean.length === 0 ? '  ✓' : '  ✗') + ' 真实数据零误报（' + clean.length + ' 个错误）');
  if (clean.length) missed.push('误报');

  if (missed.length) { console.error('✗ 自检失败：' + missed.join(', ')); process.exit(1); }
  console.log('✓ 自检通过：' + bad.length + ' 个坏样例全部拦截，真实数据无误报');
}

if (require.main === module) main();
