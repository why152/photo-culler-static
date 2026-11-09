import exifr from "exifr";
const image = /\.(jpe?g|png|webp|heic|heif)$/i;
const supported =
  /\.(jpe?g|png|webp|heic|heif|rw2|raw|cr2|cr3|nef|arw|dng|orf|raf|xmp|mov|mp4|m4v|avi)$/i;
export const excludedDirectory = (name) =>
  /^(PhotoCull_Output|_PhotoCull_Review_|Recoverable_Review_)/i.test(name);
export function checkAbort(signal) {
  if (signal?.aborted)
    throw signal.reason ?? new DOMException("已取消", "AbortError");
}
export function safeParts(path) {
  const parts = path.split("/");
  if (
    !parts.length ||
    parts.some((p) => !p || p === "." || p === ".." || /[\\\0]/.test(p))
  )
    throw new Error("不安全的相对路径");
  return parts;
}
export async function inventory(root, { signal, onProgress = () => {} } = {}) {
  const groups = [],
    errors = [],
    skipped = [];
  async function walk(directory, prefix = "") {
    const stems = new Map();
    for await (const handle of directory.values()) {
      checkAbort(signal);
      const path = prefix + handle.name;
      if (handle.kind === "directory") {
        if (excludedDirectory(handle.name)) skipped.push(path);
        else {
          try {
            await walk(handle, path + "/");
          } catch (error) {
            if (signal?.aborted) throw error;
            errors.push({ path, error: error.message });
          }
        }
        continue;
      }
      if (!supported.test(handle.name)) continue;
      try {
        safeParts(path);
        const file = await handle.getFile();
        const stem = handle.name.replace(/\.[^.]+$/, "");
        const members = stems.get(stem) ?? [];
        members.push({
          path,
          handle,
          size: file.size,
          lastModified: file.lastModified,
        });
        stems.set(stem, members);
      } catch (error) {
        errors.push({ path, error: error.message });
      }
      onProgress(groups.length, path);
    }
    for (const [stem, members] of stems) {
      members.sort((a, b) => a.path.localeCompare(b.path));
      const source = members.find((m) => image.test(m.path));
      const path = prefix + stem;
      groups.push({
        id: "group:" + path,
        legacyId: prefix ? null : "photo-group:" + stem,
        path,
        stem,
        members,
        source,
        analysisHandle: source?.handle,
        protected:
          !source || members.some((m) => /\.(mov|mp4|m4v|avi)$/i.test(m.path)),
        fingerprint: JSON.stringify(
          members.map((m) => [m.path, m.size, m.lastModified]),
        ),
      });
    }
  }
  await walk(root);
  return {
    groups: groups.sort((a, b) => a.path.localeCompare(b.path)),
    errors,
    skipped,
  };
}
export async function captureMetadata(file) {
  try {
    const data = await exifr.parse(file, {
      pick: [
        "DateTimeOriginal",
        "SubSecTimeOriginal",
        "ExposureTime",
        "ExposureBiasValue",
        "Software",
      ],
    });
    const date = data?.DateTimeOriginal;
    return {
      ...data,
      capturedAt:
        date instanceof Date && Number.isFinite(+date)
          ? +date +
            Number(
              "0." +
                (String(data.SubSecTimeOriginal ?? "0").replace(
                  /[^0-9]/g,
                  "",
                ) || "0"),
            ) *
              1000
          : null,
    };
  } catch {
    return { capturedAt: null };
  }
}
