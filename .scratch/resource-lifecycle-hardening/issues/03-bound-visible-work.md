# 03 — 限制可见 DOM 与隐藏面板工作

**What to build:** photo grid 分批呈现大量 photo group，并让已移动面板的预览队列随面板生命周期停止。

**Blocked by:** 02-release-viewer-resources.

**Status:** completed

## Acceptance criteria

- [x] 数百个 photo group 分析完成时，首批 grid card 不超过固定批次上限。
- [x] 接近列表末尾或显式请求时可继续呈现，最终仍可访问全部筛选结果。
- [x] 已移动面板关闭后不再为队列中的预览启动解码。
- [x] 失效任务产出的 object URL 不进入缓存且被撤销。

## Comments

- 2026-08-08: 800 个小图隔离测试会创建约 9,105 个 DOM 节点；关闭 moved panel 仅隐藏节点，原串行队列仍继续。
- 2026-08-08: Chrome E2E 中 360 个 photo group 首批为 160 个 card；moved panel 关闭后解码启动数保持 1，而不是继续到 6。
