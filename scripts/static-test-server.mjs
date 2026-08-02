import { createReadStream, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";

const webRoot = resolve("web");
const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
};

const server = createServer((request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  const target = pathname === "/" ? "/index.html" : pathname;
  const requestedPath = resolve(webRoot, `.${target}`);
  if (!requestedPath.startsWith(`${webRoot}${sep}`)) {
    response.writeHead(403).end();
    return;
  }
  try {
    if (!statSync(requestedPath).isFile()) throw new Error("not a file");
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type":
        contentTypes[extname(requestedPath)] ?? "application/octet-stream",
    });
    createReadStream(requestedPath).pipe(response);
  } catch {
    response.writeHead(404).end();
  }
});

server.listen(4173, "127.0.0.1");
