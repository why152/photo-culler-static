import { ALGORITHM_VERSION } from "./cull-session.js";
import { benchmarkIdentity } from "./cull-benchmark.js";
import {
  createEffortRun,
  EffortClock,
  comparePersonalEffort,
  restoreEffortBackup,
} from "./review-effort.js";
export function installReviewEffort({
  getState,
  persist,
  message,
  download,
  onStart,
}) {
  const button = document.createElement("button");
  button.className = "advanced-control";
  button.id = "effort-open";
  button.textContent = "记录本次复核（仅本地）";
  const summary = document.createElement("p");
  summary.id = "effort-summary";
  document.querySelector("#global").after(button, summary);
  const dialog = document.createElement("dialog");
  dialog.id = "effort";
  dialog.setAttribute("aria-labelledby", "effort-title");
  dialog.innerHTML = `<form method="dialog"><button>返回复核</button></form><h2 id="effort-title">本次复核记录</h2><p>只在本标签页前台复核时计时。分别记录主动打开大图和缩略图曝光；曝光不等于看过，计时不证明注意力。请在一个标签页中操作，结束后下载记录。</p><label>历史记录<select id="effort-run"></select></label><label>方式<select id="effort-role"><option value="baseline">全量查看对照</option><option value="assisted">使用推荐</option></select></label><label>操作者<select id="effort-operator"><option value="human">我的实际操作</option><option value="ai">AI 代理操作</option><option value="synthetic">自动化测试</option></select></label><label>恢复记录 / 合并另一批对照（仅本地）<input id="effort-import" type="file" accept="application/json,.json"></label><div><button id="effort-start">开始新记录</button><button id="effort-pause">暂停</button><button id="effort-resume">继续</button><button id="effort-finish">结束记录</button><button id="effort-download">下载记录 JSON</button></div><p id="effort-status" role="status"></p><p>全量对照需要逐组打开可预览照片。使用推荐时可先看技术疑难，再自行查看其他候选。两次同批复核会有熟悉效应，不自动签核70%节省。</p><pre id="effort-result"></pre>`;
  document.body.append(dialog);
  const $ = (id) => dialog.querySelector("#" + id);
  let data = { version: 1, runs: [] },
    clock = null,
    loadedSession = null,
    saving = 0,
    lastSave = 0;
  let grid = new Map(),
    observer;
  const inFlight = new Set();
  const memoryDrafts = new Map();
  const now = () => performance.now();
  const available = () => {
    const s = getState();
    return !s.busy && s.groups.length && s.session;
  };
  const eligible = () =>
    !document.hidden &&
    document.hasFocus() &&
    !getState().busy &&
    getState().view === "results" &&
    !dialog.open &&
    ![...document.querySelectorAll("dialog[open]")].some(
      (d) => d.id !== "compare",
    );
  function syncAttention() {
    clock?.attention(eligible(), now());
  }
  function syncRun() {
    if (clock) {
      const i = data.runs.findIndex((r) => r.id === clock.run.id);
      if (i >= 0) data.runs[i] = structuredClone(clock.run);
    }
  }
  function currentValid() {
    const s = getState();
    return (
      clock &&
      clock.run.identity === benchmarkIdentity(s.groups) &&
      clock.run.algorithmVersion === ALGORITHM_VERSION &&
      JSON.stringify(clock.run.preferences) === JSON.stringify(s.preferences)
    );
  }
  async function checkpoint() {
    const owner = getState().session;
    if (!owner) return false;
    syncAttention();
    syncRun();
    const next = structuredClone(data);
    saving++;
    render();
    let task;
    try {
      task = Promise.resolve(persist(next, owner.id));
    } catch (error) {
      task = Promise.reject(error);
    }
    inFlight.add(task);
    try {
      await task;
      owner.effort = next;
      memoryDrafts.delete(owner.id);
      lastSave = now();
      return true;
    } catch (e) {
      if (loadedSession === owner.id && clock) {
        if (clock.run.status === "completed") {
          clock.run.status = "paused";
          clock.run.finishedAt = null;
        }
        clock.pause(now());
        syncRun();
      }
      memoryDrafts.set(owner.id, structuredClone(data));
      message(
        "复核记录保存失败，已暂停；可下载当前内存记录后重试：" + e.message,
      );
      return false;
    } finally {
      inFlight.delete(task);
      saving--;
      render();
    }
  }
  function render() {
    syncRun();
    const r = clock?.run;
    button.hidden = !available();
    summary.hidden = !r;
    summary.textContent = r
      ? `${r.role === "baseline" ? "全量对照" : "使用推荐"} · ${r.status === "running" ? "记录中" : r.status === "paused" ? "已暂停" : "已结束"} · 前台 ${(r.foregroundMs / 1000).toFixed(1)} 秒 · 打开大图 ${r.viewerIds.length}/${r.scopeIds.length}`
      : "复核记录未启用；不自动统计或上传。";
    $("effort-status").textContent = r
      ? (saving ? "正在保存；" : "") +
        summary.textContent +
        " · 缩略图曝光 " +
        r.thumbnailExposureIds.length +
        " · 手动处理 " +
        r.decisionIds.length
      : "选择方式与操作者后开始。";
    $("effort-start").disabled = saving || r?.status === "running";
    $("effort-pause").disabled = !!saving || !r || r.status !== "running";
    $("effort-resume").disabled =
      !!saving || !r || r.status !== "paused" || !currentValid();
    $("effort-finish").disabled = !!saving || !r || r.status === "completed";
    $("effort-download").disabled = !data.runs.length;
    $("effort-import").disabled = !!saving || r?.status === "running";
    $("effort-run").replaceChildren(
      ...data.runs.map((item) => {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent =
          (item.role === "baseline" ? "全量对照" : "使用推荐") +
          " · " +
          new Date(item.startedAt).toLocaleString() +
          " · " +
          item.status;
        return option;
      }),
    );
    if (r) $("effort-run").value = r.id;
    $("effort-run").disabled = !!saving || r?.status === "running";
    const base = [...data.runs]
        .reverse()
        .find((r) => r.role === "baseline" && r.status === "completed"),
      assisted = [...data.runs]
        .reverse()
        .find((r) => r.role === "assisted" && r.status === "completed");
    $("effort-result").textContent = JSON.stringify(
      {
        records: data.runs.map((r) => ({
          id: r.id,
          role: r.role,
          operator: r.operator,
          status: r.status,
          opened: r.viewerIds.length,
          total: r.scopeIds.length,
          foregroundMs: r.foregroundMs,
          clockGaps: r.clockGaps,
        })),
        comparison: comparePersonalEffort(base, assisted),
      },
      null,
      2,
    );
  }
  function refreshGrid() {
    observer?.disconnect();
    observer = new IntersectionObserver(
      (entries) => {
        if (!eligible()) return;
        for (const e of entries)
          if (e.isIntersecting && e.intersectionRatio >= 0.5)
            clock?.observe("thumbnail", grid.get(e.target), now());
      },
      { threshold: 0.5 },
    );
    for (const element of grid.keys()) observer.observe(element);
  }
  button.onclick = () => {
    if (!available()) return message("请先完成本批分析。");
    syncAttention();
    dialog.showModal();
    syncAttention();
    render();
  };
  $("effort-start").onclick = async () => {
    if (!available() || saving || clock?.run.status === "running") return;
    const s = getState();
    const selectedOperator = $("effort-operator").value;
    const operator =
      navigator.webdriver && selectedOperator === "human"
        ? "synthetic"
        : selectedOperator;
    $("effort-operator").value = operator;
    const run = createEffortRun({
      id: crypto.randomUUID(),
      role: $("effort-role").value,
      operator,
      identity: benchmarkIdentity(s.groups),
      algorithmVersion: ALGORITHM_VERSION,
      preferences: s.preferences,
      scopeIds: s.groups.filter((g) => g.analysis?.thumbnail).map((g) => g.id),
      sourceGroups: s.groups.length,
      environment: {
        scope: "personal-mac-chrome",
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        automation: navigator.webdriver === true,
      },
      preexistingDecisions: Object.values(s.human).filter(
        (h) => h.favorite || (h.decision && h.decision !== "unreviewed"),
      ).length,
    });
    if (!run.scopeIds.length) return message("没有可预览照片，未开始计时。");
    data.runs.push(run);
    clock = new EffortClock({ ...run, status: "paused" }, now());
    clock.resume(now());
    if (!(await checkpoint())) return;
    onStart(run.role);
    dialog.close();
    syncAttention();
    refreshGrid();
    render();
  };
  $("effort-run").onchange = () => {
    if (saving || clock?.run.status === "running") return;
    const chosen = data.runs.find((r) => r.id === $("effort-run").value);
    if (chosen) clock = new EffortClock(chosen, now());
    syncAttention();
    render();
  };
  $("effort-pause").onclick = async () => {
    if (saving || !clock) return;
    clock.pause(now());
    await checkpoint();
  };
  $("effort-resume").onclick = async () => {
    if (saving || !currentValid())
      return message("来源或设置已改变，请创建新记录。");
    clock.resume(now());
    await checkpoint();
    dialog.close();
    syncAttention();
    refreshGrid();
  };
  $("effort-finish").onclick = async () => {
    if (saving || !clock) return;
    clock.finish(now());
    await checkpoint();
  };
  $("effort-import").onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (saving || clock?.run.status === "running")
        throw Error("请先暂停当前记录");
      if (file.size > 20 * 1024 * 1024) throw Error("记录文件超过20MiB");
      const restored = restoreEffortBackup(JSON.parse(await file.text()));
      const before = structuredClone(data),
        oldClock = clock;
      const merged = new Map(data.runs.map((r) => [r.id, r]));
      const conflicts = restored.runs.some((r) => merged.has(r.id));
      if (
        conflicts &&
        !confirm("导入含相同记录ID，将替换对应历史记录。请先下载备份。")
      )
        return;
      for (const r of restored.runs) merged.set(r.id, r);
      data = { version: 1, runs: [...merged.values()] };
      const selected = restored.runs.at(-1);
      clock = selected ? new EffortClock(selected, now()) : clock;
      if (!(await checkpoint())) {
        data = before;
        clock = oldClock;
        memoryDrafts.set(getState().session.id, structuredClone(before));
        render();
        return;
      }
      message("复核记录已恢复，来源标记保留；照片决定与采纳计划未改变。");
    } catch (error) {
      message("复核记录导入失败：" + error.message);
    } finally {
      event.target.value = "";
    }
  };
  $("effort-download").onclick = () => {
    syncAttention();
    syncRun();
    download(
      JSON.stringify(
        {
          version: 1,
          type: "local-review-effort",
          scope:
            "UI foreground time and observed opening/exposure only; never independent human acceptance",
          data,
        },
        null,
        2,
      ),
      "photo-culler-review-effort.json",
    );
  };
  dialog.addEventListener("close", () => {
    syncAttention();
    refreshGrid();
    render();
  });
  document.addEventListener("visibilitychange", () => {
    syncAttention();
    if (document.hidden && clock?.run.status === "running") void checkpoint();
    else refreshGrid();
  });
  window.addEventListener("focus", () => {
    syncAttention();
    refreshGrid();
  });
  window.addEventListener("blur", () => {
    syncAttention();
    if (clock?.run.status === "running") void checkpoint();
  });
  new MutationObserver(() => syncAttention()).observe(document.body, {
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
  });
  setInterval(() => {
    syncAttention();
    if (clock?.run.status === "running") {
      render();
      if (!saving && now() - lastSave > 15000) void checkpoint();
    }
  }, 1000);
  window.addEventListener("pagehide", () => {
    if (clock?.run.status === "running") {
      clock.pause(now());
      void checkpoint();
    }
  });
  render();
  return {
    contextReady() {
      const s = getState();
      if (loadedSession === s.session?.id) {
        syncAttention();
        render();
        return;
      }
      loadedSession = s.session?.id;
      const saved = memoryDrafts.get(s.session?.id) ?? s.session?.effort;
      data =
        saved?.version === 1 && Array.isArray(saved.runs)
          ? structuredClone(saved)
          : { version: 1, runs: [] };
      const last = data.runs.at(-1);
      clock = last ? new EffortClock(last, now()) : null;
      syncRun();
      render();
    },
    async pauseForContextChange() {
      if (clock?.run.status === "running") {
        clock.pause(now());
        await checkpoint();
      }
      await Promise.allSettled([...inFlight]);
    },
    surfaceChanged() {
      syncAttention();
    },
    resetGrid() {
      observer?.disconnect();
      grid.clear();
    },
    observeGrid(element, id) {
      grid.set(element, id);
      if (!clock || clock.run.status !== "running") return;
      if (!observer) refreshGrid();
      else observer.observe(element);
    },
    viewerOpened(id) {
      if (currentValid()) {
        syncAttention();
        clock.observe("viewer", id, now());
      }
    },
    decision(id) {
      if (currentValid()) {
        syncAttention();
        clock.observe("decision", id, now());
        void checkpoint();
      }
    },
  };
}
