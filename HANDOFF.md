# 交接卡

> 每次收工前花 90 秒填一遍，跟代码一起 commit + push。
> 到家 `git pull` 打开这个文件，30 秒就能回到昨天的状态。
> **只保留最近一次**，历史版本在 git 记录里，不用堆积。

---

**最后更新**：2026-10-20 02:30
**在哪台设备上写的**：家里 Windows（`ZhuanZ`）
**当前分支**：main
**最后一次 commit**：本文档与该提交一起推送，实际 SHA 见 `git log --oneline -1`
**状态**：**N1 已完成**（内容地基：id 语义化 + schema v2 + 校验器 + 仿真器 + 基线 + 管理表升级）。N0（spike）仍由你本人待办；N2（卡池扩容）已解锁。

## 0. Mac 端开工三步

```bash
cd ~/mini-game-stock
git pull
git log --oneline -3        # 应看到「N1 内容地基」相关的几个提交
```

然后**必读**：
1. `docs/plan/development-plan.md` —— 进度唯一真源，N1 已全绿，N2 是下一步
2. `docs/plan/baseline.md` —— 仿真基线，之后所有改卡都和它对比
3. `AGENTS.md` 新增了一条硬规则：**改卡三连**（校验器 → 同步 → 仿真对比），缺一不可

## 1. 这一晚做了什么（Windows 端，N1 全部内容）

| 产出 | 说明 |
|---|---|
| **id 语义化** | 63 张卡 `c001..c063` → `fam_mortgage_01` 式语义 id，显式映射表在 `tools/migrate-ids-v2.js`（保留备查，勿再运行）。prototype 零 diff（id 不进原型） |
| **schema v2** | 新增 `whoId`（素材锚点）/`window`/`weight`/`once`/`hidden`；缺省不落盘。DSL 三谓词 `did:/seen:/pick:` 校验已支持，**引擎实装留到 N3**（避免现在改变游戏行为污染基线） |
| **校验器** | `tools/validate-cards.js`：8 类检查，9 个坏样例自检全拦截、真实数据零误报 |
| **仿真器** | `tools/simulate.js` + `tools/sim/engine.js`：**直接跑 prototype.html 的真实代码**（vm 沙箱 + DOM 桩 + 种子 RNG），不移植逻辑、对拍天然成立 |
| **基线** | `docs/plan/baseline.md` + `data/sim/baseline-100k.json`（10 万局 · seed=20261020 · 99.8s） |
| **管理表升级** | `tools/cards-manager.html`：+5 列、新增/复制卡、批量改数值、内嵌校验（与 CLI 同一份函数） |
| **派生物重生成** | `cards-flat.json`、`cards.xlsx`（这次内容真的变了：新 id + 新列，正常提交） |

## 2. 下一步第一件事

两条线并行，**互不阻塞**：

**线 A（你）—— N0 spike 真机验证**（和之前一样，还没做）：
导入 `spike/wxs-swipe` → 换测试号 AppID → 真机滑 5 次 → 结论回写 `docs/tech/testing.md`。

**线 B（AI 或你+AI）—— N2 卡池扩容 63 → 220**，按批推进：
批 1（+34）家庭/职场/自己，**候选题库就是基线里那 14 张支配选项卡**（47% → 目标 <5%）。
每批固定动作：写卡 → `validate-cards.js` → `sync-json-to-prototype.js` → `simulate.js --runs 10000` 与基线对比 → 提交。

## 3. 卡点 / 需要你拍板的事

- **无技术卡点**。基线的两个设计决定，如不同意随时推翻：
  1. `weight/window/once/hidden` 只入库+校验，**引擎未消费**（N3 实装）——理由：现在实装会改变游戏行为，基线就不是"当前游戏"的了
  2. 「一次都没买」结局随机仿真测不到（0/10 万），是玩家行为型结局，**不算 bug 不要修**
- AppID 两端仍是 `touristappid`（spike 真机预览需要测试号）
- 云端工作台里还是那 10 条跑酷示例数据（提过两次了，说一声就换）

## 4. 下次别忘

- **先 `git pull` 再动手**，Mac 端如果有未推的本地提交，先推
- **不要手改** `prototype.html` / `cards-manager.html` / `cards.xlsx` / `cards-flat.json`（都是派生物）
- `tools/extract-cards.js`（prototype→json）现在不认识语义 id，救急核对时注意它会丢 id/whoId
- 改卡后如果仿真结局偏移超 2 个百分点，先停下写两句话说明再继续——基线就是干这个用的
