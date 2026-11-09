import { readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
async function javascriptFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await javascriptFiles(path));
    else if (entry.isFile() && /\.(?:js|mjs|cjs)$/.test(entry.name)) files.push(path);
  }
  return files.sort();
}

const files = [join(root, "web/site.js"), join(root, "web/auto.js"),
  ...await javascriptFiles(join(root, "web/modules")),
  ...await javascriptFiles(join(root, "scripts"))];
let failures = 0;
for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status === 0 && !result.error) continue;
  failures++;
  process.stderr.write(`Syntax check failed: ${relative(root, file)}\n`);
  process.stderr.write(result.error ? `${result.error.message}\n` : result.stderr || result.stdout);
}
if (failures) process.exitCode = 1;
else process.stdout.write(`Checked syntax for ${files.length} JavaScript files.\n`);
