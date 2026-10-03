# 经典牌面与手牌连续性

2026-10-03：根据用户提供的经典牌面截图纠正属性杀插画，并修复出牌后的牌内跳动。

## 图像来源

- [官网火杀说明](https://guozhan.sanguosha.com/a/kapaiyilan/youxipai/jibenpai/2013/0129/138.html)链接的[原始JPG](https://guozhan.sanguosha.com/uploads/allimg/130130/1-1301301K4522D.jpg)。
- [官网雷杀说明](https://guozhan.sanguosha.com/a/kapaiyilan/youxipai/jibenpai/2013/0129/139.html)链接的[原始JPG](https://guozhan.sanguosha.com/uploads/allimg/130130/1-1301301K64YJ.jpg)。

二者为官网经典牌面：使用武者插画，字样分别带火纹、雷纹。之前适配器用 `liehuo.png` / `tianlei.png` 代替属性杀的做法已移除。原始两图共32,394字节、各240×337像素，保存在 `apps/core/sgs/cards/official-source/`；文件原样保存，无AI生成、重绘、调色或重新编码。

`card-art.json` 记录来源页、原图地址、核验日、尺寸、字节数和SHA-256。素材来自杭州游卡网络技术有限公司官网，权利归原权利人；不主张适配者拥有版权，也未宣称这些官网图片获得GPL授权。其他已有卡牌插画继续使用锁定Noname资源。

CSS分别取景显示原图的武者插画与上方属性字样，不带入示例图印刷的点数、花色。真实信息始终使用引擎已有 `.info` 节点：点数在左上，花色在下，右上横排牌名，插画位于下方。隐藏牌不应用这些取景或类型标签；装备栏仍保留原来的紧凑条目。

可重建/验证：`node scripts/sgs/prepare-card-art.mjs`，本地文件存在且哈希正确时不联网；缺失时使用现有系统curl下载原地址，哈希变化则报错等待复核，不悄悄替换素材。常规游玩不需要联网。

## 布局问题与修复

原生 `ui.updatehl` 复用原节点，但手牌密度变化会对牌名写入或撤销 `translateY(16px)`，末张还有独立规则。旧适配样式只固定了花色，牌名仍会移动；整张牌的transform又没有过渡，内部子层还继承0.5秒过渡，所以用户看到跳动和刷新感。

适配CSS固定牌名、点数花色、插画的位置，覆盖密度/末张的内部transform，并关闭内部过渡。保留原生根节点与选择逻辑，只让根节点的transform用0.18秒平滑移动。手牌栏左侧锚定，不因张数变少重新居中；仍使用原生收拢、滚动和选择计算。右边为装备栏保留空间，减少动态效果偏好继续生效。

## 可重复浏览器回归

在已有生产构建上运行：

```powershell
node scripts/sgs/build-card-layout-fixture.mjs --before
node scripts/sgs/build-card-layout-fixture.mjs
```

访问本地 `/sgs/card-layout-before.html` 与 `/sgs/card-layout-test.html`，点击“9 → 8 张”。两页使用相同600px栏、真实DOM卡牌、锁定引擎的完整 `updatehl` / `getSpreadOffset` 方法；不运行或模拟游戏规则。前者取本地旧提交 `743cd19` 的CSS，后者使用当前样式。

旧版：保留的节点未重建，但前七张牌名各上移16px，卡牌根节点缺少transform过渡，测试失败。新版：原节点和文字均保留，所有牌名/信息相对位移为0（浮点误差小于0.001px），根节点平滑移动，测试通过。

“查看5张完整牌面”展示普通杀、无懈可击、火攻及属性杀；样例火杀为♦5、雷杀为♠7，特意与原图印刷的♥4/♣8不同，以检查原图点数没有漏入真实牌面。临时页面输出在被忽略的 `dist-sgs` 中，不作为游戏入口发布。实战与窄窗口记录见 `sgs-validation.md`。
