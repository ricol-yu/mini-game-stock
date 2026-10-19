# 交接卡

> 每次收工前花 90 秒填一遍，跟代码一起 commit + push。
> 到家 `git pull` 打开这个文件，30 秒就能回到昨天的状态。
> **只保留最近一次**，历史版本在 git 记录里，不用堆积。

---

**最后更新**：2026-10-19 18:30
**在哪台设备上写的**：公司 Mac（`ricol-yu@ricol-yu-Mac`）
**当前分支**：main
**最后一次 commit**：`b07083b`（已 push，远端与此一致，工作区干净）

## 0. 回家验收清单（2026-10-19 收工时写的，给 Windows 端）

**先同步，别跳过**：

```powershell
cd C:\Users\ZhuanZ\WorkBuddy\mini-game-stock
git pull
git log --oneline -1        # 应该看到 b07083b
git status                  # 应该「nothing to commit，working tree clean」
```

只要这三行的输出对得上，说明公司这台推干净了，下面的验收才有意义。

**四步，20 分钟够**：

| # | 做什么 | 看什么 / 判据 |
|---|---|---|
| 1 | 双击仓库根的 `prototype.html`（浏览器直接开，不用起服务器） | 能玩。四根属性条、右滑买 / 左滑卖、走完 60 天出结局和「一句话评价」 |
| 2 | 双击 `tools/cards-manager.html` | 63 张卡全在表里，能筛选、能改、能「导出 JSON」。改完不必真覆盖，能导出就算通 |
| 3 | `node tools/sync-json-to-prototype.js`，然后 `git status` | **应无改动**。有 diff 就说明真源和 prototype 不一致——先别提交，记下来告诉我 |
| 4 | 想通盘扫数值就开 `data/cards.xlsx` | 63 行 × 31 列，含「填表说明」页，可按列筛选 |

**玩的时候，这几个是设计如此、不是 bug**：心态到 88 不会死，会进「上头」状态（买入价 ×1.35）；
风险到 72 之后每天有 7.5% 概率「事情自己发生」；社会值每天自然 −0.22，是唯一必须花钱才保得住的属性。

**改数值的正经动作，就一条**：

```
管理表改  →  导出覆盖 data/cards.json  →  node tools/sync-json-to-prototype.js  →  玩一局确认
```

**Windows 端两个坑**：

- `prototype.html` 的 `CARDS = [...]` 数组**别手改**，它是生成的，下次同步会冲掉
- `export-xlsx.py` 在 Windows 上用 `python` 不是 `python3`，且要装 `openpyxl`。
  装不上就算了 —— **xlsx 只是浏览用的，不是真源**，缺它不影响任何事

**验收完请回写**：哪些卡的数值明显太狠 / 太软、哪句卡面文案读着别扭、结局的一句话评价哪句没味。
不用改，记在 `docs/devlog/` 次日文件里或直接回写这一节都行 —— 内容向的活儿等你拍板了才动。

## 1. 做到哪了

**Mac 端接入 + v3 原型合并** 已完成。本轮产出：

- `git clone git@github.com:ricol-yu/mini-game-stock.git` → `~/mini-game-stock`，目录名按 README 约定保持 `mini-game-stock`
- 验证 `ssh -T git@github.com` → `Hi ricol-yu!`（Mac 上 id_ed25519 已配）
- 验证 `git config --global user.name/email` → `ricol-yu / 595619863@qq.com`（与 Windows 端一致）
- `HANDOFF.md` 切到 Mac → commit `4d33148` → push
- `docs/devlog/2026-10-19.md` 记录接入 → commit `a6ab5ff` → push
- **v3 原型已合并入仓库**（`prototype.html` + `design.html` + 同步重抽 `data/cards.json`）→ commit `c7b0d69`
- **追加修复「潜伏的旧版残留」**（`docs/design/game-design.md` 与 spike 的卡面硬编码各一处）→ commit `bd2a5e9`

**冲突检查结果**（合并前做的，三项分别给出）：

- 路径零冲突：`prototype.html` / `design.html` 仓库中不存在，是净新增
- **真实隐性冲突已修复**：`data/cards.json` 是 10-16 生活成本定标（×1.3）前的旧版，当前 `prototype.html` 是定标后版本。20 处 `spend` 数值 + 8 处卡面文案差异。重抽后已对齐
- `design.html` 的技术选型/变现结论与 `AGENTS.md` 一致（小程序、纯广告、版号做 Plan B）

