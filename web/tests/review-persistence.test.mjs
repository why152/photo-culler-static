import test from "node:test";
import assert from "node:assert/strict";
import { ReviewDecisionHistory, ReviewSaveQueue } from "../modules/review-persistence.js";

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

test("delta undo restores repeated edits without reverting other decisions or preferences", () => {
  const history = new ReviewDecisionHistory();
  const review = { decisions: { a: "keep", b: "pick" }, filter: "all" };
  history.record(review.decisions, "a", "reject");
  history.record(review.decisions, "a", null);
  assert.equal(history.record(review.decisions, "a", null), false);
  review.filter = "reject";
  assert.equal(history.undo(review.decisions), true);
  assert.deepEqual(review.decisions, { a: "reject", b: "pick" });
  history.undo(review.decisions);
  assert.deepEqual(review.decisions, { a: "keep", b: "pick" });
  assert.equal(review.filter, "reject");
  assert.equal(history.undo(review.decisions), false);
  history.record(review.decisions, "c", "pick");
  history.undo(review.decisions);
  assert.equal(Object.hasOwn(review.decisions, "c"), false);
});

test("save queue captures immutable snapshots and serializes writes", async () => {
  const gate = deferred();
  const calls = [];
  const queue = new ReviewSaveQueue({ save: async (snapshot) => {
    calls.push(snapshot);
    if (calls.length === 1) await gate.promise;
  } });
  const review = { decisions: { a: "pick" }, candidates: ["a"] };
  queue.enqueue(review);
  review.decisions.b = "keep";
  queue.enqueue(review);
  review.decisions.a = "reject";
  review.candidates.push("b");
  await Promise.resolve();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0], { decisions: { a: "pick" }, candidates: ["a"] });
  gate.resolve();
  assert.equal(await queue.flush(), true);
  assert.deepEqual(calls[1], { decisions: { a: "pick", b: "keep" }, candidates: ["a"] });
  assert.equal(queue.pending, 0);
});

test("failed saves can retry the newest snapshot and do not poison later writes", async () => {
  const snapshots = [];
  let shouldFail = true;
  const queue = new ReviewSaveQueue({ save: async (snapshot) => {
    if (shouldFail) throw new Error("storage unavailable");
    snapshots.push(snapshot);
  } });
  queue.enqueue({ decisions: { a: "keep" } });
  assert.equal(await queue.flush(), false);
  shouldFail = false;
  await queue.retry();
  assert.equal(await queue.flush(), true);
  shouldFail = true;
  queue.enqueue({ decisions: { a: "pick" } });
  assert.equal(await queue.flush(), false);
  shouldFail = false;
  queue.enqueue({ decisions: { a: "pick", b: "reject" } });
  assert.equal(await queue.flush(), true);
  assert.deepEqual(snapshots.at(-1).decisions, { a: "pick", b: "reject" });
});

test("flush also waits for edits enqueued while an earlier save is pending", async () => {
  const first = deferred();
  const second = deferred();
  let calls = 0;
  const queue = new ReviewSaveQueue({ save: () => ++calls === 1 ? first.promise : second.promise });
  queue.enqueue({ decisions: { a: "pick" } });
  let flushed = false;
  const flush = queue.flush().then(() => { flushed = true; });
  await Promise.resolve();
  queue.enqueue({ decisions: { a: "keep" } });
  first.resolve();
  await new Promise(setImmediate);
  assert.equal(flushed, false);
  second.resolve();
  await flush;
  assert.equal(flushed, true);
});
