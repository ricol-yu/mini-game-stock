# 结局战绩分享卡 · 体验施工图（share-flow）

> 2026-11-10 · 体验设计。读者：前端（H5 迭代 + 小程序工程）。
> **本文只管流程、状态、权限、兜底、文案。视觉规格（配色/字号/版式）见 `design/share-card-spec.md`（视觉架构师出）。**
> 配套：`ui-adaptation.md`（适配，重点 §3.4 分享卡片 / §5 验收）、`ui-v2-spec.md` §8（5:4 封面）、
> `design/share-card-spec.md`（竖版战绩卡视觉）、`AGENTS.md`（文案调性 + 铁律）。
>
> **本轮不改 `prototype.html`。** 下面的代码是给小程序工程和下一轮 H5 迭代照着写的，形状可直接抄。

## 0. 结论速查

| 问题 | 结论 |
|---|---|
| 画布 | **1080×1440（3:4）**，PNG（T5 有插画时 JPG q88）——已与 `design/share-card-spec.md` §1.1 对齐，不再是我暂定的值 |
| 模板 | **五套（T1 豪言 / T2 认命 / T3 嘴硬 / T4 清算 / T5 温情）**，32 个结局由 `END_TPL` 一对一映射；埋点按 **T1–T5** 分桶 |
| 分享入口放哪 | 结局页「回主菜单」的**右槽**（同一行），不做第三个按钮、不新增行高 |
| 会不会抢主 CTA | 不会。「再来一辈子」46 实心全宽、永远首屏可见、永远唯一实心按钮；分享是**文字链**层级 |
| 每次结局都出吗 | 不。首次解锁某结局 → 完整态；当天首次结局 → 完整态；当天第 2 次起 → 折叠成两字「存图」。**永不隐藏** |
| 图鉴能不能分享 | 能，但只给**已解锁**格子一个相机小图标（晒稀有结局是收集动力）；未解锁不显示 |
| 常驻人物怎么分 | **三档**：A 档普通高频（老婆/老妈/**同事小王**，≤5 次/局、间隔 ≥6 张、第 3 天起）· B 档唯一支线（**你的票 `nidepiao`**，本局最多升段 2 次、段间 ≥8 张、第 1 段最早第 4 天）· C 档一次性（张阿姨/司机，单局每人 ≤1 次、链卡豁免）。小王不加字段、不改数据 |
| 主菜单要不要「我的最佳」分享 | **不做**。数据留着，入口收进图鉴面板顶部一行 |
| 图里放昵称吗 | **不放**（两端拿不到 + 一局刚结束弹授权是最差时机） |
| 图里放日期吗 | **不放绝对日期**。顶部标签是「第 N 天 · 活法/死法」——相对量，永远不过期 |
| 小程序码没有时怎么办 | 走 spec §3.2.1 的 A/B/C 三态，**同一块 168×168 底板**，降级不塌版；C 态印「韭」字方印 + 「搜索 韭菜之王」，**禁止画假二维码** |
| 小程序能不能一键发朋友圈 | **不能**。朋友圈只能玩家自己走右上角「…」，且落地是单页模式。所以：竖图=存相册路径，5:4=好友分享路径，两条腿分工 |
| 生成时机 | 结局页**后台预生成**（tier=full 时延迟 1200ms 起跑），玩家点的时候秒出；`END_TPL` 决定版式 |
| 主要失败点 | 小程序端 canvas 导出空白图（见 §7.1，三个原因打包） |
| 埋点能不能算 H5 保存成功率 | **不能**。H5 无成功信号，只能记「面板展示」。别造假指标（§5.4） |

---

## 1. 入口与时机

### 1.1 结局页的信息层级（硬约束）

现状 `.endcard`（`prototype.html` L783）自上而下：`.em` → `h2` → `.sub` → `.quote` → `.why` → `.life` → `#o-b`（主 CTA）→ `#o-home`（次按钮）。

新增分享槽，**只改 `.o-home` 那一行**：

```
┌─ .endcard（奶油卡，宽 345，内距 22）─────────────┐
│              📉  44px                            │
│              爆了                 20/900          │
│      第 37 天 · 系统替你做了决定      11/ink-2    │
│      「一开始只是想再借一点点。」    13.5/1.9     │
│  ┌ .why 灰底块（一句死因，不上分享卡）─────────┐  │
│  └──────────────────────────────────────────────┘  │
│  ┌ .life 2×2 ────────────────────────────────────┐ │
│  │ 这一辈子 37 天 │ 最后剩下 −¥1,200              │ │
│  │ 买卖次数 12 次 │ 最大回落 −64%                 │ │
│  └────────────────────────────────────────────────┘ │
│  ┌ #o-b「再来一辈子」 46 实心全宽 ──── 唯一主 CTA ┐ │
│  └────────────────────────────────────────────────┘ │
│  [ 回主菜单 42 次按钮 flex:1 ]  [ 📷 存一张 ← 分享槽 ]│
│                                  ↑ 44 热区 / 视觉 20  │
└──────────────────────────────────────────────────────┘
```

| 项 | 值 |
|---|---|
| 槽位 | `#o-home` 与分享槽共用一行 flex；按钮 `flex:1`，分享槽固定宽 **92**（完整态）/ **56**（折叠态） |
| 分享槽总高 | **44**（视觉行 20 + 上下各 12 隐形外扩），不新增行高（原次按钮行 42，取 max 44） |
| 层级 | 文字链。完整态：图标 16 + 文字 12px/700 `--u2-ink`；折叠态：只有「存图」11px `--u2-ink-3` |
| 禁用按钮视觉 | 不做实心、不做描边底色。**它永远不是按钮**——这是「不抢主 CTA」的执行方式 |
| 320 宽 | 折叠态强制（`@media (max-width:359px)`），槽宽 56，无图标 |
| 系统大字号（≥19pt） | 折叠态强制，槽宽 56，无图标 |

**与 `share-card-spec.md` §10① 的差异（已确认，理由如下）**：
spec 建议「主按钮下方加一个次级文字按钮『生成战绩卡』」。方向和本文一致（都在主 CTA 之下、都是文字层级），
但我把它**并进「回主菜单」这一行**，而不是新增一行：
- `.endcard` 是 `max-height:100%; overflow-y:auto` 的弹层，375×667 上现有内容已贴着视口下沿；
- 再加一行 ~44 高 → 主 CTA 被推到折叠线以下，玩家最后一屏看不到「再来一辈子」；
- 并进同行 = **零新增高度**，视觉权重反而更低（不是按钮，是文字链）。
- 文案用「存一张」而不是「生成战绩卡」：4 字比 5 字在 375 宽下少一次挤压，且因为后台预生成（§1.6），
  点下去的动作确实是「存」，不是「等」。生成中的瞬态文案才写「生成中…」。

| 分享槽的四个瞬态 | 呈现 |
|---|---|
| `idle` | 完整态「📷 存一张」／折叠态「存图」 |
| `building`（缓存没命中，正在画） | 「生成中…」（12px，无图标，**不可重复点击**；超过 3s 未完成自动转失败提示） |
| `cached` | 回到 `idle` 的呈现；此时点击直接出图（缓存命中，0 等待） |
| `fail` | 「存一张」（不显示失败状态，点了重新生成；失败原因只在埋点里） |

> 槽位**永不变灰、永不禁用**（除 `building` 那不到 1 秒的窗口）。灰掉的入口等于隐藏。

### 1.2 节流规则（可执行判据）

在 `check()` 命中结局、**调 `recordRun()` 之前**算一次 tier：

```js
/* 结局页分享槽的三档（share-flow §1.2）。
   isNew 必须在 recordRun 之前取——recordRun 一写，unlocked 就有了，判断必假。 */
function shareTier(isNew){
  if(!META.share) META.share = { lastDay:"", hits:0 };
  var today = todayKey();
  if(isNew) return "full";                          // A. 首次解锁这个结局
  if(META.share.lastDay !== today) return "full";   // B. 今天第一次死
  if((META.share.hits || 0) < 3) return "mini";     // C. 今天第 2、3 次
  return "mini2";                                   // D. 今天第 4 次起：更淡，且无图标
}
// 调用处（check() 内，recordRun 前）。hits 语义 = 「今天在这个结局之前已经结束了几次」，
// 必须在覆盖 lastDay 之前读旧值，否则换天时恒为 1、第 4 次永远判不到。
var today  = todayKey();
var prevDay = META.share.lastDay;
var isNew  = !META.unlocked[e[1]];
var tier   = shareTier(isNew);
recordRun(e[1], e[0], d, n);
META.share.lastDay = today;
META.share.hits = (prevDay === today) ? ((META.share.hits | 0) + 1) : 1;
saveMeta();
renderShareSlot(tier);
```

| 触发 | 呈现 | 理由 |
|---|---|---|
| A. 该结局**首次解锁** | 完整态「📷 存一张」，加一次 400ms 描边脉冲（确认动效，不表演） | 收集动力最高点，就这一次 |
| B. 当天第 1 次结局 | 完整态 | 每天给一次正经入口 |
| C. 当天第 2–3 次（连死） | 折叠态「存图」 | 连死已经很烦，别再举牌子 |
| D. 当天第 4 次起 | 折叠态「存图」，无图标、无脉冲 | 高频玩家不打扰 |
| 该结局已解锁 + 当天非首次 | 折叠态 | 同上 |

**永不隐藏。** 隐藏违反「状态可见」（Nielsen #1）：玩家想存图时找不到入口，会以为功能不存在。降权到两字即可，热区仍是 44。

**零催促**：全站**不做**任何「快来分享/存一张发朋友圈」的 toast、红点、角标、气泡。分享入口只在结局页和图鉴里静静待着。玩家主动触发的成功提示（「已存到相册」）不受此限。

**徽标节流的例外**：脉冲只给 A 档，且**每局最多一次**；如果 `?fx=0`（动效总开关）下不播，信息不丢（文案本身在）。

### 1.3 图鉴页入口（晒稀有结局 = 收集动力）

现状 `renderAlbum()` 已解锁格子的 `.alb-rec` 行是「最长一次 37 天 · 终局净值 ¥x」。**只在这一行右端加一个 16px 相机图标**：

```
┌ 已解锁格子（.alb-it.on，两列）────────┐   ┌ 未解锁格子 ──────────┐
│ 💥                        📷     │   │ 💥                   │
│ 爆了                             │   │ ？？？                │
│ 「一开始只是想再借一点点。」       │   │ 杠杆在跌市里从不商量   │
│ 最长一次 37 天 · 终局净值 −¥1,200 │   │ 结局待解锁            │
└──────────────────────────────────┘   └──────────────────────┘
```

| 项 | 值 |
|---|---|
| 出现条件 | `META.unlocked[name]` 存在（**未解锁格子在 DOM 里连图标都不渲染**，不是 `visibility:hidden`） |
| 视觉 | 16px，`--u2-ink-3`；热区 **44×44**（上下左右各外扩 14 / 12），用 `padding` + 负 margin，不用伪元素 |
| 位置 | `.alb-rec` 行尾右对齐。该行加 `padding-right:20px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis` —— 320 宽两列格子里文字会被压缩，允许省略号（它是次要元数据，丢了不影响判断） |
| 为什么不做详情页 | 用户已拍板「砍详情页、格子做大」（`prototype.html` L484 注释）。为分享再开详情页 = 把砍掉的成本加回来。内联图标是唯一不违背该决定的做法 |
| 为什么不做长按 | ① 长按不可发现；② H5 里长按是「保存图片」的原生动作，两个长按会打架。**禁止**用长按承载分享 |
| 给了会怎样 | 玩家会为了「晒出来好看」去追稀有结局（图鉴从记录变成目标）；代价是死法格子的展示欲 → 我们**不**在图鉴里给「稀有度排名」或「%」标签，那会把收集变成攀比 |

### 1.4 主菜单「我的最佳」分享：不做

| 方案 | 判定 | 理由 |
|---|---|---|
| 主菜单 `#h-best` chip 做成可点分享 | ❌ 不做 | ① 主菜单是「进局」的地方，任何额外可点区域都在抢「开始游戏」；② 新玩家 chip 是「🏆 第一局等你开局」，点了没东西可分享；③ 图鉴已经承担「我最好的那一局」，同一能力开两个入口 = 双份维护 + 两套埋点 |
| 图鉴面板顶部加一行「我的最佳」+ 存图 | ✅ 做 | 一行 32 高，`p-card` 内滚动，不动主菜单；入口语义正确（图鉴 = 我的战绩） |

图鉴顶部条（放在 `p-head` 之下、`alb-body` 之上）：

```html
<div class="alb-best">
  <span>🏆 我的最佳：最长 37 天 · 终局 ¥1,240</span>
  <button class="alb-best-b" id="alb-best">存一张</button>
</div>
```
- `META.best.days` 为空时**整条不渲染**（不显示空条 + 不显示 disabled 按钮）。
- 点「存一张」= 用 `META.best` 那局的结局（`recordRun` 需补存 `best.end`）出一张卡，`src='best'`。
- 埋点 `src:'best'` 与图鉴格子 `src:'album'` 分开记，用来回答「玩家更愿意晒哪一局」。

