# 识海记忆系统 2.0 · 落地规范（通用版）

> 版本 1.1 ｜ 2026-11-05 ｜ 依据：11-04 会话撞墙事件的复盘
> v1.1 修订：锁定计时起点、修正 L3 示例、细化逐级动作与状态字段、dry-run 只读、归档必须保元数据。

## 0. 一句话目标

让记忆**能淡、能捞、能兜底**：淡掉细节，留下节点；节点能靠锚点捞回来；任何一次压缩失败都不许拖垮对话。

## 1. 不变的部分（明确冻结）

- 目录：`%USERPROFILE%\\.memory`（`identity/`、`sea/`、`user/`、`decisions/`、`projects/`、`skills/`、`concepts/`、`archive/`、`tools/`、`raw/`）
- 分级：沿用 `L0–L4`
- 元记忆三件：`SOUL.md` / `MEMORY.md` / `BOOTSTRAP.md`
- 已有工具：`tools/decay.mjs`、`anchors.md`、git 归档
- 上下文机制：`billion-context`（仅改容错行为，不改折叠策略）

## 2. 改动一：MEMORY.md 增加「时间轴」一节

### 2.1 K↔L 映射（对外说法用 K，存储仍用 L）

| 外部说法 | 本项目对应 | 是否自动衰减 |
|---|---|---|
| K0 身份核心 | `SOUL.md` + `identity/core.md` + `identity/voice.md` | 否 |
| K1 重要节点 | `sea/*.md` 中 `weight: L4／L3` | 只淡细节，不删节点 |
| K2 有价值经历 | `L2`（`decisions/`、`skills/`、`projects/`） | 是，压缩成简要记录 |
| K3 普通经历 | `L1` | 是，留索引后淡化 |
| K4 临时信息 | `L0`（不入库） | — |

> 除映射外，正文一律仍写 L。K 只是对外说法，写进文件会造成双重标准。

### 2.2 时间参数（计时起点必须明确）

**统一规则：所有时限从「该页最后一次被实际使用」起算**；`last_access` 取自插件维护值，人工可 `dsh-memory touch` 更正。

| 级别 | 第一阶段 | 第二阶段的起算点 | 第二阶段 |
|---|---|---|---|
| L0 | 不入库 | — | — |
| L1 | 30 天未访问 → `summarized`（留摘要，删过程） | **从摘要化当天起算** | 再 90 天未访问 → `archived` |
| L2 | 90 天未访问 → `summarized`（留摘要与结论） | 从摘要化当天起算 | 再 180 天未访问 → `archived` |
| L3 | 180 天未访问 → 只淡细节，保留事件／原因／影响 | 不归档 | 节点常驻，仅 `archived` 其对话细节到 `archive/sea/<同名>/` |
| L4 | 不自动降级 | — | 仅允许显式修改 |

**降级后不重置 `last_access`**：摘要化当天写入 `status_changed_at`，第二阶段以它为起点，避免「一降级就又活三十天」的漏洞。

**时间不是唯一判据**：用户明确说过「记住这个」，或该页被 ≥3 次会话引用，则标 `protected`，降级暂停，须在审计里写明「受保护」。

### 2.3 生命周期状态字段（新增，只做管理，不改分级）

每页 frontmatter 增加 `status`，取值：

| 状态 | 含义 | 允许的动作 |
|---|---|---|
| `active` | 正常使用 | 可被降级 |
| `summarized` | 已淡化细节、保留摘要 | 可被归档；可被引用后再升回 `active` |
| `archived` | 原页整体归档到 `archive/` | 只能 `--restore` |
| `protected` | 受保护（用户指定或引用达标） | 跳过自动降级 |
| `restored` | 刚从归档恢复 | 等同 `active`，但审计留痕 |

`status` 是生命周期管理字段，**不是新的记忆分级**，不参与 salience 计算。

### 2.4 归档必须保留的元数据（否则无法恢复）

原页移入 `archive/` 时，frontmatter 必须补四个字段，缺一不可：

```yaml
archived_from: sea/2026-11-03-dragon-raja.md   # 原始相对路径
archived_level: L3                             # 归档前的级别
archived_last_access: 2026-11-03               # 归档前最后访问
archived_at: 2026-11-06                        # 归档日期
```

`archive/` 目录结构与原目录**镜像对应**（`archive/sea/...`、`archive/skills/...`），保证：

1. 第二次生命周期扫描能找到它（扫描包含 `archive/`，但只读）；
2. `--restore` 能准确还原路径、级别、`last_access` 与正文；
3. 恢复是「移动 + 还原字段」，不是「复制正文」。

### 2.5 四条规则

1. **降级永不删除原页**：整份移入 `archive/` 镜像路径，git 保留历史，`anchors.md` 留锚点。
2. **降级必须留理由**：审计写「为什么降」，不写分数。
3. **不装公式**：重要性由写页的人一句话判断，落笔为 `salience`/`weight` + 理由；禁止编造加权分数。
4. **冲突以最新表述为准**：新事实与旧页冲突时改旧页并记 `log.md`，不并存两套说法。

### 2.6 审计格式（`log.md` 内的 decay 条目）

```
## [YYYY-MM-DD] decay | skills/reading-books.md L2→L1 (summarized)
理由：180 天未访问；结论已并入 projects/active/<项目>.md
原文：archive/skills/reading-books.md
恢复：node tools/decay.mjs --restore skills/reading-books.md
```

## 3. 改动二：`tools/decay.mjs` 增 `--lifecycle`

### 3.1 行为定义（逐级明确）

