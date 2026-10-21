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
 *
 * N1.5 升级内容：
 *   - 新列：whoId（素材锚点）/ window 出现窗口 / weight 权重 / once 单局一次 / hidden 隐藏卡
 *   - 新增卡 / 复制卡（id 自动顺延，符合命名规则）
 *   - 批量改数值：对筛选结果批量设置某个效果值
 *   - 内嵌校验：validate-cards.js 的同一份函数注入页面，改动 0.4s 后实时校验，
 *     有错的卡 id 标红，导出前有错会弹确认
 */
const fs = require('fs');
const path = require('path');
const { validateCards } = require('./validate-cards');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'data', 'cards.json');
const OUT = path.join(ROOT, 'tools', 'cards-manager.html');

const raw = fs.readFileSync(SRC, 'utf8');
const data = JSON.parse(raw);

/* ---------- 列定义：这就是"能看见的全部参数" ---------- */
const NUM_EFFECTS = ['spend', 'buy', 'sell', 'borrow', 'repay', 'cash', 'mind', 'risk', 'social'];
const COLS = [
  { k: '__ops',  t: '操作', w: 46, nosort: true },
  { k: 'id',   t: 'ID',   w: 150, ro: true },
  { k: 'who',  t: '谁',   w: 78 },
  { k: 'whoId', t: 'whoId', w: 110, hint: '素材锚点（N4 出图用），拼音小写' },
  { k: 'avatar', t: '头像', w: 48 },
  { k: 'tag',  t: '分类', w: 62 },
  { k: 'text', t: '卡面文案', w: 250 },
  { k: 'when', t: '出现条件', w: 128, hint: '如 no:baby / mind<30 / has:fired; social>52；v2 谓词 did:卡id.r / seen:卡id / pick:tag>=5' },
  { k: 'alwaysStatus', t: '自带状态', w: 88, hint: '如 fired:-1' },
  { k: 'window', t: '窗口', w: 64, hint: '出现日期窗口，如 7-45；留空=全程' },
  { k: 'weight', t: '权重', w: 52, num: true, plain: true, hint: '抽取权重 0.1..10，留空=1（引擎 N3 实装）' },
  { k: 'once',  t: '单局一次', w: 60, bool: true, hint: '勾选 = 这张卡一局最多出现 1 次（引擎 N3 实装）' },
  { k: 'hidden', t: '隐藏', w: 48, bool: true, hint: '勾选 = 隐藏卡，图鉴里显示剪影（引擎 N3 实装）' },
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
      id: c.id, who: c.who, whoId: c.whoId || '', avatar: c.avatar, tag: c.tag,
      text: c.text, when: c.when || '', alwaysStatus: fmtSt(c.alwaysStatus),
      window: Array.isArray(c.window) ? c.window.join('-') : '',
      weight: (c.weight === undefined ? '' : c.weight),
      once: !!c.once, hidden: !!c.hidden,
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
   与 flat() 一样只在 Node 端定义一次，再用 toString() 注入生成的 HTML，
   保证浏览器端与这里完全同源。
   缺省值不落盘：window/weight/once/hidden/whoId 留空 = 键不写入，
   这样导出的 JSON 与手写真源形状一致，往返无损。 */
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
    if(String(r.whoId || '').trim()) card.whoId = String(r.whoId).trim();
    card.when = String(r.when == null ? '' : r.when).trim() || null;
    card.alwaysStatus = parseSt(r.alwaysStatus);
    const win = String(r.window == null ? '' : r.window).trim();
    if(win){
      const m = win.match(/^(\d+)\s*-\s*(\d+)$/);
      if(m) card.window = [Number(m[1]), Number(m[2])];
    }
    if(r.weight !== '' && r.weight != null && !isNaN(Number(r.weight))) card.weight = Number(r.weight);
    if(r.once) card.once = true;
    if(r.hidden) card.hidden = true;
    card.left = buildSide(r, 'L');
    card.right = buildSide(r, 'R');
    return card;
  });
}