### 1.5 任务流程图

```
一局结束
  │
  ├─ check() 命中结局
  │    ├─ isNew = !META.unlocked[name]        ← 必须在 recordRun 之前
  │    ├─ recordRun() 写图鉴 + 战绩（先写，保证「存图失败也丢不了战绩」）
  │    └─ tier = shareTier(isNew) → 渲染分享槽（full / mini / mini2）
  │
  ├─ [点分享槽] ── loading（≤800ms，超过 300ms 才显示 spinner，避免闪）
  │     │
  │     ├─ 生成成功
  │     │    ├─ 小程序：saveImageToPhotosAlbum ─成功→ 预览浮层（图 + 发给朋友 + 复制文字）
  │     │    │                                └失败→ §2.3.3 四分支
  │     │    ├─ H5 桌面（非 iOS / 非微信内）：a[download] → toast「已存到下载里」
  │     │    └─ H5 iOS / 微信内：预览浮层（<img> + 长按提示 + 复制文字 + 关闭）
  │     │
  │     └─ 生成失败 → §2.5 降级（静态 5:4 图 / 纯文字）
  │
  └─ [图鉴 → 已解锁格子的 📷] 同一套生成管线，只有数据源换成 META.unlocked[name]
```

### 1.6 生成时机：后台预生成（回应 spec §10②）

spec 问「首帧是否容忍 300ms 生成延迟」。**不忍**——分享卡是玩家刚死完的情绪出口，卡一下就会放弃。做法：

| 时机 | 动作 |
|---|---|
| 结局页 `onShow` 后 **1200ms**（等结局动画 + 震屏跑完，不抢主线程） | 若 `tier === 'full'` → 静默生成一次，结果按 `endName + 数据指纹` 缓存 |
| 玩家点分享槽 | 缓存命中 → **立即**出图/存图；未命中 → 显示「生成中…」并当场生成 |
| `tier === 'mini' / 'mini2'` | **不预生成**（连死的人不想被后台干活，也不占内存） |
| 同一局重复点 | 命中缓存，不重画（spec §8.2「同一局只生成一次」） |

理由：预生成把 300ms 的等待从「点击后」搬到「结局动画期间」——玩家看不见的时间不叫等待。
代价是每局多一次 canvas 绘制，所以用 tier 做闸门：**只有真可能被点的局才预生成**。

**缓存键**：`endName + '|' + day + '|' + net + '|' + trades + '|' + tpl`。数据指纹里必须带 `tpl`——否则同一结局换了模板会命中旧图。

### 1.7 响应式与安全区：分享流程只有四处会塌

| 位置 | 断点/条件 | 处理 |
|---|---|---|
| 结局页分享槽 | 宽 <360（SE1）、系统字号 ≥19pt | 强制折叠态「存图」，槽宽 56，去图标；**宽度用固定 px 不用 vw**（`ui-adaptation.md` §1.2 的口径：字号和 1px 线不缩放） |
| 图鉴格子相机图标 | 宽 320，两列网格（每格 ≈138） | `.alb-rec` 允许省略号，图标 16 + 热区 44 用透明外扩，**不新增一行** |
| 长按保存面板 | iPhone 底部安全区（34）、安卓手势条（24） | 关闭按钮距屏底 `calc(env(safe-area-inset-bottom) + 8px)`（可交互元素口径，`ui-adaptation.md` §2.2）；图片区 `max-height: calc(100% - 安全区 - 两行文字)`，**图片永远不压按钮** |
| 小程序 canvas | 折叠屏展开宽 | 生成与屏幕宽**无关**（固定 1080×1440），不做任何响应式；只有预览浮层按 480 封顶居中 |

> 分享卡本身**不做响应式**：它是一张定尺输出（1080×1440），所以在所有机型上必须完全一样。
> 唯一随屏变的是**预览**（浮层里按 `min(320px, 屏宽−64)` 缩放显示），输出文件不变。

---

## 2. 三条保存路径

### 2.1 共用生成管线（状态机）

```js
/* 全站唯一一份分享卡状态机。H5 与小程序共用同名状态，
   渲染层只读 state，不再各自记一套布尔。 */
var SHARE = {
  state: "idle",   // idle | building | cached | saving | done | fail
                   //（页面 setData 里另有一个 ready = 长按兜底就绪态，和这个不是同一个东西）
  url:   "",       // H5: blob URL / 小程序: tempFilePath
  blob:  null,     // H5 专用，close 时置 null
  tier:  "full",
  src:   "over",   // over | album | best
  tpl:   "T1",     // END_TPL[name] 给，T1~T5
  ftype: "png",    // png 默认；T5 带插画且 >600KB 时 jpg q0.88（spec §1.1 / §8.2）
  key:   "",       // 缓存键：end|day|net|trades|tpl
  data:  null      // 生成入参快照（防重入时数据被新一局覆盖）
};
```

**生成入参快照必须深拷贝**：生成是异步的（图加载 + canvas 绘制），期间玩家可能已经点了「再来一辈子」，`S` 被 `reset()` 重置——不清快照会出「上一局的标题配下一局的净值」。

```js
function snapshotForCard(name, em, d, n, opt){   // opt: {trades, mdd}
  return {
    name: name, em: em, day: d, net: n,
    q:    END[name] ? END[name].q   : "",
    grp:  END[name] ? END[name].grp : "lose",
    tpl:  END_TPL[name] || "T2",                 // 映射只有一处，见 spec §0
    trades: opt.trades, mdd: opt.mdd             // 卡上只画这几个数，见 spec §10 硬数值接口表
  };
}
```

**卡上只有三个数字位（硬上限）**：一屏最多 3 个数字，多了在朋友圈 270×360 的单格里就开始糊。
所以**四属性终值（心态 / 社会 / 风险）不上卡**（2026-11-11 与 visual-architect 对齐，spec §10 写死）——
它们是**过程量**，玩家分享的是「我怎么走的」，不是血压心跳；这四个值 App 内结局页的 2×2 数据格已经有了，卡上重放一遍不增加信息。
各模板取哪几个：**T1 = 净值 / 天数 / 买卖次数 · T3 = 净值（负数）/ 买卖次数 / 最大回落 · T4 = 账单 4 行 + 合计 · T5 = 天数 + 净值（只 2 项）**。

**数据缺口规则（重要）**：图鉴格子分享时，`META.unlocked[name]` 只有 `{em, days, net, times}`，**没有 `mdd`**。
→ **渲染器不许自造字段**，字段缺了就整块不渲染（不是画 0、不是画 `—`），版式自动上移。T1/T5 不受影响，只有 T3 的第二列会退化成两列。
→ 建议 `recordRun()` 补存 3 个字段（约 +40B/结局，`localStorage` 完全够）：

```js
META.unlocked[name] = {
  em: em, days: d, net: Math.round(n), times: times,
  trades: S.trades, mdd: S.mdd, end: name        // end 供「我的最佳」反查结局
};
```
老存档缺字段 → 走「不渲染」分支即可，**不写迁移脚本**（原型阶段没必要）。

### 2.2 H5 / 浏览器

#### 2.2.1 平台判定

```js
var UA = navigator.userAgent || "";
var IS_IOS  = /iP(hone|ad|od)/.test(UA) ||
              (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);  // iPadOS 13+ 伪装成 Mac
var IN_WX   = /MicroMessenger/i.test(UA);
var HOLD_PATH = IS_IOS || IN_WX;    // 走「长按保存」，不做 a[download]
```

**为什么 iOS 一律走长按**：iOS Safari 声称支持 `download`（`'download' in a === true`），但 blob URL 通常被当作图片**打开新标签**，玩家看到一张满屏的图、不知道下一步；微信 iOS/Android webview 干脆拦掉下载。所以**不做能力探测，按平台直接分支**——探测在这里是骗人的。

#### 2.2.2 生成 + 下载（非 iOS / 非微信内）

```js
/* 画布与导出格式与 share-card-spec.md §1.1 对齐 */
var CARD = { W:1080, H:1440 };

/* 只有 T5（带插画）允许走 JPG，其余一律 PNG（spec §1.1 / §8.2）。
   同一张卡在两端必须导出同一种格式，否则「玩家存下来的图」左右不一致。 */
function cardFmt(tpl){
  return tpl === "T5"
    ? { type:"image/jpeg", q:0.88, ext:"jpg" }
    : { type:"image/png",  q:1,    ext:"png" };
}

function cardCanvas(){
  var c = document.createElement("canvas");
  c.width = CARD.W; c.height = CARD.H;   // 导出即 1080×1440，不再乘 DPR
  return c;
}

function canvasToBlob(cv, type, q){
  return new Promise(function(res, rej){
    if(cv.toBlob){
      cv.toBlob(function(b){ b ? res(b) : rej(new Error("toBlob-null")); }, type, q);
      return;
    }
    try{                                  // Safari < 11 / 老安卓 webview
      var url = cv.toDataURL(type, q), bin = atob(url.split(",")[1]),
          u8 = new Uint8Array(bin.length);
      for(var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
      res(new Blob([u8], { type: type }));
    }catch(e){ rej(e); }
  });
}

function saveH5(){
  var fmt = cardFmt(SHARE.tpl);
  SHARE.state = "building";
  SHARE.ftype = fmt.ext;
  return canvasToBlob(cardCanvas(), fmt.type, fmt.q).then(function(blob){
    var url = URL.createObjectURL(blob);
    SHARE.blob = blob; SHARE.url = url;
    if(HOLD_PATH){ SHARE.state = "cached"; openHoldSheet(url); return; }
    var a = document.createElement("a");
    a.href = url; a.download = "jiucai-" + SHARE.data.name + "." + fmt.ext;
    document.body.appendChild(a); a.click(); a.remove();
    SHARE.state = "done";
    toast("已存到下载里");
    track("share_save_ok", { path:"h5-dl", tpl:SHARE.tpl });
    setTimeout(function(){ URL.revokeObjectURL(url); }, 30000);   // 30s 后回收，别立刻 revoke（下载还没开始）
  }).catch(function(err){
    SHARE.state = "fail";
    track("share_save_fail", { path:"h5-dl", msg:String(err && err.message || err).slice(0,40) });
    fallbackCopyOnly();
  });
}
```

#### 2.2.3 长按保存面板（iOS Safari / 微信内）

```html
<!-- 全屏浮层。图中必须是真的 <img>，不能是 background-image -->
<div class="hold-sheet" id="holdSheet" role="dialog" aria-modal="true"
     aria-labelledby="holdTitle" hidden>
  <h3 id="holdTitle">图已经做好了。长按它，存到相册。</h3>
  <img id="holdImg" src="" alt="战绩卡：第 37 天，爆了，终局净值 −¥1,200。长按可存到相册。">
  <p class="hold-tip">存下来，发给那个也在这个群里的人。</p>
  <div class="hold-acts">
    <button id="holdCopy">复制文字</button>
    <button id="holdClose">好了</button>
  </div>
</div>
```

三条**必须**遵守（否则长按菜单里没有「存储图像」）：

1. 用 `<img>`，**不要**用 `div` + `background-image`（背景图没有长按菜单）。
2. `<img>` 上**不许**：`pointer-events:none`、`-webkit-touch-callout:none`、`user-select:none`、`draggable=false`、覆盖透明层拦住指针。项目里 `.card .art img` 有这些规则（L320），**分享面板的 img 不能继承卡面那套**——选择器要写死在 `.hold-sheet img` 上，别用通用 `img`。
3. `src` 必须是 blob URL 或 data URI，**不能是同源外的 http 图**（跨域图在部分 webview 里长按只能「发送给朋友」）。

关闭时回收：

```js
function closeHoldSheet(){
  $("holdImg").removeAttribute("src");     // 先断 src，再 revoke，iOS 上顺序反了会白屏闪一下
  if(SHARE.url){ URL.revokeObjectURL(SHARE.url); SHARE.url = ""; }
  SHARE.blob = null; SHARE.state = "idle";
  $("holdSheet").hidden = true;
  $("shareSlot").focus();                  // 焦点回原位（无障碍）
}
```

**关键事实：H5 这条路径拿不到「保存成功」信号。** 玩家可能长按了、也可能关掉了。所以：
- 埋点记 `saveShown`（面板展示），**不记** `saveOk`。
- 不要给「保存成功」的 toast —— 我们不知道，撒谎比不说更糟。
- 面板里同时提供「复制文字」，作为无图/存不进去时的等价物（也是无障碍与抖音的备选形态）。

#### 2.2.4 纯文字兜底

