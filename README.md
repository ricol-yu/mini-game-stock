# mini-game

微信小程序小游戏（立项中）。

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
| `.gitignore` | 已经排除了 `project.private.config.json` 等本地文件 |

## 双设备首次使用

**这台机器（第一次）**

```bash
git remote add origin git@github.com:<用户名>/mini-game.git
git branch -M main
git push -u origin main
```

**另一台机器**

```bash
git clone git@github.com:<用户名>/mini-game.git
```

两台都配 SSH key，或者用 `gh auth login` 走 HTTPS。

## 注意

- 目录名保持 `mini-game`，不要改
- `project.private.config.json` 已在忽略列表里，不要强行提交
- 两端登录同一个微信账号、用同一个 AppID，否则看不到同一个开发版
