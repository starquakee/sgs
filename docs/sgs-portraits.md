# 轻量头像与图片来源

选将页、详情页和真实牌桌共用 `apps/core/sgs/portraits.json`。每个收录武将 ID 保留独立映射；相同图片去重保存于 `apps/core/sgs/portraits/`。图片为 96×128 WebP，每个文件最多 4,096 字节。游戏只读取本地文件，不向图片来源站点发送请求，也不需要 Python。

## 来源与例外

- 大部分图片来自 [Noname 固定提交](https://github.com/libnoname/noname/tree/7fcf23ed54d8a7ce2b49ae2c15a054123891a52a/apps/core/image/character)。清单逐项记录原图路径、提交、文件大小和 SHA-256。
- 34 个尚无独立原画的版本使用同一人物的上游画像，映射见 `scripts/sgs/portrait-aliases.json`。不把其他人物当作该武将。
- 补充网络图的页面、直链及身份依据见 `scripts/sgs/portrait-sources.json`。崔芷来自十周年官网；小空来自 AIR 角色讨论页面；韩玄、吕壹使用光荣特库摩《三国志14》同人物画像；孙和、张臶使用同人物资料画像。这些资料画像在详情页有说明。
- 邓晚棠、刘盼兮的公开测试实战可见通用女性剪影；陆文漪资料页无画像，未找到可独立核验的实战卡图。经用户于 2026-10-03 明确同意，三位先使用已有通用测试形象。前两位标注“公开测试形象 · 剪影”；陆文漪标注“测试剪影暂代 · 独立画像待补”。不宣称三者是已发布的正式立绘。
- 本次交付未使用 AI 生成图片。下载的原始素材、研究视频和截图不进入游戏包。

代码继续遵循仓库 GPL-3.0；图片作品的权利属于各原作者/权利人，保留来源不意味着图片版权转为本地适配者所有，也不代表这些不同来源的美术都按 GPL 授权。

## 重建

需要 Node 22、Python 3 和 Pillow；日常构建直接复制已提交的小图。

```powershell
node scripts/sgs/prepare-portraits.mjs
python scripts/sgs/build-portraits.py --download
node --test tests/sgs/portraits.test.mjs
```

规划器读取固定上游提交的文件树和武将元数据，再应用显式同人物映射及额外来源。下载器在内存中缩小图片；已存在的有效小图直接复用。重建会逐图解码、检查格式/尺寸/字节预算，生成完整清单；默认遇到缺图失败。`--allow-incomplete` 仅供补图过程诊断，不能用来声明验收完成。

修改原图、裁切或编码参数时，应删除对应小图后重建并复核。测试独立检查全部 ID 映射、来源、文件数、大小及哈希；规则/技能的完整核验仍属于 US-006。
