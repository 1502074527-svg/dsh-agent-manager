# 实现细节

## 数据模型

一个智能体 = 一份 Markdown：frontmatter 存结构字段，正文存提示词。

| 字段 | 含义 |
| --- | --- |
| `name` | 内部代号（小写字母开头，只含小写字母/数字/连字符，≤50 位）；由标题 slug 推导，保存后不可改 |
| `title` / `description` | 显示名 / 「什么时候叫它」（主智能体只凭这句决定要不要调用） |
| `prompt` | 正文：岗位说明、流程、纪律、交付标准 |
| `mode` | `agent`（可带工具）或 `llm`（单次问答） |
| `tools` | 工具组 id 列表 |
| `model` / `provider` / `reasoning_effort` | 留空则继承全局默认 |
| `enabled` | 定义自带的开关；实际生效还要看项目策略 |
| `askFirst` / `selfCheck` / `criteria` | 先问清再动手 / 产出后自检 / 判断标准 |
| `style` | 绑定的风格 id（风格库中） |
| `avatar` | `logo-01`…`logo-30` |

存放：用户级 `~/.dsh/agents/*.md`，项目级 `<cwd>/.dsh/agents/*.md`（`DSH_HOME` 可覆盖用户级根）。

## 预设注册

智能体在运行时被注册成 DSH 预设：

```
id   = am-<name>-<sha1(预设内容) 前 8 位>
name = title
```

注册是**懒的**：列表接口只返回只读快照（含预览用 `presetId`），真正启动时才注册，避免为了显示而把所有智能体塞进预设表。

## Host 路由（前缀 `/agent-manager`）

| 路由 | 作用 |
| --- | --- |
| `GET /list` | 只读快照：定义、策略、解析错误、`mtimeMs` |
| `POST /save` | 新建或更新；带 `expectedMtime` 时做并发保护；跨作用域时移动文件 |
| `POST /remove` | 删除定义 |
| `POST /policy` | 按项目写启停 / 信任策略 |
| `POST /open-session` | 按预设建会话并返回 sessionId |
| `GET /groups` `GET /models` `GET /efforts` | 工具组、模型目录、推理强度 |
| `GET/POST /templates` | 模板列表与「存为模板」 |
| `GET/POST /knowledge*` | 知识卡读/写/删 |
| `POST /ingest` | 从文本或网址提炼知识卡 |
| `GET/POST /styles*` | 风格库读/写/删/装内置 |
| `POST /generate` | 「帮我起草」：只补空白字段 |

错误码映射到 HTTP：`BAD_REQUEST/BAD_CWD/BAD_TEMPLATE` → 400，`FORBIDDEN` → 403，`METHOD_NOT_ALLOWED` → 405，`PRESET_NOT_APPLIED` → 409，`STALE_DEFINITION` → 409，其余 → 500。

## 并发写保护

列表返回每个定义的 `mtimeMs`；保存时客户端把它带回来，Host 在写入前比对：

- 一致 → 正常写入，返回新的 `mtimeMs`；
- 不一致 → `STALE_DEFINITION`（409），客户端保留表单内容并提供「读取最新版（保留我的修改）」。

只比对「同一作用域」的文件；换作用域时写的是另一个目录，不做这项检查。

## 存储

| 内容 | 位置 |
| --- | --- |
| 定义 | `~/.dsh/agents/`、`<cwd>/.dsh/agents/` |
| 策略 | `~/.dsh/agent-manager/projects.json`（按项目 key 存 `enabled` / `disabled` / `trustProject`） |
| 知识卡 | `~/.dsh/agent-manager/knowledge/<agent>/<card>.md` |
| 风格库 | `~/.dsh/agent-manager/styles/` |

项目级定义默认停用：`effectiveEnabled` 的判定顺序是「显式停用 > 显式启用 > 项目级默认停用 > 用户级默认启用」。

## 模板与种子

- `templates/*.json`：12 份模板，`modules` 声明它需要哪些编辑器页面（例如不含 `style` 的模板在高级页不显示「默认风格」）。
- `seeds/`：模板附带的种子知识卡；从模板新建时铺卡，已有同名卡不覆盖，并在定义里记录衍生来源。
- 领域卡取该组 `ids` 顺序里的第一份可用模板，卡面写明「从哪份开始 · 共几个」。

## 前端

`client.js` 手写纯 JS（无打包步骤），只 `require('react')` / `require('react-dom')`，通过 `window.__ModuleLoader__.load({ id, factory })` 挂载。

- 单一 `screen` 状态：`home | detail | edit | templates`，返回链只有一条。
- 草稿由面板持有，表单受控；脏 = 「当前草稿 vs 基线快照」，换目标前统一确认。
- 就地覆盖层约定：任何弹层挂 `data-am-layer`，并把「是否脏」登记到模块级 `AM_LAYER`；内层在捕获阶段消费 Esc 并置 `escaped`，面板据此让位（内层关闭后 React 可能同步重渲染，只查 DOM 会漏）。
- 卡片网格 roving tabindex：整网格一个 Tab 站位，方向键按真实网格列数与分组边界移动。
- 主题 token 集中在 `TOKEN_CSS`：`--am-surface* / --am-ink / --am-muted / --am-accent / --am-hairline / --am-serif / --am-sans`，暗色由 `[data-am-root][data-am-dark="true"]` 覆盖。

## 已知边界

- 面板宽度自适应 420–1180px；窄栏下卡片单列、编辑器 rail 折到顶部。
- 弹层 `z-index: 60` 未与宿主浮层 token 对齐，宿主新增更高层浮层时需要复核。
- 覆盖层是 `position: fixed` 的整窗遮罩：真实面板比窗口窄时会盖住侧栏区域。
