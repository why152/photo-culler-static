// A presentation of the existing conservative batches, never a new grouping rule.
export function galleryRows(
  groups,
  batches,
  recommendations,
  decision,
  expanded = new Set(),
) {
  const membership = new Map();
  for (const batch of batches) {
    if (
      batch.length < 2 ||
      !batch.every((g) =>
        ["exact", "burst"].includes(recommendations[g.id]?.similarityKind),
      )
    )
      continue;
    for (const g of batch) membership.set(g.id, batch);
  }
  const available = new Set(groups.map((g) => g.id)),
    seen = new Set(),
    rows = [];
  for (const group of groups) {
    const batch = membership.get(group.id)?.filter((g) => available.has(g.id));
    if (!batch || batch.length < 2) {
      rows.push({ group });
      continue;
    }
    const key = batch[0].id;
    if (seen.has(key)) continue;
    seen.add(key);
    const ordered = [...batch].sort(
      (a, b) =>
        (recommendations[a.id]?.rank ?? 999) -
        (recommendations[b.id]?.rank ?? 999),
    );
    let representatives = ordered.filter((g) => decision(g) === "include");
    if (!representatives.length)
      representatives = [
        ordered.find((g) => decision(g) === "protected") ?? ordered[0],
      ];
    const open = expanded.has(key);
    const shown = open ? batch : representatives;
    shown.forEach((g, i) =>
      rows.push({
        group: g,
        batch,
        key,
        expanded: open,
        toggle: i === 0,
        last: i === shown.length - 1,
        hiddenCount: batch.length - shown.length,
      }),
    );
  }
  return rows;
}
