#!/usr/bin/env node
/**
 * 生成卡牌可视化管理表 tools/cards-manager.html
 *
 * 用法：node tools/build-manager.js
 *
 * 为什么要"生成"而不是直接写一个静态页面？
 *   因为浏览器在 file:// 协议下用 fetch 读本地 JSON 会被 CORS 拦截。
 *   所以把当前卡池数据直接内嵌进页面里，双击打开即可看到并编辑全部数值，
 *   改完点"导出 JSON"下载，覆盖 data/cards.json 即可。
 *   同时也支持"导入 JSON"重新加载，方便核对。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'cards.json');
const OUT = path.join(ROOT, 'tools', 'cards-manager.html');

const raw = fs.readFileSync(SRC, 'utf8');
const data = JSON.parse(raw);

/* ---------- 列定义：这就是"能看见的全部参数" ---------- */
const NUM_EFFECTS = ['spend', 'buy', 'sell', 'borrow', 'repay', 'cash', 'mind', 'risk', 'social'];
const COLS = [
  { k: 'id',   t: 'ID',   w: 58,  ro: true },
  { k: 'who',  t: '谁',   w: 78 },
  { k: 'avatar', t: '头像', w: 48 },
  { k: 'tag',  t: '分类', w: 62 },
  { k: 'text', t: '卡面文案', w: 250 },
  { k: 'when', t: '出现条件', w: 128, hint: '如 no:baby / mind<30 / has:fired; social>52' },
  { k: 'alwaysStatus', t: '自带状态', w: 88, hint: '如 fired:-1' },
];
['L', 'R'].forEach(side => {
  const p = side === 'L' ? '左' : '右';
  COLS.push({ k: side + '_label', t: p + '·文案', w: 140 });
  NUM_EFFECTS.forEach(f => {
    COLS.push({ k: side + '_' + f, t: p + '·' + f, w: 62, num: true });
  });
  COLS.push({ k: side + '_addst', t: p + '·加状态', w: 82, hint: '如 baby:-1' });
  COLS.push({ k: side + '_unst',  t: p + '·清状态', w: 78, hint: '如 fired' });
});

/* ---------- 扁平化：嵌套 JSON → 表格行 ---------- */
function flat(cards) {
  return cards.map(c => {
    const row = {
      id: c.id, who: c.who, avatar: c.avatar, tag: c.tag,
      text: c.text, when: c.when || '', alwaysStatus: fmtSt(c.alwaysStatus)
    };
    ['left', 'right'].forEach((side, i) => {
      const s = (i === 0 ? 'L' : 'R');
      const sd = c[side] || {};
      const ef = sd.effects || {};
      row[s + '_label'] = sd.label || '';
      NUM_EFFECTS.forEach(f => { row[s + '_' + f] = (ef[f] === undefined ? '' : ef[f]); });
      row[s + '_addst'] = fmtSt(ef.addst);
      row[s + '_unst'] = Array.isArray(ef.unst) ? ef.unst.join(',') : (ef.unst || '');
    });
    return row;
  });
}
function fmtSt(o) {
  if (!o || typeof o !== 'object') return '';
  return Object.keys(o).map(k => k + ':' + o[k]).join('; ');
}

/* ---------- 反扁平化：表格行 → 嵌套 JSON ----------
   注意：这几个函数与 flat() 一样，只在 Node 端定义一次，
   再用 toString() 注入进生成的 HTML，保证浏览器端与这里完全同源，
   不会出现"两份逻辑各写一遍、慢慢漂移"的问题。 */
