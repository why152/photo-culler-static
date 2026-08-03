# 01 — 紧凑的首次目录入口

**What to build:** 作为首次打开 Photo Culler 的摄影者，我看到一个紧凑、可理解、可点击且可键盘操作的目录选择入口；选择目录后，我进入既有 photo group 工作区，不失去任何本机文件安全行为。

**Blocked by:** None — can start immediately.

**Status:** completed

- [x] 首次工作区只有一个显著的“选择照片文件夹”主动作，并在附近明确说明照片只在本机读取和处理。
- [x] 初始状态不显示重复顶部目录动作、空闲 operation feedback、无 recoverable review batch 的按钮或无内容 review rail。
- [x] 目录选择沿用既有本机流程；目录接受后显示 photo group 网格、review rail 和“选择其他文件夹”。
- [x] Chrome 测试验证可访问名称、可见焦点、Enter/Space、指针按压态、初始层级、即时扫描反馈与后续工作区切换。

## Comments

Implemented test-first from the user-confirmed compact-entry design and Apple HIG research.
