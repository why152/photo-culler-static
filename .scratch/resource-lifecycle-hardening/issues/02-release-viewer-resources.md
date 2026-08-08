# 02 — 释放 Photo Viewer 资源

**What to build:** Photo Viewer 关闭与 analysis source 切换都统一清除全分辨率图片 source、事件处理器并撤销 object URL。

**Blocked by:** 01-cancel-stale-analysis.

**Status:** completed

## Acceptance criteria

- [x] 关闭后 `#viewer-image` 不再持有 `blob:` source。
- [x] 对应 object URL 已被撤销，filmstrip 节点与 URL 同时释放。
- [x] 重新打开、导航、缩放与焦点返回契约保持不变。

## Comments

- 2026-08-08: 真实 Chrome 复现关闭后 dialog 虽隐藏，但 `<img>` 仍持有上一张全分辨率 Blob URL。
- 2026-08-08: 高分辨率三轮打开/关闭后 `src`、filmstrip 与 DOM 均回到同一基线。
