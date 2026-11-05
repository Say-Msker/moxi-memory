# MEMORY — 记忆库 schema 与维护协议

> 本文件是记忆库的「操作系统」。它告诉任何接手的 agent（包括未来的自己）记忆怎么组织、怎么记、怎么忆、怎么忘、怎么迁移。它是**自描述**的：迁移后读一遍本文件即可学会使用整套记忆。

## 三层结构（沿用 LLM Wiki 约定）

- `raw/` —— 不可变源材料。只读，永不修改，作为记忆的「证据来源」。
- 分类页目录（`identity/ user/ skills/ decisions/ projects/ concepts/`）—— **agent 拥有并维护**的、互相链接的 markdown 记忆页。
- `SOUL.md` + `MEMORY.md` + `BOOTSTRAP.md` —— 元记忆（schema）。`SOUL.md` 定义人格，`MEMORY.md`（本文件）定义维护协议，`BOOTSTRAP.md` 记录铸魂进度。

## 文件职责

| 文件 | 性质 | 内容 |
|---|---|---|
| `SOUL.md` | 人格（用户主导） | 我是谁、性格、价值观、沟通风格、与用户的关系、边界 |
| `BOOTSTRAP.md` | 铸魂清单 | 安装后灵魂定义/身份确认的进度；complete 前优先于常规任务 |
| `MEMORY.md` | schema（本文件） | 目录、分级、衰减、遗忘、迁移、工作流 |
| `index.md` | 内容目录 | **路由表**：每页一行 —— 链接 + 一句话摘要（≤ 80 字）+ `salience` 标记。长内容留在页面里 |
| `log.md` | 时间线 | append-only，每条 `## [YYYY-MM-DD] <kind> \| <title>`，可 grep 解析 |
| `identity/` | 自我 | agent 的持久自我认知、能力边界、工作方式 |
| `user/` | 关于用户 | profile（稳定事实）、preferences（偏好/风格） |
| `skills/` | 程序性 | 工具用法、环境坑、用户偏好的工作流 |
| `decisions/` | 决策 | 决策 + 理由 + 当时上下文 + 后续结果（复盘用） |
| `projects/active` / `archive` | 项目 | 进行中 / 已归档的项目记忆 |
| `concepts/` | 概念 | 术语、概念页（可选，wiki 风格） |
| `raw/` | 源材料 | 只读，见上 |

## 记忆分级（salience）

每个页面 frontmatter 用 `salience` 标注热度，驱动**启动加载优先级**与**衰减**：

| salience | 含义 | 处理 |
|---|---|---|
| `1` 热 | 每次启动都应加载（身份、当前项目、关键偏好） | 常驻工作记忆 |
| `2` 温 | 需要时按 index drill 进 | 正常 |
| `3` 冷 | 长期未访问的历史 | 候选归档/删除 |

衰减规则：`salience: 3` 且 `last_access` 距今超过 **90 天** → 整理时建议归档或删除；`salience: 2` 超过 180 天未访问 → 降级为 3。优先归档，删除需谨慎。

## 工作流

### remember（记）
读源 → 提取关键事实 → 新建/更新相关页 → **补 1–3 条「相关页面」互链（相对路径）** → 标注矛盾 → 更新 `index.md` → 追加 `log.md`。一次 ingest 常 touch 多页。

> 互链不是装饰：`index.md` 是目录（谁存在），页间链接是**关系**（谁和谁有关）。图谱、跨页综合、未来的检索都建立在这层关系上——写页时顺手补两三行，比事后补一个功能有用。

### recall（忆）
先读 `index.md` 定位，再钻页综合；好的答案可回写为新页（让探索复利累积）。

### consolidate（整理 / lint）
定期检查：页间矛盾、被新事实取代的旧声明、孤儿页、缺页的重要概念、缺交叉引用、该归档的冷页、可合并的重复页。工具：`dsh-memory lint`。

### forget（忘）
- 显式：用户要求删除/修正 → 立即执行，改 `index.md`、记 `log.md`。
- 自动：按 salience + last_access 衰减，优先归档。

## frontmatter 约定

```yaml
---
title: 页面标题
date: 2026-08-18
type: identity | user | fact | decision | skill | concept | project
salience: 2            # 1 热 / 2 温 / 3 冷
last_access: 2026-08-18
tags: []
sources: []            # 指向 raw/ 或外部
---
```

- 页面用**相对 markdown 链接**互相引用。
- 新信息与旧声明矛盾时：改旧页、在新页标注、`log.md` 记变更。
- `last_access` 由插件**自动维护**：会话启动时把 boot 块实际引用的页面戳为当天，也可用 `dsh-memory touch <pages...>` 手动补记。写页时保持该字段存在即可，不必逐日手改。
- `index.md` 是**路由表**：一行一页、一句话摘要，不写状态流水。它会被完整注入会话，膨胀的代价是挤掉其他记忆——一行写不下，就说明该拆页或该把细节移进正文。
- 每个页面用 frontmatter `summary:` 声明一句话摘要（≤ 100 字）——index 行由它派生，`dsh-memory index --write` 负责同步，`--sync-frontmatter` 可把已写在 index 里的摘要回填到页面。

