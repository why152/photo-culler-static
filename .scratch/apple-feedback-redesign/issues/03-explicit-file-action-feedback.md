# 03 — 显式 Action selection 与文件操作反馈

**What to build:** 作为摄影者，我在明确选择 photo group 后看到精炼的批量 action selection；开始移动或恢复时能看到本次可恢复文件操作的真实进度、结果和失败说明，而浏览和 review decision 继续完全不触发文件改动。

**Blocked by:** 01 — Operation feedback 与渐进 JPEG 分析.

**Status:** completed

- [x] 批量栏清晰区分 action selection 数量、可恢复移动的确认入口和当前 movement/restore operation feedback。
- [x] 移动和恢复显示 photo group 与文件的确定性进度、成功/错误结果；其文案不会覆盖 JPEG 分析或 Viewer 状态。
- [x] 选择/取消选择、查看大图和 review decision 均不执行文件操作；已有 movement journal 和冲突拒绝保持可恢复。
- [x] Chrome 测试用隔离目录验证确认前后、成功、失败/取消与网络/本地文件边界。

## Comments

Created from the Apple HIG feedback and visual redesign specification.

Completed with independent move/restore progress, completion feedback, and Chrome recoverable move/restore coverage using an isolated browser directory.
