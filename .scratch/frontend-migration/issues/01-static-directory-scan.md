# 01 — 静态站点与本地目录扫描

**What to build:** 作为摄影者，我可以打开由 HTTPS 静态服务器提供的页面，确认 Chrome/Edge 的本地目录能力，显式选择一个照片目录，并看到非递归扫描出的 JPEG-first photo group 与预览；不支持的浏览器会得到明确说明。

**Blocked by:** None — can start immediately.

**Status:** claimed

- [ ] 静态页面不依赖任何本机 HTTP API 或 Python 运行时即可载入。
- [ ] 用户在一次明确点击后选择目录，应用只接受普通源目录并扫描其中的 photo group。
- [ ] 同 stem 的 JPEG、RW2、XMP 显示为一个 photo group，RAW-only 项目不显示。
- [ ] Chrome/Edge 浏览器测试证明预览来自用户授权的本地文件，且不产生照片上传请求。

## Comments

Created from the approved static frontend migration specification.

Claimed to implement the approved Review Workspace seam with a red-green test loop.
