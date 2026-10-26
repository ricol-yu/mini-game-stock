#!/usr/bin/env node
/**
 * 真源反转：data/cards.json  →  prototype.html
 *
 * 用法：node tools/sync-json-to-prototype.js
 *
 * 架构约定（重要）：
 *   改了 data/cards.json 之后跑这个脚本，把卡池重新写回 prototype.html 的
 *   CARDS 数组里。prototype 仍然保持"单文件自包含、双击即玩"，
 *   但内容由 JSON 驱动 —— 这样配置表才是唯一真源，不会再出现
 *   "改了配置但 prototype 没跟上"的静默漂移。
 *
 *   反向（prototype → json）用 tools/extract-cards.js，仅作救急核对。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'cards.json');
const TARGET = path.join(ROOT, 'prototype.html');

const data = JSON.parse(fs.readFileSync(SRC, 'utf8'));

const j = v => JSON.stringify(v);

function effStr(e) {
  const parts = [];
  for (const k of Object.keys(e || {})) parts.push(k + ':' + j(e[k]));
  return '{' + parts.join(',') + '}';
}
function sideStr(sd) {
  return '{s:' + j(sd.label) + ',e:' + effStr(sd.effects || {}) + '}';
}

const lines = data.cards.map(c => {
  let head = ' {who:' + j(c.who) + ',av:' + j(c.avatar) + ',tag:' + j(c.tag);
  if (c.when) head += ',when:' + j(c.when);
  if (c.window) head += ',win:' + j(c.window);   // [起,止]：关联卡/时机卡的出场窗口
  if (c.cap) head += ',cap:' + c.cap;            // 一局最多出几次（缺省：关联卡 1、普通卡 2）
  if (c.pri) head += ',pri:' + c.pri;            // 插队优先级（数大先出），用于「婚后必须尽快来的节点卡」
  head += ',txt:' + j(c.text) + ',';
  let body = '';
  if (c.alwaysStatus) body += '\n  st:' + effStr(c.alwaysStatus) + ',';
  body += '\n  R:' + sideStr(c.right) + ',L:' + sideStr(c.left) + '},';
  return head + body;
});

const newBlock = 'CARDS = [\n' + lines.join('\n') + '\n];';

let html = fs.readFileSync(TARGET, 'utf8');

// 锚点必须带前导换行 '\\n'：
//   'CARDS = [' 恰好是变量声明 'CARDS = []' 的前缀子串，
//   若不带 \\n，indexOf 会命中变量声明处，导致从声明到数组结尾之间的
//   函数定义被整段删掉（曾真实发生过，整个 prototype 被写空）。
const anchor = '\nCARDS = [';
const at = html.indexOf(anchor);
if (at < 0) { console.error('✗ prototype.html 里找不到 "\\nCARDS = ["'); process.exit(1); }
const start = at + 1;                       // 指向 'C'
const endMark = '\n];';
const end = html.indexOf(endMark, start);
if (end < 0) { console.error('✗ 找不到 CARDS 数组结尾'); process.exit(1); }

const oldLen = (end + endMark.length) - start;
let next = html.slice(0, start) + newBlock + html.slice(end + endMark.length);

/* 防御：替换后必须仍能看到这些关键函数，否则说明切错了范围，绝不落盘 */
const MUST_HAVE = ['function whenOK', 'function tick', 'function resolve', 'function apply', 'function reset',
                   'function bagShuffle', 'function pick', 'function deckBack'];
const lost = MUST_HAVE.filter(f => next.indexOf(f) < 0);
if (lost.length) {
  console.error('✗ 安全检查失败：替换后丢失了关键函数 ' + lost.join(', '));
  console.error('  已中止，prototype.html 未被修改。请检查 CARDS 数组边界。');
  process.exit(1);
}

fs.writeFileSync(TARGET, next, 'utf8');
console.log('✓ 已同步 ' + data.cards.length + ' 张卡 → prototype.html');
console.log('  CARDS 块：' + oldLen + ' 字节 → ' + newBlock.length + ' 字节');
console.log('  安全检查：关键函数 ' + MUST_HAVE.length + ' 个均在（未误删代码）');
