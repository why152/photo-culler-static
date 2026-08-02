# 04 — Gallery 可访问性与安全回归验收

**What to build:** 作为摄影者，我可以可靠地在缩略图、Photo Viewer、filmstrip、筛选控件和批量栏之间操作，且浏览、审核与选择不会触发文件移动；作为维护者，我可以用常规测试入口验证这些行为没有回归。

**Blocked by:** 02 — Photo Viewer 胶片带与连续审核; 03 — 缩略图显式 Action Selection 与批量操作栏.

**Status:** completed

- [ ] 所有新增交互都有可访问名称、可见焦点与预期键盘路由；空筛选与边界导航提供明确反馈。
- [ ] 浏览器全流程覆盖从打开目录、打开/关闭大图、连续审核、筛选、单项与范围选择到批量栏，且控制台无错误。
- [ ] 浏览器请求审计证明图片仍来自本地 analysis source；已有 JPEG-first、movement journal、完整 photo group 与恢复回归保持通过。
- [ ] 常规测试、语法检查和人工渲染检查共同证明发布站点包含完整 gallery 交互。

## Comments

Created from the approved Google Photos-style viewer specification.

Completed with accessible controls, empty-filter feedback, browser source-directory invariants, full test and syntax passes, and visual rendering inspection.
