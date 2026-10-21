# 项目约定（给 AI 看的）

> 放在仓库根目录，和代码一起 commit。换设备 `git pull` 后它自动就到了新机器上——
> 这是唯一能带走的「项目记忆」。每次换设备开工前，AI 应该先读这个文件。

## 项目是什么

《韭菜之王》—— 股票人生题材的卡牌决策小游戏，微信小程序平台。

| 项 | 值 |
|---|---|
| 游戏名 | 韭菜之王 |
| 题材 | 股票人生 · 卡牌决策 · 60 天生命周期 |
| 技术栈 | 微信**小程序**原生（WXML + WXSS + JS）。**不是小游戏**，不用 Canvas 手绘，不引游戏引擎 |
| AppID | *待填*（两端必须一致，且两端登录同一个微信账号） |
| 仓库 | `git@github.com:ricol-yu/mini-game-stock.git` |
| 变现方式 | **纯广告变现（流量主）**。不做内购 —— 内购要版号，周期长、流程重，不符合当前阶段 |
| 当前阶段 | v3 网页原型已可玩（`prototype.html`），待迁移到小程序 |
| 在线工作台 | https://workbuddy.link/p/rqRIkavd1RWvbGy1DoQrtE |

## 一句话玩法

你一辈子只有一只票，它没有名字。每天一张卡，左滑抽身、右滑投入。
金钱 / 心态 / 风险 / 社会四条线同时走，任何一条崩了人生就提前结束，
活满 60 天结算。

## 玩法基调（改文案时必须守住）

克制、不说教、不指责玩家。**只陈述后果，不评判选择。**
结局文案是约 20 字内的一句白描，比如「钱是一点一点少的，少到最后，
你自己都拼不出中间的过程。」

不要写成「恭喜通关」「你太贪心了」这种口吻。这个游戏的张力来自
「你明明知道，但还是这么做了」，不是来自教育。

## 卡面写作规则（L1 · 每张新卡必须过，`validate-cards.js` 会拦）

这套规则是 2026-10-21 用户玩后反馈倒推出来的：**「只有加没有减，没有王权那种数值互相牵制」**。
当时的量化结果：伪选择 22.8%、全赚不赔选项 32%、41% 的卡只碰 1–2 条数值。

1. **正文不得包含任何一侧选项的原文。**
   正文只给情境，替玩家做选择的那一刻，选择张力就归零了。
   ✅「这个月房贷 6,800。你看着办。」
   ❌「孩子举着卷子过来。你摆摆手：「等一下。」」（左滑选项就叫「等一下」）

2. **每个选项至少触及 2 条数值。**
   只动心态和社会 = 金钱与风险全程缺席，玩家会觉得「这不用想」。

3. **每个选项至少要付出一条代价。** 没有「全赚不赔」的那一侧。

4. **两个选项互不支配，也不能相同。**
   一边在每个维度都不比另一边差 = 伪选择。

5. **凡是「占用时间」的选择，代价必须落到金钱或风险上。**
   隐性时间成本不是成本——这是用户原话戳穿的那件事。
   占掉今晚 → `risk` 上升（仓位没人盯）；省下今晚 → `cash` 进账（替人值了个夜班）。

6. **「拒绝入局」也要付账。** 不入这个圈子，代价是 `social` 下降（被排除在外），
   而不是白赚一个心态。这条让「清醒的旁观者」不再是免费姿势。

> 改完卡池必须跑：`node tools/validate-cards.js`（硬门禁）
> → `node tools/check-dominance.js`（单卡还有没有得想）
> → `node tools/check-policy.js policy --runs 3000`（决策值不值钱）

## 文档索引

