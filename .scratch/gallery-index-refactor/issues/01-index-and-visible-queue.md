# 01 — 索引与可见队列

**Status:** completed

**Blocked by:** none.

**Acceptance criteria:** 单项分析通过索引更新；审核状态仅在成员变化时校验；缓存队列正确处理原位 review decision 修改、过滤和成员变化；减少重复遍历。

## Comments

- 2026-10-13: workspace_round1 负责实现，audit_round1 审查。
- 2026-10-13: 工作区通过 ID 索引更新原对象；移动和恢复重建成员索引；图库缓存可见队列和位置，决定/撤销显式失效。访问计数和迟到结果回归通过。
