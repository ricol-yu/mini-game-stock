# 交接卡

> 每次收工前花 90 秒填一遍，跟代码一起 commit + push。
> 到家 `git pull` 打开这个文件，30 秒就能回到昨天的状态。
> **只保留最近一次**，历史版本在 git 记录里，不用堆积。

---

**最后更新**：2026-10-18 20:10
**在哪台设备上写的**：家里 Windows（明天换公司 Mac）
**当前分支**：main
**最后一次 commit**：`dc923bd` + 收工前这笔文档提交

## 1. 做到哪了

**没有写任何游戏逻辑代码。** 这一晚全部是前置准备，产出三类东西：

- `docs/design/game-design.md` —— 从 v3 原型反推的完整玩法规格（四属性、六步结算、7 状态、13 结局优先级）
- `docs/tech/miniprogram-migration.md` —— 迁移方案：为什么是小程序、WXS 手势架构、WXSS 兼容问题、类目不可逆风险
- `docs/tech/testing.md` —— 四层测试环境（模拟器/真机调试/体验版/线上）、手感为什么只能在真机验、PC 端边界、广告变现约束
- `data/cards.json` —— 63 张卡结构化数据（由 `tools/extract-cards.js` 自动抽取）
- **`spike/wxs-swipe/` —— WXS 滑卡验证工程，代码写完了，还没在任何设备上跑过**

技术选型已确认并锁死：**微信小程序**（不是小游戏）。理由见迁移文档第一节，不要再推翻重议。

## 2. 下一步第一件事

**在 Mac 上跑 `spike/wxs-swipe`，验 WXS 滑卡手感。** 具体步骤：

```bash
# 1. 拉代码（clone 出来的目录名必须是 mini-game-stock，别改）
cd ~
git clone git@github.com:ricol-yu/mini-game-stock.git
```

2. 装 Mac 版微信开发者工具，微信扫码登录
3. 申请测试号拿 AppID：https://developers.weixin.qq.com/miniprogram/dev/devtools/sandbox
4. **导入项目时目录选 `~/mini-game-stock/spike/wxs-swipe`，不是仓库根目录** —— 仓库根目录现在还不是小程序工程
5. 把 `spike/wxs-swipe/project.config.json` 里的 `"appid": "touristappid"` 换成测试号 AppID
6. 先在模拟器里看布局（四根属性条、卡面、印章），**这一步不要下任何关于手感的结论**
7. 点「预览」用手机扫码，滑五次，看底部面板的四个数

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

- [x] **Windows 没装微信开发者工具**（`C:\Program Files\Tencent` 下只有企微和微信），所以 spike 只写了代码、没跑过
- [x] Mac 上需要单独装 Mac 版开发者工具，并配 SSH key（`ssh -T git@github.com` 应返回 `Hi ricol-yu!`）
- [x] **AppID 还没填**，两端都还是 `touristappid`。谁拿到测试号就填上并提交，另一端 pull 即可
- [ ] 没有未提交的文件（收工时全部 push 了）

## 5. 下次别忘

- **`prototype.html` 不要改** —— 它在 Mac 上，是 v3 的唯一真源。Windows 那晚只做了新增文件，一行都没碰它
- **正式工程骨架还没建**。不要在仓库根目录随手 `git init` 或新建小程序工程，
  正确做法是把 Mac 上 v3 的代码按 README 的步骤导入（clone 后拷，不要 git init 后强推）
- 验证完把结论回写 `docs/tech/testing.md` 的「待验证清单」，然后 `spike/` 就可以删了 ——
  它的价值是把结论带出来，不是留下来当代码用
- 手感参数（`TH` 松手阈值 92px、`ROT` 旋转角 9、`BASE` 归一化基准 300）现在是拍脑袋定的，调完记进 devlog
