# 上游与本地改动

本项目基于 [libnoname/noname](https://github.com/libnoname/noname)，遵循仓库根目录的 GPL-3.0 许可证，保留完整源代码与上游署名。

- 上游提交：`7fcf23ed54d8a7ce2b49ae2c15a054123891a52a`
- 核心版本：1.11.7
- 本地适配日期：2026-10-03
- 本地新增内容：十周年单机入口、版本筛选、可追溯武将技能清单、启动桥接、验证报告。
- 这是社区开源实现的本地适配，不是官方产品；源码收录不等于经过官方规则逐项验证。
- 当前稀疏检出省略移动端、音频和武将画像原文件；定制入口使用压缩的本地网络/上游头像，来源与例外见 `sgs-portraits.md`。

启动：`node scripts/sgs/dev.mjs`。浏览器访问 `http://127.0.0.1:8081/sgs.html`。
首次安装：`pnpm --filter noname... --filter . install --ignore-scripts`。

禁止将本地改动推送到无名杀上游。用户于2026-10-04指定项目仓库 [starquakee/sgs](https://github.com/starquakee/sgs)。原始开发检出保留上游 `origin`，项目远程使用 `sgs`。发布快照仅含当前已检出的源码和素材，保留LICENSE、署名和锁定版本；原始开发历史不改写。上游工作流在发布树中移至 `archive/sgs-upstream-workflows/`，不自动启用上游部署及定时任务。发布树排除上游文件服务器的 `packages/fs/localhost.decrypted.key`；本项目的本机HTTP服务不依赖此文件。

2026-10-04按后续请求扩展近期武将语音：在威董卓之外加入神庞统、神钟会、新杀神孙权、新杀谋荀彧、新杀谋曹昂、新杀谋邓艾、威公孙瓒和威马腾，共58条7,554,559字节。录音仍原样取自同一锁定提交，转换形态与子技能引用使用原生解析；官网上新依据与各武将体积见 `sgs-character-audio.md`。不将素材来源声明等同于另行授权。

2026-10-03 参考图外观改版继续复用本地上游素材：`image/background/ol_bg.jpg` 龙纹桌面、`theme/style/card/ol.css` 卡面、`theme/style/hp/official.css` 玉质体力、`font/xinwei.woff2` 字体。新布局只在 `sgs/table.css` 与适配器内生效，没有替换规则和AI。

同日追加四人2v2与卡牌语音：复用 `mode/versus.js` 的双人对抗规则；158份卡牌录音按锁定提交原样保留，桃另有两份明确标注的本机系统语音。详细来源、哈希和验证见 `sgs-card-audio.md` 与 `apps/core/sgs/card-audio.json`。

同日追加威董卓五条配音，原样取自相同锁定提交的 `apps/core/audio/skill/dcguangyong{1,2}.mp3`、`dcjuchui{1,2}.mp3` 与 `apps/core/audio/die/v_dongzhuo.mp3`。逐文件原 URL、Git blob 与 SHA-256 见 `apps/core/sgs/character-audio.json`；说明见 `sgs-character-audio.md`。

同日追加14条原生受击音效，来自同一提交的 `apps/core/audio/effect/damage*.mp3` 和 `hujia_damage*.mp3` 中普通/重击及属性分支；不包含人物呻吟或其他效果包。清单、来源和校验值见 `apps/core/sgs/damage-audio.json`，说明见 `sgs-damage-audio.md`。

同日纠正属性杀牌面：新增两张三国杀官网国战专题的经典火杀/雷杀图示，原始JPG不作修改，以CSS取景显示插画和标识。来源与哈希见 `apps/core/sgs/card-art.json`、`sgs-card-art.md`；这些官网素材的权利归原权利人，未将其宣称为GPL授权图片。

斗地主复用 `mode/doudizhu.js` 的 normal 分支，使用十周年 `dcfeiyang` 和 `bahu`；选将/身份交接位于 `sgs/doudizhu-mode.mjs`。视觉整理继续使用现有龙纹、字体及压缩画像，未引入新的远程素材或修改上游规则文件。