```js
var CARD_TEXT = function(d){        // 复制到剪贴板的文字版（≤120 字，微信/抖音都能贴）
  return "《韭菜之王》第 " + d.day + " 天，" + d.name + "。\n" +
         d.q + "\n" +
         "这一辈子 " + d.day + " 天 · 最后剩下 " + money(d.net) +
         (d.trades != null ? " · 买卖 " + d.trades + " 次" : "") + "\n" +
         "你的一辈子，能撑多少天？";
};
function fallbackCopyOnly(){
  copy(CARD_TEXT(SHARE.data || currentCardData()), function(ok){
    toast(ok ? "图没做出来，文字复制好了。" : "图没做出来，长按这一屏截个图也行。");
  });
}
```

### 2.3 微信小程序

#### 2.3.1 生成（canvas 2d）

```html
<!-- 必须可布局、不可见。禁止 display:none / wx:if="{{false}}"（见 §7.1）
     CSS 尺寸 = 1080×1440，与 spec §8.1 的坐标系一致：ctx.scale(dpr,dpr) 之后 1 绘图单位 = 1 CSS px，
     于是 canvasToTempFilePath 的 width/height（CSS px）与 1080/1440 天然对齐，不用换算。 -->
<canvas type="2d" id="shareCanvas"
        style="position:fixed;left:-9999px;top:0;width:1080px;height:1440px;"></canvas>
```

```js
const CW = 1080, CH = 1440;      // 与 share-card-spec §1.1 同源

Page({
  data: { state:"idle", tempFile:"", needAuth:false, holdMode:false },

  onShareTap(){
    if(this._canvas) return this.build();
    this.prepare(() => this.build());
  },

  prepare(cb){
    wx.createSelectorQuery().in(this)
      .select("#shareCanvas").fields({ node:true, size:true })
      .exec(res => {
        const r = res && res[0];
        if(!r || !r.node) return this.fallbackStatic("canvas-missing");
        const canvas = r.node, ctx = canvas.getContext("2d");
        /* dpr 上限取 2（对 spec §8.1 的唯一修正）：
           dpr=3 时 backing store = 3240×4320 ≈ 56MB RGBA，低端安卓会 OOM 闪退；
           dpr=2 时 ≈ 24.8MB，安全。导出固定 1080×1440，dpr 只影响 1px 描边的过采样精度，
           2 倍已经完全够 —— 分享图没人放大到 300% 看描边。 */
        const dpr = Math.min(2, wx.getWindowInfo().pixelRatio || 2);
        canvas.width = CW * dpr; canvas.height = CH * dpr;
        ctx.scale(dpr, dpr);                       // ← 之后一律用 1080 基准坐标作画
        this._canvas = canvas; this._ctx = ctx;
        // canvas 刚拿到节点时布局可能还没完成，立刻画会出空白图
        wx.nextTick(() => cb && cb());
      });
  },

  build(){
    if(this._key && this._key === cacheKey(this.data.snap)){   // 预生成命中（§1.6）
      return this.save(this._cacheFile);
    }
    this.setData({ state:"building" });
    const snap = this.data.snap;                  // 页面 onLoad 时已做深拷贝
    loadImg(this._canvas, snap.artPath)           // 卡面人物/场景（本地路径，见 §7.1）
      .catch(() => null)                          // 素材失败不拦路，版式留白由渲染器兜
      .then(() => drawCard(this._ctx, snap))      // 具体绘制见 share-card-spec
      .then(() => this.export())
      .catch(e => this.fallbackStatic("draw:" + e.message));
  },

  export(){
    const fmt = this.data.snap.tpl === "T5"
      ? { fileType:"jpg", quality:0.88 }
      : { fileType:"png", quality:1 };            // spec §1.1 / §8.2
    wx.canvasToTempFilePath({
      canvas: this._canvas,
      x:0, y:0, width:CW, height:CH,              // CSS px 口径，与 canvas 的 CSS 尺寸一致
      destWidth:CW, destHeight:CH,
      ...fmt,
      success: r => {
        this._cacheFile = r.tempFilePath;         // 缓存到 USER_DATA_PATH（spec §8.2）
        this._key = cacheKey(this.data.snap);
        this.save(r.tempFilePath);
      },
      fail: e => this.fallbackStatic("temp-file:" + (e && e.errMsg))
    }, this);
  }
});
```

> **内存对账**（写在这里，免得下次有人把 dpr 上限改回 3）：本页只允许存在**一张** 1080 基准画布。
> 预生成 + 玩家手动点 = 同一次 `prepare`，`prepare` 内部对 `this._canvas` 做存在性判断，**永不重建节点**。

```js
function loadImg(canvas, src){
  return new Promise((res, rej) => {
    const img = canvas.createImage();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("img:" + src));
    img.src = src;
  });
}
```

#### 2.3.2 保存 + 授权流程

```js
const SCOPE = "scope.writePhotosAlbum";

/* 三种授权态：unset（从没问过）/ granted（开着）/ denied（拒过）
   拒过之后不要再调 saveImageToPhotosAlbum —— 它必然秒 fail，
   而且 iOS 上重复弹会累积「抖动」，玩家会以为点坏了。 */
ensureAlbum(){
  return new Promise(res => {
    wx.getSetting({
      success: r => {
        const a = (r.authSetting || {})[SCOPE];
        res(a === undefined ? "unset" : (a ? "granted" : "denied"));
      },
      fail: () => res("unset")
    });
  });
},

onSaveTap(){
  this.ensureAlbum().then(st => {
    if(st === "denied") return this.setData({ needAuth:true });   // 走自定义引导
    this.save(this.data.tempFile);                                // unset/granted 都直接调，系统会弹一次
  });
},

save(fp){
  this.setData({ state:"saving" });
  wx.saveImageToPhotosAlbum({
    filePath: fp,
    success: () => {
      this.setData({ state:"done" });
      track("share_save_ok", { path:"mp" });
      wx.showToast({ title:"已存到相册", icon:"none", duration:1600 });
      this.setData({ preview:true });      // 成功之后才给预览 + 次级动作
    },
    fail: err => this.onSaveFail(err, fp)
  });
},

onSaveFail(err, fp){
  const msg = (err && err.errMsg) || "";
  track("share_save_fail", { path:"mp", msg: msg.slice(0, 40) });

  if(/auth|authorize|permission|deny/i.test(msg)){
    // ① 拒过/系统拦住 → 自定义引导，不再重复调 API
    this.setData({ needAuth:true, tempFile:fp, state:"idle" });
  } else if(/cancel/i.test(msg)){
    // ② 玩家在系统弹窗点了「取消」→ 静默收手，一个字都别追问
    this.setData({ state:"idle" });
  } else if(/exceed|space|full|storage/i.test(msg)){
    // ③ 相册空间/系统错误 → 长按保存兜底
    this.setData({ tempFile:fp, holdMode:true, state:"ready" });
  } else {
    // ④ 未知（低版本基础库、系统权限里「照片」被设成「无」等）→ 同样给长按兜底 + 一句可执行的提示
    this.setData({ tempFile:fp, holdMode:true, state:"ready" });
  }
},

onOpenSetting(){                            // 必须由用户 tap 直接触发
  wx.openSetting({
    success: r => {
      if(r.authSetting[SCOPE]) this.save(this.data.tempFile);   // 开好了，直接续上刚才那次
      else this.toast("还是没开。存图这一步就先跳过。");
    },
    fail: () => this.toast("设置页没打开，去手机设置里找「照片」也行。")
  });
}
```

授权引导弹层文案（不用「需要授权」这种系统腔）：

```
标题：要存到相册，得先给个权限。
正文：刚才那次点了「不允许」。想存的话，去设置里把「保存到相册」打开——
      不存也没关系，这一局已经记进图鉴了。
主按钮：去设置      次按钮：算了
```

三条铁律：

1. **`wx.openSetting` 只能由用户点击直接触发**（异步回调里调会 `fail: can only be invoked by user TAP gesture`）。所以「去设置」必须是一个真按钮，不能自动弹。
2. **首次拒绝后不要再自动调 `saveImageToPhotosAlbum`**：必 fail，且部分安卓机型会连弹两次导致页面卡住。
3. **一局只弹一次授权引导**（`META.share.authIntroShown`），同一局第二次点「存图」直接给长按兜底，不再劝。

#### 2.3.3 长按保存兜底（小程序）

```html
<block wx:if="{{holdMode}}">
  <p class="hold-tip">相册写不进去。长按这张图，一样能存。</p>
  <image src="{{tempFile}}" mode="widthFix" show-menu-by-longpress="{{true}}" />
</block>
```
- `show-menu-by-longpress` 需基础库 **≥2.13.0**（`app.json` 里 `"lazyCodeLoading"` 不必动，只在 `wx.canIUse('image.show-menu-by-longpress')` 为假时降级成「截图这一屏」）。
- 兜底提示语必须是**可执行动作**（长按这张图），不要写「保存失败，请重试」——重试还是失败。

#### 2.3.4 生成失败的降级链

```js
fallbackStatic(reason){
  track("share_gen_fail", { reason: String(reason).slice(0, 60) });
  this.setData({
    state:"ready",
    holdMode:false,
    staticMode:true,                       // 用 assets/bg/share.jpg（5:4 静态图，已有）
    staticTip:"这张先用着。"
  });
  // 第二条腿：文字总能给
  wx.setClipboardData({ data: CARD_TEXT(this.data.snap) });   // 失败也不提示，静默
}
```
三层降级，上一级失败永远有下一级：**竖版战绩卡 → 5:4 静态图 → 纯文字（剪贴板）**。

### 2.4 小程序分享能力的真实边界（产品取舍）

| 想做的事 | 能不能 | 依据 / 结论 |
|---|---|---|
| 玩家点按钮 → 直接发到**朋友圈** | ❌ 不能 | 朋友圈分享只能玩家自己走右上角「…」→ 分享到朋友圈；且落地是**单页模式**（页面能力受限、不能直接玩，需要「前往小程序」）。所以「发朋友圈」这件事我们**只能靠玩家存图自己发** |
| 玩家点按钮 → 发给好友/群 | ✅ 能 | `<button open-type="share">` → `onShareAppMessage`。**必须由按钮触发**，不能 `wx.` 直接调起 |
| `onShareAppMessage` 的图 | 5:4，**不是 3:4** | 自定义 `imageUrl` 建议 **500×400**，≤80KB；不传则截图页面顶部（会截到 HUD，很难看）。现有 `assets/bg/share.jpg` 正是这个规格，**保持不动** |
| `onShareTimeline` 的图 | 也是 5:4 | 与上一条共用 `share.jpg`；它只是「…菜单里朋友圈」的元数据，不等于「一键发朋友圈」 |

**取舍结论：两条腿，各干一件事，不互相替代。**

| 路径 | 形态 | 谁触发 | 内容 | 位置 |
|---|---|---|---|---|
| **存相册 → 自己发** | 竖版战绩卡 1080×1440 | 玩家点「存一张」 | 结局名 + 第 N 天 + 净值 + 引言 + 小程序码 | 结局页分享槽、图鉴格子、图鉴顶部 |
| **发给好友/群** | 5:4 封面 + 落地页 | 玩家点「发给朋友」（分享预览浮层里） | `share.jpg`（**无用户数据**）+ title 带天数与结局 | 分享成功后的预览浮层 |

```js
onShareAppMessage(){
  const s = this.data.snap || {};
  return {
    title: s.name ? ("我这一辈子撑到第 " + s.day + " 天，" + s.name) : "韭菜之王：每天一张卡，左滑抽身，右滑投入",
    path: "/pages/game/game",                 // 不带 scene：好友点开是干净的主菜单
    imageUrl: "/assets/bg/share.jpg"
  };
}
```
> title 里带天数与结局名，**图里不带**（`ui-v2-spec.md` §8 已定：「不放真实用户数据」）。理由：图会被二次转发到任何地方，而 title 只在好友会话里出现一次，隐私面小得多。

### 2.5 三条路径对照表（施工时照这张填）

| 平台 | 能力 | 触发 | 成功判定 | 失败兜底 | 用户看到的文案 |
|---|---|---|---|---|---|
| H5 桌面（Chrome/Edge/Safari） | `canvas.toBlob` + `a[download]` | 点「存一张」 | 触发下载事件（**无法确认写盘**） | 浏览器拦下载 → `fallbackCopyOnly()` | 成功：「已存到下载里」／失败：「图没做出来，文字复制好了。」 |
| H5 iOS Safari | 无下载，只能长按 | 点「存一张」 | **无信号** | 长按面板 | 「图已经做好了。长按它，存到相册。」 |
| H5 微信内置（iOS/Android） | 长按保存图片 | 点「存一张」 | **无信号** | 长按面板 + 复制文字 | 同上 + 「存下来，发给那个也在这个群里的人。」 |
| 小程序 iOS | `saveImageToPhotosAlbum` | 点「存一张」 | API success 回调 | 授权引导 → openSetting → 长按 image → 静态图 → 文字 | 「已存到相册」 |
| 小程序 Android | 同上 | 同上 | 同上 | 同上（安卓多一条「系统相册权限被设成无」分支） | 同上 |
| 小程序 → 朋友圈 | **不可编程触发** | 玩家自己「…」 | — | 不做 | — |
| 小程序 → 好友/群 | `<button open-type="share">` | 点「发给朋友」 | `shareTicket` 无法确认到达 | 不做 | 系统分享面板自带 |

