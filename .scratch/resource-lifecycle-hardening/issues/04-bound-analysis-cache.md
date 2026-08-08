# 04 — 限制分析缓存增长

**What to build:** 将旧版无上限 IndexedDB analysis store 迁移为有时间索引且条目数有上限的缓存，并在页面卸载时关闭数据库连接。

**Blocked by:** 03-bound-visible-work.

**Status:** completed

## Root cause (evidence)

- v1 analysis store 直接永久写入以文件签名为 key 的缩略图和技术分析，没有淘汰策略。
- 这不是即时 RAM 泄漏，但跨目录长期使用会无上限占用浏览器本地存储。

## Changes

- [x] 数据库升级到 v2，为旧记录增加 `cachedAt` 索引且保持旧分析可读。
- [x] 每次写入后把最旧记录裁剪到 2,000 条以内。
- [x] `beforeunload` 显式关闭数据库连接。
- [x] Chrome E2E 覆盖 5→3 淘汰与 v1→v2 迁移。

## Comments

- 2026-08-08: 独立数据库 E2E 验证最旧两条被淘汰，最新三条仍可读取。
