# PRD: 三国杀单机版完整性与可靠性优化

## Introduction
执行用户2026-10-05确认的七故事计划。基线2d7477f，173项回归通过。目标是完整技能阅读、连续操作、声音故障隔离和可处理的局内异常，保持原生规则与AI。

## References
- 用户确认计划、根AGENTS.md、tasks/prd-sgs-decade.md。
- 前轮清单/进度/PRD完整归档于archive/2026-10-05-sgs-client-experience；UX-09仍false。更早archive/2026-10-04-sgs-decade/US-006仍false。
- scripts/sgs/build-lobby.mjs及catalog-source.mjs；apps/core/sgs/中的lobby、audio、pause、settings、runtime和table-reference模块。
- 锁定上游7fcf23ed54d8a7ce2b49ae2c15a054123891a52a：character/*/translate.js、library/poptip.js、util/error.ts。

## Decisions
- 当前分支codex/sgs-reliability。每次一个故事，父会话浏览器验收后标记并本地提交，不推送。
- UI保持深色铜金、朱红主操作及已有桌面分区；复用原生dialog和owned pause。主要按钮不小于126×50。
- 新技能阅读数据仅服务大厅，不改catalog版本/行为核验、pack:id、评分映射、规则或AI。
- 语音下载和解码共享8秒总超时；静音/离开/销毁取消待处理请求，迟到结果不补播。
- 手动下载版本化JSON问题报告；只在内存中生成，不自动上传。最多20条错误摘要、300条原生公开日志；禁止原生事件、牌堆、隐藏身份与手牌快照。
- 未处理的局内异常暂停并允许报告/重开/返回，不强行续算；已处理的声音失败不阻断牌局。提前退出不记败局。

## Goals
- 常用名单中60位武将的63项缺失初始技能正文能从锁定源码静态提取并阅读相关术语。
- 鼠标/键盘/中文输入和筛选操作保留正确焦点、滚动、选择与配置。
- 单个挂起声音不再永久阻断同类后续语音；报错不再只留下技术弹窗。
- 取得可复查的多模式、长局、反复操作和真实后台暂停证据。

## Non-Goals
不增加玩法/武将/存档续玩/生成美术/联机/远程发布；不改上游源文件、规则、AI、许可证和素材；不声称完成全量官方核验。不用模拟游戏替代真实模式验收。

## User Stories

### MAT-01: 技能说明提取
静态解析模板、get.poptip字符串/对象及上游固定数组map/join形式；在大厅名册生成带来源的初始说明和引用。
- 锁定并补齐当前63项缺失正文，保留源文件/行号/校验值；解析器不执行模块、getter或任意表达式。
- 同包优先，跨包只接受无歧义确切ID；同名不同版本、循环/缺失/不支持表达式有明确状态，禁止猜测。
- 构建可重复；catalog原始证据、行为状态和评分映射不变。
- Syntax/type checks and focused/full regression tests pass; parent browser confirms generated data loads without a regression.

### MAT-02: 完整阅读技能
大厅阅读初始规则全文与可展开的技能/卡牌/术语解释，保留段落、列表；实际变化说明仍在局内原生介绍中查看。
- 神黄忠裂穹含击伤四项和天冲细则；引用来源可查看，未解析内容不编造。
- 长文本/术语在1024×640和390px可阅读，不遮挡出战；键盘、Escape及展开收起可用。
- Syntax/type checks and focused/full regression tests pass; parent browser visual verification passes.

### MAT-03: 操作连续性
选择时保留列表卡片节点、焦点和滚动；筛选/排序/resize保留仍存在的焦点目标。
- 删除筛选标签聚焦相邻标签，最后一项删除后聚焦搜索；所选武将/配置不变。
- 中文组合输入期间不重绘结果，compositionend再搜索；不添加出牌快捷键。
- Mouse/keyboard/browser checks and focused/full regression tests pass.

### MAT-04: 音频故障隔离
8秒下载/解码总超时释放队列；取消请求并防止迟到重播。
- 永久挂起/404/解码失败/迟到/静音取消/销毁均有测试；后续同类恢复、跨类并行和即时受击保持。
- 录音字节、双语音队列、三路音量、去重及原生触发时机不变。
- Syntax checks, full audio/regression suite and parent real browser smoke pass.

### MAT-05: 本地问题报告
牌桌工具提供手动导出版本化JSON；异常界面在MAT-06接入同一报告能力。
- 含客户端/上游版本、模式、所选pack:id、当前操作提示、最近20条错误摘要与300条公开日志。
- 不自动上传或持久化，不序列化原生事件/隐藏身份/手牌/牌堆；过滤非公开原生错误调试文本。
- 导出失败留可读提示、可重试；正常打开/关闭保留暂停归属和选牌。
- Syntax/type checks, focused/full tests and browser download/visual verification pass.

### MAT-06: 局内异常处理
SGS局内接管脚本错误/未处理Promise，去重显示单一异常界面，独立持有暂停并禁用继续；提供报告/同配置重开/点将台。
- 不覆盖其他入口；清理恢复原处理器，无重复监听；已处理音频/导出失败非阻断。
- 嵌套暂停不泄漏，重复错误不重复弹窗/结算；提前退出不记胜负。
- 用隔离测试夹具验证故障，不注入真实牌局状态；syntax/full tests及浏览器验收通过。

### MAT-07: 稳定性验收
聚合测试、生产构建、真实多模式和长局验证，修复本轮可复现的适配层问题。
- 地主/农民/2v2/八人身份各至少完成一场原生对局；八人另持续运行至少30分钟。
- 弹窗反复20次、连续再战5次，无重复监听/UI/结算或持续增长的残留。
- 桌面1920×1080/1366×768/1280×720/1024×640及390px大厅/弹窗视觉检查；所有尺寸按实际CSS视口记录。
- 实际后台隐藏至少5秒；选择/牌局/局时保留，手动继续才推进；含嵌套暂停和偏好关闭。连接不支持则保持待验收，不改旧UX-09为通过。
- 全部回归、Node22/pnpm生产构建、console、截图及文档通过；US-006保持false。

## Functional Requirements
- FR-1: SGS适配层拥有呈现/偏好/异常UI，原生引擎拥有选牌、规则、AI及胜负。
- FR-2: 非资源任意脚本不得在提取期间执行。说明元数据和官方行为验证保持独立。
- FR-3: 所有监听、计时器、请求、URL和暂停令牌有明确清理路径。
- FR-4: 所有新子进程windowsHide；服务只绑定loopback；不使用unsafe或禁用沙箱。

## Validation
node --check针对修改JS；node --test --test-reporter=dot tests/sgs/*.test.mjs；node scripts/sgs/build.mjs。
父会话用配置CUA验证生产8083，用户8081页不操作。允许明确标注的独立故障夹具，不伪造原生实战。
每故事证据追加到docs/sgs-reliability-validation.md及progress.txt，UI/实战缺证据就保持passes=false。

## Risks / Stop Conditions
后台浏览器连接原先不可用，不把事件单测当真实隐藏验收；资源文本提取不等于官方规则一致；未知规则异常不可尝试续算。某故事连续失败时修复/缩小该故事，不跨越验证闸门或伪造通过。
