# 02 — Photo Viewer 胶片带与连续审核

**What to build:** 作为摄影者，我可以在 Photo Viewer 底部浏览当前筛选结果的 filmstrip，直接跳转相邻 photo group，并在大图中连续设置或清除 review decision，而不会把机器技术提示误认为人工判断。

**Blocked by:** 01 — 从缩略图打开并关闭 Photo Viewer.

**Status:** completed

- [ ] Filmstrip、位置计数、方向键和箭头按钮都使用同一个当前可见 photo group 队列，并始终跟随当前项。
- [ ] Viewer 中保留 `1`、`2`、`X`、`0`、`Space`、`J` 的已确认 review decision 与未审核导航语义。
- [ ] 机器技术提示、人工 review decision、Viewer 当前项各有独立且可访问的表示。
- [ ] 修改筛选条件时，不可见的 Viewer 项会安全关闭并把焦点交还给筛选控件；浏览器测试覆盖该路径。

## Comments

Created from the approved Google Photos-style viewer specification.

Completed with a visible-queue filmstrip, continuous review shortcuts, safe filter closure, and Chrome coverage.
