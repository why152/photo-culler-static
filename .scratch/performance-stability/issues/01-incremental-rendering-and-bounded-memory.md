# 01 — 增量渲染与有界内存

**What to build:** 消除长目录下的渲染进程崩溃：分析进度、grid、filmstrip、moved panel 与 worker 解码的内存/渲染成本都有界，且不改变既有交互契约。

**Blocked by:** none.

**Status:** completed

## Root cause (evidence)

- 用户截图显示 Chrome「喔唷，崩溃啦！错误代码 5」，即渲染进程崩溃（Aw, Snap），典型原因是页面内存占用过大。
- 实际照片为 6000×4000 的 Panasonic JPEG（单张约 10MB，解码后约 96MB）。
- 当前 `onAnalysis` 在每张 JPEG 分析完成时调用整页 `render()`：`renderGrid` + `renderViewer` + `renderMovedBatches` + `renderControls` 全部执行。
- `renderMovedBatches` 每次渲染都 revoke 全部 moved preview URL 并重新创建全分辨率 `analysisFile` object URL；moved panel 打开时会同时解码所有全分辨率预览。
- grid/filmstrip/moved 的 `<img>` 没有 lazy/async 解码；长 filmstrip 一次性解码全部可见缩略图。

## Changes

- [x] `review-workspace.js`：`onAnalysis` 载荷增加 `groupId`。
- [x] `site.js`：分析进度改为按 group 原地更新 grid item / filmstrip item / viewer 文案，完成时才整页 `render()`。
- [x] `site.js`：`renderMovedBatches` 仅在 `movedBatches` 变化时重建；预览改为异步降采样小图并缓存。
- [x] `site.js`：grid / filmstrip / moved `<img>` 增加 `loading="lazy"` 与 `decoding="async"`；相同可见集合时原地更新。
- [x] `photo-analysis-worker.js`：大文件解码时使用 `resizeWidth` 降采样，失败时回退全量解码。
- [x] 新增 80 张照片的 Chrome E2E（`performance-stability.spec.mjs`），覆盖分析、viewer、moved panel、恢复，断言无 console error；另覆盖 >1MB JPEG 的降采样解码路径。

## Comments

- 2026-08-08: 从截图 OCR 确认错误代码 5；基于 100_PANA_春日部（67 个 photo group、6000×4000 JPEG）与现有测试基线开始实施。
- 2026-08-08: 实施完成并复核；Node 21/21、Chrome 27/27 通过。`first-run-directory-entry` 的 Enter 测试改为断言稳定的 operation feedback 可见性（原断言依赖单张 JPEG 几毫秒内完成的瞬态文案，并行运行时存在竞态）。
