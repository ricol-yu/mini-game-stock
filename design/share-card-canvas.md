# 分享卡 · canvas 绘制指令清单（给前端）

> 2026-11-11 · 视觉架构师。**这份是施工单，不是设计文档**：按「先画什么、后画什么」排，每层一个 `ctx.xxx()` 调用 + 参数值 + 坐标。
> 设计依据在 `design/share-card-spec.md`；本文足够独立施工，不用读 spec。
>
> 单位：**全部 1080×1440 画布 px**。所有文字 `textBaseline='middle'`，表里的 `y` 是**文字块中线**（不是 top、不是 baseline），照填即可。
> 五套模板已定稿：**T1 豪言 / T2 认命 / T3 嘴硬 / T4 清算 / T5 温情（纯场景）**。

---

## 1. 全局准备（P0–P2）

### 1.1 建 canvas（离屏，不进可见区）

```html
<canvas type="2d" id="shareCv"
        style="position:fixed; left:-9999px; top:0; width:1080px; height:1440px;"></canvas>
```

- **CSS 尺寸必须是 1080×1440**（不是 360×480）：这样「1 绘图单位 = 1 CSS px」，导出参数直接就是 1080/1440，不用再折算。
- 不要塞进可见区再截图（会闪一帧白卡）。
- 用完不要立刻销毁节点：结局页第二次分享要复用（重建 canvas 的代价是 80~200ms）。

### 1.2 dpr 与坐标基准

```js
const W = 1080, H = 1440;
const cv = res[0].node, ctx = cv.getContext('2d');
const dpr = Math.min(2, wx.getWindowInfo().pixelRatio);   // ← 必须封顶 2
cv.width  = W * dpr;  cv.height = H * dpr;                 // backing 最大 2160×2880 ≈24.8MB
ctx.scale(dpr, dpr);                                       // 之后一律用 1080 基准坐标
```

> **为什么封顶 2**：dpr=3 时 backing 是 3240×4320，RGBA ≈ **56MB**，低端安卓直接 OOM 闪退。
> 导出仍是 1080×1440，2 倍过采样足够（没人把分享图放到 300% 数 1px 描边）。

### 1.3 字体：等一次，别等每次

```js
// 首帧只需等一次系统字体就位；不等会出现"量出来的宽度 ≠ 画出来的宽度"，折行全错
async function ensureFont() {
  if (!document.fonts) return;                 // 小程序无 document，走下面的降级
  await Promise.race([
    document.fonts.ready,
    new Promise(r => setTimeout(r, 300)),      // 兜底 300ms，不许无限等
  ]);
}
```

- 只用系统字体栈，**不 `loadFontFace`**（首次渲染会掉字，分享是即时行为）。
- 小程序环境没有 `document.fonts`：直接进绘制，但**导出一律等到 `ctx.measureText` 稳定**——
  实操做法：先空跑一次 `wrap()` 不画，再正式画（成本 <2ms，能规避量宽抖动）。

```js
const F = '"PingFang SC","HarmonyOS Sans SC","Source Han Sans SC","Microsoft YaHei",sans-serif';
const fnt = (w, s) => `${w} ${s}px ${F}`;
```

### 1.4 清屏 + 底色（P0/P1/P2）

| 步 | 做什么 | 调用 |
|---|---|---|
| P0 | 清屏（透明） | `ctx.clearRect(0, 0, W, H)` |
| P1 | 绒布径向 | `g = ctx.createRadialGradient(540,216,0, 540,216,1560)`；stops `0 #2a7452 / .56 #17402f / 1 #0c2b1e`；`fillRect(0,0,W,H)` |
| P2a | 60px 网格 | `strokeStyle='rgba(253,243,216,.045)'`；`lineWidth=1`；竖 19 条 / 横 25 条，坐标 +0.5 对齐 |
| P2b | 噪点 | 1200 点，`x=rnd(i*2+1)*1080, y=rnd(i*2+2)*1440`，`fillStyle='rgba(253,243,216,'+(0.02+rnd(i*3)*0.03)+')'`，`fillRect(x,y,1~2,1)` |

