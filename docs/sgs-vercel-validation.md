# SGS Vercel 验证记录

## 2026-11-14 基线
- 用户确认域名https://sgs.fengchenchen.top及定制点将台首页，每次commit后立即push。
- 首页200且title无名杀；/sgs.html与三份/sgs/*-audio.json均404，server为Vercel。
- 本地ed60f51的264项Node测试、450条录音校验及ffmpeg静默解码通过，共28,381,860字节。
- 远端a456483较上次发布e7d6bd7新增三个托管提交，已审阅并纳入新分支，保留原始历史。
- 真实StepParser复现压缩投降回调的未定义别名；真实顶部声音处理器复现blocked后静音无法再启用；远端文件句柄三项回归已复现。
- 本轮尚无视觉验收。浏览器曾超时/报timeoutMs；HTTP与单元测试不替代真实实战。调试始终静音。

## 发布约束
每项验证后独立commit，立即生成受限快照并正常push显式sgs/main；先查祖先，后查远端SHA与域名部署。旧MAT-07、UX-09、US-006保持未完成。

## VCL-01 — 构建回调修复
Core minify:false retains bundling/Vue and independent-pack settings. Actual emitted local/online callbacks failed before fix (ReferenceError:c is not defined), then all3 mandatory StepParser integration checks passed;264 existing tests, syntax, Node22/pnpm production build and independent review pass. Parent IAB recovered after reconnect: canonical sound:false confirmed; actual1280x720 lobby, native2v2 start and AI Nanman response displayed. Native landlord ShenHuangzhong5HP started, toolbar native giveup during Zhanjue choice executed death and round1 defeat at00:42, saved real record and returned to functional lobby. Browser warning/error logs empty; all silent. Full-page lobby and surrender before/result screenshots retained. No injected game state, rule changes or new assets.
截图：screenshots/vercel/vcl01-lobby.jpg、vcl01-surrender-before.jpg、vcl01-surrender-result.jpg。真实投降属于规则结束验证，不宣称自然对局完成。

## VCL-02 — 完整静态部署（发布前）
VCL-02 local acceptance: pinned Node22/pnpm10.11.0 filtered frozen install completed in an isolated manifest/lockfile checkout with --ignore-scripts (4of6 workspaces; Electron/server not installed). Full production build passed emitted-callback3 and source-pinned2953asset gates (450audio28,381,860bytes and2491portraits). Full269Node tests,5focused deployment tests,450silentdecodes and independent review passed. Existing production failed the new verifier at root200 vs307 as expected. Parent replaced only identified local SGS preview with hidden static-only127.0.0.1:8083; complete HTTP2953asset/hash/MIME/404/root307 checks passed. Actual1280x720 browser root reached customlobby, nativeShenHuangzhong landlord opened with sound:false, manualstart/Zhanjuecancel/equipmentselect+confirm changed7to6hand and equippedZhugeLiannu, then returned to functional lobby. Console had only expected missing-file-service fallback warning, no runtime error. Screenshot vcl02-static-table.jpg. Live Vercel publication/HTTP/browser evidence remains pending, so passes=false.

## VCL-02 — 发布后验收
- 开发提交 `d5db020745cd9dbbf4fb9cc3a3def27e409cc618` 已发布为受限快照 `dc040343c36e18ee23b8058ceaed5e916dbac326`；`git ls-remote sgs refs/heads/main` 与域名 `/game/build-info.json` 均返回该快照。
- `node scripts/sgs/verify-deployment.mjs --url https://sgs.fengchenchen.top` 全部通过：2953项资源、450条录音（28,381,860字节）、2491张画像。包含首页307、原生入口、清单、逐文件MIME/大小/SHA-256及缺失资源404检查。
- 父会话实际1280×720浏览器从域名首页到定制大厅，画像和技能正常，打开设置、关闭声音、切换2v2并返回大厅均成功。截图 `screenshots/vercel/vcl02-live-lobby.jpg`。控制台只有预期的无本地文件服务降级警告，无运行时错误。
- 本故事要求的真实静态开局已在本地完成，线上大厅与资源冒烟完成。该域名首次进入原生牌局会要求接受GPLv3；本次已取消并提出操作确认，尚未将线上实战记为通过。在线三模式、自然结算等仍属于未通过的VCL-05。

## VCL-03 — 声音按钮本地验收
Parent Node22/pnpm production build passed native emitted callback3 and2953asset gates. Independent review and full286Node tests pass. Actual1280x720 static-only browser: native ShenHuangzhong landlord start, Zhanjue manual cancel, physical WuguFengdeng selection, settings open/close preserve that exact native selection and manual confirm; toolbar aria-pressed=false agrees with unchecked sound setting, volumes40/25/60 unchanged, audio stateuninitialized and played/effects0. Return confirmation to lobby preserved selected general/mode; fresh start reached opening mulligan with soundfalse and zero audio counts. Console contains only expected static-file-service fallback warnings, no runtime error. Screenshot vcl03-muted-settings-selection.jpg. No actual sound enabled; recovery/device paths validated with silent real-module mocks. Publication/deployment check remains pending.

### VCL-03 发布核验
VCL-03 source86f8ad31a7baf7380b39be7b2a2edd1a3231bae2 published as bounded snapshot21d082299fb8c07b8974c760d82b70a682f08417. Explicit sgs/main, Vercel success and live build-info exact SHA verified. Actual domain runtime.js (128734 normalizedbytes,sha2569771af45cd031147190c0301e2659332b35a43e8ea78541b5283b55c3bfebe68) and sgs/runtime.js both200 with JS MIME and exact validated local-build hash. Story passes; online gameplay remains unverified pending requested first-use GPL confirmation under VCL-05.

## VCL-04 — 文件句柄与两种启动路径
Parent Node22/pnpm production build passed native emitted callback3 and2953asset gates. Actual-class8 regressions and full294Node tests, syntax and independent review pass; production change exactly3lines. Actual1280x720 muted browser opened native landlord mulligan on static-only preview after rebuild; only expected no-file-service fallback warning. Restarted only verified agent node19484 (loopback127.0.0.1:8083) as hidden default preview node37496, leaving user8081 and unrelated QQ listener untouched. Default /checkFile?fileName=noname.js returned200 JSON{success:true,data:file}; native entry and lobby200; actual browser fresh start again reached landlord opening with soundfalse/uninitialized and zero voice/impact counters, no new warning/error. Screenshot vcl04-local-api-opening.jpg. Default preview remains loopback8083. Commit/publication and live deployment verification pending.

### VCL-04 发布与最终资源核验
VCL-04 source96d7349e710c5575b6cf359f2e74187f5dadee78 -> bounded snapshot291f35bd1af46869f40187299f0c480e5261b9b8. Explicit sgs/main, Vercel success and live build-info exact SHA verified. Final domain browser.js hashd85ce7e3ab4ba02baa94801a2d34aaf5b5e55039c50e8380d535c8da1bd40771 and runtime.js hash9771af45cd031147190c0301e2659332b35a43e8ea78541b5283b55c3bfebe68 match tested normalized local outputs with200/JS MIME. Final full live2953asset/450audio28,381,860byte/2491portrait integrity checker passes. Independent final review found no actionable issue in VCL01–04; no assets/rules/license/lockfile changed, no fixtures shipped, archivedMAT07UX09US006 remainfalse.

## VCL-05 — 已检查部分与未完成项
Partial VCL-05 only: actual custom-domain1280x720 lobby and390x844 CSS lobby checked; no horizontal overflow(document width375 within390), fixed startbutton162x50 stays at y784..834. Chinese search for ShenHuangzhong returned one exact entry; selecting and Limited filter preserve selected general, native2v2 config and fixed start control. Full skill dialog readable with reachable return, Escape closes. Screenshot vcl05-live-mobile-skills.jpg. Fresh domain first-use GPLv3 acceptance was canceled and action-time confirmation requested; no user answer received, so online three-mode gameplay/natural result remain unverified. Actual IAB tab switch left local test document.visibilityState=visible and its clock advanced02:34->03:49; this did NOT exercise real hidden behavior and is NOT a pause failure or hidden-page acceptance. No synthetic visibility event/game state injection used. Local test tabs closed, viewport override reset, all testing muted. VCL-05 remainsfalse; no claim of full run completion.

## VCL-05 — 获得确认后的线上实战（2026-11-14）

用户明确回复“同意接受并继续验收”。恢复页面时协议弹窗已消失，原生牌桌显示“离开页面后已暂停”；父会话手动继续后完成以下实际操作。域名构建标识为 `0d4cd702760b084b80cbdf8182ac708635ed4220`，Vercel 状态成功。全部操作均使用真实浏览器控件、原生规则和 AI，声音始终关闭，无牌局或可见性事件注入。

| 场景 | 实际证据 |
| --- | --- |
| 2v2 | 玩家四号位、一号位队友；五张起始牌换一手后仍为五张。两次手动选闪并确认，手牌依次5→4→3，体力保持3/4；没有闪后按提示取消，正常进入玩家回合。选中无中生有后设置往返保留选择，手动确定后5→6张。 |
| 原生自然结算 | 手动操作后开启原生托管，第三轮自然战斗失败，局时18:09；统计为伤害3、受伤5、摸牌13、出牌12、杀敌0。结算明确提示已保存，回大厅找到相同神黄忠/四号位/2v2/18分09秒记录。没有投降或修改终局。 |
| 斗地主·地主 | 神黄忠5/5体力、四张初始手牌；换牌仍四张，开始后跋扈及正常摸牌至七张。1024×640下选无中生有、设置往返、手动确认后7→8张。工具菜单确认重开后，同一武将与地主设置恢复为5/5、四张、换牌0次、声音关闭；返回大厅正常。 |
| 斗地主·农民 | 神黄忠4/4体力、四张初始手牌；换牌不改队友手牌。地主先手两次杀，手动闪后4→3张且体力保持4/4。玩家回合手动万箭齐发后5→4张，队友响应后预览从四行同步为三行。返回大厅正常。 |
| 八人身份局 | 主公神黄忠5/5，八个原生座位，其余身份仍隐藏。换牌四张不变；开始摸至六张，手动装备白银狮子后6→5张，原有的卢保留。1024×640下全部角色框在视口内。结束回合后AI接续，南蛮响应取消后玩家4/5体力，正常推进回下一轮玩家选择，手牌七张；返回大厅正常。 |
| 记录与日志 | 所有中途退出和重开的测试局均未生成败局；最后战绩仍只有上述自然结束的2v2。日志只有预期的静态文件服务降级警告，没有新运行时错误。 |

桌面实际 CSS 尺寸为1280×720与1024×640，已读取角色、工具栏与操作区域的边界；大厅390×844证据沿用上节。浏览器页面缩放比为1.4，视口覆盖值按实际 CSS 尺寸校准；完整浏览器截图保留工具生成的缩放与留白，没有裁图伪装尺寸。紧凑手牌重叠时通过露出的点数点击成功，未强制原生可选状态。

截图：`screenshots/vercel/vcl05-live-2v2-natural-result.jpg`、`vcl05-live-landlord-1024-settings.jpg`、`vcl05-live-farmer-selection.jpg`、`vcl05-live-identity-1024.jpg`。

### 仍待验证：受控的真实后台保留

本次恢复时出现原生后台暂停提示，证明曾发生真实后台暂停，但缺少该次隐藏前的选择与局时基线。随后保留选中的无中生有，使用浏览器可见性控制真正隐藏面板；页面仍报告 `visibilityState=visible`，局时从15:04推进到15:34，未触发后台暂停。此结果是测试环境没有产生所需隐藏状态，不是暂停功能失败；没有用合成事件替代验收。

因此 VCL-05 保持 `passes:false`，受控隐藏后的选择、局时和手动恢复仍为 pending。VCL-01–04 已通过；历史 MAT-07、UX-09、US-006 仍未完成。原294项回归、生产构建、450条静默解码、最终2953项线上资源校验及独立审查证据保持有效，本次未改代码或素材，未重复无必要的测试。测试已返回大厅并重置浏览器尺寸覆盖。

## VCL-06 — 开局换牌音效

静默复现真实原生gameDraw/replaceHandcards两次成功换牌无声音请求，新增回归先5pass/2fail；补齐成功完成后的独立通知及一条锁定上游effect/draw录音14214字节，原450条不变。303项完整测试、58项专项独立审查、451条静默解码、修改语法/diff检查通过。父Node22/pnpm正式构建通过实际投降回调3项和2955资源/451音频28396074字节/2491画像校验。父实际1280×720静音浏览器：地主5HP四张，连续换两次仍四张，开始后原生跋扈/摸牌至七张；2v2四号位五张换后仍五张，开始后一号位队友原生行动；八人身份四张换后仍四张、其他身份未暴露，开始与设置往返正常。声音false、context uninitialized、played/effects0；40/25/60音量未变，操作与受击音效标签可读，返回大厅正常，无console warning/error。截图vcl06-muted-mulligan.jpg/vcl06-muted-settings.jpg。真实声音未开启，播放由真实模块+模拟设备验证。代码/浏览器本地验收完成，独立发布及域名核验仍待完成；VCL05/07及历史未完成项保持false。

素材来源与字节校验见 `docs/sgs-opening-audio.md`。开局通知在实际原生换牌完成后发出，取消、开始、失败、普通摸牌、AI和装备不触发；资源/设备失败不会阻塞换牌。

### VCL-06 发布核验

VCL-06源提交bd2ffcabe7737725818ca83d9041f3b27600d5f1已立即发布为受限快照e6133fc5ee6609cbb910bbe452968d5de8d45941。sgs/main精确SHA与fce57d99祖先、Vercel成功、域名build-info精确SHA均核验。完整线上2955项资源/451录音28396074字节/2491画像及root307/原生入口/404/MIME/哈希通过，新增换牌清单与draw.mp3均包括在内。VCL-06通过；VCL-07此后才开始实现，VCL-05真实后台验收仍未完成。

## VCL-07 — 拖牌出牌本地验收

VCL-07使用独立8px鼠标拖动，保留enable_drag:false，复用真实原生card/target/Check/ok。直接开启原生drag已复现唯一目标反选和空白误提交；新路径仅普通实体单目标phase-use，复杂/技能/多牌/多目标/响应不接管。先22pass/3fail，修复后317项完整测试、39项专项及独立审查通过；审查另捕获并回归两个事件/选择所有权竞态。JS/CSS/diff检查通过。父最终Node22/pnpm构建通过原生回调3项与2956资源门禁，card-drag.mjs归一化10596字节SHA256 2b84282bb2c44a2f4f839f0a3570f2058176dff45558cc35c352c465f181200e，实际runtime.js139968字节SHA256 e622f26458d3614123f96541d91573c52154c635c521c41a96acf290ea8ae805。父最终真实静音浏览器1280×720：杀拖空白/自己均不出牌，普通取消/点击选牌+目标仍手动确定，设置往返保留；已选方块K杀拖到标乐进后6→5手牌，对方原生闪5→4。1024×640先点黑桃7杀再拖亮起的梅花3过河拆桥，原生直接换选并出牌5→4，对方弃牌4→3。公开记录逐项吻合；初始6张由陈珪营图原生转牌导致。多次空白放下不消耗，真实拖动中读到可见指示线，释放后line0；长线瞬时截图未捕获不作证据。帮助/记录可读可关闭，选择保留；声音false/uninitialized/played0/effects0，无warning/error。截图vcl07-drag-1024-log.jpg和vcl07-drag-help.jpg。返回大厅后浏览器连接暂时超时，用新页恢复，确认1280×720默认视口、原选神黄忠/隐藏老武将true/地主均恢复，旧测试页已关闭。原451音频/2491画像不变。发布及线上核验待完成，VCL07暂false，旧VCL05/MAT07/UX09/US006不变。

### VCL-07 发布核验

VCL-07源提交 `d78e854b048baf1fb40a464c921a1865fa746ffe` 已立即发布为受限快照 `0ddfeacd407420d3488330293f67ea008c666db6`。先核对远端 `e6133fc5` 为祖先，正常推送显式 sgs/main，随后核对远端精确SHA、Vercel成功及域名build-info一致。完整线上校验通过2956项资源、451条录音（28,396,074字节）、2491张画像及root307/原生入口/404/MIME/大小/哈希。线上 `/sgs/card-drag.mjs`（10596字节）与实际 `/runtime.js`（139968字节）的归一化SHA256分别为 `2b84282bb2c44a2f4f839f0a3570f2058176dff45558cc35c352c465f181200e` 和 `e622f26458d3614123f96541d91573c52154c635c521c41a96acf290ea8ae805`，均与已验收本地构建一致。最终独立发布范围审查无阻塞，LICENSE、规则、既有音频、画像及锁文件未改。VCL-07通过；VCL-05真实后台验收与历史MAT-07、UX-09、US-006继续未完成。整个调试过程保持静音。

## VCL-08 — 原生文字提示裁切，本地验收

2026-11-14用户截图中的技能为新杀神张辽“猝袭”（xianding:dc_shen_zhangliao / dccuxi）。父会话用真实农民局自然进入其他角色回合，1280×720复现：原生chooseToDiscard生成标题、说明、0/1三块caption；内容高145px，SGS外框被max-height限制为112px，最后caption到y495而可视底边仅y470。控制区从y480开始，故此截图的计数缺失来自容器裁切，非按钮重叠。源码中的原生margin/padding及绝对定位内层共同造成溢出。

仅修改SGS table.css：严格限定纯文字caption结构，内层改为自然流、统一间距、说明居中且平衡换行，提示框按内容伸展并受视口限制，由外层承担过长内容滚动。开局专有内容、富文本、卡牌选择和有额外节点的特殊技能图文不匹配。保留原生节点和全部回调，无JS、规则、素材或依赖修改。

真实静音验收：1280×720提示高104.6px，1024×640说明换两行后高124.2px；标题、说明和0/1、1/1的文字Range都完整落在提示边界内，稳定布局与单行按钮间隔10px。选牌/撤选使计数0/1↔1/1且不出牌；取消后四张手牌不变，AI正常推进。最终生产构建再次开局、换一手仍四张；选择红桃6乐不思蜀、设置往返保留1/1和手动确认，确认后4→3并进入原生夺锐后续。声音始终关，音量40/25/60未改，猝袭控制台warn/error为空。

特殊图文回归：真实神黄忠地主局用斩决、雷杀命中吴懿（4→3体力）触发裂穹，1280×720和1024×640的人体背景、四个原生部位与标题正常；力烽可选且仍需确认，取消后返回原生出牌。裂穹padding保持0，1024×640图面y80.4..406、控制区y416..466。开局换牌提示与按钮同样可读、可用。

独立审查及411条CSS规则/选择器解析通过；Node22/pnpm完整生产构建、实际投降回调3项、2956资源门禁通过（451音频28,396,074字节、2491画像）。这是纯CSS改动，未新增实现镜像测试或重复未变的317项逻辑测试。正式table.css归一化64957字节，SHA256 `82a670ed24f2e35ace7358d162654906df8a9934c2ab2bf2b8c5df52225fd5fe`。截图为vcl08-prompt-before.jpg、vcl08-prompt-1280.jpg、vcl08-prompt-1024.jpg及vcl08-lieqiong-1024.jpg；宽桌截图来自静态预览样式验收，窄桌及裂穹来自最终完整生产构建。

测试结束时浏览器连接曾超时，以新测试页恢复并关闭旧测试页，确认默认1280×720大厅保留原选神黄忠、地主和隐藏老武将设置。发布核验待完成，VCL-08暂false。另发现夺锐五个按钮换两行时遮住单句提示：HEAD固定位置仅预留60px，实际控制区114px；这是独立既有问题，留到本项发布后处理。VCL-05及历史MAT-07/UX-09/US-006不变。

### VCL-08 发布核验

源提交 `cc65ebcc2f3c6232df6db0a0925771a0aa33a1d4` 已立即发布为受限快照 `72760e391fe5cda2cf9dbaf3f27e5e097278ce63`。核对远端92289f2为祖先后正常推送显式sgs/main，并核对远端精确SHA、Vercel成功和域名build-info一致。线上 `/sgs/table.css` 返回200及text/css，归一化64957字节、SHA256 `82a670ed24f2e35ace7358d162654906df8a9934c2ab2bf2b8c5df52225fd5fe` 与已验收构建完全一致。其余产品代码与资源未改，本次线上只重复核对变更样式和版本；完整资源门禁为上述本地2956项。VCL-08通过，随后才开始VCL-09多行按钮遮挡修复。

## VCL-09 — 多行按钮遮挡，复现

真实猝袭手动弃牌后，进入原生夺锐废除装备栏选择，五个原生选项为武器、防具、防御马、攻击马、宝物。1280×720下控制区换为两行，高114px、y416..530；提示底边仍固定y470，被首行按钮盖住。独立源码审查确认HEAD原有位置只预留60px，与VCL-08内部文字排版无关。截图vcl09-controls-before.jpg。先完成VCL-08独立发布与域名核验，之后才开始此项实现；本项尚未通过。

### VCL-09 本地验收

新增适配层prompt-layout.mjs观察真实ui.control的CSS像素高度（offsetHeight），通过合并的动画帧写入arena自有变量，至少保留50px单行基线。仅普通纯文字提示使用额外高度调整bottom/max-height，绝对定位技能栏不计入；开局、富文本、卡牌选择和自定义图文不应用该偏移。重复通知不重复写样式，切换目标/解绑/离页/销毁会取消观察和待执行帧，迟到回调无效，清理只恢复自己拥有的属性。

8项观察器回归、15项专项、完整325项Node测试、修改JS语法、411条CSS规则/选择器解析及diff检查通过；独立审查无问题，另行通过13项相关测试。父Node22/pnpm正式构建通过实际原生投降回调3项及2957资源门禁（451音频28,396,074字节、2491画像）。没有改原生规则、AI、音频、画像、许可证或锁文件。

父真实静音浏览器验收：新杀神张辽农民，单行开局/猝袭的变量50px，0/1→1/1文字完整且仍需确认；手动弃藤甲4→3进入陆抗的原生夺锐五选项。1280×720时变量114px、提示底边406、按钮顶416；1024×640时提示底边342、按钮顶352，五按钮均为126×50且在视口内，两种尺寸间隔均10px。放大到1920×1080后五按钮恢复一行，变量回50px、间隔仍10px；再缩回1024×640自动恢复114px。手动点击第二行“宝物”，原生宝物栏标记已废除，陆抗5→4体力，AI正常继续。随后南蛮响应单行提示恢复50px和10px间隔，无残留偏移。

新开神黄忠地主局复查图文：1024×640下斩决后手动杀命中张邈（4→3体力）触发裂穹，人体背景、四个原生部位、标题和取消保持正常；图面仍y80.4..406、padding0，控制区y416..466，取消后返回原生出牌选择。两局控制台warn/error均为空，全程声音关闭。通过正常返回选将结束临时对局，恢复默认1280×720、原选神黄忠和地主，关闭测试页。

最终构建归一化指纹：table.css 65298字节 / SHA256 `aacd8aa0ce7a430ce9fa3f85717b16e7dae33927cbdeed1a8cb95ee5dbb53c95`；prompt-layout.mjs 2342字节 / `3efefcd8f4a3f5d5175fa534536d3fda788f0771a49334e26968eb6f396349f7`；实际runtime.js 142050字节 / `45b9a3f1013008710ecc4f2b39001bf3fac13f7367adfb8558ee3acb056dfbb7`。截图vcl09-controls-1280.jpg、vcl09-controls-1024.jpg、vcl09-count-1280.jpg及vcl09-lieqiong-1024.jpg。本地验收完成，独立提交/发布/域名核验待完成；VCL-09暂false，旧VCL-05/MAT-07/UX-09/US-006不变。

### VCL-09 发布核验

源提交 `871b586926060a13b91087eb29a5b0816ea3942b` 已立即发布为受限快照 `c48967b4b57f6828355c533e9d3d6628f9f1c429`。正常推送显式sgs/main前核对72760e3为祖先，之后核对远端精确SHA、Vercel成功及自定义域名build-info一致。完整线上2957项资源、451录音28,396,074字节、2491画像、root307/原生入口/缺项404/MIME/大小/哈希全部通过。线上table.css、prompt-layout.mjs和实际runtime.js均返回200与正确类型，归一化字节数/哈希逐项匹配上述最终生产构建。VCL-09通过；VCL-08已单独发布通过，VCL-05与历史MAT-07、UX-09、US-006仍未完成。本轮未开启声音，未改原生规则或素材。

## VCL-10 实际回血音效 — 本地验收 2026-11-14

用户要求桃的报音之外有回血声。真实原生recover/changeHp/Player.update/ArrayCompiler回归先2pass/2fail，复现2→3HP与-2→-1HP无声音。适配层保留原生提前请求的静音，在原生onChangeHp内容开始记录HP、首次同步checkUpdate后核对实际增加量，直接父recover和角色一致才即时播放；后续被动不污染判断，取消/零/负/满血/回放不误播。每个recover独立去重，钩子按拥有关系清理，音频失败不改变原生结算。

新增唯一上游原录音effect/recover.mp3，8834字节，Git blob 1472462d35dc98d4206e5fb33e13970283e2a92d，SHA256 aaa0b1f427b4671843098391369781742915bd289ab97023e182bc3d80386580。原451条不变，共452条28,404,908字节，统一context/静音/即时effect音量和8秒总期限。设置音量文案更新为“战斗与操作音效”。音乐本项尚未实现。

15项回血专项、341项完整Node测试、452条完整静默解码、修改JS语法/diff通过；独立83项组合审查无问题并验证原blob/解码。父Node22/pnpm正式构建通过实际投降回调3项及2960资源/2491画像门禁。构建所用pnpm因Windows沙箱读取用户目录受限，按现有权限流程提权完成，未关闭沙箱或启动可见窗口。

父实际1280×720静音浏览器：武皇甫嵩地主原生2/5HP四张，五次原生换牌仍四张，保留红桃7桃；开始后朝镇取得黑桃A闪电，HP2→3；跋扈/摸牌后八张。桃选择/撤销均保持3/5HP和八张；再次选择并开关设置，原选牌保留、仍需确定。手动确定后八→七张，HP3→4，公开记录同时包含朝镇回复与桃回复。声音false、AudioContext uninitialized、played/effects0；40/25/60音量不变，设置文案可读。console warn/error为空，正常返回点将台。截图vcl10-muted-settings.jpg及vcl10-recovery-log.jpg。没有注入状态、开启声音或声称真人听验；播放由真实模块+模拟设备验证。

最终构建归一化：recovery-audio.mjs 2251字节/SHA256 aa2ee00ecb7cc4bc83775021ff92cfff2d95a94e74fba6f054969baf4229d3af；实际runtime.js 144260字节/9131140a46d1be133bd2104a74260d79cf4245d22adb352ef90674ee77f49c25。发布与域名核验待完成，VCL-10暂false；VCL-05及历史MAT-07/UX-09/US-006未完成状态不变。

## VCL-10 published acceptance — 2026-11-14

VCL-10源提交0f2c55ada9303d90af22a0239fb083ecca1b27dd已独立发布为受限快照1638a04c9689c7a2c98810db396026d9a7c6cf38。正常推送显式sgs/main前核对bf94107为祖先，随后核对远端精确SHA、Vercel success及域名build-info一致。完整线上2960项资源/452录音28,404,908字节/2491画像/root307/原生入口/缺项404/MIME/大小/哈希全通过。实际runtime.js及recovery/card-audio/settings/loading模块均200/正确JS类型且归一化SHA256逐项匹配本地已验收构建。VCL-10通过，此后才开始VCL-11音乐实现；VCL-05及历史MAT-07/UX-09/US-006保持未完成。

## VCL-11 对局背景音乐 — 本地验收 2026-11-14

用户确认采用上游原版对局音乐。新增唯一music_default原录音3,543,457字节，Git blob eaccd4570b89a824cf5300e5d8601d605828c054，SHA256 5fcefad6d89c2471c2aae05735c7d0cf6faeba015c2679bc6060afb85f8fef9d，约3分41.466秒。原452条保持原字节，合计453条31,948,365字节。

音乐复用唯一解锁AudioContext、独立8秒loader和循环source/gain，默认musicVolume25%。暂停只停止自身并保存循环位置，不挂起语音context；总静音、音量0、隐藏、结算、异常、导航和销毁具有相应清理与迟到保护。失败后不随手势/轮询无限重试，明确开关声音可重试。原生music_off保留，正常人类选牌的paused不当成音乐暂停。只缓存一个曲目，约74.5MiB解码数据在结算/销毁时释放。

初始真实控制器关键3项红测均失败后修复；父偏好/大厅扩展先31pass/3fail后34/34通过，保留旧静音与40/25/60、音乐零值及缓存大厅带入下一局。另有真实原生Deferred回归先2项失败：resume2返回时paused2尚未异步清除，首版音乐要等700ms轮询才恢复。改为等待原生pause2完成后重读当前归属/paused2/disposed，两项转绿，不改原生gate/规则。最终360项完整Node测试、12项音乐/28项session、73项专项、453条静默解码、JS语法/diff通过；独立163项组合审查及生命周期复审无问题。

父Node22/pnpm正式构建通过实际投降回调3项与2963资源/2491画像门禁。最后仅README两处数量/四路文案在构建后同步到dist文档，产品JS未再修改。父真实浏览器：390×844大厅设置音乐25→15→0，关闭/刷新仍为0，再恢复25；三路40/25/60与sound:false不变。新开武皇甫嵩地主2/5HP四张，取消朝镇后原生摸至七张；选黑桃2藤甲并手动暂停，暂停内打开设置。1280×720和1024×640四路音量可读；1024设置框y16..624，完成按钮126×50、y549.2..599.2，内部滚动27.2px后底部选项完整可达。关闭设置仍保留外层暂停，手动继续后藤甲仍为原生selected，确定后七→六并进入装备栏。局时暂停前后均01:07。全程musicState:muted/musicPlaying:false、AudioContext uninitialized、played/effects0；console warn/error为空。

同配置重开成功回到2/5HP四张、0次换牌，新音量载荷0.25且仍静音。正常返回操作后浏览器调试连接短暂超时，以新测试页恢复，确认默认1280×720并恢复原选神黄忠/地主/隐藏老武将，清空临时搜索、关闭两张测试页，仅保留用户域名页。截图vcl11-settings-1280.jpg、vcl11-settings-1024.jpg、vcl11-settings-390.jpg。未开启声音或注入牌局/visibility；播放与真实原生暂停时序由静默设备回归验证，VCL-05真实后台证据继续pending。

最终归一化构建：music-audio.mjs 4594字节/SHA256 3016105601f23022865c452eab8134a0cd508988f0471e26ac52231da402a257；实际runtime.js 150837字节/479f6f5ae7a7787361c19ee14aad77d8c5cae346bd0f7e073dc45b88c9fd699f；settings.mjs 5180字节/1b089dde24ba81bb87a49d1a304813fc70f710405ec6b753b10f766f660a31ab。独立发布与线上核验待完成，VCL-11暂false；旧MAT-07、UX-09、US-006不变。

## VCL-11 published acceptance — 2026-11-14

VCL-11源提交f4cd38dae0e1f935f4218942cf848ed0aba03b19已独立发布为受限快照5a4dd0bd03955e68b001fdf4d2827b81986f6857。正常推送显式sgs/main前核对1638a04为祖先，随后核对远端精确SHA、Vercel success及域名build-info一致。完整线上2963项资源/453录音31,948,365字节/2491画像/root307/原生入口/缺项404/MIME/大小/哈希全部通过。实际runtime.js、music-audio/preferences/settings/pause/table-session模块均200/正确JS类型，归一化字节与SHA256逐项匹配最终本地构建。域名新测试页设置已显示独立背景音乐25%，原域名声音仍关闭，原三路100%保留；未更改在线偏好、未开局或开声。线上截图vcl11-live-settings.jpg已保存；浏览器连接/截图传输曾超时，不视为产品运行错误。最终独立范围审查确认仅新增recover与music_default两录音、原451未变；LICENSE、原生规则/AI、锁文件未改，无测试夹具进入生产。VCL-10/11均通过；VCL-05及历史MAT-07/UX-09/US-006仍未完成。

## VCL-12 自己回合装备名称亮度 — 本地验收 2026-11-14

用户反馈自己回合装备名发灰。真实静音神黄忠地主局手动装备丈八蛇矛后复现：arena为selecting tempnoe，装备根opacity1/filter none，name2颜色rgb(233,211,167)但opacity0.6；上游通用选择态规则使不可选装备文字变暗。

仅在SGS table.css增加4行，限定非回放选择态、自己座位的实际装备name2恢复opacity1，排除emptyequip和feichu；不改颜色、根节点、filter、布局、原生类或事件。独立审查无问题，412条CSS规则及选择器解析、diff检查、Node22/pnpm正式构建通过；构建内3项原生回调和2963资源门禁通过，453录音31,948,365字节/2491画像不变。纯CSS改动未新增镜像逻辑测试，未重复未变的360项逻辑测试。

父最终生产构建真实静音浏览器：1280x720神黄忠地主，手动装备藤甲7→6手牌，赤兔选/撤选保持6张，重新选并确定后6→5；出牌选择态藤甲和赤兔name2均opacity1、原色不变，空槽仍0.6。选择决斗未自动出牌，右键藤甲打开原生说明，点击说明外层关闭后决斗仍selected。1024x640下装备文字同样opacity1，原生装备栏可滚动（scrollTop53.6），决斗选择保留；撤选后仍5张。console warn/error为空，声音关，音量40/25/60/25未改。返回选将后恢复1280x720与原选神黄忠/地主/隐藏老武将，关闭临时测试页，未操作用户线上牌局。

截图vcl12-equipment-before.jpg、vcl12-equipment-1280.jpg、vcl12-equipment-1024.jpg及vcl12-equipment-1024-scroll.jpg。正式table.css归一化65533字节，SHA256 8c41e6f02c864347e295ae2d90dae6693ef2cff1ab6a3ab8d6984d08d7f0f0aa。待独立提交发布及域名核验；VCL-05与历史MAT-07/UX-09/US-006保持未完成。

## VCL-12 发布核验 — 2026-11-14

源提交83bd812f96176cd0090775e53dacddfc0ae7045a已发布为受限快照39372d3a6e991ce03e3197ce27fc7a285342e321。正常推送显式sgs/main前核对3ee236a为祖先，之后核对远端精确SHA、Vercel success及域名build-info一致。线上table.css返回200/text/css，归一化65533字节、SHA256 8c41e6f02c864347e295ae2d90dae6693ef2cff1ab6a3ab8d6984d08d7f0f0aa与最终已验收本地构建完全一致。本次产品变化仅4行CSS，完整2963资源门禁已在正式本地构建通过，线上仅复核变化样式与版本。VCL-12通过；VCL-05及历史MAT-07/UX-09/US-006保持未完成。

## VCL-13 技能候选头像与弹窗放大 — 本地验收 2026-11-14

用户截图中的提示为原生评鉴“请选择尝试发动的技能”。在真实sp2:xushao地主局复现同一chooseControl界面：原生forcebutton-auto内容宽400px，实际含边框/内边距429.6px，三个头像90×108，名字16px。选择技能使用下方原生按钮，头像用于原生介绍。

仅在table.css增加53行/6条样式：严格限定非开局选将、forcebutton-auto、纯标题+单组角色按钮的结构，排除卡牌与自定义直属节点。框宽620px并受两侧角色空间限制，头像128×168、名字20px、标题23px；内容自然撑高、必要时滚动，不使用scale放大点击区域。沿用现有控制区真实高度，使换行按钮上方保持10px间隔。下方126×50技能按钮、原生节点/事件/选择逻辑与美术资源不改。

父真实静音浏览器：1280×720和1024×640候选框均620×258.1，三个头像完整，框底到技能按钮顶均10px。右键华佗头像正常显示青囊/急救介绍，关闭后仍保持三项技能。选择武威正常关闭评鉴并得到原生技能按钮，继续进入原生addNewRow颜色/卡牌界面（新规则未匹配、translate none），取消后仍7手牌。1920×1080待原生resize稳定后，框仍620×258.1、全部头像128×168、间距10px。原生结束阶段弃牌7→5后再次触发评鉴；900×640下按钮实际换成两行114px，框564×258.1且y83.9..342，按钮顶352，三头像完整、间距仍10px。随后正常返回选将，恢复1280×720、神黄忠/地主/隐藏老武将，清空搜索并关闭测试页。用户线上牌局未操作，调试全程sound:false，40/25/60/25不变；console warn/error为空。

418条CSS规则/选择器解析、独立源码和具体diff审查、diff检查及Node22/pnpm正式构建通过。正式构建3项原生回调与2963项资源门禁通过，453录音31,948,365字节/2491画像不变。本项纯CSS，没有新增镜像逻辑测试或重复未变的360项逻辑测试；不将特殊图文的结构排除审查写成新一轮裂穹实战。浏览器加载的预览CSS与最终正式table.css归一化完全相同：69102字节，SHA256 800dd1990077ed1033d1903c5ae223045f77457850928022761a00f7d38adf74；最终runtime.js仍150837字节/479f6f5ae7a7787361c19ee14aad77d8c5cae346bd0f7e073dc45b88c9fd699f。

截图vcl13-skill-choice-before.jpg、vcl13-skill-choice-1280.jpg、vcl13-skill-choice-1024.jpg、vcl13-skill-choice-1920.jpg和vcl13-skill-choice-wrapped.jpg。独立提交发布及域名核验待完成；VCL-05及历史MAT-07/UX-09/US-006保持未完成。

## VCL-13 发布核验 — 2026-11-14

源提交8d50fc6e02d130ae57fc0ce22d6a0681f6e776a2已发布为受限快照177ae6b31a0b6a51c7439ba785389558742f1b8a。正常推送显式sgs/main前核对89412ea为祖先，之后核对远端精确SHA、Vercel success及自定义域名build-info一致。线上table.css返回200/text/css，归一化69102字节、SHA256 800dd1990077ed1033d1903c5ae223045f77457850928022761a00f7d38adf74与最终已验收本地构建完全一致。本次产品仅样式变化；2963资源门禁在正式本地构建通过，线上复核变化样式与版本。VCL-13通过；VCL-05和历史MAT-07/UX-09/US-006保持未完成。
