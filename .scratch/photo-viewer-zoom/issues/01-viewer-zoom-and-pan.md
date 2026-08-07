# 01 — Photo Viewer 滚轮缩放与拖拽平移

**What to build:** 在 Photo Viewer 中提供以光标为锚点的缩放、放大后的拖拽平移、双击切换与明确的复位路径，同时不破坏既有审核/导航契约和有界内存约束。

**Blocked by:** none.

**Status:** completed

## Changes

- [x] `viewer-zoom.js`：contain 几何、锚点缩放、平移边界钳制、复位与 1x–8x 上下限。
- [x] `index.html` / `site.css`：工具栏增加放大、缩小、适合窗口按钮与缩放百分比；图片帧裁剪并显示 grab/grabbing 光标。
- [x] `site.js`：滚轮/捏合缩放、拖拽平移、双击切换、`+ / -` 与 `Ctrl/Cmd+0`；切换照片或关闭时复位。
- [x] `viewer-zoom.test.mjs` 与 `viewer-zoom.spec.mjs`：单元与 Chrome E2E 覆盖。

## Comments

- 2026-08-08: 参考 Apple Photos/HIG 的全屏内容层与等价输入路径设计；缩放采用 CSS transform，不新增解码内存，兼容上一轮的性能稳定性约束。
- 2026-08-08: 实施完成并复核；Node 28/28、Chrome 29/29 通过。`1/2/X`、`Space/J`、`←/→`、`Esc` 与 `0`（取消决定）的既有测试全部保持通过。

## Release evidence

- `66400c9` — `feat: zoom and pan Photo Viewer with wheel, drag, and keyboard`
- [GitHub Pages workflow #31200120943](https://github.com/why152/photo-culler-static/actions/runs/31200120943) completed successfully for the same commit SHA.
- Cache-busting public fetches returned the zoom toolbar and a `site.js` SHA-256 identical to local output.
- Final validation: 28 Node tests, 29 Chrome tests, syntax checks, and `git diff --check` all passed.