**根因（用户事后确认）**：昨天发给 Windows 上 AI 的那份 `prototype.html` 不是最新的，
Mac 上定标后的版本才是最新。所以 Windows 那晚抽的 `cards.json`、写的文档示例、
抄的 spike 卡面，跟的都是旧版。

**合并后又扫出 2 处「潜伏的旧版残留」**（已修复，`bd2a5e9`）：

| 位置 | 旧值 | 新值 |
|---|---|---|
| `docs/design/game-design.md:138` | "出 4,200" | "出 5,500" |
| `spike/wxs-swipe/pages/swipe/index.js:14` | `'出 4,200'` | `'出 5,500'` |

都是「老婆/房贷」卡的 R 文本。教训：重抽 `cards.json` 只能修**结构化派生**，
**手抄副本**（文档示例、spike 卡面）必须靠 grep 扫。

**合并后约定**：`/Users/zhinan009/WorkBuddy/game-stock/` 不再是原型真源，不要再改那个目录。

## 1.5 数据真源反转（本次做的，改动了协作方式 —— 请务必看）

之前是「prototype.html 硬编码 CARDS = 真源 → 抽取出 cards.json」，方向是反的，
这也是 10-19 那次 4200/5500 漂移的根因。现在反过来了：

```
data/cards.json   ← 唯一真源（要改数值就改这个）
    ↓ node tools/sync-json-to-prototype.js
prototype.html    ← 单文件自包含、双击即玩（由真源生成，别再手改它的 CARDS 数组）
```

**改数值的标准动作**：
1. 双击 `tools/cards-manager.html`（网页表格，可筛选/排序/编辑）→ 改 → 点「导出 JSON」→ 覆盖 `data/cards.json`
   或者直接在 Excel 里看 `data/cards.xlsx` 通盘浏览，回 JSON 里改
2. `node tools/sync-json-to-prototype.js`
3. 跑仿真确认平衡没被改坏

配套工具（**都是派生物，不要手改**）：

| 文件 | 作用 | 生成命令 |
|---|---|---|
| `tools/cards-manager.html` | 网页可视化管理表（内嵌当前卡池，绕开 file:// 的 CORS） | `node tools/build-manager.js` |
| `data/cards.xlsx` | Excel/Numbers 表格，含「填表说明」页 | `python3 tools/export-xlsx.py` |
| `data/cards-flat.json` | 扁平中间数据，供 xlsx 等下游消费 | `node tools/build-manager.js` 顺带产出 |
| `tools/extract-cards.js` | 反向（prototype → json），**仅救急核对** | — |

**同时把卡牌触发条件声明式化了**：`when` 从 JS 函数（`function(){return S.mind<30;}`）
改成能写进表格的字符串（`mind<30`、`no:baby`、`has:fired; social>52`、`equity<cost*0.85`）。
26 张卡全部迁移，新旧逻辑对拍 78000 次、判定 100% 等价。
这落实了 `AGENTS.md` 里早就写下的「触发条件不要用 function」那条 —— 之前 prototype 一直在违反它。
语法速查见 `AGENTS.md` 代码约定一节，或管理表底部的说明。

## 2. 下一步第一件事

**在 Mac 微信开发者工具里跑 `~/mini-game-stock/spike/wxs-swipe`，验 WXS 滑卡手感。** 具体步骤：

1. 装 Mac 版微信开发者工具（如果还没装），微信扫码登录
2. 申请测试号拿 AppID：https://developers.weixin.qq.com/miniprogram/dev/devtools/sandbox
3. **导入项目时目录选 `~/mini-game-stock/spike/wxs-swipe`，不是仓库根目录** —— 仓库根目录现在还不是小程序工程
4. 把 `spike/wxs-swipe/project.config.json` 里的 `"appid": "touristappid"` 换成测试号 AppID
5. 先在模拟器里看布局（四根属性条、卡面、印章），**这一步不要下任何关于手感的结论**
6. 点「预览」用手机扫码，滑五次，看底部面板的四个数

