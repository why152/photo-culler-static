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

  emit(messageIndex, data) {
    const { id } = this.messages[messageIndex];
    for (const listener of this.listeners.get("message") ?? []) listener({ data: { id, ...data } });
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

test("dynamic visible priority changes dispatch order while results retain directory order", async () => {
  const worker = new FakeWorker();
  const resultOrder = [];
  let priorities = ["c"];
  const analyzer = new BrowserPhotoAnalyzer({ workerFactory: () => worker });
  try {
    const result = analyzer.analyze(["a","b","c"].map(photoGroup), {
      getPriority: () => priorities, onResult: (group) => resultOrder.push(group.id),
    });
    while (worker.messages.length < 1) await new Promise(setImmediate);
    assert.equal(worker.messages[0].file.name,"c.JPG");
    priorities = ["completed-unknown", "b"];
    worker.emit(0,{result:{status:"keep",thumbnail:null}});
    while (worker.messages.length < 2) await new Promise(setImmediate);
    assert.equal(worker.messages[1].file.name,"b.JPG");
    worker.emit(1,{result:{status:"keep",thumbnail:null}});
    while (worker.messages.length < 3) await new Promise(setImmediate);
    worker.emit(2,{result:{status:"keep",thumbnail:null}});
    assert.deepEqual((await result).map((group) => group.id),["a","b","c"]);
    assert.deepEqual(resultOrder,["c","b","a"]);
  } finally { analyzer.close(); }
});

test("thumbnail preview publishes before score completion and stale worker previews are ignored", async () => {
  const workers = [];
  const previews = [];
  const results = [];
  const analyzer = new BrowserPhotoAnalyzer({ workerFactory: () => { const worker=new FakeWorker(); workers.push(worker); return worker; } });
  try {
    const first = analyzer.analyze([photoGroup("old")], { onPreview:(group)=>previews.push(group), onResult:(group)=>results.push(group) });
    first.catch(()=>{});
    while (!workers[0].messages.length) await new Promise(setImmediate);
    const thumbnail = new Blob(["preview"]);
    workers[0].emit(0,{type:"preview",thumbnail});
    assert.equal(previews.length,1);
    assert.equal(previews[0].analysis.status,"pending");
    assert.equal(results.length,0);
    const second = analyzer.analyze([photoGroup("new")],{onPreview:(group)=>previews.push(group)});
    await assert.rejects(first,{name:"AbortError"});
    workers[0].emit(0,{type:"preview",thumbnail});
    assert.equal(previews.length,1);
    while (!workers[1].messages.length) await new Promise(setImmediate);
    workers[1].emit(0,{type:"preview",thumbnail});
    workers[1].emit(0,{result:{status:"keep",thumbnail:new Blob(["preview"])}});
    const [newGroup] = await second;
    assert.equal(newGroup.id,"new");
    assert.equal(newGroup.analysis.thumbnail,previews[1].analysis.thumbnail);
  } finally { analyzer.close(); }
});

test("cache writes are bounded, results are immediate, and cancellation during drain is prompt", async () => {
  const worker = new FakeWorker();
  const results = [];
  const release = [];
  let active = 0, peak = 0;
  const cache = {loadAnalysis:async()=>null,saveAnalysis:async()=>{
    active++;peak=Math.max(peak,active);
    await new Promise((resolve)=>release.push(resolve));active--;
  }};
  const controller = new AbortController();
  const analyzer = new BrowserPhotoAnalyzer({workerFactory:()=>worker,cache,cacheWriteConcurrency:2});
  try {
    const result = analyzer.analyze(["a","b","c"].map(photoGroup),{signal:controller.signal,onResult:(group)=>results.push(group.id)});
    result.catch(()=>{});
    while (!worker.messages.length) await new Promise(setImmediate);
    worker.emit(0,{result:{status:"keep",thumbnail:null}});
    while (worker.messages.length<2) await new Promise(setImmediate);
    worker.emit(1,{result:{status:"keep",thumbnail:null}});
    await new Promise(setImmediate);
    assert.deepEqual(results,["a","b"]);
    assert.equal(worker.messages.length,2);
    assert.equal(peak,2);
    release.shift()();
    while (worker.messages.length<3) await new Promise(setImmediate);
    worker.emit(2,{result:{status:"keep",thumbnail:null}});
    await new Promise(setImmediate);
    assert.deepEqual(results,["a","b","c"]);
    assert.equal(peak,2);
    controller.abort();
    await assert.rejects(result,{name:"AbortError"});
  } finally {release.forEach((resolve)=>resolve());analyzer.close();}
});

test("superseded cache writes retain their directory scope and share the concurrency bound with the new run", async () => {
  const workers=[],writtenScopes=[],release=[];
  const oldDirectory={},newDirectory={};
  const analyzer = new BrowserPhotoAnalyzer({ cacheWriteConcurrency:1,
    workerFactory:()=>{const worker=new FakeWorker();workers.push(worker);return worker;},
    cache:{analysisScope:async(directory)=>({loadAnalysis:async()=>null,saveAnalysis:async()=>{
      writtenScopes.push(directory);await new Promise((resolve)=>release.push(resolve));
    }})},
  });
  try {
    const first=analyzer.analyze([photoGroup("same")],{directory:oldDirectory});first.catch(()=>{});
    while (!workers[0].messages.length) await new Promise(setImmediate);
    workers[0].emit(0,{result:{status:"keep",thumbnail:null}});
    while (!release.length) await new Promise(setImmediate);
    const second=analyzer.analyze([photoGroup("same")],{directory:newDirectory});
    await assert.rejects(first,{name:"AbortError"});
    await new Promise(setImmediate);
    assert.equal(workers[1].messages.length,0);
    assert.deepEqual(writtenScopes,[oldDirectory]);
    release.shift()();
    while (!workers[1].messages.length) await new Promise(setImmediate);
    workers[1].emit(0,{result:{status:"review",thumbnail:null}});
    while (!release.length) await new Promise(setImmediate);
    assert.deepEqual(writtenScopes,[oldDirectory,newDirectory]);
    release.shift()();
    assert.equal((await second)[0].analysis.status,"review");
  } finally {release.forEach((resolve)=>resolve());analyzer.close();}
});

test("directory analysis binds one cache scope and a failed cache never becomes an unreadable photo", async () => {
  const worker = new FakeWorker();
  const directory = { name: "synthetic" };
  const scopeCalls = [];
  const diagnostics = [];
  const analyzer = new BrowserPhotoAnalyzer({ workerFactory: () => worker,
    onDiagnostics: (record) => diagnostics.push(record),
    cache: { analysisScope: async (handle) => {
      scopeCalls.push(handle);
      return { loadAnalysis: async () => { throw new Error("cache read unavailable"); },
        saveAnalysis: async () => { throw new Error("cache write unavailable"); } };
    } },
  });
  try {
    const result = analyzer.analyze([photoGroup("safe")], { directory });
    while (!worker.messages.length) await new Promise(setImmediate);
    worker.respond({ status: "keep", sharpness: 70, thumbnail: null, reasons: ["ok"] });
    const [group] = await result;
    assert.deepEqual(scopeCalls, [directory]);
    assert.equal(group.analysis.status, "keep");
    assert.deepEqual(diagnostics[0].cacheErrors, ["read", "write"]);
    assert.equal(Object.hasOwn(diagnostics[0], "file"), false);
  } finally { analyzer.close(); }
});

test("namespace failure degrades to fresh analysis and diagnostic observer errors remain isolated", async () => {
  const worker = new FakeWorker();
  const analyzer = new BrowserPhotoAnalyzer({ workerFactory: () => worker,
    cache: { analysisScope: async () => { throw new Error("scope unavailable"); } },
    onDiagnostics: () => { throw new Error("observer failed"); },
  });
  try {
    const result = analyzer.analyze([photoGroup("fresh")], { directory: {} });
    while (!worker.messages.length) await new Promise(setImmediate);
    worker.respond({ status: "keep", thumbnail: null });
    assert.equal((await result)[0].analysis.status, "keep");
  } finally { analyzer.close(); }
});

test("directory cancellation does not wait for a blocked cache namespace or read", async () => {
  for (const stage of ["scope","read"]) {
    let entered;
    const started = new Promise((resolve)=>{entered=resolve;});
    const blocked = async()=>{entered();await new Promise(()=>{});};
    const controller = new AbortController();
    const analyzer = new BrowserPhotoAnalyzer({workerFactory:()=>new FakeWorker(),cache:stage==="scope"
      ? {analysisScope:blocked} : {loadAnalysis:blocked}});
    try {
      const result=analyzer.analyze([photoGroup("blocked")],{directory:{},signal:controller.signal});
      result.catch(()=>{});
      await started;controller.abort();
      await assert.rejects(result,{name:"AbortError"});
    } finally {analyzer.close();}
  }
});

