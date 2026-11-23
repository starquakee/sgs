# PRD: SGS 全量排查与逐项质量优化

## Introduction
2026-11-23 对 `codex/sgs-vercel-audio`（`HEAD = bd68e3c`，`sgs/main = f0f571e`）进行了大厅、战绩、结算、设置、牌桌运行时、选牌/拖牌/重铸、音频链路、暂停/异常上报及构建部署门禁全量审计。核实出 13 组可复现的真实缺陷，其中多项由近期提交 `bd68e3c` 引入并已上线（如暖纸悬停对比度低至 1.03:1、技能栏遮挡人类装备栏、身份局座次错误、加载前翻页归零/负数、全局按键劫持、bfcache 战绩按钮卡死、部署校验漏检生产包等）。本轮通过 Ralph 逐项闭环修复，每优化并验收一个问题立即提交并生成受限快照推送 `sgs/main`。

## References
- 根目录 `AGENTS.md`、前序六份 PRD 及 `archive/2026-11-23-sgs-vercel-audio/`（保留 `VCL-05`、`MAT-07`、`UX-09`、`US-006` 真实 pending 状态）。
- 锁定上游：`https://github.com/libnoname/noname@7fcf23ed54d8a7ce2b49ae2c15a054123891a52a`。
- 关键源码与脚本：`scripts/sgs/verify-deployment.mjs`、`scripts/sgs/build.mjs`、`scripts/sgs/create-github-snapshot.mjs`、`apps/core/sgs.html`、`apps/core/sgs/*`、`tests/sgs/*.test.mjs`。

## Decisions
- 分支：`codex/sgs-quality-audit`；每完成一个独立 Story，立即完成测试、Node 22/pnpm 生产构建、静音浏览器真实验收（UI 项）、`git commit`、`scripts/sgs/create-github-snapshot.mjs`、祖先核对、`git push sgs publish/sgs:main` 与线上核验。
- 严格使用本机 Node v22.12.0（`/mnt/c/Program Files/nodejs/node.exe`）与 `pnpm`；WSL 互操作必须关闭 stdin（`< /dev/null`）防挂起。
- 禁止向 `origin` 推送或强推；禁止修改上游规则、AI、牌面、音频、画像、许可证与锁文件；禁止开启浏览器声音调试；禁止伪造游戏状态或 `visibilityState`。
- `OPT-03` 将人类主动技能条 `.sgs-skill-control` 移至头像左侧原本预留给装备栏的 `--sgs-equip-w` 空置通道，避免与头像内中下部 `.equips`、手牌和主控制区冲突。

## Goals
修复全部已核实的 13 组高/中/低优先级功能、无障碍对比度、布局遮挡、状态同步、异常堆栈提取和构建部署门禁问题，使全量 Node 22 测试 100% 通过、生产核心包与静态资源 100% 纳入部署校验、桌面（1280×720 / 1024×640）与窄屏（390×844 / 540×800 / 640×720 / 860×640）体验稳定可读。

## Non-Goals
不实现新武将或新玩法，不修改原生规则或 AI 逻辑，不生成新美术/音频，不补造 `VCL-05` 真实后台隐藏证据（继续诚实保持归档状态），不启用服务端存档或联机。

## User Stories

### OPT-01: 修复部署校验漏检与跨平台 CRLF 测试失败
- `scripts/sgs/verify-deployment.mjs` 纳入全部实际发布的 `apps/core/sgs/*` 资产与生产根目录 Vite core chunks（`/runtime.js`、`/index2.js`、`/noname2.js`），校验 MIME、长度与 SHA-256。
- `tests/sgs/catalog.test.mjs` 规范化已检出文本的 `\r\n` -> `\n` 后进行严格内容比对，兼容 Windows `core.autocrlf=true`。
- 补充 `tests/sgs/deployment.test.mjs` 回归用例；Node 22 全量测试 0 失败、`build.mjs` 与 `verify-deployment.mjs` 通过。

### OPT-02: 修复暖纸点将台悬停与空态文字低对比度缺陷
- 清除 `apps/core/sgs/lobby.css:3` 全局 `#edcd90` 悬停污染，仅限定深色区域控件；为所有暖纸底面按钮/链接/空态文案提供高对比度深暖棕文字。
- 在 1280×720 与 390×844 静音浏览器中核验静止与悬停色彩及空搜索态可读性。

### OPT-03: 修复人类主动技能按钮遮挡下方装备栏
- 调整 `apps/core/sgs/table.css` 中 `.sgs-skill-control` 至人类头像左侧预留通道（`left: calc(100% + 10px)`、`width: calc(var(--sgs-equip-w) + 6px)`），确保与 `.equips`、`#me` 及 `#control` 零交集。
- 1280×720 与 1024×640 静音浏览器验证主动技能按钮与装备栏同时存在时均可独立点击且互不遮挡。

### OPT-04: 修复身份局座次编号错误
- 在 `apps/core/sgs/runtime.js` 使用独立可测辅助函数解析座次，身份局优先读取原生 `player.getSeatNum()`，缺失时按主公顺位安全计算，不再用相对位置 `dataset.position`。
- 补充 Node 单元测试并在 8 人身份局静音浏览器中核对主公标注“一号位”及顺位连续。

### OPT-05: 修复点将台加载前翻页异常与键盘快捷键劫持
- `sgs.html` 初始禁用 `#previous`/`#next`；`lobby.js` 对 `currentPage` 做 `Math.max(1, ...)` 下界钳位与 `!catalog` 保护。
- `onKeyDown` 过滤修饰键，先检查 `modalOpen()` 再处理 `Escape` 关闭 `#more-filters`，`PageUp`/`PageDown` 避让 `#skill-list`/`#battle-settings` 及窄屏页面滚动。
- 补充 `tests/sgs/lobby.test.mjs` 回归测试并静音浏览器验证。

