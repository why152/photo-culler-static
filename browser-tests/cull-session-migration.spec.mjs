import { test, expect } from "@playwright/test";
test("v3 upgrade preserves legacy record and multiple directory sessions independently", async ({
  page,
}) => {
  await page.goto("/legacy.html");
  const result = await page.evaluate(async () => {
    const { BrowserReviewStore } = await import("/modules/browser-store.js");
    const name = "migration-" + crypto.randomUUID();
    const root = await navigator.storage.getDirectory();
    const a = await root.getDirectoryHandle("a", { create: true }),
      b = await root.getDirectoryHandle("b", { create: true });
    const review = { decisions: { "photo-group:A": "pick" }, filter: "all" };
    await new Promise((resolve, reject) => {
      const request = indexedDB.open(name, 3);
      request.onupgradeneeded = () => {
        for (const store of ["workspace", "analysis", "directory-identities"])
          request.result.createObjectStore(store);
      };
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction("workspace", "readwrite");
        tx.objectStore("workspace").put(
          { directory: a, review },
          "last-directory",
        );
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
      };
    });
    const store = new BrowserReviewStore({ databaseName: name });
    const first = await store.session(a);
    await store.saveSession(a, {
      human: { A: { decision: "keep", favorite: true } },
    });
    await store.rememberDirectory(b);
    await store.save(b, { decisions: { B: "reject" } });
    const old = await store.load(a),
      next = await store.load(b),
      sessions = await store.listSessions(),
      human = (await store.session(a)).human;
    await store.close();
    const reopened = new BrowserReviewStore({ databaseName: name });
    const again = await reopened.load(a);
    await reopened.close();
    return {
      first: first.review,
      old,
      next,
      sessions: sessions.length,
      human,
      again,
    };
  });
  expect(result.first.decisions).toEqual({ "photo-group:A": "pick" });
  expect(result.old).toEqual(result.first);
  expect(result.again).toEqual(result.first);
  expect(result.next.decisions).toEqual({ B: "reject" });
  expect(result.sessions).toBe(2);
  expect(result.human.A.favorite).toBe(true);
});
