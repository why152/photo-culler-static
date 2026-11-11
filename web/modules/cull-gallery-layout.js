// Row packing adapts the existing1.0 viewport window to expandable review stacks.
export function reviewLayout(
  rows,
  { columns, width, gap, rowGap, advanced = false },
) {
  const cardWidth = (width - gap * (columns - 1)) / columns;
  const cardHeight = advanced ? 600 : Math.ceil(cardWidth + 31);
  const units = [];
  let cards = [];
  const flush = () => {
    if (!cards.length) return;
    units.push({
      kind: "cards",
      key: "cards:" + cards.map((r) => r.group.id).join("|"),
      cards,
      height: cardHeight + rowGap,
    });
    cards = [];
  };
  for (const row of rows) {
    if (row.toggle && row.expanded) {
      flush();
      units.push({ kind: "header", key: "header:" + row.key, row, height: 52 });
    }
    cards.push(row);
    if (cards.length === columns) flush();
    if (row.last && row.expanded) {
      flush();
      units.push({ kind: "end", key: "end:" + row.key, row, height: 16 });
    }
  }
  flush();
  return { units, columns, cardWidth, cardHeight };
}
export function unitForPhoto(units, id) {
  return units.findIndex((unit) =>
    unit.cards?.some((row) => row.group.id === id),
  );
}
