# 开局换牌音效

2026-11-14 用户要求补齐换牌声音。三种单机模式只在人类选择“换一手”且原生 `replaceHandcards` 完成后播放一次短音效；开始对局、拒绝换牌、AI 发牌、普通摸牌和装备使用不会进入此路径。

录音原样取自 Noname / 无名杀锁定提交 `7fcf23ed54d8a7ce2b49ae2c15a054123891a52a` 的 [`apps/core/audio/effect/draw.mp3`](https://raw.githubusercontent.com/libnoname/noname/7fcf23ed54d8a7ce2b49ae2c15a054123891a52a/apps/core/audio/effect/draw.mp3)，保留 [GPL-3.0](https://github.com/libnoname/noname/blob/7fcf23ed54d8a7ce2b49ae2c15a054123891a52a/LICENSE) 与上游署名，不主张录音原创或另行授权。

| 项目 | 值 |
| --- | --- |
| 本地文件 | `apps/core/sgs/audio/effect/draw.mp3` |
| 大小 | 14,214 字节 |
| Git blob | `62933c85ae728765d07dd08160fec2aa19655b10` |
| SHA-256 | `26a3838e743d3dd7b273dae63ffb8148e880af9707cc8a1714be098a6a7854e5` |
| 清单 | `apps/core/sgs/opening-audio.json` |
| 重建 | `node scripts/sgs/prepare-opening-audio.mjs` |

声音沿用同一个已解锁 AudioContext、总静音开关、8 秒加载/解码期限与“战斗与操作音效”音量，按换牌事件独立去重。静音或离开后取消待播声音，设备或资源失败不会阻塞原生换牌。已有 450 条卡牌、武将及受击录音未改动，加入本条时共 451 条、28,396,074 字节；之后另增加的回血音效见 `docs/sgs-recovery-audio.md`。

逻辑验证使用真实原生发牌/换牌函数和模拟声音设备，文件验证采用 SHA-256、Git blob 和静默解码；浏览器调试始终静音。实战与发布证据见 `docs/sgs-vercel-validation.md`。