| 文件 | 内容 |
|---|---|
| `docs/design/game-design.md` | 完整玩法规格：四属性、每日结算公式、七种状态、结局优先级 |
| `docs/plan/next-phase.md` | **下个阶段路线图**：卡池扩容目标、schema v2、素材规范、系统顺序、铺量门槛 |
| `docs/plan/development-plan.md` | **执行清单（按节点推进）**：每完成一项打勾写日期，开工先看这里 |
| `docs/tech/miniprogram-migration.md` | 迁移到小程序的方案、WXS 手势架构、WXSS 兼容性问题、类目风险 |
| `docs/tech/testing.md` | 四层测试环境、真机验证流程、PC 端边界、广告变现硬约束 |
| `data/cards.json` | **97 张卡的唯一真源**（schema v2：语义 id + whoId）。改卡面文案或数值一律改它 |
| `docs/plan/baseline.md` | **仿真基线**：结局分布/重复率/卡覆盖。改卡后跑仿真与它对比 |
| `tools/sync-json-to-prototype.js` | 真源 → 原型：`node tools/sync-json-to-prototype.js` |
| `tools/validate-cards.js` | **校验器**：`node tools/validate-cards.js`，9 类检查（含决策质量），退出码非 0 = 不许提交 |
| `tools/check-dominance.js` | 单卡「还需不需要想」：伪选择 / 全赚不赔 / 只碰 1–2 条数值 |
| `tools/check-policy.js` | 玩法体检：`policy` 五种玩法对照，`scan` 扫 512 种站队玩法 |
| `tools/check-repeat.js` | **抽卡体检**：同卡重复 / 同类扎堆 / 借贷卡成串。`--compare` 可跑旧算法对照 |
| `tools/simulate.js` | **无头仿真器**：`node tools/simulate.js --runs 10000`，跑的是 prototype.html 的真实代码 |
| `prototype.html` | 可玩原型，单文件自包含。**由 `cards.json` 生成，不要手改** |
| `spike/wxs-swipe/` | **WXS 滑卡验证工程**（独立小程序项目，验证完可删）。结论回写到 `testing.md` |
| `tools/cards-manager.html` | 网页管理表，双击即用，改完导出 JSON 覆盖 `cards.json` |
| `tools/extract-cards.js` | 反向（prototype → json），**仅救急核对**，不是正常流程 |

**改数值或文案前，先读 `docs/design/game-design.md`。**
数值之间有耦合（比如风险消退 0.15/天 vs 重仓 +0.45/天），单改一个数会破坏平衡。

## 每次开工前，先做三件事

1. `git pull` —— 不 pull 就动手，等于主动制造冲突
2. 读根目录的 `HANDOFF.md` —— 那是上一台设备留下的交接卡
3. 读 `docs/devlog/` 里最新一篇 —— 了解最近几天改了什么、为什么改

## 硬性规则

- **绝不提交 `project.private.config.json`** —— 它在 `.gitignore` 里，存的是各设备本地设置（端口、编译选项、真机调试机器），两端必然不同
- **目录名保持 `mini-game-stock`，不要重命名** —— `projectname` 字段跟着目录名走，改了就反复冲突
- **主包上限 4MB** —— 美术、音频不进仓库，放 CDN 或分包
- **`spike/` 不进主包** —— 正式工程建好后，把 `spike/` 加进 `packOptions.ignore`，或直接删掉
- **逻辑与渲染必须分离** —— `core/` 里不许出现任何绘制代码，渲染层不许直接改状态
- 不在仓库里存任何密钥、Token、AppSecret
- 提交信息用 `feat: / fix: / chore: / docs: / refactor:` 前缀
- **这是小程序，不是小游戏** —— 已验证过判断依据（见迁移文档第一节），不要再推翻重议
- **拖动、动画等每帧变化的样式必须走 WXS** —— 不许在 `touchmove` 里 `setData`，会掉帧到不可用
- **小程序类目绝不能选「游戏」** —— 该操作不可逆，选了就变成小游戏，只能重新注册账号
- **手感相关参数（松手阈值、跟手系数、惯性衰减）不得在模拟器上定型** —— 模拟器的 touchmove 事件密度比真机低一个数量级，调出来的值必然偏移。必须在真机调试 2.0 上下调
- **`app.json` 不配 `resizable`** —— 配了 PC 端会在大窗口自动双栏，一张全屏卡被拆成两栏，视觉直接崩
- **广告只放自然停顿点**（日结算后 / 重开一局），绝不插在滑卡之间
- **卡池唯一真源是 `data/cards.json`** —— 改卡面文案或数值一律改它，
  再跑 `node tools/sync-json-to-prototype.js` 同步回 `prototype.html`（prototype 仍保持单文件自包含、双击即玩）。
  `tools/extract-cards.js`（prototype → json）只作救急核对，不作日常流程。
  可视化管理表 `tools/cards-manager.html` 由 `node tools/build-manager.js` 生成、**不要手改**；
  `data/cards.xlsx` 由 `python3 tools/export-xlsx.py` 生成，同样不要手改 —— 两者都是派生物