```js
for (let x = 0; x <= W; x += 60) { ctx.beginPath(); ctx.moveTo(x + .5, 0); ctx.lineTo(x + .5, H); ctx.stroke(); }
for (let y = 0; y <= H; y += 60) { ctx.beginPath(); ctx.moveTo(0, y + .5); ctx.lineTo(W, y + .5); ctx.stroke(); }
```

> 噪点必须**固定种子**：同一张战绩连拍两次噪点位置变了，玩家会以为图被篡改过。

---

## 2. 工具函数（拷这 8 个，不要各写一份）

```js
// ① 圆角矩形
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ② 带字距的宽度（canvas 没有 letter-spacing，必须自己算）
function mls(ctx, t, ls = 0) {
  let w = 0; for (const ch of t) w += ctx.measureText(ch).width + ls;
  return w - ls;                        // 扣掉尾部那一份，否则右侧永远多出半个字距
}

// ③ 带字距绘制，返回右端 x
function ls_(ctx, t, x, y, ls = 0) {
  let cx = x; for (const ch of t) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + ls; }
  return cx - ls;
}

// ④ 居中（有字距时禁止用 ctx.textAlign='center'）
function center(ctx, t, cx, y, ls = 0) { ls_(ctx, t, cx - mls(ctx, t, ls) / 2, y, ls); }

// ⑤ 右对齐到基准线（金额）
function right(ctx, t, rx, y, ls = 0) { ls_(ctx, t, rx - mls(ctx, t, ls), y, ls); }

// ⑥ 中文折行（避头尾）
const NO_HEAD = '，。、；：？！）」』】》%…', NO_TAIL = '（「『【《';
function wrap(ctx, t, maxW) {
  const out = []; let cur = '';
  for (const ch of t) {
    if (ctx.measureText(cur + ch).width > maxW && cur) {
      if (NO_HEAD.includes(ch) || NO_TAIL.includes(cur.slice(-1))) { cur += ch; continue; }
      out.push(cur); cur = ch;
    } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}

// ⑦ 固定种子随机
function rnd(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

// ⑧ 金额：86420 → "¥86,420"；-12300 → "−¥12,300"（U+2212，不是连字符）
function money(n) {
  const neg = n < 0, a = Math.abs(Math.round(n));
  return (neg ? '−' : '') + '¥' + a.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
```

---

## 3. 水印 A（P3，画在背景之后、纸面/插画之前）

```js
if (d.watermark) {
  ctx.save();
  ctx.translate(540, 720); ctx.rotate(-Math.PI / 4); ctx.translate(-540, -720);
  ctx.font = fnt(600, 20); ctx.fillStyle = 'rgba(253,243,216,.05)';
  for (let y = -400; y < 1800; y += 320)
    for (let x = -400; x < 1500; x += 420) ctx.fillText('韭菜之王', x, y);
  ctx.restore();
}
```

> 位置决定效果：画在**纸面/插画之前**，于是它只在绒布上显现，T2/T4 的纸、T5 的插画会自动盖住它。
> 这样既"轻量不挡主体"，也顺手解决了"账单上不许出现斜字"——**不需要写任何判断**。

---

## 4. 五套模板（P4 背景 → P5 中景 → P6 文字）

### T1 豪言版（示例：快进快出）

