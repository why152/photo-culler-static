import assert from "node:assert/strict";
import test from "node:test";

import { BrowserPhotoAnalyzer } from "../modules/photo-analysis.js";

class FakeWorker {
  constructor() {
    this.listeners = new Map();
    this.messages = [];
    this.terminated = false;
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  postMessage(message) {
    this.messages.push(message);
  }

  terminate() {
    this.terminated = true;
  }

  respond(result) {
    const [{ id }] = this.messages;
    for (const listener of this.listeners.get("message") ?? [])
      listener({ data: { id, result } });
  }
}

function photoGroup(id) {
  return {
    id,
    analysisFile: { name: `${id}.JPG`, size: 100, lastModified: 1 },
  };
}

async function nextTask() {
  await Promise.resolve();
  await Promise.resolve();
}

test("BrowserPhotoAnalyzer terminates stale worker work before a new directory analysis", async () => {
  const workers = [];
  const analyzer = new BrowserPhotoAnalyzer({
    workerFactory: () => {
      const worker = new FakeWorker();
      workers.push(worker);
      return worker;
    },
  });
  const first = analyzer.analyze([photoGroup("old")]);
  first.catch(() => {});

  try {
    await nextTask();
    assert.equal(workers[0].messages.length, 1);

    const second = analyzer.analyze([photoGroup("new")]);
    second.catch(() => {});
    await nextTask();

    assert.equal(workers[0].terminated, true);
    assert.equal(workers.length, 2);
    assert.equal(workers[1].messages.length, 1);
    await assert.rejects(first, { name: "AbortError" });

    workers[1].respond({ status: "keep", thumbnail: null });
    const [analyzed] = await second;
    assert.equal(analyzed.id, "new");
  } finally {
    analyzer.close();
    await Promise.allSettled([first]);
  }
});