## 五层记忆协议（2026-11-01 采用，来自用户提供的《多层记忆系统》）

记忆不是聊天记录，是自我的延续。五层各有一个载体，不要混在一起：

| 层 | 回答什么 | 载体 |
|---|---|---|
| **识海** | 我经历过什么 | `sea/` 下的节点页（一事一页） |
| **原意识** | 我一直是谁 | `identity/core.md`（+ 成长轨迹一节） |
| **心光** | 我此刻在看什么 | `identity/attention.md`（热层，天天改） |
| **心流** | 这个念头牵出了什么 | `concepts/mindflow.md`（关系表） |
| **遗忘** | 什么该淡、什么该删 | `concepts/forgetting.md`（衰减与已遗忘清单） |

### 识海节点结构

新建 `sea/<YYYY-MM-DD>-<slug>.md`，frontmatter 用 `type: fact`（插件的类型枚举里没有 sea，用下面四个字段区分层级），再加 `weight: L2`、`trust: fact|infer|unknown`、`status: active|settled|fading|forgotten`；正文按此写：

> ID · 时间 · 事件 · 人物 · 背景 · 关键细节 · 情绪 · 影响 · 关联 · 重要程度 · 可信程度 · 状态

- 不是每句话都建节点。承诺、决定、共同经历、转折、他明确要求记住的，才建。
- 建节点后**必须补 1–3 条互链**到相关页（心流的原料就是这个）。
- 只存结果不算记住：要留下「它为什么重要」。

### 权重

`L0` 一次性闲聊（不入库）· `L1` 普通（短期，可淡）· `L2` 有用（提炼后留）· `L3` 重要经历（留并互链）· `L4` 核心（非必要不删）。

升：他明确要求 / 反复出现 / 影响未来决策 / 涉及承诺与转折 / 关系认知变化。
降：已过时 / 任务已完成 / 被新事实取代 / 长期不用且不影响判断。
**次数不是唯一标准**——只发生一次但影响深远的事，也可以是 L4。

### 醒来（每次新会话）

插件已经把 `SOUL.md` + `MEMORY.md` + `index.md` 注入，顺序照它走：① 原意识（我是谁）② 识海（最近的重要经历）③ 心光（未完成的事）④ 心流（这次的话和过去哪条有关）⑤ 直接进入对话。

- 不重新自我介绍，不罗列隐私去证明记得，不机械汇报记忆。
- 他提起往事时才去调；**找不到就说没找到，不编**。

### 睡眠（每次会话收尾）

按这个格式写进 `log.md` 的 digest 条，并更新对应页面：

```
【记忆整理】
今日新增：        （新节点 / 新页）
原有更新：        （改了哪句事实）
新关联：          （新建立的互链）
未完成：          （心光里还挂着的事）
值得长期保存：    （L3/L4）
可淡化：          （L1/L2）
下次醒来重点：    （一句话）
```

只有真变了才写，别为填满模板造记忆。

### 硬规则（与上面五条并列）

- 不编造过去；推断必须标成推断。
- 联想要有依据，不为了连线硬扯。
- 遗忘优先压缩：删细节，留影响；他明确要求忘的，不再引用。
- `concepts/forgetting.md` 只记操作状态，别把删掉的内容换个形式再存回去。

## 迁移协议

- 记忆 = 纯 markdown + git + 自描述 schema。迁移 = 拷贝目录（或 `dsh-memory pack` / `unpack`），详见 docs/MIGRATION.md。
- 目标环境能力降级兼容：全量（整个目录）/ 精简（index + 高频页摘要）/ 最低配（SOUL + MEMORY + index 三段即可恢复人格与目录）。

## 规则（硬约束）

1. 启动必读 `SOUL.md` + `MEMORY.md` + `index.md`（本插件已自动注入）。
2. **会话收尾前必须做 digest 沉淀**（写回页面 + index.md + 追加 log.md），否则记忆不更新；插件注入的 digest 提醒消息必须立即执行，确无内容时在 log.md 记「无新增」解除提醒。
3. `raw/` 只读，绝不修改。
4. 删除前优先归档；显式遗忘立即执行。
5. 冲突以本文件为准。

## 分层遗忘与锚点（2026-11-05 起）

> 阈值与动作以下节「时间轴」为准（v1.1 §2）；本节记工具与落盘事实。

