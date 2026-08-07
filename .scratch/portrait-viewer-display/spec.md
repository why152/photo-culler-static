# 竖屏大图完整显示修复

**Status:** completed

**What to build:** Photo Viewer 打开竖屏（人像方向）analysis source 时完整显示整张照片，不再只显示顶部裁切区域；横屏显示、缩放、平移、切换与关闭行为保持既有契约。

**Root cause:**

`.viewer-image-frame` 使用 `display: grid; place-items: center` 时，Chrome 对带固有宽高比的 `<img>` 会把 `height: 100%` 按 `auto`（宽高比）解析。竖屏图元素因此按宽度等比撑到 1674px（远超容器 562px），再被 `overflow: hidden` 从顶部裁切，只显示图片上部。

**Fix:**

- 图片容器改为块级布局；`<img>` 以 `width: 100%; height: 100%; object-fit: contain` 充满容器，由 `object-fit` 完成等比居中。
- busy 指示器改为 `position: absolute` 并 `top/left: 50%` 居中，不再依赖 grid 对齐。

**Verification:**

- Chrome E2E 断言竖屏/横屏下 `<img>` 元素与容器尺寸一致（≤1px 容差）、`object-fit: contain`，且竖屏缩放与关闭/重开无回归。
- `npm run check`、Node 单元测试、Chrome E2E 全部通过。
