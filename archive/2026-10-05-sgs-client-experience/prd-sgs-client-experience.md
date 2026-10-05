# PRD: 三国杀单机版客户端体验升级

## Introduction
按用户2026-10-04确认计划，完善选将开局、局内操作、暂停设置、结算再战完整流程。视觉靠近十周年客户端；基础为c0fed42及69项回归。

## References
- 用户在计划阶段选择整套流程、接近十周年客户端、清楚且适度演出，明确不需要关闭页面后的续玩；随后明确要求实施全部计划。
- AGENTS.md、tasks/prd-sgs-decade.md；旧Ralph完整清单/进度保存在archive/2026-10-04-sgs-decade/，US-006仍false。
- apps/core/sgs/：runtime.js、lobby.js/css、table.css、card-selection.mjs、experience.mjs、card-audio.mjs。
- apps/core/noname/game/index.js：原生over、pause2/resume2、玩家stat；lib.onover；apps/core/noname/entry.ts现有SGS分支。
- tests/sgs/、docs/sgs-validation.md、scripts/sgs/build.mjs。

## Decisions
- 深色桌面、铜金轮廓、朱红主操作；紧凑客户端分区。保留现有画像/经典牌面，书法限标题，正文以可读为先，不引入大型前端框架或生成美术。
- 人类确认边界、卡牌合法性、真实技能、AI、三种模式全部保留。禁止用假规则、编造胜负/统计/演出来做展示。
- 模态暂停仅释放本界面拥有的原生pause2；后台暂停默认开启，返回手动继续，局时不计暂停。
- 音频三路音量默认保持原响度；共享解锁/静音，卡牌与武将独立并行，受击即时。
- 本地记录上限50、最近武将8；稳定pack:id，损坏/不可写存储可降级。
- 非布尔原生结算保持原意，未判定不可默认平局。退出不算失败。再战相同玩家配置、全新随机牌局。
- 本轮只本地提交，不推送。每轮一故事，CLI实现/测试后父会话浏览器验收，通过后标记及提交，再进入下一轮。

## Goals
- 桌面无需整页滚动即可选将、设定和出战。
- 牌局中可清楚了解当前操作、暂停、设置，并完成结算再战。
- 已确认的全部交互不回归，异常不留下不可操作的半加载画面。

## Non-Goals
- 不新增武将、AI重写、联机/账号/商城/奖励/段位、关闭后存档续玩、自动远程发布。
- 不承诺手机竖屏牌桌重构或官方全量行为核验。原US-006未完成。

## User Stories

### UX-01: 统一视觉基础
统一大厅、牌桌、弹窗的颜色、字号、按钮和焦点状态，采用深色牌桌、铜金边框、朱红主要操作。
- [x] 建立共享视觉变量并接入大厅与牌桌，正文可读、标题书法字体，保留画像与经典卡面
- [x] 保留主要按钮至少126×50及既有手牌可用性明暗；不实施后续故事的功能
- [x] New JavaScript syntax/type checks pass; focused meaningful tests pass
- [x] Real browser verification by desktop parent passes (CLI must leave pending if unavailable)

### UX-02: 重构对战大厅
模式选择、武将列表、技能详情分区，固定出战入口，添加最近使用武将。
- [x] 1024×640及更大桌面出战按钮无需整页滚动即可见；长技能独立滚动
- [x] 保留搜索、版本/势力/包筛选、收藏；最近使用8名按pack:id去重，确认开局才记录
- [x] 390px大厅无横向溢出，设置与出战入口可达
- [x] New JavaScript syntax/type checks pass; focused meaningful tests pass
- [x] Real browser verification by desktop parent passes (CLI must leave pending if unavailable)

### UX-03: 整理牌桌操作区
固定回合、原生操作提示、确认、手牌和装备位置，开放说明与对局记录入口。
- [x] 显示真实当前操作及已选数量，区分开局、出牌、响应、目标选择、弃牌与AI行动
- [x] 不重复或覆盖复杂技能的原生对话框，不泄露隐藏身份或敌方手牌
- [x] 保留直接换牌、唯一杀目标预选、手动确认、多选和队友手牌；提供明确的武将/卡牌说明与记录入口
- [x] New JavaScript syntax/type checks pass; focused meaningful tests pass
- [x] Real browser verification by desktop parent passes (CLI must leave pending if unavailable)

### UX-04: 暂停与便捷设置
提供暂停/继续、托管、设置；菜单及后台通过原生接口暂停，并记住偏好。
- [x] 用原生pause2/resume2及明确的暂停归属；设置、返回、重开弹窗暂停，关闭不丢失选择，不解除别的原生暂停
- [x] 后台自动暂停默认开启，可关闭；返回页面手动继续；局时扣除暂停
- [x] 统一设置包含原有AI速度、声音开关、后台暂停和减少动态效果；存储失败不阻断游玩
- [x] 为暂停归属/嵌套/时钟及安全偏好存储增加测试
- [x] New JavaScript syntax/type checks pass; focused meaningful tests pass
- [x] Real browser verification by desktop parent passes (CLI must leave pending if unavailable)