---

## 3. 分享卡的钩子

### 3.1 小程序码：位置、大小、落地页

| 项 | 值 |
|---|---|
| 位置 / 尺寸 | **168×168 @ (840, 1176)**，静区 24（`share-card-spec.md` §2.4 / §3.2 已定，直接抄 `roundRect(ctx,840,1176,168,168,8)`） |
| 底板 | 奶油圆角方 + 3px `#241a0e` 描边，**正常态会被码图覆盖**，它的作用是「无码时托住这块区域」 |
| 生成方式 | 服务端 `wxacode.getUnlimited`，需 access_token。**原型阶段没有服务端** → `CARD_QR = null` 走 §3.2 降级 |
| scene | **只带结局编号**：`e=7`。**不带天数、不带净值** |
| 编号从哪来 | ⚠️ **不能直接用 `ALBUM` 的下标**——`END_GROUPS` 一旦插入新结局，后面所有编号全错位，已印出去的 32 张码会指向错误的结局（和 `card.id` 同一条铁律）。用 **`END[name].no`**（1–32 写死，**新结局只追加、永不重排**）——这个字段已进 `share-card-spec.md` §3.4，**水印和码共用同一套号**，不会出现两套编号打架 |
| 水印同源 | 图上水印写 `结局 No.06`，取的就是 `END[name].no`。**一个结局只有一个号**，改号等于改码 = 已发出去的图全废 |
| 为什么 scene 只带编号 | 32 个结局 → 可**预生成 32 张码**存本地/CDN（一次生成，长期复用）；若带上天数，组合爆炸（32×360），必须每次请求，弱网下必然失败。天数放卡面文字里，扫码后不需要它 |
| 落地页 | `pages/game/game`，`onLoad` 读 `options.scene` → `decodeURIComponent` → 解析 `e` |
| 落地行为 | **进主菜单，不自动开局。** 顶部 chip 换成一句：`你朋友走到了「爆了」`（≤14 字，1 行）。主 CTA 仍是「开始游戏」 |
| 为什么不自动开局 | ① 会自动消耗一次 `lives`，玩家没同意就花了次数；② 扫码者 99% 是第一次见这个游戏，直接扔进一张卡会懵；③ 主菜单是唯一的「规则第一屏」 |

```js
// pages/game/game.js
onLoad(opt){
  const sc = opt && opt.scene ? decodeURIComponent(opt.scene) : "";
  const m = /(?:^|&)e=(\d{1,2})/.exec(sc);
  if(m){
    const name = END_BY_NO[+m[1]];         // 由 END[name].no 反查，不读 ALBUM 下标
    if(name){
      META.arriveFromCard = { end: name, t: Date.now(), n: (META.arriveFromCard?.n || 0) + 1 };
      saveMeta();
      this.setData({ arriveTip: "你朋友走到了「" + name + "」" });
    }
  }
}
```
> H5 原型同口径用 `?from=card&e=7` 验同一套流程（不需要服务端就能把 §3.1 的落地页跑通）。

### 3.2 小程序码还没生成时的降级（走 spec §3.2.1 的 A/B/C 三态）

**铁律：不留空框，也不许画假二维码。** 那块 168×168 里必须始终有东西，且三态尺寸完全一致。

| 态 | 触发 | 画法（spec §3.2.1 原文口径） | 我的流程要求 |
|---|---|---|---|
| **A 正常** | 码已缓存 | `drawImage(codeImg, 840, 1176, 168, 168)` | 32 张码随包/首发下载，命中率应 >95% |
| **B 生成中** | 首次进结局页、码在异步取 | 同一块奶油底 + 虚线内框 `setLineDash([8,6])`、2px、内缩 12；框内两行 24/600：`小程序码` / `正在生成` | **只允许存在 ≤1.5s**（超时即降到 C），否则是一块永远转不完的占位 |
| **C 不可用** | 码服务异常 / 下载失败 / 超时 | 同底板 + 88×88 双线方印（字「韭」40/900）+ 下方 24/600「搜索 韭菜之王」 | 主路径。**不阻断分享**（spec §10③ 已确认） |

```js
/* 三态共用同一块矩形，切换只换矩形内部的画法。
   CARD_QR: null=未取到 / 'pending'=取图中 / 字符串=本地或临时文件路径 */
function drawQrBox(ctx, CARD_QR){
  roundRect(ctx, 840, 1176, 168, 168, 8);
  ctx.fillStyle = "#fdf6e1"; ctx.fill();
  ctx.strokeStyle = "#241a0e"; ctx.lineWidth = 3; ctx.stroke();   // 底板三态都有

  if(CARD_QR && CARD_QR !== "pending"){
    ctx.drawImage(CARD_QR, 840, 1176, 168, 168);                  // A
  } else if(CARD_QR === "pending"){
    ctx.save();                                                   // B
    ctx.setLineDash([8, 6]); ctx.lineWidth = 2;
    ctx.strokeStyle = "rgba(43,31,18,.35)";
    ctx.strokeRect(852, 1188, 144, 144);                          // 内缩 12
    ctx.restore();
    drawCenter2Lines(ctx, "小程序码", "正在生成", 924, "24px 600");
  } else {
    drawSeal(ctx, "韭", 924, 1218, 88);                           // C：88×88 双线方印
    drawCenter(ctx, "搜索 韭菜之王", 924, 1320, "24px 600");
  }
}
```
- 取码超时：**1500ms** → `CARD_QR` 直接落 `null`（走 C），不留在 B。
- 有码/无码两版导出图**叠在一起比**：除这 168×168 矩形内的像素外零位移（§6.1 有对应条目）。
- 静区 24 内不许有任何元素（`y > 1152` / `x > 816` 是禁区，spec §2.4 已定）。
- **底板必须无条件先画**（三种态都先铺奶油底 + 描边）：A 态的 `drawImage` 会把底板整个盖住，若只在 B/C 画底板，从 B/C 切到 A 的那一帧会闪一下白（spec 复核提出的实现细节，照做即可，无额外成本）。

### 3.3 昵称与日期：结论与理由

| 项 | 结论 | 放了会怎样 | 不放会怎样 |
|---|---|---|---|
| **玩家昵称** | **不放** | ① 小程序拿不到昵称（`wx.getUserProfile` 已收紧为「必须用户主动点授权」，一局刚结束时弹这个 = 全场最差的授权时机，很可能连相册权限一起被拒）；② H5 无账号；③ 两端数据形态不一致 → **同一份设计在两端产出不同的图**，维护成本翻倍；④ 昵称是可变的社交标签，一旦玩家改名，旧图就成了「查无此人」 | 少了「这是我的」的独占感。用**结局 + 天数 + 净值**替代——这三项比昵称更能说明「我是谁」，而且是游戏内生的 |
| **绝对日期**（2026.11.10） | **不放** | 图会「过期」：三个月后翻出来，玩家会觉得「这是老图，别发了」，反而抑制二次传播 | 少了一个「纪念某一天」的仪式感。用**顶部标签「第 38 天 · 活法」**替代（spec §4.1 的日期位就是这一行的位置）——它是相对量，永远新鲜；「活法/死法」还顺手承担了分组语义 |

> 说明：spec 的「日期标签」在坐标表里叫日期位，**内容口径是相对天数 + 分组**，不是绝对日历日。这一条我和 spec 一致，前端不要自己塞 `new Date()`。

正文保持克制口气，图上只落这几类信息（取值来源写死，**渲染器不许自造字段**）：

| 位置 | 内容 | 取值 | 出现模板 |
|---|---|---|---|
| 顶部标签 | 第 N 天 · 活法/死法 | `S.day` + `END[name].grp`（`win→活法`、`lose→死法`） | T1 T2 T3 T4 |
| 图标 | emoji | `END[name].em` | T1 T2 T3 T5 |
| 标题 | 结局名 | `END[name]` 的 key | 全 |
| 引言 | 一句白描 | `END[name].q` | 全 |
| 数据 | 终局净值（带 ▲▼ 符号） | `S.net` / `unlocked.net` | 全 |
| 数据 | 这一辈子（第 N 天）/ 买卖次数 / 最大回落——**最多 3 个数字** | `S.day·trades·mdd`（图鉴来源缺 `mdd`） | T1 三列（净值/天数/买卖）· T3 三列（负数/买卖/回落）· T5 只 2 项（天数/净值）· T4 走账单表格；**缺字段整块不渲染** |
| **不放** | 四属性终值（心态 / 社会 / 风险） | 过程量，且一屏超过 3 个数字在缩略图里就糊（spec §10） | — |
| 钩子 | 小程序码 A/B/C | §3.1 / §3.2 | 全 |
| **不放** | `.why` 那句死因 | 一句话（≤42 字），但它是**给自己看的判断**，朋友圈里已经有 `.q` 白描；两句并排只是重复 | — |
| **不放** | 玩家昵称、绝对日期、排名/百分位 | §3.3 上表 | — |

### 3.4 复制文字版（第三条腿，别省）

不是兜底才做，是**常规能力**：抖音的图文形态以文字为主、无障碍用户拿不到图、H5 存不进相册时也需要它。

```
《韭菜之王》第 37 天，爆了。
一开始只是想再借一点点。后来每一个这样想的人，都长得差不多。
这一辈子 37 天 · 最后剩下 −¥1,200 · 买卖 12 次
你的一辈子，能撑多少天？
```
- 行数固定 4 行，≤120 字（微信粘贴框一屏能看全）。
- 复制成功 toast：「文字复制好了。」
- 复制失败（无剪贴板权限）：「长按这一屏，自己截一张。」

---

## 4. 常驻人物：A 普通高频 / B 唯一支线 / C 一次性（三档，team-lead 定稿）

> 人设、语言指纹、口头禅、现有弧线映射见 `design/characters.md`（同一批交付）。
> 本文只回答**前端要执行的判据**：谁能出现几次、怎么认出是同一个人、哪些话能重复、图鉴要不要分区。
> **2026-11-11 定稿版**：B 档是「你的票 `nidepiao`」；**同事小王归 A 档普通高频**（不加 `tier`/`stage`、不改数据、不扩卡）。

### 4.0 档位分工（最终版）

| 档 | 角色 | 做什么 | 数据字段 | 配额 |
|---|---|---|---|---|
| **A 档 · 普通高频** | 老婆 `laopo`（32 张）、老妈 `laoma`（9 张）、**同事小王 `tongshi_xiaowang`（3 张）** | 老婆/老妈不加卡，只把**说话方式锁死**（先问钱再问人 / 先说身体再说钱）；小王保持 3 张，不扩卡、不做弧线 | **一律不加** `tier` / `stage` | §4.1：**≤5 次/局 · 间隔 ≥6 张 · 第 3 天前不登场**（三人共用这一套） |
| **B 档 · 唯一支线** | **你的票 `nidepiao`**（4 张 → 10 张，6 张已进池） | 全场唯一一条能**推进**的线：3 段（说话 → 评价你 → 沉默），每段 2 张涨/跌互斥变体 | `tier:"B"` + `stage:1/2/3` **成对** | §4.2：本局最多**升段 2 次**，**不占** A 档的 5 次 |
| **C 档 · 一次性** | 张阿姨 `zhangayi`、出租车司机 `taxi` | 一次性。杀伤力来自「突然冒出来说一句」，重复就废 | 无 | §4.1 末尾：**单局每人 ≤1 次**（链卡豁免） |

> **小王为什么归 A 档、不是 C 档**（2026-11-11 team-lead 拍板）：他 3 张卡全是职场场景，「同事天天见」不违和；
> 限成 ≤1 次，另外两张就永远是抽不到的死卡，等于白删两张内容。C 档只留给「靠突然出现才有杀伤力」的人。

> **A 档和 B 档的区别不是"出现几次"，是"会不会变"**：A 档是**同一个人在不同的处境里**（她始终是她），
> B 档是**同一个东西在不同的时候**（劝你拿住 → 开始评价你 → 不说话了）。
> 所以 B 档要 `stage` 字段，A 档不要——A 档一旦有 stage 就变成连续剧了。

> **为什么票值这个位置**：它现有 4 张全是"卖 / 不卖"的动作卡，**没有一张自己开口说话**。
> 「我的股票开口跟我说话」是这个游戏独一份的东西，别人抄不走；而且它**不需要新美术**（走空镜头，见 §4.3）。
> 小王那种「同事跟着买」的内容，抖音一抓一大把。

### 4.1 A 档频次（老婆 / 老妈 / 同事小王，三人共用一套普通卡配额）

| 约束 | 值 | 为什么是这个数 |
|---|---|---|
| 单角色一局上限 | **5 次** | 60 天的局里家庭卡约 15 张；一个角色占 5 张 = 三分之一，再多就从「熟人」变「阴魂不散」 |
| 两次出现最小间隔 | **6 张卡**（=6 天） | 现有同 tag 冷却就是 `recentTag(tag,6)>=2`（`bagFind` L2009），角色级的密度要比分类级更稀，直接取 1 次/6 张 |
| 首次出现最早时点 | **第 3 天** | 第 1–2 天是教程和世界观铺底，常驻角色提前登场会把「一辈子」压成「一场戏」 |
| 链卡最早时点 | 前置卡 **+1 天**（不能同日） | 同日回响读起来像同一张卡的续集，玩家会以为没翻页 |

