# 实际回血音效

2026-11-14 用户要求使用桃回血时的回响声。适配层加入锁定上游原版回血录音，在桃或技能实际增加体力时播放一次；卡牌报音、武将台词和回血音效可以重叠。

录音原样取自 Noname / 无名杀提交 `7fcf23ed54d8a7ce2b49ae2c15a054123891a52a` 的 [`apps/core/audio/effect/recover.mp3`](https://raw.githubusercontent.com/libnoname/noname/7fcf23ed54d8a7ce2b49ae2c15a054123891a52a/apps/core/audio/effect/recover.mp3)。保留上游署名及 [GPL-3.0](https://github.com/libnoname/noname/blob/7fcf23ed54d8a7ce2b49ae2c15a054123891a52a/LICENSE)，不主张录音原创或另行授权；没有合成、重采样或添加回响处理。

| 项目 | 值 |
| --- | --- |
| 本地文件 | `apps/core/sgs/audio/effect/recover.mp3` |
| 大小 | 8,834 字节 |
| Git blob | `1472462d35dc98d4206e5fb33e13970283e2a92d` |
| SHA-256 | `aaa0b1f427b4671843098391369781742915bd289ab97023e182bc3d80386580` |
| 清单 | `apps/core/sgs/recovery-audio.json` |
| 重建 | `node scripts/sgs/prepare-recovery-audio.mjs` |

原生 `Content.recover` 在 `changeHp` 之前请求回血音效。适配层继续忽略这条提前的请求，通过原生 `onChangeHp` 内容开始处理器记录当时体力，再在 `Player.update` 的 `checkUpdate` 钩子核对实际增加量。该钩子发生在原生体力写入和上限截断之后、后继体力变化技能之前，且只接受直接父事件为同一角色 `recover` 的正数变化。这样既保留原生规则，也避免被阻止的回复、满血、零或负数变化误播，以及回血后被动失血导致的漏播。负体力回复同样按真实体力增加判断。

每个 `recover` 事件独立去重；选择或取消桃、普通体力设置、增加上限和其他角色的变化不能触发。声音共用现有 AudioContext、总开关和“战斗与操作音效”音量，直接播放，不排在台词后。下载及解码共用 8 秒期限，静音和销毁会取消待处理工作，迟到声音不补播；设备、清单或文件故障不会阻塞原生回血。清理只移除适配层拥有的钩子，已创建事件持有的旧处理器在销毁后也会失效。

原有 451 条录音未改变，加入本条后共 452 条、28,404,908 字节。测试执行锁定原生的 `recover` / `changeHp` 工厂与内容、`Player.update`、钩子分发和 `ArrayCompiler`，声音设备使用静默模拟；完整音频校验由 `node scripts/sgs/verify-card-audio.mjs` 静默解码。浏览器调试始终静音，实战和发布证据由父会话记录在 `docs/sgs-vercel-validation.md`。
