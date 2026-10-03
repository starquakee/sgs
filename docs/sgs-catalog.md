# 武将与技能源码清单

本清单来自保留的 GPL-3.0 无名杀源码，锁定上游提交为 `7fcf23ed54d8a7ce2b49ae2c15a054123891a52a`。署名见 [来源说明](sgs-upstream.md) 和根目录 [LICENSE](../LICENSE)。生成器只读取并静态解析源码，不导入或运行游戏模块，也不联网。

使用 Node 22；TypeScript 解析器复用项目已通过 pnpm 安装的依赖。在仓库根目录执行：

```powershell
node scripts/sgs/build-catalog.mjs
node --test tests/sgs/*.test.mjs
```

输出：

- `apps/core/sgs/catalog.json`：武将资料、技能文案、原始 ID、包、版本类别和源码位置；`skillDefinitions` 收录定义及静态声明依赖。
- `docs/sgs-coverage.json`：源码收录与定义解析计数、未解析项、冲突、源文件 SHA-256；行为验证单独计数。
- `scripts/sgs/catalog-versions.json`：可维护的包级分类、理由和来源。需要逐将例外时，在 `characterOverrides` 中按 `包:武将ID` 指定有依据的规则。未知包或失效例外会使生成失败。

没有时间戳、绝对路径或随机数；同一源码和配置生成相同字节。源文件及分类配置的哈希保留在报告中，方便检查后续源码变化。

## 状态与读取约定

武将使用 `key = 包:原ID`；`id` 为交给原引擎的 ID。不同版本不合并。`hp`、`maxHp` 和 `armor` 分开保存，隐藏武将与 AI 禁用标记保留；缺省值按上游 Character 类处理。`groups` 来自各包 `sort.js`，不用于猜测官方版本。

每项武将技能包含 `definitionKeys`，可以连接到 `skillDefinitions`。`status: resolved` 仅表示在扫描范围中找到唯一的对象定义。`unresolved` 会给出缺失、动态或冲突原因。技能文案存在不会使该技能自动成为 resolved。定义和文案分别记录来源与行号。

`implementation.sourceStatus` 表示源码收录；`implementation.definitionStatus` 只汇总武将直接列出的技能。它不保证传递依赖齐全，不代表已经加载该包，也不代表技能可在任意模式正常运行。动态文案或姓名不执行，输出 `null` 或原 ID，并保留 `textStatus` / `nameStatus`；入口应显示待解析提示，不应编造文案。原技能说明可含 HTML，使用方须按文本呈现或使用受控净化。

所有 `behaviorStatus` 都为 `unverified`。官方总数、基准日期和百分比均未知，保持 `null`。任何界面都不能把源码条目数当成官方覆盖分母。

## 分类边界

十周年源码目标包为 `xianding`、`huicui`、`sp2`。`sp2` 在上游包列表属于通用分区，依据本项目已接受 PRD 纳入目标范围，并不说明每项均经官方对账。`standard`、`shenhua`、`extra`、`yijiang` 标为通用经典；`refresh` 等混合包保留待核验。OL、手游、海外、线下和社区包仍可查询，分别分类，不纳入十周年专属包统计。前缀 `dc_` 或 `ol_` 不单独决定分类。

## 扫描限制与已知项

当前收录 26 个包、2,563 个武将条目，其中十周年目标包 451 个。扫描了 9,724 个技能定义条目（包括子技能），其中 9,722 个无定义冲突。它们是源码计数，不是官方武将或技能总数。

扫描范围为各包默认导出的技能对象、引擎注册的首层 `subSkill`，以及 `offline/skill/index.ts` 明确合并的 JS 文件。跨包的 `inherit`、`group`、`global` 静态引用可追踪；动态授技、运行时生成技能、模式/卡牌/引擎内置技能不在完整依赖分析范围，不能据此直接裁剪游戏加载包。

报告保留 4 条武将技能 `dualside` 未解析引用，及 44 条未解析声明依赖。这些可能定义在扫描范围之外，不能据此声称上游缺少实现。`twgongsun_shadow` / `twgongsun_shadow2` 同时出现在顶层和子技能，保留冲突状态与两处位置，不猜测运行时覆盖顺序。`collab` 翻译表有两个动态展开，`sixiang:std_nanhualaoxian` 的姓名由 getter 计算，均明确记录待解析。

本故事不修改上游规则，也不进行技能行为验证；真实运行验证仍由后续故事记录。