| P | 画什么 | API | 参数 |
|---|---|---|---|
| P4 | K 柱 ×16 | `fillRect` | 宽 26；**底边 y=1150**；`x_i = 18 + i*67.87`（i=0..15）；高 `[60,90,70,124,100,152,132,184,156,212,182,242,206,272,238,308]`；色 `rgba(242,176,30,.072)` |
| P4 | 顶部金晕 | `createRadialGradient(540,250,0, 540,250,560)` → `fillRect(0,0,1080,1100)` | `rgba(242,176,30,.16) → rgba(242,176,30,0)` |
| P5 | 金线（细） | `fillRect(300,546,480,1)` | `rgba(242,176,30,.35)` |
| P5 | 金线（粗） | `fillRect(372,552,336,2)` | `#f2b01e` |
| P5 | 三列分隔 | `fillRect(378,884,1,126)` / `fillRect(702,884,1,126)` | `rgba(253,243,216,.16)` |
| P5 | 右上小印 | `save → translate(940,146) → rotate(8°)` | 章体 `rr(-50,-50,100,100,8)`：`stroke #e2503f lw3`；内框 `rr(-44,-44,88,88,3)`：`stroke rgba(253,243,216,.40) lw1`；字 `center(d.grp,0,0)` @ `fnt(900,34)` `#fdf3d8` |
| P6 | 日期标签 | `fnt(700,28)` + `center()` | `center('第 '+d.day+' 天 · '+d.grp, 540, 118, 8)`，`rgba(253,243,216,.66)` |
| P6 | emoji | `font='132px '+F`，`textAlign='center'` | `fillText(d.em, 540, 214)` |
| P6 | 主标题 | `fnt(900,size)` + `center()` | `center(d.name, 540, 402, 4)`，`#fdf3d8`；**字号由 §6.2 算法决定** |
| P6 | 引文 | `fnt(600,34)` + `wrap(936)` + `center()` | 行距 **65**，首行中线 **636**；`rgba(253,243,216,.88)`；≤3 行 |
| P6 | 数据 label ×3 | `fnt(700,26)` + `center()` | x=216/540/864，y=**878**，字距 2，`rgba(253,243,216,.60)`；「最后剩下 / 这一辈子 / 买卖次数」 |
| P6 | 数据 value ×3 | `fnt(900,56)` + `center()` | 同 x，y=**941**；净值 `#f2b01e`，其余 `#fdf3d8`；净值负值改 `#ff6b5e` |

### T2 认命版（示例：温水煮蛙）

| P | 画什么 | API | 参数 |
|---|---|---|---|
| P4 | 碑面 | `rr(72,72,936,1060,20)` → `fill #fdf6e1` → `stroke #241a0e lw3` | 阴影：`shadowOffsetY 20 / blur 0 / rgba(11,32,22,.45)`；再叠柔影 `blur 34 / rgba(0,0,0,.26)`（**全卡仅此一处 blur**） |
| P5 | 短线 | `fillRect(492,512,96,3)` | `rgba(43,31,18,.20)` |
| P6 | 日期 | `fnt(700,28)` + `center()` | `center('第 '+d.day+' 天', 540, 200, 8)`，`#857356` |
| P6 | emoji | `96px` | `fillText(d.em, 540, 284)` |
| P6 | 结局名 | `fnt(900,size)` + `center()` | `center(d.name, 540, 422, 8)`，`#2b1f12`（§6.2 定字号） |
| P6 | 引文 | `fnt(600,34)` + `wrap(780)` + `center()` | 行距 **74.8**，首行中线 **621**；`#6b5a44`；≤3 行 |
| P6 | 数据行 | `fnt(700,28)` + `center()` | `center('最后剩下 '+money(d.net), 540, 1028)`，`#6b5a44`；**只 1 项，不加分隔符** |

> 734~1000 是**故意留白**（认命版的信息量就该比别的少一档），别往里加元素。
> 字号不能再小：28 是 §7 可读性红线，**"少一档"靠减少项数实现，不靠缩字**。

### T3 嘴硬版（示例：穿仓）

