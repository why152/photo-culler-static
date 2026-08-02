# 03 — 浏览器本地安全移动与整批撤销

**What to build:** 作为摄影者，我可以从静态网页把标记 photo group 移到同目录的 review batch，并在中断或重开后发现操作记录、查看进度、拒绝覆盖冲突并完整撤销该批次。

**Blocked by:** 01 — 静态站点与本地目录扫描。

**Status:** ready-for-agent

- [ ] 移动在每个文件成员前后更新同目录的 movement journal，且完整 photo group 从不拆分。
- [ ] 操作失败或页面重开后仍能发现已完成和中断 review batch。
- [ ] 批量恢复在目标冲突时拒绝覆盖，在无冲突时复原全部成员并清理空 batch。
- [ ] Chrome/Edge 复制目录测试覆盖 move、interruption recovery、conflict 和整批撤销。

## Comments

Created from the approved static frontend migration specification.
