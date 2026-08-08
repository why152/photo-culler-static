# 资源生命周期加固

**Status:** completed

**What to build:** 作为摄影者，我可以连续切换长目录、反复打开和关闭 Photo Viewer、浏览大量 photo group 以及开关已移动面板，而不会保留上一轮分析、全分辨率预览或隐藏面板的后台工作。

**Boundaries:**

- 不改变 photo group、review decision、review batch、movement journal 或 Photo Viewer 导航语义。
- 目录分析取消由 Review Workspace 与浏览器分析器共同负责；页面不感知 worker 细节。
- 大目录优化保持所有 photo group 可审核，不丢弃或改变筛选结果。
- 浏览器证据只使用隔离的临时目录或 OPFS 测试数据。

**Performance constraints:**

1. 新目录开始读取后，上一目录的分析信号立即取消，旧 worker 终止，迟到进度与结果全部失效。
2. Photo Viewer 关闭或切换 analysis source 时，旧 `<img>` source、事件处理器与 object URL 在同一生命周期内释放。
3. photo grid 首屏 DOM 数量有固定上限，后续 photo group 按需分批呈现。
4. 已移动面板关闭后不再启动新的降采样解码；已经完成但失效的 URL 立即撤销。
5. analysis cache 从 v1 无损迁移到有界 v2 存储，最多保留 2,000 条。

**Verification:**

- 每条生命周期契约先有失败测试，再实施修复。
- `npm run check`、Node 单元测试、Chrome E2E 全部通过。
- 使用数百个隔离 photo group 验证首屏 DOM 上限、目录切换、Viewer 关闭与 moved panel 关闭。

## Verification result

- 32 个 Node 测试、37 个 Chrome E2E 全部通过，包含 v1 缓存迁移回归。
- 67 张 6000×4000、单张约 13.1 MB（合计约 879 MB）的隔离 JPEG 在 10.5 秒完成分析，页面为 584 个 DOM 节点。
- 三轮不同全分辨率 Viewer 打开/关闭后均为 `viewer src = null`、filmstrip 图片 0、DOM 584；Chrome 进程树回收后约 229 MiB，没有逐轮增长。
