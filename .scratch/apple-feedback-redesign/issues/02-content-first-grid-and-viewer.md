# 02 — 内容优先的 grid 与 Photo viewer

**What to build:** 作为摄影者，我可以在跟随系统外观的简洁照片网格中浏览 photo group，点击缩略图仍进入深色的沉浸式 Photo viewer；大图和缩略图准备期间都有就地提示，既不阻断已有内容，也不改变既有审核操作。

**Blocked by:** 01 — Operation feedback 与渐进 JPEG 分析.

**Status:** completed

- [x] 外层具有简洁、现代、系统自适应的视觉层级；照片是主内容，目录/筛选/密度构成安静的工具栏。
- [x] 现有 Photo viewer 行为、返回焦点、连续导航、review decision 和 filmstrip 语义不变，并以固定深色画布突出分析 source。
- [x] Viewer 图像和未生成缩略图的 filmstrip 提供局部 busy/placeholder 状态，无全局加载遮罩。
- [x] Chrome 视觉和行为测试覆盖浅/深外观、Viewer busy 结束、键盘焦点和 Reduce Motion 信息可读性。

## Comments

Created from the Apple HIG feedback and visual redesign specification.

Completed with system appearance coverage, a fixed dark Photo Viewer canvas, local viewer-image feedback, and rendered grid/viewer inspection.
