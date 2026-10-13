// Keep undo independent of later mutations and unrelated review preferences.
export class ReviewDecisionHistory {
  constructor() {
    this.changes = [];
  }

  record(decisions, photoGroupId, decision) {
    const previous = decisions[photoGroupId] ?? null;
    if (previous === decision) return false;
    this.changes.push({ photoGroupId, previous });
    if (decision === null) delete decisions[photoGroupId];
    else decisions[photoGroupId] = decision;
    return true;
  }

  undo(decisions) {
    const change = this.changes.pop();
    if (!change) return false;
    if (change.previous === null) delete decisions[change.photoGroupId];
    else decisions[change.photoGroupId] = change.previous;
    return true;
  }
}

// A queue belongs to one workspace session. Never apply a completed snapshot
// to live state: newer optimistic edits may already be visible there.
export class ReviewSaveQueue {
  constructor({ save, onStatus = () => {} }) {
    this.save = save;
    this.onStatus = onStatus;
    this.tail = Promise.resolve();
    this.revision = 0;
    this.pending = 0;
    this.error = null;
    this.latest = null;
  }

  enqueue(review) {
    const snapshot = structuredClone(review);
    this.latest = snapshot;
    const revision = ++this.revision;
    this.pending += 1;
    this.error = null;
    this.notify();
    this.tail = this.tail.then(async () => {
      try {
        await this.save(snapshot);
        if (revision === this.revision) this.error = null;
      } catch (error) {
        if (revision === this.revision) this.error = error;
      } finally {
        this.pending -= 1;
        this.notify();
      }
    });
    return this.tail;
  }

  notify() {
    this.onStatus({ pending: this.pending, error: this.error });
  }

  retry() {
    return this.latest ? this.enqueue(this.latest) : this.tail;
  }

  async flush() {
    // New decisions can arrive while an earlier write is in flight.
    let tail;
    do {
      tail = this.tail;
      await tail;
    } while (tail !== this.tail);
    return this.error === null;
  }
}
