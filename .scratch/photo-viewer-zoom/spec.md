# Photo Viewer 缩放与平移

**Status:** completed

**What to build:** 作为摄影者，我可以在 Photo Viewer 中用鼠标滚轮或触控板捏合按光标位置缩放，放大后拖拽平移，并通过按钮或键盘回到适合窗口，从而看清长图细节；该能力不改变现有审核与导航契约，也不为缩放重新解码原图。

**Boundaries:**

- 不改变 photo group、review decision、review batch 或 movement journal 的语义。
- 不改变 `1 / 2 / X`、`Space / J`、`← / →`、`Esc` 与 `0`（取消决定）的既有契约；适合窗口使用 `Ctrl/Cmd+0`。
- 缩放只作用于当前 Photo Viewer 的 analysis source，不改变 grid / filmstrip 的渲染。
- 保持有界内存：缩放使用 CSS transform，不创建新的 object URL、不生成额外的全分辨率位图。

**Interaction design (Apple HIG / Photos 参考):**

1. 滚轮与触控板捏合以光标为锚点缩放，25% 步进，范围为适合窗口的 1x–8x。
2. 放大后按住图片拖拽平移；光标在可平移时显示 grab，平移中显示 grabbing。
3. 双击图片在适合窗口与 2x 之间切换；再次双击回到适合窗口。
4. Photo Viewer 工具栏提供放大、缩小、适合窗口三个带可访问名称的按钮，并显示当前缩放百分比。
5. `+` / `=` 放大、`-` / `_` 缩小、`Ctrl/Cmd+0` 适合窗口。
6. 切换相邻照片、跳转 filmstrip 或关闭 Photo Viewer 时自动复位到适合窗口。

**Verification:**

- `ViewerZoom` 单元测试覆盖 contain 几何、光标锚点保持、平移边界钳制、复位与缩放上下限。
- Chrome E2E 覆盖滚轮缩放、拖拽平移、双击切换、按钮/键盘操作、切换照片与关闭复位，并断言无控制台错误。
- `npm run check`、Node 单元测试、Chrome E2E 全部通过。
