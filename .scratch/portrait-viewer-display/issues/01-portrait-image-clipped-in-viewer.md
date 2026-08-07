# 01 — 大图中竖屏图被裁切

**What to build:** 修复 Photo Viewer 中竖屏 analysis source 只显示一部分的问题，并防止该布局回归。

**Blocked by:** none.

**Status:** completed

## Root cause (evidence)

- 实际诊断：natural `480×720`、frame `1116×562`、img 元素 `1116×1674`；`height: 100%` 被解析为按宽高比自动高度，容器 `overflow: hidden` 裁掉下部。
- 最小复现：`display: grid` + `place-items: center` 容器内的 `<img style="height:100%">` 得到 1674px；同容器改为块级布局后得到 562px。

## Changes

- [x] `site.css`：`.viewer-image-frame` 改为 `display: block`；busy 指示器改为 absolute 居中。
- [x] `portrait-viewer.spec.mjs`：竖屏/横屏完整显示与缩放回归 E2E。

## Comments

- 2026-08-08: 该回归由 Photo Viewer 缩放功能引入的布局改动造成；块级容器 + `object-fit: contain` 保持等比完整显示。
- 2026-08-08: 实施完成并复核；Node 28/28、Chrome 31/31 通过，竖屏与横屏完整显示、缩放/切换/关闭均无回归。
