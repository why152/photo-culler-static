# 性能稳定性

**What to build:** 作为摄影者，我在长目录（数百张 6000×4000 JPEG）中扫描、审核、打开 Photo Viewer 和恢复 review batch 时，页面不会因渲染进程内存过大而崩溃，分析进度更新不会触发整页重建。

**Boundaries:**

- 不改变 photo group、review decision、review batch 或 movement journal 的语义。
- 不改变 Photo Viewer 显示 analysis source（全分辨率 JPEG）的行为，也不改变键盘/筛选/移动/恢复的既有契约。
- 浏览器证据继续只使用隔离的临时目录。

**Performance constraints:**

1. JPEG analysis 逐张完成后，只增量更新该 photo group 的 grid item 与 filmstrip item；不再对每张完成触发整页 `render()`。
2. moved panel 的 DOM 与 object URL 只在 `movedBatches` 实际变化时重建；其预览使用降采样小图，而不是全分辨率原图。
3. grid / filmstrip / moved 的 `<img>` 使用 `loading="lazy"` 与 `decoding="async"`，避免一次性解码全部缩略图。
4. worker 对大文件（>1MB）在解码时直接降到 analysis 长边尺寸，避免每次全分辨率解码。
5. 相同的可见集合下，grid 与 filmstrip 原地更新节点，不重复 `replaceChildren`。

**Verification:**

- `npm run check`、Node 单元测试、Chrome E2E 全部通过。
- 新增的浏览器测试用 60+ 张照片覆盖分析完成、viewer 打开、moved panel 打开与恢复，且控制台无错误。