| P | 画什么 | API | 参数 |
|---|---|---|---|
| P5 | 大印章 | `save → translate(540,374) → rotate(-7°)` | 章体 `rr(-360,-150,720,300,10)` `fill #b02a1f`，压印影 `shadowOffsetY 8 / blur0 / rgba(0,0,0,.22)`；外框 `rr(-348,-138,696,276,6)` `stroke rgba(253,246,225,.88) lw4`；内框 `rr(-332,-122,664,244,4)` `stroke 同色 lw1.5` |
| P5 | 磨砂 | `arc` ×40 | `r = 1+rnd(i+7)*2`；心 `cos/sin × (360,150) × (0.5+rnd(i))`；`fill rgba(0,0,0,.10)` |
| P5 | 小印「不服」 | `translate(846,766) → rotate(12°)` | `rr(-66,-66,132,132,6)` `stroke #e2503f lw3`；内框 `rr(-59,-59,118,118,3)` `stroke rgba(253,243,216,.35) lw1`；字 `center('不服',0,0,2)` @ `fnt(900,40)` `#fdf3d8` |
| P6 | 印章内字 | `fnt(900,132)` + `center()` | `center(d.name, 0, 4, 24)`，`#fdf6e1`（`center()` 已扣尾距，**不要**再加 textIndent） |
| P6 | 日期标签 | `fnt(700,28)` + `center()` | `center('第 '+d.day+' 天 · '+d.grp, 540, 118, 8)`，`rgba(253,243,216,.66)` |
| P6 | 引文 | `fnt(600,30)` + `wrap(840)` + `center()` | 行距 60，首行中线 **650**；`rgba(253,243,216,.86)`；≤3 行 |
| P6 | 数据 ×3 | label `fnt(700,28)` `ls_(…,120,y,2)` `rgba(253,243,216,.60)`；value `fnt(900,44)` `ls_(…,420,y)` | y=**915 / 985 / 1055**；「最后剩下 / 买卖次数 / **风险终值**」；值 `money(net)` / `trades+' 次'` / `d.risk+'/100'`；负值 `#ff6b5e`，其余 `#fdf3d8` |

> 第 3 行**固定是风险终值**（`0–100`），不是最大回落——四属性里只有这一个上卡。
> 印章旋转包围盒 = `720·|cos7°| + 300·|sin7°| = 750 × 322`，与日期（118）、引文（650）的间距均 ≥24，安全。

### T4 清算版（示例：复利葬礼）

| P | 画什么 | API | 参数 |
|---|---|---|---|
| P4 | 小票纸 | `rr(96,88,920,1010,6)` → `fill #fdf6e1` | 只描上/左/右三边：`stroke #241a0e lw3`；阴影 `offsetY 12 / blur0 / rgba(11,32,22,.40)` + 柔影 `blur 26 / rgba(0,0,0,.24)` |
| P4 | 锯齿 ×16 | `beginPath` 三角循环 → `fill #fdf6e1`（再用 `lw3` 描斜边） | `x=96, y=1095, w=920, h=24, n=16`，齿宽 **57.5**；齿尖朝下 |
| P5 | 双线 | `fillRect(136,262,808,2)` + `fillRect(136,268,808,1)` | `#2b1f12` |
| P5 | 行虚线 ×4 | `setLineDash([6,6])` + `moveTo(136,ry) → lineTo(944,ry)` | ry = **426 / 500 / 574 / 648**；`rgba(43,31,18,.28)`；画完 `setLineDash([])` |
| P5 | 合计线 | `fillRect(136,648,808,3)` | `#2b1f12` |
| P5 | 引文金条 | `fillRect(136,804,5,84)` | `#f2b01e` |
| P5 | 「已结清」 | `translate(800,965) → rotate(-9°)` | `rr(-140,-55,280,110,5)` `stroke #b02a1f lw4`；内框 `rr(-132,-47,264,94,3)` `lw1.5`；字 `center('已 结 清',0,0,8)` @ `fnt(900,48)` `#b02a1f` |
| P6 | 结局名 | `fnt(900,size)` | `ls_(d.name, 136, 150, 6)`，`#2b1f12`（§6.2） |
| P6 | emoji | `56px`，`textAlign='right'` | `fillText(d.em, 944, 148)` |
| P6 | 单据头 | `fnt(800,30)` | 左 `ls_('结 算 单 · SETTLEMENT',136,238,8)`；右 `right('第 '+d.day+' 天',944,238,8)`；`#6b5a44` |
| P6 | 表头 | `fnt(700,28)` | `ls_('项目',136,314,2)` / `right('金额',944,314,2)`；`#857356` |
| P6 | 表格 4 行 | `ls_(k,136,y)` + `right(v,944,y)` | 行中线 y=**389 / 463 / 537 / 611**；label `fnt(700,30)` `#6b5a44`；value `fnt(800,34)` `#2b1f12` |
| P6 | 合计 | label `fnt(800,32)` `ls_('合计支出',136,706,2)`；value `fnt(900,62)` `right(money(d.total),944,706)` | `#2b1f12` / `#a8281e` |
| P6 | 引文 | `fnt(600,28)` + `wrap(700)` | 首行中线 **823**，行距 53.2，x=164；`#6b5a44`；≤2 行 |
| P6 | 脚注 | `fnt(700,28)` | `ls_('这一辈子 '+d.day+' 天 · 买卖 '+d.trades+' 次', 136, 1066, 1)`，`#857356` |

