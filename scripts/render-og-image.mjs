import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const svgPath = fileURLToPath(new URL("../web/og-image.svg", import.meta.url));
const pngPath = fileURLToPath(new URL("../web/og-image.png", import.meta.url));

const browser = await chromium.launch({ channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.goto(`file://${svgPath}`);
await page.screenshot({ path: pngPath });
await browser.close();
