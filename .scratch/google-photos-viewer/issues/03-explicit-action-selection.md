# 03 — 缩略图显式 Action Selection 与批量操作栏

**What to build:** 作为摄影者，我可以在 photo grid 中通过独立选择控件选择一个、多个或 Shift 连续范围的 photo group，看到明确数量与批量操作栏，并随时取消选择；普通缩略图点击始终打开 Photo Viewer。

**Blocked by:** 01 — 从缩略图打开并关闭 Photo Viewer.

**Status:** completed

- [ ] 缩略图悬停、键盘焦点和已选状态均提供可访问的 action selection 控件，不与打开 Viewer 的点击冲突。
- [ ] 支持单项选择、Shift 范围选择和 Escape 清空，且 action selection 不改变 review decision。
- [ ] 批量栏清楚显示完整 photo group 数量；它保留既有明确 review batch 文件动作入口，不由浏览或审核自动触发。
- [ ] 浏览器测试证明选择、清空和打开大图彼此独立，并且没有意外文件操作。

## Comments

Created from the approved Google Photos-style viewer specification.

Completed with explicit controls, Shift ranges, Escape clearing, and browser verification that selection does not replace Photo Viewer.
