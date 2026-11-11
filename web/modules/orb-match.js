/*! Photo-Curator 1cb56a07, photo_dedup_batch.py:_orb_similarity;
 * Copyright (c)2026 Paolo Cortez, MIT. Reciprocal matching, Hamming<40,
 * agreement>=.30. Descriptor extraction is jsfeat, not OpenCV pixel parity. */
const popcount = Uint8Array.from(
  { length: 256 },
  (_, i) => i.toString(2).replaceAll("0", "").length,
);
const cache = new WeakMap();
export function orbAgreement(a, b) {
  if (!a || !b || a.count < 16 || b.count < 16) return 0;
  let memo = cache.get(a);
  if (!memo) {
    memo = new WeakMap();
    cache.set(a, memo);
  }
  if (memo.has(b)) return memo.get(b);
  const bestA = new Int16Array(a.count).fill(-1),
    bestB = new Int16Array(b.count).fill(-1);
  const distA = new Uint16Array(a.count).fill(257),
    distB = new Uint16Array(b.count).fill(257);
  for (let i = 0; i < a.count; i++)
    for (let j = 0; j < b.count; j++) {
      let d = 0;
      for (let k = 0; k < 32; k++)
        d += popcount[a.descriptors[i * 32 + k] ^ b.descriptors[j * 32 + k]];
      if (d < distA[i]) {
        distA[i] = d;
        bestA[i] = j;
      }
      if (d < distB[j]) {
        distB[j] = d;
        bestB[j] = i;
      }
    }
  let good = 0;
  for (let i = 0; i < a.count; i++)
    if (distA[i] < 40 && bestB[bestA[i]] === i) good++;
  const score = good / Math.min(a.count, b.count);
  memo.set(b, score);
  return score;
}