实现（挂在 `bagFind` 里，与既有 `strict` 冷却同一层，**只对 A 档生效**）：

```js
/* A 档角色密度控制（新增）。与 recentTag 同层，只作用于普通抽卡。
   B 档支线卡（c.tier === "B"）不进这里，走 §4.2 的支线闸门。 */
function recentWho(wid, n){
  var cnt = 0, lim = Math.min(n, _recent.length);
  for(var i = 0; i < lim; i++){ var c = CARDS[_recent[i]]; if(c && c.wid === wid) cnt++; }
  return cnt;
}
// bagFind(…) 内，紧接 tagCap 那行之后：
if(c.wid && c.tier !== "B" && !isChain(c) && strict){
  if(S.day < 3) continue;                       // 第 3 天前不登场
  if(recentWho(c.wid, 6) >= 1) continue;        // 6 张内不重复
  if((S._whoCnt[c.wid] | 0) >= 5) continue;     // 单局 5 次封顶
}

/* C 档：张阿姨 / 司机，单局每人 ≤1 次（硬上限，不是"尽量少出"）
   ⚠️ 只挂在 bagFind（普通抽卡）。司机的第二张 mkt_taxi_02 是链卡
   （when 里有 did:mkt_bull_taxi_01.r），走 bagFindChain——**它必须豁免**，
   否则「一次」的后半条永远出不来，等于把那张卡删了。链卡算同一次。 */
var C_ONCE = { zhangayi: 1, taxi: 1 };
if(c.wid && C_ONCE[c.wid] && !isChain(c) && strict){
  if((S._onceCnt[c.wid] | 0) >= 1) continue;    // 说过一次就再也不来
}
```

> **不做「C 档彼此不同局」**（2026-11-11 team-lead 裁决，视觉的 `characters-cast.md` 里曾写过，已要求删除）。
> 三条理由，记在这儿免得再被翻出来：① **撞面概率本来就低**——两人各自 ≤1 次/局，还要各自满足 `when`（司机等涨/跌极端日、张阿姨等持仓情境），一局 30 多张卡的寿命里重叠窗口很窄；
> ② **同局撞上是加分**——「先被张阿姨劝了一嘴，晚上又被司机上了一课」，两件糟心事叠着，情绪是累加的，比分散在两局更有戏。真正要防的是「同一个人在局里出现两次」，单人 `_onceCnt` 已经管住了；
> ③ **闸门越多卡池越窄**——再加一层组级互斥，「今天一整天都很糟」这类日子的抽卡会变成捡漏，反而削弱结局分布的方差（现在 2000 局仿真分布是稳的，不动）。
`S._whoCnt[wid]++` 在 `pick()` 返回前累加（**B 档卡不累加**，它们不占这个配额）；`C_ONCE` 命中的卡同时 `S._onceCnt[wid] = 1`。`reset()` 里清空 `_whoCnt`。同样**只在 `strict` 层生效**（理由见下）。

> ⚠️ **必须在 `strict` 层才生效**。`bagPick` 的兜底层（`strict=false`）不查这条，否则某个角色卡占多数时会把袋子过滤成空 → 重洗 → 仍然空 → 死循环（现有 `pick()` 的兜底链假设「兜底层永远能出」）。

链卡那边另有两条（加在 `bagFindChain` 里，**不能加间隔冷却**）：

```js
// bagFindChain(avoidTag) 内，紧跟 recentTag 那行之后：
if(c.wid && c.tier !== "B"){                          // ← B 档（票）不吃 A 档的链卡配额
  if((S._whoChain[c.wid] | 0) >= 2) continue;        // 每角色每局最多 2 张支线
  if(S._chainDay[c.wid] && S.day <= S._chainDay[c.wid]) continue;   // 前置卡 +1 天，不能同日回响
}
```
> **为什么这里要加 `c.tier !== "B"`**：票的段 3 卡因为 `when` 里有 `did:` 也会被判成链卡。
> 若不加这一句，它会被 A 档「每角色 ≤2 张支线」和「前置卡 +1 天」两条规则连带管住——
> 现在不出事（一局最多 1 张段 3），但哪天段 3 拆成两张就会莫名少一张。**A 档的规矩只该管 A 档。**
`pick()` 里链卡出牌时：`S._whoChain[wid] = (S._whoChain[wid]|0)+1; S._chainDay[wid] = S.day;`。
`reset()` 里把 `_whoCnt / _whoChain / _chainDay / _onceCnt / _pStage / _pAdv / _pLastDay` 一起清空（写进 `reset()` 现有那一长串状态初始化里，别另开一处）。

### 4.2 B 档频次（你的票 `nidepiao`：3 段 / 6 张已进池）

> **2026-11-11 已落库**（`data/cards.json` 共 171 张，其中 `tier:"B"` 6 张，`nidepiao` 合计 10 张）：
> `piao_voice_01` 📈 段1 · `piao_voice_02` 📉 段1 · `piao_voice_03` 📈 段2 · `piao_voice_04` 📉 段2 · `piao_silent_01` 🔴 段3（`has:halt`）· `piao_silent_02` 🔴 段3（`has:crisis`）。
> 本节判据是照这 6 张的**实际形态**写的（同段两张是「涨/跌」互斥变体，不是 `did:` 往返——见下）。

**这条线不占 A 档的 5 次配额**——它是同一件东西在变，不是"又来了一次家里人"。它用另一套闸门：

| 约束 | 值 | 为什么 |
|---|---|---|
| 一局最多**升段** | **2 次**（第 1 段登场不算升段）→ 本局最多走到第 3 段 | 3 段每段 1 张 = 一局见到 3 张；配合 8 张间隔要第 7 / 16 / 25 天左右才走得完。60 天的局走得到底，30 天的局自然停在段 1–2——**不需要额外判据，间隔本身就把短局截断了** |
| 段之间最小间隔 | **8 张卡** | 比 A 档的 6 张更宽：它得先真的涨过、又真的跌下去，"段"才成立 |
| 第 1 段最早时点 | **第 4 天**（卡上现在写 `day>6`，取更严的那个） | 你得先买过、拿过几天，「它开口」才有对象（比家人晚一天） |
| 只允许出「下一段」 | `stage === S._pStage + 1` | 这一条顺手锁死了台词：没到段 2，「你还差多少」这句根本抽不到 |
| **同段两张是「互斥变体」不是「往返」** | `piao_voice_01/02` 的 `when` 相同、只有 📈/📉 不同 → 抽到哪张看本局行情；**同一局只可能见到其中一张**（第二张因 `stage` 已推进而永久失效） | 这样每段只需 1 张卡的工作量，就能同时覆盖牛市和熊市的语气；**不需要 `did:`** |
| 段 3 的行情准入 | 交给卡的 `when` 自己判：行情（`has:halt` / `has:crisis`）**+ 段 2 四张卡的 `did:` 长 OR** | 行情那条保证「只在真的死了的时候沉默」；`did:` 长 OR 保证「它必须先开过口，才可能突然不说话」——否则玩家会遇到「一个从没说过话的东西莫名其妙沉默了」。闸门不重复判，避免两处口径打架 |
| `_pStage` 的作用域 | **局内**，`reset()` 清空 | 每一世你都要重新把它说服一次。跨局进度不做（留给 `next-phase.md`） |

```js
/* B 档闸门。⚠️ 这 6 张卡**两种抽屉都会走**（别只看一个）：
     · 段 1/2（piao_voice_01..04）when 里没有 did: → isChain=false → 普通抽卡 bagFind
     · 段 3（piao_silent_01/02）when 里绑了段 2 四张卡的 did: 长 OR → isChain=true → 链卡抽屉 bagFindChain
   所以闸门必须挂在**两处**的候选循环第一行。少挂一处 = 那一段的卡完全不设防。
   （piaoOK 对非 B 档直接返回 true，放在两处都是零成本。） */
function piaoOK(c){
  if(c.tier !== "B") return true;
  var st = c.stage | 0;
  if(!st) return false;                                      // tier:"B" 却没 stage → 数据错，直接不出
  if(st !== (S._pStage | 0) + 1) return false;                // 只出下一段（台词不可能超前）
  if((S._pAdv | 0) >= 2) return false;                        // 本局最多升段 2 次
  if(st === 1 && S.day < 4) return false;                     // 第 1 段最早第 4 天
  if(S._pLastDay && S.day - S._pLastDay < 8) return false;     // 段间至少 8 张卡
  return true;
}
// bagFind(…) 与 bagFindChain(…) 的候选循环里，第一条：
if(!piaoOK(c)) continue;
// pick() 出牌后（仅 B 档）：
if(c.tier === "B"){
  var st = c.stage | 0;
  if(st > (S._pStage | 0)){
    if((S._pStage | 0) > 0) S._pAdv = (S._pAdv | 0) + 1;      // 0→1 是"登场"，不计入升段 2 次
    S._pStage = st;
  }
  S._pLastDay = S.day;
}
```

> **链卡抽屉有隔天限制，段 3 会比理论更晚出现——这是预期行为，别当 bug 调。**
> `bagFindChain` 里有一条 `_lastWasChain`：昨天插过队，今天必须出普通卡。所以段 3 命中的实际天数
> 会比「段 2 + 8 张」更靠后一点。**不要为了让段 3 准时出现去解这条限制**——那条限制保护的是整局的节奏感。

**数据侧要求**：`tier:"B"` + `stage` 成对出现；段 1/2 各 2 张（涨/跌变体）、段 3 共 2 张（停牌 / 危机）。
`did:` 的用法是**不对称**的，这是故意的：
- **段 1 / 段 2 不绑前置**——段 2 的台词（「你还差多少？」）单独成立，绑了反而会让段 2 永远出不来。
- **段 3 必须绑段 2**（`did:piao_voice_03.l|.r|did:piao_voice_04.l|.r` 长 OR）——防「它没开过口就突然沉默」。顺序仍由 `stage` 闸门兜底，`did:` 只是第二道。
- 副作用要记住：**这一绑就把段 3 推进链卡抽屉**（见上方代码注释），所以两处闸门都不能少。
现有 4 张动作卡（`dec_takeprofit_01` `dec_stoploss_01` `dec_limitup_01` `mkt_paperwin_01`）**没有 `tier` / `stage`**——它们还是普通决策卡，别给它们加。

> 前端只需要实现一个字段判据：**`stage` 单调递增，且一次只 +1**。
> 有了它，「票的台词必须按段推进」这件事不需要人工审核——抽卡层物理上就抽不到超前的卡。
> 附带一条内容级校验（可执行）：`stage === 3` 的卡 `text` 里**不许出现「我」字**——它已经沉默了。
> 现有 `piao_silent_01`（「它不说话了。停牌公告还是没有来。」）与 `piao_silent_02`（「它不说话了。你也没再问。」）都过。

### 4.3 「这是同一个人」怎么让玩家知道

卡面**没有「谁在说话」这一行**（已删，`prototype.html` L2245 注释写明是拍板项，不能加回来）。所以识别只能靠三件套，**三件套必须一一对应、全局唯一、不许临时改**：

| 载体 | 规则 | 现状（2026-11-11 已收口） |
|---|---|---|
| ① 图区人物 | 同一 `whoId` 永远同一张立绘；情绪只能走 `emo` 差分（同尺寸整图换脸，`AGENTS.md` 已定），**不许换角度/换装/换构图** | v3 素材按 13 个角色固定构图，已满足 |
| ①-b **你的票的图区** | **不画立绘**。它不是"没有人"，是**空镜头**：桌面、屏幕、一杯凉了的水、椅背上搭着的外套。走 `art-asset-spec` v3「无人场景 + 物件焦点位」那条渲染路径（现有 56 张同款），**零新素材** | ✅ 已拍板（team-lead 改判） |
| ② 占位 emoji（`c.av` / `avatar`） | **不承担「这是谁」的识别职责**——它是「这一屏的处境符号」，允许随处境变（`🏠` 首付、`📵` 冷战、`🎁` 礼盒都对）。但**同一角色的人脸类 emoji ≤1**，且**两个角色不许共用同一个脸** | ✅ 8 处全改完，实测：`haizi` 🧒🎓 · `laoma` 👵📞📵 · `zhangmuniang` 🧓 · `laoban` 😰📋 · `nidepiao` 📈📉🔴 · `laotongxue` 🍺 · `weixinqun` 💬 · `tongshi_xiaowang` 👔 · `taxi` 🚕 |
| ③ 文案里的称呼 | 称呼固定且唯一：`laopo` 永远叫「老婆」（**不写「妻子」「媳妇」**），`laoma` 永远叫「老妈」，`tongshi_xiaowang` 永远叫「小王」，`nidepiao` 永远叫「你的票」（**不写「股票精灵」**）。`AGENTS.md` 已禁裸代词，这条是它的延伸 | 现状合规（女友阶段叫「女友」——**关系阶段是允许的例外**，见下） |

