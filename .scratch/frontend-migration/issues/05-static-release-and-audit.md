# 05 — 纯前端发布与迁移审计

**What to build:** 作为维护者，我可以把项目作为普通 HTTPS 静态站点发布，并有可重复的验证证明它不再含 Python、Flask、MLX 或服务端照片 API，同时保留本地文件安全边界。

**Blocked by:** 04 — 完整审核工作台与单组恢复。

**Status:** ready-for-agent

- [ ] 构建产物可由通用静态服务器提供，且 README 说明 HTTPS、Chrome/Edge 与本地权限边界。
- [ ] 旧 Python、Flask、SQLite、MLX 运行时代码、依赖和生产测试已移除或替换。
- [ ] 复制照片目录的浏览器端到端测试、静态部署测试和无网络照片请求审计均通过。
- [ ] 完成验证后，变更以有意图的提交同步到用户的 GitHub 仓库。

## Comments

Created from the approved static frontend migration specification.