const rows = flat(data.cards);

/* ---------- 自检：往返必须无损 ---------- */
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
// 内容指纹代替生成时间：同样数据必定同样字节，跨机器也一样，
// 这样「收工前跑一次应无 diff」这条判据才成立（时间戳会让每次构建都产生噪音 diff）
const digest = require('crypto').createHash('sha1').update(JSON.stringify(rows)).digest('hex').slice(0, 8);
const TAG_PREFIX = JSON.stringify({ '家庭':'fam','职场':'work','收入':'inc','人情':'soc','自己':'self','市场':'mkt','决策':'dec','风险':'risk','意外':'acc' });

const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>韭菜之王 · 卡牌数值管理表</title>
<style>
  :root{ --bg:#faf9f7; --line:#e3e0da; --hd:#f2efe9; --accent:#8a6d3b; --hot:#fff8e6; --err:#c0392b; }
  *{ box-sizing:border-box; }
  body{ margin:0; background:var(--bg); color:#2b2b2b;
        font:13px/1.5 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif; }
  header{ padding:14px 18px; border-bottom:1px solid var(--line); background:#fff; }
  h1{ margin:0 0 4px; font-size:16px; font-weight:600; }
  .sub{ color:#8a8578; font-size:12px; }
  .toolbar{ display:flex; gap:8px; align-items:center; flex-wrap:wrap;
            padding:10px 18px; background:#fff; border-bottom:1px solid var(--line);
            position:sticky; top:0; z-index:5; }
  select,input[type=text],input[type=number]{ padding:5px 8px; border:1px solid var(--line); border-radius:5px;
                          background:#fff; font-size:12px; }
  input[type=text]{ width:190px; } input[type=number]{ width:70px; }
  button{ padding:5px 12px; border:1px solid var(--accent); border-radius:5px;
          background:var(--accent); color:#fff; font-size:12px; cursor:pointer; }
  button.ghost{ background:#fff; color:var(--accent); }
  button.mini{ padding:2px 7px; font-size:11px; }
  button:hover{ opacity:.85; }
  .stat{ margin-left:auto; color:#8a8578; font-size:12px; }
  .stat b.bad{ color:var(--err); }
  .tablewrap{ overflow:auto; max-height:calc(100vh - 132px); }
  table{ border-collapse:collapse; white-space:nowrap; }
  th,td{ border:1px solid var(--line); padding:0; }
  thead th{ position:sticky; top:0; background:var(--hd); font-weight:600;
            font-size:11px; padding:6px 6px; text-align:left; cursor:pointer; z-index:2; }
  thead th.nosort{ cursor:default; }
  thead th:hover:not(.nosort){ background:#e8e3d8; }
  tbody td{ background:#fff; }
  tbody tr:hover td{ background:var(--hot); }
  td input[type=text]{ width:100%; border:0; padding:5px 6px; font:inherit; background:transparent;
            box-sizing:border-box; }
  td input:focus{ outline:2px solid var(--accent); outline-offset:-2px; background:#fff; }
  td input.num{ text-align:right; font-variant-numeric:tabular-nums; }
  td input.num.pos{ color:#c0392b; }   /* 正数为红（增益/加值） */
  td input.num.neg{ color:#27865a; }   /* 负数为绿 */
  td input.plain{ color:inherit; }
  td.id{ background:#f7f5f1; color:#a09889; font-size:11px; padding:5px 6px; }
  td.id.bad{ background:#fdecea; color:var(--err); font-weight:600; }
  td.chk, td.ops{ text-align:center; }
  #issues{ display:none; max-height:180px; overflow:auto; padding:8px 18px;
           background:#fffdf8; border-top:1px solid var(--line); font-size:12px; }
  #issues.on{ display:block; }
  #issues div{ padding:1px 0; }
  .tip{ padding:8px 18px; color:#8a8578; font-size:11.5px; background:#fffdf8;
        border-top:1px solid var(--line); }
  code{ background:#f0ede6; padding:1px 4px; border-radius:3px; font-size:11px; }
</style>
</head>
<body>
<header>
  <h1>韭菜之王 · 卡牌数值管理表</h1>
  <div class="sub">共 ${rows.length} 张卡 · 数据源 <code>data/cards.json</code> · 内容指纹 ${digest}
    —— 改完点「导出 JSON」，覆盖回 data/cards.json，再跑 <code>node tools/sync-json-to-prototype.js</code></div>
</header>

<div class="toolbar">
  <select id="fTag"><option value="">全部分类</option>${tagList.map(t => `<option>${t}</option>`).join('')}</select>
  <input type="text" id="fSearch" placeholder="搜索 文案 / 人物 / 条件">
  <button class="ghost" id="btnReset">重置筛选</button>
  <button class="ghost" id="btnAdd">新增卡</button>
  <button class="ghost" id="btnBatch" title="对当前筛选结果批量设置一个效果值">批量改数值</button>
  <span id="batchBox" style="display:none">
    <select id="bSide"><option value="L">左</option><option value="R">右</option></select>
    <select id="bEff">${NUM_EFFECTS.map(f => `<option>${f}</option>`).join('')}</select>
    <input type="number" id="bVal" step="any" placeholder="数值">
    <button id="bApply">应用到筛选结果</button>
    <button class="ghost" id="bClear" title="清空这个效果（从选中卡里删掉该键）">清空该值</button>
  </span>
  <button id="btnExport">导出 JSON</button>
  <button class="ghost" id="btnImport">导入 JSON</button>
  <button class="ghost" id="btnIssues">校验面板</button>
  <input type="file" id="fileIn" accept=".json" style="display:none">
  <span class="stat" id="stat"></span>
</div>

<div id="issues"></div>

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
  多个条件「且」用 <code>;</code>、「或」用 <code>|</code>。
  <b>v2 谓词</b>（校验已支持，引擎 N3 实装）：<code>did:卡id.r</code>（那张卡选过右）、
  <code>seen:卡id</code>、<code>pick:家庭&gt;=5</code>（某分类选边倾向）。
  <code>窗口</code> 填 <code>7-45</code> 表示只在第 7~45 天出现；<code>权重</code> 留空=1。
  <code>加状态</code> 填 <code>baby:-1</code>（-1 表示永久）；<code>清状态</code> 填状态名，多个用逗号。
  <b>改完必须过：</b><code>node tools/validate-cards.js</code> →
  <code>node tools/sync-json-to-prototype.js</code> →
  <code>node tools/simulate.js --runs 10000</code> 对比基线。
  <b>点表头可排序。</b>
</div>

<script>
const COLS = ${JSON.stringify(COLS)};
const NUM_EFFECTS = ${JSON.stringify(NUM_EFFECTS)};
const TAG_PREFIX = ${TAG_PREFIX};
${fmtSt.toString()}
${flat.toString()}
let ROWS = ${JSON.stringify(rows)};
const ORIGINAL = JSON.parse(JSON.stringify(ROWS));
let sortKey = null, sortDir = 1, dirty = 0, ISSUES = [];

/* ---------- 内嵌校验：与 tools/validate-cards.js 同一份函数 ---------- */
${validateCards.toString()}
let vTimer = null;
function scheduleValidate(){ clearTimeout(vTimer); vTimer = setTimeout(runValidate, 400); }
function runValidate(){
  ISSUES = validateCards({ cards: unflat(ROWS) });
  const errs = ISSUES.filter(i => i.level === 'error');
  const box = document.getElementById('issues');
  box.innerHTML = ISSUES.length
    ? ISSUES.map(i => '<div>' + (i.level === 'error' ? '✗' : '⚠') + ' <b>' + i.id + '</b> · ' + i.field + ' — ' + i.msg + '</div>').join('')
    : '<div style="color:#27865a">✓ 校验通过，8 类检查全绿</div>';
  renderStat();
  return errs.length;
}

const NUMK = COLS.filter(c => c.num).map(c => c.k);
function errMap(){ const m = {}; ISSUES.forEach(i => { if(i.level==='error'){ (m[i.id] = m[i.id] || []).push(i.field + ': ' + i.msg); } }); return m; }

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
      if(typeof x === 'boolean' || typeof y === 'boolean') return ((x?1:0) - (y?1:0)) * sortDir;
      x = String(x == null ? '' : x); y = String(y == null ? '' : y);
      return x.localeCompare(y, 'zh') * sortDir;
    });
  }
  return r;
}

function headCell(c){
  const th = document.createElement('th');
  th.style.minWidth = c.w + 'px';
  th.textContent = c.t + (sortKey === c.k ? (sortDir > 0 ? ' ▲' : ' ▼') : '');
  th.title = c.hint || '';
  if(c.k === 'id' || c.k === '__ops'){ th.className = 'nosort'; return th; }
  th.onclick = () => {
    if(sortKey === c.k) sortDir = -sortDir; else { sortKey = c.k; sortDir = (c.num ? -1 : 1); }
    render();
  };
  return th;
}

function render(){
  const hr = document.getElementById('headRow');
  hr.innerHTML = '';
  COLS.forEach(c => hr.appendChild(headCell(c)));

  const tb = document.getElementById('bodyRows');
  tb.innerHTML = '';
  const bad = errMap();
  const data = view();
  data.forEach(row => {
    const tr = document.createElement('tr');
    COLS.forEach(c => {
      const td = document.createElement('td');
      if(c.k === '__ops'){
        td.className = 'ops';
        const b = document.createElement('button');
        b.className = 'mini ghost'; b.textContent = '复';
        b.title = '复制这张卡（id 自动顺延）';
        b.onclick = () => dupRow(row);
        td.appendChild(b); tr.appendChild(td); return;
      }
      if(c.k === 'id'){
        td.className = 'id' + (bad[row.id] ? ' bad' : '');
        if(bad[row.id]) td.title = bad[row.id].join('\\n');
        td.textContent = row.id; tr.appendChild(td); return;
      }
      if(c.bool){
        td.className = 'chk';
        const inp = document.createElement('input');
        inp.type = 'checkbox'; inp.checked = !!row[c.k]; inp.title = c.hint || '';
        inp.onchange = () => { row[c.k] = inp.checked; markDirty(); scheduleValidate(); };
        td.appendChild(inp); tr.appendChild(td); return;
      }
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.value = (row[c.k] == null ? '' : row[c.k]);
      inp.title = c.hint || '';
      if(c.num){
        inp.className = 'num' + (c.plain ? ' plain' : '');
        const v = parseFloat(inp.value);
        if(!c.plain && !isNaN(v) && v > 0) inp.classList.add('pos');
        if(!c.plain && !isNaN(v) && v < 0) inp.classList.add('neg');
      }
      inp.oninput = () => {
        let v = inp.value;
        if(c.num){
          if(v === '' ){ row[c.k] = ''; }
          else { const n = Number(v); row[c.k] = isNaN(n) ? v : n; }
          inp.className = 'num' + (c.plain ? ' plain' : '');
          const n = parseFloat(v);
          if(!c.plain && !isNaN(n) && n > 0) inp.classList.add('pos');
          if(!c.plain && !isNaN(n) && n < 0) inp.classList.add('neg');
        } else row[c.k] = v;
        markDirty(); scheduleValidate();
      };
      td.appendChild(inp);
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  renderStat();
}

function renderStat(){
  const errs = ISSUES.filter(i => i.level === 'error').length;
  const warns = ISSUES.length - errs;
  document.getElementById('stat').innerHTML =
    '显示 ' + view().length + ' / ' + ROWS.length + ' 张 · 校验 ' +
    (errs ? '<b class="bad">' + errs + ' 错误</b>' : '✓') + (warns ? ' / ' + warns + ' 提醒' : '') +
    (dirty ? ' · 已修改未导出' : '');
}

function markDirty(){
  dirty = JSON.stringify(ROWS) === JSON.stringify(ORIGINAL) ? 0 : 1;
  renderStat();
}

/* ---------- 新增 / 复制：id 自动顺延 ---------- */
function nextId(base){
  const used = new Set(ROWS.map(r => r.id));
  for(let n = 1; n < 100; n++){
    const cand = base + '_' + String(n).padStart(2, '0');
    if(!used.has(cand)) return cand;
  }
  return base + '_xx';
}
function sceneBase(tag){
  const p = TAG_PREFIX[tag] || 'misc';
  return p + '_scene';
}
function dupRow(row){
  const base = (row.id || sceneBase(row.tag)).replace(/_\\d{2}$/, '');
  const nr = JSON.parse(JSON.stringify(row));
  nr.id = nextId(base);
  ROWS.push(nr);
  markDirty(); runValidate(); render();
  const tb = document.getElementById('bodyRows');
  tb.lastElementChild.scrollIntoView({ block: 'center' });
}
document.getElementById('btnAdd').onclick = () => {
  const tag = document.getElementById('fTag').value || '自己';
  const nr = { id: nextId(sceneBase(tag)), who: '？', whoId: '', avatar: '❓', tag: tag,
               text: '（新卡面文案，≤31 字）', when: '', alwaysStatus: '',
               window: '', weight: '', once: false, hidden: false,
               L_label: '', R_label: '' };
  NUM_EFFECTS.forEach(f => { nr['L_' + f] = ''; nr['R_' + f] = ''; });
  nr['L_addst'] = ''; nr['R_addst'] = ''; nr['L_unst'] = ''; nr['R_unst'] = '';
  ROWS.push(nr);
  markDirty(); runValidate(); render();
  document.getElementById('bodyRows').lastElementChild.scrollIntoView({ block: 'center' });
};

/* ---------- 批量改数值 ---------- */
document.getElementById('btnBatch').onclick = () => {
  const box = document.getElementById('batchBox');
  box.style.display = box.style.display === 'none' ? '' : 'none';
};
document.getElementById('bApply').onclick = () => {
  const side = document.getElementById('bSide').value;
  const eff = document.getElementById('bEff').value;
  const raw = document.getElementById('bVal').value;
  if(raw === ''){ alert('先填数值（要清空请用「清空该值」）'); return; }
  const targets = view();
  if(!targets.length){ alert('当前筛选结果为空'); return; }
  if(!confirm('把 ' + (side === 'L' ? '左' : '右') + '·' + eff + ' = ' + raw +
      ' 应用到筛选出的 ' + targets.length + ' 张卡？')) return;
  targets.forEach(r => { r[side + '_' + eff] = Number(raw); });
  markDirty(); runValidate(); render();
};
document.getElementById('bClear').onclick = () => {
  const side = document.getElementById('bSide').value;
  const eff = document.getElementById('bEff').value;
  const targets = view();
  if(!targets.length){ alert('当前筛选结果为空'); return; }
  if(!confirm('把筛选出的 ' + targets.length + ' 张卡的 ' + (side === 'L' ? '左' : '右') + '·' + eff + ' 清空？')) return;
  targets.forEach(r => { r[side + '_' + eff] = ''; });
  markDirty(); runValidate(); render();
};

document.getElementById('btnIssues').onclick = () =>
  document.getElementById('issues').classList.toggle('on');

${parseSt.toString()}
${buildSide.toString()}
${unflat.toString()}

function download(){
  const errs = ISSUES.filter(i => i.level === 'error').length;
  if(errs && !confirm('校验还有 ' + errs + ' 个错误，导出的 JSON 可能不合法。仍要导出？')) return;
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
      ORIGINAL.length = 0; ORIGINAL.push(...JSON.parse(JSON.stringify(ROWS)));
      dirty = 0; runValidate(); render();
      alert('已载入 ' + ROWS.length + ' 张卡');
    }catch(err){ alert('导入失败：' + err.message); }
  };
  rd.readAsText(f);
};
runValidate();
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
