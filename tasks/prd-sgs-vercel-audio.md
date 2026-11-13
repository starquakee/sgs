# PRD: SGS Vercel 声音与部署修复

## Introduction
2026-11-14用户批准修复 https://sgs.fengchenchen.top 的声音及其他实际问题，并选择域名首页进入已有暖棕定制点将台。每次commit后立即发布到显式sgs/main，核验后再处理下一项。诊断确认线上首页是原生无名杀，/sgs.html和三份音频清单均404；本地450条录音共28,381,860字节完整，校验/静默解码和264项Node测试通过。

## References
- AGENTS.md、tasks/prd-sgs-table-presence.md及此前四轮PRD；archive/2026-11-14-sgs-table-presence保留已完成牌桌运行。
- 本地ed60f51、上次发布e7d6bd7、远端新增13b5677/c03356a/a456483；锁定上游7fcf23ed54d8a7ce2b49ae2c15a054123891a52a。
- scripts/sgs/build.mjs、create-github-snapshot.mjs；apps/core/scripts/build.ts、noname/init/browser.js、sgs/runtime.js及音频模块。
- https://vercel.com/docs/project-configuration/vercel-json 。

## Decisions
- 分支codex/sgs-vercel-audio；同步远端改动而保留本地历史，发布快照父提交跟随已核对的sgs/main。
- Vercel从仓库根使用Node22、pnpm和SGS专用构建，输出dist-sgs。仅首页临时重定向/sgs.html；保留index.html及?sgs=1，禁止所有URL回退到HTML。
- 只发布现有160卡牌、276精选武将、14受击录音和原清单/署名；不新增素材。有效装备、未收录武将及音乐继续静音。
- 核心保留模块合并和Vue打包，关闭破坏原生源码编译回调的minify；独立包保持minify:false和external:[noname]。
- 每轮一个故事，父会话拥有真实浏览器验收/passflag/commit/push。每次commit（包括本轮设置）立即生成受限快照并正常推送，核验后再继续。
- 调试始终静音，音频用静默解码、原生事件回归、mock解锁和线上字节验证；不强制改变用户偏好，不伪造牌局。
- 旧MAT-07、UX-09、US-006保持原状态，无新玩法/武将/规则重写/界面重设计。

## Goals
域名可打开完整大厅和三种原生玩法，已打包声音可同源加载；声音失败后可重新启用；构建后原生投降回调保持语义；静态降级不破坏正常文件接口。

## Non-Goals
不扩展音频覆盖、音乐、账号、联机、存档、网络服务或官方全量核验，不启用上游网络文件服务器。

## User Stories

### VCL-01: 保留原生回调语义的生产构建
- 实际核心投降回调和原生StepParser先复现压缩别名错误；仅buildSelf恢复minify:false，保留模块合并与Vue打包。
- 从实际生成chunk提取两个投降回调，真实StepParser编译后日志/提示/死亡路径正常；禁止只检查源码字符串。
- 完整Node回归、修改JS/TS检查和Node22/pnpm构建通过；父会话静音验证本地产物大厅/开局/原生投降；单独commit/push后核对线上产物。

### VCL-02: 完整SGS静态部署和音频资源
- 根Vercel配置固定Node22/pnpm安装、SGS构建和dist-sgs；仅/临时跳转/sgs.html，保留原生入口及静态资源404语义。
- 可重复产物/HTTP校验检查大厅、入口、名册、画像索引、三个音频清单、450录音的状态/内容类型/大小/SHA-256，缺项及HTML伪装资源必须失败。
- 采用无本地文件API的只读loopback8083静态预览验证降级。
- 全部回归、生产构建、450条静默解码及父会话静音大厅/开局通过；单独commit/push后自定义域名首页/大厅/清单/450音频通过HTTP和浏览器冒烟。

### VCL-03: 设备失败后可重新开启声音
- 真实顶部处理器先复现blocked后设置静音、顶部无法开启；disabled优先写入sound:true，enabled+blocked才只重试unlock。
- 覆盖鼠标/键盘解锁不得随后误静音、普通开关、失败、mute/dispose无迟到播放；有效装备排除、独立通道和三路音量保持。
- JS语法/专项/完整回归及构建通过；父会话保持静音检查按钮与设置状态一致、选择保留和返回再开局；单独commit/push和部署核验。

### VCL-04: 恢复文件句柄契约
- 保留OfflineAdapter，恢复write/truncate的this.path及assertWritable的assertOpen，仅修远端补丁误改。
- 真实类回归覆盖合法write、truncate保留底层错误、关闭后拒绝操作，以及离线stat/list和拒绝写入。
- JS语法/专项/完整回归及构建通过；静态托管与本地预览分别验证启动；单独commit/push及线上核验。

### VCL-05: 三模式部署综合检查
- 域名实测大厅中文搜索/筛选/选将/技能；地主/农民/2v2/身份局开局、换牌、手动出牌/响应、设置返回、重开/回大厅，至少一局原生自然结算和记录。
- 1024x640、1280x720牌桌和390px大厅核心操作可达，不做额外设计重构。
- 实际后台隐藏后返回检查暂停/选择/局时，无法实测则保留pending，不能用模拟visibility事件替代。
- 检查console/network；新复现独立缺陷添加独立故事，验证commit/push后继续。最终全测试、构建、450音频线上核验、独立review及证据文档通过。

## Functional Requirements
- FR-1 原生规则、合法性、手动确认、AI、牌面、暂停所有权、可见性和持久化格式保持。
- FR-2 原录音、来源、有效类型过滤、8秒总超时、去重、取消/销毁和独立通道保持。
- FR-3 新子进程windowsHide，loopback8083，用户8081不动；不关闭沙箱，不用unsafe。
- FR-4 只正常push显式sgs/main；先查祖先，后查SHA及域名产物，回归用修正/回退提交，禁止origin/force。

## Validation
先失败复现，再专项和完整node --test --test-reporter=dot tests/sgs/*.test.mjs；修改JS用node --check；TS由真实Vite构建及相关编译测试验证；node scripts/sgs/build.mjs和node scripts/sgs/verify-card-audio.mjs。父会话CUA真实静音检查，证据写docs/sgs-vercel-validation.md和progress.txt。测试夹具不得进入dist-sgs。每次commit后立即生成受限快照/push，核验后再实施下一项。

## Risks / Open Questions
浏览器连接曾超时及报timeoutMs，必须恢复真实验收才可将UI故事标passing。Vercel异步部署须确认域名实际更新，push不等于上线。构建回归必须覆盖真实输出。产品范围均已确认，无待审批决策。
