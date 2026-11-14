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
