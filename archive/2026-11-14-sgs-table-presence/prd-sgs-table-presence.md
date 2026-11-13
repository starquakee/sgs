# PRD: SGS 牌桌实战质感与缺陷修复

## Introduction
2026-11-07 用户反馈游戏美术、游玩感仍像原型，并要求找 bug 修复；明确优先人物、手牌、出牌反馈。用户要求每优化完一个独立问题都 commit/push，并要求调试期间保持静音。本轮基线 8cbfac3，247 项 Node 回归通过，工作区起始干净。

## References
- AGENTS.md；四轮原 PRD；archive/2026-11-07-sgs-warm-client-ui 保留上一轮全部已通过清单和后续进度。
- apps/core/sgs/{table.css,theme.css,battle-feedback.mjs,battle-feedback.css,lobby.js,preferences.mjs}。
- tests/sgs/{battle-feedback.test.mjs,lobby.test.mjs,preferences.test.mjs}，锁定原生 character/xianding/skill.js 的 new_dclieqiong 与 noname/library/element/content.ts 的 useCard/respond/damage。
- docs/screenshots/table-presence/lieqiong-before.jpg：真实地主神黄忠火杀命中后的原生裂穹，backgroundImage 内联存在但 computed 为 none。

## Decisions
- 分支 codex/sgs-table-presence；用现有暖棕龙纹、纸色阅读面板、44px 单顶栏及木质切角控制。改善人物/手牌层次和真实事件反馈，不改大厅设计。
- 原生引擎拥有规则、合法性、AI、出牌确认、卡牌节点与胜负；适配层只改善呈现及修复设置恢复。保持固定经典牌面内部布局、无限换牌、唯一目标预选/手动取消、铁索重铸与队友牌权限。
- 既有192×256画像与上游插图直接复用，不生成/下载新美术，不增包体，不修改素材/归属/评分/名册证据。
- 每个独立问题单独验证、提交，再用 create-github-snapshot.mjs 和显式 sgs remote 正常推送 main；每次核对远端祖先及发布后 SHA。禁止 origin 和 force。
- 先 dry-run，父会话监督一次一个故事。CLI 无浏览器时保持 passes=false；父会话用真实生产页面完成视觉和交互验收。
- 调试始终静音，包括返回大厅、刷新、再战及新测试页。音频逻辑仅静默回归；不为验证重新打开声音。
- 已确认优先牌桌；其他实现细节按下面约束执行。无必须等待的用户决策。

## Goals
- 已修改的静音/速度/分路音量不被历史缓存大厅覆盖。
- 原生技能的图文内容完整，紧凑八人桌的行动标记完整可读。
- 龙纹背景退居环境层，人物、手牌、确认按钮成为清楚的视线中心；同一套暖棕材质与细框层次。
- 出牌/响应/真实受击有短、明确且不阻塞的反馈，静音时仍清楚。

## Non-Goals
不新增武将/玩法/AI/网络服务/主题切换/状态条/存档；不改锁定上游，不更改音频资产或触发；不推断隐藏身份/手牌。旧 MAT-07、UX-09、US-006 保持未完成，本轮不承诺全量武将验证或30分钟多模式稳定性矩阵。

## User Stories

### BTL-01: 缓存大厅保留最新设置
玩家从牌桌返回历史缓存大厅后，下次开局应保留刚修改的静音、速度及三路音量。
- 在现有真实大厅事件处理器测试中先复现旧偏好重写，再修复；恢复时更新现有偏好/控件，不替换选将、筛选、焦点与滚动状态。
- 存储不可读或损坏时保留有效内存偏好，不因刷新默认重新打开声音；覆盖存储拒绝、未改变、再次开局载荷。
- JS syntax、专项和完整 Node 测试通过；父浏览器静音改设置、Back、再开局验证。真实 BFCache 命中与 pageshow 回归分别记录，不混同。

### BTL-02: 恢复原生技能插图
神黄忠裂穹应显示原生人体部位图，点击部位与图一致，文字/确认/取消可读可达。
- 修复通用 SGS 纸面 background shorthand 覆盖内联 backgroundImage/size/position 的问题；保留原生自定义图文和部位点击处理器，不编辑上游技能。
- 真实神黄忠伤害后打开裂穹，检查人体图、全部可选部位、手动确认与取消，1024×640/1280×720 无遮挡；同时检查普通文本技能弹窗和设置。
- CSS 解析、生产构建通过；保留前后截图和 computed 样式证据，不增加纯 CSS 镜像测试。

