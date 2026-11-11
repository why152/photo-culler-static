import { orbAgreement } from "./orb-match.js";
import { usablePortrait } from "./portrait-evidence.js";
import { createSHA256 } from "hash-wasm";
import { checkAbort } from "./cull-inventory.js";
export async function digest(file, signal) {
  const hash = await createSHA256();
  hash.init();
  for (let start = 0; start < file.size; start += 1024 * 1024) {
    checkAbort(signal);
    hash.update(
      new Uint8Array(
        await file.slice(start, start + 1024 * 1024).arrayBuffer(),
      ),
    );
  }
  checkAbort(signal);
  return hash.digest("hex");
}
export function distance(a, b) {
  if (!a || !b || a.length !== b.length) return Infinity;
  let n = 0;
  for (let i = 0; i < a.length; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      n++;
      x &= x - 1;
    }
  }
  return n;
}
// A version candidate is deliberately protected, never proof that an edit is disposable.
export function versionCandidate(a, b) {
  if (a.exact && a.exact === b.exact) return false;
  if (distance(a.hash, b.hash) > 3) return false;
  const x = a.analysis?.sourceDimensions,
    y = b.analysis?.sourceDimensions;
  if (!x?.width || !x?.height || !y?.width || !y?.height) return false;
  if (
    Math.abs(x.width / x.height - y.width / y.height) /
      Math.max(x.width / x.height, y.width / y.height) >
    0.2
  )
    return false;
  const differentSize = x.width !== y.width || x.height !== y.height;
  const format = (g) =>
    (g.source?.path ?? g.path)
      .split(".")
      .at(-1)
      .toLowerCase()
      .replace("jpeg", "jpg");
  const differentFormat = format(a) !== format(b);
  const edited = [a, b].some((g) =>
    /photoshop|lightroom|gimp|affinity|snapseed|darktable|capture one|pixelmator/i.test(
      g.metadata?.Software ?? "",
    ),
  );
  return differentSize || differentFormat || edited;
}
export function similarityKind(batch) {
  if (batch.length === 1)
    return batch[0].protected || !batch[0].hash ? "unknown" : "unique";
  if (batch[0].exact && batch.every((g) => g.exact === batch[0].exact))
    return "exact";
  if (
    batch.some((g, i) =>
      batch.slice(i + 1).some((other) => versionCandidate(g, other)),
    )
  )
    return "same-image-version";
  return batch.every((g) => g.metadata?.capturedAt != null)
    ? "burst"
    : "unknown";
}
// Complete-link, bounded time window: no A~B~C transitive chains.
export function portraitPair(a, b) {
  if (!usablePortrait(a) || !usablePortrait(b)) return false;
  const x = a.analysis.portrait.faces,
    y = b.analysis.portrait.faces;
  if (x.length !== y.length || distance(a.hash, b.hash) > 32) return false;
  const ad = a.analysis.sourceDimensions,
    bd = b.analysis.sourceDimensions;
  if (
    !ad ||
    !bd ||
    Math.abs(ad.width / ad.height - bd.width / bd.height) > 0.08
  )
    return false;
  const compatible = x.every((f, i) => {
    const g = y[i],
      p = f.box,
      q = g.box;
    const ratio = f.area / g.area;
    return (
      f.hash &&
      g.hash &&
      distance(f.hash, g.hash) <= 18 &&
      ratio > 0.55 &&
      ratio < 1.8 &&
      Math.hypot(
        p.x + p.width / 2 - q.x - q.width / 2,
        p.y + p.height / 2 - q.y - q.height / 2,
      ) < 0.12
    );
  });
  if (!compatible) return false;
  return (
    (distance(a.hash, b.hash) <= 12 &&
      x.every((f, i) => distance(f.hash, y[i].hash) <= 10)) ||
    orbAgreement(a.analysis.portrait.orb, b.analysis.portrait.orb) >= 0.3
  );
}
export function cluster(groups, { portrait = false } = {}) {
  const result = [];
  const sorted = [...groups].sort(
    (a, b) =>
      (a.metadata?.capturedAt ?? Infinity) -
        (b.metadata?.capturedAt ?? Infinity) || a.path.localeCompare(b.path),
  );
  for (const group of sorted) {
    const time = group.metadata?.capturedAt;
    const match =
      !group.protected &&
      !group.manualSplit &&
      group.hash &&
      result.findLast(
        (batch) =>
          batch.length < 30 &&
          batch.every(
            (other) =>
              !other.protected &&
              !other.manualSplit &&
              ((group.exact && group.exact === other.exact) ||
                versionCandidate(group, other) ||
                (time != null &&
                  other.metadata?.capturedAt != null &&
                  ((Math.abs(time - other.metadata.capturedAt) <= 2500 &&
                    distance(group.hash, other.hash) <= 6) ||
                    (portrait &&
                      Math.abs(time - other.metadata.capturedAt) <= 12000 &&
                      portraitPair(group, other))))),
          ),
      );
    if (match) match.push(group);
    else result.push([group]);
  }
  return result;
}
export async function exactCandidates(groups, { signal } = {}) {
  const sizes = new Map();
  for (const group of groups) {
    if (!group.source) continue;
    const list = sizes.get(group.source.size) ?? [];
    list.push(group);
    sizes.set(group.source.size, list);
  }
  for (const list of sizes.values())
    if (list.length > 1)
      for (const group of list) {
        checkAbort(signal);
        group.exact =
          group.sourceSHA ??
          (await digest(await group.source.handle.getFile(), signal));
      }
}
