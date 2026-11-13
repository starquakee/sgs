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
