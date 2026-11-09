import { ALGORITHM_VERSION } from "./cull-session.js";
import {
  benchmarkIdentity,
  createBenchmark,
  evaluateBenchmark,
  importProxyLabels,
} from "./cull-benchmark.js";
export function installBenchmark({ getState, save, message, download }) {
  const button = document.createElement("button");
  button.textContent = "本地偏好盲标与评估";
  button.id = "benchmark-open";
  document.querySelector("#global").after(button);
  const dialog = document.createElement("dialog");
  dialog.id = "benchmark";
  dialog.innerHTML = `<form method="dialog"><button>保存进度并关闭</button></form><h2>本地偏好盲标</h2><p>不显示机器推荐。先选调参或独立验收集，再逐组标记；同一重要瞬间可填相同编号。标注不会修改照片、审核决定或导出计划。独立验收需另外一次拍摄的 500–1000 组。</p><label>样本用途 <select id="benchmark-split"><option value="held-out">独立验收集</option><option value="calibration">调参集</option></select></label><label>导入 AI 代理标签 JSON（仅本地）<input id="benchmark-import" type="file" accept="application/json,.json"></label><label>随机样本数<input id="benchmark-size" type="number" min="1" max="1000" value="500"></label><label><input id="benchmark-attest" type="checkbox">独立盲标：这批为未用于调参的拍摄，标注时不参考推荐</label><button id="benchmark-start">开始 / 重置本批盲标</button><p id="benchmark-position" role="status"></p><img id="benchmark-image" alt="当前盲标图片"><p id="benchmark-name"></p><p id="benchmark-reason"></p><label>重要瞬间编号（可选）<input id="benchmark-moment" placeholder="同一瞬间填写相同编号"></label><div><button id="benchmark-yes">必须保留</button><button id="benchmark-no">不必保留</button><button id="benchmark-unsure">暂不确定</button><button id="benchmark-back">上一组</button></div><button id="benchmark-download">下载标注与冻结评估 JSON</button><pre id="benchmark-result"></pre>`;
  document.body.append(dialog);
  const $ = (id) => dialog.querySelector("#" + id);
  let preview = null;
  function study() {
    return getState().session?.benchmark;
  }
  function valid() {
    const { groups } = getState(),
      s = study();
    return (
      s?.version === 1 &&
      s.algorithmVersion === ALGORITHM_VERSION &&
      s.identity === benchmarkIdentity(groups)
    );
  }
  function render() {
    if (preview) {
      URL.revokeObjectURL(preview);
      preview = null;
    }
    $("benchmark-image").removeAttribute("src");
    const s = study(),
      ok = valid();
    for (const id of [
      "benchmark-yes",
      "benchmark-no",
      "benchmark-unsure",
      "benchmark-back",
      "benchmark-download",
    ])
      $(id).disabled = !ok;
    if (!ok) {
      $("benchmark-name").textContent = "";
      $("benchmark-reason").textContent = "";
      $("benchmark-result").textContent = "";
      $("benchmark-position").textContent = s
        ? "来源或算法已变化，旧标注不自动套用。可先下载历史标注，再开始新一批。"
        : "请选择样本用途并开始盲标。";
      $("benchmark-download").disabled = !s;
      return;
    }
    const id = s.deck[Math.min(s.index, s.deck.length - 1)],
      group = getState().groups.find((g) => g.id === id),
      label = s.labels[id];
    $("benchmark-position").textContent =
      (s.index >= s.deck.length
        ? "本轮已标完；未确定项仍需补标。"
        : `${s.index + 1} / ${s.deck.length}`) +
      " · " +
      Object.keys(s.labels).length +
      " 组有记录";
    $("benchmark-name").textContent = group?.path ?? "";
    $("benchmark-moment").value = label?.momentId ?? "";
    if (group?.analysis?.thumbnail) {
      preview = URL.createObjectURL(group.analysis.thumbnail);
      $("benchmark-image").src = preview;
    } else
      $("benchmark-name").textContent +=
        "（无可解码预览，请在本地核对原件后标注，或选暂不确定）";
    $("benchmark-reason").textContent =
      label?.source === "ai-proxy"
        ? "AI 建议：" +
          (label.mustKeep === true
            ? "保留"
            : label.mustKeep === false
              ? "可选"
              : "待确认") +
          " · " +
          (label.reason ?? "")
        : "真人确认后记录于本地。";
    const result = evaluateBenchmark(s);
    $("benchmark-result").textContent =
      s.importedProxy || s.index >= s.deck.length
        ? JSON.stringify(result, null, 2)
        : "完成本轮标注后显示冻结评估，避免推荐结果影响盲标。";
    $("benchmark-back").disabled = s.index === 0;
  }
  button.onclick = () => {
    if (getState().busy || !getState().groups.length)
      return message("请先完成本批分析。");
    render();
    dialog.showModal();
  };
  $("benchmark-start").onclick = async () => {
    if (
      study() &&
      !confirm("重新开始会替换本会话的盲标进度。请先下载需要保留的标注。")
    )
      return;
    const { groups, recommendations, session } = getState();
    session.benchmark = createBenchmark(groups, recommendations, {
      split: $("benchmark-split").value,
      size: Number($("benchmark-size").value) || 500,
    });
    session.benchmark.blindingAttested = $("benchmark-attest").checked;
    await save();
    render();
  };
  for (const [id, value] of [
    ["benchmark-yes", true],
    ["benchmark-no", false],
    ["benchmark-unsure", null],
  ])
    $(id).onclick = async () => {
      if (!valid()) return;
      const s = study(),
        key = s.deck[Math.min(s.index, s.deck.length - 1)];
      s.labels[key] = {
        mustKeep: value,
        momentId: $("benchmark-moment").value.trim(),
        source: "human",
      };
      s.index = Math.min(s.index + 1, s.deck.length);
      await save();
      render();
    };
  $("benchmark-import").onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const draft = JSON.parse(await file.text()),
        state = getState(),
        mapped = importProxyLabels(draft, state.groups);
      if (!Object.keys(mapped.labels).length)
        throw new Error("没有路径及内容 SHA 同时匹配的照片");
      const s = createBenchmark(state.groups, state.recommendations, {
        split: "held-out",
        size: state.groups.length,
      });
      s.labels = mapped.labels;
      s.deck = s.deck.filter((id) => mapped.labels[id]);
      // Review uncertain images first, then suggested keeps, then optional drafts.
      const priority = (id) =>
        mapped.labels[id].mustKeep === null
          ? 0
          : mapped.labels[id].mustKeep === true
            ? 1
            : 2;
      s.deck.sort((a, b) => priority(a) - priority(b));
      s.importedProxy = true;
      state.session.benchmark = s;
      await save();
      render();
      message(
        "已导入 " +
          s.deck.length +
          " 个 AI 代理标签；" +
          mapped.unmatched.length +
          " 个未匹配项未套用。逐张确认后才作为真人标签；AI 草稿辅助确认不计独立盲标验收。",
      );
    } catch (error) {
      message("导入失败：" + error.message);
    } finally {
      event.target.value = "";
    }
  };
  $("benchmark-back").onclick = () => {
    if (valid()) {
      study().index = Math.max(0, study().index - 1);
      render();
    }
  };
  $("benchmark-download").onclick = () => {
    const s = study();
    if (s)
      download(
        JSON.stringify({ study: s, evaluation: evaluateBenchmark(s) }, null, 2),
        "photo-culler-blind-labels.json",
      );
  };
  dialog.addEventListener("close", () => {
    if (preview) URL.revokeObjectURL(preview);
    preview = null;
    $("benchmark-image").removeAttribute("src");
  });
}
