# 04 — 可访问性收尾、视觉验收与 Pages 发布

**What to build:** 作为摄影者，我在鼠标、键盘、浅/深系统外观和减少动态效果下都能理解进度并可靠审核；作为维护者，我可以用全套浏览器与线上证据确认 Apple 式重设计已发布且没有退回到无反馈卡顿感。

**Blocked by:** 02 — 内容优先的 grid 与 Photo viewer; 03 — 显式 Action selection 与文件操作反馈.

**Status:** in_progress

- [ ] 所有反馈、选择、Viewer、筛选和文件动作有可见焦点、可访问名称及 `aria-live` 状态；图标命中区充分且状态不只靠颜色。
- [ ] `prefers-reduced-motion` 下，状态、数字和进度完整可读而不依赖动画。
- [ ] 常规 Node/Chrome 测试、语法/差异检查及有照片的视觉截图全部通过，未发生真实照片访问或网络上传。
- [ ] 重设计提交到 main，GitHub Pages 工作流成功，公开站点以新提交返回页面与模块。

## Comments

Created from the Apple HIG feedback and visual redesign specification.