### OPT-06: 修复 bfcache 后退导致战绩开局卡死、弹窗滚动残留与事件泄漏
- `lobby.js` 在 `restoreLobby()` 时关闭滞留 `records` 弹窗（或复位导航锁与列表），`showInfo()` 重置 `#dialog-content.scrollTop = 0`，`resize` 监听器具名并在 `leaveLobby()` 清理。
- 补充 `tests/sgs/lobby.test.mjs` 回归测试并静音浏览器验证。

### OPT-07: 修复点将台桌面双行高度溢出、随机点将滚动定位与 540px 列数错配
- 调整 `apps/core/sgs/lobby-layout.css` 桌面及矮屏垂直留白与卡片尺寸，保证 1280×720 与 1024×640（无论是否“隐藏老武将”）下 `#general-grid` 双行 8 卡完整展示不溢出。
- `#random-general` 切页后重置/对齐选中卡片滚动位置；`pageSize()` 改为 `innerWidth <= 540 ? 9 : 8`。
- 补充测试并在 1280×720、1024×640、540×800 静音浏览器验证。

### OPT-08: 修复战绩弹窗窄屏裁切与筛选芯片丢失键盘焦点
- 调整 `records-dialog.mjs` 与 `records.css`，避免汇总和筛选行在窄屏/矮屏挤光列表或裁切底部操作栏，并在筛选刷新时复用节点或保留键盘焦点。
- 补充 `tests/sgs/battle-records.test.mjs` 测试并在 390×667、640×420、1280×720 静音浏览器验证。

### OPT-09: 修复“收藏/最近”切回污染版本范围及缺失势力译名
- 切入收藏/最近浏览时保存原 `#version`（或仅在列表计算时放宽版本过滤），切回“点将台”恢复用户原始版本选择且不残留多余筛选标签；为 `factionNames` 补齐 `western: '西'`、`devil: '魔'`。
- 补充 `tests/sgs/lobby.test.mjs` 回归测试并静音浏览器验证。

### OPT-10: 修复紧凑桌面公共状态标签、目标提示溢出与窄屏队友手牌失效规则
- 修复 `table-reference.css` 在 1024×640 斗地主/7-8 人局 `.sgs-public-states` 压住身份或侵入装备区的问题。
- 修复 `table.css` 7/8 人局 `.sgs-target-hint` 横向溢出与 `@media(max-width:650px)` 队友手牌重排被后文覆盖的问题。
- 1024×640 斗地主/8 人局及 640×720 2v2 静音浏览器验证。

### OPT-11: 修复拖牌指示线缩放偏移与拖牌高亮阴影失效
- `card-drag.mjs` 将指示线挂载至 `document.documentElement`（回退 `document.body`），避免 `body` `transform: scale(zoom)` 导致固定坐标偏移；`table.css` 提升并后置 `[data-sgs-dragging='true']` 样式使其高亮阴影生效。
- 补充 `tests/sgs/card-selection.test.mjs` 回归并在 1280×720 与 860×640 静音浏览器验证。

### OPT-12: 修复牌桌说明按钮暂停态卡死与载入失败页无限转圈
- `table-actions.mjs` 每次 `refresh()` 均同步 `generalEntries` / `cardEntries` 的 `disabled = !!_status.paused2`。
- `loading.mjs` 在 `fail()` 设 `root.dataset.state = 'failed'`，`loading.css` 停止失败态转圈动画。
- 补充 `tests/sgs/table-actions.test.mjs` 与 `tests/sgs/loading.test.mjs` 回归并静音验证。

### OPT-13: 修复问题报告堆栈正则路径污染与生产包堆栈缺失
- 修复 `apps/core/sgs/problem-report.mjs` 堆栈提取逻辑：拒绝匹配外层工作区目录名 `sgs/`，去查询参数与 hash，并支持 Vite 生产根目录入口 chunk（`runtime.js`、`index2.js`、`noname2.js` 等）。
- 补充 `tests/sgs/problem-report.test.mjs` 回归测试并完成全量门禁。

## Functional Requirements
- FR-1 保留原生规则、AI、手牌合法性、手动确认、暂停所有权及现有音频/画像/许可证。
- FR-2 每项优化单独完成“复现 -> 修复 -> Node 22 全量回归 -> 正式构建 -> 静音浏览器验收（UI项） -> commit -> 受限快照 -> sgs/main 推送与核验”。
- FR-3 新子进程保持 `windowsHide: true`，静态预览仅用 `127.0.0.1:8083`，不得影响用户 `8081`。

## Validation
```bash
NODE22="/mnt/c/Program Files/nodejs/node.exe"
"$NODE22" --test --test-reporter=dot tests/sgs/*.test.mjs < /dev/null
"$NODE22" scripts/sgs/build.mjs < /dev/null
"$NODE22" scripts/sgs/verify-deployment.mjs < /dev/null
"$NODE22" scripts/sgs/verify-card-audio.mjs < /dev/null
```
并由 `scripts/ralph/final-validation.sh` 作为全量完成门禁；UI 项须在 `127.0.0.1:8083` 静音浏览器中核验无意外 console 报错并留存截图。

## Risks / Open Questions
- Windows `pnpm` / Git 操作在 WSL 下须确保环境变量与 stdin 闭合（`< /dev/null`）。
- 线上 `https://sgs.fengchenchen.top` 受 Vercel 异步构建时间影响，推送后需核验 `sgs/main` SHA 及线上构建更新；如 CDN/构建存在延迟需在日志中准确说明实测结果。
