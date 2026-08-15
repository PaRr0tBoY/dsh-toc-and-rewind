# dsh-toc-tail

DeepSeek Harness Web 界面的对话目录尾栏插件。对话列右侧的纵向时间轴把每条用户请求压缩成一条横线；目录面板支持一键回溯到任意用户请求，把该消息撤回输入框。

<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="dsh-toc-tail：每条用户请求一条横线，可任意回溯并撤回输入框">
</p>

## 截图

横线列：每条用户请求一条横线，长度按消息长度比例缩放。

<p align="center">
  <img src="./assets/readme/screenshot-rail.png" width="100%" alt="对话列右侧的横线目录列">
</p>

悬停或聚焦某条横线，展开目录面板，列出每条请求的摘要。

<p align="center">
  <img src="./assets/readme/screenshot-directory.png" width="100%" alt="悬停展开的目录面板，列出所有用户请求">
</p>

每行带回溯按钮，点击打开确认菜单：可多选「恢复代码」和/或「总结」，再确认。

<p align="center">
  <img src="./assets/readme/screenshot-rewind.png" width="100%" alt="回溯确认菜单，含恢复代码与总结选项">
</p>

## 这是什么

面向长对话的轻量对话目录。每条用户请求压缩成一条横向 tick；tick 长度按消息长度缩放，最长的那条请求定义比例。悬停或聚焦某条 tick，展开一个圆角目录面板，列出每条请求的摘要和回溯按钮。

## 为什么好用

- **横线长度 ∝ 消息长度**：最长请求得到最宽的横线，其余横线按长度比例缩放，整列就像对话的地图。
- **段落级高亮**：视口内段落对应的请求 tick 保持高亮；AI 回答会保持其请求的 tick 高亮，直到下一条用户请求滚动进视口。
- **主题自动跟随**：横线、目录和回溯卡片使用 Harness 投影的主题 token（`--dsw-*`），切换深浅色主题时整体即时变色。

## 回溯

回溯到某条用户请求，等于把这条消息撤回：消息原文自动回填到输入框，对话折叠到上一条请求的 AI 回复为止。所选消息及其之后的所有内容都会被折叠。

- **不选任何选项**：仅折叠到所选位置。
- **总结**：被折叠的部分由模型总结，总结报告作为新的上下文替换折叠区域。
- **恢复代码**：工作区文件恢复到该请求时刻的快照（快照在每条用户请求发出前自动记录）。

被折叠的对话会在网页中消失，折叠标记卡片显示总结（或折叠提示）和折叠的消息条数。

## 安装或更新

从 npm 安装：

```sh
dsh plugin --profile web add dsh-toc-tail
```

或从 GitHub 发布包安装：

```sh
dsh plugin --profile web add https://github.com/PaRr0tBoY/dsh-toc-tail/archive/refs/tags/v0.1.0.tar.gz
```

更新已安装版本时使用同样的命令。安装完成后重启 `dsh web`，让 Host 与浏览器端加载新版本。

## 行为说明

- 对话中的用户请求超过两条（≥3 条）时才显示横线列。
- 横线列相对视口垂直居中，贴在对话列右侧，保留屏幕的微小边缘间隔。
- 被回溯的请求会失去 tick，其消息行也会被隐藏。
- 点击行内摘要区域跳转到该消息位置；点击回溯按钮打开确认菜单。

## 开发

```sh
pnpm install
pnpm run verify
```

开发环境通过 peer dependencies 引用 Harness 源码。`lib/` 下的构建产物已提交，profile 安装无需执行构建脚本。

## License

MIT
