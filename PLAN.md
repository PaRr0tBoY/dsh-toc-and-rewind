# dsh-toc-tail 实施计划

对话窗口右侧的轻量级 **TOC Tail（对话目录尾栏）**：将用户在对话中发出的每条请求压缩为一条横线，形成纵向时间轴，作为对话的空间索引与快速导航入口。

- 包名 / bundle patch id：`dsh-toc-tail`
- 运行面：纯 client 插件（host 半为空 `apply`，仅用于让 Loader 识别）
- 验证深度：构建 + 单元测试 + 真实 profile 安装验证（用户已确认）

## 1. 取证结论（已完成）

### 1.1 运行面

纯 client 插件。host 半是空 `apply`（参照官方 `packages/client/ui-message-feedback/src/index.ts`），manifest 声明 `dsh.client.platform: "web"` 与 `dsh.client.inject`。

### 1.2 挂载点：`shell.overlay`

官方 slot 生态没有"对话列内部右侧"接缝，TOC Tail 是叠加在对话列上的浮层，使用 `ui-layout` 声明的 root-scope `list` slot：

```ts
'shell.overlay': { kind: 'list'; scope: 'root' }
```

语义（官方 `packages/client/ui-layout/src/client/index.ts` 注释）：

> "Frame-wide floating layer, above every column and outside their scroll containers… click-through — entries opt back into pointer events… additive seat"

- 默认 click-through → 不遮挡主对话内容
- list kind → 加性注册，不动其他 entry
- **不需要 body portal**

### 1.3 数据契约（官方 master @ 0.1.0-rc.5）

| 需求 | 契约 |
|---|---|
| 当前 session | `useSessions(s => s.current)`（overlay 是 root scope，无 `sessionId` prop） |
| 订阅会话快照 | `ctx.sessions.binding(id)?.session` = `SessionFace`（`ISession & ObservableSnapshot<ConversationSnapshot>`） |
| 用户消息 | ChatNode kind `'user'`（`UserMessageNode.content: ContentBlock[]`，text block 有 `text` 字段） |
| 摘要 | text blocks 拼接后截断（纯函数） |

### 1.4 DOM 契约（scroll 同步锚点）

- scrollport：`[data-conversation-scroll]`
- 消息 row：`data-chat-anchor-key` / `data-chat-flow-kind`（值为 node kind，`'user'`）
- chat view 存在性：`[data-chat-flow]`（非 chat view 时 TOC 自动隐藏）

### 1.5 构建契约

- client bundle：tsdown + banner/footer `window.__ModuleLoader__.load({ id, factory })`，CJS 格式，sourcemap
- externals = `PLATFORM_MODULES`（react、cordis、ui-slots、web-react、ui-primitives、…）+ `@deepseek-ai/dsh-client-runtime/client`（官方临时豁免）
- 其他 `@deepseek-ai/*` 值 import 会被 client bundle purity gate 拒绝 → 跨包只做 type-only import
- CSS Modules：构建期用 lightningcss 编译为 classMap，style 注入随 fiber dispose 清理

## 2. 设计

| 项 | 方案 |
|---|---|
| 包名 / patch id | `dsh-toc-tail` |
| 挂载 | `ctx.slots.inject('shell.overlay', …)` → `register({ name: 'shell.overlay', id: 'toc-tail', … })`，fixed 定位锚定 scrollport 右缘 |
| 数据 | per-session `TocController`（`Map<SessionId, TocController>`，ui-message-feedback 模式），懒创建 + `connection/reset` 时重同步 |
| 交互 | 横线列（每条 user 消息一根，active 高亮）→ hover/focus 展开浮动面板（该条 + 相邻前后条摘要）→ click `scrollport.scrollTo` 导航 |
| 双向同步 | scrollport `scroll`(passive) + `ResizeObserver` → 视口内首条 user row 为 active；点击导航反向 |
| 可访问性 | 横线 `tabIndex=0`、`aria-label`、`aria-current`、Escape 收起面板、`:focus-visible`、reduced motion |
| 自适应 | 窄屏（对话列 < ~640px）隐藏；非 chat view 自动隐藏；面板宽度受限、内部滚动 |
| 文案 | zh + en 双语 locale（官方 `locale.register` 模式） |

## 3. 文件清单

```
package.json / cordis.patch.yml / tsconfig.json
tsconfig.host.json / tsconfig.client.json    双 tsc program（host 排除 src/client）
tsdown.config.ts                             双 entry：lib/index.js(esm) + lib/client.js(cjs bundle)
src/index.ts                                 host 半空 apply
src/client/index.ts                          client 入口（inject: ['slots','sessions','locale']）
src/client/controller.ts                     TocController + 纯函数（摘要提取、active 计算）
src/client/TocTail.tsx / TocTail.module.css  组件与样式
src/client/locales.ts                        zh/en
src/client/*.test.ts(x)                      vitest + jsdom + @testing-library/react
README.md                                    安装与使用
```

## 4. 执行步骤

1. **骨架**：manifest（`dsh.client.platform: "web"`、`exports["./client"]`、peer deps `^0.1.0-rc.5`）、双 tsconfig、tsdown 配置、patch 层
2. **核心**：controller（快照订阅、user node 提取、摘要）、横线渲染、hover 面板、点击导航
3. **同步**：scrollport 监听 → active；click → scrollTo；view/窗口变化处理
4. **测试**：纯函数（摘要/active）、controller（订阅/重置）、组件（渲染/点击/dispose 清理）
5. **验证**：`tsc` 双 program → `tsdown` → `vitest` → 真实 scratch profile 安装 + `--dump-config` 断言 bundle 层 + headless 启动 smoke

## 5. 验证矩阵

```sh
npx tsc -p tsconfig.host.json --noEmit
npx tsc -p tsconfig.client.json --noEmit
npx tsdown --config tsdown.config.ts      # 产物 lib/index.js + lib/client.js + client.js.map
npx vitest run
# 真实组合（skill §8.2 / §8.4）
dsh plugin --profile <scratch> add <本地路径或 tarball>
dsh --profile <scratch> --dump-config     # 断言出现 dsh-toc-tail 行
dsh --profile headless "<小任务>"          # host 半加载不破坏启动
```

## 6. 风险与假设

- **依赖可用性**：`@deepseek-ai/*` 0.1.0-rc.5 可能未发布到 npm —— 若 `npm view` 为空，改用官方仓库 git 安装（§7.1 prepare/allowBuilds 模式）
- **jsdom 无真实布局**：几何相关测试用 stub `getBoundingClientRect` / `scrollTo`
- **GUI 视觉验证不在范围**（用户选择了不含 GUI）
- 不执行任何 commit / push / npm publish
