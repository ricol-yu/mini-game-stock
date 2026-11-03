# 动效规范（motion v2.1）

> 状态：已落地进 `prototype.html`。实现 = CSS 动效层（`</style>` 前「动效层 v2.1」段）+ JS `FX` 模块（`var FX = …`）。
> 本文是唯一权威；改手感先改这里再动代码。

## 0. 一句话原则

动效只回答三个问题，别的一概不做：

1. **这一下打到了吗** → 震屏 / 图标摇头
2. **这一下值多少** → Q 弹 / 飘字 / 数字过冲
3. **现在松手算数吗** → 印章「啪」地弹一下

不做的事：入场引导动画循环播放、按钮呼吸、卡片待机浮动、选错时的「惩罚震动」
（这个游戏不评判玩家，震一下说「你错了」就是说教）。

## 1. Token（在 `:root`）

| token | 值 | 用途 |
|---|---|---|
| `--u2-t-tap` | 110ms | 按压类（按钮起手） |
| `--u2-t-pop` | 420ms | 弹跳类（jelly / deal） |
| `--u2-e-back` | `cubic-bezier(.34,1.56,.64,1)` | 过冲 ≈6%，用于「弹回」 |
| `--u2-e-jelly` | `cubic-bezier(.22,1.35,.42,1)` | 中段带挤压，用于「果冻」 |

## 2. 事件表（谁触发什么）

| 事件 | 动效 | 档位 | 代码位置 |
|---|---|---|---|
| 发新卡 | 卡片从下方 20px 弹入（u2Deal） | — | `nextCard()` |
| 拖卡跨过松手阈值 | 该侧印章 Q 弹一次 + 轻触觉（只弹一次，回 0.86 重新武装） | — | `bind()` pointermove |
| 没到阈值松手 | 卡片以 back 曲线弹回原位（过冲 6%） | — | `bind()` end() |
| 四条命变化 ≥2 点 | 变好 → 图标 Q 弹；变坏 → 图标摇头（风险取反：涨=坏） | — | `vitUpdate()` |
| 四条命变化 1 点 | 只飘字，图标不动 | — | `vitUpdate()` |
| 风险第一次越过 68 | 屏轻震 + 图标摇头（只在「跨过去」那一次） | soft | `vitUpdate()` |
| 泡沫破 | 重震 + 行情面板顿 | hard | `fxAfter()` |
| 刚上失信名单（老赖） | 重震（不可逆事件，全游戏第二重） | hard | `fxAfter()` |
| 涨停 / 跌停封板 | 中震 + 面板顿 | mid | `fxAfter()` |
| 单日净值 ≤ −9%（杠杆吃跌停） | 中震 + 面板顿 | mid | `fxAfter()` |
| 现金见底、开始欠债 | 轻震 | soft | `fxAfter()` |
| 单日净值 ≥ +9% | 只顿面板，**不震屏**（正在读卡，别打断） | — | `fxAfter()` |
| 结局（输） | 重震——全游戏唯一允许「重」的时刻 | hard | `check()` |
| 结局（赢：自由/上岸/两个人/熬成精/一次都没动） | 轻震 | soft | `check()` |
| 结局页 / 开局页出现 | 奶油卡浮入 + emoji 慢半拍 Q 弹（纯 CSS） | — | `.over.on` |
| toast 出现 | 从面板下缘落下，落定前 1px 过冲（纯 CSS） | — | `.toast.on` |
| 按钮按压 | 压下 3px，松开 back 曲线弹回（纯 CSS） | — | `.btn:active` |

判定顺序：`fxAfter()` 按上表从重到轻，**命中第一个就 return**——一件事只给一个主载荷。

## 3. 实现铁律（违反 = 小程序掉帧或玩家眩晕）

1. **只动 `transform` / `opacity`**。不碰 width/height/top/left（那会触发重排，WXML/WXSS 同样成立）。
2. **全部有限次数**。无限循环只允许已有的 `.warn`(blink) 和 `.u2-debt-breathe` 两条，且互斥。
3. **一次事件一个主载荷**：震屏与弹跳不同时上；抖动类时长 ≤ 520ms。
4. **震屏必须带 `scale(1.012/1.018)`**：纯平移会在圆角屏边缘闪出底色；放大 1.2% 后位移永远在画面内。
5. **震屏类挂在 `.phone` 上**，同一时刻只允许一个：`FX.shake()` 先摘干净再挂。
6. **印章动画必须带 `rotate(±10deg)`**：印章靠 transform 斜放，通用 jelly 会把角度抹平（所以有单独的 `u2StampL/R`）。
7. **同一元素重播动画必须「摘类 → 强制回流（`void el.offsetWidth`）→ 挂类」**，否则第二次不播。
8. **`pointerdown` 时摘掉 `.fx-deal`**：发牌动画没放完就上手拖，不能让动画和拖拽抢 transform。
9. **`FX` 里不读游戏数值、不改任何状态**，只消费别人算好的快照（`fx0`）。动效永不参与玩法。
10. **禁止在动效里用 `Math.random`**：抖动轨迹用固定关键帧序列，保证可回归、可截图对照。
11. **收走带动画的元素前先掐动画**（`el.style.animation="none"` 再 `display:none`/`remove`）：
    Chrome 会在元素动画中途被隐藏时把 `overflow:hidden` 的页面滚动到它那边
    （320×568 实测 +181px，HUD 直接顶出屏幕）。开局/结局页收起走 `hideOver()`，旧卡收走前同样先掐。

## 4. 开关与降级

| 途径 | 行为 |
|---|---|
| `?fx=0` | 全关：`html.fx-off` 一条规则把所有 animation/transition 压到 1ms。数值、颜色、文字一个不少 |
| `?fx=1` | 轻档：视觉动效保留，触觉（`navigator.vibrate`）关掉 |
| 默认（无参数） | 全开 |
| `prefers-reduced-motion: reduce` | 与 `?fx=0` 等效（CSS 媒体查询自动生效） |

关掉后的可读性红线：**每个状态不依赖动画也必须能读懂**。动效是确认，不是信息载体。

## 5. 验收（改完动效必查）

1. `node tools/smoke-ui.js` 38 项全绿。
2. `node tools/shot-fx.js`——控制台应打出：`intro anim = u2OverPop`、发牌/印章/屏震/图标动画名、
   `fx=0 → {"off":"fx-off clean","cardAnim":"0s"}`。任何一项变成 `none`/缺失 = 挂钩被改坏。
3. 中帧截图（`.shots/fx-frame-*.png`）：震屏帧边缘不露底色、内容不被裁。
4. 真机（迁移后）：触觉三档调用 `wx.vibrateShort({type:'light'|'medium'|'heavy'})`；
   `?fx=0` 对应 app 级「减弱动效」设置项。

## 6. 小程序迁移注意

- CSS 关键帧 WXSS 全支持；`FX` 模块里 `document.querySelector` 换成 `wx.createSelectorQuery()`，
  挂类改 `setData`；触觉换 `wx.vibrateShort`。
- 震屏在 WXML 里挂在页面根节点上，`scale` 防露边这条**必须保留**（安卓圆角屏同样会闪边）。
- 发牌/印章动画如果走 WXS（`AGENTS.md` 铁律：每帧变化走 WXS），把关键帧序列翻译成
  WXS 里的 `transform` 插值即可；一次性动画（deal/jelly/toast）走 CSS class 就够，不经过 WXS。