**两条例外（不是 bug，别去「统一」掉）**：
- **关系阶段可以换称呼**：`laopo` 在 `did:fam_hunli_01` 之前叫「女友」、之后叫「老婆」。这是一次性、不可逆、由事件驱动的转变，读起来是「她变成了我老婆」，不是「换了一个人」。
- **处境可以换 av**：`🏠`（首付）/ `🎁`（见家长）/ `📵`（冷战）都是处境，不是脸。

**三条硬规则（写进 `validate-cards.js`，违反即退出码非 0）**：
```js
// ① 同一 wid 的人脸类 emoji ≤ 1
// ② 同一个「人脸类」emoji 不许被两个 wid 共用（已修：👵 曾同时属于 laoma 和 zhangmuniang）
// ③ 同一 wid 的 av 不许「人脸 + 物件」混基调（要么是一张脸，要么全是处境符号）
// ④ 你的票专用：wid === "nidepiao" 时 av 必须 ∈ {📈, 📉, 🔴} —— 它不是人，不许有脸、不许添第四个符号
// 人脸类白名单：👧👶🧒👦👩👨👵👴🧓🧑‍🦳👨‍💼🤒😰😅😭🙂🤩😴😍😱🙋🤳👀👥🫵
```
**完整清单与执行结果见 §8.1.1**（已全部落地，`validate` + `sync` + `smoke` 38 项全绿）。

**口头禅（A 档两人各一句，是「同一个人」的最强信号；票没有，它靠第一人称立住）**：

| 角色 | 口头禅 | 出现规则 |
|---|---|---|
| 老婆 `laopo` | 「这个月够吗？」 | 每局 **≤2 次**，两次间隔 **≥15 天**，且两次的处境必须不同（第二次必须带 `when`：`has:baby` / `debt>0` / `did:fam_divorce_01.l` 之类） |
| 你的票 `nidepiao` | （**未使用**）「我还能再涨一点。」 | 已落库的 6 张里没有这句——它靠「第一人称」立住语气，不靠复读。若将来要用：≤2 次/局、间隔 ≥15 天、只落在 stage 1–2 |
| 老妈 `laoma` | 「别熬夜。」 | 同上 |

> 口头禅必须在**正文首句**，不许出现在选项里（选项是玩家的动作，不是角色的台词）。

### 4.4 台词重复：哪些允许、哪些不许

判断标准一句话：**重复的是「处境」，就是设计意图；重复的是「信息」，就是穿帮。**

| 类型 | 判定 | 判据 |
|---|---|---|
| 系统/环境类台词（「还是没有复牌的消息。」「账单日到了。你数了数，还差四千。」） | ✅ 允许重复 | 同处境的重复 = 时间在走，读者不会觉得说了两遍 |
| 口头禅（§4.3 表外的三名角色各一句，见 `characters.md`） | ✅ 允许，限额 2 次/局 | 必须处境不同 |
| 跨局重复（不同一局里同一句） | ✅ 允许 | 玩家会读成「重逢」，不是 bug |
| 同一局内**同一张卡出现两次** | ❌ 不可能（洗牌袋已保证） | `game-design.md`：一局内单卡最多 1 次 |
| 同一局内**两张不同卡的正文几乎相同** | ❌ 不许 | 判据：同 `wid` 的两张卡，正文 bigram Jaccard 相似度 **> 0.6** 视为重复，校验器拦 |
| **情绪变化点之后复用旧台词** | ❌ 不许 | 判据：出现 `did:` 值的卡之后，该角色不许再出**无 `when` 条件**的卡（已经离婚了还在问「今晚吃什么」就是穿帮）。链卡必须消费前置选择（`AGENTS.md` 已有铁律，这条是它的执法口径） |
| **B 档段位台词超前** | ❌ 不许 | 判据：`stage` 只出 `S._pStage + 1`（§4.2）。这条由抽卡层物理保证，不需要人工核 |
| **金额类台词跨卡重复** | ❌ 不许 | 同一数字（如 `6,500`）在同一局两张卡里出现 → 玩家会以为系统算错。校验器扫 `\d{3,}` 交叉比对 |

给 `tools/validate-cards.js` 增补三条检查（可执行，不是口号）：

```js
// ① 同 wid 文案撞车：bigram Jaccard > 0.6 报错
// ② 同 wid 人脸类 av > 1、或两个人脸类 av 跨 wid 共用：报错（清单见 §8.1）
// ③ 金额复用：同一 wid 的两张卡里出现相同 4 位以上数字 —— 警告级（人工核）
// ④ B 档卡：tier/stage 必须成对出现，stage 取值 ⊂ {1,2,3}；
//    且 stage===3 的卡 text 里不许出现「我」字（它已经沉默了）
```

### 4.5 B 档支线要不要影响分享卡（结论：**不上图**，只进 App 内）

**改判记录（2026-11-11，visual-architect 提出，我采纳）**：原方案让页脚 slogan 按支线进度换组，**撤回**。

理由（按重要性排）：
1. **图要成套**。同一款游戏的两张分享卡长得一样，才像"一套"；页脚换句会让它们看起来不像同一个产品——而这张图的唯一任务就是「看起来像样」。
2. **和 `No.xx` 的编号连续感打架**。水印那行已经在承载「这是同一套作品」的信号，页脚再变，两处都在抖。
3. **收益太薄、成本不薄**。`warm` 组要写满 4 句才有意义，可玩家几乎不会去比对两张卡的页脚——这条性价比不成立。

**页脚现在固定为一行**（spec §3.4）：`结局 No.06 · 由《韭菜之王》生成 · 可在设置里关闭`，**无日期、无变量**。

**支线进度改放 App 内**（零成本、零一致性风险）：

| 位置 | 呈现 |
|---|---|
| 结局页 `.why` 下方（`S._pStage >= 2` 时才多这一行） | 从 `warm` 组抽一句，20px 装饰层级，**不进图** |
| 图鉴格子详情（未来二级页） | 同上 |

句池本身照旧，只是换了渲染位置：

```js
/* 抽样必须是**确定性**的：AGENTS 铁律——展示层一个 Math.random 都不许调，
   否则会挪动全局随机序列，所有仿真基线失去可比性。用 hash 从数据里定。
   抽样键里必须带 stage：同一局刷两次页面要得到同一句，不能"两次字不一样"。 */
function sloganFor(d){                       // d = { name, grp, stage, social }
  var pool = "neutral";
  if(d.grp === "lose" && d.social <= 20) pool = "cold";
  else if((d.stage | 0) >= 2) pool = "warm";   // 段 2 以后才算"它变过"
  var arr = SLOGAN[pool];
  return arr[stableHash(d.name + "|" + d.stage + "|" + d.social) % arr.length];
}
```
1. **`warm` 组必须先写满 4 句才接**——1 句的句池等于没句池，两次刷到同一句更假。
2. `d.social` 只有**本局结局页**拿得到；图鉴详情来源（`META.unlocked`）没有它 → 只走 `neutral` / `warm`，不判 `cold`。
3. 句池里**不许出现具体人名或角色名**（「小王」「你的票」）：这是玩家的战报，不是角色档案（同 §3.3 不放昵称的逻辑）。
4. **不许把它写成宠物**（「它会不会难过」这类一律否）——会瞬间把「它不说话了」这件事说轻。

> 一句话记住分工：**图负责「像样」，App 内负责「有点东西」**。别让一张要发朋友圈的图去承担叙事深度。

### 4.6 图鉴要不要「人物」分区

**结论：v1 不做。**

| 给了会怎样 | 不给会怎样 |
|---|---|
| 玩家会期待「终于见到某个常驻角色」→ 有了人物收集的暗示 | 少一条收集线，但图鉴的语义保持纯净 |
| 但立刻暴露贫瘠：某个角色只有 2 张卡，格子里是「某个角色 2/8」——**把「我们内容不够」写在脸上**，反而削弱熟人感 | 常驻感靠「他反复出现」建立，不靠清单公示 |
| 面板内滚动翻倍：现有 32 格已经 2 屏（活法 14 + 死法 18），再加 ~20 格 → 弹层里翻 3 屏，`p-card` 不是页面、没有吸顶标题，长列表体验差 | — |

**「不做」的三个具体理由**：① 人物没有「解锁」这个动作，他们从第一局就在，混进图鉴会稀释「收集」语义；② 弹层不适合长列表；③ 内容量还不够撑起第三组。

**若未来要做**（触发条件写死，避免拍脑袋）：
- 触发：**B 档支线跑通之后**，且**常驻角色 ≥ 12 个、每个角色 ≥ 6 张卡**（即 `docs/design/characters.md` 的 N2 交付完成）。
- 形态：**独立二级页**（`pages/chars/`），不是图鉴里的第三组——因为它是长列表、需要吸顶分组标题、需要按角色筛选。
- 不做「出场次数/解锁状态」，只做「这个人的活法」：每角色一页，列他出现过的卡里最扎人的三句台词。清单化会让人物变成集邮。

---

## 5. 数据与埋点（原型阶段用 localStorage）

### 5.1 要回答的问题与对应指标

| 问题 | 指标 | 算法 | 判定线 |
|---|---|---|---|
| 分享功能有人在用吗 | **生成渗透率** | `gen / 结局总数`（分母用**新增**的 `META.runs`，在 `enterRun()` 里 `+1`；现有 `META` 里没有「总开局数」，别拿 `tasks.run` 顶——它每天清零） | <15% = 入口太弱；>55% = 有点打扰 |
| 存图到底成不成 | **保存成功率**（仅小程序） | `saveOk / saveShown` | <85% = 有平台坑没填；<60% = 立刻停下修 |
| 哪套模板被存得最多 | **模板胜出率** | `max(byTpl) / sum(byTpl)` | ≥60% 才允许砍掉另一套（否则说明两套各有其用） |
| 玩家更愿意晒哪种结局 | `byEnd[win] / byEnd[lose]` | 活法 vs 死法的生成比 | 死法显著更高是**正常且好**的（晒惨是刚需） |
| 分享带来回流了吗 | **扫码回流数** | `META.arriveFromCard.n` | 需要服务端才准；原型只做趋势 |
| 授权卡在哪一步 | `saveFailMsg` 分布 | top-N `errMsg` | `auth deny` 占比 >30% = 引导文案要改 |

### 5.2 localStorage 结构

**两个 key，职责分离**（埋点写失败绝不能毒化存档）：

| key | 内容 | 归属 |
|---|---|---|
| `leek_meta_v1` | 存档：图鉴 / 战绩 / 次数 / 任务 / **分享节流状态** `META.share` | 已有，扩展 |
| `leek_share_v1` | 埋点：计数与最近记录，可整块丢弃 | 新增 |

```js
/* leek_share_v1 —— v1 */
{
  v: 1,
  gen: 0,             // 生成成功
  genFail: 0,         // 生成失败（含 canvas/素材/导出）
  saveShown: 0,       // 走到「保存」这一步（含长按面板）
  saveOk: 0,          // 明确成功（只有小程序能拿到）
  saveFail: 0,
  saveFailMsg: {},    // errMsg 前 40 字 → 次数（只保留 top 8，超出按次数淘汰最小的）
  holdShown: 0,       // 长按保存面板展示次数
  copyOnly: 0,        // 只拿到文字版（兜底触发）
  byTpl: {},          // 'T1'..'T5' → 保存成功次数（**统计以它为准**，但只有小程序能算）
  byTplGen: {},       // 'T1'..'T5' → 生成次数（两端都有，用来看版式分布）
  byEnd: {},          // 结局名 → 生成次数
  src: { over:0, album:0, best:0, friend:0 },
  day: {},            // '2026-11-10' → { gen, ok }，只保留最近 7 天
  last: []            // 最近 20 条：{ t, src, end, d, tpl, path, ok }
}
```

```js
/* META.share（挂在 leek_meta_v1 里，节流用） */
{ lastDay:"2026-11-10", hits: 2, authIntroShown: false, cardSeq: 3 }
```

体积估算：`last` 20 条 × ~60B + 三个 map ≈ **1.5KB**，对 5MB 配额无压力。

### 5.3 读写伪代码

