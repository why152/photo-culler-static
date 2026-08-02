function emptyState() {
  return {
    kind: null,
    mode: "idle",
    title: "",
    detail: "",
    completed: null,
    total: null,
    value: null,
    isBusy: false,
  };
}

function measuredProgress(completed, total) {
  if (!Number.isInteger(completed) || !Number.isInteger(total) || total < 1)
    throw new Error("确定性 operation feedback 必须提供有效的完成数量和总数。");
  if (completed < 0 || completed > total)
    throw new Error("完成数量必须在 0 和总数之间。");
  return Math.round((completed / total) * 100);
}

export class OperationFeedback {
  constructor() {
    this.current = emptyState();
  }

  start({ kind, title, detail = "" }) {
    this.current = {
      kind,
      mode: "indeterminate",
      title,
      detail,
      completed: null,
      total: null,
      value: null,
      isBusy: true,
    };
    return this.state();
  }

  progress({ kind, title, detail = "", completed, total }) {
    this.current = {
      kind,
      mode: "determinate",
      title,
      detail,
      completed,
      total,
      value: measuredProgress(completed, total),
      isBusy: true,
    };
    return this.state();
  }

  complete({ kind, title, detail = "" }) {
    const keepsMeasuredProgress =
      this.current.kind === kind && this.current.mode === "determinate";
    this.current = {
      kind,
      mode: "success",
      title,
      detail,
      completed: keepsMeasuredProgress ? this.current.total : null,
      total: keepsMeasuredProgress ? this.current.total : null,
      value: keepsMeasuredProgress ? 100 : null,
      isBusy: false,
    };
    return this.state();
  }

  fail({ kind, title, detail = "" }) {
    this.current = {
      kind,
      mode: "error",
      title,
      detail,
      completed: null,
      total: null,
      value: null,
      isBusy: false,
    };
    return this.state();
  }

  clear() {
    this.current = emptyState();
    return this.state();
  }

  state() {
    return { ...this.current };
  }
}
