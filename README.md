# dsh-toc-tail

对话目录尾栏（TOC Tail）：对话列右侧的轻量级对话目录。把你在对话中发出的**每条请求压缩为一条横线**，形成纵向时间轴，作为对话的空间索引与快速导航入口。

- 纯 client 插件，挂在 `shell.overlay`（frame-wide 浮层，默认 click-through，不遮挡对话内容）
- 双向同步：滚动对话时高亮视口内首条请求；点击横线平滑滚动到对应位置
- hover / focus 展开浮动面板：显示该条请求及其前后各一条的摘要
- 键盘可达：`Tab` 聚焦横线、`Escape` 收起面板、`:focus-visible` 焦点环
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

对话列右缘会出现一列短横线（**≥3 条用户请求时**才显示，每条横线长度随该请求文本长度变化，右缘对齐、屏幕垂直居中）：

- **点击**横线 → 对话滚动到该请求所在行
- **悬停 / 聚焦**任意横线 → 横线消失，原位替换为贴边的圆角**目录面板**（列出全部请求），导航通过点击面板条目完成
- 当前视口所属段落（一条请求 + 其后的回答）以高亮横线标记（`aria-current`）
- 面板关闭：鼠标移开 / 焦点移出 / `Escape`

## 开发

```sh
npm run typecheck   # host + client 双 tsc program
npm run build       # tsc 产出 lib/types，tsdown 产出 lib/index.js + lib/client.js
npm test            # vitest（jsdom + @testing-library/react）
npm run verify      # 以上全部
```

### 构建产物契约

- `lib/index.js` — host 半（空 `apply`，仅让 Loader 识别插件）
- `lib/client.js` — client bundle：`window.__ModuleLoader__.load({ id, factory })` 闭包工厂，CJS，带 sourcemap；externals 仅平台模块表（react、cordis、ui-slots 等）+ `@deepseek-ai/dsh-client-runtime/client` 临时豁免
- `lib/types/` — tsc 生成的类型声明

跨包协作只做 type-only import；任何 `@deepseek-ai/*` 值 import 都会在构建期被 client bundle purity gate 拒绝。

## 依赖

`@deepseek-ai/*` 均为 **type-only 开发依赖**（`devDependencies`）：构建期被类型擦除，`lib/client.js` 只外部化 `react` 平台模块。运行时由 DSH 宿主提供（`dsh-web-app` 的模块表 / Loader 注入），因此**不声明 `peerDependencies`**——独立 profile 的依赖树里没有这些共享包，声明 peer 会在 `dsh plugin add` 时产生误导性的 missing peer 警告。

| 包 | 用途 |
|---|---|
| `@deepseek-ai/dsh-client-runtime` | `SessionFace` / `ConversationSnapshot` / `useSessions` 类型 |
| `@deepseek-ai/dsh-client-ui-layout` | `shell.overlay` slot 声明（type-only） |
| `@deepseek-ai/dsh-client-ui-conversation` | `ChatNodeDataMap['user']` merge（type-only） |
| `@deepseek-ai/dsh-client-locale` | `ctx.locale` 字典注册类型 |
| `@deepseek-ai/dsh-client-ui-slots` | `PropsRuntime` / `InjectFace` / `PropsLocale` 类型 |
| `@deepseek-ai/cordis` | `Context` 类型 |

安装时若仍看到 `@univerjs/*`、`@xterm/*` 等 missing peer，那是 `dsh-web-app` 及 profile 内其他插件的既有状态，与本插件无关。