### BTL-03: 紧凑桌行动与目标标记
8人桌104px角色框也能完整显示行动中，不与姓名、身份、血量相撞。
- 修复 left/right 双边固定造成文字容器不足；使用有明确边界和位置的紧凑标签，适配3/4/8人桌；保持仅原生 currentPhase 驱动。
- 行动、合法目标、已选目标在框线和颜色上明确区分；不叠加新状态栏，不扩大合法范围，不自动确认。
- 1024×640 真实8身份行动者以及2v2选牌/取消/设置往返浏览器验证；减少动态保留静态提示。CSS解析、相关回归通过。

### BTL-04: 人物与手牌材质层次
保留暖棕风格，提升牌桌材质与人物/手牌视觉焦点，减少发白背景和遮脸装饰。
- 复用龙纹底图，控制中心对比和桌沿阴影；细木框、克制势力色、较窄姓名旗、清楚原生血量与手牌数；不放大或替换画像。
- 仅调整手牌根节点阴影/边缘/悬停，保持合法牌亮、非法牌暗、选中金框；不动牌面内部变换/花色/点数/遮牌。
- 保持原有座位/手牌/装备/按钮尺寸和点击流；126×50主操作、队友牌、复杂原生对话不遮挡。
- 真实3/4/8人桌在1024×640/1280×720/1920×1080视觉验收；至少一次选牌、换牌、重铸或复杂选择、设置往返；保存前后截图。CSS解析及生产构建通过。

### BTL-05: 原生已提交事件的短反馈
静音游玩时也能清楚看到谁已出牌或响应，以及真实受击发生在哪位角色。
- 通过独立静默全局技能监听原生 useCard1/respond；只对真实已提交 useCard/respond 的出牌者现有框层做240ms短反馈，独立去重/生命周期，不复用语音去重，不新增提示条/文字/伤害数。
- 选择/取消/弃牌/技能成本/回放/animate:false 不误触发；虚拟牌按有效卡牌；静音或 audio:false 不禁用视觉。
- 原生 damage 既有正伤害、受害者、最终属性、预防/取消/unreal/去重边界保持；火/雷可用不同短色闪，混合未知属性中性，不由杀推断命中。
- 减少动态立即取消闪动；销毁移除技能、hook、DOM、timer，迟到调用无效；不改变任何原生方法返回值/动作时机。
- 执行锁定 useCard/respond/damage 源码的回归通过，全部Node回归/JS/CSS解析/生产构建通过；父真实静音出牌、响应、受击、复杂选择、自然2v2结算验证，最终3/4/8布局、普通入口和console检查通过。

## Functional Requirements
- FR-1: 规则、信息可见性、pause ownership、手动确认及持久化ID格式不变。
- FR-2: 所有新增事件处理/计时器/样式只作用于 SGS；一次销毁彻底清理。
- FR-3: 子进程 windowsHide；Node22/pnpm；服务只绑定127.0.0.1，使用8083，不操作用户8081。
- FR-4: 每个问题有独立commit及远端发布记录；资料不记录隐藏身份、敌方手牌或牌堆快照。

## Validation
node --check 修改JS；用项目PostCSS解析修改CSS；node --test --test-reporter=dot tests/sgs/*.test.mjs；node scripts/sgs/build.mjs。父会话CUA操作生产 http://127.0.0.1:8083/sgs.html，实际CSS视口由页面核实，截图存 docs/screenshots/table-presence，证据写 docs/sgs-table-presence-validation.md。发布前工作树干净、源码与dist同步、无临时夹具/日志/缓存进入提交。每问题发布后用 git ls-remote sgs refs/heads/main 比对快照。

## Risks / Open Questions
原生绝对定位和特制技能弹窗可能被通用CSS误伤，检查具体真实场景；浏览器BFCache支持不稳定，分别记录真实Back与事件回归；短反馈必须从已提交事件获得，不能以动画throw推断。发现规则/信息边界回归即停止该故事、修复或回退该故事，不将缺失证据写成通过。所有旧未完事项保持原状。
