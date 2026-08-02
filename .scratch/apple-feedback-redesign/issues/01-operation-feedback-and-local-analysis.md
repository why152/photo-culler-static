# 01 — Operation feedback 与渐进 JPEG 分析

**What to build:** 作为摄影者，我在选择照片文件夹后立即看到本地读取反馈；发现 photo group 后，在同一位置看到诚实的 JPEG 分析进度和数量，并可以在已完成的 photo group 出现时开始审核，而不是面对像卡死的页面。

**Blocked by:** None — can start immediately.

**Status:** completed

- [x] 目录读取的未知总量状态、已知总量的 JPEG 分析状态、完成和错误状态具有不同且可访问的 operation feedback。
- [x] UI 复用现有 Review Workspace 回调，不引入虚假进度或改变 JPEG-first / photo group 文件边界。
- [x] 未准备缩略图的卡片保留稳定尺寸和明确文本；准备完成后只替换该 photo group 的可见内容。
- [x] Node 与 Chrome 测试证明阶段、数量、渐进可用性和错误反馈，且不上传图片。

## Comments

Created from the Apple HIG feedback and visual redesign specification.

Completed with the OperationFeedback public seam, stable pending thumbnail cards, and delayed-worker Chrome coverage.