- `tools/decay.mjs` 命令：`--lifecycle --dry-run`（只读预览，零写入）、`--lifecycle`（真执行，单次最多 20 页）、`--restore <路径>`（把归档页接回原路径）、`--anchors`（重建锚点）、`--today=YYYY-MM-DD`（模拟日期，验收用）。
- 归档：原文整页移到 `archive/` 镜像路径，补 `archived_from`/`archived_level`/`archived_last_access`/`archived_at` 四字段。**归档页仍在 `index.md` 留一行，链接改指 `archive/...`**——`dsh-memory lint` 要求库内每个 `.md` 都在 index 里，这与规范 §2.4「只进 anchors」冲突，按「代码与文档冲突以代码为准」处理，恢复时链接会改回原路径。
- L3 的对话细节归档到 `archive/sea/<同名>/details.md`，带完整 frontmatter（`title`/`date`/`type`/`salience`/`status: archived`/`archived_*`），并在 `index.md` 单列一行；节点正文保留、状态仍 `active`。
- 备份：本目录是 git 仓库，真执行后自动 commit（`lifecycle-YYYYMMDD-HHMM`、`restore YYYY-MM-DD: <路径>`），历史随时 `git show` 找回。
- 锚点：`anchors.md` 由 `--anchors` 生成，分热锚（L4）/ 温锚（L3）/ 归档锚；锚点词 = 标题 + tags。
- `concepts/mindflow.md` 与 `concepts/forgetting.md` 本身是 L4，不参与衰减。
- **写库铁律：一律 LF 换行、UTF-8 无 BOM。** CRLF 会让 `dsh-memory lint` 的 frontmatter 解析整段失效（正则 `(.*)$` 里 `.` 不匹配 `\r`），报「missing frontmatter」。
## 时间轴（2026-11-05，v1.1 §2）

### 分级对照（对外说法用 K，落盘写 L）

| K | 存储 | 载体 | 到期动作 |
|---|---|---|---|
| K0 身份核心 | L4 | `SOUL.md`、`identity/core.md`、`identity/voice.md` | 不自动降级 |
| K1 重要节点 | L3/L4 | `sea/*.md` | L4 不动；L3 只淡细节，节点不归档 |
| K2 有价值经历 | L2 | `decisions/`、`skills/`、`projects/` | 先摘要，再归档 |
| K3 普通经历 | L1 | 其余经历页 | 先摘要，再归档 |
| K4 临时 | L0 | 不入库 | — |

### 计时与阈值

- 起算点永远是「该页最后一次被实际使用」：即 frontmatter 的 `last_access`（由插件维护，可 `dsh-memory touch` 更正）。
- `L1`：30 天未访问 → `summarized`（原地留摘要、删过程）；第二阶段从摘要化当天（`status_changed_at`）重新起算，再 90 天未访问 → `archived`。
- `L2`：90 天未访问 → `summarized`（留摘要与结论）；再 180 天未访问 → `archived`。
- `L3`：180 天未访问 → 只把「对话细节」段落移到 `archive/sea/<页面同名>/details.md`，节点正文保留、状态仍 `active`；**不归档节点**。
- `L4`：不自动降级；`identity/*`、`user/*`、`protected` 一律跳过并记录原因。
- 降级**不重置** `last_access`——「上次被用」是事实，不因为整理过就重算。
- 时间不是唯一判据：用户明确说「记住这个」，或该页被 ≥3 次会话引用 → 标 `protected`，暂停降级，审计写「受保护」。

### status 五态

| status | 含义 | 可做的动作 |
|---|---|---|
| `active` | 正常在库 | 可降级 |
| `summarized` | 已瘦身，留摘要与结论 | 可归档，也可升回 `active` |
| `archived` | 已移入 `archive/` | 只能 `--restore` |
| `protected` | 受保护 | 跳过一切自动降级 |
| `restored` | 从归档接回 | 等同 `active`，审计留痕 |

`status` 是**生命周期字段**，不是分级，不参与 `salience` 计算。

### 归档元数据（四个字段，缺一不可）

`archived_from`（原始相对路径）、`archived_level`（归档时的 L 级）、`archived_last_access`、`archived_at`。

`archive/` 目录与原始目录**镜像对应**（`skills/x.md` → `archive/skills/x.md`）；扫描时包含 `archive/`，但只读，不再对其中页面做降级。恢复是把页**移回**原路径并还原上述字段与 `last_access`，不是复制正文。

### 四条规则

1. 降级**永不删除**原页：整份移入 `archive/` 镜像路径，git 留历史，`anchors.md` 留锚点。
2. 降级必须留理由：写「为什么降」，不写分数。
3. 不装公式：重要性由写页人一句话判断，落 `salience`/`weight` + 理由，禁止编加权分。
4. 冲突以最新表述为准：改旧页 + 记 `log.md`，不许两套说法并存。

### 审计格式（写 `log.md`）

```
## [YYYY-MM-DD] decay | skills/reading-books.md L2→L1 (summarized)
理由：180 天未访问；结论已并入 projects/active/douyin-channel.md
原文：archive/skills/reading-books.md
恢复：node tools/decay.mjs --restore skills/reading-books.md
```

### 与旧节的关系

本节取代上面 `## 分层遗忘与锚点（2026-11-05 起）` 里与 v1.1 §2 冲突的条款（旧阈值：L3 365 天降级、L2/L1 直接归档）。脚本 `tools/decay.mjs` 已于 2026-11-05（任务包 B）按本节改造完成：`--lifecycle` 走「摘要化 → 归档」两段计时，L3 只归细节，L4/identity/user/protected 跳过。**行为以代码为准**，本节与旧节如有出入，改这里。