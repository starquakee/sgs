# 对局背景音乐

2026-11-14 用户选择使用上游原版对局音乐。SGS 只打包一首 `music_default`，在总声音开启、当前牌桌获得首次允许的用户手势后循环播放；大厅不播放音乐，不增加歌单或外部播放器。

录音逐字节取自 Noname / 无名杀提交 `7fcf23ed54d8a7ce2b49ae2c15a054123891a52a` 的 [`apps/core/audio/background/music_default.mp3`](https://raw.githubusercontent.com/libnoname/noname/7fcf23ed54d8a7ce2b49ae2c15a054123891a52a/apps/core/audio/background/music_default.mp3)。保留上游署名与 [GPL-3.0](https://github.com/libnoname/noname/blob/7fcf23ed54d8a7ce2b49ae2c15a054123891a52a/LICENSE)，不主张录音原创或另行授权。没有剪辑、合成、转码或重新混音。

| 项目 | 值 |
| --- | --- |
| 本地文件 | `apps/core/sgs/audio/background/music_default.mp3` |
| 大小 | 3,543,457 字节（约3.38 MiB） |
| 格式与时长 | MP3、44.1 kHz、双声道，约3分41.466秒 |
| Git blob | `eaccd4570b89a824cf5300e5d8601d605828c054` |
| SHA-256 | `5fcefad6d89c2471c2aae05735c7d0cf6faeba015c2679bc6060afb85f8fef9d` |
| 清单 | `apps/core/sgs/music-audio.json` |
| 重建 | `node scripts/sgs/prepare-music-audio.mjs` |

`music-audio.mjs` 使用已有声音控制器的唯一 AudioContext。音乐有自己的 loader、循环 source 和 GainNode，既不等待卡牌、武将或音效，也不会取消这些通道的加载。下载、读取响应和解码共用8秒期限，失败后停止自动尝试；用户关闭再开启总声音或重新开局可重试。常规构建仅使用本地资源，游玩时从本站读取，不联系外部音频服务。

设置中的 `musicVolume` 默认0.25，可调到0；旧版偏好自动补充此字段，已有 `sound:false` 和卡牌、武将、音效音量保持不变。调节音乐只改变自身音量。暂停、设置、原生菜单和页面隐藏时，音乐保存循环位置并停止 source，恢复后使用新 source 接着播放；不会挂起共享 AudioContext。正常等待玩家选牌使用原生 `paused`，不属于音乐暂停；音乐观察 `paused2` 的实际延迟释放，并保留刷新兜底。关闭“后台自动暂停”也不会让隐藏页面继续放音乐。

总静音或音乐音量0会停止音乐并取消音乐待加载任务，恢复时沿用本局循环位置。结算、异常终止、确认离开、页面离开或销毁会永久停止本局音乐；历史缓存中的旧牌桌不能恢复。独立代次和 source 所有权保证迟到加载、解码及旧 `onended` 不会重播或干扰新 source。原生未打包音乐仍配置为 `music_off`，避免启动另一个 HTMLAudio 播放路径。

只缓存一个解码后的曲目；其双声道 Float32 buffer 约74.5 MiB，结算和销毁时释放缓存及引用。原有452条录音不变，增加本曲后为453条、31,948,365字节。`tests/sgs/music-audio.test.mjs` 使用真实适配器与静默模拟设备验证循环、音量、偏好、加载期限、取消与失败；`client-session.test.mjs` 执行锁定原生 PauseManager 和暂停方法，验证设置、隐藏、原生菜单与结束清理。音频完整校验使用 `node scripts/sgs/verify-card-audio.mjs`，输出到空设备，不播放声音。父会话另行记录静音浏览器与发布验收，不把模拟隐藏事件当作真实后台切换证据。
