# mini-game-stock

微信小程序小游戏（立项中）。

- 仓库：https://github.com/ricol-yu/mini-game-stock
- 本地（Windows）：`C:\Users\ZhuanZ\WorkBuddy\mini-game-stock`
- 本地（Mac）：`~/mini-game-stock`

## 这个仓库是什么

游戏代码的**唯一真源**。公司和家里两台设备靠它同步：

- 开工：`git pull`
- 收工：`git add . && git commit -m "..." && git push`

**没 push 的代码 = 不存在。** 微信开发者工具的预览只认本地文件，
在一台设备上改了没 push，另一台打开就是上一版，而且不会有任何提示。

## 文件说明

| 文件 | 作用 |
|---|---|
| `AGENTS.md` | 项目约定，给 AI 看的（技术栈、硬性规则、代码风格） |
| `HANDOFF.md` | 交接卡，每次收工更新：做到哪 / 下一步 / 卡在哪 |
| `docs/devlog/` | 开发日志，按日期，一文件一天 |
| `.gitignore` | 已排除 `project.private.config.json` 等本地文件 |
| `.gitattributes` | 强制 LF，防止 Windows/Mac 换行符互相污染 |

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
