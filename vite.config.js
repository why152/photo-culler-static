import { defineConfig } from "vite";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
export default defineConfig({
  root: "web",
  plugins: [
    {
      name: "stable-public-assets",
      closeBundle() {
        for (const name of [
          "robots.txt",
          "sitemap.xml",
          "og-image.png",
          "og-image.svg",
          "favicon.svg",
        ])
          copyFileSync(resolve("web", name), resolve("dist", name));
      },
    },
  ],
  base: "/photo-culler-static/",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve("web/index.html"),
        legacy: resolve("web/legacy.html"),
        auto: resolve("web/auto.html"),
      },
    },
  },
  worker: { format: "es" },
});
