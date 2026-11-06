# 怎么验这套东西真的能用

> 光看文档不算数。这份清单把「记得住 / 分得清 / 改得动 / 忘得掉」拆成 11 条能自己跑一遍的检查。
> 每条都写了**怎么造条件**和**看到什么才算过**。建议在副本上做，别拿真库试破坏性操作。

先准备：

```bash
node tools/lint.mjs --root <你的库目录>     # 干净时报 ok
```

---

## 一、结构完整性

**1. 最小可用五文件在位**

`SOUL.md` `MEMORY.md` `index.md` `log.md` `anchors.md` 五个都在，且 `MEMORY.md` 里写着「降级永不删除原页」。

**2. 每个页面都在 index 里**

造一个只建页、不进 `index.md` 的文件（比如 `sea/probe-orphan.md`），跑 lint：

```
error orphan page not in index.md: sea/probe-orphan.md
```

有这一行才算过——说明目录真的是路由表，不是摆设。

**3. index 里的链接都指得实**

在 `index.md` 加一行 `[假的](sea/not-exist.md)`，lint 应报：

```
error index.md 指向不存在的页：sea/not-exist.md
```

**4. trust 值域被校验**

把某页改成 `trust: maybe`，lint 应失败并指出合法值；四个合法值（`fact|infer|revision|unknown`）不该报错。

**5. summary 长度**

`summary` 超过 48 字时 lint 应报「summary 声明 N 字（上限 48）」。它要进 `index.md`，一行放得下才算合格。

---

## 二、遗忘（分层下降）

**6. 先空跑，确认只读**

```bash
node tools/decay.mjs --lifecycle --dry-run
```

输出里应有「扫描 N 页 / 将降 M 页 / 跳过 K 页（逐条原因）」。跑完之后 `git status` 必须是干净的——空跑写了一个字节就是 bug。

**7. 摘要与归档是两段计时**

造一个 L2 页：`status: active`，`last_access` 改成两年前，跑 `--lifecycle`。它应只变成 `status: summarized`（原地留摘要、删过程），**不会**直接进 `archive/`。

再把它改成 `status: summarized` + `status_changed_at: <再早 200 天>`，再跑一次，这次才归档：

```
[archive] concepts/probe.md L2→archived — L2 摘要后 200 天未访问
```

**8. 归档只移不删、字段齐全**

归档后确认三件事：

- 原路径文件消失、`archive/<原路径>` 出现
- 归档页多出 `archived_from` / `archived_level` / `archived_last_access` / `archived_at` 四个字段
- `git log` 里有这次 commit（历史没丢）

**9. 一条命令接回来，正文逐字节一致**

```bash
node tools/decay.mjs --restore concepts/probe.md
```

它应回到原路径、`status: restored`、`archive/` 里那份消失。校验正文（剥掉 frontmatter 再比）：

```bash
node -e "
const fs=require('fs');
const body=(p)=>fs.readFileSync(p,'utf8').replace(/^---[\s\S]*?\n---\n/,'');
const a=body('archive-backup.md'), b=body('concepts/probe.md');
console.log(a===b ? 'same' : 'DIFF');
"
```

（先归档前留一份副本，用于比对。）

**10. 连跑两次不再改动**

真执行一次 `--lifecycle` 后，再跑一次，输出应显示 `changedFiles: 0`。不幂等就说明判据在漂。

**11. 被纠正过的页不被自动瘦身**

给某页加 `revised_by: <另一页>`，跑 `--lifecycle`，跳过原因里应出现「带修订记录（revised_by），不自动降级」。旧账是证据，机器不许替你删。

---

## 三、真库操作纪律

- 动真库前先整份备份（含 `.git`）：
  ```bash
  cp -a ~/.memory ~/backups/memory-$(date +%Y%m%d-%H%M)
  ```
- 破坏性验证（归档、恢复、批量降级）一律在副本上做。
- 写库一律 **UTF-8 无 BOM、LF 换行**。CRLF 会让靠正则解析 frontmatter 的校验器静默失效——包括给你自己的 lint。
- 每次真执行 `--lifecycle` 后跑一次 lint；失败就先停，别继续叠加改动。