### UX-05: 声音与战斗反馈
提供三类独立音量并强化适度战斗反馈。
- [x] 音频控制器setVolume(channel,value)支持card/hero/effect，范围0..1，即刻影响已播放与后续源，默认响度不变
- [x] 保持卡牌/武将独立队列可重叠，受击即时，统一静音取消正在及等待声音
- [x] 当前行动角色、合法/选中目标、真实命中及阵亡短反馈150–300ms，不阻塞或伪造结算；减少动态效果可关闭
- [x] 原生音频回归与音量/静音并发回归通过
- [x] New JavaScript syntax/type checks pass; focused meaningful tests pass
- [x] Real browser verification by desktop parent passes (CLI must leave pending if unavailable)

### UX-06: 完善结算与再战
复用原生结算并提供同配置再战、返回、详情入口。
- [x] 通过lib.onover读取胜负/原生结果、武将身份、轮数、局时及原生stat统计；非布尔结果不默认平局
- [x] 只添加展示，不改各模式胜负；提供同配置再来一局、返回点将台、原生本局详情
- [x] 再战保持人类武将、模式、角色、速度但重新生成牌局；支持玩家阵亡后队伍获胜
- [x] 结算结果、原生统计与再战配置回归通过
- [x] New JavaScript syntax/type checks pass; focused meaningful tests pass
- [x] Real browser verification by desktop parent passes (CLI must leave pending if unavailable)

### UX-07: 本地战绩
保留最近50场真实完成对局并支持详情和复用配置。
- [x] 本地版本化存储，sessionId去重，每局只记录一次，提前离开不记失败
- [x] 大厅可打开战绩、真实空状态、查看详情、按相同配置新开局
- [x] 原收藏/静音/速度/武将ID兼容；损坏或不可写存储仍能游玩并提示未保存
- [x] 记录边界、去重、序列化、坏存储及配置复用测试通过
- [x] New JavaScript syntax/type checks pass; focused meaningful tests pass
- [x] Real browser verification by desktop parent passes (CLI must leave pending if unavailable)

### UX-08: 加载与异常处理
真实加载阶段、重复启动保护及资源/存储失败恢复。
- [x] 显示实际加载阶段而非伪造进度，重复启动只发起一次导航
- [x] 关键名册失败提供重试/返回；声音清单或文件失败允许静音进入并解释
- [x] 存储无法使用仍可用当前选择开局，明确提醒偏好/战绩未保存
- [x] 只扩展SGS入口异常分支，原普通入口不变；失败重试清理重复监听/UI
- [x] 为加载降级、关键失败与存储缺失开局增加有意义测试
- [x] New JavaScript syntax/type checks pass; focused meaningful tests pass
- [x] Real browser verification by desktop parent passes (CLI must leave pending if unavailable)

### UX-09: 整体验收
聚合回归、真实生产浏览器及文档收尾。
- [x] 全部既有69测试及新增测试通过，Node22/pnpm生产构建通过
- [x] 斗地主地主/农民、2v2、8人身份：出牌/响应/转化/多选/取消/队友死亡/托管/结果再战验证
- [x] 1920×1080、1366×768、1280×720、1024×640牌桌，390px大厅与设置无遮挡；保存关键截图
- [ ] 暂停AI、保持选择、后台回来手动继续、声音重叠/音量/静音、失败恢复及战绩真实验证
- [x] 说明/验证证据齐全，无阻断console错误；不把旧US-006标完成
- [x] New JavaScript syntax/type checks pass; focused meaningful tests pass
- [ ] Real browser verification by desktop parent passes (CLI must leave pending if unavailable)

2026-10-04：功能、144项测试、生产构建、转换画像与最终截图均完成；仅真实后台切换尚无可用浏览器连接验证。内置浏览器始终报告未隐藏，Edge扩展连接不可用。暂停归属/后台事件单元测试及其他实战场景通过，但不替代真实隐藏页面检查；UX-09仍保留passes=false。

## Functional Requirements
- FR-1: SGS adapter owns presentation/preferences; upstream owns rules, selection, AI and victory.
- FR-2: Visible information only; teammate hands still gated by native viewHandcard permission.
- FR-3: Every live handler/observer/hook cleans up on disposal; no duplicate modals or listeners after retry.
- FR-4: Local files and loopback-only services. Node22/pnpm; windowsHide for every launched child. No unsafe sandbox flags.

## Validation
- node --check for changed JS; node --test --test-reporter=dot tests/sgs/*.test.mjs (69 baseline).
- node scripts/sgs/build.mjs for production aggregate; focused intermediate static copy allowed when engine bundle unchanged.
- Browser use through desktop parent's configured CUA only. No injected game state; native exposed Control menu may construct explicitly documented test endgames.
- Browser references: production http://127.0.0.1:8083/sgs.html (dedicated agent tab6), dev8081 (user tab3 must not be operated).
- Required sizes1920x1080/1366x768/1280x720/1024x640, lobby/settings390px. Check pixels plus native interactions and console.
- Record results/screenshots in docs/sgs-client-experience-validation.md and progress.txt. UI pending means passes=false.

## Risks / Stop Conditions
- Native complex selection, pause ownership and null end-results require source-backed tests.
- No looping past repeated failures, missing browser proof or rule regressions. Parent resolves Windows build/Git escalation; do not weaken sandbox.
- Never mark original official coverage complete. Never push original promisor history or upstream origin.
