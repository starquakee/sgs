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
