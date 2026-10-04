# 卡牌语音来源与实现

2026-10-03：用户要求所有卡牌出牌时有对应语音。当前启用标准与军争牌堆；语音均由本地 `apps/core/sgs/audio/` 提供，游戏时无需联网。

- 158 份录音来自锁定的无名杀提交 `7fcf23ed54d8a7ce2b49ae2c15a054123891a52a`，原路径 `apps/core/audio/card/`。保留男女录音、普通及属性杀和其他已有卡牌录音。
- 上游缺少“桃”的报牌录音，补充两份本机中文系统语音：Microsoft Kangkang（男）与 Microsoft Huihui Desktop（女），只朗读“桃”，明确不属于官方真人配音。未分发系统语音引擎。
- 合计 160 文件，1,577,317 字节（约 1.50 MiB）。每份原录音的来源 URL、Git blob、SHA-256、字节数，以及合成补充的语音名、文字和重建脚本均记录在 `apps/core/sgs/card-audio.json`。
- 引擎与适配代码沿用根目录 GPL-3.0；音频作为原项目素材保留来源，不主张适配者拥有录音著作权。

`card-audio.mjs` 保留原生 `playCardAudio` 的牌名、属性和性别解析，在已提交的 `useCard1` / `respond` 事件补足技能转化牌语音，用事件去重避免双播。选择与撤销不会触发。共享 AudioContext 在首次点击/按键时解锁，后续 AI 与响应可继续播放；顶部“声音”按钮可静音并停止排队声音。卡牌与武将使用独立的加载队列和播放时间轴，可重叠播放；各类内部保持顺序，任何一类都不会因另一类的长台词或慢加载而等待。同日按用户要求加入威董卓五条技能/阵亡录音，详见 `sgs-character-audio.md`；其他未打包的武将和背景声音继续关闭。

重建：`node scripts/sgs/prepare-card-audio.mjs`（首次需公网读取锁定原文件；重做桃需 Windows 中文 SAPI 声音、PowerShell 7 与 ffmpeg）。常规游玩和构建不需要这些生成工具。校验：`node --test tests/sgs/audio.test.mjs`；完整解码：`node scripts/sgs/verify-card-audio.mjs`（需 ffmpeg）。

测试直接调用锁定上游的卡牌声音解析函数，检查标准/军争牌堆每种卡牌、男女音色与属性杀路径；覆盖原生/补充触发去重、响应、技能转化、装备、桃、静音、解锁及文件失败。全部文件经哈希与完整解码验证。对复杂技能生成的所有衍生牌组合不作穷尽实战验证声明。
