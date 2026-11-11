import { defineConfig } from "vite";
import { copyFileSync } from "node:fs";
import { resolve } from "node:path";
function portraitPrivacyGate() {
  return {
    name: "portrait-tfjs-only",
    generateBundle(_options, bundle) {
      for (const chunk of Object.values(bundle))
        if (chunk.type === "chunk")
          for (const id of Object.keys(chunk.modules))
            if (/node_modules\/@mediapipe\//.test(id))
              throw Error(
                "MediaPipe SDK is forbidden in the static runtime: " + id,
              );
    },
  };
}
export default defineConfig({
  root: "web",
  resolve: {
    alias: [
      {
        find: /^@tensorflow-models\/face-detection$/,
        replacement: resolve("web/modules/tf-face-detector.js"),
      },
    ],
  },
  plugins: [
    portraitPrivacyGate(),
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
  worker: { format: "es", plugins: () => [portraitPrivacyGate()] },
});
