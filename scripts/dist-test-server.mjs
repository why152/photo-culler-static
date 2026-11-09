import { createServer } from "node:http";
import { createReadStream, statSync } from "node:fs";
import { resolve, extname, sep } from "node:path";
const root = resolve("dist"),
  base = "/photo-culler-static/";
createServer((req, res) => {
  const path = new URL(req.url, "http://localhost").pathname;
  if (!path.startsWith(base)) {
    res.writeHead(404).end();
    return;
  }
  const target = resolve(
    root,
    "." + path.slice(base.length - 1) + (path === base ? "index.html" : ""),
  );
  if (!target.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    if (!statSync(target).isFile()) throw new Error();
    res.writeHead(200, {
      "content-type":
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".css": "text/css",
          ".svg": "image/svg+xml",
          ".wasm": "application/wasm",
        }[extname(target)] ?? "application/octet-stream",
    });
    createReadStream(target).pipe(res);
  } catch {
    res.writeHead(404).end();
  }
}).listen(Number(process.env.PORT ?? 4175), "127.0.0.1");