> **金额右对齐到 944 是「账单感」的全部**，比字体重要。千分位必须要，负数用 U+2212。

### T5 温情版（示例：两个人）—— **纯场景即成品**

| P | 画什么 | API | 参数 |
|---|---|---|---|
| P4 | 场景层 | `drawImage(scene, 0,0,640,720, 0,0,1080,1215)` | scale = `max(1080/640, 1040/720)` = **1.6875**；顶部对齐（上 85.6%）；溢出 175 由压暗层与绒布覆盖，**不 clip** |
| P5 | 压暗层 | `createLinearGradient(0,400,0,1040)` → `fillRect(0,400,1080,640)` | stops `0 → rgba(12,43,30,0)` / `.38 → .45` / `.78 → .88` / `1 → .98` |
| P6 | emoji | `60px` | `center` 语义：`fillText(d.em, 540, 786)` |
| P6 | 结局名 | `fnt(900,size)` + `center()` | `center(d.name, 540, 880, 8)`，`#fdf3d8`（§6.2） |
| P6 | 引文 | `fnt(600,30)` + `wrap(880)` + `center()` | 行距 57，首行中线 **976**；`rgba(253,243,216,.86)`；**≤2 行**（全套最狠） |
| P6 | 数据行 | `fnt(700,28)` + `center()` | `center('第 '+d.day+' 天 · 最后剩下 '+money(d.net), 540, 1118)`，`rgba(253,243,216,.72)` |

**不叠人物层**（team-lead 拍板）：分享卡插画区是满幅 640 高，与卡面图区 309×350 比例完全不同，
塞卡面素材要重新构图 = 第二套美术；脸对不上还会被当成两个人。连续性由**场景与色调**保持。

**兜底（连场景图都没有）**：底图换 `linearGradient(0,0 → 0,1040)`：`#f3e8c9 → #e0cfa6`，
居中 emoji 物件 180px（`y 520`，`globalAlpha .9`），**文字坐标一字不改**。

---

## 5. 页脚（P7，五套共用）

| 步 | 画什么 | API | 参数 |
|---|---|---|---|
| P7a | 分隔线 | `moveTo(72,1150) → lineTo(1008,1150)` | `rgba(253,243,216,.20)`，`lw1.5` |
| P7b | 游戏名 | `fnt(900,42)` + `ls_('韭菜之王', 72, 1206, 10)` | `#fdf3d8` |
| P7c | slogan | `fnt(700,26)` + `ls_('你的一辈子，能撑多少天？', 72, 1253, 1)` | `rgba(253,243,216,.72)`（**固定一句，不换句池**） |
| P7d | 水印行 | `fnt(600,20)` + `ls_('结局 No.'+pad2(d.no)+' · 由《韭菜之王》生成 · 可在设置里关闭', 72, 1302, 2)` | `rgba(253,243,216,.34)`；`WATERMARK=false` 时**整行跳过**，不留空位、不动布局 |
| P7e | 码底板 | `rr(840,1176,168,168,8)` → `fill #fdf6e1` → `stroke #241a0e lw3` | **三种态都要先画底板**（否则切态闪白） |
| P7f | 码 A | `drawImage(qr, 840, 1176, 168, 168)` | 覆盖底板 |
| P7f | 码 B | 虚线内框 `rr(852,1192,144,144,6)`，`setLineDash([8,6])`，`lw2`，`rgba(43,31,18,.35)`；两行 `center('小程序码',924,1230)` / `center('正在生成',924,1266)`，`fnt(600,24)` `#6b5a44` | **最多存在 1.5s**，超时降 C |
| P7f | 码 C | 方印 `rr(880,1200,88,88,4)` `stroke #b02a1f lw3` + 内框 inset5 `lw1`；字 `center('韭',924,1246)` @ `fnt(900,40)` `#b02a1f`；下 `center('搜索 韭菜之王',924,1316)` @ `fnt(600,20)` `#6b5a44` | 三态同矩形、零位移；静区 24（x>816 / y>1152 禁入） |

