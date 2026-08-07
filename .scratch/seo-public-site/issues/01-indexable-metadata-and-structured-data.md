# 01 — 可索引元数据与结构化数据

**What to build:** 为公开首页补齐搜索引擎和社交平台需要的基础元数据、结构化数据、抓取入口与分享预览图，不改变任何本地功能。

**Blocked by:** none.

**Status:** completed

## Changes

- [x] `index.html`：`<title>`、`meta description`、canonical、`theme-color`、favicon、Open Graph / Twitter Card、`WebApplication` JSON-LD 与 `noscript` 简介。
- [x] `robots.txt` 与 `sitemap.xml`：允许抓取并声明唯一公开首页。
- [x] `favicon.svg` 与 `og-image.png`：品牌图标和 1200×630 社交预览图。
- [x] `seo-public-site.spec.mjs`：Chrome E2E 覆盖元数据、结构化数据、robots/sitemap 可达性。

## Comments

- 2026-08-08: 站点为纯本地优先应用，SEO 只做公开首页的可索引说明，不引入分析或外部资源。
- 2026-08-08: 实施完成并复核；Node 28/28、Chrome 30/30 通过。既有标题断言已更新为新的 SEO 标题。
