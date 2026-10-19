# mini-game-stock

微信小程序（卡牌决策游戏《韭菜之王》，立项中）。

- 仓库：https://github.com/ricol-yu/mini-game-stock
- 本地（Windows）：`C:\Users\ZhuanZ\WorkBuddy\mini-game-stock`
- 本地（Mac）：`~/mini-game-stock`

## 工作空间约定：AI 对话也在这个目录里开

AI 对话挂在「工作目录」上，而对话历史只存在本机、**不跨设备**。
所以两端用同一个目录名，并且每次开新对话都选这个目录：

| 设备 | 开对话时选这个目录 |
|---|---|
| Windows | `C:\Users\ZhuanZ\WorkBuddy\mini-game-stock` |
| Mac | `~/mini-game-stock` |

**不要**在 `WorkBuddy\2026-10-18-17-55-16` 这类自动命名的目录里开游戏开发的对话 ——
那是「协作基建台」的旧空间，只用来改云端工作台本身，和游戏代码无关。

对话记忆不跨设备，跨设备靠两样东西：`HANDOFF.md` + `git pull`。

## 这个仓库是什么

游戏代码的**唯一真源**。公司和家里两台设备靠它同步：

- 开工：`git pull`
- 收工：`git add . && git commit -m "..." && git push`

**没 push 的代码 = 不存在。** 微信开发者工具的预览只认本地文件，
在一台设备上改了没 push，另一台打开就是上一版，而且不会有任何提示。

## 第一次在新设备上：先读 `HANDOFF.md`

换设备后的第一件事不是看代码，是看 `HANDOFF.md`。里面有「做到哪 / 下一步第一件事 / 卡在哪」，
比翻 git log 快得多。

当前进度：**配置层已封住**（卡池真源是 `data/cards.json`，有网页管理表可改数值），
WXS 滑卡验证工程已写完、还没在任何设备上跑过。
在新设备上要做的第一件事是跑 `spike/wxs-swipe`，具体步骤写在 `HANDOFF.md` 第 2 节。
只想验收游戏内容本身的话，看 `HANDOFF.md` 第 0 节（验收清单）。

## 文件说明

| 文件 | 作用 |
|---|---|
| `AGENTS.md` | 项目约定，给 AI 看的（技术栈、硬性规则、代码风格） |
| `HANDOFF.md` | 交接卡，每次收工更新：做到哪 / 下一步 / 卡在哪 |
| `docs/design/game-design.md` | 玩法规格：四属性、每日结算公式、状态、结局 |
| `docs/tech/miniprogram-migration.md` | 迁移到小程序的方案与坑（WXS 手势、WXSS 兼容、类目风险） |
| `docs/tech/testing.md` | 四层测试环境、手感为什么只能在真机验、PC 端边界、广告变现约束 |
| `docs/plan/next-phase.md` | **下个阶段路线图**：先做什么、卡池扩容到多少、素材规范、铺量门槛 |
| `docs/plan/development-plan.md` | **执行清单**：N0–N8 节点打勾表，每完成一项写日期，开工先看这里 |
| `spike/wxs-swipe/` | **WXS 滑卡验证工程**（独立小程序项目，验证完可删）。导入时目录要选这一层，不是仓库根 |
| `prototype.html` | 可玩的网页原型，双击即开。**由 `cards.json` 生成，不要手改** |
| `data/cards.json` | **63 张卡的唯一真源**，改数值改这里 |
| `tools/sync-json-to-prototype.js` | 真源 → 原型：`node tools/sync-json-to-prototype.js` |
| `tools/cards-manager.html` | 网页管理表（63×31，可筛选/排序/编辑/导出 JSON），双击即用 |
| `tools/build-manager.js` | 重新生成管理表（卡池结构性变更后跑一次） |
| `tools/export-xlsx.py` | 导出 `data/cards.xlsx`（只作浏览，不是真源） |
| `tools/extract-cards.js` | 反向（prototype → json），**仅救急核对** |
| `docs/devlog/` | 开发日志，按日期，一文件一天 |
| `.gitignore` | 已排除 `project.private.config.json` 等本地文件 |
| `.gitattributes` | 强制 LF，防止 Windows/Mac 换行符互相污染 |

## ⚠️ Mac 端导入现有代码：必须用 clone，不要 git init 后强推

> 这一节讲的是**把 v3 原型代码导进仓库**，属于后面的事。
> 第一次在 Mac 上先跑 `spike/wxs-swipe` 验手感，不要先导入代码。

Mac 上已经有一个能跑的 v3 原型目录了。**不要在那个目录里 `git init` 然后
`git push -f`** —— 那会把仓库里已有的提交（文档、卡池数据、协作文件）全部覆盖掉。

正确顺序：

```bash
# 1. 先 clone 到新目录
cd ~
git clone git@github.com:ricol-yu/mini-game-stock.git

# 2. 把原来项目里的代码拷进 clone 出来的目录
#    注意：不要拷 .git、不要拷 node_modules
cp -r ~/原项目路径/* ~/mini-game-stock/

# 3. 看一眼有没有把不该提交的东西带进来
cd ~/mini-game-stock
git status

# 4. 提交并推送
git add .
git commit -m "feat: 导入 v3 网页原型"
git push
```

如果原来那个目录**已经是 git 仓库**（里面有 `.git`），拷贝时务必排除它，
否则会把两套历史搅在一起：

```bash
rsync -av --exclude='.git' --exclude='node_modules' ~/原项目路径/ ~/mini-game-stock/
```

### 已经 `git init` 过了怎么办

如果 Mac 上那个目录已经初始化成仓库了，别慌，检查一下：

```bash
git remote -v          # 有没有指向这个仓库
git log --oneline      # 有没有把别人的提交搞丢
```

只要**没有执行过 `push -f`**，远程仓库就是安全的。在 Mac 上执行
`git fetch origin && git reset --hard origin/main` 可以把本地对齐到远程，
**但会丢掉未提交的改动**——先把改动 stash 或复制到别处。

不确定的时候，停下来问一下，别凭感觉操作。

## 双设备

Windows（这台，已配好）：

```bash
cd ~/WorkBuddy/mini-game-stock
git pull
```

Mac（第一次）：

```bash
cd ~
git clone git@github.com:ricol-yu/mini-game-stock.git
```

`git clone` 默认就生成 `mini-game-stock` 目录，**不要改名**——
`project.config.json` 里的 `projectname` 跟着目录名走，两端不一致会反复冲突。

两台设备都要配 SSH key（Windows 这台已配好，`ssh -T git@github.com` 可验证）。

## 注意

- `project.private.config.json` 已在忽略列表里，不要强行提交
- 两端登录同一个微信账号、用同一个 AppID，否则看不到同一个开发版
- 主包上限 4MB，美术音频不进仓库
