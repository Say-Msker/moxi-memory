# moxi-memory

> 一套给长期陪伴型 agent 用的**记忆协议**：怎么记、怎么忘、怎么迁、怎么不丢原文。
>
> 这不是一个人格，也不是一个能直接跑起来的分身。仓库里只有**规则、脚本和空模板**，不含任何人的私人记忆。

## 它解决什么

长期对话的 agent 会撞上四堵墙：

1. **上下文有限**：聊得越久，越必须把旧内容折起来，但折叠会丢细节。
2. **记忆该淡而不能丢**：不重要的记忆占着位置，重要的被挤掉。
3. **换机器就断片**：记忆散落在平台数据库里，搬不走。
4. **折叠会失败**：摘要调用超时或报错时，如果整轮请求跟着失败，用户那边就是「agent 不说话」。

这套协议对应四件事：**分层存**、**按时间与重要度降级但原文归档**、**全部落在 markdown 里可迁移**、**失败要能降级而不是崩掉**。

## 结构

```
<memory-root>/                 # 建议 %USERPROFILE%\.memory
├── SOUL.md                    # 我是谁（用户拥有最终编辑权）
├── MEMORY.md                  # schema：怎么记、怎么忘（本协议）
├── BOOTSTRAP.md               # 铸魂清单，complete 前优先
├── index.md                   # 路由表：每页一行
├── log.md                     # 时间线，append-only
├── anchors.md                 # 锚点：归档页靠它捞回来
├── identity/                  # 自我：core / voice / attention
├── user/                      # 关于用户：profile / preferences
├── sea/                       # 识海：一事一页的经历节点
├── skills/ decisions/ projects/ concepts/
├── archive/                   # 归档页（镜像原目录，只读）
├── raw/                       # 不可变源材料
└── tools/decay.mjs            # 生命周期脚本
```

分层与阈值、`status` 五态、归档四字段、审计格式，写在 [`docs/spec-v1.1.md`](docs/spec-v1.1.md)。

## 快速开始（Windows）

前置：Node ≥ 22；装了 `dsh-plugin-memory`（或任何按本协议读 markdown 的运行时）。

```powershell
# 1. 建库（把模板铺进 %USERPROFILE%\.memory）
powershell -ExecutionPolicy Bypass -File .\install.ps1

# 2. 填 SOUL.md：把 <!-- ... --> 换成你自己的话。空着比编好。

# 3. 自检
node tools\decay.mjs --lifecycle --dry-run   # 应输出「将降 0 页」
```

之后每次会话：启动读 `SOUL.md` + `MEMORY.md` + `index.md`；收尾写一条 digest 进 `log.md`。

## 工具

```powershell
node tools\decay.mjs                       # 干跑：列出候选（改什么、为什么）
node tools\decay.mjs --lifecycle --dry-run # 2.0 生命周期：只读预测，零写入
node tools\decay.mjs --lifecycle           # 真执行：摘要 / 归档 / L3 细节归档
node tools\decay.mjs --anchors             # 重建 anchors.md
node tools\decay.mjs --restore <路径>      # 把归档页接回原路径
node tools\decay.mjs --today=2028-01-01    # 模拟日期（验收用）
```

`--apply` 会走 git 自动提交；`--dry-run` 保证零写入（验收要求 `git status` 为空）。

## 三条硬规矩（踩过的坑）

1. **换行必须是 LF**。CRLF 会让 frontmatter 解析整段失效，lint 报「missing frontmatter」却找不出原因。
2. **写 JSON 别加 BOM**。PowerShell 默认 `Set-Content -Encoding UTF8` 会带 BOM，Node 的 `JSON.parse` 报 `Unexpected token '\ufeff'`。用 `[System.IO.File]::WriteAllText(..., UTF8Encoding($false))`。
3. **回滚方案不是备份文件**，是「能重装回原版本」。改任何 live 组件之前，先验证重装通路可用。

## 隐私

本仓库**不含**任何真实记忆页。模板里的占位符（`<!-- 用户 -->`）要你自己填；你的库应当留在本机，或推你自己的私有仓。

推之前先跑：

```powershell
powershell -File .\scripts\scan-sensitive.ps1
```

它会扫密钥前缀、绝对用户路径、手机号、邮箱。

## 许可

MIT。不承诺维护；这是一份从实际使用里长出来的协议，不是产品。

命名与设计来自使用者与 agent 的日常实践；生命周期脚本由另一条会话线实施并验收。

## 故事与完整说明

为什么要做成这样、我们丢过什么、三条硬规矩怎么踩出来的：[docs/story-and-guide.md](docs/story-and-guide.md)。
