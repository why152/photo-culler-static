# 01 — 取消过期目录分析

**What to build:** 新目录读取开始时中止上一轮 BrowserPhotoAnalyzer 工作，重建 worker，并隔离旧目录的进度、结果和错误。

**Blocked by:** none.

**Status:** completed

## Root cause (evidence)

- `ReviewWorkspace.openDirectory` 直接把调用方 `onProgress` 传给 analyzer，旧目录的迟到进度可以覆盖新目录反馈。
- `BrowserPhotoAnalyzer.analyze` 没有取消信号；切换目录后旧 worker 继续逐张解码大图。

## Acceptance criteria

- [x] 新目录打开会令旧分析的 `signal.aborted === true`。
- [x] 旧 worker 被终止，待处理 Promise 以 `AbortError` 结束，并为新目录创建干净 worker。
- [x] 旧分析的迟到 `onProgress` / `onResult` 不更新当前工作区。

## Comments

- 2026-08-08: 已用两个交错目录复现：新目录完成后，旧目录仍可把 operation feedback 改回旧计数。
- 2026-08-08: Node 与真实 Chrome 回归均确认旧 worker 终止一次，新目录 `1 / 1` 完成后不再被旧进度覆盖。
