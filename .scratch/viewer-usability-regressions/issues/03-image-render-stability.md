# 03 — 加载与选择时的图片渲染稳定性

**What to build:** 作为摄影者，我可以在 JPEG analysis 仍在加载或选择 photo group 时保留已经呈现的缩略图和 analysis source，而不会看见闪烁。

**Blocked by:** none.

**Status:** completed

- [x] selection 或 operation feedback 重渲染不替换未变化缩略图的图片节点或 source。
- [x] 同一 photo group 仍在 viewer 中时，进度更新不重新加载其 analysis source。
- [x] Chrome 回归测试只使用隔离目录，证明加载与选择都不触发额外图片呈现。