判据：滑起来手指和卡片之间没有可见延迟。数字只要不出现明显掉帧（帧间隔最大 > 34ms 连续出现），就算通过。

## 3. 卡在哪

**四个离线无法验证、必须在真机上确认的点**（都写在 `spike/wxs-swipe/README.md`）：

1. `ownerInstance.callMethod` 在 **Page** 上是否生效 —— 官方示例多为 Component。
   如果底部面板一直是 `—`，说明没触发，解法：把 `pages/swipe/index.js` 改成 `Component({ methods: {...} })`，其余文件不动
2. WXS 事件对象的触摸点字段是 `clientX` 还是 `pageX` —— 代码用的是 `touches[0].clientX`，
   拿到 `undefined` 就改成 `pageX`（`wxs/gesture.wxs` 里两处）
3. CSS 变量在 WXSS 里是否可用 —— spike 刻意全用字面色值绕开了，正式工程要用变量得单独验
4. `will-change: transform` 是否被支持 —— 不支持也无害

还有一个未决策的问题：**63 张卡里 18 张（29%）是支配选项**，选哪边都一样，没有真实权衡。
典型是「体检报告」：右滑心态 −6，左滑心态 +10。清单在 `game-design.md` 末尾，标着「待讨论，不是结论」。
这个不急，等手感通了再说。

## 4. 本机特有、另一台机器没有的东西

- [x] **Mac 上 SSH key 已配**（id_ed25519，7 月生成），`ssh -T git@github.com` 返回 `Hi ricol-yu!`
- [x] **Mac 上 git 全局用户已配**：`ricol-yu / 595619863@qq.com`（与 Windows 端一致）
- [x] **Mac 仓库位置**：`~/mini-game-stock`（按 README 约定，没改名）
- [x] **v3 原型已合并入仓库**（`prototype.html` + `design.html` + 重抽后的 `data/cards.json`）—— 路径零冲突，但 `data/cards.json` 与旧 prototype 有 20 处数值差异（生活成本 ×1.3 定标前），已重抽对齐
- [x] **已扫描并修复旧版残留**（docs + spike 各一处 4,200 → 5,500）；剩余 4,200 仅出现在 devlog 的历史描述里，属正常
- [ ] **Mac 端未装微信开发者工具** —— 装上之后才能跑 spike
- [ ] **AppID 还没填**，两端都还是 `touristappid`。谁拿到测试号就填上并提交，另一端 pull 即可
- [x] **没有未提交的文件**（`git status` 干净，本地与 `origin/main` 同为 `b07083b`）
- [ ] **xlsx 导出依赖 Mac 上的 venv**：`export-xlsx.py` 用的是
      `/Users/zhinan009/.workbuddy/binaries/python/envs/default/bin/python`（装了 openpyxl）。
      Windows 端要重跑得自己装 `openpyxl`；不跑也没关系，xlsx 不是真源

## 5. 下次别忘

- **`prototype.html` 不要手改** —— 它是 `data/cards.json` 生成的派生物，手改的下次同步就被冲掉。
  要改数值：改 `cards.json`（或用管理表导出覆盖它）→ 跑 `node tools/sync-json-to-prototype.js`。
  （Mac 原目录 `/Users/zhinan009/WorkBuddy/game-stock/` 已不再维护，改了没人同步）
- **`prototype.html` / `design.html` 已在仓库根，但它们不是小程序代码**。spike 导入时目录仍选 `spike/wxs-swipe`。将来建正式工程时，这两个文件不能被打进主包（HTML 不是小程序页面，但要在 `packOptions.ignore` 里排除，别忘）
- **正式工程骨架还没建**。不要在仓库根目录随手 `git init` 或新建小程序工程；现在已经 clone 好了，直接在里面建即可
- 验证完把结论回写 `docs/tech/testing.md` 的「待验证清单」，然后 `spike/` 就可以删了 ——
  它的价值是把结论带出来，不是留下来当代码用
- 手感参数（`TH` 松手阈值 92px、`ROT` 旋转角 9、`BASE` 归一化基准 300）现在是拍脑袋定的，调完记进 devlog
- 一次只在一个设备上动同一份文件。换设备开工前 `git pull`，收工 `git push`，这是唯一约束
