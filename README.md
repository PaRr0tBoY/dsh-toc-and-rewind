# dsh-toc-tail

对话目录尾栏（TOC Tail）+ 回溯：对话列右侧的轻量级对话目录。把你在对话中发出的**每条请求压缩为一条横线**，形成纵向时间轴；目录面板支持**一键回溯**到任意用户请求节点。

- client 半挂在 `shell.overlay`（frame-wide 浮层，默认 click-through，不遮挡对话内容）
- 双向同步：滚动对话时高亮视口内首条请求；点击横线平滑滚动到对应位置
- hover / focus 展开共享目录面板（圆角矩形、贴对话列右缘、与屏幕保持相同间隔）
- **回溯**：点击目录行进入确认菜单（恢复代码 / 总结多选 + 确定 / 取消），确定后由 host 半执行折叠
- 窄屏（对话列 < 640px）与无 chat view 时自动隐藏；尊重 `prefers-reduced-motion`
- zh / en 双语

## 安装

在 `$DSH_HOME/profiles/<profile>` 下通过 dsh CLI 安装（推荐使用包含构建产物的发布形态）：

```sh
dsh plugin --profile web add <本地路径或 tarball>
```

例如本地路径：

```sh
dsh plugin --profile web add /path/to/dsh-toc-tail
```

安装后重启目标 profile。可通过 `dsh --profile <profile> --dump-config` 确认配置树中出现 `dsh-toc-tail` 层。

> Git 分发：仓库未发布 npm 时，请把 `exports` 指向的完整 `lib/` 一并提交进 Git（本包没有 `prepare` 脚本，Git 获取的是源码而非构建产物）。

## 使用

对话列右缘会出现一列短横线（**≥3 条用户请求时**才显示，每条横线长度与该请求相对最长请求的比例一致，右缘对齐、屏幕垂直居中）：

- **点击**横线 → 对话滚动到该请求所在行
- **悬停 / 聚焦**任意横线 → 横线消失，原位替换为圆角**目录面板**（列出全部请求）
- 当前视口所属段落（一条请求 + 其后的回答）以高亮横线标记（`aria-current`）
- 面板关闭：鼠标移开 / 焦点移出 / `Escape`

### 回溯（rewind）

点击目录面板中的**任意一行** → 该行变为**确认菜单**：

- ☐ **恢复代码** — 把工作区代码恢复到该条请求开始时的快照状态
- ☐ **总结** — 用 LLM 总结该节点以下对话，把报告作为新上下文接在所选节点之后
- **[确定]** 执行回溯；**[取消]** 收起菜单（两个选项可多选，也可都不选）

执行语义（由 host 半 `/toc-rewind <seq> [code] [summary]` 完成）：

| 选择 | 行为 |
|---|---|
| 都不选 | 仅折叠：所选节点之后的对话从模型可见历史中折叠（保留一条回溯标记），继续对话从该节点之后开始 |
| 总结 | 折叠 + LLM 总结该节点以下内容，报告替换被折叠部分成为新上下文（**不**恢复代码） |
| 恢复代码 | 折叠 + 把工作区恢复到该节点时刻的快照（**不**总结） |
| 两者 | 折叠 + 总结 + 恢复代码 |

**机制说明**（与官方压缩同源的 `surfaceOp: replace` 折叠）：会话日志是 append-only，回溯不会物理删除任何历史；它把所选节点之后的**模型可见表面**替换为标记/总结，原始日志完整保留。代码快照由 host 半在每条 `user/message` 时自动捕获工作区（排除 `node_modules`、`.git`、`lib` 等），存储在宿主数据目录的 `toc-tail/snapshots/` 下。

## 开发

```sh
npm run typecheck   # host + client 双 tsc program
npm run build       # tsc 产出 lib/types（host/client 两个 program），tsdown 产出 lib/index.js + lib/client.js
npm test            # vitest（jsdom + @testing-library/react；host 半含 region/snapshot/command 单测）
npm run verify      # 以上全部
```

### 构建产物契约

- `lib/index.js` — host 半（rewind 引擎）：`/toc-rewind` 命令注册 + 工作区快照监听；仅外部化 `@deepseek-ai/dsh-llm`（运行时值依赖）
- `lib/client.js` — client bundle：`window.__ModuleLoader__.load({ id, factory })` 闭包工厂，CJS，带 sourcemap；externals 仅平台模块表（react、cordis、ui-slots 等）+ `@deepseek-ai/dsh-client-runtime/client` 临时豁免
- `lib/types/` — tsc 生成的类型声明

跨包协作只做 type-only import；任何 `@deepseek-ai/*` 值 import 都会在构建期被 client bundle purity gate 拒绝（host 半的 `@deepseek-ai/dsh-llm` 例外，作为运行时依赖保留）。

## 依赖

| 包 | 用途 | 位置 |
|---|---|---|
| `@deepseek-ai/dsh-llm` | host 半运行时：`createUserMessage` / `BlockAssembler`（LLM 总结） | `dependencies` |
| `@deepseek-ai/dsh-session` | `Session` / `SessionEventMap` 类型（rewind 区域选择、事件扩展） | `devDependencies`（type-only） |
| `@deepseek-ai/dsh-commands` / `dsh-agent` | `/toc-rewind` 命令与 `Agent` 类型 | `devDependencies`（type-only） |
| `@deepseek-ai/dsh-client-*` | client 半 slot / locale / 会话类型 | `devDependencies`（type-only） |
| `@deepseek-ai/cordis` | `Context` 类型 | `devDependencies`（type-only） |

client 半不声明 `peerDependencies`（运行时由 DSH 宿主提供，声明 peer 会产生误导性 missing peer 警告）；host 半只有一个真实运行时依赖 `@deepseek-ai/dsh-llm`，随包安装。安装时若仍看到 `@univerjs/*`、`@xterm/*` 等 missing peer，那是 `dsh-web-app` 及 profile 内其他插件的既有状态，与本插件无关。
