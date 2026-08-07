# 公开站点 SEO

**Status:** completed

**What to build:** 让 GitHub Pages 公开首页具备搜索引擎与社交平台可正确读取的基础 SEO：唯一且描述准确的 `<title>`/`meta description`、canonical、Open Graph、Twitter Card、`WebApplication` 结构化数据、`robots.txt`、`sitemap.xml` 和可分享的社交预览图；同时保持本地优先应用的安全与功能语义不变。

**Boundaries:**

- 不改变本地扫描、审核、移动/恢复的功能与安全边界。
- 不引入网络跟踪、分析脚本、外部字体或任何会离开本机的资源请求。
- SEO 只覆盖公开首页（单页站点）；本地使用体验保持不变。

**Deliverables:**

1. `<head>` 提供唯一 `<title>`、`meta description`、canonical、`theme-color`、favicon，以及 Open Graph / Twitter Card 标签（含 1200×630 预览图）。
2. `<script type="application/ld+json">` 提供 `WebApplication` 结构化数据（名称、描述、类别、浏览器要求、免费、中文语言）。
3. `robots.txt` 允许抓取并指向 sitemap；`sitemap.xml` 只包含公开首页 canonical URL。
4. 无 JS 场景下页面仍有一段可抓取的简介文本（`noscript`），不依赖脚本也能说明产品。

**Verification:**

- Chrome E2E 断言 title/description/canonical/OG/Twitter/JSON-LD 存在且值正确，`robots.txt` 与 `sitemap.xml` 可访问并引用公开首页。
- `npm run check`、Node 单元测试、Chrome E2E 全部通过。
- 部署后从线上抓取首页、`robots.txt`、`sitemap.xml` 与预览图，确认资源可达且内容与本地一致。