---

## 6. 折行与自动降字号（伪代码，照抄）

### 6.1 引文：折行 → 截断 → 均衡

```js
// 输入：文案 t、每行宽 maxW、上限行数 maxLines、字号 fs、行高倍数 lh
function layoutQuote(ctx, t, maxW, maxLines, fs, lh) {
  ctx.font = fnt(600, fs);

  // ① 先按句切（句号/感叹号/问号），从后往前删整句，直到能塞进 maxLines
  let lines = wrap(ctx, t, maxW);
  if (lines.length > maxLines) {
    const sent = t.match(/[^。！？]*[。！？]?/g).filter(Boolean);
    let out = t;
    while (sent.length && wrap(ctx, out, maxW).length > maxLines) {
      sent.pop();                                     // 删最后一整句
      out = sent.join('') + '…';
    }
    lines = wrap(ctx, out, maxW);
  }

  // ② 正好 2 行时：均衡断行（避免第二行只剩 2~4 字）
  if (lines.length === 2) {
    const cand = [];
    for (let i = 1; i < t.length; i++) {               // 只在标点后试断
      if (!'，。、；：！？'.includes(t[i - 1])) continue;
      const a = t.slice(0, i), b = t.slice(i);
      if (ctx.measureText(a).width > maxW) break;
      if (ctx.measureText(b).width > maxW) continue;
      if (b.length < a.length * 0.4) continue;         // 后行不得短于前行 40%
      cand.push([a, b, Math.abs(a.length - b.length)]);
    }
    if (cand.length) { cand.sort((x, y) => x[2] - y[2]); lines = [cand[0][0], cand[0][1]]; }
  }

  // ③ 画：首行 y0，行距 fs*lh
  return { lines, step: fs * lh };
}

// 用法（T1）：const L = layoutQuote(ctx, d.quote, 936, 3, 34, 1.9);
// L.lines.forEach((s, i) => center(ctx, s, 540, 636 + i * L.step, 1));
```

> 各模板的 `(maxW, maxLines, fs, lh)` 已定死，**不许现场"自适应"**：
> T1 `(936,3,34,1.9)` · T2 `(780,3,34,2.2)` · T3 `(840,3,30,2.0)` · T4 `(700,2,28,1.9)` · T5 `(880,2,30,1.9)`。

### 6.2 结局名：按字数降字号（不许量宽后随便缩）

```js
// 定稿字号表（覆盖 32 个结局，最长 5 字）：按字数查表，不按宽度试探
const NAME_SIZE = {
  T1: { 1: 200, 2: 200, 3: 200, 4: 200, 5: 168, 6: 144 },
  T2: { 1: 92, 2: 92, 3: 92, 4: 92, 5: 92, 6: 76 },
  T3: { 1: 160, 2: 132, 3: 132, 4: 104, 5: 88, 6: 76 },
  T4: { 1: 92, 2: 76, 3: 76, 4: 76, 5: 76, 6: 66 },
  T5: { 1: 92, 2: 92, 3: 92, 4: 92, 5: 92, 6: 76 },
};
function nameSize(tpl, name) {
  const n = [...name].length;
  const row = NAME_SIZE[tpl];
  return row[Math.min(n, 6)] || row[6];
}
// 兜底：若查表后仍然超宽（理论上不会），才等比缩到 0.9 倍并记一条日志——
// 32 个结局最长 5 字，走到这一步说明 END 表被改了，应该报错而不是静默缩小
```

### 6.3 数字过长

```js
// ¥ 后整数允许 6 位（含逗号 9 字符）；再长改「万」单位，不缩字号
function moneyFit(n, maxChars = 9) {
  const s = money(n);
  if (s.length <= maxChars) return s;
  return (n < 0 ? '−' : '') + '¥' + (Math.abs(n) / 10000).toFixed(1) + ' 万';
}
```

---

## 7. 导出与失败兜底（对齐 `share-flow.md` §7）