- `--lifecycle --dry-run`：**完全只读**。扫描、打印「将降哪些页、为什么、目标状态、会写哪个文件」，不写任何文件、不改索引、不提交 git、不重建锚点。
- `--lifecycle`：真实执行。对每页按 3.2 表格处理，写审计、改 frontmatter、移动文件、重建 `anchors.md`。
- `--restore <路径>`：从 `archive/` 接回原路径，还原 `salience`/`weight`/`status: restored`，恢复 `last_access`，写审计。
- 幂等：同一页同一天重复执行只产生一条审计；`status` 未变则不动文件。

### 3.2 逐级动作表

| 当前 | 条件 | 动作 | 目标状态 | 文件去留 |
|---|---|---|---|---|
| `L1 active` | 30 天未访问 | 生成摘要，删过程细节，正文瘦身 | `summarized` | 原地 |
| `L1 summarized` | 距 `status_changed_at` 90 天未访问 | 整体归档 | `archived` | 移到 `archive/<原路径>` |
| `L2 active` | 90 天未访问 | 保留摘要与结论，删过程 | `summarized` | 原地 |
| `L2 summarized` | 距 `status_changed_at` 180 天未访问 | 整体归档 | `archived` | 移到 `archive/<原路径>` |
| `L3` | 180 天未访问 | 只把对话细节段落移入 `archive/sea/<同名>/details.md`，节点正文保留 | `active`（正文标注「细节已归档」） | 原地 + 归档目录 |
| `L4` / `identity/*` / `user/*` | 永不 | 跳过 | — | — |
| 任意 `protected` | 永不 | 跳过并记录 | — | — |

### 3.3 硬约束

- 只处理 `salience ≥ 2` 或 `weight ∈ {L1,L2,L3}` 的页。
- 单次执行最多降 20 页；超过则分批，下批需显式再跑。
- **只有真实执行才** `git commit`（信息 `lifecycle-YYYYMMDD-HHMM`）；`--dry-run` 绝不提交。
- 输出必须含「将降 x 页 / 已降 y 页 / 跳过 z 页（逐条原因）」。

### 3.4 验收

- 副本目录上 `--dry-run` 的预测与随后真实执行的结果一致；且 `--dry-run` 后 `git status` 为空。
- 执行后 `dsh-memory lint` 通过，`index.md` 与 `anchors.md` 一致。
- `--restore` 任一页：路径、级别、`last_access`、正文与归档前完全一致（逐字节比对正文）。
- 连续跑两次：第二次不产生新审计、不动文件。

## 4. 改动三：压缩容错（`billion-context`，独立于记忆库）

### 4.1 要解决的

11-04 故障链：摘要请求 `UND_ERR_CONNECT_TIMEOUT` → 前置折叠失败 → 会话只出不进。压缩是后台维护，**不能是对话的前置条件**。

### 4.2 四条改动

1. **失败即跳过**：摘要请求异常时放弃本轮折叠、保留原文，正常放行对话，记录失败位置。
2. **原文先留**：折叠前落盘原始片段快照，落盘失败则不折叠。
3. **原子提交**：摘要生成且校验通过（更短、含关键实体）才替换，否则保留原文重试。
4. **断点续压**：记录「已折到哪」与失败次数，下次从断点继续；同一段连败 3 次标 `degraded`，停止尝试，只告警。

### 4.3 观测

日志每段一行：`sessionId / 范围 / 原文 tok / 摘要 tok / 结果(success|skipped|failed) / 原因`。任何 `failed` 必须在 `acp_status` 可见，不允许静默。

### 4.4 验收（必须断网测）

- 断网时继续对话：能正常收发，不卡死，压缩标 `skipped`；
- 恢复网络后自动续压，不重复处理已成功段；
- 人为构造摘要失败：原文仍在，可校验；
- 折叠后 `compress` 块数与 `acp_status` 一致，无悬挂块。

## 5. 苏醒协议

1. **原意识**：`SOUL.md` + `identity/core.md` + `identity/voice.md`
2. **心光**：`identity/attention.md`
3. **最近识海**：按 `last_access` 取最近 3 个 `sea/*.md`
4. **心流**：按当前话题用 `anchors.md` 锚点词匹配，命中才展开
5. **遗忘维护**：若有待降级页，**只提示不执行**

约束：任何一步取不到，就明说「没找到」，不许编。

## 6. 实施顺序与回滚

| 阶段 | 内容 | 验收 |
|---|---|---|
| 1 | 冻结：`git tag memory-2.0-baseline`，`dsh-memory pack` | 能整体回退 |
| 2 | `MEMORY.md` 增节（改动一） | 文档自洽，`lint` 通过 |
| 3 | `decay.mjs --lifecycle`（改动二） | 副本 `dry-run` 与执行一致，dry-run 零写入 |
| 4 | 压缩容错（改动三），改在副本 profile | 断网/恢复/失败三测通过 |
| 5 | 接入运行版本 | 一个完整会话无回归 |

回滚：`git reset --hard memory-2.0-baseline`；`archive/` 随时 `--restore`。

## 7. 技术边界（实现时不得越界）

1. 不直接修改活动会话的压缩块。
2. 不改变 `billion-context` 原有折叠策略，只加容错。
3. 不把摘要请求失败等同于原始内容失效。
4. 摘要未校验不得覆盖原文。
5. 生命周期脚本在 `--dry-run` 下不写文件、不提交 git、不改索引、不重建锚点。
6. 恢复操作必须连 frontmatter、原始路径、级别、`last_access` 一并还原，不许只恢复正文。

## 8. 一条底线

**记忆不是保存所有过去，是让过去的一部分持续成为现在的自己。**
任何以「丢失原文」换「上下文变短」的机制，都不予采纳。
