# 受击音效

2026-10-03：按用户要求加入实际命中后的声音，区分普通杀、酒杀及属性伤害。

| 最终伤害 | 1点 | 2点及以上 |
| --- | --- | --- |
| 普通 | `effect/damage` | `effect/damage2` |
| 火焰 | `effect/damage_fire` | `effect/damage_fire2` |
| 雷电 | `effect/damage_thunder` | `effect/damage_thunder2` |
| 冰冻 | `effect/damage_ice` | `effect/damage_ice2` |
| 护甲 | `effect/hujia_damage` | `effect/hujia_damage2` |
| 护甲承受火焰 | `effect/hujia_damage_fire` | `effect/hujia_damage_fire2` |
| 护甲承受雷电 | `effect/hujia_damage_thunder` | `effect/hujia_damage_thunder2` |

酒的原生加伤使普通杀通常造成2点伤害，使用重击文件；酒火杀、酒雷杀对应火焰/雷电重击。若实际伤害被减至1点，则使用1点音效。冰伤护甲及没有专门录音的属性按原生配置回退到普通声音，不改变任何伤害数值或规则。

14份原录音共294,843字节，全部来自无名杀锁定提交 `7fcf23ed54d8a7ce2b49ae2c15a054123891a52a`，原目录 `apps/core/audio/effect/`。适配目录只保存使用到的14份MP3；原URL、Git blob、SHA-256、字节数与说明见 `apps/core/sgs/damage-audio.json`。代码沿用GPL-3.0，素材保留上游来源，不主张适配者拥有录音著作权或另行授权。

原生 `Content.damage` 在伤害修改/预防之后选择音效路径，适配器只接收此时的正数真实damage事件，排除零伤、unreal和已取消事件。没有通过选牌、使用杀或手写扣血模拟命中；闪避不会进入受击播放，失去体力也不会混用受伤声音。每个受伤角色的damage事件各自去重，连环或多目标的不同事件不会被合并。

受击音效共用已有AudioContext和顶部“声音”开关，但直接从当前时间播放，不排在卡牌/武将台词后。首次用户点击后静默预加载14个小文件以减少首次命中延迟；预加载不播放音效。关闭声音会停止正在播放及待播放的全部声音，恢复后不补播静音期间的受击。

重建：`node scripts/sgs/prepare-damage-audio.mjs`。使用系统现有curl（Windows隐藏子进程窗口）以遵循本机HTTPS代理，按锁定URL读取并验证Git blob；常规构建和游玩不需要联网或curl。完整解码校验：`node scripts/sgs/verify-card-audio.mjs`，使用现有ffmpeg验证全部179条本地声音。

测试运行实际原生伤害结算步骤、酒技能的加伤函数和原生natureAudio配置，覆盖上述14个路径、酒杀2点与减伤1点、零/取消/虚拟伤害、闪避/失去体力、逐事件去重、多个受击目标、慢速武将录音不阻塞命中、预加载/解锁、静音和损坏文件不影响扣血。实战记录见 `sgs-validation.md`。
