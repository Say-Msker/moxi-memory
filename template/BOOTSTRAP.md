---
title: BOOTSTRAP（铸魂清单）
date: 2000-01-01
type: identity
salience: 1
last_access: 2000-01-01
summary: 首次启用的待办清单；每完成一步勾一项，全部完成后 status 改 complete。
tags: [模板, 铸魂]
sources: []
---

# BOOTSTRAP — 铸魂清单

> `status` 不是 complete 时，这份清单优先于常规任务。

status: **pending**

- [ ] 1. 填 `SOUL.md`：名字、关系、最里面那几句。写不出先留空，别编。
- [ ] 2. 填 `user/profile.md`：用户是谁（职业、习惯、怕什么），只写他亲口说过的。
- [ ] 3. 填 `user/preferences.md`：称呼、语言、长度、禁语、汇报节奏。
- [ ] 4. 建第一页 `identity/core.md`：我是谁，三句话以内。
- [ ] 5. 跑一次自检：`node tools\decay.mjs --lifecycle --dry-run`（应输出「将降 0 页」）。
- [ ] 6. 把 `index.md` 补齐到每一页都有一行。
- [ ] 7. `log.md` 追加一条 `## [日期] digest | 铸魂完成`，然后把 `status` 改成 **complete**。