function parseSt(s){
  s = String(s == null ? '' : s).trim();
  if(!s) return null;
  const o = {};
  s.split(/[;,]/).forEach(part => {
    const m = part.trim().match(/^([\w]+)\s*:/);
    if(m){ const v = part.split(':')[1]; o[m[1]] = Number(String(v).trim()); }
  });
  return Object.keys(o).length ? o : null;
}
function buildSide(r, s){
  const side = { label: r[s + '_label'] || '', effects: {} };
  NUM_EFFECTS.forEach(f => {
    const v = r[s + '_' + f];
    if(v !== '' && v != null && !isNaN(Number(v))) side.effects[f] = Number(v);
  });
  const addst = parseSt(r[s + '_addst']);
  if(addst) side.effects.addst = addst;
  const unst = String(r[s + '_unst'] == null ? '' : r[s + '_unst']).trim();
  if(unst) side.effects.unst = unst.split(/[,\s]+/).filter(Boolean);
  return side;
}
function unflat(rows){
  return rows.map(r => {
    const card = { id:r.id, who:r.who, avatar:r.avatar, tag:r.tag, text:r.text };
    card.when = String(r.when == null ? '' : r.when).trim() || null;
    card.alwaysStatus = parseSt(r.alwaysStatus);
    card.left = buildSide(r, 'L');
    card.right = buildSide(r, 'R');
    return card;
  });
}

const rows = flat(data.cards);

/* ---------- 自检：往返必须无损 ----------
   用深比较而不是 JSON.stringify 直接比：effects 里的键顺序在重建后会按固定顺序排列，
   但 JS 对象的键顺序不影响语义，所以只比"内容是否一致"。 */