```js
wx.canvasToTempFilePath({
  canvas: cv, x: 0, y: 0, width: 1080, height: 1440,
  destWidth: 1080, destHeight: 1440,
  fileType: 'png', quality: 1,
  success: ({ tempFilePath }) => {
    if (!tempFilePath) return onFail('EMPTY');
    // 可选：体积闸门（有 photos 的 T5 才会超）
    wx.getFileSystemManager().getFileInfo({
      filePath: tempFilePath,
      success: ({ size }) => (size < 40 * 1024 ? onFail('BLANK') : onOk(tempFilePath)),
      fail: () => onOk(tempFilePath),
    });
  },
  fail: err => onFail(err.errMsg || 'EXPORT_FAIL'),
});
```

**四个必做的兜底**

| # | 情况 | 处理 |
|---|---|---|
| 1 | 导出成功但**空白图**（最常见） | `<40KB` 判定为空白 → 重试 **1 次**（重画前 `clearRect`）；仍失败则**不展示分享面板**，只保留「回主菜单」 |
| 2 | 图片没 load 完就导出 | 所有 `Image` 走 `Promise.all([...].map(load))`，全部 resolve 后才 `draw` + 导出；超时 1500ms 视为失败，T5 直接走场景缺失兜底 |
| 3 | 小程序码未生成 | 走码 B（≤1.5s）→ 超时 C；**A/B/C 同矩形**，导出尺寸不变，不阻断分享 |
| 4 | 真机内存不足（低端安卓） | dpr 已封顶 2；仍失败 → `destWidth/destHeight` 降到 810×1080 重试一次，UI 不告知用户（图小一点好过没有） |

**导出时机**：结局页 `onShow` + **1200ms** 后台预生成并按 `endName|day|net|trades|tpl` 缓存；
`tier==='full'`（首次解锁 / 当天首次结局）才预生成。玩家点「存一张」时命中缓存 → 0 等待；
未命中才显示「生成中…」（这是兜底态，正常路径看不到）。

---

## 8. 验收：导出后「该看到什么」

```
┌────────────────────────────── 1080 ──────────────────────────────┐
│ ① 顶部：日期标签居中；T1 另有右上小印（890..990 × 96..196）        │
│ ② P4 背景层：T1 K柱贴底(1150) / T2·T4 纸面四角内缩 72 / T5 插画满幅 │
│ ③ 主体：T1 巨标题 / T2 碑面 / T3 朱红印章(180..900 × 224..524)     │
│ ④ 中段：引文（每模板行数上限不同）                                 │
│ ⑤ 数据：T1 三列(216/540/864) T3 三行(x120·x420) T4 四行(右基944)   │
│ ⑥ 页脚线 y=1150 ──────────────────────────────────────────────── │
│ ⑦ 左：韭菜之王 / slogan / 结局 No.xx 行                            │
│ ⑧ 右：码底板 168×168 @ (840,1176) —— 必须有东西（码/虚线框/韭印）  │
└────────────────────────────── 1440 ──────────────────────────────┘
```

**8 个探针点（自动化也能查）**——任何一点取到的像素 ≈ 背景色，说明那一层没画上：

| # | 坐标 | 期望 | 说明 |
|---|---|---|---|
| 1 | (540, 118) | 非纯色（有字） | 日期标签 |
| 2 | (540, 402) T1 / (540, 422) T2 / (540, 374) T3 / (136, 150) T4 / (540, 880) T5 | 主色块 | 结局名/印章中心 |
| 3 | (540, 636)±20 | 有字形 | 引文首行 |
| 4 | (216, 941) T1 / (420, 1055) T3 / (944, 706) T4 | 数字像素 | 数据/合计 |
| 5 | (540, 1150) | `rgba(253,243,216,.20)` 附近 | 页脚分隔线 |
| 6 | (924, 1260) | **不可是纯 `#fdf6e1`** | 码区（A 黑块 / B 虚线 / C 韭印） |
| 7 | (100, 1302)±30 | 极淡但有字 | 水印行（关水印时此点应为背景） |
| 8 | (1060, 300) | 绒布色 `#17402f` 附近 | 右边缘未被拉伸（防 destWidth 写错） |