```js
var SHARE_KEY = "leek_share_v1", SH = null;

function shareLoad(){
  try{ SH = JSON.parse(localStorage.getItem(SHARE_KEY) || "null"); }catch(_e){ SH = null; }
  if(!SH || SH.v !== 1) SH = {
    v:1, gen:0, genFail:0, saveShown:0, saveOk:0, saveFail:0,
    saveFailMsg:{}, holdShown:0, copyOnly:0,
    byTpl:{}, byTplGen:{}, byEnd:{}, src:{over:0,album:0,best:0,friend:0}, day:{}, last:[]
  };
  return SH;
}

function shareSave(){                       // 写失败静默：埋点比存档廉价，绝不能抛
  try{ localStorage.setItem(SHARE_KEY, JSON.stringify(SH)); }catch(_e){}
}

/* 唯一的写入口。event 名固定下面这几支，不许临场造词——否则看板拼不起来。 */
function track(event, meta){
  meta = meta || {};
  if(!SH) shareLoad();
  var today = todayKey();
  if(!SH.day[today]) SH.day[today] = { gen:0, ok:0 };

  switch(event){
    case "share_gen_ok":
      SH.gen++; SH.day[today].gen++;
      SH.src[meta.src] = (SH.src[meta.src] | 0) + 1;
      if(meta.tpl) SH.byTplGen[meta.tpl] = (SH.byTplGen[meta.tpl] | 0) + 1;
      if(meta.end) SH.byEnd[meta.end] = (SH.byEnd[meta.end] | 0) + 1;
      push({ t:Date.now(), src:meta.src, end:meta.end, d:meta.d, tpl:meta.tpl, path:meta.path, ok:1 });
      break;
    case "share_gen_fail":
      SH.genFail++; keepMsg(meta.reason); break;
    case "share_save_shown":
      SH.saveShown++;
      if(meta.path === "hold") SH.holdShown++;
      break;
    case "share_save_ok":
      SH.saveOk++; SH.day[today].ok++;
      if(meta.tpl) SH.byTpl[meta.tpl] = (SH.byTpl[meta.tpl] | 0) + 1;
      markLast(1); break;
    case "share_save_fail":
      SH.saveFail++; keepMsg(meta.msg); markLast(0); break;
    case "share_copy_only":
      SH.copyOnly++; break;
  }
  prune(); shareSave();
}

function keepMsg(m){
  if(!m) return;
  var k = String(m).slice(0, 40);
  SH.saveFailMsg[k] = (SH.saveFailMsg[k] | 0) + 1;
  var keys = Object.keys(SH.saveFailMsg);
  if(keys.length > 8){                       // 只留 top 8
    keys.sort(function(a,b){ return SH.saveFailMsg[b] - SH.saveFailMsg[a]; });
    for(var i = 8; i < keys.length; i++) delete SH.saveFailMsg[keys[i]];
  }
}

/* 最近 20 条明细：只用于人肉排查（哪一局、哪套模板、哪条路径失败了） */
function push(rec){ SH.last.unshift(rec); }

/* 把「生成」与「保存」串起来：gen 时先占一条 ok:0，save 成功再翻成 1。
   这样「生成了但没存」也能被看见，不会只剩成功样本。 */
function markLast(ok){
  if(SH.last.length && SH.last[0].ok === 0) SH.last[0].ok = ok;
}

function prune(){
  var days = Object.keys(SH.day).sort();
  while(days.length > 7) delete SH.day[days.shift()];   // 只留最近 7 天
  if(SH.last.length > 20) SH.last.length = 20;
}
```

### 5.4 一个必须写清楚的消极事实

**H5 无法测「保存成功」。** iOS/微信内的长按保存不给任何回调，`a[download]` 也无法确认写盘。
所以：
- H5 侧只能记 `saveShown` / `holdShown`。
- 「保存成功率」这个指标**只在小程序侧有意义**，看板上必须标 `(mp only)`。
- 想横向比两端，只能比**生成渗透率**（`gen / 结局数`）——这是两端同口径的唯一指标。
- 不要用「H5 记了 saveShown 就算成功」去凑一个好看的数，那会让「小程序到底有没有坏」永远查不出来。

---

## 6. 验收清单

### 6.1 生成与版式

> 版式验收的逐条细则在 `share-card-spec.md` §9（五套模板 × 32 结局映射、28px 下限、对比度、印章包围盒、齿距…）。
> 这里只补**跨端一致性**的条目。

- [ ] 32 个结局的 `END_TPL` 映射与 spec §0 逐一对齐（9+8+5+3+7 = 32），**未映射的结局回落 T2**，不空白
- [ ] 同一份数据在 H5 与小程序导出的图**逐像素可对比**（同模板、同内容；允许 ±2 的字体渲染差异）
- [ ] 导出格式：T1–T4 = PNG、T5 = JPG q88；两端一致
- [ ] 1080×1440 导出图在相册里放大到 200% 无锯齿、无文字重影
- [ ] 有码（A）/生成中（B）/不可用（C）三版导出图**叠在一起比**：除 168×168 矩形内像素外零位移
- [ ] **卡上没有四属性**（心态/社会/风险），一屏数字 ≤3 个
- [ ] `mdd` 缺失（图鉴分享来源）时 T3 退化成两列，**没有空行、没有 0、没有 `—` 占位**，其余元素位置正确
- [ ] 页脚是固定一行 `结局 No.xx · 由《韭菜之王》生成 · 可在设置里关闭`，**同结局的两张卡页脚一模一样**
- [ ] 结局引言超长时按 spec §5 折行规则处理，**不缩字凑、不截断、不溢出卡边**
- [ ] 净值用 `▲ +¥1,240` / `▼ −¥1,200` 带符号；`0` 用 `—`（色弱三重编码）
- [ ] 卡图**不用红绿**表达输赢，且纸上文字不含 `#e23c30` / `#1e9e5a` / `#f2b01e`
- [ ] 卡内所有文字距卡边 ≥ 安全值（微信缩略图 8% 圆角裁切不伤字）
- [ ] 缩到 270×360（朋友圈九宫格单格）时，结局名与金额仍可读

### 6.2 H5 三浏览器

| 环境 | 必须验证 |
|---|---|
| Chrome 桌面 | `a[download]` 触发下载、文件名 `jiucai-card.jpg`、toast「已存到下载里」；下载被拦时不报错、转文字版 |
| Safari 桌面 | 同上（`a.download` 支持）；`toBlob` 正常 |
| Safari iOS（真机） | **不出现新标签页**；长按面板出图；长按菜单里有「存储到图像」；关闭后 blob 已 revoke（连续 5 次不涨内存） |
| 微信内置 iOS（真机） | 长按菜单里有「保存图片」；面板文字不被系统工具栏遮住（底部 ≥ `env(safe-area-inset-bottom)+8`） |
| 微信内置 Android（真机） | 同上；确认 `background-image` 没有混进来（长按必须能出菜单） |

### 6.3 小程序真机（iOS + Android 各一台）

- [ ] `wx.canvasToTempFilePath` 导出图**不是空白/黑图**（§7.1 三个坑逐条对齐）
- [ ] `dpr` 上限生效：iPhone Pro Max（pixelRatio=3）上 backing store 是 2160×2880 而不是 3240×4320（低端安卓不 OOM）
- [ ] 结局页打开 1.2s 后后台预生成完成（tier=full），此时点分享槽 **0 等待**直接进相册
- [ ] 首次点存 → 系统授权弹窗 → 允许 → 相册里有图 + toast「已存到相册」
- [ ] 首次点存 → **拒绝** → 弹自定义引导（不是死循环弹系统框）
- [ ] 引导里「去设置」→ `wx.openSetting` 打开成功（不是 `fail: can only be invoked by user TAP gesture`）
- [ ] 设置里打开权限 → 返回小程序 → 直接续上保存成功
- [ ] 相册权限被系统设成「无」（设置 → 微信 → 照片）→ 走长按兜底，提示语是「长按这张图，一样能存」
- [ ] `show-menu-by-longpress` 在基础库 <2.13 时有降级（不能出现一张点不动的死图）
- [ ] 连续生成 5 次：每次都有图、无内存告警、无白屏、第 5 次耗时与第 1 次差 <300ms
- [ ] 扫码（或 `?from=card&e=7`）→ 主菜单出现「你朋友走到了「爆了」」→ **不自动开局**、不消耗次数

### 6.4 权限拒绝路径（专项）

- [ ] 拒绝一次后，**同一局**再点存图不再弹系统框（直接给引导/兜底）
- [ ] 拒绝一次后**下一局**允许再试一次（`authIntroShown` 按局重置）
- [ ] 拒绝时**不弹**任何 toast 骂玩家、不写「分享失败」这类怪罪式文案
- [ ] 拒绝后仍能拿到文字版（复制成功）

### 6.5 弱网

- [ ] 开发者工具 Slow 3G：点存图后 300ms 内出 loading（超过 300ms 才显示，避免闪）
- [ ] 小程序码/可选素材加载超时 **3000ms** → 自动走无码降级，**不卡住整张卡**
- [ ] 素材全失败 → 仍能出图（无人物素材时用占位 emoji，版式不塌）
- [ ] 完全离线（飞行模式）→ 出图成功（卡面数据全在本地内存）或明确降级，**不能白屏**

### 6.6 节流与入口

- [ ] 首次解锁某结局 → 完整态 + 一次脉冲
- [ ] 同一天连死 3 次：第 1 次完整态、第 2/3 次折叠「存图」、第 4 次起无图标
- [ ] 任何状态下分享槽都**可点**（没有任何一处被隐藏）
- [ ] 375×667 上「再来一辈子」**始终在首屏、无需滚动**
- [ ] 320×568 / 系统大字号：分享槽自动折叠，槽宽 56，无图标
- [ ] 图鉴：未解锁格子里**没有**相机图标节点（不是 `visibility:hidden`）
- [ ] 图鉴：320 宽两列格子里 `.alb-rec` 允许省略号，图标不压字
- [ ] 图鉴顶部「我的最佳」在 `META.best.days` 为空时整条不渲染

**B 档闸门（`piaoOK`）专用验收——这两条挂了等于没挂，必须实测：**
- [ ] 跑 60 天局 ×200：**任意一局里票的段号只能单调 1→2→3**，不允许出现「跳过段 2 直接段 3」，也不允许同一段出 2 张
- [ ] **反证测试**：把 `bagFind` 里那行 `if(!piaoOK(c)) continue;` 注释掉 → 应当立刻复现「段 1 连出两张」。复现不了说明闸门其实挂在别处；这一步用来证明**两处都真的挂上了**（段 1/2 走 `bagFind`、段 3 走 `bagFindChain`）
- [ ] 段 3 的实际命中天数**允许晚于**「段 2 + 8 张」（`_lastWasChain` 隔天限制），**不算 bug**

### 6.7 无障碍

- [ ] 分享槽是 `<button>`（不是 `div`），有 `aria-label="把这一局的战绩存成一张图"`
- [ ] 键盘：Tab 可达、focus 环 2px 可见、回车/空格触发
- [ ] 长按面板：`role="dialog" aria-modal="true"`，打开时焦点落到首个按钮，Esc 关闭，背景 `aria-hidden`
- [ ] 面板关闭后焦点**回到分享槽**
- [ ] `<img alt>` 含完整信息（结局 + 天数 + 净值 + 「长按可存到相册」）
- [ ] 系统字号调到最大：分享槽不换行、不裁字
- [ ] 色弱模拟（红/绿通道分别压掉）：净值仍可读（符号 + ▲▼）
- [ ] 「复制文字」在无图可用时是**主**动作，不是小字

### 6.8 埋点自检

- [ ] 连跑 5 次生成，`leek_share_v1` 的 `gen`/`saveShown`/`saveOk` 对得上（小程序）
- [ ] H5 侧 `saveOk` 恒为 0（没被误记）
- [ ] `last` 长度 ≤20、`day` ≤7 天（prune 生效）
- [ ] `localStorage` 写失败（隐私模式）时功能照常，不抛错

---

## 7. 高风险交互与降级方案

### 7.1 最大的坑：小程序端「导出一张空白图」

一条现象，三个原因，任何一个都会让玩家看到黑图/白图，而且**它不报错**（`canvasToTempFilePath` 会 success 给你一张空图）。三条必须同时满足：

| # | 坑 | 正确做法 |
|---|---|---|
| 1 | 生成用的 `<canvas>` 被 `display:none` / `wx:if="{{false}}"` / `hidden` 收起来 → 节点尺寸为 0 → 画什么都是空气 | `position:fixed; left:-9999px; top:0; width:1080px; height:1440px;`（可布局、不可见）。CSS 尺寸取 1080×1440 不是随便写的：它让「1 绘图单位 = 1 CSS px」，`canvasToTempFilePath` 的 width/height 才不会跟 `ctx.scale(dpr,dpr)` 打架 |
| 2 | canvas 绘制的是 **CDN/网络图** → `canvas.createImage()` 加载 fail（不在 `downloadFile` 白名单）或被判污染 → 图不出现 | 网络图先 `wx.downloadFile` 拿 `tempFilePath`，再 `createImage`；或素材随包/分包下发。**T5 的插画位最容易踩这条**（spec §8.2 也点了） |
| 3 | 拿到节点后**立刻**画 → 布局还没完成，`canvas.width=2160` 生效了但绘制上下文按 0×0 算 | `wx.nextTick()` 之后再画；实测不稳的机型再加 `setTimeout(…, 30)` |

验收一句话：**导出的图里有字、有卡边、有右下角钩子**——三条缺任何一条就查上面三条。

### 7.2 其余高风险点