function deepEq(a, b){
  if(a === b) return true;
  if(a === null || b === null) return false;
  if(typeof a !== 'object' || typeof b !== 'object') return false;
  if(Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if(ka.length !== kb.length) return false;
  for(const k of ka){
    if(!Object.prototype.hasOwnProperty.call(b, k)) return false;
    if(!deepEq(a[k], b[k])) return false;
  }
  return true;
}
(function selfTest(){
  const back = unflat(rows);
  let bad = 0;
  data.cards.forEach((c, i) => {
    if(!deepEq(c, back[i])){
      bad++;
      if(bad <= 3){
        console.log('    ' + c.id + ' ' + c.who);
        console.log('      原: ' + JSON.stringify(c));
        console.log('      回: ' + JSON.stringify(back[i]));
      }
    }
  });
  if(bad === 0){
    console.log('  往返自检：✅ 无损（' + rows.length + ' 张卡逐张深比较，键顺序不计）');
  }else{
    console.log('  往返自检：❌ 有 ' + bad + ' 张卡往返不一致（上方为前 3 张）');
    process.exitCode = 1;
  }
})();

/* ---------- 生成页面 ---------- */
const tagList = [...new Set(rows.map(r => r.tag))].sort();

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>韭菜之王 · 卡牌数值管理表</title>
<style>
  :root{ --bg:#faf9f7; --line:#e3e0da; --hd:#f2efe9; --accent:#8a6d3b; --hot:#fff8e6; }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:#2b2b2b;
        font:13px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif; }
  header{ padding:14px 18px; border-bottom:1px solid var(--line); background:#fff; }
  h1{ margin:0 0 4px; font-size:16px; font-weight:600; }
  .sub{ color:#8a8578; font-size:12px; }
  .toolbar{ display:flex; gap:8px; align-items:center; flex-wrap:wrap;
            padding:10px 18px; background:#fff; border-bottom:1px solid var(--line);
            position:sticky; top:0; z-index:5; }
  select,input[type=text]{ padding:5px 8px; border:1px solid var(--line); border-radius:5px;
                          background:#fff; font-size:12px; }
  input[type=text]{ width:190px; }
  button{ padding:5px 12px; border:1px solid var(--accent); border-radius:5px;
          background:var(--accent); color:#fff; font-size:12px; cursor:pointer; }
  button.ghost{ background:#fff; color:var(--accent); }
  button:hover{ opacity:.85; }
  .stat{ margin-left:auto; color:#8a8578; font-size:12px; }
  .tablewrap{ overflow:auto; max-height:calc(100vh - 132px); }
  table{ border-collapse:collapse; white-space:nowrap; }
  th,td{ border:1px solid var(--line); padding:0; }
  thead th{ position:sticky; top:0; background:var(--hd); font-weight:600;
            font-size:11px; padding:6px 6px; text-align:left; cursor:pointer; z-index:2; }
  thead th.nosort{ cursor:default; }
  thead th:hover:not(.nosort){ background:#e8e3d8; }
  tbody td{ background:#fff; }
  tbody tr:hover td{ background:var(--hot); }
  td input{ width:100%; border:0; padding:5px 6px; font:inherit; background:transparent;
            box-sizing:border-box; }
  td input:focus{ outline:2px solid var(--accent); outline-offset:-2px; background:#fff; }
  td input.num{ text-align:right; font-variant-numeric:tabular-nums; }
  td input.num.pos{ color:#c0392b; }   /* 正数为红（增益/加值） */
  td input.num.neg{ color:#27865a; }   /* 负数为绿 */
  td.id{ background:#f7f5f1; color:#a09889; font-size:11px; padding:5px 6px; }
  .tip{ padding:8px 18px; color:#8a8578; font-size:11.5px; background:#fffdf8;
        border-top:1px solid var(--line); }
  code{ background:#f0ede6; padding:1px 4px; border-radius:3px; font-size:11px; }
</style>
</head>
<body>
<header>
  <h1>韭菜之王 · 卡牌数值管理表</h1>
  <div class="sub">共 ${rows.length} 张卡 · 数据源 <code>data/cards.json</code> · 生成于 ${new Date().toLocaleString('zh-CN')}
    —— 改完点「导出 JSON」，覆盖回 data/cards.json 即可</div>
</header>

<div class="toolbar">
  <select id="fTag"><option value="">全部分类</option>${tagList.map(t => `<option>${t}</option>`).join('')}</select>
  <input type="text" id="fSearch" placeholder="搜索 文案 / 人物 / 条件">
  <button class="ghost" id="btnReset">重置筛选</button>
  <button id="btnExport">导出 JSON</button>
  <button class="ghost" id="btnImport">导入 JSON</button>
  <input type="file" id="fileIn" accept=".json" style="display:none">
  <span class="stat" id="stat"></span>
</div>

<div class="tablewrap">
  <table id="tbl">
    <thead><tr id="headRow"></tr></thead>
    <tbody id="bodyRows"></tbody>
  </table>
</div>

<div class="tip">
  <b>怎么填：</b>
  数值列留空 = 这项不生效；填 0 = 真的加/减 0。
  <code>出现条件</code> 写法：<code>no:baby</code>（无此状态）、<code>has:fired</code>（有此状态）、
  <code>mind&lt;30</code>、<code>equity&gt;cost</code>（浮盈）、<code>equity&lt;cost*0.85</code>；
  多个条件「且」用 <code>;</code>、「或」用 <code>|</code>，如 <code>has:fired; social&gt;52</code>。
  <code>加状态</code> 填 <code>baby:-1</code>（-1 表示永久）；<code>清状态</code> 填状态名，多个用逗号。
  <b>点表头可排序。</b>
</div>

<script>
const COLS = ${JSON.stringify(COLS)};
const NUM_EFFECTS = ${JSON.stringify(NUM_EFFECTS)};
${fmtSt.toString()}
${flat.toString()}
let ROWS = ${JSON.stringify(rows)};
const ORIGINAL = JSON.parse(JSON.stringify(ROWS));
let sortKey = null, sortDir = 1, dirty = 0;

const NUMK = COLS.filter(c => c.num).map(c => c.k);

function headCell(c){
  const th = document.createElement('th');
  th.style.minWidth = c.w + 'px';
  th.textContent = c.t + (sortKey === c.k ? (sortDir > 0 ? ' ▲' : ' ▼') : '');
  th.title = c.hint || '';
  if(c.k === 'id'){ th.className = 'nosort'; return th; }
  th.onclick = () => {
    if(sortKey === c.k) sortDir = -sortDir; else { sortKey = c.k; sortDir = (c.num ? -1 : 1); }
    render();
  };
  return th;
}

function view(){
  const tag = document.getElementById('fTag').value;
  const q = document.getElementById('fSearch').value.trim().toLowerCase();
  let r = ROWS.filter(x => (!tag || x.tag === tag));
  if(q) r = r.filter(x => (x.text + ' ' + x.who + ' ' + (x.when||'') + ' ' +
        x.L_label + ' ' + x.R_label).toLowerCase().includes(q));
  if(sortKey){
    r = r.slice().sort((a,b) => {
      let x = a[sortKey], y = b[sortKey];
      if(typeof x === 'number' && typeof y === 'number') return (x - y) * sortDir;
      x = String(x == null ? '' : x); y = String(y == null ? '' : y);
      return x.localeCompare(y, 'zh') * sortDir;
    });
  }
  return r;
}

function render(){
  const hr = document.getElementById('headRow');
  hr.innerHTML = '';
  COLS.forEach(c => hr.appendChild(headCell(c)));

  const tb = document.getElementById('bodyRows');
  tb.innerHTML = '';
  const rows = view();
  rows.forEach(row => {
    const tr = document.createElement('tr');
    COLS.forEach(c => {
      const td = document.createElement('td');
      if(c.k === 'id'){ td.className = 'id'; td.textContent = row.id; tr.appendChild(td); return; }
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = (row[c.k] == null ? '' : row[c.k]);
      inp.title = c.hint || '';
      if(c.num){
        inp.className = 'num';
        const v = parseFloat(inp.value);
        if(!isNaN(v) && v > 0) inp.classList.add('pos');
        if(!isNaN(v) && v < 0) inp.classList.add('neg');
      }
      inp.oninput = () => {
        let v = inp.value;
        if(c.num){
          if(v === '' ){ row[c.k] = ''; }
          else { const n = Number(v); row[c.k] = isNaN(n) ? v : n; }
          inp.className = 'num';
          const n = parseFloat(v);
          if(!isNaN(n) && n > 0) inp.classList.add('pos');
          if(!isNaN(n) && n < 0) inp.classList.add('neg');
        } else row[c.k] = v;
        markDirty();
      };
      td.appendChild(inp);
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  document.getElementById('stat').textContent =
    '显示 ' + rows.length + ' / ' + ROWS.length + ' 张' + (isDirty() ? ' · 已修改未导出' : '');
}

function markDirty(){
  dirty = JSON.stringify(ROWS) === JSON.stringify(ORIGINAL) ? 0 : 1;
  document.getElementById('stat').textContent =
    '显示 ' + view().length + ' / ' + ROWS.length + ' 张' + (dirty ? ' · 已修改未导出' : '');
}
function isDirty(){ return dirty === 1; }

${parseSt.toString()}
${buildSide.toString()}
${unflat.toString()}

function download(){
  const out = {
    version: ${JSON.stringify(data.version)},
    source: 'data/cards.json',
    total: ROWS.length,
    cards: unflat(ROWS)
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'cards.json';
  a.click();
  URL.revokeObjectURL(a.href);
}

document.getElementById('fTag').onchange = render;
document.getElementById('fSearch').oninput = render;
document.getElementById('btnReset').onclick = () => {
  document.getElementById('fTag').value = '';
  document.getElementById('fSearch').value = '';
  sortKey = null; render();
};
document.getElementById('btnExport').onclick = download;
document.getElementById('btnImport').onclick = () => document.getElementById('fileIn').click();
document.getElementById('fileIn').onchange = e => {
  const f = e.target.files[0]; if(!f) return;
  const rd = new FileReader();
  rd.onload = () => {
    try{
      const j = JSON.parse(rd.result);
      const cards = Array.isArray(j) ? j : (j.cards || []);
      if(!cards.length) throw new Error('没有卡牌数据');
      ROWS = flat(cards);
      render();
      alert('已载入 ' + ROWS.length + ' 张卡');
    }catch(err){ alert('导入失败：' + err.message); }
  };
  rd.readAsText(f);
};
render();
</script>
</body>
</html>`;

fs.writeFileSync(OUT, html, 'utf8');
console.log('已生成：' + OUT);
console.log('  卡数：' + rows.length + ' | 列数：' + COLS.length + ' | 字节：' + html.length);

/* 顺带输出扁平数据 + 列定义，供 export-xlsx.py 等下游工具消费。
   扁平化规则只在这里定义一份，避免多处各写一遍后慢慢漂移。 */
const FLAT = path.join(ROOT, 'data', 'cards-flat.json');
fs.writeFileSync(FLAT, JSON.stringify({ cols: COLS, rows: rows }, null, 2), 'utf8');
console.log('已输出扁平数据：' + FLAT + '（供 xlsx 导出使用）');