**12 条人工自检**
1. 缩到 270×360，结局名 + 金额还能读
2. 没有 <28px 的正文（水印/码说明除外）
3. 纸上无 `#e23c30 / #1e9e5a / #f2b01e`（这三个在奶油纸上不达 4.5:1）
4. 引文没超行数上限（3/3/3/2/2）
5. 两行引文不是「第二行只剩 2~4 字」
6. T3 印章没有压到日期或引文（间距 ≥24）
7. T4 四条虚线同宽（136→944），金额右端全在 944
8. T4 锯齿 16 齿、齿距 57.5、齿尖与纸边同色（不断层）
9. T5 文字全部压在压暗层之上；插画无圆角无描边
10. 码三态同矩形、静区 24 内无元素
11. `WATERMARK=false` 时除水印两层外**逐像素不变**
12. 全卡无「恭喜/赚翻/你太贪心/活该」；代码里搜不到 `new Date()`

---

## 9. 数据接口

```js
d = {
  tpl: 'T1',                 // 'T1'..'T5'  ← END_TPL[name]
  no: 6,                     // END[name].no（1–32，写死、只追加不重排）
  em: '🎰',                  // END[name].em
  name: '快进快出',           // 结局名（= END 的 key）
  grp: '活法',                // '活法' | '死法'
  quote: '三个月，走完了别人十年的路。下一程去哪，你自己挑。',   // END[name].q
  day: 38, net: 86420, trades: 41, risk: 92,
  bill: [ {k:'初始本金',v:18000}, {k:'持仓成本',v:214000},
          {k:'债息',v:97600}, {k:'欠债',v:4120} ],   // 仅 T4 · 引擎真实字段（旧「进出总额/手续费」引擎未记，已废弃）
  total: 101720,             // 仅 T4 · 合计 = 债息 + 欠债
  qr: null, qrState: 'A',    // 'A'|'B'|'C'
  art: { scene: null },      // 仅 T5
  watermark: true,
};
```

取数三条：① `no / em / quote` 全部从 `END` 取，别在展示侧抄第二份；② 图里**不放**昵称、绝对日期、`why` 复盘段、角色名；
③ 一屏最多 3 个数字（T4 是账单、T2 只 1 项）。

---

## 10. 最容易写错的 10 条

| # | 坑 | 正解 |
|---|---|---|
| 1 | 纸上用 `#e23c30 / #1e9e5a` | 纸上红 `#c9302a`、绿 `#157a44`（3.95 / 3.19:1 不达标） |
| 2 | 金 `#f2b01e` 当纸上文字 | 纸上金色系用 `#8a5a12`（1.77:1，看不见） |
| 3 | `textAlign='center'` + 字距 → 整体偏左 | 用 `center()`（`mls` 已扣尾距） |
| 4 | 金额左对齐 / 忘千分位 | `right(…, 944, y)` + `money()` |
| 5 | 负数用连字符 `-` | 用 U+2212 `−` |
| 6 | 水印 A 画在内容之后 | 画在背景之后、纸面/插画之前 |
| 7 | 码 B 态一直转不完 | 1.5s 必须降 C |
| 8 | 先画文字再画插画 | 层序：背景 → 水印A → 纸/插画 → 压暗 → 文字 |
| 9 | `destWidth` 写 2160（跟 dpr 走） | 永远 `destWidth:1080, destHeight:1440` |
| 10 | dpr 直接取 `pixelRatio` | `Math.min(2, dpr)` |

---

## 11. 与 spec 的对应

| 本文 | spec |
|---|---|
| §1 全局准备 | §8.1（dpr）/ §3.1（绒布、网格、噪点） |
| §2 工具函数 | §3.3 |
| §3 水印 A | §3.4 |
| §4 五套模板 | §4.1–§4.5 |
| §5 页脚 / 码三态 | §2.4 / §3.2 / §3.2.1 |
| §6 折行与降字号 | §5 / §2.2 字号阶梯 |
| §7 导出兜底 | §8.2 + `share-flow.md` §7 |
| §8 验收 | §9 验收清单 |
| §9 数据接口 | §10 硬数值接口表 |
