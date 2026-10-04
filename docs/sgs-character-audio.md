# 近期武将语音

2026-10-04：根据用户后续要求，保留威董卓并增补八位2025—2026年上线的十周年武将。未收集标包、界限突破或同名OL/手游旧版本。筛选参考官网上新记录、SSS/限定定位和技能机制，并非声称存在适用于所有玩法的统一强度排名。

| 武将（准确源码ID） | 官网首次活动日期 | 录音数 | 字节数 |
| --- | --- | ---: | ---: |
| 威董卓 `v_dongzhuo` | [2025-04-04](https://x.sanguosha.com/news/20250402_8034_2010.html) | 5 | 407,236 |
| 神庞统 `shen_pangtong` | [2025-01-28](https://x.sanguosha.com/news/20250122_5601_2110.html) | 7 | 1,368,725 |
| 新杀谋荀彧 `dc_sb_xunyu` | [2025-05-01](https://x.sanguosha.com/news/20250428_6442_0316.html) | 10 | 738,632 |
| 神钟会 `shen_zhonghui` | [2025-07-12](https://x.sanguosha.com/news/20250709_1072_1917.html) | 7 | 2,663,382 |
| 新杀谋曹昂 `dc_sb_caoang` | [2025-08-24](https://x.sanguosha.com/news/20250820_6340_5315.html) | 5 | 274,564 |
| 新杀谋邓艾 `dc_sb_dengai` | [2025-09-06](https://x.sanguosha.com/news/20250904_3910_3309.html) | 5 | 313,142 |
| 新杀神孙权 `dc_shen_sunquan` | [2026-01-10](https://x.sanguosha.com/news/20260108_4235_1811.html) | 7 | 831,811 |
| 威公孙瓒 `v_gongsunzan` | [2026-04-04](https://x.sanguosha.com/news/20260402_4576_3310.html) | 5 | 337,696 |
| 威马腾 `v_mateng` | [2026-08-08](https://x.sanguosha.com/news/20260806_5173_3719.html) | 7 | 619,371 |

威董卓原有五条为397.69 KiB（0.39 MiB）。新增53条共7,147,323字节（6.82 MiB）；九位合计58条、7,554,559字节（7.20 MiB）。这里仅统计武将配音，未将已有卡牌与受击音效算作新增体积。

录音原样取自无名杀提交 `7fcf23ed54d8a7ce2b49ae2c15a054123891a52a`；台词来自同提交 `apps/core/character/xianding/voices.js`。录音存放在SGS适配目录，不恢复整棵上游音频目录。逐文件原始URL、Git blob、SHA-256、字节数、台词和版本范围保存在 `apps/core/sgs/character-audio.json`。引擎与适配代码沿用GPL-3.0；录音保留上游来源，不主张适配者拥有录音著作权或另行授权。

收集脚本解析实际武将技能、带声音的子技能和转换形态，调用锁定引擎的原生Audio解析类确定路径与台词。每个技能的两组默认台词、阵亡台词均包含；谋荀彧额外包含转换形态的四条技能台词和一条阵亡台词。`kunyu_debuff`、`dclinjie_effect`、`dccangming_draw`、`dcsbshimou_change`等子技能沿用原生引用关系，不额外复制相同文件。

运行时按清单中的准确武将/技能ID调用原生 `trySkillAudio` / `tryDieAudio`，保留原生触发时机、直接/全局技能限制及随机变体。只在同步原生解析期间开启 `background_speak`，随后立即恢复；其他缺失声音保持静音。卡牌与武将共用AudioContext、缓存和声音开关，但各自使用独立队列及播放时间轴：卡牌报音和武将台词可以重叠，一类的加载/解码也不会挡住另一类。阵亡台词排入武将队列；每类内部保持原先的顺序。静音停止所有声音并清除两类待播时序，恢复后不补播已取消的任务或其错误回退。武将台词不使用卡牌事件去重；受击音效仍即时独立播放。

重建：`node scripts/sgs/prepare-character-audio.mjs`。选择配置位于 `scripts/sgs/character-audio-selection.json`，收集器只下载原生解析得到的58条文件并校验锁定Git blob，已有正确文件直接复用。常规构建打包本地文件，游玩不需要联网。

验证：`node --test tests/sgs/audio.test.mjs` 执行实际原生Audio类及tryAudio/trySkillAudio/tryDieAudio，覆盖全部58条录音、子技能引用、转换形态、错误版本禁播、跨类别重叠、双向加载独立、静音和失败回退。`node scripts/sgs/verify-card-audio.mjs` 完整解码全部232条本地声音。浏览器实战记录另见 `docs/sgs-validation.md`；资源与原生音频路径验证不代表全部技能组合、玩法强度或主观听感均已核验。
