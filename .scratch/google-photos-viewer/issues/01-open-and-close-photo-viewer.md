# 01 — 从缩略图打开并关闭 Photo Viewer

**What to build:** 作为摄影者，我可以单击 photo grid 中任一 photo group 的缩略图，进入以其 analysis source 为中心的大图 Photo Viewer，并用关闭按钮或 Escape 回到原缩略图及原来的滚动位置；当前查看不会写入 review decision、action selection 或文件系统。

**Blocked by:** None — can start immediately.

**Status:** completed

- [ ] 点击缩略图只打开其完整 analysis source 的 Photo Viewer，不再显示固定右侧检查器。
- [ ] Viewer 提供可访问的关闭按钮、Escape 关闭、当前项位置和相邻 visible photo group 的左右导航。
- [ ] 关闭 Viewer 后，原缩略图恢复键盘焦点且不丢失长网格中的滚动位置。
- [ ] Chrome 浏览器测试证明打开、相邻导航和关闭不修改 review decision、action selection 或文件。

## Comments

Created from the approved Google Photos-style viewer specification.

Completed with GalleryInteraction unit coverage and Chrome Photo Viewer open, adjacent navigation, and focus-return coverage.
