# 投稿到 awesome-dsh-plugin · 操作清单

依据 `https://github.com/awesome-dsh-plugin/awesome-dsh-plugin/blob/main/contributing.md`（2026-11-22 核对）。

## 0. 硬性条件（CI 会查）

- [x] 公开 GitHub 仓库（本目录）
- [x] `package.json` 声明 `dsh.bundle`，根目录有 `cordis.patch.yml`（name 与包名一致）
- [x] 真实可运行的代码（Host + Client + 模板/种子/图标）
- [ ] 仓库创建满 **1 天**（本仓库创建于 2026-11-22 21:3x，最早 **2026-11-23 21:35 +08:00** 之后提 PR）
- [ ] 仓库加 `dsh-plugin` topic
- [ ] 提 PR（一个文件）

## 1. 要提的那一个文件

路径：`data/plugins/1502074527-svg__dsh-custom-subagents.yml`

内容就是本目录的 `assets/submission.yml`（已按文档写过：`description.en` 以句号结尾、含冒号已用单引号、`zh` 提供、`icon` 指向 raw 地址）。

## 2. 步骤

1. 在 `awesome-dsh-plugin/awesome-dsh-plugin` 提 PR，只**新增**上面那个文件；不要改 README（由 `data/plugins/*.yml` 生成）。
2. 分支名建议 `rename/dsh-custom-subagents`。
3. PR 标题：`Rename entry to 1502074527-svg/dsh-custom-subagents`。
4. CI 通过是前置条件，不是结论；维护者会读仓库，核对描述与代码是否一致。

## 3. 描述与代码的对应点（防止被打回）

| 描述里的说法 | 代码位置 |
| --- | --- |
| 用户级/项目级 Markdown 定义 | `lib/store.js` `loadAgents` / `saveDefinition` |
| 画廊首页、详情、五步编辑器 | `client.js` `homePage` / `AgentDetail` / `AgentForm` |
| 12 份模板、五个领域 | `templates/*.json`、`TEMPLATE_GROUPS` |
| 30 款图标 | `logos/01…30.png`、`lib/logos.js` |
| 知识卡（粘贴文本/网址提炼） | `lib/knowledge.js`、`/knowledge*`、`/ingest` |
| 按项目启停策略 | `lib/store.js` `updatePolicy` / `policyStorePath` |
| 弹层编辑风格库 | `StylesPane`（portal + `data-am-layer`） |
| mtime 并发保护 | `saveDefinition(..., { expectedMtime })`、`STALE_DEFINITION` |

## 4. 可选加分

- 发 npm 包：预构建安装可跳过构建授权（本仓库保持 `private: true`，若要发 npm 需改）。
- 附预构建 tarball 到 GitHub Release，并在条目里加 `tarball:`（源码可安装，本项非必需）。
