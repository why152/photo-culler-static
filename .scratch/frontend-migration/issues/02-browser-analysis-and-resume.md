# 02 — 浏览器内技术初筛与审核续接

**What to build:** 作为摄影者，我可以在静态页面中看到不阻塞交互的保守技术初筛结果，并用现有审核决定和筛选流程继续工作；刷新或重新授权同一目录后可以恢复审核进度。

**Blocked by:** 01 — 静态站点与本地目录扫描。

**Status:** ready-for-agent

- [ ] JPEG 分析和缩略图生成在浏览器侧完成，RAW/XMP 不被解码。
- [ ] 明显模糊、极黑、极白和读取失败的分类符合保守初筛语义。
- [ ] review decision、选中项、候选和显示偏好可在同一目录重开后恢复。
- [ ] 复制照片目录上的浏览器测试覆盖分析、缓存失效和审核续接。

## Comments

Created from the approved static frontend migration specification.
