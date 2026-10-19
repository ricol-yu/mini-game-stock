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
 */
'use strict';

/* ====================== 自包含校验核心（可注入浏览器） ====================== */
function validateCards(data) {
  var ISSUES = [];
  function err(rule, id, field, msg) { ISSUES.push({ rule: rule, id: id, field: field, msg: msg, level: 'error' }); }
  function warn(rule, id, field, msg) { ISSUES.push({ rule: rule, id: id, field: field, msg: msg, level: 'warn' }); }

  var TAGS = ['家庭', '职场', '收入', '人情', '自己', '市场', '决策', '风险', '意外'];
  var STS = ['bubble', 'crisis', 'halt', 'baby', 'fired', 'insider', 'over'];
  var STAT_KEYS = ['cash', 'equity', 'cost', 'mind', 'risk', 'social', 'day'];
  var WHEN_VARS = ['mind', 'social', 'risk', 'day', 'equity', 'cash', 'debt', 'cost'];
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
        var m = t.match(/^(has|no):(\w+)$/);
        if (m) {
          if (STS.indexOf(m[2]) < 0) problems.push('未知状态「' + m[2] + '」（可用：' + STS.join('/') + '）');
          return;
        }
        m = t.match(/^(did):([\w]+)\.(l|r)$/i);
        if (m) { if (!ids[m[2]]) problems.push('did: 引用的卡「' + m[2] + '」不存在'); return; }
        m = t.match(/^(seen):([\w]+)$/);
        if (m) { if (!ids[m[2]]) problems.push('seen: 引用的卡「' + m[2] + '」不存在'); return; }
        m = t.match(/^(pick):([a-z]+)\s*(<=|>=|<|>)\s*(\d+)$/);
        if (m) { if (TAGS.indexOf(m[2]) < 0) problems.push('pick: 的 tag「' + m[2] + '」不在分类表里'); return; }
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
      if (MONEY_KEYS.indexOf(k) < 0 && ['mind', 'risk', 'social'].indexOf(k) < 0) {
        err('effect-key', ruleId, side + '.' + k, '未知效果键「' + k + '」');
        continue;
      }
      if (typeof v !== 'number' || isNaN(v)) { err('effect-range', ruleId, side + '.' + k, '效果值必须是数字，当前 ' + v); continue; }
      if (k === 'sell') {
        if (v <= 0 || v > 1) err('effect-range', ruleId, side + '.sell', 'sell 是卖出比例，应在 (0,1]，当前 ' + v);
      } else if (k === 'mind' || k === 'risk' || k === 'social') {
        if (v === 0) warn('effect-range', ruleId, side + '.' + k, '加减 0 通常是无意义的占位，请确认');
        if (Math.abs(v) > 30) err('effect-range', ruleId, side + '.' + k, k + ' 单卡变动 |' + v + '| 超过 30');
      } else if (['spend', 'buy', 'borrow', 'repay'].indexOf(k) >= 0) {
        if (v <= 0) err('effect-range', ruleId, side + '.' + k, k + ' 应为正数，当前 ' + v);
        if (v > 30000) err('effect-range', ruleId, side + '.' + k, k + ' 数额 ' + v + ' 超过 30000，确认是否手滑');
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
          w[0] < 1 || w[1] > 60 || w[0] > w[1])
        err('window', id, 'window', 'window 应为 [起,止]，1..60 的整数且起≤止，当前 ' + JSON.stringify(w));
    }
    if (c.weight !== undefined && (typeof c.weight !== 'number' || c.weight < 0.1 || c.weight > 10))
      err('window', id, 'weight', 'weight 应在 0.1..10，当前 ' + c.weight);
    if (c.once !== undefined && typeof c.once !== 'boolean') err('window', id, 'once', 'once 应为布尔值');
    if (c.hidden !== undefined && typeof c.hidden !== 'boolean') err('window', id, 'hidden', 'hidden 应为布尔值');
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
    console.log('✓ 校验通过：' + data.cards.length + ' 张卡，8 类检查全绿');
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
  var RULES = ['id', 'required', 'when', 'effect-key', 'effect-range', 'text-len', 'did-ref', 'window'];
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
  console.log('✓ 自检通过：9 个坏样例全部拦截，真实数据无误报');
}

if (require.main === module) main();
