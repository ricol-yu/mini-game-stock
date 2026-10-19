# 交接卡

> 每次收工前花 90 秒填一遍，跟代码一起 commit + push。
> 到家 `git pull` 打开这个文件，30 秒就能回到昨天的状态。
> **只保留最近一次**，历史版本在 git 记录里，不用堆积。

---

**最后更新**：2026-10-19 15:33
**在哪台设备上写的**：公司 Mac（`ricol-yu@ricol-yu-Mac`）
**当前分支**：main
**最后一次 commit**：`88124b2` + 本次 Mac 接入的交接提交

## 1. 做到哪了

**Mac 端接入完成**，尚未跑 spike、未写一行游戏代码。本轮产出三件事：

- `git clone git@github.com:ricol-yu/mini-game-stock.git` → `~/mini-game-stock`，目录名按 README 约定保持 `mini-game-stock`
- 验证 `ssh -T git@github.com` → `Hi ricol-yu!`（Mac 上 id_ed25519 已配）
- 验证 `git config --global user.name/email` → `ricol-yu / 595619863@qq.com`（与 Windows 端一致）
- 本次 `HANDOFF.md` 提交 + push，相当于通知 Windows 端「另一端已上线」

**Mac 上的 v3 网页原型（`/Users/zhinan009/WorkBuddy/game-stock/prototype.html` + `design.html`）仍未导入仓库**——按 README 的明确警告，「先跑 spike 验手感，验通后再导代码」，所以现在 `~/mini-game-stock` 仓库里只有 Windows 那晚的产物（文档、卡池数据、spike 工程）。

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
- [ ] **Mac 端未装微信开发者工具** —— 装上之后才能跑 spike
- [ ] **AppID 还没填**，两端都还是 `touristappid`。谁拿到测试号就填上并提交，另一端 pull 即可
- [ ] **v3 原型未导入**（`/Users/zhinan009/WorkBuddy/game-stock/`），按 README/HANDOFF 流程，等 spike 验通后再说
- [ ] 没有未提交的文件（本次只有 HANDOFF.md 改动）

## 5. 下次别忘

- **`prototype.html` 不要改** —— 它在 Mac 上 `/Users/zhinan009/WorkBuddy/game-stock/`，是 v3 的唯一真源。Windows 那晚只做了新增文件，一行都没碰它
- **正式工程骨架还没建**。不要在仓库根目录随手 `git init` 或新建小程序工程，
  正确做法是 clone 后拷（README 的「Mac 端导入现有代码」一节），不要 git init 后强推
- 验证完把结论回写 `docs/tech/testing.md` 的「待验证清单」，然后 `spike/` 就可以删了 ——
  它的价值是把结论带出来，不是留下来当代码用
- 手感参数（`TH` 松手阈值 92px、`ROT` 旋转角 9、`BASE` 归一化基准 300）现在是拍脑袋定的，调完记进 devlog
- 一次只在一个设备上动同一份文件。换设备开工前 `git pull`，收工 `git push`，这是唯一约束
