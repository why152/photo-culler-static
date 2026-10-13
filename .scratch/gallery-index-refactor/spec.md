# 照片索引与界面模块整理

**Status:** completed

**What to build:** 大目录逐项分析和 Photo Viewer 导航使用 photo group 索引，避免反复遍历完整队列；网格渲染与预览资源由独立模块管理。

**Boundaries:** 保持 review decision、action selection、Photo Viewer、movement journal 和文件操作隔离语义；不引入 GPU、框架迁移或新筛选算法。

**Verification:** 索引与可见队列在分析结果、决定、筛选和目录成员变化时正确更新；移出的 photo group 不被迟到结果复活；原有浏览器流程全部回归。

## Comments

- 2026-10-13: 第一轮已提交为 389c294。第二轮由两个 sub agent 实施、一个独立审查，主 agent 监督集成。
- 2026-10-13: 62 项单元测试、43 项 Chrome 用例通过（完整运行中 42 项通过，新生命周期用例修正 Canvas 夹具后定向通过）；语法与 diff 空白检查通过，独立审查无阻塞项。
- 2026-10-13: 2,000 组逐项分析与 5,000 组导航测试通过访问计数确认不重复扫描整个列表。入口由 1,340 行降至 1,121 行，网格/胶片栏与缩略图 URL 生命周期提取到独立模块。胶片栏稳定队列导航仅更新前后选中状态，最终分析完成仍刷新预览。