- **改卡三连，缺一不可**：改完 `data/cards.json` 后依次 ① `node tools/validate-cards.js`（全绿才继续）
  ② `node tools/sync-json-to-prototype.js` ③ `node tools/simulate.js --runs 10000` 并和
  `docs/plan/baseline.md` 对比——任一结局占比偏移 > 2 个百分点要停下来说明原因
- **卡片 id 一旦定下永不改**（`fam_mortgage_01` 这种语义 id）——关联卡、素材 manifest 都引用它；
  新卡 id 用 `{类别拼音}_{场景}_{两位序号}`，查重交给校验器
- **抽卡算法只有一份，住在 `prototype.html` 的 `pick()` 里** ——
  仿真器/体检脚本一律调 `sandbox.pick()`，**不许在 Node 侧再抄一遍**。
  以前抄过，结果任何一次抽卡改动都会让「仿真结论」和「玩家体验」悄悄分叉。
  需要加速就换 `whenOK` 的实现（`installFastWhen`），不要换抽卡逻辑
- 一次改动涉及 3 个以上文件时，先说明打算改哪些、为什么

## 代码约定

- 缩进 2 空格，字符串用单引号，语句结尾带分号
- 游戏状态集中在单个 `state` 对象里，不散落全局变量
- 渲染函数之间不互相调用，统一由一个 `render()` 入口按固定顺序调度（防止递归死循环）
- 卡牌的触发条件用声明式描述，**不要用 `function`** —— 函数无法序列化，
  会导致卡池不能数据驱动、不能热更。
  语法：`;` 且、`|` 或（**没有括号**，`A 且(B 或 C)` 展开成 `A;B|A;C`）；
  `has:xxx` / `no:xxx` 判状态；`mind<30`、`equity>cost`、`equity<cost*0.85` 比属性；
  `did:cardid.l` / `did:cardid.r` / `did:cardid` 判「那张卡你那么选过」（最后选择生效）；
  `seen:cardid` 判「那张卡出现过（含垫层）」。
  可用属性：`mind social risk day equity cash debt cost`。解析见 `prototype.html` 的 `whenOK()`
- 关联卡（when 带 `did:`/`seen:`）= 叙事大事件：出场走 `bagFindChain()` 插队通道，
  且**一局只出一次**（`_used` 上限 1）。不要给普通氛围卡加 did:/seen:，会抢占出场优先级
- 时机卡用 `"window": [起, 止]`（第几天到第几天），校验器查 1..60 且起≤止
- 事件线总图见 `docs/design/event-lines.md`——**改触发层卡的选项前必读**（L/R 是别的卡的记账来源）
- 链卡两条硬规则（10-21 踩坑）：① 选项必须是「对这个事件的反应」，文案说什么选项就答什么；
  ② 链上后续卡的 when 要消费前面的选择（`.l`/`.r` 分流），只写 `did:cardid` 不分流 = 选项是摆设
- 新增模块时先看现有文件的组织方式，不要另起一套风格

## 待补充（项目推进中逐步填）

- [ ] AppID 填上（两端必须同一个）
- [ ] 累计 UV 到 500 后开通流量主，确认广告位类型
- [ ] 核心数值的调参记录（改了哪个数、为什么改、效果如何）
- [ ] 分包策略（如果主包接近 4MB）
- [ ] 结局文案定稿