| 风险 | 触发条件 | 降级方案 |
|---|---|---|
| 低端安卓 OOM 闪退 | canvas backing store 按 dpr=3 开（3240×4320 ≈ 56MB） | `dpr = Math.min(2, pixelRatio)`；且**全页只允许一张** 1080 基准画布，不重建节点 |
| 预生成抢主线程，结局动画掉帧 | 结局页入场动画 + 震屏 + canvas 同帧 | 延迟 **1200ms** 起跑；`tier≠full` 不预生成；绘制分两帧（先底，再文字） |
| 生成时玩家已点「再来一辈子」，`S` 被 `reset()` | 生成耗时 >0.8s | 入参深拷贝快照（§2.1），生成器只读快照 |
| 主 CTA 被挤出首屏 | 又加了一行按钮 | 分享槽塞进次按钮同行（§1.1），**永久禁止**在 `.endcard` 里新增行 |
| H5 长按菜单没有「存储图像」 | 用了 `background-image` / 继承了卡面 `pointer-events:none` | 选择器写死 `.hold-sheet img`（§2.2.3 第 2 条） |
| iOS 关面板时白屏闪 | 先 revoke 再断 `src` | 先 `removeAttribute("src")` 再 revoke |
| 授权死循环（反复弹系统框） | 拒绝后仍调 `saveImageToPhotosAlbum` | `denied` 直接走引导，不调 API；每局只劝一次 |
| `wx.openSetting` 在异步回调里被调 → fail | 把「去设置」写成自动弹 | 必须由用户 tap 直接触发 |
| 微信缩略图把图上文字裁掉 | 文字贴边 | 文字距卡边 ≥ 安全值（§6.1） |
| 分享入口变「第三个主按钮」 | 视觉上给实心底色 | 分享槽永远文字链（§1.1） |
| 玩家以为「点了就发朋友圈」 | 文案写「分享」 | 按钮文案一律写「存一张」/「存图」，**不写「分享」**——诚实 |
| 埋点写失败拖垮存档 | 用一个 key | 两个 key 分离（§5.2） |

---

## 8. 待对齐 / 未决

### 8.1 前端下一轮的收口情况（emoji 已修完，只剩 `META.runs`）

#### 8.1.1 `av` emoji 修复清单（`data/cards.json` 165 张全集扫描，2026-11-11）

> ✅ **已全部执行完毕**（team-lead 改卡 + `validate` + `sync` + `smoke` 38 项全绿）。
> 下表保留为**决策记录**——以后再往里加卡/加脸，照这张表的口径判。改后实测分布：
>
> ```
> haizi 8 🧒🎓   laoma 9 👵📞📵   zhangmuniang 3 🧓   laoban 8 😰📋
> nidepiao 4 📈📉🔴   laotongxue 2 🍺   weixinqun 2 💬   tongshi_xiaowang 3 👔   taxi 2 🚕
> ```
> 顺带修的一处同类问题：`mkt_bull_taxi_01` 的 `whoId` 错挂 `suoyouren`（正文是出租车司机却记在「所有人」名下）→ 已归位 `taxi`。

扫描口径：按 `whoId` 聚合 `avatar`，找「多 emoji」的 24 个角色；再按「人脸类 vs 物件类」定基调。
**三条规则**：① 同一 `whoId` 的人脸类 emoji ≤1；② 两个 `whoId` 不许共用一个脸；③ 同一 `whoId` 不许人脸与物件混基调。
**第四条（你的票专用）**：`nidepiao` 的 `avatar` 只能是 `📈` / `📉` / `🔴`——它不是人。

**必修 8 处（✅ 已全部执行完毕）**：

| # | whoId | 现在的 emoji 集合 | 锁成 | 理由 |
|---|---|---|---|---|
| 1 | `haizi` 孩子 | 👧×1 `fam_child_01` · 🤒×1 `fam_fever_01` · 👶×1 `fam_babysfirst_01` · 🧒×4 · 🎓×1 | **🧒** | 四个都是人脸且年龄不同 → 占位态下一局里同一个孩子变成四个人。发烧/婴儿交给正文与 `emo`；🎓 是物件可留，但统一到 🧒 更省事 |
| 2 | `laoma` 老妈 | 👵×3 · 📞×4 · **🧑‍🦳×1** `fam_hospital_02` · 📵×1 | **👵** | 她需要一张固定的脸。`fam_hospital_02` 的 🧑‍🦳 是第二张脸（白发人），会让「爸住院」那张看起来换了个人 |
| 3 | `zhangmuniang` 丈母娘 | **👵×2** `fam_inlaws_02` `fam_inlaws_03` · 🧓×1 | **🧓** | 她与 `laoma` **共用 👵** —— 玩家会以为是同一个老太太。丈母娘的定位是「审视者」，🧓 更冷 |
| 4 | `laoban` 老板 | 😰×2 · **😅×1** `work_layoff_02` · 📋×5 | **😰** + 保留 📋 | 两张脸（😰 焦虑 / 😅 假笑）属于同一人不同场合，但按规则只留一张。⚠️ 注意 📋 是 5 张的多数——**它是物件，不冲突，别误删** |
| 5 | `nidepiao` 你的票 | 📈 `dec_takeprofit_01` · 📉 `dec_stoploss_01` · 🔴 `dec_limitup_01` · **🤩×1** `mkt_paperwin_01` | **📈 📉 🔴**（三个行情符号全留） | 🤩 是**表情**——等于给票画了一张脸。`characters.md` §4.2 已定它**没有脸**（在场是空镜）。✅ 已改，现在零人脸 |
| 6 | `laotongxue` 老同学 | **🤳×1** `soc_scam_01` · 🍺×1 `soc_oldmate_01` | **🍺** | 🤳（自拍的人）是手/脸，会被读成「他本人在自拍」；这两张的处境都是「饭局」，🍺 一致 |
| 7 | `weixinqun` 微信群 | **👥×1** `risk_leak_01` · 💬×1 `mkt_bear_group_01` | **💬** | 👥 是两个人的剪影（人脸类）——群不该有脸，它是气泡 |
| 8 | `tongshi_xiaowang` 同事小王 | **👨‍💼×1** `work_tip_01` · 👔×2 | **👔** | 他不是 B 档了（3 张不扩），但 👨‍💼 是脸、👔 是领带，一个角色两种基调仍要锁；👔 也避开与 `laoban` 的脸争夺 |

**合规 16 处**（记录在案，不用改；只定基调，防止以后有人往里面加脸）：

| whoId | emoji 集合 | 基调 | 说明 |
|---|---|---|---|
| `laopo` 老婆 | 💍×16 + 16 个单张（💐🎬🥟🎂💭🤝🥀🎁👀🏡📵👰🏠🫂🌙📄） | 物件 / 处境 | **17 种是设计意图，别统一**：每个都是「这一屏的处境」。👀/👰 是人形符号但不是主角的脸，可接受。**禁止**以后加 👩/😊 |
| `ziji` 自己 | 🙋×3 + 👓🌡🛵🌅 | 人脸 1 个 | 🙋 就是「你」，唯一人脸，合规 |
| `xinwen` 新闻 | 🌐📺❄️📰📉🔄（6 种） | 媒介 / 状态 | 新闻本来就没有脸 |
| `suoyouren` 所有人 | 🫧🚕🩸 | 意象 | 无脸是对的 |
| `laoshi` 老师 | 🏫🎓 | 物件 | — |
| `fangdong` 房东 | 🏠🔧 | 物件 | 🏠 与 `laopo` 的 `fam_shoufu_01` 重复，但都是「房子」这个处境，可接受 |
| `hr` | 📦🗂 | 物件 | — |
| `xiangmu` 项目 | 🌃📊 | 物件 | — |
| `sihuo` 私活 | 🧰💻 | 物件 | — |
| `pengyou` 朋友 | 💌🤝 | 物件 | — |
| `zhangayi` 张阿姨 | 🏘🧶 | 物件 | C 档不做常驻，维持一次性 |
| `tijian` 体检报告 | 🏥🩺 | 物件 | — |
| `zhoumo` 周末 | 🌿🛋 | 物件 | — |
| `gongsi_gonggao` 公司公告 | ⚠️📉 | 符号 | — |
| `quanshang` 券商短信 | 📲📄 | 物件 | — |
| `nidezhai` 你的债 | 🧮🧾 | 物件 | 建议统一到 **🧾**（账单），但不算必修 |

**执行注意**（`AGENTS.md` 改卡三连）：
只改 `avatar` 字段 → ① `node tools/validate-cards.js` ② `node tools/sync-json-to-prototype.js`。
**不需要**重跑 `simulate.js`——emoji 不进数值，仿真基线不受影响；但 validate 与 sync 一步都不能跳。

#### 8.1.2 `META` 缺「总开局数」

`META` 现有字段：`date / lives / tasks / unlocked / best / share`，**没有「总开局数」**。
而「生成渗透率」（判断分享入口有没有用）的分母必须是它。
- 加一个 `META.runs`，在 `enterRun()` 里 `+1`（和 `META.tasks.run` 分开：后者每天清零，不能当分母）。
- 老存档缺字段时按 0 处理，不写迁移脚本。

### 8.2 其余待办

| 项 | 状态 | 找谁 |
|---|---|---|
| 战绩卡画布 **1080×1440** / 导出 PNG（T5 走 JPG） | ✅ 已对齐 spec §1.1，本文已按它写死 | — |
| 小程序码 **168×168 @ (840,1176)**、静区 24、A/B/C 三态 | ✅ 已对齐 spec §2.4 / §3.2.1 | — |
| 顶部「日期位」的口径 = **第 N 天 · 活法/死法**（不是绝对日期） | ✅ 已对齐 spec §4.1 | — |
| 常驻三档（A 老婆/老妈/**小王**、B **你的票**、C 张阿姨/司机） | ✅ 2026-11-11 team-lead 定稿；小王归 A 档普通高频（≤5 次/局） | — |
| 图鉴不做人物分区 | ✅ 同意 v1 不做，触发条件保留 | — |
| 分享入口位置：并进「回主菜单」同行（spec §10① 建议独立一行） | ⚠️ 我改了形态，理由见 §1.1 | visual-architect 过一眼 |
| **`dpr` 上限取 2**（spec §8.1 写的是 `1080×dpr`，dpr=3 时 ≈56MB 会 OOM） | ✅ 已被 visual-architect 采纳并入 spec §8.1 红线正文 | — |
| **卡上不放四属性终值**（心态/社会/风险），最多 3 个数字 | ✅ 2026-11-11 采纳 visual 意见（§2.1 / §3.3 已改） | — |
| **页脚 slogan 不按支线换组**（图要成套，`No.xx` 编号感不能被抖） | ✅ 采纳，`warm` 句池改放 App 内结局页（§4.5） | — |
| **`av` emoji 修复 8 处** | ✅ **已完成**（team-lead 改完，`validate`+`sync`+`smoke` 38 项全绿），记录见 §8.1.1 | — |
| **`META.runs`（总开局数）** | 🔴 **前端下一轮必修**，见 §8.1.2 | 前端 |
| B 档卡数据字段 `tier:"B"` + `stage`（**你的票**新增 5–6 张：段 1 ×2 / 段 2 ×2 / 段 3 ×1–2） | ✅ 6 张已进池（段 1/2/3 各 2 张）；段表见 `design/characters.md` §4.4 / §4.6 | — |
| 🔴 **`piaoOK()` 必须挂在两处**：`bagFind`（原型 L1999）**和** `bagFindChain`（L2029）的候选循环第一条 | **待前端落**。段 1/2 无 `did:` → 走 `bagFind`；段 3 有 `did:` 长 OR → 走 `bagFindChain`。**只挂一处 = 那一段完全不设防** | 前端 |
| 不做「C 档彼此不同局」组级闸门 | ✅ 2026-11-11 team-lead 裁决，理由见 §4.1 备注 | — |
| `validate-cards.js` 的四条新校验（人脸 av ≤1 / 跨 wid 共用脸 / bigram 撞车 / 金额复用 / B 档 stage 连续） | 待排期 | team-lead |
| `recordRun()` 补存 `trades/mdd/end`（**四属性不用存了**——卡上不画） | 待排期（图鉴分享卡依赖它；缺 `mdd` 时 T3 退化成两列，不阻塞） | team-lead |
| `END_TPL` 映射表（32 个结局 → T1~T5）落在 `END` 表旁 | 待前端落位（spec §0 已给映射，只缺代码位置） | 前端 |
| **`END[name].no`**（1–32 写死，只追加不重排）——**水印与码共用同一个号** | 待前端落位（不做的后果：以后加一个结局，所有已分享的码指向错误结局） | 前端 |
| `SLOGAN` 句池（neutral / warm / cold 三组，各 ≥4 句） | 【不阻塞分享卡】只在 App 内结局页用（§4.5 已改判） | 内容 |
| 小程序码服务端（`wxacode.getUnlimited` + 32 张预生成） | 上线前必须；原型阶段走无码降级（C 态） | team-lead |
